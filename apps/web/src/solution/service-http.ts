/**
 * PROD-031 — the HTTP binding of the SOLUTION SERVICE SEAM (the
 * browser-safe cut of `service.ts`).
 *
 * `createHttpSolutionService` — the same-origin HTTP binding over the
 * backend solution routes (`handleSolutionRequest` — the PROD-022/PROD-031
 * route factories the runtime entry mounts): `POST /v1/solutions/step |
 * validate | inspect | quantities | revise | baseline`. Fetch is INJECTED
 * (tests pass stubs; the browser passes the environment's gated global —
 * the PROD-001 same-origin contract, no configurable origin; the demo
 * session's cookie rides it).
 *
 * This module is deliberately SEPARATE from `service.ts` (which keeps the
 * port interface + the LOCAL engine binding): the local binding imports
 * the solution ENGINE package directly — legal and correct in Node
 * contexts, but its barrel transitively imports `node:crypto` (the
 * identity derivations), which a plain-browser bundle externalizes. The
 * browser mount's chunk graph imports THIS module only, so the workspace
 * executes in a plain browser through the backend's live routes with a
 * provably crypto-free bundle (the PROD-031 web-bundle gate asserts it).
 *
 * The wire shapes are the SAME structural mirrors (the apps/web boundary
 * discipline of `workspace/model.ts`: apps may not import backend
 * sources) — `service.ts` re-exports this binding so every existing
 * consumer keeps importing `./service`.
 */

import type {
  BaselineServiceResult,
  InspectServiceResult,
  QuantitiesServiceResult,
  ReviseServiceResult,
  SolutionServicePort,
  StepServiceResult,
  ValidateServiceResult,
} from "./service";

/* ------------------------------------------------------------------ */
/* The HTTP transport                                                   */
/* ------------------------------------------------------------------ */

/** A fetch-like transport (the browser global, or a test stub). */
export type SolutionFetchLike = (
  input: string,
  init?: { readonly method?: string; readonly body?: string },
) => Promise<{ readonly ok: boolean; readonly status: number; readonly text: () => Promise<string> }>;

async function postJson(
  fetchImpl: SolutionFetchLike,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(path, { method: "POST", body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`solution service ${path} answered HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

export interface HttpSolutionServiceOptions {
  /** INJECTED fetch (tests stub it; the browser passes the global). */
  readonly fetchImpl: SolutionFetchLike;
  /**
   * Base path prefix of the solution routes (default `/v1/solutions`). The
   * PROD-002 same-origin contract: requests are always same-origin relative
   * paths — never an absolute URL, never another origin.
   */
  readonly basePath?: string;
}

/**
 * The same-origin HTTP binding over the backend solution routes
 * (`handleSolutionRequest` — the PROD-022 route factory, mounted in the
 * runtime entry with the PROD-031 baseline leg). Request/response bodies
 * are the backend's own shapes verbatim; the engine executes SERVER-SIDE
 * and this binding renders its outputs verbatim — no client-side
 * operation semantics anywhere.
 */
export function createHttpSolutionService(
  options: HttpSolutionServiceOptions,
): SolutionServicePort {
  const base = options.basePath ?? "/v1/solutions";
  const fetchImpl = options.fetchImpl;
  return {
    descriptor: {
      serviceId: "solution-service-http",
      engineKind: "aise-solution-engine",
      engineVersion: "1.0.0",
    },
    step: async (input) =>
      postJson(fetchImpl, `${base}/step`, input) as Promise<StepServiceResult>,
    revise: async (input) =>
      postJson(fetchImpl, `${base}/revise`, input) as Promise<ReviseServiceResult>,
    validate: async (input) =>
      postJson(fetchImpl, `${base}/validate`, input) as Promise<ValidateServiceResult>,
    inspect: async (input) =>
      postJson(fetchImpl, `${base}/inspect`, input) as Promise<InspectServiceResult>,
    quantities: async (input) =>
      postJson(fetchImpl, `${base}/quantities`, input) as Promise<QuantitiesServiceResult>,
    baseline: async (input) =>
      postJson(fetchImpl, `${base}/baseline`, input) as Promise<BaselineServiceResult>,
  };
}
