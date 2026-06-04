import { useState } from "react";
import type { ConnState } from "../useTelemetry";

interface Props {
  conn: ConnState;
  driving: boolean;
  hz: number;
  url: string;
  onUrlChange: (u: string) => void;
}

const DOT: Record<ConnState, string> = {
  connecting: "dot-amber",
  open: "dot-green",
  closed: "dot-red",
};

export function ConnectionBar({ conn, driving, hz, url, onUrlChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

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
        <span className="brand-mark">FTA</span>
        <span className="brand-name">Forza Tuning Advisor</span>
      </div>
      <div className="conn-status">
        <span className={`dot ${DOT[conn]} ${driving ? "pulse" : ""}`} />
        <span>{label}</span>
      </div>
      <div className="conn-url">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUrlChange(draft.trim());
              setEditing(false);
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
            <button type="submit">save</button>
          </form>
        ) : (
          <button className="link" onClick={() => setEditing(true)} title="Change bridge address">
            {url}
          </button>
        )}
      </div>
    </header>
  );
}
