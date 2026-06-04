# ForzaTuningAdvisor

Live tuning advice for **Forza Horizon 6**, in your browser. It reads the game's telemetry while
you drive and gives **directional tuning cues** (e.g. "front wheels locking under braking — shift
brake balance rearward"), each tagged with a **confidence level**.

🔗 **Web app:** https://tautellini.github.io/ForzaTuningAdvisor/ (after the first Pages deploy)

## How it works

Browsers can't read Forza's UDP telemetry directly, so there are two parts:

```
Forza Horizon 6 ──UDP :5300──► local bridge ──ws://localhost:5301──► web UI (this page)
```

- **The bridge** is a tiny program you run on your PC. It listens to Forza's "Data Out" feed and
  forwards it to the browser over a local WebSocket. Pick whichever you trust more:
  - `bridge/powershell/bridge.ps1` — readable PowerShell script, no install, nothing compiled.
  - a single `.exe` (built via CI, see Releases) — double-click, for non-technical users.
- **The UI** is a static site (React + Vite) hosted on GitHub Pages. Nothing about your data leaves
  your machine — the page talks only to your local bridge.

## Quick start

1. **Turn on telemetry in Forza:** Settings → HUD/Gameplay → **Data Out** → On,
   IP `127.0.0.1`, Port `5300`.
2. **Run the bridge** (PowerShell):
   ```powershell
   powershell -ExecutionPolicy Bypass -File bridge/powershell/bridge.ps1
   ```
   You should see `WS out : ws://127.0.0.1:5301` and a packet-rate line once Forza is running.
3. **Open the web app** (link above) and start driving. Advice appears after a few seconds.

## What it can and can't advise

The UDP feed exposes **symptoms, not your current tune**, so advice is **directional** (v1), not
exact numbers.

| Confidence | Areas |
|---|---|
| High | Gearing (rev limiter), springs/ride height (bottoming out), differential (wheelspin), brakes (lockup & balance) |
| Medium | Under/oversteer balance (slip angles), wheel unloading |
| Low | Tire-temperature window (no pressure data, so it's a hint) |
| Not possible | **Camber/toe** — the feed reports only one temperature per tire |

See [`Docs/forza-data-format.md`](Docs/forza-data-format.md) for the verified FH6 packet layout and
[`Docs/plans/forza-tuning-advisor.md`](Docs/plans/forza-tuning-advisor.md) for the full spec.

## Develop

```bash
cd ui
npm install
npm run dev      # http://localhost:5173  (connects to ws://127.0.0.1:5301 by default)
```

The UI auto-deploys to GitHub Pages on every push to `main` that touches `ui/`.
