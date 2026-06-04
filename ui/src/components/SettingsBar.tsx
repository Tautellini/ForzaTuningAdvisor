import type { PowerUnit, SpringUnit, Units, UnitSystem } from "../units";

interface Props {
  units: Units;
  onChange: (u: Units) => void;
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

export function SettingsBar({ units, onChange }: Props) {
  return (
    <div className="settingsbar">
      <Seg<UnitSystem>
        label="Units"
        value={units.system}
        options={["metric", "imperial"]}
        onPick={(system) => onChange({ ...units, system })}
      />
      <Seg<PowerUnit>
        label="Power"
        value={units.power}
        options={["kW", "PS", "bhp"]}
        onPick={(power) => onChange({ ...units, power })}
      />
      <Seg<SpringUnit>
        label="Springs"
        value={units.springs}
        options={["N/mm", "lb/in", "kgf/mm"]}
        onPick={(springs) => onChange({ ...units, springs })}
      />
    </div>
  );
}
