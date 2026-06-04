import { useEffect, useState } from "react";
import type { CurrentTune } from "../tune";
import { TUNE_GROUPS, saveTune } from "../tune";
import type { Units } from "../units";
import { InfoDot } from "./InfoDot";

interface Props {
  tune: CurrentTune;
  units: Units;
  drivetrain?: number;
  onChange: (t: CurrentTune) => void;
}

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
          placeholder="—"
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

const GEAR_COUNTS = [4, 5, 6, 7, 8, 9, 10];
type ScalarKey = Exclude<keyof CurrentTune, "gearRatios" | "numGears">;

export function TunePanel({ tune, units, drivetrain, onChange }: Props) {
  const [open, setOpen] = useState(true);

  const update = (t: CurrentTune) => {
    onChange(t);
    saveTune(t);
  };
  const setField = (key: ScalarKey, v: number | undefined) => {
    const next = { ...tune };
    if (v === undefined) delete next[key];
    else (next[key] as number) = v;
    update(next);
  };

  const numGears = tune.numGears ?? 6;
  const ratios = tune.gearRatios ?? [];
  const setNumGears = (n: number) =>
    update({ ...tune, numGears: n, gearRatios: (tune.gearRatios ?? []).slice(0, n) });
  const setGear = (i: number, v: number | undefined) => {
    const r = (tune.gearRatios ?? []).slice();
    while (r.length < numGears) r.push(NaN);
    r[i] = v === undefined ? NaN : v;
    update({ ...tune, numGears, gearRatios: r });
  };

  const setCount = TUNE_GROUPS.reduce(
    (acc, g) => acc + g.fields.filter((f) => tune[f.key] != null).length,
    0,
  );

  return (
    <section className="tunepanel2">
      <button className="tunepanel2-head" onClick={() => setOpen((o) => !o)}>
        <span className="tunestrip-title">Current tune</span>
        {setCount > 0 && <span className="tune-count">{setCount}</span>}
        <InfoDot text="Your car's current settings. Applies to every session. Enter values to get exact target numbers in the advice (comma or dot ok)." />
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="tunegroups">
          {TUNE_GROUPS.map((g) => {
            const fields = g.fields.filter(
              (f) => !f.drivetrains || drivetrain == null || f.drivetrains.includes(drivetrain),
            );
            if (g.gearing) {
              return (
                <div key={g.id} className="tunegroup">
                  <div className="tunegroup-head">
                    <span className="tg-icon">{g.icon}</span>
                    <span className="tg-title">{g.title}</span>
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
                  </div>
                  <div className="tunegroup-fields">
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
                          label={`${i + 1}${ordinal(i + 1)} gear`}
                          unit="ratio"
                          value={has ? val : undefined}
                          onChange={(v) => setGear(i, v)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (fields.length === 0) return null;
            return (
              <div key={g.id} className="tunegroup">
                <div className="tunegroup-head">
                  <span className="tg-icon">{g.icon}</span>
                  <span className="tg-title">{g.title}</span>
                  {g.note && <InfoDot text={g.note} />}
                </div>
                <div className="tunegroup-fields">
                  {fields.map((f) => (
                    <NumberField
                      key={f.key}
                      label={f.label}
                      unit={f.unit(units)}
                      value={tune[f.key] as number | undefined}
                      onChange={(v) => setField(f.key, v)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ordinal(n: number): string {
  if (n % 10 === 1 && n !== 11) return "st";
  if (n % 10 === 2 && n !== 12) return "nd";
  if (n % 10 === 3 && n !== 13) return "rd";
  return "th";
}
