/**
 * AISE-037 — Reference adapter: PROJECT-MANAGEMENT incumbent systems.
 *
 * The second deterministic reference implementation of the same contract
 * (a different system class through the same framework paths — proving the
 * ports are swappable and interchangeable). Discipline is IDENTICAL to the
 * boq-document reference adapter:
 *
 *  - verbatim source-of-record identity (entity ids never re-keyed);
 *  - imports are evidence payloads with advisory derivation hints, never
 *    canonical writes;
 *  - content-addressed duplicate detection (skipped-duplicate);
 *  - per-record SOURCE_NOT_FOUND for missing incumbent entities;
 *  - exports DERIVED from the canonical snapshot through the injected
 *    reader, stamped with sourceVersionId (R14);
 *  - in-adapter scope enforcement (defense in depth);
 *  - typed per-call failure-script injection (TRANSIENT or PERMANENT).
 *
 * The class-specific semantics: entities are tasks/milestones/issues; the
 * derived export is a STATUS REPORT (entities grouped by verbatim incumbent
 * status), demonstrating a different derivation over the same contract.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import type {
  CanonicalSnapshotReader,
  ProjectManagementAdapter,
  ProjectManagementExportRequest,
  ProjectManagementImportRequest,
  SyncContext,
  SyncExecution,
} from "../adapter";
import type {
  AdapterDescriptor,
  CanonicalSnapshotRef,
  ConnectorStatus,
  ExportOutcome,
  ImportOutcome,
  ImportRecordOutcome,
} from "../model";
import { checkScope } from "../permissions";
import {
  DERIVED_PROJECTION_NOTE,
  encodeText,
  scriptedFailureAt,
  scopeRefusal,
  validateFailureScript,
  type FailureScript,
} from "./internal";
import { parseJsonBytes } from "./boq-document";

export const PM_REFERENCE_ADAPTER_ID = "reference-project-management";
export const PM_REFERENCE_ADAPTER_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* The in-memory incumbent project-management system (fixture)          */
/* ------------------------------------------------------------------ */

/** One incumbent project entity, exactly as the incumbent holds it. */
export interface IncumbentPmEntity {
  /** VERBATIM incumbent entity id (e.g. "TASK-101") — never re-keyed. */
  readonly entityId: string;
  readonly kind: "task" | "milestone" | "issue";
  readonly title: string;
  /** Verbatim incumbent status string (never interpreted here). */
  readonly status: string;
  readonly assignee: string | null;
  /** Verbatim incumbent metadata (open string map). */
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * In-memory incumbent system; `fetchCount` counts fetch attempts so tests
 * can prove the incumbent was never touched on a scope refusal.
 */
export class InMemoryIncumbentPmSystem {
  private readonly entities = new Map<string, IncumbentPmEntity>();
  public fetchCount = 0;

  put(entity: IncumbentPmEntity): void {
    this.entities.set(entity.entityId, entity);
  }

  fetch(entityId: string): IncumbentPmEntity | null {
    this.fetchCount += 1;
    return this.entities.get(entityId) ?? null;
  }

  get entityCount(): number {
    return this.entities.size;
  }
}

/** The bytes the incumbent "serves" for one entity (deterministic). */
function incumbentEntityBody(entity: IncumbentPmEntity): string {
  return canonicalJsonStringify({
    entityId: entity.entityId,
    kind: entity.kind,
    title: entity.title,
    status: entity.status,
    assignee: entity.assignee,
    metadata: entity.metadata,
  });
}

/* ------------------------------------------------------------------ */
/* The reference adapter                                                */
/* ------------------------------------------------------------------ */

export interface ProjectManagementReferenceAdapterConfig {
  readonly incumbent: InMemoryIncumbentPmSystem;
  readonly snapshotReader: CanonicalSnapshotReader;
  readonly failureScript?: FailureScript;
}

export class ProjectManagementReferenceAdapter implements ProjectManagementAdapter {
  readonly descriptor: AdapterDescriptor = {
    adapterId: PM_REFERENCE_ADAPTER_ID,
    systemClass: "project-management",
    displayName: "Reference project-management incumbent adapter (deterministic, in-memory)",
    capabilities: ["import-entities", "export-derived", "query-status"],
    version: PM_REFERENCE_ADAPTER_VERSION,
  };

  /** Test instrumentation: port calls actually executed. */
  public readonly calls = { import: 0, export: 0, status: 0 };

  /** Lineage memory: content id → sync id of the FIRST import. */
  private readonly firstImportSync = new Map<string, string>();
  private readonly failureScript: FailureScript | undefined;

  constructor(private readonly config: ProjectManagementReferenceAdapterConfig) {
    if (config.failureScript !== undefined) {
      validateFailureScript(config.failureScript);
    }
    this.failureScript = config.failureScript;
  }

  async importProjectEntities(
    request: ProjectManagementImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    // Defense in depth: least privilege enforced in the adapter too.
    const scope = checkScope(request.context.grantedScopes, "read:entities");
    if (!scope.ok) {
      return { kind: "failure", failure: scopeRefusal(scope) };
    }
    this.calls.import += 1;

    const scripted = scriptedFailureAt(this.failureScript, this.calls.import - 1);
    if (scripted !== null) {
      return { kind: "failure", failure: scripted };
    }

    const records: ImportRecordOutcome[] = [];
    for (const entityId of request.entityIds) {
      const incumbent = this.config.incumbent.fetch(entityId);
      if (incumbent === null) {
        records.push({
          status: "failed",
          sourceRecordId: entityId,
          failure: {
            code: "SOURCE_NOT_FOUND",
            detail:
              `incumbent entity '${entityId}' was not found in system instance ` +
              `'${request.context.sourceSystem.systemInstanceId}'`,
          },
        });
        continue;
      }
      const bytes = encodeText(incumbentEntityBody(incumbent));
      const contentId = sha256Hex(bytes);
      const sourceOfRecord = {
        sourceSystem: request.context.sourceSystem,
        sourceRecordId: entityId,
        fetchedAt: execution.clock(),
        contentId,
        syncId: execution.syncId,
      };
      const firstSyncId = this.firstImportSync.get(contentId);
      if (firstSyncId !== undefined) {
        records.push({
          status: "skipped-duplicate",
          sourceOfRecord,
          duplicateOf: { contentId, firstSyncId },
        });
        continue;
      }
      this.firstImportSync.set(contentId, execution.syncId);
      records.push({
        status: "imported",
        sourceOfRecord,
        evidencePayload: {
          contentId,
          byteSize: bytes.byteLength,
          mediaType: "application/json",
          bytes,
          sourceMetadata: { ...incumbent.metadata },
        },
        derivationHints: [
          {
            kind: "entity-mapping-review",
            note:
              "imported project entities are advisory input for case/review " +
              "workflows — mapping them into AISE structures is a governed " +
              "downstream decision, never a canonical write",
          },
        ],
      });
    }
    return { kind: "success", records };
  }

  async exportDerivedProjectReport(
    snapshot: CanonicalSnapshotRef,
    request: ProjectManagementExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    const scope = checkScope(request.context.grantedScopes, "write:derived-export");
    if (!scope.ok) {
      return { kind: "failure", failure: scopeRefusal(scope) };
    }
    this.calls.export += 1;

    const scripted = scriptedFailureAt(this.failureScript, this.calls.export - 1);
    if (scripted !== null) {
      return { kind: "failure", failure: scripted };
    }

    const snapshotBytes = await this.config.snapshotReader.read(snapshot);
    if (snapshotBytes === null) {
      return {
        kind: "failure",
        failure: {
          code: "SOURCE_NOT_FOUND",
          detail:
            `canonical snapshot content '${snapshot.snapshotContentId}' (version ` +
            `'${snapshot.sourceVersionId}') is not available to the export seam`,
        },
      };
    }

    const body = derivePmProjectionBody(snapshot, snapshotBytes, execution);
    const bytes = encodeText(body);

    return {
      kind: "success",
      projection: {
        bytes,
        mediaType: "application/json",
        contentId: sha256Hex(bytes),
        provenance: {
          exportedAt: execution.clock(),
          sourceVersionId: snapshot.sourceVersionId,
          snapshotContentId: snapshot.snapshotContentId,
          adapterId: PM_REFERENCE_ADAPTER_ID,
          derivationNote: DERIVED_PROJECTION_NOTE,
        },
      },
    };
  }

  async queryStatus(context: SyncContext): Promise<ConnectorStatus> {
    const scope = checkScope(context.grantedScopes, "query:status");
    if (!scope.ok) {
      return {
        available: false,
        detail: "query:status scope not granted (deny-by-default)",
        failure: scopeRefusal(scope),
      };
    }
    this.calls.status += 1;
    return {
      available: true,
      detail:
        `reference project-management adapter ready (deterministic in-memory ` +
        `incumbent, ${this.config.incumbent.entityCount} entit(ies))`,
      failure: null,
    };
  }
}

/* ------------------------------------------------------------------ */
/* The deterministic derivation (pure)                                  */
/* ------------------------------------------------------------------ */

/**
 * Derive the export body from the snapshot bytes: digest + byte size always;
 * when the snapshot parses as canonical JSON carrying an `entities` array of
 * objects, the report groups entities by their VERBATIM status field and
 * carries the entity rows verbatim (a different derivation than the
 * boq-document adapter's item listing — same contract, class-specific
 * semantics). A changed snapshot necessarily changes the report.
 */
export function derivePmProjectionBody(
  snapshot: CanonicalSnapshotRef,
  snapshotBytes: Uint8Array,
  execution: SyncExecution,
): string {
  const projection: Record<string, unknown> = {
    adapterId: PM_REFERENCE_ADAPTER_ID,
    derivedFrom: {
      sourceVersionId: snapshot.sourceVersionId,
      snapshotContentId: snapshot.snapshotContentId,
    },
    exportedAt: execution.clock(),
    snapshot: {
      digest: sha256Hex(snapshotBytes),
      byteSize: snapshotBytes.byteLength,
    },
  };
  const parsed = parseJsonBytes(snapshotBytes);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const entities = (parsed as Record<string, unknown>).entities;
    if (Array.isArray(entities)) {
      const rows = entities.filter(
        (entity): entity is Record<string, unknown> =>
          typeof entity === "object" && entity !== null,
      );
      const statusCounts: Record<string, number> = {};
      for (const row of rows) {
        const status = row.status;
        const key = typeof status === "string" ? status : "(no status)";
        statusCounts[key] = (statusCounts[key] ?? 0) + 1;
      }
      projection.entityStatusCounts = statusCounts;
      projection.entities = rows;
    }
  }
  return canonicalJsonStringify(projection);
}
