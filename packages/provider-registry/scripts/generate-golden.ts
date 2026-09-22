/**
 * HFX-000 — one-off golden-fixture generator (committed output).
 *
 * Regenerates the reference-lifecycle goldens under fixtures/
 * DETERMINISTICALLY (canonical JSON: recursively sorted keys, 2-space
 * indent, trailing newline) from the pure testkit world:
 *
 *   reference-provider-v1.profile.json           the promotable v1 profile
 *   reference-provider-v2.profile.json           the license-blocked v2 profile
 *   reference-provider-v1.benchmark-record.json  the v1 benchmark record
 *   reference-provider-v2.benchmark-record.json  the v2 benchmark record
 *   reference-provider-v1.provenance-manifest.json  the v1 sealed manifest
 *   reference-provider-v2.provenance-manifest.json  the v2 sealed manifest
 *   reference-lifecycle.json                     the full exit-gate event log
 *                                                 + final derived entries
 *
 * Run: `bun scripts/generate-golden.ts` from the package root — the
 * committed files regenerate BYTE-IDENTICALLY (no clock, no randomness, no
 * network). lifecycle.test.ts asserts exactly that.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  deriveBenchmarkRecordId,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  runReferenceBenchmark,
  runReferenceLifecycle,
} from "../src/index";
import type { ProviderRegistryEvent, RegistryEntry } from "../src/index";

const FIXTURES = join(import.meta.dir, "..", "fixtures");

function writeGolden(name: string, value: unknown): void {
  writeFileSync(join(FIXTURES, name), canonicalJsonStringify(value));
}

const v1Profile = referenceProviderProfileV1();
const v2Profile = referenceProviderProfileV2();
const v1RecordBody = runReferenceBenchmark(v1Profile);
const v2RecordBody = runReferenceBenchmark(v2Profile);
const lifecycle = runReferenceLifecycle();

writeGolden("reference-provider-v1.profile.json", v1Profile);
writeGolden("reference-provider-v2.profile.json", v2Profile);
writeGolden("reference-provider-v1.benchmark-record.json", {
  ...v1RecordBody,
  recordId: deriveBenchmarkRecordId(v1RecordBody),
});
writeGolden("reference-provider-v2.benchmark-record.json", {
  ...v2RecordBody,
  recordId: deriveBenchmarkRecordId(v2RecordBody),
});
writeGolden("reference-provider-v1.provenance-manifest.json", lifecycle.v1Manifest);
writeGolden("reference-provider-v2.provenance-manifest.json", lifecycle.v2Manifest);

interface LifecycleGolden {
  readonly summary: {
    readonly exitGate: string;
    readonly v1FinalState: string;
    readonly v2FinalState: string;
    readonly v2RefusalKinds: readonly string[];
    readonly eventCount: number;
  };
  readonly events: readonly ProviderRegistryEvent[];
  readonly finalEntries: readonly RegistryEntry[];
}

const golden: LifecycleGolden = {
  summary: {
    exitGate:
      "registration → evaluation → execution → normalized result → benchmark → provenance → promotion decision " +
      "(v1 promoted; v2 license-blocked) — without changing canonical AISE semantics",
    v1FinalState: lifecycle.v1Entry.state,
    v2FinalState: lifecycle.v2Entry.state,
    v2RefusalKinds: lifecycle.v2Entry.promotionDecision?.refusals.map((refusal) => refusal.kind) ?? [],
    eventCount: lifecycle.events.length,
  },
  events: lifecycle.events,
  finalEntries: [lifecycle.v1Entry, lifecycle.v2Entry],
};
writeGolden("reference-lifecycle.json", golden);

process.stdout.write("goldens written:\n");
for (const name of [
  "reference-provider-v1.profile.json",
  "reference-provider-v2.profile.json",
  "reference-provider-v1.benchmark-record.json",
  "reference-provider-v2.benchmark-record.json",
  "reference-provider-v1.provenance-manifest.json",
  "reference-provider-v2.provenance-manifest.json",
  "reference-lifecycle.json",
]) {
  process.stdout.write(`  fixtures/${name}\n`);
}
