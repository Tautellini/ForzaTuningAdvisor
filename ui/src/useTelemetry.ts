import { useEffect, useRef, useState } from "react";
import type { Telemetry } from "./types";

export type ConnState = "connecting" | "open" | "closed";

export interface TelemetryState {
  conn: ConnState;
  /** Latest frame, or null before the first one arrives. */
  latest: Telemetry | null;
  /** Rolling buffer of recent frames (oldest first) for the advice engine. */
  history: Telemetry[];
  /** True when we're connected AND the game is actively sending driving data. */
  driving: boolean;
  /** packets/sec estimate from the feed. */
  hz: number;
}

const HISTORY_MS = 8000; // keep ~8s of frames for trend-based advice

export function useTelemetry(url: string, historyMs = HISTORY_MS): TelemetryState {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [driving, setDriving] = useState(false);
  const [hz, setHz] = useState(0);

  // History lives in a ref (mutated at 60Hz) and is snapshotted for consumers
  // a few times per second to avoid re-rendering the whole tree every frame.
  const historyRef = useRef<Telemetry[]>([]);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const frameCount = useRef(0);

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

        // Only buffer real driving frames; idle frames are all-zero noise.
        if (t.raceOn === 1) {
          const buf = historyRef.current;
          buf.push(t);
          const cutoff = t.t - historyMs;
          while (buf.length > 1 && buf[0].t < cutoff) buf.shift();
        }
      };

      ws.onclose = () => {
        setConn("closed");
        setDriving(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 1500);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    // Snapshot history ~6x/sec for the advice engine.
    snapTimer = window.setInterval(() => {
      setHistory(historyRef.current.slice());
    }, 160);

    // Estimate feed rate once per second.
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
  }, [url, historyMs]);

  return { conn, latest, history, driving, hz };
}
