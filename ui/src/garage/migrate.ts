// One-time migration of the pre-garage localStorage data into per-ordinal
// workspaces. Sessions carry their car in data.car.ordinal, so they sort
// themselves into the right cars. The single global tune attaches to the
// newest migrated session's car; with no sessions it is parked under
// fta.pendingTune and adopted by the first detected car.

import type { CurrentTune } from "../tune";
import { tuneIsEmpty, emptyWorkspace, type RecordedSession, type Workspace } from "./model";

const LEGACY_SESSIONS = "fta.sessions";
const LEGACY_TUNE = "fta.currentTune";
const LEGACY_BACKUP = "fta.legacyBackup";
export const PENDING_TUNE = "fta.pendingTune";

export interface MigrationResult {
  /** Workspaces created/updated by the migration (to be persisted). */
  touched: Workspace[];
}

export function runLegacyMigration(workspaces: Map<number, Workspace>): MigrationResult {
  const rawSessions = localStorage.getItem(LEGACY_SESSIONS);
  const rawTune = localStorage.getItem(LEGACY_TUNE);
  if (rawSessions == null && rawTune == null) return { touched: [] };

  // Cheap insurance before removing the originals.
  try {
    localStorage.setItem(LEGACY_BACKUP, JSON.stringify({ sessions: rawSessions, tune: rawTune }));
  } catch {
    /* backup is best-effort */
  }

  const touched = new Map<number, Workspace>();
  const get = (ordinal: number): Workspace => {
    let w = workspaces.get(ordinal);
    if (!w) {
      w = emptyWorkspace(ordinal);
      workspaces.set(ordinal, w);
    }
    touched.set(ordinal, w);
    return w;
  };

  let sessions: RecordedSession[] = [];
  try {
    const v = JSON.parse(rawSessions ?? "[]") as RecordedSession[];
    if (Array.isArray(v)) sessions = v;
  } catch {
    /* corrupt -> nothing to migrate */
  }

  let newestOrdinal: number | null = null;
  let newestT = -1;
  for (const s of sessions) {
    const ordinal = s.data?.car?.ordinal;
    if (ordinal == null) continue;
    // id-dedupe: if a previous run persisted some workspaces but the legacy
    // keys survived (write failure), a retry must not double the sessions
    const w = get(ordinal);
    if (!w.sessions.some((x) => x.id === s.id)) w.sessions.push(s);
    if (s.startedAt > newestT) {
      newestT = s.startedAt;
      newestOrdinal = ordinal;
    }
  }
  // keep newest-first within each car
  for (const w of touched.values()) w.sessions.sort((a, b) => b.startedAt - a.startedAt);

  let tune: CurrentTune = {};
  try {
    tune = JSON.parse(rawTune ?? "{}") as CurrentTune;
  } catch {
    /* ignore */
  }
  if (!tuneIsEmpty(tune)) {
    if (newestOrdinal != null) {
      get(newestOrdinal).tune = tune;
    } else {
      // No sessions to tell us the car — first detected car adopts it.
      localStorage.setItem(PENDING_TUNE, JSON.stringify(tune));
    }
  }

  // NOTE: the legacy keys are NOT removed here. The caller deletes them via
  // clearLegacyKeys() only after the migrated workspaces were durably written,
  // so a failed write never loses the only copy of the user's history.
  return { touched: [...touched.values()] };
}

/** Remove the legacy keys — call only after the migrated data is persisted. */
export function clearLegacyKeys() {
  localStorage.removeItem(LEGACY_SESSIONS);
  localStorage.removeItem(LEGACY_TUNE);
}

/** Pop the parked legacy tune (if any) — called when the first car is detected. */
export function takePendingTune(): CurrentTune | null {
  const raw = localStorage.getItem(PENDING_TUNE);
  if (raw == null) return null;
  localStorage.removeItem(PENDING_TUNE);
  try {
    const t = JSON.parse(raw) as CurrentTune;
    return tuneIsEmpty(t) ? null : t;
  } catch {
    return null;
  }
}
