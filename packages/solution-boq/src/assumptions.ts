/**
 * Uncertainty and unresolved-assumption propagation (PROD-025).
 *
 * THE NEVER-SILENTLY-DROPPED RULE: wherever the ENGINE's recorded outputs
 * or the DECLARED validation snapshot carry uncertainty or unresolved
 * assumptions, they propagate EXPLICITLY into the generated BOQ:
 *
 *  1. VALIDATION CHECKS that did not pass (the snapshot's `unknown` /
 *     `review-needed` findings — a `fail` outcome refuses the whole
 *     derivation, see derive.ts) become assumption entries whose statement
 *     carries the check's deterministic detail VERBATIM. They affect every
 *     line (the checks evaluate the whole version) — each line references
 *     them through `assumptionRefs`, and the assumption inventory is part
 *     of the line's identity-stable payload.
 *
 *  2. UNCERTAINTY stated on the engine's recorded effect quantities (the
 *     contract's optional `TypedQuantity.uncertainty`, carried verbatim —
 *     absent means "not stated", never zero, never fabricated):
 *      - one stated uncertainty on a line's contributions → carried
 *        verbatim on the line's quantity;
 *      - several IDENTICAL statements → carried once;
 *      - CONFLICTING statements → the first stated is carried AND an
 *        `uncertainty-conflict` assumption entry documents every stated
 *        statement (nothing dropped, nothing averaged, nothing invented).
 *
 * All collectors are PURE and DETERMINISTIC.
 */

import type { SolutionValidationSnapshot } from "@aise/solution-contract";
import type { Uncertainty } from "@aise/shared-contracts";
import { deriveSolutionBoqAssumptionId } from "./identity";
import type { SolutionBoqAssumption } from "./model";

/* ------------------------------------------------------------------ */
/* Validation-check assumptions                                         */
/* ------------------------------------------------------------------ */

/**
 * Collects the assumption entries of a snapshot's non-pass checks (unknown
 * / review-needed findings — `fail` outcomes never reach here: the
 * derivation gate refuses a failed snapshot outright). Statement carries
 * the check detail VERBATIM; snapshot check order is deterministic.
 */
export function collectValidationCheckAssumptions(
  snapshot: SolutionValidationSnapshot,
): readonly SolutionBoqAssumption[] {
  const assumptions: SolutionBoqAssumption[] = [];
  for (const check of snapshot.checks) {
    if (check.result === "pass") {
      continue;
    }
    const assumption: SolutionBoqAssumption = {
      assumptionId: "",
      origin: {
        kind: "validation-check",
        checkId: check.checkId,
        result: check.result,
      },
      statement:
        `validation check '${check.checkId}' answered ${check.result} for this solution ` +
        `version — carried unresolved into the generated BOQ: ${check.detail}`,
      affectedOperationIds: [],
    };
    assumptions.push({ ...assumption, assumptionId: deriveSolutionBoqAssumptionId(assumption) });
  }
  return assumptions;
}

/* ------------------------------------------------------------------ */
/* Uncertainty propagation                                              */
/* ------------------------------------------------------------------ */

/** Structural equality of two uncertainty objects (canonical-JSON-stable). */
function sameUncertainty(a: Uncertainty | undefined, b: Uncertainty | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The outcome of propagating a work item's stated uncertainties. */
export interface UncertaintyPropagation {
  /** The uncertainty to carry on the line quantity (undefined = not stated). */
  readonly uncertainty: Uncertainty | undefined;
  /** The conflict assumption to add (undefined = no conflicting statements). */
  readonly conflictAssumption: SolutionBoqAssumption | undefined;
}

/**
 * Propagates the stated uncertainties of one work item's contributions
 * (in contribution order — the engine's operation order). Never silently
 * drops anything: a conflict is documented entry-wise.
 */
export function propagateUncertainty(
  stated: readonly {
    readonly operationId: string;
    readonly operationIndex: number;
    readonly activity: string;
    readonly uncertainty: Uncertainty;
  }[],
): UncertaintyPropagation {
  if (stated.length === 0) {
    return { uncertainty: undefined, conflictAssumption: undefined };
  }
  const first = stated[0]?.uncertainty;
  if (first === undefined) {
    // unreachable (callers pass only stated uncertainties)
    return { uncertainty: undefined, conflictAssumption: undefined };
  }
  const conflicting = stated.filter((entry) => !sameUncertainty(entry.uncertainty, first));
  if (conflicting.length === 0) {
    // every statement identical → carried once, verbatim
    return { uncertainty: first, conflictAssumption: undefined };
  }
  // conflicting statements → carry the first AND document every statement
  const listing = stated
    .map(
      (entry) =>
        `operation ${entry.operationIndex} (${entry.activity}) states ` +
        `${JSON.stringify(entry.uncertainty)}`,
    )
    .join("; ");
  const conflictAssumption: SolutionBoqAssumption = {
    assumptionId: "",
    origin: { kind: "uncertainty-conflict", statedCount: stated.length },
    statement:
      `the line's contributing operations state ${stated.length} uncertainty ` +
      `statements that do not all agree — the line quantity carries the FIRST ` +
      `stated statement verbatim and every stated statement is preserved here: ` +
      `${listing} — nothing is averaged, dropped or invented`,
    affectedOperationIds: [...new Set(stated.map((entry) => entry.operationId))],
  };
  return {
    uncertainty: first,
    conflictAssumption: {
      ...conflictAssumption,
      assumptionId: deriveSolutionBoqAssumptionId(conflictAssumption),
    },
  };
}
