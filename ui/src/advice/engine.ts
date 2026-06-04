import type { SessionSummary } from "../session";
import type { CurrentTune } from "../tune";
import type { DisciplineProfile } from "../discipline";
import type { PriorityId } from "../priorities";

export type Confidence = "high" | "medium" | "low";
export type AdviceKind = "fix" | "opportunity";

export type AdviceViz =
  | { kind: "balance"; ratio: number } // front/rear slip ratio; 1 = neutral
  | { kind: "bar"; value: number; tone: "spin" | "lock" | "warn" | "good" } // 0..1
  | { kind: "delta"; from: number | null; to: number; min: number; max: number; unit?: string }
  | { kind: "dir"; dir: "more" | "less"; label: string };

export interface Advice {
  id: string;
  area: string;
  confidence: Confidence;
  kind: AdviceKind;
  recommendation: string; // the action (includes concrete numbers when available)
  why: string; // evidence from the session data
  outcome: string; // expected result + trade-off
  viz?: AdviceViz;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
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
    out.push({
      id: "gearing-shift-points",
      area: "Gearing — shift points",
      confidence: "high",
      kind: "fix",
      recommendation: `Upshift at — ${gearing.shifts.map((x) => `${x.from}→${x.to}: ${x.rpm} rpm`).join("   ·   ")}`,
      why: `Built from your measured power curve this session: peak power ≈ ${r0(gearing.peakPowerRpm)} rpm, peak torque ≈ ${r0(gearing.peakTorqueRpm)} rpm, redline ≈ ${r0(gearing.redline)} rpm. Shifting here keeps you in the strongest part of the curve after each shift.`,
      outcome:
        "More acceleration out of every gear. Trade-off: none, as long as the power curve is accurate (drive a bit more to refine it).",
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
  if (p.rules.dragLaunch && s.powerFrames >= MIN.power && s.wheelspinFrac >= p.thr.wheelspin) {
    const drop = clamp(r0(s.wheelspinFrac * 30), 5, 25);
    const rec =
      tune.diffAccel != null
        ? `Diff acceleration ${r0(tune.diffAccel)}% → ~${r0(tune.diffAccel - drop)}%`
        : `Lower diff acceleration by ~${drop}%`;
    out.push({
      id: "drag-launch",
      area: "Launch traction",
      confidence: "high",
      kind: "fix",
      recommendation: `${rec}; drop tire pressure slightly for a bigger contact patch`,
      why: `The driven wheels spin in ${pct(s.wheelspinFrac)} of on-power frames — that's wasted grip off the line.`,
      outcome:
        "Quicker launch and lower ET. Trade-off: go too soft and it bogs instead of spinning — dial to the edge of traction.",
      viz: { kind: "bar", value: s.wheelspinFrac, tone: "spin" },
    });
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

  // ---- Brakes: lockup + balance --------------------------------------------
  if (p.rules.brakes && s.brakingFrames >= MIN.braking) {
    if (s.frontLockFrac >= p.thr.lockup && s.frontLockFrac >= s.rearLockFrac) {
      const shift = clamp(r0(s.frontLockFrac * 20), 2, 10);
      const rec =
        tune.brakeBalance != null
          ? `Brake balance ${r0(tune.brakeBalance)}% → ~${r0(tune.brakeBalance - shift)}% front`
          : `Move brake balance ~${shift}% rearward`;
      out.push({
        id: "brake-front-lock",
        area: "Brakes",
        confidence: "high",
        kind: "fix",
        recommendation: rec,
        why: `Front wheels lock in ${pct(s.frontLockFrac)} of braking — when they lock you can't steer and you flat-spot the tires.`,
        outcome:
          "You can brake later and still turn in. Trade-off: shift too far and the rears start to lock instead.",
        viz:
          tune.brakeBalance != null
            ? { kind: "delta", from: tune.brakeBalance, to: clamp(tune.brakeBalance - shift, 0, 100), min: 0, max: 100, unit: "% front" }
            : { kind: "bar", value: s.frontLockFrac, tone: "lock" },
      });
    } else if (s.rearLockFrac >= p.thr.lockup && s.rearLockFrac > s.frontLockFrac) {
      const shift = clamp(r0(s.rearLockFrac * 20), 2, 10);
      const rec =
        tune.brakeBalance != null
          ? `Brake balance ${r0(tune.brakeBalance)}% → ~${r0(tune.brakeBalance + shift)}% front`
          : `Move brake balance ~${shift}% forward`;
      out.push({
        id: "brake-rear-lock",
        area: "Brakes",
        confidence: "high",
        kind: "fix",
        recommendation: rec,
        why: `Rear wheels lock in ${pct(s.rearLockFrac)} of braking — that can step the back end out under braking.`,
        outcome: "More stable braking. Trade-off: shift too far forward and the fronts start to lock.",
        viz:
          tune.brakeBalance != null
            ? { kind: "delta", from: tune.brakeBalance, to: clamp(tune.brakeBalance + shift, 0, 100), min: 0, max: 100, unit: "% front" }
            : { kind: "bar", value: s.rearLockFrac, tone: "lock" },
      });
    }
  }

  // ---- Differential: wheelspin (a fault here) ------------------------------
  if (p.rules.diffWheelspin && s.powerFrames >= MIN.power && s.wheelspinFrac >= p.thr.wheelspin) {
    const drop = clamp(r0(s.wheelspinFrac * 30), 5, 20);
    const rec =
      tune.diffAccel != null
        ? `Diff acceleration ${r0(tune.diffAccel)}% → ~${r0(tune.diffAccel - drop)}%`
        : `Lower diff acceleration by ~${drop}%`;
    out.push({
      id: "diff-wheelspin",
      area: "Differential",
      confidence: p.id === "road" ? "high" : "medium",
      kind: "fix",
      recommendation: rec,
      why: `The ${s.drivenAxle} axle spins up in ${pct(s.wheelspinFrac)} of on-power frames — more than ideal for ${p.label.toLowerCase()}.`,
      outcome:
        "Cleaner drive off corners, more usable power. Trade-off: too low and the inside wheel spins on power instead — find where it just hooks.",
      viz:
        tune.diffAccel != null
          ? { kind: "delta", from: tune.diffAccel, to: clamp(tune.diffAccel - drop, 0, 100), min: 0, max: 100, unit: "%" }
          : { kind: "bar", value: s.wheelspinFrac, tone: "spin" },
    });
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
            ? `${end[0].toUpperCase() + end.slice(1)} ride height ${r1(tune[rhKey]!)} → ~${r1(tune[rhKey]! + 1)}`
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

  // ---- Drift: maximize controllable oversteer ------------------------------
  if (p.rules.drift && s.corneringFrames >= MIN.cornering) {
    if (s.understeerRatio >= p.thr.understeerHigh) {
      const rec =
        tune.diffAccel != null && tune.diffAccel < 90
          ? `Diff acceleration ${r0(tune.diffAccel)}% → ~${r0(clamp(tune.diffAccel + 15, 0, 100))}%`
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
      const rec =
        tune[pKey] != null
          ? `${frontHot ? "Front" : "Rear"} pressure ${r1(tune[pKey]!)} → try ~${r1(tune[pKey]! - 1)} psi`
          : `Ease the load on ${hot.map((k) => k.toUpperCase()).join(", ")} (softer that end, or smoother inputs)`;
      out.push({
        id: "tire-hot",
        area: "Tires (temperature)",
        confidence: "low",
        kind: "fix",
        recommendation: rec,
        why: `${hot.map((k) => `${k.toUpperCase()} avg ${r0(s.tireTempAvg[k])}°F`).join(", ")} — those tires run hottest, so they're working hardest.`,
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

  return out;
}

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
