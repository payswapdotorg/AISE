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
 *   - LIMITATION (documented in docs/INSTALL.md): the Reality Graph has NO
 *     Pg twin in this item, so the gaps service's reality-version resolver
 *     reads the FsRealityStore under the configured data dir — in Pg mode
 *     reality versions remain file-local until a follow-up item twins the
 *     reality namespace. The resolver is read-only either way;
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
import { FsRealityStore } from "../reality/store";
import type { Logger } from "../lib/log";
import type { PgExecutor } from "./executor";
import { PgCaptureStore } from "./stores/capture";
import { PgMissionStore } from "./stores/missions";
import { PgEvidenceStore } from "./stores/evidence";
import { PgBoqStore, PgNormalizationStore } from "./stores/boq";
import { PgCaseStore } from "./stores/cases";
import { PgGapAnalysisStore } from "./stores/gaps";

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
  /** HandlerOptions.gaps — gap analysis over the Pg twins (+ Fs reality reads). */
  readonly gaps: GapsRouteOptions;
  /** HandlerOptions.cases — the engineering case service over the Pg twin. */
  readonly cases: CasesRouteOptions;
}

export interface PgStoreFamilyOptions {
  /** The ONE executor every twin shares (one pooled connection per cold start). */
  readonly executor: PgExecutor;
  /** Domain-level logger handed to the route options (as the Fs wiring does). */
  readonly logger: Logger;
  /**
   * Data dir for the NOT-yet-twinned read-only authorities (reality). See the
   * module header's documented limitation.
   */
  readonly dataDir: string;
  /** Timestamp supplier — default: real UTC ISO instants (same as Fs default). */
  readonly clock?: () => string;
}

/**
 * Construct the full Pg store family. PURE CONSTRUCTION — no I/O: store
 * constructors only build SQL builders; the executor connects lazily. Throws
 * never (domain store constructors are side-effect free).
 */
export function createPgStoreFamily(options: PgStoreFamilyOptions): PgStoreFamily {
  const { executor, logger, dataDir } = options;
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

  // HandlerOptions.gaps — { service, logger } (gaps/router.ts). The service
  // deps mirror server.ts's gapsRoutesOrDefault EXACTLY, with the evidence
  // graph resolver backed by a PRIVATE read-only PgEvidenceStore instance
  // (evidence is twinned; reality stays Fs this item — see module header).
  const gaps: GapsRouteOptions = {
    service: new GapAnalysisService({
      store: new PgGapAnalysisStore(executor),
      clock,
      assuranceProfileResolver: readOnlyAssuranceProfileResolver({
        getAssuranceProfile,
      }),
      readinessEvaluator: evaluateReadiness,
      realityVersionResolver: readOnlyGapRealityVersionResolver(new FsRealityStore(dataDir)),
      evidenceGraphResolver: readOnlyEvidenceGraphResolver(new PgEvidenceStore(executor)),
    }),
    logger,
  };

  // HandlerOptions.cases — { service, logger } (cases/router.ts).
  const cases: CasesRouteOptions = {
    service: new CaseService({
      store: new PgCaseStore(executor),
      clock,
    }),
    logger,
  };

  return { capture, missions, evidence, boq, gaps, cases };
}
