/**
 * The solution-generated BOQ document model (PROD-025).
 *
 * THE GENERATED BOQ IS A NEW, VERSIONED, DERIVED PROJECTION — typed as such:
 *
 *  - `artifactKind` is the LITERAL `"solution-generated-boq"` seal: a
 *    generated BOQ is structurally distinguishable from a SOURCE BOQ (the
 *    BOQ Lens's `BoqRecord`/`BoqDocument` of `backend/api/src/boq/`), not
 *    just documented as different. `isSolutionGeneratedBoq` (verify.ts) is
 *    the type guard; the discrimination tests assert it both ways.
 *  - `epistemicClass` is the LITERAL `"PROPOSED"`: the BOQ describes
 *    PROPOSED work of a proposal solution — it never becomes an observed
 *    statement about reality (the solution domain's seal vocabulary).
 *  - `sourceBoqRef`, when present, references the SOURCE BOQ by IDENTITY
 *    ONLY (import id + media type + byte size — the `BoqRecord` identity
 *    fields). There is no writable handle, no document payload and no
 *    store reference in it: NO CODE PATH can write back into the source
 *    BOQ store through this package (proven by the sabotage tests).
 *  - The document carries NO derivation time (no clock reads — identical
 *    inputs produce identical BOQs; the deterministic `boqId` IS the
 *    derivation identity).
 *
 * Every line carries the full traceability the work order demands: unit,
 * material/activity, the CITED calculation method (the engine's versioned
 * calculationRef + the location of its documented formula — cited, never
 * restated as this package's own authority), the contributing operations
 * with their geometry target refs and resulting proposed state (the
 * solution step), the propagated uncertainty/unresolved assumptions, and
 * the CONTRACT's `SolutionBoqLineTrace` wire object (echoed 1:1 in
 * `traceSet`, so the contract's invariant checkers and bidirectional
 * resolvers apply verbatim).
 */

import type {
  BoqLineContributionKind,
  OperationContribution,
  QuantityDimension,
  QuantityImpactDirection,
  SolutionBoqLineTrace,
  SolutionBoqTraceSet,
  SolutionValidationSnapshot,
  SolutionVersion,
  TargetGeometryRef,
} from "@aise/solution-contract";
import type { QuantityTotal } from "@aise/solution-engine";
import type { Uncertainty } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Source BOQ reference (identity-only, read-only)                      */
/* ------------------------------------------------------------------ */

/**
 * An IDENTITY-ONLY reference from a generated BOQ to the SOURCE BOQ it
 * relates to (if any). The source BOQ — an imported BOQ Lens document —
 * remains a separate source/revision and is NEVER overwritten: this object
 * carries no writable reference, no document payload and no store handle.
 * The field inventory mirrors the source `BoqRecord` identity fields.
 */
export interface SourceBoqReference {
  readonly kind: "source-boq-reference";
  /** The source BOQ's content-address import identity (`BoqRecord.importId`). */
  readonly importId: string;
  /** The source document's media type. */
  readonly mediaType: string;
  /** The source document's byte size. */
  readonly byteSize: number;
}

/* ------------------------------------------------------------------ */
/* Assumptions (uncertainty + unresolved inputs — never silently dropped) */
/* ------------------------------------------------------------------ */

/** Where an assumption entry came from. */
export type SolutionBoqAssumptionOrigin =
  | {
      readonly kind: "validation-check";
      readonly checkId: string;
      readonly result: "fail" | "unknown" | "review-needed";
    }
  | {
      readonly kind: "uncertainty-conflict";
      readonly statedCount: number;
    };

/**
 * One unresolved assumption or uncertainty statement carried into the
 * generated BOQ. Sources: validation-snapshot checks that did not PASS
 * (unknown / review-needed findings — preserved verbatim in `statement`)
 * and conflicting uncertainty statements across a line's contributions.
 * Assumptions are part of the affected lines' identity-stable payload
 * (line identity hashes their ids).
 */
export interface SolutionBoqAssumption {
  /** Deterministic content address (identity.ts `deriveSolutionBoqAssumptionId`). */
  readonly assumptionId: string;
  readonly origin: SolutionBoqAssumptionOrigin;
  /** Deterministic statement carrying the underlying detail VERBATIM. */
  readonly statement: string;
  /** Operations the assumption affects ([] = BOQ-wide). */
  readonly affectedOperationIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Lines                                                                */
/* ------------------------------------------------------------------ */

/** The line's quantity (typed unit + CITED calculation reference). */
export interface SolutionBoqLineQuantity {
  readonly dimension: QuantityDimension;
  /** Sum of the contributing ENGINE quantities (never recomputed from parameters). */
  readonly value: number;
  readonly unit: string;
  /** The ENGINE's versioned calculation reference, cited verbatim. */
  readonly calculationRef: string;
  /** Propagated uncertainty where stated by the engine records (absent = not stated). */
  readonly uncertainty?: Uncertainty;
}

/**
 * One contributing solution step of a line, enriched with the navigation
 * payload: the operation's GEOMETRY TARGET refs + reality node refs (the
 * operation → geometry navigation) and the resulting proposed state (the
 * solution step the operation produces — the same state id that feeds the
 * synchronized 3D/2D/BOQ views).
 */
export interface SolutionBoqLineContribution {
  readonly operationId: string;
  readonly operationIndex: number;
  readonly contributionKind: BoqLineContributionKind;
  /** The ENGINE quantity value this operation contributed to the line. */
  readonly operationValue: number;
  /** The operation target's geometry references (read-only reality anchors). */
  readonly geometryRefs: readonly TargetGeometryRef[];
  /** The operation target's Reality-Graph node references (read-only). */
  readonly nodeRefs: readonly string[];
  /** The proposed state this operation's application produces (states[N]). */
  readonly resultingStateRef: string;
}

/**
 * One generated building BOQ line: the work item (section, element,
 * activity, material), the typed quantity with its unit, the CITED
 * calculation method, the contributing operations and the CONTRACT line
 * trace (echoed — the contract-checkable projection of this line).
 */
export interface SolutionBoqLine {
  /** Deterministic, version-pinned line identity (identity.ts). */
  readonly boqLineId: string;
  /** The CONTRACT's trace identity ({solutionId, versionNumber, boqLineId}). */
  readonly traceId: string;
  /** Building-BOQ section id (the contract's category key or `other-works`). */
  readonly sectionId: string;
  /** Building element label (aligned with the building-element-taxonomy extension). */
  readonly buildingElement: string;
  /** The work activity — the engine operation type (open vocabulary). */
  readonly activity: string;
  /** Whether the work item's quantities are added, removed or changed. */
  readonly direction: QuantityImpactDirection;
  /** Deterministic item description (presentation; excluded from identity). */
  readonly itemDescription: string;
  /** Material name from the operation parameters, verbatim (when stated). */
  readonly material?: string;
  /** The line's unit (explicit — honored from the ENGINE quantity unit). */
  readonly unit: string;
  readonly quantity: SolutionBoqLineQuantity;
  /**
   * The CALCULATION METHOD, CITED from the engine's quantity models:
   * the versioned calculationRef (the engine's own provenance) plus the
   * location of its documented formula. Never restated as this package's
   * own authority — the engine is the single quantity authority.
   */
  readonly calculationMethod: {
    readonly calculationRef: string;
    readonly methodSource: string;
  };
  /** The contributing solution steps (created/modified/removed), by operation order. */
  readonly contributions: readonly SolutionBoqLineContribution[];
  /** Ids of the assumptions affecting this line (identity-stable payload). */
  readonly assumptionRefs: readonly string[];
  /** The CONTRACT's `SolutionBoqLineTrace` wire object (echoed 1:1 in traceSet). */
  readonly trace: SolutionBoqLineTrace;
}

/** One building-BOQ section: the contract category + its lines, in document order. */
export interface SolutionBoqSection {
  readonly sectionId: string;
  readonly title: string;
  readonly lineIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* The document                                                         */
/* ------------------------------------------------------------------ */

/** The derivation identity (WHO derived; excluded from content identities). */
export interface SolutionBoqDerivationRef {
  readonly kind: string;
  readonly version: string;
}

/** The identity echo of the declared validation snapshot the BOQ was generated from. */
export interface SolutionBoqSnapshotEcho {
  readonly snapshotId: string;
  readonly outcome: string;
  readonly inputDigest: string;
  readonly engine: { readonly kind: string; readonly version: string };
  readonly checkSummary: readonly { readonly checkId: string; readonly result: string }[];
}

/**
 * A SOLUTION-GENERATED BOQ: the versioned derived projection of one
 * validated solution version, generated from exactly ONE declared
 * validation snapshot. Deterministic content addressing throughout
 * (`boqId`, line ids, assumption ids, the contract's trace ids); NO
 * derivation time field exists (determinism — no clock).
 */
export interface SolutionBoq {
  /** The typed seal distinguishing a generated BOQ from every source BOQ. */
  readonly artifactKind: "solution-generated-boq";
  /** Deterministic derivation identity (identity.ts `deriveSolutionBoqId`). */
  readonly boqId: string;
  /** The deriver identity (excluded from content identities). */
  readonly derivation: SolutionBoqDerivationRef;
  /** The solution contract family version this document's wire objects speak. */
  readonly contractVersion: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly parentVersionNumber?: number;
  /** The pinned authoritative reality version the solution branches from. */
  readonly baselineRealityVersionId: string;
  /** The proposal seal: generated BOQ work is PROPOSED, never observed reality. */
  readonly epistemicClass: "PROPOSED";
  /** The DECLARED validation snapshot this BOQ was generated from (id). */
  readonly validationSnapshotRef: string;
  /** The declared snapshot's identity echo (outcome, digest, engine, checks). */
  readonly validationSnapshot: SolutionBoqSnapshotEcho;
  /** Identity-only reference to the related SOURCE BOQ, if any (never overwritten). */
  readonly sourceBoqRef?: SourceBoqReference;
  /** The building-element-taxonomy extension the solution's domain declared. */
  readonly elementTaxonomy?: { readonly kind: string; readonly ref: string; readonly version: string };
  /** All operation ids of the version, in order (navigation completeness). */
  readonly operationIds: readonly string[];
  readonly sections: readonly SolutionBoqSection[];
  readonly lines: readonly SolutionBoqLine[];
  readonly assumptions: readonly SolutionBoqAssumption[];
  /** Net totals per (dimension, unit) — ECHOED VERBATIM from the engine inventory. */
  readonly totals: readonly QuantityTotal[];
  /** The CONTRACT's version-pinned trace set (bidirectional navigation surface). */
  readonly traceSet: SolutionBoqTraceSet;
}

/* ------------------------------------------------------------------ */
/* Derivation input                                                     */
/* ------------------------------------------------------------------ */

/**
 * The input of `deriveSolutionBoq`: a solution version (whose operations
 * carry the ENGINE's applied results — effects and derived quantities) plus
 * the DECLARED validation snapshot the BOQ is generated from. The snapshot
 * gate (derive.ts) enforces: identity match, snapshot integrity, certified
 * bytes, non-fail outcome and declaration coherence.
 */
export interface DeriveSolutionBoqInput {
  readonly version: SolutionVersion;
  readonly snapshot: SolutionValidationSnapshot;
  readonly sourceBoqRef?: SourceBoqReference;
}

/** Re-exports for consumers building derivation inputs from operation-module parts. */
export type {
  OperationContribution,
  QuantityDimension,
  QuantityImpactDirection,
  QuantityTotal,
  SolutionBoqLineTrace,
  SolutionBoqTraceSet,
  SolutionValidationSnapshot,
  SolutionVersion,
  TargetGeometryRef,
  Uncertainty,
};
