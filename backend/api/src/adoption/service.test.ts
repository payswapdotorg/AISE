/**
 * AISE-041 — adoption SERVICE tests: the workflow inventory lifecycle,
 * the deterministic assessment flow (adapter view, byte-identical
 * recomputation, incumbent-authority preservation), and the FULL
 * no-false-claims migration state machine (progressive one-step
 * advances; `replaced` only with equivalence + acceptance + active
 * rollback plan; rollback-plan retention until acceptance; the recorded
 * reverse transition with provenance; append-only history discipline).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createAdapterRegistry } from "../integrations/registry";
import type { AdapterRegistry } from "../integrations/registry";
import type { AdapterDescriptor } from "../integrations/model";
import { AdoptionError, type AdoptionErrorCode, type MigrationCandidate, type WorkflowStep } from "./model";
import { InMemoryAdoptionStore } from "./store";
import { FsAdoptionStore } from "./store";
import { AdoptionService } from "./service";
import {
  CANONICAL_ADAPTERS,
  EV_ACCEPTANCE_A,
  EV_EVALUATION_A,
  EV_PILOT_OUTCOME_A,
  EV_PILOT_OUTCOME_B,
  FIXED_NOW,
  WORKFLOW_ID,
  buildAdapterRegistry,
  buildAcceptanceInput,
  buildCreateCandidateInput,
  buildCreateWorkflowInput,
  buildEquivalenceInput,
  buildEvaluationAdvance,
  buildPilotAdvance,
  buildRollbackPlanInput,
  canonicalAdapterResolver,
  canonicalSteps,
  emptyCanonicalAdapterResolver,
  mapAdapterResolver,
  makeService,
  withTempDir,
} from "./testkit";

/** Expect a typed AdoptionError with the given code. */
async function expectRefusal(
  promise: Promise<unknown>,
  code: AdoptionErrorCode,
): Promise<void> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AdoptionError);
  expect((caught as AdoptionError).code).toBe(code);
}

/** A fresh service with the canonical workflow already created. */
async function serviceWithWorkflow(
  resolver = canonicalAdapterResolver(),
): Promise<AdoptionService> {
  const service = makeService(new InMemoryAdoptionStore(), resolver);
  await service.createWorkflow(buildCreateWorkflowInput());
  return service;
}

/** A candidate at `proposed` over step-takeoff. */
async function proposedCandidate(service: AdoptionService): Promise<MigrationCandidate> {
  return service.createCandidate(buildCreateCandidateInput());
}

describe("adoption service: workflow inventory lifecycle", () => {
  test("createWorkflow commits the inventory record with a provenance-bearing creation event", async () => {
    const service = await serviceWithWorkflow();
    const record = await service.getWorkflow(WORKFLOW_ID);
    expect(record?.steps.length).toBe(4);
    expect(record?.history.length).toBe(1);
    expect(record?.history[0]?.eventType).toBe("workflow_recorded");
    expect(record?.history[0]?.actor).toBe("inventory-clerk-01");
    expect(record?.history[0]?.occurredAt).toBe(FIXED_NOW);
  });

  test("workflow id reuse is a typed refusal (inventory is append-only)", async () => {
    const service = await serviceWithWorkflow();
    await expectRefusal(
      service.createWorkflow(buildCreateWorkflowInput()),
      "workflow_exists",
    );
  });

  test("appendStep appends and the PRIOR event digests never change (append-only history)", async () => {
    const service = await serviceWithWorkflow();
    const before = await service.getWorkflow(WORKFLOW_ID);
    const beforeEvents = before?.history.map((event) => ({ ...event })) ?? [];
    const appended = await service.appendStep(WORKFLOW_ID, {
      step: JSON.parse(
        JSON.stringify({
          ...canonicalSteps()[0],
          stepId: "step-tender-close",
          name: "Tender close-out",
        }),
      ),
      actor: "inventory-clerk-01",
    });
    expect(appended.steps.length).toBe(5);
    expect(appended.history.length).toBe(2);
    expect(appended.history[1]?.eventType).toBe("workflow_step_appended");
    // The prior event is carried over UNCHANGED.
    expect(appended.history[0]).toEqual(beforeEvents[0]);
    // Duplicate step ids are refused.
    await expectRefusal(
      service.appendStep(WORKFLOW_ID, {
        step: JSON.parse(JSON.stringify({ ...canonicalSteps()[0] })),
        actor: "inventory-clerk-01",
      }),
      "step_exists",
    );
    // Unknown workflow is a 404-class not-found.
    await expectRefusal(
      service.appendStep("workflow-never", {
        step: JSON.parse(JSON.stringify({ ...canonicalSteps()[0] })),
        actor: "inventory-clerk-01",
      }),
      "workflow_not_found",
    );
  });

  test("the workflow record embeds ONLY id references — never incumbent descriptor content", async () => {
    const service = await serviceWithWorkflow();
    const record = await service.getWorkflow(WORKFLOW_ID);
    const text = canonicalJsonStringify(record);
    // BY-ID references present…
    expect(text).toContain("adapter-bim-01");
    expect(text).toContain("bim-prod-01");
    // …descriptor content ABSENT (the integrations authority keeps its truth).
    expect(text).not.toContain("displayName");
    expect(text).not.toContain("Incumbent BIM connector");
    expect(text).not.toContain("import-entities");
  });
});

describe("adoption service: the assessment flow", () => {
  test("runAssessment commits the derived record; reuse of the id is a typed refusal", async () => {
    const service = await serviceWithWorkflow();
    const record = await service.runAssessment(WORKFLOW_ID, {
      assessmentId: "adoption-assessment-1",
      actor: "adoption-lead-01",
    });
    expect(record.rankedSteps.map((ranked) => ranked.stepId)).toEqual([
      "step-takeoff",
      "step-boq-transfer",
      "step-erp-approval",
      "step-site-verification",
    ]);
    // The consumed adapter view is carried verbatim (context, never a write).
    expect(record.adapterView).toEqual([
      { adapterId: "adapter-bim-01", descriptor: CANONICAL_ADAPTERS[0] as AdapterDescriptor },
      { adapterId: "adapter-erp-99", descriptor: null },
    ]);
    await expectRefusal(
      service.runAssessment(WORKFLOW_ID, {
        assessmentId: "adoption-assessment-1",
        actor: "adoption-lead-01",
      }),
      "assessment_exists",
    );
  });

  test("an empty workflow cannot be assessed (the profiler scores declared steps)", async () => {
    const service = makeService(new InMemoryAdoptionStore());
    await service.createWorkflow({
      ...buildCreateWorkflowInput("workflow-empty"),
      steps: [],
    });
    await expectRefusal(
      service.runAssessment("workflow-empty", {
        assessmentId: "assessment-empty",
        actor: "adoption-lead-01",
      }),
      "workflow_without_steps",
    );
  });

  test("a ref whose resolved adapter serves a DIFFERENT system class is a typed refusal", async () => {
    // The registry serves adapter-bim-01 as bim-ifc; point a project-management ref at it.
    const steps: WorkflowStep[] = canonicalSteps().map((step) =>
      step.stepId === "step-boq-transfer"
        ? {
            ...step,
            systemsOfRecord: [
              {
                systemClass: "project-management" as const,
                systemInstanceId: "bim-prod-01",
                adapterId: "adapter-bim-01",
              },
            ],
          }
        : step,
    );
    const service = makeService(new InMemoryAdoptionStore());
    await service.createWorkflow({ ...buildCreateWorkflowInput(), steps });
    await expectRefusal(
      service.runAssessment(WORKFLOW_ID, {
        assessmentId: "assessment-mismatch",
        actor: "adoption-lead-01",
      }),
      "adapter_class_mismatch",
    );
  });

  test("the adapter REGISTRY is never mutated by an assessment (read-only seam)", async () => {
    const registry: AdapterRegistry = buildAdapterRegistry();
    const resolver = {
      resolveAdapterDescriptor: async (adapterId: string) => {
        const result = registry.lookup(adapterId);
        return result.ok ? result.adapter.descriptor : null;
      },
    };
    const service = makeService(new InMemoryAdoptionStore(), resolver);
    await service.createWorkflow(buildCreateWorkflowInput());
    const before = registry.listAll().map((adapter) => adapter.descriptor);
    await service.runAssessment(WORKFLOW_ID, {
      assessmentId: "assessment-registry-check",
      actor: "adoption-lead-01",
    });
    expect(registry.listAll().map((adapter) => adapter.descriptor)).toEqual(before);
    expect(registry.listAll().length).toBe(2);
  });

  test("byte-identical recomputation: same inputs + same clock → identical records in fresh stores", async () => {
    await withTempDir(async (dir) => {
      const first = new FsAdoptionStore(`${dir}/a`);
      const second = new FsAdoptionStore(`${dir}/b`);
      const serviceA = makeService(first);
      const serviceB = makeService(second);
      await serviceA.createWorkflow(buildCreateWorkflowInput());
      await serviceB.createWorkflow(buildCreateWorkflowInput());
      const assessmentA = await serviceA.runAssessment(WORKFLOW_ID, {
        assessmentId: "adoption-assessment-1",
        actor: "adoption-lead-01",
      });
      const assessmentB = await serviceB.runAssessment(WORKFLOW_ID, {
        assessmentId: "adoption-assessment-1",
        actor: "adoption-lead-01",
      });
      expect(canonicalJsonStringify(assessmentA)).toBe(canonicalJsonStringify(assessmentB));
      // And the workflow records are byte-identical too.
      const workflowA = await serviceA.getWorkflow(WORKFLOW_ID);
      const workflowB = await serviceB.getWorkflow(WORKFLOW_ID);
      expect(canonicalJsonStringify(workflowA)).toBe(canonicalJsonStringify(workflowB));
    });
  });

  test("Fs and InMemory twins persist byte-identical canonical records", async () => {
    await withTempDir(async (dir) => {
      const fsStore = new FsAdoptionStore(`${dir}/fs`);
      const memoryStore = new InMemoryAdoptionStore();
      const fsService = makeService(fsStore);
      const memoryService = makeService(memoryStore);
      await fsService.createWorkflow(buildCreateWorkflowInput());
      await memoryService.createWorkflow(buildCreateWorkflowInput());
      await fsService.runAssessment(WORKFLOW_ID, {
        assessmentId: "adoption-assessment-1",
        actor: "adoption-lead-01",
      });
      await memoryService.runAssessment(WORKFLOW_ID, {
        assessmentId: "adoption-assessment-1",
        actor: "adoption-lead-01",
      });
      const fsWorkflow = await fsStore.getWorkflow(WORKFLOW_ID);
      const memoryWorkflow = await memoryStore.getWorkflow(WORKFLOW_ID);
      expect(canonicalJsonStringify(fsWorkflow)).toBe(canonicalJsonStringify(memoryWorkflow));
      const fsAssessment = await fsStore.getAssessment("adoption-assessment-1");
      const memoryAssessment = await memoryStore.getAssessment("adoption-assessment-1");
      expect(canonicalJsonStringify(fsAssessment)).toBe(
        canonicalJsonStringify(memoryAssessment),
      );
    });
  });

  test("an assessment against a resolver that resolves nothing honestly reports uncovered refs", async () => {
    const service = await serviceWithWorkflow(emptyCanonicalAdapterResolver());
    const record = await service.runAssessment(WORKFLOW_ID, {
      assessmentId: "assessment-empty-registry",
      actor: "adoption-lead-01",
    });
    expect(record.adapterView).toEqual([{ adapterId: "adapter-bim-01", descriptor: null }, { adapterId: "adapter-erp-99", descriptor: null }]);
    const boq = record.steps.find((step) => step.stepId === "step-boq-transfer");
    const coverage = boq?.readiness.components.connectorCoverage;
    expect(coverage?.kind).toBe("known");
    expect((coverage as { value?: number } | undefined)?.value).toBe(0);
    expect((coverage as { derivation?: string } | undefined)?.derivation).toContain(
      "not registered",
    );
  });
});

describe("adoption service: candidate creation and references", () => {
  test("createCandidate lands at `proposed` with provenance", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    expect(candidate.state).toBe("proposed");
    expect(candidate.history[0]?.eventType).toBe("candidate_proposed");
    expect(candidate.recordedBy).toBe("adoption-lead-01");
  });

  test("unknown workflow / unknown step / duplicate candidate are distinct typed refusals", async () => {
    const service = await serviceWithWorkflow();
    await proposedCandidate(service);
    await expectRefusal(
      service.createCandidate({
        ...buildCreateCandidateInput(),
        candidateId: "candidate-unknown-workflow",
        workflowId: "workflow-never",
      }),
      "unknown_workflow",
    );
    await expectRefusal(
      service.createCandidate({
        ...buildCreateCandidateInput(),
        candidateId: "candidate-unknown-step",
        stepId: "step-never",
      }),
      "unknown_step",
    );
    await expectRefusal(service.createCandidate(buildCreateCandidateInput()), "candidate_exists");
  });
});

describe("adoption service: THE no-false-claims state machine", () => {
  test("advancing to `evaluating` REQUIRES an active rollback plan first (reversibility precondition)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance()),
      "rollback_plan_required",
    );
  });

  test("advancing to `evaluating` requires NON-EMPTY evaluation evidence", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "evaluating",
        evidenceIds: [],
        actor: "adoption-lead-01",
      }),
      "evaluation_evidence_required",
    );
  });

  test("skipping states is refused (proposed → piloted directly)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, buildPilotAdvance()),
      "transition_out_of_sequence",
    );
  });

  test("matrix: piloted WITHOUT equivalence → equivalence_record_required (naming what is missing)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    let detail = "";
    try {
      await service.advanceCandidate(candidate.candidateId, {
        to: "replaced",
        evidenceIds: [],
        actor: "adoption-lead-01",
      });
    } catch (error) {
      detail = error instanceof AdoptionError ? error.detail : "";
    }
    expect(detail).toContain("semantic-equivalence");
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "replaced",
        evidenceIds: [],
        actor: "adoption-lead-01",
      }),
      "equivalence_record_required",
    );
  });

  test("matrix: piloted WITH equivalence but WITHOUT acceptance → acceptance_record_required", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "replaced",
        evidenceIds: [],
        actor: "adoption-lead-01",
      }),
      "acceptance_record_required",
    );
  });

  test("matrix: equivalence + acceptance but NO active rollback plan → rollback_plan_required", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    // Acceptance exists → retiring the plan is now allowed…
    await service.retireRollbackPlan(
      candidate.candidateId,
      buildRollbackPlanInput().planId,
      { actor: "adoption-lead-01" },
    );
    // …but replacement still demands rollback capability (architecture lock).
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "replaced",
        evidenceIds: [],
        actor: "adoption-lead-01",
      }),
      "rollback_plan_required",
    );
  });

  test("matrix: equivalence + acceptance + active plan → `replaced` is granted, with the full event trail", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    const replaced = await service.advanceCandidate(candidate.candidateId, {
      to: "replaced",
      evidenceIds: [],
      actor: "adoption-lead-01",
    });
    expect(replaced.state).toBe("replaced");
    expect(replaced.equivalence?.limits).toContain("curved-wall");
    expect(replaced.acceptance?.acceptedBy).toBe("operations-acceptor-01");
    expect(replaced.evaluationEvidenceIds).toEqual([EV_EVALUATION_A]);
    expect(replaced.pilotOutcomeEvidenceIds).toEqual([EV_PILOT_OUTCOME_A, EV_PILOT_OUTCOME_B]);
    // The event trail records every transition with provenance.
    const transitions = replaced.history
      .filter((event) => event.eventType === "candidate_advanced")
      .map((event) => event.transition);
    expect(transitions).toEqual([
      { from: "proposed", to: "evaluating" },
      { from: "evaluating", to: "piloted" },
      { from: "piloted", to: "replaced" },
    ]);
    // The pilot-advance event carries the pilot-outcome evidence ids.
    const pilotEvent = replaced.history.find(
      (event) => event.transition?.to === "piloted",
    );
    expect(pilotEvent?.evidenceIds).toEqual([EV_PILOT_OUTCOME_A, EV_PILOT_OUTCOME_B]);
    // Advancing from `replaced` has no successor.
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "evaluating",
        evidenceIds: [],
        actor: "adoption-lead-01",
      }),
      "transition_out_of_sequence",
    );
  });

  test("rollback-plan RETENTION: retiring before operational acceptance is a typed refusal", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await expectRefusal(
      service.retireRollbackPlan(candidate.candidateId, buildRollbackPlanInput().planId, {
        actor: "adoption-lead-01",
      }),
      "rollback_plan_still_required",
    );
    // …and after acceptance it is allowed, with the plan REMAINING in the record.
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    const retired = await service.retireRollbackPlan(
      candidate.candidateId,
      buildRollbackPlanInput().planId,
      { actor: "adoption-lead-01" },
    );
    expect(retired.rollbackPlans[0]?.state).toBe("retired");
    expect(retired.rollbackPlans[0]?.retiredBy).toBe("adoption-lead-01");
    expect(retired.rollbackPlans.length).toBe(1);
    // Retiring twice is refused.
    await expectRefusal(
      service.retireRollbackPlan(candidate.candidateId, buildRollbackPlanInput().planId, {
        actor: "adoption-lead-01",
      }),
      "rollback_plan_inactive",
    );
  });

  test("equivalence/acceptance recording is state-gated and single-shot", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    // Equivalence while `proposed` is premature.
    await expectRefusal(
      service.recordEquivalence(candidate.candidateId, buildEquivalenceInput()),
      "equivalence_state_conflict",
    );
    // Acceptance while `proposed` is not an operational verdict.
    await expectRefusal(
      service.recordAcceptance(candidate.candidateId, buildAcceptanceInput()),
      "acceptance_state_conflict",
    );
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    // A second equivalence is a new-candidate matter.
    await expectRefusal(
      service.recordEquivalence(candidate.candidateId, buildEquivalenceInput()),
      "equivalence_already_recorded",
    );
    // Acceptance while `evaluating` is refused (it belongs to the pilot).
    await expectRefusal(
      service.recordAcceptance(candidate.candidateId, buildAcceptanceInput()),
      "acceptance_state_conflict",
    );
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    await expectRefusal(
      service.recordAcceptance(candidate.candidateId, buildAcceptanceInput()),
      "acceptance_already_recorded",
    );
  });

  test("advancing to `piloted` requires NON-EMPTY pilot-outcome evidence (friction metrics tie to pilots)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "piloted",
        evidenceIds: [],
        actor: "adoption-lead-01",
      }),
      "pilot_evidence_required",
    );
  });

  test("THE recorded rollback transition carries full provenance and is terminal", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    const rolledBack = await service.rollbackCandidate(candidate.candidateId, {
      actor: "operations-acceptor-01",
    });
    expect(rolledBack.state).toBe("rolled_back");
    const rollbackEvent = rolledBack.history[rolledBack.history.length - 1];
    expect(rollbackEvent?.eventType).toBe("candidate_rolled_back");
    expect(rollbackEvent?.actor).toBe("operations-acceptor-01");
    expect(rollbackEvent?.occurredAt).toBe(FIXED_NOW);
    expect(rollbackEvent?.transition).toEqual({ from: "evaluating", to: "rolled_back" });
    expect(rollbackEvent?.rollbackPlanId).toBe("plan-restore-takeoff-01");
    // Terminal: no advance, no re-rollback, no further plans.
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance()),
      "transition_from_terminal",
    );
    await expectRefusal(
      service.rollbackCandidate(candidate.candidateId, { actor: "a" }),
      "transition_from_terminal",
    );
    await expectRefusal(
      service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput()),
      "rollback_plan_state_conflict",
    );
  });

  test("rollback of a never-advanced candidate is refused (nothing to roll back)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await expectRefusal(
      service.rollbackCandidate(candidate.candidateId, { actor: "a" }),
      "transition_out_of_sequence",
    );
  });

  test("rollback with an explicit plan id: unknown plan / retired plan are distinct refusals", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await expectRefusal(
      service.rollbackCandidate(candidate.candidateId, { actor: "a", planId: "plan-never" }),
      "unknown_rollback_plan",
    );
    // Retire the plan after acceptance, then name it explicitly.
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    await service.retireRollbackPlan(
      candidate.candidateId,
      buildRollbackPlanInput().planId,
      { actor: "adoption-lead-01" },
    );
    await expectRefusal(
      service.rollbackCandidate(candidate.candidateId, {
        actor: "a",
        planId: buildRollbackPlanInput().planId,
      }),
      "rollback_plan_inactive",
    );
  });

  test("a replaced candidate whose plans were retired cannot roll back (honest irreversibility)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    // Replaced WHILE the plan is still active (the replacement triple holds)…
    await service.advanceCandidate(candidate.candidateId, {
      to: "replaced",
      evidenceIds: [],
      actor: "adoption-lead-01",
    });
    // …then retire it (allowed after acceptance) → rollback is honestly refused.
    await service.retireRollbackPlan(
      candidate.candidateId,
      buildRollbackPlanInput().planId,
      { actor: "adoption-lead-01" },
    );
    await expectRefusal(
      service.rollbackCandidate(candidate.candidateId, { actor: "a" }),
      "rollback_plan_required",
    );
  });

  test("candidate histories are append-only: prior event digests never change across mutations", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    const prefix = candidate.history.map((event) => ({ ...event }));
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    const evolved = await service.getCandidate(candidate.candidateId);
    expect(evolved?.history.slice(0, prefix.length)).toEqual(prefix);
    // Event ids are sequential per record.
    expect(evolved?.history.map((event) => event.eventId)).toEqual([
      "evt-000001",
      "evt-000002",
      "evt-000003",
    ]);
  });

  test("byte-identical candidate records: same operation sequence + same clock in fresh stores", async () => {
    await withTempDir(async (dir) => {
      const drive = async (store: FsAdoptionStore | InMemoryAdoptionStore): Promise<unknown> => {
        const service = makeService(store);
        await service.createWorkflow(buildCreateWorkflowInput());
        const candidate = await service.createCandidate(buildCreateCandidateInput());
        await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
        await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
        await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
        await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
        await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
        const replaced = await service.advanceCandidate(candidate.candidateId, {
          to: "replaced",
          evidenceIds: [],
          actor: "adoption-lead-01",
        });
        // After acceptance the first plan may retire; a SECOND active plan
        // keeps the migration reversible for the recorded rollback.
        await service.retireRollbackPlan(
          candidate.candidateId,
          buildRollbackPlanInput().planId,
          { actor: "adoption-lead-01" },
        );
        await service.recordRollbackPlan(candidate.candidateId, {
          ...buildRollbackPlanInput(),
          planId: "plan-restore-takeoff-02",
        });
        await service.rollbackCandidate(candidate.candidateId, {
          actor: "ops",
          planId: "plan-restore-takeoff-02",
        });
        return replaced;
      };
      const fromFs = await drive(new FsAdoptionStore(`${dir}/fs`));
      const fromMemory = await drive(new InMemoryAdoptionStore());
      expect(canonicalJsonStringify(fromFs)).toBe(canonicalJsonStringify(fromMemory));
    });
  });

  test("advance with evidenceIds on the replaced transition is refused (prerequisites, not extra evidence)", async () => {
    const service = await serviceWithWorkflow();
    const candidate = await proposedCandidate(service);
    await service.recordRollbackPlan(candidate.candidateId, buildRollbackPlanInput());
    await service.advanceCandidate(candidate.candidateId, buildEvaluationAdvance());
    await service.recordEquivalence(candidate.candidateId, buildEquivalenceInput());
    await service.advanceCandidate(candidate.candidateId, buildPilotAdvance());
    await service.recordAcceptance(candidate.candidateId, buildAcceptanceInput());
    await expectRefusal(
      service.advanceCandidate(candidate.candidateId, {
        to: "replaced",
        evidenceIds: [EV_ACCEPTANCE_A],
        actor: "adoption-lead-01",
      }),
      "invalid_advance",
    );
  });
});

describe("adoption service: registry-backed resolver adapter", () => {
  test("readOnlyAdapterDescriptorResolver adapts ONLY the registry's lookup (descriptor or null)", async () => {
    const registry = createAdapterRegistry();
    for (const descriptor of CANONICAL_ADAPTERS) {
      registry.register({
        descriptor,
        importEntities: () => {
          throw new Error("never invoked");
        },
        importDocuments: () => {
          throw new Error("never invoked");
        },
        exportDerived: () => {
          throw new Error("never invoked");
        },
        queryStatus: () => {
          throw new Error("never invoked");
        },
      } as unknown as Parameters<typeof registry.register>[0]);
    }
    const { readOnlyAdapterDescriptorResolver } = await import("./service");
    const resolver = readOnlyAdapterDescriptorResolver(registry);
    expect(await resolver.resolveAdapterDescriptor("adapter-bim-01")).toEqual(
      CANONICAL_ADAPTERS[0] as AdapterDescriptor,
    );
    expect(await resolver.resolveAdapterDescriptor("adapter-nope")).toBe(null);
  });

  test("mapAdapterResolver pins an explicit view for input-digest tests", async () => {
    const resolver = mapAdapterResolver({
      "adapter-bim-01": (CANONICAL_ADAPTERS[0] as AdapterDescriptor | undefined) ?? null,
    });
    expect(await resolver.resolveAdapterDescriptor("adapter-bim-01")).toEqual(
      CANONICAL_ADAPTERS[0] as AdapterDescriptor,
    );
    expect(await resolver.resolveAdapterDescriptor("adapter-erp-99")).toBe(null);
  });
});
