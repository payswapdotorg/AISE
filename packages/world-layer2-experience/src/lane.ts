/**
 * WORLD-P2 — the LANE RUNNER (`src/lane.ts`): the eight-stage lane,
 * composed end-to-end.
 *
 *   PROBLEM → CONTEXT → EVIDENCE → MISSING-EVIDENCE DETECTION
 *   → BOUNDED REASONING → DETERMINISTIC CHECKS → ACTION → AUDIT TRAIL
 *
 * The runner composes the four family ports — the context assembler, the
 * missing-evidence detector, the bounded reasoner (the LLM substrate
 * seam) and the action recorder + audit ledger — with the P0-B IFC
 * double's extraction as the substrate-candidate input. It is the
 * in-memory proof that the WHOLE lane works WITHOUT any substrate: no
 * Reality-Graph store, no scene runtime, no IFC engine, no LLM, no
 * backend persistence — only the committed fixtures and the doubles.
 *
 * The two fixture scenarios (from the family corpora):
 *
 *  - SCENARIO A ("insufficient"): the evidence envelope lacks the second
 *    crack photo and the remaining-steel-section observation → the
 *    detector answers NOT_READY with typed gaps → the bounded reasoner
 *    REFUSES (INSUFFICIENT_EVIDENCE — law #3) → the lane records the
 *    explicit request-evidence action for the blocking gap's task → every
 *    transition lands in the audit trail, including the honest refusal.
 *    THE FLAGSHIP FAIL-CLOSED DRILL.
 *  - SCENARIO B ("ready"): the full evidence envelope → READY → the
 *    bounded reasoner answers INFERRED claims with resolved citations →
 *    the deterministic-check gate classifies the engine-owned checks
 *    (pass) + the advisory check (review-needed, never verdict-bearing)
 *    → the gated propose_solution_operation + assign_owner + review +
 *    resolve actions record → the audit trail closes with the
 *    replay-verified event.
 *
 * DETERMINISM (law #9): the runner is PURE — no clock, no randomness, no
 * I/O; every instant is a declared fixture input. The same kit + the
 * same scenario always produce the byte-identical run (including the
 * content-derived `runId`) — asserted in `lane.test.ts`.
 */

import type {
  Measurement,
  Observation,
  PropertyAssertion,
  RealityObject,
} from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import { canonicalDigestOf } from "@aise/world-understanding-substrate";
import type {
  AuditAppendInput,
  AuditEventKind,
  AuditReasonKind,
  AuditTrail,
  ProblemAction,
} from "./action/contract";
import type { ActionRecorder, AuditLedger } from "./action/contract";
import { transitionActionStatus } from "./action/contract";
import type {
  AttachedCheck,
  BoundedReasoningOutcome,
  BoundedReasoningProvider,
  DeterministicCheckGateVerdict,
} from "./reasoning/contract";
import { gateDeterministicChecks, reasonThroughBoundedPort } from "./reasoning/contract";
import type {
  CaseContext,
  CaseContextAssembler,
  DefineProblemInput,
  EngineeringProblem,
  SubstrateCandidateSet,
} from "./problem/contract";
import { defineEngineeringProblem } from "./problem/contract";
import type {
  BindEvidenceInput,
  EvidenceRequirementSet,
  MissingEvidenceDetector,
  MissingEvidenceReport,
  ProblemEvidenceEnvelope,
} from "./evidence/contract";
import { bindProblemEvidence } from "./evidence/contract";
import {
  contentIdOf,
  laneRefused,
  type LaneActor,
  type LaneOutcome,
  type Layer2StageName,
} from "./seam";
import {
  FIXTURE_ACTOR_ENGINEER,
  FIXTURE_ACTOR_REVIEWER,
  FIXTURE_EVIDENCE_CRACK_PHOTO_1,
  FIXTURE_EVIDENCE_CRACK_PHOTO_2,
  FIXTURE_EVIDENCE_DIAL_GAUGE,
  FIXTURE_OBSERVATIONS,
  FIXTURE_PROBLEM_INPUT,
  FIXTURE_SCENE,
  FIXTURE_SUBSTRATE_CANDIDATES,
  FIXTURE_WALL_OBJECT_ID,
  PROBLEM_FIXTURE_RECORDED_AT,
} from "./problem/corpus";
import {
  FIXTURE_MEASUREMENT_DEFLECTION,
  FIXTURE_REQUIREMENT_SET,
  SCENARIO_A_ASSERTIONS,
  SCENARIO_A_EVIDENCE_INPUT,
  SCENARIO_B_ASSERTIONS,
  SCENARIO_B_EVIDENCE_INPUT,
} from "./evidence/corpus";
import {
  fixtureAttachedChecks,
  fixtureReasoningRequest,
} from "./reasoning/corpus";
import {
  FIXTURE_RESOLVE_ACTION,
  SCENARIO_A_REQUEST_EVIDENCE_ACTION,
  SCENARIO_B_ASSIGN_OWNER_ACTION,
  SCENARIO_B_PROPOSE_OPERATION_ACTION,
} from "./action/corpus";

/* ------------------------------------------------------------------ */
/* The lane kit + scenario                                              */
/* ------------------------------------------------------------------ */

/** The composed lane kit: one double per family port. */
export interface Layer2LaneKit {
  readonly label: string;
  readonly contextAssembler: CaseContextAssembler;
  readonly detector: MissingEvidenceDetector;
  readonly reasoner: BoundedReasoningProvider;
  readonly recorder: ActionRecorder;
  readonly ledger: AuditLedger;
}

/** One runnable lane scenario (everything the runner needs). */
export interface Layer2LaneScenario {
  readonly label: string;
  readonly problemInput: DefineProblemInput;
  readonly scene: import("@aise/world-reality-substrate").ComposedScene;
  readonly realityObjects: readonly RealityObject[];
  readonly measurements: readonly Measurement[];
  readonly propertyAssertions: readonly PropertyAssertion[];
  readonly observations: readonly Observation[];
  readonly substrateCandidates: readonly SubstrateCandidateSet[];
  readonly requirements: EvidenceRequirementSet;
  readonly evidenceInput: BindEvidenceInput;
  readonly assembledAt: string;
  readonly detectedAt: string;
}

/** One stage's one-line summary (what the typed transform proved). */
export interface StageSummary {
  readonly stage: Layer2StageName;
  readonly outcome: string;
}

/** The complete lane run result. */
export interface Layer2LaneRunResult {
  readonly runId: string;
  readonly scenarioLabel: string;
  readonly problemId: string;
  readonly contextId: string;
  readonly problem: EngineeringProblem;
  readonly context: CaseContext;
  readonly envelope: ProblemEvidenceEnvelope;
  readonly missingEvidence: MissingEvidenceReport;
  readonly reasoning: BoundedReasoningOutcome;
  readonly checkGate: DeterministicCheckGateVerdict | null;
  readonly actions: readonly ProblemAction[];
  readonly auditTrail: AuditTrail;
  readonly stageSummaries: readonly StageSummary[];
}

/* ------------------------------------------------------------------ */
/* The fixture world records                                            */
/* ------------------------------------------------------------------ */

/** The accepted Reality-Graph identity of Wall-001 (AISE authority side). */
export const FIXTURE_WALL_REALITY_OBJECT: RealityObject = {
  contractVersion: CONTRACT_VERSION,
  objectId: FIXTURE_WALL_OBJECT_ID,
  version: 1,
  kind: "wall",
  units: { linear: "mm", angular: "rad" },
};

/* ------------------------------------------------------------------ */
/* The fixture scenarios                                                */
/* ------------------------------------------------------------------ */

/** SCENARIO A — the honest insufficient-evidence run. */
export function fixtureScenarioA(): Layer2LaneScenario {
  return {
    label: "scenario-a-insufficient",
    problemInput: FIXTURE_PROBLEM_INPUT,
    scene: FIXTURE_SCENE,
    realityObjects: [FIXTURE_WALL_REALITY_OBJECT],
    measurements: [FIXTURE_MEASUREMENT_DEFLECTION],
    propertyAssertions: SCENARIO_A_ASSERTIONS,
    observations: FIXTURE_OBSERVATIONS,
    substrateCandidates: FIXTURE_SUBSTRATE_CANDIDATES,
    requirements: FIXTURE_REQUIREMENT_SET,
    evidenceInput: SCENARIO_A_EVIDENCE_INPUT,
    assembledAt: PROBLEM_FIXTURE_RECORDED_AT,
    detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
  };
}

/** SCENARIO B — the ready run through to governed action. */
export function fixtureScenarioB(): Layer2LaneScenario {
  return {
    label: "scenario-b-ready",
    problemInput: FIXTURE_PROBLEM_INPUT,
    scene: FIXTURE_SCENE,
    realityObjects: [FIXTURE_WALL_REALITY_OBJECT],
    measurements: [FIXTURE_MEASUREMENT_DEFLECTION],
    propertyAssertions: SCENARIO_B_ASSERTIONS,
    observations: FIXTURE_OBSERVATIONS,
    substrateCandidates: FIXTURE_SUBSTRATE_CANDIDATES,
    requirements: FIXTURE_REQUIREMENT_SET,
    evidenceInput: SCENARIO_B_EVIDENCE_INPUT,
    assembledAt: PROBLEM_FIXTURE_RECORDED_AT,
    detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
  };
}

/* ------------------------------------------------------------------ */
/* The audit-append helpers (the seven audited lane transitions)        */
/* ------------------------------------------------------------------ */

function auditEntry(
  problemId: string,
  laneStage: Layer2StageName,
  eventKind: AuditEventKind,
  actor: LaneActor,
  subjectDigest: string,
  subjectKind: string,
  reason: string,
  reasonKind: AuditReasonKind,
  evidenceContentIds: readonly string[],
): AuditAppendInput {
  return {
    problemId,
    laneStage,
    eventKind,
    actor,
    subjectDigest,
    subjectKind,
    occurredAt: PROBLEM_FIXTURE_RECORDED_AT,
    reason,
    reasonKind,
    evidenceContentIds,
  };
}

function appendEvent(
  ledger: AuditLedger,
  trail: AuditTrail | null,
  entry: AuditAppendInput,
): LaneOutcome<AuditTrail> {
  return ledger.append(trail, entry);
}

/* ------------------------------------------------------------------ */
/* The lane runner                                                      */
/* ------------------------------------------------------------------ */

/**
 * Runs the full eight-stage lane. PURE + deterministic: the same kit and
 * scenario always produce the byte-identical result (same `runId`).
 * Every stage transition appends exactly one audit record (law #7); a
 * refused stage propagates as a typed lane refusal — never a silent gap.
 */
export function runLayer2Lane(
  kit: Layer2LaneKit,
  scenario: Layer2LaneScenario,
): LaneOutcome<Layer2LaneRunResult> {
  /* --- STAGE 1: PROBLEM ------------------------------------------------ */
  const problemOutcome = defineEngineeringProblem(scenario.problemInput, scenario.scene);
  if (!problemOutcome.ok) {
    return problemOutcome;
  }
  const problem = problemOutcome.value;

  /* --- STAGE 2: CONTEXT ------------------------------------------------- */
  const contextOutcome = kit.contextAssembler.assemble({
    problem,
    scene: scenario.scene,
    realityObjects: scenario.realityObjects,
    measurements: scenario.measurements,
    propertyAssertions: scenario.propertyAssertions,
    observations: scenario.observations,
    substrateCandidates: scenario.substrateCandidates,
    assembledAt: scenario.assembledAt,
  });
  if (!contextOutcome.ok) {
    return contextOutcome;
  }
  const context = contextOutcome.value;

  /* --- STAGE 3: EVIDENCE ------------------------------------------------ */
  const envelopeOutcome = bindProblemEvidence(scenario.evidenceInput, context);
  if (!envelopeOutcome.ok) {
    return envelopeOutcome;
  }
  const envelope = envelopeOutcome.value;

  /* --- STAGE 4: MISSING-EVIDENCE DETECTION ------------------------------ */
  const reportOutcome = kit.detector.detect({
    requirements: scenario.requirements,
    envelope,
    context,
    detectedAt: scenario.detectedAt,
  });
  if (!reportOutcome.ok) {
    return reportOutcome;
  }
  const report = reportOutcome.value;

  /* --- STAGE 5: BOUNDED REASONING --------------------------------------- */
  const request = fixtureReasoningRequest(context.contextId, report.reportId);
  /* Through the GOVERNED entry: the readiness pre-condition (refuse when
   * NOT_READY/INSUFFICIENT_DATA), the citation post-validation and the
   * INFERRED-only claim laws all apply — no provider, real or double, can
   * bypass them (law #3 + the no-LLM-authority law). */
  const reasoning = reasonThroughBoundedPort(
    kit.reasoner,
    request,
    context,
    envelope,
    report,
  );

  /* --- STAGE 6: DETERMINISTIC CHECKS ------------------------------------- */
  let checkGate: DeterministicCheckGateVerdict | null = null;
  if (reasoning.ok) {
    const attachedChecks: readonly AttachedCheck[] = fixtureAttachedChecks(reasoning.result.resultId);
    const gateOutcome = gateDeterministicChecks(
      {
        problemId: problem.problemId,
        attachedChecks,
        reasoningResults: [reasoning.result],
      },
      scenario.detectedAt,
    );
    if (!gateOutcome.ok) {
      return gateOutcome;
    }
    checkGate = gateOutcome.value;
  }

  /* --- STAGE 7: ACTION --------------------------------------------------- */
  const actions: ProblemAction[] = [];
  if (!reasoning.ok) {
    /* The honest insufficient-evidence branch: dispatch the explicit
     * missing-evidence task for the first blocking gap (the directive's
     * "explicit readiness/missing-evidence tasks"). */
    const blockingGap =
      report.gaps.find((gap) => gap.kind === "MISSING") ?? report.gaps[0] ?? null;
    if (blockingGap !== null) {
      const actionInput = {
        ...SCENARIO_A_REQUEST_EVIDENCE_ACTION,
        payload: {
          ...SCENARIO_A_REQUEST_EVIDENCE_ACTION.payload,
          taskId: blockingGap.remediationTask.taskId,
        },
      };
      const actionOutcome = kit.recorder.record(actionInput, null);
      if (!actionOutcome.ok) {
        return actionOutcome;
      }
      actions.push(actionOutcome.value);
    }
  } else if (checkGate !== null && checkGate.verdict === "pass") {
    /* The ready branch: ownership, the gated proposal, the review and the
     * governed resolution. */
    const assignOutcome = kit.recorder.record(SCENARIO_B_ASSIGN_OWNER_ACTION, null);
    if (!assignOutcome.ok) {
      return assignOutcome;
    }
    const proposalInput = {
      ...SCENARIO_B_PROPOSE_OPERATION_ACTION,
      payload: {
        ...SCENARIO_B_PROPOSE_OPERATION_ACTION.payload,
        gateVerdictId: checkGate.gateId,
      },
    };
    const proposalOutcome = kit.recorder.record(proposalInput, checkGate);
    if (!proposalOutcome.ok) {
      return proposalOutcome;
    }
    const reviewOutcome = kit.recorder.record(
      {
        problemId: problem.problemId,
        actionKind: "request_review",
        payload: {
          actionKind: "request_review",
          reviewer: FIXTURE_ACTOR_REVIEWER,
        },
        ownership: {
          owner: FIXTURE_ACTOR_REVIEWER,
          assignedBy: FIXTURE_ACTOR_ENGINEER,
          assignedAt: PROBLEM_FIXTURE_RECORDED_AT,
        },
        evidenceContentIds: [FIXTURE_EVIDENCE_DIAL_GAUGE],
        createdAt: PROBLEM_FIXTURE_RECORDED_AT,
      },
      null,
    );
    if (!reviewOutcome.ok) {
      return reviewOutcome;
    }
    const resolveOutcome = kit.recorder.record(FIXTURE_RESOLVE_ACTION, null);
    if (!resolveOutcome.ok) {
      return resolveOutcome;
    }
    /* One governed lifecycle transition, audited as action_status_changed. */
    const completedAssign = transitionActionStatus(assignOutcome.value, "in_progress");
    if (!completedAssign.ok) {
      return completedAssign;
    }
    const completed = transitionActionStatus(completedAssign.value, "completed");
    if (!completed.ok) {
      return completed;
    }
    actions.push(completed.value, proposalOutcome.value, reviewOutcome.value, resolveOutcome.value);
  }

  /* --- STAGE 8: AUDIT TRAIL ---------------------------------------------- */
  /* Every lane transition is exactly one audited append (law #7). The
   * entries are built first (pure, deterministic), then folded through
   * the ledger in order; the final replay-verified event pins the digest
   * of the trail as it stood BEFORE that event (the self-pinning
   * discipline — the event that proves the trail is part of the trail). */
  const auditEntries: AuditAppendInput[] = [
    /* 8.1 — PROBLEM */
    auditEntry(
      problem.problemId,
      "PROBLEM",
      "problem_defined",
      problem.openedBy,
      canonicalDigestOf(problem),
      "engineering_problem",
      `The problem "${problem.title}" was defined and bound to scene revision ${problem.spatialBinding.sceneRevision}.`,
      "problem_statement",
      problem.spatialBinding.captureEvidenceContentIds,
    ),
    /* 8.2 — CONTEXT */
    auditEntry(
      problem.problemId,
      "CONTEXT",
      "context_assembled",
      problem.openedBy,
      canonicalDigestOf(context),
      "case_context",
      `The case context view was assembled: ${context.realityObjects.length} reality object(s), ` +
        `${context.substrateCandidates.length} substrate candidate set(s) (INFERRED), ` +
        `${context.observations.length} evidence-bound observation(s).`,
      "context_assembly",
      context.observations.flatMap((observation) => observation.evidenceContentIds),
    ),
    /* 8.3 — EVIDENCE */
    auditEntry(
      problem.problemId,
      "EVIDENCE",
      "evidence_bound",
      problem.openedBy,
      canonicalDigestOf(envelope),
      "problem_evidence_envelope",
      `The evidence envelope was sealed: ${envelope.evidence.length} evidence record(s), ` +
        `${envelope.provenanceLinks.length} provenance link(s), ${envelope.bundles.length} bundle(s).`,
      "evidence_binding",
      envelope.evidence.map((record) => record.contentId),
    ),
    /* 8.4 — MISSING-EVIDENCE */
    auditEntry(
      problem.problemId,
      "MISSING_EVIDENCE",
      "missing_evidence_detected",
      problem.openedBy,
      canonicalDigestOf(report),
      "missing_evidence_report",
      `The readiness verdict is ${report.verdict}: ${report.gaps.length} typed gap(s) with explicit remediation tasks.`,
      "readiness_verdict",
      [],
    ),
  ];
  /* 8.5 — BOUNDED REASONING (result or honest refusal) */
  auditEntries.push(
    reasoning.ok
      ? auditEntry(
          problem.problemId,
          "BOUNDED_REASONING",
          "bounded_reasoning_completed",
          request.askedBy,
          canonicalDigestOf(reasoning.result),
          "bounded_reasoning_result",
          `The bounded reasoner answered ${reasoning.result.claims.length} INFERRED advisory claim(s), ` +
            `citations resolved, provenance recorded (prompt digest ${reasoning.result.reasoningProvenance.promptDigest}).`,
          "bounded_reasoning_output",
          context.observations.flatMap((observation) => observation.evidenceContentIds),
        )
      : auditEntry(
          problem.problemId,
          "BOUNDED_REASONING",
          "bounded_reasoning_refused",
          request.askedBy,
          canonicalDigestOf(reasoning.refusal),
          "bounded_reasoning_refusal",
          `The bounded reasoner REFUSED (${reasoning.refusal.code}): ${reasoning.refusal.detail}`,
          "insufficient_evidence_refusal",
          [],
        ),
  );
  /* 8.6 — DETERMINISTIC CHECKS (only when reasoning answered) */
  if (checkGate !== null) {
    auditEntries.push(
      auditEntry(
        problem.problemId,
        "DETERMINISTIC_CHECKS",
        "deterministic_checks_gated",
        problem.openedBy,
        canonicalDigestOf(checkGate),
        "deterministic_check_gate_verdict",
        `The deterministic-check gate classified ${checkGate.engineOwnedCheckIds.length} engine-owned ` +
          `check(s) (outcome ${String(checkGate.engineOwnedOutcome)}) and ${checkGate.advisoryCheckIds.length} advisory check(s).`,
        "engineering_authority",
        [],
      ),
    );
  }
  /* 8.7 — ACTION (one event per recorded action) */
  for (const action of actions) {
    auditEntries.push(
      auditEntry(
        problem.problemId,
        "ACTION",
        "action_recorded",
        action.ownership.assignedBy,
        canonicalDigestOf(action),
        "problem_action",
        `The ${action.actionKind} action was recorded (owner ${action.ownership.owner.actorId}, ` +
          `status ${action.status}).`,
        action.actionKind === "resolve_case"
          ? "review_decision"
          : action.actionKind === "assign_owner"
            ? "ownership_assignment"
            : "explicit_request",
        action.evidenceContentIds,
      ),
    );
  }
  /* The fold: append every entry in order. */
  let trail: AuditTrail | null = null;
  for (const entry of auditEntries) {
    const outcome = appendEvent(kit.ledger, trail, entry);
    if (!outcome.ok) {
      return outcome;
    }
    trail = outcome.value;
  }
  if (trail === null) {
    return laneRefused(
      "action",
      "operation-semantic-failure",
      "the audit trail is empty — every lane run must carry at least the problem-defined event",
    );
  }
  /* 8.8 — AUDIT TRAIL (the self-pinning replay-verified event): the
   * deterministic replay is verified on the trail as it stood BEFORE this
   * final event, then the verification itself is audited. */
  const replay = kit.ledger.verifyReplay(trail);
  if (!replay.ok) {
    return laneRefused(
      "action",
      "operation-semantic-failure",
      `the audit trail failed deterministic replay: ${replay.failures
        .map((failure) => `${failure.kind} at ${failure.sequence} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  const finalOutcome = appendEvent(
    kit.ledger,
    trail,
    auditEntry(
      problem.problemId,
      "AUDIT_TRAIL",
      "audit_replay_verified",
      problem.openedBy,
      canonicalDigestOf(trail),
      "layer2_audit_trail",
      `The audit trail (${replay.checkedEvents} events) replayed deterministically — every event id ` +
        "re-derived from content, every chain link verified.",
      "lifecycle_transition",
      [],
    ),
  );
  if (!finalOutcome.ok) {
    return finalOutcome;
  }
  const auditTrail: AuditTrail = finalOutcome.value;

  /* --- The run result ---------------------------------------------------- */
  const stageSummaries: readonly StageSummary[] = [
    { stage: "PROBLEM", outcome: `problem ${problem.problemId} bound to scene revision ${problem.spatialBinding.sceneRevision}` },
    { stage: "CONTEXT", outcome: `context ${context.contextId} composed (${context.substrateCandidates.length} INFERRED candidate set(s))` },
    { stage: "EVIDENCE", outcome: `envelope sealed with ${envelope.evidence.length} evidence record(s)` },
    { stage: "MISSING_EVIDENCE", outcome: `verdict ${report.verdict} with ${report.gaps.length} gap(s)` },
    {
      stage: "BOUNDED_REASONING",
      outcome: reasoning.ok
        ? `${reasoning.result.claims.length} INFERRED advisory claim(s)`
        : `refused (${reasoning.refusal.code})`,
    },
    {
      stage: "DETERMINISTIC_CHECKS",
      outcome:
        checkGate === null
          ? "skipped (reasoning refused — no proposal to gate)"
          : `gate ${checkGate.verdict}: ${checkGate.engineOwnedCheckIds.length} engine-owned, ${checkGate.advisoryCheckIds.length} advisory`,
    },
    { stage: "ACTION", outcome: `${actions.length} action(s) recorded` },
    { stage: "AUDIT_TRAIL", outcome: `${auditTrail.records.length} append-only event(s), replay verified` },
  ];
  const body: Omit<Layer2LaneRunResult, "runId"> = {
    scenarioLabel: scenario.label,
    problemId: problem.problemId,
    contextId: context.contextId,
    problem,
    context,
    envelope,
    missingEvidence: report,
    reasoning,
    checkGate,
    actions,
    auditTrail,
    stageSummaries,
  };
  const runId = contentIdOf(body as unknown as Record<string, unknown>, "runId");
  return { ok: true, value: { ...body, runId } };
}

/* Re-exported fixture evidence ids (the lane runner's audit inputs). */
export {
  FIXTURE_EVIDENCE_CRACK_PHOTO_1,
  FIXTURE_EVIDENCE_CRACK_PHOTO_2,
  FIXTURE_EVIDENCE_DIAL_GAUGE,
};
