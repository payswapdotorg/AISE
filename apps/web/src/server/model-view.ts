/**
 * The read-only model view (AISE-015): the serializable
 * projection the browser receives.
 *
 * Everything here is DERIVED, READ-ONLY data: the browser never
 * receives canonical state, never receives a store handle, and
 * the view contains no mutation affordance — the types
 * themselves are frozen-shaped summaries of the canonical
 * Reality Graph (spaces, objects with geometry summaries,
 * properties with epistemic status, relationships).
 *
 * Epistemic states pass through EXACTLY as the graph records
 * them (AC-082: the workspace distinguishes
 * observed/inferred/confirmed/proposed content — passthrough,
 * never rewritten, never collapsed).
 */
import type { RealityModelGraph } from "@aise/engineering-model";

/** One object's geometry summary (SI-normalized read view). */
export interface ObjectGeometryView {
  readonly shape: string;
  /** Width along axisU (metres). */
  readonly widthM?: number;
  /** Height along axisV (metres). */
  readonly heightM?: number;
  /** Area (square metres). */
  readonly areaM2?: number;
  /** Plane elevation (metres) — floors/ceilings. */
  readonly elevationM?: number;
  /** Sill height (metres) — windows. */
  readonly sillM?: number;
  /** Head height (metres) — doors/windows. */
  readonly headM?: number;
  /**
   * World-space rendering data (metres): the plane's normal and
   * the rectangle's four corners in canonical order. Derived
   * read-only data for the 3D shell — the browser renders, it
   * never computes canonical geometry.
   */
  readonly normal: readonly [number, number, number];
  readonly corners: readonly (readonly [number, number, number])[];
}

/** One property assertion (read view — epistemic passthrough). */
export interface PropertyView {
  readonly key: string;
  readonly status: string;
  readonly kind?: string;
  readonly value?: number;
  readonly unit?: string;
  /** Standard-equivalent uncertainty in the quantity's own unit (when stated). */
  readonly uncertainty?: string;
  /** Presence state for valueless assertions (passthrough). */
  readonly presence?: string;
  readonly method?: string;
  readonly evidenceRefs?: readonly string[];
}

/** One object (read view). */
export interface ObjectView {
  readonly objectId: string;
  readonly objectClass: string;
  readonly name?: string;
  readonly epistemicState: string;
  readonly contentHash: string;
  readonly geometry?: ObjectGeometryView;
  readonly properties: readonly PropertyView[];
}

/** One space node (read view). */
export interface SpaceView {
  readonly spaceId: string;
  readonly kind: string;
  readonly name?: string;
  readonly properties: readonly PropertyView[];
}

/** One relationship (read view). */
export interface RelationshipView {
  readonly relationId: string;
  readonly type: string;
  readonly fromId: string;
  readonly toId: string;
}

/** The full read-only model-version view. */
export interface ModelVersionView {
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  readonly digest: string;
  readonly spaces: readonly SpaceView[];
  readonly objects: readonly ObjectView[];
  readonly relationships: readonly RelationshipView[];
  /** Epistemic composition (honest counts — never collapsed). */
  readonly epistemicSummary: {
    readonly objects: Readonly<Record<string, number>>;
    readonly assertions: Readonly<Record<string, number>>;
  };
}

/** Projects one canonical graph into the read-only browser view. */
export function projectModelVersion(graph: RealityModelGraph, version: number): ModelVersionView {
  const spaces: SpaceView[] = graph.spaces.map((space) => ({
    spaceId: space.spaceId,
    kind: space.kind,
    ...(space.name !== undefined ? { name: space.name } : {}),
    properties: (space.properties ?? []).map(projectProperty),
  }));

  const objects: ObjectView[] = graph.objects.map((object) => {
    const structured = object.geometry?.structured;
    const geometry: ObjectGeometryView | undefined =
      structured !== undefined
        ? {
            shape: structured.shape,
            ...(structured.width !== undefined
              ? { widthM: siMeters(structured.width.value, structured.width.unit) }
              : {}),
            ...(structured.height !== undefined
              ? { heightM: siMeters(structured.height.value, structured.height.unit) }
              : {}),
            ...(structured.area !== undefined
              ? { areaM2: siSquareMeters(structured.area.value, structured.area.unit) }
              : {}),
            ...(structured.elevation !== undefined
              ? { elevationM: siMeters(structured.elevation.value, structured.elevation.unit) }
              : {}),
            ...(structured.sillHeight !== undefined
              ? { sillM: siMeters(structured.sillHeight.value, structured.sillHeight.unit) }
              : {}),
            ...(structured.headHeight !== undefined
              ? { headM: siMeters(structured.headHeight.value, structured.headHeight.unit) }
              : {}),
            normal: vec3Of(structured.frame.normal),
            corners: structured.rectangle.corners.map((corner) => point3Of(corner)),
          }
        : undefined;
    return {
      objectId: object.objectId,
      objectClass: object.objectClass,
      ...(object.name !== undefined ? { name: object.name } : {}),
      epistemicState: object.epistemicState,
      contentHash: object.contentHash,
      ...(geometry !== undefined ? { geometry } : {}),
      properties: object.properties.map(projectProperty),
    };
  });

  const relationships: RelationshipView[] = graph.relationships.map((relationship) => ({
    relationId: relationship.relationId,
    type: relationship.type,
    fromId: relationship.fromId,
    toId: relationship.toId,
  }));

  const objectCounts: Record<string, number> = {};
  for (const object of objects) {
    objectCounts[object.epistemicState] = (objectCounts[object.epistemicState] ?? 0) + 1;
  }
  const assertionCounts: Record<string, number> = {};
  for (const space of spaces) {
    for (const property of space.properties) {
      assertionCounts[property.status] = (assertionCounts[property.status] ?? 0) + 1;
    }
  }
  for (const object of objects) {
    for (const property of object.properties) {
      assertionCounts[property.status] = (assertionCounts[property.status] ?? 0) + 1;
    }
  }

  return {
    modelId: graph.modelId,
    projectId: graph.projectId,
    version,
    digest: graph.digest,
    spaces,
    objects,
    relationships,
    epistemicSummary: { objects: objectCounts, assertions: assertionCounts },
  };
}

/** Projects one property assertion (epistemic passthrough, never collapsed). */
function projectProperty(assertion: {
  key: string;
  status: string;
  kind?: string;
  quantity?: { value: number; unit: string; uncertainty?: { kind: string; u?: number; U?: number; coverageFactor?: number; lowerOffset?: number; upperOffset?: number } };
  presence?: string;
  method?: string;
  evidenceRefs?: readonly string[];
}): PropertyView {
  const quantity = assertion.quantity;
  return {
    key: assertion.key,
    status: assertion.status,
    ...(assertion.kind !== undefined ? { kind: assertion.kind } : {}),
    ...(quantity !== undefined
      ? {
          value: quantity.value,
          unit: quantity.unit,
          ...(quantity.uncertainty !== undefined
            ? { uncertainty: describeUncertainty(quantity.uncertainty) }
            : {}),
        }
      : {}),
    ...(assertion.presence !== undefined ? { presence: assertion.presence } : {}),
    ...(assertion.method !== undefined ? { method: assertion.method } : {}),
    ...(assertion.evidenceRefs !== undefined ? { evidenceRefs: [...assertion.evidenceRefs] } : {}),
  };
}

/** Renders an uncertainty as a human-readable, honest string (never converted across kinds). */
function describeUncertainty(uncertainty: {
  kind: string;
  u?: number;
  U?: number;
  coverageFactor?: number;
  lowerOffset?: number;
  upperOffset?: number;
}): string {
  switch (uncertainty.kind) {
    case "standard":
      return `± ${uncertainty.u} (1σ)`;
    case "expanded":
      return `± ${uncertainty.U} (k=${uncertainty.coverageFactor})`;
    case "tolerance":
      return `[${uncertainty.lowerOffset}, +${uncertainty.upperOffset}] (tolerance)`;
    default:
      return uncertainty.kind;
  }
}

/** Exact SI conversion (the frozen unit vocabulary). */
function siMeters(value: number, unit: string): number {
  switch (unit) {
    case "meter":
      return value;
    case "millimeter":
      return value * 0.001;
    case "centimeter":
      return value * 0.01;
    case "inch":
      return value * 0.0254;
    case "foot":
      return value * 0.3048;
    default:
      return value;
  }
}

function siSquareMeters(value: number, unit: string): number {
  switch (unit) {
    case "square_meter":
      return value;
    case "square_millimeter":
      return value * 0.001 * 0.001;
    case "square_centimeter":
      return value * 0.01 * 0.01;
    case "square_inch":
      return value * 0.0254 * 0.0254;
    case "square_foot":
      return value * 0.3048 * 0.3048;
    default:
      return value;
  }
}

function vec3Of(vector: { x: number; y: number; z: number }): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function point3Of(point: { x: number; y: number; z: number }): [number, number, number] {
  return [point.x, point.y, point.z];
}
