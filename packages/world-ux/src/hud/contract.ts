/**
 * WORLD-P4 — the HUD family contract: the seven in-world HUD panels
 * as READ-ONLY typed projections of composed lane state (handoff §4
 * "In-world HUD"; seam laws #1–#4, #8).
 *
 * Every panel is a pure projection with an HONEST content state
 * (POPULATED / EMPTY / UNAVAILABLE — law #3): POPULATED means real
 * lane data shaped for the HUD; EMPTY means the lane answered "none
 * in scope" and an honest note says so (never fabricated filler);
 * UNAVAILABLE means the source refused or erroed and the typed
 * unified failure is carried verbatim (law #4). No panel computes an
 * engineering verdict, quantity or epistemic upgrade (law #8): every
 * value shown is a verbatim citation of lane-authored state.
 *
 * Panel → lane sources (the panel×lane matrix, see the evidence README):
 *
 *   objective   ← P2 problem lane (EngineeringProblem) + P3 coordination
 *                 family (CoordinationConflictRecord — the LIVE
 *                 clash→problem binding, wiring note #4);
 *   evidence    ← P2 evidence family (MissingEvidenceReport: readiness
 *                 verdict + typed gaps) + P1 evidence vocabulary;
 *   constraints ← governed constraint observations derived from real
 *                 lane records (P2 case-context requirements, P3 what-if
 *                 deviation verdicts, P1 declared tolerances) — supplied
 *                 by the wiring, validated here fail-closed;
 *   agent       ← P2 action family (ProblemAction) + the lane operator
 *                 discipline (BOUNDED_AGENT proposes, never decides);
 *   validation  ← P2 deterministic check gate + the P3 replay
 *                 verification (the solution status);
 *   cost-boq    ← P3 quantify family (QuantityConsequenceProjection —
 *                 a VIEW; the BOQ Graph stays the ONLY quantity
 *                 authority — the projection's epistemicClass is
 *                 structurally PROPOSED);
 *   timeline    ← P3 sequencing family (SequencedExecution playback
 *                 phases over the P0-C execution trajectory).
 */

import {
  HUD_PANEL_ORDER,
  HUD_PANEL_TITLES,
  deepFreeze,
  isDeclaredInstant,
  worldUxRefused,
  type HudContentState,
  type HudPanelId,
  type WorldUxFailure,
  type WorldUxOutcome,
} from "../seam";
import type { FailureKind } from "@aise/provider-registry";
import {
  READINESS_VERDICTS,
} from "@aise/world-layer2-experience";
import type {
  EngineeringProblem,
  MissingEvidenceReport,
  ProblemAction,
  DeterministicCheckGateVerdict,
} from "@aise/world-layer2-experience";
import type {
  CoordinationConflictRecord,
  QuantityConsequenceProjection,
  SequencedExecution,
} from "@aise/world-layer3-experience";

/* ------------------------------------------------------------------ */
/* The panel shell (the honest presentation carrier)                    */
/* ------------------------------------------------------------------ */

/**
 * One HUD panel: the closed presentation shell around one panel's
 * data. `data` is non-null iff contentState is POPULATED; `failure`
 * is non-null iff contentState is UNAVAILABLE; `note` is non-null iff
 * contentState is EMPTY (the honest why-there-is-nothing note).
 */
export interface HudPanel<TData> {
  readonly panelId: HudPanelId;
  readonly title: string;
  readonly contentState: HudContentState;
  readonly data: TData | null;
  readonly failure: WorldUxFailure | null;
  readonly note: string | null;
}

/** Build a POPULATED panel. */
function populatedPanel<TData>(panelId: HudPanelId, data: TData): HudPanel<TData> {
  return deepFreeze({
    panelId,
    title: HUD_PANEL_TITLES[panelId],
    contentState: "POPULATED" as const,
    data,
    failure: null,
    note: null,
  });
}

/** Build an EMPTY panel (the honest no-data note — never filler). */
function emptyPanel<TData>(panelId: HudPanelId, note: string): HudPanel<TData> {
  return deepFreeze({
    panelId,
    title: HUD_PANEL_TITLES[panelId],
    contentState: "EMPTY" as const,
    data: null,
    failure: null,
    note,
  });
}

/** Build an UNAVAILABLE panel (the typed failure, carried verbatim). */
export function unavailablePanel<TData>(
  panelId: HudPanelId,
  failure: WorldUxFailure,
): HudPanel<TData> {
  return deepFreeze({
    panelId,
    title: HUD_PANEL_TITLES[panelId],
    contentState: "UNAVAILABLE" as const,
    data: null,
    failure,
    note: null,
  });
}

/* ------------------------------------------------------------------ */
/* OBJECTIVE — the current engineering problem + LIVE clash problems    */
/* ------------------------------------------------------------------ */

/** The P2 problem summary (verbatim citations, HUD-shaped). */
export interface HudProblemSummary {
  readonly problemId: string;
  readonly title: string;
  readonly statement: string;
  readonly questionKind: string;
  readonly status: string;
  readonly openedAt: string;
  /** The spatial binding's element ids (the in-world anchors). */
  readonly boundElementIds: readonly string[];
  readonly captureEvidenceContentIds: readonly string[];
}

/** One LIVE clash→problem link (the P3 wiring note #4). */
export interface HudClashProblemLink {
  readonly conflictId: string;
  readonly reportId: string;
  readonly pairId: string;
  readonly verdict: string;
  readonly separationMetres: number;
  readonly problemId: string;
  readonly problemStatus: string;
  readonly problemTitle: string;
}

/** The OBJECTIVE panel data. */
export interface HudObjectiveData {
  readonly primaryProblem: HudProblemSummary | null;
  readonly clashProblems: readonly HudClashProblemLink[];
}

/** The OBJECTIVE panel input (what the wiring supplies). */
export interface HudObjectiveInput {
  readonly primaryProblem: EngineeringProblem | null;
  /**
   * The LIVE clash→problem conflict records from the P3 coordination
   * family (wiring note #4), or null when no coordination source is
   * bound (the panel still renders the primary problem).
   */
  readonly clashConflicts: readonly CoordinationConflictRecord[] | null;
}

function projectProblem(
  problem: EngineeringProblem,
): WorldUxOutcome<HudProblemSummary> {
  if (typeof problem.problemId !== "string" || problem.problemId.length === 0) {
    return worldUxRefused<HudProblemSummary>(
      "hud",
      "contract-mismatch",
      "objective: problem.problemId must be a non-empty string",
    );
  }
  if (!isDeclaredInstant(problem.openedAt)) {
    return worldUxRefused<HudProblemSummary>(
      "hud",
      "contract-mismatch",
      `objective: problem ${problem.problemId} openedAt must be a declared ISO-8601 UTC instant`,
    );
  }
  return {
    ok: true,
    value: deepFreeze({
      problemId: problem.problemId,
      title: problem.title,
      statement: problem.statement,
      questionKind: problem.questionKind,
      status: problem.status,
      openedAt: problem.openedAt,
      boundElementIds: problem.spatialBinding.elementIds,
      captureEvidenceContentIds: problem.spatialBinding.captureEvidenceContentIds,
    }),
  };
}

function projectClashLink(
  conflict: CoordinationConflictRecord,
): WorldUxOutcome<HudClashProblemLink> {
  if (
    typeof conflict.conflictId !== "string" ||
    conflict.conflictId.length === 0
  ) {
    return worldUxRefused<HudClashProblemLink>(
      "hud",
      "contract-mismatch",
      "objective: clash conflict record must carry a non-empty conflictId",
    );
  }
  if (!Number.isFinite(conflict.separationMetres)) {
    return worldUxRefused<HudClashProblemLink>(
      "hud",
      "contract-mismatch",
      `objective: clash conflict ${conflict.conflictId} separationMetres must be finite`,
    );
  }
  const binding = conflict.problemBinding;
  if (
    typeof binding.problemId !== "string" ||
    binding.problemId.length === 0 ||
    typeof binding.problemStatus !== "string" ||
    binding.problemStatus.length === 0
  ) {
    return worldUxRefused<HudClashProblemLink>(
      "hud",
      "contract-mismatch",
      `objective: clash conflict ${conflict.conflictId} problemBinding must carry problemId + problemStatus`,
    );
  }
  return {
    ok: true,
    value: deepFreeze({
      conflictId: conflict.conflictId,
      reportId: conflict.reportId,
      pairId: conflict.pairId,
      verdict: conflict.verdict,
      separationMetres: conflict.separationMetres,
      problemId: binding.problemId,
      problemStatus: binding.problemStatus,
      problemTitle: binding.problemTitle,
    }),
  };
}

/**
 * Project the OBJECTIVE panel: the primary P2 problem plus the LIVE
 * clash→problem links (wiring note #4). EMPTY iff both sources are
 * absent; fail-closed on malformed records.
 */
export function projectObjectivePanel(
  input: HudObjectiveInput,
): WorldUxOutcome<HudPanel<HudObjectiveData>> {
  if (input.primaryProblem !== null) {
    const problemOutcome = projectProblem(input.primaryProblem);
    if (!problemOutcome.ok) {
      return problemOutcome;
    }
    let clashProblems: HudClashProblemLink[] = [];
    if (input.clashConflicts !== null) {
      for (const conflict of input.clashConflicts) {
        const link = projectClashLink(conflict);
        if (!link.ok) {
          return link;
        }
        clashProblems.push(link.value);
      }
    }
    clashProblems = clashProblems.slice().sort((a, b) =>
      a.conflictId < b.conflictId ? -1 : a.conflictId > b.conflictId ? 1 : 0,
    );
    return {
      ok: true,
      value: populatedPanel("objective", deepFreeze({
        primaryProblem: problemOutcome.value,
        clashProblems,
      })),
    };
  }
  if (input.clashConflicts !== null && input.clashConflicts.length > 0) {
    const clashProblems: HudClashProblemLink[] = [];
    for (const conflict of input.clashConflicts) {
      const link = projectClashLink(conflict);
      if (!link.ok) {
        return link;
      }
      clashProblems.push(link.value);
    }
    clashProblems.sort((a, b) =>
      a.conflictId < b.conflictId ? -1 : a.conflictId > b.conflictId ? 1 : 0,
    );
    return {
      ok: true,
      value: populatedPanel("objective", deepFreeze({
        primaryProblem: null,
        clashProblems,
      })),
    };
  }
  return {
    ok: true,
    value: emptyPanel(
      "objective",
      "no engineering problem is open in this scope and no clash conflict has been recorded",
    ),
  };
}

/* ------------------------------------------------------------------ */
/* EVIDENCE — the evidence/readiness state                              */
/* ------------------------------------------------------------------ */

/** One typed evidence gap (verbatim citations, HUD-shaped). */
export interface HudEvidenceGap {
  readonly gapId: string;
  readonly requirementId: string;
  readonly gapKind: string;
  readonly detail: string;
}

/** The EVIDENCE panel data. */
export interface HudEvidenceData {
  readonly reportId: string;
  readonly problemId: string;
  readonly readinessVerdict: string;
  readonly gapCount: number;
  readonly requirementCount: number;
  readonly openRemediationTaskCount: number;
  readonly gaps: readonly HudEvidenceGap[];
}

/** The EVIDENCE panel input. */
export interface HudEvidenceInput {
  readonly report: MissingEvidenceReport | null;
}

/**
 * Project the EVIDENCE panel from the P2 missing-evidence report.
 * EMPTY (with the honest note) when no report is bound — never a
 * fabricated readiness verdict.
 */
export function projectEvidencePanel(
  input: HudEvidenceInput,
): WorldUxOutcome<HudPanel<HudEvidenceData>> {
  if (input.report === null) {
    return {
      ok: true,
      value: emptyPanel(
        "evidence",
        "no evidence readiness report is bound to this station scope",
      ),
    };
  }
  const report = input.report;
  if (typeof report.reportId !== "string" || report.reportId.length === 0) {
    return worldUxRefused<HudPanel<HudEvidenceData>>(
      "hud",
      "contract-mismatch",
      "evidence: report.reportId must be a non-empty string",
    );
  }
  if (
    typeof report.verdict !== "string" ||
    !(READINESS_VERDICTS as readonly string[]).includes(report.verdict)
  ) {
    return worldUxRefused<HudPanel<HudEvidenceData>>(
      "hud",
      "contract-mismatch",
      `evidence: report ${report.reportId} verdict must be from the closed readiness vocabulary`,
    );
  }
  if (!isDeclaredInstant(report.detectedAt)) {
    return worldUxRefused<HudPanel<HudEvidenceData>>(
      "hud",
      "contract-mismatch",
      `evidence: report ${report.reportId} detectedAt must be a declared ISO-8601 UTC instant`,
    );
  }
  const gaps: HudEvidenceGap[] = [];
  let openTasks = 0;
  for (const gap of report.gaps) {
    if (typeof gap.gapId !== "string" || gap.gapId.length === 0) {
      return worldUxRefused<HudPanel<HudEvidenceData>>(
        "hud",
        "contract-mismatch",
        `evidence: report ${report.reportId} carries a gap without a gapId`,
      );
    }
    if (gap.remediationTask.status === "open") {
      openTasks += 1;
    }
    gaps.push(deepFreeze({
      gapId: gap.gapId,
      requirementId: gap.requirementId,
      gapKind: gap.kind,
      detail: gap.detail,
    }));
  }
  return {
    ok: true,
    value: populatedPanel("evidence", deepFreeze({
      reportId: report.reportId,
      problemId: report.problemId,
      readinessVerdict: report.verdict,
      gapCount: gaps.length,
      requirementCount: report.perRequirement.length,
      openRemediationTaskCount: openTasks,
      gaps,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* CONSTRAINTS — the governed constraints observed in scope            */
/* ------------------------------------------------------------------ */

/** The governed constraint kinds — a CLOSED vocabulary. */
export const HUD_CONSTRAINT_KINDS = [
  "evidence-requirement",
  "dimension",
  "material",
  "cost",
  "client",
  "regulatory",
] as const;
export type HudConstraintKind = (typeof HUD_CONSTRAINT_KINDS)[number];

/** Type guard: a constraint kind from the closed set. */
export function isHudConstraintKind(
  value: unknown,
): value is HudConstraintKind {
  return (
    typeof value === "string" &&
    (HUD_CONSTRAINT_KINDS as readonly string[]).includes(value)
  );
}

/** The constraint source lanes — a CLOSED vocabulary. */
export const HUD_CONSTRAINT_SOURCE_LANES = [
  "layer1-declared",
  "layer2-context",
  "layer3-what-if",
] as const;
export type HudConstraintSourceLane =
  (typeof HUD_CONSTRAINT_SOURCE_LANES)[number];

/** Type guard: a constraint source lane from the closed set. */
export function isHudConstraintSourceLane(
  value: unknown,
): value is HudConstraintSourceLane {
  return (
    typeof value === "string" &&
    (HUD_CONSTRAINT_SOURCE_LANES as readonly string[]).includes(value)
  );
}

/**
 * One governed constraint observation — the wiring derives these from
 * REAL lane records (never invented here): the P2 case-context
 * requirements, the P3 what-if deviation verdicts and the P1 declared
 * tolerances. The panel validates each observation fail-closed and
 * presents it verbatim.
 */
export interface HudConstraintObservation {
  readonly constraintId: string;
  readonly kind: HudConstraintKind;
  readonly statement: string;
  readonly sourceLane: HudConstraintSourceLane;
  /** The lane record this observation cites (never null in practice). */
  readonly sourceRef: string | null;
}

/** The CONSTRAINTS panel data. */
export interface HudConstraintsData {
  readonly constraints: readonly HudConstraintObservation[];
  readonly constraintCount: number;
}

/** The CONSTRAINTS panel input. */
export interface HudConstraintsInput {
  readonly observations: readonly HudConstraintObservation[] | null;
}

/**
 * Project the CONSTRAINTS panel. EMPTY (honest note) when no governed
 * constraint is observed in scope — a world without constraints is an
 * honest state, never fabricated filler.
 */
export function projectConstraintsPanel(
  input: HudConstraintsInput,
): WorldUxOutcome<HudPanel<HudConstraintsData>> {
  if (input.observations === null || input.observations.length === 0) {
    return {
      ok: true,
      value: emptyPanel(
        "constraints",
        "no governed constraint is observed in this station scope",
      ),
    };
  }
  const seen = new Set<string>();
  const constraints: HudConstraintObservation[] = [];
  for (const observation of input.observations) {
    if (
      typeof observation.constraintId !== "string" ||
      observation.constraintId.length === 0
    ) {
      return worldUxRefused<HudPanel<HudConstraintsData>>(
        "hud",
        "contract-mismatch",
        "constraints: every observation must carry a non-empty constraintId",
      );
    }
    if (seen.has(observation.constraintId)) {
      return worldUxRefused<HudPanel<HudConstraintsData>>(
        "hud",
        "contract-mismatch",
        `constraints: duplicate constraintId ${observation.constraintId}`,
      );
    }
    seen.add(observation.constraintId);
    if (!isHudConstraintKind(observation.kind)) {
      return worldUxRefused<HudPanel<HudConstraintsData>>(
        "hud",
        "contract-mismatch",
        `constraints: ${observation.constraintId} kind must be from the closed vocabulary`,
      );
    }
    if (!isHudConstraintSourceLane(observation.sourceLane)) {
      return worldUxRefused<HudPanel<HudConstraintsData>>(
        "hud",
        "contract-mismatch",
        `constraints: ${observation.constraintId} sourceLane must be from the closed vocabulary`,
      );
    }
    if (
      typeof observation.statement !== "string" ||
      observation.statement.length === 0
    ) {
      return worldUxRefused<HudPanel<HudConstraintsData>>(
        "hud",
        "contract-mismatch",
        `constraints: ${observation.constraintId} statement must be a non-empty string`,
      );
    }
    constraints.push(deepFreeze(observation));
  }
  constraints.sort((a, b) =>
    a.constraintId < b.constraintId ? -1 : a.constraintId > b.constraintId ? 1 : 0,
  );
  return {
    ok: true,
    value: populatedPanel("constraints", deepFreeze({
      constraints,
      constraintCount: constraints.length,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* AGENT — the active specialist / bounded action                       */
/* ------------------------------------------------------------------ */

/** The operator summary (the who of the bounded action). */
export interface HudOperatorSummary {
  readonly operatorId: string;
  readonly role: string;
}

/** One bounded-action summary (verbatim citations, HUD-shaped). */
export interface HudBoundedActionSummary {
  readonly actionId: string;
  readonly actionKind: string;
  readonly status: string;
  readonly ownerActorId: string;
}

/** The AGENT panel data. */
export interface HudAgentData {
  readonly activeOperator: HudOperatorSummary | null;
  /**
   * Structural: the BOUNDED_AGENT role proposes commands, never
   * decides engineering outcomes (the P3 NL-substrate law, cited by
   * the panel — the UI never renders agent authority it does not have).
   */
  readonly agentProposesNeverDecides: true;
  readonly openActionCount: number;
  readonly openActions: readonly HudBoundedActionSummary[];
}

/** The AGENT panel input. */
export interface HudAgentInput {
  readonly activeOperator: HudOperatorSummary | null;
  readonly actions: readonly ProblemAction[] | null;
}

/**
 * Project the AGENT panel: the active operator + the open bounded
 * actions. EMPTY when no operator is active and no action is open.
 */
export function projectAgentPanel(
  input: HudAgentInput,
): WorldUxOutcome<HudPanel<HudAgentData>> {
  if (input.activeOperator !== null) {
    if (
      typeof input.activeOperator.operatorId !== "string" ||
      input.activeOperator.operatorId.length === 0 ||
      typeof input.activeOperator.role !== "string" ||
      input.activeOperator.role.length === 0
    ) {
      return worldUxRefused<HudPanel<HudAgentData>>(
        "hud",
        "contract-mismatch",
        "agent: activeOperator must carry a non-empty operatorId and role",
      );
    }
  }
  const openActions: HudBoundedActionSummary[] = [];
  if (input.actions !== null) {
    for (const action of input.actions) {
      if (typeof action.actionId !== "string" || action.actionId.length === 0) {
        return worldUxRefused<HudPanel<HudAgentData>>(
          "hud",
          "contract-mismatch",
          "agent: every action must carry a non-empty actionId",
        );
      }
      if (
        typeof action.ownership.owner.actorId !== "string" ||
        action.ownership.owner.actorId.length === 0
      ) {
        return worldUxRefused<HudPanel<HudAgentData>>(
          "hud",
          "contract-mismatch",
          `agent: action ${action.actionId} must carry an owned actor id (the ownership law)`,
        );
      }
      if (action.status === "open" || action.status === "in_progress") {
        openActions.push(deepFreeze({
          actionId: action.actionId,
          actionKind: action.actionKind,
          status: action.status,
          ownerActorId: action.ownership.owner.actorId,
        }));
      }
    }
  }
  if (input.activeOperator === null && openActions.length === 0) {
    return {
      ok: true,
      value: emptyPanel(
        "agent",
        "no specialist operator is active and no bounded action is open in this scope",
      ),
    };
  }
  return {
    ok: true,
    value: populatedPanel("agent", deepFreeze({
      activeOperator: input.activeOperator,
      agentProposesNeverDecides: true as const,
      openActionCount: openActions.length,
      openActions,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* VALIDATION — the current solution status                             */
/* ------------------------------------------------------------------ */

/** The VALIDATION panel data. */
export interface HudValidationData {
  readonly checkGateId: string | null;
  readonly problemId: string | null;
  readonly gateVerdict: string | null;
  readonly engineOwnedCheckCount: number;
  readonly advisoryCheckCount: number;
  readonly failureCount: number;
  readonly gatedAt: string | null;
  /** The P3 replay-ledger verification of the solution history. */
  readonly replayVerified: boolean | null;
}

/** The VALIDATION panel input. */
export interface HudValidationInput {
  readonly checkGate: DeterministicCheckGateVerdict | null;
  /** The P3 lane run's REPLAY.verified, or null when no P3 run is bound. */
  readonly replayVerified: boolean | null;
}

/**
 * Project the VALIDATION panel: the P2 deterministic check gate + the
 * P3 replay verification. EMPTY when neither source is bound.
 */
export function projectValidationPanel(
  input: HudValidationInput,
): WorldUxOutcome<HudPanel<HudValidationData>> {
  if (input.checkGate !== null) {
    const gate = input.checkGate;
    if (typeof gate.gateId !== "string" || gate.gateId.length === 0) {
      return worldUxRefused<HudPanel<HudValidationData>>(
        "hud",
        "contract-mismatch",
        "validation: checkGate.gateId must be a non-empty string",
      );
    }
    if (typeof gate.verdict !== "string" || gate.verdict.length === 0) {
      return worldUxRefused<HudPanel<HudValidationData>>(
        "hud",
        "contract-mismatch",
        `validation: check gate ${gate.gateId} verdict must be a non-empty vocabulary value`,
      );
    }
    if (!isDeclaredInstant(gate.gatedAt)) {
      return worldUxRefused<HudPanel<HudValidationData>>(
        "hud",
        "contract-mismatch",
        `validation: check gate ${gate.gateId} gatedAt must be a declared ISO-8601 UTC instant`,
      );
    }
  }
  if (input.checkGate === null && input.replayVerified === null) {
    return {
      ok: true,
      value: emptyPanel(
        "validation",
        "no deterministic check gate and no solution replay is bound to this scope",
      ),
    };
  }
  const gate = input.checkGate;
  return {
    ok: true,
    value: populatedPanel("validation", deepFreeze({
      checkGateId: gate === null ? null : gate.gateId,
      problemId: gate === null ? null : gate.problemId,
      gateVerdict: gate === null ? null : gate.verdict,
      engineOwnedCheckCount: gate === null ? 0 : gate.engineOwnedCheckIds.length,
      advisoryCheckCount: gate === null ? 0 : gate.advisoryCheckIds.length,
      failureCount: gate === null ? 0 : gate.failures.length,
      gatedAt: gate === null ? null : gate.gatedAt,
      replayVerified: input.replayVerified,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* COST/BOQ — the live quantity consequence (a VIEW, never authority)   */
/* ------------------------------------------------------------------ */

/** One projected consequence line, HUD-shaped (verbatim citations). */
export interface HudBoqLine {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly itemDescription: string;
  readonly direction: string;
  readonly value: number;
  readonly unit: string;
  readonly calculationRef: string;
  readonly contributingOperationIds: readonly string[];
}

/** The COST/BOQ panel data. */
export interface HudCostBoqData {
  readonly projectionId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  /** ALWAYS "PROPOSED" — the epistemic law, carried structurally. */
  readonly epistemicClass: "PROPOSED";
  readonly baselineBoqId: string | null;
  readonly lineCount: number;
  readonly lines: readonly HudBoqLine[];
  readonly operationsWithoutQuantityEffects: readonly string[];
}

/** The COST/BOQ panel input. */
export interface HudCostBoqInput {
  readonly projection: QuantityConsequenceProjection | null;
}

/**
 * Project the COST/BOQ panel from the P3 live quantity-consequence
 * projection. The BOQ Graph stays the ONLY quantity authority: this
 * panel is a VIEW whose every value is a verbatim citation of the
 * projection (values, units and calculation references included).
 */
export function projectCostBoqPanel(
  input: HudCostBoqInput,
): WorldUxOutcome<HudPanel<HudCostBoqData>> {
  if (input.projection === null) {
    return {
      ok: true,
      value: emptyPanel(
        "cost-boq",
        "no proposed operation is selected — no live quantity consequence is in view",
      ),
    };
  }
  const projection = input.projection;
  if (
    typeof projection.projectionId !== "string" ||
    projection.projectionId.length === 0
  ) {
    return worldUxRefused<HudPanel<HudCostBoqData>>(
      "hud",
      "contract-mismatch",
      "cost-boq: projection.projectionId must be a non-empty string",
    );
  }
  if (projection.epistemicClass !== "PROPOSED") {
    return worldUxRefused<HudPanel<HudCostBoqData>>(
      "hud",
      "operation-semantic-failure",
      `cost-boq: projection ${projection.projectionId} epistemicClass must be PROPOSED (the epistemic law — never upgraded)`,
    );
  }
  const lines: HudBoqLine[] = [];
  for (const line of projection.lines) {
    if (typeof line.sectionId !== "string" || line.sectionId.length === 0) {
      return worldUxRefused<HudPanel<HudCostBoqData>>(
        "hud",
        "contract-mismatch",
        `cost-boq: projection ${projection.projectionId} carries a line without a sectionId`,
      );
    }
    if (!Number.isFinite(line.value)) {
      return worldUxRefused<HudPanel<HudCostBoqData>>(
        "hud",
        "contract-mismatch",
        `cost-boq: projection ${projection.projectionId} line ${line.sectionId} value must be finite`,
      );
    }
    lines.push(deepFreeze({
      sectionId: line.sectionId,
      sectionTitle: line.sectionTitle,
      itemDescription: line.itemDescription,
      direction: line.direction,
      value: line.value,
      unit: line.unit,
      calculationRef: line.calculationRef,
      contributingOperationIds: line.contributingOperationIds,
    }));
  }
  return {
    ok: true,
    value: populatedPanel("cost-boq", deepFreeze({
      projectionId: projection.projectionId,
      solutionId: projection.solutionId,
      versionNumber: projection.versionNumber,
      epistemicClass: "PROPOSED" as const,
      baselineBoqId: projection.baselineBoqId,
      lineCount: lines.length,
      lines,
      operationsWithoutQuantityEffects: projection.operationsWithoutQuantityEffects,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* TIMELINE — the optional execution sequence / 4D view                */
/* ------------------------------------------------------------------ */

/** One playback phase summary (the 4D view, HUD-shaped). */
export interface HudTimelinePhase {
  readonly phase: string | null;
  readonly activeOperationIds: readonly string[];
  readonly stateIndices: readonly number[];
}

/** The TIMELINE panel data. */
export interface HudTimelineData {
  readonly trajectoryId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly makespanHours: number;
  readonly activityCount: number;
  readonly phaseCount: number;
  readonly phases: readonly HudTimelinePhase[];
}

/** The TIMELINE panel input. */
export interface HudTimelineInput {
  readonly sequence: SequencedExecution | null;
}

/**
 * Project the TIMELINE panel from the P3 sequencing playback view.
 * EMPTY when no execution sequence is bound (the panel is OPTIONAL by
 * the handoff — its absence is an honest state).
 */
export function projectTimelinePanel(
  input: HudTimelineInput,
): WorldUxOutcome<HudPanel<HudTimelineData>> {
  if (input.sequence === null) {
    return {
      ok: true,
      value: emptyPanel(
        "timeline",
        "no execution sequence is bound to this station scope",
      ),
    };
  }
  const sequence = input.sequence;
  const trajectory = sequence.trajectory;
  if (
    typeof trajectory.trajectoryId !== "string" ||
    trajectory.trajectoryId.length === 0
  ) {
    return worldUxRefused<HudPanel<HudTimelineData>>(
      "hud",
      "contract-mismatch",
      "timeline: trajectory.trajectoryId must be a non-empty string",
    );
  }
  if (!Number.isFinite(trajectory.makespanHours)) {
    return worldUxRefused<HudPanel<HudTimelineData>>(
      "hud",
      "contract-mismatch",
      `timeline: trajectory ${trajectory.trajectoryId} makespanHours must be finite`,
    );
  }
  const phases: HudTimelinePhase[] = sequence.playbackPhases.map((phase) =>
    deepFreeze({
      phase: phase.phase,
      activeOperationIds: phase.activeOperationIds,
      stateIndices: phase.stateIndices,
    }),
  );
  return {
    ok: true,
    value: populatedPanel("timeline", deepFreeze({
      trajectoryId: trajectory.trajectoryId,
      solutionId: sequence.solutionId,
      versionNumber: sequence.versionNumber,
      makespanHours: trajectory.makespanHours,
      activityCount: trajectory.activities.length,
      phaseCount: phases.length,
      phases,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The assembled HUD model                                              */
/* ------------------------------------------------------------------ */

/** The complete HUD assembly input (what the wiring supplies). */
export interface HudAssemblyInput {
  readonly objective: HudObjectiveInput;
  readonly evidence: HudEvidenceInput;
  readonly constraints: HudConstraintsInput;
  readonly agent: HudAgentInput;
  readonly validation: HudValidationInput;
  readonly costBoq: HudCostBoqInput;
  readonly timeline: HudTimelineInput;
}

/** The complete HUD model: all seven panels, one typed field each. */
export interface HudModel {
  readonly objective: HudPanel<HudObjectiveData>;
  readonly evidence: HudPanel<HudEvidenceData>;
  readonly constraints: HudPanel<HudConstraintsData>;
  readonly agent: HudPanel<HudAgentData>;
  readonly validation: HudPanel<HudValidationData>;
  readonly costBoq: HudPanel<HudCostBoqData>;
  readonly timeline: HudPanel<HudTimelineData>;
}

/** One panel's chrome summary (the iteration view for renderers). */
export interface HudPanelSummary {
  readonly panelId: HudPanelId;
  readonly title: string;
  readonly contentState: HudContentState;
}

/** The chrome summaries in the canonical panel order. PURE. */
export function hudPanelSummaries(model: HudModel): readonly HudPanelSummary[] {
  return HUD_PANEL_ORDER.map((panelId) => {
    const panel =
      panelId === "cost-boq" ? model.costBoq : model[panelId];
    return {
      panelId,
      title: panel.title,
      contentState: panel.contentState,
    };
  });
}

/**
 * Assemble the complete HUD: all seven panels projected in the
 * canonical order. Fail-closed: any panel's typed refusal refuses the
 * whole assembly (never a partial HUD — the station shows the typed
 * failure instead of guessing). PURE + DETERMINISTIC.
 */
export function assembleHud(input: HudAssemblyInput): WorldUxOutcome<HudModel> {
  const objective = projectObjectivePanel(input.objective);
  if (!objective.ok) {
    return objective;
  }
  const evidence = projectEvidencePanel(input.evidence);
  if (!evidence.ok) {
    return evidence;
  }
  const constraints = projectConstraintsPanel(input.constraints);
  if (!constraints.ok) {
    return constraints;
  }
  const agent = projectAgentPanel(input.agent);
  if (!agent.ok) {
    return agent;
  }
  const validation = projectValidationPanel(input.validation);
  if (!validation.ok) {
    return validation;
  }
  const costBoq = projectCostBoqPanel(input.costBoq);
  if (!costBoq.ok) {
    return costBoq;
  }
  const timeline = projectTimelinePanel(input.timeline);
  if (!timeline.ok) {
    return timeline;
  }
  return {
    ok: true,
    value: deepFreeze({
      objective: objective.value,
      evidence: evidence.value,
      constraints: constraints.value,
      agent: agent.value,
      validation: validation.value,
      costBoq: costBoq.value,
      timeline: timeline.value,
    }),
  };
}

export type { FailureKind };
