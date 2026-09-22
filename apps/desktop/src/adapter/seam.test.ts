/**
 * PROD-020 — the desktop adapter's CONTRACT DECODE SEAM tests.
 *
 * Every one of the twelve semantic objects (+ the three negotiation
 * objects) decodes through the seam against the COMMITTED PROD-016
 * fixture corpus; the open decode preserves unknown fields (same-major
 * wire behavior), the strict decode rejects unknown keys, a cross-major
 * contractVersion fails fast as a typed version-mismatch failure, and
 * the TaskIntent encode is canonical. The seam imports the contract —
 * it never re-implements it (no second model).
 */

import { describe, expect, test } from "bun:test";
import type { ConformanceCorpus } from "@aise/adapter-contract";
import { loadCommittedFixtures } from "@aise/adapter-contract/fixtures-loader";
import {
  decodeAuthorizationContextAtSeam,
  decodeBOQContextAtSeam,
  decodeCapabilityDescriptorAtSeam,
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
  decodeTaskIntentStrictAtSeam,
  decodeTaskRequirementsAtSeam,
  encodeTaskIntentWire,
} from "./seam";
import {
  CORPUS_OPERATION_RESULT_FAILED_WIRE,
  CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
  CORPUS_TASK_FLOW_WIRE,
  CORPUS_TASK_INTENT_WIRE,
} from "./corpus-world";

const corpus: ConformanceCorpus = loadCommittedFixtures();

/** Canonical JSON (recursively sorted keys, 2-space indent, trailing newline). */
function canonicalJson(value: unknown): string {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortValue);
    }
    if (typeof input === "object" && input !== null) {
      const record = input as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        sorted[key] = sortValue(record[key]);
      }
      return sorted;
    }
    return input;
  };
  return JSON.stringify(sortValue(value), null, 2) + "\n";
}

function validFixture(objectName: string): Record<string, unknown> {
  const fixture = corpus.fixtures.find(
    (entry) => entry.objectName === objectName && entry.kind === "valid",
  );
  if (fixture === undefined) {
    throw new Error(`no valid fixture for ${objectName}`);
  }
  return fixture.payload as Record<string, unknown>;
}

function versionMismatchFixture(objectName: string): Record<string, unknown> {
  const fixture = corpus.fixtures.find(
    (entry) => entry.objectName === objectName && entry.kind === "version-mismatch",
  );
  if (fixture === undefined) {
    throw new Error(`no version-mismatch fixture for ${objectName}`);
  }
  return fixture.payload as Record<string, unknown>;
}

describe("PROD-020 the decode seam decodes all twelve semantic objects (+ negotiation family)", () => {
  test("ProjectContext decodes through the seam (the open-project identity object)", () => {
    const decoded = decodeProjectContextAtSeam(validFixture("ProjectContext"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.projectId).toBe("proj-7f3a2b");
      expect(decoded.value.userRole).toBe("field-operator");
    }
  });

  test("TaskIntent decodes through the seam (the one client-authored object)", () => {
    const decoded = decodeTaskIntentAtSeam(validFixture("TaskIntent"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.taskType).toBe("field-capture");
      expect(decoded.value.targetRefs).toEqual(["case-91ab", "node-wall-12"]);
    }
  });

  test("CapabilityDescriptor decodes through the seam", () => {
    const decoded = decodeCapabilityDescriptorAtSeam(validFixture("CapabilityDescriptor"));
    expect(decoded.ok).toBe(true);
  });

  test("EvidenceSummary decodes through the seam with gaps preserved", () => {
    const decoded = decodeEvidenceSummaryAtSeam(validFixture("EvidenceSummary"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.gaps).toHaveLength(2);
      expect(decoded.value.gaps[0]?.kind).toBe("MISSING");
      expect(decoded.value.gaps[1]?.kind).toBe("WEAK");
    }
  });

  test("RealitySummary decodes through the seam (readiness carried opaque)", () => {
    const decoded = decodeRealitySummaryAtSeam(validFixture("RealitySummary"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.readinessStatus).toBe("partial");
      expect(decoded.value.modelVersion).toBe(14);
    }
  });

  test("BOQContext decodes through the seam with source-of-record identity", () => {
    const decoded = decodeBOQContextAtSeam(validFixture("BOQContext"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.sourceSystem).toBe("erp");
      expect(decoded.value.sourceRecordRef).toBe("ERP-BOQ-2026-0042");
    }
  });

  test("EngineeringCaseSummary decodes through the seam", () => {
    const decoded = decodeEngineeringCaseSummaryAtSeam(validFixture("EngineeringCaseSummary"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.status).toBe("under-review");
    }
  });

  test("InterventionScenarioSummary decodes through the seam (PROPOSED stays PROPOSED)", () => {
    const decoded = decodeInterventionScenarioSummaryAtSeam(
      validFixture("InterventionScenarioSummary"),
    );
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.epistemicState).toBe("PROPOSED");
      expect(decoded.value.approvalState).toBe("pending-review");
    }
  });

  test("OutcomeSummary decodes through the seam (OBSERVED stays OBSERVED)", () => {
    const decoded = decodeOutcomeSummaryAtSeam(validFixture("OutcomeSummary"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.epistemicState).toBe("OBSERVED");
      expect(decoded.value.postWorkEvidenceContentIds).toHaveLength(2);
    }
  });

  test("NextBestAction decodes through the seam (blocked status + blockers preserved)", () => {
    const blocked = corpus.fixtures.find(
      (entry) => entry.objectName === "NextBestAction" && entry.fileName === "action/NextBestAction.valid-blocked.json",
    );
    expect(blocked).toBeDefined();
    if (blocked === undefined) {
      return;
    }
    const decoded = decodeNextBestActionAtSeam(blocked.payload);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.status).toBe("blocked");
      expect(decoded.value.blockers).toHaveLength(2);
    }
  });

  test("AuthorizationContext decodes through the seam (grants AND denials)", () => {
    const decoded = decodeAuthorizationContextAtSeam(validFixture("AuthorizationContext"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.grantedActions).toContain("evidence:submit");
      expect(decoded.value.denials).toHaveLength(2);
      expect(decoded.value.denials[0]?.reasonCode).toBe("missing-permission");
    }
  });

  test("OperationResult decodes through the seam (typed failure preserved)", () => {
    const decoded = decodeOperationResultAtSeam(validFixture("OperationResult"));
    expect(decoded.ok).toBe(true);
  });

  test("the negotiation family decodes through the seam (profile, requirements, negotiation)", () => {
    expect(
      decodeClientCapabilityProfileAtSeam(validFixture("ClientCapabilityProfile")).ok,
    ).toBe(true);
    expect(decodeTaskRequirementsAtSeam(validFixture("TaskCapabilityRequirements")).ok).toBe(true);
    expect(decodeCapabilityNegotiationAtSeam(validFixture("CapabilityNegotiation")).ok).toBe(true);
  });
});

describe("PROD-020 the seam's compatibility discipline (the PROD-016 window)", () => {
  test("open decode PRESERVES unknown fields (same-major wire behavior)", () => {
    const payload = { ...validFixture("ProjectContext"), desktopExtension: "future-field" };
    const decoded = decodeProjectContextAtSeam(payload);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect((decoded.value as Record<string, unknown>).desktopExtension).toBe("future-field");
    }
  });

  test("strict decode REJECTS unknown keys (canonical checks)", () => {
    const payload = { ...validFixture("ProjectContext"), desktopExtension: "future-field" };
    const decoded = decodeProjectContextStrictAtSeam(payload);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.failure.kind).toBe("decode-error");
      expect(decoded.failure.objectName).toBe("ProjectContext");
    }
  });

  test("a cross-major contractVersion fails fast as a typed version-mismatch failure", () => {
    const project = decodeProjectContextAtSeam(versionMismatchFixture("ProjectContext"));
    expect(project.ok).toBe(false);
    if (!project.ok) {
      expect(project.failure.kind).toBe("version-mismatch");
      expect(project.failure.objectName).toBe("ProjectContext");
    }
    const reality = decodeRealitySummaryAtSeam(versionMismatchFixture("RealitySummary"));
    expect(reality.ok).toBe(false);
    if (!reality.ok) {
      expect(reality.failure.kind).toBe("version-mismatch");
    }
    const result = decodeOperationResultAtSeam(versionMismatchFixture("OperationResult"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("version-mismatch");
    }
  });

  test("an invalid payload is a typed decode-error naming its object (never a throw)", () => {
    const decoded = decodeProjectContextAtSeam({ nope: true });
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.failure.kind).toBe("decode-error");
      expect(decoded.failure.objectName).toBe("ProjectContext");
    }
  });

  test("encodeTaskIntentWire produces canonical JSON (sorted keys, deterministic bytes)", () => {
    const decoded = decodeTaskIntentAtSeam(CORPUS_TASK_INTENT_WIRE);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const encoded = encodeTaskIntentWire(decoded.value);
      expect(encoded.ok).toBe(true);
      if (encoded.ok) {
        // Canonical form: recursively sorted keys, 2-space indent, trailing newline.
        expect(encoded.value).toBe(canonicalJson(CORPUS_TASK_INTENT_WIRE));
        // Deterministic: the same value encodes to identical bytes.
        expect(encodeTaskIntentWire(decoded.value)).toEqual(encoded);
        // Lossless: the canonical bytes decode back to the same value.
        expect(decodeTaskIntentAtSeam(JSON.parse(encoded.value))).toEqual(decoded);
      }
    }
  });

  test("the strict TaskIntent decode accepts the canonical corpus intent", () => {
    const decoded = decodeTaskIntentStrictAtSeam(CORPUS_TASK_INTENT_WIRE);
    expect(decoded.ok).toBe(true);
  });
});

describe("PROD-020 the joined bundle + answer decoding (field-by-field, defects name objects)", () => {
  test("the corpus task-flow bundle decodes with every object present", () => {
    const decoded = decodeTaskFlowBundleAtSeam(CORPUS_TASK_FLOW_WIRE);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.context?.projectId).toBe("proj-7f3a2b");
      expect(decoded.value.boq?.sourceSystem).toBe("erp");
      expect(decoded.value.scenario?.epistemicState).toBe("PROPOSED");
      expect(decoded.value.requirements?.requirementsId).toBe(
        "requirements-field-depth-capture",
      );
    }
  });

  test("a defective bundle field names its object in the failure", () => {
    const decoded = decodeTaskFlowBundleAtSeam({
      ...CORPUS_TASK_FLOW_WIRE,
      boq: { contractVersion: "9.0.0", boqId: "x", revision: 1, lineItemCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.failure.objectName).toBe("BOQContext");
      expect(decoded.failure.kind).toBe("version-mismatch");
    }
  });

  test("absent bundle fields decode as honest nulls", () => {
    const decoded = decodeTaskFlowBundleAtSeam({
      context: CORPUS_TASK_FLOW_WIRE.context,
      reality: null,
      evidence: null,
      boq: null,
      caseSummary: null,
      scenario: null,
      outcome: null,
      nextBestAction: null,
      authorization: null,
      requirements: null,
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.context?.projectId).toBe("proj-7f3a2b");
      expect(decoded.value.reality).toBeNull();
      expect(decoded.value.requirements).toBeNull();
    }
  });

  test("the task-intent answer decodes (OperationResult + follow-up action)", () => {
    const decoded = decodeTaskIntentAnswerAtSeam({
      result: CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
      action: null,
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.result.status).toBe("succeeded");
      expect(decoded.value.result.resultRefs).toHaveLength(3);
      expect(decoded.value.action).toBeNull();
    }
  });

  test("the failed operation result carries its typed failure verbatim", () => {
    const decoded = decodeOperationResultAtSeam(CORPUS_OPERATION_RESULT_FAILED_WIRE);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.status).toBe("failed");
      expect(decoded.value.failure?.code).toBe("provider-unavailable");
      expect(decoded.value.resultRefs).toEqual([]);
    }
  });
});
