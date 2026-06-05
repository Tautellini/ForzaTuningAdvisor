// Copies the bridge script into ui/public so the deployed site serves the
// exact script version it was built with at <site>/bridge.ps1 (the entry
// page's download button). Runs automatically via predev/prebuild in
// ui/package.json; the copy is gitignored — bridge/powershell is the source.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "bridge", "powershell", "bridge.ps1");
const dst = join(root, "ui", "public", "bridge.ps1");
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log("copy-bridge: bridge/powershell/bridge.ps1 -> ui/public/bridge.ps1");
