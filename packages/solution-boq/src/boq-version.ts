/**
 * Solution BOQ derivation identity (PROD-025).
 *
 * The deriver identity carried by every generated solution BOQ
 * (`SolutionBoq.derivation`) — WHO derived the BOQ, in which version. The
 * derivation identity is deliberately EXCLUDED from the BOQ's content
 * identities (`deriveSolutionBoqId` / `deriveSolutionBoqLineId`): a same-major
 * bump of the deriver must not re-address every generated BOQ ever recorded
 * (the contract's own `contractVersion` exclusion discipline, mirrored).
 */

/** The deterministic solution-BOQ deriver kind. */
export const SOLUTION_BOQ_KIND = "aise-solution-boq";

/** This deriver implementation's version (bump on semantic change). */
export const SOLUTION_BOQ_VERSION = "1.0.0";

/**
 * The versioned calculation-reference scheme of the DERIVATION itself
 * (grouping/aggregation provenance — distinct from the ENGINE's quantity
 * calculationRefs, which the BOQ cites verbatim and never restates).
 */
export function solutionBoqDerivationRef(): string {
  return `${SOLUTION_BOQ_KIND}/derivation/${SOLUTION_BOQ_VERSION}`;
}
