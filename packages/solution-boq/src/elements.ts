/**
 * Building element labels and deterministic item wording (PROD-025).
 *
 * The work-item SEMANTICS of a generated BOQ line: the building element the
 * line's work touches and the deterministic item description. Both are
 * DERIVED LABELS over the engine's operation types — grouping/wording
 * reference data aligned with the contract's building-element-taxonomy
 * extension (`aise-building-elements@1.0.0`, carried opaquely by the domain
 * descriptor); they never become a second engineering authority. Unknown
 * operation types (the open wire vocabulary) get the honest generic labels,
 * never a guess.
 */

/** Building-element label per Phase 1 operation type (reference data). */
export const BUILDING_ELEMENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  excavation: "ground",
  backfill: "ground",
  "demolition-removal": "existing-element",
  "foundation-placement": "foundation",
  "slab-placement": "slab",
  "block-wall-placement": "wall",
  "opening-creation": "wall",
  "plaster-application": "wall-surface",
  "finish-application": "surface",
  "building-service-installation": "building-service",
});

/** The honest generic label for operation types outside the reference data. */
export const GENERIC_BUILDING_ELEMENT = "building-element";

/** The building element a line's work touches (generic fallback for unknown types). */
export function buildingElementOfOperationType(operationType: string): string {
  return BUILDING_ELEMENT_LABELS[operationType] ?? GENERIC_BUILDING_ELEMENT;
}

/** Activity titles for the deterministic item descriptions (reference data). */
const ACTIVITY_TITLES: Readonly<Record<string, string>> = Object.freeze({
  excavation: "Excavation of soil",
  backfill: "Backfilling of excavated material",
  "demolition-removal": "Demolition and removal of existing elements",
  "foundation-placement": "Strip footing construction",
  "slab-placement": "Ground slab construction",
  "block-wall-placement": "Block wall construction",
  "opening-creation": "Formation of openings in existing elements",
  "plaster-application": "Plaster application to affected surfaces",
  "finish-application": "Applied finish coating",
  "building-service-installation": "Building services installation",
});

/** Measure words per quantity dimension (deterministic wording data). */
const MEASURE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  length: "length",
  area: "area",
  volume: "volume",
  mass: "mass",
  count: "number",
  duration: "duration",
});

/** Title-case wording of an unknown operation type (deterministic fallback). */
function titleizeOperationType(operationType: string): string {
  return operationType
    .split("-")
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * The deterministic item description of one generated BOQ line:
 * `<activity title>[ — <material>], measured by <measure> [<unit>]`.
 * Pure function of the line's work-item semantics — no clock, no locale,
 * no randomness; presentation only (EXCLUDED from line identity, like the
 * contract's own `itemDescription` discipline).
 */
export function boqItemDescription(input: {
  readonly activity: string;
  readonly material?: string;
  readonly dimension: string;
  readonly unit: string;
}): string {
  const title = ACTIVITY_TITLES[input.activity] ?? titleizeOperationType(input.activity);
  const measure = MEASURE_WORDS[input.dimension] ?? input.dimension;
  const material = input.material === undefined ? "" : ` — ${input.material}`;
  return `${title}${material}, measured by ${measure} [${input.unit}]`;
}
