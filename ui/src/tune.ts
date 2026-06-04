// The user's CURRENT tune — the full Forza tuning sheet. Telemetry never contains
// this, so it's optional input; when provided, advice gives absolute targets.

import { lengthShort, pressureUnit, type Units } from "./units";

export interface CurrentTune {
  // Tires
  frontPressure?: number;
  rearPressure?: number;
  // Gearing
  finalDrive?: number;
  numGears?: number;
  gearRatios?: number[];
  // Alignment
  frontCamber?: number;
  rearCamber?: number;
  frontToe?: number;
  rearToe?: number;
  caster?: number;
  // Anti-roll bars
  frontARB?: number;
  rearARB?: number;
  // Springs
  frontSprings?: number;
  rearSprings?: number;
  frontRideHeight?: number;
  rearRideHeight?: number;
  // Damping
  frontBump?: number;
  rearBump?: number;
  frontRebound?: number;
  rearRebound?: number;
  // Aero
  frontAero?: number;
  rearAero?: number;
  // Brakes
  brakeBalance?: number; // % front
  brakePressure?: number; // %
  // Differential
  frontDiffAccel?: number;
  frontDiffDecel?: number;
  rearDiffAccel?: number;
  rearDiffDecel?: number;
  centerBalance?: number; // % to rear
}

type ScalarKey = Exclude<keyof CurrentTune, "gearRatios" | "numGears">;

export interface TuneField {
  key: ScalarKey;
  label: string;
  unit: (u: Units) => string;
  drivetrains?: number[]; // 0 FWD, 1 RWD, 2 AWD
}

export interface TuneGroup {
  id: string;
  title: string;
  icon: string;
  fields: TuneField[];
  gearing?: boolean; // rendered specially (final drive + per-gear ratios)
  note?: string; // honest caveat shown under the group
}

const deg = () => "°";
const pctF = () => "% F";
const pctU = () => "%";

export const TUNE_GROUPS: TuneGroup[] = [
  {
    id: "tires",
    title: "Tires",
    icon: "🛞",
    fields: [
      { key: "frontPressure", label: "Front pressure", unit: pressureUnit },
      { key: "rearPressure", label: "Rear pressure", unit: pressureUnit },
    ],
  },
  { id: "gearing", title: "Gearing", icon: "⚙️", gearing: true, fields: [] },
  {
    id: "alignment",
    title: "Alignment",
    icon: "📐",
    note: "Camber is estimated from body roll (a starting point); toe/caster are guidance only.",
    fields: [
      { key: "frontCamber", label: "Front camber", unit: deg },
      { key: "rearCamber", label: "Rear camber", unit: deg },
      { key: "frontToe", label: "Front toe", unit: deg },
      { key: "rearToe", label: "Rear toe", unit: deg },
      { key: "caster", label: "Caster", unit: deg },
    ],
  },
  {
    id: "arb",
    title: "Anti-roll bars",
    icon: "⚖️",
    fields: [
      { key: "frontARB", label: "Front", unit: () => "1–65" },
      { key: "rearARB", label: "Rear", unit: () => "1–65" },
    ],
  },
  {
    id: "springs",
    title: "Springs & ride height",
    icon: "🌀",
    fields: [
      { key: "frontSprings", label: "Front rate", unit: (u) => u.springs },
      { key: "rearSprings", label: "Rear rate", unit: (u) => u.springs },
      { key: "frontRideHeight", label: "Front height", unit: lengthShort },
      { key: "rearRideHeight", label: "Rear height", unit: lengthShort },
    ],
  },
  {
    id: "damping",
    title: "Damping",
    icon: "💧",
    note: "Only a low-confidence hint is possible from suspension motion.",
    fields: [
      { key: "frontBump", label: "Front bump", unit: () => "" },
      { key: "rearBump", label: "Rear bump", unit: () => "" },
      { key: "frontRebound", label: "Front rebound", unit: () => "" },
      { key: "rearRebound", label: "Rear rebound", unit: () => "" },
    ],
  },
  {
    id: "aero",
    title: "Aero",
    icon: "🛫",
    fields: [
      { key: "frontAero", label: "Front downforce", unit: (u) => (u.system === "imperial" ? "lbf" : "kgf") },
      { key: "rearAero", label: "Rear downforce", unit: (u) => (u.system === "imperial" ? "lbf" : "kgf") },
    ],
  },
  {
    id: "brakes",
    title: "Brakes",
    icon: "🛑",
    fields: [
      { key: "brakeBalance", label: "Balance", unit: pctF },
      { key: "brakePressure", label: "Pressure", unit: pctU },
    ],
  },
  {
    id: "diff",
    title: "Differential",
    icon: "🔩",
    fields: [
      { key: "frontDiffAccel", label: "Front accel", unit: pctU, drivetrains: [0, 2] },
      { key: "frontDiffDecel", label: "Front decel", unit: pctU, drivetrains: [0, 2] },
      { key: "rearDiffAccel", label: "Rear accel", unit: pctU, drivetrains: [1, 2] },
      { key: "rearDiffDecel", label: "Rear decel", unit: pctU, drivetrains: [1, 2] },
      { key: "centerBalance", label: "Center balance", unit: () => "% rear", drivetrains: [2] },
    ],
  },
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
