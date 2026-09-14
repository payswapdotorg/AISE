/**
 * HTTP request handling for the AISE backend API.
 *
 * Contract (AISE-001 health/readiness plumbing; AISE-004 capture ingestion;
 * AISE-007 mission planning; AISE-008 evidence/source service; AISE-011 BOQ
 * ingestion; AISE-010 reconstruction orchestration):
 *
 *   GET  /healthz  -> 200 {"ok":true,"service":"aise-api","version":"<pkg version>"}
 *   GET  /readyz   -> 200 when the environment (config) is valid, 503 otherwise
 *   POST /v1/capture/assets/:contentId  -> raw content-addressed asset upload
 *   POST /v1/capture/sync               -> SyncBatch ingestion, SyncAck reply
 *   GET  /v1/capture/sessions/:sessionId -> stored session projection
 *   POST /v1/missions/plan              -> adaptive capture mission planning
 *   GET  /v1/missions/:missionId        -> stored mission + revision history
 *   GET  /v1/missions                   -> mission list projection
 *   POST /v1/evidence                     -> register immutable evidence (AISE-008)
 *   GET  /v1/evidence?includeInvalidated  -> list registered evidence
 *   GET  /v1/evidence/:contentId          -> full evidence read view
 *   POST /v1/evidence/:contentId/invalidation -> append an invalidation
 *   POST /v1/evidence/provenance-links    -> append a provenance link
 *   POST /v1/evidence/derivations         -> record a derivation
 *   POST /v1/boq/imports                 -> BOQ source upload (AISE-011)
 *   GET  /v1/boq/imports[/:id[/source]]  -> BOQ import list/detail/source
 *   POST|GET /v1/boq/imports/:id/normalization -> derived BOQ normalization
 *                                        view (AISE-014) — explicit
 *                                        interpretations, source untouched
 *   POST /v1/reconstruction/jobs         -> create reconstruction job (AISE-010)
 *   GET  /v1/reconstruction/jobs[/:id]   -> job list / full job record
 *   POST /v1/reconstruction/jobs/:id/run -> synchronous run-to-completion
 *   GET  /v1/reconstruction/artifacts/:id -> candidate artifact + provenance
 *   POST /v1/reality/projects            -> create project graph (AISE-016)
 *   GET  /v1/reality/projects/:id        -> project header + version list
 *   GET  /v1/reality/projects/:id/versions/:versionId|latest -> full snapshot
 *   POST /v1/reality/projects/:id/changes -> apply change set -> new version
 *   GET  /v1/reality/projects/:id/nodes/:nodeId -> node history (AISE-016)
 *   POST /v1/cases                          -> create engineering case (AISE-025)
 *   GET  /v1/cases[/:id]                     -> case list / full case record
 *   POST /v1/cases/:id/(observations|hypotheses|missing-evidence|review|resolve)
 *   POST /v1/cases/:id/missing-evidence/:missingId/(collect|waive)
 *                                            -> structured case lifecycle
 *   POST /v1/interventions                   -> create scenario pinned to a reality
 *                                            baseline version (AISE-026)
 *   GET  /v1/interventions[/:id]             -> scenario list / full record
 *   POST /v1/interventions/:id/steps         -> append step + next state layer
 *   GET  /v1/interventions/:id/states/:index|latest -> materialized state
 *   POST /v1/interventions/:id/approval-reference  -> record Case review ref
 *   POST /v1/interventions/:id/status        -> governed status machine
 *   POST /v1/executions                      -> record execution of an
 *                                            APPROVED intervention scenario
 *                                            state + execution evidence
 *                                            (AISE-031)
 *   GET  /v1/executions[/:id]                -> execution list / full record
 *   POST /v1/executions/:id/outcomes         -> record OBSERVED post-work
 *                                            outcome observation
 *   GET  /v1/executions/lineage/:caseId      -> verified issue→outcome
 *                                            lineage (every hop checked)
 *   GET  /v1/executions/states/:scenarioId/:stateId -> derived PROPOSED|
 *                                            EXECUTED state execution view
 *
 * The capture routes are implemented by `capture/router.ts` over the
 * `capture/gateway.ts` policy engine and an injected `CaptureStore`; the
 * missions routes are implemented by `missions/router.ts` over the pure
 * `missions/planner.ts` policy engine and an injected `MissionStore`; the
 * evidence routes by `evidence/router.ts` over `evidence/service.ts` and an
 * injected (or lazily-constructed) `EvidenceService`; the BOQ routes by
 * `boq/router.ts` over `boq/service.ts` and a file-system store; the
 * reconstruction routes by `reconstruction/router.ts` over the deterministic
 * `reconstruction/orchestrator.ts` lifecycle engine; the reality routes by
 * `reality/router.ts` over the canonical `reality/versioning.ts` append-only
 * engine and an injected (or lazily-constructed) `RealityStore`; the case
 * routes by `cases/router.ts` over the `cases/service.ts` policy engine and
 * an injected (or lazily-constructed) case store; the intervention routes
 * by `intervention/router.ts` over the `intervention/service.ts`
 * deterministic state engine, an injected (or lazily-constructed)
 * intervention store and a READ-ONLY baseline resolver over the reality
 * store. This module owns ONLY routing dispatch and the request/response
 * envelope.
 *
 * Every response carries an `x-request-id` correlation header: the request's
 * own `x-request-id` when provided, otherwise a generated UUID. Every request
 * is logged through the structured logger with its correlation id.
 */

import { validateEnv, type EnvSource } from "./lib/config";
import { jsonResponse, methodNotAllowed } from "./lib/http";
import type { Logger } from "./lib/log";
import { handleCaptureRequest } from "./capture/router";
import type { CaptureGateway } from "./capture/gateway";
import {
  createDefaultMissionsRouting,
  handleMissionsRequest,
  type MissionsRouteOptions,
} from "./missions/router";
import { handleEvidenceRequest } from "./evidence/router";
import { createEvidenceService, type EvidenceService } from "./evidence/service";
import { FsEvidenceStore } from "./evidence/store";
import { handleBoqRequest, type BoqRouteOptions } from "./boq/router";
import { NormalizationService } from "./boq/normalization/service";
import { FsNormalizationStore } from "./boq/normalization/store";
import { BoqService } from "./boq/service";
import { FsBoqStore } from "./boq/store";
import {
  handleReconstructionRequest,
  type ReconstructionRouteOptions,
} from "./reconstruction/router";
import {
  createReconstructionOrchestrator,
  type ReconstructionOrchestrator,
} from "./reconstruction/orchestrator";
import { FsArtifactStore, FsJobStore } from "./reconstruction/store";
// AISE-012: default reconstruction engine adapters (WorldSculpt + depth/LiDAR fusion).
import { createDefaultAiseProviders } from "./reconstruction/adapters";
// AISE-016 routing: Reality Graph v2 — the canonical engineering-model
// authority surface (reality/router.ts over the deterministic versioning
// engine and an injected store).
import { handleRealityRequest, type RealityRouteOptions } from "./reality/router";
import { FsRealityStore } from "./reality/store";
// AISE-025 routing: Engineering Case surface — the structured
// issue→observation/hypothesis/missing-evidence/review domain
// (cases/router.ts over cases/service.ts and an injected store).
import { handleCasesRequest, type CasesRouteOptions } from "./cases/router";
import { CaseService } from "./cases/service";
import { FsCaseStore } from "./cases/store";
// AISE-026 routing: Intervention Studio surface — proposed scenario/step/
// state layers materialized deterministically from a PINNED reality
// baseline version (intervention/router.ts over intervention/service.ts,
// an injected store and a READ-ONLY baseline resolver). The baseline
// resolver below adapts the reality store by calling its READ method
// `getVersion` and NOTHING else: there is no write path from the
// intervention module into observed reality (proposal isolation).
import {
  handleInterventionRequest,
  type InterventionRouteOptions,
} from "./intervention/router";
import { InterventionService, type BaselineResolver } from "./intervention/service";
import { FsInterventionStore } from "./intervention/store";
import type { RealityStore } from "./reality/store";
// AISE-031 routing: Execution/Outcome loop surface — post-work execution
// records over APPROVED intervention scenarios, outcome observations and
// the issue→outcome lineage query (execution/router.ts over
// execution/service.ts, an injected store and three READ-ONLY reference
// resolvers: intervention scenario context, case context and evidence
// membership). The adapters below call the owning services'/store's READ
// methods (`getScenario`, `getCase`, `getEvidenceRecord`) and NOTHING
// else: there is no write path from the execution domain into the case,
// intervention or evidence authorities, and the intervention module's own
// records are never mutated by it (the PROPOSED→EXECUTED state transition
// is recorded in the execution domain only).
import { handleExecutionRequest, type ExecutionRouteOptions } from "./execution/router";
import {
  ExecutionService,
  readOnlyCaseContextResolver,
  readOnlyEvidenceMembershipResolver,
  readOnlyInterventionContextResolver,
} from "./execution/service";
import { FsExecutionStore } from "./execution/store";

export const SERVICE_NAME = "aise-api";

export interface HandlerOptions {
  /** Live environment source, re-checked on every /readyz call. */
  envSource: EnvSource;
  /** Service version, sourced from the package manifest. */
  version: string;
  /** Structured logger used for request/error events. */
  logger: Logger;
  /** Capture ingestion gateway (AISE-004). */
  capture: CaptureGateway;
  /**
   * Mission planning surface (AISE-007). Optional: when absent a default
   * wiring is constructed once per handler (file-system store under the
   * configured data dir, in-memory fallback when the environment does not
   * resolve) — explicit construction wins, mirroring the capture wiring.
   */
  missions?: MissionsRouteOptions;
  // AISE-008 routing: injected evidence/source service. When omitted, a
  // default service over the FsEvidenceStore rooted at the configured data
  // directory (AISE_DATA_DIR, default ./data) is constructed lazily on the
  // FIRST evidence request. Wiring the optional content-pinning resolver
  // requires the capture STORE instance (owned by main.ts), so callers that
  // hold one inject a fully-configured service here instead.
  evidence?: EvidenceService;
  /** BOQ ingestion + derived normalization routes (AISE-011 + AISE-014);
   *  defaults to file-system stores rooted at the live environment's
   *  dataDir when not injected. */
  boq?: BoqRouteOptions;
  // AISE-010 routing: injected reconstruction orchestration surface. When
  // omitted, a default orchestrator over the FsJobStore + FsArtifactStore
  // rooted at the configured data directory (AISE_DATA_DIR, default ./data)
  // is constructed lazily on the FIRST reconstruction request. AISE-012: the
  // default provider list now ships the engine adapters — depth/LiDAR fusion
  // (deterministic in-process backend, READY) and WorldSculpt (registered but
  // ACCESS_REQUIRED until a backend is configured). Real engine wiring
  // injects a fully-configured orchestrator (or providers) here.
  reconstruction?: ReconstructionRouteOptions;
  // AISE-016 routing: injected Reality Graph surface. When omitted, a default
  // wiring over the FsRealityStore rooted at the configured data directory
  // (AISE_DATA_DIR, default ./data) plus a UTC wall clock is constructed
  // lazily on the FIRST reality request — the graph.json/versions/ tree is
  // created per project on POST /v1/reality/projects.
  reality?: RealityRouteOptions;
  // AISE-025 routing: injected Engineering Case surface. When omitted, a
  // default CaseService over the FsCaseStore rooted at the configured data
  // directory (AISE_DATA_DIR, default ./data) plus a UTC wall clock is
  // constructed lazily on the FIRST case request (see casesRoutesOrDefault).
  cases?: CasesRouteOptions;
  // AISE-026 routing: injected Intervention Studio surface. When omitted, a
  // default InterventionService over the FsInterventionStore rooted at the
  // configured data directory (AISE_DATA_DIR, default ./data), a UTC wall
  // clock and a READ-ONLY baseline resolver over the FsRealityStore (same
  // data dir; resolves ONLY the pinned baseline version id) is constructed
  // lazily on the FIRST intervention request (see interventionRoutesOrDefault).
  interventions?: InterventionRouteOptions;
  // AISE-031 routing: injected Execution/Outcome surface. When omitted, a
  // default ExecutionService over the FsExecutionStore rooted at the
  // configured data directory (AISE_DATA_DIR, default ./data), a UTC wall
  // clock and READ-ONLY resolvers over the DEFAULT intervention/case wiring
  // and the FsEvidenceStore (same data dir) is constructed lazily on the
  // FIRST execution request (see executionRoutesOrDefault).
  executions?: ExecutionRouteOptions;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// AISE-011: memoized default BOQ routing (see HandlerOptions.boq).
let defaultBoqRoutes: BoqRouteOptions | null = null;

function boqRoutesOrDefault(options: HandlerOptions): BoqRouteOptions {
  if (options.boq !== undefined) {
    return options.boq;
  }
  if (defaultBoqRoutes === null) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    const service = new BoqService({
      store: new FsBoqStore(dataDir),
      clock: () => new Date().toISOString(),
    });
    defaultBoqRoutes = {
      service,
      logger: options.logger,
      // AISE-014: derived normalization surface over the SAME data dir —
      // content-addressed derived views under boq/normalizations/. The
      // normalization service reads the parsed documents through the
      // ingestion service (read-only); the source BOQ is never mutated.
      normalization: new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: () => new Date().toISOString(),
        boq: service,
      }),
    };
  }
  return defaultBoqRoutes;
}

// AISE-025 routing: memoized default Engineering Case routing (see
// HandlerOptions.cases) — same lazy discipline as the BOQ wiring: resolved
// only inside the /v1/cases path guard, so deployments without case traffic
// never construct the store.
let defaultCasesRoutes: CasesRouteOptions | null = null;

function casesRoutesOrDefault(options: HandlerOptions): CasesRouteOptions {
  if (options.cases !== undefined) {
    return options.cases;
  }
  if (defaultCasesRoutes === null) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    defaultCasesRoutes = {
      service: new CaseService({
        store: new FsCaseStore(dataDir),
        clock: (): string => new Date().toISOString(),
      }),
      logger: options.logger,
    };
  }
  return defaultCasesRoutes;
}

// AISE-026 routing: memoized default Intervention Studio routing (see
// HandlerOptions.interventions) — same lazy discipline as the case wiring:
// resolved only inside the /v1/interventions path guard, so deployments
// without intervention traffic never construct the store. PROPOSAL
// ISOLATION: the default baseline resolver is READ-ONLY BY CONSTRUCTION —
// it calls the reality store's read method `getVersion` for the PINNED
// version id and nothing else; no code path from here can write reality.
let defaultInterventionRoutes: InterventionRouteOptions | null = null;

/** Read-only baseline resolution over a reality store (reads only). */
function readOnlyBaselineResolver(store: RealityStore): BaselineResolver {
  return {
    resolveBaseline: (projectId: string, versionId: string) =>
      store.getVersion(projectId, versionId),
  };
}

function interventionRoutesOrDefault(options: HandlerOptions): InterventionRouteOptions {
  if (options.interventions !== undefined) {
    return options.interventions;
  }
  if (defaultInterventionRoutes === null) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    defaultInterventionRoutes = {
      service: new InterventionService({
        store: new FsInterventionStore(dataDir),
        clock: (): string => new Date().toISOString(),
        baselineResolver: readOnlyBaselineResolver(new FsRealityStore(dataDir)),
      }),
      logger: options.logger,
    };
  }
  return defaultInterventionRoutes;
}

// AISE-031 routing: memoized default Execution/Outcome routing (see
// HandlerOptions.executions) — same lazy discipline as the case/intervention
// wiring: resolved only inside the /v1/executions path guard, so deployments
// without execution traffic never construct the store. The three reference
// resolvers are READ-ONLY BY CONSTRUCTION and resolved over THIS handler's
// configured data dir (never through a shared memoized sibling wiring, so
// two handlers over different data dirs can never leak each other's
// authorities): each adapts a PRIVATE service/store instance whose only
// reachable member is the READ method the adapter calls — intervention
// scenario context via `getScenario` (AISE-026 authority; the baseline
// resolver handed to that instance is the same read-only `readOnlyBaselineResolver`
// over this data dir, reusing the AISE-026 helper), case context via `getCase`
// (AISE-025 authority) and evidence membership via the evidence store's
// `getEvidenceRecord` READ method (evidence records are immutable write-once
// files, so a read-only second instance is safe by the same argument as the
// intervention baseline resolver). No code path from here can write the
// intervention, case or evidence authorities — the resolver interfaces
// expose exactly one READ method each and the instances behind them are
// never exported.
let defaultExecutionRoutes: ExecutionRouteOptions | null = null;

function executionRoutesOrDefault(options: HandlerOptions): ExecutionRouteOptions {
  if (options.executions !== undefined) {
    return options.executions;
  }
  if (defaultExecutionRoutes === null) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    const wallClock = (): string => new Date().toISOString();
    defaultExecutionRoutes = {
      service: new ExecutionService({
        store: new FsExecutionStore(dataDir),
        clock: wallClock,
        interventionContextResolver: readOnlyInterventionContextResolver(
          new InterventionService({
            store: new FsInterventionStore(dataDir),
            clock: wallClock,
            baselineResolver: readOnlyBaselineResolver(new FsRealityStore(dataDir)),
          }),
        ),
        caseContextResolver: readOnlyCaseContextResolver(
          new CaseService({ store: new FsCaseStore(dataDir), clock: wallClock }),
        ),
        evidenceMembershipResolver: readOnlyEvidenceMembershipResolver(
          new FsEvidenceStore(dataDir),
        ),
      }),
      logger: options.logger,
    };
  }
  return defaultExecutionRoutes;
}

async function route(
  request: Request,
  url: URL,
  requestId: string,
  options: HandlerOptions,
  missions: () => MissionsRouteOptions,
  evidenceService: () => EvidenceService,
  reconstructionRoutes: () => ReconstructionRouteOptions,
  realityRoutes: () => RealityRouteOptions,
): Promise<Response> {
  if (url.pathname === "/healthz") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    return jsonResponse(
      200,
      { ok: true, service: SERVICE_NAME, version: options.version },
      requestId,
    );
  }

  if (url.pathname === "/readyz") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const result = validateEnv(options.envSource());
    if (result.ok) {
      return jsonResponse(200, { ok: true }, requestId);
    }
    return jsonResponse(503, { ok: false, issues: result.issues }, requestId);
  }

  const captureResponse = await handleCaptureRequest(request, url, requestId, {
    gateway: options.capture,
    logger: options.logger,
  });
  if (captureResponse !== null) {
    return captureResponse;
  }

  // AISE-007 routing
  const missionsResponse = await handleMissionsRequest(request, url, requestId, missions());
  if (missionsResponse !== null) {
    return missionsResponse;
  }

  // AISE-008 routing: evidence/source surface — one delegation point after
  // the missions block. `handleEvidenceRequest` resolves the lazy default
  // service ONLY when the path is an evidence route, so deployments without
  // evidence traffic never touch the filesystem.
  const evidenceResponse = await handleEvidenceRequest(request, url, requestId, {
    service: options.evidence ?? evidenceService,
    logger: options.logger,
  });
  if (evidenceResponse !== null) {
    return evidenceResponse;
  }

  // AISE-011 routing — delegates to the BOQ ingestion surface. When no
  // options are injected, a service is constructed from the LIVE
  // environment's dataDir (AISE_DATA_DIR, default ./data) — the same
  // configuration source the capture gateway uses — and memoized so only
  // one store instance exists per process. The path guard keeps the lazy
  // store construction off non-BOQ requests entirely.
  if (url.pathname === "/v1/boq" || url.pathname.startsWith("/v1/boq/")) {
    const boqResponse = await handleBoqRequest(request, url, requestId, boqRoutesOrDefault(options));
    if (boqResponse !== null) {
      return boqResponse;
    }
  }

  // AISE-010 routing — delegates to the reconstruction orchestration surface.
  // The path guard keeps the lazily-constructed default wiring (empty provider
  // list — see HandlerOptions.reconstruction) entirely off non-reconstruction
  // requests.
  if (url.pathname === "/v1/reconstruction" || url.pathname.startsWith("/v1/reconstruction/")) {
    const reconstructionResponse = await handleReconstructionRequest(
      request,
      url,
      requestId,
      reconstructionRoutes(),
    );
    if (reconstructionResponse !== null) {
      return reconstructionResponse;
    }
  }

  // AISE-016 routing — delegates to the Reality Graph surface (the canonical
  // engineering-model authority). The path guard keeps the lazily-constructed
  // default store construction entirely off non-reality requests.
  if (url.pathname === "/v1/reality" || url.pathname.startsWith("/v1/reality/")) {
    const realityResponse = await handleRealityRequest(
      request,
      url,
      requestId,
      realityRoutes(),
    );
    if (realityResponse !== null) {
      return realityResponse;
    }
  }

  // AISE-025 routing — delegates to the Engineering Case surface (structured
  // issue → observations/hypotheses/missing-evidence/review, epistemically
  // separated). The path guard keeps the lazily-constructed default service
  // (FsCaseStore under the configured data dir) entirely off non-case requests.
  if (url.pathname === "/v1/cases" || url.pathname.startsWith("/v1/cases/")) {
    const casesResponse = await handleCasesRequest(
      request,
      url,
      requestId,
      casesRoutesOrDefault(options),
    );
    if (casesResponse !== null) {
      return casesResponse;
    }
  }

  // AISE-026 routing — delegates to the Intervention Studio surface
  // (proposed scenario states materialized deterministically from a PINNED
  // reality baseline). The path guard keeps the lazily-constructed default
  // service (FsInterventionStore + read-only baseline resolver under the
  // configured data dir) entirely off non-intervention requests.
  if (
    url.pathname === "/v1/interventions" ||
    url.pathname.startsWith("/v1/interventions/")
  ) {
    const interventionResponse = await handleInterventionRequest(
      request,
      url,
      requestId,
      interventionRoutesOrDefault(options),
    );
    if (interventionResponse !== null) {
      return interventionResponse;
    }
  }

  // AISE-031 routing — delegates to the Execution/Outcome surface
  // (post-work execution records over APPROVED interventions, outcome
  // observations and the verified issue→outcome lineage). The path guard
  // keeps the lazily-constructed default service (FsExecutionStore + the
  // three read-only reference resolvers under the configured data dir)
  // entirely off non-execution requests.
  if (url.pathname === "/v1/executions" || url.pathname.startsWith("/v1/executions/")) {
    const executionResponse = await handleExecutionRequest(
      request,
      url,
      requestId,
      executionRoutesOrDefault(options),
    );
    if (executionResponse !== null) {
      return executionResponse;
    }
  }

  return jsonResponse(404, { ok: false, error: "not_found" }, requestId);
}

/** Create the API request handler (pure — no server binding). */
export function createRequestHandler(
  options: HandlerOptions,
): (request: Request) => Promise<Response> {
  // AISE-007: resolve the missions wiring lazily, at most once per handler.
  // Explicit options win; otherwise the default (FsMissionStore under the
  // configured data dir, in-memory fallback) is built from the handler's
  // environment source on the first missions request — handlers that never
  // touch the missions surface perform no store construction at all.
  let missionsRouting: MissionsRouteOptions | null = options.missions ?? null;
  const missions = (): MissionsRouteOptions => {
    missionsRouting ??= createDefaultMissionsRouting(options);
    return missionsRouting;
  };

  // AISE-008 routing: lazily-constructed default evidence service, memoized
  // per handler (see HandlerOptions.evidence). Mirrors the capture wiring in
  // main.ts: FsEvidenceStore over the configured data directory plus a UTC
  // wall clock; the pinning resolver stays optional until the caller can
  // provide the capture store.
  let defaultEvidence: EvidenceService | undefined;
  const evidenceService = (): EvidenceService => {
    if (defaultEvidence === undefined) {
      const result = validateEnv(options.envSource());
      defaultEvidence = createEvidenceService({
        store: new FsEvidenceStore(result.ok ? result.config.dataDir : "./data"),
        clock: (): string => new Date().toISOString(),
      });
    }
    return defaultEvidence;
  };

  // AISE-010 routing: lazily-constructed default reconstruction surface,
  // memoized per handler (see HandlerOptions.reconstruction). Mirrors the
  // evidence wiring: file-system stores over the configured data directory,
  // wall clock and random ids for production; tests inject fixed clock/ids.
  // AISE-012: the default providers are the shipped engine adapters —
  // depth/LiDAR fusion first (deterministic backend, honestly READY: real
  // local computation), then WorldSculpt (no backend configured in a default
  // deployment — no endpoint, weights or credentials — so it is registered
  // but honestly ACCESS_REQUIRED, never selectable until configured). No
  // evidence-bytes reader is wired by default (source bytes live in the
  // capture store owned by main.ts): depth jobs therefore fail explicitly
  // INPUT_INCOMPATIBLE naming the evidence ids until a deployment injects a
  // reader via createDefaultAiseProviders.
  let defaultReconstruction: ReconstructionRouteOptions | undefined;
  const reconstructionRoutes = (): ReconstructionRouteOptions => {
    if (options.reconstruction !== undefined) {
      return options.reconstruction;
    }
    if (defaultReconstruction === undefined) {
      const result = validateEnv(options.envSource());
      const dataDir = result.ok ? result.config.dataDir : "./data";
      const orchestrator: ReconstructionOrchestrator = createReconstructionOrchestrator({
        // AISE-012: default engine adapters (see createDefaultAiseProviders).
        providers: createDefaultAiseProviders(),
        jobStore: new FsJobStore(dataDir),
        artifactStore: new FsArtifactStore(dataDir),
        clock: (): string => new Date().toISOString(),
        idFactory: (): string => crypto.randomUUID(),
      });
      defaultReconstruction = { orchestrator, logger: options.logger };
    }
    return defaultReconstruction;
  };

  // AISE-016 routing: lazily-constructed default Reality Graph surface,
  // memoized per handler (see HandlerOptions.reality). Mirrors the evidence
  // wiring: FsRealityStore over the configured data directory (per-project
  // reality/<sha256(projectId)>/ trees) plus a UTC wall clock; tests inject
  // fixed clock/store for deterministic version bytes.
  let defaultReality: RealityRouteOptions | undefined;
  const realityRoutes = (): RealityRouteOptions => {
    if (options.reality !== undefined) {
      return options.reality;
    }
    if (defaultReality === undefined) {
      const result = validateEnv(options.envSource());
      const dataDir = result.ok ? result.config.dataDir : "./data";
      defaultReality = {
        store: new FsRealityStore(dataDir),
        clock: (): string => new Date().toISOString(),
        logger: options.logger,
      };
    }
    return defaultReality;
  };

  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;
    try {
      response = await route(
        request,
        url,
        requestId,
        options,
        missions,
        evidenceService,
        reconstructionRoutes,
        realityRoutes,
      );
    } catch (error) {
      options.logger.error("request handler error", {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      response = jsonResponse(500, { ok: false, error: "internal_error" }, requestId);
    }
    options.logger.info("http_request", {
      requestId,
      method: request.method,
      path: url.pathname,
      status: response.status,
    });
    return response;
  };
}
