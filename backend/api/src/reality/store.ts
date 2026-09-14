/**
 * AISE-016 — Reality Graph persistence (persistence ONLY, no policy).
 *
 * File-system layout (`FsRealityStore`, rooted at `AISE_DATA_DIR`, default
 * `./data`, mirroring the capture-store conventions):
 *
 *   data/reality/<sha256(projectId)>/graph.json        project header +
 *                                                      version index (rebuildable)
 *   data/reality/<sha256(projectId)>/versions/vNNN.json  FULL materialized
 *                                                      snapshot + changeLog
 *                                                      (write-once, immutable)
 *
 *  - Opaque project ids are hashed into filesystem-safe names and stored
 *   verbatim inside the JSON records (capture-store discipline).
 * - ALL JSON is written through the shared canonical JSON encoder with
 *   WRITE-TEMP-THEN-RENAME, so identical state always produces identical
 *   bytes and readers never observe half-written files.
 * - Version files are APPEND-ONLY: writing a version id that already exists
 *   is a typed `version_exists` error (this also fail-closes the crash
 *   window between a version write and the index update — a re-derived
 *   version id collides instead of overwriting history).
 * - The engine (`versioning.ts`) owns all validation and semantics; this
 *   module owns durability ONLY. The store holds NO wall clock: every
 *   timestamp is caller/injector-supplied.
 * - `InMemoryRealityStore` is the deterministic twin (tests, embedded
 *   scenarios); both produce identical record objects, so canonical JSON
 *   byte-parity holds across implementations.
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  assertIsoTimestamp,
  parseChangeRecord,
  RealityGraphError,
  summarizeVersion,
  versionSequence,
  type ChangeRecord,
  type GraphVersion,
  type NodeHistory,
  type NodeVersionEntry,
  type ProjectHeader,
  type RealityGraph,
  type VersionSummary,
} from "./model";
import { applyChanges, createInitialVersion, type ChangeMeta } from "./versioning";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface RealityStore {
  /** Create a project graph with the empty initial version. */
  createProject(projectId: string, createdAt: string): Promise<ProjectHeader>;
  /** Project header + version index, or null when the project is unknown. */
  getProject(projectId: string): Promise<ProjectHeader | null>;
  /**
   * The full materialized version snapshot — LATEST by default, an explicit
   * `vNNN` id otherwise. Null when the project (or a well-formed version id)
   * is unknown; malformed version ids are typed `invalid_version_id`.
   */
  getVersion(projectId: string, versionId?: string): Promise<GraphVersion | null>;
  /**
   * Append one change set as the next version (validation + materialization
   * live in `versioning.ts`). Returns the persisted new version record.
   */
  applyChanges(
    projectId: string,
    changes: readonly ChangeRecord[],
    meta: ChangeMeta,
  ): Promise<GraphVersion>;
  /** Node across versions: latest state + full per-version history. */
  getNodeHistory(projectId: string, nodeId: string): Promise<NodeHistory | null>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

const VERSION_ID_PATTERN = /^v\d{3,}$/;

function assertProjectId(projectId: string): void {
  if (projectId.length < 1 || projectId.length > 256) {
    throw new RealityGraphError("invalid_project_id", "projectId must be 1..256 characters");
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/** Write-temp-rename canonical JSON (never a half-written record on disk). */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, canonicalJsonStringify(value));
  await fs.rename(tmp, path);
}

/** Build the history projection from ordered full version records. */
function buildNodeHistory(
  projectId: string,
  nodeId: string,
  latestVersionId: string,
  versions: readonly GraphVersion[],
): NodeHistory {
  const entries: NodeVersionEntry[] = versions.map((version) => {
    let changeOp: "upsert-node" | "delete" | null = null;
    for (const record of version.changeLog) {
      const change = parseChangeRecord(record);
      if (change.op === "delete" && change.nodeId === nodeId) {
        changeOp = "delete";
        break;
      }
      if (change.op === "upsert-node" && change.node.nodeId === nodeId) {
        changeOp = "upsert-node";
        break;
      }
    }
    return {
      versionId: version.versionId,
      changed: changeOp !== null,
      changeOp,
      node: version.nodes.find((node) => node.nodeId === nodeId) ?? null,
      tombstone: version.tombstones.find((stone) => stone.nodeId === nodeId) ?? null,
    };
  });
  return { projectId, nodeId, latestVersionId, entries };
}

/** Shared apply-flow: parent → engine → append-only persistence. */
interface ApplyDeps {
  readonly loadIndex: (projectId: string) => Promise<ProjectHeader | null>;
  readonly loadVersion: (projectId: string, versionId: string) => Promise<GraphVersion | null>;
  readonly persistVersion: (projectId: string, version: GraphVersion) => Promise<void>;
  readonly persistIndex: (projectId: string, header: ProjectHeader) => Promise<void>;
}

async function applyChangesFlow(
  deps: ApplyDeps,
  projectId: string,
  changes: readonly ChangeRecord[],
  meta: ChangeMeta,
): Promise<GraphVersion> {
  assertProjectId(projectId);
  const index = await deps.loadIndex(projectId);
  if (index === null) {
    throw new RealityGraphError("project_not_found", `project "${projectId}" is unknown`);
  }
  const latest = await deps.loadVersion(projectId, index.latestVersionId);
  if (latest === null) {
    throw new RealityGraphError(
      "version_not_found",
      `latest version "${index.latestVersionId}" of project "${projectId}" is missing`,
    );
  }
  // The store materializes snapshots per version, so the engine only needs
  // the LATEST version as its parent.
  const graph: RealityGraph = {
    projectId,
    createdAt: index.createdAt,
    versions: [latest],
  };
  const next = applyChanges(graph, changes, meta);
  await deps.persistVersion(projectId, next);
  const versions: VersionSummary[] = [...index.versions, summarizeVersion(next)];
  await deps.persistIndex(projectId, {
    projectId,
    createdAt: index.createdAt,
    latestVersionId: next.versionId,
    versions,
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                           */
/* ------------------------------------------------------------------ */

export class FsRealityStore implements RealityStore {
  private readonly rootDir: string;

  constructor(dataDir: string) {
    this.rootDir = join(dataDir, "reality");
  }

  private projectDir(projectId: string): string {
    assertProjectId(projectId);
    return join(this.rootDir, sha256Hex(projectId));
  }

  private indexPath(projectId: string): string {
    return join(this.projectDir(projectId), "graph.json");
  }

  private versionPath(projectId: string, versionId: string): string {
    return join(this.projectDir(projectId), "versions", `${versionId}.json`);
  }

  async createProject(projectId: string, createdAt: string): Promise<ProjectHeader> {
    assertProjectId(projectId);
    assertIsoTimestamp(createdAt, "project createdAt");
    const indexPath = this.indexPath(projectId);
    if (await fileExists(indexPath)) {
      throw new RealityGraphError("project_exists", `project "${projectId}" already exists`);
    }
    const version = createInitialVersion(projectId, createdAt);
    await writeJsonAtomic(this.versionPath(projectId, version.versionId), version);
    const header: ProjectHeader = {
      projectId,
      createdAt,
      latestVersionId: version.versionId,
      versions: [summarizeVersion(version)],
    };
    await writeJsonAtomic(indexPath, header);
    return header;
  }

  async getProject(projectId: string): Promise<ProjectHeader | null> {
    assertProjectId(projectId);
    return readJsonFile<ProjectHeader>(this.indexPath(projectId));
  }

  async getVersion(projectId: string, versionId?: string): Promise<GraphVersion | null> {
    assertProjectId(projectId);
    const index = await readJsonFile<ProjectHeader>(this.indexPath(projectId));
    if (index === null) {
      return null;
    }
    const target = versionId ?? index.latestVersionId;
    if (!VERSION_ID_PATTERN.test(target)) {
      throw new RealityGraphError(
        "invalid_version_id",
        `version id "${target}" is not a vNNN sequence id`,
      );
    }
    return readJsonFile<GraphVersion>(this.versionPath(projectId, target));
  }

  async applyChanges(
    projectId: string,
    changes: readonly ChangeRecord[],
    meta: ChangeMeta,
  ): Promise<GraphVersion> {
    return applyChangesFlow(
      {
        loadIndex: (id) => this.getProject(id),
        loadVersion: (id, versionId) => this.getVersion(id, versionId),
        persistVersion: async (id, version) => {
          const path = this.versionPath(id, version.versionId);
          if (await fileExists(path)) {
            throw new RealityGraphError(
              "version_exists",
              `version "${version.versionId}" of project "${id}" already exists ` +
                `(append-only: version files are never rewritten)`,
            );
          }
          await writeJsonAtomic(path, version);
        },
        persistIndex: (id, header) => writeJsonAtomic(this.indexPath(id), header),
      },
      projectId,
      changes,
      meta,
    );
  }

  async getNodeHistory(projectId: string, nodeId: string): Promise<NodeHistory | null> {
    assertProjectId(projectId);
    if (nodeId.length < 1 || nodeId.length > 256) {
      throw new RealityGraphError("invalid_id", "nodeId must be 1..256 characters");
    }
    const index = await readJsonFile<ProjectHeader>(this.indexPath(projectId));
    if (index === null) {
      return null;
    }
    const versions: GraphVersion[] = [];
    for (const summary of index.versions) {
      const version = await readJsonFile<GraphVersion>(
        this.versionPath(projectId, summary.versionId),
      );
      if (version === null) {
        throw new RealityGraphError(
          "version_not_found",
          `version "${summary.versionId}" of project "${projectId}" is missing`,
        );
      }
      versions.push(version);
    }
    return buildNodeHistory(projectId, nodeId, index.latestVersionId, versions);
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin                                                       */
/* ------------------------------------------------------------------ */

interface MemoryProject {
  readonly createdAt: string;
  latestVersionId: string;
  readonly summaries: VersionSummary[];
  readonly versions: Map<string, GraphVersion>;
}

/** Deterministic in-memory RealityStore (tests, embedded scenarios). */
export class InMemoryRealityStore implements RealityStore {
  private readonly projects = new Map<string, MemoryProject>();

  async createProject(projectId: string, createdAt: string): Promise<ProjectHeader> {
    assertProjectId(projectId);
    assertIsoTimestamp(createdAt, "project createdAt");
    if (this.projects.has(projectId)) {
      throw new RealityGraphError("project_exists", `project "${projectId}" already exists`);
    }
    const version = createInitialVersion(projectId, createdAt);
    const project: MemoryProject = {
      createdAt,
      latestVersionId: version.versionId,
      summaries: [summarizeVersion(version)],
      versions: new Map([[version.versionId, version]]),
    };
    this.projects.set(projectId, project);
    return {
      projectId,
      createdAt,
      latestVersionId: version.versionId,
      versions: [...project.summaries],
    };
  }

  async getProject(projectId: string): Promise<ProjectHeader | null> {
    const project = this.projects.get(projectId);
    if (project === undefined) {
      return null;
    }
    return {
      projectId,
      createdAt: project.createdAt,
      latestVersionId: project.latestVersionId,
      versions: [...project.summaries],
    };
  }

  async getVersion(projectId: string, versionId?: string): Promise<GraphVersion | null> {
    const project = this.projects.get(projectId);
    if (project === undefined) {
      return null;
    }
    const target = versionId ?? project.latestVersionId;
    if (!VERSION_ID_PATTERN.test(target)) {
      throw new RealityGraphError(
        "invalid_version_id",
        `version id "${target}" is not a vNNN sequence id`,
      );
    }
    return project.versions.get(target) ?? null;
  }

  async applyChanges(
    projectId: string,
    changes: readonly ChangeRecord[],
    meta: ChangeMeta,
  ): Promise<GraphVersion> {
    return applyChangesFlow(
      {
        loadIndex: (id) => this.getProject(id),
        loadVersion: async (id, versionId) => {
          const target = this.projects.get(id);
          return target?.versions.get(versionId) ?? null;
        },
        persistVersion: async (id, version) => {
          const target = this.projects.get(id);
          if (target === undefined) {
            throw new RealityGraphError("project_not_found", `project "${id}" is unknown`);
          }
          if (target.versions.has(version.versionId)) {
            throw new RealityGraphError(
              "version_exists",
              `version "${version.versionId}" of project "${id}" already exists (append-only)`,
            );
          }
          target.versions.set(version.versionId, version);
        },
        persistIndex: async (id, header) => {
          const target = this.projects.get(id);
          if (target === undefined) {
            throw new RealityGraphError("project_not_found", `project "${id}" is unknown`);
          }
          target.latestVersionId = header.latestVersionId;
          target.summaries.length = 0;
          target.summaries.push(...header.versions);
        },
      },
      projectId,
      changes,
      meta,
    );
  }

  async getNodeHistory(projectId: string, nodeId: string): Promise<NodeHistory | null> {
    const project = this.projects.get(projectId);
    if (project === undefined) {
      return null;
    }
    const versions = [...project.versions.values()].sort(
      (a, b) => versionSequence(a.versionId) - versionSequence(b.versionId),
    );
    return buildNodeHistory(projectId, nodeId, project.latestVersionId, versions);
  }
}
