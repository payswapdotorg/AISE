/**
 * AISE-031 — Execution/outcome model tests.
 *
 * Boundary discipline: the execution/outcome input parsers' accept and
 * reject matrices (typed codes), the frozen vocabularies, the canonical
 * content digest (pure, clock-free), the read-only authority projections
 * (ids/governance only, foreign vocabularies verbatim) and the
 * stored-record parser's corruption discrimination.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { EngineeringCase } from "../cases/model";
import type { InterventionScenario } from "../intervention/model";
import {
  EXECUTION_ERROR_CODES,
  EXECUTION_EVENT_TYPES,
  STATE_EXECUTION_STATUSES,
  ExecutionError,
  executionContentDigest,
  parseExecutionRecord,
  parseRecordExecutionInput,
  parseRecordOutcomeInput,
  projectCaseContext,
  projectInterventionContext,
  summarizeExecution,
  validateCaseRefId,
  validateExecutionRecordId,
  validateScenarioRefId,
  type ExecutionErrorCode,
} from "./model";
import {
  CANONICAL_EXECUTION,
  CASE_ID,
  EV_POSTWORK_PHOTO,
  EV_POSTWORK_SCAN,
  EV_WORK_PHOTOS,
  EXECUTION_ID,
  FIXED_APPROVAL,
  FIXED_EXECUTED,
  FIXED_NOW,
  SCENARIO_ID,
  SESSION_POSTWORK_1,
  SESSION_WORK_1,
  STATE_3_ID,
  STEP_FIRE_ID,
  STEP_PARTITION_ID,
  STEP_REMOVE_ID,
  buildCaseContext,
  buildApprovedScenarioContext,
  deepFreeze,
  evidenceIdOf,
  stateIdOf,
} from "./testkit";

function expectCode(action: () => unknown, code: ExecutionErrorCode): void {
  expect(action).toThrow(ExecutionError);
  try {
    action();
  } catch (error) {
    expect((error as ExecutionError).code).toBe(code);
  }
}

describe("execution model: frozen vocabularies", () => {
  test("state execution statuses and event types are frozen literals", () => {
    expect(STATE_EXECUTION_STATUSES).toEqual(["PROPOSED", "EXECUTED"]);
    expect(EXECUTION_EVENT_TYPES).toEqual(["execution_recorded", "outcome_recorded"]);
    expect(Object.isFrozen(STATE_EXECUTION_STATUSES)).toBe(true);
    expect(Object.isFrozen(EXECUTION_EVENT_TYPES)).toBe(true);
    expect(Object.isFrozen(EXECUTION_ERROR_CODES)).toBe(true);
  });

  test("id validators reject empty and oversized ids with typed codes", () => {
    expectCode(() => validateExecutionRecordId(""), "invalid_execution_id");
    expectCode(() => validateExecutionRecordId("x".repeat(257)), "invalid_execution_id");
    expectCode(() => validateCaseRefId("y".repeat(257)), "invalid_case_id");
    expectCode(() => validateScenarioRefId(""), "invalid_scenario_ref");
    expect(() => validateExecutionRecordId("execution-1")).not.toThrow();
    expect(() => validateCaseRefId("case-1")).not.toThrow();
    expect(() => validateScenarioRefId("scenario-1")).not.toThrow();
  });
});

describe("execution model: recordExecution input parser", () => {
  test("accepts the canonical execution input unchanged", () => {
    expect(parseRecordExecutionInput({ ...CANONICAL_EXECUTION })).toEqual(CANONICAL_EXECUTION);
  });

  test("rejects non-object payloads and missing ids with typed codes", () => {
    expectCode(() => parseRecordExecutionInput(null), "invalid_execution");
    expectCode(() => parseRecordExecutionInput("nope"), "invalid_execution");
    expectCode(() => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, executionRecordId: "" }), "invalid_execution_id");
    expectCode(() => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, caseId: "" }), "invalid_execution");
    expectCode(() => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, scenarioId: "" }), "invalid_execution");
  });

  test("stateId must be a 64-hex content id", () => {
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, stateId: "state-3" }),
      "invalid_execution",
    );
  });

  test("executedStepIds is required non-empty (execution_without_steps)", () => {
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, executedStepIds: [] }),
      "execution_without_steps",
    );
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, executedStepIds: undefined }),
      "invalid_execution",
    );
  });

  test("evidenceIds must be a non-empty 64-hex list (execution_without_evidence / invalid_evidence_ref)", () => {
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, evidenceIds: [] }),
      "execution_without_evidence",
    );
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, evidenceIds: ["not-hex"] }),
      "invalid_evidence_ref",
    );
    // undefined (absent) is not an array → the required-list code; a
    // non-hex entry → the shape code.
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, evidenceIds: undefined }),
      "execution_without_evidence",
    );
  });

  test("captureSessionIds are opaque non-empty strings, verbatim (invalid_capture_ref)", () => {
    const parsed = parseRecordExecutionInput({
      ...CANONICAL_EXECUTION,
      captureSessionIds: ["session-custom-%20-id"],
    });
    expect(parsed.captureSessionIds).toEqual(["session-custom-%20-id"]);
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, captureSessionIds: [""] }),
      "invalid_capture_ref",
    );
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, captureSessionIds: "session-1" }),
      "invalid_capture_ref",
    );
  });

  test("executedAt must be ISO-8601 UTC with milliseconds (invalid_timestamp)", () => {
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, executedAt: "2026-03-01" }),
      "invalid_timestamp",
    );
    expectCode(
      () => parseRecordExecutionInput({ ...CANONICAL_EXECUTION, executedAt: "2026-03-01T16:00:00Z" }),
      "invalid_timestamp",
    );
  });
});

describe("execution model: recordOutcome input parser", () => {
  const CANONICAL_OUTCOME_BODY = {
    caseId: CASE_ID,
    statement: "Post-work scan confirms the REI90 compartment line.",
    evidenceIds: [EV_POSTWORK_SCAN, EV_POSTWORK_PHOTO],
    captureSessionIds: [SESSION_POSTWORK_1],
    measurementRefs: ["meas-postwork-1"],
  };

  test("accepts the canonical outcome input unchanged", () => {
    expect(parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY })).toEqual(CANONICAL_OUTCOME_BODY);
  });

  test("outcome_without_evidence: evidenceIds required non-empty 64-hex", () => {
    expectCode(() => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, evidenceIds: [] }), "outcome_without_evidence");
    expectCode(
      () => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, evidenceIds: ["short"] }),
      "invalid_evidence_ref",
    );
  });

  test("a claimed non-OBSERVED epistemic status is a typed rejection (never a coercion)", () => {
    expectCode(
      () => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, epistemicStatus: "INFERRED" }),
      "invalid_outcome",
    );
    expectCode(
      () => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, epistemicStatus: "PROPOSED" }),
      "invalid_outcome",
    );
    // OBSERVED itself is accepted (and simply not carried — it is the only
    // representable value).
    expect(parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, epistemicStatus: "OBSERVED" })).toEqual(
      CANONICAL_OUTCOME_BODY,
    );
  });

  test("statement and caseId are required (invalid_statement / invalid_outcome)", () => {
    expectCode(() => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, statement: "" }), "invalid_statement");
    expectCode(() => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, caseId: "" }), "invalid_outcome");
    expectCode(
      () => parseRecordOutcomeInput({ ...CANONICAL_OUTCOME_BODY, measurementRefs: [42] }),
      "invalid_outcome",
    );
  });
});

describe("execution model: read-only authority projections", () => {
  /** A minimal but shape-faithful intervention scenario record (their type). */
  const scenario = deepFreeze({
    scenarioId: SCENARIO_ID,
    projectId: "project-zurich-hq",
    title: "Office refit",
    baselineVersionId: "v001",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    status: "approved",
    steps: [
      { stepId: STEP_FIRE_ID, stepIndex: 1, kind: "property_change", targetNodeId: "wall-north", change: { kind: "note", text: "x" }, provenance: { evidenceIds: [] }, recordedAt: FIXED_NOW },
      { stepId: STEP_PARTITION_ID, stepIndex: 2, kind: "element_addition", targetNodeId: "wall-partition-new", change: { kind: "note", text: "x" }, provenance: { evidenceIds: [] }, recordedAt: FIXED_NOW },
    ],
    states: [
      { stateId: stateIdOf("l0"), scenarioId: SCENARIO_ID, stateIndex: 0, baselineVersionId: "v001", appliedStepIds: [], nodes: [], relationships: [], proposedTombstones: [], materializedAt: FIXED_NOW },
      { stateId: STATE_3_ID, scenarioId: SCENARIO_ID, stateIndex: 1, baselineVersionId: "v001", appliedStepIds: [STEP_FIRE_ID], nodes: [], relationships: [], proposedTombstones: [], materializedAt: FIXED_NOW },
    ],
    approvalReference: { caseId: CASE_ID, reviewDecision: "approved", reviewedAt: FIXED_APPROVAL },
    transitions: [{ status: "approved", at: FIXED_APPROVAL }],
  } as unknown as InterventionScenario);

  /** A minimal but shape-faithful engineering case record (their type). */
  const caseRecord = deepFreeze({
    caseId: CASE_ID,
    title: "Fire compartment non-compliance",
    status: "under_review",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    observations: [
      {
        observationId: "obs-1",
        statement: "Measured rating REI60.",
        epistemicStatus: "OBSERVED",
        recordedAt: FIXED_NOW,
        evidenceIds: [EV_WORK_PHOTOS],
      },
    ],
    hypotheses: [
      {
        hypothesisId: "hyp-1",
        statement: "REI90 upgrade resolves it.",
        epistemicStatus: "INFERRED",
        supportingObservationIds: ["obs-1"],
        contradictingObservationIds: [],
        confidence: "medium",
        recordedAt: FIXED_NOW,
      },
    ],
    missingEvidence: [],
    links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
    history: [],
  } as unknown as EngineeringCase);

  test("projectInterventionContext keeps ids/governance ONLY — no proposal content", () => {
    const context = projectInterventionContext(scenario);
    expect(context.scenarioId).toBe(SCENARIO_ID);
    expect(context.status).toBe("approved");
    expect(context.approvalReference).toEqual({
      caseId: CASE_ID,
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    });
    expect(context.steps).toEqual([
      { stepId: STEP_FIRE_ID, stepIndex: 1 },
      { stepId: STEP_PARTITION_ID, stepIndex: 2 },
    ]);
    expect(context.states).toEqual([
      { stateId: stateIdOf("l0"), stateIndex: 0, appliedStepIds: [] },
      { stateId: STATE_3_ID, stateIndex: 1, appliedStepIds: [STEP_FIRE_ID] },
    ]);
    // No nodes/relationships/proposed content values are projected, ever.
    expect(JSON.stringify(context)).not.toContain("nodes");
    expect(JSON.stringify(context)).not.toContain("proposedTombstones");
  });

  test("projectInterventionContext omits an absent approval reference cleanly", () => {
    const draft = projectInterventionContext({ ...scenario, approvalReference: undefined, status: "draft" });
    expect(draft.status).toBe("draft");
    expect("approvalReference" in draft).toBe(false);
    expect(JSON.parse(canonicalJsonStringify(draft))).not.toHaveProperty("approvalReference");
  });

  test("projectCaseContext carries the issue spine verbatim", () => {
    const context = projectCaseContext(caseRecord);
    expect(context.caseId).toBe(CASE_ID);
    expect(context.status).toBe("under_review");
    expect(context.observations).toEqual([
      { observationId: "obs-1", statement: "Measured rating REI60.", evidenceIds: [EV_WORK_PHOTOS] },
    ]);
    expect(context.hypotheses).toEqual([
      {
        hypothesisId: "hyp-1",
        statement: "REI90 upgrade resolves it.",
        epistemicStatus: "INFERRED",
        confidence: "medium",
      },
    ]);
  });
});

describe("execution model: content digest and summary", () => {
  function executionRecord() {
    return {
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID, STEP_REMOVE_ID],
      evidenceIds: [EV_WORK_PHOTOS],
      captureSessionIds: [SESSION_WORK_1],
      executedAt: FIXED_EXECUTED,
      recordedAt: FIXED_NOW,
      stateTransition: {
        scenarioId: SCENARIO_ID,
        stateId: STATE_3_ID,
        fromStatus: "PROPOSED" as const,
        toStatus: "EXECUTED" as const,
        executionRecordId: EXECUTION_ID,
        evidenceIds: [EV_WORK_PHOTOS],
        recordedAt: FIXED_NOW,
      },
      outcomes: [] as never[],
      history: [] as never[],
    };
  }

  test("the digest is pure: content only, history excluded, clock-free", () => {
    const one = executionRecord();
    const two = executionRecord();
    expect(executionContentDigest(one)).toBe(executionContentDigest(two));
    // History does not affect the digest (events PIN it; they are not part
    // of the pinned content).
    const withHistory = { ...two, history: [{ eventId: "evt-000001", eventType: "execution_recorded" as const, occurredAt: FIXED_NOW, recordDigest: "0".repeat(64) }] };
    expect(executionContentDigest(withHistory)).toBe(executionContentDigest(one));
    // Content change → digest change.
    const changed = { ...two, evidenceIds: [EV_POSTWORK_SCAN] };
    expect(executionContentDigest(changed)).not.toBe(executionContentDigest(one));
  });

  test("the digest matches the manual canonical-JSON sha256", () => {
    const record = executionRecord();
    const content = { ...record, history: undefined };
    delete (content as { history?: unknown }).history;
    expect(executionContentDigest(record)).toBe(sha256Hex(canonicalJsonStringify(content)));
  });

  test("summarizeExecution is a pure count projection", () => {
    const summary = summarizeExecution(executionRecord());
    expect(summary).toEqual({
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepCount: 3,
      evidenceCount: 1,
      captureSessionCount: 1,
      outcomeCount: 0,
      executedAt: FIXED_EXECUTED,
      recordedAt: FIXED_NOW,
    });
  });
});

describe("execution model: stored-record parser (corruption discrimination)", () => {
  test("round-trips the full record (transition, outcomes, history)", () => {
    const record: ReturnType<typeof parseExecutionRecord> = {
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepIds: [STEP_FIRE_ID],
      evidenceIds: [EV_WORK_PHOTOS],
      captureSessionIds: [SESSION_WORK_1],
      executedAt: FIXED_EXECUTED,
      recordedAt: FIXED_NOW,
      stateTransition: {
        scenarioId: SCENARIO_ID,
        stateId: STATE_3_ID,
        fromStatus: "PROPOSED",
        toStatus: "EXECUTED",
        executionRecordId: EXECUTION_ID,
        evidenceIds: [EV_WORK_PHOTOS],
        recordedAt: FIXED_NOW,
      },
      outcomes: [
        {
          outcomeId: "out-0000123456789abc",
          executionRecordId: EXECUTION_ID,
          caseId: CASE_ID,
          statement: "Scan confirms REI90.",
          epistemicStatus: "OBSERVED",
          evidenceIds: [EV_POSTWORK_SCAN],
          captureSessionIds: [SESSION_POSTWORK_1],
          recordedAt: FIXED_NOW,
        },
      ],
      history: [
        {
          eventId: "evt-000001",
          eventType: "execution_recorded",
          occurredAt: FIXED_NOW,
          recordDigest: sha256Hex("probe"),
        },
      ],
    };
    const text = canonicalJsonStringify(record);
    expect(parseExecutionRecord(JSON.parse(text))).toEqual(record);
  });

  test("rejects corrupted records with typed invalid_execution_record", () => {
    const valid = {
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepIds: [STEP_FIRE_ID],
      evidenceIds: [EV_WORK_PHOTOS],
      captureSessionIds: [SESSION_WORK_1],
      executedAt: FIXED_EXECUTED,
      recordedAt: FIXED_NOW,
      stateTransition: {
        scenarioId: SCENARIO_ID,
        stateId: STATE_3_ID,
        fromStatus: "PROPOSED",
        toStatus: "EXECUTED",
        executionRecordId: EXECUTION_ID,
        evidenceIds: [EV_WORK_PHOTOS],
        recordedAt: FIXED_NOW,
      },
      outcomes: [],
      history: [],
    };
    const cases: [string, Record<string, unknown>][] = [
      ["non-64-hex stateId", { stateId: "state-3" }],
      ["empty executedStepIds", { executedStepIds: [] }],
      ["empty evidenceIds", { evidenceIds: [] }],
      ["non-64-hex evidenceIds", { evidenceIds: ["bad"] }],
      ["missing captureSessionIds", { captureSessionIds: undefined }],
      ["bad executedAt", { executedAt: "not-a-date" }],
      ["transition pins a foreign state", { stateId: stateIdOf("other") }],
      ["transition flips fromStatus", {
        stateTransition: { ...valid.stateTransition, fromStatus: "OBSERVED" },
      }],
      ["transition evidence diverges from the record", {
        stateTransition: { ...valid.stateTransition, evidenceIds: [EV_POSTWORK_SCAN] },
      }],
    ];
    for (const [label, override] of cases) {
      const corrupted = { ...valid, ...override } as Record<string, unknown>;
      expectCode(() => parseExecutionRecord(corrupted), "invalid_execution_record");
      void label;
    }
  });

  test("an outcome with a non-OBSERVED status on disk is corruption, never a fact", () => {
    const valid = {
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepIds: [STEP_FIRE_ID],
      evidenceIds: [EV_WORK_PHOTOS],
      captureSessionIds: [],
      executedAt: FIXED_EXECUTED,
      recordedAt: FIXED_NOW,
      stateTransition: {
        scenarioId: SCENARIO_ID,
        stateId: STATE_3_ID,
        fromStatus: "PROPOSED",
        toStatus: "EXECUTED",
        executionRecordId: EXECUTION_ID,
        evidenceIds: [EV_WORK_PHOTOS],
        recordedAt: FIXED_NOW,
      },
      outcomes: [
        {
          outcomeId: "out-1",
          executionRecordId: EXECUTION_ID,
          caseId: CASE_ID,
          statement: "x",
          epistemicStatus: "INFERRED",
          evidenceIds: [EV_POSTWORK_SCAN],
          captureSessionIds: [],
          recordedAt: FIXED_NOW,
        },
      ],
      history: [],
    };
    expectCode(() => parseExecutionRecord(valid), "invalid_execution_record");
  });

  test("the canonical context fixtures are internally consistent (guard rail)", () => {
    const context = buildApprovedScenarioContext();
    expect(context.status).toBe("approved");
    expect(context.states[3]?.appliedStepIds).toContain(STEP_FIRE_ID);
    expect(buildCaseContext().caseId).toBe(CASE_ID);
    expect(evidenceIdOf("work-photos")).toMatch(/^[0-9a-f]{64}$/);
  });
});
