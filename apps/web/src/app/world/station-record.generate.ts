/**
 * WORLD-P5 — the station record REGENERATOR (the PROD-031 pattern).
 *
 * Re-runs the Node-side station binding and writes the committed
 * `station-record.json` (pretty-printed, sorted-key-stable). The
 * headless test pins LIVE ≡ COMMITTED (LAW 1); this script is the
 * maintenance path when a composed fixture changes.
 *
 *   bun apps/web/src/app/world/station-record.generate.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildStationRecord } from "./record";

const record = buildStationRecord();
const outPath = resolve(import.meta.dir, "station-record.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
// eslint-disable-next-line no-console -- the generator is a command-line script (the PROD-031 precedent): its stdout IS its interface
console.log(
  `station-record.json regenerated: station ${record.stationId}, ` +
    `${String(record.elements.length)} elements, ` +
    `${String(record.viewport.boxes.length)} declared viewport boxes, ` +
    `${String(record.hud.panels.length)} panels → ${outPath}`,
);
