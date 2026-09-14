/**
 * AISE-024 — BOQ Lens workspace: STRUCTURAL INPUT MODEL.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant, spec/architecture-lock.md
 * "Authority": UI state is never canonical) ⚠⚠⚠
 *
 * Everything here is READ-ONLY DISPLAY DATA assembled server-side. The BOQ
 * Lens NEVER fetches, NEVER parses cells, NEVER writes back to the BOQ
 * document, the normalized view or the mapping record. All facts arrive in
 * `BoqLensInput`: the verbatim item rows (with their already-parsed numeric
 * cells), the derived interpretation records (AISE-014) and the derived
 * mapping entries (AISE-017).
 *
 * BOUNDARY MATRIX (tools/lib/boundaries.ts): apps may import apps/packages
 * ONLY — apps/web CANNOT import backend/api sources. Therefore the types
 * below are STRUCTURAL MIRRORS of the backend shapes (AISE-014
 * `Interpretation`/`ItemInterpretation` and AISE-017 `MappingEntry`): same
 * field names, same JSON shapes, defined locally. A real backend record
 * serialized over the wire satisfies these types as-is (structural typing);
 * the AUTHORITATIVE generators stay in the backend. This module deliberately
 * imports NOTHING.
 *
 * R8 DISCIPLINE (the acceptance): original source is preserved (`originalText`
 * VERBATIM + cell refs), derived normalization/mappings are explicit (every
 * derived value is rendered marked "derived"), and every material claim the
 * lens renders carries a `data-claim-id` that `traceClaim` resolves back to
 * source cells / interpretation records / mapping records — or to an explicit
 * `[inference: …]` marker. Never a plain ungrounded assertion.
 */

/* ------------------------------------------------------------------ */
/* Interpretation structural mirror (AISE-014 normalization/types.ts)  */
/* ------------------------------------------------------------------ */

export type LensInterpretationField = "description" | "unit" | "concept";

export type LensInterpretationConfidence = "high" | "medium" | "low" | "uncertain";

export const LENS_INTERPRETATION_CONFIDENCES = [
  "high",
  "medium",
  "low",
  "uncertain",
] as const;

export type LensInterpretationMethod =
  | "dictionary_exact"
  | "dictionary_synonym"
  | "abbreviation_expansion"
  | "pattern"
  | "unresolved";

export const LENS_INTERPRETATION_METHODS = [
  "dictionary_exact",
  "dictionary_synonym",
  "abbreviation_expansion",
  "pattern",
  "unresolved",
] as const;

/** One competing reading that was recorded, NOT applied. */
export interface LensInterpretationAlternative {
  readonly code?: string;
  readonly text?: string;
  readonly reason: string;
}

/** The explicit derived interpretation record (structural mirror). */
export interface LensInterpretation {
  readonly field: LensInterpretationField;
  /** VERBATIM source text (spelling/whitespace untouched). */
  readonly originalText: string;
  readonly normalizedText?: string;
  /** Matched construction concept code (descriptions; never guessed). */
  readonly conceptCode?: string;
  /** Matched canonical unit code (units; never guessed). */
  readonly unitCode?: string;
  readonly confidence: LensInterpretationConfidence;
  readonly method: LensInterpretationMethod;
  /** Cell refs with sheet name, e.g. ["Substructure!B12"]. */
  readonly sourceRefs: readonly string[];
  readonly alternatives?: readonly LensInterpretationAlternative[];
  readonly notes?: string;
}

/** One interpreted item row (structural mirror of `ItemInterpretation`). */
export interface LensItemInterpretation {
  readonly sectionTitle: string | null;
  readonly rowNumber: number;
  readonly description: LensInterpretation | null;
  readonly unit: LensInterpretation | null;
}

/* ------------------------------------------------------------------ */
/* Mapping structural mirror (AISE-017 mapping/model.ts)               */
/* ------------------------------------------------------------------ */

export type LensMappingStatus = "mapped" | "ambiguous" | "unmapped";

export const LENS_MAPPING_STATUSES = ["mapped", "ambiguous", "unmapped"] as const;

export type LensMappingConfidence = "high" | "medium" | "low" | "uncertain";

export const LENS_MAPPING_CONFIDENCES = ["high", "medium", "low", "uncertain"] as const;

export type LensMappingMethod =
  | "normalized_concept_match"
  | "location_match"
  | "manual"
  | "unresolved";

export const LENS_MAPPING_METHODS = [
  "normalized_concept_match",
  "location_match",
  "manual",
  "unresolved",
] as const;

/** The BOQ-side anchor of one mapping entry — VERBATIM source identity. */
export interface LensBoqItemRef {
  readonly sectionTitle: string | null;
  readonly rowNumber: number;
  readonly descriptionCellRef: string | null;
  readonly unitCellRef: string | null;
  readonly originalText: string;
}

export interface LensMappingTarget {
  readonly nodeVersionId?: string;
  readonly nodeId: string;
  readonly spacePath?: readonly string[];
  readonly matchNote?: string;
}

export interface LensMappingAlternative {
  readonly targetNodeId: string;
  readonly reason: string;
}

export interface LensMappingProvenance {
  readonly dictionaryVersion?: string;
  readonly normalizerVersion?: string;
  readonly matchedOn?: string;
  readonly recordedAt: string;
}

/** One BOQ row's mapping outcome (structural mirror of `MappingEntry`). */
export interface LensMappingEntry {
  readonly entryId: string;
  readonly boqItem: LensBoqItemRef;
  readonly targets: readonly LensMappingTarget[];
  readonly status: LensMappingStatus;
  readonly confidence: LensMappingConfidence;
  readonly method: LensMappingMethod;
  readonly provenance: LensMappingProvenance;
  readonly alternatives?: readonly LensMappingAlternative[];
  readonly reason?: string;
}

/* ------------------------------------------------------------------ */
/* Lens items + input                                                  */
/* ------------------------------------------------------------------ */

/**
 * One numeric cell AS PARSED UPSTREAM (AISE-011/014 pipeline). The lens does
 * NO parsing: `value` arrives ready; `cellRef` is its source anchor. A null
 * `cellRef` on a present value is a PROVENANCE DEFECT (health check trips).
 */
export interface BoqNumeric {
  readonly cellRef: string | null;
  readonly value: number;
}

/** One BOQ item row with everything the lens renders for it. */
export interface BoqLensItem {
  /** Stable server-assigned row id (e.g. the AISE-017 entry id). */
  readonly itemId: string;
  readonly rowNumber: number;
  readonly sectionTitle: string | null;
  /** VERBATIM description text — source spelling/whitespace untouched (R8). */
  readonly originalText: string;
  readonly descriptionCellRef: string | null;
  readonly unitCellRef: string | null;
  /** VERBATIM unit cell text (null when the unit cell is blank/absent). */
  readonly unitText: string | null;
  /** Currency of this row's rate/amount cells (row-level source fact). */
  readonly currency: string;
  readonly quantity: BoqNumeric | null;
  readonly rate: BoqNumeric | null;
  readonly amount: BoqNumeric | null;
  /** Derived interpretation record (AISE-014) — rendered marked "derived". */
  readonly interpretation?: LensItemInterpretation;
  /** Derived mapping entry (AISE-017) — rendered marked "derived". */
  readonly mapping?: LensMappingEntry;
}

/**
 * EVERYTHING the BOQ Lens renders. `sourceCellRefs` is the server-assembled
 * inventory of non-empty source cells in the imported document — the
 * provenance-resolution universe: every cell ref cited anywhere in the input
 * must be a member, otherwise the health check reports FABRICATED provenance.
 */
export interface BoqLensInput {
  readonly importId: string;
  readonly sourceName: string;
  readonly dictionaryVersion: string | null;
  readonly mappingVersion: number | null;
  readonly sourceCellRefs: readonly string[];
  readonly items: readonly BoqLensItem[];
}

/* ------------------------------------------------------------------ */
/* Traceability (R8 acceptance surface)                                */
/* ------------------------------------------------------------------ */

export type TraceStepKind = "source-cell" | "interpretation-record" | "mapping-record" | "inference";

/**
 * One step of a claim's trace chain: either BOQ evidence (a source cell, an
 * interpretation record, a mapping record) or an EXPLICIT inference marker.
 */
export interface TraceStep {
  readonly kind: TraceStepKind;
  readonly ref: string;
  readonly detail: string;
}

/** The chain `traceClaim(claimId, input)` returns for one rendered claim. */
export interface TraceChain {
  readonly claimId: string;
  readonly claimKind: string;
  readonly summary: string;
  readonly steps: readonly TraceStep[];
  /** True iff at least one step is BOQ evidence (not an inference marker). */
  readonly grounded: boolean;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export type BoqSearchField = "original-text" | "normalized-concept" | "normalized-unit" | "target-location";

export interface BoqSearchResult {
  readonly itemId: string;
  readonly rowNumber: number;
  readonly originalText: string;
  readonly matchedIn: readonly BoqSearchField[];
  /** The item's source cell refs (deterministic order, deduplicated). */
  readonly cellRefs: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Health checks                                                       */
/* ------------------------------------------------------------------ */

export interface BoqHealthStats {
  readonly totalItems: number;
  readonly mapped: number;
  readonly ambiguous: number;
  readonly unmapped: number;
  readonly byMappingConfidence: {
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly uncertain: number;
  };
  readonly conceptsResolved: number;
  readonly conceptsUnresolved: number;
  readonly uncertainInterpretations: number;
  /** MUST be zero on valid inputs — the provenance invariant (R8). */
  readonly claimsWithoutProvenance: number;
  /** Itemized defects (one human-readable string per defect). */
  readonly provenanceDefects: readonly string[];
}
