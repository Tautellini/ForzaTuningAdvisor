// GarageStore — per-car recording, workspaces and archived setups.
//
// Recording is keyed by the FRAME's ordinal: telemetry always lands in the
// detected car's workspace, immediately. The "viewed" ordinal only controls
// what the UI displays; switching cars in game raises a prompt instead of
// yanking the view (see Docs/plans/car-garage-and-setups.md).

import type { Telemetry } from "../types";
import { normalizeDisciplineId, type DisciplineId } from "../discipline";
import type { CurrentTune } from "../tune";
import { addFrame, emptyData, mergeData, summarize, type SessionData, type SessionSummary } from "../session";
import { metricsFrom } from "../tuninglog";
import { openBackend, type GarageBackend } from "./idb";
import { clearLegacyKeys, runLegacyMigration, takePendingTune } from "./migrate";
import {
  emptyWorkspace,
  tuneIsEmpty,
  workspaceIsEmpty,
  type RecordedSession,
  type SavedSetup,
  type Workspace,
} from "./model";

const MIN_SAVE_FRAMES = 240; // ~4s of driving before a session is worth saving
const ZERO_GRACE_FRAMES = 90; // ~1.5s of menu/idle ends a session (auto mode only)
const SESSION_CAP = 24; // per active pool
const VIEWED_KEY = "fta.viewedCar";
const AUTO_KEY = "fta.autoSession";

interface Current {
  ordinal: number;
  startedAt: number;
  data: SessionData;
  discipline: DisciplineId;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** When a recorded session ended, in epoch ms (shared by store and App). */
export function sessionEndMs(s: RecordedSession): number {
  return s.startedAt + s.durationS * 1000;
}

/** Tune fields whose value differs between two sheets (set/clear counts). */
function changedTuneFields(a: CurrentTune, b: CurrentTune): (keyof CurrentTune)[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof CurrentTune>;
  const out: (keyof CurrentTune)[] = [];
  for (const k of keys) {
    if (k === "gearRatios") {
      // NaN slots mean "unset" — compare per index, treating NaN like undefined
      const ra = a.gearRatios ?? [];
      const rb = b.gearRatios ?? [];
      const len = Math.max(ra.length, rb.length);
      for (let i = 0; i < len; i++) {
        const xSet = Number.isFinite(ra[i]);
        const ySet = Number.isFinite(rb[i]);
        if (xSet !== ySet || (xSet && ra[i] !== rb[i])) {
          out.push(k);
          break;
        }
      }
    } else if (a[k] !== b[k]) {
      out.push(k);
    }
  }
  return out;
}

export class GarageStore {
  ready = false;
  backendKind: "idb" | "local" = "idb";
  workspaces = new Map<number, Workspace>();
  setups: SavedSetup[] = []; // all cars, newest first
  /** The car whose workspace the UI shows. */
  viewedOrdinal: number | null = null;
  /** Last ordinal seen while actually driving. */
  detectedOrdinal: number | null = null;

  /** Auto mode: sessions start when driving and end after a short idle. */
  autoSession = true;

  /** A durable write failed — recent changes may not survive a reload. */
  storageError = false;

  private backend: GarageBackend | null = null;
  private cur: Current | null = null;
  private zeroStreak = 0;
  private armed = false; // manual mode: user pressed Start, waiting for driving
  private switchDismissedFor: number | null = null;
  private tuneTimers = new Map<number, number>();
  private pendingTuneChecked = false; // legacy pending tune is consumed at most once
  private onChange: () => void;

  constructor(onChange: () => void = () => {}) {
    this.onChange = onChange;
    const v = Number(localStorage.getItem(VIEWED_KEY));
    if (Number.isFinite(v) && v > 0) this.viewedOrdinal = v;
    this.autoSession = localStorage.getItem(AUTO_KEY) !== "0";
  }

  /** Open storage, load everything, run the one-time legacy migration. */
  async init(): Promise<void> {
    const backend = await openBackend();
    this.backend = backend;
    this.backendKind = backend.kind;
    const { workspaces, setups } = await backend.loadAll();
    for (const w of workspaces) this.workspaces.set(w.ordinal, w);
    this.setups = setups.sort((a, b) => b.savedAt - a.savedAt);

    const migrated = runLegacyMigration(this.workspaces);
    if (migrated.touched.length === 0) {
      clearLegacyKeys(); // nothing to persist (or already migrated)
    } else {
      // The legacy keys are the only copy until these writes land — delete
      // them ONLY on success; on failure they stay for a retry next load
      // (the migration dedupes by session id, so a retry is safe).
      try {
        await Promise.all(
          migrated.touched.map((w) => {
            w.updatedAt = Date.now();
            return backend.putWorkspace(w);
          }),
        );
        clearLegacyKeys();
      } catch {
        this.storageError = true;
      }
    }
    this.normalizeDisciplines(backend);
    this.ready = true;
    this.onChange();
  }

  /** Stored data may predate the rally→dirt merge — map it forward once. */
  private normalizeDisciplines(backend: GarageBackend) {
    for (const w of this.workspaces.values()) {
      let touched = false;
      for (const s of w.sessions) {
        const norm = normalizeDisciplineId(s.discipline);
        if (norm !== s.discipline) {
          s.discipline = norm;
          touched = true;
        }
      }
      if (touched) this.guard(backend.putWorkspace(w));
    }
    for (const s of this.setups) {
      let touched = false;
      const norm = normalizeDisciplineId(s.discipline);
      if (norm !== s.discipline) {
        s.discipline = norm;
        touched = true;
      }
      for (const sess of s.sessions) {
        const n = normalizeDisciplineId(sess.discipline);
        if (n !== sess.discipline) {
          sess.discipline = n;
          touched = true;
        }
      }
      if (touched) this.guard(backend.putSetup(s));
    }
  }

  // ---- workspaces -------------------------------------------------------

  workspace(ordinal: number): Workspace {
    let w = this.workspaces.get(ordinal);
    if (!w) {
      w = emptyWorkspace(ordinal);
      this.workspaces.set(ordinal, w);
    }
    return w;
  }

  viewedWorkspace(): Workspace | null {
    return this.viewedOrdinal != null ? this.workspace(this.viewedOrdinal) : null;
  }

  setViewed(ordinal: number) {
    this.viewedOrdinal = ordinal;
    localStorage.setItem(VIEWED_KEY, String(ordinal));
    this.onChange();
  }

  /** Cars that have any saved data (workspace content or archived setups). */
  ordinalsWithData(): Set<number> {
    const out = new Set<number>();
    for (const w of this.workspaces.values()) if (!workspaceIsEmpty(w)) out.add(w.ordinal);
    for (const s of this.setups) out.add(s.ordinal);
    return out;
  }

  setupsOf(ordinal: number): SavedSetup[] {
    return this.setups.filter((s) => s.ordinal === ordinal);
  }

  // ---- switch prompt ----------------------------------------------------

  /** Non-null when driving a different car than the one being viewed. */
  pendingSwitch(): number | null {
    if (!this.ready || this.detectedOrdinal == null) return null;
    if (this.detectedOrdinal === this.viewedOrdinal) return null;
    if (this.switchDismissedFor === this.detectedOrdinal) return null;
    return this.detectedOrdinal;
  }

  confirmSwitch() {
    if (this.detectedOrdinal != null) this.setViewed(this.detectedOrdinal);
  }

  dismissSwitch() {
    this.switchDismissedFor = this.detectedOrdinal;
    this.onChange();
  }

  // ---- recording --------------------------------------------------------

  get recordingOrdinal(): number | null {
    return this.cur?.ordinal ?? null;
  }
  recordingFor(ordinal: number | null): boolean {
    return ordinal != null && this.cur?.ordinal === ordinal;
  }
  get currentSamples(): number {
    return this.cur?.data.frames ?? 0;
  }
  /** Manual mode: Start was pressed, recording begins with the next driving frame. */
  get isArmed(): boolean {
    return this.armed;
  }

  setAutoSession(v: boolean) {
    this.autoSession = v;
    localStorage.setItem(AUTO_KEY, v ? "1" : "0");
    if (v) this.armed = false; // auto mode arms itself
    this.onChange();
  }

  /** Manual mode: start (or arm) a recording. */
  startManual() {
    this.armed = true;
    this.onChange();
  }

  /** Feed one frame; routes by the frame's own ordinal. True if a session was banked. */
  feed(f: Telemetry, discipline: DisciplineId): boolean {
    if (!this.ready) return false; // don't record before load+migration
    if (f.raceOn === 1) {
      const ord = f.car.ordinal;
      this.zeroStreak = 0;
      let saved = false;
      // a session never spans cars or modes (even when stopped manually)
      if (this.cur && (this.cur.ordinal !== ord || this.cur.discipline !== discipline))
        saved = this.finalize();
      // auto mode records whenever driving; manual mode waits for Start
      if (!this.cur && (this.autoSession || this.armed)) {
        // a fresh drive after a sheet edit measures the NEW setup: drop the
        // pre-edit sessions (they describe a car that no longer exists) and
        // clear the per-lever stale markers
        this.freshenPool(ord);
        // wall clock, NOT f.t: the packet timestamp is game uptime, which
        // must never be compared against tuneEditedAt (Date.now()).
        this.cur = { ordinal: ord, startedAt: Date.now(), data: emptyData(), discipline };
      }
      if (this.cur) addFrame(this.cur.data, f);

      if (this.detectedOrdinal !== ord) {
        this.detectedOrdinal = ord;
        this.switchDismissedFor = null;
        this.onChange();
      }
      const w = this.workspace(ord);
      const b = w.build;
      if (!b || b.pi !== f.car.pi || b.class !== f.car.class || b.drivetrain !== f.car.drivetrain) {
        w.build = { pi: f.car.pi, class: f.car.class, drivetrain: f.car.drivetrain };
        this.persistWorkspace(ord);
      }
      // first car ever seen -> adopt as viewed without a prompt
      if (this.viewedOrdinal == null) this.setViewed(ord);
      // legacy global tune parked with no sessions -> first detected car adopts
      // it (checked once, not on every frame)
      if (!this.pendingTuneChecked) {
        this.pendingTuneChecked = true;
        const pending = takePendingTune();
        if (pending && tuneIsEmpty(w.tune)) {
          w.tune = pending;
          this.persistWorkspace(ord);
          this.onChange();
        }
      }
      return saved;
    }
    if (this.cur && this.autoSession) {
      // raceOn 0 can also just mean "paused" — manual mode keeps the session
      // open across menus; auto mode banks it after a short grace.
      this.zeroStreak++;
      if (this.zeroStreak >= ZERO_GRACE_FRAMES) return this.finalize();
    }
    return false;
  }

  endCurrent(): boolean {
    return this.finalize();
  }

  /** Drop sessions that predate the last sheet edit; clear the stale markers. */
  private freshenPool(ordinal: number) {
    const w = this.workspaces.get(ordinal);
    if (!w) return;
    const editedAt = w.tuneEditedAt ?? 0;
    const hadStale = (w.staleFields?.length ?? 0) > 0;
    if (!editedAt && !hadStale) return;
    // Both sides are epoch ms. Sessions recorded before this fix carried the
    // game-uptime packet timestamp instead; those compare as ancient and get
    // dropped on the first post-edit drive — consistent with the rule that
    // any edit invalidates what was driven before it.
    const kept = w.sessions.filter((x) => sessionEndMs(x) >= editedAt);
    if (kept.length === w.sessions.length && !hadStale) return;
    w.sessions = kept;
    w.staleFields = [];
    this.persistWorkspace(ordinal);
    this.onChange();
  }

  /**
   * A session never spans modes: switching the discipline selector banks any
   * live recording made in another mode (feed() would do it on the next
   * driving frame anyway; doing it now keeps the strip and the advice pool
   * in agreement while paused in menus).
   */
  noteDiscipline(d: DisciplineId) {
    if (this.cur && this.cur.discipline !== d) this.finalize();
  }
  discardCurrent() {
    this.cur = null;
    this.zeroStreak = 0;
    this.armed = false;
    this.onChange();
  }

  private finalize(): boolean {
    const c = this.cur;
    this.cur = null;
    this.zeroStreak = 0;
    this.armed = false; // manual mode: each session is started explicitly
    if (!c || c.data.frames < MIN_SAVE_FRAMES) return false;
    const sum = summarize(c.data);
    if (!sum) return false;
    const w = this.workspace(c.ordinal);
    const rec: RecordedSession = {
      id: newId(),
      startedAt: c.startedAt,
      durationS: sum.durationS,
      samples: c.data.frames,
      discipline: c.discipline,
      carPi: sum.car.pi,
      drivetrain: sum.car.drivetrain,
      data: c.data,
      m: metricsFrom(sum),
      included: true, // sessions in the pool belong to the current tune
      label: `Run ${w.sessions.length + 1}`,
    };
    w.sessions.unshift(rec);
    if (w.sessions.length > SESSION_CAP) w.sessions.pop();
    this.persistWorkspace(c.ordinal);
    this.onChange();
    return true;
  }

  // ---- session pool actions (per car) ------------------------------------

  toggleInclude(ordinal: number, id: string) {
    const s = this.workspace(ordinal).sessions.find((x) => x.id === id);
    if (!s) return;
    s.included = !s.included;
    this.persistWorkspace(ordinal);
    this.onChange();
  }
  removeSession(ordinal: number, id: string) {
    const w = this.workspace(ordinal);
    w.sessions = w.sessions.filter((x) => x.id !== id);
    this.persistWorkspace(ordinal);
    this.onChange();
  }
  clearSessions(ordinal: number) {
    const w = this.workspace(ordinal);
    w.sessions = [];
    w.tuneEditPrompted = false;
    w.staleFields = []; // nothing measured remains to be stale against
    this.persistWorkspace(ordinal);
    this.onChange();
  }

  /**
   * Pool + live data for a car. Each session carries the mode it was driven
   * in; only sessions of the given mode feed the calculation (dirt data
   * would poison road advice and vice versa).
   */
  private pooledData(ordinal: number, discipline?: DisciplineId): SessionData {
    const datas: SessionData[] = [];
    if (
      this.cur &&
      this.cur.ordinal === ordinal &&
      this.cur.data.frames > 0 &&
      (discipline == null || this.cur.discipline === discipline)
    )
      datas.push(this.cur.data);
    const w = this.workspaces.get(ordinal);
    if (w)
      for (const s of w.sessions)
        if (s.included && (discipline == null || s.discipline === discipline)) datas.push(s.data);
    return mergeData(datas);
  }

  computedSummary(
    ordinal: number | null = this.viewedOrdinal,
    discipline?: DisciplineId,
  ): SessionSummary | null {
    if (ordinal == null) return null;
    return summarize(this.pooledData(ordinal, discipline));
  }

  includedCount(ordinal: number, discipline?: DisciplineId): number {
    return this.workspace(ordinal).sessions.filter(
      (s) => s.included && (discipline == null || s.discipline === discipline),
    ).length;
  }
  /** Sessions feeding the calculation for a car (live counts as one). */
  effectiveCount(ordinal: number, discipline?: DisciplineId): number {
    const liveCounts =
      this.recordingFor(ordinal) &&
      this.currentSamples > 0 &&
      (discipline == null || this.cur?.discipline === discipline);
    return this.includedCount(ordinal, discipline) + (liveCounts ? 1 : 0);
  }

  // ---- tune -------------------------------------------------------------

  setTune(ordinal: number, t: CurrentTune) {
    const w = this.workspace(ordinal);
    const changed = changedTuneFields(w.tune, t);
    w.tune = t;
    // Mark changed levers stale only when measured data exists to invalidate;
    // the next session start drops the pre-edit sessions and clears this.
    if (changed.length > 0 && (w.sessions.length > 0 || this.recordingFor(ordinal))) {
      w.tuneEditedAt = Date.now(); // sessions older than this are now stale
      w.staleFields = [...new Set([...(w.staleFields ?? []), ...changed])];
    }
    this.persistWorkspaceDebounced(ordinal);
    this.onChange();
  }

  // ---- setups -----------------------------------------------------------

  /**
   * Archive the car's current tune + session pool as a setup, then start a
   * fresh pool. Banks the live session first so nothing is lost.
   */
  saveSetup(ordinal: number, name: string, discipline: DisciplineId): SavedSetup | null {
    if (this.recordingFor(ordinal)) this.finalize();
    const w = this.workspace(ordinal);
    if (workspaceIsEmpty(w)) return null;
    // headline metrics from the archived mode's sessions (fall back to all included)
    const included = w.sessions.filter((s) => s.included);
    const ofMode = included.filter((s) => s.discipline === discipline);
    const sum = summarize(mergeData((ofMode.length > 0 ? ofMode : included).map((s) => s.data)));
    const setup: SavedSetup = {
      id: newId(),
      ordinal,
      name: name.trim() || `Setup ${this.setupsOf(ordinal).length + 1}`,
      savedAt: Date.now(),
      discipline,
      build: w.build ? { ...w.build } : null,
      tune: structuredClone(w.tune),
      sessions: w.sessions,
      m: sum ? metricsFrom(sum) : null,
    };
    this.setups.unshift(setup);
    this.guard(this.backend?.putSetup(setup));
    w.sessions = [];
    w.tuneEditPrompted = false;
    w.staleFields = []; // fresh pool — nothing measured remains
    this.persistWorkspace(ordinal);
    this.onChange();
    return setup;
  }

  /**
   * Copy a setup's sheet (and optionally its sessions) into the car's
   * workspace. The caller has already dealt with a non-empty pool.
   */
  applySetup(id: string, withSessions: boolean) {
    const s = this.setups.find((x) => x.id === id);
    if (!s) return;
    const w = this.workspace(s.ordinal);
    if (this.recordingFor(s.ordinal)) this.discardCurrent(); // was driven on the old tune
    w.tune = structuredClone(s.tune);
    w.sessions = withSessions
      ? structuredClone(s.sessions).map((x) => ({ ...x, included: true }))
      : [];
    w.tuneEditPrompted = false;
    w.tuneEditedAt = 0; // the restored sessions were driven on this very sheet
    w.staleFields = [];
    this.persistWorkspace(s.ordinal);
    this.onChange();
  }

  /** Copy any sheet (e.g. a curated setup) into the car's current tune. */
  applyTune(ordinal: number, tune: CurrentTune) {
    const w = this.workspace(ordinal);
    if (this.recordingFor(ordinal)) this.discardCurrent(); // was driven on the old tune
    w.tune = structuredClone(tune);
    w.sessions = [];
    w.tuneEditPrompted = false;
    w.tuneEditedAt = 0; // fresh pool — nothing predates this sheet
    w.staleFields = [];
    this.persistWorkspace(ordinal);
    this.onChange();
  }

  deleteSetup(id: string) {
    this.setups = this.setups.filter((x) => x.id !== id);
    this.guard(this.backend?.deleteSetup(id));
    this.onChange();
  }

  renameSetup(id: string, name: string) {
    const s = this.setups.find((x) => x.id === id);
    if (!s || !name.trim()) return;
    s.name = name.trim();
    this.guard(this.backend?.putSetup(s));
    this.onChange();
  }

  /** Add an imported setup (already de-conflicted by the importer). */
  addSetup(setup: SavedSetup) {
    this.setups.unshift(setup);
    this.setups.sort((a, b) => b.savedAt - a.savedAt);
    this.guard(this.backend?.putSetup(setup));
    this.onChange();
  }

  /** Adopt an imported workspace wholesale (only used when local one is empty). */
  adoptWorkspace(w: Workspace) {
    this.workspaces.set(w.ordinal, w);
    this.guard(this.backend?.putWorkspace(w));
    this.onChange();
  }

  // ---- persistence ------------------------------------------------------

  /** Durable writes are fire-and-forget, but a failure must not be silent. */
  private guard(p: Promise<void> | undefined) {
    p?.catch(() => {
      if (!this.storageError) {
        this.storageError = true;
        this.onChange();
      }
    });
  }

  private persistWorkspace(ordinal: number) {
    const w = this.workspaces.get(ordinal);
    if (!w) return;
    w.updatedAt = Date.now();
    this.guard(this.backend?.putWorkspace(w));
  }

  /** Coalesce rapid tune-sheet keystrokes into one write. */
  private persistWorkspaceDebounced(ordinal: number) {
    const prev = this.tuneTimers.get(ordinal);
    if (prev != null) clearTimeout(prev);
    this.tuneTimers.set(
      ordinal,
      window.setTimeout(() => {
        this.tuneTimers.delete(ordinal);
        this.persistWorkspace(ordinal);
      }, 500),
    );
  }
}
