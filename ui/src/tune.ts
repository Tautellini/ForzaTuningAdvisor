// The user's CURRENT tune. Telemetry never contains this, so it's optional input.
// When provided, the advice engine turns directional cues into absolute targets.

export interface CurrentTune {
  finalDrive?: number; // ratio, e.g. 3.50
  frontSprings?: number; // lb/in or kgf/mm (unit-agnostic; we apply % changes)
  rearSprings?: number;
  frontARB?: number; // 1..65
  rearARB?: number;
  frontRideHeight?: number; // cm or in
  rearRideHeight?: number;
  frontPressure?: number; // psi
  rearPressure?: number;
  brakeBalance?: number; // % front
  diffAccel?: number; // %
}

export const TUNE_FIELDS: { key: keyof CurrentTune; label: string; hint: string }[] = [
  { key: "frontPressure", label: "Front tire pressure", hint: "psi" },
  { key: "rearPressure", label: "Rear tire pressure", hint: "psi" },
  { key: "finalDrive", label: "Final drive", hint: "ratio" },
  { key: "frontARB", label: "Front anti-roll bar", hint: "1–65" },
  { key: "rearARB", label: "Rear anti-roll bar", hint: "1–65" },
  { key: "frontSprings", label: "Front springs", hint: "rate" },
  { key: "rearSprings", label: "Rear springs", hint: "rate" },
  { key: "frontRideHeight", label: "Front ride height", hint: "cm/in" },
  { key: "rearRideHeight", label: "Rear ride height", hint: "cm/in" },
  { key: "brakeBalance", label: "Brake balance", hint: "% front" },
  { key: "diffAccel", label: "Diff acceleration", hint: "%" },
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
