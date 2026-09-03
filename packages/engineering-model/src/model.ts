/**
 * The Reality Graph model core (AISE-011).
 *
 * `RealityObject` is the central abstraction (architecture §5):
 * objects reference geometry (structured + content-pinned asset
 * references), carry property assertions (value/unit/status/
 * confidence?/uncertainty?/evidence/method), connect through
 * typed relationships, and preserve epistemic state on every
 * entity — inference never collapses into truth.
 *
 * The graph is one model VERSION's content:
 *
 * ```text
 * RealityModelGraph
 *   ├── spaces        (site/facility/building/level/room hierarchy)
 *   ├── objects       (RealityObject — canonical ordered)
 *   └── relationships (typed object/space references — canonical ordered)
 * ```
 *
 * Assembly (`assembleModelGraph`) is the fail-closed constructor:
 * it validates EVERY invariant on the producing path — identity
 * uniqueness, referential integrity, relationship type
 * constraints, space-hierarchy descent and acyclicity, property
 * assertion discipline, provenance completeness, epistemic
 * validity — then orders the content canonically (order is
 * content: the same graph content in any input order yields the
 * identical digest), computes the graph digest, and deep-freezes
 * the result. Committed graph content is immutable by
 * construction.
 *
 * Single-source-of-truth decisions (documented for review):
 * - containment lives ONLY in `CONTAINS` relationships (objects
 *   carry no `containingSpaceId` duplicate; read views derive it);
 * - opening counts and summaries are DERIVED from relationships
 *   (never stored — no dual-truth drift);
 * - geometric quantities (width/height/area/elevation/…) live in
 *   the structured geometry record; property assertions carry
 *   non-geometric values (and room-level measurements on spaces).
 */
import { EngineeringModelError } from "./errors.js";
import {
  assertValidEpistemicState,
  deriveWeakestState,
  type EpistemicState,
} from "./epistemic.js";
import {
  propertyAssertion,
  type PropertyAssertion,
} from "./assertions.js";
import {
  geometryAssetRef,
  structuredPlanarGeometry,
  type GeometryAssetRef,
  type StructuredPlanarGeometry,
  type StructuredPlanarGeometryInput,
} from "./geometry.js";
import {
  validateModelProvenance,
  type ModelInputRef,
  type ModelProvenance,
} from "./provenance.js";
import { canonicalContentHash } from "./canonical.js";
import { deepFreeze, deriveObjectId, deriveRelationId } from "./identity.js";
import type { ModelLengthUnit } from "./quantities.js";
import type { Vec3 } from "./geometry.js";

/** Space kinds (architecture §4.4: projects/sites/facilities/levels/spaces). */
export type SpaceKind = "SITE" | "FACILITY" | "BUILDING" | "LEVEL" | "ROOM";

/** Reality object classes of the v1 architectural vocabulary (AISE-010 surface). */
export type RealityObjectClass = "WALL" | "FLOOR" | "CEILING" | "DOOR" | "WINDOW";

/** Typed object↔object/space relationships (AC-051). */
export type RelationshipType = "CONTAINS" | "OPENING_IN";

const SPACE_KIND_RANK: Record<SpaceKind, number> = {
  SITE: 0,
  FACILITY: 1,
  BUILDING: 2,
  LEVEL: 3,
  ROOM: 4,
};

/** Canonical class rank for object ordering (FLOOR → CEILING → WALL → DOOR → WINDOW). */
const OBJECT_CLASS_RANK: Record<RealityObjectClass, number> = {
  FLOOR: 0,
  CEILING: 1,
  WALL: 2,
  DOOR: 3,
  WINDOW: 4,
};

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** The declared coordinate frame of geometry contained in a space. */
export interface SpaceCoordinateFrame {
  /** Declared up axis (gravity-negative direction), unit vector. */
  readonly up: Vec3;
  /** Length unit of geometry coordinates in this space. */
  readonly unit: ModelLengthUnit;
}

/** A node of the space hierarchy. */
export interface SpaceNode {
  /** Caller-declared identity (unique within the model). */
  readonly spaceId: string;
  readonly kind: SpaceKind;
  /** Human-facing name (optional). */
  readonly name?: string;
  /** Parent space (must exist, must rank strictly lower). */
  readonly parentSpaceId?: string;
  /** Declared coordinate frame for contained geometry (declaration, never inference). */
  readonly frame?: SpaceCoordinateFrame;
  /** Space-level property assertions (e.g. room height). */
  readonly properties?: readonly PropertyAssertion[];
}

/** A node of the space hierarchy (constructor input). */
export type SpaceNodeInput = SpaceNode;

/** The geometry block of a reality object (both mechanisms are optional). */
export interface ModelGeometry {
  /** Structured, editable geometry (canonical representation). */
  readonly structured?: StructuredPlanarGeometry;
  /** Content-pinned references to reconstruction geometry assets. */
  readonly assetRefs?: readonly GeometryAssetRef[];
}

/**
 * The central object abstraction: geometry, properties,
 * relationships, epistemic state, provenance — all preserved.
 */
export interface RealityObject {
  /** Deterministic identity (model-scoped, content-pinned to the source). */
  readonly objectId: string;
  readonly objectClass: RealityObjectClass;
  /** Human-facing name (optional). */
  readonly name?: string;
  readonly geometry?: ModelGeometry;
  readonly properties: readonly PropertyAssertion[];
  /**
   * The epistemic state of the object's EXISTENCE and GEOMETRY (the
   * existence assertion). Each property assertion carries its own
   * status; this field never overrides those.
   */
  readonly epistemicState: EpistemicState;
  /** Canonical content hash of the object's asserted content. */
  readonly contentHash: string;
  readonly provenance: ModelProvenance;
}

/** Constructor input for a reality object (identity derived from the source pin). */
export interface RealityObjectInput {
  readonly objectClass: RealityObjectClass;
  readonly name?: string;
  readonly structuredGeometry?: StructuredPlanarGeometryInput;
  readonly assetRefs?: readonly GeometryAssetRef[];
  readonly properties?: readonly PropertyAssertion[];
  readonly epistemicState: EpistemicState;
  readonly provenance: ModelProvenance;
}

/** A typed relationship between entities (derived identity, no payload in v1). */
export interface Relationship {
  /** Deterministic identity derived from (type, fromId, toId). */
  readonly relationId: string;
  readonly type: RelationshipType;
  readonly fromId: string;
  readonly toId: string;
}

/** One model version's content (the graph). */
export interface RealityModelGraph {
  readonly modelId: string;
  readonly projectId: string;
  /** Spaces in canonical order (by spaceId). */
  readonly spaces: readonly SpaceNode[];
  /** Objects in canonical order (class rank, then objectId). */
  readonly objects: readonly RealityObject[];
  /** Relationships in canonical order (type, fromId, toId). */
  readonly relationships: readonly Relationship[];
  /** Canonical content hash of the ordered graph content. */
  readonly digest: string;
}

/** Input for `assembleModelGraph`. */
export interface AssembleModelGraphInput {
  readonly modelId: string;
  readonly projectId: string;
  readonly spaces: readonly SpaceNodeInput[];
  readonly objects: readonly RealityObjectInput[];
  readonly relationships: readonly RelationshipInput[];
}

/** Input for one relationship (identity derived from the triple). */
export interface RelationshipInput {
  readonly type: RelationshipType;
  readonly fromId: string;
  readonly toId: string;
}

/** Builds and validates a space node (fail closed). */
export function makeSpaceNode(space: SpaceNodeInput): SpaceNode {
  if (typeof space.spaceId !== "string" || !ID_PATTERN.test(space.spaceId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `spaceId must match ${ID_PATTERN}: ${String(space.spaceId)}`,
      { details: { field: "spaceId", value: String(space.spaceId) } },
    );
  }
  if (!isSpaceKind(space.kind)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `space kind must be one of SITE|FACILITY|BUILDING|LEVEL|ROOM: ${String(space.kind)}`,
      { details: { field: "kind", value: String(space.kind) } },
    );
  }
  if (space.name !== undefined && (typeof space.name !== "string" || space.name.length === 0)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `space name must be a non-empty string when present: ${String(space.name)}`,
      { details: { field: "name", value: String(space.name) } },
    );
  }
  if (space.frame !== undefined) {
    validateSpaceFrame(space.frame);
  }
  if (space.parentSpaceId !== undefined && !ID_PATTERN.test(space.parentSpaceId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `parentSpaceId must match ${ID_PATTERN}: ${String(space.parentSpaceId)}`,
      { details: { field: "parentSpaceId", value: String(space.parentSpaceId) } },
    );
  }
  const properties = (space.properties ?? []).map(propertyAssertion);
  assertUniquePropertyKeys(properties, `space ${space.spaceId}`);
  return space.properties === undefined
    ? { ...space }
    : { ...space, properties: Object.freeze([...properties]) };
}

/**
 * Builds and validates a reality object (fail closed). The object
 * id is derived from the model id, class, and provenance source
 * pin — identity is lineage, not mutable content.
 */
export function makeRealityObject(
  modelId: string,
  input: RealityObjectInput,
): RealityObject {
  if (typeof modelId !== "string" || !ID_PATTERN.test(modelId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `modelId must match ${ID_PATTERN}: ${String(modelId)}`,
      { details: { field: "modelId", value: String(modelId) } },
    );
  }
  if (!isRealityObjectClass(input.objectClass)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `objectClass must be one of WALL|FLOOR|CEILING|DOOR|WINDOW: ${String(input.objectClass)}`,
      { details: { field: "objectClass", value: String(input.objectClass) } },
    );
  }
  assertValidEpistemicState(input.epistemicState, "object.epistemicState");
  validateModelProvenance(input.provenance);

  const structured =
    input.structuredGeometry !== undefined
      ? structuredPlanarGeometry(input.structuredGeometry)
      : undefined;
  const assetRefs = (input.assetRefs ?? []).map(geometryAssetRef);
  const properties = (input.properties ?? []).map(propertyAssertion);
  const objectId = deriveObjectId({
    modelId,
    objectClass: input.objectClass,
    ...upstreamSourcePin(input.provenance),
  });

  const object: RealityObject = {
    objectId,
    objectClass: input.objectClass,
    name: input.name,
    geometry:
      structured === undefined && assetRefs.length === 0
        ? undefined
        : Object.freeze({
            ...(structured !== undefined ? { structured } : {}),
            ...(assetRefs.length > 0 ? { assetRefs: Object.freeze([...assetRefs]) } : {}),
          }),
    properties: Object.freeze([...properties]),
    epistemicState: input.epistemicState,
    contentHash: objectContentHash(input),
    provenance: input.provenance,
  };
  assertUniquePropertyKeys(properties, `object ${objectId}`);
  return object;
}

/** Property keys are unique per entity (fail closed). */
function assertUniquePropertyKeys(
  properties: readonly { key: string }[],
  context: string,
): void {
  const keys = new Set<string>();
  for (const property of properties) {
    if (keys.has(property.key)) {
      throw new EngineeringModelError(
        "IDENTITY_COLLISION",
        `${context}: duplicate property key "${property.key}"`,
        { details: { field: "properties", value: property.key } },
      );
    }
    keys.add(property.key);
  }
}

/** Builds and validates a relationship (identity derived from the triple). */
export function makeRelationship(input: RelationshipInput): Relationship {
  if (input.type !== "CONTAINS" && input.type !== "OPENING_IN") {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `relationship type must be CONTAINS or OPENING_IN: ${String(input.type)}`,
      { details: { field: "type", value: String(input.type) } },
    );
  }
  if (!ID_PATTERN.test(input.fromId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `relationship fromId must match ${ID_PATTERN}: ${String(input.fromId)}`,
      { details: { field: "fromId", value: String(input.fromId) } },
    );
  }
  if (!ID_PATTERN.test(input.toId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `relationship toId must match ${ID_PATTERN}: ${String(input.toId)}`,
      { details: { field: "toId", value: String(input.toId) } },
    );
  }
  if (input.fromId === input.toId) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      "a relationship cannot reference itself",
      { details: { field: "fromId", value: input.fromId } },
    );
  }
  return {
    relationId: deriveRelationId(input.type, input.fromId, input.toId),
    ...input,
  };
}

/**
 * Assembles one model version's graph: validates every invariant,
 * orders the content canonically, computes the digest, and
 * deep-freezes the result. The same content in any input order
 * produces the identical digest (order is normalized, not
 * content).
 */
export function assembleModelGraph(input: AssembleModelGraphInput): RealityModelGraph {
  const { modelId, projectId } = input;
  if (!ID_PATTERN.test(modelId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `modelId must match ${ID_PATTERN}: ${String(modelId)}`,
      { details: { field: "modelId", value: String(modelId) } },
    );
  }
  if (!ID_PATTERN.test(projectId)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `projectId must match ${ID_PATTERN}: ${String(projectId)}`,
      { details: { field: "projectId", value: String(projectId) } },
    );
  }

  const spaces = input.spaces.map(makeSpaceNode);
  const objects = input.objects.map((objectInput) => makeRealityObject(modelId, objectInput));
  const relationships = input.relationships.map(makeRelationship);

  // --- Referential integrity and uniqueness ------------------------------
  const entityIds = new Set<string>();
  for (const space of spaces) {
    if (entityIds.has(space.spaceId)) {
      throw new EngineeringModelError(
        "IDENTITY_COLLISION",
        `duplicate entity id: ${space.spaceId}`,
        { details: { field: "spaceId", value: space.spaceId } },
      );
    }
    entityIds.add(space.spaceId);
  }
  const spaceById = new Map(spaces.map((space) => [space.spaceId, space] as const));
  const objectIds = new Set<string>();
  for (const object of objects) {
    if (entityIds.has(object.objectId)) {
      throw new EngineeringModelError(
        "IDENTITY_COLLISION",
        `duplicate entity id: ${object.objectId}`,
        { details: { field: "objectId", value: object.objectId } },
      );
    }
    objectIds.add(object.objectId);
    entityIds.add(object.objectId);
  }
  const objectById = new Map(objects.map((object) => [object.objectId, object] as const));

  // --- Space hierarchy: existence, descent, acyclicity -------------------
  for (const space of spaces) {
    if (space.parentSpaceId === undefined) {
      continue;
    }
    const parent = spaceById.get(space.parentSpaceId);
    if (parent === undefined) {
      throw new EngineeringModelError(
        "REFERENTIAL_INTEGRITY",
        `space ${space.spaceId} references unknown parent ${space.parentSpaceId}`,
        { details: { field: "parentSpaceId", value: space.parentSpaceId } },
      );
    }
    if (SPACE_KIND_RANK[parent.kind] >= SPACE_KIND_RANK[space.kind]) {
      throw new EngineeringModelError(
        "MODEL_INVALID",
        `space hierarchy must descend: ${space.kind} "${space.spaceId}" cannot sit under ${parent.kind} "${parent.spaceId}"`,
        { details: { field: "parentSpaceId", value: space.parentSpaceId } },
      );
    }
    if (space.spaceId === space.parentSpaceId) {
      throw new EngineeringModelError(
        "MODEL_INVALID",
        `space ${space.spaceId} cannot be its own parent`,
        { details: { field: "parentSpaceId", value: space.parentSpaceId } },
      );
    }
  }
  assertNoSpaceCycles(spaces);

  // --- Relationships: endpoints, type constraints, uniqueness ------------
  const triples = new Set<string>();
  for (const relationship of relationships) {
    const triple = `${relationship.type}|${relationship.fromId}|${relationship.toId}`;
    if (triples.has(triple)) {
      throw new EngineeringModelError(
        "IDENTITY_COLLISION",
        `duplicate relationship: ${triple}`,
        { details: { field: "relationship", value: triple } },
      );
    }
    triples.add(triple);

    switch (relationship.type) {
      case "CONTAINS": {
        const from = spaceById.get(relationship.fromId);
        if (from === undefined) {
          throw new EngineeringModelError(
            "REFERENTIAL_INTEGRITY",
            `CONTAINS must originate at a space; ${relationship.fromId} is not a space`,
            { details: { field: "fromId", value: relationship.fromId } },
          );
        }
        if (!objectById.has(relationship.toId)) {
          throw new EngineeringModelError(
            "REFERENTIAL_INTEGRITY",
            `CONTAINS must target an object; ${relationship.toId} is not an object`,
            { details: { field: "toId", value: relationship.toId } },
          );
        }
        break;
      }
      case "OPENING_IN": {
        const from = objectById.get(relationship.fromId);
        if (from === undefined) {
          throw new EngineeringModelError(
            "REFERENTIAL_INTEGRITY",
            `OPENING_IN must originate at an object; ${relationship.fromId} is not an object`,
            { details: { field: "fromId", value: relationship.fromId } },
          );
        }
        if (from.objectClass !== "DOOR" && from.objectClass !== "WINDOW") {
          throw new EngineeringModelError(
            "MODEL_INVALID",
            `OPENING_IN must originate at a DOOR or WINDOW; ${relationship.fromId} is a ${from.objectClass}`,
            { details: { field: "fromId", value: relationship.fromId } },
          );
        }
        const to = objectById.get(relationship.toId);
        if (to === undefined) {
          throw new EngineeringModelError(
            "REFERENTIAL_INTEGRITY",
            `OPENING_IN must target an object; ${relationship.toId} is not an object`,
            { details: { field: "toId", value: relationship.toId } },
          );
        }
        if (to.objectClass !== "WALL") {
          throw new EngineeringModelError(
            "MODEL_INVALID",
            `OPENING_IN must target a WALL; ${relationship.toId} is a ${to.objectClass}`,
            { details: { field: "toId", value: relationship.toId } },
          );
        }
        break;
      }
    }
  }

  // --- Semantic consistency: no orphan objects, no orphan openings -------
  const contained = new Set(
    relationships.filter((rel) => rel.type === "CONTAINS").map((rel) => rel.toId),
  );
  for (const object of objects) {
    if (!contained.has(object.objectId)) {
      throw new EngineeringModelError(
        "REFERENTIAL_INTEGRITY",
        `object ${object.objectId} is contained by no space — every object belongs to at least one space`,
        { details: { field: "objectId", value: object.objectId } },
      );
    }
  }
  for (const object of objects) {
    if (object.objectClass === "DOOR" || object.objectClass === "WINDOW") {
      const hasParent = relationships.some(
        (rel) => rel.type === "OPENING_IN" && rel.fromId === object.objectId,
      );
      if (!hasParent) {
        throw new EngineeringModelError(
          "MODEL_INVALID",
          `${object.objectClass} ${object.objectId} has no OPENING_IN parent wall — doors and windows are openings in walls by definition`,
          { details: { field: "objectId", value: object.objectId } },
        );
      }
    }
  }

  // --- Canonical ordering (order is content — normalized) ----------------
  const orderedSpaces = [...spaces].sort((a, b) => compareStrings(a.spaceId, b.spaceId));
  const orderedObjects = [...objects].sort(
    (a, b) =>
      OBJECT_CLASS_RANK[a.objectClass] - OBJECT_CLASS_RANK[b.objectClass] ||
      compareStrings(a.objectId, b.objectId),
  );
  const orderedRelationships = [...relationships].sort(
    (a, b) =>
      compareStrings(a.type, b.type) ||
      compareStrings(a.fromId, b.fromId) ||
      compareStrings(a.toId, b.toId),
  );

  const digest = graphContentDigest(modelId, projectId, orderedSpaces, orderedObjects, orderedRelationships);

  const graph: RealityModelGraph = {
    modelId,
    projectId,
    spaces: Object.freeze([...orderedSpaces]),
    objects: Object.freeze([...orderedObjects]),
    relationships: Object.freeze([...orderedRelationships]),
    digest,
  };
  return deepFreeze(graph);
}

/**
 * The canonical graph digest over ordered content (identity of a
 * model version's content). Exported for store/adapter use.
 */
export function graphContentDigest(
  modelId: string,
  projectId: string,
  spaces: readonly SpaceNode[],
  objects: readonly RealityObject[],
  relationships: readonly Relationship[],
): string {
  return canonicalContentHash({
    modelId,
    projectId,
    spaces,
    objects,
    relationships,
  });
}

/**
 * The weakest epistemic state represented in a graph (read view:
 * derived, never stored). A graph with no assertions makes no
 * reality claim (PROPOSED).
 */
export function graphEpistemicState(graph: RealityModelGraph): EpistemicState {
  const states: EpistemicState[] = [];
  for (const object of graph.objects) {
    states.push(object.epistemicState);
    for (const property of object.properties) {
      states.push(property.status);
    }
  }
  for (const space of graph.spaces) {
    for (const property of space.properties ?? []) {
      states.push(property.status);
    }
  }
  return deriveWeakestState(states);
}

function objectContentHash(input: RealityObjectInput): string {
  return canonicalContentHash({
    objectClass: input.objectClass,
    name: input.name,
    structuredGeometry: input.structuredGeometry,
    assetRefs: input.assetRefs,
    properties: input.properties,
    epistemicState: input.epistemicState,
    provenance: input.provenance,
  });
}

function assertNoSpaceCycles(spaces: readonly SpaceNode[]): void {
  const byId = new Map(spaces.map((space) => [space.spaceId, space] as const));
  for (const space of spaces) {
    const seen = new Set<string>([space.spaceId]);
    let current = space.parentSpaceId !== undefined ? byId.get(space.parentSpaceId) : undefined;
    while (current !== undefined) {
      if (seen.has(current.spaceId)) {
        throw new EngineeringModelError(
          "MODEL_INVALID",
          `space hierarchy contains a cycle at ${current.spaceId}`,
          { details: { field: "spaceId", value: current.spaceId } },
        );
      }
      seen.add(current.spaceId);
      current = current.parentSpaceId !== undefined ? byId.get(current.parentSpaceId) : undefined;
    }
  }
}

/** Validates a declared space coordinate frame (fail closed). */
function validateSpaceFrame(frame: SpaceCoordinateFrame): void {
  const up = frame.up;
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(up[axis])) {
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `space frame up.${axis} must be finite: ${String(up[axis])}`,
        { details: { field: `frame.up.${axis}`, value: String(up[axis]) } },
      );
    }
  }
  const magnitude = Math.hypot(up.x, up.y, up.z);
  if (Math.abs(magnitude - 1) > 1e-6) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `space frame up axis must be a unit vector (|v| = ${magnitude})`,
      { details: { field: "frame.up", magnitude: String(magnitude) } },
    );
  }
  if (
    frame.unit !== "meter" &&
    frame.unit !== "millimeter" &&
    frame.unit !== "centimeter" &&
    frame.unit !== "inch" &&
    frame.unit !== "foot"
  ) {
    throw new EngineeringModelError(
      "UNIT_INVALID",
      `space frame unit must be a length unit: ${String(frame.unit)}`,
      { details: { field: "frame.unit", value: String(frame.unit) } },
    );
  }
}

function isSpaceKind(kind: unknown): kind is SpaceKind {
  return (
    kind === "SITE" ||
    kind === "FACILITY" ||
    kind === "BUILDING" ||
    kind === "LEVEL" ||
    kind === "ROOM"
  );
}

function isRealityObjectClass(value: unknown): value is RealityObjectClass {
  return (
    value === "WALL" ||
    value === "FLOOR" ||
    value === "CEILING" ||
    value === "DOOR" ||
    value === "WINDOW"
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The identity convention: a model object is always derived FROM an
 * upstream object reference — the FIRST provenance input must be
 * an object ref (validated: `PROVENANCE_INCOMPLETE` otherwise),
 * and the object identity is content-pinned to that source pin
 * (plus modelId and objectClass). Identity is lineage: later
 * property additions or corrections never change it, and a
 * re-extraction that changes upstream content yields a new
 * identity (honest discontinuity, reported by version diffs).
 */
function upstreamSourcePin(
  provenance: ModelProvenance,
): { sourceServiceId: string; sourceMethod: string; sourceObjectId: string; sourceContentHash: string } {
  const first: ModelInputRef | undefined = provenance.inputs[0];
  if (first === undefined) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      "object provenance must cite the upstream object as its first input (no inputs)",
      { details: { field: "provenance.inputs", value: "empty" } },
    );
  }
  if (first.kind !== "object") {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `object provenance must cite the upstream object as its first input (found kind "${String(first.kind)}")`,
      { details: { field: "provenance.inputs[0].kind", value: String(first.kind) } },
    );
  }
  return {
    sourceServiceId: first.serviceId,
    sourceMethod: first.method,
    sourceObjectId: first.objectId,
    sourceContentHash: first.contentHash,
  };
}
