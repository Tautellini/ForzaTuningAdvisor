import { useState } from "react";
import type { CurrentTune } from "../tune";
import { TUNE_FIELDS, saveTune } from "../tune";

interface Props {
  tune: CurrentTune;
  onChange: (t: CurrentTune) => void;
}

export function TunePanel({ tune, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const set = (key: keyof CurrentTune, raw: string) => {
    const next = { ...tune };
    if (raw.trim() === "") delete next[key];
    else next[key] = Number(raw);
    onChange(next);
    saveTune(next);
  };

  const filled = TUNE_FIELDS.filter((f) => tune[f.key] != null).length;

  return (
    <section className="tunepanel">
      <button className="tune-toggle" onClick={() => setOpen((o) => !o)}>
        <span>Your current tune {filled > 0 ? `(${filled} set)` : "(optional)"}</span>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <p className="tune-hint">
            Telemetry can't see your tune, so enter it to turn directional advice into target
            numbers. Leave fields blank to keep those cues directional. Saved on this device only.
          </p>
          <div className="tune-grid">
            {TUNE_FIELDS.map((f) => (
              <label key={f.key} className="tune-field">
                <span className="tune-label">
                  {f.label} <span className="tune-unit">{f.hint}</span>
                </span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={tune[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
