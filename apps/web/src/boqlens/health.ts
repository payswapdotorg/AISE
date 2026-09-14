/**
 * AISE-024 — BOQ Lens health checks.
 *
 * Mapping coverage (mapped/ambiguous/unmapped + confidence histogram),
 * interpretation coverage (resolved/unresolved concepts, uncertain readings)
 * and THE PROVENANCE INVARIANT: `claimsWithoutProvenance` counts rendered
 * claims whose citations cannot be grounded —
 *
 *  1. a present numeric (quantity/rate/amount) without a cell ref;
 *  2. an interpretation record with an empty `sourceRefs`;
 *  3. a mapping entry whose boqItem anchors neither a description nor a
 *     unit cell;
 *  4. any cited cell ref that is NOT a member of the input's
 *     `sourceCellRefs` inventory (FABRICATED provenance).
 *
 * The counter MUST be zero on valid inputs (tests assert it) and a
 * deliberately-broken input trips it. Pure + deterministic.
 */

import type { BoqHealthStats, BoqLensInput, BoqLensItem } from "./model";

/** Every cell ref one item cites (deterministic order). */
export function citedCellRefs(item: BoqLensItem): string[] {
  const refs: string[] = [];
  if (item.descriptionCellRef !== null) refs.push(item.descriptionCellRef);
  if (item.unitCellRef !== null) refs.push(item.unitCellRef);
  for (const numeric of [item.quantity, item.rate, item.amount]) {
    if (numeric !== null && numeric.cellRef !== null) refs.push(numeric.cellRef);
  }
  const interpretation = item.interpretation;
  if (interpretation !== undefined) {
    for (const record of [interpretation.description, interpretation.unit]) {
      if (record !== null) refs.push(...record.sourceRefs);
    }
  }
  const mapping = item.mapping;
  if (mapping !== undefined) {
    if (mapping.boqItem.descriptionCellRef !== null) refs.push(mapping.boqItem.descriptionCellRef);
    if (mapping.boqItem.unitCellRef !== null) refs.push(mapping.boqItem.unitCellRef);
  }
  return refs;
}

/**
 * Compute the health stats + itemized provenance defects for one input.
 * `claimsWithoutProvenance` is the count of defects (one defect = one claim
 * that cannot be grounded).
 */
export function computeBoqHealth(input: BoqLensInput): BoqHealthStats {
  const universe = new Set(input.sourceCellRefs);
  const defects: string[] = [];
  let mapped = 0;
  let ambiguous = 0;
  let unmapped = 0;
  const byMappingConfidence = { high: 0, medium: 0, low: 0, uncertain: 0 };
  let conceptsResolved = 0;
  let conceptsUnresolved = 0;
  let uncertainInterpretations = 0;

  for (const item of input.items) {
    for (const [label, numeric] of [
      ["quantity", item.quantity],
      ["rate", item.rate],
      ["amount", item.amount],
    ] as const) {
      if (numeric !== null && (numeric.cellRef === null || numeric.cellRef === "")) {
        defects.push(`row ${item.rowNumber}: stated ${label} (${numeric.value}) has no source cell ref`);
      }
    }
    const interpretation = item.interpretation;
    if (interpretation !== undefined) {
      for (const [field, record] of [
        ["description", interpretation.description],
        ["unit", interpretation.unit],
      ] as const) {
        if (record === null) {
          continue;
        }
        if (record.sourceRefs.length === 0) {
          defects.push(`row ${item.rowNumber}: ${field} interpretation cites no source refs`);
        }
        if (record.confidence === "uncertain") {
          uncertainInterpretations += 1;
        }
      }
      if (interpretation.description?.conceptCode !== undefined) {
        conceptsResolved += 1;
      } else {
        conceptsUnresolved += 1;
      }
    } else {
      conceptsUnresolved += 1;
    }
    const mapping = item.mapping;
    if (mapping === undefined) {
      unmapped += 1; // honest absence — never guessed into a status
    } else {
      if (mapping.status === "mapped") mapped += 1;
      else if (mapping.status === "ambiguous") ambiguous += 1;
      else unmapped += 1;
      byMappingConfidence[mapping.confidence] += 1;
      if (mapping.boqItem.descriptionCellRef === null && mapping.boqItem.unitCellRef === null) {
        defects.push(`row ${item.rowNumber}: mapping entry '${mapping.entryId}' anchors no source cell`);
      }
    }
    for (const ref of citedCellRefs(item)) {
      if (!universe.has(ref)) {
        defects.push(`row ${item.rowNumber}: cited cell ref '${ref}' is not in the source document (fabricated provenance)`);
      }
    }
  }

  return {
    totalItems: input.items.length,
    mapped,
    ambiguous,
    unmapped,
    byMappingConfidence,
    conceptsResolved,
    conceptsUnresolved,
    uncertainInterpretations,
    claimsWithoutProvenance: defects.length,
    provenanceDefects: defects,
  };
}
