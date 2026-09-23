/**
 * PROD-024 — the GUARDED BOQ SYNCHRONIZATION SEAM (§4.6 of the work
 * order).
 *
 * The workspace NEVER derives BOQ lines: BOQ derivation, grouping and
 * navigation belong to PROD-025 (the future work item). This module only
 * CONSUMES BOQ-line data when the case context supplies it, through the
 * small `SolutionBoqSyncInput` interface — the future BOQ item can supply
 * the data without any workspace edit. The bidirectional navigation
 * itself resolves through the CONTRACT's own pure functions
 * (`resolveOperationsForLine` / `resolveLinesForOperation` of
 * `@aise/solution-contract` trace.ts) — never a second trace semantics.
 *
 * PROD-031 (the browser-safe cut): the resolvers import from the
 * `@aise/solution-contract/browser` subpath — the crypto-free cut of the
 * contract (the barrel re-exports the node:crypto-dependent identity
 * derivations, which a plain-browser bundle externalizes) — so this seam
 * is part of the browser mount's chunk graph.
 *
 * GUARDED BEHAVIOR:
 *
 *  - no BOQ data in the case context → the honest "none available" pane
 *    (never a crash, never a fabricated line);
 *  - a trace set VERSION-PINNED to another solution version than the one
 *    being viewed → an explicit version-pin notice (the contract pins
 *    every line trace to its producing version — the workspace never
 *    silently re-keys it);
 *  - a matching version → BOQ line ↔ operation/geometry highlights in
 *    both directions, keyed by the contract's trace identities
 *    (boqLineId ↔ operationId).
 */

import {
  resolveLinesForOperation,
  resolveOperationsForLine,
  type SolutionBoqLineTrace,
  type SolutionBoqTraceSet,
} from "../../../../packages/solution-contract/src/browser";
import type { SolutionWorkspaceState } from "./model";

/* ------------------------------------------------------------------ */
/* The seam interface (the future BOQ item supplies the data)           */
/* ------------------------------------------------------------------ */

/**
 * The BOQ data the case context may carry. `SolutionBoqTraceSet` is the
 * CONTRACT's versioned wire object (a derived projection of a VALIDATED
 * solution version — PROD-025's output). The workspace renders it
 * read-only.
 */
export interface SolutionBoqSyncInput {
  readonly kind: "trace-set";
  readonly traceSet: SolutionBoqTraceSet;
}

/* ------------------------------------------------------------------ */
/* The guarded status                                                  */
/* ------------------------------------------------------------------ */

/** What the BOQ pane can honestly show for the viewed version. */
export type BoqPaneStatus =
  | { readonly kind: "none"; readonly detail: string }
  | {
      readonly kind: "version-pinned-elsewhere";
      readonly traceSet: SolutionBoqTraceSet;
      readonly detail: string;
    }
  | { readonly kind: "available"; readonly traceSet: SolutionBoqTraceSet };

/**
 * Resolves the guarded BOQ pane status for the workspace state:
 * none → honest empty; version mismatch → honest pin notice (with the
 * lines still inspectable as pinned history); match → available.
 */
export function boqPaneStatusOf(
  boq: SolutionBoqSyncInput | undefined,
  state: SolutionWorkspaceState,
): BoqPaneStatus {
  if (boq === undefined) {
    return {
      kind: "none",
      detail:
        "No BOQ lines are available for this solution yet — a solution BOQ " +
        "is generated only from a validated solution version (the source " +
        "BOQ, if any, stays a separate document).",
    };
  }
  const traceSet = boq.traceSet;
  if (
    traceSet.solutionId !== state.solutionId ||
    traceSet.versionNumber !== state.versions[state.currentVersionNumber - 1]?.versionNumber
  ) {
    return {
      kind: "version-pinned-elsewhere",
      traceSet,
      detail:
        `This BOQ trace set is pinned to solution '${traceSet.solutionId}' ` +
        `version ${traceSet.versionNumber}; the workspace is viewing ` +
        `'${state.solutionId}' version ${state.currentVersionNumber}. The ` +
        `lines below are pinned history — they are never silently re-keyed ` +
        `to the viewed version.`,
    };
  }
  return { kind: "available", traceSet };
}

/* ------------------------------------------------------------------ */
/* Bidirectional navigation (the CONTRACT's pure resolvers)             */
/* ------------------------------------------------------------------ */

/**
 * BOQ LINE → its contributing operations (the contract's
 * `resolveOperationsForLine`; `undefined` for an unknown line id).
 */
export function operationsForBoqLine(
  boq: SolutionBoqSyncInput | undefined,
  boqLineId: string,
): readonly { readonly operationId: string; readonly operationIndex: number; readonly contributionKind: string }[] | undefined {
  if (boq === undefined) {
    return undefined;
  }
  return resolveOperationsForLine(boq.traceSet, boqLineId);
}

/**
 * OPERATION → the BOQ lines it creates or changes (the contract's
 * `resolveLinesForOperation`, guarded by the seam: `undefined` when no
 * BOQ data is present — an honest "no data", never fabricated lines).
 */
export function resolveBoqForOperation(
  boq: SolutionBoqSyncInput | undefined,
  state: SolutionWorkspaceState,
  operationId: string,
): readonly SolutionBoqLineTrace[] | undefined {
  if (boq === undefined) {
    return undefined;
  }
  const status = boqPaneStatusOf(boq, state);
  if (status.kind === "none") {
    return undefined;
  }
  // Both the pinned-elsewhere and the available statuses resolve lines:
  // the contract's resolution is version-pinned BY CONSTRUCTION (the line
  // traces carry their producing operation ids), and the pane labels the
  // pin honestly.
  return resolveLinesForOperation(boq.traceSet, operationId);
}

/**
 * The highlight set of one BOQ-line selection: the operation ids and the
 * geometry references the line's quantity derives from (viewer join).
 */
export function boqLineHighlightOf(
  boq: SolutionBoqSyncInput | undefined,
  boqLineId: string,
): { readonly operationIds: readonly string[]; readonly geometryRefs: readonly string[] } | undefined {
  if (boq === undefined) {
    return undefined;
  }
  const line = boq.traceSet.lineTraces.find((trace) => trace.boqLineId === boqLineId);
  if (line === undefined) {
    return undefined;
  }
  return {
    operationIds: line.contributingOperations.map((contribution) => contribution.operationId),
    geometryRefs: line.geometryRefs.map((ref) => ref.ref),
  };
}
