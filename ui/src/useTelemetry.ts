import { useCallback, useEffect, useRef, useState } from "react";
import type { Telemetry } from "./types";
import type { DisciplineId } from "./discipline";
import { GarageStore } from "./garage/store";
import { loadCarDb } from "./carDb";

export type ConnState = "connecting" | "open" | "closed";

export interface TelemetryState {
  conn: ConnState;
  latest: Telemetry | null;
  driving: boolean;
  hz: number;
  /** Bumps whenever something the UI derives from the garage may have changed. */
  rev: number;
  /** Garage storage finished loading (recording starts only after this). */
  ready: boolean;
  /** Car-name DB: null = loading, false = failed (names fall back to ordinals). */
  carDbOk: boolean | null;
  garage: GarageStore;
  bump: () => void;
}

export function useTelemetry(url: string, discipline: DisciplineId): TelemetryState {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [driving, setDriving] = useState(false);
  const [hz, setHz] = useState(0);
  const [rev, setRev] = useState(0);
  const [ready, setReady] = useState(false);
  const [carDbOk, setCarDbOk] = useState<boolean | null>(null);
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const garage = useRef<GarageStore | null>(null);
  if (!garage.current) garage.current = new GarageStore(bump);

  const disciplineRef = useRef(discipline);
  disciplineRef.current = discipline;
  const frameCount = useRef(0);
  const sawFrame = useRef(false); // frames since the last UI tick

  useEffect(() => {
    void garage.current!.init().then(() => setReady(true));
    loadCarDb()
      .then(() => setCarDbOk(true))
      .catch(() => setCarDbOk(false));
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let tickTimer: number | undefined;
    let hzTimer: number | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      setConn("connecting");
      let sock: WebSocket;
      try {
        sock = new WebSocket(url);
      } catch {
        reconnectTimer = window.setTimeout(connect, 1500);
        return;
      }
      ws = sock;
      // Every handler checks it still speaks for the CURRENT socket — a dying
      // socket's late events must never stomp the state of its replacement
      // (that exact race showed "Bridge not found" while connected).
      sock.onopen = () => {
        if (!closed && ws === sock) setConn("open");
      };
      sock.onmessage = (ev) => {
        if (closed || ws !== sock) return;
        let t: Telemetry;
        try {
          t = JSON.parse(ev.data as string) as Telemetry;
        } catch {
          return;
        }
        frameCount.current++;
        sawFrame.current = true;
        setLatest(t);
        setDriving(t.raceOn === 1);
        garage.current!.feed(t, disciplineRef.current);
      };
      sock.onclose = () => {
        if (closed || ws !== sock) return; // torn down or superseded
        setConn("closed");
        setDriving(false);
        garage.current!.endCurrent(); // bank whatever was recording
        reconnectTimer = window.setTimeout(connect, 1500);
      };
      sock.onerror = () => sock.close(); // close THIS socket, never a newer one
    };

    connect();

    // Refresh live-derived UI a few times/sec — but only when frames actually
    // arrived; store actions bump() directly, so an idle app recomputes nothing.
    tickTimer = window.setInterval(() => {
      if (sawFrame.current) {
        sawFrame.current = false;
        bump();
      }
    }, 300);
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

  return { conn, latest, driving, hz, rev, ready, carDbOk, garage: garage.current, bump };
}
