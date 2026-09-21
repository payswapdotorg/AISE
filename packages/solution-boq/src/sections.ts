/**
 * Building BOQ sections (PROD-025) — derived FROM THE CONTRACT's own
 * category data, never restated as a second taxonomy.
 *
 * A generated building BOQ groups its lines into SECTIONS. The section
 * vocabulary and the operation-type → section assignment are NOT new
 * reference data: they are computed at runtime from the contract's
 * `BUILDING_OPERATION_CATEGORIES` (the PROD-021 work-order categories —
 * site preparation, foundation, structure, enclosure, services, finishes),
 * so a contract-side category change propagates here without a second
 * table drifting out of sync. An operation type outside the Phase 1
 * categories (an extensible future type) lands in the explicit honest
 * fallback section `other-works` — never silently miscategorized.
 */

import { BUILDING_OPERATION_CATEGORIES } from "@aise/solution-contract";

/** The honest fallback section for operation types outside the Phase 1 categories. */
export const OTHER_WORKS_SECTION = "other-works";

/**
 * The ordered building-BOQ section ids: the contract's category key order
 * (insertion order of the frozen literal — deterministic) with the
 * fallback section last.
 */
export const SOLUTION_BOQ_SECTION_ORDER: readonly string[] = Object.freeze([
  ...Object.keys(BUILDING_OPERATION_CATEGORIES),
  OTHER_WORKS_SECTION,
]);

/** Deterministic human-readable section titles (labels over the contract's keys). */
export const SOLUTION_BOQ_SECTION_TITLES: Readonly<Record<string, string>> = Object.freeze({
  "site-preparation": "Site preparation",
  foundation: "Foundation",
  structure: "Structure",
  enclosure: "Enclosure",
  services: "Services",
  finishes: "Finishes",
  [OTHER_WORKS_SECTION]: "Other works",
});

/** The reverse map operationType → section id, computed from the contract data. */
const SECTION_BY_OPERATION_TYPE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [sectionId, operationTypes] of Object.entries(BUILDING_OPERATION_CATEGORIES)) {
    for (const operationType of operationTypes) {
      map.set(operationType, sectionId);
    }
  }
  return map;
})();

/**
 * The building-BOQ section of one operation type: the contract category that
 * covers it, or the explicit `other-works` fallback for types outside the
 * Phase 1 catalogue (open wire vocabulary — extensible by design).
 */
export function sectionOfOperationType(operationType: string): string {
  return SECTION_BY_OPERATION_TYPE.get(operationType) ?? OTHER_WORKS_SECTION;
}

/** The deterministic section title of a section id. */
export function sectionTitle(sectionId: string): string {
  return SOLUTION_BOQ_SECTION_TITLES[sectionId] ?? sectionId;
}

/** The deterministic section order index (fallback section sorts last). */
export function sectionOrderIndex(sectionId: string): number {
  const index = SOLUTION_BOQ_SECTION_ORDER.indexOf(sectionId);
  return index === -1 ? SOLUTION_BOQ_SECTION_ORDER.length : index;
}
