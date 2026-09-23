/**
 * PROD-031 — the COMMITTED SEEDED JOURNEY RECORD generator (the browser
 * mount's record source, §4.6 of the work order).
 *
 * WHY A COMMITTED RECORD: the composed golden journey's record carries the
 * engine's identity derivations (operation ids, state ids, the journeyId
 * seal — sha-256 over canonical JSON through `node:crypto`), so a plain
 * BROWSER cannot recompute it (the bundle externalizes node:crypto — the
 * PROD-031 defect). The browser mount therefore renders the SAME record
 * the Node rung computes, COMMITTED ONCE as data: this generator runs the
 * ONE runner (`runComposedJourney` over the seeded demo world — the same
 * call `seededJourneyResource()` makes) and writes its record verbatim.
 *
 * ONE RECORD, NO SECOND SERIALIZATION: `solution-journey-record.test.ts`
 * pins the parity — the committed JSON must deep-equal (and canonically
 * serialize identically to) the live Node run of the SAME runner. A drift
 * (a world/script/engine change) fails the test; the fix is to re-run:
 *
 *   bun apps/web/src/app/solution-journey-record.generate.ts
 *
 * (deterministic — the runner is pure over the committed world; the same
 * bytes always come out). The browser mount imports the JSON as DATA
 * (bundler-inlined, crypto-free); it never imports this module.
 */

import { runComposedJourney, seededJourneyWorld } from "./solution-journey";

const record = (await runComposedJourney(seededJourneyWorld(), "mixed")).record;
await Bun.write(
  import.meta.dir + "/solution-journey-record.json",
  JSON.stringify(record, null, 2) + "\n",
);
// eslint-disable-next-line no-console -- the generator is a command-line script (the solution-benchmark.ts precedent): its stdout IS its interface
console.log(
  `wrote solution-journey-record.json (journeyId ${record.journeyId.slice(0, 16)}…, ` +
    `${record.steps.length} steps)`,
);
