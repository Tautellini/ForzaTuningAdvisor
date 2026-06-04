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
import { SessionStrip } from "./components/SessionStrip";
import { ModeSelector } from "./components/ModeSelector";
import { LivePanel } from "./components/LivePanel";
import { PowerCurveChart } from "./components/PowerCurveChart";
import { TractionBrakes } from "./components/TractionBrakes";
import { Coverage } from "./components/Coverage";
import { AdvicePanel } from "./components/AdvicePanel";
import { TunePanel } from "./components/TunePanel";
import { PriorityBar } from "./components/PriorityBar";

const DEFAULT_URL = "ws://127.0.0.1:5301";
const URL_KEY = "fta.bridgeUrl";

function loadUrl(): string {
  const saved = localStorage.getItem(URL_KEY);
  if (saved && /^wss?:\/\/.+/.test(saved)) return saved;
  localStorage.removeItem(URL_KEY); // drop any corrupt value
  return DEFAULT_URL;
}

export default function App() {
  const [url, setUrl] = useState(loadUrl);
  const [tune, setTune] = useState<CurrentTune>(() => loadTune());
  const [discipline, setDiscipline] = useState<DisciplineId>(() => loadDiscipline());
  const [priorities, setPriorities] = useState<PriorityId[]>(() => loadPriorities());

  const tel = useTelemetry(url, discipline);
  const { conn, latest, driving, hz, rev, store } = tel;
  const profile = DISCIPLINE_BY_ID[discipline];

  // Everything derived from the store recomputes when rev bumps (live + actions).
  const computed = useMemo(() => store.computedSummary(), [store, rev]);
  const advice = useMemo(
    () => analyzeSession(computed, tune, profile, priorities),
    [computed, tune, profile, priorities],
  );

  const changeUrl = (u: string) => {
    setUrl(u);
    localStorage.setItem(URL_KEY, u);
  };
  const changeDiscipline = (id: DisciplineId) => {
    setDiscipline(id);
    saveDiscipline(id);
  };
  const changePriorities = (p: PriorityId[]) => {
    setPriorities(p);
    savePriorities(p);
  };

  const enoughData = (computed?.drivingFrames ?? 0) >= 120;

  return (
    <div className="app">
      <ConnectionBar conn={conn} driving={driving} hz={hz} url={url} onUrlChange={changeUrl} />

      <main className="layout">
        {conn !== "open" ? (
          <SetupHelp url={url} />
        ) : !latest ? (
          <Waiting message="Connected to the bridge — waiting for the first packet…" />
        ) : (
          <div className="content-wrap">
            <ModeSelector active={discipline} onChange={changeDiscipline} profile={profile} />
            <SessionStrip
              store={store}
              recording={store.recording}
              currentSamples={store.currentSamples}
              onEnd={tel.endCurrent}
              onDiscard={tel.discardCurrent}
              onToggle={tel.toggleInclude}
              onDelete={tel.deleteSession}
              onClear={tel.clearAll}
            />
            <LivePanel t={latest} />
            <div className="vizrow">
              <PowerCurveChart summary={computed} liveRpm={latest.rpm.cur} />
              <TractionBrakes summary={computed} tune={tune} />
            </div>
            <Coverage summary={computed} />
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
