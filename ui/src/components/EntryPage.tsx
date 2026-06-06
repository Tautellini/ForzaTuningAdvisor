import { useState } from "react";
import type { GarageStore } from "../garage/store";

const REPO = "https://github.com/Tautellini/ForzaTuningAdvisor";
const RUN_CMD = "powershell -ExecutionPolicy Bypass -File .\\bridge.ps1";

/**
 * Landing / no-connection view. Doubles as first-time onboarding: explains
 * the tool, hands out the bridge script and shows the live search status.
 * App switches to the dashboard automatically the moment the bridge connects,
 * so this page only ever renders the "searching" state.
 */
export function EntryPage({
  url,
  garage,
  onOpenGarage,
}: {
  url: string;
  garage: GarageStore;
  onOpenGarage: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const carCount = garage.ready ? garage.ordinalsWithData().size : 0;
  const scriptHref = `${import.meta.env.BASE_URL}bridge.ps1`;

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(RUN_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the command is selectable text */
    }
  };

  return (
    <div className="entry">
      {/* ---- hero -------------------------------------------------------- */}
      <section className="entry-hero">
        <p className="entry-eyebrow">Forza Horizon 6 · live telemetry</p>
        <h1>Forza Tuning Advisor</h1>
        <p className="entry-tagline">
          Drive — your car's telemetry turns into concrete setup fixes. Balance, gearing, brakes,
          differential and aero, diagnosed from what the car actually does on the road.
        </p>
        <div className="entry-status" role="status">
          <span className="entry-radar" aria-hidden="true" />
          <span>
            searching for the bridge at <code>{url}</code>
          </span>
        </div>
        <p className="entry-autoswitch">
          This page switches to the live dashboard by itself the moment the bridge connects.
        </p>
        <div className="entry-ctas">
          <a className="entry-btn primary" href={scriptHref} download="bridge.ps1">
            ⬇ Download the bridge (.ps1)
          </a>
          <a className="entry-btn ghost" href={REPO} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
          {carCount > 0 && (
            <button className="entry-btn ghost" onClick={onOpenGarage}>
              Open your garage · {carCount} car{carCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </section>

      {/* ---- the pipeline ------------------------------------------------ */}
      <section className="entry-pipesec" aria-label="How the data flows">
        <div className="pipe">
          <div className="pipe-node">
            <span className="pipe-node-title">Forza Horizon 6</span>
            <span className="pipe-node-sub">Data Out · UDP :5300</span>
          </div>
          <div className="pipe-link on" aria-hidden="true">
            <span className="pkt" />
            <span className="pkt" />
            <span className="pkt" />
          </div>
          <div className="pipe-node missing">
            <span className="pipe-node-title">bridge.ps1</span>
            <span className="pipe-node-sub">not running yet</span>
          </div>
          <div className="pipe-link off" aria-hidden="true" />
          <div className="pipe-node">
            <span className="pipe-node-title">This page</span>
            <span className="pipe-node-sub">{url.replace(/^wss?:\/\//, "ws ")}</span>
          </div>
        </div>
        <p className="pipe-caption">
          Browsers can't receive UDP, so a tiny PowerShell script forwards the game's telemetry to
          this page. Both ports bind to <code>127.0.0.1</code> — nothing ever leaves your machine.
        </p>
      </section>

      {/* ---- quick start -------------------------------------------------- */}
      <section className="entry-steps">
        <h2>Up and running in two minutes</h2>
        <div className="steps-grid">
          <div className="step">
            <span className="step-n" aria-hidden="true">
              1
            </span>
            <h3>Turn on telemetry</h3>
            <p>
              In Forza: <b>Settings → HUD &amp; Gameplay → Data Out</b>. Set IP{" "}
              <code>127.0.0.1</code> and port <code>5300</code>.
            </p>
          </div>
          <div className="step">
            <span className="step-n" aria-hidden="true">
              2
            </span>
            <h3>Run the bridge</h3>
            <p>
              Download <code>bridge.ps1</code> above, then in its folder:
            </p>
            <div className="step-cmd">
              <code>{RUN_CMD}</code>
              <button className="step-copy" onClick={copyCmd} title="Copy command">
                {copied ? "✓ copied" : "copy"}
              </button>
            </div>
            <p className="step-foot">
              Or right-click the file → <i>Run with PowerShell</i>. ~230 lines of readable script —
              no install, no admin rights.
            </p>
          </div>
          <div className="step">
            <span className="step-n" aria-hidden="true">
              3
            </span>
            <h3>Drive</h3>
            <p>
              The page connects on its own. Advice builds as you corner, brake and pull through the
              gears — coverage bars show exactly what data is still missing.
            </p>
          </div>
        </div>
      </section>

      {/* ---- what you get -------------------------------------------------- */}
      <section className="entry-features">
        <h2>What the telemetry unlocks</h2>
        <div className="feat-grid">
          <div className="feat">
            <h3>Balance, by corner phase</h3>
            <p>Under- or oversteer on entry, mid and exit — with the ARB, diff or aero lever that actually fixes it.</p>
          </div>
          <div className="feat">
            <h3>Shift points that fit your build</h3>
            <p>Optimal shift RPM per gear, computed from your measured power curve, not a generic table.</p>
          </div>
          <div className="feat">
            <h3>Brakes that stop locking</h3>
            <p>Lockup detection tells pressure problems apart from balance problems and gives exact targets.</p>
          </div>
          <div className="feat">
            <h3>Five disciplines</h3>
            <p>Road, Dirt, Offroad, Drift and Drag each get their own thresholds, pressure windows and rules.</p>
          </div>
          <div className="feat">
            <h3>A garage that remembers</h3>
            <p>Per-car tunes, recorded sessions and archived setups — exportable as files, importable anywhere.</p>
          </div>
          <div className="feat">
            <h3>Evidence over guesswork</h3>
            <p>No rule fires off a single corner. Every verdict needs minutes of real driving and says why it triggered.</p>
          </div>
        </div>
      </section>

      {/* ---- why measured advice beats shared tunes ----------------------- */}
      <section className="entry-why" aria-label="Why measured advice">
        <h2>Why not just download a tune?</h2>
        <div className="why-grid">
          <div className="why-card">
            <h3>Tunes you can find</h3>
            <ul>
              <li>
                Leaderboard meta: bars at 1/1, springs on the minimum stop, ride height maxed.
                Wins a speed trap, hates a corner.
              </li>
              <li>
                Generic guide values, the same numbers for every car regardless of weight,
                drivetrain or balance.
              </li>
              <li>Locked to their creator in-game, so you can't look inside the good ones to learn.</li>
            </ul>
          </div>
          <div className="why-card own">
            <h3>What your telemetry says</h3>
            <ul>
              <li>Measured from your car, your build, on the surface you actually race.</li>
              <li>
                Every card names the lever, the direction and, with your sheet entered, the exact
                value.
              </li>
              <li>Data has no opinion: each verdict shows the evidence that triggered it.</li>
            </ul>
          </div>
        </div>
        <p className="why-caveat">
          It's still a game and telemetry isn't a perfect picture of real car behavior. Treat the
          advice as a well-founded direction, not a lap-time guarantee.
        </p>
      </section>

      {/* ---- FAQ (mirrors the FAQPage structured data in index.html) ------ */}
      <section className="entry-faq">
        <h2>Questions</h2>
        <details>
          <summary>Is my telemetry uploaded anywhere?</summary>
          <p>
            No. The bridge binds to <code>127.0.0.1</code> only and all analysis runs in your
            browser. Telemetry never leaves your PC.
          </p>
        </details>
        <details>
          <summary>Why does it need a PowerShell script?</summary>
          <p>
            Browsers cannot receive UDP. Forza broadcasts telemetry as UDP packets, so a small
            readable PowerShell script (the bridge) parses them and hands them to the page over a
            local WebSocket. No install, no admin rights.
          </p>
        </details>
        <details>
          <summary>Does it modify the game?</summary>
          <p>
            No. It only listens to the telemetry stream Forza itself offers (the Data Out setting).
            No game files are touched and nothing is injected.
          </p>
        </details>
        <details>
          <summary>What advice does it give?</summary>
          <p>
            Setup fixes grounded in measurements: under/oversteer balance split by corner phase,
            optimal shift points from your measured power curve, brake pressure and balance,
            differential, aero, springs and damping hints — per discipline (Road, Dirt, Offroad,
            Drift, Drag).
          </p>
        </details>
        <details>
          <summary>Which platforms are supported?</summary>
          <p>
            The game and the bridge must run on the same Windows PC. The bridge listens on
            localhost only, so a console cannot reach it.
          </p>
        </details>
      </section>

      <footer className="entry-foot">
        <span>
          Free &amp; open source — <a href={REPO}>github.com/Tautellini/ForzaTuningAdvisor</a>
        </span>
        <span className="entry-foot-legal">
          Fan-made tool. Not affiliated with Playground Games, Turn 10 or Microsoft. Forza is a
          trademark of Microsoft.
        </span>
      </footer>
    </div>
  );
}
