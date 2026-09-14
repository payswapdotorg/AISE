/**
 * AISE-037 — Reference adapter: BOQ/DOCUMENT incumbent systems.
 *
 * A deterministic, in-memory implementation of the `BoqDocumentAdapter` port
 * that honors the FULL contract:
 *
 *  - SOURCE-OF-RECORD IDENTITY preserved VERBATIM (incumbent document ids
 *    are never re-keyed; the content id is ADDED alongside);
 *  - imports produce EVIDENCE payloads (bytes + content address + verbatim
 *    incumbent metadata) with ADVISORY derivation hints — never canonical
 *    graph writes (there is no path from here into BOQ/reality stores);
 *  - duplicate imports are content-addressed: the same incumbent bytes
 *    fetched again yield `skipped-duplicate` naming the first sync;
 *  - missing incumbent records are per-record SOURCE_NOT_FOUND failures;
 *  - exports are DERIVED from the canonical snapshot read through the
 *    injected snapshot reader (mutation of the snapshot changes the
 *    projection — derived, not cached authority), stamped with the
 *    sourceVersionId they derive from;
 *  - scopes are enforced IN the adapter as defense in depth (the sync
 *    engine pre-checks them before the adapter ever runs);
 *  - failure scripts inject typed TRANSIENT or PERMANENT failures per call
 *    for deterministic retry-matrix tests.
 *
 * The adapter has NO clock of its own: every timestamp comes from the
 * execution stamps the sync engine injects.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import type {
  BoqDocumentAdapter,
  BoqDocumentExportRequest,
  BoqDocumentImportRequest,
  CanonicalSnapshotReader,
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

export const BOQ_REFERENCE_ADAPTER_ID = "reference-boq-document";
export const BOQ_REFERENCE_ADAPTER_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* The in-memory incumbent BOQ/document system (deterministic fixture)  */
/* ------------------------------------------------------------------ */

/** One incumbent BOQ/document record, exactly as the incumbent holds it. */
export interface IncumbentBoqDocumentRecord {
  /** VERBATIM incumbent record id (any non-empty string — never re-keyed). */
  readonly recordId: string;
  readonly title: string;
  readonly mediaType: string;
  /** Verbatim incumbent metadata (open string map). */
  readonly metadata: Readonly<Record<string, string>>;
  /** The document body the incumbent serves (deterministic fixture bytes). */
  readonly body: string;
}

/**
 * In-memory incumbent system. `fetchCount` counts fetch attempts (including
 * misses) so tests can prove the adapter never touched the incumbent on a
 * scope refusal.
 */
export class InMemoryIncumbentBoqSystem {
  private readonly records = new Map<string, IncumbentBoqDocumentRecord>();
  public fetchCount = 0;

  put(record: IncumbentBoqDocumentRecord): void {
    this.records.set(record.recordId, record);
  }

  fetch(recordId: string): IncumbentBoqDocumentRecord | null {
    this.fetchCount += 1;
    return this.records.get(recordId) ?? null;
  }

  get recordCount(): number {
    return this.records.size;
  }
}

/* ------------------------------------------------------------------ */
/* The reference adapter                                                */
/* ------------------------------------------------------------------ */

export interface BoqDocumentReferenceAdapterConfig {
  /** The simulated incumbent system (serves the "fetched" bytes). */
  readonly incumbent: InMemoryIncumbentBoqSystem;
  /** Canonical snapshot seam for derived exports. */
  readonly snapshotReader: CanonicalSnapshotReader;
  /** Deterministic per-call failure injection (validated at construction). */
  readonly failureScript?: FailureScript;
}

export class BoqDocumentReferenceAdapter implements BoqDocumentAdapter {
  readonly descriptor: AdapterDescriptor = {
    adapterId: BOQ_REFERENCE_ADAPTER_ID,
    systemClass: "boq-document",
    displayName: "Reference BOQ/document incumbent adapter (deterministic, in-memory)",
    capabilities: ["import-documents", "export-derived", "query-status"],
    version: BOQ_REFERENCE_ADAPTER_VERSION,
  };

  /** Test instrumentation: port calls actually executed. */
  public readonly calls = { import: 0, export: 0, status: 0 };

  /** Lineage memory: content id → sync id of the FIRST import. */
  private readonly firstImportSync = new Map<string, string>();
  private readonly failureScript: FailureScript | undefined;

  constructor(private readonly config: BoqDocumentReferenceAdapterConfig) {
    if (config.failureScript !== undefined) {
      validateFailureScript(config.failureScript);
    }
    this.failureScript = config.failureScript;
  }

  async importBoqDocument(
    request: BoqDocumentImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    // Defense in depth: the sync engine pre-checks scopes; the adapter
    // refuses again before touching the incumbent (least privilege is a
    // property of the contract, not only of the engine).
    const scope = checkScope(request.context.grantedScopes, "read:documents");
    if (!scope.ok) {
      return { kind: "failure", failure: scopeRefusal(scope) };
    }
    this.calls.import += 1;

    const scripted = scriptedFailureAt(this.failureScript, this.calls.import - 1);
    if (scripted !== null) {
      return { kind: "failure", failure: scripted };
    }

    const records: ImportRecordOutcome[] = [];
    for (const documentId of request.documentIds) {
      const incumbent = this.config.incumbent.fetch(documentId);
      if (incumbent === null) {
        records.push({
          status: "failed",
          sourceRecordId: documentId,
          failure: {
            code: "SOURCE_NOT_FOUND",
            detail:
              `incumbent document '${documentId}' was not found in system instance ` +
              `'${request.context.sourceSystem.systemInstanceId}'`,
          },
        });
        continue;
      }
      const bytes = encodeText(incumbent.body);
      const contentId = sha256Hex(bytes);
      const sourceOfRecord = {
        sourceSystem: request.context.sourceSystem,
        sourceRecordId: documentId,
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
          mediaType: incumbent.mediaType,
          bytes,
          sourceMetadata: { ...incumbent.metadata },
        },
        derivationHints: [
          {
            kind: "boq-lens-parse",
            note:
              "imported BOQ document is ready for an AISE-011 BOQ Lens import " +
              "(advisory hint; downstream review owns the decision)",
          },
          {
            kind: "document-review",
            note: "imported document is evidence for downstream human review",
          },
        ],
      });
    }
    return { kind: "success", records };
  }

  async exportDerivedBoqDocument(
    snapshot: CanonicalSnapshotRef,
    request: BoqDocumentExportRequest,
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

    // Adapters own I/O: the snapshot bytes are read through the injected
    // seam. A missing canonical snapshot is a PERMANENT, explicit failure.
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

    // DERIVED projection: a deterministic function of the snapshot CONTENT
    // (digest + byte size always; item rows when the snapshot carries them).
    // A changed snapshot necessarily changes the projection bytes.
    const body = deriveBoqProjectionBody(snapshot, snapshotBytes, execution);
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
          adapterId: BOQ_REFERENCE_ADAPTER_ID,
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
        `reference boq-document adapter ready (deterministic in-memory incumbent, ` +
        `${this.config.incumbent.recordCount} record(s))`,
      failure: null,
    };
  }
}

/* ------------------------------------------------------------------ */
/* The deterministic derivation (pure)                                  */
/* ------------------------------------------------------------------ */

interface SnapshotItemRow {
  readonly code?: unknown;
  readonly description?: unknown;
  readonly quantity?: unknown;
  readonly unit?: unknown;
  [key: string]: unknown;
}

/**
 * Derive the export body from the snapshot bytes: digest + byte size always;
 * when the snapshot parses as canonical JSON carrying an `items` array of
 * objects, the item rows are carried VERBATIM (no interpretation — quantity
 * mapping is AISE-014's authority, not an exporter's).
 */
export function deriveBoqProjectionBody(
  snapshot: CanonicalSnapshotRef,
  snapshotBytes: Uint8Array,
  execution: SyncExecution,
): string {
  const projection: Record<string, unknown> = {
    adapterId: BOQ_REFERENCE_ADAPTER_ID,
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
    const items = (parsed as Record<string, unknown>).items;
    if (Array.isArray(items)) {
      projection.items = items.filter(
        (item): item is SnapshotItemRow => typeof item === "object" && item !== null,
      );
    }
  }
  return canonicalJsonStringify(projection);
}

/** Parse snapshot bytes as JSON (null on any parse failure — honest). */
export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
