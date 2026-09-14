/**
 * AISE-031 — Lineage verification tests (the issue→outcome chain).
 *
 * Depth mandated by the work order ("Verify lineage from issue to
 * outcome"): the FULL happy chain (case → observations/hypotheses →
 * intervention scenario/step/state → execution record → post-work capture
 * → outcome observation) and EVERY missing-link refusal — a broken hop is
 * a typed error naming the missing link, never a silently truncated
 * chain. The authority resolvers here are mutable maps so tests can break
 * exactly one hop at a time (simulating vanished/changed references after
 * the execution record was written).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { ExecutionService, type CaseContextResolver, type EvidenceMembershipResolver, type InterventionContextResolver } from "./service";
import { InMemoryExecutionStore } from "./store";
import {
  CANONICAL_EXECUTION,
  CANONICAL_OUTCOME,
  CASE_ID,
  EV_FIRE_CERT,
  EV_POSTWORK_PHOTO,
  EV_POSTWORK_SCAN,
  EV_THERMAL_CHECK,
  EV_WORK_PHOTOS,
  EXECUTION_ID,
  FIXED_APPROVAL,
  FIXED_EXECUTED,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  SCENARIO_ID,
  SESSION_POSTWORK_1,
  SESSION_POSTWORK_2,
  SESSION_WORK_1,
  STATE_2_ID,
  STATE_3_ID,
  STEP_FIRE_ID,
  STEP_PARTITION_ID,
  STEP_REMOVE_ID,
  buildApprovedScenarioContext,
  buildCaseContext,
  fixedClock,
} from "./testkit";
import type { CaseContext, InterventionContext } from "./model";

/* ------------------------------------------------------------------ */
/* Mutable authority fixtures: break exactly one hop at a time          */
/* ------------------------------------------------------------------ */

interface MutableAuthorities {
  scenarios: Map<string, InterventionContext>;
  cases: Map<string, CaseContext>;
  evidence: Set<string>;
}

function mutableAuthorities(): MutableAuthorities {
  return {
    scenarios: new Map([[SCENARIO_ID, buildApprovedScenarioContext()]]),
    cases: new Map([[CASE_ID, buildCaseContext()]]),
    evidence: new Set(KNOWN_EVIDENCE),
  };
}

function mutableResolvers(authorities: MutableAuthorities): {
  interventionContextResolver: InterventionContextResolver;
  caseContextResolver: CaseContextResolver;
  evidenceMembershipResolver: EvidenceMembershipResolver;
} {
  return {
    interventionContextResolver: {
      resolveInterventionContext: async (scenarioId) =>
        authorities.scenarios.get(scenarioId) ?? null,
    },
    caseContextResolver: {
      resolveCaseContext: async (caseId) => authorities.cases.get(caseId) ?? null,
    },
    evidenceMembershipResolver: {
      evidenceExists: async (contentId) => authorities.evidence.has(contentId),
    },
  };
}

/** A service over mutable authorities + a fresh in-memory store. */
function lineageService(authorities: MutableAuthorities): ExecutionService {
  return new ExecutionService({
    store: new InMemoryExecutionStore(),
    clock: fixedClock,
    ...mutableResolvers(authorities),
  });
}

async function rejectionOf(action: () => Promise<unknown>): Promise<{ code: string; detail: string }> {
  return action().then(
    () => {
      throw new Error("expected a typed rejection");
    },
    (failure: unknown) => failure as { code: string; detail: string },
  );
}

/* ------------------------------------------------------------------ */
/* The full happy chain                                                 */
/* ------------------------------------------------------------------ */

describe("execution lineage: the verified issue→outcome chain", () => {
  test("happy path: every hop resolved and carried — case, scenario, state, steps, evidence, capture, outcome", async () => {
    const authorities = mutableAuthorities();
    const service = lineageService(authorities);
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);

    const lineage = await service.getCaseLineage(CASE_ID);
    // The ISSUE end of the chain: the case context with its observations
    // and hypotheses (verbatim statements + evidence refs).
    expect(lineage.caseId).toBe(CASE_ID);
    expect(lineage.case.caseId).toBe(CASE_ID);
    expect(lineage.case.title).toBe("Office refit — fire compartment non-compliance");
    expect(lineage.case.observations).toHaveLength(2);
    expect(lineage.case.observations[0]?.evidenceIds).toHaveLength(2);
    expect(lineage.case.hypotheses[0]?.epistemicStatus).toBe("INFERRED");

    // The INTERVENTION hop: the scenario context (approved governance).
    expect(lineage.executions).toHaveLength(1);
    const entry = lineage.executions[0]!;
    expect(entry.executionRecordId).toBe(EXECUTION_ID);
    expect(entry.executedAt).toBe(FIXED_EXECUTED);
    expect(entry.recordedAt).toBe(FIXED_NOW);
    expect(entry.scenario.scenarioId).toBe(SCENARIO_ID);
    expect(entry.scenario.status).toBe("approved");
    expect(entry.scenario.approvalReference).toEqual({
      caseId: CASE_ID,
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    });
    // The executed STATE layer + its full applied-step spine.
    expect(entry.executedState).toEqual({
      stateId: STATE_3_ID,
      stateIndex: 3,
      appliedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID, STEP_REMOVE_ID],
    });
    expect(entry.executedStepIds).toEqual([STEP_FIRE_ID, STEP_PARTITION_ID, STEP_REMOVE_ID]);
    // EXECUTION evidence (the work happened) ...
    expect(entry.executionEvidenceIds).toEqual([EV_WORK_PHOTOS, EV_FIRE_CERT]);
    // ... the PROPOSED → EXECUTED transition record ...
    expect(entry.stateTransition).toEqual({
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      fromStatus: "PROPOSED",
      toStatus: "EXECUTED",
      executionRecordId: EXECUTION_ID,
      evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
      recordedAt: FIXED_NOW,
    });
    // ... POST-WORK capture (execution work-session + outcome sessions,
    // deduplicated) ...
    expect(entry.postWorkCaptureSessionIds).toEqual([SESSION_WORK_1, SESSION_POSTWORK_1]);
    // ... and the OUTCOME observations (OBSERVED facts with new evidence).
    expect(entry.outcomes).toHaveLength(1);
    expect(entry.outcomes[0]?.epistemicStatus).toBe("OBSERVED");
    expect(entry.outcomes[0]?.evidenceIds).toEqual([EV_POSTWORK_SCAN, EV_POSTWORK_PHOTO]);
    expect(entry.outcomes[0]?.captureSessionIds).toEqual([SESSION_POSTWORK_1]);
    expect(entry.outcomes[0]?.measurementRefs).toEqual(["meas-postwork-1"]);
  });

  test("the capture hop dedupes sessions shared by execution and outcomes", async () => {
    const service = lineageService(mutableAuthorities());
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, {
      ...CANONICAL_OUTCOME,
      captureSessionIds: [SESSION_POSTWORK_1, SESSION_POSTWORK_2, SESSION_WORK_1],
    });
    const lineage = await service.getCaseLineage(CASE_ID);
    // SESSION_WORK_1 appears on the execution AND the outcome; POSTWORK_1
    // twice on the outcome — the lineage carries each ONCE.
    expect(lineage.executions[0]?.postWorkCaptureSessionIds).toEqual([
      SESSION_WORK_1,
      SESSION_POSTWORK_1,
      SESSION_POSTWORK_2,
    ]);
  });

  test("deterministic: the same operation sequence yields a byte-identical lineage", async () => {
    const build = async (): Promise<string> => {
      const service = lineageService(mutableAuthorities());
      await service.recordExecution(CANONICAL_EXECUTION);
      await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
      return canonicalJsonStringify(await service.getCaseLineage(CASE_ID));
    };
    expect(await build()).toBe(await build());
  });

  test("multiple executions for one case: each entry is a verified chain link", async () => {
    const service = lineageService(mutableAuthorities());
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    // A phased second execution at layer 2 (a subset of the layer's steps).
    await service.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-phase-a",
      stateId: STATE_2_ID,
      executedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID],
    });
    await service.recordOutcome("execution-phase-a", CANONICAL_OUTCOME);
    const lineage = await service.getCaseLineage(CASE_ID);
    // list() order: sorted by executionRecordId ("office" < "phase").
    expect(lineage.executions.map((entry) => entry.executionRecordId)).toEqual([
      EXECUTION_ID,
      "execution-phase-a",
    ]);
    expect(lineage.executions[0]?.executedState.stateIndex).toBe(3);
    expect(lineage.executions[1]?.executedState.stateIndex).toBe(2);
  });

  test("only the case's own executions appear (no cross-case leakage)", async () => {
    const authorities = mutableAuthorities();
    authorities.cases.set("case-other", { ...buildCaseContext(), caseId: "case-other" });
    const service = lineageService(authorities);
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    await service.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-other-case",
      caseId: "case-other",
    });
    await service.recordOutcome("execution-other-case", {
      ...CANONICAL_OUTCOME,
      caseId: "case-other",
    });
    const lineage = await service.getCaseLineage(CASE_ID);
    expect(lineage.executions.map((entry) => entry.executionRecordId)).toEqual([EXECUTION_ID]);
  });
});

/* ------------------------------------------------------------------ */
/* Missing-link refusals (every hop can break)                          */
/* ------------------------------------------------------------------ */

describe("execution lineage: typed refusals on missing links", () => {
  test("case_not_found: the case itself does not resolve", async () => {
    const service = lineageService(mutableAuthorities());
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    const error = await rejectionOf(() => service.getCaseLineage("case-ghost"));
    expect(error.code).toBe("case_not_found");
    expect(error.detail).toContain("case-ghost");
  });

  test("lineage_missing_execution: the case has no execution record yet", async () => {
    const service = lineageService(mutableAuthorities());
    const error = await rejectionOf(() => service.getCaseLineage(CASE_ID));
    expect(error.code).toBe("lineage_missing_execution");
    expect(error.detail).toContain(CASE_ID);
    // An execution for ANOTHER case does not satisfy this case's chain.
    authoritiesCaseOther();
    async function authoritiesCaseOther(): Promise<void> {
      const authorities = mutableAuthorities();
      authorities.cases.set("case-other", { ...buildCaseContext(), caseId: "case-other" });
      const other = lineageService(authorities);
      await other.recordExecution({
        ...CANONICAL_EXECUTION,
        caseId: "case-other",
      });
      const mine = lineageService(authorities);
      const stillMissing = await rejectionOf(() => mine.getCaseLineage(CASE_ID));
      expect(stillMissing.code).toBe("lineage_missing_execution");
    }
  });

  test("lineage_missing_outcome: an execution without an outcome observation", async () => {
    const service = lineageService(mutableAuthorities());
    await service.recordExecution(CANONICAL_EXECUTION);
    const error = await rejectionOf(() => service.getCaseLineage(CASE_ID));
    expect(error.code).toBe("lineage_missing_outcome");
    expect(error.detail).toContain(EXECUTION_ID);
  });

  test("lineage_missing_capture: neither the execution nor its outcomes reference post-work capture", async () => {
    const service = lineageService(mutableAuthorities());
    await service.recordExecution({ ...CANONICAL_EXECUTION, captureSessionIds: undefined });
    await service.recordOutcome(EXECUTION_ID, { ...CANONICAL_OUTCOME, captureSessionIds: undefined });
    const error = await rejectionOf(() => service.getCaseLineage(CASE_ID));
    expect(error.code).toBe("lineage_missing_capture");
    expect(error.detail).toContain(EXECUTION_ID);
    // A capture reference on ONLY the outcome satisfies the hop ...
    const withOutcomeCapture = lineageService(mutableAuthorities());
    await withOutcomeCapture.recordExecution({ ...CANONICAL_EXECUTION, captureSessionIds: undefined });
    await withOutcomeCapture.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    const lineage = await withOutcomeCapture.getCaseLineage(CASE_ID);
    expect(lineage.executions[0]?.postWorkCaptureSessionIds).toEqual([SESSION_POSTWORK_1]);
    // ... and one on ONLY the execution does too.
    const withExecutionCapture = lineageService(mutableAuthorities());
    await withExecutionCapture.recordExecution(CANONICAL_EXECUTION);
    await withExecutionCapture.recordOutcome(EXECUTION_ID, {
      ...CANONICAL_OUTCOME,
      captureSessionIds: undefined,
    });
    const lineage2 = await withExecutionCapture.getCaseLineage(CASE_ID);
    expect(lineage2.executions[0]?.postWorkCaptureSessionIds).toEqual([SESSION_WORK_1]);
  });

  test("unknown_scenario_ref: the execution's scenario vanished after the fact", async () => {
    const authorities = mutableAuthorities();
    const service = lineageService(authorities);
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    authorities.scenarios.delete(SCENARIO_ID);
    const error = await rejectionOf(() => service.getCaseLineage(CASE_ID));
    expect(error.code).toBe("unknown_scenario_ref");
    expect(error.detail).toContain(SCENARIO_ID);
    expect(error.detail).toContain(EXECUTION_ID);
  });

  test("unknown_state_ref: the scenario no longer materializes the recorded state layer", async () => {
    const authorities = mutableAuthorities();
    const service = lineageService(authorities);
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    const scenario = authorities.scenarios.get(SCENARIO_ID)!;
    authorities.scenarios.set(SCENARIO_ID, {
      ...scenario,
      states: scenario.states.filter((state) => state.stateId !== STATE_3_ID),
    });
    const error = await rejectionOf(() => service.getCaseLineage(CASE_ID));
    expect(error.code).toBe("unknown_state_ref");
    expect(error.detail).toContain(STATE_3_ID);
  });

  test("unknown_step_ref / step_not_in_state: the executed steps left the scenario or the layer", async () => {
    // A recorded step id that the scenario no longer knows.
    const ghostAuthorities = mutableAuthorities();
    const ghostService = lineageService(ghostAuthorities);
    await ghostService.recordExecution(CANONICAL_EXECUTION);
    await ghostService.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    const ghostScenario = ghostAuthorities.scenarios.get(SCENARIO_ID)!;
    ghostAuthorities.scenarios.set(SCENARIO_ID, {
      ...ghostScenario,
      steps: ghostScenario.steps.filter((step) => step.stepId !== STEP_REMOVE_ID),
      states: ghostScenario.states.map((state) => ({
        ...state,
        appliedStepIds: state.appliedStepIds.filter((stepId) => stepId !== STEP_REMOVE_ID),
      })),
    });
    const ghost = await rejectionOf(() => ghostService.getCaseLineage(CASE_ID));
    expect(ghost.code).toBe("unknown_step_ref");
    expect(ghost.detail).toContain(STEP_REMOVE_ID);

    // A step that still exists but is no longer part of the recorded layer.
    const misalignedAuthorities = mutableAuthorities();
    const misalignedService = lineageService(misalignedAuthorities);
    await misalignedService.recordExecution(CANONICAL_EXECUTION);
    await misalignedService.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    const misScenario = misalignedAuthorities.scenarios.get(SCENARIO_ID)!;
    misalignedAuthorities.scenarios.set(SCENARIO_ID, {
      ...misScenario,
      states: misScenario.states.map((state) =>
        state.stateId === STATE_3_ID
          ? { ...state, appliedStepIds: state.appliedStepIds.slice(0, 2) }
          : state,
      ),
    });
    const misaligned = await rejectionOf(() => misalignedService.getCaseLineage(CASE_ID));
    expect(misaligned.code).toBe("step_not_in_state");
    expect(misaligned.detail).toContain(STEP_REMOVE_ID);
  });

  test("unknown_evidence_ref: execution evidence OR outcome evidence vanished", async () => {
    // Execution evidence first: the walk verifies it before outcomes.
    const executionEvidenceAuthorities = mutableAuthorities();
    const executionEvidenceService = lineageService(executionEvidenceAuthorities);
    await executionEvidenceService.recordExecution(CANONICAL_EXECUTION);
    await executionEvidenceService.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    executionEvidenceAuthorities.evidence.delete(EV_FIRE_CERT);
    const executionEvidence = await rejectionOf(() =>
      executionEvidenceService.getCaseLineage(CASE_ID),
    );
    expect(executionEvidence.code).toBe("unknown_evidence_ref");
    expect(executionEvidence.detail).toContain(EV_FIRE_CERT);

    // Outcome evidence: every outcome's evidence list is verified too.
    const outcomeEvidenceAuthorities = mutableAuthorities();
    const outcomeEvidenceService = lineageService(outcomeEvidenceAuthorities);
    await outcomeEvidenceService.recordExecution(CANONICAL_EXECUTION);
    await outcomeEvidenceService.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    outcomeEvidenceAuthorities.evidence.delete(EV_POSTWORK_PHOTO);
    const outcomeEvidence = await rejectionOf(() =>
      outcomeEvidenceService.getCaseLineage(CASE_ID),
    );
    expect(outcomeEvidence.code).toBe("unknown_evidence_ref");
    expect(outcomeEvidence.detail).toContain(EV_POSTWORK_PHOTO);
  });

  test("invalid_case_id: a malformed case id refuses before any resolution", async () => {
    const service = lineageService(mutableAuthorities());
    const error = await rejectionOf(() => service.getCaseLineage("x".repeat(257)));
    expect(error.code).toBe("invalid_case_id");
  });

  test("one broken link fails the WHOLE chain (never a truncated lineage)", async () => {
    const authorities = mutableAuthorities();
    const service = lineageService(authorities);
    // Two executions; the SECOND one's outcome evidence will vanish.
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, CANONICAL_OUTCOME);
    await service.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-b",
      stateId: STATE_2_ID,
      executedStepIds: [STEP_FIRE_ID],
    });
    await service.recordOutcome("execution-b", {
      ...CANONICAL_OUTCOME,
      evidenceIds: [EV_THERMAL_CHECK],
    });
    authorities.evidence.delete(EV_THERMAL_CHECK);
    const error = await rejectionOf(() => service.getCaseLineage(CASE_ID));
    expect(error.code).toBe("unknown_evidence_ref");
    expect(error.detail).toContain(EV_THERMAL_CHECK);
  });
});
