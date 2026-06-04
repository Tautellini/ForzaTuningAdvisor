import type { Telemetry } from "./types";
import { addFrame, emptyData, mergeData, summarize, type SessionData, type SessionSummary } from "./session";
import type { DisciplineId } from "./discipline";
import { metricsFrom, type SnapshotMetrics } from "./tuninglog";

export interface RecordedSession {
  id: string;
  startedAt: number;
  durationS: number;
  samples: number;
  discipline: DisciplineId;
  carPi: number;
  drivetrain: number;
  data: SessionData;
  m: SnapshotMetrics;
  included: boolean;
  label: string;
}

const MIN_SAVE_FRAMES = 240; // ~4s of driving before a session is worth saving
const ZERO_GRACE_FRAMES = 90; // ~1.5s of menu/idle ends a session
const STORE_KEY = "fta.sessions";
const CAP = 24;

interface Current {
  startedAt: number;
  data: SessionData;
  discipline: DisciplineId;
}

/** Records discrete driving sessions and merges a selected subset for analysis. */
export class SessionStore {
  sessions: RecordedSession[] = []; // newest first
  private cur: Current | null = null;
  private zeroStreak = 0;
  private seq = 0;

  constructor() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as RecordedSession[];
      if (Array.isArray(v)) this.sessions = v;
    } catch {
      /* ignore */
    }
  }

  private persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.sessions.slice(0, CAP)));
  }

  get recording(): boolean {
    return this.cur != null;
  }
  get currentSamples(): number {
    return this.cur?.data.frames ?? 0;
  }
  get currentStartedAt(): number {
    return this.cur?.startedAt ?? 0;
  }

  /** Feed one frame; handles auto start/stop. Returns true if a session was just saved. */
  feed(f: Telemetry, discipline: DisciplineId): boolean {
    if (f.raceOn === 1) {
      this.zeroStreak = 0;
      if (!this.cur) this.cur = { startedAt: f.t, data: emptyData(), discipline };
      addFrame(this.cur.data, f);
      return false;
    }
    if (this.cur) {
      this.zeroStreak++;
      if (this.zeroStreak >= ZERO_GRACE_FRAMES) return this.finalize();
    }
    return false;
  }

  endCurrent(): boolean {
    return this.finalize();
  }
  discardCurrent() {
    this.cur = null;
    this.zeroStreak = 0;
  }

  private finalize(): boolean {
    const c = this.cur;
    this.cur = null;
    this.zeroStreak = 0;
    if (!c || c.data.frames < MIN_SAVE_FRAMES) return false;
    const sum = summarize(c.data);
    if (!sum) return false;
    const rec: RecordedSession = {
      id: `${c.startedAt}-${this.seq++}`,
      startedAt: c.startedAt,
      durationS: sum.durationS,
      samples: c.data.frames,
      discipline: c.discipline,
      carPi: sum.car.pi,
      drivetrain: sum.car.drivetrain,
      data: c.data,
      m: metricsFrom(sum),
      included: true, // all sessions for the current tune are used by default
      label: `Run ${this.sessions.length + 1}`,
    };
    this.sessions.unshift(rec);
    if (this.sessions.length > CAP) this.sessions.pop();
    this.persist();
    return true;
  }

  includedCount(): number {
    return this.sessions.filter((s) => s.included).length;
  }

  /** Total sessions feeding the calculation (live counts as one). */
  effectiveCount(): number {
    return this.includedCount() + (this.cur && this.cur.data.frames > 0 ? 1 : 0);
  }

  toggleInclude(id: string) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s) return;
    s.included = !s.included;
    this.persist();
  }
  remove(id: string) {
    this.sessions = this.sessions.filter((x) => x.id !== id);
    this.persist();
  }
  clearAll() {
    this.sessions = [];
    this.persist();
  }

  /** Merge the live session + ALL included saved sessions (same tune set). */
  private computedData(): SessionData {
    const datas: SessionData[] = [];
    if (this.cur && this.cur.data.frames > 0) datas.push(this.cur.data);
    for (const s of this.sessions) if (s.included) datas.push(s.data);
    return mergeData(datas);
  }

  computedSummary(): SessionSummary | null {
    return summarize(this.computedData());
  }
  currentSummary(): SessionSummary | null {
    return this.cur && this.cur.data.frames > 0 ? summarize(this.cur.data) : null;
  }
}
