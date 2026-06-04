import { useCallback, useEffect, useRef, useState } from "react";
import type { Telemetry } from "./types";
import type { DisciplineId } from "./discipline";
import { SessionStore } from "./sessions";

export type ConnState = "connecting" | "open" | "closed";

export interface TelemetryState {
  conn: ConnState;
  latest: Telemetry | null;
  driving: boolean;
  hz: number;
  /** Bumps whenever something the UI derives from the store may have changed. */
  rev: number;
  store: SessionStore;
  endCurrent: () => void;
  discardCurrent: () => void;
  toggleInclude: (id: string) => void;
  deleteSession: (id: string) => void;
  clearAll: () => void;
}

export function useTelemetry(url: string, discipline: DisciplineId): TelemetryState {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [driving, setDriving] = useState(false);
  const [hz, setHz] = useState(0);
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const store = useRef(new SessionStore());
  const disciplineRef = useRef(discipline);
  disciplineRef.current = discipline;
  const frameCount = useRef(0);

  const endCurrent = useCallback(() => {
    store.current.endCurrent();
    bump();
  }, [bump]);
  const discardCurrent = useCallback(() => {
    store.current.discardCurrent();
    bump();
  }, [bump]);
  const toggleInclude = useCallback(
    (id: string) => {
      store.current.toggleInclude(id);
      bump();
    },
    [bump],
  );
  const deleteSession = useCallback(
    (id: string) => {
      store.current.remove(id);
      bump();
    },
    [bump],
  );
  const clearAll = useCallback(() => {
    store.current.clearAll();
    bump();
  }, [bump]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let tickTimer: number | undefined;
    let hzTimer: number | undefined;
    let closed = false;

    const connect = () => {
      setConn("connecting");
      ws = new WebSocket(url);
      ws.onopen = () => setConn("open");
      ws.onmessage = (ev) => {
        let t: Telemetry;
        try {
          t = JSON.parse(ev.data as string) as Telemetry;
        } catch {
          return;
        }
        frameCount.current++;
        setLatest(t);
        setDriving(t.raceOn === 1);
        store.current.feed(t, disciplineRef.current);
      };
      ws.onclose = () => {
        setConn("closed");
        setDriving(false);
        store.current.endCurrent(); // bank whatever was recording
        if (!closed) reconnectTimer = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    tickTimer = window.setInterval(bump, 300); // refresh live-derived UI a few times/sec
    hzTimer = window.setInterval(() => {
      setHz(frameCount.current);
      frameCount.current = 0;
    }, 1000);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (tickTimer) clearInterval(tickTimer);
      if (hzTimer) clearInterval(hzTimer);
      ws?.close();
    };
  }, [url, bump]);

  return {
    conn,
    latest,
    driving,
    hz,
    rev,
    store: store.current,
    endCurrent,
    discardCurrent,
    toggleInclude,
    deleteSession,
    clearAll,
  };
}
