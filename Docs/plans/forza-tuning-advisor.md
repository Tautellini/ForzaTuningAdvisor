# ForzaTuningAdvisor — Development Spec (v1)

Status: drafted from grill-me session, 2026-06-04. Awaiting confirmation before implementation.

## Goal

Help **non-technical Forza Horizon 6 players** improve their car tunes by intercepting the
game's live telemetry and giving **directional tuning advice** ("stiffen the rear anti-roll bar",
"you're bottoming out — raise ride height") **while they drive**, with each recommendation tagged
by **confidence level** so noisy advice is never presented as fact.

The UI is a **static site deployed on GitHub Pages**. A small **local bridge** (shipped in two
interchangeable forms — see Architecture) does the part the browser physically cannot: receive UDP.

## Hard constraint that shapes everything

Forza streams telemetry as **raw UDP datagrams** to `127.0.0.1:5300` ("Data Out" feature, already
enabled on the user's machine). **Browsers cannot receive UDP** — there is no raw-UDP API in any
browser, and **WebAssembly does not change this** (WASM runs in the same sandbox and can only call
the same Web APIs as JS: fetch / WebSocket / WebRTC / WebTransport). WebTransport is UDP/QUIC
underneath but requires a real QUIC server with valid certs, not arbitrary game datagrams — not usable.

Therefore a local helper process is mandatory. It listens on UDP `:5300`, parses each packet, and
forwards the data as JSON over a **local WebSocket** the page connects to. Chromium and Firefox treat
`localhost` as a trustworthy origin, so an **HTTPS GitHub Pages page can connect to `ws://localhost`
without mixed-content errors** — the static-deployment goal is preserved; only the listener is local.

## Scope

### In scope (v1)
- Local UDP→WebSocket bridge, shipped in **both** forms (user decision — give technical users a
  readable script *and* non-technical users a one-click binary, same wire protocol so the UI works
  with either):
  - **Go single `.exe`** on GitHub Releases — double-click, no runtime install.
  - **PowerShell script** (`bridge.ps1` + `start-bridge.bat` launcher) — no compiled binary, fully
    human-readable source, no runtime install (PowerShell ships with Windows).
- Static **React + Vite** UI on GitHub Pages.
- **Live** dashboard + **live** tuning advice across **all telemetry-inferrable tune areas**.
- **Confidence levels** (high / medium / low) on every recommendation.
- A **raw-packet diagnostic mode** in the bridge (hex dump + parsed-field view) to confirm the FH6
  packet layout against real data.

### Out of scope (v1)
- Concrete numeric tune targets (e.g. "set front to 29.5 psi") — would require the user to enter
  their current tune, which telemetry does not contain. v1 is **directional cues only**. (Candidate v2.)
- Camber / toe alignment advice — **not supportable from the UDP feed** (see Data Model below).
- Mac/Linux bridge builds — **Windows only** for v1 (Forza PC is Windows).
- Code-signing the `.exe` — deferred; revisit before wide public release.
- Data logging / export, lap-time / sector analysis, post-session reports.

## User-facing behavior

1. Player downloads the bridge (their choice of `.exe` or script) and runs it. It shows a simple
   status: "Listening on :5300 — waiting for Forza…" → "Connected, receiving telemetry."
2. Player opens the GitHub Pages URL. The page auto-connects to `ws://localhost:<port>`. If it can't,
   it shows clear, non-technical help ("Is the bridge running? Click here for setup steps.").
3. While driving, the player sees a **live dashboard** (speed, RPM, gear, per-corner suspension
   travel, tire slip, G-force balance, etc.) and a **live advice panel** listing directional cues,
   each with a confidence badge.
4. Advice is debounced/aggregated over a short rolling window so it doesn't flicker corner-to-corner.
   (UX note: a player cannot read advice mid-corner — advice should persist and update calmly, not
   strobe. Treat "live" as "continuously updated and always current," not "new alert every frame.")

### Failure modes
- Bridge not running / port busy → UI shows a connection-help state, not a blank screen.
- Forza not sending (menus, paused) → "No telemetry — start driving" state; advice freezes/grays.
- Unknown/garbage packet length → bridge logs it, drops it, keeps running; diagnostic mode helps map.
- Stationary / pit / collision frames → advice engine ignores frames where the car isn't being driven
  meaningfully (e.g. speed below a threshold, or `IsRaceOn`/equivalent flag false).

## Architecture

```
Forza Horizon 6 ──UDP :5300──► Local Bridge ──ws://localhost:<port> (JSON)──► GitHub Pages UI (React)
                               (Go .exe OR PowerShell)                         live dashboard + advisor
```

- **Bridge responsibilities:** bind UDP `127.0.0.1:5300`; parse the Forza Data Out binary packet into
  named fields; emit normalized JSON frames over a WebSocket server (proposed `ws://localhost:5301`);
  expose a diagnostic mode (raw hex + parsed dump). Both implementations MUST emit the **same JSON
  schema** so the single UI works with either.
- **UI responsibilities:** connect to the WS, maintain a rolling buffer of recent frames, render the
  dashboard, run the **advice engine** (pure client-side TypeScript) over the buffer, render advice
  with confidence badges and connection/empty states.
- **Advice engine** lives in the browser (TypeScript), operating on the JSON frames — keeps the
  bridge dumb and the logic easy to iterate/deploy via Pages.

## Data model — what the Forza UDP "Data Out" feed actually contains

> ⚠️ Key finding from grilling: the UDP feed reports **one temperature per tire**, NOT
> inner/middle/outer sections. This means **camber/toe advice is NOT supportable from this feed**
> (it needs the inner-vs-outer temp spread, which only the *in-game* telemetry overlay exposes).
> The advice plan below is built around what the feed can genuinely prove.

FH6 packet layout is **unconfirmed** and must be verified (see Discovery). It is expected to closely
follow the documented FH5 / Forza "Dash" / "Horizon" Data Out layout, which includes (per-corner =
FL/FR/RL/RR):
- Tire slip ratio, **tire slip angle**, combined slip, per-corner tire temp (single value), tire wear
- **Normalized suspension travel** + suspension travel in meters
- Wheel rotation speed, wheel-on-rumble, wheel-in-puddle, surface rumble
- Engine RPM (idle/current/max), gear, throttle, brake, clutch, handbrake, steer
- Speed, power, torque
- World position, velocity (x/y/z), acceleration (x/y/z), angular velocity, yaw/pitch/roll
- `IsRaceOn`/timestamp-style flags, lap/race fields

## Tuning advice — confidence tiers (rebuilt around the real feed)

**High confidence** (strong, direct signals):
- **Gearing** — from RPM vs speed vs gear and shift behavior (hitting rev limiter, bogging on shifts).
- **Bottoming out → springs / ride height** — normalized suspension travel pinning at max.
- **Wheelspin → differential / power delivery** — driven-wheel rotation speed >> car speed under throttle.
- **Lockup → brake balance/pressure** — wheel rotation speed collapsing vs car speed under braking.

**Medium confidence** (balance inferences from slip angles & roll):
- **Understeer / oversteer balance** — front vs rear **slip angle** comparison → directional cues for
  ARBs, spring balance, diff. (This is the core of a telemetry-based Forza advisor.)
- **Anti-roll bars** — body roll + left/right suspension-travel delta through corners.
- **Tire temperature window** — overall per-tire temp trending too hot/cold (weak proxy for pressure;
  framed as "tires overheating" not precise psi advice).

**Low confidence** (noisy — show, but clearly marked):
- **Dampers (bump/rebound)** — inferred from suspension travel velocity/oscillation. Noisy; low badge.

**Not supported from this feed** (explicitly excluded so the tool never bluffs):
- **Camber, toe** — require per-section tire temps not present in UDP Data Out.

## Configuration surface
- Bridge: UDP listen port (default 5300), WS serve port (default 5301), diagnostic mode on/off.
- UI: WS URL (default `ws://localhost:5301`), advice smoothing window, confidence filter toggle
  (show all vs high-only), units (metric/imperial).

## Performance notes
- Forza emits ~60 packets/sec. Bridge parse is trivial; WS forwarding must keep up with no buffering
  backlog (drop-oldest if the page is slow).
- UI: render dashboard on rAF, throttle advice-engine evaluation to a few Hz over a rolling window —
  do NOT run heavy analysis every packet.

## Discovery / first task (FH6 format is unconfirmed)
1. Build the bridge's **diagnostic mode first**: capture real FH6 packets from the live `:5300` feed,
   dump length + hex, and try the FH5/Dash field offsets against them.
2. Confirm packet length and field offsets; document the **verified FH6 layout** before building advice.
3. Only then wire the JSON schema and the advice engine.

## Done criteria

**v1 target (user-stated): full advisor across all areas, live.** Concretely v1 is done when:
- Both bridges (Go `.exe` + PowerShell) receive FH6 UDP, parse a **verified** packet layout, and
  forward identical JSON over WS.
- GitHub Pages UI connects to either bridge and shows a live dashboard.
- Advice engine emits directional cues for **gearing, springs/ride height, diff, brakes, ARBs,
  understeer/oversteer balance, dampers, tire-temp window**, each with a high/medium/low confidence
  badge; camber/toe explicitly absent with a noted reason.
- Connection/empty/garbage failure states all behave gracefully.

**Recommended internal sequencing** (to de-risk the ambitious v1 — flagged, not a scope cut):
get raw data on screen → ship one high-confidence cue (gearing) end-to-end → expand to the rest.

## Open questions / flagged risks
- **Live + full + accurate is the hardest combination.** Suspension/damper advice is inherently
  noisy; mitigated via the confidence badges (user-approved).
- **FH6 format unverified** — entire pipeline depends on confirming the packet layout from live data.
- **Concrete numbers (v2)** would need a user-entered "current tune" form; deferred.
- **Code signing** for the `.exe` (SmartScreen/AV friction) — deferred to pre-release.
- WS port collision handling on the user's machine (fallback ports?) — minor, decide at build time.
```
