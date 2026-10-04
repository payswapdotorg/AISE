/**
 * `@aise/world-solution-substrate` — public API (WORLD-P0-C).
 *
 * The Solution-layer + desktop substrate lane of the world program:
 * substrate-neutral typed adapter contracts for (1) the Solution
 * scene-usage composition of the P0-A reality ports, (2) the
 * parametric CAD port (FreeCAD the reference implementation), (3) the
 * execution-simulation port over the canonical Solution Graph +
 * EngineeringOperation vocabulary, and (4) the desktop shell
 * integration port (Tauri / the existing Electron thin shell the two
 * candidates). House package discipline: the exported surface is
 * types, constants, pure law helpers and the substitution doubles
 * ONLY — no I/O, no console, no substrate imports. The package
 * compiles and its tests run with ZERO substrate installed (the
 * substitution law proof), while IMPORTING the sibling contract types
 * it composes (`@aise/world-reality-substrate`,
 * `@aise/world-understanding-substrate`,
 * `@aise/solution-contract` — types only, never implementations of
 * the substrates themselves).
 */

/* The seam — the lane statement + the shared law surface. */
export {
  SOLUTION_SUBSTRATE_LANE_ID,
  SOLUTION_LANE_STATEMENT,
  SOLUTION_SUBSTRATE_FAMILIES,
  SOLUTION_SUBSTRATE_METHOD_IDENTITIES,
  SIMULATED_PROGRESS_EPISTEMIC_STATUS,
  SOLUTION_EXTERNAL_LABEL_NAMESPACES,
  FREECAD_NAME_PATTERN,
  CANONICAL_DIGEST_PATTERN,
  isSolutionSubstrateFamily,
  isSolutionExternalLabelNamespace,
  isFreecadNameShaped,
  externalLabelValuesOf,
  isCanonicalDigest,
  canonicalDigestOf,
  textDigestOf,
  refused,
  providerDescriptorDigestOf,
  externalLabelCollisions,
  deepFreeze,
} from "./seam";
export type {
  SolutionSubstrateFamily,
  SolutionSubstrateMethodIdentity,
  SolutionExternalLabelNamespace,
  NamespacedExternalLabel,
  SubstrateFailure,
  SubstrateOutcome,
  SubstrateProviderDescriptor,
  SubstrateResultProvenance,
} from "./seam";

/* The scene-usage family (composes the P0-A ports). */
export {
  USAGE_FAILURE_KIND_BY_P0A_CODE,
  ghostDistinctnessViolations,
  inventedElementIds,
  variantTrailOf,
} from "./scene/contract";
export type {
  SolutionSceneUsagePorts,
  SolutionSceneUsageCapabilities,
  SolutionAssetSource,
  ProposedStatePresentationRequest,
  GhostDistinctnessReport,
  ResolvedSolutionGeometry,
  ProposedStatePresentation,
  WhatIfVariantRequest,
  WhatIfVariantPresentation,
  SolutionSceneUsageAdapter,
} from "./scene/contract";
export {
  REFERENCE_SCENE_USAGE_DOUBLE_DESCRIPTOR,
  ALTERNATE_SCENE_USAGE_DOUBLE_DESCRIPTOR,
  defaultRealityPorts,
  SolutionSceneUsageReferenceDouble,
  SolutionSceneUsageAlternateDouble,
} from "./scene/doubles";

/* The parametric CAD family (FreeCAD the reference). */
export {
  CAD_MODEL_KIND,
  CAD_REQUEST_SCHEMA_VERSION,
  CAD_SKETCH_ELEMENT_KINDS,
  CAD_SKETCH_CONSTRAINT_KINDS,
  CAD_FEATURE_KINDS,
  SKETCH_CONSUMING_FEATURE_KINDS,
  PARENT_REQUIRING_FEATURE_KINDS,
  CAD_REFERENCE_IMPLEMENTATION_NOTE,
  freecadObjectNameOf,
  freecadObjectLabel,
  freecadDocumentLabel,
  derivedShapeTableOrder,
  sketchViolations,
  featureViolations,
  createModelViolations,
  evaluationSpecViolations,
  assembleGeometryRequest,
} from "./cad/contract";
export type {
  CadModelId,
  CadPoint2,
  CadSketchPlane,
  CadSketchElementKind,
  CadSketchElement,
  CadSketchConstraintKind,
  CadSketchConstraint,
  CadSketchDefinition,
  CadFeatureParameter,
  CadFeatureDefinition,
  CadFeatureKind,
  CadUnitDeclaration,
  CadModelHandle,
  CadCreateModelRequest,
  CadModelMutation,
  CadModelRevision,
  CadModelQueryResult,
  CadParameterBinding,
  CadGeometryEvaluationSpec,
  CadGltfExportRequest,
  CadGltfExport,
  CadIfcExportRequest,
  CadIfcExport,
  CadEngineCapabilities,
  ParametricCadAdapter,
} from "./cad/contract";
export {
  REFERENCE_CAD_DOUBLE_DESCRIPTOR,
  ALTERNATE_CAD_DOUBLE_DESCRIPTOR,
  derivedShapeTableOf,
  emitIfcStepText,
  emitGltfDocument,
  ReferenceCadDouble,
  AlternateCadDouble,
  referenceCadDouble,
  alternateCadDouble,
} from "./cad/doubles";

/* The execution-simulation family (over the canonical Solution Graph). */
export {
  SIMULATION_REQUEST_KIND,
  SIMULATION_REQUEST_SCHEMA_VERSION,
  TRAJECTORY_KIND,
  TRAJECTORY_SCHEMA_VERSION,
  SIMULATION_DURATION_UNITS,
  SIMULATION_CLOCK_UNITS,
  DURATION_UNIT_TO_HOURS,
  CLOCK_UNIT_TO_HOURS,
  simulationRequestViolations,
  completionBeforeCycleOf,
  hoursBetween,
} from "./simulation/contract";
export type {
  SimulationDurationUnit,
  SimulationClockUnit,
  ActivityDurationDeclaration,
  SimulationClockDeclaration,
  ExecutionSimulationRequest,
  SimulatedActivity,
  TimeAnchoredWorldState,
  ExecutionTrajectory,
  SimulatedProgressCapture,
  ExecutionSimulationCapabilities,
  ExecutionSimulationAdapter,
} from "./simulation/contract";
export {
  REFERENCE_SIMULATION_DOUBLE_DESCRIPTOR,
  ALTERNATE_SIMULATION_DOUBLE_DESCRIPTOR,
  SIMULATION_FIXTURE_EPOCH,
  SIMULATION_FIXTURE_RECORDED_AT,
  ReferenceSimulationDouble,
  AlternateSimulationDouble,
  referenceSimulationDouble,
  alternateSimulationDouble,
} from "./simulation/doubles";

/* The desktop shell family (Tauri / the Electron thin shell). */
export {
  DESKTOP_SHELL_PORT_ID,
  SIDECAR_SUBSTRATE_KINDS,
  DESKTOP_VIEW_LANES,
  SHELL_LIFECYCLE_PHASES,
  SIDECAR_STATES,
  DESKTOP_SHELL_REFERENCE_NOTE,
  sidecarSpecViolations,
  windowSpecViolations,
} from "./desktop/contract";
export type {
  SidecarSubstrateKind,
  DesktopViewLane,
  ShellLifecyclePhase,
  SidecarState,
  SidecarSpec,
  SidecarHandle,
  SidecarStatus,
  WindowSpec,
  DesktopWindowState,
  DesktopViewState,
  ShellReady,
  ShellShutdownReport,
  DesktopShellCapabilities,
  DesktopShellAdapter,
} from "./desktop/contract";
export {
  TAURI_LIKE_SHELL_DOUBLE_DESCRIPTOR,
  ELECTRON_LIKE_SHELL_DOUBLE_DESCRIPTOR,
  TauriLikeShellDouble,
  ElectronLikeShellDouble,
  tauriLikeShellDouble,
  electronLikeShellDouble,
} from "./desktop/doubles";
