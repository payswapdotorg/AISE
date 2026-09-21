/**
 * Bidirectional BOQ-line ↔ solution-step navigation (PROD-025).
 *
 * THE CONTRACT IS THE RESOLUTION AUTHORITY: both directions resolve through
 * the contract's own pure resolvers over the generated BOQ's embedded
 * `SolutionBoqTraceSet` —
 *
 * ```text
 * BOQ line ──resolveOperationsForLine──► contributing solution steps
 * solution step ──resolveLinesForOperation──► generated/affected BOQ lines
 * ```
 *
 * — and this module ENRICHES the resolved contract answers with the
 * navigation payload carried on the generated lines: each contributing
 * operation's GEOMETRY TARGET refs + reality node refs (operation →
 * geometry) and the resulting proposed state (the solution step the
 * operation produces — the same state id that feeds the synchronized
 * 3D/2D/BOQ views).
 *
 * THE ROUND TRIP CLOSES (asserted by `assertBoqNavigationRoundTrip` and by
 * the contract's own trace fixtures discipline): for every line, resolving
 * its contributions and resolving those operations back MUST include the
 * original line. Unknown ids answer EXPLICITLY (`undefined` for an unknown
 * line/operation id; an EMPTY array for a known operation that contributes
 * to no line — e.g. a purely ordering step — never a silent guess).
 */

import {
  findContribution,
  resolveLinesForOperation,
  resolveOperationsForLine,
} from "@aise/solution-contract";
import type { BoqLineContributionKind, SolutionBoqLineTrace } from "@aise/solution-contract";
import { SolutionBoqError } from "./errors";
import type { SolutionBoq, SolutionBoqLine, SolutionBoqLineContribution } from "./model";

/* ------------------------------------------------------------------ */
/* BOQ line → contributing solution steps                               */
/* ------------------------------------------------------------------ */

/** The navigation answer of one BOQ line (contributions + navigation payload). */
export interface BoqLineOperationNavigation {
  readonly boqLineId: string;
  readonly itemDescription: string;
  readonly contributions: readonly SolutionBoqLineContribution[];
}

/**
 * Navigates a generated BOQ line to its contributing solution steps:
 * resolved through the CONTRACT's `resolveOperationsForLine` over the
 * embedded trace set, enriched with each operation's geometry target refs,
 * reality node refs and resulting proposed state. `undefined` for an
 * unknown line id — explicit, never a silent empty list.
 */
export function navigateLineToOperations(
  boq: SolutionBoq,
  boqLineId: string,
): BoqLineOperationNavigation | undefined {
  const contractContributions = resolveOperationsForLine(boq.traceSet, boqLineId);
  if (contractContributions === undefined) {
    return undefined;
  }
  const line = boq.lines.find((entry) => entry.boqLineId === boqLineId);
  if (line === undefined) {
    throw new SolutionBoqError(
      "internal_invariant",
      `the trace set knows line '${boqLineId}' but the document does not — ` +
        `the generated BOQ is internally inconsistent`,
    );
  }
  assertContributionCoherence(boqLineId, contractContributions, line);
  return {
    boqLineId,
    itemDescription: line.itemDescription,
    contributions: line.contributions.map((contribution) => ({ ...contribution })),
  };
}

/* ------------------------------------------------------------------ */
/* Solution step → generated/affected BOQ lines                         */
/* ------------------------------------------------------------------ */

/** One affected line of an operation, with THIS operation's contribution kind. */
export interface BoqOperationLineEntry {
  readonly line: SolutionBoqLine;
  readonly contributionKind: BoqLineContributionKind;
  readonly operationValue: number;
}

/**
 * Navigates one operation to the generated BOQ lines it creates, modifies
 * or removes quantity from: resolved through the CONTRACT's
 * `resolveLinesForOperation` over the embedded trace set, enriched with the
 * operation's contribution kind per line. `undefined` for an operation id
 * UNKNOWN to the BOQ's version; an EMPTY array for a known operation that
 * contributes to no line (an explicit, honest answer — e.g. a purely
 * ordering/dependency step).
 */
export function navigateOperationToLines(
  boq: SolutionBoq,
  operationId: string,
): readonly BoqOperationLineEntry[] | undefined {
  if (!boq.operationIds.includes(operationId)) {
    return undefined;
  }
  const traces: readonly SolutionBoqLineTrace[] = resolveLinesForOperation(
    boq.traceSet,
    operationId,
  );
  const entries: BoqOperationLineEntry[] = [];
  for (const trace of traces) {
    const line = boq.lines.find((entry) => entry.boqLineId === trace.boqLineId);
    if (line === undefined) {
      throw new SolutionBoqError(
        "internal_invariant",
        `the trace set knows line '${trace.boqLineId}' but the document does ` +
          `not — the generated BOQ is internally inconsistent`,
      );
    }
    const contribution = findContribution(line.trace, operationId);
    if (contribution === undefined) {
      throw new SolutionBoqError(
        "internal_invariant",
        `line '${line.boqLineId}' resolves for operation '${operationId}' but ` +
          `carries no contribution of it — the generated BOQ is internally ` +
          `inconsistent`,
      );
    }
    const rich = line.contributions.find((entry) => entry.operationId === operationId);
    if (rich === undefined) {
      throw new SolutionBoqError(
        "internal_invariant",
        `line '${line.boqLineId}' traces operation '${operationId}' but carries ` +
          `no enriched contribution of it — the generated BOQ is internally ` +
          `inconsistent`,
      );
    }
    entries.push({
      line,
      contributionKind: contribution.contributionKind,
      operationValue: rich.operationValue,
    });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* The round-trip proof                                                 */
/* ------------------------------------------------------------------ */

/**
 * Asserts the bidirectional round trip over a generated BOQ: for EVERY
 * line, resolving its contributions and resolving those operations back
 * must include the original line (version-pinned by the trace set). Throws
 * a typed `SolutionBoqError` on any broken hop — used by verification and
 * the test suites.
 */
export function assertBoqNavigationRoundTrip(boq: SolutionBoq): void {
  for (const line of boq.lines) {
    const contractContributions = resolveOperationsForLine(boq.traceSet, line.boqLineId);
    if (contractContributions === undefined || contractContributions.length === 0) {
      throw new SolutionBoqError(
        "internal_invariant",
        `line '${line.boqLineId}' resolves to no contributing operation`,
      );
    }
    for (const contribution of contractContributions) {
      const back = navigateOperationToLines(boq, contribution.operationId);
      if (back === undefined) {
        throw new SolutionBoqError(
          "internal_invariant",
          `operation '${contribution.operationId}' of line ` +
            `'${line.boqLineId}' is unknown to the BOQ's version`,
        );
      }
      if (!back.some((entry) => entry.line.boqLineId === line.boqLineId)) {
        throw new SolutionBoqError(
          "internal_invariant",
          `round trip broken: line '${line.boqLineId}' → operation ` +
            `'${contribution.operationId}' → lines does not include the ` +
            `original line`,
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Internal coherence                                                   */
/* ------------------------------------------------------------------ */

function assertContributionCoherence(
  boqLineId: string,
  contractContributions: readonly { operationId: string; operationIndex: number; contributionKind: string }[],
  line: SolutionBoqLine,
): void {
  if (contractContributions.length !== line.contributions.length) {
    throw new SolutionBoqError(
      "internal_invariant",
      `line '${boqLineId}' carries ${line.contributions.length} enriched ` +
        `contributions but the contract trace resolves ` +
        `${contractContributions.length} — the generated BOQ is internally ` +
        `inconsistent`,
    );
  }
  for (const contract of contractContributions) {
    const rich = line.contributions.find((entry) => entry.operationId === contract.operationId);
    if (
      rich === undefined ||
      rich.operationIndex !== contract.operationIndex ||
      rich.contributionKind !== contract.contributionKind
    ) {
      throw new SolutionBoqError(
        "internal_invariant",
        `line '${boqLineId}' contribution of operation '${contract.operationId}' ` +
          `disagrees with the contract trace — the generated BOQ is ` +
          `internally inconsistent`,
      );
    }
  }
}
