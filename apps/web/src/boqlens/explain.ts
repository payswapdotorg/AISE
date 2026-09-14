/**
 * AISE-024 — natural-language BOQ explanation (grounded, template-based).
 *
 * `explainBoqItem` is DETERMINISTIC SENTENCE ASSEMBLY — no LLM, no clock, no
 * randomness. Every factual fragment of the sentence traces to one of:
 *
 *  - the item's source cells (row number, verbatim text, quantity/rate/amount);
 *  - its interpretation record (concept code, confidence, method, notes);
 *  - its mapping entry (target count, location, status, confidence).
 *
 * Fragments that CANNOT be grounded are rendered as explicit
 * `[inference: …]` markers (e.g. an amount computed from quantity × rate
 * when the source states no amount) or omitted — NEVER asserted plain. The
 * rendered HTML carries `data-claim-id="claim:explanation:<itemId>"` so the
 * whole sentence resolves through `traceClaim` (see claims.ts).
 */

import { locationLabel } from "./derive";
import { fmt, moneyFmt } from "./format";
import type { BoqLensItem, LensItemInterpretation, LensMappingEntry } from "./model";

/** Plural helper for deterministic grammar. */
function elements(count: number): string {
  return `${count} reality element${count === 1 ? "" : "s"}`;
}

/** Quantity/unit fragment inside the source parenthetical (omitted when absent). */
function quantityFragment(item: BoqLensItem, interpretation: LensItemInterpretation | null): string {
  if (item.quantity === null) {
    return "";
  }
  const unitText = item.unitText ?? interpretation?.unit?.originalText ?? null;
  const unitCode = interpretation?.unit?.unitCode;
  const unit = unitText === null ? "" : ` ${unitText}${unitCode === undefined ? "" : ` (normalized ${unitCode}, derived)`}`;
  if (item.rate === null) {
    return `, ${fmt(item.quantity.value)}${unit}`;
  }
  return `, ${fmt(item.quantity.value)}${unit} at ${item.currency} ${fmt(item.rate.value)}/unit`;
}

/** The interpretation clause (always derived-marked; honest when unresolved). */
function interpretationClause(item: BoqLensItem, interpretation: LensItemInterpretation | null): string {
  const description = interpretation?.description ?? null;
  if (interpretation === null || description === null) {
    return `has no interpretation record (the description was not present in the normalized view)`;
  }
  const notes = description.notes === undefined ? "" : `, ${description.notes}`;
  if (description.conceptCode === undefined) {
    const alternatives = description.alternatives?.length ?? 0;
    const competing =
      alternatives === 0 ? "" : `, ${alternatives} competing reading${alternatives === 1 ? "" : "s"} recorded`;
    return `is not interpreted to a concept (interpretation ${description.confidence}${competing}${notes})`;
  }
  return `is interpreted as ${description.conceptCode} (derived interpretation, ${description.confidence} confidence, ${description.method}${notes})`;
}

/** The mapping clause (status-first; ambiguous/unmapped are first-class). */
function mappingClause(mapping: LensMappingEntry | null): string {
  if (mapping === null) {
    return "has no mapping record";
  }
  if (mapping.status === "mapped") {
    const withLocation = mapping.targets.some((target) => (target.spacePath?.length ?? 0) > 0);
    const located = withLocation
      ? ` on ${locationLabel(mapping.targets.find((target) => (target.spacePath?.length ?? 0) > 0)?.spacePath ?? [])}`
      : " (location not recorded in mapping)";
    return `is mapped to ${elements(mapping.targets.length)}${located} (mapping confidence ${mapping.confidence}, method ${mapping.method})`;
  }
  if (mapping.status === "ambiguous") {
    const alternatives = mapping.alternatives?.length ?? 0;
    return `has an ambiguous mapping (${alternatives} competing candidate${alternatives === 1 ? "" : "s"} recorded, no target committed)`;
  }
  const reason = mapping.reason === undefined ? "" : `: ${mapping.reason}`;
  return `is not mapped to any reality element (unmapped${reason})`;
}

/**
 * The amount sentence: the STATED amount when the source states one, an
 * explicit `[inference: …]` marker when only quantity × rate exist, nothing
 * otherwise. Amounts are never silently computed into plain assertions.
 */
function amountSentence(item: BoqLensItem): string {
  if (item.amount !== null) {
    const cell = item.amount.cellRef === null ? "amount cell ref absent" : `source cell ${item.amount.cellRef}`;
    return ` Stated amount: ${item.currency} ${moneyFmt(item.amount.value)} (${cell}).`;
  }
  if (item.quantity !== null && item.rate !== null) {
    const computed = item.quantity.value * item.rate.value;
    return ` [inference: no amount stated in source; quantity × rate = ${item.currency} ${moneyFmt(computed)}]`;
  }
  return "";
}

/**
 * Deterministic grounded explanation for one BOQ item. Signature per the
 * work order: (item, interpretations, mapping) — each argument grounds its
 * own fragments; `null` arguments yield honest absence statements.
 */
export function explainBoqItem(
  item: BoqLensItem,
  interpretations: LensItemInterpretation | null,
  mapping: LensMappingEntry | null,
): string {
  const cell =
    item.descriptionCellRef === null
      ? "no description cell ref recorded"
      : `source cell ${item.descriptionCellRef}`;
  const subject = `Row ${item.rowNumber} "${item.originalText}" (${cell}${quantityFragment(item, interpretations)})`;
  return `${subject} ${interpretationClause(item, interpretations)} and ${mappingClause(mapping)}.${amountSentence(item)}`;
}
