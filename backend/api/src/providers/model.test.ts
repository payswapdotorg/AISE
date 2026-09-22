/**
 * HFX-000 — provider endpoint boundary-parser tests (the model layer's
 * fail-closed discipline, mirroring the solution-boq model tests).
 */

import { describe, expect, test } from "bun:test";
import {
  ProviderServiceError,
  entrySummaryOf,
  parseBenchmarkIntakeRequest,
  parseEvaluationStartRequest,
  parseExecutionNormalizeRequest,
  parseProfilePayloadRequest,
  parsePromotionDecideRequest,
  parseProvenanceManifestRequest,
  parseProvenanceSealRequest,
  parseRegistryQueryRequest,
} from "./model";
import { registerBodyV1 } from "./testkit";
import {
  applyRegistryEvent,
  createProviderRegistry,
} from "@aise/provider-registry";

function expectErrorCode(payload: unknown, parse: (payload: unknown) => unknown): string {
  try {
    parse(payload);
  } catch (error) {
    if (error instanceof ProviderServiceError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("parser unexpectedly accepted the payload");
}

describe("the boundary parsers (fail closed, typed codes)", () => {
  test("parseProfilePayloadRequest accepts { profile } and rejects the rest", () => {
    expect(parseProfilePayloadRequest(registerBodyV1())).toEqual(registerBodyV1());
    for (const payload of [null, 42, "x", []]) {
      expect(expectErrorCode(payload, parseProfilePayloadRequest)).toBe("invalid_request");
    }
    expect(expectErrorCode({}, parseProfilePayloadRequest)).toBe("invalid_profile");
    expect(expectErrorCode({ profile: "not-an-object" }, parseProfilePayloadRequest)).toBe("invalid_profile");
  });

  test("parseRegistryQueryRequest: neither key = full listing; both keys = one entry; one key = refusal", () => {
    expect(parseRegistryQueryRequest({})).toEqual({});
    expect(parseRegistryQueryRequest({ providerId: "p", technologyVersion: "1" })).toEqual({
      providerId: "p",
      technologyVersion: "1",
    });
    expect(expectErrorCode({ providerId: "p" }, parseRegistryQueryRequest)).toBe("invalid_request");
    expect(expectErrorCode({ technologyVersion: "1" }, parseRegistryQueryRequest)).toBe("invalid_request");
  });

  test("the provider-key parsers require both non-empty keys", () => {
    for (const parse of [
      parseEvaluationStartRequest,
      parseProvenanceSealRequest,
      parsePromotionDecideRequest,
    ]) {
      expect(parse({ providerId: "p", technologyVersion: "1" })).toEqual({
        providerId: "p",
        technologyVersion: "1",
      });
      expect(expectErrorCode({}, parse)).toBe("invalid_request");
      expect(expectErrorCode({ providerId: "", technologyVersion: "1" }, parse)).toBe("invalid_request");
      expect(expectErrorCode({ providerId: "p", technologyVersion: "" }, parse)).toBe("invalid_request");
      expect(expectErrorCode(null, parse)).toBe("invalid_request");
    }
  });

  test("parseExecutionNormalizeRequest requires input AND execution objects", () => {
    const good = {
      providerId: "p",
      technologyVersion: "1",
      input: { kind: "provider-input" },
      execution: { outputs: {} },
    };
    expect(parseExecutionNormalizeRequest(good)).toEqual(good);
    expect(expectErrorCode({ ...good, input: null }, parseExecutionNormalizeRequest)).toBe("invalid_input");
    expect(expectErrorCode({ ...good, execution: null }, parseExecutionNormalizeRequest)).toBe("invalid_execution");
    expect(expectErrorCode({}, parseExecutionNormalizeRequest)).toBe("invalid_request");
  });

  test("parseBenchmarkIntakeRequest requires a record object", () => {
    expect(parseBenchmarkIntakeRequest({ record: { kind: "provider-benchmark-record" } })).toEqual({
      record: { kind: "provider-benchmark-record" },
    });
    for (const payload of [null, 42, "x", []]) {
      expect(expectErrorCode(payload, parseBenchmarkIntakeRequest)).toBe("invalid_request");
    }
    expect(expectErrorCode({}, parseBenchmarkIntakeRequest)).toBe("invalid_benchmark_record");
    expect(expectErrorCode({ record: [] }, parseBenchmarkIntakeRequest)).toBe("invalid_benchmark_record");
  });

  test("parseProvenanceManifestRequest: optional manifestId must be a non-empty string", () => {
    expect(
      parseProvenanceManifestRequest({ providerId: "p", technologyVersion: "1" }),
    ).toEqual({ providerId: "p", technologyVersion: "1" });
    expect(
      parseProvenanceManifestRequest({ providerId: "p", technologyVersion: "1", manifestId: "abc" }),
    ).toEqual({ providerId: "p", technologyVersion: "1", manifestId: "abc" });
    expect(
      expectErrorCode(
        { providerId: "p", technologyVersion: "1", manifestId: " " },
        parseProvenanceManifestRequest,
      ),
    ).toBe("invalid_request");
  });
});

describe("the entry summary projection", () => {
  test("projects the package entry deterministically", () => {
    const applied = applyRegistryEvent(createProviderRegistry(), {
      kind: "provider-registered",
      profile: registerBodyV1().profile,
    });
    if (!applied.ok) {
      throw new Error("registration unexpectedly refused");
    }
    const entry = applied.registry.entryOf("fixture-depth-provider", "1.0.0-fixture-v1");
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("entry missing");
    }
    const summary = entrySummaryOf(entry);
    expect(summary.state).toBe("registered");
    expect(summary.providerId).toBe("fixture-depth-provider");
    expect(summary.technologyVersion).toBe("1.0.0-fixture-v1");
    expect(summary.evaluationOnly).toBe(false);
    expect(summary.license.identifier).toBe("fixture-permissive-1.0");
    expect(summary.license.commercialUse).toBe(true);
    expect(summary.capabilities).toEqual(["fixture-depth-estimation"]);
    expect(summary.normalizedExecutionCount).toBe(0);
    expect(summary.benchmarkRecordIds).toEqual([]);
    expect(summary.provenanceManifestIds).toEqual([]);
    expect(summary.promotionDecision).toBeNull();
    expect(summary.retirementReason).toBeNull();
  });
});
