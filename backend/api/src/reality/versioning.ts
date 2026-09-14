/**
 * AISE-016 — Reality Graph version transitions (the append-only engine).
 *
 * THE VERSIONED-APPEND-ONLY PATTERN IS THE HEART OF THIS WORK ITEM:
 *
 *  - `applyChanges(graph, changes, meta)` folds ONE change set onto the
 *    graph's LATEST version and returns the NEXT version as a fully
 *    MATERIALIZED snapshot (parent state + changes). The store persists
 *    whole snapshots per version, so reads are deterministic and history is
 *    immutable: prior versions are never touched again, on disk or memory.
 *  - `changeLog` preserves the caller's EXACT change records (verbatim,
 *    including any extra keys — canonical JSON sorts keys, it never drops
 *    data). Deletions are TOMBSTONES: nodes are never physically removed.
 *  - Determinism: version ids are derived from the parent sequence
 *    (`v001`, `v002`, …, zero-padded), the clock is INJECTED via `meta`,
 *    ids are caller-supplied, and materialized collections are sorted by
 *    stable id (code-unit order) — the same change sequence over the same
 *    parent yields byte-identical snapshots.
 *
 * IDENTITY DISCIPLINE: nodeIds are caller-supplied stable ids. Upserting an
 * existing nodeId in a NEW version REPLACES the node (the upsert must carry
 * its own provenance/units discipline), while prior versions keep the old
 * record verbatim. Certainty is never silently lost: an upsert may not
 * downgrade a node's or property's epistemic status (`EPISTEMIC_RANK`) —
 * an explicit, provenance-carrying act (e.g. a tombstone with a reason, or
 * a CONTRADICTS provenance record) is required instead, so the changeLog
 * keeps every such act auditable.
 *
 * Validation (all typed rejections, see model.ts codes):
 *   (a) required provenance on every consequential assertion;
 *   (b) typed units on numeric properties;
 *   (c) no dangling relationship endpoints in the version's FINAL state
 *       (deleting a node without deleting its relationships is therefore
 *       also a rejection — deletion must be explicit about consequences);
 *   (d) no epistemic-status downgrade on upsert (node- or property-level),
 *       checked against the evolving state so a chain of upserts within ONE
 *       change set is guarded too.
 * Policy guidance ONLY (enforced later by assurance items, not here):
 * intervention references belong on PROPOSED-status subgraphs.
 *
 * OBSERVATIONS NEVER MUTATE NODE STATE: an `observe` change appends a
 * factual record to the version's observation list; binding observed values
 * into a node is a separate, explicit `upsert-node` in some change set.
 */

import type { EpistemicStatus } from "@aise/shared-contracts";
import {
  assertIsoTimestamp,
  EPISTEMIC_RANK,
  formatVersionId,
  parseChangeRecord,
  RealityGraphError,
  versionSequence,
  type ChangeRecord,
  type GraphVersion,
  type ObservationRecord,
  type RealityGraph,
  type RealityNode,
  type Relationship,
  type Tombstone,
} from "./model";

/** Change-set metadata; `createdAt` comes from the INJECTED clock. */
export interface ChangeMeta {
  readonly createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Evolving state (fold scratch space)                                 */
/* ------------------------------------------------------------------ */

interface VersionState {
  readonly nodes: Map<string, RealityNode>;
  readonly relationships: Map<string, Relationship>;
  readonly observations: ObservationRecord[];
  readonly observationIds: Set<string>;
  readonly tombstones: Map<string, Tombstone>;
}

function stateOf(version: GraphVersion): VersionState {
  return {
    nodes: new Map(version.nodes.map((node) => [node.nodeId, node])),
    relationships: new Map(
      version.relationships.map((rel) => [rel.relationshipId, rel]),
    ),
    observations: [...version.observations],
    observationIds: new Set(version.observations.map((obs) => obs.observationId)),
    tombstones: new Map(version.tombstones.map((stone) => [stone.nodeId, stone])),
  };
}

/** Code-unit ordering (locale-independent, matches canonical JSON sorting). */
function byId<T extends { readonly nodeId: string } | { readonly relationshipId: string }>(
  keyOf: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

/* ------------------------------------------------------------------ */
/* Epistemic downgrade guard (lock: confirmations not silently undone) */
/* ------------------------------------------------------------------ */

function assertNoDowngrade(previous: RealityNode, next: RealityNode): void {
  const nodeRank = EPISTEMIC_RANK[next.epistemicStatus];
  if (nodeRank < EPISTEMIC_RANK[previous.epistemicStatus]) {
    throw new RealityGraphError(
      "epistemic_downgrade",
      `node "${next.nodeId}" epistemicStatus downgraded from ` +
        `${previous.epistemicStatus} to ${next.epistemicStatus} — confirmations ` +
        `are not silently undone; record the change explicitly`,
    );
  }
  const previousByKey = new Map(previous.properties.map((p) => [p.key, p]));
  for (const property of next.properties) {
    const old = previousByKey.get(property.key);
    if (old === undefined) {
      continue;
    }
    if (EPISTEMIC_RANK[property.epistemicStatus] < EPISTEMIC_RANK[old.epistemicStatus]) {
      throw new RealityGraphError(
        "epistemic_downgrade",
        `node "${next.nodeId}" property "${property.key}" downgraded from ` +
          `${old.epistemicStatus} to ${property.epistemicStatus} — estimates cannot ` +
          `silently become measurements, and measurements are not silently un-made`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Change application (in order; typed rejections fail the whole set)  */
/* ------------------------------------------------------------------ */

function applyChange(state: VersionState, change: ChangeRecord): void {
  switch (change.op) {
    case "upsert-node": {
      const node = change.node;
      const existing = state.nodes.get(node.nodeId);
      if (existing !== undefined) {
        assertNoDowngrade(existing, node);
      }
      state.nodes.set(node.nodeId, node);
      state.tombstones.delete(node.nodeId);
      break;
    }
    case "delete": {
      if (!state.nodes.has(change.nodeId)) {
        throw new RealityGraphError(
          "delete_unknown_node",
          `cannot delete node "${change.nodeId}": not present in the current state`,
        );
      }
      state.nodes.delete(change.nodeId);
      state.tombstones.set(change.nodeId, { nodeId: change.nodeId, reason: change.reason });
      break;
    }
    case "upsert-relationship": {
      state.relationships.set(change.relationship.relationshipId, change.relationship);
      break;
    }
    case "delete-relationship": {
      if (!state.relationships.has(change.relationshipId)) {
        throw new RealityGraphError(
          "delete_unknown_relationship",
          `cannot delete relationship "${change.relationshipId}": not present in the current state`,
        );
      }
      state.relationships.delete(change.relationshipId);
      break;
    }
    case "observe": {
      const observation = change.observation;
      if (state.observationIds.has(observation.observationId)) {
        throw new RealityGraphError(
          "duplicate_observation",
          `observation "${observation.observationId}" already exists (append-only)`,
        );
      }
      state.observationIds.add(observation.observationId);
      state.observations.push(observation);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public engine                                                        */
/* ------------------------------------------------------------------ */

/** The initial empty version of a new project graph (`v001`). */
export function createInitialVersion(projectId: string, createdAt: string): GraphVersion {
  assertIsoTimestamp(createdAt, "project createdAt");
  if (projectId.length < 1 || projectId.length > 256) {
    throw new RealityGraphError("invalid_project_id", "projectId must be 1..256 characters");
  }
  return {
    versionId: formatVersionId(1),
    parentVersionId: null,
    createdAt,
    changeLog: [],
    nodes: [],
    relationships: [],
    observations: [],
    tombstones: [],
  };
}

/**
 * Fold one change set onto the graph's LATEST version and return the next
 * MATERIALIZED version. Pure: the input graph and the exact input change
 * records are never mutated; every record is re-validated at runtime (the
 * router path feeds untyped JSON, in-process callers feed typed records —
 * one validation path for both). Any typed rejection aborts the whole set:
 * no partial version is produced.
 */
export function applyChanges(
  graph: RealityGraph,
  changes: readonly ChangeRecord[],
  meta: ChangeMeta,
): GraphVersion {
  assertIsoTimestamp(meta.createdAt, "change meta createdAt");
  const parent = graph.versions[graph.versions.length - 1];
  if (parent === undefined) {
    throw new RealityGraphError(
      "empty_graph",
      `project "${graph.projectId}" has no versions to apply changes onto`,
    );
  }
  const parentSequence = versionSequence(parent.versionId);
  if (parentSequence < 1) {
    throw new RealityGraphError(
      "invalid_version_id",
      `parent version id "${parent.versionId}" is not a vNNN sequence id`,
    );
  }

  const state = stateOf(parent);
  const changeLog: ChangeRecord[] = [];
  for (const record of changes) {
    // Re-validate every record at runtime, then keep the EXACT input record.
    const change = parseChangeRecord(record);
    applyChange(state, change);
    changeLog.push(record);
  }

  // Final-state referential integrity: no dangling relationship endpoints.
  for (const relationship of state.relationships.values()) {
    for (const endpoint of [relationship.fromNodeId, relationship.toNodeId]) {
      if (!state.nodes.has(endpoint)) {
        throw new RealityGraphError(
          "dangling_reference",
          `relationship "${relationship.relationshipId}" references missing node "${endpoint}"`,
        );
      }
    }
  }

  const nodes = [...state.nodes.values()].sort(byId<RealityNode>((n) => n.nodeId));
  const relationships = [...state.relationships.values()].sort(
    byId<Relationship>((r) => r.relationshipId),
  );
  const tombstones = [...state.tombstones.values()].sort(
    byId<Tombstone>((t) => t.nodeId),
  );

  return {
    versionId: formatVersionId(parentSequence + 1),
    parentVersionId: parent.versionId,
    createdAt: meta.createdAt,
    changeLog,
    nodes,
    relationships,
    observations: [...state.observations],
    tombstones,
  };
}

/** Rank of an epistemic status (re-exported for tests/assurance consumers). */
export function epistemicRank(status: EpistemicStatus): number {
  return EPISTEMIC_RANK[status];
}
