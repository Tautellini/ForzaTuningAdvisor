import type { Advice, Confidence } from "../advice/engine";
import { CONFIDENCE_RANK } from "../advice/engine";

const BADGE: Record<Confidence, string> = {
  high: "badge-high",
  medium: "badge-med",
  low: "badge-low",
};
const BADGE_TEXT: Record<Confidence, string> = {
  high: "high confidence",
  medium: "medium",
  low: "low / hint",
};

export function AdvicePanel({ advice, enoughData }: { advice: Advice[]; enoughData: boolean }) {
  const sorted = [...advice].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );

  return (
    <aside className="advice">
      <h2>
        Tuning advice
        <span className="advice-sub">directional cues from your driving</span>
      </h2>

      {!enoughData ? (
        <div className="advice-empty">Drive for a few seconds and advice will appear here.</div>
      ) : sorted.length === 0 ? (
        <div className="advice-empty">
          Nothing obvious to flag right now — the car looks reasonably balanced for how you're
          driving. Push harder (corners, braking, full throttle) to surface more.
        </div>
      ) : (
        <ul className="advice-list">
          {sorted.map((a) => (
            <li key={a.id} className="advice-item">
              <div className="advice-head">
                <span className="advice-area">{a.area}</span>
                <span className={`badge ${BADGE[a.confidence]}`}>{BADGE_TEXT[a.confidence]}</span>
              </div>
              <p className="advice-msg">{a.message}</p>
              {a.detail && <p className="advice-detail">{a.detail}</p>}
            </li>
          ))}
        </ul>
      )}

      <p className="advice-foot">
        Camber/toe advice isn't shown — Forza's telemetry only reports one temperature per tire, so
        that can't be inferred honestly from this feed.
      </p>
    </aside>
  );
}
