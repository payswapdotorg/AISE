/**
 * ANCHOR-002 tests — the evaluation-stage reference-lane registration:
 *
 *   1. the declared constants match the FROZEN ANCHOR-001 evidence files
 *      (drift in either direction fails — declared, not sensed, but
 *      cross-checked against the frozen record);
 *   2. the profile validates 15/15 against the control plane;
 *   3. the lifecycle replays lawfully and ends at "benchmarked"
 *      (evaluation stage — NOT promoted, NOT a default provider);
 *   4. a promotion request TODAY answers the typed license-blocked refusal
 *      (the real-photoset production gate, enforced by the control plane);
 *   5. the committed registration artifacts re-derive byte-identically
 *      (drift fails `bun run verify`).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  validateProviderProfile,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
  replayRegistry,
} from "@aise/provider-registry";
import {
  ANCHOR001_AGGREGATE,
  ANCHOR001_COUNTS,
  ANCHOR001_INPUT_DIGEST,
  ANCHOR001_RUN_DIGEST,
  deriveReferenceLaneRegistration,
  evaluateReferenceLanePromotion,
  REFERENCE_LANE_PROVIDER_ID,
  REFERENCE_LANE_TECHNOLOGY_VERSION,
} from "./registration";
import { canonicalJsonStringify } from "@aise/shared-contracts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const ANCHOR001_RESULTS = join(
  REPO_ROOT,
  "docs",
  "productization-evidence",
  "ANCHOR-001",
  "results",
);
const ANCHOR002_REGISTRATION = join(
  REPO_ROOT,
  "docs",
  "productization-evidence",
  "ANCHOR-002",
  "registration",
);

describe("the declared constants match the frozen ANCHOR-001 evidence", () => {
  test("the input digest and run digests match reproducibility.json verbatim", () => {
    const reproducibility = JSON.parse(
      readFileSync(join(ANCHOR001_RESULTS, "reproducibility.json"), "utf8"),
    ) as {
      run1Digest: string;
      run2Digest: string;
      identical: boolean;
      inputDigestEcho: string;
    };
    expect(`sha256:${ANCHOR001_INPUT_DIGEST}`).toBe(reproducibility.inputDigestEcho);
    expect(`sha256:${ANCHOR001_RUN_DIGEST}`).toBe(reproducibility.run1Digest);
    expect(`sha256:${ANCHOR001_RUN_DIGEST}`).toBe(reproducibility.run2Digest);
    expect(reproducibility.identical).toBe(true);
  });

  test("the accuracy aggregate matches measurements.json verbatim", () => {
    const measurements = JSON.parse(
      readFileSync(join(ANCHOR001_RESULTS, "measurements.json"), "utf8"),
    ) as {
      accuracy: { aggregate: { meanRmseM: number; minRmseM: number; maxRmseM: number } };
      runtime: { run1WallMs: number; run2WallMs: number };
    };
    expect(ANCHOR001_AGGREGATE.meanRmseM).toBe(measurements.accuracy.aggregate.meanRmseM);
    expect(ANCHOR001_AGGREGATE.minRmseM).toBe(measurements.accuracy.aggregate.minRmseM);
    expect(ANCHOR001_AGGREGATE.maxRmseM).toBe(measurements.accuracy.aggregate.maxRmseM);
  });

  test("the counts match the frozen records (10/10 anchored, 9/9 fail-closed, 2 runs)", () => {
    const run1 = JSON.parse(
      readFileSync(join(ANCHOR001_RESULTS, "run-1.json"), "utf8"),
    ) as { status: string; hypotheses: unknown[] };
    const negatives = JSON.parse(
      readFileSync(join(ANCHOR001_RESULTS, "negative-cases.json"), "utf8"),
    ) as { cases: { pass: boolean }[] };
    expect(run1.status).toBe("anchored");
    expect(run1.hypotheses).toHaveLength(ANCHOR001_COUNTS.stillsAnchored);
    expect(negatives.cases).toHaveLength(ANCHOR001_COUNTS.negativesTotal);
    expect(negatives.cases.every((entry) => entry.pass)).toBe(true);
  });
});

describe("the evaluation-stage registration", () => {
  const registration = deriveReferenceLaneRegistration();

  test("the profile validates 15/15 against the control plane", () => {
    const validation = validateProviderProfile(registration.profile);
    expect(validation.ok).toBe(true);
  });

  test("the benchmark record validates and is content-addressed", () => {
    const validation = validateBenchmarkRecord(registration.record);
    expect(validation.ok).toBe(true);
    expect(registration.record.reproduction.inputsDigest).toBe(ANCHOR001_INPUT_DIGEST);
    expect(registration.record.metrics.some((m) => m.metric === "floorRegistrationRmseMean")).toBe(true);
  });

  test("the provenance manifest verifies by digest", () => {
    const verification = verifyProvenanceManifest(registration.manifest);
    expect(verification.ok).toBe(true);
  });

  test("the lifecycle is lawful, replayable, and ends at 'benchmarked' (evaluation stage)", () => {
    expect(registration.finalState).toBe("benchmarked");
    expect(registration.events.map((event) => event.kind)).toEqual([
      "provider-registered",
      "evaluation-started",
      "execution-normalized",
      "execution-normalized",
      "benchmark-recorded",
      "provenance-sealed",
    ]);
    const replay = replayRegistry(registration.events);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      const entry = replay.registry.entryOf(
        REFERENCE_LANE_PROVIDER_ID,
        REFERENCE_LANE_TECHNOLOGY_VERSION,
      );
      expect(entry?.state).toBe("benchmarked");
      expect(entry?.promotionDecision).toBeNull();
    }
  });

  test("the registration is NOT a promotion and NOT a default provider", () => {
    // no promotion-decided event exists; the entry has no promotion decision
    expect(registration.events.some((event) => event.kind === "promotion-decided")).toBe(false);
    const entry = registration.registry.entryOf(
      REFERENCE_LANE_PROVIDER_ID,
      REFERENCE_LANE_TECHNOLOGY_VERSION,
    );
    expect(entry?.promotionDecision).toBeNull();
    expect(entry?.profile.license.evaluationOnly).toBe(true);
  });

  test("a promotion request TODAY answers the typed license-blocked refusal (the real-photoset gate)", () => {
    const evaluation = evaluateReferenceLanePromotion();
    expect(evaluation.admitted).toBe(false);
    expect(evaluation.refusalKinds).toContain("license-blocked");
    expect(evaluation.refusalKinds).not.toContain("missing-benchmark-record");
    expect(evaluation.refusalKinds).not.toContain("missing-provenance-manifest");
  });

  test("the derivation is deterministic (two derivations produce identical canonical events)", () => {
    const second = deriveReferenceLaneRegistration();
    expect(canonicalJsonStringify(second.events)).toBe(
      canonicalJsonStringify(registration.events),
    );
    expect(canonicalJsonStringify(second.record)).toBe(
      canonicalJsonStringify(registration.record),
    );
    expect(second.manifest.manifestId).toBe(registration.manifest.manifestId);
  });
});

describe("the committed registration artifacts re-derive byte-identically (drift fails verify)", () => {
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

  for (const [name, value] of artifacts) {
    test(`${name} matches the committed artifact byte-identically`, () => {
      const committed = readFileSync(join(ANCHOR002_REGISTRATION, name), "utf8");
      expect(committed).toBe(canonicalJsonStringify(value));
    });
  }
});
