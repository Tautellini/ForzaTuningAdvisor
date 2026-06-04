import { useMemo, useState } from "react";
import { useTelemetry } from "./useTelemetry";
import { analyze } from "./advice/engine";
import { ConnectionBar } from "./components/ConnectionBar";
import { Dashboard } from "./components/Dashboard";
import { AdvicePanel } from "./components/AdvicePanel";

const DEFAULT_URL = "ws://127.0.0.1:5301";
const URL_KEY = "fta.bridgeUrl";

export default function App() {
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? DEFAULT_URL);
  const { conn, latest, history, driving, hz } = useTelemetry(url);
  const advice = useMemo(() => analyze(history), [history]);

  const changeUrl = (u: string) => {
    setUrl(u);
    localStorage.setItem(URL_KEY, u);
  };

  return (
    <div className="app">
      <ConnectionBar conn={conn} driving={driving} hz={hz} url={url} onUrlChange={changeUrl} />

      <main className="layout">
        {conn !== "open" ? (
          <SetupHelp url={url} />
        ) : !latest ? (
          <Waiting message="Connected to the bridge — waiting for the first telemetry packet…" />
        ) : !driving && history.length === 0 ? (
          <Waiting message="Connected. Jump into a drive in Forza and your data will show up here." />
        ) : (
          <div className="content">
            {latest && <Dashboard t={latest} />}
            <AdvicePanel advice={advice} enoughData={history.length >= 30} />
          </div>
        )}
      </main>
    </div>
  );
}

function Waiting({ message }: { message: string }) {
  return (
    <div className="panel center">
      <div className="spinner" />
      <p>{message}</p>
    </div>
  );
}

function SetupHelp({ url }: { url: string }) {
  return (
    <div className="panel setup">
      <h2>Can't reach the bridge</h2>
      <p>
        This page reads Forza telemetry through a small local helper (the <b>bridge</b>) running on
        your PC. Browsers can't read the game's UDP feed directly, so the bridge does it and forwards
        the data here.
      </p>
      <ol>
        <li>
          In Forza: <b>Settings → HUD/Gameplay → Data Out</b> → <b>On</b>, IP <code>127.0.0.1</code>,
          Port <code>5300</code>.
        </li>
        <li>
          Run the bridge on your PC (the PowerShell script or the <code>.exe</code> from the
          project's releases). It should say it's listening on <code>{url}</code>.
        </li>
        <li>This page reconnects automatically once the bridge is up.</li>
      </ol>
      <p className="muted">
        Trying to connect to <code>{url}</code>. Click the address in the top bar to change it.
      </p>
    </div>
  );
}
