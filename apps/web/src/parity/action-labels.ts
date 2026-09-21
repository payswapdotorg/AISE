/**
 * PROD-018 — the CANONICAL ACTION-Label MODEL (pure logic).
 *
 * Terminology normalization across the composed product: the FOUR
 * CANONICAL ACTIONS of the parity journey —
 *
 *   Capture → Investigate → Build solution → Review outcome
 *
 * consistently label entry points, navigation and next-step suggestions
 * (the competitor simulation's task-first lesson: the front door speaks
 * the journey, not the module topology). The mapping is a PROJECTION over
 * RECORDED vocabulary — never a reinterpretation:
 *
 *  - the contract's advisory `TASK_TYPES` map to their canonical action
 *    (field-capture → Capture; evidence/boq/case review → Investigate;
 *    intervention-review/solution-authoring → Build solution;
 *    outcome-comparison → Review outcome). `project-administration` is
 *    honestly NOT one of the four engineering actions and maps to no
 *    canonical action (rendered verbatim, never shoehorned);
 *  - the server's NextBestAction kinds map through the same projection
 *    with an honest fallback: an unknown kind renders verbatim under the
 *    explicit "no canonical action recorded" state — never a guess;
 *  - AISE's DELIBERATE differentiated vocabulary (SiteTwin, BOQ Lens,
 *    Engineering Case, Intervention Studio — the surface names) stays
 *    untouched: the canonical actions label the JOURNEY, the surface
 *    names stay the domain language.
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO.
 */

import { formatRoute } from "../app/router";
import type { Route } from "../app/router";
import type { NextBestAction, EvidenceSummary } from "../app/task-contract";
import type { TaskIntent } from "@aise/adapter-contract";

/* ------------------------------------------------------------------ */
/* The four canonical actions                                          */
/* ------------------------------------------------------------------ */

/** The canonical action ids (the parity journey's four verbs, in order). */
export type CanonicalActionId = "capture" | "investigate" | "build-solution" | "review-outcome";

/** One canonical action's static definition (label + route projection). */
export interface CanonicalActionDefinition {
  readonly action: CanonicalActionId;
  readonly label: string;
  /** One-line statement of what the action does in the journey. */
  readonly oneLiner: string;
  /** The surface the action opens (the app's real routes — no second nav). */
  readonly routeName: NonNullable<Route["name"]> & string;
  readonly href: string;
  /** The record classes this step's honest states read from. */
  readonly honestStates: string;
}

/** The four canonical actions (frozen data, journey order). */
export const CANONICAL_ACTIONS: readonly CanonicalActionDefinition[] = Object.freeze([
  {
    action: "capture",
    label: "Capture",
    oneLiner: "Bring field evidence in — photos, scans, documents, measurements.",
    routeName: "sitetwin",
    href: "#/projects",
    honestStates: "resumable/offline capture is the mobile adapter's field journey; the blocked states name the depth-capable device or specialist instrument escalation",
  },
  {
    action: "investigate",
    label: "Investigate",
    oneLiner: "Understand what the evidence states — cases, quantities, gaps.",
    routeName: "case",
    href: "#/projects",
    honestStates: "observations, hypotheses and declared missing evidence stay separate; uncertainty and provenance render verbatim",
  },
  {
    action: "build-solution",
    label: "Build solution",
    oneLiner: "Compose the proposed intervention — states, quantities, costs.",
    routeName: "intervention",
    href: "#/projects",
    honestStates: "every layer is a PROPOSED projection over the pinned baseline — never observed reality",
  },
  {
    action: "review-outcome",
    label: "Review outcome",
    oneLiner: "See what executed work changed — evidence, comparison, outcomes.",
    routeName: "outcomes",
    href: "#/projects",
    honestStates: "outcomes are OBSERVED only with post-work evidence; before/after pairs state their recorded basis",
  },
] as const);

/** The canonical action of one id (null = unknown id — never a guess). */
export function canonicalAction(
  action: string,
): CanonicalActionDefinition | null {
  return CANONICAL_ACTIONS.find((entry) => entry.action === action) ?? null;
}

/** The canonical action's route for a concrete project (the real router). */
export function canonicalActionRoute(
  action: CanonicalActionDefinition,
  projectId: string,
): Route {
  switch (action.routeName) {
    case "sitetwin":
      return { name: "sitetwin", projectId };
    case "case":
      return { name: "case", projectId };
    case "intervention":
      return { name: "intervention", projectId, query: {} };
    case "outcomes":
      return { name: "outcomes", projectId };
    default:
      // The frozen table only carries per-project surface names; the
      // exhaustiveness is pinned by tests.
      return { name: "project", projectId };
  }
}

/** The canonical action's href for a concrete project. */
export function canonicalActionHref(action: CanonicalActionDefinition, projectId: string): string {
  return formatRoute(canonicalActionRoute(action, projectId));
}

/* ------------------------------------------------------------------ */
/* Vocabulary normalization (recorded vocabulary → canonical action)    */
/* ------------------------------------------------------------------ */

/**
 * The advisory task-type → canonical-action projection. The contract's
 * `TASK_TYPES` are an OPEN vocabulary: the mapping covers the committed
 * advisory members; an unknown value maps to no canonical action (the
 * caller renders it verbatim with the honest state — never a guess).
 */
const TASK_TYPE_TO_ACTION: Readonly<Record<string, CanonicalActionId>> = Object.freeze({
  "field-capture": "capture",
  "evidence-review": "investigate",
  "boq-inspection": "investigate",
  "engineering-case-review": "investigate",
  "intervention-review": "build-solution",
  "solution-authoring": "build-solution",
  "outcome-comparison": "review-outcome",
});

/**
 * The next-best-action kind → canonical-action projection over the kinds
 * the committed corpus and deployments record (`capture-evidence` and the
 * review/comparison families). Unknown kinds map to no canonical action.
 */
const NBA_KIND_TO_ACTION: Readonly<Record<string, CanonicalActionId>> = Object.freeze({
  "capture-evidence": "capture",
  "submit-evidence": "capture",
  "review-evidence": "investigate",
  "investigate-case": "investigate",
  "inspect-boq": "investigate",
  "review-intervention": "build-solution",
  "author-solution": "build-solution",
  "record-execution": "review-outcome",
  "record-outcome": "review-outcome",
  "compare-outcome": "review-outcome",
});

/** The normalization outcome: a canonical action, or the honest non-match. */
export type ActionNormalization =
  | { readonly kind: "canonical"; readonly action: CanonicalActionDefinition }
  | {
      readonly kind: "no-canonical-action";
      /** The verbatim term that carries no canonical action mapping. */
      readonly term: string;
      readonly reason: string;
    };

/** Normalize a task type (open vocabulary) to its canonical action. */
export function normalizeTaskTypeAction(taskType: string): ActionNormalization {
  const action = TASK_TYPE_TO_ACTION[taskType];
  if (action !== undefined) {
    const definition = canonicalAction(action);
    if (definition !== null) {
      return { kind: "canonical", action: definition };
    }
  }
  return {
    kind: "no-canonical-action",
    term: taskType,
    reason:
      taskType === "project-administration"
        ? "administration is not one of the four engineering actions of the journey — the task stays itself, verbatim"
        : "this task type carries no recorded canonical-action mapping — it renders verbatim, never shoehorned",
  };
}

/** Normalize a next-best-action kind (open vocabulary) to its canonical action. */
export function normalizeNextBestActionKind(kind: string): ActionNormalization {
  const action = NBA_KIND_TO_ACTION[kind];
  if (action !== undefined) {
    const definition = canonicalAction(action);
    if (definition !== null) {
      return { kind: "canonical", action: definition };
    }
  }
  return {
    kind: "no-canonical-action",
    term: kind,
    reason:
      "this next-best-action kind carries no recorded canonical-action mapping — the server's prompt renders verbatim",
  };
}

/* ------------------------------------------------------------------ */
/* Evidence-gap next actions (the honest gap → action suggestions)     */
/* ------------------------------------------------------------------ */

/** One composed next-action suggestion (honest, gap-derived). */
export interface NextActionSuggestion {
  readonly suggestionId: string;
  /** The canonical action the suggestion belongs to. */
  readonly action: CanonicalActionDefinition;
  /** The honest state: what the records declare missing or weak. */
  readonly state: "gap-missing" | "gap-weak" | "blocked" | "actionable";
  /** The suggestion text (derived from the RECORD's own description). */
  readonly text: string;
  /** The recorded basis (verbatim gap id / action id — never invented). */
  readonly basis: string;
  /** The route the suggestion opens (the app's real router). */
  readonly href: string;
}

/**
 * The composed next-action suggestions for one project's CURRENT task:
 * the server's NextBestAction (verbatim prompt/status; its kind maps to a
 * canonical action) plus — for every evidence gap the EvidenceSummary
 * declares — a Capture suggestion whose text is the RECORD's own
 * description. The suggestions never invent an action the records do not
 * support; a missing NextBestAction or an empty gap list renders as the
 * honest empty state at the panel level.
 */
export function nextActionSuggestions(
  projectId: string,
  evidence: EvidenceSummary | null,
  nextBestAction: NextBestAction | null,
): readonly NextActionSuggestion[] {
  const suggestions: NextActionSuggestion[] = [];
  if (nextBestAction !== null) {
    const normalization = normalizeNextBestActionKind(nextBestAction.kind);
    if (normalization.kind === "canonical") {
      suggestions.push({
        suggestionId: `nba:${nextBestAction.actionId}`,
        action: normalization.action,
        state: nextBestAction.status === "blocked" ? "blocked" : "actionable",
        text: nextBestAction.prompt,
        basis: `the server's NextBestAction ${nextBestAction.actionId} (${nextBestAction.status})`,
        href: canonicalActionHref(normalization.action, projectId),
      });
    }
  }
  for (const gap of evidence?.gaps ?? []) {
    suggestions.push({
      suggestionId: `gap:${gap.gapId}`,
      action: canonicalAction("capture")!,
      state: gap.kind === "MISSING" ? "gap-missing" : "gap-weak",
      text: gap.description,
      basis: `the evidence summary's declared gap ${gap.gapId} (${gap.kind})`,
      href: canonicalActionHref(canonicalAction("capture")!, projectId),
    });
  }
  return suggestions;
}

/* ------------------------------------------------------------------ */
/* The gap → TaskIntent bridge (a typed, inspectable next step)         */
/* ------------------------------------------------------------------ */

/**
 * Author the TYPED TaskIntent that answers one declared evidence gap —
 * the composition layer's evidence-gap next action as the ONE
 * client-authored semantic object (W-R3 discipline: an intent the SERVER
 * validates, plans and answers — never authority). The intent's text
 * quotes the RECORD's own gap description verbatim.
 */
export function taskIntentForEvidenceGap(
  projectId: string,
  gap: EvidenceSummary["gaps"][number],
  taskId: string,
  createdAt: string,
): TaskIntent {
  return {
    contractVersion: "1.0.0",
    taskId,
    taskType: "field-capture",
    intent: `Close the declared ${gap.kind} evidence gap ${gap.gapId}: ${gap.description}`,
    projectRef: projectId,
    targetRefs: [gap.gapId],
    parameters: { gapKind: gap.kind },
    createdAt,
  };
}
