import type { SessionSummary } from "../session";
import type { CurrentTune } from "../tune";
import type { DisciplineProfile } from "../discipline";
import {
  lengthShort,
  pressureRange,
  pressureStep,
  pressureUnit,
  pressureVal,
  rideStep,
  tempC,
  type Units,
} from "../units";

export type Confidence = "high" | "medium" | "low";
export type AdviceKind = "fix" | "opportunity";
export type AdviceGroup =
  | "tires"
  | "gearing"
  | "alignment"
  | "arb"
  | "springs"
  | "damping"
  | "aero"
  | "brakes"
  | "diff";

// Every emitted id MUST resolve to a TUNE_GROUPS id here, or TuneSection
// silently drops the card (it only renders the groups on the tune sheet).
function groupForId(id: string): AdviceGroup | undefined {
  if (id.startsWith("gearing")) return "gearing";
  if (id.startsWith("camber") || id.startsWith("align") || id.startsWith("toe") || id.startsWith("caster"))
    return "alignment";
  if (id === "drag-aero" || id.startsWith("aero")) return "aero";
  if (id.startsWith("brake")) return "brakes";
  if (id.startsWith("diff") || id.startsWith("drift") || id === "drag-launch") return "diff";
  if (id.startsWith("damping")) return "damping";
  if (id.startsWith("bottoming") || id.startsWith("springs")) return "springs";
  if (id.startsWith("balance")) return "arb";
  if (id.startsWith("tire")) return "tires";
  return undefined;
}

// Every viz is self-labeling (numbers, units or words) — an unlabeled
// percentage bar reads as a meaningless progress indicator, so there is none;
// evidence fractions live in the card's why-text instead.
export type AdviceViz =
  | { kind: "balance"; ratio: number } // front/rear slip ratio; 1 = neutral
  | { kind: "delta"; from: number | null; to: number; min: number; max: number; unit?: string }
  | { kind: "dir"; dir: "more" | "less"; label: string }
  | { kind: "gears"; unit: string; redline: number; gears: { g: number; speed: number; shift?: number }[] }
  | { kind: "ratioset"; rows: { g: number; from: number; to: number }[] };

export interface Advice {
  id: string;
  area: string;
  confidence: Confidence;
  kind: AdviceKind;
  group?: AdviceGroup; // assigned from id at return time
  field?: keyof CurrentTune; // the specific lever this targets (for ambiguous ids)
  /**
   * Step-snapped sheet values the Apply button writes. Single-sourced with the
   * numbers shown in recommendation/viz so what you read is what lands in the
   * sheet. Absent on directional-only cards (no absolute target).
   */
  apply?: Partial<CurrentTune>;
  /** Pure sheet check (no telemetry) — stays live while the pool is stale. */
  sheetOnly?: boolean;
  recommendation: string; // the action (includes concrete numbers when available)
  why: string; // evidence from the session data
  outcome: string; // expected result + trade-off
  viz?: AdviceViz;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
// single-field apply payload (computed keys widen to a string index otherwise)
const ap = (k: keyof CurrentTune, v: number): Partial<CurrentTune> =>
  ({ [k]: v }) as Partial<CurrentTune>;
const ord = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => `${Math.round(x * 100)}%`;

// Minimum evidence before a rule may speak, in frames at the ~60 Hz feed.
// Deliberately conservative: one full steering input is NOT "cornering data".
// Think several corners, several braking zones, a full-throttle rev sweep —
// the Coverage panel shows these same numbers as its "ready" bars.
export const MIN = {
  frames: 1800, // ~30s of actual driving before any advice at all
  cornering: 600, // ~10s under real steering = a handful of corners
  mid: 360, // ~6s coasting mid-corner (the cleanest balance signal)
  phase: 180, // ~3s spent in one corner phase (entry / exit balance)
  braking: 240, // ~4s of braking (any pressure) = several braking zones
  locked: 40, // ~0.7s of actual wheel lock before the low-pedal verdict
  straight: 300, // ~5s running straight at speed (toe-scrub estimate)
  hardBrake: 180, // ~3s of >=50% pedal (brake-dive verdict)
  hardPower: 240, // ~4s of >=80% throttle (power-squat verdict)
  lifts: 8, // mid-corner throttle lifts before lift-off verdicts
  power: 360, // ~6s on significant throttle (traction/diff verdicts)
  curve: 12, // distinct rpm bins on the power curve = a real WOT sweep
  hsCorner: 300, // ~5s of fast cornering (aero verdicts)
  lowSpeed: 300, // ~5s of slow cornering (mechanical-vs-aero comparison)
  hardCorner: 240, // ~4s above 0.5g lateral (camber-from-roll estimate)
  damping: 1800, // oscillation *rate* needs time to stabilize
  topGearWot: 120, // ~2s flat-out in top gear before the limiter verdict
};

function powerAt(curve: SessionSummary["powerCurve"], rpm: number): number {
  if (curve.length === 0) return 0;
  if (rpm <= curve[0].rpm) return curve[0].power;
  if (rpm >= curve[curve.length - 1].rpm) return curve[curve.length - 1].power;
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i].rpm) {
      const a = curve[i - 1];
      const b = curve[i];
      const f = (rpm - a.rpm) / (b.rpm - a.rpm);
      return a.power + f * (b.power - a.power);
    }
  }
  return curve[curve.length - 1].power;
}

function optimalShiftRpm(
  curve: SessionSummary["powerCurve"],
  redline: number,
  peakPowerRpm: number,
  ratioDrop: number,
): number {
  for (let R = Math.max(peakPowerRpm, 2000); R <= redline; R += 50) {
    if (powerAt(curve, R) <= powerAt(curve, R * ratioDrop)) return R;
  }
  return redline;
}

export interface GearingAnalysis {
  hasCurve: boolean;
  peakPowerRpm: number;
  peakTorqueRpm: number;
  redline: number;
  shifts: { from: number; to: number; rpm: number }[];
}

/** Shared gearing math used by both the advice engine and the power-curve chart. */
export function gearingAnalysis(s: SessionSummary | null): GearingAnalysis {
  const empty: GearingAnalysis = {
    hasCurve: false,
    peakPowerRpm: 0,
    peakTorqueRpm: 0,
    redline: 0,
    shifts: [],
  };
  if (!s || s.powerCurve.length < MIN.curve || s.peakPowerRpm <= 0) return empty;
  const gearNums = Object.keys(s.gears)
    .map(Number)
    .filter((g) => s.gears[g].k > 0)
    .sort((a, b) => a - b);
  const shifts: GearingAnalysis["shifts"] = [];
  for (let i = 0; i < gearNums.length - 1; i++) {
    const g = gearNums[i];
    const next = gearNums[i + 1];
    if (next !== g + 1) continue;
    const drop = s.gears[next].k / s.gears[g].k;
    if (drop <= 0 || drop >= 1) continue;
    const R = optimalShiftRpm(s.powerCurve, s.redline || s.maxRpm, s.peakPowerRpm, drop);
    shifts.push({ from: g, to: next, rpm: r0(R / 50) * 50 });
  }
  return {
    hasCurve: true,
    peakPowerRpm: s.peakPowerRpm,
    peakTorqueRpm: s.peakTorqueRpm,
    redline: s.redline || s.maxRpm,
    shifts,
  };
}

export function analyzeSession(
  s: SessionSummary | null,
  tune: CurrentTune,
  p: DisciplineProfile,
  u: Units,
): Advice[] {
  const out: Advice[] = [];
  const finish = () => out.map((a) => ({ ...a, group: groupForId(a.id) }));

  // ---- Tires: entered pressure vs the discipline's window (sheet check) ----
  // The feed has no pressure channel, so measured pressure advice is
  // impossible. This instead checks the SHEET against the mode's window —
  // the one rule that needs no telemetry, so it may fire before any driving.
  const pressureFlagged = { front: false, rear: false };
  for (const axle of ["front", "rear"] as const) {
    const key = axle === "front" ? "frontPressure" : "rearPressure";
    const cur = tune[key];
    if (cur == null) continue;
    const win = p.psiWindow[axle];
    const lo = pressureVal(win[0], u);
    const hi = pressureVal(win[1], u);
    if (cur >= lo && cur <= hi) continue;
    pressureFlagged[axle] = true;
    const above = cur > hi;
    const target = u.system === "imperial" ? r0(clamp(cur, lo, hi)) : r1(clamp(cur, lo, hi));
    out.push({
      id: `tire-pressure-${axle}`,
      area: `${cap(axle)} tire pressure`,
      confidence: p.id === "drift" ? "low" : "medium",
      kind: "fix",
      field: key,
      sheetOnly: true,
      apply: ap(key, target),
      recommendation: `${cap(axle)} pressure ${cur} → ~${target} ${pressureUnit(u)}`,
      why: `${p.label} runs best around ${pressureRange(win[0], win[1], u)}; your sheet says ${cur} ${pressureUnit(u)} — ${above ? "above" : "below"} that window. The feed can't measure pressure, so this checks the sheet against the discipline, not the tire.`,
      outcome: above
        ? "More compliance and a bigger contact patch where grip is loose or uneven. Trade-off: too low feels vague and overheats the carcass."
        : "Less sidewall flex, crisper response, cooler tires. Trade-off: too high shrinks the contact patch.",
      viz: {
        kind: "delta",
        from: cur,
        to: target,
        min: Math.min(cur, lo),
        max: Math.max(cur, hi),
        unit: pressureUnit(u),
      },
    });
  }

  // ---- Caster vs the discipline's floor (sheet check, like pressure) -------
  // Caster has no telemetry signal at all; this is community knowledge.
  if (p.rules.alignment && tune.caster != null && tune.caster < p.casterMin) {
    const casterTarget = r1(Math.max(6, p.casterMin));
    out.push({
      id: "caster-low",
      area: "Caster",
      confidence: "medium",
      kind: "fix",
      field: "caster",
      sheetOnly: true,
      apply: { caster: casterTarget },
      recommendation: `Caster ${r1(tune.caster)}° → ~${casterTarget}–7°`,
      why: `High caster adds camber exactly when you steer and settles the car at speed — in Forza it's nearly free grip. ${p.label} setups run ${r1(p.casterMin)}°+ as a floor; your sheet says ${r1(tune.caster)}°. (No telemetry can measure caster — this checks the sheet.)`,
      outcome:
        "More mid-corner front grip and straight-line stability. Trade-off: marginally slower steering response near center.",
      viz: { kind: "delta", from: tune.caster, to: casterTarget, min: 1, max: 7, unit: "°" },
    });
  }

  // ---- ARBs vs loose surfaces (sheet check) ---------------------------------
  // Telemetry can't separate ARB stiffness from springs, but maxed bars on a
  // loose surface are a known mistake: the wheels must follow ruts and camber
  // changes independently.
  if (
    (p.id === "dirt" || p.id === "offroad") &&
    tune.frontARB != null &&
    tune.rearARB != null &&
    tune.frontARB >= 50 &&
    tune.rearARB >= 50
  ) {
    out.push({
      id: "balance-arb-stiff",
      area: "Anti-roll bars",
      confidence: "medium",
      kind: "fix",
      field: "frontARB",
      sheetOnly: true,
      apply: { frontARB: 20, rearARB: 20 }, // middle of the recommended band
      recommendation: `Front ${r0(tune.frontARB)} / Rear ${r0(tune.rearARB)} → ~15–25 each`,
      why: `${p.label} runs soft anti-roll bars: each wheel has to follow its own rut or camber change, and bars this stiff (${r0(tune.frontARB)}/${r0(tune.rearARB)} of 65) lift the inside wheel over every bump. (Sheet check — balance fine-tuning still comes from the measured cards.)`,
      outcome:
        "More contact patch and drive on rough ground. Trade-off: more body roll — that's normal off-road.",
      viz: { kind: "dir", dir: "less", label: "ARB stiffness" },
    });
  }

  // ---- Bump vs rebound relationship (sheet check) ---------------------------
  // The well-established starting point is bump ≈ 60–70% of rebound; inverted
  // or far-below values are flagged from the sheet alone.
  if (p.rules.damping) {
    for (const axle of ["front", "rear"] as const) {
      const bumpKey = axle === "front" ? "frontBump" : "rearBump";
      const reboundKey = axle === "front" ? "frontRebound" : "rearRebound";
      const b = tune[bumpKey];
      const rb = tune[reboundKey];
      if (b == null || rb == null || rb <= 0) continue;
      if (b <= rb + 0.5 && b >= rb * 0.4) continue; // within the sane band
      const target = Math.max(1, r1(rb * 0.65));
      out.push({
        id: `damping-bump-${axle}`,
        area: `${cap(axle)} bump damping`,
        confidence: "medium",
        kind: "fix",
        field: bumpKey,
        sheetOnly: true,
        apply: ap(bumpKey, target),
        recommendation: `${cap(axle)} bump ${r1(b)} → ~${target} (≈65% of your ${r1(rb)} rebound)`,
        why:
          b > rb + 0.5
            ? `Bump is set stiffer than rebound (${r1(b)} vs ${r1(rb)}) — compression should be the softer of the pair: the spring needs to compress quickly over a bump, then the damper controls the slower return.`
            : `Bump sits far below the usual ~60–70% of rebound (${r1(b)} vs ${r1(rb)}) — too little compression damping lets the chassis crash down onto its springs.`,
        outcome:
          "Settled, predictable response over bumps. A rule-of-thumb sheet check — fine-tune from there by feel.",
        viz: { kind: "delta", from: b, to: target, min: 1, max: 20, unit: "" },
      });
    }
  }

  if (!s || s.drivingFrames < MIN.frames) return finish();

  // ---- Gearing: optimal shift points ---------------------------------------
  const gearNums = Object.keys(s.gears)
    .map(Number)
    .filter((g) => s.gears[g].k > 0)
    .sort((a, b) => a - b);
  const gearing = gearingAnalysis(s);
  if (p.rules.shiftPoints && gearing.shifts.length > 0) {
    const shiftByFrom = new Map(gearing.shifts.map((x) => [x.from, x.rpm]));
    const sf = u.system === "imperial" ? { f: 0.621371, unit: "mph" } : { f: 1, unit: "km/h" };
    const gearsViz = gearNums.map((g) => ({
      g,
      speed: Math.round(s.gears[g].maxSpeedKmh * sf.f),
      shift: shiftByFrom.get(g),
    }));
    const allAtRedline = gearing.shifts.every((x) => x.rpm >= gearing.redline - 150);
    out.push({
      id: "gearing-shift-points",
      area: "Shift points (reference)",
      confidence: "low",
      kind: "opportunity",
      recommendation: allAtRedline
        ? `Pull every gear to the rev limiter (~${r0(gearing.redline)} rpm)`
        : gearing.shifts.map((x) => `${x.from}→${x.to} ${x.rpm}`).join("   ·   ") + " rpm",
      why: allAtRedline
        ? `Your engine keeps making power right up to the limiter (peak power ≈ ${r0(gearing.peakPowerRpm)} rpm, redline ≈ ${r0(gearing.redline)} rpm), so short-shifting loses acceleration. If you expected an earlier shift, do a clean full-throttle pull through every gear so the power curve is fully sampled.`
        : `From your measured power curve: peak power ≈ ${r0(gearing.peakPowerRpm)} rpm, peak torque ≈ ${r0(gearing.peakTorqueRpm)} rpm, redline ≈ ${r0(gearing.redline)} rpm. Each shift point is where the next gear starts out-pulling the current one.`,
      outcome:
        "Most acceleration out of every gear. Trade-off: none if the power curve is well sampled — drive more full-throttle pulls to refine it.",
      viz: { kind: "gears", unit: sf.unit, redline: gearing.redline, gears: gearsViz },
    });
  }

  // ---- Gearing: hitting limiter in the top gear ----------------------------
  const topGear = gearNums[gearNums.length - 1];
  if (
    p.rules.topGearLimiter &&
    topGear &&
    s.gears[topGear].wot >= MIN.topGearWot &&
    s.gears[topGear].limiterFrac >= 0.15
  ) {
    const lengthen = clamp(s.gears[topGear].limiterFrac, 0.05, 0.12);
    const topSpd =
      u.system === "imperial"
        ? `${r0(s.gears[topGear].maxSpeedKmh * 0.621371)} mph`
        : `${r0(s.gears[topGear].maxSpeedKmh)} km/h`;
    const fdTarget = tune.finalDrive != null ? r2(tune.finalDrive * (1 - lengthen)) : null;
    const rec =
      fdTarget != null
        ? `Final drive ${r2(tune.finalDrive!)} → ~${fdTarget}`
        : `Lengthen top gear / final drive by ~${pct(lengthen)}`;
    out.push({
      id: "gearing-limiter-top",
      area: "Gearing — top end",
      confidence: "high",
      kind: "fix",
      field: "finalDrive",
      apply: fdTarget != null ? { finalDrive: fdTarget } : undefined,
      recommendation: rec,
      why: `You sit on the rev limiter ${pct(s.gears[topGear].limiterFrac)} of full-throttle time in gear ${topGear} (topped out at ${topSpd}) — the gearing runs out before the straight does.`,
      outcome:
        "Higher top speed where straights are long. Trade-off: slightly slower final-gear acceleration. Net gain on power tracks, marginal on twisty ones.",
    });
  }

  // ---- Gearing: even out spacing (holistic, keeps 1st & top gear) ----------
  if (p.rules.shiftPoints) {
    const ratios = tune.gearRatios ?? [];
    const N = tune.numGears ?? ratios.length;
    const full = N >= 3 && Array.from({ length: N }, (_, i) => ratios[i]).every((r) => Number.isFinite(r) && (r as number) > 0);

    if (full) {
      // NOTE: deliberately not named r1/rN — `r1` would shadow the rounding helper
      const firstRatio = ratios[0] as number;
      const lastRatio = ratios[N - 1] as number;
      if (firstRatio > lastRatio) {
        // geometric progression between the (unchanged) 1st and top gears
        const suggested = Array.from(
          { length: N },
          (_, i) => firstRatio * Math.pow(lastRatio / firstRatio, i / (N - 1)),
        );
        const rows = suggested.map((sv, i) => ({
          g: i + 1,
          from: Math.round((ratios[i] as number) * 100) / 100,
          to: Math.round(sv * 100) / 100,
        }));
        const middleOff = rows.slice(1, N - 1).map((row) => Math.abs(row.to - row.from) / row.from);
        if (middleOff.length && Math.max(...middleOff) >= 0.04) {
          out.push({
            id: "gearing-spacing",
            area: "Gearing — ratio spacing",
            confidence: "medium",
            kind: "fix",
            apply: { gearRatios: rows.map((row) => row.to) },
            recommendation: "Even out the middle gears (keeps your 1st & top gear)",
            why: "Your middle gears are unevenly spaced, so some shifts drop the revs much more than others. A smooth (geometric) progression keeps each shift's RPM drop consistent — no single gear that bogs or over-revs.",
            outcome: "Consistent pull out of every gear. Trade-off: none — launch (1st) and top speed (top gear) are unchanged.",
            viz: { kind: "ratioset", rows },
          });
        }
      }
    } else if (gearing.shifts.length > 0) {
      // No full ratio set entered — directional bog flag only.
      const floor = gearing.peakTorqueRpm > 0 ? gearing.peakTorqueRpm : Math.round(gearing.peakPowerRpm * 0.7);
      const worst = gearing.shifts
        .map((sft) => {
          const drop = (s.gears[sft.to]?.k ?? 0) / (s.gears[sft.from]?.k ?? 0);
          return Number.isFinite(drop) && drop > 0 && drop < 1 ? { sft, landing: sft.rpm * drop } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x && x.landing < floor)
        .sort((a, b) => a.landing - b.landing)[0];
      if (worst) {
        out.push({
          id: `gearing-ratio-${worst.sft.to}`,
          area: `Gearing — ${worst.sft.to}${ord(worst.sft.to)} gear`,
          confidence: "medium",
          kind: "fix",
          recommendation: `Shorten ${worst.sft.to}${ord(worst.sft.to)} gear a little (enter your ratios for an exact, balanced set)`,
          why: `After upshifting ${worst.sft.from}→${worst.sft.to} you fall to ~${r0(worst.landing)} rpm — below peak torque (${r0(gearing.peakTorqueRpm)} rpm), so the engine bogs out of the shift.`,
          outcome: "Stronger acceleration out of that shift (no bogging).",
          viz: { kind: "dir", dir: "more", label: "shorter gear" },
        });
      }
    }
  }

  // ---- Drag: launch traction + minimum aero --------------------------------
  if (p.rules.dragLaunch && s.powerFrames >= MIN.power) {
    const dt = s.car.drivetrain;
    const useRear = dt === 1 || (dt === 2 && s.rearSpinFrac >= s.frontSpinFrac);
    const frac = useRear ? s.rearSpinFrac : s.frontSpinFrac;
    if (frac >= p.thr.wheelspin) {
      const drop = clamp(r0(frac * 30), 5, 25);
      const key = useRear ? "rearDiffAccel" : "frontDiffAccel";
      const axle = useRear ? "rear" : "front";
      const cur = tune[key];
      const to = cur != null ? r0(Math.max(clamp(cur - drop, 0, 100), p.diffAccelFloor)) : null;
      const rec =
        cur != null
          ? to! < cur
            ? `${axle[0].toUpperCase() + axle.slice(1)} diff acceleration ${r0(cur)}% → ~${to}%`
            : `Diff already open (${r0(cur)}%) — feed the throttle in more gradually instead`
          : `Lower ${axle} diff acceleration by ~${drop}%`;
      out.push({
        id: "drag-launch",
        area: "Launch traction",
        confidence: "high",
        kind: "fix",
        field: key,
        apply: cur != null && to! < cur ? ap(key, to!) : undefined,
        recommendation: `${rec}; drop tire pressure slightly for a bigger contact patch`,
        why: `The ${axle} wheels spin in ${pct(frac)} of on-power frames — that's wasted grip off the line.`,
        outcome:
          "Quicker launch and lower ET. Trade-off: go too soft and it bogs instead of spinning — dial to the edge of traction.",
      });
    }
  }
  if (p.id === "drag") {
    out.push({
      id: "drag-aero",
      area: "Aero",
      confidence: "medium",
      kind: "fix",
      recommendation: "Set aero to minimum downforce (front and rear).",
      why: "Downforce adds drag, which directly costs trap speed on a straight.",
      outcome: "Higher top speed / lower ET. Trade-off: the car gets loose in corners — irrelevant on the strip.",
    });
  }

  // ---- Brakes: locking at LOW pedal = pressure is way too high -------------
  // Measured from the pedal position at the moment wheels lock — no separate
  // "trail braking" data needed (a pedal band never accumulates enough time).
  let lowPedalLockCard = false;
  if (
    p.rules.brakes &&
    s.brakingFrames >= MIN.braking &&
    s.lockFrames >= MIN.locked &&
    s.lockPedalAvg > 0 &&
    s.lockPedalAvg <= 0.6
  ) {
    lowPedalLockCard = true;
    const cur = tune.brakePressure;
    const to = cur != null ? r0(clamp(cur - 12, 0, 100)) : null;
    out.push({
      id: "brake-partial-lock",
      area: "Brake pressure",
      confidence: "high",
      kind: "fix",
      field: "brakePressure",
      apply: to != null ? { brakePressure: to } : undefined,
      recommendation:
        cur != null ? `Brake pressure ${r0(cur)}% → ~${to}%` : "Lower brake pressure ~12%",
      why: `When your wheels lock, the pedal averages only ${pct(s.lockPedalAvg)} — if that little input already locks up, the system clamps far harder than the tires can take. That's a stronger signal than locking at a full stomp.`,
      outcome:
        "A usable pedal range for trail-braking and threshold control. Trade-off: very little — locking this early leaves no room to modulate.",
    });
  }

  // ---- Brakes: balance (with deadband) or overall pressure -----------------
  if (p.rules.brakes && s.brakingFrames >= MIN.braking) {
    const imbalance = s.frontLockFrac - s.rearLockFrac; // + = front locks more
    const lockMax = Math.max(s.frontLockFrac, s.rearLockFrac);
    if (lockMax >= p.thr.lockup) {
      if (Math.abs(imbalance) >= 0.1) {
        // clear front/rear bias — shift balance toward the axle that ISN'T locking
        const front = imbalance > 0;
        const shift = clamp(r0(Math.abs(imbalance) * 15), 1, 6);
        const cur = tune.brakeBalance;
        const to = cur != null ? r0(clamp(cur + (front ? -shift : shift), 0, 100)) : null;
        out.push({
          id: front ? "brake-front-lock" : "brake-rear-lock",
          area: "Brake balance",
          confidence: "high",
          kind: "fix",
          field: "brakeBalance",
          apply: to != null ? { brakeBalance: to } : undefined,
          recommendation:
            cur != null
              ? `Brake balance ${r0(cur)}% → ~${to}% front`
              : `Move brake balance ~${shift}% ${front ? "rearward" : "forward"}`,
          why: `${front ? "Front" : "Rear"} wheels lock more under braking (${pct(s.frontLockFrac)} F vs ${pct(s.rearLockFrac)} R) — bias the brakes toward the axle that isn't locking. Small step on purpose, to avoid overshooting back the other way.`,
          outcome: front
            ? "Keeps the fronts rolling so you can still steer while braking. Trade-off: too far and the rears begin to lock."
            : "Steadier rear under braking. Trade-off: too far forward and the fronts begin to lock.",
          viz:
            cur != null
              ? { kind: "delta", from: cur, to: to!, min: 0, max: 100, unit: "% front" }
              : undefined,
        });
      } else if (!lowPedalLockCard) {
        // both axles lock about equally — that's overall pressure, not balance
        // (skipped when the low-pedal card already says so, louder)
        const cur = tune.brakePressure;
        const to = cur != null ? r0(clamp(cur - 8, 0, 100)) : null;
        out.push({
          id: "brake-pressure",
          area: "Brake pressure",
          confidence: "medium",
          kind: "fix",
          field: "brakePressure",
          apply: to != null ? { brakePressure: to } : undefined,
          recommendation:
            cur != null ? `Brake pressure ${r0(cur)}% → ~${to}%` : "Lower brake pressure ~8%",
          why: `Both axles lock about equally (${pct(s.frontLockFrac)} F / ${pct(s.rearLockFrac)} R) — that's too much overall braking force, not a front/rear balance issue. The balance is fine.`,
          outcome:
            "Less locking and better threshold-braking control. Trade-off: go too soft and stopping distances grow.",
        });
      }
    }
  }

  // ---- Differential: per-axle wheelspin (front / rear / center) -------------
  if (p.rules.diffWheelspin && s.powerFrames >= MIN.power) {
    const dt = s.car.drivetrain;
    const frontDriven = dt === 0 || dt === 2;
    const rearDriven = dt === 1 || dt === 2;
    const thr = p.thr.wheelspin;
    const conf: Confidence = p.id === "road" ? "high" : "medium";

    const axleCard = (axle: "front" | "rear", frac: number, key: "frontDiffAccel" | "rearDiffAccel") => {
      const drop = clamp(r0(frac * 30), 5, 20);
      const cur = tune[key];
      // Floor per discipline: on loose surfaces wheelspin is the surface, not
      // the diff — never ratchet the advice toward a fully open (0%) diff.
      const to = cur != null ? r0(Math.max(clamp(cur - drop, 0, 100), p.diffAccelFloor)) : null;
      if (cur != null && to! >= cur) return; // already at the floor — opening further won't help
      out.push({
        id: `diff-${axle}`,
        area: `Differential — ${axle}`,
        confidence: conf,
        kind: "fix",
        field: key,
        apply: to != null ? ap(key, to) : undefined,
        recommendation:
          cur != null
            ? `${axle[0].toUpperCase() + axle.slice(1)} diff acceleration ${r0(cur)}% → ~${to}%`
            : `Lower ${axle} diff acceleration by ~${drop}% (not below ~${p.diffAccelFloor}% for ${p.label.toLowerCase()})`,
        why: `The ${axle} wheels spin in ${pct(frac)} of on-power frames — more than ideal for ${p.label.toLowerCase()}.`,
        outcome: `Cleaner ${axle} drive off corners. Trade-off: too low and the inside ${axle} wheel spins on power — find where it just hooks.`,
        viz:
          cur != null
            ? { kind: "delta", from: cur, to: to!, min: 0, max: 100, unit: "%" }
            : undefined,
      });
    };

    if (frontDriven && s.frontSpinFrac >= thr) axleCard("front", s.frontSpinFrac, "frontDiffAccel");
    if (rearDriven && s.rearSpinFrac >= thr) axleCard("rear", s.rearSpinFrac, "rearDiffAccel");

    // AWD center balance when one axle spins notably more than the other.
    // Gated on the RELATIVE imbalance only — on loose surfaces both axles can
    // sit below the absolute wheelspin threshold while one still works much
    // harder than the other, and that's exactly what the center diff fixes.
    if (dt === 2) {
      const diff = s.frontSpinFrac - s.rearSpinFrac;
      if (Math.abs(diff) >= 0.08) {
        const toRear = diff > 0; // front spins more -> push torque rearward
        const cur = tune.centerBalance;
        const to = cur != null ? r0(clamp(cur + (toRear ? 5 : -5), 0, 100)) : null;
        out.push({
          id: "diff-center",
          area: "Differential — center balance",
          confidence: "medium",
          kind: "fix",
          field: "centerBalance",
          apply: to != null ? { centerBalance: to } : undefined,
          recommendation:
            cur != null
              ? `Center balance ${r0(cur)}% rear → ~${to}% rear`
              : `Shift center balance ~5% ${toRear ? "rearward" : "frontward"}`,
          why: `The ${toRear ? "front" : "rear"} axle spins more (${pct(s.frontSpinFrac)} F vs ${pct(s.rearSpinFrac)} R) — send torque toward the axle that still has grip.`,
          outcome: `More balanced drive out of corners. Trade-off: too far ${toRear ? "rearward makes it looser on power" : "frontward makes it push on power"}.`,
          viz: { kind: "dir", dir: toRear ? "more" : "less", label: "rear torque" },
        });
      }
    }
  }

  // ---- Springs / ride height: bottoming out --------------------------------
  if (p.rules.bottoming) {
    for (const end of ["front", "rear"] as const) {
      if (s.bottoming[end] >= p.thr.bottoming) {
        const rhKey = end === "front" ? "frontRideHeight" : "rearRideHeight";
        const action = p.preferHigherRide
          ? `Stiffen ${end} springs (keep the height for the terrain)`
          : `Raise ${end} ride height, or stiffen ${end} springs ~10%`;
        const rhTarget =
          tune[rhKey] != null && !p.preferHigherRide ? r1(tune[rhKey]! + rideStep(u)) : null;
        const rec =
          rhTarget != null
            ? `${end[0].toUpperCase() + end.slice(1)} ride height ${r1(tune[rhKey]!)} → ~${rhTarget} ${lengthShort(u)}`
            : action;
        out.push({
          id: `bottoming-${end}`,
          area: "Springs / Ride height",
          confidence: "high",
          kind: "fix",
          // the lever the card actually recommends: springs when terrain wants
          // the height kept, ride height otherwise
          field: p.preferHigherRide ? (end === "front" ? "frontSprings" : "rearSprings") : rhKey,
          apply: rhTarget != null ? ap(rhKey, rhTarget) : undefined,
          recommendation: rec,
          why: `The ${end} suspension is fully compressed ${pct(s.bottoming[end])} of the time — it's hitting the bump stops, which causes sudden grip loss over bumps and kerbs.`,
          outcome: p.preferHigherRide
            ? "Soaks up the hits without bottoming. Trade-off: a stiffer end has slightly less mechanical grip."
            : "Stops the harsh bottoming. Trade-off: raising height lifts the CoG a touch (minor at this scale).",
        });
        break;
      }
    }
  }

  // ---- Springs: brake dive & power squat (pitch control) -------------------
  // Deep (not bottomed) travel under longitudinal load = soft for the build.
  // Off-road setups WANT deep travel, so these run on tarmac modes only.
  if (p.rules.bottoming && !p.preferHigherRide && p.id !== "drift") {
    if (s.hardBrakeFrames >= MIN.hardBrake && s.diveFrac >= 0.4 && s.bottoming.front < p.thr.bottoming) {
      const cur = tune.frontSprings;
      const to = cur != null ? r1(cur * 1.1) : null;
      out.push({
        id: "springs-dive",
        area: "Front springs — brake dive",
        confidence: "medium",
        kind: "fix",
        field: "frontSprings",
        apply: to != null ? { frontSprings: to } : undefined,
        recommendation:
          cur != null
            ? `Front springs ${r1(cur)} → ~${to} ${u.springs} (+10%)`
            : "Stiffen front springs ~10% (or add a little front bump damping)",
        why: `Under hard braking the front sits at ≥85% of its travel in ${pct(s.diveFrac)} of frames — the nose dives deep, which wanders the brake balance and delays turn-in.`,
        outcome:
          "A steadier platform into corners and more consistent braking. Trade-off: slightly less compliance over bumps.",
      });
    }
    if (s.hardPowerFrames >= MIN.hardPower && s.squatFrac >= 0.4 && s.bottoming.rear < p.thr.bottoming) {
      const cur = tune.rearSprings;
      const to = cur != null ? r1(cur * 1.1) : null;
      out.push({
        id: "springs-squat",
        area: "Rear springs — power squat",
        confidence: "medium",
        kind: "fix",
        field: "rearSprings",
        apply: to != null ? { rearSprings: to } : undefined,
        recommendation:
          cur != null
            ? `Rear springs ${r1(cur)} → ~${to} ${u.springs} (+10%)`
            : "Stiffen rear springs ~10%",
        why: `On hard throttle the rear sits at ≥85% of its travel in ${pct(s.squatFrac)} of frames — heavy squat lightens the nose, which costs steering on corner exit.`,
        outcome:
          "Less squat, more front grip on exit. Trade-off: a touch less rear traction off the line — some squat is useful for launch.",
      });
    }
  }

  // ---- Suspension topping out: wheels hang at full extension ---------------
  // Hitting full extension also flips the travel direction, inflating the
  // oscillation rate below — so an axle with a top-out card skips the
  // (contradictory, lower-confidence) "raise rebound" oscillation card.
  const toppedOut = { front: false, rear: false };
  if (p.rules.topping) {
    for (const end of ["front", "rear"] as const) {
      if (s.topping[end] >= p.thr.topping) {
        toppedOut[end] = true;
        const key = end === "front" ? "frontRebound" : "rearRebound";
        const cur = tune[key];
        const to = cur != null ? Math.max(1, r1(cur - 2)) : null;
        out.push({
          id: `damping-topout-${end}`,
          area: `${cap(end)} suspension — tops out`,
          confidence: "medium",
          kind: "fix",
          field: key,
          apply: to != null ? ap(key, to) : undefined,
          recommendation:
            cur != null
              ? `${cap(end)} rebound ${cur} → ${to} (softer), or soften ${end} springs`
              : `Soften ${end} rebound a step or two (or soften ${end} springs)`,
          why: `The ${end} suspension sits at FULL extension ${pct(s.topping[end])} of the time — the wheels hang in the air instead of following the road, so they carry no grip in that moment.`,
          outcome:
            "The tires stay planted over crests and unloading corners. Trade-off: too soft rebound lets the body float.",
        });
        break;
      }
    }
  }

  // ---- Mid-corner balance: under / oversteer (cleanest balance signal) ------
  if (p.rules.balance && s.midFrames >= MIN.mid) {
    if (s.midUndersteer >= p.thr.understeerHigh) {
      const step = clamp(r0((s.midUndersteer - 1) * 14), 3, 22);
      const to = tune.frontARB != null ? r0(clamp(tune.frontARB - step, 1, 65)) : null;
      out.push({
        id: "balance-understeer",
        area: "Mid-corner balance",
        confidence: "medium",
        kind: "fix",
        field: "frontARB",
        apply: to != null ? { frontARB: to } : undefined,
        recommendation:
          tune.frontARB != null
            ? `Front ARB ${r0(tune.frontARB)} → ~${to} (−${step})`
            : `Soften front ARB by ~${step} (or stiffen rear)`,
        why: `Mid-corner your front slip angle is ≈ ${r1(s.midUndersteer)}× the rear — the front gives up first, so the car pushes wide.`,
        outcome:
          "Sharper turn-in and more front grip mid-corner. Trade-off: overdo it and it swings to oversteer.",
        viz: { kind: "balance", ratio: s.midUndersteer },
      });
    } else if (s.midUndersteer > 0 && s.midUndersteer <= p.thr.oversteerLow) {
      const ratio = 1 / s.midUndersteer;
      const step = clamp(r0((ratio - 1) * 14), 3, 22);
      const to = tune.frontARB != null ? r0(clamp(tune.frontARB + step, 1, 65)) : null;
      out.push({
        id: "balance-oversteer",
        area: "Mid-corner balance",
        confidence: "medium",
        kind: "fix",
        field: "frontARB",
        apply: to != null ? { frontARB: to } : undefined,
        recommendation:
          tune.frontARB != null
            ? `Front ARB ${r0(tune.frontARB)} → ~${to} (+${step})`
            : `Stiffen front ARB by ~${step} (or soften rear)`,
        why: `Mid-corner your rear slip angle is ≈ ${r1(ratio)}× the front — the rear lets go first, making the car loose.`,
        outcome:
          "More stable rear, easier to get on power. Trade-off: too much and it turns into understeer.",
        viz: { kind: "balance", ratio: s.midUndersteer },
      });
    }
  }

  // ---- Corner-phase balance: entry (braking) & exit (on power) -------------
  // `> 0` mirrors the mid-corner gate; Math.max guards the 1/x display ratio.
  if (p.rules.balance && s.entryFrames >= MIN.phase) {
    const rearDriven = s.car.drivetrain !== 0;
    const frontDriven = s.car.drivetrain !== 1;
    if (s.entryUndersteer > 0 && s.entryUndersteer <= p.thr.oversteerLow) {
      // Loose on entry. For a driven rear axle, MORE decel lock couples the
      // rear wheels under engine braking and steadies it (same lever as the
      // lift-off card — raising, never softening).
      const cur = rearDriven ? tune.rearDiffDecel : undefined;
      const to = rearDriven && cur != null ? r0(clamp(cur + 12, 0, 100)) : null;
      out.push({
        id: rearDriven ? "diff-entry-oversteer" : "balance-entry-oversteer",
        area: "Entry — loose under braking",
        confidence: "medium",
        kind: "fix",
        field: rearDriven ? "rearDiffDecel" : undefined,
        apply: to != null ? { rearDiffDecel: to } : undefined,
        recommendation: rearDriven
          ? cur != null
            ? `Rear diff deceleration ${r0(cur)}% → ~${to}%`
            : "Raise rear diff deceleration ~10–15% (or add rear toe-in / move brake balance forward)"
          : "Add a little rear toe-in, or move brake balance forward.",
        why: `Under braking & turn-in the rear slips ≈ ${r1(1 / Math.max(s.entryUndersteer, 0.01))}× the front — the back steps out on entry.`,
        outcome: "Calmer, more confident turn-in. Trade-off: a touch less rotation into the corner.",
        viz:
          to != null && cur != null
            ? { kind: "delta", from: cur, to, min: 0, max: 100, unit: "%" }
            : { kind: "balance", ratio: s.entryUndersteer },
      });
    } else if (frontDriven && s.entryUndersteer >= p.thr.understeerHigh) {
      // Pushes on entry with a driven front axle: a locked front under engine
      // braking resists turning — free the front decel so it rotates in.
      const cur = tune.frontDiffDecel;
      const to = cur != null ? r0(clamp(cur - 10, 0, 100)) : null;
      out.push({
        id: "diff-front-decel",
        area: "Entry — pushes under braking",
        confidence: "medium",
        kind: "fix",
        field: "frontDiffDecel",
        apply: to != null ? { frontDiffDecel: to } : undefined,
        recommendation:
          cur != null
            ? `Front diff deceleration ${r0(cur)}% → ~${to}%`
            : "Lower front diff deceleration ~10%",
        why: `Trail-braking into corners the front slips ≈ ${r1(s.entryUndersteer)}× the rear — a locked front axle under engine braking resists turning in.`,
        outcome:
          "Sharper turn-in while braking. Trade-off: a touch less front-end stability on straight-line lifts.",
        viz:
          cur != null && to != null
            ? { kind: "delta", from: cur, to, min: 0, max: 100, unit: "%" }
            : { kind: "balance", ratio: s.entryUndersteer },
      });
    }
  }
  if (p.rules.balance && s.exitFrames >= MIN.phase) {
    if (s.exitUndersteer > 0 && s.exitUndersteer <= p.thr.oversteerLow) {
      const cur = tune.rearDiffAccel;
      const to = cur != null ? r0(clamp(cur - 8, 0, 100)) : null;
      out.push({
        id: "diff-exit-oversteer",
        area: "Exit — power oversteer",
        confidence: "medium",
        kind: "fix",
        field: "rearDiffAccel",
        apply: to != null ? { rearDiffAccel: to } : undefined,
        recommendation:
          cur != null
            ? `Rear diff acceleration ${r0(cur)}% → ~${to}%`
            : "Soften diff acceleration (or soften rear springs)",
        why: `On corner exit (on power) the rear slips ≈ ${r1(1 / Math.max(s.exitUndersteer, 0.01))}× the front — it gets loose as you pick up the throttle.`,
        outcome: "Cleaner power-down on exit. Trade-off: a touch less rotation on throttle.",
        viz:
          cur != null && to != null
            ? { kind: "delta", from: cur, to, min: 0, max: 100, unit: "%" }
            : { kind: "balance", ratio: s.exitUndersteer },
      });
    } else if (s.exitUndersteer >= p.thr.understeerHigh) {
      out.push({
        id: "balance-exit-understeer",
        area: "Exit — pushes on power",
        confidence: "medium",
        kind: "fix",
        recommendation: "Soften front ARB/springs, or (AWD) shift center balance rearward.",
        why: `On corner exit the front slips ≈ ${r1(s.exitUndersteer)}× the rear — it washes wide when you get on the power.`,
        outcome: "More front bite on exit. Trade-off: can make entry/mid a bit looser.",
        viz: { kind: "balance", ratio: s.exitUndersteer },
      });
    }
  }

  // ---- Lift-off oversteer: throttle lifts mid-corner -> decel diff ---------
  if (p.rules.balance && s.liftEvents >= MIN.lifts && s.liftOversteerFrac >= 0.3) {
    const rearDriven = s.car.drivetrain !== 0; // RWD or AWD
    const cur = tune.rearDiffDecel;
    const to = rearDriven && cur != null ? r0(clamp(cur + 12, 0, 100)) : null;
    out.push({
      id: "diff-liftoff",
      area: "Lift-off oversteer",
      confidence: "medium",
      kind: "fix",
      field: rearDriven ? "rearDiffDecel" : undefined,
      apply: to != null ? { rearDiffDecel: to } : undefined,
      recommendation: rearDriven
        ? cur != null
          ? `Rear diff deceleration ${r0(cur)}% → ~${to}%`
          : "Raise rear diff deceleration ~10–15% (or soften rear rebound)"
        : "Soften the rear ARB a touch, or add a little rear toe-in",
      why: `In ${pct(s.liftOversteerFrac)} of your ${s.liftEvents} mid-corner throttle lifts, the rear stepped out right after the lift — classic lift-off oversteer.`,
      outcome:
        "The car stays settled when you breathe off the throttle mid-corner. Trade-off: more decel lock adds a touch of entry understeer.",
      viz: { kind: "dir", dir: "more", label: rearDriven ? "decel lock" : "rear stability" },
    });
  }

  // ---- Aero: downforce level + front/rear balance --------------------------
  if (p.rules.aero && s.highSpeedCornerFrames >= MIN.hsCorner) {
    // the session's high-speed split is 30 m/s — phrase it in the user's units
    const fastSpd = u.system === "imperial" ? ">67 mph" : ">108 km/h";
    if (s.highSpeedNearLimitFrac >= 0.5) {
      let balance = "";
      if (s.highSpeedUndersteerRatio >= p.thr.understeerHigh) balance = " — bias it forward (more front aero)";
      else if (s.highSpeedUndersteerRatio <= p.thr.oversteerLow) balance = " — bias it rearward (more rear aero)";
      out.push({
        id: "aero-add",
        area: "Aero",
        confidence: "medium",
        kind: "fix",
        recommendation: `Add downforce at both ends${balance}.`,
        why: `You're at the grip limit in ${pct(s.highSpeedNearLimitFrac)} of fast corners (${fastSpd}), peaking around ${r1(s.maxLatG)}g${balance ? "; and the balance is off at speed" : ""}.`,
        outcome:
          "More high-speed grip and stability through fast corners. Trade-off: more drag, so a little less top speed.",
        viz: { kind: "dir", dir: "more", label: "downforce" },
      });
    } else if (s.highSpeedNearLimitFrac < 0.25) {
      // Grip headroom at speed = unused downforce you can trade for top speed.
      out.push({
        id: "aero-reduce",
        area: "Aero",
        confidence: "low",
        kind: "opportunity",
        recommendation: "Trade some downforce for top speed — you've got grip to spare in fast corners.",
        why: `You only reach the grip limit in ${pct(s.highSpeedNearLimitFrac)} of fast corners (peak ${r1(s.maxLatG)}g) — that's aero grip you're not using, and the wing is costing you drag.`,
        outcome:
          "Higher top speed and better straight-line lap time. Trade-off: less margin in fast corners — back it off gradually and re-check.",
        viz: { kind: "dir", dir: "less", label: "downforce" },
      });
    }

    // Mechanical vs aero: balance that's fine slow but off fast = an aero-balance issue.
    if (s.lowSpeedCornerFrames >= MIN.lowSpeed && s.highSpeedCornerFrames >= MIN.hsCorner) {
      const hi = s.highSpeedUndersteerRatio;
      const lo = s.lowSpeedUndersteer;
      if (hi >= 1.2 && hi >= lo * 1.3) {
        out.push({
          id: "aero-balance-front",
          area: "Aero balance",
          confidence: "medium",
          kind: "fix",
          recommendation: "Add front downforce (or reduce rear) — push is aero, not mechanical.",
          why: `The car is balanced in slow corners but understeers at speed (slow ${r1(lo)}× vs fast ${r1(hi)}× front/rear) — that's a front-aero shortfall, not a spring/ARB problem.`,
          outcome: "More high-speed front bite without upsetting slow corners. Trade-off: a little more front drag.",
          viz: { kind: "dir", dir: "more", label: "front downforce" },
        });
      } else if (hi <= 0.8 && lo >= hi * 1.3) {
        out.push({
          id: "aero-balance-rear",
          area: "Aero balance",
          confidence: "medium",
          kind: "fix",
          recommendation: "Add rear downforce (or reduce front) — looseness is aero, not mechanical.",
          why: `The car is balanced in slow corners but goes loose at speed (slow ${r1(lo)}× vs fast ${r1(hi)}× front/rear) — that's a rear-aero shortfall, not a spring/ARB problem.`,
          outcome: "More high-speed rear stability without upsetting slow corners. Trade-off: a little more rear drag.",
          viz: { kind: "dir", dir: "more", label: "rear downforce" },
        });
      }
    }
  }

  // ---- Damping: oscillation -> rebound (low confidence, capped) ------------
  if (p.rules.damping && s.drivingFrames >= MIN.damping) {
    const DAMP_MAX = 20;
    const dampCard = (axle: "front" | "rear", rate: number, key: "frontRebound" | "rearRebound") => {
      if (toppedOut[axle]) return; // top-out explains the reversals AND wants softer rebound
      if (rate < 3.5) return; // higher bar so it doesn't fire on normal bumps
      const cur = tune[key];
      if (cur != null && cur >= DAMP_MAX - 0.5) {
        // already maxed — damping isn't the lever; springs are
        out.push({
          id: `damping-${axle}`,
          area: `${cap(axle)} damping`,
          confidence: "low",
          kind: "fix",
          field: key,
          recommendation: `${cap(axle)} rebound is already maxed (${cur}) — if it still bounces, stiffen ${axle} springs instead`,
          why: `The ${axle} still oscillates ~${rate.toFixed(1)}×/s with rebound at max, so adding damping won't help — the ${axle} springs are likely too soft. (Low confidence; rough surfaces inflate this.)`,
          outcome: "Stiffer springs settle the platform without maxing damping. Trade-off: slightly less mechanical grip.",
        });
        return;
      }
      const to = cur != null ? Math.min(DAMP_MAX, r1(cur + 2)) : null;
      out.push({
        id: `damping-${axle}`,
        area: `${cap(axle)} damping`,
        confidence: "low",
        kind: "fix",
        field: key,
        apply: to != null ? ap(key, to) : undefined,
        recommendation:
          cur != null
            ? `${cap(axle)} rebound ${cur} → ${to}`
            : `Raise ${axle} rebound a little (and a touch of bump)`,
        why: `The ${axle} suspension changes direction ~${rate.toFixed(1)}×/s — a sign it may be under-damped (bouncing rather than settling). Rough surfaces inflate this, so it's low-confidence.`,
        outcome:
          "Settles the platform faster for steadier grip. Trade-off: too much damping feels harsh and skips over bumps.",
        viz:
          cur != null
            ? { kind: "delta", from: cur, to: to!, min: 1, max: DAMP_MAX, unit: "" }
            : undefined,
      });
    };
    dampCard("front", s.frontReversalRate, "frontRebound");
    dampCard("rear", s.rearReversalRate, "rearRebound");
  }

  // ---- Alignment: camber from body roll (medium); toe/caster tip (low) -----
  if (p.rules.alignment && s.hardCornerFrames >= MIN.hardCorner) {
    const camberCard = (
      axle: "front" | "rear",
      rollDeg: number,
      key: "frontCamber" | "rearCamber",
    ) => {
      if (rollDeg < 0.6) return; // negligible roll — camber barely matters
      const target = -clamp(Math.round(rollDeg * 0.75 * 10) / 10, 0.3, 4.0);
      const cur = tune[key];
      out.push({
        id: `camber-${axle}`,
        area: `${cap(axle)} camber`,
        confidence: "medium",
        kind: "fix",
        field: key,
        apply: ap(key, target), // target exists even with no entered value
        recommendation:
          cur != null
            ? `${cap(axle)} camber ${cur}° → ~${target.toFixed(1)}°`
            : `Run about ${target.toFixed(1)}° ${axle} camber`,
        why: `Body roll at the ${axle} is ≈ ${rollDeg.toFixed(1)}° under cornering load — set static camber so the loaded (outside) tire sits flat at full lean.`,
        outcome:
          "More grip from the outside tire mid-corner. Trade-off: too much hurts straight-line braking/traction. A starting point — refine as you iterate.",
        viz: { kind: "delta", from: cur ?? null, to: target, min: -5, max: 0, unit: "°" },
      });
    };
    camberCard("front", s.frontRollDeg, "frontCamber");
    camberCard("rear", s.rearRollDeg, "rearCamber");
  }

  // ---- Alignment: toe scrub measured on the straights -----------------------
  // Static toe shows up as a constant per-axle slip angle while running dead
  // straight — wasted drag and heat. Low confidence: road crown and surface
  // noise inflate it, and the sign (in vs out) isn't observable.
  if (p.rules.alignment && s.straightFrames >= MIN.straight) {
    const toeCard = (axle: "front" | "rear", scrubDeg: number, key: "frontToe" | "rearToe") => {
      if (scrubDeg < 0.7) return;
      const cur = tune[key];
      // sheet says ~zero toe — then the scrub is road crown/noise, not toe
      if (cur != null && Math.abs(cur) < 0.2) return;
      const to = cur != null ? r1(cur > 0 ? Math.min(cur, 0.1) : Math.max(cur, -0.1)) : null;
      out.push({
        id: `toe-${axle}`,
        area: `${cap(axle)} toe`,
        confidence: "low",
        kind: "fix",
        field: key,
        apply: to != null ? ap(key, to) : undefined,
        recommendation:
          to != null
            ? `${cap(axle)} toe ${r1(cur!)}° → ~${to}° (toward zero)`
            : `Reduce ${axle} toe toward 0°`,
        why: `Running dead straight the ${axle} tires still hold ≈ ${scrubDeg.toFixed(1)}° of slip angle — that's toe scrub: constant drag and heat with no cornering benefit at this magnitude.`,
        outcome:
          axle === "rear"
            ? "Less drag and cooler rears. Trade-off: rear toe-in adds stability — keep ~0.1–0.2° if the car gets nervous."
            : "Less drag, cooler fronts, better top speed. Trade-off: a little front toe-out aids turn-in — don't chase exactly zero if turn-in suffers.",
      });
    };
    toeCard("front", s.frontScrubDeg, "frontToe");
    toeCard("rear", s.rearScrubDeg, "rearToe");
  }

  // ---- Drift: maximize controllable oversteer ------------------------------
  if (p.rules.drift && s.corneringFrames >= MIN.cornering) {
    if (s.understeerRatio >= p.thr.understeerHigh) {
      const to =
        tune.rearDiffAccel != null && tune.rearDiffAccel < 90
          ? r0(clamp(tune.rearDiffAccel + 15, 0, 100))
          : null;
      const rec =
        to != null
          ? `Rear diff acceleration ${r0(tune.rearDiffAccel!)}% → ~${to}%`
          : `Lock diff toward 90–100%; stiffen front ARB / soften rear`;
      out.push({
        id: "drift-rotation-low",
        area: "Drift — rotation",
        confidence: "medium",
        kind: "fix",
        field: to != null ? "rearDiffAccel" : undefined,
        apply: to != null ? { rearDiffAccel: to } : undefined,
        recommendation: rec,
        why: `Front slip angle is ≈ ${r1(s.understeerRatio)}× the rear — the car grips at the front instead of rotating, so it won't hold a slide.`,
        outcome:
          "The rear breaks away more willingly and holds angle. Trade-off: too much and it gets snappy to catch.",
      });
    } else {
      out.push({
        id: "drift-rotation-ok",
        area: "Drift — rotation",
        confidence: "low",
        kind: "opportunity",
        recommendation: "Keep the diff locked and stay in the power band through the slide.",
        why: `Good rotation — rear slip angle ≈ ${r1(1 / Math.max(s.understeerRatio, 0.01))}× the front (avg ${r2(s.avgRearSlipAngle)} rad). The car is rotating the way you want.`,
        outcome:
          "Smoother, more sustained angle. Use the shift points above so you don't bog mid-drift.",
      });
    }
  }

  // ---- Tire temperature window (proxy, no pressure data) -------------------
  // Skipped for an axle whose sheet pressure is already outside the window:
  // that card subsumes this one (and over-inflation overheats tires too, so
  // "raise pressure" would be the wrong call there).
  if (p.rules.tireTemp) {
    const hot = (["fl", "fr", "rl", "rr"] as const).filter((k) => s.tireTempAvg[k] >= p.thr.hotTire);
    if (hot.length > 0 && !pressureFlagged[hot.some((k) => k.startsWith("f")) ? "front" : "rear"]) {
      const frontHot = hot.some((k) => k.startsWith("f"));
      const pKey = frontHot ? "frontPressure" : "rearPressure";
      const pUnit = pressureUnit(u);
      // A hot tire flexes too much for its load — RAISING pressure reduces the
      // flex (and the heat it generates). Lowering it would run even hotter.
      const to = tune[pKey] != null ? r1(tune[pKey]! + pressureStep(u)) : null;
      const rec =
        to != null
          ? `${frontHot ? "Front" : "Rear"} pressure ${r1(tune[pKey]!)} → try ~${to} ${pUnit}`
          : `Ease the load on ${hot.map((k) => k.toUpperCase()).join(", ")} (a touch more pressure, softer that end, or smoother inputs)`;
      out.push({
        id: "tire-hot",
        area: "Tires (temperature)",
        confidence: "low",
        kind: "fix",
        field: frontHot ? "frontPressure" : "rearPressure",
        apply: to != null ? ap(pKey, to) : undefined,
        recommendation: rec,
        why: `${hot.map((k) => { const tc = tempC(s.tireTempAvg[k], u); return `${k.toUpperCase()} avg ${r0(tc.v)}${tc.unit}`; }).join(", ")} — those tires run hottest, so they're working hardest. More pressure means less carcass flex, which is where the heat comes from.`,
        outcome:
          "Cooler, more consistent tires. Trade-off: a slightly smaller contact patch — and the feed can't read pressure, so this is a hint, not a measured value.",
      });
    }
  }

  return finish();
}
