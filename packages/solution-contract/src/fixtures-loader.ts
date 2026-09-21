/**
 * Committed-fixture loader (PROD-021).
 *
 * The ONLY module of this package that touches the filesystem: it reads the
 * committed fixture corpus (`fixtures/<family>/<Object>.<kind>.json`) into
 * plain fixture records for bun-based consumers (tests now; the PROD-022
 * solution engine and PROD-024 adapter conformance later). The contract
 * logic itself (schemas, codec, negotiation, traces, invariants) performs
 * no I/O — non-TypeScript consumers mirror the checks against the same
 * committed files plus the committed JSON Schemas.
 *
 * Deterministic: reads only committed files; no network, no clock, no
 * randomness. Kind classification follows the shared naming convention:
 * `*.invalid-*` → invalid, `*.version-mismatch` → version-mismatch,
 * everything else → valid.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SolutionFixtureRecord {
  readonly objectName: string;
  readonly kind: "valid" | "invalid" | "version-mismatch";
  readonly fileName: string;
  readonly payload: unknown;
}

export interface SolutionFixtureCorpus {
  readonly fixtures: readonly SolutionFixtureRecord[];
}

const PACKAGE_ROOT = join(import.meta.dir, "..");
const FIXTURES_ROOT = join(PACKAGE_ROOT, "fixtures");

/**
 * Loads every committed fixture as a corpus record, in deterministic
 * (family, file) sorted order.
 */
export function loadCommittedFixtures(): SolutionFixtureCorpus {
  const fixtures: SolutionFixtureRecord[] = [];
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
