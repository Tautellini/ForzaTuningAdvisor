import type { SessionSummary } from "../session";
import { gearingAnalysis } from "../advice/engine";

interface Props {
  summary: SessionSummary | null;
  liveRpm: number;
}

const W = 540;
const H = 220;
const PAD = { l: 8, r: 8, t: 18, b: 26 };

export function PowerCurveChart({ summary, liveRpm }: Props) {
  const g = gearingAnalysis(summary);
  const curve = summary?.powerCurve ?? [];
  const redline = g.redline || summary?.maxRpm || 8000;

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (rpm: number) => PAD.l + (Math.min(rpm, redline) / redline) * plotW;
  const maxPower = Math.max(1, ...curve.map((p) => p.power));
  const maxTorque = Math.max(1, ...curve.map((p) => p.torque));
  const yP = (w: number) => PAD.t + plotH - (w / maxPower) * plotH;
  const yT = (t: number) => PAD.t + plotH - (t / maxTorque) * plotH;

  const line = (pts: { rpm: number; v: number }[], y: (v: number) => number) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.rpm).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  const powerPath = line(curve.map((p) => ({ rpm: p.rpm, v: p.power })), yP);
  const torquePath = line(curve.map((p) => ({ rpm: p.rpm, v: p.torque })), yT);
  const powerArea =
    curve.length > 1
      ? `${powerPath} L${x(curve[curve.length - 1].rpm).toFixed(1)},${(PAD.t + plotH).toFixed(1)} L${x(curve[0].rpm).toFixed(1)},${(PAD.t + plotH).toFixed(1)} Z`
      : "";

  return (
    <div className="cov-diagram">
      <div className="cov-diagram-head">
        <h4>Gearing — power curve</h4>
        <span className="viz-sub">
          {g.hasCurve ? `peak ~${g.peakPowerRpm.toLocaleString()} rpm` : "no curve yet"}
        </span>
        <div className="viz-legend">
          <span className="lg lg-power">power</span>
          <span className="lg lg-torque">torque</span>
          <span className="lg lg-shift">shift</span>
        </div>
      </div>
      {curve.length < 4 ? (
        <div className="viz-empty">Drive at full throttle through the rev range to map your power curve.</div>
      ) : (
        <svg className="powercurve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* rpm gridlines every 1000 */}
          {Array.from({ length: Math.floor(redline / 1000) + 1 }, (_, i) => i * 1000).map((rpm) => (
            <g key={rpm}>
              <line x1={x(rpm)} y1={PAD.t} x2={x(rpm)} y2={PAD.t + plotH} className="grid-line" />
              <text x={x(rpm)} y={H - 8} className="axis-label" textAnchor="middle">
                {rpm / 1000}k
              </text>
            </g>
          ))}

          {powerArea && <path d={powerArea} fill="url(#pgrad)" />}
          <path d={torquePath} className="torque-line" />
          <path d={powerPath} className="power-line" />

          {/* peak power marker */}
          <circle cx={x(g.peakPowerRpm)} cy={yP(maxPower)} r={4} className="peak-dot" />

          {/* optimal shift points */}
          {g.shifts.map((sft) => (
            <g key={`${sft.from}-${sft.to}`}>
              <line x1={x(sft.rpm)} y1={PAD.t} x2={x(sft.rpm)} y2={PAD.t + plotH} className="shift-line" />
              <text x={x(sft.rpm)} y={PAD.t - 6} className="shift-label" textAnchor="middle">
                {sft.from}→{sft.to}
              </text>
            </g>
          ))}

          {/* live rpm needle */}
          {liveRpm > 0 && (
            <line x1={x(liveRpm)} y1={PAD.t} x2={x(liveRpm)} y2={PAD.t + plotH} className="rpm-needle" />
          )}
        </svg>
      )}
    </div>
  );
}
