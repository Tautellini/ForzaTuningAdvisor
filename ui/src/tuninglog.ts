// Compact key metrics for a session — used for the trend chart and loop feedback.

import type { SessionSummary } from "./session";

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
