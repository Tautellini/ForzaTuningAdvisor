// Tuning goals differ by discipline, so each mode defines which advice rules
// run, their trigger thresholds, and what "good balance" means.

// Mirrors Forza's own event types: Dirt racing IS rally (a mix of gravel,
// dirt and tarmac), Offroad is Cross Country. A former separate "rally" id
// merged into "dirt"; normalizeDisciplineId maps stored data forward.
export type DisciplineId = "road" | "dirt" | "offroad" | "drift" | "drag";

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
    alignment: boolean; // camber (roll-based) + toe/caster tip
    damping: boolean; // low-confidence damping from oscillation
  };
  thr: {
    wheelspin: number; // frac of on-power frames before flagging
    bottoming: number;
    topping: number;
    /** Locked fraction of ALL braking frames (any pedal), so values run low. */
    lockup: number;
    understeerHigh: number; // front/rear slip-angle ratio above = understeer
    oversteerLow: number; // ratio below = oversteer
    hotTire: number; // deg F
  };
  /**
   * Tire-pressure window per axle, in psi (converted at display time).
   * Telemetry has no pressure channel, so this is knowledge, not measurement:
   * community-established windows the entered SHEET is checked against.
   */
  psiWindow: Record<"front" | "rear", [number, number]>;
  /**
   * Caster floor (deg). Caster has no telemetry signal at all, so this too is
   * a sheet check: below the floor the engine suggests raising toward 6–7°
   * (Forza's max is 7; high caster is nearly free on a pad).
   */
  casterMin: number;
  /**
   * Diff-acceleration floor (%). On loose surfaces wheelspin is the SURFACE,
   * not the diff — without a floor the wheelspin rule would ratchet the
   * advice toward a fully open diff (0%), which kills drive off-road.
   */
  diffAccelFloor: number;
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
      lockup: 0.07,
      understeerHigh: 1.5,
      oversteerLow: 0.67,
      hotTire: 235,
    },
    psiWindow: { front: [26, 33], rear: [26, 33] }, // ~1.8–2.3 bar
    casterMin: 5,
    diffAccelFloor: 15,
    preferHigherRide: false,
  },
  {
    id: "dirt",
    label: "Dirt",
    blurb: "Rally-style mix of dirt, gravel and tarmac — some slip is normal; runs softer and taller.",
    rules: { ...BASE_RULES },
    thr: {
      wheelspin: 0.3,
      bottoming: 0.12,
      topping: 0.15,
      lockup: 0.12,
      understeerHigh: 1.8,
      oversteerLow: 0.55,
      hotTire: 225,
    },
    psiWindow: { front: [22, 28], rear: [22, 28] }, // ~1.5–1.9 bar, mid ≈ 1.7
    casterMin: 4.5,
    diffAccelFloor: 35, // loose surface — keep the axle driving as a unit
    preferHigherRide: true,
  },
  {
    id: "offroad",
    label: "Offroad",
    blurb: "Cross Country — rough terrain & jumps; run high and soft, bottoming is partly unavoidable.",
    rules: { ...BASE_RULES, topping: false, aero: false },
    thr: {
      wheelspin: 0.55,
      bottoming: 0.28,
      topping: 0.3,
      lockup: 0.18,
      understeerHigh: 2.2,
      oversteerLow: 0.45,
      hotTire: 210,
    },
    psiWindow: { front: [15, 22], rear: [15, 22] }, // ~1.0–1.5 bar
    casterMin: 4,
    diffAccelFloor: 40,
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
    // wide & style-dependent: front for bite, rear high to keep slides alive
    psiWindow: { front: [28, 36], rear: [28, 42] },
    casterMin: 6.5, // max caster = steering angle + camber gain in slides
    diffAccelFloor: 60, // unused (diffWheelspin off) — drift wants it locked anyway
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
    // rear low for the launch contact patch, front high to cut rolling drag
    psiWindow: { front: [30, 55], rear: [13, 20] },
    casterMin: 3, // straight line — caster barely matters (alignment off anyway)
    diffAccelFloor: 20,
    preferHigherRide: false,
  },
];

export const DISCIPLINE_BY_ID: Record<DisciplineId, DisciplineProfile> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.id, d]),
) as Record<DisciplineId, DisciplineProfile>;

/**
 * Map a stored discipline id forward: "rally" merged into "dirt"; anything
 * unknown falls back to "road". Persisted sessions/setups and the saved
 * selector value can predate the merge.
 */
export function normalizeDisciplineId(id: string): DisciplineId {
  if (id === "rally") return "dirt";
  return DISCIPLINE_BY_ID[id as DisciplineId] ? (id as DisciplineId) : "road";
}

const KEY = "fta.discipline";
export function loadDiscipline(): DisciplineId {
  const v = localStorage.getItem(KEY);
  return v ? normalizeDisciplineId(v) : "road";
}
export function saveDiscipline(id: DisciplineId) {
  localStorage.setItem(KEY, id);
}
