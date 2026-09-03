/**
 * Derived read views over the Reality Graph (AISE-011).
 *
 * Every view here is DERIVED from the canonical graph on read —
 * never stored alongside it (a stored summary would be a second
 * truth that can drift). Read views are pure functions of the
 * immutable graph:
 *
 * - containment is derived from `CONTAINS` relationships;
 * - opening summaries are derived from `OPENING_IN` relationships
 *   (the AISE-010 lesson: no stored counts to drift from children);
 * - the shared-contract interchange reference (`ModelObjectRef`)
 *   is derived for cross-platform transport.
 */
import type { ModelObjectRef } from "@aise/shared-contracts";
import type { EpistemicState } from "./epistemic.js";
import {
  graphEpistemicState,
  type RealityModelGraph,
  type RealityObject,
  type SpaceNode,
} from "./model.js";

/** All objects contained (directly) by a space. */
export function objectsInSpace(graph: RealityModelGraph, spaceId: string): readonly RealityObject[] {
  const objectIds = new Set(
    graph.relationships
      .filter((rel) => rel.type === "CONTAINS" && rel.fromId === spaceId)
      .map((rel) => rel.toId),
  );
  return graph.objects.filter((object) => objectIds.has(object.objectId));
}

/** The spaces that directly contain an object (usually one; walls may bound several). */
export function containingSpacesOf(graph: RealityModelGraph, objectId: string): readonly SpaceNode[] {
  const spaceIds = new Set(
    graph.relationships
      .filter((rel) => rel.type === "CONTAINS" && rel.toId === objectId)
      .map((rel) => rel.fromId),
  );
  return graph.spaces.filter((space) => spaceIds.has(space.spaceId));
}

/** All openings (doors/windows) registered in a wall. */
export function openingsOfWall(graph: RealityModelGraph, wallObjectId: string): readonly RealityObject[] {
  const openingIds = new Set(
    graph.relationships
      .filter((rel) => rel.type === "OPENING_IN" && rel.toId === wallObjectId)
      .map((rel) => rel.fromId),
  );
  return graph.objects.filter((object) => openingIds.has(object.objectId));
}

/** The parent wall of an opening (undefined when the graph changed inconsistently — guarded upstream). */
export function parentWallOf(graph: RealityModelGraph, openingObjectId: string): RealityObject | undefined {
  const parentId = graph.relationships.find(
    (rel) => rel.type === "OPENING_IN" && rel.fromId === openingObjectId,
  )?.toId;
  return graph.objects.find((object) => object.objectId === parentId);
}

/** The space-hierarchy ancestor chain of a space (root first, self excluded). */
export function spaceAncestry(graph: RealityModelGraph, spaceId: string): readonly SpaceNode[] {
  const byId = new Map(graph.spaces.map((space) => [space.spaceId, space] as const));
  const chain: SpaceNode[] = [];
  let current = byId.get(spaceId);
  while (current !== undefined && current.parentSpaceId !== undefined) {
    const parent = byId.get(current.parentSpaceId);
    if (parent === undefined) {
      break;
    }
    chain.unshift(parent);
    current = parent;
  }
  return Object.freeze(chain);
}

/** Objects of one class (canonical order preserved). */
export function objectsOfClass(graph: RealityModelGraph, objectClass: RealityObject["objectClass"]): readonly RealityObject[] {
  return graph.objects.filter((object) => object.objectClass === objectClass);
}

/** All relationships involving an entity. */
export function relationshipsOf(graph: RealityModelGraph, entityId: string): readonly RelationshipView[] {
  const views: RelationshipView[] = graph.relationships
    .filter((rel) => rel.fromId === entityId || rel.toId === entityId)
    .map((rel) => ({
      relationId: rel.relationId,
      type: rel.type,
      fromId: rel.fromId,
      toId: rel.toId,
      role: rel.fromId === entityId ? ("from" as const) : ("to" as const),
    }));
  return Object.freeze(views);
}

/** A flattened relationship view with the entity's role. */
export interface RelationshipView {
  readonly relationId: string;
  readonly type: string;
  readonly fromId: string;
  readonly toId: string;
  readonly role: "from" | "to";
}

/** The derived interchange reference for one object (shared contract shape). */
export function toModelObjectRef(
  graph: RealityModelGraph,
  object: RealityObject,
  version: number,
): ModelObjectRef {
  return {
    modelId: graph.modelId,
    version,
    objectId: object.objectId,
  };
}

/**
 * A model-level epistemic summary read view: the weakest state
 * represented anywhere in the graph. Derived — the graph itself
 * preserves per-entity states (this view is for observability,
 * not a replacement for them).
 */
export function modelEpistemicSummary(graph: RealityModelGraph): EpistemicState {
  return graphEpistemicState(graph);
}

/** Counts of the graph content (derived, for read models and logs). */
export function graphCounts(graph: RealityModelGraph): {
  readonly spaces: number;
  readonly objects: number;
  readonly relationships: number;
  readonly objectsByClass: Readonly<Record<string, number>>;
} {
  const objectsByClass: Record<string, number> = {};
  for (const object of graph.objects) {
    objectsByClass[object.objectClass] = (objectsByClass[object.objectClass] ?? 0) + 1;
  }
  return Object.freeze({
    spaces: graph.spaces.length,
    objects: graph.objects.length,
    relationships: graph.relationships.length,
    objectsByClass: Object.freeze(objectsByClass),
  });
}
