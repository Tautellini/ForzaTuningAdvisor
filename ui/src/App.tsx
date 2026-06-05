import { useMemo, useState } from "react";
import { useTelemetry } from "./useTelemetry";
import { analyzeSession, MIN } from "./advice/engine";
import type { CurrentTune } from "./tune";
import {
  DISCIPLINE_BY_ID,
  loadDiscipline,
  saveDiscipline,
  type DisciplineId,
} from "./discipline";
import { loadUnits, saveUnits, type Units } from "./units";
import { sessionEndMs } from "./garage/store";
import { carName } from "./carDb";
import { ConnectionBar, type AppView } from "./components/ConnectionBar";
import { SessionStrip } from "./components/SessionStrip";
import { CarStrip } from "./components/CarStrip";
import { Coverage } from "./components/Coverage";
import { TuneSection } from "./components/TuneSection";
import { GarageView } from "./components/GarageView";
import { SwitchBanner } from "./components/SwitchBanner";
import { EntryPage } from "./components/EntryPage";

const DEFAULT_URL = "ws://127.0.0.1:5301";
const URL_KEY = "fta.bridgeUrl";

function loadUrl(): string {
  const saved = localStorage.getItem(URL_KEY);
  if (saved && /^wss?:\/\/.+/.test(saved)) return saved;
  localStorage.removeItem(URL_KEY); // drop any corrupt value
  return DEFAULT_URL;
}

const EMPTY_TUNE: CurrentTune = {};

export default function App() {
  const [url, setUrl] = useState(loadUrl);
  const [view, setView] = useState<AppView>("live");
  const [discipline, setDiscipline] = useState<DisciplineId>(() => loadDiscipline());
  const [units, setUnits] = useState<Units>(() => loadUnits());

  const tel = useTelemetry(url, discipline);
  const { conn, latest, driving, hz, rev, garage, carDbOk } = tel;
  const profile = DISCIPLINE_BY_ID[discipline];

  // Everything below derives from the viewed car's workspace.
  const viewedOrdinal = garage.viewedOrdinal;
  const ws = garage.ready ? garage.viewedWorkspace() : null;
  const tune = ws?.tune ?? EMPTY_TUNE;

  // Recomputes when rev bumps (live frames, store actions, view switches).
  // Only the active mode's sessions feed the calculation.
  const computed = useMemo(
    () => garage.computedSummary(garage.viewedOrdinal, discipline),
    [garage, rev, discipline],
  );
  const advice = useMemo(
    () => analyzeSession(computed, tune, profile, units),
    [computed, tune, profile, units],
  );

  const changeUrl = (u: string) => {
    setUrl(u);
    localStorage.setItem(URL_KEY, u);
  };
  const changeDiscipline = (id: DisciplineId) => {
    garage.noteDiscipline(id); // banks a live recording from another mode
    setDiscipline(id);
    saveDiscipline(id);
  };
  const changeUnits = (u: Units) => {
    setUnits(u);
    saveUnits(u);
  };

  // Writes are instant; staleness is handled per lever (no archive prompt).
  const handleTuneChange = (t: CurrentTune) => {
    if (viewedOrdinal == null) return;
    garage.setTune(viewedOrdinal, t);
  };

  const enoughData = (computed?.drivingFrames ?? 0) >= MIN.frames;
  const pendingSwitch = garage.pendingSwitch();

  // Sessions recorded BEFORE the last sheet edit measured the old setup; the
  // next session start drops them (store.freshenPool), so the section only
  // hints that a fresh pool is coming.
  const editedAt = ws?.tuneEditedAt ?? 0;
  const hasPreEditSessions =
    editedAt > 0 && (ws?.sessions ?? []).some((x) => sessionEndMs(x) < editedAt);

  // The strip identifies the car being DRIVEN (sessions/tune below follow the viewed car).
  const stripOrdinal = driving && latest ? latest.car.ordinal : (garage.detectedOrdinal ?? viewedOrdinal);
  const stripBuild =
    driving && latest
      ? { pi: latest.car.pi, class: latest.car.class, drivetrain: latest.car.drivetrain }
      : stripOrdinal != null
        ? (garage.workspaces.get(stripOrdinal)?.build ?? null)
        : null;

  const drivetrain =
    ws?.build?.drivetrain ??
    ws?.sessions[0]?.drivetrain ??
    (driving && latest && latest.car.ordinal === viewedOrdinal ? latest.car.drivetrain : undefined);

  return (
    <div className="app">
      <ConnectionBar
        conn={conn}
        driving={driving}
        hz={hz}
        url={url}
        onUrlChange={changeUrl}
        units={units}
        onUnitsChange={changeUnits}
        view={view}
        onViewChange={setView}
      />

      <main className="layout">
        {garage.storageError && (
          <div className="storage-warn" role="alert">
            Saving to local storage failed — recent garage changes may be lost on reload. Export a
            backup (Garage → Export all) and free up disk/storage space.
          </div>
        )}
        {view === "garage" ? (
          <GarageView
            garage={garage}
            units={units}
            discipline={discipline}
            rev={rev}
            carDbOk={carDbOk}
            onGoLive={() => setView("live")}
          />
        ) : conn !== "open" ? (
          <EntryPage url={url} garage={garage} onOpenGarage={() => setView("garage")} />
        ) : !latest ? (
          <Waiting message="Connected to the bridge — waiting for the first packet…" />
        ) : (
          <div className="content-wrap">
            {pendingSwitch != null && (
              <SwitchBanner
                detected={pendingSwitch}
                viewed={viewedOrdinal}
                onSwitch={() => garage.confirmSwitch()}
                onDismiss={() => garage.dismissSwitch()}
              />
            )}
            <Coverage summary={computed} profile={profile} liveRpm={latest.rpm.cur} tune={tune} />
            <div className="advice-wrap">
              {viewedOrdinal != null && (
                <TuneSection
                  advice={advice}
                  enoughData={enoughData}
                  summary={computed}
                  tune={tune}
                  units={units}
                  profile={profile}
                  drivetrain={drivetrain}
                  carLabel={carName(viewedOrdinal)}
                  staleFields={ws?.staleFields ?? []}
                  hasPreEditSessions={hasPreEditSessions}
                  onChange={handleTuneChange}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {view === "live" && conn === "open" && latest && (
        <footer className="bottombar">
          <div className="bottombar-inner">
            <CarStrip t={latest} units={units} driving={driving} ordinal={stripOrdinal} build={stripBuild} />
            <div className="bottombar-sessions">
              {viewedOrdinal != null ? (
                <SessionStrip
                  sessions={ws?.sessions ?? []}
                  effective={garage.effectiveCount(viewedOrdinal, discipline)}
                  recording={garage.recordingFor(viewedOrdinal)}
                  currentSamples={garage.currentSamples}
                  driving={driving}
                  auto={garage.autoSession}
                  onAutoChange={(v) => garage.setAutoSession(v)}
                  armed={garage.isArmed}
                  onStart={() => garage.startManual()}
                  discipline={discipline}
                  onDisciplineChange={changeDiscipline}
                  onEnd={() => garage.endCurrent()}
                  onDiscard={() => garage.discardCurrent()}
                  onToggle={(id) => garage.toggleInclude(viewedOrdinal, id)}
                  onDelete={(id) => garage.removeSession(viewedOrdinal, id)}
                  onClear={() => garage.clearSessions(viewedOrdinal)}
                />
              ) : (
                <div className="sessionstrip">
                  <p className="muted ss-hint">Drive in Forza — your car is detected automatically.</p>
                </div>
              )}
            </div>
          </div>
        </footer>
      )}
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
