/**
 * `@aise/world-scene-runtime` — the typed ingested-mesh geometry
 * vocabulary (WORLD-P5 Mount 1).
 *
 * The P0-A scene-composition model addresses geometry by REFERENCE
 * (`GeometryReference {assetId, partId, format}` — resolved through an
 * ASSET DELIVERY seam, never inline vertex data, never invented by the
 * runtime). This module defines the AISE-side payload for references of
 * format `"ingested-mesh"`: geometry that the AISE side has already
 * ingested from DECLARED data (plan-model declared shapes, capture
 * volumes, ghost presentation transforms) — the honest shape of the
 * fixture world at P5.
 *
 * IDENTITY LAW (P0-A): `assetId`/`partId` are AISE-side addressing, in
 * the same id space the projection declares. No substrate id appears
 * here; no value here ever becomes canonical AISE identity.
 *
 * CLOSED vocabulary: `"box"` is the one ingested kind this delivery
 * implements. Anything else is a typed refusal at the adapter — never a
 * guessed mesh (`unsupported_operation` — the substitution contract's
 * law 3: unsupported is recorded, never computed).
 */

/** An axis-aligned box in the AISE site frame (metres). */
export interface IngestedBoxGeometry {
  readonly kind: "box";
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * The closed ingested-mesh geometry vocabulary (one member at P5 —
 * extended only by a contract bump, never silently).
 */
export type IngestedMeshGeometry = IngestedBoxGeometry;

/** Type guard: is this value a member of the closed vocabulary? */
export function isIngestedMeshGeometry(value: unknown): value is IngestedMeshGeometry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v["kind"] !== "box") return false;
  const min = v["min"];
  const max = v["max"];
  if (!Array.isArray(min) || !Array.isArray(max)) return false;
  if (min.length !== 3 || max.length !== 3) return false;
  for (const axis of [min, max]) {
    for (const c of axis) {
      if (typeof c !== "number" || !Number.isFinite(c)) return false;
    }
  }
  return true;
}

/**
 * Validate an ingested box: finite, min ≤ max on every axis. A box that
 * fails this is a malformed declared input — refused by the adapter
 * (`scene_invalid` naming the asset), never rendered inside-out.
 */
export function ingestedBoxViolations(box: IngestedBoxGeometry): readonly string[] {
  const violations: string[] = [];
  for (let i = 0; i < 3; i++) {
    if ((box.min[i] ?? NaN) > (box.max[i] ?? NaN)) {
      violations.push(
        `ingested box axis ${String(i)} inverted: min ${String(box.min[i])} > max ${String(box.max[i])}`,
      );
    }
  }
  return violations;
}
