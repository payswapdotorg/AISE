/**
 * PROD-017 — the task-first browser adapter's JOURNEY MODEL (pure logic).
 *
 * The golden journey of the client-adapter contract's task-first
 * interaction model:
 *
 *   Task intent → current context → known evidence → gaps/blockers →
 *   Next best action → user action → server-authoritative result
 *
 * rendered as the AISE golden journey (open/create project → evidence →
 * understanding → intervention → outcome) over the DECODED contract
 * objects. EVERYTHING HERE IS PRESENTATION over server-owned statements:
 *
 *  - step record summaries are honest field joins of the decoded objects
 *    (the same presentation-only discipline as api.ts's property join) —
 *    nothing is re-derived, re-ranked or invented;
 *  - the next-best-action panel renders the server's prompt, status and
 *    blockers VERBATIM (a blocked NBA is the explicit blocked reason —
 *    never a client-side guess about readiness or sufficiency);
 *  - the negotiation panel renders the shared pure function's outcome and
 *    domain reasons verbatim — capability honesty, never a readiness
 *    statement (negotiation changes capture method/operator burden, never
 *    the truth standard);
 *  - the authorization panel renders the server's granted actions and
 *    EVERY typed denial with its reason code (W-R1) — denials are never
 *    swallowed, never summarized into a generic failure;
 *  - the `unknown` discipline: a absent record renders the explicit empty
 *    state (`absent`), an undetermined negotiation renders `unknown` —
 *    never conflated with `unsupported` or `unavailable`.
 *
 * The GOLDEN JOURNEY ROUTES are the app's real entrypoints (router.ts
 * route names — no second navigation model): the task trace drives these.
 *
 * Determinism: pure functions of their inputs; no clock, no randomness,
 * no IO, no React.
 */

import {
  INTERACTION_MODES,
  type CapabilityNegotiation,
} from "@aise/adapter-contract";
import type {
  AuthorizationContext,
  BOQContext,
  EngineeringCaseSummary,
  EvidenceSummary,
  InterventionScenarioSummary,
  NextBestAction,
  OperationResult,
  OutcomeSummary,
  ProjectContext,
  RealitySummary,
  TaskFlowBundle,
} from "./task-contract";
import { negotiateBrowserTask } from "./adapter-profile";
import { formatRoute, type Route } from "./router";
import { plural } from "./format";

/* ------------------------------------------------------------------ */
/* The golden journey steps                                            */
/* ------------------------------------------------------------------ */

/** The golden journey's step ids (the task-first order, not module-first). */
export type JourneyStepId =
  | "open-project"
  | "inspect-evidence"
  | "diagnose-case"
  | "inspect-boq"
  | "review-intervention"
  | "observe-outcome";

/** One golden-journey step's static definition (label + route projection). */
export interface JourneyStepDefinition {
  readonly step: JourneyStepId;
  readonly label: string;
  readonly hint: string;
  /** The route name the step navigates to (formatted with the project id). */
  readonly route:
    | { readonly name: "projects" }
    | { readonly name: "sitetwin" | "boq-lens" | "case" | "intervention"; readonly projectId: string };
}

/** The golden journey in task-first order (frozen data). */
export const GOLDEN_JOURNEY_STEPS: readonly JourneyStepDefinition[] = Object.freeze([
  {
    step: "open-project",
    label: "Open or create the project",
    hint: "The task always starts in a project — open one or record a new one.",
    route: { name: "projects" },
  },
  {
    step: "inspect-evidence",
    label: "Inspect the SiteTwin and its evidence",
    hint: "Known evidence, its provenance and the gaps the records declare.",
    route: { name: "sitetwin", projectId: "" },
  },
  {
    step: "diagnose-case",
    label: "Diagnose the engineering case",
    hint: "Observations, hypotheses and missing evidence of the open case.",
    route: { name: "case", projectId: "" },
  },
  {
    step: "inspect-boq",
    label: "Understand the BOQ scope",
    hint: "Verbatim source rows, mapping coverage and honest totals.",
    route: { name: "boq-lens", projectId: "" },
  },
  {
    step: "review-intervention",
    label: "Review the proposed intervention",
    hint: "Proposed states — never observed reality — with 2D/3D/BOQ impact.",
    route: { name: "intervention", projectId: "" },
  },
  {
    step: "observe-outcome",
    label: "Observe the outcome",
    hint: "Executed work and OBSERVED post-work outcomes with evidence.",
    route: { name: "case", projectId: "" },
  },
] as const);

/** The route of one journey step for a concrete project (the real router). */
export function journeyStepRoute(step: JourneyStepDefinition, projectId: string): Route {
  if (step.route.name === "projects") {
    return { name: "projects" };
  }
  if (step.route.name === "intervention") {
    return { name: "intervention", projectId, query: {} };
  }
  return { name: step.route.name, projectId };
}

/** The href of one journey step for a concrete project. */
export function journeyStepHref(step: JourneyStepDefinition, projectId: string): string {
  return formatRoute(journeyStepRoute(step, projectId));
}

/* ------------------------------------------------------------------ */
/* Step states (honest presentation joins of verbatim fields)          */
/* ------------------------------------------------------------------ */

/** One journey step's rendered state. */
export interface JourneyStepView {
  readonly step: JourneyStepId;
  readonly label: string;
  readonly hint: string;
  readonly href: string;
  /** The step's record presence — `absent` is the explicit empty state. */
  readonly record: {
    readonly kind: "present" | "absent";
    /** Honest field join of the decoded object (verbatim values only). */
    readonly summary: string;
  };
}

/** The evidence step's summary line (verbatim fields, honest joins). */
function evidenceSummaryLine(evidence: EvidenceSummary): string {
  const gaps = plural(evidence.gaps.length, "declared gap");
  return `${plural(evidence.totalItems, "evidence item")} · ${gaps}`;
}

/** The reality summary line (readiness status carried VERBATIM). */
function realitySummaryLine(reality: RealitySummary): string {
  return `readiness ${reality.readinessStatus} · model v${String(reality.modelVersion)} · ${plural(reality.objectCount, "object")}`;
}

/** The BOQ step's summary line (source-of-record identity carried verbatim). */
function boqSummaryLine(boq: BOQContext): string {
  const source =
    boq.sourceRecordRef === undefined
      ? boq.sourceSystem
      : `${boq.sourceSystem} ${boq.sourceRecordRef}`;
  return `revision ${String(boq.revision)} · ${plural(boq.lineItemCount, "line item")} · source of record: ${source}`;
}

/** The case step's summary line (status carried verbatim). */
function caseSummaryLine(caseSummary: EngineeringCaseSummary): string {
  return `${caseSummary.status} · ${plural(caseSummary.observationCount, "observation")}`;
}

/** The intervention step's summary line (epistemic state carried VERBATIM). */
function scenarioSummaryLine(scenario: InterventionScenarioSummary): string {
  return `v${String(scenario.version)} · ${scenario.epistemicState} · approval ${scenario.approvalState}`;
}

/** The outcome step's summary line (epistemic state carried VERBATIM). */
function outcomeSummaryLine(outcome: OutcomeSummary): string {
  return `${outcome.epistemicState} · ${plural(outcome.postWorkEvidenceContentIds.length, "post-work evidence item")}`;
}

/* ------------------------------------------------------------------ */
/* The next-best-action / authorization / negotiation views             */
/* ------------------------------------------------------------------ */

/** The server's next best action, rendered verbatim. */
export interface NextBestActionView {
  readonly actionId: string;
  readonly taskRef: string;
  readonly kind: string;
  readonly status: "actionable" | "blocked";
  readonly prompt: string;
  readonly blockers: readonly {
    readonly reasonCode: string;
    readonly detail: string;
  }[];
}

/** The server's authorization context, rendered verbatim (W-R1). */
export interface AuthorizationContextView {
  readonly subjectRef: string;
  readonly grantedActions: readonly string[];
  readonly denials: readonly {
    readonly action: string;
    readonly reasonCode: string;
    readonly reasonDetail: string | undefined;
  }[];
  readonly validUntil: string | undefined;
}

/** The platform-honesty negotiation view (never a readiness statement). */
export interface NegotiationView {
  readonly requirementsRef: string;
  readonly taskType: string;
  readonly outcome: CapabilityNegotiation["outcome"];
  readonly domainOutcomes: readonly {
    readonly domain: string;
    readonly outcome: string;
    readonly blocking: boolean;
    readonly reason: string | null;
  }[];
  /** Empty when blocked (the blocked reason must be rendered instead). */
  readonly permittedInteractionModes: readonly string[];
}

/** The assembled task-first view of one project's current task. */
export interface TaskFlowView {
  readonly projectId: string;
  /** The current context (server-stated project identity + role). */
  readonly context: ProjectContext | null;
  readonly contextLine: string | null;
  /** The server's reality readiness statement line (readiness VERBATIM). */
  readonly realityLine: string | null;
  readonly steps: readonly JourneyStepView[];
  readonly nextBestAction: NextBestActionView | null;
  readonly authorization: AuthorizationContextView | null;
  readonly negotiation: NegotiationView | null;
  /** The shared function's negotiation OBJECT (rendered verbatim in the audit). */
  readonly negotiationObject: CapabilityNegotiation | null;
  /** True when the current task is negotiation-blocked on THIS platform. */
  readonly taskBlockedOnThisPlatform: boolean;
}

/** Project the server's NextBestAction into the render view (verbatim). */
export function nextBestActionView(action: NextBestAction): NextBestActionView {
  return {
    actionId: action.actionId,
    taskRef: action.taskRef,
    kind: action.kind,
    status: action.status,
    prompt: action.prompt,
    blockers: action.blockers.map((blocker) => ({
      reasonCode: blocker.reasonCode,
      detail: blocker.detail,
    })),
  };
}

/** Project the server's AuthorizationContext into the render view (W-R1). */
export function authorizationContextView(
  authorization: AuthorizationContext,
): AuthorizationContextView {
  return {
    subjectRef: authorization.subjectRef,
    grantedActions: [...authorization.grantedActions],
    denials: authorization.denials.map((denial) => ({
      action: denial.action,
      reasonCode: denial.reasonCode,
      reasonDetail: denial.reasonDetail,
    })),
    validUntil: authorization.validUntil,
  };
}

/** Project the shared negotiation result into the render view (verbatim). */
export function negotiationView(
  negotiation: CapabilityNegotiation,
  taskType: string,
): NegotiationView {
  return {
    requirementsRef: negotiation.requirementsRef,
    taskType,
    outcome: negotiation.outcome,
    domainOutcomes: negotiation.domainOutcomes.map((domain) => ({
      domain: domain.domain,
      outcome: domain.outcome,
      blocking: domain.blocking,
      reason: domain.reason,
    })),
    permittedInteractionModes: negotiation.permittedInteractionModes.filter((mode) =>
      (INTERACTION_MODES as readonly string[]).includes(mode),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* The assembled view (pure)                                            */
/* ------------------------------------------------------------------ */

/** The context headline (presentation join of verbatim context fields). */
function contextLine(context: ProjectContext): string {
  const source =
    context.sourceSystem === undefined ? "" : ` · synchronized from ${context.sourceSystem}`;
  return `${context.projectName} — your role: ${context.userRole}${source}`;
}

/**
 * Assemble the task-first view of one project's current task from the
 * decoded bundle: journey steps with honest record summaries, the server's
 * next best action (verbatim), the authorization context (W-R1) and the
 * platform negotiation (when the server stated requirements). PURE.
 */
export function taskFlowView(
  bundle: TaskFlowBundle,
  projectId: string,
): TaskFlowView {
  const negotiation =
    bundle.requirements === null
      ? null
      : negotiateBrowserTask(bundle.requirements);
  const steps: JourneyStepView[] = GOLDEN_JOURNEY_STEPS.map((definition) => {
    const href = journeyStepHref(definition, projectId);
    const record = stepRecord(definition.step, bundle);
    return { step: definition.step, label: definition.label, hint: definition.hint, href, record };
  });
  return {
    projectId,
    context: bundle.context,
    contextLine: bundle.context === null ? null : contextLine(bundle.context),
    realityLine: bundle.reality === null ? null : realitySummaryLine(bundle.reality),
    steps,
    nextBestAction:
      bundle.nextBestAction === null ? null : nextBestActionView(bundle.nextBestAction),
    authorization:
      bundle.authorization === null ? null : authorizationContextView(bundle.authorization),
    negotiation:
      negotiation === null || bundle.requirements === null
        ? null
        : negotiationView(negotiation, bundle.requirements.taskType),
    negotiationObject: negotiation,
    taskBlockedOnThisPlatform: negotiation !== null && negotiation.outcome === "blocked",
  };
}

function stepRecord(
  step: JourneyStepId,
  bundle: TaskFlowBundle,
): JourneyStepView["record"] {
  const present = (summary: string): JourneyStepView["record"] => ({
    kind: "present",
    summary,
  });
  const absent: JourneyStepView["record"] = {
    kind: "absent",
    summary: "no record for this project yet",
  };
  switch (step) {
    case "open-project":
      return present("the task always starts in a project");
    case "inspect-evidence":
      return bundle.evidence === null
        ? absent
        : present(evidenceSummaryLine(bundle.evidence));
    case "diagnose-case":
      return bundle.caseSummary === null
        ? absent
        : present(caseSummaryLine(bundle.caseSummary));
    case "inspect-boq":
      return bundle.boq === null ? absent : present(boqSummaryLine(bundle.boq));
    case "review-intervention":
      return bundle.scenario === null
        ? absent
        : present(scenarioSummaryLine(bundle.scenario));
    case "observe-outcome":
      return bundle.outcome === null
        ? absent
        : present(outcomeSummaryLine(bundle.outcome));
  }
}

/* ------------------------------------------------------------------ */
/* The operation-result view (the terminal step, verbatim)              */
/* ------------------------------------------------------------------ */

/** The server-authoritative result of a submitted task intent. */
export interface OperationResultView {
  readonly operationId: string;
  readonly actionRef: string;
  readonly status: OperationResult["status"];
  readonly failure: { readonly code: string; readonly detail: string | undefined } | null;
  readonly resultRefs: readonly string[];
  readonly completedAt: string;
}

/** Project the server's OperationResult into the render view (verbatim). */
export function operationResultView(result: OperationResult): OperationResultView {
  return {
    operationId: result.operationId,
    actionRef: result.actionRef,
    status: result.status,
    failure:
      result.failure === undefined
        ? null
        : { code: result.failure.code, detail: result.failure.detail },
    resultRefs: [...result.resultRefs],
    completedAt: result.completedAt,
  };
}
