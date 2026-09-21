/**
 * PROD-020 — the desktop adapter's CLIENT: the adapter-logic entrypoint
 * layer the shell drives.
 *
 * This module is 100% unit-testable under plain `bun test` WITHOUT
 * launching the platform binary (the work-order requirement): the HTTP
 * transport is an injected `DesktopTransport`, and every function is
 * pure/deterministic over its inputs. The thin Electron shell
 * (shell/main.ts) wires a fetch-backed transport and calls these
 * entrypoints; it contains no adapter logic of its own.
 *
 * DESKTOP ACTIONS RESOLVE TO SHARED SERVER/DOMAIN ACTIONS — there is no
 * desktop-specific endpoint and no domain fork:
 *
 *  - `openProject`   → `GET  /v1/adapter/projects/:id/task-flow` (the
 *                      SAME joined endpoint the browser adapter consumes)
 *                      decoded through the contract seam, then negotiated
 *                      with the shared PURE `negotiateCapabilities` and
 *                      composed into the high-density review workspace;
 *  - `refreshAuthorization` → `GET /v1/adapter/projects/:id/authorization`;
 *  - `submitIntent`  → `POST /v1/adapter/task-intents` with the typed
 *                      `TaskIntent` wire body (the ONE client-authored
 *                      object); the answer — the SERVER-AUTHORITATIVE
 *                      `OperationResult` + follow-up `NextBestAction` —
 *                      is decoded and rendered verbatim, never
 *                      re-derived;
 *  - `replayOutbox`  → replays queued intents through the SAME endpoint;
 *                      a queued intent is never "completed" locally.
 *
 * HONEST FAILURE STATES (never a guess, never a fabricated result): the
 * deployment may not serve the adapter objects yet (the provider-gated
 * state the browser adapter also renders — `not-served`), the server may
 * reject (`rejected`), the network may be down (`unreachable` — the
 * caller MAY queue the intent for replay through the offline-queue
 * affordance), or the payload may be defective (`invalid` — the contract
 * failure names its object).
 *
 * Determinism: pure functions + the injected transport; no clock (queue
 * timestamps are injected), no randomness, no console.
 */

import {
  type CapabilityNegotiation,
  type AuthorizationContext,
  type OperationResult,
  type ProjectContext,
  type TaskIntent,
} from "@aise/adapter-contract";
import {
  decodeAuthorizationContextAtSeam,
  decodeTaskFlowBundleAtSeam,
  decodeTaskIntentAnswerAtSeam,
  describeContractFailure,
  type TaskFlowBundle,
  type TaskIntentAnswer,
} from "./seam";
import { negotiateDesktopTask } from "./profile";
import {
  denseReviewLayout,
  type ReviewLayout,
} from "./review-layout";
import {
  resolveProjectIdentity,
  dequeueIntent,
  emptyConvenienceState,
  replayableIntents,
  type DesktopConvenienceState,
} from "./convenience-store";

/* ------------------------------------------------------------------ */
/* The transport seam (injected; the shell wires fetch)                 */
/* ------------------------------------------------------------------ */

/** One transport response (status + raw body text, when present). */
export interface TransportResponse {
  readonly status: number;
  readonly body: string | null;
}

/** The injected HTTP transport the adapter client uses. */
export interface DesktopTransport {
  get(url: string): Promise<TransportResponse>;
  postJson(url: string, body: unknown): Promise<TransportResponse>;
}

/** Why a transport request failed (typed, rendered verbatim in states). */
export type TransportFailure =
  | { readonly kind: "network"; readonly detail: string }
  | { readonly kind: "http"; readonly status: number; readonly detail: string }
  | { readonly kind: "invalid"; readonly detail: string };

/** True when a typed failure is an HTTP 404 (a route not served). */
export function isNotServed(failure: TransportFailure): boolean {
  return failure.kind === "http" && failure.status === 404;
}

/** The never-throwing transport-backed result of one adapter action. */
export type TransportResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: TransportFailure };

/** The never-throwing JSON request result (discriminated: failures always carry a reason). */
type JsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: TransportFailure };

async function requestJson(
  transport: DesktopTransport,
  url: string,
  run: () => Promise<TransportResponse>,
): Promise<JsonResult> {
  let response: TransportResponse;
  try {
    response = await run();
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "network",
        detail: error instanceof Error ? error.message : "network request failed",
      },
    };
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      failure: {
        kind: "http",
        status: response.status,
        detail: `${url} answered HTTP ${response.status}`,
      },
    };
  }
  if (response.body === null) {
    return { ok: false, failure: { kind: "invalid", detail: `${url} returned no body` } };
  }
  try {
    return { ok: true, value: JSON.parse(response.body) };
  } catch {
    return { ok: false, failure: { kind: "invalid", detail: `${url} did not return valid JSON` } };
  }
}

/** Extract `{ ok: true, … }` API envelope payloads, else an invalid failure. */
function envelopePayload(result: JsonResult, url: string): JsonResult {
  if (!result.ok) {
    return result;
  }
  const value = result.value;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).ok !== true
  ) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: `${url} did not return the expected { ok: true, … } envelope`,
      },
    };
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* The open-project view (what the shell renders after opening)         */
/* ------------------------------------------------------------------ */

/** How the project identity was resolved (the local-fs non-authority rule). */
export interface ProjectIdentityResolution {
  readonly source: "server" | "local-recents" | "none";
  readonly name: string | null;
}

/** The composed review workspace of one opened project. */
export interface OpenProjectView {
  readonly projectId: string;
  readonly context: ProjectContext | null;
  readonly bundle: TaskFlowBundle;
  /** The shared pure negotiation over the task's server-owned requirements. */
  readonly negotiation: CapabilityNegotiation | null;
  /** The high-density review workspace (layout over the semantic objects). */
  readonly workspace: ReviewLayout;
  /** The identity resolution (server always wins over local recents). */
  readonly projectIdentity: ProjectIdentityResolution;
}

/* ------------------------------------------------------------------ */
/* The submit outcome (only "answered" carries an OperationResult)      */
/* ------------------------------------------------------------------ */

/** The honest outcome of one TaskIntent submission. */
export type SubmitOutcome =
  | { readonly kind: "answered"; readonly answer: TaskIntentAnswer }
  | { readonly kind: "not-served"; readonly failure: TransportFailure }
  | { readonly kind: "rejected"; readonly failure: TransportFailure }
  | { readonly kind: "unreachable"; readonly failure: TransportFailure }
  | { readonly kind: "invalid"; readonly failure: TransportFailure };

/* ------------------------------------------------------------------ */
/* The client                                                           */
/* ------------------------------------------------------------------ */

/** Options for the desktop adapter client. */
export interface DesktopClientOptions {
  /** The backend API base URL (the same API the web app proxies to). */
  readonly apiBaseUrl: string;
  /**
   * The injected clock for queue timestamps (the shell wires a real
   * clock; tests inject constants — determinism).
   */
  readonly clock?: () => string;
}

/** The endpoints the desktop adapter consumes (the SHARED adapter routes). */
export function taskFlowEndpoint(projectId: string): string {
  return `/v1/adapter/projects/${encodeURIComponent(projectId)}/task-flow`;
}
export function authorizationEndpoint(projectId: string): string {
  return `/v1/adapter/projects/${encodeURIComponent(projectId)}/authorization`;
}
export const TASK_INTENT_ENDPOINT = "/v1/adapter/task-intents";

/**
 * Create the desktop adapter client — the adapter-logic entrypoint layer
 * the shell drives. Stateless (convenience state is passed in by the
 * shell, never held here).
 */
export function createDesktopClient(
  transport: DesktopTransport,
  options: DesktopClientOptions,
): {
  readonly openProject: (
    projectId: string,
    viewOptions?: {
      readonly convenience?: DesktopConvenienceState;
      readonly density?: ReviewLayout["density"];
    },
  ) => Promise<TransportResult<OpenProjectView>>;
  readonly refreshAuthorization: (
    projectId: string,
  ) => Promise<TransportResult<AuthorizationContext>>;
  readonly submitIntent: (intent: TaskIntent) => Promise<SubmitOutcome>;
  readonly replayOutbox: (
    state: DesktopConvenienceState,
    onUpdate?: (state: DesktopConvenienceState, taskId: string) => void,
  ) => Promise<{
    readonly state: DesktopConvenienceState;
    readonly outcomes: readonly { readonly taskId: string; readonly outcome: SubmitOutcome }[];
  }>;
} {
  const base = options.apiBaseUrl.replace(/\/+$/, "");

  const openProject = async (
    projectId: string,
    viewOptions?: {
      readonly convenience?: DesktopConvenienceState;
      readonly density?: ReviewLayout["density"];
    },
  ): Promise<TransportResult<OpenProjectView>> => {
    const url = `${base}${taskFlowEndpoint(projectId)}`;
    const result = envelopePayload(
      await requestJson(transport, url, () => transport.get(url)),
      url,
    );
    if (!result.ok) {
      return { ok: false, failure: result.failure };
    }
    const payload = result.value as Record<string, unknown>;
    const decoded = decodeTaskFlowBundleAtSeam(payload.flow);
    if (!decoded.ok) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          detail: describeContractFailure(decoded.failure),
        },
      };
    }
    const bundle = decoded.value;
    const negotiation =
      bundle.requirements !== null ? negotiateDesktopTask(bundle.requirements) : null;
    const identity = resolveProjectIdentity(
      bundle.context,
      viewOptions?.convenience ?? emptyConvenienceState(),
      projectId,
    );
    const view: OpenProjectView = {
      projectId,
      context: bundle.context,
      bundle,
      negotiation,
      workspace: denseReviewLayout(bundle, {
        negotiation,
        density: viewOptions?.density ?? "dense",
      }),
      projectIdentity: identity,
    };
    return { ok: true, value: view };
  };

  const refreshAuthorization = async (
    projectId: string,
  ): Promise<TransportResult<AuthorizationContext>> => {
    const url = `${base}${authorizationEndpoint(projectId)}`;
    const result = envelopePayload(
      await requestJson(transport, url, () => transport.get(url)),
      url,
    );
    if (!result.ok) {
      return { ok: false, failure: result.failure };
    }
    const payload = result.value as Record<string, unknown>;
    const decoded = decodeAuthorizationContextAtSeam(payload.authorization);
    if (!decoded.ok) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          detail: describeContractFailure(decoded.failure),
        },
      };
    }
    return { ok: true, value: decoded.value };
  };

  const submitIntent = async (intent: TaskIntent): Promise<SubmitOutcome> => {
    const url = `${base}${TASK_INTENT_ENDPOINT}`;
    const result = envelopePayload(
      await requestJson(transport, url, () => transport.postJson(url, intent)),
      url,
    );
    if (!result.ok) {
      const failure = result.failure;
      if (failure.kind === "network") {
        return { kind: "unreachable", failure };
      }
      if (isNotServed(failure)) {
        return { kind: "not-served", failure };
      }
      return { kind: "rejected", failure };
    }
    const payload = result.value as Record<string, unknown>;
    const decoded = decodeTaskIntentAnswerAtSeam({
      result: payload.result,
      action: payload.action ?? null,
    });
    if (!decoded.ok) {
      return {
        kind: "invalid",
        failure: {
          kind: "invalid",
          detail: describeContractFailure(decoded.failure),
        },
      };
    }
    return { kind: "answered", answer: decoded.value };
  };

  const replayOutbox = async (
    state: DesktopConvenienceState,
    onUpdate?: (state: DesktopConvenienceState, taskId: string) => void,
  ) => {
    let current = state;
    const outcomes: { readonly taskId: string; readonly outcome: SubmitOutcome }[] = [];
    for (const entry of replayableIntents(state)) {
      const outcome = await submitIntent(entry.intent);
      outcomes.push({ taskId: entry.intent.taskId, outcome });
      if (outcome.kind === "answered") {
        current = dequeueIntent(current, entry.intent.taskId);
        onUpdate?.(current, entry.intent.taskId);
      }
    }
    return { state: current, outcomes };
  };

  return { openProject, refreshAuthorization, submitIntent, replayOutbox };
}

/* ------------------------------------------------------------------ */
/* The workspace recomposition (after a submission is answered)         */
/* ------------------------------------------------------------------ */

/**
 * Recompose the review workspace after the server answered a task
 * intent: the layout now includes the negotiation pane AND the
 * operation-result pane (the server-authoritative result rendered
 * verbatim in the action column).
 */
export function composeReviewWorkspace(
  view: OpenProjectView,
  update?: {
    readonly negotiation?: CapabilityNegotiation | null;
    readonly operationResult?: OperationResult | null;
    readonly density?: ReviewLayout["density"];
  },
): ReviewLayout {
  return denseReviewLayout(view.bundle, {
    negotiation: update?.negotiation ?? view.negotiation,
    operationResult: update?.operationResult ?? null,
    density: update?.density ?? view.workspace.density,
  });
}

/* ------------------------------------------------------------------ */
/* The production transport (fetch-backed; wired by the shell)          */
/* ------------------------------------------------------------------ */

/**
 * Create a fetch-backed transport over the injected fetch implementation
 * (the shell passes Electron's `net.fetch` or the Node global fetch).
 * Same-origin is not required here because the desktop adapter talks to
 * the backend API base URL directly (the web app's dev server proxies
 * the same routes for the browser — one API, two transports).
 */
export function createFetchTransport(
  fetchImpl: (input: string, init?: { readonly method?: string; readonly body?: string }) => Promise<{
    readonly status: number;
    readonly text: () => Promise<string>;
  }>,
): DesktopTransport {
  return {
    get: async (url: string) => {
      const response = await fetchImpl(url);
      return { status: response.status, body: await response.text() };
    },
    postJson: async (url: string, body: unknown) => {
      const response = await fetchImpl(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.text() };
    },
  };
}

/* ------------------------------------------------------------------ */
/* The production transport (fetch-backed; wired by the shell)          */
/* ------------------------------------------------------------------ */