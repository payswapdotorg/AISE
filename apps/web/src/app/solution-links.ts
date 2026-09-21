/**
 * PROD-026 — the SOLUTION COMPOSITION CROSS-LINK MODEL (pure logic).
 *
 * The composition's navigation backbone into the interactive engineering
 * solution workflow, following the PROD-018 parity cross-link conventions:
 *
 *  - CASE → SOLUTION WORKSPACE — the "compose an interactive solution for
 *    this problem" affordance of the Engineering Case surface (a canonical
 *    action: the route target always exists; the BASIS states the recorded
 *    solution-world pin when the project holds one, and the honest
 *    affordance grounding when it does not — the target surface then
 *    renders its genuine empty state, never borrowed data);
 *  - INTERVENTION → SOLUTION — the "compose this proposal as an interactive
 *    solution" affordance of the Intervention Studio surface (the same
 *    canonical-action discipline);
 *  - BOQ LENS LINE → SOLUTION BOQ LINE TRACE — the honest RECORD JOIN: a
 *    lens row's bridge resolves ONLY when a solution-generated BOQ held for
 *    the project REFERENCES the row's source BOQ document by identity
 *    (`sourceBoqRef.importId` — the contract's identity-only reference);
 *    otherwise the explicit unresolved state carries the recorded reason
 *    (never an invented link, never a silent empty).
 *
 * NO SECOND NAVIGATION MODEL: every resolvable target is a real app route
 * (`formatRoute` — the app's one router). Determinism: pure functions; no
 * clock, no randomness, no IO, no React.
 */

import { formatRoute } from "./router";
import { shortId } from "./format";

/* ------------------------------------------------------------------ */
/* Link shapes (the parity cross-link conventions)                      */
/* ------------------------------------------------------------------ */

/** The cross-link kinds the solution composition renders. */
export type SolutionCrossLinkKind =
  | "case-to-solution"
  | "intervention-to-solution"
  | "boq-lens-line-to-solution-trace";

/** A link that resolves to a real app route. */
export interface SolutionCrossLinkRouteTarget {
  readonly kind: "route";
  readonly href: string;
  readonly label: string;
}

/**
 * A link the records cannot resolve: the affordance or join exists but no
 * record answers it here. The reason is stated — never a guess, never a
 * hidden gap.
 */
export interface SolutionCrossLinkUnresolvedTarget {
  readonly kind: "unresolved";
  readonly label: string;
  readonly reason: string;
}

export type SolutionCrossLinkTarget =
  | SolutionCrossLinkRouteTarget
  | SolutionCrossLinkUnresolvedTarget;

/** One composed cross-link (from an entity to a resolvable-or-honest target). */
export interface SolutionCrossLink {
  readonly kind: SolutionCrossLinkKind;
  /** The source entity's stable id (the case id / scenario pin / lens row id). */
  readonly fromId: string;
  /** The source entity's one-line label. */
  readonly fromLabel: string;
  readonly target: SolutionCrossLinkTarget;
  /** The RECORDED reference or canonical-action affordance the link is grounded in. */
  readonly basis: string;
}

/* ------------------------------------------------------------------ */
/* The recorded solution-world pin (the join substrate)                 */
/* ------------------------------------------------------------------ */

/**
 * The recorded interactive-solution world a project holds (the composition's
 * join substrate): the PROD-024 demo wall world on `proj-demo-001`. The
 * pin's `caseId` is the RECORDED reference the case → solution join runs
 * through; other projects hold no world and the joins state that honestly.
 */
export interface RecordedSolutionWorldPin {
  readonly projectId: string;
  readonly solutionId: string;
  readonly caseId: string;
  readonly title: string;
  readonly baselineRealityVersionId: string;
}

/* ------------------------------------------------------------------ */
/* case → solution workspace                                            */
/* ------------------------------------------------------------------ */

/**
 * The cross-link OF ONE ENGINEERING CASE into the interactive solution
 * workflow — the "compose an interactive solution for this problem"
 * affordance. The route target is the project-scoped solution surface
 * carrying the case id verbatim (`?case=`); the BASIS states the recorded
 * solution-world pin when the project holds one for this case, and the
 * honest affordance grounding when it does not.
 */
export function caseToSolutionCrossLink(
  projectId: string,
  caseRef: { readonly caseId: string; readonly title: string },
  worldPin: RecordedSolutionWorldPin | null,
): SolutionCrossLink {
  const href = formatRoute({
    name: "solution",
    projectId,
    query: { case: caseRef.caseId },
  });
  const recorded = worldPin !== null && worldPin.caseId === caseRef.caseId;
  return {
    kind: "case-to-solution",
    fromId: caseRef.caseId,
    fromLabel: `case ${caseRef.caseId} — ${caseRef.title}`,
    target: {
      kind: "route",
      href,
      label: recorded
        ? `open the interactive solution workspace (${worldPin!.solutionId})`
        : "open the interactive solution workflow for this project",
    },
    basis: recorded
      ? `the recorded solution world ${worldPin!.solutionId} pins this case ` +
        `(${caseRef.caseId}) as its engineering problem — the recorded join`
      : "the canonical 'compose an interactive solution' affordance — this " +
        "project holds no recorded solution world pinned to this case yet; " +
        "the target surface renders its honest empty state, never borrowed data",
  };
}

/* ------------------------------------------------------------------ */
/* intervention → solution                                              */
/* ------------------------------------------------------------------ */

/**
 * The cross-link OF THE INTERVENTION STUDIO into the interactive solution
 * workflow — the "compose this proposal as an interactive engineering
 * solution" affordance (the second first-class proposal-authoring workflow
 * of ACR-005). The route target is the project-scoped solution surface; the
 * BASIS states the recorded world pin when held, the affordance otherwise.
 */
export function interventionToSolutionCrossLink(
  projectId: string,
  scenarioRef: { readonly scenarioId: string; readonly title: string } | null,
  worldPin: RecordedSolutionWorldPin | null,
): SolutionCrossLink {
  const href = formatRoute({ name: "solution", projectId, query: {} });
  const fromId = scenarioRef?.scenarioId ?? `project:${projectId}`;
  const fromLabel =
    scenarioRef === null
      ? `the intervention proposals of ${projectId}`
      : `scenario ${scenarioRef.scenarioId} — ${scenarioRef.title}`;
  return {
    kind: "intervention-to-solution",
    fromId,
    fromLabel,
    target: {
      kind: "route",
      href,
      label:
        worldPin === null
          ? "open the interactive solution workflow for this project"
          : `open the interactive solution composition (${worldPin.solutionId})`,
    },
    basis:
      worldPin === null
        ? "the canonical 'compose as an interactive solution' affordance — this " +
          "project holds no recorded solution world; the target surface renders its " +
          "honest empty state"
        : `the recorded solution world ${worldPin.solutionId} of this project — ` +
          `both proposal-authoring workflows compose over the same observed reality discipline`,
  };
}

/* ------------------------------------------------------------------ */
/* BOQ lens line → solution BOQ line trace (the honest record join)     */
/* ------------------------------------------------------------------ */

/** The minimal shape of a generated solution BOQ the join reads. */
export interface GeneratedSolutionBoqRef {
  readonly boqId: string;
  readonly solutionId: string;
  /** The identity-only source BOQ reference (the contract's SourceBoqReference). */
  readonly sourceBoqRef?: { readonly importId: string } | undefined;
}

/**
 * The cross-link OF ONE BOQ LENS LINE into the solution workflow — the
 * honest RECORD JOIN through the generated BOQ's identity-only source
 * reference: the row's bridge resolves ONLY when a solution-generated BOQ
 * held for this project references the row's source BOQ document
 * (`sourceBoqRef.importId`). No row-level trace join is recorded by the
 * current contract (a `SolutionBoqLineTrace` carries contributing
 * operations, quantities and geometry — no source-row reference), so the
 * resolved link opens the solution surface's BOQ line trace panel (the
 * generated lines render there with their full traces); the unresolved
 * state states the recorded reason — never an invented link.
 */
export function boqLensLineToSolutionTraceCrossLink(
  projectId: string,
  item: {
    readonly itemId: string;
    readonly rowNumber: number;
    readonly sectionTitle?: string | null;
  },
  boqImport: { readonly importId: string } | null,
  solutionBoq: GeneratedSolutionBoqRef | null,
): SolutionCrossLink {
  const rowLabel = `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`;
  const referencesThisImport =
    solutionBoq !== null &&
    solutionBoq.sourceBoqRef !== undefined &&
    boqImport !== null &&
    solutionBoq.sourceBoqRef.importId === boqImport.importId;
  if (referencesThisImport && solutionBoq !== null) {
    return {
      kind: "boq-lens-line-to-solution-trace",
      fromId: item.itemId,
      fromLabel: rowLabel,
      target: {
        kind: "route",
        href: formatRoute({ name: "solution", projectId, query: {} }),
        label: `the solution BOQ line traces of ${shortId(solutionBoq.boqId)}`,
      },
      basis:
        `the generated BOQ ${solutionBoq.boqId} references this row's source ` +
        `document by identity (sourceBoqRef ${solutionBoq.sourceBoqRef!.importId}) — ` +
        `the document-level recorded join; no row-level trace join is recorded, ` +
        `so the link opens the generated lines' trace panel`,
    };
  }
  return {
    kind: "boq-lens-line-to-solution-trace",
    fromId: item.itemId,
    fromLabel: rowLabel,
    target: {
      kind: "unresolved",
      label: "the solution BOQ line trace",
      reason:
        solutionBoq === null
          ? "this project holds no solution-generated BOQ — a trace link is never fabricated before a validated solution version generates one"
          : boqImport === null
            ? "the lens input carries no source BOQ import record for this row — the identity-only join has no substrate"
            : `the recorded solution BOQ ${solutionBoq.boqId} references ` +
              `${solutionBoq.sourceBoqRef === undefined ? "no source document" : `source document ${solutionBoq.sourceBoqRef.importId}`} — ` +
              `not this row's import ${boqImport.importId}; the reference stays visible, never re-keyed`,
    },
    basis:
      "the generated BOQ's identity-only source reference (sourceBoqRef) is the only recorded lens-row → solution-trace join",
  };
}
