/**
 * The Pg store factory (PROD-005).
 *
 * Maps the six runtime-wired domain surfaces onto their Pg twins over ONE
 * shared `PgExecutor`. This is the single place that knows how a
 * `PgExecutor` becomes HandlerOptions store fields — the runtime entry
 * (runtime/entry.ts) calls it when DATABASE_URL is present; every service
 * and router consumes the SAME route-options shapes the server's Fs default
 * wiring produces (server.ts constructs the Fs twins exactly the way this
 * factory constructs the Pg twins — the injection seam is the architecture).
 *
 * FIDELITY RULES (mirroring server.ts's default wiring discipline):
 *   - every service gets the SAME constructor shape the Fs default wiring
 *     passes (`{ store, clock }` etc.) — only the store implementation and
 *     the read-only resolver BACKING STORES change;
 *   - the gaps service reuses the gaps module's OWN exported read-only
 *     resolver adapters (`readOnlyAssuranceProfileResolver`,
 *     `readOnlyGapRealityVersionResolver`, `readOnlyEvidenceGraphResolver`)
 *     — never re-implemented here. The assurance resolver adapts the SAME
 *     code-defined profile authority; the readiness evaluator is the REAL
 *     authority's `evaluateReadiness`, injected as the single authority;
 *   - PROD-017: the Reality Graph and the identity registry have Pg twins
 *     (reality.ts + identity.ts) — the last two per-instance Fs surfaces on
 *     the deployed stack. The gaps service's reality-version resolver reads
 *     the SHARED Pg reality twin; the resolver is read-only either way;
 *   - the evidence-graph resolver adapts a PRIVATE PgEvidenceStore instance
 *     (the server's AISE-031 leak-fix pattern: read-only second instance,
 *     never exported) — evidence IS twinned, so gap analysis sees Postgres
 *     evidence;
 *   - mapping stays unset exactly like the server default (BoqRouteOptions
 *     .mapping is optional; the in-router in-memory fallback applies).
 */

import { createCaptureGateway, type CaptureGateway } from "../capture/gateway";
import { createEvidenceService, type EvidenceService } from "../evidence/service";
import { BoqService } from "../boq/service";
import { NormalizationService } from "../boq/normalization/service";
import { createMissionPlanner } from "../missions/planner";
import type { MissionsRouteOptions } from "../missions/router";
import type { BoqRouteOptions } from "../boq/router";
import { CaseService } from "../cases/service";
import type { CasesRouteOptions } from "../cases/router";
import {
  GapAnalysisService,
  readOnlyAssuranceProfileResolver,
  readOnlyEvidenceGraphResolver,
  readOnlyGapRealityVersionResolver,
} from "../gaps/service";
import type { GapsRouteOptions } from "../gaps/router";
import { getAssuranceProfile } from "../assurance/profiles";
import { evaluateReadiness } from "../assurance/evaluate";
import type { Logger } from "../lib/log";
import type { PgExecutor } from "./executor";
import { PgCaptureStore } from "./stores/capture";
import { PgMissionStore } from "./stores/missions";
import { PgEvidenceStore } from "./stores/evidence";
import { PgBoqStore, PgNormalizationStore } from "./stores/boq";
import { PgCaseStore } from "./stores/cases";
import { PgGapAnalysisStore } from "./stores/gaps";
import { PgIdentityStore } from "./stores/identity";
import { PgRealityStore } from "./stores/reality";
import { IdentityService } from "../identity/service";
import type { IdentityStore } from "../identity/store";
import type { RealityRouteOptions } from "../reality/router";

/** The six HandlerOptions fields the Pg family replaces (see runtime/entry.ts). */
export interface PgStoreFamily {
  /** HandlerOptions.capture — the capture ingestion gateway. */
  readonly capture: CaptureGateway;
  /** HandlerOptions.missions — planner is runtime-pure; the store is Pg. */
  readonly missions: MissionsRouteOptions;
  /** HandlerOptions.evidence — the evidence service over the Pg twin. */
  readonly evidence: EvidenceService;
  /** HandlerOptions.boq — ingestion + derived normalization, both Pg-backed. */
  readonly boq: BoqRouteOptions;
  /** HandlerOptions.gaps — gap analysis over the Pg twins (+ Pg reality reads). */
  readonly gaps: GapsRouteOptions;
  /**
   * PROD-017: HandlerOptions.reality — the Reality Graph surface over the
   * Pg twin (durable across instances; was the documented Fs limitation).
   */
  readonly reality: RealityRouteOptions;
  /**
   * PROD-017: the identity service over the Pg twin (the tenancy registry
   * durable across instances). The entry hands this to BOTH the identity
   * routes and the auth layer's tenancy predicate.
   */
  readonly identityService: IdentityService;
  /** The Pg identity store (readable for the demo bootstrap's seed checks). */
  readonly identityStore: IdentityStore;
  /** HandlerOptions.cases — the engineering case service over the Pg twin. */
  readonly cases: CasesRouteOptions;
}

export interface PgStoreFamilyOptions {
  /** The ONE executor every twin shares (one pooled connection per cold start). */
  readonly executor: PgExecutor;
  /** Domain-level logger handed to the route options (as the Fs wiring does). */
  readonly logger: Logger;
  /**
   * Data dir (kept for interface stability; PROD-017 twinned the last Fs
   * fallback — reality — so no factory field consumes it today).
   */
  readonly dataDir?: string;
  /** Timestamp supplier — default: real UTC ISO instants (same as Fs default). */
  readonly clock?: () => string;
}

/**
 * Construct the full Pg store family. PURE CONSTRUCTION — no I/O: store
 * constructors only build SQL builders; the executor connects lazily. Throws
 * never (domain store constructors are side-effect free).
 */
export function createPgStoreFamily(options: PgStoreFamilyOptions): PgStoreFamily {
  const { executor, logger } = options;
  const clock = options.clock ?? ((): string => new Date().toISOString());

  // HandlerOptions.capture — the gateway shape main.ts/entry.ts constructs.
  const capture = createCaptureGateway({
    store: new PgCaptureStore(executor),
    clock,
  });

  // HandlerOptions.missions — { planner, store, logger } (missions/router.ts).
  const missions: MissionsRouteOptions = {
    planner: createMissionPlanner({
      clock,
      idFactory: (): string => crypto.randomUUID(),
    }),
    store: new PgMissionStore(executor),
    logger,
  };

  // HandlerOptions.evidence — the service the server's lazy default builds.
  const evidence = createEvidenceService({
    store: new PgEvidenceStore(executor),
    clock,
  });

  // HandlerOptions.boq — { service, logger, normalization } (boq/router.ts):
  // ingestion over PgBoqStore, derived views over PgNormalizationStore, the
  // normalization service reading the SAME ingestion service instance (the
  // server default passes its own `service` here too). Mapping deliberately
  // unset — identical to the server's default wiring.
  const boqService = new BoqService({
    store: new PgBoqStore(executor),
    clock,
  });
  const boq: BoqRouteOptions = {
    service: boqService,
    logger,
    normalization: new NormalizationService({
      store: new PgNormalizationStore(executor),
      clock,
      boq: boqService,
    }),
  };

  // PROD-017: the Reality Graph twin — one store instance shared by the
  // reality route options AND the gaps resolver below (single source).
  const realityStore = new PgRealityStore(executor);
  const reality: RealityRouteOptions = {
    store: realityStore,
    clock,
    logger,
  };

  // HandlerOptions.gaps — { service, logger } (gaps/router.ts). The service
  // deps mirror server.ts's gapsRoutesOrDefault EXACTLY, with the evidence
  // graph resolver backed by a PRIVATE read-only PgEvidenceStore instance
  // and the reality-version resolver over the SHARED Pg reality twin
  // (PROD-017: reality is twinned — the Fs fallback is gone).
  const gaps: GapsRouteOptions = {
    service: new GapAnalysisService({
      store: new PgGapAnalysisStore(executor),
      clock,
      assuranceProfileResolver: readOnlyAssuranceProfileResolver({
        getAssuranceProfile,
      }),
      readinessEvaluator: evaluateReadiness,
      realityVersionResolver: readOnlyGapRealityVersionResolver(realityStore),
      evidenceGraphResolver: readOnlyEvidenceGraphResolver(new PgEvidenceStore(executor)),
    }),
    logger,
  };

  // PROD-017: the identity twin — the tenancy registry (principals, orgs,
  // the project registry, roles, memberships, retention, audit) over one
  // shared executor. The service shape mirrors entry.ts's Fs construction
  // exactly (store + clock).
  const identityStore = new PgIdentityStore(executor);
  const identityService = new IdentityService({
    store: identityStore,
    clock,
  });

  // HandlerOptions.cases — { service, logger } (cases/router.ts).
  const cases: CasesRouteOptions = {
    service: new CaseService({
      store: new PgCaseStore(executor),
      clock,
    }),
    logger,
  };

  return { capture, missions, evidence, boq, gaps, cases, reality, identityService, identityStore };
}
