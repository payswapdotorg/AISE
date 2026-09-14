/**
 * AISE-015 — no-overwrite merge of extracted semantics into existing state.
 *
 * THE NO-OVERWRITE INVARIANT (architecture-lock "Truth and uncertainty":
 * "estimates cannot silently become measurements"; "additional acquisition
 * cannot fabricate or overwrite evidence"): extracted elements are INFERRED
 * interpretations and can NEVER replace a measured/confirmed value.
 *
 * This module only ever emits INFERRED/PROPOSED elements (the model type
 * forbids OBSERVED/CONFIRMED), so the guard is encoded STRUCTURALLY: callers
 * that hold confirmed/measured observations pass `existingProtected` — a map
 * elementId → protected property keys (plus the reserved dimension keys
 * "geometry.height" / "geometry.width"). If an extracted property (or
 * dimension fill-in) collides with a protected key, the merge REFUSES with a
 * typed `SemanticMergeRefusal` naming the element, key and refused value —
 * the collision is loud, never silently shadowed.
 *
 * For everything not protected the merge is STRICTLY ADDITIVE:
 *   - new elementIds are appended verbatim;
 *   - existing elements keep their kind, epistemic status and every field
 *     they already carry (extracted values fill GAPS only — they never
 *     overwrite, even unprotected ones);
 *   - extracted properties are appended only where no property with that key
 *     exists yet;
 *   - provenance is the ordered, de-duplicated union of source artifact ids
 *     (lineage is preserved, never dropped) and keeps the surviving
 *     element's extractorVersion (documented limitation: merging elements
 *     from different extractor versions keeps the target's version stamp).
 *
 * Purity: inputs are never mutated; the result is a fresh array that reuses
 * the existing element objects by reference (they are treated as immutable).
 */

import type { SemanticElement, SemanticProperty } from "./model";

/** Stable machine-readable code for the typed merge refusal. */
export const SEMANTIC_MERGE_REFUSAL_CODE = "PROTECTED_PROPERTY_COLLISION" as const;

/** Reserved protected keys covering the dimension geometry fields. */
export const PROTECTED_GEOMETRY_KEYS = ["geometry.height", "geometry.width"] as const;

/** Typed refusal: an extracted INFERRED value hit a protected key. */
export class SemanticMergeRefusal extends Error {
  readonly code = SEMANTIC_MERGE_REFUSAL_CODE;
  readonly elementId: string;
  readonly propertyKey: string;
  readonly extractedValue: string | number | boolean;

  constructor(
    elementId: string,
    propertyKey: string,
    extractedValue: string | number | boolean,
  ) {
    super(
      `mergeSemantics refused: extracted (INFERRED) property "${propertyKey}" on element ` +
        `"${elementId}" collides with a protected (measured/confirmed) key; the extracted ` +
        `value ${JSON.stringify(extractedValue)} was NOT merged`,
    );
    this.name = "SemanticMergeRefusal";
    this.elementId = elementId;
    this.propertyKey = propertyKey;
    this.extractedValue = extractedValue;
  }
}

/** Keys an extracted element would fill on the given existing element. */
function extractedFillKeys(element: SemanticElement): Set<string> {
  const keys = new Set<string>(element.properties.map((p) => p.key));
  if (element.geometry.height !== undefined) {
    keys.add("geometry.height");
  }
  if (element.geometry.width !== undefined) {
    keys.add("geometry.width");
  }
  return keys;
}

/** Fail fast if ANY extracted fill would hit a protected key. */
function assertNoProtectedCollision(
  extracted: readonly SemanticElement[],
  existingProtected: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  for (const element of extracted) {
    const protectedKeys = existingProtected.get(element.elementId);
    if (protectedKeys === undefined) {
      continue;
    }
    for (const key of extractedFillKeys(element)) {
      if (protectedKeys.has(key)) {
        const property: SemanticProperty | undefined = element.properties.find(
          (p) => p.key === key,
        );
        // A dimension fill-in refuses with its numeric value so the message
        // names exactly what was refused.
        const value: string | number | boolean =
          property?.value ?? (key === "geometry.height"
            ? element.geometry.height?.value
            : element.geometry.width?.value) ?? "dimension fill-in";
        throw new SemanticMergeRefusal(element.elementId, key, value);
      }
    }
  }
}

/** Ordered, de-duplicated union of source artifact ids (lineage-preserving). */
function unionSourceIds(
  target: SemanticElement,
  addition: SemanticElement,
): string[] {
  const ids: string[] = [];
  for (const id of [...target.provenance.sourceArtifactIds, ...addition.provenance.sourceArtifactIds]) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/** Additive element merge: existing fields win, extracted values fill gaps. */
function mergeElement(target: SemanticElement, addition: SemanticElement): SemanticElement {
  const properties: SemanticProperty[] = [...target.properties];
  for (const property of addition.properties) {
    if (properties.some((p) => p.key === property.key)) {
      continue; // key already present: the existing value is kept (no overwrite)
    }
    properties.push(property);
  }
  return {
    elementId: target.elementId,
    kind: target.kind,
    epistemicStatus: target.epistemicStatus,
    provenance: {
      sourceArtifactIds: unionSourceIds(target, addition),
      extractorVersion: target.provenance.extractorVersion,
    },
    geometry: {
      plane: target.geometry.plane ?? addition.geometry.plane,
      boundaryPolygon: target.geometry.boundaryPolygon ?? addition.geometry.boundaryPolygon,
      height: target.geometry.height ?? addition.geometry.height,
      width: target.geometry.width ?? addition.geometry.width,
    },
    properties,
  };
}

/**
 * Merge extracted (INFERRED) elements into existing semantic state.
 *
 * @param existing current elements (never mutated, reused by reference).
 * @param extracted freshly extracted elements (never mutated).
 * @param existingProtected elementId → protected property keys (plus the
 *   reserved "geometry.height"/"geometry.width" dimension keys) held by
 *   callers with confirmed/measured observations. A collision with any of
 *   these keys is a typed refusal — the no-overwrite invariant is enforced
 *   structurally, before any element is merged.
 * @returns a new element array; the input arrays and their elements are
 *   untouched.
 * @throws SemanticMergeRefusal on a protected-key collision.
 */
export function mergeSemantics(
  existing: readonly SemanticElement[],
  extracted: readonly SemanticElement[],
  existingProtected: ReadonlyMap<string, ReadonlySet<string>>,
): SemanticElement[] {
  assertNoProtectedCollision(extracted, existingProtected);

  const result: SemanticElement[] = [...existing];
  for (const element of extracted) {
    const target = result.find((candidate) => candidate.elementId === element.elementId);
    if (target === undefined) {
      result.push(element);
      continue;
    }
    const index = result.indexOf(target);
    if (index >= 0) {
      result[index] = mergeElement(target, element);
    }
  }
  return result;
}
