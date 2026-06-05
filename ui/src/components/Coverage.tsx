import type { SessionSummary } from "../session";
import type { DisciplineProfile } from "../discipline";
import type { CurrentTune } from "../tune";
import { MIN } from "../advice/engine";
import { InfoDot } from "./InfoDot";
import { VizCard } from "./VizCard";
import { PowerCurveChart } from "./PowerCurveChart";
import { TractionBrakes } from "./TractionBrakes";

interface Props {
  summary: SessionSummary | null;
  profile: DisciplineProfile;
  liveRpm: number;
  tune: CurrentTune;
}

interface Row {
  label: string;
  have: number;
  need: number;
  unlocks: string;
  todo: string;
  /** Only shown when the active mode actually runs the rule it feeds. */
  relevant: boolean;
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function buildRows(summary: SessionSummary, profile: DisciplineProfile): Row[] {
  const r = profile.rules;
  const gearNums = Object.keys(summary.gears).map(Number);
  const topGear = gearNums.length > 0 ? Math.max(...gearNums) : 0;
  const topGearWot = topGear > 0 ? (summary.gears[topGear]?.wot ?? 0) : 0;

  // Mirrors every evidence gate in the advice engine (same MIN thresholds) —
  // "ready" means that rule really has enough data to speak. Rows the active
  // mode doesn't analyze are hidden.
  return [
    {
      label: "Driving time",
      have: summary.drivingFrames,
      need: MIN.frames,
      unlocks: "all advice",
      todo: "just drive — everything builds on this",
      relevant: true,
    },
    {
      // MIN.cornering only gates the drift rule — the balance rules have their
      // own gates (mid / entry / exit rows below).
      label: "Cornering",
      have: summary.corneringFrames,
      need: MIN.cornering,
      unlocks: "drift rotation",
      todo: "lean on it through several corners",
      relevant: r.drift,
    },
    {
      label: "Mid-corner",
      have: summary.midFrames,
      need: MIN.mid,
      unlocks: "ARB balance",
      todo: "hold a steady line through longer corners",
      relevant: r.balance,
    },
    {
      label: "Corner entries",
      have: summary.entryFrames,
      need: MIN.phase,
      unlocks: "entry balance",
      todo: "brake into corners (trail-braking)",
      relevant: r.balance,
    },
    {
      label: "Corner exits",
      have: summary.exitFrames,
      need: MIN.phase,
      unlocks: "exit balance",
      todo: "feed the throttle from the apex",
      relevant: r.balance,
    },
    {
      label: "Hard cornering",
      have: summary.hardCornerFrames,
      need: MIN.hardCorner,
      unlocks: "camber",
      todo: "commit harder through grippy corners (>0.5g)",
      relevant: r.alignment,
    },
    {
      label: "Straight running",
      have: summary.straightFrames,
      need: MIN.straight,
      unlocks: "toe scrub",
      todo: "hold it straight at speed for a few seconds",
      relevant: r.alignment,
    },
    {
      label: "Hard braking",
      have: summary.hardBrakeFrames,
      need: MIN.hardBrake,
      unlocks: "brake dive (springs)",
      todo: "a few proper stops from speed",
      relevant: r.bottoming && !profile.preferHigherRide && profile.id !== "drift",
    },
    {
      label: "Braking zones",
      have: summary.brakingFrames,
      need: MIN.braking,
      unlocks: "brakes",
      todo: "brake into corners — any pedal pressure counts",
      relevant: r.brakes,
    },
    {
      label: "Throttle lifts",
      have: summary.liftEvents,
      need: MIN.lifts,
      unlocks: "lift-off stability",
      todo: "lift off mid-corner a few times",
      relevant: r.balance,
    },
    {
      label: "Power pulls",
      have: summary.powerCurve.length,
      need: MIN.curve,
      unlocks: "shift points",
      todo: "full-throttle pulls through the rev range",
      relevant: r.shiftPoints,
    },
    {
      label: "On power",
      have: summary.powerFrames,
      need: MIN.power,
      unlocks: r.dragLaunch ? "launch traction" : "differential",
      todo: "get on the power out of corners",
      relevant: r.diffWheelspin || r.dragLaunch,
    },
    {
      label: "Top gear flat-out",
      have: topGearWot,
      need: MIN.topGearWot,
      unlocks: "top-speed gearing",
      todo: "hold top gear wide open on a long straight",
      relevant: r.topGearLimiter,
    },
    {
      label: "Fast corners",
      have: summary.highSpeedCornerFrames,
      need: MIN.hsCorner,
      unlocks: "aero level",
      todo: "take some corners above ~110 km/h",
      relevant: r.aero,
    },
    {
      label: "Slow corners",
      have: summary.lowSpeedCornerFrames,
      need: MIN.lowSpeed,
      unlocks: "aero vs. mechanical",
      todo: "work some tight, slow corners too",
      relevant: r.aero,
    },
    {
      label: "Suspension observation",
      have: summary.drivingFrames,
      need: MIN.damping,
      unlocks: "damping",
      todo: "keep driving — oscillation needs time",
      relevant: r.damping,
    },
  ].filter((row) => row.relevant);
}

export function Coverage({ summary, profile, liveRpm, tune }: Props) {
  const rows = summary ? buildRows(summary, profile) : [];
  const ready = rows.filter((row) => row.have >= row.need).length;
  // overall progress = average of each gate's fill (so partial bars count)
  const overall =
    rows.length > 0 ? rows.reduce((a, row) => a + Math.min(1, row.have / row.need), 0) / rows.length : 0;

  const mini = summary ? (
    <>
      <span className="cov-minitrack">
        <span className={`cov-minifill ${ready === rows.length ? "ok" : ""}`} style={{ width: `${overall * 100}%` }} />
      </span>
      {ready}/{rows.length} ready
    </>
  ) : (
    "no data yet"
  );

  return (
    <VizCard
      id="coverage"
      title="Data coverage"
      mini={mini}
      defaultOpen={false}
      headExtra={
        <InfoDot
          text={`Each bar is an evidence gate in the advice engine: the matching advice only appears once its bar is full. Rows reflect the active mode (${profile.label}) — rules it doesn't run aren't listed.`}
        />
      }
    >
      {!summary ? (
        <div className="viz-empty">Drive to gather data for your current tune.</div>
      ) : (
        <>
          <div className="cov-sub muted">
            {summary.drivingFrames.toLocaleString()} samples · {fmtDur(summary.durationS)} across your
            sessions
          </div>
          <ul className="cov-list">
            {rows.map((row) => {
              const ok = row.have >= row.need;
              const ratio = Math.min(1, row.have / row.need);
              return (
                <li key={row.label} className="cov-row">
                  <span className={`cov-icon ${ok ? "ok" : ""}`}>{ok ? "✓" : "…"}</span>
                  <span className="cov-label">{row.label}</span>
                  <div className="cov-track">
                    <div className={`cov-fill ${ok ? "ok" : ""}`} style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <span
                    className="cov-note"
                    title={ok ? `${row.unlocks} ready` : `for ${row.unlocks} — ${row.todo}`}
                  >
                    {ok ? `${row.unlocks} ready` : `for ${row.unlocks} — ${row.todo}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="cov-diagrams">
            <PowerCurveChart summary={summary} liveRpm={liveRpm} />
            <TractionBrakes summary={summary} tune={tune} />
          </div>
        </>
      )}
    </VizCard>
  );
}
