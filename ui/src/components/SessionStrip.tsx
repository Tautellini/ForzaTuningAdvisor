import { DRIVETRAIN } from "../types";
import type { RecordedSession } from "../garage/model";
import { DISCIPLINES, DISCIPLINE_BY_ID, type DisciplineId } from "../discipline";
import { InfoDot } from "./InfoDot";

interface Props {
  sessions: RecordedSession[];
  /** Sessions feeding the calculation (live counts as one). */
  effective: number;
  /** True when the live recording belongs to this car. */
  recording: boolean;
  currentSamples: number;
  /** Live telemetry says we're on track (raceOn). */
  driving: boolean;
  /** Auto start/stop sessions; off = manual Start/Stop, menus just pause. */
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  /** Manual mode: Start pressed, recording begins with the next driving frame. */
  armed: boolean;
  onStart: () => void;
  /** Active mode — sessions of other modes are kept but not analyzed. */
  discipline: DisciplineId;
  onDisciplineChange: (id: DisciplineId) => void;
  onEnd: () => void;
  onDiscard: () => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m${sec.toString().padStart(2, "0")}s` : `${sec}s`;
}
const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function SessionStrip({
  sessions,
  effective,
  recording,
  currentSamples,
  driving,
  auto,
  onAutoChange,
  armed,
  onStart,
  discipline,
  onDisciplineChange,
  onEnd,
  onDiscard,
  onToggle,
  onDelete,
  onClear,
}: Props) {
  const profile = DISCIPLINE_BY_ID[discipline];
  const paused = recording && !driving && !auto;
  return (
    <div className="sessionstrip">
      <div className="ss-head">
        <div className="ss-titlewrap">
          <span className="ss-title">Sessions</span>
          <span className="ss-count">{effective}</span>
          <InfoDot text="Sessions are recorded per mode; only the active mode's sessions feed the advice. Untick or delete a bad run. After a tune change, your next drive automatically replaces the sessions recorded on the old values." />
        </div>
        <div className="ss-headctl">
          <label
            className="ss-auto"
            title="Smart tracking starts a session when you drive and ends it after a moment in the menus. Untick to start/stop sessions yourself — menus then just pause the recording."
          >
            <input type="checkbox" checked={auto} onChange={(e) => onAutoChange(e.target.checked)} />
            smart tracking
          </label>
          <label className="modeselect" title={profile.blurb}>
            <select value={discipline} onChange={(e) => onDisciplineChange(e.target.value as DisciplineId)}>
              {DISCIPLINES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {sessions.length > 0 && (
            <button className="link-btn" onClick={onClear} title="Clear all sessions (start a fresh tune)">
              clear all
            </button>
          )}
        </div>
      </div>

      <div className="ss-list">
        {/* live / current session */}
        {recording ? (
          <div className="ss-card live">
            <div className="ss-card-top">
              <span className={`ss-rec ${paused ? "paused" : ""}`}>
                <span className="rec-dot" /> {paused ? "Paused" : "Recording"}
              </span>
              <span className="ss-samples">{currentSamples.toLocaleString()} samples</span>
            </div>
            <div className="ss-actions">
              <button onClick={onEnd} title="Stop & save this session">
                Stop &amp; save
              </button>
              <button className="ghost" onClick={onDiscard} title="Throw this recording away">
                Discard
              </button>
            </div>
          </div>
        ) : armed ? (
          <div className="ss-card live">
            <div className="ss-card-top">
              <span className="ss-rec paused">
                <span className="rec-dot" /> Ready
              </span>
            </div>
            <div className="ss-hint">Recording starts as soon as you drive.</div>
            <div className="ss-actions">
              <button className="ghost" onClick={onDiscard} title="Cancel the armed recording">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="ss-card live idle">
            <div className="ss-card-top">
              <span className="ss-rec idle">● Idle</span>
            </div>
            {auto ? (
              <div className="ss-hint">Drive in Forza to start recording a session.</div>
            ) : (
              <div className="ss-actions">
                <button onClick={onStart} title="Recording starts with the next driving frame">
                  Start
                </button>
              </div>
            )}
          </div>
        )}

        {/* saved sessions */}
        {sessions.map((s) => {
          const bal =
            s.m.understeerRatio >= 1.15 ? "understeer" : s.m.understeerRatio <= 0.87 ? "oversteer" : "neutral";
          const offMode = s.discipline !== discipline;
          return (
            <div
              key={s.id}
              className={`ss-card ${s.included ? "included" : ""} ${offMode ? "offmode" : ""}`}
              title={offMode ? `Recorded in ${DISCIPLINE_BY_ID[s.discipline]?.label ?? s.discipline} mode — not used while ${profile.label} is active.` : undefined}
            >
              <div className="ss-card-top">
                <label className="ss-check">
                  <input type="checkbox" checked={s.included} onChange={() => onToggle(s.id)} disabled={offMode} />
                  {s.label}
                </label>
                <button className="ss-del" onClick={() => onDelete(s.id)} title="Delete session">
                  ✕
                </button>
              </div>
              <div className="ss-meta">
                {fmtTime(s.startedAt)} · {fmtDur(s.durationS)} · {s.carPi} PI {DRIVETRAIN[s.drivetrain] ?? ""}
              </div>
              <div className="ss-tags">
                <span className="ss-tag muted">{DISCIPLINE_BY_ID[s.discipline]?.label ?? s.discipline}</span>
                <span className={`ss-tag ${bal}`}>{bal}</span>
                <span className="ss-tag muted">{s.m.maxLatG.toFixed(2)}g</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
