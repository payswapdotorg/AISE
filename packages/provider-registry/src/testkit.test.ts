/**
 * HFX-000 — the deterministic reference provider tests.
 *
 * Proves: the fixture provider is pure deterministic (identical runs are
 * byte-identical), v1 is the better version (exact truth reproduction),
 * v2 carries its measurable bias, the unsupported-data negative path is
 * an explicit closed-vocabulary refusal, and the benchmark world is
 * reproducible.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  REFERENCE_INPUT_SAMPLES,
  REFERENCE_V2_EVEN_INDEX_BIAS_M,
  executeReferenceProvider,
  referenceDepthTruth,
  referenceInput,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  referenceUnsupportedInput,
  runReferenceBenchmark,
} from "./testkit";
import { deriveBenchmarkRecordId, inputDigestOf } from "./index";

describe("the fixture world (documented, deterministic)", () => {
  test("the canonical input is the fixed 4×4 sample grid", () => {
    expect(REFERENCE_INPUT_SAMPLES).toHaveLength(16);
    const input = referenceInput();
    expect(input.capability).toBe("fixture-depth-estimation");
    expect(input.payload["gridWidth"]).toBe(4);
    expect(input.payload["gridHeight"]).toBe(4);
    expect(input.payload["samples"]).toHaveLength(16);
    for (const sample of input.payload["samples"] as number[]) {
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  test("the documented truth maps [0,1] onto [0.5,3.0] meters", () => {
    const truth = referenceDepthTruth();
    expect(truth).toHaveLength(16);
    expect(truth[0]).toBe(0.5);
    expect(truth[4]).toBe(3.0);
  });
});

describe("deterministic execution", () => {
  test("identical executions are byte-identical (no clock, no randomness)", () => {
    for (const profile of [referenceProviderProfileV1(), referenceProviderProfileV2()]) {
      const first = executeReferenceProvider(profile, referenceInput());
      const second = executeReferenceProvider(profile, referenceInput());
      expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
    }
  });

  test("v1 reproduces the documented truth exactly (the better version)", () => {
    const execution = executeReferenceProvider(referenceProviderProfileV1(), referenceInput());
    expect(execution.outputs?.["depthMap"]).toEqual(referenceDepthTruth());
    expect(execution.outputs?.["unit"]).toBe("m");
  });

  test("v2 carries the deterministic +0.25 m even-index bias (measurably worse)", () => {
    const execution = executeReferenceProvider(referenceProviderProfileV2(), referenceInput());
    const depthMap = execution.outputs?.["depthMap"] as number[];
    const truth = referenceDepthTruth();
    for (const [index, value] of depthMap.entries()) {
      const expected = index % 2 === 0 ? truth[index]! + REFERENCE_V2_EVEN_INDEX_BIAS_M : truth[index]!;
      expect(value).toBe(expected);
    }
  });

  test("the unsupported scene answers the explicit closed-vocabulary refusal — never fabricated depths", () => {
    for (const profile of [referenceProviderProfileV1(), referenceProviderProfileV2()]) {
      const execution = executeReferenceProvider(profile, referenceUnsupportedInput());
      expect(execution.outputs).toBeUndefined();
      expect(execution.failure?.kind).toBe("unsupported-data");
      expect(execution.failure?.detail).toContain("unsupported:thermal-only-capture");
    }
  });

  test("the opaque native payload declares the engine identity for provenance", () => {
    const execution = executeReferenceProvider(referenceProviderProfileV1(), referenceInput());
    expect(execution.providerNative?.mediaType).toBe("application/aise-fixture-depth+json");
    expect((execution.providerNative?.payload as Record<string, unknown>)["engine"]).toBe(
      "fixture-depth-engine",
    );
  });
});

describe("the deterministic benchmark", () => {
  test("v1 metrics: exact reproduction (mae 0, max error 0)", () => {
    const body = runReferenceBenchmark(referenceProviderProfileV1());
    const metrics = Object.fromEntries(body.metrics.map((metric) => [metric.metric, metric.value]));
    expect(metrics["depth_mae_m"]).toBe(0);
    expect(metrics["depth_max_error_m"]).toBe(0);
    expect(metrics["unsupported_scene_refusal_rate"]).toBe(1);
  });

  test("v2 metrics: the bias is measured (mae 0.125, max error 0.25)", () => {
    const body = runReferenceBenchmark(referenceProviderProfileV2());
    const metrics = Object.fromEntries(body.metrics.map((metric) => [metric.metric, metric.value]));
    expect(metrics["depth_mae_m"]).toBe(0.125);
    expect(metrics["depth_max_error_m"]).toBe(0.25);
  });

  test("the benchmark records the hard-negative failure observation from the closed vocabulary", () => {
    const body = runReferenceBenchmark(referenceProviderProfileV1());
    expect(body.failureObservations).toHaveLength(1);
    expect(body.failureObservations[0]?.kind).toBe("unsupported-data");
    expect(body.failureObservations[0]?.detail).toContain("hard-negative");
  });

  test("the reproduction statement pins the input digest and code version", () => {
    const body = runReferenceBenchmark(referenceProviderProfileV1());
    expect(body.reproduction.inputsDigest).toBe(inputDigestOf(referenceInput()));
    expect(body.reproduction.codeVersion).toBe("fixture-depth-testkit/1");
  });

  test("identical benchmark runs derive identical record ids", () => {
    expect(deriveBenchmarkRecordId(runReferenceBenchmark(referenceProviderProfileV1()))).toBe(
      deriveBenchmarkRecordId(runReferenceBenchmark(referenceProviderProfileV1())),
    );
  });

  test("resource observations are declared fixture values", () => {
    const body = runReferenceBenchmark(referenceProviderProfileV1());
    expect(body.resourceObservations.compute).toBe("deterministic-fixture-cpu");
    expect(body.resourceObservations.memoryMiB).toBe(16);
    expect(body.resourceObservations.latencyMsP50).toBe(0.5);
    expect(body.resourceObservations.latencyMsP95).toBe(1);
  });
});
