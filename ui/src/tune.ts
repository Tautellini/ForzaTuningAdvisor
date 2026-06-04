// The user's CURRENT tune. Telemetry never contains this, so it's optional input.
// When provided, the advice engine turns directional cues into absolute targets.

import { lengthShort, pressureUnit, type Units } from "./units";

export interface CurrentTune {
  finalDrive?: number; // ratio, e.g. 3.50
  frontSprings?: number; // spring rate (unit per settings; we apply % changes)
  rearSprings?: number;
  frontARB?: number; // 1..65
  rearARB?: number;
  frontRideHeight?: number; // cm or in
  rearRideHeight?: number;
  frontPressure?: number; // psi or bar
  rearPressure?: number;
  brakeBalance?: number; // % front
  diffAccel?: number; // %
}

export interface TuneField {
  key: keyof CurrentTune;
  label: string; // short label for the compact strip
  icon: string;
  unit: (u: Units) => string;
}

export const TUNE_FIELDS: TuneField[] = [
  { key: "frontPressure", label: "F tire", icon: "🛞", unit: pressureUnit },
  { key: "rearPressure", label: "R tire", icon: "🛞", unit: pressureUnit },
  { key: "frontARB", label: "F ARB", icon: "⚖️", unit: () => "1–65" },
  { key: "rearARB", label: "R ARB", icon: "⚖️", unit: () => "1–65" },
  { key: "frontSprings", label: "F spring", icon: "🌀", unit: (u) => u.springs },
  { key: "rearSprings", label: "R spring", icon: "🌀", unit: (u) => u.springs },
  { key: "frontRideHeight", label: "F height", icon: "↕️", unit: lengthShort },
  { key: "rearRideHeight", label: "R height", icon: "↕️", unit: lengthShort },
  { key: "finalDrive", label: "Final drive", icon: "⚙️", unit: () => "ratio" },
  { key: "brakeBalance", label: "Brake bal", icon: "🛑", unit: () => "% F" },
  { key: "diffAccel", label: "Diff accel", icon: "🔩", unit: () => "%" },
];

const KEY = "fta.currentTune";

export function loadTune(): CurrentTune {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as CurrentTune;
  } catch {
    return {};
  }
}

export function saveTune(t: CurrentTune) {
  localStorage.setItem(KEY, JSON.stringify(t));
}
