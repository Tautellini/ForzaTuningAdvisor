import { useMemo, useState } from "react";
import { useTelemetry } from "./useTelemetry";
import { analyzeSession } from "./advice/engine";
import { loadTune, type CurrentTune } from "./tune";
import {
  DISCIPLINE_BY_ID,
  loadDiscipline,
  saveDiscipline,
  type DisciplineId,
} from "./discipline";
import { loadPriorities, savePriorities, type PriorityId } from "./priorities";
import { ConnectionBar } from "./components/ConnectionBar";
import { SessionBar } from "./components/SessionBar";
import { ModeSelector } from "./components/ModeSelector";
import { Dashboard } from "./components/Dashboard";
import { CarView } from "./components/CarView";
import { PowerCurveChart } from "./components/PowerCurveChart";
import { TractionBrakes } from "./components/TractionBrakes";
import { AdvicePanel } from "./components/AdvicePanel";
import { TunePanel } from "./components/TunePanel";
import { PriorityBar } from "./components/PriorityBar";

const DEFAULT_URL = "ws://127.0.0.1:5301";
const URL_KEY = "fta.bridgeUrl";

export default function App() {
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? DEFAULT_URL);
  const [tune, setTune] = useState<CurrentTune>(() => loadTune());
  const [discipline, setDiscipline] = useState<DisciplineId>(() => loadDiscipline());
  const [priorities, setPriorities] = useState<PriorityId[]>(() => loadPriorities());
  const { conn, latest, driving, hz, summary, reset } = useTelemetry(url);
  const profile = DISCIPLINE_BY_ID[discipline];
  const advice = useMemo(
    () => analyzeSession(summary, tune, profile, priorities),
    [summary, tune, profile, priorities],
  );

  const changeDiscipline = (id: DisciplineId) => {
    setDiscipline(id);
    saveDiscipline(id);
  };
  const changePriorities = (p: PriorityId[]) => {
    setPriorities(p);
    savePriorities(p);
  };

  const changeUrl = (u: string) => {
    setUrl(u);
    localStorage.setItem(URL_KEY, u);
  };

  const enoughData = (summary?.drivingFrames ?? 0) >= 120;

  return (
    <div className="app">
      <ConnectionBar conn={conn} driving={driving} hz={hz} url={url} onUrlChange={changeUrl} />

      <main className="layout">
        {conn !== "open" ? (
          <SetupHelp url={url} />
        ) : !latest ? (
          <Waiting message="Connected to the bridge — waiting for the first telemetry packet…" />
        ) : !summary && !driving ? (
          <Waiting message="Connected. Jump into a drive in Forza and your data will show up here." />
        ) : (
          <div className="content-wrap">
            <ModeSelector active={discipline} onChange={changeDiscipline} profile={profile} />
            <SessionBar summary={summary} onReset={reset} />
            <div className="topblock">
              {latest && <Dashboard t={latest} />}
              {latest && <CarView t={latest} />}
            </div>
            <div className="vizrow">
              <PowerCurveChart summary={summary} liveRpm={latest?.rpm.cur ?? 0} />
              <TractionBrakes summary={summary} tune={tune} />
            </div>
            <TunePanel tune={tune} onChange={setTune} />
            <div className="advice-wrap">
              <PriorityBar priorities={priorities} onChange={changePriorities} />
              <AdvicePanel advice={advice} enoughData={enoughData} />
            </div>
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
