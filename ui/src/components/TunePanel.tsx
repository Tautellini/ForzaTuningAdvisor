import { useState } from "react";
import type { CurrentTune } from "../tune";
import { TUNE_GROUPS, saveTune } from "../tune";
import type { Units } from "../units";

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

const GEAR_COUNTS = [4, 5, 6, 7, 8, 9, 10];

type ScalarKey = Exclude<keyof CurrentTune, "gearRatios" | "numGears">;

export function TunePanel({ tune, units, drivetrain, onChange }: Props) {
  const [open, setOpen] = useState(true);

  const update = (t: CurrentTune) => {
    onChange(t);
    saveTune(t);
  };
  const setField = (key: ScalarKey, raw: string) => {
    const next = { ...tune };
    const v = parseNum(raw);
    if (v === undefined) delete next[key];
    else (next[key] as number) = v;
    update(next);
  };

  const numGears = tune.numGears ?? 6;
  const ratios = tune.gearRatios ?? [];
  const setNumGears = (n: number) =>
    update({ ...tune, numGears: n, gearRatios: (tune.gearRatios ?? []).slice(0, n) });
  const setGear = (i: number, raw: string) => {
    const r = (tune.gearRatios ?? []).slice();
    while (r.length < numGears) r.push(NaN);
    const v = parseNum(raw);
    r[i] = v === undefined ? NaN : v;
    update({ ...tune, numGears, gearRatios: r });
  };

  const Field = ({ k, label, unit }: { k: ScalarKey; label: string; unit: string }) => (
    <label className={`tf ${tune[k] != null ? "set" : ""}`}>
      <span className="tf-label">{label}</span>
      <span className="tf-inputrow">
        <input
          type="text"
          inputMode="decimal"
          placeholder="—"
          value={(tune[k] as number | undefined) ?? ""}
          onChange={(e) => setField(k, e.target.value)}
        />
        {unit && <span className="tf-unit">{unit}</span>}
      </span>
    </label>
  );

  const setCount = TUNE_GROUPS.reduce((acc, g) => {
    return acc + g.fields.filter((f) => tune[f.key] != null).length;
  }, 0);

  return (
    <section className="tunepanel2">
      <button className="tunepanel2-head" onClick={() => setOpen((o) => !o)}>
        <span className="tunestrip-title">Current tune</span>
        <span className="tunestrip-sub">
          {setCount > 0 ? `${setCount} set · ` : ""}applies to every session — enter it for target numbers
        </span>
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
                    <Field k="finalDrive" label="Final drive" unit="ratio" />
                    {Array.from({ length: numGears }, (_, i) => {
                      const val = ratios[i];
                      const has = val != null && Number.isFinite(val);
                      return (
                        <label key={i} className={`tf ${has ? "set" : ""}`}>
                          <span className="tf-label">
                            {i + 1}
                            {ordinal(i + 1)} gear
                          </span>
                          <span className="tf-inputrow">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="—"
                              value={has ? String(val) : ""}
                              onChange={(e) => setGear(i, e.target.value)}
                            />
                            <span className="tf-unit">ratio</span>
                          </span>
                        </label>
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
                </div>
                <div className="tunegroup-fields">
                  {fields.map((f) => (
                    <Field key={f.key} k={f.key} label={f.label} unit={f.unit(units)} />
                  ))}
                </div>
                {g.note && <div className="tg-note">{g.note}</div>}
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
