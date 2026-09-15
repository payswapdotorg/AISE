/**
 * Workflow migration and switching-friction profiler service — the policy
 * engine (AISE-041).
 *
 * Contract (spec/work-orders.md §041; R20; architecture-lock "Incumbent
 * integration and adoption"; domain-model Integration/adoption family):
 *
 *  - The service owns ALL adoption policy over the dumb store: workflow
 *    inventory creation/appending (steps are appended, NEVER removed —
 *    inventory grows, history is never rewritten), the deterministic
 *    assessment flow (resolve the adapter view through the INJECTED
 *    read-only resolver, then run the pure scoring engine and commit a
 *    write-once derived record), and the GOVERNED migration-candidate
 *    lifecycle (the no-false-claims state machine below). Every mutation
 *    appends a provenance-bearing audit event (actor + injected-clock
 *    timestamp + content digest); prior events and their digests never
 *    change.
 *  - THE PROFILER NEVER MIGRATES: there is no code path from this service
 *    into any incumbent system. The ONLY sibling runtime touchpoint is
 *    the injected `AdapterDescriptorResolver` — a READ-ONLY seam exposing
 *    exactly ONE read method (`resolveAdapterDescriptor`), adapted from
 *    the integrations adapter registry's own `lookup` — used solely to
 *    compute connector coverage. There is no register, no sync and no
 *    write path from the adoption domain into the integrations authority,
 *    and the registry's state is never mutated by an assessment (the
 *    resolved descriptors are carried VERBATIM as consumed context).
 *  - THE NO-FALSE-CLAIMS STATE MACHINE (the CRITICAL acceptance): a
 *    candidate's state advances ONE step at a time (proposed → evaluating
 *    → piloted → replaced; skips are typed refusals) and `replaced` is
 *    granted ONLY when the SemanticEquivalenceRecord, the operational
 *    acceptance record AND an active rollback plan all exist — each
 *    missing prerequisite is its OWN typed refusal naming what is
 *    missing. Entering `evaluating` requires an active rollback plan
 *    (so EVERY advanced candidate retains one) plus evaluation evidence;
 *    entering `piloted` requires the plan plus NON-EMPTY pilot-outcome
 *    evidence ids (friction metrics are only advanced against named
 *    pilot evidence).
 *  - PROGRESSIVE AND REVERSIBLE: retiring a rollback plan before
 *    operational acceptance is a typed refusal
 *    (`rollback_plan_still_required` — the plan must remain available
 *    until acceptance); after acceptance, retiring is allowed and the
 *    plan REMAINS in the record (retiring is never deletion). The
 *    rollback transition itself is RECORDED with full provenance (actor,
 *    clock timestamp, the plan id used) and lands in the terminal
 *    `rolled_back` state; re-proposal is a NEW candidate record.
 *  - ACTORS ARE OPAQUE PROVENANCE: every mutation records the
 *    caller-declared actor label verbatim. This service does NOT
 *    authenticate principals and does NOT authorize transitions — the
 *    identity authority owns that policy; actors here are audit
 *    provenance only (the AISE-036/037 discipline).
 *  - Deterministic check orders are documented on each operation and
 *    pinned by tests. Determinism: injected clock only, content-derived
 *    digests, canonical orderings; the same operation sequence plus the
 *    same clock produces byte-identical records in fresh stores.
 */

import type { AdapterDescriptor } from "../integrations/model";
import type { AdapterLookupResult } from "../integrations/registry";
import {
  AdoptionError,
  ADVANCE_REQUIREMENTS,
  ROLLBACK_ALLOWED_FROM,
  UNKNOWN_MARKER,
  assessmentContentDigest,
  assessmentInputDigest,
  canAdvance,
  candidateContentDigest,
  computeAdoptionAssessment,
  summarizeAssessment,
  summarizeCandidate,
  summarizeWorkflow,
  validateAssessmentId,
  validateCandidateId,
  validatePlanId,
  validateWorkflowId,
  workflowContentDigest,
  type AdoptionEvent,
  type AppendStepInput,
  type CreateCandidateInput,
  type CreateWorkflowInput,
  type IncumbentWorkflow,
  type IntegrationReadinessAssessment,
  type MigrationCandidate,
  type MigrationState,
  type RecordAcceptanceInput,
  type RecordEquivalenceInput,
  type RecordRollbackPlanInput,
  type RollbackCandidateInput,
  type RollbackPlan,
  type RunAssessmentInput,
  type AdvanceCandidateInput,
  type RetireRollbackPlanInput,
} from "./model";
import type { AdoptionStore } from "./store";

/* ------------------------------------------------------------------ */
/* The read-only adapter-descriptor resolver seam                       */
/* ------------------------------------------------------------------ */

/**
 * READ-ONLY adapter-descriptor resolution — the only shape through which
 * this module can see the integrations authority's adapter registry
 * (AISE-037). Exactly ONE read method; implementations must never be
 * backed by anything that mutates the registry.
 */
export interface AdapterDescriptorResolver {
  readonly resolveAdapterDescriptor: (adapterId: string) => Promise<AdapterDescriptor | null>;
}

/**
 * Adapt the integrations adapter registry's READ method `lookup` (and
 * nothing else) into an `AdapterDescriptorResolver`. The adapted registry
 * instance is never exported by this module — the resolver interface
 * exposes exactly one READ method, so there is structurally no register,
 * select or remove path from the adoption domain into the registry.
 */
export function readOnlyAdapterDescriptorResolver(registry: {
  readonly lookup: (adapterId: string) => AdapterLookupResult;
}): AdapterDescriptorResolver {
  return {
    resolveAdapterDescriptor: async (adapterId) => {
      const result = registry.lookup(adapterId);
      return result.ok ? result.adapter.descriptor : null;
    },
  };
}

/** A resolver that resolves NOTHING (uncovered-by-registry path). */
export function emptyAdapterDescriptorResolver(): AdapterDescriptorResolver {
  return { resolveAdapterDescriptor: async () => null };
}

/* ------------------------------------------------------------------ */
/* Service                                                              */
/* ------------------------------------------------------------------ */

export interface AdoptionServiceDeps {
  readonly store: AdoptionStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  /** READ-ONLY adapter-descriptor resolution (see above). */
  readonly adapterDescriptorResolver: AdapterDescriptorResolver;
}

export class AdoptionService {
  private readonly store: AdoptionStore;
  private readonly clock: () => string;
  private readonly adapterDescriptorResolver: AdapterDescriptorResolver;

  constructor(deps: AdoptionServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.adapterDescriptorResolver = deps.adapterDescriptorResolver;
  }

  /* ------------------------------------------------------------ */
  /* Commit helpers (append-only: events carry the content digest  */
  /* AFTER the mutation; prior events never change)                */
  /* ------------------------------------------------------------ */

  private async commitWorkflow(
    record: IncumbentWorkflow,
    eventType: "workflow_recorded" | "workflow_step_appended",
    actor: string,
    occurredAt: string,
  ): Promise<IncumbentWorkflow> {
    const event: AdoptionEvent = {
      eventId: `evt-${String(record.history.length + 1).padStart(6, "0")}`,
      eventType,
      occurredAt,
      actor,
      recordDigest: workflowContentDigest(record),
    };
    const committed: IncumbentWorkflow = { ...record, history: [...record.history, event] };
    await this.store.putWorkflow(committed);
    return committed;
  }

  private async commitCandidate(
    record: MigrationCandidate,
    eventType:
      | "candidate_proposed"
      | "candidate_advanced"
      | "candidate_rolled_back"
      | "equivalence_recorded"
      | "acceptance_recorded"
      | "rollback_plan_recorded"
      | "rollback_plan_retired",
    actor: string,
    occurredAt: string,
    extras?: {
      readonly transition?: { from: MigrationState; to: MigrationState };
      readonly rollbackPlanId?: string;
      readonly evidenceIds?: readonly string[];
    },
  ): Promise<MigrationCandidate> {
    const event: AdoptionEvent = {
      eventId: `evt-${String(record.history.length + 1).padStart(6, "0")}`,
      eventType,
      occurredAt,
      actor,
      recordDigest: candidateContentDigest(record),
      ...(extras?.transition === undefined ? {} : { transition: extras.transition }),
      ...(extras?.rollbackPlanId === undefined ? {} : { rollbackPlanId: extras.rollbackPlanId }),
      ...(extras?.evidenceIds === undefined ? {} : { evidenceIds: extras.evidenceIds }),
    };
    const committed: MigrationCandidate = { ...record, history: [...record.history, event] };
    await this.store.putCandidate(committed);
    return committed;
  }

  private async commitAssessment(
    record: IntegrationReadinessAssessment,
    actor: string,
    occurredAt: string,
  ): Promise<IntegrationReadinessAssessment> {
    const event: AdoptionEvent = {
      eventId: `evt-${String(record.history.length + 1).padStart(6, "0")}`,
      eventType: "assessment_recorded",
      occurredAt,
      actor,
      recordDigest: assessmentContentDigest(record),
    };
    const committed: IntegrationReadinessAssessment = {
      ...record,
      history: [...record.history, event],
    };
    await this.store.putAssessment(committed);
    return committed;
  }

  /* ------------------------------------------------------------ */
  /* Workflow inventory                                            */
  /* ------------------------------------------------------------ */

  /** Create one incumbent-workflow inventory record (steps may be empty). */
  async createWorkflow(input: CreateWorkflowInput): Promise<IncumbentWorkflow> {
    validateWorkflowId(input.workflowId);
    const existing = await this.store.getWorkflow(input.workflowId);
    if (existing !== null) {
      throw new AdoptionError(
        "workflow_exists",
        `workflow ${input.workflowId} already exists — inventory records are append-only; append steps or open a new workflow instead`,
      );
    }
    const now = this.clock();
    const record: IncumbentWorkflow = {
      workflowId: input.workflowId,
      organizationId: input.organizationId,
      ...(input.description === undefined ? {} : { description: input.description }),
      name: input.name,
      steps: [...input.steps],
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    return this.commitWorkflow(record, "workflow_recorded", input.actor, now);
  }

  /** Append one step to an existing workflow (steps are never removed). */
  async appendStep(workflowId: string, input: AppendStepInput): Promise<IncumbentWorkflow> {
    validateWorkflowId(workflowId);
    const record = await this.store.getWorkflow(workflowId);
    if (record === null) {
      throw new AdoptionError("workflow_not_found", `workflow ${workflowId} does not exist`);
    }
    if (record.steps.some((step) => step.stepId === input.step.stepId)) {
      throw new AdoptionError(
        "step_exists",
        `step ${input.step.stepId} already exists in workflow ${workflowId} — steps are append-only; a revised step is a NEW step id`,
      );
    }
    const now = this.clock();
    const updated: IncumbentWorkflow = {
      ...record,
      steps: [...record.steps, input.step],
      updatedAt: now,
    };
    return this.commitWorkflow(updated, "workflow_step_appended", input.actor, now);
  }

  async getWorkflow(workflowId: string): Promise<IncumbentWorkflow | null> {
    validateWorkflowId(workflowId);
    return this.store.getWorkflow(workflowId);
  }

  async listWorkflows(): Promise<ReturnType<typeof summarizeWorkflow>[]> {
    const records = await this.store.listWorkflows();
    return records.map(summarizeWorkflow);
  }

  /* ------------------------------------------------------------ */
  /* The profiler (integration readiness + switching friction)     */
  /* ------------------------------------------------------------ */

  /**
   * Run one adoption assessment over a workflow and persist the DERIVED
   * record. Deterministic check order (documented, tested): assessmentId
   * shape → record non-existence → workflow resolution → non-empty step
   * inventory → adapter-view resolution (one entry per DISTINCT referenced
   * adapterId, sorted) → adapter-class coherence (a resolved descriptor
   * whose systemClass differs from the referencing ref's is a typed
   * refusal — never a silent mis-score) → the pure engine → commit.
   * The adapter registry is never mutated; the same inputs plus the same
   * clock yield a byte-identical record in a fresh store.
   */
  async runAssessment(
    workflowId: string,
    input: RunAssessmentInput,
  ): Promise<IntegrationReadinessAssessment> {
    validateWorkflowId(workflowId);
    validateAssessmentId(input.assessmentId);
    const existing = await this.store.getAssessment(input.assessmentId);
    if (existing !== null) {
      throw new AdoptionError(
        "assessment_exists",
        `assessment ${input.assessmentId} already exists — derived records are write-once; run a NEW assessment (new id) against the newer inputs instead`,
      );
    }
    const workflow = await this.store.getWorkflow(workflowId);
    if (workflow === null) {
      throw new AdoptionError("workflow_not_found", `workflow ${workflowId} does not exist`);
    }
    if (workflow.steps.length === 0) {
      throw new AdoptionError(
        "workflow_without_steps",
        `workflow ${workflowId} carries no steps — the profiler scores declared step attributes; append steps before assessing`,
      );
    }

    // The adapter view: one entry per DISTINCT referenced adapterId.
    const referencedAdapterIds = new Set<string>();
    for (const step of workflow.steps) {
      if (step.systemsOfRecord === UNKNOWN_MARKER) {
        continue;
      }
      for (const ref of step.systemsOfRecord) {
        if (ref.adapterId !== undefined) {
          referencedAdapterIds.add(ref.adapterId);
        }
      }
    }
    const adapterView: { adapterId: string; descriptor: AdapterDescriptor | null }[] = [];
    for (const adapterId of [...referencedAdapterIds].sort()) {
      adapterView.push({
        adapterId,
        descriptor: await this.adapterDescriptorResolver.resolveAdapterDescriptor(adapterId),
      });
    }

    // Adapter-class coherence: a ref whose resolved adapter serves a
    // DIFFERENT system class is an inventory inconsistency — typed
    // refusal over silent mis-scoring (the house discipline).
    const descriptorBy = new Map(adapterView.map((entry) => [entry.adapterId, entry.descriptor]));
    for (const step of workflow.steps) {
      if (step.systemsOfRecord === UNKNOWN_MARKER) {
        continue;
      }
      for (const ref of step.systemsOfRecord) {
        const descriptor =
          ref.adapterId === undefined ? undefined : descriptorBy.get(ref.adapterId);
        if (descriptor != null && descriptor.systemClass !== ref.systemClass) {
          throw new AdoptionError(
            "adapter_class_mismatch",
            `system ref ${ref.systemInstanceId} declares class ${ref.systemClass} but adapter ${ref.adapterId} serves class ${descriptor.systemClass} — fix the inventory reference or the registry binding before assessing`,
          );
        }
      }
    }

    const { steps, readiness, friction, inventory, rankedSteps } = computeAdoptionAssessment({
      assessmentId: input.assessmentId,
      workflow,
      adapterView,
    });
    const computedAt = this.clock();
    const record: IntegrationReadinessAssessment = {
      assessmentId: input.assessmentId,
      workflowId: workflow.workflowId,
      workflowDigest: workflowContentDigest(workflow),
      adapterView,
      steps,
      readiness,
      friction,
      inventory,
      rankedSteps,
      inputDigest: assessmentInputDigest({ workflow, adapterView }),
      computedAt,
      history: [],
    };
    return this.commitAssessment(record, input.actor, computedAt);
  }

  async getAssessment(assessmentId: string): Promise<IntegrationReadinessAssessment | null> {
    validateAssessmentId(assessmentId);
    return this.store.getAssessment(assessmentId);
  }

  async listAssessments(): Promise<ReturnType<typeof summarizeAssessment>[]> {
    const records = await this.store.listAssessments();
    return records.map(summarizeAssessment);
  }

  /* ------------------------------------------------------------ */
  /* Migration candidates (the governed lifecycle)                 */
  /* ------------------------------------------------------------ */

  /**
   * Propose one migration candidate. Deterministic check order:
   * candidateId shape → record non-existence → workflow resolution
   * (`unknown_workflow` — a payload reference) → step resolution within
   * the workflow (`unknown_step`) → commit at state `proposed`.
   */
  async createCandidate(input: CreateCandidateInput): Promise<MigrationCandidate> {
    validateCandidateId(input.candidateId);
    const existing = await this.store.getCandidate(input.candidateId);
    if (existing !== null) {
      throw new AdoptionError(
        "candidate_exists",
        `candidate ${input.candidateId} already exists — candidates are append-only; a re-proposal after rollback is a NEW candidate id`,
      );
    }
    const workflow = await this.store.getWorkflow(input.workflowId);
    if (workflow === null) {
      throw new AdoptionError(
        "unknown_workflow",
        `workflow ${input.workflowId} does not resolve — a migration candidate must name an inventoried workflow`,
      );
    }
    if (!workflow.steps.some((step) => step.stepId === input.stepId)) {
      throw new AdoptionError(
        "unknown_step",
        `step ${input.stepId} is not carried by workflow ${input.workflowId} — a candidate must name an inventoried incumbent step`,
      );
    }
    const now = this.clock();
    const record: MigrationCandidate = {
      candidateId: input.candidateId,
      workflowId: input.workflowId,
      stepId: input.stepId,
      aiseReplacementBoundary: input.aiseReplacementBoundary,
      rationale: input.rationale,
      state: "proposed",
      recordedBy: input.actor,
      createdAt: now,
      updatedAt: now,
      rollbackPlans: [],
      history: [],
    };
    return this.commitCandidate(record, "candidate_proposed", input.actor, now);
  }

  /**
   * Record the SemanticEquivalenceRecord. Allowed ONLY while the
   * candidate is `evaluating` or `piloted` (an equivalence claim before
   * structured evaluation is premature; after replacement it is already
   * consumed) and only ONCE (a revised equivalence is a NEW candidate).
   */
  async recordEquivalence(
    candidateId: string,
    input: RecordEquivalenceInput,
  ): Promise<MigrationCandidate> {
    const record = await this.requireCandidate(candidateId);
    if (record.equivalence !== undefined) {
      throw new AdoptionError(
        "equivalence_already_recorded",
        `candidate ${candidateId} already carries an equivalence record — a revised equivalence claim requires a new candidate`,
      );
    }
    if (record.state !== "evaluating" && record.state !== "piloted") {
      throw new AdoptionError(
        "equivalence_state_conflict",
        `candidate ${candidateId} is ${record.state} — equivalence evidence is recorded while evaluating or piloting only`,
      );
    }
    const now = this.clock();
    const updated: MigrationCandidate = {
      ...record,
      equivalence: {
        establishedHow: input.establishedHow,
        evidenceIds: input.evidenceIds,
        limits: input.limits,
        establishedBy: input.actor,
        establishedAt: now,
      },
      updatedAt: now,
    };
    return this.commitCandidate(updated, "equivalence_recorded", input.actor, now);
  }

  /**
   * Record the operational acceptance record. Allowed ONLY while the
   * candidate is `piloted` (acceptance is an operational verdict over a
   * running pilot — never over a proposal or an evaluation) and only ONCE.
   */
  async recordAcceptance(
    candidateId: string,
    input: RecordAcceptanceInput,
  ): Promise<MigrationCandidate> {
    const record = await this.requireCandidate(candidateId);
    if (record.acceptance !== undefined) {
      throw new AdoptionError(
        "acceptance_already_recorded",
        `candidate ${candidateId} already carries an operational acceptance record`,
      );
    }
    if (record.state !== "piloted") {
      throw new AdoptionError(
        "acceptance_state_conflict",
        `candidate ${candidateId} is ${record.state} — operational acceptance is recorded over a running pilot only`,
      );
    }
    const now = this.clock();
    const updated: MigrationCandidate = {
      ...record,
      acceptance: {
        acceptedBy: input.actor,
        evidenceIds: input.evidenceIds,
        note: input.note,
        acceptedAt: now,
      },
      updatedAt: now,
    };
    return this.commitCandidate(updated, "acceptance_recorded", input.actor, now);
  }

  /**
   * Record one rollback plan (append — retired plans remain in the
   * record). Allowed in every state except the terminal `rolled_back`.
   */
  async recordRollbackPlan(
    candidateId: string,
    input: RecordRollbackPlanInput,
  ): Promise<MigrationCandidate> {
    const record = await this.requireCandidate(candidateId);
    if (record.state === "rolled_back") {
      throw new AdoptionError(
        "rollback_plan_state_conflict",
        `candidate ${candidateId} is rolled_back (terminal) — its history is closed`,
      );
    }
    if (record.rollbackPlans.some((plan) => plan.planId === input.planId)) {
      throw new AdoptionError(
        "invalid_rollback_plan",
        `rollback plan ${input.planId} already exists on candidate ${candidateId}`,
      );
    }
    const now = this.clock();
    const plan: RollbackPlan = {
      planId: input.planId,
      description: input.description,
      restorationSteps: input.restorationSteps,
      owner: input.owner,
      state: "active",
      recordedBy: input.actor,
      recordedAt: now,
    };
    const updated: MigrationCandidate = {
      ...record,
      rollbackPlans: [...record.rollbackPlans, plan],
      updatedAt: now,
    };
    return this.commitCandidate(updated, "rollback_plan_recorded", input.actor, now, {
      rollbackPlanId: input.planId,
    });
  }

  /**
   * Retire one rollback plan. THE retention gate: retiring before the
   * operational acceptance record exists is a typed refusal
   * (`rollback_plan_still_required` — "RollbackPlan must remain available
   * until operational acceptance"). Retiring is never deletion: the plan
   * stays in the record with its retirement provenance.
   */
  async retireRollbackPlan(
    candidateId: string,
    planId: string,
    input: RetireRollbackPlanInput,
  ): Promise<MigrationCandidate> {
    const record = await this.requireCandidate(candidateId);
    validatePlanId(planId);
    const plan = record.rollbackPlans.find((entry) => entry.planId === planId);
    if (plan === undefined) {
      throw new AdoptionError(
        "rollback_plan_not_found",
        `rollback plan ${planId} does not exist on candidate ${candidateId}`,
      );
    }
    if (plan.state === "retired") {
      throw new AdoptionError(
        "rollback_plan_inactive",
        `rollback plan ${planId} is already retired`,
      );
    }
    if (record.acceptance === undefined) {
      throw new AdoptionError(
        "rollback_plan_still_required",
        `rollback plan ${planId} cannot be retired before operational acceptance — the plan must remain available until the candidate's acceptance record exists`,
      );
    }
    const now = this.clock();
    const updated: MigrationCandidate = {
      ...record,
      rollbackPlans: record.rollbackPlans.map((entry) =>
        entry.planId === planId
          ? { ...entry, state: "retired", retiredAt: now, retiredBy: input.actor }
          : entry,
      ),
      updatedAt: now,
    };
    return this.commitCandidate(updated, "rollback_plan_retired", input.actor, now, {
      rollbackPlanId: planId,
    });
  }

  /**
   * THE governed advance. Deterministic check order (documented,
   * tested):
   *   1. `to` vocabulary (unknown_migration_state — parsed at the boundary)
   *   2. sequence: `to` must be the from-state's adjacent successor
   *      (transition_out_of_sequence; advancing FROM `rolled_back` is the
   *      distinct transition_from_terminal)
   *   3. per-target prerequisites, in order:
   *        → evaluating: active rollback plan, then evaluation evidence
   *        → piloted:    active rollback plan, then pilot-outcome evidence
   *        → replaced:   equivalence record, then acceptance record, then
   *                      active rollback plan (the architecture lock's
   *                      replacement triple — each missing item is its OWN
   *      typed refusal naming what is missing)
   */
  async advanceCandidate(
    candidateId: string,
    input: AdvanceCandidateInput,
  ): Promise<MigrationCandidate> {
    const record = await this.requireCandidate(candidateId);
    if (record.state === "rolled_back") {
      throw new AdoptionError(
        "transition_from_terminal",
        `candidate ${candidateId} is rolled_back (terminal) — propose a NEW candidate instead of advancing a rolled-back one`,
      );
    }
    if (!canAdvance(record.state, input.to)) {
      throw new AdoptionError(
        "transition_out_of_sequence",
        `candidate ${candidateId} cannot advance from ${record.state} to ${input.to} — migration state advances one step at a time (${record.state} → ${ADVANCE_REQUIREMENTS[record.state] ? "its single successor only" : "nothing"}; rollback is the recorded reverse transition, never an advance)`,
      );
    }
    const requirements = ADVANCE_REQUIREMENTS[record.state];
    if (requirements === undefined) {
      // Unreachable (canAdvance already excluded it); kept fail-closed.
      throw new AdoptionError(
        "transition_out_of_sequence",
        `candidate ${candidateId} has no advance successor from ${record.state}`,
      );
    }

    if (requirements.requiresEquivalenceRecord && record.equivalence === undefined) {
      throw new AdoptionError(
        "equivalence_record_required",
        `candidate ${candidateId} cannot be declared replaced without a semantic-equivalence record — no incumbent step is replaced without established equivalence`,
      );
    }
    if (requirements.requiresAcceptanceRecord && record.acceptance === undefined) {
      throw new AdoptionError(
        "acceptance_record_required",
        `candidate ${candidateId} cannot be declared replaced without an operational acceptance record — no incumbent step is replaced without operational acceptance`,
      );
    }
    if (requirements.requiresActiveRollbackPlan && !hasActivePlan(record)) {
      throw new AdoptionError(
        "rollback_plan_required",
        `candidate ${candidateId} carries no ACTIVE rollback plan — every advanced candidate retains rollback capability (architecture lock: replacement requires semantic equivalence, operational acceptance AND rollback capability)`,
      );
    }
    if (requirements.requiresEvaluationEvidence && input.evidenceIds.length === 0) {
      throw new AdoptionError(
        "evaluation_evidence_required",
        `advancing candidate ${candidateId} to evaluating requires NON-EMPTY evaluation evidence ids — an evaluation begins with named evidence`,
      );
    }
    if (requirements.requiresPilotEvidence && input.evidenceIds.length === 0) {
      throw new AdoptionError(
        "pilot_evidence_required",
        `advancing candidate ${candidateId} to piloted requires NON-EMPTY pilot-outcome evidence ids — friction metrics are only advanced against named pilot outcomes`,
      );
    }
    if (input.to === "replaced" && input.evidenceIds.length > 0) {
      throw new AdoptionError(
        "invalid_advance",
        `advancing candidate ${candidateId} to replaced takes no evidenceIds — the equivalence and acceptance records are the prerequisites`,
      );
    }

    const now = this.clock();
    const updated: MigrationCandidate = {
      ...record,
      state: input.to,
      updatedAt: now,
      ...(input.to === "evaluating" ? { evaluationEvidenceIds: input.evidenceIds } : {}),
      ...(input.to === "piloted" ? { pilotOutcomeEvidenceIds: input.evidenceIds } : {}),
    };
    return this.commitCandidate(updated, "candidate_advanced", input.actor, now, {
      transition: { from: record.state, to: input.to },
      ...(input.evidenceIds.length > 0 ? { evidenceIds: input.evidenceIds } : {}),
    });
  }

  /**
   * THE recorded rollback transition (reversible migration). Requires an
   * active rollback plan (explicit planId or the latest active one) and
   * lands in the terminal `rolled_back` state with full provenance: the
   * actor, the clock timestamp, and the plan id used. Rolling back a
   * candidate that never advanced (`proposed`) is a typed refusal.
   */
  async rollbackCandidate(
    candidateId: string,
    input: RollbackCandidateInput,
  ): Promise<MigrationCandidate> {
    const record = await this.requireCandidate(candidateId);
    if (record.state === "rolled_back") {
      throw new AdoptionError(
        "transition_from_terminal",
        `candidate ${candidateId} is already rolled_back — propose a NEW candidate instead`,
      );
    }
    if (!ROLLBACK_ALLOWED_FROM.includes(record.state)) {
      throw new AdoptionError(
        "transition_out_of_sequence",
        `candidate ${candidateId} cannot roll back from ${record.state} — nothing has been advanced; abandon the proposal by leaving it at proposed (or record the decision in its rationale via a new candidate)`,
      );
    }
    let plan: RollbackPlan | undefined;
    if (input.planId !== undefined) {
      plan = record.rollbackPlans.find((entry) => entry.planId === input.planId);
      if (plan === undefined) {
        throw new AdoptionError(
          "unknown_rollback_plan",
          `rollback plan ${input.planId} does not exist on candidate ${candidateId}`,
        );
      }
      if (plan.state !== "active") {
        throw new AdoptionError(
          "rollback_plan_inactive",
          `rollback plan ${input.planId} is retired — restore or record an active plan before rolling back`,
        );
      }
    } else {
      const activePlans = record.rollbackPlans.filter((entry) => entry.state === "active");
      plan = activePlans[activePlans.length - 1];
      if (plan === undefined) {
        throw new AdoptionError(
          "rollback_plan_required",
          `candidate ${candidateId} carries no ACTIVE rollback plan — the migration is not reversible without one; record a plan before rolling back`,
        );
      }
    }
    const now = this.clock();
    const updated: MigrationCandidate = {
      ...record,
      state: "rolled_back",
      updatedAt: now,
    };
    return this.commitCandidate(updated, "candidate_rolled_back", input.actor, now, {
      transition: { from: record.state, to: "rolled_back" },
      rollbackPlanId: plan.planId,
    });
  }

  async getCandidate(candidateId: string): Promise<MigrationCandidate | null> {
    validateCandidateId(candidateId);
    return this.store.getCandidate(candidateId);
  }

  async listCandidates(): Promise<ReturnType<typeof summarizeCandidate>[]> {
    const records = await this.store.listCandidates();
    return records.map(summarizeCandidate);
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  private async requireCandidate(candidateId: string): Promise<MigrationCandidate> {
    validateCandidateId(candidateId);
    const record = await this.store.getCandidate(candidateId);
    if (record === null) {
      throw new AdoptionError("candidate_not_found", `candidate ${candidateId} does not exist`);
    }
    return record;
  }
}

/** Does the candidate carry at least one ACTIVE rollback plan? */
function hasActivePlan(record: MigrationCandidate): boolean {
  return record.rollbackPlans.some((plan) => plan.state === "active");
}
