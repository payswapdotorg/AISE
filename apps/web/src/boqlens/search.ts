/**
 * AISE-024 — deterministic BOQ item search.
 *
 * Case-insensitive SUBSTRING search (no tokenization, no ranking — the same
 * query always yields the same results, in input order) over exactly the
 * three grounded haystack families the work order names:
 *
 *  - the VERBATIM original text (description + unit cell text);
 *  - the normalized concepts (normalizedText + conceptCode — derived);
 *  - the target locations (every mapped space path).
 *
 * Every result carries the item's source cell refs. No match → empty array.
 */

import { locationLabel } from "./derive";
import type { BoqLensInput, BoqLensItem, BoqSearchField, BoqSearchResult } from "./model";

/** Deterministic haystacks per search field for one item (verbatim order). */
function haystacks(item: BoqLensItem): ReadonlyArray<readonly [BoqSearchField, string]> {
  const fields: Array<readonly [BoqSearchField, string]> = [];
  if (item.originalText !== "") {
    fields.push(["original-text", item.originalText]);
  }
  if (item.unitText !== null && item.unitText !== "") {
    fields.push(["original-text", item.unitText]);
  }
  const description = item.interpretation?.description ?? null;
  if (description !== null) {
    if (description.normalizedText !== undefined) {
      fields.push(["normalized-concept", description.normalizedText]);
    }
    if (description.conceptCode !== undefined) {
      fields.push(["normalized-concept", description.conceptCode]);
    }
  }
  const unit = item.interpretation?.unit ?? null;
  if (unit?.unitCode !== undefined) {
    fields.push(["normalized-unit", unit.unitCode]);
  }
  if (item.mapping !== undefined) {
    for (const target of item.mapping.targets) {
      if (target.spacePath !== undefined && target.spacePath.length > 0) {
        fields.push(["target-location", locationLabel(target.spacePath)]);
      }
    }
  }
  return fields;
}

/** The item's source cell refs in fixed order (deduplicated). */
export function itemCellRefs(item: BoqLensItem): readonly string[] {
  const refs: string[] = [];
  for (const ref of [
    item.descriptionCellRef,
    item.unitCellRef,
    item.quantity?.cellRef ?? null,
    item.rate?.cellRef ?? null,
    item.amount?.cellRef ?? null,
  ]) {
    if (ref !== null && ref !== "" && !refs.includes(ref)) {
      refs.push(ref);
    }
  }
  return refs;
}

/**
 * Search the items of one input. Deterministic: case-insensitive substring
 * over original text + normalized concepts/units + target locations; results
 * in input order; every result carries the item's cell refs.
 */
export function searchBoqItems(query: string, input: BoqLensInput): BoqSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [];
  }
  const results: BoqSearchResult[] = [];
  for (const item of input.items) {
    const matched = new Set<BoqSearchField>();
    for (const [field, text] of haystacks(item)) {
      if (text.toLowerCase().includes(needle)) {
        matched.add(field);
      }
    }
    if (matched.size > 0) {
      results.push({
        itemId: item.itemId,
        rowNumber: item.rowNumber,
        originalText: item.originalText,
        matchedIn: [...matched],
        cellRefs: itemCellRefs(item),
      });
    }
  }
  return results;
}
