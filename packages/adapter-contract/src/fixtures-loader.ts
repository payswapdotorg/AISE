/**
 * Committed-fixture loader (PROD-016).
 *
 * The ONLY module of this package that touches the filesystem: it reads the
 * committed fixture corpus (`fixtures/<family>/<Object>.<kind>.json`) into
 * the data form the pure conformance harness consumes
 * (`ConformanceCorpus`). The harness itself (conformance.ts) performs no
 * I/O — non-TypeScript consumers (Android) mirror the checks against the
 * same committed files using `CONFORMANCE_CHECKS`.
 *
 * Deterministic: reads only committed files; no network, no clock, no
 * randomness. Kind classification follows the shared-contracts naming
 * convention: `*.invalid-*` → invalid, `*.version-mismatch` →
 * version-mismatch, everything else → valid.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterFixtureRecord, ConformanceCorpus } from "./conformance";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const FIXTURES_ROOT = join(PACKAGE_ROOT, "fixtures");

/**
 * Loads every committed fixture as a corpus record, in deterministic
 * (family, file) sorted order.
 */
export function loadCommittedFixtures(): ConformanceCorpus {
  const fixtures: AdapterFixtureRecord[] = [];
  for (const family of readdirSync(FIXTURES_ROOT).sort()) {
    for (const file of readdirSync(join(FIXTURES_ROOT, family)).sort()) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const kind = file.includes(".invalid-")
        ? "invalid"
        : file.includes(".version-mismatch")
          ? "version-mismatch"
          : "valid";
      fixtures.push({
        objectName: file.replace(/\..*$/, ""),
        kind,
        fileName: `${family}/${file}`,
        payload: JSON.parse(readFileSync(join(FIXTURES_ROOT, family, file), "utf8")),
      });
    }
  }
  return { fixtures };
}
