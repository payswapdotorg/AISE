/**
 * AISE-024 — BOQ Lens workspace public surface.
 *
 * Executive / QS / contractor views over ONE server-assembled BOQ input,
 * with grounded natural-language explanation, cost hierarchy, traceability,
 * health checks and search (R8). READ the module headers before use:
 *
 *  - model.ts    — structural input types + the NO-BROWSER-AUTHORITY
 *                  invariant (everything is server-assembled, read-only;
 *                  boundary-safe structural mirrors of AISE-014/017 shapes);
 *  - render.ts   — renderBoqLens: the pure input → HTML document function
 *                  (view selector + all three persona views as sections);
 *  - explain.ts  — explainBoqItem: deterministic template-based sentence
 *                  assembly (NO LLM) where every fragment is grounded or
 *                  explicitly inference-marked;
 *  - derive.ts   — section/location grouping + amount rollups (aggregation
 *                  only — the lens parses nothing, converts nothing);
 *  - claims.ts   — the claim-id scheme + traceClaim (the R8 traceability
 *                  core: every data-claim-id → source cells / records /
 *                  explicit inference markers);
 *  - health.ts   — computeBoqHealth: mapping coverage stats + the
 *                  claims-without-provenance invariant (must be zero);
 *  - search.ts   — searchBoqItems: deterministic case-insensitive substring
 *                  search over original text + concepts + target locations;
 *  - errors.ts   — the single typed error vocabulary.
 *
 * This package renders deterministic HTML STRINGS server-side (the
 * dependency-free convention of apps/web). No browser APIs, no fetch, no
 * client state, no new npm dependencies.
 */

export { BoqLensError, BOQ_LENS_ERROR_CODES, type BoqLensErrorCode } from "./errors";
export { renderBoqLens, requireBoqLensInput, BOQ_LENS_GENERATOR_VERSION } from "./render";
export { explainBoqItem } from "./explain";
export {
  GRAND_TOTAL_CLAIM_ID,
  LOCATION_UNCONFIRMED_CLAIM_ID,
  HEALTH_CLAIM_METRICS,
  explanationClaimId,
  healthClaimId,
  interpretationClaimId,
  itemClaimId,
  locationClaimId,
  mappingClaimId,
  sectionTotalClaimId,
  traceClaim,
  type HealthClaimMetric,
} from "./claims";
export { computeBoqHealth, citedCellRefs } from "./health";
export { searchBoqItems, itemCellRefs } from "./search";
export {
  locationGroups,
  rollupAmounts,
  sectionGroups,
  type LocationGroup,
  type MoneyRollup,
  type RollupContributor,
  type SectionGroup,
} from "./derive";
export {
  fmt,
  moneyFmt,
  pct,
  escapeHtml,
} from "./format";
export type {
  BoqHealthStats,
  BoqLensInput,
  BoqLensItem,
  BoqNumeric,
  BoqSearchField,
  BoqSearchResult,
  LensBoqItemRef,
  LensInterpretation,
  LensInterpretationAlternative,
  LensInterpretationConfidence,
  LensInterpretationField,
  LensInterpretationMethod,
  LensItemInterpretation,
  LensMappingAlternative,
  LensMappingConfidence,
  LensMappingEntry,
  LensMappingMethod,
  LensMappingProvenance,
  LensMappingStatus,
  LensMappingTarget,
  TraceChain,
  TraceStep,
  TraceStepKind,
} from "./model";
export {
  LENS_INTERPRETATION_CONFIDENCES,
  LENS_INTERPRETATION_METHODS,
  LENS_MAPPING_CONFIDENCES,
  LENS_MAPPING_METHODS,
  LENS_MAPPING_STATUSES,
} from "./model";
