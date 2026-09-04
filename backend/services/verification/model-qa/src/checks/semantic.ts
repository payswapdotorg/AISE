/**
 * SEMANTIC consistency checks (AISE-014 family 3).
 *
 * Detects contradictions between what an entity IS (its class,
 * its declared geometry fields, its asserted properties) and
 * what its content claims:
 *
 * - object-kind/geometry incompatibilities (the model's own
 *   field semantics: `elevation` belongs to FLOOR/CEILING,
 *   `sillHeight` to WINDOW, `headHeight` to DOOR/WINDOW);
 * - property/geometry contradictions (an asserted property whose
 *   key names a geometry dimension of the same object, in a
 *   comparable unit family, disagrees with the geometry's
 *   quantity after exact SI conversion).
 *
 * Duplicate or conflicting property keys per entity are
 * structurally excluded by the graph boundary (the model's
 * whole-graph validator rejects duplicate keys per entity), and
 * that exclusion is regression-tested — QA does not re-check
 * what the boundary already proves.
 */
import type { RealityObject, StructuredPlanarGeometry } from "@aise/engineering-model";
import { makeFinding, type QaFinding } from "../findings.js";
import type { QaView } from "../view.js";
import type { AssuranceProfile } from "@aise/shared-contracts";
import {
  areaToSiSquareMeters,
  formatQuantity,
  lengthToSiMeters,
  qaUnitFamily,
  type QaUnit,
} from "../units.js";

/** Relative tolerance for cross-quantity float comparisons. */
const RELATIVE_TOLERANCE = 1e-9;

/** The geometry-dimension keys a property may semantically mirror. */
const DIMENSION_PROPERTY_KEYS = Object.freeze([
  "width",
  "height",
  "area",
  "elevation",
  "sillHeight",
  "headHeight",
] as const);

/** Runs all semantic-family checks over the view. */
export function runSemanticChecks(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  return [...checkKindFieldCompatibility(view, profile), ...checkPropertyGeometry(view, profile)];
}

// --- Kind/field compatibility matrix -----------------------------------------------

function checkKindFieldCompatibility(
  view: QaView,
  profile: AssuranceProfile,
): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined) {
      continue;
    }
    const incompatible = kindFieldViolations(object, geometry);
    for (const [field, allowed] of incompatible) {
      findings.push(
        makeFinding({
          code: "KIND_FIELD_INCOMPATIBLE",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          expected: `${field} only on ${allowed.join("/")}`,
          actual: `${field} on ${object.objectClass}`,
          detail: `${object.objectClass} ${object.objectId} carries geometry field "${field}" which does not belong to its class (belongs to ${allowed.join("/")})`,
        }),
      );
    }
  }
  return findings;
}

function kindFieldViolations(
  object: RealityObject,
  geometry: StructuredPlanarGeometry,
): ReadonlyArray<readonly [string, readonly string[]]> {
  const violations: Array<[string, readonly string[]]> = [];
  if (geometry.elevation !== undefined && object.objectClass !== "FLOOR" && object.objectClass !== "CEILING") {
    violations.push(["elevation", ["FLOOR", "CEILING"]]);
  }
  if (geometry.sillHeight !== undefined && object.objectClass !== "WINDOW") {
    violations.push(["sillHeight", ["WINDOW"]]);
  }
  if (
    geometry.headHeight !== undefined &&
    object.objectClass !== "DOOR" &&
    object.objectClass !== "WINDOW"
  ) {
    violations.push(["headHeight", ["DOOR", "WINDOW"]]);
  }
  return violations;
}

// --- Property assertions vs geometry quantities --------------------------------------

function checkPropertyGeometry(
  view: QaView,
  profile: AssuranceProfile,
): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined) {
      continue;
    }
    for (const assertion of object.properties) {
      if (assertion.quantity === undefined) {
        continue; // presence assertions carry no value to contradict
      }
      const geometryQuantity = geometryQuantityForKey(geometry, assertion.key);
      if (geometryQuantity === undefined) {
        continue;
      }
      const propertyUnit = assertion.quantity.unit as QaUnit;
      const geometryUnit = geometryQuantity.unit as QaUnit;
      const propertyFamily = qaUnitFamily(propertyUnit);
      const geometryFamily = qaUnitFamily(geometryUnit);
      if (propertyFamily !== geometryFamily) {
        continue; // a property in another family is not a contradiction of this geometry
      }
      const propertySi = toSi(assertion.quantity.value, propertyUnit);
      const geometrySi = toSi(geometryQuantity.value, geometryUnit);
      if (!withinTolerance(propertySi, geometrySi)) {
        findings.push(
          makeFinding({
            code: "PROPERTY_GEOMETRY_CONTRADICTION",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "property", objectId: object.objectId, propertyKey: assertion.key },
            related: [{ kind: "object", objectId: object.objectId }],
            expected: formatQuantity(geometrySi, siUnitOf(geometryFamily)),
            actual: formatQuantity(propertySi, siUnitOf(geometryFamily)),
            epistemic: { assertionStatus: assertion.status },
            detail: `asserted property "${assertion.key}" of ${object.objectId} (${assertion.status}) disagrees with the object's declared geometry quantity`,
          }),
        );
      }
    }
  }
  return findings;
}

/** The geometry quantity a property key semantically mirrors, if any. */
function geometryQuantityForKey(
  geometry: StructuredPlanarGeometry,
  key: string,
): { value: number; unit: QaUnit } | undefined {
  if (!DIMENSION_PROPERTY_KEYS.includes(key as (typeof DIMENSION_PROPERTY_KEYS)[number])) {
    return undefined;
  }
  const quantity = (geometry as unknown as Record<string, { value: number; unit: QaUnit } | undefined>)[key];
  return quantity ?? undefined;
}

function toSi(value: number, unit: QaUnit): number {
  const family = qaUnitFamily(unit);
  return family === "area" ? areaToSiSquareMeters(value, unit) : lengthToSiMeters(value, unit);
}

function siUnitOf(family: "length" | "area" | "angle"): "meter" | "square_meter" {
  return family === "area" ? "square_meter" : "meter";
}

function withinTolerance(actual: number, expected: number): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1);
  return Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale + 1e-12;
}
