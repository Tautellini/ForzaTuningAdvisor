import type { ConnState } from "../useTelemetry";
import type { Units } from "../units";
import { BrandMark } from "./BrandMark";
import { SettingsMenu } from "./SettingsMenu";

export type AppView = "live" | "garage";

interface Props {
  conn: ConnState;
  driving: boolean;
  hz: number;
  url: string;
  onUrlChange: (u: string) => void;
  units: Units;
  onUnitsChange: (u: Units) => void;
  view: AppView;
  onViewChange: (v: AppView) => void;
}

const DOT: Record<ConnState, string> = {
  connecting: "dot-amber",
  open: "dot-green",
  closed: "dot-red",
};

export function ConnectionBar({
  conn,
  driving,
  hz,
  url,
  onUrlChange,
  units,
  onUnitsChange,
  view,
  onViewChange,
}: Props) {
  const label =
    conn === "open"
      ? driving
        ? `Connected · driving · ${hz} pkt/s`
        : "Connected · waiting for you to drive"
      : conn === "connecting"
        ? "Connecting to bridge…"
        : "Bridge not found";

  return (
    <header className="connbar">
      <div className="brand">
        <BrandMark />
        <span className="brand-name">Forza Tuning Advisor</span>
      </div>
      <nav className="viewnav" aria-label="View">
        <button className={`viewtab ${view === "live" ? "active" : ""}`} onClick={() => onViewChange("live")}>
          Live
        </button>
        <button
          className={`viewtab ${view === "garage" ? "active" : ""}`}
          onClick={() => onViewChange("garage")}
        >
          Garage
        </button>
      </nav>
      <div className="conn-status">
        <span className={`dot ${DOT[conn]} ${driving ? "pulse" : ""}`} />
        <span>{label}</span>
      </div>
      <SettingsMenu url={url} onUrlChange={onUrlChange} units={units} onUnitsChange={onUnitsChange} />
    </header>
  );
}
