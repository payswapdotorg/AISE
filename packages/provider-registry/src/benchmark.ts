/**
 * HFX-000 — the benchmark result schema.
 *
 * A `BenchmarkRecord` is the machine-readable outcome of running ONE
 * provider (providerId + technologyVersion) against ONE pinned benchmark
 * (benchmarkId) for ONE capability. Per the layer-hardening governing rule,
 * the record carries:
 *
 *   - METRIC VALUES comparable across providers of the same capability:
 *     same `benchmarkId` + `capability` + metric names ⇒ comparable rows
 *     (the HFX-401 scorecard joins on them);
 *   - FAILURE OBSERVATIONS from the CLOSED vocabulary (failures.ts) — the
 *     hook HFX-202/203/204 consume to distinguish perception, retrieval,
 *     reasoning, unsupported-data and operation-semantic failures;
 *   - RESOURCE OBSERVATIONS (compute/memory/latency) — DECLARED values, in
 *     the deterministic-control-plane spirit: the record states what was
 *     observed by the runner, it never senses anything at validation time;
 *   - the DETERMINISTIC REPRODUCTION statement: the inputs digest + the
 *     code version — enough to replay the run bit-identically.
 *
 * The record is content-addressed: `recordId` is sha-256 over the canonical
 * JSON of the record's semantic projection. Profiles reference records by
 * this id (benchmarkResults) — scores are NEVER inlined into profiles.
 *
 * This is a RESULT SCHEMA around benchmark records — NOT a benchmark
 * runner. The existing engine (backend/api/src/benchmarks/) stays the
 * runner authority; HFX-000 builds the registry around records.
 */

import { isFailureKind, type FailureKind } from "./failures";
import { isDigest, sha256Canonical } from "./digest";

export const BENCHMARK_RECORD_KIND = "provider-benchmark-record" as const;
export const BENCHMARK_RECORD_SCHEMA_VERSION = "provider-benchmark/1" as const;

/** One metric value (comparable across providers of the same capability). */
export interface BenchmarkMetric {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly subjectId?: string;
  readonly detail: string;
}

/** One failure observation, from the CLOSED vocabulary only. */
export interface BenchmarkFailureObservation {
  readonly kind: FailureKind;
  readonly detail: string;
}

/** Declared resource observations (compute/memory/latency profiles). */
export interface ResourceObservations {
  readonly compute: string;
  readonly memoryMiB: number;
  readonly latencyMsP50: number;
  readonly latencyMsP95: number;
}

/** The deterministic reproduction statement (inputs digest + code version). */
export interface BenchmarkReproduction {
  readonly inputsDigest: string;
  readonly codeVersion: string;
  readonly statement: string;
}

/** The benchmark result record (content-addressed by `recordId`). */
export interface BenchmarkRecord {
  readonly kind: typeof BENCHMARK_RECORD_KIND;
  readonly schemaVersion: typeof BENCHMARK_RECORD_SCHEMA_VERSION;
  readonly recordId: string;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly benchmarkId: string;
  readonly capability: string;
  readonly metrics: readonly BenchmarkMetric[];
  readonly failureObservations: readonly BenchmarkFailureObservation[];
  readonly resourceObservations: ResourceObservations;
  readonly reproduction: BenchmarkReproduction;
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

export const BENCHMARK_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "empty-list",
  "vocabulary-violation",
  "digest-format",
  "record-id-mismatch",
] as const;
export type BenchmarkValidationFailureKind = (typeof BENCHMARK_VALIDATION_FAILURE_KINDS)[number];

export interface BenchmarkValidationFailure {
  readonly kind: BenchmarkValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type BenchmarkRecordValidation =
  | { readonly ok: true; readonly record: BenchmarkRecord }
  | { readonly ok: false; readonly failures: readonly BenchmarkValidationFailure[] };

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/** The semantic projection hashed into a record's `recordId`. */
export function benchmarkRecordIdentityInput(record: Omit<BenchmarkRecord, "recordId">): unknown {
  return {
    kind: BENCHMARK_RECORD_KIND,
    providerId: record.providerId,
    technologyVersion: record.technologyVersion,
    benchmarkId: record.benchmarkId,
    capability: record.capability,
    metrics: record.metrics,
    failureObservations: record.failureObservations,
    resourceObservations: record.resourceObservations,
    reproduction: record.reproduction,
  };
}

/** Derives the deterministic content address of a benchmark record. */
export function deriveBenchmarkRecordId(record: Omit<BenchmarkRecord, "recordId">): string {
  return sha256Canonical(benchmarkRecordIdentityInput(record));
}

/** sha-256 over the full canonical record (digests carried by manifests). */
export function benchmarkRecordDigestOf(record: BenchmarkRecord): string {
  return sha256Canonical(record);
}

/**
 * The comparability key: records with the same key carry metrics that are
 * comparable across providers (same pinned benchmark + same capability).
 */
export function benchmarkComparabilityKey(record: BenchmarkRecord): string {
  return `${record.benchmarkId}|${record.capability}`;
}

/* ------------------------------------------------------------------ */
/* The pure validator                                                   */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates an unknown payload as a `BenchmarkRecord`. PURE, typed
 * failures, no throws. `recordId` may be ABSENT on intake — the validator
 * derives it (the returned record always carries the derived id); a
 * PRESENT recordId must match the derivation (`record-id-mismatch`).
 */
export function validateBenchmarkRecord(input: unknown): BenchmarkRecordValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a benchmark record must be a JSON object" },
      ],
    };
  }

  const failures: BenchmarkValidationFailure[] = [];
  const fail = (kind: BenchmarkValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== BENCHMARK_RECORD_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${BENCHMARK_RECORD_KIND}'`);
  }
  if (input["schemaVersion"] !== BENCHMARK_RECORD_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${BENCHMARK_RECORD_SCHEMA_VERSION}'`,
    );
  }
  for (const path of ["providerId", "technologyVersion", "benchmarkId", "capability"]) {
    const value = input[path];
    if (!isNonEmptyString(value) || value.length > 256) {
      fail("type-mismatch", path, "expected a non-empty string (max 256)");
    }
  }

  /* Metrics --------------------------------------------------------- */

  const metrics = input["metrics"];
  if (!Array.isArray(metrics) || metrics.length === 0) {
    fail("empty-list", "metrics", "at least one metric value is required — a record is never silent");
  } else if (metrics.length > 256) {
    fail("value-out-of-range", "metrics", "more than 256 metric values");
  } else {
    for (const [index, entry] of (metrics as unknown[]).entries()) {
      const path = `metrics[${index}]`;
      if (!isRecord(entry)) {
        fail("type-mismatch", path, "expected a metric object");
        continue;
      }
      if (!isNonEmptyString(entry["metric"]) || (entry["metric"] as string).length > 128) {
        fail("type-mismatch", `${path}.metric`, "expected a non-empty metric name (max 128)");
      }
      if (!isFiniteNumber(entry["value"])) {
        fail("type-mismatch", `${path}.value`, "expected a finite number");
      } else if (Math.abs(entry["value"]) > 1e12) {
        fail("value-out-of-range", `${path}.value`, "metric magnitude above 1e12");
      }
      if (!isNonEmptyString(entry["unit"]) || (entry["unit"] as string).length > 64) {
        fail("type-mismatch", `${path}.unit`, "expected a non-empty unit (max 64)");
      }
      if (entry["subjectId"] !== undefined && !isNonEmptyString(entry["subjectId"])) {
        fail("type-mismatch", `${path}.subjectId`, "subjectId, when present, must be a non-empty string");
      }
      if (!isNonEmptyString(entry["detail"])) {
        fail("type-mismatch", `${path}.detail`, "expected a non-empty deterministic detail");
      }
    }
  }

  /* Failure observations (closed vocabulary) -------------------------- */

  const failureObservations = input["failureObservations"];
  if (failureObservations === undefined) {
    fail("missing-field", "failureObservations", "the field is required (an empty list is honest)");
  } else if (!Array.isArray(failureObservations)) {
    fail("type-mismatch", "failureObservations", "expected an array of failure observations");
  } else if (failureObservations.length > 256) {
    fail("value-out-of-range", "failureObservations", "more than 256 failure observations");
  } else {
    for (const [index, entry] of (failureObservations as unknown[]).entries()) {
      const path = `failureObservations[${index}]`;
      if (!isRecord(entry)) {
        fail("type-mismatch", path, "expected a failure observation object");
        continue;
      }
      if (!isFailureKind(entry["kind"])) {
        fail(
          "vocabulary-violation",
          `${path}.kind`,
          `'${String(entry["kind"])}' is not in the CLOSED failure vocabulary — benchmark records cannot invent failure kinds`,
        );
      }
      if (!isNonEmptyString(entry["detail"])) {
        fail("type-mismatch", `${path}.detail`, "expected a non-empty deterministic detail");
      }
    }
  }

  /* Resource observations --------------------------------------------- */

  const resources = input["resourceObservations"];
  if (isRecord(resources)) {
    if (!isNonEmptyString(resources["compute"]) || (resources["compute"] as string).length > 256) {
      fail("type-mismatch", "resourceObservations.compute", "expected a non-empty compute statement (max 256)");
    }
    for (const field of ["memoryMiB", "latencyMsP50", "latencyMsP95"] as const) {
      const value = resources[field];
      if (!isFiniteNumber(value)) {
        fail("type-mismatch", `resourceObservations.${field}`, "expected a finite number");
      } else if (value < 0 || value > 1e12) {
        fail("value-out-of-range", `resourceObservations.${field}`, "outside [0, 1e12]");
      }
    }
  } else {
    fail("type-mismatch", "resourceObservations", "expected the resource observations object");
  }

  /* Reproduction statement --------------------------------------------- */

  const reproduction = input["reproduction"];
  if (isRecord(reproduction)) {
    if (!isDigest(reproduction["inputsDigest"])) {
      fail(
        "digest-format",
        "reproduction.inputsDigest",
        "expected the sha-256 inputs digest (64 lowercase hex) — the deterministic reproduction statement pins the benchmark inputs",
      );
    }
    if (!isNonEmptyString(reproduction["codeVersion"]) || (reproduction["codeVersion"] as string).length > 256) {
      fail("type-mismatch", "reproduction.codeVersion", "expected a non-empty code version (max 256)");
    }
    if (!isNonEmptyString(reproduction["statement"])) {
      fail("type-mismatch", "reproduction.statement", "expected a non-empty reproduction statement");
    }
  } else {
    fail("type-mismatch", "reproduction", "expected the deterministic reproduction statement object");
  }

  /* Content address ---------------------------------------------------- */

  const declaredRecordId = input["recordId"];
  if (
    declaredRecordId !== undefined &&
    (!isNonEmptyString(declaredRecordId) || !isDigest(declaredRecordId))
  ) {
    fail("digest-format", "recordId", "recordId, when present, must be the 64-hex content address");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  // Post-validation trusted cast; fill the derived record id.
  const withoutId = input as unknown as Omit<BenchmarkRecord, "recordId">;
  const derivedRecordId = deriveBenchmarkRecordId(withoutId);
  if (declaredRecordId !== undefined && declaredRecordId !== derivedRecordId) {
    return {
      ok: false,
      failures: [
        {
          kind: "record-id-mismatch",
          path: "recordId",
          detail: `the declared recordId does not match the deterministic content address (derived ${derivedRecordId}) — records are content-addressed, never hand-numbered`,
        },
      ],
    };
  }

  const record: BenchmarkRecord = { ...withoutId, recordId: derivedRecordId };
  return { ok: true, record };
}
