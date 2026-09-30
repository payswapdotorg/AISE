/**
 * ANCHOR-002 — the deterministic registration-artifact generator.
 *
 * Regenerates the committed evaluation-stage registration artifacts under
 * `docs/productization-evidence/ANCHOR-002/registration/` from the same
 * declared inputs the drift test re-derives (`src/registration.ts`): the
 * profile, the benchmark record, the provenance manifest and the lifecycle.
 * The committed artifacts and the derivation are asserted byte-identical by
 * `src/registration.test.ts` — drift in either direction fails
 * `bun run verify`.
 *
 * Run: bun scripts/generate-registration.ts   (exit 0 on success; errors throw)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { deriveReferenceLaneRegistration } from "../src/registration";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const OUT_DIR = join(
  REPO_ROOT,
  "docs",
  "productization-evidence",
  "ANCHOR-002",
  "registration",
);

const registration = deriveReferenceLaneRegistration();

const artifacts: ReadonlyArray<[string, unknown]> = [
  ["profile.json", registration.profile],
  ["benchmark-record.json", registration.record],
  ["provenance-manifest.json", registration.manifest],
  [
    "lifecycle.json",
    {
      events: registration.events,
      finalEntries: registration.registry.entries,
      summary: {
        eventCount: registration.events.length,
        finalState: registration.finalState,
        promotion:
          "NOT attempted — the production adapter is gated on a real-photoset evidence run; " +
          "a promotion request today answers the typed license-blocked refusal",
      },
    },
  ],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, value] of artifacts) {
  writeFileSync(join(OUT_DIR, name), canonicalJsonStringify(value));
}
