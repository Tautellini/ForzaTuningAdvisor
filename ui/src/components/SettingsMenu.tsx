import { useEffect, useRef, useState } from "react";
import type { PowerUnit, SpringUnit, Units, UnitSystem } from "../units";

interface Props {
  url: string;
  onUrlChange: (u: string) => void;
  units: Units;
  onUnitsChange: (u: Units) => void;
}

function Seg<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: T[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="seg">
      <span className="seg-label">{label}</span>
      <div className="seg-opts">
        {options.map((o) => (
          <button
            key={o}
            className={`seg-opt ${o === value ? "active" : ""}`}
            onClick={() => onPick(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cogwheel in the app bar: bridge address + display units, in one MD3 menu. */
export function SettingsMenu({ url, onUrlChange, units, onUnitsChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(url);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => {
      if (!o) setDraft(url); // pick up changes made elsewhere
      return !o;
    });
  };

  return (
    <div className="settings" ref={ref}>
      <button
        className={`iconbtn ${open ? "active" : ""}`}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
        </svg>
      </button>
      {open && (
        <div className="settings-menu" role="dialog" aria-label="Settings">
          <div className="sm-section">
            <span className="seg-label">Bridge address</span>
            <form
              className="sm-url"
              onSubmit={(e) => {
                e.preventDefault();
                onUrlChange(draft.trim());
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
              <button type="submit" disabled={draft.trim() === url}>
                Save
              </button>
            </form>
          </div>
          <div className="sm-section sm-units">
            <Seg<UnitSystem>
              label="Units"
              value={units.system}
              options={["metric", "imperial"]}
              onPick={(system) => onUnitsChange({ ...units, system })}
            />
            <Seg<PowerUnit>
              label="Power"
              value={units.power}
              options={["kW", "PS", "bhp"]}
              onPick={(power) => onUnitsChange({ ...units, power })}
            />
            <Seg<SpringUnit>
              label="Springs"
              value={units.springs}
              options={["N/mm", "lb/in", "kgf/mm"]}
              onPick={(springs) => onUnitsChange({ ...units, springs })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
