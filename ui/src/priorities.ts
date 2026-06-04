// The user's priority ranking. The engine can't tell "good enough" from "could
// go faster" from telemetry alone, so this bias steers which opportunities it
// surfaces and which trade-offs it recommends when the car isn't clearly faulty.

export type PriorityId = "lapTime" | "stability" | "agility" | "topSpeed" | "tireLife" | "fun";

export const PRIORITY_LABELS: Record<PriorityId, string> = {
  lapTime: "Lap time / pace",
  stability: "Stability",
  agility: "Agility / rotation",
  topSpeed: "Top speed",
  tireLife: "Tire life",
  fun: "Fun / slidey",
};

export const DEFAULT_PRIORITIES: PriorityId[] = [
  "lapTime",
  "stability",
  "agility",
  "topSpeed",
  "tireLife",
  "fun",
];

const KEY = "fta.priorities";

export function loadPriorities(): PriorityId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as PriorityId[] | null;
    if (!Array.isArray(saved)) return [...DEFAULT_PRIORITIES];
    // keep only valid ids, then append any missing ones (forward-compatible)
    const valid = saved.filter((p) => p in PRIORITY_LABELS);
    for (const p of DEFAULT_PRIORITIES) if (!valid.includes(p)) valid.push(p);
    return valid;
  } catch {
    return [...DEFAULT_PRIORITIES];
  }
}

export function savePriorities(p: PriorityId[]) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function movePriority(list: PriorityId[], index: number, dir: -1 | 1): PriorityId[] {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return next;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}
