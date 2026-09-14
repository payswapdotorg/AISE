/**
 * BOQ normalizer (AISE-014) — the PURE, DETERMINISTIC projection from a
 * parsed `BoqDocument` to a `NormalizedBoqView` of explicit interpretations.
 *
 * Frozen invariants (spec/architecture-lock.md "BOQ Lens"):
 *
 *  - The source `BoqDocument` is READ-ONLY here: this function never
 *    mutates, rewrites or re-serializes it. Its JSON bytes are unchanged
 *    before and after normalization (asserted by normalizer.test.ts).
 *  - Original wording is preserved: `originalText` is the VERBATIM cell
 *    `raw`, and the ONLY textual transformations ever applied are
 *    abbreviation expansions + canonical whitespace, so the original is
 *    recoverable from the derived record (modulo whitespace).
 *  - NUMBERS ARE NEVER TOUCHED. Quantity, rate and amount cells are not
 *    read, interpreted, coerced or re-formatted by this module AT ALL —
 *    AISE-014 does NO numeric interpretation. Numeric semantics (units of
 *    measure, thousands separators, currency) are a separate, future
 *    concern; nothing here silently assumes them. Every sourceRef in every
 *    interpretation points at a description or unit column cell only.
 *  - Uncertainty is explicit and first-class: unresolved classifications
 *    (including ambiguous ones) carry `confidence: "uncertain"` (or "low"
 *    for a single near-miss unit) and are NEVER guessed; competing senses
 *    are recorded as `alternatives`.
 *
 * Description pipeline (documented order — part of the deterministic
 * contract):
 *
 *   1. abbreviation expansion (dictionaries.ts, longest abbreviation first);
 *   2. canonical whitespace;
 *   3. concept matching on the expanded text (longest matched keyword wins,
 *      then keyword strength; a full tie between DIFFERENT concepts records
 *      alternatives + "uncertain" instead of picking a winner).
 *
 * Unit pipeline: cleaned lookup key -> exact canonical code
 * (`dictionary_exact`) -> alias (`dictionary_synonym`) -> otherwise
 * UNRESOLVED with near-miss canonical codes (edit distance <= 2) recorded
 * as alternatives — a single near candidate yields `confidence: "low"`,
 * several yield `"uncertain"`; the `unitCode` is never assigned from a
 * near miss.
 *
 * Structural boundaries are respected: only ITEM rows of DETECTED sections
 * (AISE-011 structural detection) are interpreted; header, title, and
 * TOTAL rows are never normalized as items. Column roles (which column is
 * the description / the unit) are derived from the detected header cells
 * and recorded explicitly in `columnRoles`.
 *
 * Determinism: no clock, no randomness, no environment. The same document
 * and dictionary version always produce a byte-identical canonical-JSON
 * view.
 */

import type { BoqCell, BoqDocument, BoqRow, BoqSheet } from "../model";
import type { BoqSection } from "../sections";
import {
  ABBREVIATION_DICTIONARY,
  type ConceptMatchTier,
  CONCEPT_MATCHERS,
  COMPILED_ABBREVIATIONS,
  DICTIONARY_VERSION,
  levenshtein,
  UNIT_ALIAS_TO_CODE,
  UNIT_CODES,
  UNIT_NEAR_SPELLINGS,
  canonicalSpace,
  unitLookupKey,
} from "./dictionaries";
import {
  type Interpretation,
  type InterpretationAlternative,
  type InterpretationConfidence,
  type InterpretationMethod,
  type ItemInterpretation,
  type ColumnRoleDetection,
  type NormalizedBoqView,
  NORMALIZER_ID,
} from "./types";

/* ------------------------------------------------------------------ */
/* Abbreviation expansion                                              */
/* ------------------------------------------------------------------ */

/** One applied abbreviation expansion (matched text -> expansion used). */
export interface AppliedAbbreviation {
  readonly matched: string;
  readonly expansion: string;
}

/** Result of expanding one text: the expanded text plus what was applied. */
export interface ExpansionResult {
  readonly text: string;
  readonly applied: readonly AppliedAbbreviation[];
}

/**
 * Expand BOQ abbreviations and apply canonical whitespace. Longest
 * abbreviation first (see COMPILED_ABBREVIATIONS); an uppercase matched
 * abbreviation capitalizes the expansion's first letter. Deterministic.
 */
export function expandAbbreviations(text: string): ExpansionResult {
  let work = canonicalSpace(text);
  const applied: AppliedAbbreviation[] = [];
  for (const compiled of COMPILED_ABBREVIATIONS) {
    work = work.replace(compiled.regex, (match: string): string => {
      let expansion = compiled.expansion;
      if (/^[A-Z]/.test(match) && /^[a-z]/.test(expansion)) {
        expansion = expansion.charAt(0).toUpperCase() + expansion.slice(1);
      }
      applied.push({ matched: match, expansion });
      return expansion;
    });
  }
  return { text: canonicalSpace(work), applied };
}

/* ------------------------------------------------------------------ */
/* Concept classification                                              */
/* ------------------------------------------------------------------ */

/** One concept's best evidence in a text. */
interface ConceptCandidate {
  readonly concept: string;
  readonly matchedText: string;
  readonly strength: number;
  readonly tier: ConceptMatchTier;
}

/** Classified outcome of matching a text against the concept dictionary. */
type ConceptClassification =
  | { readonly kind: "resolved"; readonly winner: ConceptCandidate }
  | { readonly kind: "ambiguous"; readonly ties: readonly ConceptCandidate[] }
  | { readonly kind: "none" };

const TIER_ORDER: Record<ConceptMatchTier, number> = { canonical: 0, synonym: 1, pattern: 2 };

/** Rank candidates: longest match, then strength, then tier, then text. */
function candidateBefore(a: ConceptCandidate, b: ConceptCandidate): number {
  const byLength = b.matchedText.length - a.matchedText.length;
  if (byLength !== 0) {
    return byLength;
  }
  const byStrength = b.strength - a.strength;
  if (byStrength !== 0) {
    return byStrength;
  }
  const byTier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
  if (byTier !== 0) {
    return byTier;
  }
  return a.matchedText < b.matchedText ? -1 : a.matchedText > b.matchedText ? 1 : 0;
}

/**
 * Classify a (already expanded, canonically spaced) text: collect every
 * keyword/pattern hit, keep each concept's best hit, then rank concepts.
 * Longest keyword wins; a full (length, strength) tie between different
 * concepts is ambiguous — alternatives, never a silent winner.
 */
export function classifyConcepts(text: string): ConceptClassification {
  if (text === "") {
    return { kind: "none" };
  }
  const byConcept = new Map<string, ConceptCandidate>();
  for (const matcher of CONCEPT_MATCHERS) {
    const match = matcher.regex.exec(text);
    if (match === null) {
      continue;
    }
    const candidate: ConceptCandidate = {
      concept: matcher.concept,
      matchedText: match[0],
      strength: matcher.strength,
      tier: matcher.tier,
    };
    const existing = byConcept.get(matcher.concept);
    if (existing === undefined || candidateBefore(candidate, existing) < 0) {
      byConcept.set(matcher.concept, candidate);
    }
  }
  if (byConcept.size === 0) {
    return { kind: "none" };
  }
  const ranked = [...byConcept.values()].sort((a, b) => candidateBefore(a, b) || (a.concept < b.concept ? -1 : 1));
  const top = ranked[0] as ConceptCandidate;
  const ties = ranked.filter((candidate) => candidate.matchedText.length === top.matchedText.length && candidate.strength === top.strength);
  if (ties.length === 1) {
    return { kind: "resolved", winner: top };
  }
  return { kind: "ambiguous", ties };
}

/** Map a winning candidate's tier to the interpretation method. */
function methodOfTier(tier: ConceptMatchTier): InterpretationMethod {
  switch (tier) {
    case "canonical":
      return "dictionary_exact";
    case "synonym":
      return "dictionary_synonym";
    case "pattern":
      return "pattern";
  }
}

/* ------------------------------------------------------------------ */
/* Cell-level interpretations                                          */
/* ------------------------------------------------------------------ */

/** A cell whose content exists (mirrors the AISE-011 content rule). */
function hasContent(cell: BoqCell | null): cell is BoqCell {
  return cell !== null && cell.type !== "empty" && cell.raw !== "";
}

/**
 * Interpret one DESCRIPTION cell. Non-string cells are preserved verbatim
 * with an unresolved interpretation (a numeric description cell is a source
 * anomaly — recorded, never guessed).
 */
export function interpretDescription(cell: BoqCell, sourceRefs: readonly string[]): Interpretation {
  const originalText = cell.raw;
  if (typeof cell.value !== "string") {
    return {
      field: "description",
      originalText,
      normalizedText: canonicalSpace(originalText),
      confidence: "uncertain",
      method: "unresolved",
      sourceRefs,
      notes: "non-text description cell — source value preserved verbatim; no interpretation attempted",
    };
  }

  const expansion = expandAbbreviations(originalText);
  const classification = classifyConcepts(expansion.text);
  const notes: string[] = [];
  if (expansion.applied.length > 0) {
    const summary = expansion.applied
      .map((entry) => `'${entry.matched}'→'${entry.expansion.trim()}'`)
      .join(", ");
    notes.push(`abbreviations expanded: ${summary}`);
  }

  if (classification.kind === "resolved") {
    const winner = classification.winner;
    let method: InterpretationMethod = methodOfTier(winner.tier);
    let confidence: InterpretationConfidence = winner.tier === "canonical" ? "high" : "medium";
    if (expansion.applied.length > 0) {
      // The classification may only be possible BECAUSE of the expansion:
      // compare against a classification of the un-expanded original.
      const rawClassification = classifyConcepts(canonicalSpace(originalText));
      const rawSameConcept =
        rawClassification.kind === "resolved" && rawClassification.winner.concept === winner.concept;
      if (!rawSameConcept) {
        method = "abbreviation_expansion";
        confidence = "medium";
      }
    }
    notes.push(`concept matched on keyword '${winner.matchedText}'`);
    return {
      field: "description",
      originalText,
      normalizedText: expansion.text,
      conceptCode: winner.concept,
      confidence,
      method,
      sourceRefs,
      notes: notes.join("; "),
    };
  }

  if (classification.kind === "ambiguous") {
    const alternatives: InterpretationAlternative[] = classification.ties.map((tie) => ({
      code: tie.concept,
      reason: `matched keyword '${tie.matchedText}' with equal strength`,
    }));
    notes.push("ambiguous description: competing concepts of equal match strength recorded as alternatives");
    return {
      field: "description",
      originalText,
      normalizedText: expansion.text,
      confidence: "uncertain",
      method: "unresolved",
      sourceRefs,
      alternatives,
      notes: notes.join("; "),
    };
  }

  notes.push("no concept keyword matched");
  return {
    field: "description",
    originalText,
    normalizedText: expansion.text,
    confidence: "uncertain",
    method: "unresolved",
    sourceRefs,
    notes: notes.join("; "),
  };
}

/** Maximum edit distance for a unit near-miss alternative (design: <= 2). */
const UNIT_NEAR_MISS_MAX_DISTANCE = 2;

/**
 * Interpret one UNIT cell. The lookup key comes from the cell's logical
 * value (CSV quote-stripping already happened in AISE-011's parse); the
 * `originalText` stays the VERBATIM raw slice. Near misses are recorded as
 * alternatives and NEVER applied as `unitCode`.
 */
export function interpretUnit(cell: BoqCell, sourceRefs: readonly string[]): Interpretation {
  const originalText = cell.raw;
  if (typeof cell.value !== "string") {
    return {
      field: "unit",
      originalText,
      confidence: "uncertain",
      method: "unresolved",
      sourceRefs,
      notes: "non-text unit cell — source value preserved verbatim; no interpretation attempted",
    };
  }
  const key = unitLookupKey(cell.value);
  if (key === "") {
    return {
      field: "unit",
      originalText,
      confidence: "uncertain",
      method: "unresolved",
      sourceRefs,
      notes: "blank unit cell — nothing to interpret",
    };
  }
  if (UNIT_CODES.includes(key)) {
    return {
      field: "unit",
      originalText,
      normalizedText: key,
      unitCode: key,
      confidence: "high",
      method: "dictionary_exact",
      sourceRefs,
    };
  }
  const aliasCode = UNIT_ALIAS_TO_CODE.get(key);
  if (aliasCode !== undefined) {
    return {
      field: "unit",
      originalText,
      normalizedText: aliasCode,
      unitCode: aliasCode,
      confidence: "medium",
      method: "dictionary_synonym",
      sourceRefs,
    };
  }

  // Unmatched: near-miss canonical/alias spellings become ALTERNATIVES only.
  const nearest = new Map<string, { code: string; spelling: string; distance: number }>();
  for (const { spelling, code } of UNIT_NEAR_SPELLINGS) {
    const distance = levenshtein(key, spelling);
    if (distance > UNIT_NEAR_MISS_MAX_DISTANCE) {
      continue;
    }
    const existing = nearest.get(code);
    if (
      existing === undefined ||
      distance < existing.distance ||
      (distance === existing.distance && spelling < existing.spelling)
    ) {
      nearest.set(code, { code, spelling, distance });
    }
  }
  const candidates = [...nearest.values()].sort(
    (a, b) => a.distance - b.distance || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
  if (candidates.length === 0) {
    return {
      field: "unit",
      originalText,
      confidence: "uncertain",
      method: "unresolved",
      sourceRefs,
      notes: "unmatched unit text; no canonical or alias spelling within edit distance 2",
    };
  }
  const alternatives: InterpretationAlternative[] = candidates.map((candidate) => ({
    code: candidate.code,
    reason: `edit distance ${candidate.distance} from '${candidate.spelling}'`,
  }));
  const notes =
    candidates.length === 1
      ? "unmatched unit text; single near canonical code recorded as an alternative (not applied)"
      : "unmatched unit text; competing near canonical codes recorded as alternatives (not applied)";
  return {
    field: "unit",
    originalText,
    confidence: candidates.length === 1 ? "low" : "uncertain",
    method: "unresolved",
    sourceRefs,
    alternatives,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Column-role detection (explicit, recorded)                          */
/* ------------------------------------------------------------------ */

/** Header label patterns that anchor the description / unit column roles. */
const DESCRIPTION_HEADER_PATTERN = /\bdescription\b/i;
const UNIT_HEADER_PATTERN = /\bunits?\b/i;

interface ColumnRoles {
  readonly descriptionColumn: string | null;
  readonly descriptionHeaderRef: string | null;
  readonly unitColumn: string | null;
  readonly unitHeaderRef: string | null;
}

/**
 * Derive the description/unit column roles from the STRUCTURALLY detected
 * header cells (first matching header cell, left-to-right). The roles are
 * an explicit derived interpretation — they are recorded in the view's
 * `columnRoles`, and a miss (null) means NO cells of that role are
 * interpreted for the section (honest nothing, never a positional guess).
 */
function detectColumnRoles(sheet: BoqSheet, section: BoqSection): ColumnRoles {
  const headerRow: BoqRow | undefined = sheet.rows.find(
    (row) => row.rowNumber === section.detection.headerRowNumber,
  );
  let descriptionColumn: string | null = null;
  let descriptionHeaderRef: string | null = null;
  let unitColumn: string | null = null;
  let unitHeaderRef: string | null = null;
  if (headerRow !== undefined) {
    for (const ref of section.headerCells) {
      const cell = headerRow.cells.find((candidate) => candidate.ref === ref);
      if (cell === undefined || typeof cell.value !== "string") {
        continue;
      }
      if (descriptionColumn === null && DESCRIPTION_HEADER_PATTERN.test(cell.value)) {
        descriptionColumn = cell.column;
        descriptionHeaderRef = cell.ref;
      }
      if (unitColumn === null && UNIT_HEADER_PATTERN.test(cell.value)) {
        unitColumn = cell.column;
        unitHeaderRef = cell.ref;
      }
    }
  }
  return { descriptionColumn, descriptionHeaderRef, unitColumn, unitHeaderRef };
}

/** The cell of `row` in column `column`, or null (sparse rows stay sparse). */
function cellInColumn(row: BoqRow, column: string): BoqCell | null {
  return row.cells.find((cell) => cell.column === column) ?? null;
}

/** Sheet-qualified source ref, e.g. "Substructure!B4". */
function sourceRef(sheet: BoqSheet, cell: BoqCell): string {
  return `${sheet.name}!${cell.ref}`;
}

/* ------------------------------------------------------------------ */
/* Document normalization                                              */
/* ------------------------------------------------------------------ */

/**
 * Normalize one parsed BOQ document into a derived `NormalizedBoqView`.
 * PURE: the document is read, never written. Only ITEM rows of detected
 * sections are interpreted; numbers are never touched (module header).
 */
export function normalizeBoqDocument(doc: BoqDocument, importId: string): NormalizedBoqView {
  const interpretations: Interpretation[] = [];
  const perItem: ItemInterpretation[] = [];
  const columnRoles: ColumnRoleDetection[] = [];
  let totalItems = 0;
  let rowsWithoutInterpretableCells = 0;
  let resolvedConcepts = 0;
  let unresolvedConcepts = 0;
  let ambiguousDescriptions = 0;
  let resolvedUnits = 0;
  let unresolvedUnits = 0;

  for (const sheet of doc.sheets) {
    const rowsByNumber = new Map<number, BoqRow>();
    for (const row of sheet.rows) {
      rowsByNumber.set(row.rowNumber, row);
    }
    for (const section of sheet.sections) {
      const roles = detectColumnRoles(sheet, section);
      columnRoles.push({
        sheet: sheet.name,
        sectionTitle: section.title,
        headerRowNumber: section.detection.headerRowNumber,
        descriptionColumn: roles.descriptionColumn,
        descriptionHeaderRef: roles.descriptionHeaderRef,
        unitColumn: roles.unitColumn,
        unitHeaderRef: roles.unitHeaderRef,
      });
      for (const rowNumber of section.itemRows) {
        totalItems += 1;
        const row = rowsByNumber.get(rowNumber);
        if (row === undefined) {
          // itemRows are refs into real rows (AISE-011 guarantees this); a
          // miss is still counted honestly rather than fabricated.
          rowsWithoutInterpretableCells += 1;
          continue;
        }
        const descriptionCell =
          roles.descriptionColumn === null ? null : cellInColumn(row, roles.descriptionColumn);
        const unitCell = roles.unitColumn === null ? null : cellInColumn(row, roles.unitColumn);
        const description = hasContent(descriptionCell)
          ? interpretDescription(descriptionCell, [sourceRef(sheet, descriptionCell)])
          : null;
        const unit = hasContent(unitCell) ? interpretUnit(unitCell, [sourceRef(sheet, unitCell)]) : null;
        if (description === null && unit === null) {
          // Nothing to interpret (e.g. the fixture's bare units row whose
          // only cell sits in the Qty column) — recorded in the stats.
          rowsWithoutInterpretableCells += 1;
          continue;
        }
        if (description !== null) {
          interpretations.push(description);
          if (description.conceptCode !== undefined) {
            resolvedConcepts += 1;
          } else {
            unresolvedConcepts += 1;
          }
          if (description.alternatives !== undefined && description.alternatives.length > 0) {
            ambiguousDescriptions += 1;
          }
        }
        if (unit !== null) {
          interpretations.push(unit);
          if (unit.unitCode !== undefined) {
            resolvedUnits += 1;
          } else {
            unresolvedUnits += 1;
          }
        }
        perItem.push({ sectionTitle: section.title, rowNumber, description, unit });
      }
    }
  }

  return {
    importId,
    dictionaryVersion: DICTIONARY_VERSION,
    generatedBy: NORMALIZER_ID,
    columnRoles,
    interpretations,
    perItem,
    stats: {
      totalItems,
      rowsWithoutInterpretableCells,
      resolvedConcepts,
      unresolvedConcepts,
      ambiguousDescriptions,
      resolvedUnits,
      unresolvedUnits,
    },
  };
}

/** Dictionary sizes exposed for invariant tests (no magic numbers there). */
export const DICTIONARY_SIZES = {
  units: UNIT_CODES.length,
  unitAliases: UNIT_NEAR_SPELLINGS.length - UNIT_CODES.length,
  concepts: CONCEPT_MATCHERS.length > 0 ? new Set(CONCEPT_MATCHERS.map((m) => m.concept)).size : 0,
  abbreviations: ABBREVIATION_DICTIONARY.length,
} as const;
