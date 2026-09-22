/**
 * HFX-000 — the benchmark result schema tests.
 *
 * Proves: content addressing (recordId derives from content; a hand-set
 * mismatching id is refused), the closed failure vocabulary enforcement in
 * failure observations, the deterministic reproduction statement shape, and
 * the comparability key HFX-401's scorecard will join on.
 */

import { describe, expect, test } from "bun:test";
import {
  benchmarkComparabilityKey,
  benchmarkRecordDigestOf,
  deriveBenchmarkRecordId,
  validateBenchmarkRecord,
} from "./benchmark";
import type { BenchmarkRecord } from "./benchmark";
import {
  REFERENCE_BENCHMARK_ID,
  REFERENCE_CAPABILITY,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  runReferenceBenchmark,
} from "./testkit";

function referenceRecordV1(): BenchmarkRecord {
  const body = runReferenceBenchmark(referenceProviderProfileV1());
  return { ...body, recordId: deriveBenchmarkRecordId(body) };
}

describe("the reference benchmark records", () => {
  test("validate cleanly and are content-addressed", () => {
    const record = referenceRecordV1();
    const validation = validateBenchmarkRecord(record);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.record.recordId).toBe(record.recordId);
      expect(validation.record.recordId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("intake accepts a record WITHOUT an id and derives it", () => {
    const record = referenceRecordV1();
    const body = { ...record } as Record<string, unknown>;
    delete body["recordId"];
    const validation = validateBenchmarkRecord(body);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.record.recordId).toBe(
        deriveBenchmarkRecordId(record),
      );
    }
  });

  test("identical inputs derive identical record ids (determinism)", () => {
    expect(referenceRecordV1().recordId).toBe(referenceRecordV1().recordId);
  });

  test("v1 and v2 records of the same benchmark are COMPARABLE rows", () => {
    const v1Body = runReferenceBenchmark(referenceProviderProfileV1());
    const v2Body = runReferenceBenchmark(referenceProviderProfileV2());
    const v1 = { ...v1Body, recordId: deriveBenchmarkRecordId(v1Body) };
    const v2 = { ...v2Body, recordId: deriveBenchmarkRecordId(v2Body) };
    expect(benchmarkComparabilityKey(v1)).toBe(benchmarkComparabilityKey(v2));
    expect(benchmarkComparabilityKey(v1)).toBe(`${REFERENCE_BENCHMARK_ID}|${REFERENCE_CAPABILITY}`);
    expect(v1.recordId).not.toBe(v2.recordId);
    // v1 is the better provider: exact reproduction of the documented truth
    const mae = (record: BenchmarkRecord): number =>
      record.metrics.find((metric) => metric.metric === "depth_mae_m")?.value ?? Number.NaN;
    expect(mae(v1)).toBe(0);
    expect(mae(v2)).toBe(0.125);
  });
});

describe("typed negative paths", () => {
  test("a hand-set mismatching recordId is a typed record-id-mismatch refusal", () => {
    const record = referenceRecordV1();
    const validation = validateBenchmarkRecord({ ...record, recordId: "0".repeat(64) });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.kind).toBe("record-id-mismatch");
      expect(validation.failures[0]?.detail).toContain("content-addressed");
    }
  });

  test("an invented failure observation kind is a typed vocabulary-violation", () => {
    const record = referenceRecordV1();
    const validation = validateBenchmarkRecord({
      ...record,
      failureObservations: [{ kind: "hallucination-failure", detail: "made up" }],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failure = validation.failures.find((f) => f.kind === "vocabulary-violation");
      expect(failure?.path).toBe("failureObservations[0].kind");
    }
  });

  test("a missing failureObservations field is a typed missing-field failure (an empty list is honest)", () => {
    const body: Record<string, unknown> = { ...referenceRecordV1() };
    delete body["failureObservations"];
    const validation = validateBenchmarkRecord(body);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((f) => f.kind === "missing-field")).toBe(true);
    }
  });

  test("a non-digest reproduction inputsDigest is a typed digest-format failure", () => {
    const record = referenceRecordV1();
    const validation = validateBenchmarkRecord({
      ...record,
      reproduction: { ...record.reproduction, inputsDigest: "not-a-digest" },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((f) => f.kind === "digest-format" && f.path === "reproduction.inputsDigest"),
      ).toBe(true);
    }
  });

  test("an empty metrics list is a typed empty-list failure (a record is never silent)", () => {
    const record = referenceRecordV1();
    const validation = validateBenchmarkRecord({ ...record, metrics: [] });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((f) => f.kind === "empty-list" && f.path === "metrics"),
      ).toBe(true);
    }
  });

  test("a non-object payload answers not-an-object", () => {
    for (const payload of [null, 7, "record", []]) {
      const validation = validateBenchmarkRecord(payload);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.failures[0]?.kind).toBe("not-an-object");
      }
    }
  });
});

describe("digests carried by manifests", () => {
  test("the full-record digest is deterministic and differs across versions", () => {
    const v1Body = runReferenceBenchmark(referenceProviderProfileV1());
    const v2Body = runReferenceBenchmark(referenceProviderProfileV2());
    const v1 = { ...v1Body, recordId: deriveBenchmarkRecordId(v1Body) };
    const v2 = { ...v2Body, recordId: deriveBenchmarkRecordId(v2Body) };
    expect(benchmarkRecordDigestOf(v1)).toBe(benchmarkRecordDigestOf(v1));
    expect(benchmarkRecordDigestOf(v1)).not.toBe(benchmarkRecordDigestOf(v2));
  });
});
