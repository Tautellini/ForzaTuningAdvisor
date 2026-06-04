// Per-iteration tuning log. Each time you Reset (= "I changed the car"), we snapshot
// the session's key metrics + the tune you had, so the tool can show whether your
// last change actually helped, and chart the trend across iterations.

import type { SessionSummary } from "./session";
import type { CurrentTune } from "./tune";
import type { DisciplineId } from "./discipline";

export interface SnapshotMetrics {
  understeerRatio: number; // >1 understeer, <1 oversteer
  frontLockFrac: number;
  rearLockFrac: number;
  frontSpinFrac: number;
  rearSpinFrac: number;
  bottomingFront: number;
  bottomingRear: number;
  nearLimitFrac: number;
  maxLatG: number;
  highSpeedNearLimitFrac: number;
}

export interface TuneSnapshot {
  t: number; // epoch ms (stamped by the caller)
  durationS: number;
  samples: number;
  discipline: DisciplineId;
  tune: CurrentTune;
  m: SnapshotMetrics;
}

export function metricsFrom(s: SessionSummary): SnapshotMetrics {
  return {
    understeerRatio: s.understeerRatio,
    frontLockFrac: s.frontLockFrac,
    rearLockFrac: s.rearLockFrac,
    frontSpinFrac: s.frontSpinFrac,
    rearSpinFrac: s.rearSpinFrac,
    bottomingFront: s.bottoming.front,
    bottomingRear: s.bottoming.rear,
    nearLimitFrac: s.nearLimitFrac,
    maxLatG: s.maxLatG,
    highSpeedNearLimitFrac: s.highSpeedNearLimitFrac,
  };
}

const KEY = "fta.tuningLog";
const CAP = 30;

export function loadLog(): TuneSnapshot[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as TuneSnapshot[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function appendLog(entry: TuneSnapshot): TuneSnapshot[] {
  const log = loadLog();
  log.push(entry);
  while (log.length > CAP) log.shift();
  localStorage.setItem(KEY, JSON.stringify(log));
  return log;
}

export function clearLog(): TuneSnapshot[] {
  localStorage.removeItem(KEY);
  return [];
}
