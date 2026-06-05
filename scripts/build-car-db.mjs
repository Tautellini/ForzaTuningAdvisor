// Strips the scan metadata out of data/car_id_db.json and writes the slim
// runtime DB the UI fetches (ui/public/cars.json).
//
//   node scripts/build-car-db.mjs
//
// Keep the full scan JSON in data/ as the source of truth; re-run this after
// updating it.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "data", "car_id_db.json");
const out = join(root, "ui", "public", "cars.json");

const full = JSON.parse(readFileSync(src, "utf8"));

const slim = {};
let count = 0;
for (const [ordinal, car] of Object.entries(full)) {
  slim[ordinal] = {
    n: car.display_name,
    y: car.year,
    mk: car.make,
    md: car.model,
  };
  count++;
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(slim));
console.log(`Wrote ${count} cars to ${out} (${(JSON.stringify(slim).length / 1024).toFixed(1)} KB)`);
