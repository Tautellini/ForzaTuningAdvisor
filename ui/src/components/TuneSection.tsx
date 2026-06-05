// The merged "Tune" section (see Docs/plans/unified-tune-panel.md).
// Each group is one bracket with two clearly separated zones: an entry grid
// on top ("type your current in-game values here") and the advice/status
// cards below it. Cards never contain inputs. Amber cards carry an Apply
// button that writes the engine's step-snapped target straight into the
// sheet; the lever then shows a "changed — drive to re-measure" note until a
// fresh session replaces the pre-edit pool. A green note only appears when
// something was actually verified — from telemetry with enough driving, or
// from the sheet itself (window checks). No data, no row.

import { useEffect, useState } from "react";
import { MIN, type Advice, type AdviceViz } from "../advice/engine";
import type { DisciplineProfile } from "../discipline";
import type { SessionSummary } from "../session";
import type { CornerKey } from "../types";
import { TUNE_GROUPS, type CurrentTune, type TuneField } from "../tune";
import { pressureRange, tempC, type Units } from "../units";
import { InfoDot } from "./InfoDot";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Accept both "3.5" and "3,5". Empty -> undefined. */
function parseNum(raw: string): number | undefined {
  const s = raw.replace(",", ".").trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// Module-level (stable identity) so the input keeps focus while typing, and it
// owns its raw text so in-progress decimals like "3," / "3." aren't clobbered.
function NumberField({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number | undefined;
  unit?: string;
  onChange: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  useEffect(() => {
    // resync only when the external value diverges from what we're showing
    if (parseNum(text) !== value) setText(value != null ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className={`tf ${value != null ? "set" : ""}`}>
      <span className="tf-label">{label}</span>
      <span className="tf-inputrow">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseNum(e.target.value));
          }}
        />
        {unit && <span className="tf-unit">{unit}</span>}
      </span>
    </label>
  );
}

/**
 * A VERIFIED statement about a lever, or null when there is nothing to show.
 * A green note must mirror the engine's gates exactly — discipline rule flag
 * AND minimum evidence — or it would claim "ok" for things the engine never
 * checked (e.g. balance in drag mode). Pressure/caster verify the sheet
 * against the discipline window instead (reaching here means the window
 * check passed, or it would be a card).
 */
function leverNote(
  key: keyof CurrentTune,
  s: SessionSummary | null,
  enoughData: boolean,
  units: Units,
  profile: DisciplineProfile,
  cur: number | undefined,
): { note: string; viz?: AdviceViz } | null {
  const rules = profile.rules;
  const axle = key === "frontPressure" ? "front" : key === "rearPressure" ? "rear" : null;
  if (axle) {
    if (cur == null) return null; // nothing entered, nothing checked
    const win = pressureRange(profile.psiWindow[axle][0], profile.psiWindow[axle][1], units);
    const base = `in the ${profile.label} window (${win})`;
    if (!rules.tireTemp || !s || !enoughData) return { note: base };
    const [a, b]: [CornerKey, CornerKey] = axle === "front" ? ["fl", "fr"] : ["rl", "rr"];
    const t = (s.tireTempAvg[a] + s.tireTempAvg[b]) / 2;
    const tc = tempC(t, units);
    return { note: `${base} · temps ok (${Math.round(tc.v)}${tc.unit})` };
  }
  if (key === "caster") {
    // sheet check; only claim the guideline is met when it actually is
    if (cur == null || cur < profile.casterMin) return null;
    return { note: `meets the ${profile.casterMin}–7° guideline (sheet check)` };
  }
  if (!s || !enoughData) return null;
  switch (key) {
    case "frontARB":
    case "rearARB":
      // same metric the ARB rule fires on (mid-corner phase, not overall)
      return rules.balance && s.midFrames >= MIN.mid
        ? { note: "mid-corner balance ok", viz: { kind: "balance", ratio: s.midUndersteer } }
        : null;
    case "frontCamber":
    case "rearCamber": {
      if (!rules.alignment || s.hardCornerFrames < MIN.hardCorner) return null;
      const roll = key === "frontCamber" ? s.frontRollDeg : s.rearRollDeg;
      return { note: `roll ~${roll.toFixed(1)}° · static camber not critical` };
    }
    case "frontToe":
    case "rearToe": {
      if (!rules.alignment || s.straightFrames < MIN.straight) return null;
      const scrub = key === "frontToe" ? s.frontScrubDeg : s.rearScrubDeg;
      return { note: `scrub ~${scrub.toFixed(1)}° running straight · ok` };
    }
    case "frontSprings": {
      if (!rules.bottoming) return null;
      const diveChecked = !profile.preferHigherRide && profile.id !== "drift" && s.hardBrakeFrames >= MIN.hardBrake;
      return { note: diveChecked ? "no bottoming · brake dive ok" : "no bottoming" };
    }
    case "rearSprings": {
      if (!rules.bottoming) return null;
      const squatChecked = !profile.preferHigherRide && profile.id !== "drift" && s.hardPowerFrames >= MIN.hardPower;
      return { note: squatChecked ? "no bottoming · power squat ok" : "no bottoming" };
    }
    case "frontRideHeight":
    case "rearRideHeight":
      return rules.bottoming ? { note: "no bottoming" } : null;
    case "frontBump":
    case "frontRebound":
    case "rearBump":
    case "rearRebound":
      return rules.damping && s.drivingFrames >= MIN.damping ? { note: "settles ok" } : null;
    case "frontAero":
    case "rearAero":
      return rules.aero && s.highSpeedCornerFrames >= MIN.hsCorner
        ? { note: "grip in hand at speed" }
        : null;
    case "brakeBalance":
    case "brakePressure":
      return rules.brakes && s.brakingFrames >= MIN.braking ? { note: "no lockup" } : null;
    case "frontDiffAccel":
    case "rearDiffAccel":
      return rules.diffWheelspin && s.powerFrames >= MIN.power ? { note: "traction ok" } : null;
    case "frontDiffDecel":
    case "rearDiffDecel":
      // decel lock shows up in corner-entry balance (trail braking)
      return rules.balance && s.entryFrames >= MIN.phase
        ? { note: "entry balance ok", viz: { kind: "balance", ratio: s.entryUndersteer } }
        : null;
    default:
      return null;
  }
}

function Viz({ v }: { v: AdviceViz }) {
  if (v.kind === "delta") {
    const span = v.max - v.min || 1;
    const toPos = clamp((v.to - v.min) / span, 0, 1);
    const fromPos = v.from != null ? clamp((v.from - v.min) / span, 0, 1) : null;
    const dir = v.from != null ? (v.to > v.from ? "up" : v.to < v.from ? "down" : "flat") : "flat";
    return (
      <div className="chg chg-delta">
        <div className="chg-nums">
          {v.from != null && <span className="chg-from">{round(v.from)}</span>}
          <span className={`chg-arrow ${dir}`}>→</span>
          <span className="chg-to">
            {round(v.to)}
            {v.unit ? <span className="chg-unit"> {v.unit}</span> : null}
          </span>
        </div>
        <div className="chg-track">
          {fromPos != null && <span className="chg-mark from" style={{ left: `${fromPos * 100}%` }} />}
          <span className="chg-mark to" style={{ left: `${toPos * 100}%` }} />
        </div>
      </div>
    );
  }
  if (v.kind === "balance") {
    const pos = clamp(0.5 + clamp(Math.log2(Math.max(v.ratio, 0.01)) / 2, -0.5, 0.5), 0, 1);
    return (
      <div className="chg">
        <div className="vb-track">
          <span className="vb-center" />
          <span className="vb-marker" style={{ left: `${pos * 100}%` }} />
        </div>
        <div className="vb-labels">
          <span>oversteer</span>
          <span>neutral</span>
          <span>understeer</span>
        </div>
      </div>
    );
  }
  if (v.kind === "gears") {
    const max = Math.max(1, ...v.gears.map((g) => g.speed));
    return (
      <div className="chg gears-viz">
        {v.gears.map((g) => (
          <div className="gv-row" key={g.g}>
            <span className="gv-g">{g.g}</span>
            <div className="gv-bar">
              <div className="gv-fill" style={{ width: `${(g.speed / max) * 100}%` }} />
            </div>
            <span className="gv-kmh">
              {g.speed} {v.unit}
            </span>
            {g.shift != null && <span className="gv-shift">↑{(g.shift / 1000).toFixed(1)}k</span>}
          </div>
        ))}
      </div>
    );
  }
  if (v.kind === "ratioset") {
    return (
      <div className="chg ratioset">
        {v.rows.map((r) => {
          const changed = Math.abs(r.to - r.from) / r.from >= 0.02;
          return (
            <div className="rs-row" key={r.g}>
              <span className="rs-g">{r.g}</span>
              <span className="rs-from">{r.from.toFixed(2)}</span>
              <span className={`rs-arrow ${changed ? "on" : ""}`}>→</span>
              <span className={`rs-to ${changed ? "on" : ""}`}>{r.to.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={`chg viz-dir dir-${v.dir}`}>
      <span className="vd-arrow">{v.dir === "more" ? "▲" : "▼"}</span>
      {v.dir === "more" ? "more" : "less"} {v.label}
    </div>
  );
}

function round(x: number) {
  // keep one decimal above 10 — engine targets are snapped to 0.1 steps and
  // the viz must show exactly what recommendation/Apply show (e.g. 11.1)
  return Math.abs(x) >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
}

function applyLabel(a: Advice): string {
  const keys = Object.keys(a.apply!) as (keyof CurrentTune)[];
  if (keys.length === 1 && keys[0] === "gearRatios") return "Apply ratios";
  const vals = keys.map((k) => String(a.apply![k]));
  // multi-lever card writing the same value everywhere reads better as "each"
  if (vals.length > 1 && vals.every((v) => v === vals[0])) return `Apply ${vals[0]} each`;
  return `Apply ${vals.join(" / ")}`;
}

/** An advice card: recommendation, viz, Apply, expandable why/outcome. */
function AdviceCard({ a, onApply }: { a: Advice; onApply: (a: Advice) => void }) {
  const [open, setOpen] = useState(false);
  const state = a.kind === "opportunity" || a.confidence === "low" ? "neutral" : "change";
  return (
    <li className={`adv adv-${state}`}>
      <div className="adv-head">
        <span className="adv-area">{a.area}</span>
        {a.confidence === "low" && (
          <span
            className="conf-chip"
            title="Built from a noisier signal — an educated starting point, not a measurement."
          >
            educated estimate
          </span>
        )}
        <button
          className="adv-info"
          aria-label="why & outcome"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "×" : "ⓘ"}
        </button>
      </div>
      <div className="adv-rec">{a.recommendation}</div>
      {a.viz && <Viz v={a.viz} />}
      {a.apply && (
        <div className="adv-actions">
          <button className="apply-btn" onClick={() => onApply(a)}>
            {applyLabel(a)}
          </button>
        </div>
      )}
      {open && (
        <div className="adv-more">
          <p>
            <span className="adv-tag">Why</span> {a.why}
          </p>
          <p>
            <span className="adv-tag">Outcome</span> {a.outcome}
          </p>
        </div>
      )}
    </li>
  );
}

/** Verified green note for a lever without advice. */
function OkRow({ label, note, viz }: { label: string; note: string; viz?: AdviceViz }) {
  return (
    <li className="adv adv-ok">
      <div className="adv-head">
        <span className="adv-area">{label}</span>
        <span className="conf-dot good" title="no change needed" />
      </div>
      <div className="adv-rec ok">
        <span className="ok-note">{note}</span>
      </div>
      {viz && <Viz v={viz} />}
    </li>
  );
}

/** A lever changed since the pool was driven — waiting for fresh data. */
function StaleRow({ label }: { label: string }) {
  return (
    <li className="adv adv-stale">
      <div className="adv-head">
        <span className="adv-area">{label}</span>
        <span className="stale-chip">changed</span>
      </div>
      <div className="adv-rec ok">
        <span className="ok-note">drive to re-measure</span>
      </div>
    </li>
  );
}

const GEAR_COUNTS = [4, 5, 6, 7, 8, 9, 10];
const GEARING_KEYS: (keyof CurrentTune)[] = ["finalDrive", "numGears", "gearRatios"];

interface Props {
  advice: Advice[];
  enoughData: boolean;
  summary: SessionSummary | null;
  tune: CurrentTune;
  units: Units;
  profile: DisciplineProfile;
  drivetrain?: number;
  /** Which car this sheet belongs to (viewed car). */
  carLabel?: string;
  /** Levers edited since the pool's data was driven (suppresses their advice). */
  staleFields: (keyof CurrentTune)[];
  /** Some pool sessions predate the last sheet edit (next drive drops them). */
  hasPreEditSessions: boolean;
  onChange: (t: CurrentTune) => void;
}

export function TuneSection({
  advice,
  enoughData,
  summary,
  tune,
  units,
  profile,
  drivetrain,
  carLabel,
  staleFields,
  hasPreEditSessions,
  onChange,
}: Props) {
  const stale = new Set<keyof CurrentTune>(staleFields);
  const gearingStale = GEARING_KEYS.some((k) => stale.has(k));
  // Suppress measured advice on a changed lever: re-aiming from the new value
  // with old data is the apply-chasing loop. Sheet checks stay live.
  const adviceStale = (a: Advice): boolean => {
    if (a.sheetOnly) return false;
    if (a.group === "gearing") return gearingStale;
    const keys = new Set<keyof CurrentTune>(Object.keys(a.apply ?? {}) as (keyof CurrentTune)[]);
    if (a.field) keys.add(a.field);
    return [...keys].some((k) => stale.has(k));
  };
  const visible = advice.filter((a) => !adviceStale(a));
  const applyables = visible.filter((a) => a.apply);

  const applyOne = (a: Advice) => onChange({ ...tune, ...a.apply });
  const applyAll = () => {
    // first card wins a field — the engine emits the stronger signal first
    const merged: Partial<CurrentTune> = {};
    const taken = new Set<string>();
    for (const a of applyables) {
      for (const [k, v] of Object.entries(a.apply!)) {
        if (taken.has(k)) continue;
        taken.add(k);
        (merged as Record<string, unknown>)[k] = v;
      }
    }
    onChange({ ...tune, ...merged });
  };

  const setField = (key: TuneField["key"], v: number | undefined) => {
    const next = { ...tune };
    if (v === undefined) delete next[key];
    else (next[key] as number) = v;
    onChange(next);
  };

  const numGears = tune.numGears ?? 6;
  const ratios = tune.gearRatios ?? [];
  const setNumGears = (n: number) =>
    onChange({ ...tune, numGears: n, gearRatios: (tune.gearRatios ?? []).slice(0, n) });
  const setGear = (i: number, v: number | undefined) => {
    const r = (tune.gearRatios ?? []).slice();
    while (r.length < numGears) r.push(NaN);
    r[i] = v === undefined ? NaN : v;
    onChange({ ...tune, numGears, gearRatios: r });
  };

  const setCount =
    TUNE_GROUPS.reduce((acc, g) => acc + g.fields.filter((f) => tune[f.key] != null).length, 0) +
    (tune.finalDrive != null ? 1 : 0) +
    (tune.gearRatios ?? []).filter((r) => Number.isFinite(r)).length;

  return (
    <section className="advice tunesection">
      <div className="advice-titlebar">
        <h2>Tune</h2>
        {carLabel && <span className="tune-car">{carLabel}</span>}
        {setCount > 0 && <span className="tune-count">{setCount}</span>}
        <InfoDot text="One bracket per group: the fields on top are YOUR current in-game values (type them in, comma or dot ok); the cards below react to them. Amber = change suggested, green = verified fine. Apply writes a suggested value into the sheet; that lever then waits for fresh driving before it gets re-measured." />
        {applyables.length > 0 && (
          <button className="applyall-btn" onClick={applyAll}>
            Apply all ({applyables.length})
          </button>
        )}
      </div>
      <p className="tune-hint">
        Fields hold your current in-game values; type them in as you tune. Cards appear underneath
        once there is something measured (or checked) to say.
      </p>

      {!enoughData && (
        <div className="advice-empty">
          Advice firms up as you gather data (see Data coverage above) — keep driving through corners,
          braking zones, and full-throttle pulls. Your sheet values are kept either way.
        </div>
      )}
      {hasPreEditSessions && (
        <div className="advice-freshen" role="status">
          Sheet changed · your next drive starts a fresh pool (sessions recorded on the old values
          are dropped automatically).
        </div>
      )}

      <div className="advice-groups">
        {TUNE_GROUPS.map((g) => {
          const leverFields = g.gearing
            ? []
            : g.fields.filter(
                (f) => !f.drivetrains || drivetrain == null || f.drivetrains.includes(drivetrain),
              );
          const cards = visible.filter((x) => x.group === g.id);
          // every lever a card speaks for, including multi-field applies
          // (a green note next to a card proposing a change would contradict it)
          const claimed = new Set<string>(
            cards.flatMap((a) => [
              ...(a.field ? [a.field] : []),
              ...Object.keys(a.apply ?? {}),
            ]),
          );

          // a row per lever the cards did not already speak for
          const notes = g.gearing
            ? []
            : leverFields
                .map((f) => {
                  if (claimed.has(f.key)) return null;
                  if (stale.has(f.key)) return { key: f.key, label: f.label, stale: true as const };
                  const n = leverNote(f.key, summary, enoughData, units, profile, tune[f.key] as number | undefined);
                  return n ? { key: f.key, label: f.label, stale: false as const, ...n } : null;
                })
                .filter((x): x is NonNullable<typeof x> => x != null);

          const gearingOk =
            g.gearing &&
            profile.rules.shiftPoints &&
            !gearingStale &&
            cards.length === 0 &&
            enoughData &&
            summary != null;
          const hasList = cards.length > 0 || notes.length > 0 || (g.gearing && (gearingStale || gearingOk));

          return (
            <div key={g.id} className="advgroup">
              <div className="advgroup-head">
                <span className="advgroup-icon">{g.icon}</span>
                <span className="advgroup-title">{g.title}</span>
                {g.note && <InfoDot text={g.note} />}
                {g.gearing && (
                  <label className="gear-count">
                    gears
                    <select value={numGears} onChange={(e) => setNumGears(Number(e.target.value))}>
                      {GEAR_COUNTS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="tune-fields">
                {g.gearing ? (
                  <>
                    <NumberField
                      label="Final drive"
                      unit="ratio"
                      value={tune.finalDrive}
                      onChange={(v) => setField("finalDrive", v)}
                    />
                    {Array.from({ length: numGears }, (_, i) => {
                      const val = ratios[i];
                      const has = val != null && Number.isFinite(val);
                      return (
                        <NumberField
                          key={i}
                          label={`${i + 1}${ord(i + 1)} gear`}
                          unit="ratio"
                          value={has ? val : undefined}
                          onChange={(v) => setGear(i, v)}
                        />
                      );
                    })}
                  </>
                ) : (
                  leverFields.map((f) => (
                    <NumberField
                      key={f.key}
                      label={f.label}
                      unit={f.unit(units)}
                      value={tune[f.key] as number | undefined}
                      onChange={(v) => setField(f.key, v)}
                    />
                  ))
                )}
              </div>

              {hasList && (
                <ul className="advgroup-list">
                  {g.gearing && gearingStale && <StaleRow label="Gearing" />}
                  {gearingOk && <OkRow label="Gearing" note="spacing looks fine" />}
                  {cards.map((a) => (
                    <AdviceCard key={a.id} a={a} onApply={applyOne} />
                  ))}
                  {notes.map((n) =>
                    n.stale ? (
                      <StaleRow key={n.key} label={n.label} />
                    ) : (
                      <OkRow key={n.key} label={n.label} note={n.note} viz={n.viz} />
                    ),
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ord(n: number): string {
  if (n % 10 === 1 && n !== 11) return "st";
  if (n % 10 === 2 && n !== 12) return "nd";
  if (n % 10 === 3 && n !== 13) return "rd";
  return "th";
}
