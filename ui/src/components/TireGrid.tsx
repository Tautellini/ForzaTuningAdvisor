import type { CornerKey, TireCorner } from "../types";

// Map a tire temperature (deg F) to a color from cold-blue to hot-red.
function tempColor(f: number): string {
  // ~150F cold, ~200F ideal-ish, ~250F+ hot. Clamp to a hue range.
  const clamped = Math.max(120, Math.min(260, f));
  const tpct = (clamped - 120) / (260 - 120); // 0..1
  const hue = 210 - tpct * 210; // 210 (blue) -> 0 (red)
  return `hsl(${hue}, 75%, 50%)`;
}

function Tire({ label, c }: { label: string; c: TireCorner }) {
  const slip = Math.min(1, c.combinedSlip); // 0 grip .. 1+ losing grip
  return (
    <div className="tire">
      <div className="tire-label">{label}</div>
      <div className="tire-temp" style={{ background: tempColor(c.temp) }}>
        {Math.round(c.temp)}°F
      </div>
      <div className="tire-slip">
        <div
          className="tire-slip-fill"
          style={{ width: `${slip * 100}%`, background: slip > 0.95 ? "#ff4d4d" : "#e0b020" }}
        />
      </div>
      <div className="tire-susp" title="suspension compression">
        <div className="tire-susp-fill" style={{ height: `${Math.round(c.suspNorm * 100)}%` }} />
      </div>
    </div>
  );
}

export function TireGrid({ tires }: { tires: Record<CornerKey, TireCorner> }) {
  return (
    <div className="tiregrid">
      <Tire label="FL" c={tires.fl} />
      <Tire label="FR" c={tires.fr} />
      <Tire label="RL" c={tires.rl} />
      <Tire label="RR" c={tires.rr} />
    </div>
  );
}
