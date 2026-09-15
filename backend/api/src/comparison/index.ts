/**
 * AISE-032 — Reality-vs-design comparison public surface.
 *
 * Consumers (server.ts, future AISE-027 viewer reconciliation panels /
 * AISE-024 BOQ Lens discrepancy views / AISE-035 dogfood / AISE-038
 * developer API) import from HERE only. The module is a domain library
 * plus its HTTP adapter: model (types, vocabularies, typed errors,
 * parsers, digests, the pure deterministic comparison matrix) + service
 * (policy engine over an injected store and TWO read-only reference
 * resolvers: reality version resolution and evidence membership) + store
 * (persistence + in-memory twin) + router (transport).
 *
 * THE DERIVED-PROJECTION BOUNDARY, restated at the surface: this module
 * imports NO sibling module at runtime (read-only TYPE imports from
 * reality/model only) — there is no write path from here into the
 * Reality Graph or the Evidence authority, ever. The pinned reality
 * version is consumed read-only through the injected resolver; the
 * imported design reference is carried VERBATIM (ExternalReference
 * source-of-record identity, never re-keyed); comparison records are
 * derived, append-only and byte-identical under recomputation of the
 * same inputs. This module is the reality-vs-DESIGN comparison authority
 * — distinct from AISE-033's reality-vs-reality change detection.
 */

export {
  COMPARISON_ASPECTS,
  COMPARISON_ERROR_CODES,
  COMPARISON_EVENT_TYPES,
  COMPARISON_OMISSION_CODES,
  COMPARISON_STATUSES,
  COVERAGE_OBSERVATION_STATUSES,
  ComparisonError,
  NO_TOLERANCES,
  compareRealityToDesign,
  comparisonContentDigest,
  comparisonInputDigest,
  comparisonStatsOf,
  parseComparisonRecord,
  parseRunComparisonInput,
  summarizeComparison,
  validateComparisonId,
  validateProjectRefId,
  validateVersionRefId,
  type ComparisonAspect,
  type ComparisonEntry,
  type ComparisonErrorCode,
  type ComparisonEvent,
  type ComparisonEventType,
  type ComparisonOmissionCode,
  type ComparisonRecord,
  type ComparisonStats,
  type ComparisonStatus,
  type ComparisonSummary,
  type ComparisonTolerances,
  type CoverageAnnotation,
  type CoverageObservationStatus,
  type DesignGeometryRef,
  type DesignItem,
  type DesignProperty,
  type DesignReference,
  type DesignSourceRef,
  type GeometryRefPair,
  type PropertyValueSnapshot,
  type RealityRef,
  type RunComparisonInput,
} from "./model";
export {
  ComparisonService,
  readOnlyEvidenceMembershipResolver,
  readOnlyRealityVersionResolver,
  type ComparisonServiceDeps,
  type EvidenceMembershipResolver,
  type RealityVersionResolver,
} from "./service";
export { FsComparisonStore, InMemoryComparisonStore, type ComparisonStore } from "./store";
export { handleComparisonRequest, type ComparisonRouteOptions } from "./router";
