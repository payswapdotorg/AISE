/**
 * Execution/outcome service — the policy engine (AISE-031).
 *
 * Contract (spec/work-orders.md §031; R13; domain-model "Intervention
 * semantics"; architecture-lock "Authority" #6, "Intervention"):
 *
 *  - The service owns ALL execution policy over the dumb store: the
 *    governed path (an execution record is accepted ONLY for a scenario
 *    whose read-only context status is `approved` — `scenario_not_approved`
 *    otherwise), reference resolution (case / scenario / state / step /
 *    evidence ids must RESOLVE against the supplied read-only authorities
 *    or the mutation is a typed refusal NAMING the id), state alignment
 *    (executed steps must be part of the referenced state layer's applied
 *    steps — `step_not_in_state`), evidence discipline (execution records
 *    and outcome observations REQUIRE non-empty 64-hex evidence id lists)
 *    and append-only history (every mutation appends one event carrying
 *    the sha256 digest of the full changed content; prior events and their
 *    digests are never recomputed or changed — the AISE-025 case
 *    discipline, byte for byte).
 *  - THE RECORD KEEPER BOUNDARY (this module's defining constraint): the
 *    service sees the OWNING authorities ONLY through three injected
 *    READ-ONLY resolvers — `InterventionContextResolver`,
 *    `CaseContextResolver` and `EvidenceMembershipResolver`. There is NO
 *    code path from this module into case, intervention, evidence or
 *    capture writes: the module imports no sibling module at runtime (the
 *    model's sibling imports are TYPE-only and erased), and the resolver
 *    interfaces expose exactly one READ method each. The default wiring in
 *    server.ts adapts the owning services'/store's READ methods (see the
 *    `readOnly*Resolver` adapters below).
 *  - PROJECTION DISCIPLINE for "states are PROPOSED until execution
 *    evidence is recorded": the transition is represented as an
 *    execution-domain record — the `StateTransitionRecord` embedded on the
 *    execution record — and as the derived `getStateExecution` view. The
 *    intervention authority's own records are never mutated; their
 *    post-evidence status exists only here.
 *  - LINEAGE VERIFICATION (`getCaseLineage`): walks case → observations/
 *    hypotheses → intervention scenario/step/state → execution record →
 *    post-work capture → outcome observation and verifies EVERY hop; a
 *    missing link (no execution for the case, an execution without an
 *    outcome observation, no post-work capture reference anywhere on the
 *    chain, or an unresolvable scenario/state/step/evidence reference) is
 *    a typed refusal naming the missing link — never a silently truncated
 *    chain.
 *  - Determinism: the service owns NO wall clock and NO randomness — the
 *    clock is injected, and outcome ids are content-derived (sha256 over
 *    executionRecordId + position + canonical payload). The same operation
 *    sequence plus the same clock produces byte-identical files in fresh
 *    stores.
 *  - Single-writer discipline: read-modify-write per call; one service
 *    instance per data dir (documented store assumption).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// READ-ONLY TYPE imports from the owning authorities (erased at runtime):
import type { InterventionScenario } from "../intervention/model";
import type { EngineeringCase } from "../cases/model";
import {
  ExecutionError,
  executionContentDigest,
  projectCaseContext,
  projectInterventionContext,
  summarizeExecution,
  validateCaseRefId,
  validateExecutionRecordId,
  validateScenarioRefId,
  type CaseContext,
  type CaseLineage,
  type ExecutionEvent,
  type ExecutionEventType,
  type ExecutionRecord,
  type ExecutionSummary,
  type InterventionContext,
  type OutcomeObservation,
  type RecordExecutionInput,
  type RecordOutcomeInput,
  type StateExecutionView,
  type StateTransitionRecord,
} from "./model";
import type { ExecutionStore } from "./store";

/* ------------------------------------------------------------------ */
/* Read-only resolvers (the ONLY windows into the owning authorities)   */
/* ------------------------------------------------------------------ */

/**
 * READ-ONLY intervention context resolution — the only shape through which
 * this module can see the Intervention Studio authority. Implementations
 * return the scenario's id/governance/state spine projection or null when
 * the scenario id is unknown; they must never be backed by anything that
 * mutates intervention records.
 */
export interface InterventionContextResolver {
  readonly resolveInterventionContext: (
    scenarioId: string,
  ) => Promise<InterventionContext | null>;
}

/** READ-ONLY engineering case context resolution (AISE-025 authority). */
export interface CaseContextResolver {
  readonly resolveCaseContext: (caseId: string) => Promise<CaseContext | null>;
}

/**
 * READ-ONLY evidence membership resolution (AISE-008 authority): does a
 * registered evidence record exist for the content id? Membership ONLY —
 * invalidation semantics and record content stay with the Evidence
 * authority (invalidated evidence still EXISTS; this domain records facts,
 * it does not re-interpret the evidence graph).
 */
export interface EvidenceMembershipResolver {
  readonly evidenceExists: (contentId: string) => Promise<boolean>;
}

/**
 * Adapt an intervention service's READ method `getScenario` (and nothing
 * else) into an `InterventionContextResolver`. The scenario record is
 * projected read-only through `projectInterventionContext` — ids and
 * governance, never proposal content values.
 */
export function readOnlyInterventionContextResolver(reader: {
  readonly getScenario: (scenarioId: string) => Promise<InterventionScenario | null>;
}): InterventionContextResolver {
  return {
    resolveInterventionContext: async (scenarioId) => {
      const scenario = await reader.getScenario(scenarioId);
      return scenario === null ? null : projectInterventionContext(scenario);
    },
  };
}

/**
 * Adapt a case service's READ method `getCase` (and nothing else) into a
 * `CaseContextResolver`, projecting through `projectCaseContext`.
 */
export function readOnlyCaseContextResolver(reader: {
  readonly getCase: (caseId: string) => Promise<EngineeringCase | null>;
}): CaseContextResolver {
  return {
    resolveCaseContext: async (caseId) => {
      const record = await reader.getCase(caseId);
      return record === null ? null : projectCaseContext(record);
    },
  };
}

/**
 * Adapt an evidence store's READ method `getEvidenceRecord` (and nothing
 * else) into an `EvidenceMembershipResolver`. Evidence records are
 * immutable write-once files, so a read-only second instance is safe.
 */
export function readOnlyEvidenceMembershipResolver(reader: {
  readonly getEvidenceRecord: (contentId: string) => Promise<unknown | null>;
}): EvidenceMembershipResolver {
  return {
    evidenceExists: async (contentId) => (await reader.getEvidenceRecord(contentId)) !== null,
  };
}

export interface ExecutionServiceDeps {
  readonly store: ExecutionStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  /** READ-ONLY intervention context resolution (see above). */
  readonly interventionContextResolver: InterventionContextResolver;
  /** READ-ONLY case context resolution (see above). */
  readonly caseContextResolver: CaseContextResolver;
  /** READ-ONLY evidence membership resolution (see above). */
  readonly evidenceMembershipResolver: EvidenceMembershipResolver;
}

/** Deterministic content-derived id: `prefix-<16 hex of id+seq+payload>`. */
function deriveId(
  prefix: string,
  executionRecordId: string,
  sequence: number,
  payload: unknown,
): string {
  return `${prefix}-${sha256Hex(`${executionRecordId}:${sequence}:${canonicalJsonStringify(payload)}`).slice(0, 16)}`;
}

export class ExecutionService {
  private readonly store: ExecutionStore;
  private readonly clock: () => string;
  private readonly interventionContextResolver: InterventionContextResolver;
  private readonly caseContextResolver: CaseContextResolver;
  private readonly evidenceMembershipResolver: EvidenceMembershipResolver;

  constructor(deps: ExecutionServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.interventionContextResolver = deps.interventionContextResolver;
    this.caseContextResolver = deps.caseContextResolver;
    this.evidenceMembershipResolver = deps.evidenceMembershipResolver;
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  private async require(executionRecordId: string): Promise<ExecutionRecord> {
    validateExecutionRecordId(executionRecordId);
    const record = await this.store.get(executionRecordId);
    if (record === null) {
      throw new ExecutionError(
        "execution_not_found",
        `execution ${executionRecordId} does not exist`,
      );
    }
    return record;
  }

  /**
   * Commit one mutation: the incoming record already carries the change
   * and the new event-relevant content; this appends the audit event (with
   * the digest of the changed content) and persists. Prior events are
   * carried over UNCHANGED (append-only discipline).
   */
  private async append(
    record: ExecutionRecord,
    eventType: ExecutionEventType,
    occurredAt: string,
  ): Promise<ExecutionRecord> {
    const eventId = `evt-${String(record.history.length + 1).padStart(6, "0")}`;
    const event: ExecutionEvent = {
      eventId,
      eventType,
      occurredAt,
      recordDigest: executionContentDigest(record),
    };
    const committed: ExecutionRecord = { ...record, history: [...record.history, event] };
    await this.store.put(committed);
    return committed;
  }

  /** Resolve the case context or refuse with a typed error naming the id. */
  private async requireCaseContext(caseId: string): Promise<CaseContext> {
    validateCaseRefId(caseId);
    const context = await this.caseContextResolver.resolveCaseContext(caseId);
    if (context === null) {
      throw new ExecutionError(
        "unknown_case_ref",
        `case ${caseId} does not resolve — an execution record must link an existing engineering case`,
      );
    }
    return context;
  }

  /**
   * Resolve the intervention context or refuse with a typed error naming
   * the id. Governed path: the scenario's (read-only) status must be
   * `approved` — executing a draft/under_review/rejected/superseded
   * proposal is a typed refusal (work order: "approved intervention").
   */
  private async requireApprovedScenarioContext(scenarioId: string): Promise<InterventionContext> {
    validateScenarioRefId(scenarioId);
    const context = await this.interventionContextResolver.resolveInterventionContext(scenarioId);
    if (context === null) {
      throw new ExecutionError(
        "unknown_scenario_ref",
        `intervention scenario ${scenarioId} does not resolve — an execution record must link an existing scenario`,
      );
    }
    if (context.status !== "approved") {
      throw new ExecutionError(
        "scenario_not_approved",
        `intervention scenario ${scenarioId} is ${context.status} — only an APPROVED intervention may be executed`,
      );
    }
    return context;
  }

  /**
   * Verify the intervention references against the scenario context: the
   * state id must be one of the scenario's materialized state layers and
   * every executed step must be a scenario step that is part of that
   * layer's applied steps (state alignment).
   */
  private verifyStateAlignment(
    context: InterventionContext,
    stateId: string,
    executedStepIds: readonly string[],
  ): { stateId: string; stateIndex: number; appliedStepIds: readonly string[] } {
    const state = context.states.find((entry) => entry.stateId === stateId);
    if (state === undefined) {
      throw new ExecutionError(
        "unknown_state_ref",
        `state ${stateId} does not exist on scenario ${context.scenarioId} — ` +
          `available layers are ${String(context.states.length - 1)}`,
      );
    }
    const knownSteps = new Set(context.steps.map((step) => step.stepId));
    const unknownSteps = executedStepIds.filter((stepId) => !knownSteps.has(stepId));
    if (unknownSteps.length > 0) {
      throw new ExecutionError(
        "unknown_step_ref",
        `executed steps unknown on scenario ${context.scenarioId}: ${unknownSteps.join(", ")}`,
      );
    }
    const applied = new Set(state.appliedStepIds);
    const misaligned = executedStepIds.filter((stepId) => !applied.has(stepId));
    if (misaligned.length > 0) {
      throw new ExecutionError(
        "step_not_in_state",
        `executed steps are not part of state layer ${String(state.stateIndex)} ` +
          `(${stateId.slice(0, 16)}…) of scenario ${context.scenarioId}: ${misaligned.join(", ")}`,
      );
    }
    return state;
  }

  /** Verify evidence membership or refuse naming the unknown ids. */
  private async verifyEvidenceMembership(evidenceIds: readonly string[]): Promise<void> {
    const unknown: string[] = [];
    for (const evidenceId of evidenceIds) {
      if (!(await this.evidenceMembershipResolver.evidenceExists(evidenceId))) {
        unknown.push(evidenceId);
      }
    }
    if (unknown.length > 0) {
      throw new ExecutionError(
        "unknown_evidence_ref",
        `evidence does not resolve: ${unknown.join(", ")}`,
      );
    }
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Record the execution of an APPROVED intervention scenario state.
   * Deterministic check order (documented, tested): case resolution →
   * scenario resolution → approval gate → state alignment → evidence
   * membership. The record embeds the PROPOSED → EXECUTED state transition
   * (pinned by the creation event's content digest); the intervention
   * authority's records are never touched.
   */
  async recordExecution(input: RecordExecutionInput): Promise<ExecutionRecord> {
    // Defense in depth: the boundary parser enforces the same rules, but a
    // library caller bypassing the parser still cannot record an
    // evidence-less or step-less execution.
    if (!Array.isArray(input.executedStepIds) || input.executedStepIds.length === 0) {
      throw new ExecutionError(
        "execution_without_steps",
        "executedStepIds must be a non-empty array — an execution record must name the intervention steps it executes",
      );
    }
    if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length === 0) {
      throw new ExecutionError(
        "execution_without_evidence",
        "evidenceIds must be a non-empty array — an execution record without evidence is rejected",
      );
    }
    validateExecutionRecordId(input.executionRecordId);
    const existing = await this.store.get(input.executionRecordId);
    if (existing !== null) {
      throw new ExecutionError(
        "execution_exists",
        `execution ${input.executionRecordId} already exists — records are never rewritten; record a new execution instead`,
      );
    }
    await this.requireCaseContext(input.caseId);
    const scenarioContext = await this.requireApprovedScenarioContext(input.scenarioId);
    this.verifyStateAlignment(scenarioContext, input.stateId, input.executedStepIds);
    await this.verifyEvidenceMembership(input.evidenceIds);
    const now = this.clock();
    const stateTransition: StateTransitionRecord = {
      scenarioId: input.scenarioId,
      stateId: input.stateId,
      fromStatus: "PROPOSED",
      toStatus: "EXECUTED",
      executionRecordId: input.executionRecordId,
      evidenceIds: [...input.evidenceIds],
      recordedAt: now,
    };
    const record: ExecutionRecord = {
      executionRecordId: input.executionRecordId,
      caseId: input.caseId,
      scenarioId: input.scenarioId,
      stateId: input.stateId,
      executedStepIds: [...input.executedStepIds],
      evidenceIds: [...input.evidenceIds],
      captureSessionIds: [...(input.captureSessionIds ?? [])],
      executedAt: input.executedAt,
      recordedAt: now,
      stateTransition,
      outcomes: [],
      history: [],
    };
    return this.append(record, "execution_recorded", now);
  }

  /**
   * Record one OBSERVED post-work outcome observation on an execution
   * record. The outcome links the case/issue and the execution record; its
   * caseId must MATCH the execution's caseId (`outcome_case_mismatch`);
   * new field evidence is REQUIRED; post-work capture sessions are
   * referenced by id when the observation derives from capture. The
   * outcome is immutable once recorded — a contradicting outcome is a NEW
   * outcome observation, never a rewrite.
   */
  async recordOutcome(
    executionRecordId: string,
    input: RecordOutcomeInput,
  ): Promise<OutcomeObservation> {
    // Defense in depth (same rule as the boundary parser).
    if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length === 0) {
      throw new ExecutionError(
        "outcome_without_evidence",
        "evidenceIds must be a non-empty array — an outcome observation without new field evidence is rejected",
      );
    }
    const record = await this.require(executionRecordId);
    if (input.caseId !== record.caseId) {
      throw new ExecutionError(
        "outcome_case_mismatch",
        `outcome is recorded for case ${input.caseId} but execution ${executionRecordId} ` +
          `belongs to case ${record.caseId} — an outcome must link the issue the execution addressed`,
      );
    }
    await this.verifyEvidenceMembership(input.evidenceIds);
    const now = this.clock();
    const outcome: OutcomeObservation = {
      outcomeId: deriveId("out", executionRecordId, record.outcomes.length, {
        caseId: input.caseId,
        statement: input.statement,
        evidenceIds: input.evidenceIds,
        captureSessionIds: input.captureSessionIds ?? null,
        measurementRefs: input.measurementRefs ?? null,
        recordedAt: now,
      }),
      executionRecordId,
      caseId: input.caseId,
      statement: input.statement,
      // Always OBSERVED — the literal type makes anything else unrepresentable.
      epistemicStatus: "OBSERVED",
      recordedAt: now,
      evidenceIds: [...input.evidenceIds],
      captureSessionIds: [...(input.captureSessionIds ?? [])],
      ...(input.measurementRefs === undefined
        ? {}
        : { measurementRefs: [...input.measurementRefs] }),
    };
    const updated: ExecutionRecord = {
      ...record,
      outcomes: [...record.outcomes, outcome],
    };
    await this.append(updated, "outcome_recorded", now);
    return outcome;
  }

  /* ------------------------------------------------------------ */
  /* Reads                                                         */
  /* ------------------------------------------------------------ */

  async getExecution(executionRecordId: string): Promise<ExecutionRecord | null> {
    validateExecutionRecordId(executionRecordId);
    return this.store.get(executionRecordId);
  }

  async listExecutions(): Promise<ExecutionSummary[]> {
    const records = await this.store.list();
    return records.map(summarizeExecution);
  }

  /**
   * The derived per-state execution view (projection discipline): a state
   * of an EXISTING scenario is PROPOSED until execution evidence has been
   * recorded for it, EXECUTED afterwards. When several execution records
   * cover the same state, the EARLIEST recorded evidence wins (ties break
   * by executionRecordId — deterministic).
   */
  async getStateExecution(scenarioId: string, stateId: string): Promise<StateExecutionView> {
    validateScenarioRefId(scenarioId);
    const context = await this.interventionContextResolver.resolveInterventionContext(scenarioId);
    if (context === null) {
      throw new ExecutionError(
        "unknown_scenario_ref",
        `intervention scenario ${scenarioId} does not resolve`,
      );
    }
    const state = context.states.find((entry) => entry.stateId === stateId);
    if (state === undefined) {
      throw new ExecutionError(
        "unknown_state_ref",
        `state ${stateId} does not exist on scenario ${scenarioId} — ` +
          `available layers are ${String(context.states.length - 1)}`,
      );
    }
    const covering = (await this.store.list()).filter(
      (record) => record.scenarioId === scenarioId && record.stateId === stateId,
    );
    if (covering.length === 0) {
      return {
        scenarioId,
        stateId,
        stateIndex: state.stateIndex,
        epistemicStatus: "PROPOSED",
      };
    }
    const earliest = covering.sort((a, b) =>
      a.recordedAt === b.recordedAt
        ? a.executionRecordId < b.executionRecordId
          ? -1
          : a.executionRecordId > b.executionRecordId
            ? 1
            : 0
        : a.recordedAt < b.recordedAt
          ? -1
          : 1,
    )[0]!;
    return {
      scenarioId,
      stateId,
      stateIndex: state.stateIndex,
      epistemicStatus: "EXECUTED",
      executionRecordId: earliest.executionRecordId,
      evidenceIds: [...earliest.stateTransition.evidenceIds],
      recordedAt: earliest.stateTransition.recordedAt,
    };
  }

  /**
   * Verify and return the full issue→outcome lineage for one case:
   * case → observations/hypotheses → intervention scenario/step/state →
   * execution record → post-work capture → outcome observation, with EVERY
   * hop verified. Typed refusals when a link is missing:
   *   - `case_not_found`             the case does not resolve;
   *   - `lineage_missing_execution`  the case has no execution record yet;
   *   - `unknown_scenario_ref` / `unknown_state_ref` / `unknown_step_ref` /
   *     `step_not_in_state`          an execution's intervention links broke;
   *   - `unknown_evidence_ref`       execution or outcome evidence vanished;
   *   - `lineage_missing_outcome`    an execution has no outcome observation;
   *   - `lineage_missing_capture`    no post-work capture reference anywhere
   *                                  on the execution's chain.
   */
  async getCaseLineage(caseId: string): Promise<CaseLineage> {
    validateCaseRefId(caseId);
    const caseContext = await this.caseContextResolver.resolveCaseContext(caseId);
    if (caseContext === null) {
      throw new ExecutionError("case_not_found", `case ${caseId} does not exist`);
    }
    const executions = (await this.store.list()).filter((record) => record.caseId === caseId);
    if (executions.length === 0) {
      throw new ExecutionError(
        "lineage_missing_execution",
        `case ${caseId} has no execution record — the issue→outcome chain cannot be verified before work is executed`,
      );
    }
    const entries: CaseLineage["executions"][number][] = [];
    for (const record of executions) {
      const scenarioContext = await this.interventionContextResolver.resolveInterventionContext(
        record.scenarioId,
      );
      if (scenarioContext === null) {
        throw new ExecutionError(
          "unknown_scenario_ref",
          `execution ${record.executionRecordId} references intervention scenario ` +
            `${record.scenarioId} which does not resolve`,
        );
      }
      const state = this.verifyStateAlignment(
        scenarioContext,
        record.stateId,
        record.executedStepIds,
      );
      await this.verifyEvidenceMembership(record.evidenceIds);
      if (record.outcomes.length === 0) {
        throw new ExecutionError(
          "lineage_missing_outcome",
          `execution ${record.executionRecordId} has no outcome observation — ` +
            `the issue→outcome chain cannot be verified before the post-work outcome is recorded`,
        );
      }
      for (const outcome of record.outcomes) {
        await this.verifyEvidenceMembership(outcome.evidenceIds);
      }
      const postWorkCaptureSessionIds = [
        ...new Set([
          ...record.captureSessionIds,
          ...record.outcomes.flatMap((outcome) => outcome.captureSessionIds),
        ]),
      ];
      if (postWorkCaptureSessionIds.length === 0) {
        throw new ExecutionError(
          "lineage_missing_capture",
          `execution ${record.executionRecordId} and its outcomes reference no post-work capture session — ` +
            `the issue→outcome chain cannot be verified without the post-work capture hop`,
        );
      }
      entries.push({
        executionRecordId: record.executionRecordId,
        executedAt: record.executedAt,
        recordedAt: record.recordedAt,
        scenario: scenarioContext,
        executedState: {
          stateId: state.stateId,
          stateIndex: state.stateIndex,
          appliedStepIds: [...state.appliedStepIds],
        },
        executedStepIds: [...record.executedStepIds],
        executionEvidenceIds: [...record.evidenceIds],
        postWorkCaptureSessionIds,
        stateTransition: record.stateTransition,
        outcomes: [...record.outcomes],
      });
    }
    return { caseId, case: caseContext, executions: entries };
  }
}
