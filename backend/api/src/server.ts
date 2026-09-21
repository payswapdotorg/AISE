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
 *   POST /v1/identity/principals         -> register a principal (AISE-036)
 *   POST /v1/identity/organizations      -> create organization (+ founder
 *                                            bootstrap grant)
 *   POST /v1/identity/authorize          -> typed authorization decision
 *                                            (allowed | distinct typed
 *                                            refusal; audit-logged)
 *   GET  /v1/identity/organizations/:id  -> org record / projects / roles /
 *   POST /v1/identity/organizations/:id/(projects|roles|memberships|retention)
 *   POST /v1/identity/organizations/:id/memberships/:membershipId/revoke
 *   POST /v1/identity/organizations/:id/retention/enforce
 *   GET  /v1/identity/organizations/:id/audit -> query the append-only
 *                                            audit log (filters projectId,
 *                                            actor; retention-annotated)
 *   POST /v1/comparisons                -> run one reality-vs-design
 *                                            comparison (AISE-032): a pinned
 *                                            Reality Graph version vs an
 *                                            imported design reference;
 *                                            evidence-linked discrepancies,
 *                                            uncertainty-aware statuses
 *   GET  /v1/comparisons[/:id]          -> comparison list / full derived
 *                                            record (neither source altered)
 *   POST /v1/gaps                       -> run one adaptive evidence-gap
 *                                            analysis (AISE-018): a pinned
 *                                            Reality Graph version + the
 *                                            governing assurance profile +
 *                                            the evidence graph state →
 *                                            derived evidence gaps and
 *                                            RANKED next-observation
 *                                            candidates (task impact,
 *                                            expected uncertainty
 *                                            reduction, operator effort,
 *                                            recoverability); the
 *                                            readiness authority's report
 *                                            is consumed verbatim and
 *                                            never mutated
 *   GET  /v1/gaps[/:id]                 -> analysis list / full derived
 *                                            record (append-only; the
 *                                            readiness report carried as
 *                                            consumed context)
 *   POST /v1/adoption/workflows         -> inventory one incumbent
 *                                            workflow (AISE-041): typed
 *                                            per-step attributes (systems
 *                                            of record BY ID, resources,
 *                                            user roles, manual re-entry,
 *                                            approvals, irreversibility,
 *                                            training burden, latency,
 *                                            rollback, contractual
 *                                            constraints — each a known
 *                                            value or the explicit UNKNOWN
 *                                            marker); the profiler NEVER
 *                                            migrates anything
 *   GET  /v1/adoption/workflows[/:id]    -> inventory list / full record
 *   POST /v1/adoption/workflows/:id/steps -> append one step (never removed)
 *   POST /v1/adoption/workflows/:id/assessments -> run the switching-friction
 *                                            profiler: integration
 *                                            readiness + switching
 *                                            friction (explicit weights,
 *                                            inspectable components,
 *                                            UNKNOWN-honest null
 *                                            composites) + ranked
 *                                            replacement-opportunity steps
 *   GET  /v1/adoption/assessments[/:id] -> assessment list / full derived
 *                                            record (write-once)
 *   POST /v1/adoption/candidates         -> propose a migration candidate
 *                                            (governed lifecycle, state
 *                                            `proposed`)
 *   GET  /v1/adoption/candidates[/:id]   -> candidate list / full record
 *   POST /v1/adoption/candidates/:id/rollback-plans[/:planId/retire]
 *                                        -> record / retire rollback plans
 *                                            (retiring before operational
 *                                            acceptance is a typed refusal)
 *   POST /v1/adoption/candidates/:id/(equivalence|acceptance)
 *                                        -> record semantic-equivalence
 *                                            evidence and operational
 *                                            acceptance (the `replaced`
 *                                            prerequisites)
 *   POST /v1/adoption/candidates/:id/(advance|rollback)
 *                                        -> the governed state machine:
 *                                            progressive one-step advances,
 *                                            `replaced` ONLY with
 *                                            equivalence + acceptance +
 *                                            active rollback plan; the
 *                                            recorded reverse transition
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
 *   POST /v1/impacts                        -> compute + persist the
 *                                            quantities/cost impact report
 *                                            of a proposed scenario state
 *                                            layer vs its baseline overlay,
 *                                            mapped to BOQ items (AISE-028)
 *   GET  /v1/impacts[/:id]                  -> impact list / full record
 *   GET  /v1/sdk                          -> AISE-038 developer API discovery
 *                                            document: the versioned contract
 *                                            surface (six work-order domains'
 *                                            stable operations, scopes,
 *                                            idempotency classes, error-code
 *                                            registries, honest out-of-scope
 *                                            disclosure), apiVersion-stamped
 *   GET  /v1/sdk/contract                 -> the full machine-readable AISE-038
 *                                            contract (operation registry +
 *                                            additions-only version registry)
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
// AISE-036 routing: enterprise identity surface — the organization/project/
// role/permission/retention/audit policy AUTHORITY (identity/router.ts over
// identity/service.ts and an injected store). AUTHN BOUNDARY: this surface
// takes acting principal ids EXPLICITLY (actor/requester); it is NOT an
// HTTP authentication middleware — request-level authentication belongs
// to deployment surfaces (documented in identity/).
import { handleIdentityRequest, type IdentityRouteOptions } from "./identity/router";
import { IdentityService } from "./identity/service";
import { FsIdentityStore } from "./identity/store";
// AISE-032 routing: reality-vs-design comparison surface — the DERIVED
// comparison authority comparing captured authoritative reality (the
// Reality Graph, consumed READ-ONLY through an injected resolver) with
// imported design references (ExternalReference source-of-record
// identity carried VERBATIM), producing evidence-linked discrepancies
// and uncertainty-aware statuses (comparison/router.ts over
// comparison/service.ts, an injected store and TWO READ-ONLY reference
// resolvers: reality version resolution and evidence membership). The
// adapters below call the owning stores'/services' READ methods
// (`getVersion`, `getEvidenceRecord`) and NOTHING else: there is no write
// path from the comparison domain into the reality or evidence
// authorities, and neither compared source is ever altered (the
// comparison record is a derived, append-only projection).
import { handleComparisonRequest, type ComparisonRouteOptions } from "./comparison/router";
import {
  ComparisonService,
  // Aliased: the AISE-031 execution block already imports the
  // evidence-membership adapter under its own name; this module's adapter
  // is a DISTINCT read-only seam over the same evidence READ method.
  readOnlyEvidenceMembershipResolver as readOnlyComparisonEvidenceMembershipResolver,
  readOnlyRealityVersionResolver,
} from "./comparison/service";
import { FsComparisonStore } from "./comparison/store";
// AISE-018 routing: adaptive evidence-gap engine surface — the DERIVED
// gap-analysis authority computing evidence gaps and ranked
// next-observation candidates (gaps/router.ts over gaps/service.ts, an
// injected store, the SINGLE readiness authority's own evaluateReadiness
// evaluator injected as a function, and THREE READ-ONLY reference
// resolvers: assurance profile resolution, reality version resolution,
// evidence graph state). The adapters below call the owning
// authorities' READ methods (`getAssuranceProfile` from the shipped
// code-defined profiles, `getVersion`, `listEvidenceRecords`/
// `getInvalidation`/`listLinks`) and NOTHING else: there is no write path
// from the gap domain into the assurance, reality or evidence
// authorities, and the readiness authority's records are never mutated
// (the analysis record is a derived, append-only projection that carries
// the consumed ReadinessReport verbatim — never a ReadinessAssessment).
import { handleGapsRequest, type GapsRouteOptions } from "./gaps/router";
import {
  GapAnalysisService,
  readOnlyAssuranceProfileResolver,
  readOnlyEvidenceGraphResolver as readOnlyGapsEvidenceGraphResolver,
  readOnlyGapRealityVersionResolver,
} from "./gaps/service";
import { FsGapAnalysisStore } from "./gaps/store";
import { getAssuranceProfile } from "./assurance/profiles";
import { evaluateReadiness } from "./assurance/evaluate";
// AISE-041 routing: workflow migration and switching-friction profiler
// surface — the adoption module (adoption/router.ts over
// adoption/service.ts, an injected store, a clock and ONE READ-ONLY
// adapter-descriptor resolver over the integrations adapter registry).
// The profiler is INVENTORY + SCORING, never migration itself: incumbent
// systems of record are referenced BY ID only (the resolver exposes
// exactly one READ method — there is no register/sync/write path from
// the adoption domain into the integrations authority, and the registry
// is never mutated by an assessment; resolved descriptors are carried
// verbatim as consumed context). The migration state machine never
// declares a step replaced without semantic equivalence, operational
// acceptance and an active rollback plan.
import { handleAdoptionRequest, type AdoptionRouteOptions } from "./adoption/router";
import {
  AdoptionService,
  readOnlyAdapterDescriptorResolver,
} from "./adoption/service";
import { FsAdoptionStore } from "./adoption/store";
import { createAdapterRegistry } from "./integrations/registry";
// PROD-006 routing: R2 artifact storage surface — content-addressed blob
// storage for BOQs, images, videos, captures and derived artifacts
// (artifacts/router.ts over artifacts/service.ts, an injected
// content-addressed blob storage port, an injected metadata store, the
// upload limits and the ArtifactAccessPredicate PORT). The artifact store
// is NEVER an evidence authority: metadata links evidence/derivation ids
// BY REFERENCE (shapes validated, existence verified nowhere on this
// surface), and the id IS the sha-256 of the bytes (the capture
// content-addressing discipline — declared ids are never trusted from the
// wire because there is nothing to declare). The default predicate
// (allowAllArtifactAccess) is the open local-dev posture of every other
// pre-auth /v1 surface; PROD-010 wires the real principal/tenant
// predicate into this port.
import { handleArtifactsRequest, type ArtifactsRouteOptions } from "./artifacts/router";
import { allowAllArtifactAccess } from "./artifacts/access";
import { ArtifactService } from "./artifacts/service";
import { maxBytesOrDefault } from "./artifacts/policy";
import { FsArtifactStorage } from "./artifacts/fs-storage";
import { FsArtifactMetadataStore } from "./artifacts/store";
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
// AISE-028 routing: intervention quantities/cost impacts surface — the
// DETERMINISTIC DERIVED PROJECTION of proposed state deltas (quantities,
// typed units, propagated uncertainty, BOQ item mappings, explicit
// caller-supplied pricing) over impact/router.ts, impact/service.ts and an
// injected store + TWO read-only resolvers (intervention scenario
// projection + BOQ mapping projection). The adapters below call the owning
// services'/stores' READ methods (`getScenario`, `getLatest`, `getImport`)
// and NOTHING else: there is no write path from the impact domain into the
// intervention or BOQ authorities, and the authoritative records are never
// mutated by it (impacts are derived projections, never authoritative).
import { handleImpactRequest, type ImpactRouteOptions } from "./impact/router";
import {
  ImpactService,
  readOnlyImpactBoqMappingResolver,
  readOnlyImpactScenarioResolver,
} from "./impact/service";
import { FsImpactStore } from "./impact/store";
import { MappingService } from "./boq/mapping/service";
import { FsMappingStore } from "./boq/mapping/store";
// AISE-038 routing: developer API/SDK contract surface — the DESCRIPTION
// layer over the EXISTING route authorities (sdk/router.ts over
// sdk/model.ts + sdk/discovery.ts). The SDK REGISTERS and DESCRIBES the
// six work-order domains' stable /v1 routes (capture, reality, BOQ, case,
// intervention, rendering projections) with typed scopes drawn verbatim
// from the AISE-036 identity permission registry, documented idempotency
// classes and error-code registries, plus typed client builders. It is a
// CONTRACT, never a second authority: it re-implements no domain logic,
// creates no second canonical model and bypasses no domain router — the
// described routes keep answering through their owning modules above.
import { handleSdkRequest, type SdkRouteOptions } from "./sdk/router";

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
  // AISE-036 routing: injected enterprise identity surface. When omitted, a
  // default IdentityService over the FsIdentityStore rooted at the
  // configured data directory (AISE_DATA_DIR, default ./data) plus a UTC
  // wall clock is constructed lazily on the FIRST identity request (see
  // identityRoutesOrDefault).
  identity?: IdentityRouteOptions;
  // AISE-032 routing: injected reality-vs-design comparison surface. When
  // omitted, a default ComparisonService over the FsComparisonStore rooted
  // at the configured data directory (AISE_DATA_DIR, default ./data), a UTC
  // wall clock and READ-ONLY resolvers over the FsRealityStore and the
  // FsEvidenceStore (same data dir) is constructed lazily on the FIRST
  // comparison request (see comparisonRoutesOrDefault).
  comparison?: ComparisonRouteOptions;
  // AISE-018 routing: injected adaptive evidence-gap surface. When
  // omitted, a default GapAnalysisService over the FsGapAnalysisStore
  // rooted at the configured data directory (AISE_DATA_DIR, default
  // ./data), a UTC wall clock, the REAL readiness authority's
  // evaluateReadiness (injected as the single authority — never
  // re-implemented) and READ-ONLY resolvers over the shipped assurance
  // profiles, the FsRealityStore and the FsEvidenceStore (same data dir)
  // is constructed lazily on the FIRST gaps request (see
  // gapsRoutesOrDefault).
  gaps?: GapsRouteOptions;
  // AISE-041 routing: injected adoption (workflow migration and
  // switching-friction profiler) surface. When omitted, a default
  // AdoptionService over the FsAdoptionStore rooted at the configured
  // data directory (AISE_DATA_DIR, default ./data), a UTC wall clock and
  // a READ-ONLY adapter-descriptor resolver over a FRESH, EMPTY integrations
  // adapter registry is constructed lazily on the FIRST adoption request
  // (see adoptionRoutesOrDefault) — the AISE-037 registry is a pure
  // in-memory library with no persistent default deployment yet (its HTTP
  // wiring was deliberately deferred), so the default wiring honestly
  // resolves zero registered adapters (connector coverage counts every
  // adapterId reference as uncovered) until a deployment injects a
  // registry-backed service here.
  adoption?: AdoptionRouteOptions;
  // PROD-006 routing: injected R2 artifact storage surface. When omitted, a
  // default ArtifactService over the FsArtifactStorage blob twin + the
  // FsArtifactMetadataStore rooted at the configured data directory
  // (AISE_DATA_DIR, default ./data), the AISE_ARTIFACT_MAX_BYTES upload cap
  // (default 25 MiB), a UTC wall clock and the open local-dev access
  // predicate is constructed lazily on the FIRST artifacts request (see
  // artifactsRoutesOrDefault). Durable R2-backed storage is wired by the
  // runtime entrypoint when the R2_* env group is present (runtime/entry.ts)
  // — the server default is honestly local-fs, and /readyz plus
  // /v1/artifacts/status always report which backend is actually serving.
  artifacts?: ArtifactsRouteOptions;
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
  // AISE-028 routing: injected impact surface. When omitted, a default
  // ImpactService over the FsImpactStore rooted at the configured data
  // directory (AISE_DATA_DIR, default ./data), a UTC wall clock and
  // READ-ONLY resolvers over PRIVATE intervention/mapping/BOQ service
  // instances (same data dir) is constructed lazily on the FIRST impact
  // request (see impactRoutesOrDefault).
  impacts?: ImpactRouteOptions;
  // AISE-038 routing: injected developer API/SDK contract surface. When
  // omitted, a default wiring over the module-level SDK_CONTRACT (the
  // frozen, load-time-validated registry) plus this handler's logger is
  // constructed lazily on the FIRST /v1/sdk request (see
  // sdkRoutesOrDefault). The SDK owns no stores — it is a pure contract
  // layer over the domain routes.
  sdk?: SdkRouteOptions;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// AISE-036 routing: memoized default identity routing (see
// HandlerOptions.identity) — same lazy discipline as the case wiring:
// resolved only inside the /v1/identity path guard, so deployments without
// identity traffic never construct the store.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultIdentityRoutesByOptions = new WeakMap<HandlerOptions, IdentityRouteOptions>();

function identityRoutesOrDefault(options: HandlerOptions): IdentityRouteOptions {
  if (options.identity !== undefined) {
    return options.identity;
  }
  let routes = defaultIdentityRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new IdentityService({
        store: new FsIdentityStore(dataDir),
        clock: (): string => new Date().toISOString(),
      }),
      logger: options.logger,
    };
    defaultIdentityRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-032 routing: memoized default reality-vs-design comparison routing
// (see HandlerOptions.comparison) — same lazy discipline as the identity
// wiring: resolved only inside the /v1/comparisons path guard, so
// deployments without comparison traffic never construct the store. The
// two reference resolvers are READ-ONLY BY CONSTRUCTION and resolved over
// THIS handler's configured data dir (never through a shared memoized
// sibling wiring, so two handlers over different data dirs can never leak
// each other's authorities — the AISE-031 leak fix pattern): each adapts a
// PRIVATE store instance whose only reachable member is the READ method
// the adapter calls — reality version resolution via the FsRealityStore's
// `getVersion` (AISE-016 authority; the pinned version snapshot is
// consumed as immutable input, never mutated) and evidence membership via
// the FsEvidenceStore's `getEvidenceRecord` READ method (evidence records
// are immutable write-once files, so a read-only second instance is safe).
// No code path from here can write the reality or evidence authorities —
// the resolver interfaces expose exactly one READ method each and the
// instances behind them are never exported.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultComparisonRoutesByOptions = new WeakMap<HandlerOptions, ComparisonRouteOptions>();

function comparisonRoutesOrDefault(options: HandlerOptions): ComparisonRouteOptions {
  if (options.comparison !== undefined) {
    return options.comparison;
  }
  let routes = defaultComparisonRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new ComparisonService({
        store: new FsComparisonStore(dataDir),
        clock: (): string => new Date().toISOString(),
        realityVersionResolver: readOnlyRealityVersionResolver(new FsRealityStore(dataDir)),
        evidenceMembershipResolver: readOnlyComparisonEvidenceMembershipResolver(
          new FsEvidenceStore(dataDir),
        ),
      }),
      logger: options.logger,
    };
    defaultComparisonRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-018 routing: memoized default adaptive evidence-gap routing (see
// HandlerOptions.gaps) — same lazy discipline as the comparison wiring:
// resolved only inside the /v1/gaps path guard, so deployments without
// gap-analysis traffic never construct the store. The three reference
// resolvers are READ-ONLY BY CONSTRUCTION and resolved over THIS
// handler's configured data dir (never through a shared memoized sibling
// wiring, so two handlers over different data dirs can never leak each
// other's authorities — the AISE-031 leak fix pattern): the assurance
// profile resolver adapts the shipped code-defined profiles' READ method
// `getAssuranceProfile` (the readiness authority's documents; the REAL
// evaluateReadiness evaluator is injected as the single readiness
// authority — the gap engine never re-implements readiness), the reality
// version resolver adapts the FsRealityStore's `getVersion` READ method
// (AISE-016 authority; the pinned version snapshot is consumed as
// immutable input, never mutated), and the evidence graph resolver adapts
// the FsEvidenceStore's READ methods (evidence records are immutable
// write-once files, so a read-only second instance is safe). No code path
// from here can write the assurance, reality or evidence authorities —
// the resolver interfaces expose exactly one READ method each and the
// instances behind them are never exported.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultGapsRoutesByOptions = new WeakMap<HandlerOptions, GapsRouteOptions>();

function gapsRoutesOrDefault(options: HandlerOptions): GapsRouteOptions {
  if (options.gaps !== undefined) {
    return options.gaps;
  }
  let routes = defaultGapsRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new GapAnalysisService({
        store: new FsGapAnalysisStore(dataDir),
        clock: (): string => new Date().toISOString(),
        assuranceProfileResolver: readOnlyAssuranceProfileResolver({
          getAssuranceProfile,
        }),
        readinessEvaluator: evaluateReadiness,
        realityVersionResolver: readOnlyGapRealityVersionResolver(new FsRealityStore(dataDir)),
        evidenceGraphResolver: readOnlyGapsEvidenceGraphResolver(new FsEvidenceStore(dataDir)),
      }),
      logger: options.logger,
    };
    defaultGapsRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-041 routing: memoized default adoption (workflow migration and
// switching-friction profiler) routing (see HandlerOptions.adoption) —
// same lazy discipline as the gaps wiring: resolved only inside the
// /v1/adoption path guard, so deployments without adoption traffic never
// construct the store. The default wiring resolves THIS handler's OWN env
// data dir (validateEnv(options.envSource()) — never a module-level
// memoized sibling wiring, so two handlers over different data dirs can
// never leak each other's records) and its adapter-descriptor resolver
// adapts a FRESH, EMPTY integrations adapter registry's READ method
// `lookup` and NOTHING else (the AISE-037 registry is a pure in-memory
// library with no persistent default deployment yet — its HTTP wiring
// was deliberately deferred — so the default resolver honestly resolves
// zero registered adapters until a deployment injects a registry-backed
// service). There is no register/sync/write path from here into the
// integrations authority, and the profiler itself NEVER migrates
// anything: it inventories, scores and tracks governed candidates only.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultAdoptionRoutesByOptions = new WeakMap<HandlerOptions, AdoptionRouteOptions>();

function adoptionRoutesOrDefault(options: HandlerOptions): AdoptionRouteOptions {
  if (options.adoption !== undefined) {
    return options.adoption;
  }
  let routes = defaultAdoptionRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new AdoptionService({
        store: new FsAdoptionStore(dataDir),
        clock: (): string => new Date().toISOString(),
        adapterDescriptorResolver: readOnlyAdapterDescriptorResolver(createAdapterRegistry()),
      }),
      logger: options.logger,
    };
    defaultAdoptionRoutesByOptions.set(options, routes);
  }
  return routes;
}

// PROD-006 routing: memoized default artifact storage routing (see
// HandlerOptions.artifacts) — same lazy discipline as the gaps wiring:
// resolved only inside the /v1/artifacts path guard, so deployments without
// artifact traffic never construct the stores. The default is the LOCAL-FS
// TWIN (FsArtifactStorage + FsArtifactMetadataStore under the configured
// data dir): durable artifacts REQUIRE the R2_* env group, which the runtime
// entrypoint wires by injecting its own options here (R2 adapter over the
// hand-rolled SigV4 signer); /readyz and /v1/artifacts/status always say
// which backend is actually serving. No limits or access policy live in
// this wiring: the service enforces the env-derived upload cap before any
// storage call, and the predicate port (allowAllArtifactAccess — the open
// local-dev default of every other pre-auth /v1 surface) is the single
// access seam PROD-010 will wire to the authenticated principal context.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultArtifactsRoutesByOptions = new WeakMap<HandlerOptions, ArtifactsRouteOptions>();

function artifactsRoutesOrDefault(options: HandlerOptions): ArtifactsRouteOptions {
  if (options.artifacts !== undefined) {
    return options.artifacts;
  }
  let routes = defaultArtifactsRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new ArtifactService({
        storage: new FsArtifactStorage(dataDir),
        metadata: new FsArtifactMetadataStore(dataDir),
        // The raw env value (never echoed): unset → the 25 MiB default;
        // malformed → the default (the workspace env gate reports it).
        limits: {
          maxBytes: maxBytesOrDefault(options.envSource()["AISE_ARTIFACT_MAX_BYTES"]),
        },
        clock: (): string => new Date().toISOString(),
      }),
      logger: options.logger,
      accessPredicate: allowAllArtifactAccess,
    };
    defaultArtifactsRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-011: memoized default BOQ routing (see HandlerOptions.boq).
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultBoqRoutesByOptions = new WeakMap<HandlerOptions, BoqRouteOptions>();

function boqRoutesOrDefault(options: HandlerOptions): BoqRouteOptions {
  if (options.boq !== undefined) {
    return options.boq;
  }
  let routes = defaultBoqRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    const service = new BoqService({
      store: new FsBoqStore(dataDir),
      clock: () => new Date().toISOString(),
    });
    routes = {
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
    defaultBoqRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-025 routing: memoized default Engineering Case routing (see
// HandlerOptions.cases) — same lazy discipline as the BOQ wiring: resolved
// only inside the /v1/cases path guard, so deployments without case traffic
// never construct the store.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultCasesRoutesByOptions = new WeakMap<HandlerOptions, CasesRouteOptions>();

function casesRoutesOrDefault(options: HandlerOptions): CasesRouteOptions {
  if (options.cases !== undefined) {
    return options.cases;
  }
  let routes = defaultCasesRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new CaseService({
        store: new FsCaseStore(dataDir),
        clock: (): string => new Date().toISOString(),
      }),
      logger: options.logger,
    };
    defaultCasesRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-026 routing: memoized default Intervention Studio routing (see
// HandlerOptions.interventions) — same lazy discipline as the case wiring:
// resolved only inside the /v1/interventions path guard, so deployments
// without intervention traffic never construct the store. PROPOSAL
// ISOLATION: the default baseline resolver is READ-ONLY BY CONSTRUCTION —
// it calls the reality store's read method `getVersion` for the PINNED
// version id and nothing else; no code path from here can write reality.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultInterventionRoutesByOptions = new WeakMap<HandlerOptions, InterventionRouteOptions>();

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
  let routes = defaultInterventionRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    routes = {
      service: new InterventionService({
        store: new FsInterventionStore(dataDir),
        clock: (): string => new Date().toISOString(),
        baselineResolver: readOnlyBaselineResolver(new FsRealityStore(dataDir)),
      }),
      logger: options.logger,
    };
    defaultInterventionRoutesByOptions.set(options, routes);
  }
  return routes;
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
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultExecutionRoutesByOptions = new WeakMap<HandlerOptions, ExecutionRouteOptions>();

function executionRoutesOrDefault(options: HandlerOptions): ExecutionRouteOptions {
  if (options.executions !== undefined) {
    return options.executions;
  }
  let routes = defaultExecutionRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    const wallClock = (): string => new Date().toISOString();
    routes = {
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
    defaultExecutionRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-028 routing: memoized default impact routing (see
// HandlerOptions.impacts) — same lazy discipline as the case/intervention/
// execution wiring: resolved only inside the /v1/impacts path guard, so
// deployments without impact traffic never construct the store. The two
// reference resolvers are READ-ONLY BY CONSTRUCTION and resolved over THIS
// handler's configured data dir through PRIVATE service instances (never
// through a shared memoized sibling wiring — the AISE-031 leak rule — so
// two handlers over different data dirs can never leak each other's
// authorities): the intervention scenario projection adapts a PRIVATE
// InterventionService whose baseline resolver is the same read-only
// `readOnlyBaselineResolver` over this data dir (reusing the AISE-026
// helper), and the BOQ mapping projection adapts a PRIVATE MappingService
// plus a PRIVATE BoqService (the AISE-011/014/017 wiring shape of
// boqRoutesOrDefault, constructed fresh here) — the adapter calls their
// READ methods `getScenario`, `getLatest` and `getImport` and nothing else.
// No code path from here can write the intervention or BOQ authorities.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultImpactRoutesByOptions = new WeakMap<HandlerOptions, ImpactRouteOptions>();

function impactRoutesOrDefault(options: HandlerOptions): ImpactRouteOptions {
  if (options.impacts !== undefined) {
    return options.impacts;
  }
  let routes = defaultImpactRoutesByOptions.get(options);
  if (routes === undefined) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    const wallClock = (): string => new Date().toISOString();
    const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: wallClock });
    routes = {
      service: new ImpactService({
        store: new FsImpactStore(dataDir),
        clock: wallClock,
        scenarioResolver: readOnlyImpactScenarioResolver(
          new InterventionService({
            store: new FsInterventionStore(dataDir),
            clock: wallClock,
            baselineResolver: readOnlyBaselineResolver(new FsRealityStore(dataDir)),
          }),
        ),
        mappingResolver: readOnlyImpactBoqMappingResolver(
          new MappingService({
            store: new FsMappingStore(dataDir),
            clock: wallClock,
            normalization: new NormalizationService({
              store: new FsNormalizationStore(dataDir),
              clock: wallClock,
              boq,
            }),
            boq,
          }),
          boq,
        ),
      }),
      logger: options.logger,
    };
    defaultImpactRoutesByOptions.set(options, routes);
  }
  return routes;
}

// AISE-038 routing: memoized default developer API/SDK routing (see
// HandlerOptions.sdk) — same lazy discipline as the impact wiring:
// resolved only inside the /v1/sdk path guard, so deployments without
// SDK traffic never touch it. The default wiring owns NO stores: the
// SDK is a pure contract layer (the frozen SDK_CONTRACT registry plus
// this handler's logger); explicit wiring wins, as everywhere else.
// FIX-001: memoized PER HANDLER (keyed on the handler's own options object —
// each createRequestHandler call owns one), never module-global: two handlers
// over different data dirs can never leak each other's authorities.
const defaultSdkRoutesByOptions = new WeakMap<HandlerOptions, SdkRouteOptions>();

function sdkRoutesOrDefault(options: HandlerOptions): SdkRouteOptions {
  if (options.sdk !== undefined) {
    return options.sdk;
  }
  let routes = defaultSdkRoutesByOptions.get(options);
  if (routes === undefined) {
    routes = { logger: options.logger };
    defaultSdkRoutesByOptions.set(options, routes);
  }
  return routes;
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

  // AISE-036 routing — delegates to the enterprise identity surface
  // (org/project/role/permission/retention/audit policy authority — the
  // tenant-boundary and authorization-decision engine; acting principals
  // arrive explicitly per the documented authn boundary). The path guard
  // keeps the lazily-constructed default service (FsIdentityStore under
  // the configured data dir) entirely off non-identity requests.
  if (url.pathname === "/v1/identity" || url.pathname.startsWith("/v1/identity/")) {
    const identityResponse = await handleIdentityRequest(
      request,
      url,
      requestId,
      identityRoutesOrDefault(options),
    );
    if (identityResponse !== null) {
      return identityResponse;
    }
  }

  // AISE-032 routing — delegates to the reality-vs-design comparison
  // surface (the derived comparison authority: pinned reality version vs
  // imported design reference, evidence-linked discrepancies,
  // uncertainty-aware statuses; neither source is ever altered). The path
  // guard keeps the lazily-constructed default service (FsComparisonStore
  // + the two read-only reference resolvers under the configured data dir)
  // entirely off non-comparison requests.
  if (url.pathname === "/v1/comparisons" || url.pathname.startsWith("/v1/comparisons/")) {
    const comparisonResponse = await handleComparisonRequest(
      request,
      url,
      requestId,
      comparisonRoutesOrDefault(options),
    );
    if (comparisonResponse !== null) {
      return comparisonResponse;
    }
  }

  // AISE-018 routing — delegates to the adaptive evidence-gap surface
  // (the derived gap-analysis authority: evidence gaps computed from the
  // pinned reality version, the evidence graph state and the governing
  // assurance profile; ranked next-observation candidates by task impact,
  // expected uncertainty reduction, operator effort and recoverability;
  // the readiness authority's report consumed verbatim, never mutated).
  // The path guard keeps the lazily-constructed default service
  // (FsGapAnalysisStore + the three read-only reference resolvers under
  // the configured data dir) entirely off non-gaps requests.
  if (url.pathname === "/v1/gaps" || url.pathname.startsWith("/v1/gaps/")) {
    const gapsResponse = await handleGapsRequest(
      request,
      url,
      requestId,
      gapsRoutesOrDefault(options),
    );
    if (gapsResponse !== null) {
      return gapsResponse;
    }
  }

  // AISE-041 routing — delegates to the adoption surface (the workflow
  // migration and switching-friction profiler: incumbent-workflow
  // inventory with typed per-step attributes, integration-readiness and
  // switching-friction scoring with explicit weights and UNKNOWN-honest
  // null composites, ranked replacement-opportunity steps, and the
  // governed migration-candidate state machine — `replaced` only with
  // semantic equivalence + operational acceptance + an active rollback
  // plan; the profiler NEVER migrates anything and never writes an
  // incumbent system). The path guard keeps the lazily-constructed
  // default service (FsAdoptionStore + the read-only empty-registry
  // adapter resolver under the configured data dir) entirely off
  // non-adoption requests.
  if (url.pathname === "/v1/adoption" || url.pathname.startsWith("/v1/adoption/")) {
    const adoptionResponse = await handleAdoptionRequest(
      request,
      url,
      requestId,
      adoptionRoutesOrDefault(options),
    );
    if (adoptionResponse !== null) {
      return adoptionResponse;
    }
  }

  // PROD-006 routing — delegates to the R2 artifact storage surface (the
  // content-addressed blob + metadata store for BOQs, images, videos,
  // captures and derived artifacts: upload limits enforced BEFORE any
  // storage call, provenance links BY REFERENCE only, the
  // ArtifactAccessPredicate port gating every list/get/delete, retention
  // classes stored ON the record and enumerated — never auto-deleted — and
  // typed quota/availability failures). The path guard keeps the
  // lazily-constructed default service (the Fs twin under the configured
  // data dir; the runtime entrypoint injects the R2-backed wiring when the
  // R2_* env group is present) entirely off non-artifacts requests.
  if (url.pathname === "/v1/artifacts" || url.pathname.startsWith("/v1/artifacts/")) {
    const artifactsResponse = await handleArtifactsRequest(
      request,
      url,
      requestId,
      artifactsRoutesOrDefault(options),
    );
    if (artifactsResponse !== null) {
      return artifactsResponse;
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

  // AISE-028 routing — delegates to the intervention quantities/cost
  // impacts surface (the deterministic derived projection of proposed state
  // deltas mapped to BOQ items: quantities with typed units and propagated
  // uncertainty, honest omission codes, unmapped-delta honesty and explicit
  // caller-supplied pricing). The path guard keeps the lazily-constructed
  // default service (FsImpactStore + the two read-only reference resolvers
  // under the configured data dir) entirely off non-impact requests.
  if (url.pathname === "/v1/impacts" || url.pathname.startsWith("/v1/impacts/")) {
    const impactResponse = await handleImpactRequest(
      request,
      url,
      requestId,
      impactRoutesOrDefault(options),
    );
    if (impactResponse !== null) {
      return impactResponse;
    }
  }

  // AISE-038 routing — delegates to the developer API/SDK contract surface
  // (the DESCRIPTION layer over the six work-order domains' existing /v1
  // routes: the versioned discovery document and the machine-readable
  // operation/version registries, apiVersion-stamped; never a second
  // authority). The path guard keeps the lazily-constructed default
  // wiring entirely off non-sdk requests.
  if (url.pathname === "/v1/sdk" || url.pathname.startsWith("/v1/sdk/")) {
    const sdkResponse = await handleSdkRequest(
      request,
      url,
      requestId,
      sdkRoutesOrDefault(options),
    );
    if (sdkResponse !== null) {
      return sdkResponse;
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
