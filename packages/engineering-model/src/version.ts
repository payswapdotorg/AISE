/**
 * Model version metadata and version diffing (AISE-011).
 *
 * The architecture's historical-reality rule (§2.10, lock §2):
 * derived model versions are versioned; prior versions remain
 * discoverable; reprocessing creates new derived versions and
 * never erases prior evidence. This module defines the version
 * RECORD (metadata about one committed graph — the record itself
 * is produced and owned by the persistence store, never by
 * callers) and the honest DIFF:
 *
 * - diffs report `added` / `removed` / `changed` by identity;
 * - a changed object is one whose identity persisted but whose
 *   content hash changed;
 * - **no correspondence claims**: when an object disappears and a
 *   new one appears (a re-extraction changed upstream content →
 *   new identity), the diff reports exactly that — removal and
 *   addition. It never infers "the same wall moved" (that would be
 *   an unproven correspondence and an epistemic upgrade).
 */
import { EngineeringModelError } from "./errors.js";
import type { RealityModelGraph, RelationshipType } from "./model.js";

/** Metadata about one committed model version (produced by the store). */
export interface ModelVersionRecord {
  readonly modelId: string;
  /** 1-based sequential version number (store-assigned, linear). */
  readonly version: number;
  /** Parent version (absent for version 1). */
  readonly parentVersion?: number;
  /** Canonical digest of the version's graph content. */
  readonly digest: string;
  /** RFC 3339 UTC instant recorded when the version was committed. */
  readonly committedAt: string;
  /**
   * Graph content counts (observability metadata, derived from the
   * committed graph at commit time — never authoritative over it).
   */
  readonly spaceCount: number;
  readonly objectCount: number;
  readonly relationshipCount: number;
}

/** One changed object between two versions. */
export interface ChangedObject {
  readonly objectId: string;
  readonly objectClass: string;
  readonly previousContentHash: string;
  readonly currentContentHash: string;
}

/** The honest diff between two graph versions. */
export interface ModelVersionDiff {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly addedObjectIds: readonly string[];
  readonly removedObjectIds: readonly string[];
  readonly changedObjects: readonly ChangedObject[];
  readonly addedRelationships: readonly { type: RelationshipType; fromId: string; toId: string }[];
  readonly removedRelationships: readonly { type: RelationshipType; fromId: string; toId: string }[];
  readonly addedSpaceIds: readonly string[];
  readonly removedSpaceIds: readonly string[];
  /** Derived summary (never a claim the diff cannot support). */
  readonly summary: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly identical: boolean;
  };
}

/**
 * Computes the honest diff between two graphs of the SAME model.
 * Fails closed (`MODEL_MISMATCH`) when the graphs belong to
 * different models — a cross-model diff is meaningless.
 */
export function diffModelGraphs(
  previous: RealityModelGraph,
  current: RealityModelGraph,
  versionNumbers: { fromVersion: number; toVersion: number },
): ModelVersionDiff {
  if (previous.modelId !== current.modelId) {
    throw new EngineeringModelError(
      "MODEL_MISMATCH",
      `cannot diff graphs of different models: ${previous.modelId} vs ${current.modelId}`,
      { details: { previous: previous.modelId, current: current.modelId } },
    );
  }

  const previousObjects = new Map(
    previous.objects.map((object) => [object.objectId, object] as const),
  );
  const currentObjects = new Map(
    current.objects.map((object) => [object.objectId, object] as const),
  );

  const addedObjectIds: string[] = [];
  const removedObjectIds: string[] = [];
  const changedObjects: ChangedObject[] = [];

  for (const object of current.objects) {
    const before = previousObjects.get(object.objectId);
    if (before === undefined) {
      addedObjectIds.push(object.objectId);
    } else if (before.contentHash !== object.contentHash) {
      changedObjects.push({
        objectId: object.objectId,
        objectClass: object.objectClass,
        previousContentHash: before.contentHash,
        currentContentHash: object.contentHash,
      });
    }
  }
  for (const object of previous.objects) {
    if (!currentObjects.has(object.objectId)) {
      removedObjectIds.push(object.objectId);
    }
  }

  const relationshipKey = (rel: { type: string; fromId: string; toId: string }): string =>
    `${rel.type}|${rel.fromId}|${rel.toId}`;
  const previousRelationships = new Set(previous.relationships.map(relationshipKey));
  const currentRelationships = new Set(current.relationships.map(relationshipKey));
  const addedRelationships = current.relationships
    .filter((rel) => !previousRelationships.has(relationshipKey(rel)))
    .map((rel) => ({ type: rel.type, fromId: rel.fromId, toId: rel.toId }));
  const removedRelationships = previous.relationships
    .filter((rel) => !currentRelationships.has(relationshipKey(rel)))
    .map((rel) => ({ type: rel.type, fromId: rel.fromId, toId: rel.toId }));

  const previousSpaceIds = new Set(previous.spaces.map((space) => space.spaceId));
  const currentSpaceIds = new Set(current.spaces.map((space) => space.spaceId));
  const addedSpaceIds = current.spaces
    .map((space) => space.spaceId)
    .filter((id) => !previousSpaceIds.has(id));
  const removedSpaceIds = previous.spaces
    .map((space) => space.spaceId)
    .filter((id) => !currentSpaceIds.has(id));

  const summary = {
    added: addedObjectIds.length,
    removed: removedObjectIds.length,
    changed: changedObjects.length,
    identical:
      addedObjectIds.length === 0 &&
      removedObjectIds.length === 0 &&
      changedObjects.length === 0 &&
      addedRelationships.length === 0 &&
      removedRelationships.length === 0 &&
      addedSpaceIds.length === 0 &&
      removedSpaceIds.length === 0,
  };

  return {
    fromVersion: versionNumbers.fromVersion,
    toVersion: versionNumbers.toVersion,
    addedObjectIds: Object.freeze(addedObjectIds),
    removedObjectIds: Object.freeze(removedObjectIds),
    changedObjects: Object.freeze(changedObjects),
    addedRelationships: Object.freeze(addedRelationships),
    removedRelationships: Object.freeze(removedRelationships),
    addedSpaceIds: Object.freeze(addedSpaceIds),
    removedSpaceIds: Object.freeze(removedSpaceIds),
    summary,
  };
}

/**
 * Epistemic-state changes between two versions, reported
 * explicitly per object — an upgrade (e.g. INFERRED → CONFIRMED)
 * is visible, never silent. This is the review surface for
 * human-verification changes.
 */
export interface EpistemicChange {
  readonly objectId: string;
  readonly previousState: string;
  readonly currentState: string;
}

export function epistemicChangesBetween(
  previous: RealityModelGraph,
  current: RealityModelGraph,
): readonly EpistemicChange[] {
  const previousById = new Map(
    previous.objects.map((object) => [object.objectId, object] as const),
  );
  const changes: EpistemicChange[] = [];
  for (const object of current.objects) {
    const before = previousById.get(object.objectId);
    if (before !== undefined && before.epistemicState !== object.epistemicState) {
      changes.push({
        objectId: object.objectId,
        previousState: before.epistemicState,
        currentState: object.epistemicState,
      });
    }
  }
  return Object.freeze(changes);
}
