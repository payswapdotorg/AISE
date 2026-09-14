/**
 * AISE-037 — Universal incumbent integration/adapter layer: PUBLIC SURFACE.
 *
 * Pure library module: NO router, NO server wiring (HTTP wiring belongs to
 * AISE-036/038, the same deliberate deferral as AISE-033). Imports only
 * @aise/shared-contracts, lib/hash and lib/log — never reality/boq/case/
 * evidence stores (tripwire-tested: no code path writes canonical data).
 *
 * Layers:
 *   model.ts        frozen vocabularies, descriptors, source-of-record
 *                   identity, typed outcomes, failure taxonomy, sync records
 *   permissions.ts  least-privilege scopes, the granted-subset model
 *   adapter.ts      the six per-class ports + dispatch + snapshot seam
 *   sync.ts         append-only SyncLedger + runSync retry engine
 *   registry.ts     adapter registration/lookup/deterministic selection
 *   reference/      two deterministic reference adapters (boq-document,
 *                   project-management) proving the contract is swappable
 *
 * testkit.ts is TEST SUPPORT ONLY and deliberately NOT exported here.
 */

/* Model — vocabularies, descriptors, identities, outcomes, failures. */
export {
  SYSTEM_CLASSES,
  ADAPTER_CAPABILITIES,
  CLASS_CAPABILITIES,
  validateAdapterDescriptor,
  TRANSIENT_FAILURE_CODES,
  PERMANENT_FAILURE_CODES,
  INTEGRATION_FAILURE_CODES,
  failureFamily,
  isRetryableFailure,
  integrationFailure,
  deriveSyncId,
  sha256OfCanonical,
} from "./model";
export type {
  SystemClass,
  AdapterCapability,
  AdapterDescriptor,
  AdapterDescriptorValidation,
  TransientFailureCode,
  PermanentFailureCode,
  IntegrationFailureCode,
  FailureFamily,
  IntegrationFailure,
  SourceSystemRef,
  SourceOfRecordIdentity,
  ImportedEvidencePayload,
  DerivationHint,
  ImportedRecord,
  SkippedDuplicateRecord,
  FailedRecord,
  ImportRecordOutcome,
  ImportOutcome,
  CanonicalSnapshotRef,
  ExportProvenance,
  DerivedProjection,
  ExportOutcome,
  ConnectorStatus,
  SyncDirection,
  SyncOverallStatus,
  SyncAttempt,
  SyncRecordOutcome,
  SyncRecord,
} from "./model";

/* Permissions — least privilege, deny-by-default. */
export {
  PERMISSION_SCOPES,
  CLASS_SCOPES,
  CLASS_IMPORT_SCOPE,
  scopeForCapability,
  capabilityForScope,
  requiredScopeForDirection,
  createGrantedScopes,
  grantedScopesHas,
  checkScope,
} from "./permissions";
export type { PermissionScope, GrantedScopes, GrantedScopesResult, ScopeCheck } from "./permissions";

/* Adapter — the six ports, requests, dispatch, snapshot seam. */
export {
  isBimIfcAdapter,
  isCadDxfAdapter,
  isBoqDocumentAdapter,
  isProjectManagementAdapter,
  isErpProcurementAdapter,
  isStorageDocumentAdapter,
  dispatchImport,
  dispatchExport,
  inMemorySnapshotReader,
} from "./adapter";
export type {
  SyncContext,
  SyncExecution,
  IfcImportRequest,
  IfcExportRequest,
  DxfImportRequest,
  DxfExportRequest,
  BoqDocumentImportRequest,
  BoqDocumentExportRequest,
  ProjectManagementImportRequest,
  ProjectManagementExportRequest,
  ErpProcurementImportRequest,
  ErpProcurementExportRequest,
  StorageDocumentImportRequest,
  StorageDocumentExportRequest,
  AnyImportRequest,
  AnyExportRequest,
  BimIfcAdapter,
  CadDxfAdapter,
  BoqDocumentAdapter,
  ProjectManagementAdapter,
  ErpProcurementAdapter,
  StorageDocumentAdapter,
  IncumbentAdapter,
  CanonicalSnapshotReader,
} from "./adapter";

/* Sync — append-only ledger + retry engine. */
export {
  InMemorySyncLedger,
  projectImportRecords,
  computeOverallStatus,
  runSync,
} from "./sync";
export type {
  ImportSyncRequest,
  ExportSyncRequest,
  SyncRequest,
  RetryPolicy,
  SyncDeps,
  SyncLedgerAppendResult,
  SyncLedger,
  SyncRunResult,
} from "./sync";

/* Registry — registration, lookup, deterministic selection. */
export { createAdapterRegistry } from "./registry";
export type {
  AdapterRegistrationResult,
  AdapterLookupResult,
  AdapterSelectionCriteria,
  AdapterSelectionResult,
  AdapterRegistry,
} from "./registry";

/* Reference adapters — deterministic proofs of the contract. */
export {
  BOQ_REFERENCE_ADAPTER_ID,
  BOQ_REFERENCE_ADAPTER_VERSION,
  BoqDocumentReferenceAdapter,
  InMemoryIncumbentBoqSystem,
  PM_REFERENCE_ADAPTER_ID,
  PM_REFERENCE_ADAPTER_VERSION,
  ProjectManagementReferenceAdapter,
  InMemoryIncumbentPmSystem,
} from "./reference";
export type {
  IncumbentBoqDocumentRecord,
  BoqDocumentReferenceAdapterConfig,
  IncumbentPmEntity,
  ProjectManagementReferenceAdapterConfig,
} from "./reference";
