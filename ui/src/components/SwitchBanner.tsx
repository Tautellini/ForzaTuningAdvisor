import { carName } from "../carDb";

/**
 * Shown when the car being driven differs from the one being viewed.
 * Telemetry already records to the driven car either way — this only
 * controls what the UI displays.
 */
export function SwitchBanner({
  detected,
  viewed,
  onSwitch,
  onDismiss,
}: {
  detected: number;
  viewed: number | null;
  onSwitch: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="switchbanner" role="status">
      <span className="sb-text">
        New car detected: <b>{carName(detected)}</b>
        {viewed != null && (
          <span className="sb-sub"> — still viewing {carName(viewed)}. Recording continues for the new car.</span>
        )}
      </span>
      <span className="sb-actions">
        <button className="dlg-btn primary" onClick={onSwitch}>
          Switch view
        </button>
        <button className="dlg-btn ghost" onClick={onDismiss}>
          Keep viewing
        </button>
      </span>
    </div>
  );
}
