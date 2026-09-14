/**
 * BOQ normalization contract types (AISE-014) — the EXPLICIT DERIVED
 * INTERPRETATION record over a parsed `BoqDocument`.
 *
 * Contract (spec/work-orders.md §014; spec/architecture-lock.md "BOQ Lens";
 * spec/requirements.md R8 first paragraph):
 *
 *  - Original BOQ wording is PRESERVED: every interpretation carries the
 *    VERBATIM source text in `originalText`. The normalized text is the
 *    original wording with ONLY abbreviation expansions and canonical
 *    whitespace applied, so the original is always recoverable from the
 *    derived record (modulo whitespace).
 *  - Normalization and mapping are EXPLICIT DERIVED INTERPRETATIONS — they
 *    live in this module's output (`NormalizedBoqView`), NEVER in the
 *    source `BoqDocument`, which is read-only here.
 *  - Quantities/costs retain source identity: NUMBERS ARE NEVER TOUCHED.
 *    Quantity/rate/amount cells are referenced by cell ref only — and in
 *    this implementation they are not even read: this item does NO numeric
 *    interpretation at all (loudly documented in normalizer.ts).
 *  - Uncertainty is FIRST-CLASS: `confidence: "uncertain"` +
 *    `method: "unresolved"` is a legitimate, expected outcome. Unresolved
 *    classifications are NEVER guessed — near misses are recorded as
 *    `alternatives`, never silently applied.
 *
 * The `"concept"` field value is part of the contract union for future
 * use; dictionary version 1.0.0 folds concept classification into the
 * `description` interpretation (`conceptCode` + `confidence`), so no
 * standalone `field: "concept"` records are emitted by this normalizer.
 */

/** Which facet of a source cell an interpretation interprets. */
export type InterpretationField = "description" | "unit" | "concept";

/**
 * Confidence of an interpretation. `"uncertain"` marks honestly unknown
 * classifications (never silently resolved); `"low"` marks an unresolved
 * classification with exactly one weak near-miss candidate.
 */
export type InterpretationConfidence = "high" | "medium" | "low" | "uncertain";

/**
 * How the interpretation was derived:
 *  - `dictionary_exact`          the source text IS a canonical dictionary entry;
 *  - `dictionary_synonym`        matched a dictionary synonym/alias;
 *  - `abbreviation_expansion`    the interpretation is only possible because
 *                                an abbreviation was expanded first;
 *  - `pattern`                   matched a structural keyword pattern (regex);
 *  - `unresolved`                no deterministic mapping — never guessed.
 */
export type InterpretationMethod =
  | "dictionary_exact"
  | "dictionary_synonym"
  | "abbreviation_expansion"
  | "pattern"
  | "unresolved";

/**
 * One competing reading that was NOT applied. Present when multiple
 * dictionary senses compete (e.g. bare "steel" between STEELWORK and
 * REINFORCEMENT) or when an unmatched unit is close to canonical codes.
 */
export interface InterpretationAlternative {
  /** Competing dictionary code (concept or unit), when the alternative is a classification. */
  readonly code?: string;
  /** Competing normalized text, when the alternative is a text reading. */
  readonly text?: string;
  /** Deterministic, human-readable reason this alternative competes. */
  readonly reason: string;
}

/** The explicit interpretation record — the core epistemics of AISE-014. */
export interface Interpretation {
  readonly field: InterpretationField;
  /** VERBATIM source text (whitespace and source spelling untouched). */
  readonly originalText: string;
  /** Normalized text: original wording + abbreviation expansions + canonical whitespace. */
  readonly normalizedText?: string;
  /** Matched construction concept code (descriptions only; never guessed). */
  readonly conceptCode?: string;
  /** Matched canonical unit code (units only; never guessed). */
  readonly unitCode?: string;
  readonly confidence: InterpretationConfidence;
  readonly method: InterpretationMethod;
  /** Cell refs with sheet name, e.g. ["Substructure!B4"]. */
  readonly sourceRefs: readonly string[];
  /** Competing readings that were recorded instead of being silently resolved. */
  readonly alternatives?: readonly InterpretationAlternative[];
  /** Deterministic provenance/notes (matched keyword, applied expansions). */
  readonly notes?: string;
}

/**
 * One interpreted ITEM row: the derived readings of its description and unit
 * cells. `null` members are rows whose source cell is absent or blank in the
 * detected column — an interpretation of nothing is never fabricated.
 */
export interface ItemInterpretation {
  /** Section title (merged banner row above the header); null when none was detected. */
  readonly sectionTitle: string | null;
  readonly rowNumber: number;
  readonly description: Interpretation | null;
  readonly unit: Interpretation | null;
}

/**
 * Which header cell anchored the description/unit column roles for one
 * detected section. Column-role detection is itself an explicit derived
 * interpretation (traceable per R8), recorded here rather than assumed.
 */
export interface ColumnRoleDetection {
  readonly sheet: string;
  readonly sectionTitle: string | null;
  readonly headerRowNumber: number;
  /** Column letter of the description column; null when no header cell matched. */
  readonly descriptionColumn: string | null;
  /** Header cell ref that matched the description role; null when none. */
  readonly descriptionHeaderRef: string | null;
  /** Column letter of the unit column; null when no header cell matched. */
  readonly unitColumn: string | null;
  /** Header cell ref that matched the unit role; null when none. */
  readonly unitHeaderRef: string | null;
}

/** Aggregated, fully explicit outcome counters for one normalized view. */
export interface NormalizationStats {
  /** ITEM rows examined across all detected sections (structural itemRows). */
  readonly totalItems: number;
  /** Item rows with neither an interpretable description nor unit cell. */
  readonly rowsWithoutInterpretableCells: number;
  /** Description interpretations that assigned a conceptCode. */
  readonly resolvedConcepts: number;
  /** Description interpretations with NO conceptCode (includes ambiguous ones). */
  readonly unresolvedConcepts: number;
  /** Description interpretations carrying competing alternatives. */
  readonly ambiguousDescriptions: number;
  /** Unit interpretations that assigned a unitCode. */
  readonly resolvedUnits: number;
  /** Unit interpretations with NO unitCode (includes near-miss cases). */
  readonly unresolvedUnits: number;
}

/** Generator identity stamped into every derived view (provenance). */
export const NORMALIZER_ID = "aise-boq-normalizer/1.0";

/**
 * The derived normalization view — a PURE projection of one parsed
 * `BoqDocument` under one dictionary version. Contains NO timestamps and NO
 * randomness: the same document + dictionary version always yields a
 * byte-identical canonical-JSON view.
 */
export interface NormalizedBoqView {
  readonly importId: string;
  readonly dictionaryVersion: string;
  readonly generatedBy: string;
  /** Column-role detections (one per detected section, document order). */
  readonly columnRoles: readonly ColumnRoleDetection[];
  /** Every interpretation in document order (descriptions then units, per item). */
  readonly interpretations: readonly Interpretation[];
  readonly perItem: readonly ItemInterpretation[];
  readonly stats: NormalizationStats;
}
