/**
 * AISE-035 — Physical Reality Lab runner: the deterministic end-to-end
 * execution harness.
 *
 * THE LAB IS A HARNESS, NOT AN AUTHORITY (the loud rule): this runner
 * ORCHESTRATES the REAL pipeline modules through their public service
 * surfaces with injected deterministic dependencies — missions planner →
 * capture gateway → evidence service → reconstruction orchestrator (the
 * deterministic reference providers) → architectural semantics extractor →
 * Reality Graph store → assurance evaluator → verification runner → gap
 * analysis → change detection → BOQ import/normalization/mapping → case
 * service → intervention service → impact service → execution service →
 * outcome/lineage. It NEVER re-implements a pipeline stage, never mints a
 * second authority, and never turns its own output into engineering truth:
 * every record below is a REAL module's record, echoed verbatim or summarized
 * with its record ids.
 *
 * SEAM DISCLOSURE (the one place the lab observes pipeline internals): the
 * fused point cloud a `DepthLidarFusionAdapter` produces is not persisted in
 * the stored `CandidateArtifact` (only its digest is). To fit planes over the
 * REAL fused points, the lab wires the adapter with `RecordingDepthBackend` —
 * a delegating wrapper around the REAL `DeterministicDepthFusionBackend`
 * that records the backend's own responses. The fusion computation is 100%
 * the real backend's; the wrapper adds observation only (the documented
 * swappable-backend seam, used the same way the reconstruction testkit uses
 * backend seams).
 *
 * CAPTURE COMPLETENESS IS THE ASSURANCE ENGINE'S CALL (Reality-specific
 * rule): the run reports capture completeness ONLY from the real
 * `evaluateReadiness` verdict — a capture session that "finished the walk"
 * with an unsatisfied evidence budget reports INCOMPLETE with the assurance
 * engine's typed gaps, never "complete because the walk finished". A run
 * that stops mid-pipeline reports INCOMPLETE with the typed stop reason.
 *
 * HONEST STOPPING: a hop that fails (a typed module error or a typed
 * reconstruction failure) STOPS the run — downstream hops are recorded as
 * notApplicable with the stop reason; nothing is silently swallowed, and the
 * report always names WHERE the run stopped and why.
 *
 * DETERMINISM: fresh in-memory stores per run, constant clocks per phase,
 * counter id factories, code-defined fixtures. Two runs of the same scenario
 * with the same degradations produce byte-identical run records (canonical
 * JSON digest — pinned by tests).
 */

import {
  CONTRACT_VERSION,
  SyncBatchCodec,
  type CaptureMission,
} from "@aise/shared-contracts";
import { createMissionPlanner, type MissionPlanner } from "../missions/planner";
import { createCaptureGateway, type CaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore, type CaptureStore } from "../capture/store";
import {
  captureStoreContentResolver,
  createEvidenceService,
  type EvidenceService,
} from "../evidence/service";
import { InMemoryEvidenceStore, type EvidenceStore } from "../evidence/store";
import {
  createReconstructionOrchestrator,
  evidenceServiceReader,
  type ReconstructionOrchestrator,
} from "../reconstruction/orchestrator";
import {
  InMemoryArtifactStore,
  InMemoryJobStore,
  type ArtifactStore,
  type JobStore,
} from "../reconstruction/store";
import type { CandidateArtifact } from "../reconstruction/contract";
import { DepthLidarFusionAdapter } from "../reconstruction/adapters/depth-lidar/adapter";
import {
  DeterministicDepthFusionBackend,
  type DepthFusionBackend,
  type DepthFusionRequest,
  type DepthFusionResponse,
} from "../reconstruction/adapters/depth-lidar/backend";
import {
  EXTRACTOR_VERSION,
  extractArchitecturalSemantics,
  type SemanticsResult,
  type SemanticElement,
} from "../semantics";
import { InMemoryRealityStore, type RealityStore } from "../reality/store";
import type { GraphVersion } from "../reality/model";
import type { JobRecord } from "../reconstruction/store";
import type {
  ChangeRecord,
  ObservationRecord,
  ProvenanceRecord,
  RealityNode,
  Relationship,
} from "../reality/model";
import {
  evaluateReadiness,
  type EvidenceFact,
  type EvaluationInput,
  type NodeFact,
  type PropertyFact,
  type ReadinessReport,
} from "../assurance";
import { getAssuranceProfile } from "../assurance/profiles";
import {
  runVerification,
  type VerificationInput,
  type VerificationNode,
  type VerificationProperty,
} from "../verification";
import { compareVersions, type ChangeReport } from "../changedetection";
import {
  GapAnalysisService,
  readOnlyAssuranceProfileResolver,
  readOnlyEvidenceGraphResolver,
  readOnlyGapRealityVersionResolver,
} from "../gaps/service";
import { InMemoryGapAnalysisStore } from "../gaps/store";
import type { GapAnalysisRecord } from "../gaps/model";
import { BoqService } from "../boq/service";
import { InMemoryBoqStore } from "../boq/store";
import { NormalizationService } from "../boq/normalization/service";
import { InMemoryNormalizationStore } from "../boq/normalization/store";
import { MappingService } from "../boq/mapping/service";
import { InMemoryMappingStore } from "../boq/mapping/store";
import type { BoqMapping } from "../boq/mapping/model";
import { CaseService } from "../cases/service";
import { InMemoryCaseStore } from "../cases/store";
import type { EngineeringCase } from "../cases/model";
import { InterventionService } from "../intervention/service";
import { InMemoryInterventionStore } from "../intervention/store";
import type { InterventionScenario } from "../intervention/model";
import {
  ImpactService,
  readOnlyImpactBoqMappingResolver,
  readOnlyImpactScenarioResolver,
} from "../impact/service";
import { InMemoryImpactStore } from "../impact/store";
import {
  ExecutionService,
  readOnlyCaseContextResolver,
  readOnlyEvidenceMembershipResolver,
  readOnlyInterventionContextResolver,
} from "../execution/service";
import { InMemoryExecutionStore } from "../execution/store";
import type { CaseLineage, ExecutionRecord, OutcomeObservation } from "../execution/model";
import { fitPlane, vecDot, type Plane, type Vec3 } from "../geometry";
import { sha256Hex } from "../lib/hash";
import type { LabScenario } from "./scenarios";
import {
  groundTruthOf,
  hierarchyNodeIds,
  elementNodeId,
  openingNodeId,
  spaceNodeId,
  type LabGroundTruth,
  type LabSurfaceTruth,
} from "./groundtruth";
import {
  buildCaptureAssets,
  constantClock,
  counterIdFactory,
  labBoqBytes,
  labDeviceProfile,
  labSyncBatch,
  LAB_CLOCK,
  LAB_DEVICE_SIGMA_M,
  type LabAssetFixture,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Degradations (discrimination instruments — never baselines)          */
/* ------------------------------------------------------------------ */

export interface LabDegradations {
  /**
   * Replace one capture asset's bytes with invalid depth-map text — the
   * reconstruction must fail INPUT_INCOMPATIBLE naming the evidence id.
   */
  readonly corruptedCaptureAssetId?: string;
  /**
   * Skip registering one captured asset's evidence record (a sync loss
   * between capture and the evidence graph) — the assurance engine's
   * evidence-sufficiency budget must fail closed.
   */
  readonly droppedEvidenceAssetId?: string;
  /**
   * Displace one depth frame's points along the surface normal (a
   * mis-registered capture frame) — golden geometry gates must trip.
   */
  readonly injectedGeometryError?: { readonly assetId: string; readonly offsetM: number };
}

export const LAB_HOP_IDS = [
  "mission",
  "capture",
  "evidence",
  "reconstruction",
  "semantics",
  "reality",
  "assurance",
  "verification",
  "gaps",
  "boq",
  "case",
  "intervention",
  "impact",
  "execution",
  "postWork",
  "changedetection",
  "outcome",
  "lineage",
] as const;
export type LabHopId = (typeof LAB_HOP_IDS)[number];

/* ------------------------------------------------------------------ */
/* Run record types (pure data — digestible, no service references)     */
/* ------------------------------------------------------------------ */

export interface LabHopRecord {
  readonly hopId: LabHopId;
  readonly outcome: "ok" | "failed" | "notApplicable";
  readonly recordIds: readonly string[];
  readonly detail: string | null;
}

export interface LabMissionRecord {
  readonly missionId: string;
  readonly state: string;
  readonly revision: number;
  readonly intent: string;
  readonly stepCount: number;
  readonly requiredEvidenceCount: number;
  readonly referenceControlCount: number;
  readonly escalated: boolean;
  readonly mission: CaptureMission;
}

export interface LabCaptureRecord {
  readonly sessionId: string;
  readonly missionRef: string;
  readonly assets: readonly { readonly assetId: string; readonly contentId: string; readonly kind: string }[];
  readonly ackOutcomes: readonly { readonly batchId: string; readonly sequence: number; readonly outcome: string }[];
  /** The operator finished the declared walk (session closed). */
  readonly walkCompleted: boolean;
}

export interface LabEvidenceRecord {
  readonly registeredContentIds: readonly string[];
  readonly droppedContentIds: readonly string[];
  readonly provenanceLinkCount: number;
  readonly derivationCount: number;
}

/** One fitted frame: the reconstruction-derived geometry of one surface. */
export interface LabFramePlane {
  readonly surfaceId: string;
  readonly assetId: string;
  readonly contentId: string;
  readonly plane: Plane;
  readonly rmsResidual: number;
  readonly pointCount: number;
}

export interface LabReconstructionRecord {
  readonly jobs: readonly {
    readonly jobId: string;
    readonly taskId: string;
    readonly state: string;
    readonly artifactIds: readonly string[];
    readonly selectedProviderId: string | null;
    readonly failure: { readonly code: string; readonly detail: string } | null;
  }[];
  readonly frames: readonly LabFramePlane[];
  readonly derivations: readonly { readonly artifactId: string; readonly outputContentId: string }[];
}

export interface LabSemanticsRecord {
  readonly extractorVersion: string;
  readonly elementCount: number;
  readonly unclassifiedCount: number;
  readonly stats: SemanticsResult["stats"];
  readonly elements: readonly {
    readonly elementId: string;
    readonly kind: string;
    readonly surfaceId: string | null;
    readonly plane: Plane | null;
    readonly height: { readonly value: number; readonly sigma: number | null } | null;
    readonly width: { readonly value: number; readonly sigma: number | null } | null;
  }[];
}

/** One measured room dimension (the REAL extractor's geometry values). */
export interface LabMeasurementRecord {
  readonly dimensionId: string;
  readonly propertyKey: string;
  readonly roomLabel: string;
  readonly nodeId: string;
  readonly valueM: number;
  readonly sigmaM: number | null;
}

export interface LabRealityRecord {
  readonly projectId: string;
  readonly baselineVersionId: string;
  readonly versionIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly relationshipIds: readonly string[];
  readonly observationIds: readonly string[];
  readonly postWorkVersionId: string | null;
}

export interface LabAssuranceRecord {
  readonly profileId: string;
  readonly readiness: string;
  readonly captureCompleteness: "COMPLETE" | "INCOMPLETE";
  readonly dimensions: readonly {
    readonly dimensionId: string;
    readonly critical: boolean;
    readonly outcome: string;
    readonly deficiencyCode: string | null;
  }[];
  readonly gaps: ReadinessReport["gaps"];
  readonly report: ReadinessReport;
  readonly postWork: {
    readonly readiness: string;
    readonly captureCompleteness: "COMPLETE" | "INCOMPLETE";
    readonly report: ReadinessReport;
  } | null;
}

export interface LabVerificationRecord {
  readonly findingCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly findings: readonly { readonly code: string; readonly severity: string; readonly subjectNodeIds: readonly string[] }[];
  readonly postWorkFindings: readonly { readonly code: string; readonly severity: string }[] | null;
}

export interface LabGapsRecord {
  readonly analysisId: string;
  readonly gapCount: number;
  readonly annotationEcho: readonly { readonly targetNodeId: string; readonly observationStatus: string }[];
  readonly gaps: readonly { readonly gapId: string; readonly kind: string; readonly subjectNodeId: string | null; readonly critical: boolean }[];
}

export interface LabBoqRecord {
  readonly importId: string;
  readonly format: string;
  readonly parseStatus: string;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly entries: readonly {
    readonly entryId: string;
    readonly rowNumber: number;
    readonly status: string;
    readonly confidence: string;
    readonly method: string;
    readonly targetNodeIds: readonly string[];
    readonly reason: string | null;
  }[];
}

export interface LabCaseRecord {
  readonly caseId: string;
  readonly status: string;
  readonly observationIds: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];
  readonly review: { readonly decision: string; readonly reviewer: string } | null;
  readonly record: EngineeringCase;
}

export interface LabInterventionRecord {
  readonly scenarioId: string;
  readonly status: string;
  readonly baselineVersionId: string;
  readonly stepIds: readonly string[];
  readonly stateIds: readonly string[];
  readonly executedStateId: string;
  readonly approvalReference: { readonly caseId: string; readonly reviewDecision: string } | null;
  readonly record: InterventionScenario;
}

export interface LabImpactRecord {
  readonly impactId: string;
  readonly lineCount: number;
  readonly costImpactCount: number;
  readonly reportDigest: string;
  readonly lines: readonly { readonly lineId: string; readonly kind: string; readonly targetNodeId: string }[];
}

export interface LabExecutionRecord {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly executedStepIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds: readonly string[];
  readonly stateTransition: ExecutionRecord["stateTransition"];
  readonly outcomeId: string | null;
  readonly outcome: OutcomeObservation | null;
  readonly lineage: CaseLineage | null;
}

/** The pure-data run record of one scenario execution. */
export interface LabScenarioRun {
  readonly scenarioId: string;
  readonly degradations: LabDegradations;
  readonly hops: readonly LabHopRecord[];
  readonly mission: LabMissionRecord | null;
  readonly capture: LabCaptureRecord | null;
  readonly evidence: LabEvidenceRecord | null;
  readonly reconstruction: LabReconstructionRecord | null;
  readonly semantics: LabSemanticsRecord | null;
  readonly measurements: readonly LabMeasurementRecord[];
  readonly reality: LabRealityRecord | null;
  readonly assurance: LabAssuranceRecord | null;
  readonly verification: LabVerificationRecord | null;
  readonly gaps: LabGapsRecord | null;
  readonly boq: LabBoqRecord | null;
  readonly caseRecord: LabCaseRecord | null;
  readonly intervention: LabInterventionRecord | null;
  readonly impact: LabImpactRecord | null;
  readonly execution: LabExecutionRecord | null;
  readonly changedetection: {
    readonly fromVersionId: string;
    readonly toVersionId: string;
    readonly findings: readonly { readonly code: string; readonly nodeId: string | null; readonly key: string | null }[];
    readonly report: ChangeReport | null;
  } | null;
  readonly stoppedAt: LabHopId | null;
  readonly stopReason: { readonly code: string; readonly detail: string } | null;
  /** Ground-truth not-observed declarations, echoed honestly (never dropped). */
  readonly notObserved: LabGroundTruth["notObserved"];
}

/** The wired REAL services of one run (test inspection surface). */
export interface LabWorld {
  readonly planner: MissionPlanner;
  readonly gateway: CaptureGateway;
  readonly captureStore: CaptureStore;
  readonly evidenceService: EvidenceService;
  readonly evidenceStore: EvidenceStore;
  readonly orchestrator: ReconstructionOrchestrator;
  readonly jobStore: JobStore;
  readonly artifactStore: ArtifactStore;
  readonly realityStore: RealityStore;
  readonly gapService: GapAnalysisService;
  readonly boqService: BoqService;
  readonly normalizationService: NormalizationService;
  readonly mappingService: MappingService;
  readonly caseService: CaseService;
  readonly interventionService: InterventionService;
  readonly impactService: ImpactService;
  readonly executionService: ExecutionService;
}

export interface RunScenarioOptions {
  readonly degradations?: LabDegradations;
}

export interface ScenarioRunResult {
  readonly run: LabScenarioRun;
  readonly world: LabWorld;
}

/* ------------------------------------------------------------------ */
/* The recording depth-fusion seam (observation only — see header)      */
/* ------------------------------------------------------------------ */

/**
 * Delegating wrapper around the REAL `DeterministicDepthFusionBackend` that
 * records the backend's own successful responses so the lab can fit planes
 * over the REAL fused points (stored artifacts carry digests only). The
 * fusion computation is entirely the real backend's — this wrapper only
 * observes, exactly like the reconstruction testkit's backend seams.
 */
export class RecordingDepthBackend implements DepthFusionBackend {
  readonly backendId = "lab-recording-deterministic-depth-fusion";
  private readonly inner = new DeterministicDepthFusionBackend();
  private readonly recorded: DepthFusionResponse[] = [];

  async invoke(request: DepthFusionRequest): Promise<DepthFusionResponse> {
    const response = await this.inner.invoke(request);
    if (response.ok) {
      this.recorded.push(response);
    }
    return response;
  }

  /** The recorded successful responses, in invocation order. */
  responses(): readonly DepthFusionResponse[] {
    return this.recorded;
  }
}

/* ------------------------------------------------------------------ */
/* World construction (REAL services, deterministic injections)         */
/* ------------------------------------------------------------------ */

export interface LabWorldInternals {
  readonly world: LabWorld;
  readonly depthBackend: RecordingDepthBackend;
}

export function buildLabWorld(): LabWorldInternals {
  const captureStore = new InMemoryCaptureStore();
  const evidenceStore = new InMemoryEvidenceStore();
  const jobStore = new InMemoryJobStore();
  const artifactStore = new InMemoryArtifactStore();
  const realityStore = new InMemoryRealityStore();
  const depthBackend = new RecordingDepthBackend();
  const evidenceService = createEvidenceService({
    store: evidenceStore,
    clock: constantClock(LAB_CLOCK.evidence),
    contentResolver: captureStoreContentResolver(captureStore),
  });
  const orchestrator = createReconstructionOrchestrator({
    providers: [
      new DepthLidarFusionAdapter({
        backend: depthBackend,
        evidenceReader: {
          read: async (contentId) => captureStore.readAssetBytes(contentId),
        },
      }),
    ],
    jobStore,
    artifactStore,
    clock: constantClock(LAB_CLOCK.reconstruction),
    idFactory: counterIdFactory("lab-job"),
    evidenceReader: evidenceServiceReader(evidenceService),
  });
  const gapService = new GapAnalysisService({
    store: new InMemoryGapAnalysisStore(),
    clock: constantClock(LAB_CLOCK.gaps),
    assuranceProfileResolver: readOnlyAssuranceProfileResolver({ getAssuranceProfile }),
    readinessEvaluator: evaluateReadiness,
    realityVersionResolver: readOnlyGapRealityVersionResolver(realityStore),
    evidenceGraphResolver: readOnlyEvidenceGraphResolver(evidenceStore),
  });
  const boqService = new BoqService({
    store: new InMemoryBoqStore(),
    clock: constantClock(LAB_CLOCK.boq),
  });
  const normalizationService = new NormalizationService({
    store: new InMemoryNormalizationStore(),
    clock: constantClock(LAB_CLOCK.boq),
    boq: boqService,
  });
  const mappingService = new MappingService({
    store: new InMemoryMappingStore(),
    clock: constantClock(LAB_CLOCK.boq),
    normalization: normalizationService,
    boq: boqService,
  });
  const caseService = new CaseService({
    store: new InMemoryCaseStore(),
    clock: constantClock(LAB_CLOCK.caseReview),
  });
  const interventionService = new InterventionService({
    store: new InMemoryInterventionStore(),
    clock: constantClock(LAB_CLOCK.intervention),
    baselineResolver: {
      resolveBaseline: async (projectId, versionId) =>
        realityStore.getVersion(projectId, versionId),
    },
  });
  const impactService = new ImpactService({
    store: new InMemoryImpactStore(),
    clock: constantClock(LAB_CLOCK.impact),
    scenarioResolver: readOnlyImpactScenarioResolver(interventionService),
    mappingResolver: readOnlyImpactBoqMappingResolver(mappingService, boqService),
  });
  const executionService = new ExecutionService({
    store: new InMemoryExecutionStore(),
    clock: constantClock(LAB_CLOCK.execution),
    interventionContextResolver: readOnlyInterventionContextResolver(interventionService),
    caseContextResolver: readOnlyCaseContextResolver(caseService),
    evidenceMembershipResolver: readOnlyEvidenceMembershipResolver(evidenceStore),
  });
  return {
    depthBackend,
    world: {
      planner: createMissionPlanner({
        clock: constantClock(LAB_CLOCK.plan),
        idFactory: counterIdFactory("lab-mission"),
      }),
      gateway: createCaptureGateway({
        store: captureStore,
        clock: constantClock(LAB_CLOCK.capture),
      }),
      captureStore,
      evidenceService,
      evidenceStore,
      orchestrator,
      jobStore,
      artifactStore,
      realityStore,
      gapService,
      boqService,
      normalizationService,
      mappingService,
      caseService,
      interventionService,
      impactService,
      executionService,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Typed stop helper                                                    */
/* ------------------------------------------------------------------ */

interface RunState {
  hops: LabHopRecord[];
  stoppedAt: LabHopId | null;
  stopReason: { readonly code: string; readonly detail: string } | null;
}

function notApplicable(state: RunState, hopId: LabHopId, reason: string): void {
  state.hops.push({ hopId, outcome: "notApplicable", recordIds: [], detail: reason });
}

function ok(state: RunState, hopId: LabHopId, recordIds: readonly string[]): void {
  state.hops.push({ hopId, outcome: "ok", recordIds, detail: null });
}

function stop(state: RunState, hopId: LabHopId, code: string, detail: string): void {
  state.hops.push({ hopId, outcome: "failed", recordIds: [], detail });
  state.stoppedAt = hopId;
  state.stopReason = { code, detail };
}

function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) {
    return `${thrown.name}: ${thrown.message}`;
  }
  return `thrown non-error value: ${String(thrown)}`;
}

/** Remaining hops after a stop, recorded as notApplicable (honest reporting). */
function remainingHops(state: RunState, allAfter: readonly LabHopId[]): void {
  for (const hopId of allAfter) {
    notApplicable(
      state,
      hopId,
      `not applicable: the run stopped at "${state.stoppedAt}" (${state.stopReason?.code ?? "unknown"})`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Geometry helpers (real geometry library; orientation by fixture role) */
/* ------------------------------------------------------------------ */

/** Orient a fitted plane's normal per the fixture's semantic convention. */
function orientPlane(fitted: Plane, convention: Plane): Plane {
  const dot = vecDot(fitted.normal, convention.normal);
  if (dot >= 0) {
    return fitted;
  }
  return {
    normal: [-fitted.normal[0], -fitted.normal[1], -fitted.normal[2]] as Vec3,
    d: -fitted.d,
  };
}

/** Match an extracted semantic element to its source frame (plane proximity). */
function matchFrame(
  element: SemanticElement,
  frames: readonly LabFramePlane[],
): LabFramePlane | null {
  const plane = element.geometry.plane;
  if (plane === undefined) {
    return null;
  }
  let best: LabFramePlane | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const alignment = Math.abs(vecDot(plane.normal, frame.plane.normal));
    if (alignment < 1 - 1e-9) {
      continue;
    }
    const delta = Math.abs(plane.d - frame.plane.d);
    if (delta > 1e-6) {
      continue;
    }
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }
  return best;
}

/** The exact noiseless grid points of a surface truth (registration metric). */
export function exactGridPoints(truth: LabSurfaceTruth): readonly Vec3[] {
  const points: Vec3[] = [];
  for (let j = 0; j < truth.gridSide; j += 1) {
    for (let k = 0; k < truth.gridSide; k += 1) {
      const [ox, oy, oz] = truth.origin;
      const [ux, uy, uz] = truth.uAxis;
      const [vx, vy, vz] = truth.vAxis;
      const u = (j + 0.5) / truth.gridSide;
      const v = (k + 0.5) / truth.gridSide;
      points.push([ox + u * ux + v * vx, oy + u * uy + v * vy, oz + u * uz + v * vz]);
    }
  }
  return points;
}

/** Group the recorded backend's fused points by source evidence id. */
function fusedPointsBySource(
  response: DepthFusionResponse,
): ReadonlyMap<string, readonly Vec3[]> {
  const grouped = new Map<string, Vec3[]>();
  if (!response.ok) {
    return grouped;
  }
  for (const point of response.points) {
    const bucket = grouped.get(point.sourceEvidenceId) ?? [];
    bucket.push([point.x, point.y, point.z]);
    grouped.set(point.sourceEvidenceId, bucket);
  }
  return grouped;
}

/* ------------------------------------------------------------------ */
/* The runner                                                           */
/* ------------------------------------------------------------------ */

/**
 * Run one scenario END-TO-END over the REAL pipeline modules. Deterministic:
 * identical scenario + degradations → byte-identical run record (canonical
 * JSON). A failing hop stops the run with a typed reason; nothing downstream
 * is fabricated.
 */
export async function runScenario(
  scenario: LabScenario,
  options: RunScenarioOptions = {},
): Promise<ScenarioRunResult> {
  const degradations = options.degradations ?? {};
  const { world, depthBackend } = buildLabWorld();
  const truth = groundTruthOf(scenario);
  const state: RunState = { hops: [], stoppedAt: null, stopReason: null };
  const records: WritableRecords = {};

  /* ---------------- hop: mission (real planner) --------------------- */
  let mission: CaptureMission;
  try {
    const planning = world.planner.plan({
      intent: scenario.mission.intent,
      assurance: {
        summary: scenario.mission.assuranceSummary,
        assuranceProfileRef: scenario.mission.assuranceProfileId,
      },
      deviceProfile: labDeviceProfile(),
    });
    mission = planning.mission;
    records.mission = {
      missionId: mission.missionId,
      state: mission.state,
      revision: mission.revision,
      intent: mission.intent,
      stepCount: mission.steps.length,
      requiredEvidenceCount: mission.requiredEvidence.length,
      referenceControlCount: mission.referenceControls.length,
      escalated: planning.kind === "escalated",
      mission,
    };
    ok(state, "mission", [mission.missionId]);
  } catch (thrown) {
    stop(state, "mission", "mission_planning_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(1));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: capture (real gateway) --------------------- */
  const assets = buildCaptureAssets(scenario, truth, scenario.capturePlan, {
    corruptedCaptureAssetId: degradations.corruptedCaptureAssetId,
    injectedGeometryError: degradations.injectedGeometryError,
  });
  const sessionId = `session-${scenario.scenarioId}-baseline`;
  try {
    const ingested: { readonly assetId: string; readonly contentId: string; readonly kind: string }[] = [];
    for (const asset of assets) {
      const result = await world.gateway.ingestAsset(asset.contentId, asset.bytes, asset.mediaType);
      if (result.kind === "rejected") {
        throw new Error(
          `capture gateway rejected asset ${asset.assetId}: ${result.reasonCode} — ${result.reasonDetail}`,
        );
      }
      ingested.push({ assetId: asset.assetId, contentId: asset.contentId, kind: result.kind });
    }
    const batch = labSyncBatch({
      sessionId,
      missionId: mission!.missionId,
      assets,
      startedAt: LAB_CLOCK.startedAt,
      endedAt: LAB_CLOCK.endedAt,
      capturedAt: LAB_CLOCK.capturedAt,
    });
    const ack = await world.gateway.ingestSyncBatch(SyncBatchCodec.encode(batch));
    if (ack.kind !== "ack" || ack.ack.outcome !== "ACCEPTED") {
      throw new Error(
        `capture sync batch not accepted: ${ack.kind === "ack" ? ack.ack.outcome : ack.error}`,
      );
    }
    const stored = await world.gateway.getSession(sessionId);
    records.capture = {
      sessionId,
      missionRef: mission!.missionId,
      assets: ingested,
      ackOutcomes: [{ batchId: batch.batchId, sequence: batch.sequence, outcome: ack.ack.outcome }],
      // The walk is closed (the session envelope carries endedAt). Capture
      // completeness is NOT this flag — only the assurance verdict decides.
      walkCompleted: stored?.envelope.endedAt !== undefined,
    };
    ok(state, "capture", [sessionId, batch.batchId]);
  } catch (thrown) {
    stop(state, "capture", "capture_ingestion_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(2));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: evidence (real evidence service) ------------ */
  const assetByContentId = new Map(assets.map((asset) => [asset.contentId, asset] as const));
  try {
    const dropped: string[] = [];
    const registered: string[] = [];
    const session = await world.gateway.getSession(sessionId);
    for (const evidence of session?.envelope.assets ?? []) {
      const asset = assetByContentId.get(evidence.contentId);
      if (asset !== undefined && degradations.droppedEvidenceAssetId === asset.assetId) {
        dropped.push(evidence.contentId);
        continue; // the evidence record was lost between capture and the graph
      }
      const result = await world.evidenceService.registerEvidence(evidence);
      if (result.kind !== "registered" && result.kind !== "idempotent") {
        throw new Error(`evidence registration failed for ${evidence.contentId}`);
      }
      registered.push(evidence.contentId);
    }
    records.evidence = {
      registeredContentIds: registered,
      droppedContentIds: dropped,
      provenanceLinkCount: 0,
      derivationCount: 0,
    };
    ok(state, "evidence", registered);
  } catch (thrown) {
    stop(state, "evidence", "evidence_registration_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(3));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: reconstruction (real orchestrator) ---------- */
  const depthAssets = assets.filter((asset) => asset.method === "DEPTH_SENSING");
  const frames: LabFramePlane[] = [];
  try {
    const request = {
      taskId: `task-${scenario.scenarioId}-baseline`,
      evidenceContentIds: depthAssets.map((asset) => asset.contentId),
      captureSessionId: sessionId,
      requestedRepresentations: ["point_cloud" as const],
      declaredInputModalities: null,
      coordinateFrameConstraint: "y-up-metric",
      scaleConstraint: "metric-meters",
      policyConstraints: { timeoutMs: 30_000, maxRetries: 0 },
    };
    const job = await world.orchestrator.submit(request);
    const completed = await world.orchestrator.runToCompletion(job.jobId);
    if (completed.state !== "succeeded") {
      const failure = completed.failure;
      throw Object.assign(
        new Error(failure?.detail ?? "reconstruction failed"),
        { code: failure?.code ?? "RECONSTRUCTION_FAILED" },
      );
    }
    const artifactId = completed.artifactIds[0] ?? "";
    const artifact = await world.orchestrator.getArtifact(artifactId);
    if (artifact === null) {
      throw Object.assign(new Error(`reconstruction artifact ${artifactId} not found`), {
        code: "MISSING_RECONSTRUCTION",
      });
    }
    // Fit a plane per depth frame over the REAL fused points (observed via
    // the recording backend seam) with the REAL geometry library.
    const fused = depthBackend.responses();
    if (fused.length === 0) {
      throw Object.assign(new Error("no depth fusion response was recorded"), {
        code: "RECONSTRUCTION_FAILED",
      });
    }
    const grouped = fusedPointsBySource(fused[0]!);
    for (const asset of depthAssets) {
      const points = grouped.get(asset.contentId) ?? [];
      if (points.length === 0) {
        throw Object.assign(
          new Error(
            `reconstruction produced no fused points for depth frame ${asset.assetId} (${asset.contentId})`,
          ),
          { code: "MISSING_RECONSTRUCTION" },
        );
      }
      const surfaceTruth = truth.surfaces.find((s) => s.surfaceId === asset.surfaceId);
      if (surfaceTruth === undefined || asset.surfaceId === null) {
        throw new Error(`lab runner: depth frame ${asset.assetId} has no surface truth`);
      }
      const fitted = fitPlane(points);
      const oriented = orientPlane(fitted.plane, surfaceTruth.plane);
      frames.push({
        surfaceId: asset.surfaceId,
        assetId: asset.assetId,
        contentId: asset.contentId,
        plane: oriented,
        rmsResidual: fitted.rmsResidual,
        pointCount: points.length,
      });
    }
    // Derived-artifact provenance: register the artifact bytes as evidence
    // and record the derivation (inputs = the depth evidence).
    const artifactBytes = new TextEncoder().encode(JSON.stringify(artifact));
    const artifactContentId = sha256Hex(artifactBytes);
    await world.gateway.ingestAsset(artifactContentId, artifactBytes, "application/json");
    await world.evidenceService.registerEvidence({
      contractVersion: CONTRACT_VERSION,
      contentId: artifactContentId,
      byteSize: artifactBytes.length,
      mediaType: "application/json",
      capturedAt: LAB_CLOCK.reconstruction,
      acquisitionMethod: "DEPTH_SENSING",
      acquisitionMetadata: {
        "reconstruction.jobId": completed.jobId,
        "reconstruction.artifactId": artifactId,
        "reconstruction.providerId": completed.selectedProviderId ?? "",
        "lab.derived": "reconstruction-artifact",
      },
    });
    await world.evidenceService.recordDerivation({
      contractVersion: CONTRACT_VERSION,
      derivationId: `derivation-${scenario.scenarioId}-baseline`,
      outputContentId: artifactContentId,
      inputEvidenceContentIds: depthAssets.map((asset) => asset.contentId),
      method: "reconstruction.depth-lidar-fusion",
      methodVersion: "1.0.0",
      parameters: { jobId: completed.jobId, artifactId },
      createdAt: LAB_CLOCK.reconstruction,
    });
    records.evidence = {
      ...records.evidence!,
      // The derived reconstruction artifact is registered evidence too.
      registeredContentIds: [...records.evidence!.registeredContentIds, artifactContentId],
      derivationCount: 1,
    };
    records.reconstruction = {
      jobs: [
        {
          jobId: completed.jobId,
          taskId: request.taskId,
          state: completed.state,
          artifactIds: [...completed.artifactIds],
          selectedProviderId: completed.selectedProviderId,
          failure: null,
        },
      ],
      frames,
      derivations: [{ artifactId, outputContentId: artifactContentId }],
    };
    ok(state, "reconstruction", [completed.jobId, artifactId]);
  } catch (thrown) {
    const code = (thrown as { code?: string }).code ?? "RECONSTRUCTION_FAILED";
    stop(state, "reconstruction", code, describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(4));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: semantics (real extractor) ------------------ */
  let semantics: SemanticsResult;
  try {
    const artifactId = records.reconstruction!.jobs[0]!.artifactIds[0]!;
    const observedPlanes = frames.map((frame) => ({
      plane: frame.plane,
      rmsResidual: frame.rmsResidual,
      pointCount: frame.pointCount,
      observedAt: LAB_CLOCK.capturedAt,
      sourceArtifactId: artifactId,
      offsetSigma: LAB_DEVICE_SIGMA_M,
    }));
    const openings = truth.openings.map((opening) => ({
      boundingPolygon: opening.boundingPolygon,
      sourceArtifactId: artifactId,
      facts: { reachesFloor: opening.reachesFloor },
    }));
    semantics = extractArchitecturalSemantics({ planes: observedPlanes, openings });
    records.semantics = {
      extractorVersion: EXTRACTOR_VERSION,
      elementCount: semantics.elements.length,
      unclassifiedCount: semantics.unclassified.length,
      stats: semantics.stats,
      elements: semantics.elements.map((element) => {
        const frame = matchFrame(element, frames);
        return {
          elementId: element.elementId,
          kind: element.kind,
          surfaceId: frame?.surfaceId ?? null,
          plane:
            element.geometry.plane === undefined
              ? null
              : { normal: element.geometry.plane.normal, d: element.geometry.plane.d },
          height:
            element.geometry.height === undefined
              ? null
              : { value: element.geometry.height.value, sigma: element.geometry.height.uncertainty },
          width:
            element.geometry.width === undefined
              ? null
              : { value: element.geometry.width.value, sigma: element.geometry.width.uncertainty },
        };
      }),
    };
    ok(state, "semantics", semantics.elements.map((element) => element.elementId));
  } catch (thrown) {
    stop(state, "semantics", "semantic_extraction_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(5));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: reality (real versioned store) -------------- */
  let baselineVersionId: string;
  try {
    await world.realityStore.createProject(scenario.projectId, LAB_CLOCK.reality);
    const changes = buildBaselineChanges(scenario, truth, frames, semantics!, {
      sessionId,
      missionId: mission!.missionId,
      artifactId: records.reconstruction!.jobs[0]!.artifactIds[0]!,
    });
    const version = await world.realityStore.applyChanges(scenario.projectId, changes, {
      createdAt: LAB_CLOCK.reality,
    });
    baselineVersionId = version.versionId;
    records.measurements = collectMeasurements(scenario, semantics!, frames);
    // Evidence → node provenance links (the reality-object support graph).
    let linkCount = 0;
    for (const change of changes) {
      if (change.op !== "upsert-node") {
        continue;
      }
      const node = change.node;
      const supportIds = propertyEvidenceIds(scenario, node, assets);
      for (const evidenceId of supportIds) {
        await world.evidenceService.addProvenanceLink({
          contractVersion: CONTRACT_VERSION,
          subjectKind: "reality_object",
          subjectId: node.nodeId,
          evidenceContentId: evidenceId,
          role: "SUPPORTS",
        });
        linkCount += 1;
      }
    }
    records.evidence = { ...records.evidence!, provenanceLinkCount: linkCount };
    records.reality = {
      projectId: scenario.projectId,
      baselineVersionId: version.versionId,
      versionIds: [version.versionId],
      nodeIds: version.nodes.map((node) => node.nodeId),
      relationshipIds: version.relationships.map((rel) => rel.relationshipId),
      observationIds: version.observations.map((obs) => obs.observationId),
      postWorkVersionId: null,
    };
    ok(state, "reality", [version.versionId]);
  } catch (thrown) {
    stop(state, "reality", "reality_versioning_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(6));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: assurance (the readiness authority) ---------- */
  try {
    const version = await world.realityStore.getVersion(scenario.projectId, baselineVersionId!);
    const report = evaluateReadiness(
      await assuranceInput(scenario, version!, world, records.measurements),
    );
    records.assurance = {
      profileId: report.profileId,
      readiness: report.readiness,
      captureCompleteness:
        report.readiness === "READY" || report.readiness === "READY_WITH_NOTES"
          ? "COMPLETE"
          : "INCOMPLETE",
      dimensions: report.dimensions.map((dimension) => ({
        dimensionId: dimension.dimensionId,
        critical: dimension.critical,
        outcome: dimension.outcome,
        deficiencyCode: dimension.deficiency?.code ?? null,
      })),
      gaps: report.gaps,
      report,
      postWork: null,
    };
    ok(state, "assurance", [report.profileId]);
  } catch (thrown) {
    stop(state, "assurance", "assurance_evaluation_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(7));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: verification (real runner) ------------------- */
  try {
    const version = await world.realityStore.getVersion(scenario.projectId, baselineVersionId!);
    const verification = runVerification(
      await verificationInput(scenario, version!, world, records.assurance!, records.measurements),
    );
    records.verification = {
      findingCount: verification.findings.length,
      errorCount: verification.summary.errors,
      warningCount: verification.summary.warnings,
      findings: verification.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        subjectNodeIds: finding.subjectNodeIds,
      })),
      postWorkFindings: null,
    };
    ok(state, "verification", []);
  } catch (thrown) {
    stop(state, "verification", "verification_failed", describeThrown(thrown));
    remainingHops(state, LAB_HOP_IDS.slice(8));
    return finish(scenario, degradations, state, truth, records, world);
  }

  /* ---------------- hop: gaps (real gap analysis, when declared) ------ */
  const occludedSurfaces = scenario.surfaces.filter((surface) => surface.occluded);
  if (occludedSurfaces.length > 0) {
    try {
      const annotations = occludedSurfaces.map((surface) => ({
        targetNodeId: elementNodeId(surface.surfaceId),
        observationStatus: "OCCLUDED" as const,
        evidenceIds: [] as readonly string[],
      }));
      const uncertaintyAnnotations: {
        nodeId: string;
        propertyKey: string;
        sigma: number;
        unit: string;
        basis: string;
      }[] = [];
      if (scenario.defect !== null) {
        uncertaintyAnnotations.push({
          nodeId: elementNodeId(scenario.defect.onSurfaceId),
          propertyKey: "defect.width",
          sigma: scenario.defect.defectWidthSigmaM,
          unit: "m",
          basis: "graduated crack-width card (MANUAL_MEASUREMENT)",
        });
      }
      const analysis = await world.gapService.runGapAnalysis({
        analysisId: `gap-${scenario.scenarioId}-baseline`,
        taskRef: {
          projectId: scenario.projectId,
          versionId: baselineVersionId!,
          profileId: scenario.mission.assuranceProfileId,
        },
        annotations,
        uncertaintyAnnotations,
        taskFocus:
          scenario.defect === null
            ? []
            : [{ subjectNodeId: elementNodeId(scenario.defect.onSurfaceId), impactWeight: 1 }],
        effortContext: {},
        methodPreferences: {},
        deviceCapabilityFacts: { "depth.sensing": "available" },
      });
      records.gaps = {
        analysisId: analysis.analysisId,
        gapCount: analysis.gaps.length,
        annotationEcho: analysis.annotations.map((annotation) => ({
          targetNodeId: annotation.targetNodeId,
          observationStatus: annotation.observationStatus,
        })),
        gaps: analysis.gaps.map((gap) => ({
          gapId: gap.gapId,
          kind: gap.kind,
          subjectNodeId: gap.subjectNodeId,
          critical: gap.critical,
        })),
      };
      ok(state, "gaps", [analysis.analysisId]);
    } catch (thrown) {
      stop(state, "gaps", "gap_analysis_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(9));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "gaps", "no node-level not-observed subjects declared for this scenario");
  }

  /* ---------------- hop: boq (real import/normalize/map) -------------- */
  let mapping: BoqMapping | null = null;
  if (scenario.boq !== null) {
    try {
      const bytes = labBoqBytes(scenario.boq);
      const imported = await world.boqService.importSource(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx",
      );
      if (imported.parse.status !== "parsed") {
        throw new Error(`BOQ fixture did not parse: ${imported.parse.status}`);
      }
      const normalized = await world.normalizationService.normalizeImport(imported.importId);
      if (normalized === null) {
        throw new Error("BOQ normalization returned null");
      }
      const version = await world.realityStore.getVersion(scenario.projectId, baselineVersionId!);
      mapping = await world.mappingService.runMatcher(
        imported.importId,
        mappingSnapshot(scenario, version!),
      );
      if (mapping === null) {
        throw new Error("BOQ mapping returned null");
      }
      records.boq = {
        importId: imported.importId,
        format: imported.format,
        parseStatus: imported.parse.status,
        mappingId: mapping.mappingId,
        mappingVersion: mapping.version,
        entries: mapping.entries.map((entry) => ({
          entryId: entry.entryId,
          rowNumber: entry.boqItem.rowNumber,
          status: entry.status,
          confidence: entry.confidence,
          method: entry.method,
          targetNodeIds: entry.targets.map((target) => target.nodeId),
          reason: entry.reason ?? null,
        })),
      };
      ok(state, "boq", [imported.importId, mapping.mappingId]);
    } catch (thrown) {
      stop(state, "boq", "boq_reconciliation_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(10));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "boq", "scenario declares no BOQ fixture");
  }

  /* ---------------- hop: case (real case service) --------------------- */
  if (scenario.caseSpec !== null) {
    try {
      const caseId = scenario.caseSpec.caseId;
      await world.caseService.createCase({
        caseId,
        title: scenario.caseSpec.title,
        links: {
          nodeIds: scenario.defect === null ? [] : [elementNodeId(scenario.defect.onSurfaceId)],
          evidenceIds: records.evidence!.registeredContentIds,
          captureSessionIds: [sessionId],
        },
      });
      const defect = scenario.defect!;
      const roomLabel = defect.onSurfaceId.split(":")[1] ?? "";
      const wallSegment = defect.onSurfaceId.split(":")[2] ?? "";
      const observation = await world.caseService.addObservation(caseId, {
        statement:
          `${defect.label} observed on the ${wallSegment} of ${roomLabel} ` +
          `(measured width ${defect.defectWidthM} m ± ${defect.defectWidthSigmaM} m)`,
        evidenceIds: photoEvidenceIds(scenario, assets, records.evidence!),
        measurementRefs: ["meas:crack-width:card"],
      });
      const hypothesis = await world.caseService.addHypothesis(caseId, {
        statement:
          scenario.intervention === null
            ? "Documenting the crack condition in the finishes register resolves the survey case"
            : "Repairing the cracked render (fill, re-render, repaint) restores the wall condition to repaired",
        epistemicStatus: "INFERRED",
        supportingObservationIds: [observation.observationId],
        contradictingObservationIds: [],
        confidence: "medium",
      });
      const missing = await world.caseService.addMissingEvidence(caseId, {
        description:
          scenario.intervention === null
            ? "Finishes register entry acknowledging the documented crack condition"
            : "Post-repair condition verification of the cracked wall against the inspection profile",
        kind: "MISSING",
        wouldResolve: [hypothesis.hypothesisId],
        requestedMethod: "VISUAL_RECONSTRUCTION",
      });
      void missing;
      let review: LabCaseRecord["review"] = null;
      if (scenario.intervention !== null) {
        // The governed repair path reviews BEFORE execution (the approval
        // reference below cites this review).
        const submitted = await world.caseService.submitReview(caseId, {
          reviewer: "engineer-lab-north",
          decision: "approved",
          note: "Repair scope and verification criteria accepted",
        });
        review = { decision: submitted.decision, reviewer: submitted.reviewer };
      }
      const record = await world.caseService.getCase(caseId);
      records.caseRecord = {
        caseId,
        status: record!.status,
        observationIds: record!.observations.map((obs) => obs.observationId),
        hypothesisIds: record!.hypotheses.map((hyp) => hyp.hypothesisId),
        missingEvidenceIds: record!.missingEvidence.map((miss) => miss.missingId),
        review,
        record: record!,
      };
      ok(state, "case", [caseId]);
    } catch (thrown) {
      stop(state, "case", "case_documentation_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(11));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "case", "scenario declares no engineering case");
  }

  /* ---------------- hop: intervention (real service) ------------------ */
  let intervention: LabInterventionRecord | null = null;
  if (scenario.intervention !== null) {
    try {
      const spec = scenario.intervention;
      await world.interventionService.createScenario({
        scenarioId: spec.scenarioId,
        projectId: scenario.projectId,
        title: spec.title,
        baselineVersionId: baselineVersionId!,
      });
      for (const step of spec.steps) {
        await world.interventionService.addStep(spec.scenarioId, {
          kind: step.kind,
          targetNodeId: step.targetNodeId,
          change:
            step.kind === "property_change"
              ? {
                  kind: "property_change",
                  property: { key: step.property!.key, value: step.property!.value },
                }
              : { kind: "note", text: step.noteText! },
          rationale: step.rationale,
          provenance: {
            evidenceIds: photoEvidenceIds(scenario, assets, records.evidence!),
            derivationNote: "lab repair work order derived from the documented defect case",
          },
        });
      }
      if (records.caseRecord?.review != null) {
        await world.interventionService.recordApprovalReference(spec.scenarioId, {
          caseId: records.caseRecord.caseId,
          reviewDecision: records.caseRecord.review.decision,
          reviewedAt: LAB_CLOCK.caseReview,
        });
      }
      await world.interventionService.transitionStatus(spec.scenarioId, "under_review");
      const approved = await world.interventionService.transitionStatus(
        spec.scenarioId,
        "approved",
      );
      const latest = await world.interventionService.getState(spec.scenarioId, "latest");
      intervention = {
        scenarioId: spec.scenarioId,
        status: approved.status,
        baselineVersionId: approved.baselineVersionId,
        stepIds: approved.steps.map((step) => step.stepId),
        stateIds: approved.states.map((st) => st.stateId),
        executedStateId: latest.stateId,
        approvalReference: approved.approvalReference
          ? {
              caseId: approved.approvalReference.caseId,
              reviewDecision: approved.approvalReference.reviewDecision,
            }
          : null,
        record: approved,
      };
      records.intervention = intervention;
      ok(state, "intervention", [spec.scenarioId, latest.stateId]);
    } catch (thrown) {
      stop(state, "intervention", "intervention_governance_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(12));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "intervention", "scenario declares no intervention");
  }

  /* ---------------- hop: impact (real impact service) ----------------- */
  if (scenario.intervention !== null && mapping !== null && records.boq != null) {
    const boqSnapshot = records.boq;
    try {
      const rates = mapping.entries.map((entry) => {
        const row = scenario.boq!.rows.find(
          (candidate) => 3 + (candidate.itemId - 1) === entry.boqItem.rowNumber,
        );
        return { entryId: entry.entryId, amount: row?.rate ?? 0, currency: "EUR" };
      });
      const record = await world.impactService.computeImpact({
        scenarioId: scenario.intervention.scenarioId,
        stateIndex: "latest",
        importId: boqSnapshot.importId,
        rates,
      });
      records.impact = {
        impactId: record.impactId,
        lineCount: record.report.lines.length,
        costImpactCount: record.report.costImpacts.length,
        reportDigest: record.reportDigest,
        lines: record.report.lines.map((line) => ({
          lineId: line.lineId,
          kind: line.kind,
          targetNodeId: line.targetNodeId,
        })),
      };
      ok(state, "impact", [record.impactId]);
    } catch (thrown) {
      stop(state, "impact", "impact_computation_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(13));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "impact", "impact requires an intervention scenario with a BOQ mapping");
  }

  /* ---------------- hop: execution (real execution service) ----------- */
  let postWorkEvidenceIds: readonly string[] = [];
  if (scenario.intervention !== null) {
    try {
      // The work session: execution evidence (2 work photos) captured during
      // the repair, ingested and registered like any real capture.
      const workSessionId = `session-${scenario.scenarioId}-work`;
      const workPlan = [
        {
          assetId: `photo:${scenario.scenarioId}:work-1`,
          method: "VISUAL_RECONSTRUCTION" as const,
          mediaType: "image/jpeg",
          surfaceId: null,
          gridSide: 0,
          description: "work-in-progress frame of the repair",
        },
        {
          assetId: `photo:${scenario.scenarioId}:work-2`,
          method: "VISUAL_RECONSTRUCTION" as const,
          mediaType: "image/jpeg",
          surfaceId: null,
          gridSide: 0,
          description: "completed-repair frame before close-out",
        },
      ];
      const workFixtures = buildCaptureAssets(scenario, truth, workPlan);
      for (const asset of workFixtures) {
        await world.gateway.ingestAsset(asset.contentId, asset.bytes, asset.mediaType);
      }
      const workBatch = labSyncBatch({
        sessionId: workSessionId,
        missionId: mission!.missionId,
        assets: workFixtures,
        startedAt: LAB_CLOCK.postWorkStartedAt,
        endedAt: LAB_CLOCK.postWorkEndedAt,
        capturedAt: LAB_CLOCK.postWorkCapturedAt,
      });
      await world.gateway.ingestSyncBatch(SyncBatchCodec.encode(workBatch));
      const workSession = await world.gateway.getSession(workSessionId);
      const workEvidenceIds: string[] = [];
      for (const evidence of workSession?.envelope.assets ?? []) {
        await world.evidenceService.registerEvidence(evidence);
        workEvidenceIds.push(evidence.contentId);
      }
      records.evidence = {
        ...records.evidence!,
        registeredContentIds: [...records.evidence!.registeredContentIds, ...workEvidenceIds],
      };
      const recorded = await world.executionService.recordExecution({
        executionRecordId: `execution-${scenario.scenarioId}-1`,
        caseId: records.caseRecord!.caseId,
        scenarioId: intervention!.scenarioId,
        stateId: intervention!.executedStateId,
        executedStepIds: [...intervention!.stepIds],
        evidenceIds: workEvidenceIds,
        captureSessionIds: [workSessionId],
        executedAt: LAB_CLOCK.executedAt,
      });
      records.execution = {
        executionRecordId: recorded.executionRecordId,
        caseId: recorded.caseId,
        scenarioId: recorded.scenarioId,
        stateId: recorded.stateId,
        executedStepIds: [...recorded.executedStepIds],
        evidenceIds: [...recorded.evidenceIds],
        captureSessionIds: [...recorded.captureSessionIds],
        stateTransition: recorded.stateTransition,
        outcomeId: null,
        outcome: null,
        lineage: null,
      };
      ok(state, "execution", [recorded.executionRecordId]);
    } catch (thrown) {
      stop(state, "execution", "execution_recording_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(14));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "execution", "scenario declares no intervention execution");
  }

  /* ---------------- hop: post-work (capture → next version) ----------- */
  const postWorkFrames: LabFramePlane[] = [];
  if (scenario.postWorkCapturePlan !== null) {
    try {
      const postSessionId = `session-${scenario.scenarioId}-postwork`;
      const postAssets = buildCaptureAssets(scenario, truth, scenario.postWorkCapturePlan);
      for (const asset of postAssets) {
        await world.gateway.ingestAsset(asset.contentId, asset.bytes, asset.mediaType);
      }
      const postBatch = labSyncBatch({
        sessionId: postSessionId,
        missionId: mission!.missionId,
        assets: postAssets,
        startedAt: LAB_CLOCK.postWorkStartedAt,
        endedAt: LAB_CLOCK.postWorkEndedAt,
        capturedAt: LAB_CLOCK.postWorkCapturedAt,
      });
      await world.gateway.ingestSyncBatch(SyncBatchCodec.encode(postBatch));
      const postSession = await world.gateway.getSession(postSessionId);
      const postEvidenceIds: string[] = [];
      for (const evidence of postSession?.envelope.assets ?? []) {
        await world.evidenceService.registerEvidence(evidence);
        postEvidenceIds.push(evidence.contentId);
      }
      postWorkEvidenceIds = postEvidenceIds;
      // Post-work reconstruction job over the re-scanned surfaces.
      const postDepth = postAssets.filter((asset) => asset.method === "DEPTH_SENSING");
      const postJob = await world.orchestrator.submit({
        taskId: `task-${scenario.scenarioId}-postwork`,
        evidenceContentIds: postDepth.map((asset) => asset.contentId),
        captureSessionId: postSessionId,
        requestedRepresentations: ["point_cloud"],
        declaredInputModalities: null,
        coordinateFrameConstraint: "y-up-metric",
        scaleConstraint: "metric-meters",
        policyConstraints: { timeoutMs: 30_000, maxRetries: 0 },
      });
      const postCompleted = await world.orchestrator.runToCompletion(postJob.jobId);
      if (postCompleted.state !== "succeeded") {
        throw Object.assign(
          new Error(postCompleted.failure?.detail ?? "post-work reconstruction failed"),
          { code: postCompleted.failure?.code ?? "RECONSTRUCTION_FAILED" },
        );
      }
      const postArtifactId = postCompleted.artifactIds[0]!;
      const postResponses = depthBackend.responses();
      const postResponse = postResponses[postResponses.length - 1];
      const postGrouped = fusedPointsBySource(postResponse!);
      // Post-work derived-artifact provenance (same discipline as baseline).
      const postArtifact = await world.orchestrator.getArtifact(postArtifactId);
      const postArtifactBytes = new TextEncoder().encode(JSON.stringify(postArtifact));
      const postArtifactContentId = sha256Hex(postArtifactBytes);
      await world.gateway.ingestAsset(postArtifactContentId, postArtifactBytes, "application/json");
      await world.evidenceService.registerEvidence({
        contractVersion: CONTRACT_VERSION,
        contentId: postArtifactContentId,
        byteSize: postArtifactBytes.length,
        mediaType: "application/json",
        capturedAt: LAB_CLOCK.postWorkReconstruction,
        acquisitionMethod: "DEPTH_SENSING",
        acquisitionMetadata: {
          "reconstruction.jobId": postCompleted.jobId,
          "reconstruction.artifactId": postArtifactId,
          "reconstruction.providerId": postCompleted.selectedProviderId ?? "",
          "lab.derived": "reconstruction-artifact",
        },
      });
      await world.evidenceService.recordDerivation({
        contractVersion: CONTRACT_VERSION,
        derivationId: `derivation-${scenario.scenarioId}-postwork`,
        outputContentId: postArtifactContentId,
        inputEvidenceContentIds: postDepth.map((asset) => asset.contentId),
        method: "reconstruction.depth-lidar-fusion",
        methodVersion: "1.0.0",
        parameters: { jobId: postCompleted.jobId, artifactId: postArtifactId },
        createdAt: LAB_CLOCK.postWorkReconstruction,
      });
      records.evidence = {
        ...records.evidence!,
        registeredContentIds: [
          ...records.evidence!.registeredContentIds,
          ...postEvidenceIds,
          postArtifactContentId,
        ],
        derivationCount: records.evidence!.derivationCount + 1,
      };
      records.reconstruction = {
        ...records.reconstruction!,
        derivations: [
          ...records.reconstruction!.derivations,
          { artifactId: postArtifactId, outputContentId: postArtifactContentId },
        ],
      };
      for (const asset of postDepth) {
        const points = postGrouped.get(asset.contentId) ?? [];
        const surfaceTruth = truth.surfaces.find((s) => s.surfaceId === asset.surfaceId);
        const fitted = fitPlane(points);
        const oriented = orientPlane(fitted.plane, surfaceTruth!.plane);
        postWorkFrames.push({
          surfaceId: asset.surfaceId!,
          assetId: asset.assetId,
          contentId: asset.contentId,
          plane: oriented,
          rmsResidual: fitted.rmsResidual,
          pointCount: points.length,
        });
      }
      // Reality next version: the repaired wall re-observed.
      const postChanges = buildPostWorkChanges(
        scenario,
        truth,
        postWorkFrames,
        postArtifactId,
        postSessionId,
        mission!.missionId,
      );
      const postVersion = await world.realityStore.applyChanges(
        scenario.projectId,
        postChanges,
        { createdAt: LAB_CLOCK.postWorkReality },
      );
      records.reality = {
        ...records.reality!,
        versionIds: [...records.reality!.versionIds, postVersion.versionId],
        postWorkVersionId: postVersion.versionId,
        nodeIds: postVersion.nodes.map((node) => node.nodeId),
        observationIds: postVersion.observations.map((obs) => obs.observationId),
      };
      // Post-work assurance + verification over the new version and the full
      // evidence graph (nothing was invalidated — cumulative evidence).
      const postReport = evaluateReadiness(
        await assuranceInput(scenario, postVersion, world, records.measurements),
      );
      const postVerification = runVerification(
        await verificationInput(scenario, postVersion, world, records.assurance!, records.measurements),
      );
      records.assurance = {
        ...records.assurance!,
        postWork: {
          readiness: postReport.readiness,
          captureCompleteness:
            postReport.readiness === "READY" || postReport.readiness === "READY_WITH_NOTES"
              ? "COMPLETE"
              : "INCOMPLETE",
          report: postReport,
        },
      };
      records.verification = {
        ...records.verification!,
        postWorkFindings: postVerification.findings.map((finding) => ({
          code: finding.code,
          severity: finding.severity,
        })),
      };
      records.reconstruction = {
        ...records.reconstruction!,
        jobs: [
          ...records.reconstruction!.jobs,
          {
            jobId: postCompleted.jobId,
            taskId: `task-${scenario.scenarioId}-postwork`,
            state: postCompleted.state,
            artifactIds: [...postCompleted.artifactIds],
            selectedProviderId: postCompleted.selectedProviderId,
            failure: null,
          },
        ],
        frames: [...records.reconstruction!.frames, ...postWorkFrames],
      };
      ok(state, "postWork", [postSessionId, postVersion.versionId, postCompleted.jobId]);
    } catch (thrown) {
      stop(state, "postWork", "post_work_verification_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(15));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "postWork", "scenario declares no post-work capture");
  }

  /* ---------------- hop: changedetection (real comparator) ------------ */
  if (records.reality?.postWorkVersionId != null) {
    try {
      const from = await world.realityStore.getVersion(
        scenario.projectId,
        records.reality.baselineVersionId,
      );
      const to = await world.realityStore.getVersion(
        scenario.projectId,
        records.reality.postWorkVersionId,
      );
      const geoFrom = new Map(
        frames.map((frame) => [`plane:${frame.surfaceId}`, frame.plane] as const),
      );
      const geoTo = new Map<string, Plane>();
      for (const frame of [...frames, ...postWorkFrames]) {
        geoTo.set(`plane:${frame.surfaceId}`, frame.plane);
      }
      const report = compareVersions(
        { versionId: from!.versionId, nodes: from!.nodes },
        { versionId: to!.versionId, nodes: to!.nodes },
        geoFrom,
        geoTo,
      );
      records.changedetection = {
        fromVersionId: from!.versionId,
        toVersionId: to!.versionId,
        findings: report.matches.flatMap((match) =>
          match.changes.map((change) => ({
            code: change.code,
            nodeId: match.nodeId,
            key: "key" in change ? (change as { key: string }).key : null,
          })),
        ),
        report,
      };
      ok(state, "changedetection", [report.fromVersionId, report.toVersionId]);
    } catch (thrown) {
      stop(state, "changedetection", "change_detection_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(16));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "changedetection", "single-version survey — no version pair to compare");
  }

  /* ---------------- hop: outcome (real outcome recording) ------------- */
  if (records.execution != null) {
    const executionSnapshot = records.execution;
    try {
      const postSessionId = `session-${scenario.scenarioId}-postwork`;
      const outcome = await world.executionService.recordOutcome(
        executionSnapshot.executionRecordId,
        {
          caseId: executionSnapshot.caseId,
          statement:
            "Post-work scan confirms the cracked wall render is filled, re-rendered and " +
            "repainted; the wall condition is observed repaired.",
          evidenceIds: [...postWorkEvidenceIds],
          captureSessionIds: [postSessionId],
          measurementRefs: [
            `meas:plane:${records.reconstruction!.jobs[records.reconstruction!.jobs.length - 1]!.artifactIds[0]}`,
          ],
        },
      );
      records.execution = {
        ...executionSnapshot,
        outcomeId: outcome.outcomeId,
        outcome,
      };
      // The missing evidence is now collected and the case resolved.
      await world.caseService.collectEvidence(
        executionSnapshot.caseId,
        records.caseRecord!.missingEvidenceIds[0]!,
      );
      await world.caseService.resolveCase(executionSnapshot.caseId);
      const finalCase = await world.caseService.getCase(executionSnapshot.caseId);
      records.caseRecord = {
        ...records.caseRecord!,
        status: finalCase!.status,
        record: finalCase!,
      };
      ok(state, "outcome", [outcome.outcomeId]);
    } catch (thrown) {
      stop(state, "outcome", "outcome_recording_failed", describeThrown(thrown));
      remainingHops(state, LAB_HOP_IDS.slice(17));
      return finish(scenario, degradations, state, truth, records, world);
    }
  } else {
    notApplicable(state, "outcome", "no execution record to observe an outcome for");
  }

  /* ---------------- hop: lineage (the verified chain) ----------------- */
  if (records.execution?.outcomeId != null) {
    const executionSnapshot = records.execution;
    try {
      const lineage = await world.executionService.getCaseLineage(executionSnapshot.caseId);
      records.execution = {
        ...executionSnapshot,
        lineage,
      };
      ok(state, "lineage", [lineage.caseId, executionSnapshot.executionRecordId]);
    } catch (thrown) {
      stop(state, "lineage", "lineage_verification_failed", describeThrown(thrown));
    }
  } else {
    notApplicable(state, "lineage", "no completed issue->outcome chain to verify");
  }

  return finish(scenario, degradations, state, truth, records, world);
}

/* ------------------------------------------------------------------ */
/* Record assembly                                                      */
/* ------------------------------------------------------------------ */

interface WritableRecords {
  mission?: LabMissionRecord;
  capture?: LabCaptureRecord;
  evidence?: LabEvidenceRecord;
  reconstruction?: LabReconstructionRecord;
  semantics?: LabSemanticsRecord;
  measurements?: readonly LabMeasurementRecord[];
  reality?: LabRealityRecord;
  assurance?: LabAssuranceRecord;
  verification?: LabVerificationRecord;
  gaps?: LabGapsRecord;
  boq?: LabBoqRecord;
  caseRecord?: LabCaseRecord;
  intervention?: LabInterventionRecord;
  impact?: LabImpactRecord;
  execution?: LabExecutionRecord;
  changedetection?: LabScenarioRun["changedetection"];
}

function finish(
  scenario: LabScenario,
  degradations: LabDegradations,
  state: RunState,
  truth: LabGroundTruth,
  records: WritableRecords,
  world: LabWorld,
): ScenarioRunResult {
  const run: LabScenarioRun = {
    scenarioId: scenario.scenarioId,
    degradations,
    hops: state.hops,
    mission: records.mission ?? null,
    capture: records.capture ?? null,
    evidence: records.evidence ?? null,
    reconstruction: records.reconstruction ?? null,
    semantics: records.semantics ?? null,
    measurements: records.measurements ?? [],
    reality: records.reality ?? null,
    assurance: records.assurance ?? null,
    verification: records.verification ?? null,
    gaps: records.gaps ?? null,
    boq: records.boq ?? null,
    caseRecord: records.caseRecord ?? null,
    intervention: records.intervention ?? null,
    impact: records.impact ?? null,
    execution: records.execution ?? null,
    changedetection: records.changedetection ?? null,
    stoppedAt: state.stoppedAt,
    stopReason: state.stopReason,
    notObserved: truth.notObserved,
  };
  return { run, world };
}

/* ------------------------------------------------------------------ */
/* Reality change-set construction (the AISE-015 -> 016 projection)     */
/* ------------------------------------------------------------------ */

interface BaselineContext {
  readonly sessionId: string;
  readonly missionId: string;
  readonly artifactId: string;
}

function provenance(
  role: ProvenanceRecord["role"],
  fields: { evidenceId?: string; sourceArtifactId?: string; derivationNote?: string },
  recordedAt: string,
): ProvenanceRecord[] {
  return [{ role, ...fields, recordedAt }];
}

function rel(
  relationshipId: string,
  fromNodeId: string,
  toNodeId: string,
  kind: Relationship["kind"],
  context: BaselineContext,
): Relationship {
  return {
    relationshipId,
    fromNodeId,
    toNodeId,
    kind,
    provenance: provenance(
      "DERIVED_FROM",
      { sourceArtifactId: context.artifactId, derivationNote: "capture-plan containment structure" },
      LAB_CLOCK.reality,
    ),
  };
}

function buildBaselineChanges(
  scenario: LabScenario,
  truth: LabGroundTruth,
  frames: readonly LabFramePlane[],
  semantics: SemanticsResult,
  context: BaselineContext,
): ChangeRecord[] {
  void truth;
  const changes: ChangeRecord[] = [];
  const hierarchy = hierarchyNodeIds(scenario);
  const projectId = hierarchy[0]!;
  const siteId = hierarchy[1]!;
  const buildingId = hierarchy[2]!;
  const storeyId = hierarchy[3]!;
  const frameBySurface = new Map(frames.map((frame) => [frame.surfaceId, frame] as const));
  const elementBySurface = new Map<string, SemanticElement>();
  for (const element of semantics.elements) {
    const frame = matchFrame(element, frames);
    if (
      frame !== null &&
      (element.kind === "wall" || element.kind === "floor" || element.kind === "ceiling")
    ) {
      elementBySurface.set(frame.surfaceId, element);
    }
  }
  const defect = scenario.defect;
  const defectHostId = defect === null ? null : elementNodeId(defect.onSurfaceId);

  // Hierarchy (operator-declared structure; CONFIRMED with CONTEXT provenance).
  const hierarchyProperties = (label: string) => [
    {
      key: "label",
      value: label,
      epistemicStatus: "CONFIRMED" as const,
      provenance: provenance(
        "CONTEXT",
        { derivationNote: "operator-declared project structure" },
        LAB_CLOCK.reality,
      ),
    },
  ];
  changes.push({
    op: "upsert-node",
    node: {
      nodeId: projectId,
      kind: "project",
      epistemicStatus: "CONFIRMED",
      properties: hierarchyProperties(scenario.projectId),
      provenance: provenance(
        "CONTEXT",
        { derivationNote: "operator-declared project structure" },
        LAB_CLOCK.reality,
      ),
    },
  });
  const hierarchyNodes: { id: string; kind: "site" | "building" | "storey"; label: string }[] = [
    { id: siteId, kind: "site", label: scenario.siteLabel },
    { id: buildingId, kind: "building", label: scenario.buildingLabel },
    { id: storeyId, kind: "storey", label: scenario.storeyLabel },
  ];
  for (const entry of hierarchyNodes) {
    changes.push({
      op: "upsert-node",
      node: {
        nodeId: entry.id,
        kind: entry.kind,
        epistemicStatus: "CONFIRMED",
        properties: hierarchyProperties(entry.label),
        provenance: provenance(
          "CONTEXT",
          { derivationNote: "operator-declared project structure" },
          LAB_CLOCK.reality,
        ),
      },
    });
  }
  changes.push(
    { op: "upsert-relationship", relationship: rel("rel:site", projectId, siteId, "contains", context) },
    { op: "upsert-relationship", relationship: rel("rel:building", siteId, buildingId, "contains", context) },
    { op: "upsert-relationship", relationship: rel("rel:storey", buildingId, storeyId, "contains", context) },
  );

  // Spaces: room dimensions from the REAL extractor's element geometry.
  for (const room of scenario.rooms) {
    const spaceId = spaceNodeId(room.label);
    const properties: {
      key: string;
      value: string | number | boolean;
      unit?: string;
      epistemicStatus: "CONFIRMED" | "OBSERVED" | "INFERRED" | "PROPOSED";
      provenance: ProvenanceRecord[];
    }[] = [
      {
        key: "label",
        value: room.label,
        epistemicStatus: "INFERRED" as const,
        provenance: provenance(
          "DERIVED_FROM",
          { sourceArtifactId: context.artifactId, derivationNote: "room label from the capture plan" },
          LAB_CLOCK.reality,
        ),
      },
    ];
    const dims = roomDimensionElements(semantics, frames, room.label);
    for (const dim of dims) {
      properties.push({
        key: dim.propertyKey,
        value: dim.valueM,
        unit: "m",
        epistemicStatus: "INFERRED" as const,
        provenance: provenance(
          "DERIVED_FROM",
          {
            sourceArtifactId: context.artifactId,
            derivationNote: `dimensionBetweenParallelPlanes between ${dim.surfaceA} and ${dim.surfaceB} (semantics extractor geometry, σ composed from plane offsetSigma)`,
          },
          LAB_CLOCK.reality,
        ),
      });
    }
    changes.push({
      op: "upsert-node",
      node: {
        nodeId: spaceId,
        kind: "space",
        epistemicStatus: "INFERRED",
        properties,
        provenance: provenance(
          "DERIVED_FROM",
          { sourceArtifactId: context.artifactId, derivationNote: "space derived from captured bounding surfaces" },
          LAB_CLOCK.reality,
        ),
        acquisitionRef: { captureSessionId: context.sessionId, missionId: context.missionId },
      },
    });
    changes.push({
      op: "upsert-relationship",
      relationship: rel(`rel:space:${room.label}`, storeyId, spaceId, "contains", context),
    });
  }

  // Elements: one per captured surface, from the extractor's elements.
  for (const surface of scenario.surfaces) {
    if (surface.occluded) {
      continue;
    }
    const frame = frameBySurface.get(surface.surfaceId);
    const element = elementBySurface.get(surface.surfaceId);
    if (frame === undefined || element === undefined) {
      throw new Error(`lab runner: no extracted element for captured surface ${surface.surfaceId}`);
    }
    const nodeId = elementNodeId(surface.surfaceId);
    const properties: {
      key: string;
      value: string | number | boolean;
      unit?: string;
      epistemicStatus: "CONFIRMED" | "OBSERVED" | "INFERRED" | "PROPOSED";
      provenance: ProvenanceRecord[];
    }[] = [
      {
        key: "label",
        value: `${surface.surfaceId.split(":")[2]} of ${surface.roomLabel}`,
        epistemicStatus: "INFERRED",
        provenance: provenance(
          "DERIVED_FROM",
          { sourceArtifactId: context.artifactId, derivationNote: "element label from the capture plan" },
          LAB_CLOCK.reality,
        ),
      },
      {
        key: "semantic.kind",
        value: element.kind,
        epistemicStatus: "INFERRED",
        provenance: provenance(
          "DERIVED_FROM",
          { sourceArtifactId: context.artifactId, derivationNote: "architectural semantics extraction (AISE-015)" },
          LAB_CLOCK.reality,
        ),
      },
    ];
    if (defect !== null && defectHostId === nodeId) {
      properties.push(
        {
          key: "element.material",
          value: defect.material,
          epistemicStatus: "OBSERVED",
          provenance: provenance("SUPPORTS", { evidenceId: docEvidenceId(scenario) }, LAB_CLOCK.reality),
        },
        {
          key: "element.condition",
          value: defect.elementCondition,
          epistemicStatus: "OBSERVED",
          provenance: provenance("SUPPORTS", { evidenceId: firstPhotoEvidenceId(scenario) }, LAB_CLOCK.reality),
        },
        {
          key: "condition.cracking",
          value: defect.conditionCracking,
          epistemicStatus: "OBSERVED",
          provenance: provenance("SUPPORTS", { evidenceId: firstPhotoEvidenceId(scenario) }, LAB_CLOCK.reality),
        },
        {
          key: "defect.width",
          value: defect.defectWidthM,
          unit: "m",
          epistemicStatus: "OBSERVED",
          provenance: provenance("SUPPORTS", { evidenceId: crackCardEvidenceId(scenario) }, LAB_CLOCK.reality),
        },
      );
    }
    changes.push({
      op: "upsert-node",
      node: {
        nodeId,
        kind: "element",
        epistemicStatus: "INFERRED",
        properties,
        geometry: {
          kind: "plane",
          ref: `plane:${surface.surfaceId}`,
          sourceArtifactId: context.artifactId,
        },
        provenance: provenance("SUPPORTS", { evidenceId: frame.contentId }, LAB_CLOCK.reality),
        units: { linear: "m", angular: "deg" },
        acquisitionRef: { captureSessionId: context.sessionId, missionId: context.missionId },
      },
    });
    changes.push({
      op: "upsert-relationship",
      relationship: rel(`rel:${nodeId}`, spaceNodeId(surface.roomLabel), nodeId, "contains", context),
    });
  }

  // Openings: door/window elements with an opens-into host relationship.
  for (const opening of scenario.openings) {
    const openingId = openingNodeId(opening.openingId, opening.label);
    const element = semantics.elements.find(
      (candidate) => candidate.kind === "door" || candidate.kind === "window",
    );
    // A scenario that declares openings declares photo evidence for them
    // (scenario structural invariant; typed refusal otherwise).
    const openingEvidenceId = overviewPhotoEvidenceId(scenario) ?? firstPhotoEvidenceId(scenario);
    changes.push({
      op: "upsert-node",
      node: {
        nodeId: openingId,
        kind: "opening",
        epistemicStatus: "INFERRED",
        properties: [
          {
            key: "label",
            value: opening.label,
            epistemicStatus: "INFERRED",
            provenance: provenance(
              "DERIVED_FROM",
              { sourceArtifactId: context.artifactId, derivationNote: "opening label from the capture plan" },
              LAB_CLOCK.reality,
            ),
          },
          {
            key: "semantic.kind",
            value: element?.kind ?? opening.kind,
            epistemicStatus: "INFERRED",
            provenance: provenance(
              "DERIVED_FROM",
              { sourceArtifactId: context.artifactId, derivationNote: "architectural semantics extraction (AISE-015)" },
              LAB_CLOCK.reality,
            ),
          },
        ],
        geometry: {
          kind: "polygon",
          ref: `polygon:${opening.openingId}`,
          sourceArtifactId: context.artifactId,
        },
        provenance: provenance("SUPPORTS", { evidenceId: openingEvidenceId }, LAB_CLOCK.reality),
        acquisitionRef: { captureSessionId: context.sessionId, missionId: context.missionId },
      },
    });
    changes.push({
      op: "upsert-relationship",
      relationship: rel(
        `rel:${openingId}:host`,
        openingId,
        elementNodeId(opening.onSurfaceId),
        "opens-into",
        context,
      ),
    });
    changes.push({
      op: "upsert-relationship",
      relationship: rel(
        `rel:${openingId}:space`,
        spaceNodeId(opening.onSurfaceId.split(":")[1] ?? ""),
        openingId,
        "contains",
        context,
      ),
    });
  }

  // The defect observation episode (OBSERVED facts, append-only).
  if (defect !== null) {
    const observation: ObservationRecord = {
      observationId: `obs:${scenario.scenarioId}:defect`,
      nodeId: elementNodeId(defect.onSurfaceId),
      observedAt: LAB_CLOCK.capturedAt,
      evidenceIds: [firstPhotoEvidenceId(scenario), crackCardEvidenceId(scenario)],
      properties: [
        {
          key: "element.condition",
          value: defect.elementCondition,
          epistemicStatus: "OBSERVED",
          provenance: provenance("SUPPORTS", { evidenceId: firstPhotoEvidenceId(scenario) }, LAB_CLOCK.reality),
        },
        {
          key: "defect.width",
          value: defect.defectWidthM,
          unit: "m",
          epistemicStatus: "OBSERVED",
          provenance: provenance("SUPPORTS", { evidenceId: crackCardEvidenceId(scenario) }, LAB_CLOCK.reality),
        },
      ],
      observer: "surveyor-lab",
      note: `${defect.label} — condition survey observation`,
    };
    changes.push({ op: "observe", observation });
  }
  return changes;
}

/** Room dimension values from the extractor's element geometry. */
function roomDimensionElements(
  semantics: SemanticsResult,
  frames: readonly LabFramePlane[],
  roomLabel: string,
): readonly { propertyKey: string; valueM: number; surfaceA: string; surfaceB: string }[] {
  const dims: { propertyKey: string; valueM: number; surfaceA: string; surfaceB: string }[] = [];
  const elementFor = (surfaceId: string): SemanticElement | undefined => {
    const frame = frames.find((candidate) => candidate.surfaceId === surfaceId);
    if (frame === undefined) {
      return undefined;
    }
    return semantics.elements.find((candidate) => matchFrame(candidate, frames) === frame);
  };
  const floor = elementFor(`surface:${roomLabel}:floor`);
  if (floor?.geometry.height !== undefined) {
    dims.push({
      propertyKey: "room.height",
      valueM: floor.geometry.height.value,
      surfaceA: `surface:${roomLabel}:floor`,
      surfaceB: `surface:${roomLabel}:ceiling`,
    });
  }
  const north = elementFor(`surface:${roomLabel}:wall-north`);
  if (north?.geometry.width !== undefined) {
    dims.push({
      propertyKey: "room.depth",
      valueM: north.geometry.width.value,
      surfaceA: `surface:${roomLabel}:wall-north`,
      surfaceB: `surface:${roomLabel}:wall-south`,
    });
  }
  const west = elementFor(`surface:${roomLabel}:wall-west`);
  if (west?.geometry.width !== undefined) {
    dims.push({
      propertyKey: "room.width",
      valueM: west.geometry.width.value,
      surfaceA: `surface:${roomLabel}:wall-west`,
      surfaceB: `surface:${roomLabel}:wall-east`,
    });
  }
  return dims;
}

/** The measured dimensions (run record) with their composed σ. */
function collectMeasurements(
  scenario: LabScenario,
  semantics: SemanticsResult,
  frames: readonly LabFramePlane[],
): LabMeasurementRecord[] {
  const measurements: LabMeasurementRecord[] = [];
  for (const room of scenario.rooms) {
    const dims = roomDimensionElements(semantics, frames, room.label);
    const sigmaOf = (propertyKey: string): number | null => {
      const surfaceId =
        propertyKey === "room.height"
          ? `surface:${room.label}:floor`
          : propertyKey === "room.depth"
            ? `surface:${room.label}:wall-north`
            : `surface:${room.label}:wall-west`;
      const frame = frames.find((candidate) => candidate.surfaceId === surfaceId);
      if (frame === undefined) {
        return null;
      }
      const element = semantics.elements.find((candidate) => matchFrame(candidate, frames) === frame);
      if (element === undefined) {
        return null;
      }
      if (propertyKey === "room.height") {
        return element.geometry.height?.uncertainty ?? null;
      }
      return element.geometry.width?.uncertainty ?? null;
    };
    for (const dim of dims) {
      measurements.push({
        dimensionId: `dim:${room.label}:${dim.propertyKey.split(".")[1]}`,
        propertyKey: dim.propertyKey,
        roomLabel: room.label,
        nodeId: spaceNodeId(room.label),
        valueM: dim.valueM,
        sigmaM: sigmaOf(dim.propertyKey),
      });
    }
  }
  return measurements;
}

/** Post-work change set: the repaired wall re-observed. */
function buildPostWorkChanges(
  scenario: LabScenario,
  truth: LabGroundTruth,
  postWorkFrames: readonly LabFramePlane[],
  artifactId: string,
  sessionId: string,
  missionId: string,
): ChangeRecord[] {
  void truth;
  if (scenario.defect === null) {
    throw new Error("lab runner: post-work changes require a defect");
  }
  const defect = scenario.defect;
  const hostNodeId = elementNodeId(defect.onSurfaceId);
  const roomLabel = defect.onSurfaceId.split(":")[1] ?? "";
  const wallSegment = defect.onSurfaceId.split(":")[2] ?? "";
  const frame = postWorkFrames[0];
  if (frame === undefined) {
    throw new Error("lab runner: no post-work frame for the defect host");
  }
  const postPhotoId = postPhotoEvidenceId(scenario);
  const node: RealityNode = {
    nodeId: hostNodeId,
    kind: "element",
    epistemicStatus: "INFERRED",
    properties: [
      {
        key: "label",
        value: `${wallSegment} of ${roomLabel}`,
        epistemicStatus: "INFERRED",
        provenance: provenance(
          "DERIVED_FROM",
          { sourceArtifactId: artifactId, derivationNote: "element label from the capture plan" },
          LAB_CLOCK.postWorkReality,
        ),
      },
      {
        key: "semantic.kind",
        value: "wall",
        epistemicStatus: "INFERRED",
        provenance: provenance(
          "DERIVED_FROM",
          { sourceArtifactId: artifactId, derivationNote: "architectural semantics extraction (AISE-015)" },
          LAB_CLOCK.postWorkReality,
        ),
      },
      {
        key: "element.material",
        value: defect.material,
        epistemicStatus: "OBSERVED",
        provenance: provenance("SUPPORTS", { evidenceId: postPhotoId }, LAB_CLOCK.postWorkReality),
      },
      {
        // The repair is OBSERVED from the post-work scan; the crack is gone,
        // so defect.width is no longer asserted (never fabricated as 0).
        key: "element.condition",
        value: "repaired",
        epistemicStatus: "OBSERVED",
        provenance: provenance("SUPPORTS", { evidenceId: postPhotoId }, LAB_CLOCK.postWorkReality),
      },
      {
        key: "condition.cracking",
        value: "none",
        epistemicStatus: "OBSERVED",
        provenance: provenance("SUPPORTS", { evidenceId: postPhotoId }, LAB_CLOCK.postWorkReality),
      },
    ],
    geometry: { kind: "plane", ref: `plane:${defect.onSurfaceId}`, sourceArtifactId: artifactId },
    provenance: provenance("SUPPORTS", { evidenceId: frame.contentId }, LAB_CLOCK.postWorkReality),
    units: { linear: "m", angular: "deg" },
    acquisitionRef: { captureSessionId: sessionId, missionId },
  };
  const observation: ObservationRecord = {
    observationId: `obs:${scenario.scenarioId}:postwork`,
    nodeId: hostNodeId,
    observedAt: LAB_CLOCK.postWorkCapturedAt,
    evidenceIds: [postPhotoId, frame.contentId],
    properties: [
      {
        key: "element.condition",
        value: "repaired",
        epistemicStatus: "OBSERVED",
        provenance: provenance("SUPPORTS", { evidenceId: postPhotoId }, LAB_CLOCK.postWorkReality),
      },
      {
        key: "condition.cracking",
        value: "none",
        epistemicStatus: "OBSERVED",
        provenance: provenance("SUPPORTS", { evidenceId: postPhotoId }, LAB_CLOCK.postWorkReality),
      },
    ],
    observer: "surveyor-lab",
    note: "post-work verification observation of the repaired wall",
  };
  return [
    { op: "upsert-node", node },
    { op: "observe", observation },
  ];
}

/* ------------------------------------------------------------------ */
/* Evidence id helpers (deterministic lookups from the capture plan)     */
/* ------------------------------------------------------------------ */

function assetContentId(scenario: LabScenario, assetId: string): string {
  // Content ids are sha-256 of the asset bytes; rebuild deterministically
  // from the frozen scenario + ground truth (pure fixture reconstruction).
  const planEntry = [...scenario.capturePlan, ...(scenario.postWorkCapturePlan ?? [])].find(
    (asset) => asset.assetId === assetId,
  );
  if (planEntry === undefined) {
    throw new Error(`lab runner: unknown asset id ${assetId}`);
  }
  const truth = groundTruthOf(scenario);
  const assets = buildCaptureAssets(scenario, truth, [planEntry]);
  return assets[0]!.contentId;
}

function firstPhotoEvidenceId(scenario: LabScenario): string {
  const photo = scenario.capturePlan.find((asset) => asset.method === "VISUAL_RECONSTRUCTION");
  if (photo === undefined) {
    throw new Error(`lab runner: no photo asset in ${scenario.scenarioId} capture plan`);
  }
  return assetContentId(scenario, photo.assetId);
}

/** The overview photo's evidence id, or null when the plan has no photos. */
function overviewPhotoEvidenceId(scenario: LabScenario): string | null {
  const photo = [...scenario.capturePlan]
    .reverse()
    .find((asset) => asset.method === "VISUAL_RECONSTRUCTION");
  if (photo === undefined) {
    return null;
  }
  return assetContentId(scenario, photo.assetId);
}

function docEvidenceId(scenario: LabScenario): string {
  const doc = scenario.capturePlan.find((asset) => asset.method === "DOCUMENT_REGION");
  if (doc === undefined) {
    throw new Error(`lab runner: no document asset in ${scenario.scenarioId} capture plan`);
  }
  return assetContentId(scenario, doc.assetId);
}

function crackCardEvidenceId(scenario: LabScenario): string {
  const card = scenario.capturePlan.find((asset) => asset.method === "MANUAL_MEASUREMENT");
  if (card === undefined) {
    throw new Error(`lab runner: no manual measurement asset in ${scenario.scenarioId} capture plan`);
  }
  return assetContentId(scenario, card.assetId);
}

function postPhotoEvidenceId(scenario: LabScenario): string {
  const photo = scenario.postWorkCapturePlan?.find(
    (asset) => asset.method === "VISUAL_RECONSTRUCTION",
  );
  if (photo === undefined) {
    throw new Error(`lab runner: no post-work photo in ${scenario.scenarioId}`);
  }
  return assetContentId(scenario, photo.assetId);
}

function photoEvidenceIds(
  scenario: LabScenario,
  assets: readonly LabAssetFixture[],
  evidenceRecord: LabEvidenceRecord,
): readonly string[] {
  void scenario;
  const registered = new Set(evidenceRecord.registeredContentIds);
  return assets
    .filter((asset) => asset.method === "VISUAL_RECONSTRUCTION" && registered.has(asset.contentId))
    .map((asset) => asset.contentId);
}

/**
 * The evidence ids that SUPPORT a node's assertions (used for the
 * reality-object provenance links): the node's own frame evidence plus, for
 * the defect host, the photo/document/measurement evidence; for spaces and
 * openings, the overview photo.
 */
function propertyEvidenceIds(
  scenario: LabScenario,
  node: RealityNode,
  assets: readonly LabAssetFixture[],
): readonly string[] {
  const assetIdForSurface = (surfaceId: string): string => `depth:${surfaceId}`;
  const ids: string[] = [];
  const overview = overviewPhotoEvidenceId(scenario);
  if (node.kind === "element") {
    // The element's supporting depth frame: find the surface whose element
    // node id matches this node.
    for (const surface of scenario.surfaces) {
      if (elementNodeId(surface.surfaceId) === node.nodeId && !surface.occluded) {
        const asset = assets.find((candidate) => candidate.assetId === assetIdForSurface(surface.surfaceId));
        if (asset !== undefined) {
          ids.push(asset.contentId);
        }
      }
    }
    if (scenario.defect !== null && elementNodeId(scenario.defect.onSurfaceId) === node.nodeId) {
      ids.push(
        firstPhotoEvidenceId(scenario),
        docEvidenceId(scenario),
        crackCardEvidenceId(scenario),
      );
      if (overview !== null) {
        ids.push(overview);
      }
    }
    return ids;
  }
  if (node.kind === "space") {
    // The space's extent is supported by its bounding surfaces' evidence:
    // link the room's floor frame (+ the overview photo when one exists).
    const roomLabel = node.nodeId.split(":")[2] ?? "";
    const floorAsset = assets.find(
      (candidate) => candidate.assetId === `depth:surface:${roomLabel}:floor`,
    );
    if (floorAsset !== undefined) {
      ids.push(floorAsset.contentId);
    }
    if (overview !== null) {
      ids.push(overview);
    }
    return ids;
  }
  if (node.kind === "opening") {
    if (overview !== null) {
      ids.push(overview);
    }
    return ids;
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Assurance / verification projections (the caller's honest fold)      */
/* ------------------------------------------------------------------ */

function subjectUniverseNodeIds(scenario: LabScenario, version: GraphVersion): readonly string[] {
  const hierarchy = new Set(hierarchyNodeIds(scenario));
  return version.nodes.filter((node) => !hierarchy.has(node.nodeId)).map((node) => node.nodeId);
}

function sigmaForProperty(
  scenario: LabScenario,
  measurements: readonly LabMeasurementRecord[],
  nodeId: string,
  key: string,
): number | null {
  if (key === "room.width" || key === "room.depth" || key === "room.height") {
    return measurements.find((m) => m.nodeId === nodeId && m.propertyKey === key)?.sigmaM ?? null;
  }
  if (key === "defect.width" && scenario.defect !== null) {
    return scenario.defect.defectWidthSigmaM;
  }
  return null;
}

/** The honest evidence-fact fold: records + reality-object provenance links. */
async function evidenceFactsOf(world: LabWorld): Promise<readonly EvidenceFact[]> {
  const records = await world.evidenceStore.listEvidenceRecords();
  const links = await world.evidenceStore.listLinks();
  const linkedByEvidence = new Map<string, string[]>();
  for (const link of links) {
    if (link.subjectKind !== "reality_object") {
      continue;
    }
    const bucket = linkedByEvidence.get(link.evidenceContentId) ?? [];
    bucket.push(link.subjectId);
    linkedByEvidence.set(link.evidenceContentId, bucket);
  }
  return records.map((record) => ({
    evidenceId: record.contentId,
    method: record.acquisitionMethod,
    invalidated: false,
    linkedNodeIds: linkedByEvidence.get(record.contentId) ?? [],
  }));
}

/** Build the assurance EvaluationInput (the subject-universe projection). */
async function assuranceInput(
  scenario: LabScenario,
  version: GraphVersion,
  world: LabWorld,
  measurements: readonly LabMeasurementRecord[],
): Promise<EvaluationInput> {
  const facts = await evidenceFactsOf(world);
  const subjectIds = new Set(subjectUniverseNodeIds(scenario, version));
  const nodes: NodeFact[] = version.nodes
    .filter((node) => subjectIds.has(node.nodeId))
    .map((node) => ({
      nodeId: node.nodeId,
      properties: node.properties.map<PropertyFact>((property) => {
        const sigma = sigmaForProperty(scenario, measurements, node.nodeId, property.key);
        return {
          key: property.key,
          value: property.value,
          ...(property.unit !== undefined ? { unit: property.unit } : {}),
          epistemicStatus: property.epistemicStatus,
          ...(sigma !== null
            ? {
                uncertainty: {
                  sigma,
                  basis: "lab σ projection (device σ / extractor composition)",
                },
              }
            : {}),
        };
      }),
    }));
  return {
    profile: getAssuranceProfile(scenario.mission.assuranceProfileId)!,
    graphSnapshot: { nodes },
    evidence: facts,
  };
}

/** Build the verification VerificationInput (full graph, σ projected). */
async function verificationInput(
  scenario: LabScenario,
  version: GraphVersion,
  world: LabWorld,
  assurance: LabAssuranceRecord,
  measurements: readonly LabMeasurementRecord[],
): Promise<VerificationInput> {
  const facts = await evidenceFactsOf(world);
  const nodes: VerificationNode[] = version.nodes.map((node) => ({
    ...node,
    properties: node.properties.map<VerificationProperty>((property) => {
      const sigma = sigmaForProperty(scenario, measurements, node.nodeId, property.key);
      return {
        ...property,
        ...(sigma !== null ? { uncertainty: { sigma, basis: "lab σ projection" } } : {}),
      };
    }),
  }));
  return {
    graphSnapshot: { nodes, relationships: version.relationships },
    evidenceFacts: facts,
    assuranceReport: assurance.report,
  };
}

/** The BOQ mapping snapshot (spacePath breadcrumbs from the version). */
function mappingSnapshot(
  scenario: LabScenario,
  version: GraphVersion,
): Parameters<MappingService["runMatcher"]>[1] {
  const hierarchy = hierarchyNodeIds(scenario);
  const projectId = hierarchy[0]!;
  const siteId = hierarchy[1]!;
  const buildingId = hierarchy[2]!;
  const storeyId = hierarchy[3]!;
  const roomByElement = new Map<string, string>();
  for (const surface of scenario.surfaces) {
    roomByElement.set(elementNodeId(surface.surfaceId), surface.roomLabel);
  }
  const roomDisplay = new Map(scenario.rooms.map((room) => [room.label, room] as const));
  const nodes = version.nodes.map((node) => {
    let spacePath: string[];
    if (node.nodeId === projectId) {
      spacePath = [scenario.projectId];
    } else if (node.nodeId === siteId) {
      spacePath = [scenario.siteLabel];
    } else if (node.nodeId === buildingId) {
      spacePath = [scenario.siteLabel, scenario.buildingLabel];
    } else if (node.nodeId === storeyId) {
      spacePath = [scenario.siteLabel, scenario.buildingLabel, scenario.storeyLabel];
    } else if (node.kind === "space") {
      const label = node.properties.find((property) => property.key === "label")?.value;
      spacePath = [
        scenario.siteLabel,
        scenario.buildingLabel,
        scenario.storeyLabel,
        String(label ?? node.nodeId),
      ];
    } else {
      const roomLabel = roomByElement.get(node.nodeId);
      const display = roomLabel !== undefined ? (roomDisplay.get(roomLabel)?.label ?? roomLabel) : null;
      spacePath = [
        scenario.siteLabel,
        scenario.buildingLabel,
        scenario.storeyLabel,
        display ?? scenario.storeyLabel,
      ];
    }
    return {
      nodeId: node.nodeId,
      kind: node.kind,
      properties: node.properties.map((property) => ({ key: property.key, value: property.value })),
      spacePath,
      nodeVersionId: version.versionId,
    };
  });
  return { nodes };
}

/* ------------------------------------------------------------------ */
/* Convenience readers for tests (real records, no recompute)           */
/* ------------------------------------------------------------------ */

export async function artifactOf(
  world: LabWorld,
  artifactId: string,
): Promise<CandidateArtifact | null> {
  return world.orchestrator.getArtifact(artifactId);
}

export async function jobOf(world: LabWorld, jobId: string): Promise<JobRecord | null> {
  return world.orchestrator.getJob(jobId);
}

export async function versionOf(
  world: LabWorld,
  projectId: string,
  versionId?: string,
): Promise<GraphVersion | null> {
  return world.realityStore.getVersion(projectId, versionId);
}

export async function gapAnalysisOf(
  world: LabWorld,
  analysisId: string,
): Promise<GapAnalysisRecord | null> {
  return world.gapService.getAnalysis(analysisId);
}
