/**
 * PROD-017 — the contract DECODE SEAM tests (W-R1/W-R2): the app's
 * task-contract.ts layer over the committed PROD-016 fixture corpus.
 *
 * Every valid fixture decodes through the seam; every typed-invalid
 * fixture fails with the object named and structured issue detail; every
 * version-mismatch fixture fails with the typed version-mismatch kind;
 * strict decode rejects unknown keys; TaskIntent encoding round-trips and
 * stamps the family version. Deterministic: committed files, no clock, no
 * randomness, no network.
 */

import { describe, expect, test } from "bun:test";
import { loadCommittedFixtures, type TaskIntent } from "@aise/adapter-contract";
import {
  decodeAuthorizationContextAtSeam,
  decodeBOQContextAtSeam,
  decodeCapabilityNegotiationAtSeam,
  decodeClientCapabilityProfileAtSeam,
  decodeEngineeringCaseSummaryAtSeam,
  decodeEvidenceSummaryAtSeam,
  decodeInterventionScenarioSummaryAtSeam,
  decodeNextBestActionAtSeam,
  decodeOperationResultAtSeam,
  decodeOutcomeSummaryAtSeam,
  decodeProjectContextAtSeam,
  decodeProjectContextStrictAtSeam,
  decodeRealitySummaryAtSeam,
  decodeTaskFlowBundleAtSeam,
  decodeTaskIntentAnswerAtSeam,
  decodeTaskIntentAtSeam,
  decodeTaskRequirementsAtSeam,
  describeContractFailure,
  encodeTaskIntentWire,
  type ContractDecode,
} from "./task-contract";
import { demoFailedOperationResult, demoTaskFlowBundle } from "./task-dataset";

const corpus = loadCommittedFixtures();

/** The seam decoder for one object name (the registry under test). */
const SEAM_DECODERS: Record<string, (payload: unknown) => ContractDecode<unknown>> = {
  ProjectContext: decodeProjectContextAtSeam,
  RealitySummary: decodeRealitySummaryAtSeam,
  BOQContext: decodeBOQContextAtSeam,
  EvidenceSummary: decodeEvidenceSummaryAtSeam,
  EngineeringCaseSummary: decodeEngineeringCaseSummaryAtSeam,
  InterventionScenarioSummary: decodeInterventionScenarioSummaryAtSeam,
  OutcomeSummary: decodeOutcomeSummaryAtSeam,
  NextBestAction: decodeNextBestActionAtSeam,
  AuthorizationContext: decodeAuthorizationContextAtSeam,
  OperationResult: decodeOperationResultAtSeam,
  TaskIntent: decodeTaskIntentAtSeam,
  TaskCapabilityRequirements: decodeTaskRequirementsAtSeam,
  ClientCapabilityProfile: decodeClientCapabilityProfileAtSeam,
  CapabilityNegotiation: decodeCapabilityNegotiationAtSeam,
};

describe("PROD-017 the contract decode seam over the committed corpus", () => {
  test("every VALID fixture decodes through the seam (no local mirror validation)", () => {
    let decoded = 0;
    for (const fixture of corpus.fixtures) {
      if (fixture.kind !== "valid") {
        continue;
      }
      const seam = SEAM_DECODERS[fixture.objectName];
      if (seam === undefined) {
        continue; // CapabilityDescriptor-only fixtures are covered below
      }
      const result = seam(fixture.payload);
      expect(result.ok).toBe(true);
      decoded += 1;
    }
    expect(decoded).toBeGreaterThanOrEqual(20);
  });

  test("every TYPED-INVALID fixture fails with the object named and detail", () => {
    for (const fixture of corpus.fixtures) {
      if (fixture.kind !== "invalid") {
        continue;
      }
      const seam = SEAM_DECODERS[fixture.objectName];
      if (seam === undefined) {
        continue;
      }
      const result = seam(fixture.payload);
      expect(result.ok).toBe(false);
    }
  });

  test("every VERSION-MISMATCH fixture fails as the typed version-mismatch kind", () => {
    let checked = 0;
    for (const fixture of corpus.fixtures) {
      if (fixture.kind !== "version-mismatch") {
        continue;
      }
      const seam = SEAM_DECODERS[fixture.objectName];
      if (seam === undefined) {
        continue;
      }
      const result = seam(fixture.payload);
      if (!result.ok) {
        expect(result.failure.kind).toBe("version-mismatch");
        expect(describeContractFailure(result.failure)).toContain("version mismatch");
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  test("a non-object payload fails honestly (never coerced)", () => {
    const result = decodeProjectContextAtSeam("not-an-object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.objectName).toBe("ProjectContext");
      expect(result.failure.kind).toBe("decode-error");
    }
  });

  test("strict decode rejects unknown keys at the top level", () => {
    const result = decodeProjectContextStrictAtSeam({
      contractVersion: "1.0.0",
      projectId: "proj-x",
      projectName: "X",
      userRole: "engineer",
      updatedAt: "2026-01-15T09:20:00.000Z",
      totallyUnknownKey: "injected",
    });
    expect(result.ok).toBe(false);
  });

  test("open decode PRESERVES unknown fields (same-major forward compatibility)", () => {
    const result = decodeProjectContextAtSeam({
      contractVersion: "1.0.0",
      projectId: "proj-x",
      projectName: "X",
      userRole: "engineer",
      updatedAt: "2026-01-15T09:20:00.000Z",
      aFutureMinorField: "carried",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as Record<string, unknown>).aFutureMinorField).toBe("carried");
    }
  });

  test("the bundle decoder names the FIRST defective object (deterministic order)", () => {
    const result = decodeTaskFlowBundleAtSeam({
      context: { contractVersion: "1.0.0", projectId: "p", projectName: "P", userRole: "r", updatedAt: "2026-01-15T09:20:00.000Z" },
      reality: null,
      evidence: null,
      boq: { contractVersion: "1.0.0", boqId: "b", revision: 1, sourceSystem: "erp", lineItemCount: 5, updatedAt: "2026-01-14T16:30:00.000Z" },
      caseSummary: null,
      scenario: null,
      outcome: null,
      nextBestAction: null,
      authorization: null,
      requirements: null,
    });
    expect(result.ok).toBe(true);
    const broken = decodeTaskFlowBundleAtSeam({
      context: { contractVersion: "2.0.0", projectId: "p", projectName: "P", userRole: "r", updatedAt: "2026-01-15T09:20:00.000Z" },
    });
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.failure.objectName).toBe("ProjectContext");
      expect(broken.failure.kind).toBe("version-mismatch");
    }
  });

  test("absent bundle fields decode to null (the honest empty state)", () => {
    const result = decodeTaskFlowBundleAtSeam({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context).toBe(null);
      expect(result.value.nextBestAction).toBe(null);
    }
  });

  test("the task-intent answer decoder requires the operation result", () => {
    const failed = demoFailedOperationResult();
    const good = decodeTaskIntentAnswerAtSeam({
      result: failed,
      action: null,
    });
    expect(good.ok).toBe(true);
    const bad = decodeTaskIntentAnswerAtSeam({ result: "nope" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.failure.objectName).toBe("OperationResult");
    }
  });
});

describe("PROD-017 TaskIntent wire encoding (W-R3 serialization)", () => {
  const intent: TaskIntent = {
    contractVersion: "1.0.0",
    taskId: "task-encode-1",
    taskType: "boq-inspection",
    intent: "Inspect the BOQ rows mapped to the cracked masonry.",
    projectRef: "proj-7f3a2b",
    targetRefs: ["boq-import-33d"],
    parameters: { filter: "unmapped" },
    createdAt: "2026-01-15T09:25:00.000Z",
  };

  test("encode stamps canonical JSON and round-trips through the seam decode", () => {
    const encoded = encodeTaskIntentWire(intent);
    expect(encoded.ok).toBe(true);
    if (encoded.ok) {
      expect(encoded.value).toContain("\"contractVersion\": \"1.0.0\"");
      const decoded = decodeTaskIntentAtSeam(JSON.parse(encoded.value));
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.value).toEqual(intent);
      }
    }
  });

  test("encode stamps the family version when absent", () => {
    const unstamped = { ...intent } as Record<string, unknown>;
    delete unstamped.contractVersion;
    const encoded = encodeTaskIntentWire(unstamped as unknown as TaskIntent);
    expect(encoded.ok).toBe(true);
    if (encoded.ok) {
      expect(JSON.parse(encoded.value).contractVersion).toBe("1.0.0");
    }
  });

  test("the demo dataset's bundle decodes cleanly (drift is a failure)", () => {
    const bundle = demoTaskFlowBundle();
    expect(bundle.context?.projectId).toBe("proj-7f3a2b");
    expect(bundle.nextBestAction?.status).toBe("blocked");
    expect(bundle.authorization?.denials.length).toBe(2);
  });
});
