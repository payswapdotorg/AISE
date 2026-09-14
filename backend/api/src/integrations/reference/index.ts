/**
 * AISE-037 — Reference adapters (deterministic, in-memory incumbents).
 *
 * Two system classes ship as reference implementations of the frozen ports —
 * boq-document and project-management — proving the contract is implementable
 * and swappable. Real connectors are injected implementations of the same
 * interfaces; nothing in the framework distinguishes them.
 */

export {
  BOQ_REFERENCE_ADAPTER_ID,
  BOQ_REFERENCE_ADAPTER_VERSION,
  BoqDocumentReferenceAdapter,
  InMemoryIncumbentBoqSystem,
  deriveBoqProjectionBody,
  parseJsonBytes,
  type BoqDocumentReferenceAdapterConfig,
  type IncumbentBoqDocumentRecord,
} from "./boq-document";
export {
  PM_REFERENCE_ADAPTER_ID,
  PM_REFERENCE_ADAPTER_VERSION,
  ProjectManagementReferenceAdapter,
  InMemoryIncumbentPmSystem,
  derivePmProjectionBody,
  type IncumbentPmEntity,
  type ProjectManagementReferenceAdapterConfig,
} from "./project-management";
export { DERIVED_PROJECTION_NOTE, type FailureScript } from "./internal";
