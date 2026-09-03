/**
 * Whole-graph validation for the Reality Graph core (AISE-011).
 *
 * `validateRealityGraph` re-validates a complete graph record —
 * every invariant `assembleModelGraph` enforces on the producing
 * path. Its purpose is the PERSISTENCE BOUNDARY (the AISE-008
 * lesson, hardened in PR #9's review): the store does not trust
 * the caller; a graph presented for commit is fully re-validated
 * before it is indexed or stored. A tampered or malformed graph
 * never enters the store.
 *
 * Additionally it proves immutability: committed graph content is
 * deep-frozen, so a graph that claims to be assembled but was
 * thawed/unfrozen (structurally impossible via the public API)
 * fails `GRAPH_NOT_IMMUTABLE`.
 */
import { EngineeringModelError } from "./errors.js";
import { assertValidEpistemicState } from "./epistemic.js";
import { propertyAssertion, type PropertyAssertion } from "./assertions.js";
import { validateModelProvenance } from "./provenance.js";
import {
  graphContentDigest,
  type RealityModelGraph,
  type SpaceKind,
} from "./model.js";

/** Fail-closed whole-graph validation (the persistence-boundary gate). */
export function validateRealityGraph(graph: RealityModelGraph): void {
  if (graph === null || typeof graph !== "object") {
    throw new EngineeringModelError("MODEL_INVALID", "graph must be an object", {
      details: { field: "graph", value: typeof graph },
    });
  }
  const { modelId, projectId, spaces, objects, relationships } = graph;

  if (typeof modelId !== "string" || modelId.length === 0) {
    throw new EngineeringModelError("MODEL_INVALID", "graph.modelId must be a non-empty string", {
      details: { field: "modelId", value: String(modelId) },
    });
  }
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new EngineeringModelError("MODEL_INVALID", "graph.projectId must be a non-empty string", {
      details: { field: "projectId", value: String(projectId) },
    });
  }
  if (!Array.isArray(spaces) || !Array.isArray(objects) || !Array.isArray(relationships)) {
    throw new EngineeringModelError("MODEL_INVALID", "graph content fields must be arrays", {
      details: { field: "graph" },
    });
  }

  // Immutability: assembled graphs are deep-frozen by construction.
  if (!Object.isFrozen(graph) || !Object.isFrozen(spaces) || !Object.isFrozen(objects) || !Object.isFrozen(relationships)) {
    throw new EngineeringModelError("MODEL_INVALID", "graph content must be frozen (immutable by construction)", {
      details: { field: "graph", value: "not-frozen" },
    });
  }

  // --- Entity identity and uniqueness -------------------------------------
  const entityIds = new Set<string>();
  for (const space of spaces) {
    if (typeof space.spaceId !== "string" || space.spaceId.length === 0) {
      throw new EngineeringModelError("MODEL_INVALID", "space.spaceId must be a non-empty string", {
        details: { field: "spaceId", value: String(space.spaceId) },
      });
    }
    if (entityIds.has(space.spaceId)) {
      throw new EngineeringModelError("IDENTITY_COLLISION", `duplicate entity id: ${space.spaceId}`, {
        details: { field: "spaceId", value: space.spaceId },
      });
    }
    entityIds.add(space.spaceId);
  }
  for (const object of objects) {
    if (typeof object.objectId !== "string" || object.objectId.length === 0) {
      throw new EngineeringModelError("MODEL_INVALID", "object.objectId must be a non-empty string", {
        details: { field: "objectId", value: String(object.objectId) },
      });
    }
    if (entityIds.has(object.objectId)) {
      throw new EngineeringModelError("IDENTITY_COLLISION", `duplicate entity id: ${object.objectId}`, {
        details: { field: "objectId", value: object.objectId },
      });
    }
    entityIds.add(object.objectId);
  }

  const spaceIds = new Set(spaces.map((space) => space.spaceId));
  const objectIds = new Set(objects.map((object) => object.objectId));

  // --- Space hierarchy ------------------------------------------------------
  const spaceKindRanks: Record<SpaceKind, number> = {
    SITE: 0,
    FACILITY: 1,
    BUILDING: 2,
    LEVEL: 3,
    ROOM: 4,
  };
  for (const space of spaces) {
    if (!(space.kind in spaceKindRanks)) {
      throw new EngineeringModelError("MODEL_INVALID", `unknown space kind: ${String(space.kind)}`, {
        details: { field: "kind", value: String(space.kind) },
      });
    }
    if (space.parentSpaceId !== undefined) {
      if (!spaceIds.has(space.parentSpaceId)) {
        throw new EngineeringModelError(
          "REFERENTIAL_INTEGRITY",
          `space ${space.spaceId} references unknown parent ${space.parentSpaceId}`,
          { details: { field: "parentSpaceId", value: space.parentSpaceId } },
        );
      }
    }
    validateProperties(space.properties ?? [], `space ${space.spaceId}`);
  }
  // Cycle detection over the parent chain.
  const spaceById = new Map(spaces.map((space) => [space.spaceId, space] as const));
  for (const space of spaces) {
    const seen = new Set<string>([space.spaceId]);
    let parent = space.parentSpaceId !== undefined ? spaceById.get(space.parentSpaceId) : undefined;
    while (parent !== undefined) {
      if (seen.has(parent.spaceId)) {
        throw new EngineeringModelError("MODEL_INVALID", `space hierarchy contains a cycle at ${parent.spaceId}`, {
          details: { field: "spaceId", value: parent.spaceId },
        });
      }
      seen.add(parent.spaceId);
      parent = parent.parentSpaceId !== undefined ? spaceById.get(parent.parentSpaceId) : undefined;
    }
  }

  // --- Objects ---------------------------------------------------------------
  for (const object of objects) {
    assertValidEpistemicState(object.epistemicState, `object ${object.objectId}.epistemicState`);
    if (
      object.objectClass !== "WALL" &&
      object.objectClass !== "FLOOR" &&
      object.objectClass !== "CEILING" &&
      object.objectClass !== "DOOR" &&
      object.objectClass !== "WINDOW"
    ) {
      throw new EngineeringModelError("MODEL_INVALID", `unknown object class: ${String(object.objectClass)}`, {
        details: { field: "objectClass", value: String(object.objectClass) },
      });
    }
    if (object.provenance === undefined) {
      throw new EngineeringModelError("PROVENANCE_INCOMPLETE", `object ${object.objectId} carries no provenance`, {
        details: { field: "provenance", value: "absent" },
      });
    }
    validateModelProvenance(object.provenance);
    validateProperties(object.properties, `object ${object.objectId}`);
    if (object.contentHash === undefined || !/^[0-9a-f]{64}$/.test(object.contentHash)) {
      throw new EngineeringModelError("MODEL_INVALID", `object ${object.objectId} has an invalid contentHash`, {
        details: { field: "contentHash", value: String(object.contentHash) },
      });
    }
  }

  // --- Relationships -----------------------------------------------------------
  const triples = new Set<string>();
  const contained = new Set<string>();
  for (const relationship of relationships) {
    const triple = `${relationship.type}|${relationship.fromId}|${relationship.toId}`;
    if (triples.has(triple)) {
      throw new EngineeringModelError("IDENTITY_COLLISION", `duplicate relationship: ${triple}`, {
        details: { field: "relationship", value: triple },
      });
    }
    triples.add(triple);
    if (relationship.type === "CONTAINS") {
      if (!spaceIds.has(relationship.fromId) || !objectIds.has(relationship.toId)) {
        throw new EngineeringModelError(
          "REFERENTIAL_INTEGRITY",
          `CONTAINS must run from a space to an object: ${triple}`,
          { details: { field: "relationship", value: triple } },
        );
      }
      contained.add(relationship.toId);
    } else if (relationship.type === "OPENING_IN") {
      const from = objects.find((object) => object.objectId === relationship.fromId);
      const to = objects.find((object) => object.objectId === relationship.toId);
      if (from === undefined || to === undefined) {
        throw new EngineeringModelError(
          "REFERENTIAL_INTEGRITY",
          `OPENING_IN endpoints must be objects: ${triple}`,
          { details: { field: "relationship", value: triple } },
        );
      }
      if (from.objectClass !== "DOOR" && from.objectClass !== "WINDOW") {
        throw new EngineeringModelError(
          "MODEL_INVALID",
          `OPENING_IN must originate at a DOOR or WINDOW: ${triple}`,
          { details: { field: "relationship", value: triple } },
        );
      }
      if (to.objectClass !== "WALL") {
        throw new EngineeringModelError("MODEL_INVALID", `OPENING_IN must target a WALL: ${triple}`, {
          details: { field: "relationship", value: triple },
        });
      }
    } else {
      throw new EngineeringModelError("MODEL_INVALID", `unknown relationship type: ${String(relationship.type)}`, {
        details: { field: "type", value: String(relationship.type) },
      });
    }
  }

  // --- No orphan objects / orphan openings ---------------------------------
  for (const object of objects) {
    if (!contained.has(object.objectId)) {
      throw new EngineeringModelError(
        "REFERENTIAL_INTEGRITY",
        `object ${object.objectId} is contained by no space`,
        { details: { field: "objectId", value: object.objectId } },
      );
    }
    if (object.objectClass === "DOOR" || object.objectClass === "WINDOW") {
      const hasParent = relationships.some(
        (rel) => rel.type === "OPENING_IN" && rel.fromId === object.objectId,
      );
      if (!hasParent) {
        throw new EngineeringModelError(
          "MODEL_INVALID",
          `${object.objectClass} ${object.objectId} has no OPENING_IN parent wall`,
          { details: { field: "objectId", value: object.objectId } },
        );
      }
    }
  }

  // --- Digest integrity ------------------------------------------------------
  const expectedDigest = graphContentDigest(modelId, projectId, spaces, objects, relationships);
  if (graph.digest !== expectedDigest) {
    throw new EngineeringModelError("MODEL_INVALID", "graph digest does not match its content", {
      details: { field: "digest", value: String(graph.digest), expected: expectedDigest },
    });
  }
}

function validateProperties(properties: readonly PropertyAssertion[], context: string): void {
  if (properties === undefined || properties === null) {
    throw new EngineeringModelError("MODEL_INVALID", `${context}: properties must be an array`, {
      details: { field: "properties" },
    });
  }
  const keys = new Set<string>();
  for (const assertion of properties) {
    propertyAssertion(assertion);
    if (keys.has(assertion.key)) {
      throw new EngineeringModelError("IDENTITY_COLLISION", `${context}: duplicate property key "${assertion.key}"`, {
        details: { field: "properties", value: assertion.key },
      });
    }
    keys.add(assertion.key);
  }
}
