/**
 * Reconstruction state store (AISE-008).
 *
 * Holds the derived reconstruction state: preprocessed-session
 * versions and content-addressed artifacts. It follows the AISE-001
 * in-memory placeholder precedent (process-local, lost on restart —
 * a documented v1.0 limitation, not a durability claim) and the
 * AISE-004 store discipline: composite operations with explicit
 * create/already-present outcomes, committed records never mutated,
 * and idempotent re-commit semantics.
 *
 * Versioning and identity rules:
 * - **Preprocessed sessions are versioned, append-only**: an
 *   identical re-commit (same fingerprint as the latest version) is
 *   `already_present`; a changed fingerprint appends a NEW version
 *   and prior versions remain discoverable (reprocessing creates
 *   derived versions, it never erases prior derived state — the
 *   architecture's historical-reality rule applied to derived data).
 * - **Artifacts are content-addressed**: content is identity, so a
 *   re-commit of the same `contentHash` is `already_present` and
 *   never duplicates. An artifact id is a locator: reusing an id for
 *   DIFFERENT content fails closed (`ARTIFACT_ID_CONFLICT`) and the
 *   original stays untouched.
 * - **Session index**: per-session ordered, duplicate-free artifact
 *   lists (commit order).
 *
 * Persistence-boundary verification (PR #9 review): the store does
 * NOT trust the caller. Every artifact presented to
 * `commitArtifact` is fully verified BEFORE it is indexed or
 * committed — point clouds with `verifyPointCloudArtifact`, scenes
 * with `verifySceneArtifact` (resolving cited clouds against the
 * store itself, so a scene can only be committed after the clouds
 * it cites), and unknown kinds are rejected outright. Malformed or
 * tampered derived artifacts never enter the store; idempotent
 * re-commits and `ARTIFACT_ID_CONFLICT` semantics are unchanged
 * (verification runs first, then the identity logic).
 *
 * This store is explicitly NOT the canonical Reality Graph (AISE-011)
 * and not a second engineering-model authority: it holds derived
 * reconstruction products whose epistemic state is INFERRED.
 */
import type { Uuid } from "@aise/shared-contracts";
import type { PreprocessedSession } from "../preprocessing/preprocess.js";
import { ReconstructionError } from "../errors.js";
import { verifyPointCloudArtifact } from "../artifacts/point-cloud.js";
import { verifySceneArtifact, type ReconstructionArtifact } from "../artifacts/scene.js";

export interface CommitResult {
  readonly status: "committed" | "already_present";
}

/** Read model: one session's derived reconstruction state. */
export interface SessionReconstruction {
  readonly sessionId: Uuid;
  readonly preprocessedVersions: number;
  readonly artifactCount: number;
  readonly pointCloudCount: number;
  readonly sceneCount: number;
}

export interface ReconstructionStateStore {
  /** Stable description for observability. */
  readonly kind: string;
  /** RFC 3339 timestamp provider (injectable for tests). */
  now(): string;

  /**
   * Commits a preprocessed session: `already_present` when the
   * latest version has the same fingerprint; otherwise appends a
   * new version (prior versions retained).
   */
  commitPreprocessedSession(record: PreprocessedSession): CommitResult;
  latestPreprocessedSession(sessionId: Uuid): PreprocessedSession | undefined;
  listPreprocessedSessionVersions(sessionId: Uuid): readonly PreprocessedSession[];

  /**
   * Commits an artifact. The boundary does not trust the caller:
   * point clouds are verified with `verifyPointCloudArtifact` and
   * scenes with `verifySceneArtifact` (cited clouds resolved against
   * this store) before indexing — a malformed or tampered artifact
   * is rejected and never stored. Then: `already_present` for known
   * content; `ARTIFACT_ID_CONFLICT` when the id is already bound to
   * different content. Committed artifacts are never mutated or
   * replaced.
   */
  commitArtifact(artifact: ReconstructionArtifact): CommitResult;
  findArtifactById(artifactId: Uuid): ReconstructionArtifact | undefined;
  findArtifactByHash(contentHash: string): ReconstructionArtifact | undefined;
  listArtifactsForSession(sessionId: Uuid): readonly ReconstructionArtifact[];

  /** Per-session derived-state summary (read model). */
  sessionReconstruction(sessionId: Uuid): SessionReconstruction;
}

export interface InMemoryReconstructionStateStoreOptions {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
}

/** Creates the in-memory reconstruction state store. */
export function createInMemoryReconstructionStateStore(
  options: InMemoryReconstructionStateStoreOptions = {},
): ReconstructionStateStore {
  const now = options.now ?? (() => new Date().toISOString());

  /** sessionId → committed versions, in commit order. */
  const preprocessedVersions = new Map<Uuid, PreprocessedSession[]>();
  /** contentHash → committed artifact (content is identity). */
  const artifactsByHash = new Map<string, ReconstructionArtifact>();
  /** artifactId → committed artifact (locator alias). */
  const artifactsById = new Map<Uuid, ReconstructionArtifact>();
  /** sessionId → ordered, duplicate-free content hashes. */
  const sessionArtifactIndex = new Map<Uuid, string[]>();

  /**
   * The persistence-boundary gate (PR #9 review): verifies every
   * artifact before it is indexed or committed. Point clouds run
   * `verifyPointCloudArtifact`; scenes run `verifySceneArtifact`
   * with the store itself as the reference resolver — a scene may
   * only be committed after the clouds it cites are committed. An
   * artifact of unknown kind never enters the store. Runs BEFORE the
   * idempotency/conflict logic, so a tampered artifact claiming a
   * known content hash is still rejected rather than silently
   * treated as `already_present`.
   */
  const verifyAtBoundary = (artifact: ReconstructionArtifact): void => {
    if (artifact.kind === "point_cloud") {
      verifyPointCloudArtifact(artifact);
      return;
    }
    if (artifact.kind === "scene") {
      verifySceneArtifact(artifact, (artifactId) => artifactsById.get(artifactId));
      return;
    }
    // `ReconstructionArtifact` is a closed union, so this branch is
    // unreachable for well-typed values — but the boundary guards
    // runtime values too (a tampered/partially-decoded object), so it
    // fails closed instead of relying on the type system.
    const unknown = artifact as { artifactId?: Uuid; kind?: unknown };
    throw new ReconstructionError(
      "VALIDATION_FAILED",
      `cannot commit an artifact of unknown kind "${String(unknown.kind)}"`,
      { details: { artifactId: unknown.artifactId, kind: unknown.kind } },
    );
  };

  return {
    kind: "memory",

    now,

    commitPreprocessedSession: (record) => {
      const versions = preprocessedVersions.get(record.sessionId) ?? [];
      const latest = versions.at(-1);
      if (latest !== undefined && latest.fingerprint === record.fingerprint) {
        return { status: "already_present" };
      }
      versions.push(record);
      preprocessedVersions.set(record.sessionId, versions);
      return { status: "committed" };
    },

    latestPreprocessedSession: (sessionId) =>
      preprocessedVersions.get(sessionId)?.at(-1),

    listPreprocessedSessionVersions: (sessionId) =>
      [...(preprocessedVersions.get(sessionId) ?? [])],

    commitArtifact: (artifact) => {
      // The boundary does not trust the caller: verify first, then
      // apply the identity logic (idempotency, conflicts, indexing).
      verifyAtBoundary(artifact);
      const existing = artifactsByHash.get(artifact.contentHash);
      if (existing !== undefined) {
        // Same content: one logical artifact, idempotent commit.
        return { status: "already_present" };
      }
      const idOwner = artifactsById.get(artifact.artifactId);
      if (idOwner !== undefined && idOwner.contentHash !== artifact.contentHash) {
        // An artifact id is a locator bound to its first content.
        throw new ReconstructionError(
          "ARTIFACT_ID_CONFLICT",
          `artifact id ${artifact.artifactId} is already committed with different content`,
          {
            details: {
              artifactId: artifact.artifactId,
              committedHash: idOwner.contentHash,
              attemptedHash: artifact.contentHash,
            },
          },
        );
      }
      artifactsByHash.set(artifact.contentHash, artifact);
      artifactsById.set(artifact.artifactId, artifact);
      const index = sessionArtifactIndex.get(artifact.sessionId) ?? [];
      if (!index.includes(artifact.contentHash)) {
        index.push(artifact.contentHash);
      }
      sessionArtifactIndex.set(artifact.sessionId, index);
      return { status: "committed" };
    },

    findArtifactById: (artifactId) => artifactsById.get(artifactId),

    findArtifactByHash: (contentHash) => artifactsByHash.get(contentHash),

    listArtifactsForSession: (sessionId) =>
      (sessionArtifactIndex.get(sessionId) ?? [])
        .map((hash) => artifactsByHash.get(hash))
        .filter((artifact): artifact is ReconstructionArtifact => artifact !== undefined),

    sessionReconstruction: (sessionId) => {
      const artifacts = (sessionArtifactIndex.get(sessionId) ?? [])
        .map((hash) => artifactsByHash.get(hash))
        .filter((artifact): artifact is ReconstructionArtifact => artifact !== undefined);
      return {
        sessionId,
        preprocessedVersions: preprocessedVersions.get(sessionId)?.length ?? 0,
        artifactCount: artifacts.length,
        pointCloudCount: artifacts.filter((artifact) => artifact.kind === "point_cloud").length,
        sceneCount: artifacts.filter((artifact) => artifact.kind === "scene").length,
      };
    },
  };
}
