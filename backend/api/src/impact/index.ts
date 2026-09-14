/**
 * AISE-028 — Intervention quantities/cost impacts public surface.
 *
 * Consumers (server.ts, future AISE-027 viewer BOQ-impact panels / AISE-038
 * developer API) import from HERE only. The module is a deterministic
 * derived-projection library plus its HTTP adapter: model (types,
 * vocabularies, typed errors, parsers, digests, read-only authority
 * projections) + service (the compute engine over an injected store and TWO
 * read-only resolvers) + store (write-once persistence + in-memory twin) +
 * router (transport).
 *
 * THE DERIVED-PROJECTION BOUNDARY, restated at the surface: this module
 * imports NO sibling module at runtime (read-only TYPE imports from
 * intervention/model, boq/model and boq/mapping/model only, plus the pure
 * first-order uncertainty propagation helper from geometry/uncertainty) —
 * there is no write path from here into the intervention or BOQ
 * authorities, ever. Impact figures are PROPOSED state deltas; observed
 * reality stays with the Reality Graph authority.
 */

export {
  IMPACT_COST_OMISSION_CODES,
  IMPACT_EPISTEMIC_STATUSES,
  IMPACT_ERROR_CODES,
  IMPACT_EVENT_TYPES,
  IMPACT_LINE_KINDS,
  IMPACT_OMISSION_CODES,
  IMPACT_UNIT_RELATIONS,
  ImpactError,
  deriveCostId,
  deriveImpactId,
  deriveLineId,
  impactReportDigest,
  lineDiscriminator,
  parseComputeImpactInput,
  parseImpactRecord,
  projectImpactBoqMappingInput,
  projectImpactScenarioInput,
  propagateCostUncertainty,
  propagateDeltaUncertainty,
  propagateSingleUncertainty,
  resolveUnitText,
  summarizeImpact,
  validateImpactId,
  validateImportRefId,
  validateScenarioRefId,
  type ComputeImpactInput,
  type CostImpact,
  type ImpactBasis,
  type ImpactBoqItemInput,
  type ImpactBoqMappingInput,
  type ImpactBoqMappingRef,
  type ImpactCostOmissionCode,
  type ImpactEpistemicStatus,
  type ImpactEvent,
  type ImpactEventType,
  type ImpactErrorCode,
  type ImpactGeometryRefInput,
  type ImpactLine,
  type ImpactLineKind,
  type ImpactOmissionCode,
  type ImpactPropertyInput,
  type ImpactQuantity,
  type ImpactRate,
  type ImpactRecord,
  type ImpactReport,
  type ImpactScenarioInput,
  type ImpactStateInput,
  type ImpactStateNodeInput,
  type ImpactStepChange,
  type ImpactStepInput,
  type ImpactSummary,
  type ImpactSummaryRecord,
  type ImpactTombstoneInput,
  type ImpactUnitRelation,
  type ImpactUnpricedPair,
} from "./model";
export {
  ImpactService,
  readOnlyImpactBoqMappingResolver,
  readOnlyImpactScenarioResolver,
  type ImpactBoqMappingResolver,
  type ImpactScenarioResolver,
  type ImpactServiceDeps,
} from "./service";
export { FsImpactStore, InMemoryImpactStore, type ImpactStore } from "./store";
export { handleImpactRequest, type ImpactRouteOptions } from "./router";
