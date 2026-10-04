/**
 * WORLD-P4 — the world-ux package root.
 *
 * The GAME-WORLD UX TRANSFORMATION package: the primary spatial
 * surface with the restrained seven-panel in-world HUD as READ-ONLY
 * typed projections composing the six landed world packages
 * (P0-A/P0-B/P0-C substrates + the P1/P2/P3 experience lanes).
 *
 * THE FOUR PUBLIC FACES (package.json exports):
 *
 *   "."         → this root      — every family surface;
 *   "./seam"    → src/seam.ts    — the ten package laws, the closed
 *                                  panel/family vocabularies, the
 *                                  UNIFIED lane-failure presentation
 *                                  (the recorded P4 seam decision);
 *   "./hud"     → src/hud/       — the seven HUD panel projections;
 *   "./surface" → src/surface/   — the station scene + the typed
 *                                  camera/selection/pick operations;
 *   "./wiring"  → src/wiring/    — the route-binding ports;
 *   "./station" → src/station/   — the committed station scenario.
 *
 * See src/seam.ts for the ten binding laws and
 * docs/world-program-evidence/WORLD-P4/ for the evidence set.
 */

/* The seam's law surface. */
export {
  WORLD_UX_LANE_ID,
  WORLD_UX_STATEMENT,
  HUD_PANEL_IDS,
  HUD_PANEL_ORDER,
  HUD_PANEL_TITLES,
  HUD_CONTENT_STATES,
  WORLD_UX_FAMILIES,
  isHudPanelId,
  isHudContentState,
  isWorldUxFamily,
  unifyLayer1Failure,
  unifyFamilyLaneFailure,
  isWorldUxFailure,
  worldUxOk,
  worldUxRefused,
  isWorldUxRefusal,
  CANONICAL_DIGEST_PATTERN,
  isCanonicalDigest,
  canonicalJsonStringify,
  canonicalDigestOf,
  textDigestOf,
  deepFreeze,
  isDeclaredInstant,
} from "./seam";
export type {
  HudPanelId,
  HudContentState,
  WorldUxFamily,
  WorldUxFailure,
  Layer1LaneFailureShape,
  FamilyLaneFailureShape,
  WorldUxOutcome,
} from "./seam";

/* The HUD family (the seven panels). */
export {
  HUD_CONSTRAINT_KINDS,
  HUD_CONSTRAINT_SOURCE_LANES,
  isHudConstraintKind,
  isHudConstraintSourceLane,
  projectObjectivePanel,
  projectEvidencePanel,
  projectConstraintsPanel,
  projectAgentPanel,
  projectValidationPanel,
  projectCostBoqPanel,
  projectTimelinePanel,
  assembleHud,
  hudPanelSummaries,
} from "./hud/contract";
export type {
  HudPanel,
  HudPanelSummary,
  HudModel,
  HudAssemblyInput,
  HudProblemSummary,
  HudClashProblemLink,
  HudObjectiveData,
  HudObjectiveInput,
  HudEvidenceData,
  HudEvidenceInput,
  HudEvidenceGap,
  HudConstraintKind,
  HudConstraintSourceLane,
  HudConstraintObservation,
  HudConstraintsData,
  HudConstraintsInput,
  HudOperatorSummary,
  HudBoundedActionSummary,
  HudAgentData,
  HudAgentInput,
  HudValidationData,
  HudValidationInput,
  HudBoqLine,
  HudCostBoqData,
  HudCostBoqInput,
  HudTimelinePhase,
  HudTimelineData,
  HudTimelineInput,
} from "./hud/contract";

/* The spatial surface family (the station scene + operations). */
export {
  STATION_ELEMENT_STATUSES,
  isStationElementStatus,
  composeStationScene,
  resolveStationElement,
  pickStationElement,
  applyStationSelection,
  STATION_CAMERA_OPERATIONS,
  isStationCameraOperationKind,
  applyStationCameraOperation,
  applyStationLayerToggles,
} from "./surface/contract";
export type {
  StationElementStatus,
  StationElementStatusEntry,
  GhostOverlayInput,
  StationSceneModel,
  StationElementResolution,
  StationPickRequest,
  StationPick,
  StationCameraOperationKind,
  StationCameraOperation,
} from "./surface/contract";

/* The wiring family (the route-binding ports + the doubles). */
export {
  bindWorldStation,
} from "./wiring/contract";
export type {
  WorldStationSources,
  WorldStationBindingContext,
  WorldStationModel,
} from "./wiring/contract";
export {
  STATION_SCOPE_LABEL,
  STATION_COMPOSED_AT,
  STATION_CLASH_DECLARED_AT,
  STATION_CONFLICT_RECORDED_AT,
  STATION_SEQUENCE_RECORDED_AT,
  STATION_SOLUTION_ID,
  STATION_SOLUTION_VERSION,
  STATION_BASELINE_REALITY_VERSION_ID,
  referenceWorldStationSources,
  alternateWorldStationSources,
} from "./wiring/doubles";

/* The station family (the committed scenario). */
export {
  STATION_INITIAL_CAMERA,
  STATION_BINDING_CONTEXT,
  openReferenceWorldStation,
  openWorldStation,
} from "./station/model";
