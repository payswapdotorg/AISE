/**
 * AISE-037 — Deterministic test fixtures — TEST SUPPORT ONLY, never imported
 * by production modules.
 *
 * Everything here is a contract-shaped stub with deterministic,
 * call-counted behavior: fixed/advancing injected clocks, content ids
 * derived from fixed seed strings via sha-256, an omni fake adapter that
 * implements all six ports for dispatch tests, and fixture incumbent
 * systems/snapshots for the reference adapters. No randomness, no wall
 * clock, no network. The verify gate stays deterministic.
 */

import { sha256Hex } from "../lib/hash";
import type {
  AnyExportRequest,
  AnyImportRequest,
  BoqDocumentAdapter,
  BoqDocumentExportRequest,
  BoqDocumentImportRequest,
  BimIfcAdapter,
  IfcExportRequest,
  IfcImportRequest,
  CadDxfAdapter,
  DxfExportRequest,
  DxfImportRequest,
  ErpProcurementAdapter,
  ErpProcurementExportRequest,
  ErpProcurementImportRequest,
  ProjectManagementAdapter,
  ProjectManagementExportRequest,
  ProjectManagementImportRequest,
  StorageDocumentAdapter,
  StorageDocumentExportRequest,
  StorageDocumentImportRequest,
  SyncContext,
  SyncExecution,
} from "./adapter";
import { inMemorySnapshotReader } from "./adapter";
import type {
  AdapterCapability,
  AdapterDescriptor,
  CanonicalSnapshotRef,
  ConnectorStatus,
  ExportOutcome,
  ImportOutcome,
  SystemClass,
} from "./model";
import { CLASS_CAPABILITIES } from "./model";
import { createGrantedScopes } from "./permissions";
import type { GrantedScopes, PermissionScope } from "./permissions";
import type { RetryPolicy, SyncDeps, SyncLedger } from "./sync";
import { InMemorySyncLedger } from "./sync";
import type { IncumbentBoqDocumentRecord } from "./reference/boq-document";
import { InMemoryIncumbentBoqSystem } from "./reference/boq-document";
import type { IncumbentPmEntity } from "./reference/project-management";
import { InMemoryIncumbentPmSystem } from "./reference/project-management";

/* ------------------------------------------------------------------ */
/* Fixed determinism                                                    */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-07-13T09:30:00.000Z";

/** Injected clock: constant, so ledger entries are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Deterministic content id (64 lowercase hex) from a seed string. */
export function contentIdOf(seed: string): string {
  return sha256Hex(`aise-integrations-test:${seed}`);
}

/**
 * Injected clock that advances by `stepMs` on every call from `startIso`.
 * Deterministic given the (fixed) call order of a code path.
 */
export function advancingClock(startIso: string, stepMs: number): () => string {
  let current = Date.parse(startIso);
  if (Number.isNaN(current)) {
    throw new Error(`advancingClock: invalid start instant '${startIso}'`);
  }
  return (): string => {
    const iso = new Date(current).toISOString();
    current += stepMs;
    return iso;
  };
}

/* ------------------------------------------------------------------ */
/* Scopes, contexts, executions                                         */
/* ------------------------------------------------------------------ */

/** A grant of every scope the class allows (the full-privilege fixture). */
export function fullGrant(systemClass: SystemClass): GrantedScopes {
  const scopes = CLASS_SCOPE_FIXTURE[systemClass];
  const result = createGrantedScopes(systemClass, scopes, scopes);
  if (!result.ok) {
    throw new Error(`testkit fixture bug: fullGrant(${systemClass}) failed`);
  }
  return result.granted;
}

/** A grant of exactly the listed (valid) scopes. */
export function grantOf(systemClass: SystemClass, scopes: readonly PermissionScope[]): GrantedScopes {
  const result = createGrantedScopes(systemClass, scopes, scopes);
  if (!result.ok) {
    throw new Error(`testkit fixture bug: grantOf(${systemClass}) failed: ${result.issues.join("; ")}`);
  }
  return result.granted;
}

/** The full scope list per class (fixture mirror of CLASS_SCOPES). */
export const CLASS_SCOPE_FIXTURE: Readonly<Record<SystemClass, readonly PermissionScope[]>> =
  Object.freeze({
    "bim-ifc": ["read:entities", "write:derived-export", "query:status"],
    "cad-dxf": ["read:entities", "write:derived-export", "query:status"],
    "boq-document": ["read:documents", "write:derived-export", "query:status"],
    "project-management": [
      "read:entities",
      "read:documents",
      "write:derived-export",
      "query:status",
    ],
    "erp-procurement": ["read:entities", "write:derived-export", "query:status"],
    "storage-document": ["read:documents", "write:derived-export", "query:status"],
  });

export interface ContextOptions {
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly systemClass?: SystemClass;
  readonly systemInstanceId?: string;
  readonly granted?: GrantedScopes;
}

/** A contract-valid sync context with deterministic defaults. */
export function makeContext(options?: ContextOptions): SyncContext {
  const systemClass = options?.systemClass ?? "boq-document";
  return {
    tenantId: options?.tenantId ?? "tenant-alpha",
    projectId: options?.projectId ?? "project-1",
    sourceSystem: {
      systemClass,
      systemInstanceId: options?.systemInstanceId ?? "incumbent-instance-01",
    },
    grantedScopes: options?.granted ?? fullGrant(systemClass),
  };
}

export interface ExecutionOptions {
  readonly syncId?: string;
  readonly attempt?: number;
  readonly clock?: () => string;
}

/** A contract-valid execution stamp with deterministic defaults. */
export function makeExecution(options?: ExecutionOptions): SyncExecution {
  return {
    syncId: options?.syncId ?? contentIdOf("sync"),
    attempt: options?.attempt ?? 1,
    clock: options?.clock ?? fixedClock,
  };
}

/* ------------------------------------------------------------------ */
/* Requests                                                             */
/* ------------------------------------------------------------------ */

/** The per-class import request for the given verbatim incumbent ids. */
export function importRequestFor(
  systemClass: SystemClass,
  ids: readonly string[],
  context?: SyncContext,
): AnyImportRequest {
  const ctx = context ?? makeContext({ systemClass });
  switch (systemClass) {
    case "bim-ifc":
      return { port: "bim-ifc", direction: "import", context: ctx, modelIds: [...ids] };
    case "cad-dxf":
      return { port: "cad-dxf", direction: "import", context: ctx, drawingIds: [...ids] };
    case "boq-document":
      return { port: "boq-document", direction: "import", context: ctx, documentIds: [...ids] };
    case "project-management":
      return { port: "project-management", direction: "import", context: ctx, entityIds: [...ids] };
    case "erp-procurement":
      return { port: "erp-procurement", direction: "import", context: ctx, recordIds: [...ids] };
    case "storage-document":
      return { port: "storage-document", direction: "import", context: ctx, documentIds: [...ids] };
  }
}

/** The per-class export request. */
export function exportRequestFor(
  systemClass: SystemClass,
  context?: SyncContext,
): AnyExportRequest {
  const ctx = context ?? makeContext({ systemClass });
  switch (systemClass) {
    case "bim-ifc":
      return { port: "bim-ifc", direction: "export", context: ctx };
    case "cad-dxf":
      return { port: "cad-dxf", direction: "export", context: ctx };
    case "boq-document":
      return { port: "boq-document", direction: "export", context: ctx };
    case "project-management":
      return { port: "project-management", direction: "export", context: ctx };
    case "erp-procurement":
      return { port: "erp-procurement", direction: "export", context: ctx };
    case "storage-document":
      return { port: "storage-document", direction: "export", context: ctx, pathPrefix: "/" };
  }
}

/* ------------------------------------------------------------------ */
/* Canonical snapshot fixtures                                          */
/* ------------------------------------------------------------------ */

export interface SnapshotFixture {
  readonly ref: CanonicalSnapshotRef;
  readonly bytes: Uint8Array;
}

/** Build one canonical snapshot fixture (tenant/project + version + content). */
export function makeSnapshot(options?: {
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly sourceVersionId?: string;
  readonly seed?: string;
  readonly items?: readonly unknown[];
  readonly entities?: readonly unknown[];
}): SnapshotFixture {
  const seed = options?.seed ?? "snapshot";
  const payload: Record<string, unknown> = {
    sourceVersionId: options?.sourceVersionId ?? "v003",
    items: options?.items ?? [
      { code: "02.110", description: "Concrete wall", quantity: 12.5, unit: "m2" },
      { code: "03.220", description: "Steel beam", quantity: 4, unit: "pcs" },
    ],
    // The seed lives INSIDE the JSON so the bytes stay parseable (the
    // export projection reads `.items` verbatim) while still
    // differentiating otherwise-identical snapshots by content.
    seed,
  };
  if (options?.entities !== undefined) {
    payload.entities = [...options.entities];
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    ref: {
      tenantId: options?.tenantId ?? "tenant-alpha",
      projectId: options?.projectId ?? "project-1",
      sourceVersionId: options?.sourceVersionId ?? "v003",
      snapshotContentId: sha256Hex(bytes),
    },
    bytes,
  };
}

/** A reader serving exactly the given snapshots (content-addressed). */
export function snapshotReaderOf(
  ...snapshots: readonly SnapshotFixture[]
): ReturnType<typeof inMemorySnapshotReader> {
  const map = new Map<string, Uint8Array>();
  for (const snapshot of snapshots) {
    map.set(snapshot.ref.snapshotContentId, snapshot.bytes);
  }
  return inMemorySnapshotReader(map);
}

/* ------------------------------------------------------------------ */
/* Incumbent system fixtures                                            */
/* ------------------------------------------------------------------ */

/** Three fixture BOQ/document records — including hostile verbatim ids. */
export function makeIncumbentBoqRecords(): IncumbentBoqDocumentRecord[] {
  return [
    {
      recordId: "BOQ-2026 #1 (main building)",
      title: "Main building BOQ",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      metadata: { "incumbent.author": "M. Weber", "incumbent.revision": "C" },
      body: "BOQ main building\n02.110 Concrete wall 12.5 m2\n03.220 Steel beam 4 pcs\n",
    },
    {
      recordId: "BOQ/2026/ä-2 — HVAC",
      title: "HVAC BOQ",
      mediaType: "text/csv",
      metadata: { "incumbent.author": "S. Novak" },
      body: "code,description,quantity\n04.100,Ducts,120,m\n",
    },
    {
      recordId: "doc-003",
      title: "Electrical BOQ",
      mediaType: "application/json",
      metadata: {},
      body: '{"items":[{"code":"05.100","description":"Cabling","quantity":300,"unit":"m"}]}',
    },
  ];
}

/** A deterministic in-memory BOQ incumbent holding the fixture records. */
export function makeIncumbentBoqSystem(): InMemoryIncumbentBoqSystem {
  const incumbent = new InMemoryIncumbentBoqSystem();
  for (const record of makeIncumbentBoqRecords()) {
    incumbent.put(record);
  }
  return incumbent;
}

/** Three fixture PM entities — including hostile verbatim ids. */
export function makeIncumbentPmEntities(): IncumbentPmEntity[] {
  return [
    {
      entityId: "TASK-101",
      kind: "task",
      title: "Pour foundation slab",
      status: "in_progress",
      assignee: "crew-a",
      metadata: { "incumbent.sprint": "14" },
    },
    {
      entityId: "MILESTONE/Ö-2 (topping out)",
      kind: "milestone",
      title: "Topping out",
      status: "not_started",
      assignee: null,
      metadata: {},
    },
    {
      entityId: "ISSUE-77",
      kind: "issue",
      title: "Crack in partition wall reported",
      status: "open",
      assignee: "eng-1",
      metadata: { "incumbent.severity": "medium" },
    },
  ];
}

/** A deterministic in-memory PM incumbent holding the fixture entities. */
export function makeIncumbentPmSystem(): InMemoryIncumbentPmSystem {
  const incumbent = new InMemoryIncumbentPmSystem();
  for (const entity of makeIncumbentPmEntities()) {
    incumbent.put(entity);
  }
  return incumbent;
}

/* ------------------------------------------------------------------ */
/* The omni fake adapter (all six ports; scripted, call-counted)         */
/* ------------------------------------------------------------------ */

export interface OmniFakeAdapterOptions {
  readonly systemClass?: SystemClass;
  readonly adapterId?: string;
  /** Defaults to the full class ceiling (see CLASS_CAPABILITIES). */
  readonly capabilities?: readonly AdapterCapability[];
  /** Scripted import outcomes, consumed by ANY import call, in order. */
  readonly importOutcomes?: readonly (ImportOutcome | "throw")[];
  /** Scripted export outcomes, consumed by ANY export call, in order. */
  readonly exportOutcomes?: readonly (ExportOutcome | "throw")[];
}

/**
 * Implements ALL six port interfaces at once (the union accepts it); the
 * descriptor's systemClass decides which port is honestly exercised. Every
 * method is call-counted; scripted outcomes are consumed in call order and
 * `"throw"` crosses the port boundary as a RAW exception (for the
 * CONTRACT_VIOLATION conversion test). Default behavior: deterministic
 * success derived from the request + execution stamps.
 */
export class OmniFakeAdapter
  implements
    BimIfcAdapter,
    CadDxfAdapter,
    BoqDocumentAdapter,
    ProjectManagementAdapter,
    ErpProcurementAdapter,
    StorageDocumentAdapter
{
  readonly descriptor: AdapterDescriptor;
  public readonly callCounts: Record<string, number> = {};
  private importCallIndex = 0;
  private exportCallIndex = 0;

  constructor(private readonly options: OmniFakeAdapterOptions = {}) {
    const systemClass = options.systemClass ?? "boq-document";
    this.descriptor = {
      adapterId: options.adapterId ?? `omni-fake-${systemClass}`,
      systemClass,
      displayName: `Omni fake adapter (${systemClass}, testkit)`,
      capabilities: options.capabilities ?? CLASS_CAPABILITIES[systemClass],
      version: "1.0.0",
    };
  }

  private count(method: string): void {
    this.callCounts[method] = (this.callCounts[method] ?? 0) + 1;
  }

  private requestedIds(request: AnyImportRequest): readonly string[] {
    switch (request.port) {
      case "bim-ifc":
        return request.modelIds;
      case "cad-dxf":
        return request.drawingIds;
      case "boq-document":
      case "storage-document":
        return request.documentIds;
      case "project-management":
        return request.entityIds;
      case "erp-procurement":
        return request.recordIds;
    }
  }

  private defaultImportOutcome(
    request: AnyImportRequest,
    execution: SyncExecution,
  ): ImportOutcome {
    return {
      kind: "success",
      records: this.requestedIds(request).map((id) => ({
        status: "imported",
        sourceOfRecord: {
          sourceSystem: request.context.sourceSystem,
          sourceRecordId: id,
          fetchedAt: execution.clock(),
          contentId: contentIdOf(`${id}`),
          syncId: execution.syncId,
        },
        evidencePayload: {
          contentId: contentIdOf(`${id}`),
          byteSize: 32,
          mediaType: "application/octet-stream",
          bytes: new TextEncoder().encode(`fake-incumbent-bytes:${id}`),
          sourceMetadata: { "incumbent.id": id },
        },
        derivationHints: [{ kind: "fake-hint", note: "deterministic fake adapter" }],
      })),
    };
  }

  private defaultExportOutcome(
    snapshot: CanonicalSnapshotRef,
    execution: SyncExecution,
  ): ExportOutcome {
    const bytes = new TextEncoder().encode(
      `derived:${snapshot.sourceVersionId}:${snapshot.snapshotContentId}:${execution.syncId}`,
    );
    return {
      kind: "success",
      projection: {
        bytes,
        mediaType: "application/octet-stream",
        contentId: sha256Hex(bytes),
        provenance: {
          exportedAt: execution.clock(),
          sourceVersionId: snapshot.sourceVersionId,
          snapshotContentId: snapshot.snapshotContentId,
          adapterId: this.options.adapterId ?? "omni-fake",
          derivationNote: "fake derived projection (testkit)",
        },
      },
    };
  }

  private nextImportOutcome(
    method: string,
    request: AnyImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    this.count(method);
    const scripted = this.options.importOutcomes?.[this.importCallIndex];
    this.importCallIndex += 1;
    if (scripted === "throw") {
      return Promise.reject(new Error(`raw throw from ${method} (test)`));
    }
    if (scripted !== undefined) {
      return Promise.resolve(scripted);
    }
    return Promise.resolve(this.defaultImportOutcome(request, execution));
  }

  private nextExportOutcome(
    method: string,
    snapshot: CanonicalSnapshotRef,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    this.count(method);
    const scripted = this.options.exportOutcomes?.[this.exportCallIndex];
    this.exportCallIndex += 1;
    if (scripted === "throw") {
      return Promise.reject(new Error(`raw throw from ${method} (test)`));
    }
    if (scripted !== undefined) {
      return Promise.resolve(scripted);
    }
    return Promise.resolve(this.defaultExportOutcome(snapshot, execution));
  }

  /** Total port calls across all methods. */
  totalCalls(): number {
    return Object.values(this.callCounts).reduce((sum, count) => sum + count, 0);
  }

  importIfc(request: IfcImportRequest, execution: SyncExecution): Promise<ImportOutcome> {
    return this.nextImportOutcome("importIfc", request, execution);
  }
  importDxf(request: DxfImportRequest, execution: SyncExecution): Promise<ImportOutcome> {
    return this.nextImportOutcome("importDxf", request, execution);
  }
  importBoqDocument(
    request: BoqDocumentImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    return this.nextImportOutcome("importBoqDocument", request, execution);
  }
  importProjectEntities(
    request: ProjectManagementImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    return this.nextImportOutcome("importProjectEntities", request, execution);
  }
  importProcurementRecords(
    request: ErpProcurementImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    return this.nextImportOutcome("importProcurementRecords", request, execution);
  }
  importDocuments(
    request: StorageDocumentImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    return this.nextImportOutcome("importDocuments", request, execution);
  }

  // The per-class export requests differ only in caller options the fake
  // ignores; every method carries its REAL request type.
  exportDerivedIfc(
    snapshot: CanonicalSnapshotRef,
    _request: IfcExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    return this.nextExportOutcome("exportDerivedIfc", snapshot, execution);
  }
  exportDerivedDxf(
    snapshot: CanonicalSnapshotRef,
    _request: DxfExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    return this.nextExportOutcome("exportDerivedDxf", snapshot, execution);
  }
  exportDerivedBoqDocument(
    snapshot: CanonicalSnapshotRef,
    _request: BoqDocumentExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    return this.nextExportOutcome("exportDerivedBoqDocument", snapshot, execution);
  }
  exportDerivedProjectReport(
    snapshot: CanonicalSnapshotRef,
    _request: ProjectManagementExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    return this.nextExportOutcome("exportDerivedProjectReport", snapshot, execution);
  }
  exportDerivedProcurementReport(
    snapshot: CanonicalSnapshotRef,
    _request: ErpProcurementExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    return this.nextExportOutcome("exportDerivedProcurementReport", snapshot, execution);
  }
  exportDerivedDocumentPackage(
    snapshot: CanonicalSnapshotRef,
    _request: StorageDocumentExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    return this.nextExportOutcome("exportDerivedDocumentPackage", snapshot, execution);
  }

  async queryStatus(context: SyncContext): Promise<ConnectorStatus> {
    this.count("queryStatus");
    const granted = context.grantedScopes.scopes.includes("query:status");
    return {
      available: granted,
      detail: granted ? "omni fake adapter ready" : "query:status not granted",
      failure: granted
        ? null
        : { code: "SCOPE_DENIED", detail: "query:status scope not granted (omni fake)" },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Sync deps                                                            */
/* ------------------------------------------------------------------ */

/** Deterministic sync deps over a fresh (or given) in-memory ledger. */
export function makeSyncDeps(options?: {
  readonly ledger?: SyncLedger;
  readonly clock?: () => string;
  readonly maxAttempts?: number;
  readonly retryPolicy?: RetryPolicy;
}): SyncDeps {
  return {
    clock: options?.clock ?? fixedClock,
    ledger: options?.ledger ?? new InMemorySyncLedger(),
    retryPolicy: options?.retryPolicy ?? { maxAttempts: options?.maxAttempts ?? 3 },
  };
}
