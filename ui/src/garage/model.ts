// Garage data model: per-ordinal workspaces (current tune + active session
// pool) and archived setups (tune sheet + raw session evidence).
// See Docs/plans/car-garage-and-setups.md.

import type { CurrentTune } from "../tune";
import type { DisciplineId } from "../discipline";
import type { SessionData } from "../session";
import type { SnapshotMetrics } from "../tuninglog";

/** A discrete recorded driving session (stats bag + headline metrics). */
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

/** The build a tune was made for — same ordinal can be built very differently. */
export interface BuildIdentity {
  pi: number;
  class: number;
  drivetrain: number;
}

/** Live working state of one car: current tune + the session pool driven on it. */
export interface Workspace {
  ordinal: number;
  tune: CurrentTune;
  sessions: RecordedSession[]; // active pool, newest first
  build: BuildIdentity | null; // last seen while driving
  /** Vestigial (the archive-on-edit prompt is gone); kept for stored-data compat. */
  tuneEditPrompted: boolean;
  /** Last sheet edit — sessions older than this were driven on a different setup. */
  tuneEditedAt?: number;
  /**
   * Tune fields changed since the pool's data was driven. Their measured
   * advice is suppressed ("changed — drive to re-measure") until the next
   * session start drops the pre-edit sessions and clears this.
   */
  staleFields?: (keyof CurrentTune)[];
  updatedAt: number;
}

/** An archived setup: the sheet plus its raw session evidence (re-analyzable). */
export interface SavedSetup {
  id: string;
  ordinal: number;
  name: string;
  savedAt: number;
  discipline: DisciplineId;
  build: BuildIdentity | null;
  tune: CurrentTune;
  sessions: RecordedSession[];
  /** Merged summary metrics at save time (the proof shown on cards). */
  m: SnapshotMetrics | null;
  note?: string;
}

/** A repo-bundled, read-only setup (sheet + proof, no raw sessions). */
export interface CuratedSetup {
  id: string;
  ordinal: number;
  name: string;
  discipline: DisciplineId;
  build: BuildIdentity | null;
  tune: CurrentTune;
  m: SnapshotMetrics | null;
  note?: string;
  author?: string;
}

export interface ExportFile {
  format: "fta-export";
  version: 1;
  kind: "full" | "car" | "setup";
  exportedAt: number;
  payload: {
    workspaces?: Workspace[];
    setups?: SavedSetup[];
  };
}

export interface CuratedFile {
  format: "fta-curated";
  version: 1;
  setups: CuratedSetup[];
}

export function emptyWorkspace(ordinal: number): Workspace {
  return {
    ordinal,
    tune: {},
    sessions: [],
    build: null,
    tuneEditPrompted: false,
    updatedAt: 0,
  };
}

export function tuneIsEmpty(t: CurrentTune): boolean {
  return Object.keys(t).length === 0;
}

export function workspaceIsEmpty(w: Workspace): boolean {
  return w.sessions.length === 0 && tuneIsEmpty(w.tune);
}
