/**
 * Reality-model persistence store (AISE-011 backend).
 *
 * Holds the canonical engineering-model versions: one immutable
 * graph snapshot per version, linear append-only history, prior
 * versions always discoverable (architecture §2.10: reprocessing
 * creates new derived versions and never erases prior evidence).
 *
 * Persistence strategy: an in-memory implementation behind a
 * narrow interface of composite (transaction-shaped) operations,
 * following the AISE-001 in-memory placeholder precedent (the
 * AISE-004 capture store and the AISE-008 reconstruction state
 * store). Durable model storage is deferred; when it arrives it
 * must preserve these operation semantics.
 *
 * Boundary discipline (the AISE-008 lesson, hardened in the PR #9
 * review): the store does NOT trust the caller. Every graph
 * presented to `commitModelVersion` is fully re-validated
 * (`validateRealityGraph`) BEFORE it is indexed or committed —
 * a malformed or tampered graph never enters the store. Then the
 * identity logic runs:
 *
 * - **Digest idempotency** — the digest is computed by the store
 *   from the graph content, never taken from the caller. A graph
 *   whose content matches the current head digest is
 *   `already_present` (a deterministic re-derivation commits no
 *   new version); different content appends a NEW version.
 * - **Linear append-only history** — versions are store-assigned
 *   (head + 1) with the previous head as parent; there is no
 *   branching lineage and no version-number conflict path.
 * - **Immutability** — committed graphs are deep-frozen by
 *   construction and never mutated, replaced, or erased by any
 *   store operation.
 */
import {
  validateRealityGraph,
  validateModelProvenance,
  type ModelProvenance,
  type ModelVersionRecord,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { RealityModelError } from "./errors.js";

/** Result of registering a model. */
export interface CreateModelResult {
  readonly status: "created" | "exists_identical" | "exists_conflict";
}

/** Result of committing a version. */
export interface CommitVersionResult {
  readonly status: "committed" | "already_present";
  /** The version number the content lives at. */
  readonly version: number;
  /** Store-computed digest of the committed content. */
  readonly digest: string;
}

/** One committed version and its graph (read result). */
export interface StoredModelVersion {
  readonly record: ModelVersionRecord;
  readonly graph: RealityModelGraph;
}

export interface RealityModelStore {
  /** Stable description for observability. */
  readonly kind: string;
  /** RFC 3339 timestamp provider (injectable for tests). */
  now(): string;

  /** Registers a model identity (create-if-absent, conflict on project mismatch). */
  createModel(input: { modelId: string; projectId: string }): CreateModelResult;

  /**
   * Commits one model version. The boundary does not trust the
   * caller: the graph is fully re-validated first; a malformed or
   * tampered graph throws and nothing is stored. Then digest
   * idempotency (content identical to the head → `already_present`)
   * and linear append (new content → head + 1).
   */
  commitModelVersion(
    modelId: string,
    graph: RealityModelGraph,
    producer: ModelProvenance,
  ): CommitVersionResult;

  /** The current head version (undefined when the model has no versions). */
  getCurrentVersion(modelId: string): StoredModelVersion | undefined;

  /** One specific version (undefined when absent). */
  getVersion(modelId: string, version: number): StoredModelVersion | undefined;

  /** The full version history, ascending (prior versions remain discoverable). */
  listVersions(modelId: string): readonly ModelVersionRecord[];
}

interface ModelRegistration {
  readonly modelId: string;
  readonly projectId: string;
}

interface ModelHistory {
  readonly registration: ModelRegistration;
  readonly versions: StoredModelVersion[];
}

/**
 * Creates a process-local in-memory reality-model store. Lost on
 * restart — a documented v1.0 limitation, not a durability claim.
 */
export function createInMemoryRealityModelStore(options?: {
  now?: () => string;
}): RealityModelStore {
  const now = options?.now ?? defaultNow;
  const histories = new Map<string, ModelHistory>();

  return {
    kind: "in-memory reality-model store",

    now,

    createModel(input) {
      if (typeof input.modelId !== "string" || input.modelId.length === 0) {
        throw new RealityModelError("MODEL_INVALID", "modelId must be a non-empty string");
      }
      if (typeof input.projectId !== "string" || input.projectId.length === 0) {
        throw new RealityModelError("MODEL_INVALID", "projectId must be a non-empty string");
      }
      const existing = histories.get(input.modelId);
      if (existing === undefined) {
        histories.set(input.modelId, {
          registration: { modelId: input.modelId, projectId: input.projectId },
          versions: [],
        });
        return { status: "created" };
      }
      if (existing.registration.projectId !== input.projectId) {
        return { status: "exists_conflict" };
      }
      return { status: "exists_identical" };
    },

    commitModelVersion(modelId, graph, producer) {
      // --- Boundary verification FIRST: never trust the caller. ---
      try {
        validateRealityGraph(graph);
        validateModelProvenance(producer);
      } catch (error) {
        throw new RealityModelError("MODEL_INVALID", "graph failed boundary validation", {
          cause: error,
        });
      }

      const history = histories.get(modelId);
      if (history === undefined) {
        throw new RealityModelError("MODEL_NOT_FOUND", `model is not registered: ${modelId}`, {
          details: { modelId },
        });
      }
      if (graph.modelId !== modelId) {
        throw new RealityModelError("MODEL_MISMATCH", `graph belongs to model ${graph.modelId}, not ${modelId}`, {
          details: { graphModelId: graph.modelId, modelId },
        });
      }

      const digest = graph.digest; // store-computed and content-verified by validateRealityGraph

      const head = history.versions[history.versions.length - 1];
      if (head !== undefined && head.record.digest === digest) {
        return { status: "already_present", version: head.record.version, digest };
      }

      const version = head !== undefined ? head.record.version + 1 : 1;
      const record: ModelVersionRecord = {
        modelId,
        version,
        ...(head !== undefined ? { parentVersion: head.record.version } : {}),
        digest,
        committedAt: now(),
        spaceCount: graph.spaces.length,
        objectCount: graph.objects.length,
        relationshipCount: graph.relationships.length,
      };
      const stored: StoredModelVersion = { record, graph };
      history.versions.push(Object.freeze(stored));
      return { status: "committed", version, digest };
    },

    getCurrentVersion(modelId) {
      const history = histories.get(modelId);
      if (history === undefined) {
        return undefined;
      }
      return history.versions[history.versions.length - 1];
    },

    getVersion(modelId, version) {
      const history = histories.get(modelId);
      if (history === undefined) {
        return undefined;
      }
      if (!Number.isInteger(version) || version < 1) {
        throw new RealityModelError("MODEL_INVALID", `version must be a positive integer: ${String(version)}`);
      }
      return history.versions.find((stored) => stored.record.version === version);
    },

    listVersions(modelId) {
      const history = histories.get(modelId);
      if (history === undefined) {
        return [];
      }
      return Object.freeze([...history.versions.map((stored) => stored.record)]);
    },
  };
}

function defaultNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
