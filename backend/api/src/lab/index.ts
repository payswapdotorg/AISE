/**
 * AISE-035 — Physical Reality Lab public surface.
 *
 * A PURE LIBRARY scenario harness (NO server.ts change, NO router, NO HTTP
 * surface, NO tools/ change, NO apps/ change): repeatable physical missions
 * with hand-computable ground truth, deterministic capture fixtures over the
 * REAL capture contracts, full end-to-end AISE execution over the REAL
 * pipeline modules, per-capability golden metrics with regression gates and
 * the R17 discrimination matrix, and the honest dogfood report.
 *
 * THE LAB IS A HARNESS, NOT AN AUTHORITY: nothing in this module mints
 * engineering truth — every verdict comes from the real assurance/
 * verification/case/intervention/execution authorities it orchestrates.
 *
 * LOUD HONESTY: this sandbox has no physical capture hardware; the capture
 * half of the SHARED Work Item (GEMINI capture-primary) is represented by
 * deterministic fixtures (`lab-simulated-capture-v1`) over the real capture
 * contracts. Physical hardware remains out of scope for AISE-035's sandbox
 * delivery and is listed as a known limitation.
 */

export {
  LAB_SCENARIOS,
  scenarioById,
  capturedSurfaces,
} from "./scenarios";
export type {
  LabScenario,
  LabRoomSpec,
  LabSurfaceSpec,
  LabOpeningSpec,
  LabDefectSpec,
  LabCaptureAssetSpec,
  LabBoqSpec,
  LabBoqRowSpec,
  LabInterventionStepSpec,
} from "./scenarios";

export {
  groundTruthOf,
  surfaceTruthOf,
  hierarchyNodeIds,
  spaceNodeId,
  elementNodeId,
  openingNodeId,
  defectHostNodeId,
} from "./groundtruth";
export type {
  LabGroundTruth,
  LabSurfaceTruth,
  LabRoomTruth,
  LabOpeningTruth,
  LabDimensionTruth,
  LabNotObserved,
  LabBoqTruth,
  LabBoqRowTruth,
  LabAssuranceTruth,
  LabSurfaceRole,
} from "./groundtruth";

export {
  runScenario,
  buildLabWorld,
  RecordingDepthBackend,
  exactGridPoints,
  artifactOf,
  jobOf,
  versionOf,
  gapAnalysisOf,
  LAB_HOP_IDS,
} from "./runner";
export type {
  LabDegradations,
  LabHopId,
  LabHopRecord,
  LabScenarioRun,
  LabWorld,
  LabWorldInternals,
  LabMissionRecord,
  LabCaptureRecord,
  LabEvidenceRecord,
  LabFramePlane,
  LabReconstructionRecord,
  LabSemanticsRecord,
  LabMeasurementRecord,
  LabRealityRecord,
  LabAssuranceRecord,
  LabVerificationRecord,
  LabGapsRecord,
  LabBoqRecord,
  LabCaseRecord,
  LabInterventionRecord,
  LabImpactRecord,
  LabExecutionRecord,
  RunScenarioOptions,
  ScenarioRunResult,
} from "./runner";

export {
  LAB_CAPABILITIES,
  LAB_METRIC_NAMES,
  LAB_GATE_THRESHOLD_VERSION,
  LAB_GATE_THRESHOLDS,
  LAB_DISCRIMINATION_FAILURE_CLASSES,
  labGateFor,
  computeRunMetrics,
  evaluateLabGates,
  evaluateDiscriminationCase,
  aggregateHidingProof,
} from "./metrics";
export type {
  LabCapabilityId,
  LabMetricName,
  LabMetricInstance,
  LabCapabilityMetrics,
  LabCapabilityFailure,
  LabRunMetrics,
  LabGateThreshold,
  LabGateViolation,
  LabDiscriminationCase,
  LabDiscriminationFailureClass,
} from "./metrics";

export {
  LAB_REPORT_SCHEMA_VERSION,
  LAB_FIXTURE_PROVENANCE,
  LAB_DISCRIMINATION_SPECS,
  runDogfoodReport,
  stripForDigest,
  digestOf,
  assertReproducible,
} from "./report";
export type {
  LabDogfoodReport,
  LabScenarioReportRow,
  LabNotObservedRow,
  RunDogfoodOptions,
  LabDiscriminationSpec,
} from "./report";

export {
  LAB_CLOCK,
  LAB_DEVICE_CLASS,
  LAB_DEVICE_SIGMA_M,
  LAB_DEVICE_PROVENANCE,
  constantClock,
  counterIdFactory,
  labDeviceProfile,
  buildCaptureAssets,
  encodeDepthMapFrame,
  labEvidence,
  labSyncBatch,
  labBatchBody,
  labBoqBytes,
  deepFreeze,
  withTempDir,
  assertUnitNormal,
} from "./testkit";
export type { LabAssetFixture, BuildAssetsOptions } from "./testkit";
