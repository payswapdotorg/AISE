/**
 * `@aise/solution-boq` — public API (PROD-025).
 *
 * The DETERMINISTIC SOLUTION BOQ DERIVATION of ACR-005: turns a validated
 * interactive solution version (with the ENGINE's applied results — effects
 * and derived quantities) plus its DECLARED validation snapshot into an
 * auditable, versioned, derived building BOQ, and makes the BOQ an
 * explorable explanation of the virtual construction/repair process:
 *
 *  - `deriveSolutionBoq` — the derivation (fail-closed snapshot gates,
 *    engine-sourced quantities, grouping into building BOQ lines with
 *    units, materials and CITED calculation methods, uncertainty and
 *    unresolved-assumption propagation, the contract trace set);
 *  - `verifySolutionBoq` / `isSolutionGeneratedBoq` — self-contained
 *    integrity verification and the TYPED source-vs-generated seal;
 *  - `navigateLineToOperations` / `navigateOperationToLines` /
 *    `assertBoqNavigationRoundTrip` — the bidirectional BOQ-line ↔
 *    solution-step navigation (resolved through the CONTRACT's resolvers);
 *  - `diffSolutionBoqs` — version-pair deltas with operation-level lineage;
 *  - `snapshotCertifiesVersion` — the snapshot/bytes certification check.
 *
 * PURE DETERMINISTIC COMPUTATION over `@aise/solution-contract` objects and
 * `@aise/solution-engine` outputs: no network, no clock reads (NO
 * derivation-time field exists on a generated BOQ), no randomness, no I/O
 * in the core, and NO WRITE PATH into any source BOQ store (the generated
 * BOQ references a source BOQ by identity only — `SourceBoqReference` —
 * and is a separate derived projection, never an overwrite).
 *
 * Endpoint-side orchestration lives in the backend module
 * `backend/api/src/solution-boq/` (transport adapter over this package).
 */

/* Deriver identity ------------------------------------------------------ */

export {
  SOLUTION_BOQ_KIND,
  SOLUTION_BOQ_VERSION,
  solutionBoqDerivationRef,
} from "./boq-version";

/* Typed errors (fail closed) --------------------------------------------- */

export {
  SOLUTION_BOQ_ERROR_CODES,
  SolutionBoqError,
} from "./errors";
export type { SolutionBoqErrorCode } from "./errors";

/* Sections + building elements (labels over the CONTRACT's own data) ------ */

export {
  OTHER_WORKS_SECTION,
  SOLUTION_BOQ_SECTION_ORDER,
  SOLUTION_BOQ_SECTION_TITLES,
  sectionOfOperationType,
  sectionOrderIndex,
  sectionTitle,
} from "./sections";
export {
  BUILDING_ELEMENT_LABELS,
  GENERIC_BUILDING_ELEMENT,
  boqItemDescription,
  buildingElementOfOperationType,
} from "./elements";

/* The document model -------------------------------------------------------- */

export type {
  DeriveSolutionBoqInput,
  SourceBoqReference,
  SolutionBoq,
  SolutionBoqAssumption,
  SolutionBoqAssumptionOrigin,
  SolutionBoqDerivationRef,
  SolutionBoqLine,
  SolutionBoqLineContribution,
  SolutionBoqLineQuantity,
  SolutionBoqSection,
  SolutionBoqSnapshotEcho,
} from "./model";
export type {
  OperationContribution,
  QuantityDimension,
  QuantityImpactDirection,
  QuantityTotal,
  SolutionBoqLineTrace,
  SolutionBoqTraceSet,
  SolutionValidationSnapshot,
  SolutionVersion,
  TargetGeometryRef,
  Uncertainty,
} from "./model";

/* Deterministic identities ----------------------------------------------------- */

export {
  deriveSolutionBoqAssumptionId,
  deriveSolutionBoqId,
  deriveSolutionBoqLineId,
  lineIdentityOf,
  solutionBoqLineTraceId,
} from "./identity";
export type { SolutionBoqLineIdentityInput } from "./identity";

/* Uncertainty + unresolved assumptions ------------------------------------------- */

export {
  collectValidationCheckAssumptions,
  propagateUncertainty,
} from "./assumptions";
export type { UncertaintyPropagation } from "./assumptions";

/* The derivation ------------------------------------------------------------------ */

export { deriveSolutionBoq, snapshotCertifiesVersion, QUANTITY_METHOD_SOURCE } from "./derive";

/* Verification + the typed source-vs-generated seal --------------------------------- */

export {
  isSolutionGeneratedBoq,
  verifySolutionBoq,
} from "./verify";
export type {
  SolutionBoqVerification,
  SolutionBoqVerificationSummary,
} from "./verify";

/* Bidirectional navigation ----------------------------------------------------------- */

export {
  assertBoqNavigationRoundTrip,
  navigateLineToOperations,
  navigateOperationToLines,
} from "./navigate";
export type {
  BoqLineOperationNavigation,
  BoqOperationLineEntry,
} from "./navigate";

/* Version-pair deltas -------------------------------------------------------------------- */

export {
  boqLineSemanticKey,
  diffSolutionBoqs,
} from "./delta";
export type {
  BoqLineSemanticKey,
  SolutionBoqDelta,
  SolutionBoqDeltaLine,
} from "./delta";
