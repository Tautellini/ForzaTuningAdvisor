import type { CurrentTune } from "../tune";
import { TUNE_FIELDS, saveTune } from "../tune";
import type { Units } from "../units";

interface Props {
  tune: CurrentTune;
  units: Units;
  onChange: (t: CurrentTune) => void;
}

export function TunePanel({ tune, units, onChange }: Props) {
  const set = (key: keyof CurrentTune, raw: string) => {
    const next = { ...tune };
    if (raw.trim() === "") delete next[key];
    else next[key] = Number(raw);
    onChange(next);
    saveTune(next);
  };

  return (
    <section className="tunestrip">
      <div className="tunestrip-head">
        <span className="tunestrip-title">Current tune</span>
        <span className="tunestrip-sub">applies to every session below — enter it for target numbers</span>
      </div>
      <div className="tunestrip-fields">
        {TUNE_FIELDS.map((f) => (
          <label key={f.key} className={`tunechip ${tune[f.key] != null ? "set" : ""}`} title={f.label}>
            <span className="tc-icon">{f.icon}</span>
            <span className="tc-body">
              <span className="tc-label">{f.label}</span>
              <span className="tc-inputrow">
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="—"
                  value={tune[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
                <span className="tc-unit">{f.unit(units)}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
