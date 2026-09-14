/**
 * AISE-019 — benchmark runner + report assembly + reproducibility.
 *
 * `runBenchmarks(engines, fixtures, options)` is deterministic: engine and
 * fixture array order are part of the input; metric math is pure; the ONLY
 * nondeterminism is the report `generatedAt` timestamp, produced by an
 * INJECTED clock (options.now — the clock is used for the timestamp ONLY).
 *
 * Failure behavior (never crashes the run): engine exceptions become
 * ENGINE_EXCEPTION failure entries; reconstructions that are non-finite,
 * have non-unit normals, or MISS any ground-truth subject become
 * INVALID_RECONSTRUCTION / MISSING_RECONSTRUCTION failure entries — the
 * other fixtures of the same engine are still evaluated.
 *
 * Reproducibility: `reproducibilityDigest` = sha256 over canonical JSON of
 * the report with `generatedAt` (and the digest itself) stripped — mutating
 * the timestamp never changes the digest. `BenchmarkReport.assertReproducible`
 * compares two reports (digest + canonical structure).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { vecNorm } from "../geometry";
import { computeFixtureMetrics } from "./metrics";
import { evaluateGates, GATE_THRESHOLD_VERSION } from "./gates";
import {
  FIXTURE_PROVENANCE,
  REPORT_SCHEMA_VERSION,
  type BenchmarkFailureCode,
  type BenchmarkFailureEntry,
  type BenchmarkOutcome,
  type BenchmarkReport,
  type DigestibleReport,
  type EngineBenchmarkSummary,
  type FixtureEvaluation,
  type FixtureMetrics,
  type GateViolationRef,
  type GoldenFixture,
  type ReconstructionUnderTest,
  type ReconstructedScene,
} from "./model";

export interface RunBenchmarkOptions {
  /** Injected clock — report timestamp ONLY (never metric math). */
  readonly now?: () => string;
}

const DEFAULT_NOW = (): string => new Date().toISOString();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate a reconstructed scene against the fixture's ground-truth
 * coverage. Returns failure entries (empty when valid): non-finite values /
 * non-unit normals → INVALID_RECONSTRUCTION; absent subjects →
 * MISSING_RECONSTRUCTION. A fixture with any failure entry contributes NO
 * metric instances (absence is an explicit record, never silently skipped —
 * R17).
 */
function validateScene(
  fixture: GoldenFixture,
  scene: ReconstructedScene,
): readonly { readonly code: BenchmarkFailureCode; readonly detail: string }[] {
  const invalid: string[] = [];
  const missing: string[] = [];
  for (const entry of scene.planes) {
    const norm = vecNorm(entry.plane.normal);
    const d = entry.plane.d;
    if (!isFiniteNumber(norm) || Math.abs(norm - 1) > 1e-6 || !isFiniteNumber(d)) {
      invalid.push(
        `plane ${entry.surfaceId}: non-finite or non-unit normal (|n|=${isFiniteNumber(norm) ? norm.toFixed(9) : "non-finite"}, d=${isFiniteNumber(d) ? d.toFixed(9) : "non-finite"})`,
      );
    }
  }
  for (const dimension of scene.dimensions) {
    if (!isFiniteNumber(dimension.measuredM)) {
      invalid.push(`dimension ${dimension.dimensionId}: non-finite measured value`);
    }
  }
  for (const volume of scene.objectVolumes) {
    if (!isFiniteNumber(volume.measuredVolumeM3)) {
      invalid.push(`object ${volume.objectId}: non-finite measured volume`);
    }
  }
  const planeIds = new Set(scene.planes.map((entry) => entry.surfaceId));
  for (const surface of fixture.groundTruth.surfaces) {
    if (!planeIds.has(surface.surfaceId)) {
      missing.push(`missing reconstructed plane for surface ${surface.surfaceId}`);
    }
  }
  const dimensionIds = new Set(scene.dimensions.map((entry) => entry.dimensionId));
  for (const dimension of fixture.groundTruth.dimensions) {
    if (!dimensionIds.has(dimension.dimensionId)) {
      missing.push(`missing measured dimension ${dimension.dimensionId}`);
    }
  }
  const objectIds = new Set(scene.objectVolumes.map((entry) => entry.objectId));
  for (const volume of fixture.groundTruth.objectVolumes) {
    if (!objectIds.has(volume.objectId)) {
      missing.push(`missing measured volume for object ${volume.objectId}`);
    }
  }
  const entries: { readonly code: BenchmarkFailureCode; readonly detail: string }[] = [];
  if (invalid.length > 0) {
    entries.push({ code: "INVALID_RECONSTRUCTION", detail: invalid.join("; ") });
  }
  if (missing.length > 0) {
    entries.push({ code: "MISSING_RECONSTRUCTION", detail: missing.join("; ") });
  }
  return entries;
}

function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) {
    return `${thrown.name}: ${thrown.message}`;
  }
  return `thrown non-error value: ${String(thrown)}`;
}

/** Run every engine over every fixture and assemble the report. */
export function runBenchmarks(
  engines: readonly ReconstructionUnderTest[],
  fixtures: readonly GoldenFixture[],
  options: RunBenchmarkOptions = {},
): BenchmarkReport {
  const now = options.now ?? DEFAULT_NOW;
  const engineSummaries: EngineBenchmarkSummary[] = [];
  const allCritical: GateViolationRef[] = [];
  const allNonCritical: GateViolationRef[] = [];
  const allFailures: BenchmarkFailureEntry[] = [];

  for (const engine of engines) {
    const evaluations: FixtureEvaluation[] = [];
    const violations: GateViolationRef[] = [];
    const failures: BenchmarkFailureEntry[] = [];
    for (const fixture of fixtures) {
      let scene: ReconstructedScene;
      try {
        scene = engine.reconstruct(fixture);
      } catch (thrown) {
        const failure: BenchmarkFailureEntry = {
          engineId: engine.providerId,
          engineVersion: engine.version,
          fixtureId: fixture.fixtureId,
          deviceClass: fixture.deviceClass,
          code: "ENGINE_EXCEPTION",
          detail: describeThrown(thrown),
        };
        failures.push(failure);
        evaluations.push({ kind: "failure", failure });
        continue;
      }
      const sceneFailures = validateScene(fixture, scene).map((failure) => ({
        ...failure,
        engineId: engine.providerId,
        engineVersion: engine.version,
        fixtureId: fixture.fixtureId,
        deviceClass: fixture.deviceClass,
      }));
      if (sceneFailures.length > 0) {
        failures.push(...sceneFailures);
        evaluations.push({ kind: "failure", failure: sceneFailures[0] as BenchmarkFailureEntry });
        continue;
      }
      const metrics: FixtureMetrics = computeFixtureMetrics(fixture, scene);
      const gateViolations = evaluateGates(metrics.metrics, {
        engineId: engine.providerId,
        engineVersion: engine.version,
        fixtureId: fixture.fixtureId,
        deviceClass: fixture.deviceClass,
      });
      violations.push(...gateViolations);
      evaluations.push({ kind: "metrics", metrics });
    }
    allCritical.push(...violations.filter((violation) => violation.critical));
    allNonCritical.push(...violations.filter((violation) => !violation.critical));
    allFailures.push(...failures);
    engineSummaries.push({
      providerId: engine.providerId,
      version: engine.version,
      overall: engineOutcome(violations, failures),
      fixtureEvaluations: evaluations,
      violations,
      failureEntries: failures,
    });
  }

  const overall: BenchmarkOutcome =
    allCritical.length > 0 || allFailures.length > 0
      ? "FAIL"
      : allNonCritical.length > 0
        ? "PASS_WITH_NOTES"
        : "PASS";

  // Digest preimage: everything EXCEPT the injected-clock timestamp (and the
  // digest itself) — mutating generatedAt never changes the digest.
  const digestible: DigestibleReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    fixtureProvenance: FIXTURE_PROVENANCE,
    gateThresholdVersion: GATE_THRESHOLD_VERSION,
    engineCount: engines.length,
    fixtureCount: fixtures.length,
    engines: engineSummaries,
    overall,
    criticalViolations: allCritical,
    nonCriticalViolations: allNonCritical,
    failureEntries: allFailures,
  };
  return {
    ...digestible,
    generatedAt: now(),
    reproducibilityDigest: sha256Hex(canonicalJsonStringify(digestible)),
  };
}

function engineOutcome(
  violations: readonly GateViolationRef[],
  failures: readonly BenchmarkFailureEntry[],
): BenchmarkOutcome {
  if (violations.some((violation) => violation.critical) || failures.length > 0) {
    return "FAIL";
  }
  return violations.length > 0 ? "PASS_WITH_NOTES" : "PASS";
}
