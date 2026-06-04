import { useCallback, useEffect, useRef, useState } from "react";
import type { Telemetry } from "./types";
import { SessionAggregator, type SessionSummary } from "./session";

export type ConnState = "connecting" | "open" | "closed";

export interface TelemetryState {
  conn: ConnState;
  latest: Telemetry | null;
  driving: boolean;
  hz: number;
  /** Accumulated session statistics (since last reset), refreshed a few times/sec. */
  summary: SessionSummary | null;
  /** Clear the accumulated session. */
  reset: () => void;
}

export function useTelemetry(url: string): TelemetryState {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [driving, setDriving] = useState(false);
  const [hz, setHz] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const agg = useRef(new SessionAggregator());
  const frameCount = useRef(0);

  const reset = useCallback(() => {
    agg.current.reset();
    setSummary(null);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let snapTimer: number | undefined;
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
        agg.current.add(t); // ignores idle frames internally
      };
      ws.onclose = () => {
        setConn("closed");
        setDriving(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    snapTimer = window.setInterval(() => setSummary(agg.current.summary()), 300);
    hzTimer = window.setInterval(() => {
      setHz(frameCount.current);
      frameCount.current = 0;
    }, 1000);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (snapTimer) clearInterval(snapTimer);
      if (hzTimer) clearInterval(hzTimer);
      ws?.close();
    };
  }, [url]);

  return { conn, latest, driving, hz, summary, reset };
}
