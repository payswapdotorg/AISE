/**
 * Deterministic Developer API/SDK test fixtures (AISE-038) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * Everything here is fixed-seed and hermetic: fixed clocks, fixed sample
 * ids (content ids derive via sha-256), temporary directories removed on
 * settle. No wall clock, no randomness, no network — the verify gate
 * stays deterministic.
 *
 * The kit wires a FULL server handler with all six contract domains over
 * one temporary data dir (in-memory capture store; file-system stores for
 * reality/BOQ/cases/interventions — constructors perform no I/O), so
 * contract tests can (a) probe the REAL router's route shapes
 * behaviorally and (b) prove the idempotency replay-refusal contract
 * against real domain modules through the full handler.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, type Logger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler, type HandlerOptions } from "../server";
import { BoqService } from "../boq/service";
import { FsBoqStore } from "../boq/store";
import { NormalizationService } from "../boq/normalization/service";
import { FsNormalizationStore } from "../boq/normalization/store";
import { MappingService } from "../boq/mapping/service";
import { FsMappingStore } from "../boq/mapping/store";
import { CaseService } from "../cases/service";
import { FsCaseStore } from "../cases/store";
import { InterventionService, type BaselineResolver } from "../intervention/service";
import { FsInterventionStore } from "../intervention/store";
import { FsRealityStore } from "../reality/store";
import type { RouterFact, SdkHttpMethod } from "./model";

export const FIXED_NOW = "2026-02-02T12:00:00.000Z";

/** Injected clock: constant, so stored bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Quiet logger for handler wiring (errors only, like the sibling kits). */
export const quietLogger: Logger = createLogger("error");

const VALID_ENV: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-sdk-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid content id (64 lowercase hex) from a seed. */
export function contentIdOf(seed: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`aise-sdk-test:${seed}`);
  return hasher.digest("hex");
}

/* ------------------------------------------------------------------ */
/* Sample path-parameter values (schema-valid for every probed route)   */
/* ------------------------------------------------------------------ */

/** Param-name to sample value, valid for each probed route's pre-method checks. */
export const SAMPLE_PATH_PARAMS: Readonly<Record<string, string>> = Object.freeze({
  contentId: contentIdOf("content"),
  importId: contentIdOf("import"),
  version: "v1",
  versionId: "v001",
  sessionId: "probe-session-1",
  projectId: "probe-project-1",
  nodeId: "probe-node-1",
  caseId: "probe-case-1",
  scenarioId: "probe-scenario-1",
  missingId: "probe-missing-1",
  index: "0",
});

/** Instantiate a path template with the sample values (no encoding needed). */
export function instantiateTemplate(template: string): string {
  const segments = template.split("/").filter((segment) => segment !== "");
  return `/${segments
    .map((segment) => {
      if (!segment.startsWith(":")) {
        return segment;
      }
      // Registered params carry schema-valid samples; adversarial probe
      // params (any name) get a generic literal — those shapes must 404
      // regardless of the value, and a surprise match surfaces as drift.
      return SAMPLE_PATH_PARAMS[segment.slice(1)] ?? "probe-param-1";
    })
    .join("/")}`;
}

/* ------------------------------------------------------------------ */
/* Full-handler wiring over one temp dir (all six contract domains)     */
/* ------------------------------------------------------------------ */

export type FullHandler = (request: Request) => Promise<Response>;

/** Read-only baseline resolver over a reality store (the AISE-026 seam). */
function readOnlyBaselineResolver(store: FsRealityStore): BaselineResolver {
  return {
    resolveBaseline: (projectId: string, versionId: string) =>
      store.getVersion(projectId, versionId),
  };
}

/**
 * A FULL server handler with the six contract domains wired over one
 * temporary data dir (deterministic clock, in-memory capture store) —
 * the FACT surface the drift check probes and the real modules the
 * idempotency replay tests exercise. Extra HandlerOptions (e.g. an
 * injected `sdk` wiring) can be layered in by the caller.
 */
export function createFullHandler(
  root: string,
  extra?: Partial<HandlerOptions>,
): FullHandler {
  const dataDir = join(root, "data");
  const wallClock = fixedClock;
  const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: wallClock });
  const normalization = new NormalizationService({
    store: new FsNormalizationStore(dataDir),
    clock: wallClock,
    boq,
  });
  const mapping = new MappingService({
    store: new FsMappingStore(dataDir),
    clock: wallClock,
    normalization,
    boq,
  });
  return createRequestHandler({
    envSource: () => VALID_ENV,
    version: "0.1.0-test",
    logger: quietLogger,
    capture: createCaptureGateway({
      store: new InMemoryCaptureStore(),
      clock: wallClock,
    }),
    boq: { service: boq, normalization, mapping, logger: quietLogger },
    reality: { store: new FsRealityStore(dataDir), clock: wallClock, logger: quietLogger },
    cases: {
      service: new CaseService({ store: new FsCaseStore(dataDir), clock: wallClock }),
      logger: quietLogger,
    },
    interventions: {
      service: new InterventionService({
        store: new FsInterventionStore(dataDir),
        clock: wallClock,
        baselineResolver: readOnlyBaselineResolver(new FsRealityStore(dataDir)),
      }),
      logger: quietLogger,
    },
    ...extra,
  });
}

/* ------------------------------------------------------------------ */
/* Behavioral route-shape prober (the router is the FACT)               */
/* ------------------------------------------------------------------ */

function parseAllow(header: string | null): SdkHttpMethod[] {
  if (header === null) {
    return [];
  }
  return header
    .split(",")
    .map((method) => method.trim())
    .filter((method): method is SdkHttpMethod => method === "GET" || method === "POST")
    .sort();
}

/**
 * Probe one path TEMPLATE through a full handler with an UNUSED method
 * (PATCH — no registered route serves it) and classify the answer:
 *
 *  - 405 with an `allow` header -> the route SHAPE exists; the allowed
 *    methods are the FACT for it (keyed by the template);
 *  - 404 `{ error: "not_found" }` -> the server dispatches no route at
 *    this shape (absent);
 *  - anything else -> the probe is broken (surface it loudly).
 */
export async function probeRouteShape(
  handler: FullHandler,
  template: string,
): Promise<RouterFact | null> {
  const path = instantiateTemplate(template);
  const response = await handler(new Request(`http://localhost${path}`, { method: "PATCH" }));
  if (response.status === 405) {
    const methods = parseAllow(response.headers.get("allow"));
    if (methods.length === 0) {
      throw new Error(`probe of ${path}: 405 without a parseable allow header`);
    }
    return { path: template, methods };
  }
  if (response.status === 404) {
    const body = (await response.json()) as { error?: string };
    if (body.error !== "not_found") {
      throw new Error(
        `probe of ${path}: 404 with domain error '${String(body.error)}' — the sample ` +
          `path parameters are not schema-valid for this route`,
      );
    }
    return null;
  }
  const bodyText = await response.text();
  throw new Error(
    `probe of ${path} with PATCH: unexpected status ${response.status} (${bodyText.slice(0, 200)})`,
  );
}

/**
 * Probe a battery of path templates and collect the served route FACTS
 * (templates the router does not serve are omitted).
 */
export async function probeRouterFacts(
  handler: FullHandler,
  templates: readonly string[],
): Promise<RouterFact[]> {
  const facts: RouterFact[] = [];
  for (const template of templates) {
    const fact = await probeRouteShape(handler, template);
    if (fact !== null) {
      facts.push(fact);
    }
  }
  return facts;
}

/**
 * Adversarial templates INSIDE the contract-governed namespaces that the
 * router must NOT serve today (plus the reserved /v1/projections
 * namespace) — the absence battery for unregistered-route honesty.
 */
export const ADVERSARIAL_TEMPLATES: readonly string[] = Object.freeze([
  "/v1/capture",
  "/v1/capture/assets",
  "/v1/capture/sessions",
  "/v1/capture/sync/:x",
  "/v1/capture/sessions/:sessionId/assets",
  "/v1/capture/assets/:contentId/bytes",
  "/v1/reality",
  "/v1/reality/projects/:projectId/versions",
  "/v1/reality/projects/:projectId/changes/:changeId",
  "/v1/reality/projects/:projectId/nodes",
  "/v1/reality/nodes/:nodeId",
  "/v1/reality/projects/:projectId/versions/:versionId/nodes",
  "/v1/boq",
  "/v1/boq/imports/:importId/normalizations",
  "/v1/boq/imports/:importId/normalization/:x",
  "/v1/boq/imports/:importId/mappings/:version/manual",
  "/v1/boq/imports/:importId/mappings/manual/:x",
  "/v1/boq/exports",
  "/v1/cases/:caseId/observations/:observationId",
  "/v1/cases/:caseId/hypotheses/:hypothesisId",
  "/v1/cases/:caseId/reviews",
  "/v1/cases/:caseId/missing-evidence/:missingId/collect/:x",
  "/v1/cases/:caseId/resolve/:x",
  "/v1/interventions/:scenarioId/steps/:stepId",
  "/v1/interventions/:scenarioId/states",
  "/v1/interventions/:scenarioId/approval-references",
  "/v1/interventions/:scenarioId/status/:x",
  "/v1/projections",
  "/v1/projections/floorplans",
  "/v1/projections/floorplans/:drawingId",
  "/v1/projections/elevations/:x",
  "/v1/projections/sections/:x",
  "/v1/projections/lookup/:x",
  "/v1/projections/svg",
]);
