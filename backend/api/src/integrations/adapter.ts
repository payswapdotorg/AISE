/**
 * AISE-037 — The PORT interfaces: one minimal adapter contract per incumbent
 * system class.
 *
 * The relationship to real incumbent tools mirrors AISE-012's relationship to
 * WorldSculpt: THIS package owns the frozen contract + the deterministic
 * reference implementations; every real connector (an IFC gateway, a SAP
 * client, …) is an INJECTED implementation of one of these interfaces. The
 * framework itself never performs I/O — adapters own their I/O (network,
 * file, in-memory), which is exactly why every method is async and every
 * method returns a TYPED outcome instead of throwing raw.
 *
 * SHARED SURFACE per port (deliberately minimal):
 *
 *   descriptor                    honest AdapterDescriptor (012 pattern)
 *   importXxx(request, execution) → ImportOutcome   (evidence, never canonical)
 *   exportDerivedXxx(snapshot, request, execution) → ExportOutcome (derived)
 *   queryStatus(context)          → ConnectorStatus  (probe; NOT a sync)
 *
 *  - `execution` carries the sync engine's stamps (syncId, attempt, clock):
 *    adapters have NO clock of their own — every timestamp they emit
 *    (fetchedAt, exportedAt) comes from the injected execution clock.
 *  - IMPORT requests name incumbent record ids VERBATIM; EXPORT requests
 *    carry only caller options (the canonical snapshot arrives as the first
 *    parameter — the export's source of derivation).
 *  - `SyncContext` carries the opaque tenant/project ids and the EXPLICIT
 *    granted scopes (no ambient authority anywhere).
 *  - Adapters wrap their internals: a raw exception crossing the port is a
 *    CONTRACT_VIOLATION the sync engine converts (and journals) — it never
 *    propagates as an untyped throw.
 */

import type {
  AdapterDescriptor,
  CanonicalSnapshotRef,
  ConnectorStatus,
  ExportOutcome,
  ImportOutcome,
  SourceSystemRef,
  SystemClass,
} from "./model";
import type { GrantedScopes } from "./permissions";

/* ------------------------------------------------------------------ */
/* Shared request context + execution stamps                            */
/* ------------------------------------------------------------------ */

/**
 * Everything a port call needs about its caller: opaque tenant/project ids
 * (server-authoritative, journaled verbatim, never interpreted), the
 * incumbent system instance, and the EXPLICIT granted scopes for this sync.
 */
export interface SyncContext {
  readonly tenantId: string;
  readonly projectId: string;
  readonly sourceSystem: SourceSystemRef;
  readonly grantedScopes: GrantedScopes;
}

/**
 * The sync engine's execution stamps handed to every port call: the
 * content-derived sync id, the 1-based attempt number, and THE clock for all
 * timestamps the adapter must emit.
 */
export interface SyncExecution {
  readonly syncId: string;
  readonly attempt: number;
  readonly clock: () => string;
}

/* ------------------------------------------------------------------ */
/* Per-class request types (verbatim incumbent ids in, options only out) */
/* ------------------------------------------------------------------ */

export interface IfcImportRequest {
  readonly port: "bim-ifc";
  readonly direction: "import";
  readonly context: SyncContext;
  /** VERBATIM incumbent IFC model/file ids to fetch. */
  readonly modelIds: readonly string[];
}

export interface IfcExportRequest {
  readonly port: "bim-ifc";
  readonly direction: "export";
  readonly context: SyncContext;
  /** Optional element filter (opaque incumbent/AISE element ids). */
  readonly elementFilter?: readonly string[];
}

export interface DxfImportRequest {
  readonly port: "cad-dxf";
  readonly direction: "import";
  readonly context: SyncContext;
  /** VERBATIM incumbent drawing ids to fetch. */
  readonly drawingIds: readonly string[];
}

export interface DxfExportRequest {
  readonly port: "cad-dxf";
  readonly direction: "export";
  readonly context: SyncContext;
  readonly layerFilter?: readonly string[];
}

export interface BoqDocumentImportRequest {
  readonly port: "boq-document";
  readonly direction: "import";
  readonly context: SyncContext;
  /** VERBATIM incumbent BOQ/document record ids to fetch. */
  readonly documentIds: readonly string[];
}

export interface BoqDocumentExportRequest {
  readonly port: "boq-document";
  readonly direction: "export";
  readonly context: SyncContext;
  readonly sectionFilter?: readonly string[];
}

export interface ProjectManagementImportRequest {
  readonly port: "project-management";
  readonly direction: "import";
  readonly context: SyncContext;
  /** VERBATIM incumbent entity ids (tasks, milestones, issues) to fetch. */
  readonly entityIds: readonly string[];
}

export interface ProjectManagementExportRequest {
  readonly port: "project-management";
  readonly direction: "export";
  readonly context: SyncContext;
  readonly entityFilter?: readonly string[];
}

export interface ErpProcurementImportRequest {
  readonly port: "erp-procurement";
  readonly direction: "import";
  readonly context: SyncContext;
  /** VERBATIM incumbent procurement record ids (orders, invoices) to fetch. */
  readonly recordIds: readonly string[];
}

export interface ErpProcurementExportRequest {
  readonly port: "erp-procurement";
  readonly direction: "export";
  readonly context: SyncContext;
  readonly recordFilter?: readonly string[];
}

export interface StorageDocumentImportRequest {
  readonly port: "storage-document";
  readonly direction: "import";
  readonly context: SyncContext;
  /** VERBATIM incumbent document ids to fetch. */
  readonly documentIds: readonly string[];
}

export interface StorageDocumentExportRequest {
  readonly port: "storage-document";
  readonly direction: "export";
  readonly context: SyncContext;
  readonly pathPrefix?: string;
}

export type AnyImportRequest =
  | IfcImportRequest
  | DxfImportRequest
  | BoqDocumentImportRequest
  | ProjectManagementImportRequest
  | ErpProcurementImportRequest
  | StorageDocumentImportRequest;

export type AnyExportRequest =
  | IfcExportRequest
  | DxfExportRequest
  | BoqDocumentExportRequest
  | ProjectManagementExportRequest
  | ErpProcurementExportRequest
  | StorageDocumentExportRequest;

/* ------------------------------------------------------------------ */
/* The six ports                                                        */
/* ------------------------------------------------------------------ */

export interface BimIfcAdapter {
  readonly descriptor: AdapterDescriptor;
  importIfc(request: IfcImportRequest, execution: SyncExecution): Promise<ImportOutcome>;
  exportDerivedIfc(
    snapshot: CanonicalSnapshotRef,
    request: IfcExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome>;
  queryStatus(context: SyncContext): Promise<ConnectorStatus>;
}

export interface CadDxfAdapter {
  readonly descriptor: AdapterDescriptor;
  importDxf(request: DxfImportRequest, execution: SyncExecution): Promise<ImportOutcome>;
  exportDerivedDxf(
    snapshot: CanonicalSnapshotRef,
    request: DxfExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome>;
  queryStatus(context: SyncContext): Promise<ConnectorStatus>;
}

export interface BoqDocumentAdapter {
  readonly descriptor: AdapterDescriptor;
  importBoqDocument(
    request: BoqDocumentImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome>;
  exportDerivedBoqDocument(
    snapshot: CanonicalSnapshotRef,
    request: BoqDocumentExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome>;
  queryStatus(context: SyncContext): Promise<ConnectorStatus>;
}

export interface ProjectManagementAdapter {
  readonly descriptor: AdapterDescriptor;
  importProjectEntities(
    request: ProjectManagementImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome>;
  exportDerivedProjectReport(
    snapshot: CanonicalSnapshotRef,
    request: ProjectManagementExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome>;
  queryStatus(context: SyncContext): Promise<ConnectorStatus>;
}

export interface ErpProcurementAdapter {
  readonly descriptor: AdapterDescriptor;
  importProcurementRecords(
    request: ErpProcurementImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome>;
  exportDerivedProcurementReport(
    snapshot: CanonicalSnapshotRef,
    request: ErpProcurementExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome>;
  queryStatus(context: SyncContext): Promise<ConnectorStatus>;
}

export interface StorageDocumentAdapter {
  readonly descriptor: AdapterDescriptor;
  importDocuments(
    request: StorageDocumentImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome>;
  exportDerivedDocumentPackage(
    snapshot: CanonicalSnapshotRef,
    request: StorageDocumentExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome>;
  queryStatus(context: SyncContext): Promise<ConnectorStatus>;
}

/** Any registered incumbent adapter: exactly one port, chosen by class. */
export type IncumbentAdapter =
  | BimIfcAdapter
  | CadDxfAdapter
  | BoqDocumentAdapter
  | ProjectManagementAdapter
  | ErpProcurementAdapter
  | StorageDocumentAdapter;

/* ------------------------------------------------------------------ */
/* Class guards + dispatch (the single call path the sync engine uses)  */
/* ------------------------------------------------------------------ */

/** Narrow by the honest descriptor's system class (runtime-safe for JS). */
function adapterOfClass<T extends IncumbentAdapter>(
  adapter: IncumbentAdapter,
  systemClass: SystemClass,
): T | null {
  return adapter.descriptor.systemClass === systemClass ? (adapter as T) : null;
}

export function isBimIfcAdapter(adapter: IncumbentAdapter): adapter is BimIfcAdapter {
  return adapter.descriptor.systemClass === "bim-ifc";
}

export function isCadDxfAdapter(adapter: IncumbentAdapter): adapter is CadDxfAdapter {
  return adapter.descriptor.systemClass === "cad-dxf";
}

export function isBoqDocumentAdapter(adapter: IncumbentAdapter): adapter is BoqDocumentAdapter {
  return adapter.descriptor.systemClass === "boq-document";
}

export function isProjectManagementAdapter(
  adapter: IncumbentAdapter,
): adapter is ProjectManagementAdapter {
  return adapter.descriptor.systemClass === "project-management";
}

export function isErpProcurementAdapter(
  adapter: IncumbentAdapter,
): adapter is ErpProcurementAdapter {
  return adapter.descriptor.systemClass === "erp-procurement";
}

export function isStorageDocumentAdapter(
  adapter: IncumbentAdapter,
): adapter is StorageDocumentAdapter {
  return adapter.descriptor.systemClass === "storage-document";
}

/**
 * Dispatch one import to the class's port method. A class mismatch between
 * the adapter and the request is a typed CONTRACT_VIOLATION outcome (the
 * adapter never runs) — never an untyped cast or a raw throw.
 */
export async function dispatchImport(
  adapter: IncumbentAdapter,
  request: AnyImportRequest,
  execution: SyncExecution,
): Promise<ImportOutcome> {
  const wrongClass = (needed: SystemClass): ImportOutcome => ({
    kind: "failure",
    failure: {
      code: "CONTRACT_VIOLATION",
      detail:
        `adapter '${adapter.descriptor.adapterId}' is registered for system class ` +
        `'${adapter.descriptor.systemClass}' but the request targets '${needed}'`,
    },
  });
  switch (request.port) {
    case "bim-ifc": {
      const port = adapterOfClass<BimIfcAdapter>(adapter, "bim-ifc");
      return port === null ? wrongClass("bim-ifc") : port.importIfc(request, execution);
    }
    case "cad-dxf": {
      const port = adapterOfClass<CadDxfAdapter>(adapter, "cad-dxf");
      return port === null ? wrongClass("cad-dxf") : port.importDxf(request, execution);
    }
    case "boq-document": {
      const port = adapterOfClass<BoqDocumentAdapter>(adapter, "boq-document");
      return port === null ? wrongClass("boq-document") : port.importBoqDocument(request, execution);
    }
    case "project-management": {
      const port = adapterOfClass<ProjectManagementAdapter>(
        adapter,
        "project-management",
      );
      return port === null
        ? wrongClass("project-management")
        : port.importProjectEntities(request, execution);
    }
    case "erp-procurement": {
      const port = adapterOfClass<ErpProcurementAdapter>(
        adapter,
        "erp-procurement",
      );
      return port === null
        ? wrongClass("erp-procurement")
        : port.importProcurementRecords(request, execution);
    }
    case "storage-document": {
      const port = adapterOfClass<StorageDocumentAdapter>(
        adapter,
        "storage-document",
      );
      return port === null
        ? wrongClass("storage-document")
        : port.importDocuments(request, execution);
    }
  }
}

/**
 * Dispatch one export to the class's port method (same discipline as
 * `dispatchImport`; the canonical snapshot rides along as the derivation
 * source).
 */
export async function dispatchExport(
  adapter: IncumbentAdapter,
  snapshot: CanonicalSnapshotRef,
  request: AnyExportRequest,
  execution: SyncExecution,
): Promise<ExportOutcome> {
  const wrongClass = (needed: SystemClass): ExportOutcome => ({
    kind: "failure",
    failure: {
      code: "CONTRACT_VIOLATION",
      detail:
        `adapter '${adapter.descriptor.adapterId}' is registered for system class ` +
        `'${adapter.descriptor.systemClass}' but the request targets '${needed}'`,
    },
  });
  switch (request.port) {
    case "bim-ifc": {
      const port = adapterOfClass<BimIfcAdapter>(adapter, "bim-ifc");
      return port === null
        ? wrongClass("bim-ifc")
        : port.exportDerivedIfc(snapshot, request, execution);
    }
    case "cad-dxf": {
      const port = adapterOfClass<CadDxfAdapter>(adapter, "cad-dxf");
      return port === null
        ? wrongClass("cad-dxf")
        : port.exportDerivedDxf(snapshot, request, execution);
    }
    case "boq-document": {
      const port = adapterOfClass<BoqDocumentAdapter>(adapter, "boq-document");
      return port === null
        ? wrongClass("boq-document")
        : port.exportDerivedBoqDocument(snapshot, request, execution);
    }
    case "project-management": {
      const port = adapterOfClass<ProjectManagementAdapter>(
        adapter,
        "project-management",
      );
      return port === null
        ? wrongClass("project-management")
        : port.exportDerivedProjectReport(snapshot, request, execution);
    }
    case "erp-procurement": {
      const port = adapterOfClass<ErpProcurementAdapter>(
        adapter,
        "erp-procurement",
      );
      return port === null
        ? wrongClass("erp-procurement")
        : port.exportDerivedProcurementReport(snapshot, request, execution);
    }
    case "storage-document": {
      const port = adapterOfClass<StorageDocumentAdapter>(
        adapter,
        "storage-document",
      );
      return port === null
        ? wrongClass("storage-document")
        : port.exportDerivedDocumentPackage(snapshot, request, execution);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Adapter-side I/O seams (reference adapters use these; real ones too) */
/* ------------------------------------------------------------------ */

/**
 * Read-only canonical snapshot seam for EXPORT adapters: the adapter reads
 * the canonical snapshot bytes it derives from THROUGH this injected port
 * (adapters own I/O). `null` = the snapshot content is not available → the
 * adapter reports SOURCE_NOT_FOUND. The framework itself never calls this.
 */
export interface CanonicalSnapshotReader {
  read(ref: CanonicalSnapshotRef): Promise<Uint8Array | null>;
}

/**
 * In-memory reader over caller-supplied snapshot bytes (deterministic
 * fixtures and the reference adapters' default wiring).
 */
export function inMemorySnapshotReader(
  snapshots: ReadonlyMap<string, Uint8Array>,
): CanonicalSnapshotReader {
  return {
    read: async (ref) => snapshots.get(ref.snapshotContentId) ?? null,
  };
}
