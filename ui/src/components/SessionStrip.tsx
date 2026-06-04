import { DRIVETRAIN } from "../types";
import { MAX_INCLUDED, type SessionStore } from "../sessions";

interface Props {
  store: SessionStore;
  recording: boolean;
  currentSamples: number;
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
  store,
  recording,
  currentSamples,
  onEnd,
  onDiscard,
  onToggle,
  onDelete,
  onClear,
}: Props) {
  const effective = store.effectiveCount();
  const atCap = effective >= MAX_INCLUDED;

  return (
    <div className="sessionstrip">
      <div className="ss-head">
        <div>
          <span className="ss-title">Sessions</span>
          <span className="ss-sub">
            {" "}
            pick up to {MAX_INCLUDED} to combine for the advice ({effective}/{MAX_INCLUDED} active)
          </span>
        </div>
        {store.sessions.length > 0 && (
          <button className="link-btn" onClick={onClear}>
            clear all
          </button>
        )}
      </div>

      <div className="ss-list">
        {/* live / current session */}
        {recording ? (
          <div className="ss-card live">
            <div className="ss-card-top">
              <span className="ss-rec">
                <span className="rec-dot" /> Recording
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
        ) : (
          <div className="ss-card live idle">
            <div className="ss-card-top">
              <span className="ss-rec idle">● Idle</span>
            </div>
            <div className="ss-hint">Drive in Forza to start recording a session.</div>
          </div>
        )}

        {/* saved sessions */}
        {store.sessions.map((s) => {
          const bal =
            s.m.understeerRatio >= 1.15 ? "understeer" : s.m.understeerRatio <= 0.87 ? "oversteer" : "neutral";
          const disabled = !s.included && atCap;
          return (
            <div key={s.id} className={`ss-card ${s.included ? "included" : ""}`}>
              <div className="ss-card-top">
                <label className={`ss-check ${disabled ? "disabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={s.included}
                    disabled={disabled}
                    onChange={() => onToggle(s.id)}
                  />
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
