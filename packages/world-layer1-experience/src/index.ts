/**
 * `@aise/world-layer1-experience` — public API (WORLD-P1).
 *
 * House package discipline (mirrors the P0 substrates): the exported
 * surface is TYPES + the PURE transforms + the substitution doubles +
 * the committed fixtures ONLY. No I/O, no console, no substrate
 * imports — the package compiles and its tests run with ZERO
 * substrate installed (Babylon, Cesium, OCCT, any reconstruction
 * engine — the substitution-law proof).
 *
 * The eight stages, one line each (the lane statement in code):
 *
 *   CAPTURE      the seam's `CaptureSessionEnvelope` consumed verbatim;
 *   SPATIALIZE   `spatializeCaptureSession` — envelope → fragment;
 *   REGISTER     `registerCaptureFragment` — hypotheses → verdict;
 *   RECONSTRUCT  `composeReconstructionWorld` — fragments → world;
 *   NAVIGATE     `applyLayerToggles` / bookmark capture + resolve;
 *   COMPARE      `compareModelToCapture` — tolerance-declared verdicts;
 *   MEASURE      `runMeasurementQueries` — declared-tolerance queries;
 *   EVIDENCE     the binders + `queryWhatIsHere` / `queryWhatChanged`.
 */

/* The lane identity + laws surface. */
export {
  LAYER1_LANE_ID,
  LAYER1_LANE_STATEMENT,
  LANE_STAGES,
  isLaneStage,
  CANONICAL_DIGEST_PATTERN,
  isCanonicalDigest,
  canonicalDigestOf,
  ISO_UTC_INSTANT_PATTERN,
  isIsoUtcInstant,
  CONTENT_ID_PATTERN,
  isContentId,
  LANE_METHOD_IDENTITIES,
  isLaneMethodIdentity,
  CAPTURE_DERIVED_EPISTEMIC_STATUS,
  LANE_ACQUISITION_METADATA_KEYS,
  SUBSTRATE_ID_PATTERNS,
  looksLikeSubstrateId,
} from "./lane";
export type { LaneStage, LaneMethodIdentity } from "./lane";

/* The typed failure vocabulary (HFX-000 closed set, imported). */
export {
  laneOk,
  laneRefuse,
  isLaneRefusal,
  identityLeakRefusal,
} from "./failures";
export type { LaneFailure, LaneOutcome } from "./failures";

/* The capture family: CAPTURE → SPATIALIZE → REGISTER. */
export {
  CAPTURE_SPATIALIZABLE_MEDIA_TYPES,
  isCaptureSpatializableMediaType,
  CAPTURE_ASSET_OMISSION_REASONS,
  CAPTURE_REGISTRATION_STATES,
  isCaptureRegistrationState,
  CAPTURE_LANE_PORT_ID,
  CAPTURE_PORTS,
} from "./capture/contract";
export type {
  CaptureSpatializableMediaType,
  CaptureAssetOmissionReason,
  CaptureRegistrationState,
  CaptureSpatializationRequest,
  SpatializedCaptureAsset,
  OmittedCaptureAsset,
  SpatialCoverage,
  SpatializedWorldFragment,
  CaptureRegistrationRequest,
  CaptureRegistrationResult,
  CaptureLanePort,
} from "./capture/contract";
export { spatializeCaptureSession } from "./capture/spatialize";
export { registerCaptureFragment, MIN_REGISTRATION_HYPOTHESES } from "./capture/register";
export {
  referenceCaptureDouble,
  alternateCaptureDouble,
  REFERENCE_CAPTURE_DESCRIPTOR,
  ALTERNATE_CAPTURE_DESCRIPTOR,
} from "./capture/doubles";

/* The world family: RECONSTRUCT → NAVIGATE. */
export {
  ELEMENT_ORIGINS,
  isElementOrigin,
  WORLD_LAYER_IDS,
  WORLD_PORTS,
  WORLD_PRESET_LAYERS,
} from "./world/contract";
export type {
  ElementOrigin,
  WorldLayerId,
  PlanElementDeclaration,
  PlanModelSource,
  WorldCompositionRequest,
  ElementProvenance,
  NavigableWorld,
  LayerToggle,
  WorldViewState,
  NavigationBookmark,
  WorldLanePort,
} from "./world/contract";
export {
  composeReconstructionWorld,
  captureElementIdOf,
} from "./world/reconstruct";
export {
  applyLayerToggles,
  resolveLayerVisibility,
  resolveElementVisibility,
  captureNavigationBookmark,
  resolveNavigationBookmark,
  bookmarkDigestOf,
} from "./world/navigate";
export {
  referenceWorldDouble,
  alternateWorldDouble,
  REFERENCE_WORLD_DESCRIPTOR,
  ALTERNATE_WORLD_DESCRIPTOR,
} from "./world/doubles";

/* The compare family: COMPARE + MEASURE. */
export {
  DIFFERENCE_CLASSIFICATIONS,
  isDifferenceClassification,
  MEASUREMENT_QUERY_KINDS,
  isMeasurementQueryKind,
  COMPARE_PORTS,
} from "./compare/contract";
export type {
  ComparableShape,
  GeometryToleranceDeclaration,
  GeometryUnitDeclaration,
  DifferenceClassification,
  AlignedPair,
  ComparisonVerdict,
  ComparisonRequest,
  ComparisonReport,
  MeasurementQueryKind,
  MeasurementQuantity,
  MeasurementQuery,
  MeasurementResult,
  CompareLanePort,
} from "./compare/contract";
export {
  compareModelToCapture,
  assembleComparisonReport,
  shapeCentroidOf,
} from "./compare/compare";
export {
  runMeasurementQueries,
  elementPositionOf,
  polygonAreaXy,
  boxVolume,
  pointDistance,
  pointSegmentDistance,
  pointInRegionXy,
} from "./compare/measure";
export {
  referenceCompareDouble,
  alternateCompareDouble,
  REFERENCE_COMPARE_DESCRIPTOR,
  ALTERNATE_COMPARE_DESCRIPTOR,
} from "./compare/doubles";

/* The evidence family: EVIDENCE. */
export {
  WHAT_IS_HERE_ANSWER_KINDS,
  isWhatIsHereAnswerKind,
  ELEMENT_CHANGE_KINDS,
  EVIDENCE_PORTS,
} from "./evidence/contract";
export type {
  EvidenceEnvelopeBinding,
  WhatIsHereAnswerKind,
  WhatIsHereQuery,
  WhatIsHereResult,
  WhatChangedQuery,
  ElementChangeKind,
  ElementChangeRecord,
  WhatChangedResult,
  EvidenceLanePort,
} from "./evidence/contract";
export {
  bindFragmentEvidence,
  bindWorldEvidence,
  bindComparisonEvidence,
  bindMeasurementEvidence,
} from "./evidence/bind";
export { queryWhatIsHere, queryWhatChanged } from "./evidence/queries";
export {
  referenceEvidenceDouble,
  alternateEvidenceDouble,
  REFERENCE_EVIDENCE_DESCRIPTOR,
  ALTERNATE_EVIDENCE_DESCRIPTOR,
} from "./evidence/doubles";

/* The committed fixtures (the deterministic site scenario). */
export {
  fixtureContentIdOf,
  FIXTURE_STILL_001_CONTENT_ID,
  FIXTURE_STILL_002_CONTENT_ID,
  FIXTURE_VIDEO_001_CONTENT_ID,
  FIXTURE_VOICE_001_CONTENT_ID,
  FIXTURE_FOREIGN_CONTENT_ID,
  FIXTURE_PLAN_EVIDENCE_CONTENT_ID,
  FIXTURE_CAPTURED_AT,
  FIXTURE_SPATIALIZED_AT,
  FIXTURE_REGISTERED_AT,
  FIXTURE_COMPOSED_AT,
  FIXTURE_COMPARED_AT,
  FIXTURE_MEASURED_AT,
  FIXTURE_BOOKMARKED_AT,
  FIXTURE_SITE_FRAME,
  FIXTURE_TOLERANCE,
  FIXTURE_WIDE_TOLERANCE,
  FIXTURE_UNITS,
  FIXTURE_CAPTURE_SESSION,
  FIXTURE_SPATIALIZATION_REQUEST,
  FIXTURE_FRAGMENT,
  FIXTURE_REGISTRATION_REQUEST,
  FIXTURE_REGISTRATION,
  FIXTURE_REGISTERED_FRAGMENT,
  FIXTURE_WALL_IFC_GUID,
  FIXTURE_PLAN_MODEL,
  FIXTURE_WORLD_REQUEST,
  FIXTURE_WORLD,
  FIXTURE_WORLD_REVISION_2,
  FIXTURE_COMPARISON_REQUEST,
  FIXTURE_MEASUREMENT_QUERIES,
  FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY,
  FIXTURE_WHAT_IS_HERE_POINTS,
} from "./fixtures";
