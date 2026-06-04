// Tuning goals differ by discipline, so each mode defines which advice rules
// run, their trigger thresholds, and what "good balance" means.

export type DisciplineId = "road" | "rally" | "dirt" | "offroad" | "drift" | "drag";

export interface DisciplineProfile {
  id: DisciplineId;
  label: string;
  blurb: string;
  rules: {
    shiftPoints: boolean;
    topGearLimiter: boolean;
    brakes: boolean; // lockup + balance
    diffWheelspin: boolean; // wheelspin = a fault to reduce
    bottoming: boolean;
    topping: boolean;
    balance: boolean; // under/oversteer should be neutralized
    tireTemp: boolean;
    drift: boolean; // drift-specific rotation advice
    dragLaunch: boolean; // launch traction advice
    aero: boolean; // downforce level + front/rear balance
    opportunity: boolean; // surface headroom-based opportunities (bias-driven)
    alignment: boolean; // camber (roll-based) + toe/caster tip
    damping: boolean; // low-confidence damping from oscillation
  };
  thr: {
    wheelspin: number; // frac of on-power frames before flagging
    bottoming: number;
    topping: number;
    lockup: number;
    understeerHigh: number; // front/rear slip-angle ratio above = understeer
    oversteerLow: number; // ratio below = oversteer
    hotTire: number; // deg F
  };
  /** For springs/ride-height advice: offroad shouldn't be told to drop ride height. */
  preferHigherRide: boolean;
}

const BASE_RULES: DisciplineProfile["rules"] = {
  shiftPoints: true,
  topGearLimiter: true,
  brakes: true,
  diffWheelspin: true,
  bottoming: true,
  topping: true,
  balance: true,
  tireTemp: true,
  drift: false,
  dragLaunch: false,
  aero: true,
  opportunity: true,
  alignment: true,
  damping: true,
};

export const DISCIPLINES: DisciplineProfile[] = [
  {
    id: "road",
    label: "Road racing",
    blurb: "Tarmac grip — neutral balance, no lockup or bottoming, optimal shift points.",
    rules: { ...BASE_RULES },
    thr: {
      wheelspin: 0.15,
      bottoming: 0.06,
      topping: 0.1,
      lockup: 0.12,
      understeerHigh: 1.5,
      oversteerLow: 0.67,
      hotTire: 235,
    },
    preferHigherRide: false,
  },
  {
    id: "rally",
    label: "Rally",
    blurb: "Mixed surfaces — some slip is normal, setup runs a bit softer and taller.",
    rules: { ...BASE_RULES },
    thr: {
      wheelspin: 0.3,
      bottoming: 0.12,
      topping: 0.15,
      lockup: 0.2,
      understeerHigh: 1.8,
      oversteerLow: 0.55,
      hotTire: 225,
    },
    preferHigherRide: true,
  },
  {
    id: "dirt",
    label: "Dirt",
    blurb: "Loose surface — wheelspin and slides are expected; balance still matters.",
    rules: { ...BASE_RULES, aero: false },
    thr: {
      wheelspin: 0.42,
      bottoming: 0.16,
      topping: 0.2,
      lockup: 0.25,
      understeerHigh: 2.0,
      oversteerLow: 0.5,
      hotTire: 215,
    },
    preferHigherRide: true,
  },
  {
    id: "offroad",
    label: "Offroad",
    blurb: "Rough terrain & jumps — run high and soft; bottoming is partly unavoidable.",
    rules: { ...BASE_RULES, topping: false, aero: false },
    thr: {
      wheelspin: 0.55,
      bottoming: 0.28,
      topping: 0.3,
      lockup: 0.3,
      understeerHigh: 2.2,
      oversteerLow: 0.45,
      hotTire: 210,
    },
    preferHigherRide: true,
  },
  {
    id: "drift",
    label: "Drift",
    blurb: "Oversteer is the goal — advice helps you hold big, controllable angles.",
    rules: {
      ...BASE_RULES,
      brakes: false,
      diffWheelspin: false, // wheelspin is wanted
      balance: false, // never 'fix' oversteer
      topping: false,
      drift: true,
      aero: false,
    },
    thr: {
      wheelspin: 1.1, // effectively off
      bottoming: 0.12,
      topping: 1.1,
      lockup: 1.1,
      understeerHigh: 1.2, // not rotating enough -> advise to free the rear
      oversteerLow: 0.0,
      hotTire: 245,
    },
    preferHigherRide: false,
  },
  {
    id: "drag",
    label: "Drag",
    blurb: "Straight line — launch traction and shift points are everything.",
    rules: {
      ...BASE_RULES,
      brakes: false,
      diffWheelspin: false,
      bottoming: false,
      topping: false,
      balance: false,
      tireTemp: false,
      dragLaunch: true,
      aero: false,
      opportunity: false,
      alignment: false,
      damping: false,
    },
    thr: {
      wheelspin: 0.12, // launch sensitivity
      bottoming: 1.1,
      topping: 1.1,
      lockup: 1.1,
      understeerHigh: 99,
      oversteerLow: 0,
      hotTire: 999,
    },
    preferHigherRide: false,
  },
];

export const DISCIPLINE_BY_ID: Record<DisciplineId, DisciplineProfile> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.id, d]),
) as Record<DisciplineId, DisciplineProfile>;

const KEY = "fta.discipline";
export function loadDiscipline(): DisciplineId {
  const v = localStorage.getItem(KEY) as DisciplineId | null;
  return v && DISCIPLINE_BY_ID[v] ? v : "road";
}
export function saveDiscipline(id: DisciplineId) {
  localStorage.setItem(KEY, id);
}
