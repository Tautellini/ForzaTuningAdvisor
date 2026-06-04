import type { SessionSummary } from "../session";
import type { CurrentTune } from "../tune";
import type { DisciplineProfile } from "../discipline";
import type { PriorityId } from "../priorities";
import { lengthShort, pressureStep, pressureUnit, rideStep, tempC, type Units } from "../units";

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
  | "diff"
  | "general";

function groupForId(id: string): AdviceGroup {
  if (id.startsWith("gearing")) return "gearing";
  if (id.startsWith("camber") || id.startsWith("align") || id.startsWith("toe") || id.startsWith("caster"))
    return "alignment";
  if (id === "drag-aero" || id.startsWith("aero")) return "aero";
  if (id.startsWith("brake")) return "brakes";
  if (id.startsWith("diff") || id.startsWith("drift") || id === "drag-launch") return "diff";
  if (id.startsWith("damping")) return "damping";
  if (id.startsWith("bottoming") || id.startsWith("unload")) return "springs";
  if (id.startsWith("balance")) return "arb";
  if (id.startsWith("tire")) return "tires";
  return "general";
}

export type AdviceViz =
  | { kind: "balance"; ratio: number } // front/rear slip ratio; 1 = neutral
  | { kind: "bar"; value: number; tone: "spin" | "lock" | "warn" | "good" } // 0..1
  | { kind: "delta"; from: number | null; to: number; min: number; max: number; unit?: string }
  | { kind: "dir"; dir: "more" | "less"; label: string }
  | { kind: "gears"; unit: string; redline: number; gears: { g: number; speed: number; shift?: number }[] };

export interface Advice {
  id: string;
  area: string;
  confidence: Confidence;
  kind: AdviceKind;
  group?: AdviceGroup; // assigned from id at return time
  field?: keyof CurrentTune; // the specific lever this targets (for ambiguous ids)
  recommendation: string; // the action (includes concrete numbers when available)
  why: string; // evidence from the session data
  outcome: string; // expected result + trade-off
  viz?: AdviceViz;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const MIN = { frames: 120, gearPair: 2, braking: 20, cornering: 40, power: 30, curve: 4, hsCorner: 40 };

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
  priorities: PriorityId[],
  u: Units,
): Advice[] {
  if (!s || s.drivingFrames < MIN.frames) return [];
  const out: Advice[] = [];
  const rankOf = (id: PriorityId) => {
    const i = priorities.indexOf(id);
    return i < 0 ? 99 : i;
  };
  const topIs = (id: PriorityId, within = 2) => rankOf(id) < within;

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
      area: "Gearing — shift points",
      confidence: "high",
      kind: "fix",
      recommendation: allAtRedline
        ? `Pull every gear to the rev limiter (~${r0(gearing.redline)} rpm) before shifting`
        : `Upshift at — ${gearing.shifts.map((x) => `${x.from}→${x.to} ${x.rpm} rpm`).join("   ·   ")}`,
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
    s.gears[topGear].wot > 30 &&
    s.gears[topGear].limiterFrac >= 0.15
  ) {
    const lengthen = clamp(s.gears[topGear].limiterFrac, 0.05, 0.12);
    const rec =
      tune.finalDrive != null
        ? `Final drive ${r2(tune.finalDrive)} → ~${r2(tune.finalDrive * (1 - lengthen))}`
        : `Lengthen top gear / final drive by ~${pct(lengthen)}`;
    out.push({
      id: "gearing-limiter-top",
      area: "Gearing — top end",
      confidence: "high",
      kind: "fix",
      recommendation: rec,
      why: `You sit on the rev limiter ${pct(s.gears[topGear].limiterFrac)} of full-throttle time in gear ${topGear} (topped out at ${r0(s.gears[topGear].maxSpeedKmh)} km/h) — the gearing runs out before the straight does.`,
      outcome:
        "Higher top speed where straights are long. Trade-off: slightly slower final-gear acceleration. Net gain on power tracks, marginal on twisty ones.",
    });
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
      const rec =
        cur != null
          ? `${axle[0].toUpperCase() + axle.slice(1)} diff acceleration ${r0(cur)}% → ~${r0(clamp(cur - drop, 0, 100))}%`
          : `Lower ${axle} diff acceleration by ~${drop}%`;
      out.push({
        id: "drag-launch",
        area: "Launch traction",
        confidence: "high",
        kind: "fix",
        field: key,
        recommendation: `${rec}; drop tire pressure slightly for a bigger contact patch`,
        why: `The ${axle} wheels spin in ${pct(frac)} of on-power frames — that's wasted grip off the line.`,
        outcome:
          "Quicker launch and lower ET. Trade-off: go too soft and it bogs instead of spinning — dial to the edge of traction.",
        viz: { kind: "bar", value: frac, tone: "spin" },
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
        const to = cur != null ? clamp(cur + (front ? -shift : shift), 0, 100) : null;
        out.push({
          id: front ? "brake-front-lock" : "brake-rear-lock",
          area: "Brake balance",
          confidence: "high",
          kind: "fix",
          recommendation:
            cur != null
              ? `Brake balance ${r0(cur)}% → ~${r0(to!)}% front`
              : `Move brake balance ~${shift}% ${front ? "rearward" : "forward"}`,
          why: `${front ? "Front" : "Rear"} wheels lock more under braking (${pct(s.frontLockFrac)} F vs ${pct(s.rearLockFrac)} R) — bias the brakes toward the axle that isn't locking. Small step on purpose, to avoid overshooting back the other way.`,
          outcome: front
            ? "Keeps the fronts rolling so you can still steer while braking. Trade-off: too far and the rears begin to lock."
            : "Steadier rear under braking. Trade-off: too far forward and the fronts begin to lock.",
          viz:
            cur != null
              ? { kind: "delta", from: cur, to: to!, min: 0, max: 100, unit: "% front" }
              : { kind: "bar", value: front ? s.frontLockFrac : s.rearLockFrac, tone: "lock" },
        });
      } else {
        // both axles lock about equally — that's overall pressure, not balance
        const cur = tune.brakePressure;
        const to = cur != null ? clamp(cur - 8, 0, 100) : null;
        out.push({
          id: "brake-pressure",
          area: "Brake pressure",
          confidence: "medium",
          kind: "fix",
          field: "brakePressure",
          recommendation:
            cur != null ? `Brake pressure ${r0(cur)}% → ~${r0(to!)}%` : "Lower brake pressure ~8%",
          why: `Both axles lock about equally (${pct(s.frontLockFrac)} F / ${pct(s.rearLockFrac)} R) — that's too much overall braking force, not a front/rear balance issue. The balance is fine.`,
          outcome:
            "Less locking and better threshold-braking control. Trade-off: go too soft and stopping distances grow.",
          viz: { kind: "bar", value: lockMax, tone: "lock" },
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
      out.push({
        id: `diff-${axle}`,
        area: `Differential — ${axle}`,
        confidence: conf,
        kind: "fix",
        recommendation:
          cur != null
            ? `${axle[0].toUpperCase() + axle.slice(1)} diff acceleration ${r0(cur)}% → ~${r0(clamp(cur - drop, 0, 100))}%`
            : `Lower ${axle} diff acceleration by ~${drop}%`,
        why: `The ${axle} wheels spin in ${pct(frac)} of on-power frames — more than ideal for ${p.label.toLowerCase()}.`,
        outcome: `Cleaner ${axle} drive off corners. Trade-off: too low and the inside ${axle} wheel spins on power — find where it just hooks.`,
        viz:
          cur != null
            ? { kind: "delta", from: cur, to: clamp(cur - drop, 0, 100), min: 0, max: 100, unit: "%" }
            : { kind: "bar", value: frac, tone: "spin" },
      });
    };

    if (frontDriven && s.frontSpinFrac >= thr) axleCard("front", s.frontSpinFrac, "frontDiffAccel");
    if (rearDriven && s.rearSpinFrac >= thr) axleCard("rear", s.rearSpinFrac, "rearDiffAccel");

    // AWD center balance when one axle spins notably more than the other
    if (dt === 2 && (s.frontSpinFrac >= thr || s.rearSpinFrac >= thr)) {
      const diff = s.frontSpinFrac - s.rearSpinFrac;
      if (Math.abs(diff) >= 0.08) {
        const toRear = diff > 0; // front spins more -> push torque rearward
        const cur = tune.centerBalance;
        out.push({
          id: "diff-center",
          area: "Differential — center balance",
          confidence: "medium",
          kind: "fix",
          recommendation:
            cur != null
              ? `Center balance ${r0(cur)}% rear → ~${r0(clamp(cur + (toRear ? 5 : -5), 0, 100))}% rear`
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
        const rec =
          tune[rhKey] != null && !p.preferHigherRide
            ? `${end[0].toUpperCase() + end.slice(1)} ride height ${r1(tune[rhKey]!)} → ~${r1(tune[rhKey]! + rideStep(u))} ${lengthShort(u)}`
            : action;
        out.push({
          id: `bottoming-${end}`,
          area: "Springs / Ride height",
          confidence: "high",
          kind: "fix",
          recommendation: rec,
          why: `The ${end} suspension is fully compressed ${pct(s.bottoming[end])} of the time — it's hitting the bump stops, which causes sudden grip loss over bumps and kerbs.`,
          outcome: p.preferHigherRide
            ? "Soaks up the hits without bottoming. Trade-off: a stiffer end has slightly less mechanical grip."
            : "Stops the harsh bottoming. Trade-off: raising height lifts the CoG a touch (minor at this scale).",
          viz: { kind: "bar", value: s.bottoming[end], tone: "warn" },
        });
        break;
      }
    }
  }

  // ---- Handling balance: under / oversteer (adaptive to severity) ----------
  if (p.rules.balance && s.corneringFrames >= MIN.cornering) {
    if (s.understeerRatio >= p.thr.understeerHigh) {
      const step = clamp(r0((s.understeerRatio - 1) * 14), 3, 22);
      out.push({
        id: "balance-understeer",
        area: "Handling balance",
        confidence: "medium",
        kind: "fix",
        recommendation:
          tune.frontARB != null
            ? `Front ARB ${r0(tune.frontARB)} → ~${r0(clamp(tune.frontARB - step, 1, 65))} (−${step})`
            : `Soften front ARB by ~${step} (or stiffen rear)`,
        why: `In corners your front slip angle is ≈ ${r1(s.understeerRatio)}× the rear — the front gives up first, so the car pushes wide.`,
        outcome:
          "Sharper turn-in and more front grip mid-corner. Trade-off: overdo it and it swings to oversteer.",
        viz: { kind: "balance", ratio: s.understeerRatio },
      });
    } else if (s.understeerRatio > 0 && s.understeerRatio <= p.thr.oversteerLow) {
      const ratio = 1 / s.understeerRatio;
      const step = clamp(r0((ratio - 1) * 14), 3, 22);
      out.push({
        id: "balance-oversteer",
        area: "Handling balance",
        confidence: "medium",
        kind: "fix",
        recommendation:
          tune.frontARB != null
            ? `Front ARB ${r0(tune.frontARB)} → ~${r0(clamp(tune.frontARB + step, 1, 65))} (+${step})`
            : `Stiffen front ARB by ~${step} (or soften rear)`,
        why: `In corners your rear slip angle is ≈ ${r1(ratio)}× the front — the rear lets go first, making the car loose.`,
        outcome:
          "More stable rear, easier to get on power. Trade-off: too much and it turns into understeer.",
        viz: { kind: "balance", ratio: s.understeerRatio },
      });
    }
  }

  // ---- Aero: downforce level + front/rear balance --------------------------
  if (p.rules.aero && s.highSpeedCornerFrames >= MIN.hsCorner) {
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
        why: `You're at the grip limit in ${pct(s.highSpeedNearLimitFrac)} of fast corners (>108 km/h), peaking around ${r1(s.maxLatG)}g${balance ? "; and the balance is off at speed" : ""}.`,
        outcome:
          "More high-speed grip and stability through fast corners. Trade-off: more drag, so a little less top speed.",
        viz: { kind: "dir", dir: "more", label: "downforce" },
      });
    } else if (s.highSpeedNearLimitFrac < 0.2 && topIs("topSpeed")) {
      out.push({
        id: "aero-reduce",
        area: "Aero",
        confidence: "low",
        kind: "opportunity",
        recommendation: "Reduce downforce (less wing) toward your top-speed priority.",
        why: `You only reach the grip limit in ${pct(s.highSpeedNearLimitFrac)} of fast corners — there's aero grip you're not using, and wing is costing you drag.`,
        outcome:
          "Higher top speed and better straight-line lap time. Trade-off: less margin in fast corners — back it off gradually.",
        viz: { kind: "dir", dir: "less", label: "downforce" },
      });
    }
  }

  // ---- Damping: oscillation -> rebound (low confidence, capped) ------------
  if (p.rules.damping && s.drivingFrames >= 400) {
    const DAMP_MAX = 20;
    const dampCard = (axle: "front" | "rear", rate: number, key: "frontRebound" | "rearRebound") => {
      if (rate < 3.5) return; // higher bar so it doesn't fire on normal bumps
      const cur = tune[key];
      if (cur != null && cur >= DAMP_MAX - 0.5) {
        // already maxed — damping isn't the lever; springs are
        out.push({
          id: `damping-${axle}`,
          area: `${cap(axle)} damping`,
          confidence: "low",
          kind: "fix",
          recommendation: `${cap(axle)} rebound is already maxed (${cur}) — if it still bounces, stiffen ${axle} springs instead`,
          why: `The ${axle} still oscillates ~${rate.toFixed(1)}×/s with rebound at max, so adding damping won't help — the ${axle} springs are likely too soft. (Low confidence; rough surfaces inflate this.)`,
          outcome: "Stiffer springs settle the platform without maxing damping. Trade-off: slightly less mechanical grip.",
          viz: { kind: "bar", value: clamp(rate / 6, 0, 1), tone: "warn" },
        });
        return;
      }
      const to = cur != null ? Math.min(DAMP_MAX, cur + 2) : null;
      out.push({
        id: `damping-${axle}`,
        area: `${cap(axle)} damping`,
        confidence: "low",
        kind: "fix",
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
            : { kind: "bar", value: clamp(rate / 6, 0, 1), tone: "warn" },
      });
    };
    dampCard("front", s.frontReversalRate, "frontRebound");
    dampCard("rear", s.rearReversalRate, "rearRebound");
  }

  // ---- Alignment: camber from body roll (medium); toe/caster tip (low) -----
  if (p.rules.alignment && s.hardCornerFrames >= 30) {
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

  // ---- Drift: maximize controllable oversteer ------------------------------
  if (p.rules.drift && s.corneringFrames >= MIN.cornering) {
    if (s.understeerRatio >= p.thr.understeerHigh) {
      const rec =
        tune.rearDiffAccel != null && tune.rearDiffAccel < 90
          ? `Rear diff acceleration ${r0(tune.rearDiffAccel)}% → ~${r0(clamp(tune.rearDiffAccel + 15, 0, 100))}%`
          : `Lock diff toward 90–100%; stiffen front ARB / soften rear`;
      out.push({
        id: "drift-rotation-low",
        area: "Drift — rotation",
        confidence: "medium",
        kind: "fix",
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

  // ---- Opportunity: grip headroom, steered by your top priority -------------
  if (p.rules.opportunity && s.corneringFrames >= 60 && s.nearLimitFrac < 0.25) {
    const top = priorities[0];
    let rec = "";
    let outcome = "";
    if (top === "topSpeed") {
      rec = "Trade some grip for speed — reduce downforce and/or take taller gears.";
      outcome = "More straight-line speed. Trade-off: you'll run closer to the limit in corners.";
    } else if (top === "lapTime" || top === "agility") {
      rec = "There's lap time on the table — push harder into corners, or make the setup more aggressive (stiffer, less wing, freer diff).";
      outcome = "Faster entry and mid-corner. Trade-off: demands more precision from you.";
    } else if (top === "tireLife") {
      rec = "You're easy on the tires — good for long stints; no change needed for tire life.";
      outcome = "Consistent pace over a stint. (Informational.)";
    } else if (top === "fun") {
      rec = "Lots of grip in reserve — soften the rear or loosen the diff to make it more playful.";
      outcome = "More slidey and fun. Trade-off: slightly less outright grip.";
    } else {
      rec = "You're driving with margin — good for stability. You can safely push closer to the limit before changing the car.";
      outcome = "More consistency now; pace is there when you want it. (Informational.)";
    }
    out.push({
      id: "opportunity-headroom",
      area: "Opportunity — grip headroom",
      confidence: "low",
      kind: "opportunity",
      recommendation: rec,
      why: `You reach the grip limit in only ${pct(s.nearLimitFrac)} of corners (peak ${r1(s.maxLatG)}g) — the tires have more to give than you're using.`,
      outcome,
      viz: { kind: "bar", value: s.nearLimitFrac, tone: "good" },
    });
  }

  // ---- Tire temperature window (proxy, no pressure data) -------------------
  if (p.rules.tireTemp) {
    const hot = (["fl", "fr", "rl", "rr"] as const).filter((k) => s.tireTempAvg[k] >= p.thr.hotTire);
    if (hot.length > 0) {
      const frontHot = hot.some((k) => k.startsWith("f"));
      const pKey = frontHot ? "frontPressure" : "rearPressure";
      const pUnit = pressureUnit(u);
      const rec =
        tune[pKey] != null
          ? `${frontHot ? "Front" : "Rear"} pressure ${r1(tune[pKey]!)} → try ~${r1(tune[pKey]! - pressureStep(u))} ${pUnit}`
          : `Ease the load on ${hot.map((k) => k.toUpperCase()).join(", ")} (softer that end, or smoother inputs)`;
      out.push({
        id: "tire-hot",
        area: "Tires (temperature)",
        confidence: "low",
        kind: "fix",
        field: frontHot ? "frontPressure" : "rearPressure",
        recommendation: rec,
        why: `${hot.map((k) => { const tc = tempC(s.tireTempAvg[k], u); return `${k.toUpperCase()} avg ${r0(tc.v)}${tc.unit}`; }).join(", ")} — those tires run hottest, so they're working hardest.`,
        outcome:
          "Cooler, more consistent tires. Note: the feed can't read pressure, so this is a hint, not a measured value.",
        viz: {
          kind: "bar",
          value: clamp((Math.max(...hot.map((k) => s.tireTempAvg[k])) - 150) / 110, 0, 1),
          tone: "warn",
        },
      });
    }
  }

  return out.map((a) => ({ ...a, group: groupForId(a.id) }));
}

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
