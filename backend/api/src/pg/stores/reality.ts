/**
 * Pg twin for the Reality Graph store (PROD-017).
 *
 * `PgRealityStore` implements the EXACT `RealityStore` interface the Fs and
 * In-memory twins implement (reality/store.ts — read it before changing
 * anything here): the per-project INDEX (ProjectHeader) and the append-only
 * VERSION SNAPSHOTS (GraphVersion), with the shared `applyChangesFlow`
 * engine unchanged.
 *
 * Table mapping (v002):
 *  - `reality_project_index` (record_key = projectId) — whole-record UPSERT
 *    (the header rewrites on every applied change set, exactly like the Fs
 *    twin's graph.json); `createProject` claims the row INSERT-IF-ABSENT
 *    (a lost race is the typed `project_exists`).
 *  - `reality_versions` (record_key = `<projectId>::<versionId>`) —
 *    INSERT-IF-ABSENT (append-only; a lost race is the typed
 *    `version_exists`); `canonical` holds the BYTE-EXACT canonical JSON the
 *    Fs twin writes to `versions/<vNNN>.json`.
 *
 * Why this matters (the 2026-09-29 deployed seam finding): with the Fs twin
 * the deployed stack held reality state per lambda instance — the governed
 * crossing could land its ensure-project and change-set on different
 * instances. The Pg twin makes the reality graph durable across instances,
 * completing the durability mapping the factory header documented.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  applyChangesFlow,
  assertProjectId,
  buildNodeHistory,
  VERSION_ID_PATTERN,
  type RealityStore,
} from "../../reality/store";
import { createInitialVersion, type ChangeMeta } from "../../reality/versioning";
import {
  assertIsoTimestamp,
  summarizeVersion,
  RealityGraphError,
  type ChangeRecord,
  type GraphVersion,
  type NodeHistory,
  type ProjectHeader,
} from "../../reality/model";
import type { PgExecutor } from "../executor";
import { PG_TABLES } from "../sql";
import { RecordTable } from "./records";

/** Parse one stored header text (the Fs discipline: invalid JSON is typed). */
function parseHeaderText(text: string): ProjectHeader {
  try {
    return JSON.parse(text) as ProjectHeader;
  } catch {
    throw new RealityGraphError("invalid_version_id", "reality index row is not valid JSON");
  }
}

/** Parse one stored version text. */
function parseVersionText(text: string): GraphVersion {
  try {
    return JSON.parse(text) as GraphVersion;
  } catch {
    throw new RealityGraphError("invalid_version_id", "reality version row is not valid JSON");
  }
}

/** The append-only version row key. */
function versionKey(projectId: string, versionId: string): string {
  return `${projectId}::${versionId}`;
}

export class PgRealityStore implements RealityStore {
  private readonly indexTable: RecordTable;
  private readonly versionsTable: RecordTable;

  constructor(executor: PgExecutor) {
    this.indexTable = new RecordTable(executor, PG_TABLES.realityProjectIndex);
    this.versionsTable = new RecordTable(executor, PG_TABLES.realityVersions);
  }

  async createProject(projectId: string, createdAt: string): Promise<ProjectHeader> {
    // The Fs twin's exact entry guards (typed invalid_project_id /
    // invalid_timestamp BEFORE any existence check).
    assertProjectId(projectId);
    assertIsoTimestamp(createdAt, "project createdAt");
    const version = createInitialVersion(projectId, createdAt);
    const header: ProjectHeader = {
      projectId,
      createdAt,
      latestVersionId: version.versionId,
      versions: [summarizeVersion(version)],
    };
    // Claim the project FIRST (insert-if-absent): a lost race is the typed
    // project_exists, verbatim like the Fs twin's index-existence check.
    const claim = await this.indexTable.insertIfAbsent(
      projectId,
      canonicalJsonStringify(header),
    );
    if (!claim.wrote) {
      throw new RealityGraphError("project_exists", `project "${projectId}" already exists`);
    }
    // Then the initial version row (append-only).
    await this.versionsTable.insertIfAbsent(
      versionKey(projectId, version.versionId),
      canonicalJsonStringify(version),
    );
    return header;
  }

  async getProject(projectId: string): Promise<ProjectHeader | null> {
    const canonical = await this.indexTable.selectCanonical(projectId);
    return canonical === null ? null : parseHeaderText(canonical);
  }

  async getVersion(projectId: string, versionId?: string): Promise<GraphVersion | null> {
    const index = await this.getProject(projectId);
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
    const canonical = await this.versionsTable.selectCanonical(versionKey(projectId, target));
    return canonical === null ? null : parseVersionText(canonical);
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
          const claim = await this.versionsTable.insertIfAbsent(
            versionKey(id, version.versionId),
            canonicalJsonStringify(version),
          );
          if (!claim.wrote) {
            throw new RealityGraphError(
              "version_exists",
              `version "${version.versionId}" of project "${id}" already exists ` +
                `(append-only: version rows are never rewritten)`,
            );
          }
        },
        persistIndex: (id, header) => {
          return this.indexTable.upsert(id, canonicalJsonStringify(header));
        },
      },
      projectId,
      changes,
      meta,
    );
  }

  async getNodeHistory(projectId: string, nodeId: string): Promise<NodeHistory | null> {
    const index = await this.getProject(projectId);
    if (index === null) {
      return null;
    }
    const versions: GraphVersion[] = [];
    for (const summary of index.versions) {
      const canonical = await this.versionsTable.selectCanonical(
        versionKey(projectId, summary.versionId),
      );
      if (canonical === null) {
        throw new RealityGraphError(
          "version_not_found",
          `version "${summary.versionId}" of project "${projectId}" is missing`,
        );
      }
      versions.push(parseVersionText(canonical));
    }
    return buildNodeHistory(projectId, nodeId, index.latestVersionId, versions);
  }
}
