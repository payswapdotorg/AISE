/**
 * PROD-002 — the same-origin API seam of the product web shell (the
 * PROD-017 task-first browser adapter's contract consumption point).
 *
 * ⚠ THE APP NEVER TALKS TO ANY ORIGIN BUT ITS OWN ⚠ (the PROD-001 runtime
 * contract): every request goes to same-origin paths (`/healthz`, `/readyz`,
 * `/v1/**`) which the Vite dev/preview proxy forwards to the API port. No
 * API base URL is configurable and none is hardcoded — the seam is the
 * browser origin, full stop.
 *
 * - `probeApi` establishes the app's API MODE: `available` when `/healthz`
 *   and `/readyz` answer OK; `unavailable` otherwise (network failure,
 *   proxy down, non-OK status). When the API is unavailable the app renders
 *   the demo dataset with an explicit badge — never a blank page.
 * - `fetchJson` NEVER THROWS: every failure is a typed {@link ApiFailure}
 *   (network / http / invalid), so surfaces render honest error states.
 * - Live adapters attempt the backend's real GET routes and STRUCTURALLY
 *   VALIDATE the responses before use (the frozen libraries' models are
 *   structural mirrors of the backend records, so a genuine record passes
 *   as-is; anything else is an explicit `invalid` failure, never coerced).
 *   The intervention adapter consumes the viewer library's own always-GET
 *   request builders (`scenarioReadRequest`) — same-origin by construction.
 *
 * Determinism: no clock, no randomness; the `fetch` implementation is
 * INJECTED (tests pass stubs; the browser passes the global). Timeouts are
 * the caller's concern (AbortController is passed through untouched).
 */

import type { RealityPaneView, ShellAuthorizationDecision, ShellAuthorizationPort } from "../shell";
import { scenarioReadRequest, type ViewerScenario } from "../viewer";

/* ------------------------------------------------------------------ */
/* The injected transport                                              */
/* ------------------------------------------------------------------ */

/** A fetch-like transport (the browser global, or a test stub). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* ------------------------------------------------------------------ */
/* API mode (the health probe)                                         */
/* ------------------------------------------------------------------ */

/** The app-level API availability (drives the demo-mode badge). */
export interface ApiStatus {
  readonly mode: "available" | "unavailable";
  readonly healthz: "ok" | "failed";
  readonly readyz: "ok" | "failed" | "skipped";
  readonly detail: string;
}

async function ping(fetchImpl: FetchLike, path: string): Promise<"ok" | "failed"> {
  const result = await fetchJson(fetchImpl, path);
  if (!result.ok) {
    return "failed";
  }
  // The API's own health envelope is { ok: true, … } — anything else (a
  // proxy error page, a non-JSON body) is an honest failure.
  if (
    typeof result.value !== "object" ||
    result.value === null ||
    Array.isArray(result.value) ||
    (result.value as Record<string, unknown>).ok !== true
  ) {
    return "failed";
  }
  return "ok";
}

/**
 * Probe the same-origin health endpoints. `readyz` is only consulted when
 * `healthz` answered — an API that fails its liveness probe is unavailable,
 * and the readiness detail is not going to change that.
 */
export async function probeApi(fetchImpl: FetchLike): Promise<ApiStatus> {
  const healthz = await ping(fetchImpl, "/healthz");
  if (healthz === "failed") {
    return {
      mode: "unavailable",
      healthz,
      readyz: "skipped",
      detail: "the API did not answer /healthz on this origin — showing demo data",
    };
  }
  const readyz = await ping(fetchImpl, "/readyz");
  if (readyz === "failed") {
    return {
      mode: "unavailable",
      healthz,
      readyz,
      detail: "the API answered /healthz but is not ready (/readyz failed) — showing demo data",
    };
  }
  return {
    mode: "available",
    healthz,
    readyz,
    detail: "live API on this origin",
  };
}

/* ------------------------------------------------------------------ */
/* Typed JSON fetch (never throws)                                     */
/* ------------------------------------------------------------------ */

/** Why a `fetchJson` failed (rendered verbatim in error states). */
export type ApiFailure =
  | { readonly kind: "network"; readonly detail: string }
  | {
      readonly kind: "http";
      readonly status: number;
      readonly detail: string;
      /** The typed 4xx/5xx envelope's `error` code, when the body was one. */
      readonly code?: string;
      /** The typed envelope's `detail` (the server's human reason). */
      readonly reason?: string;
      /** Bounded issue summaries from the envelope (with a truncation marker). */
      readonly issues?: readonly string[];
    }
  | { readonly kind: "invalid"; readonly detail: string };

/* Bounded text (an explicit truncation marker, never a silent cut). */
const CODE_BOUND = 128;
const REASON_BOUND = 500;
const ISSUE_BOUND = 200;
const ISSUES_MAX = 5;

function boundedText(value: string, bound: number): string {
  return value.length <= bound ? value : `${value.slice(0, bound)}… [truncated]`;
}

/** Summarize one envelope issue entry deterministically (no values). */
function issueText(entry: unknown): string {
  if (
    typeof entry === "object" &&
    entry !== null &&
    !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>).path === "string" &&
    typeof (entry as Record<string, unknown>).code === "string"
  ) {
    const record = entry as Record<string, unknown>;
    return `${record.path as string}: ${record.code as string}`;
  }
  if (typeof entry === "string") {
    return entry;
  }
  try {
    return boundedText(JSON.stringify(entry) ?? String(entry), ISSUE_BOUND);
  } catch {
    return "unrenderable issue";
  }
}

/**
 * The typed HTTP failure for a non-OK response: the base detail stays the
 * exact generic text (`<path> answered HTTP <status>`); when the body parses
 * ONCE into the backend's typed envelope `{ ok:false, error, detail, issues? }`,
 * its code/reason/issues surface as ADDITIVE optional fields (bounded, with
 * an explicit truncation marker). Malformed/HTML bodies keep the generic
 * detail and gain nothing — never a guess.
 */
async function httpFailure(path: string, response: Response): Promise<ApiFailure> {
  const failure: {
    kind: "http";
    status: number;
    detail: string;
    code?: string;
    reason?: string;
    issues?: string[];
  } = {
    kind: "http",
    status: response.status,
    detail: `${path} answered HTTP ${String(response.status)}`,
  };
  let text: string;
  try {
    text = await response.text();
  } catch {
    return failure; // unreadable body — the generic detail stands
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return failure; // malformed/HTML body — the generic detail stands
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).ok !== false
  ) {
    return failure; // not the typed envelope — never coerced
  }
  const envelope = parsed as Record<string, unknown>;
  if (typeof envelope.error === "string" && envelope.error.length > 0) {
    failure.code = boundedText(envelope.error, CODE_BOUND);
  }
  if (typeof envelope.detail === "string" && envelope.detail.length > 0) {
    failure.reason = boundedText(envelope.detail, REASON_BOUND);
  }
  if (Array.isArray(envelope.issues)) {
    const issues = envelope.issues.map(issueText);
    failure.issues =
      issues.length <= ISSUES_MAX
        ? issues
        : [...issues.slice(0, ISSUES_MAX), `… (+${String(issues.length - ISSUES_MAX)} more)`];
  }
  return failure;
}

/** The never-throwing fetch result. */
export type JsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: ApiFailure };

/** Fetch a same-origin path and parse JSON — typed failures, never throws. */
export async function fetchJson(
  fetchImpl: FetchLike,
  path: string,
  init?: RequestInit,
): Promise<JsonResult> {
  let response: Response;
  try {
    response = await fetchImpl(path, init);
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "network",
        detail: error instanceof Error ? error.message : "network request failed",
      },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: await httpFailure(path, response),
    };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${path} did not return valid JSON` },
    };
  }
  return { ok: true, value };
}

/* ------------------------------------------------------------------ */
/* Structural validators (honest, name the first defect)               */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  field: string,
  defects: string[],
): void {
  if (typeof value !== "string" || value.length === 0) {
    defects.push(`${field} must be a non-empty string`);
  }
}

/**
 * Structural check for a serialized viewer scenario record (the frozen
 * viewer library's model is the structural mirror of the AISE-026 record,
 * so a genuine backend record passes as-is).
 */
export function validateScenarioRecord(value: unknown): ViewerScenario {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("scenario record must be a JSON object");
  }
  requireString(value.scenarioId, "scenarioId", defects);
  requireString(value.projectId, "projectId", defects);
  requireString(value.title, "title", defects);
  requireString(value.baselineVersionId, "baselineVersionId", defects);
  requireString(value.createdAt, "createdAt", defects);
  requireString(value.updatedAt, "updatedAt", defects);
  requireString(value.status, "status", defects);
  if (!Array.isArray(value.steps)) {
    defects.push("steps must be an array");
  }
  if (!Array.isArray(value.states)) {
    defects.push("states must be an array");
  } else {
    for (const state of value.states) {
      if (!isRecord(state) || typeof state.stateId !== "string") {
        defects.push("every state must carry a stateId");
        break;
      }
    }
  }
  if (!Array.isArray(value.transitions)) {
    defects.push("transitions must be an array");
  }
  if (defects.length > 0) {
    throw new Error(`scenario record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as ViewerScenario;
}

/** A tenancy project record (identity namespace, structural check). */
export interface ProjectRecord {
  readonly projectId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: string;
}

/** Structural check for a serialized identity project record. */
export function validateProjectRecord(value: unknown): ProjectRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("project record must be a JSON object");
  }
  requireString(value.projectId, "projectId", defects);
  requireString(value.organizationId, "organizationId", defects);
  requireString(value.name, "name", defects);
  requireString(value.createdAt, "createdAt", defects);
  if (defects.length > 0) {
    throw new Error(`project record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as ProjectRecord;
}

/* ------------------------------------------------------------------ */
/* Live adapters (same-origin GETs over the frozen libraries' models)  */
/* ------------------------------------------------------------------ */

/** A live-loaded record with its provenance (the endpoint it came from). */
export interface LiveRecord<T> {
  readonly record: T;
  readonly endpoint: string;
}

/** Extract `{ ok: true, … }` API envelope payloads, else an invalid failure. */
function envelopePayload(result: JsonResult, endpoint: string): JsonResult {
  if (!result.ok) {
    return result;
  }
  if (!isRecord(result.value) || result.value.ok !== true) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: `${endpoint} did not return the expected { ok: true, … } envelope`,
      },
    };
  }
  return result;
}

/**
 * Load one intervention scenario LIVE via the viewer library's always-GET
 * request builder (`GET /v1/interventions/:id`, same-origin). Structural
 * validation happens before the record is used; failures are typed.
 */
export async function loadScenarioLive(
  fetchImpl: FetchLike,
  scenarioId: string,
): Promise<{ ok: true; scenario: LiveRecord<ViewerScenario> } | { ok: false; failure: ApiFailure }> {
  const request = scenarioReadRequest(scenarioId);
  const result = envelopePayload(await fetchJson(fetchImpl, request.url), request.url);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  try {
    return {
      ok: true,
      scenario: {
        record: validateScenarioRecord(payload.scenario),
        endpoint: request.url,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "scenario record failed validation",
      },
    };
  }
}

/** A scenario list summary (interventions namespace), consumed verbatim. */
export interface ScenarioSummaryRecord {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: string;
  readonly stateCount: number;
}

function validateScenarioSummary(value: unknown): ScenarioSummaryRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("scenario summary must be a JSON object");
  }
  requireString(value.scenarioId, "scenarioId", defects);
  requireString(value.projectId, "projectId", defects);
  requireString(value.title, "title", defects);
  requireString(value.status, "status", defects);
  if (typeof value.stateCount !== "number" || !Number.isInteger(value.stateCount)) {
    defects.push("stateCount must be an integer");
  }
  if (defects.length > 0) {
    throw new Error(`scenario summary is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as ScenarioSummaryRecord;
}

/**
 * Load the deployment's scenario list LIVE (`GET /v1/interventions`,
 * same-origin). Records keep their own project ids verbatim — the caller
 * never re-keys them.
 */
export async function loadScenarioIndexLive(
  fetchImpl: FetchLike,
): Promise<
  | { ok: true; scenarios: readonly ScenarioSummaryRecord[]; endpoint: string }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = "/v1/interventions";
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.scenarios)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return a scenarios array` },
    };
  }
  const scenarios: ScenarioSummaryRecord[] = [];
  for (const entry of payload.scenarios) {
    try {
      scenarios.push(validateScenarioSummary(entry));
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          detail: error instanceof Error ? error.message : "scenario summary failed validation",
        },
      };
    }
  }
  return { ok: true, scenarios, endpoint };
}

/**
 * Load an organization's project list LIVE
 * (`GET /v1/identity/organizations/:orgId/projects?requester=<principalId>`,
 * same-origin). The identity router's guarded reads REQUIRE the requester
 * query parameter (the acting principal); both path and requester are
 * percent-encoded. A missing requester is a typed 422 `requester_required`.
 */
export async function loadProjectsLive(
  fetchImpl: FetchLike,
  organizationId: string,
  requester: string,
): Promise<
  | { ok: true; projects: readonly LiveRecord<ProjectRecord>[] }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = `/v1/identity/organizations/${encodeURIComponent(
    organizationId,
  )}/projects?requester=${encodeURIComponent(requester)}`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.projects)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return a projects array` },
    };
  }
  const projects: LiveRecord<ProjectRecord>[] = [];
  for (const entry of payload.projects) {
    try {
      projects.push({ record: validateProjectRecord(entry), endpoint });
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          detail: error instanceof Error ? error.message : "project record failed validation",
        },
      };
    }
  }
  return { ok: true, projects };
}

/** Human text for an API failure (rendered verbatim in error states). */
export function describeApiFailure(failure: ApiFailure): string {
  switch (failure.kind) {
    case "network":
      return `network failure — ${failure.detail}`;
    case "http": {
      if (failure.code === undefined) {
        return failure.detail;
      }
      let text = `${failure.detail} — ${failure.code}`;
      if (failure.reason !== undefined) {
        text += `: ${failure.reason}`;
      }
      if (failure.issues !== undefined && failure.issues.length > 0) {
        text += ` [issues: ${failure.issues.join("; ")}]`;
      }
      return text;
    }
    case "invalid":
      return `unexpected response — ${failure.detail}`;
  }
}

/* ------------------------------------------------------------------ */
/* Reality adapter (GraphVersion → the shell's RealityPaneView)        */
/* ------------------------------------------------------------------ */

/** The subset of a GraphVersion record the adapter consumes (verbatim). */
interface GraphVersionLike {
  readonly versionId: string;
  readonly createdAt: string;
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly kind: string;
    readonly epistemicStatus: string;
    readonly properties: readonly {
      readonly key: string;
      readonly value: string | number | boolean;
      readonly unit?: string;
    }[];
    readonly provenance: readonly { readonly evidenceId?: string }[];
  }[];
}

function validateGraphVersion(value: unknown): GraphVersionLike {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("reality version record must be a JSON object");
  }
  requireString(value.versionId, "versionId", defects);
  requireString(value.createdAt, "createdAt", defects);
  if (!Array.isArray(value.nodes)) {
    defects.push("nodes must be an array");
  } else {
    for (const node of value.nodes) {
      if (
        !isRecord(node) ||
        typeof node.nodeId !== "string" ||
        typeof node.kind !== "string" ||
        typeof node.epistemicStatus !== "string"
      ) {
        defects.push("every reality node must carry nodeId, kind and epistemicStatus");
        break;
      }
    }
  }
  if (defects.length > 0) {
    throw new Error(`reality version record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as GraphVersionLike;
}

/**
 * Load the project's LATEST reality snapshot LIVE
 * (`GET /v1/reality/projects/:id/versions/latest`, same-origin) and adapt
 * it into the shell library's `RealityPaneView`:
 *
 *  - every scalar is wrapped with its verbatim source reference
 *    (`reality/<versionId[:nodeId]>`) — the shell's source discipline;
 *  - node summaries are a PRESENTATION-ONLY join of the node's property
 *    assertions (verbatim `key value unit` text — nothing derived);
 *  - evidence ids come from the node's provenance records, verbatim.
 *
 * A 404 is an HONEST EMPTY result (`view: null` — no snapshot recorded for
 * this project yet), never an error.
 */
export async function loadRealityLive(
  fetchImpl: FetchLike,
  projectId: string,
): Promise<
  | { ok: true; view: RealityPaneView | null; endpoint: string }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = `/v1/reality/projects/${encodeURIComponent(projectId)}/versions/latest`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    if (result.failure.kind === "http" && result.failure.status === 404) {
      return { ok: true, view: null, endpoint };
    }
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  try {
    const version = validateGraphVersion(payload.version);
    const source = { module: "reality" as const, recordId: version.versionId };
    return {
      ok: true,
      endpoint,
      view: {
        source,
        projectId,
        versionId: version.versionId,
        versionCreatedAt: { value: version.createdAt, source },
        nodes: version.nodes.map((node) => {
          const nodeSource = {
            module: "reality" as const,
            recordId: `${version.versionId}:${node.nodeId}`,
          };
          const evidenceIds: string[] = [];
          for (const record of node.provenance) {
            if (
              typeof record.evidenceId === "string" &&
              record.evidenceId.length > 0 &&
              !evidenceIds.includes(record.evidenceId)
            ) {
              evidenceIds.push(record.evidenceId);
            }
          }
          return {
            source: nodeSource,
            nodeId: node.nodeId,
            kind: node.kind,
            epistemicStatus: node.epistemicStatus,
            summary: { value: summarizeProperties(node.properties), source: nodeSource },
            evidenceIds: evidenceIds.map((id) => ({ value: id, source: nodeSource })),
          };
        }),
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "reality version failed validation",
      },
    };
  }
}

/** Presentation-only property join: "thickness 240 mm · fireRating REI90". */
function summarizeProperties(
  properties: readonly { readonly key: string; readonly value: string | number | boolean; readonly unit?: string }[],
): string {
  if (properties.length === 0) {
    return "no recorded properties";
  }
  return properties
    .map((property) =>
      typeof property.unit === "string"
        ? `${property.key} ${String(property.value)} ${property.unit}`
        : `${property.key} ${String(property.value)}`,
    )
    .join(" · ");
}

/* ------------------------------------------------------------------ */
/* Cases adapter (list summaries + full records, verbatim)             */
/* ------------------------------------------------------------------ */

/** A case summary record (cases namespace), consumed verbatim. */
export interface CaseSummaryRecord {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly counts: {
    readonly observations: number;
    readonly hypotheses: number;
    readonly missingEvidence: number;
    readonly openMissingEvidence: number;
  };
}

function validateCaseSummary(value: unknown): CaseSummaryRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("case summary must be a JSON object");
  }
  requireString(value.caseId, "caseId", defects);
  requireString(value.title, "title", defects);
  requireString(value.status, "status", defects);
  requireString(value.createdAt, "createdAt", defects);
  requireString(value.updatedAt, "updatedAt", defects);
  if (!isRecord(value.counts)) {
    defects.push("counts must be an object");
  }
  if (defects.length > 0) {
    throw new Error(`case summary is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as CaseSummaryRecord;
}

/**
 * Load the deployment's case list LIVE (`GET /v1/cases`, same-origin).
 * Records are rendered verbatim; validation failures are typed.
 */
export async function loadCaseSummariesLive(
  fetchImpl: FetchLike,
): Promise<
  | { ok: true; cases: readonly CaseSummaryRecord[]; endpoint: string }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = "/v1/cases";
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.cases)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return a cases array` },
    };
  }
  const cases: CaseSummaryRecord[] = [];
  for (const entry of payload.cases) {
    try {
      cases.push(validateCaseSummary(entry));
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          detail: error instanceof Error ? error.message : "case summary failed validation",
        },
      };
    }
  }
  return { ok: true, cases, endpoint };
}

/** One verbatim observation of a live case record. */
export interface CaseObservationRecord {
  readonly nodeId: string;
  readonly observedAt: string;
  readonly evidenceIds: readonly string[];
  readonly note?: string;
}

/** One verbatim hypothesis of a live case record. */
export interface CaseHypothesisRecord {
  readonly statement: string;
  readonly status: string;
  readonly supportedByEvidenceIds: readonly string[];
}

/** One verbatim missing-evidence declaration of a live case record. */
export interface CaseMissingEvidenceRecord {
  readonly description: string;
  readonly status: string;
}

/** The subset of a full live case record the surface renders (verbatim). */
export interface CaseDetailRecord {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly observations: readonly CaseObservationRecord[];
  readonly hypotheses: readonly CaseHypothesisRecord[];
  readonly missingEvidence: readonly CaseMissingEvidenceRecord[];
}

function validateCaseDetail(value: unknown): CaseDetailRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("case record must be a JSON object");
  }
  requireString(value.caseId, "caseId", defects);
  requireString(value.title, "title", defects);
  requireString(value.status, "status", defects);
  for (const field of ["observations", "hypotheses", "missingEvidence"] as const) {
    if (!Array.isArray(value[field])) {
      defects.push(`${field} must be an array`);
    }
  }
  if (defects.length > 0) {
    throw new Error(`case record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as CaseDetailRecord;
}

/** Load one full case record LIVE (`GET /v1/cases/:id`, same-origin). */
export async function loadCaseDetailLive(
  fetchImpl: FetchLike,
  caseId: string,
): Promise<
  | { ok: true; record: CaseDetailRecord | null; endpoint: string }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = `/v1/cases/${encodeURIComponent(caseId)}`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    if (result.failure.kind === "http" && result.failure.status === 404) {
      return { ok: true, record: null, endpoint };
    }
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  try {
    return { ok: true, record: validateCaseDetail(payload.case), endpoint };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "case record failed validation",
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Outcome-loop adapters (executions + comparisons, verbatim)          */
/* ------------------------------------------------------------------ */

/** An execution summary record (executions namespace), consumed verbatim. */
export interface ExecutionSummaryRecord {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly executedStepCount: number;
  readonly evidenceCount: number;
  readonly outcomeCount: number;
  readonly executedAt: string;
  readonly recordedAt: string;
}

/** A comparison summary record (comparisons namespace), consumed verbatim. */
export interface ComparisonSummaryRecord {
  readonly comparisonId: string;
  readonly projectId: string;
  readonly versionId: string;
  readonly designSystemClass: string;
  readonly designSourceRecordId: string;
  readonly designRevision: string | null;
  readonly totalEntries: number;
  readonly discrepancies: number;
  readonly computedAt: string;
}

function validateRecordFields(
  value: unknown,
  label: string,
  fields: readonly { readonly name: string; readonly kind: "string" | "integer" | "stringOrNull" }[],
): Record<string, unknown> {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  for (const field of fields) {
    const raw = value[field.name];
    if (field.kind === "string" && (typeof raw !== "string" || raw.length === 0)) {
      defects.push(`${field.name} must be a non-empty string`);
    }
    if (field.kind === "integer" && (typeof raw !== "number" || !Number.isInteger(raw))) {
      defects.push(`${field.name} must be an integer`);
    }
    if (
      field.kind === "stringOrNull" &&
      raw !== null &&
      (typeof raw !== "string" || raw.length === 0)
    ) {
      defects.push(`${field.name} must be a non-empty string or null`);
    }
  }
  if (defects.length > 0) {
    throw new Error(`${label} is not structurally valid: ${defects.join("; ")}`);
  }
  return value;
}

/** Load the execution list LIVE (`GET /v1/executions`, same-origin). */
export async function loadExecutionsLive(
  fetchImpl: FetchLike,
): Promise<
  | { ok: true; executions: readonly ExecutionSummaryRecord[]; endpoint: string }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = "/v1/executions";
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.executions)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return an executions array` },
    };
  }
  try {
    const executions = payload.executions.map((entry) =>
      validateRecordFields(entry, "execution summary", [
        { name: "executionRecordId", kind: "string" },
        { name: "caseId", kind: "string" },
        { name: "scenarioId", kind: "string" },
        { name: "stateId", kind: "string" },
        { name: "executedStepCount", kind: "integer" },
        { name: "evidenceCount", kind: "integer" },
        { name: "outcomeCount", kind: "integer" },
        { name: "executedAt", kind: "string" },
        { name: "recordedAt", kind: "string" },
      ]) as unknown as ExecutionSummaryRecord,
    );
    return { ok: true, executions, endpoint };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "execution summary failed validation",
      },
    };
  }
}

/** Load the comparison list LIVE (`GET /v1/comparisons`, same-origin). */
export async function loadComparisonsLive(
  fetchImpl: FetchLike,
): Promise<
  | { ok: true; comparisons: readonly ComparisonSummaryRecord[]; endpoint: string }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = "/v1/comparisons";
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.comparisons)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return a comparisons array` },
    };
  }
  try {
    const comparisons = payload.comparisons.map((entry) =>
      validateRecordFields(entry, "comparison summary", [
        { name: "comparisonId", kind: "string" },
        { name: "projectId", kind: "string" },
        { name: "versionId", kind: "string" },
        { name: "designSystemClass", kind: "string" },
        { name: "designSourceRecordId", kind: "string" },
        { name: "designRevision", kind: "stringOrNull" },
        { name: "totalEntries", kind: "integer" },
        { name: "discrepancies", kind: "integer" },
        { name: "computedAt", kind: "string" },
      ]) as unknown as ComparisonSummaryRecord,
    );
    return { ok: true, comparisons, endpoint };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "comparison summary failed validation",
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* PROD-004 — the auth endpoints (same-origin /v1/auth/**)             */
/* ------------------------------------------------------------------ */

/**
 * The client-visible session principal: DISPLAY-ONLY vocabulary. The server
 * never sends anything beyond the display name, the role label and the
 * session kind (no membership map, no permission grants, no token material
 * — those are server-side session state).
 */
export interface SessionPrincipal {
  readonly displayName: string;
  readonly roleLabel: string;
  readonly kind: "user" | "demo";
}

/** Structural check for a /v1/auth/** principal payload. */
export function validateSessionPrincipal(value: unknown): SessionPrincipal {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("session principal must be a JSON object");
  }
  requireString(value.displayName, "displayName", defects);
  requireString(value.roleLabel, "roleLabel", defects);
  if (value.kind !== "user" && value.kind !== "demo") {
    defects.push("kind must be 'user' or 'demo'");
  }
  if (defects.length > 0) {
    throw new Error(`session principal is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as SessionPrincipal;
}

/** True when a typed failure is an HTTP 401 (the gate re-appears). */
export function isUnauthorized(failure: ApiFailure): boolean {
  return failure.kind === "http" && failure.status === 401;
}

/**
 * The outcome of the app's session probe (`GET /v1/auth/whoami`):
 *
 *  - `signed-in`  — a valid session answered with its display principal;
 *  - `signed-out` — 401: the auth layer is ACTIVE but no session is present
 *    (the gate must render);
 *  - `inactive`   — 404: this deployment runs WITHOUT the auth layer (the
 *    pre-auth contract) — the app renders exactly as before, no gate;
 *  - `error`      — anything else (network/5xx/invalid shape): the probe
 *    could not establish the auth mode; the gate renders its error state
 *    with an explicit retry (never a silent bypass).
 */
export type AuthProbe =
  | { readonly kind: "signed-in"; readonly principal: SessionPrincipal }
  | { readonly kind: "signed-out" }
  | { readonly kind: "inactive" }
  | { readonly kind: "error"; readonly failure: ApiFailure };

/** The app's session probe (never throws). */
export async function probeAuth(fetchImpl: FetchLike): Promise<AuthProbe> {
  const endpoint = "/v1/auth/whoami";
  const result = await fetchJson(fetchImpl, endpoint);
  if (result.ok) {
    const payload = result.value as Record<string, unknown>;
    if (!isRecord(payload) || payload.ok !== true) {
      return {
        kind: "error",
        failure: { kind: "invalid", detail: `${endpoint} did not return the expected envelope` },
      };
    }
    try {
      return { kind: "signed-in", principal: validateSessionPrincipal(payload.principal) };
    } catch (error) {
      return {
        kind: "error",
        failure: {
          kind: "invalid",
          detail: error instanceof Error ? error.message : "principal payload failed validation",
        },
      };
    }
  }
  if (result.failure.kind === "http") {
    if (result.failure.status === 401) {
      return { kind: "signed-out" };
    }
    if (result.failure.status === 404) {
      return { kind: "inactive" };
    }
  }
  return { kind: "error", failure: result.failure };
}

/** Extract a validated principal from a successful auth-endpoint envelope. */
function principalOf(result: JsonResult, endpoint: string):
  | { ok: true; principal: SessionPrincipal }
  | { ok: false; failure: ApiFailure } {
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!isRecord(payload) || payload.ok !== true) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: `${endpoint} did not return the expected { ok: true, … } envelope`,
      },
    };
  }
  try {
    return { ok: true, principal: validateSessionPrincipal(payload.principal) };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "principal payload failed validation",
      },
    };
  }
}

/**
 * Sign in as a REGISTERED principal (passwordless local mode — the identity
 * model carries no credentials and the auth layer refuses to invent a second
 * authority; see docs/INSTALL.md §Auth). `POST /v1/auth/sessions` sets the
 * httpOnly session cookie server-side; this client only reports the outcome.
 */
export async function signInPrincipal(
  fetchImpl: FetchLike,
  principalId: string,
): Promise<{ ok: true; principal: SessionPrincipal } | { ok: false; failure: ApiFailure }> {
  const endpoint = "/v1/auth/sessions";
  const result = await fetchJson(fetchImpl, endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ principalId }),
  });
  return principalOf(result, endpoint);
}

/** "Enter demo": mint the controlled, contained demo session. */
export async function enterDemoSession(
  fetchImpl: FetchLike,
): Promise<{ ok: true; principal: SessionPrincipal } | { ok: false; failure: ApiFailure }> {
  const endpoint = "/v1/auth/demo";
  const result = await fetchJson(fetchImpl, endpoint, { method: "POST" });
  return principalOf(result, endpoint);
}

/** Log out: delete the server-side session and clear the cookie. */
export async function signOutSession(
  fetchImpl: FetchLike,
): Promise<{ ok: true } | { ok: false; failure: ApiFailure }> {
  const endpoint = "/v1/auth/sessions/current";
  const result = await fetchJson(fetchImpl, endpoint, { method: "DELETE" });
  if (result.ok) {
    return { ok: true };
  }
  return { ok: false, failure: result.failure };
}

/* ------------------------------------------------------------------ */
/* PROD-010 — the live WRITE-path adapters (exact backend contracts)   */
/* ------------------------------------------------------------------ */

import type {
  AppendStepRequestBody,
  CreateCaseRequestBody,
} from "./create-forms";
import type {
  RecordExecutionRequestBody,
  RecordOutcomeRequestBody,
  RunComparisonRequestBody,
} from "./outcome-forms";
/** POST one JSON body same-origin (the shared write transport). */
async function postJson(
  fetchImpl: FetchLike,
  path: string,
  body: unknown,
): Promise<JsonResult> {
  return fetchJson(fetchImpl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The outcome of a write adapter: the created record, or a typed failure. */
export type WriteOutcome<T> =
  | { readonly ok: true; readonly record: T; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure };

/** Extract + validate a `{ ok: true, <field> }` payload field. */
function payloadField<T>(
  result: JsonResult,
  endpoint: string,
  field: string,
  validate: (value: unknown) => T,
): WriteOutcome<T> {
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!isRecord(payload) || payload.ok !== true) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: `${endpoint} did not return the expected { ok: true, … } envelope`,
      },
    };
  }
  try {
    return { ok: true, record: validate(payload[field]), endpoint };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "response failed validation",
      },
    };
  }
}

/**
 * Create one project LIVE — `POST /v1/identity/organizations/:orgId/projects`
 * with the identity router's EXACT body `{ projectId, name, actor }` (actor =
 * the acting principal per the identity contract). The answer `{ project }`
 * is structurally validated before use.
 */
export async function createProjectLive(
  fetchImpl: FetchLike,
  organizationId: string,
  body: { readonly projectId: string; readonly name: string; readonly actor: string },
): Promise<WriteOutcome<ProjectRecord>> {
  const endpoint = `/v1/identity/organizations/${encodeURIComponent(organizationId)}/projects`;
  return payloadField(
    await postJson(fetchImpl, endpoint, {
      projectId: body.projectId,
      name: body.name,
      actor: body.actor,
    }),
    endpoint,
    "project",
    validateProjectRecord,
  );
}

/**
 * The LIVE authorization port: relays `POST /v1/identity/authorize` with the
 * request VERBATIM (`{ principalId, permission, target }`) to the shell's
 * `ShellAuthorizationPort` seam. The decision (allowed OR refused) is 200
 * DATA — never an error; transport/validation failures THROW (the broker
 * propagates wiring failures, never guesses a decision).
 */
export function createLiveAuthorizationPort(fetchImpl: FetchLike): ShellAuthorizationPort {
  const endpoint = "/v1/identity/authorize";
  return {
    decide: async (request): Promise<ShellAuthorizationDecision> => {
      const result = await postJson(fetchImpl, endpoint, request);
      if (!result.ok) {
        throw new Error(describeApiFailure(result.failure));
      }
      const payload = result.value as Record<string, unknown>;
      if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.decision)) {
        throw new Error(`${endpoint} did not return the expected { ok: true, decision } envelope`);
      }
      // The AISE-040 broker re-validates the decision shape; the port relays
      // it verbatim (the identity module stays the authority).
      return payload.decision as unknown as ShellAuthorizationDecision;
    },
  };
}

/**
 * Create one intervention scenario LIVE — `POST /v1/interventions` with the
 * router's EXACT body `{ scenarioId, projectId, title, baselineVersionId }`
 * (the baseline is a reality `vNNN` sequence id, pinned server-side).
 */
export async function createScenarioLive(
  fetchImpl: FetchLike,
  body: {
    readonly scenarioId: string;
    readonly projectId: string;
    readonly title: string;
    readonly baselineVersionId: string;
  },
): Promise<WriteOutcome<ViewerScenario>> {
  const endpoint = "/v1/interventions";
  return payloadField(
    await postJson(fetchImpl, endpoint, {
      scenarioId: body.scenarioId,
      projectId: body.projectId,
      title: body.title,
      baselineVersionId: body.baselineVersionId,
    }),
    endpoint,
    "scenario",
    validateScenarioRecord,
  );
}

/** The materialized step answer of `POST /v1/interventions/:id/steps`. */
export interface AppendStepAnswer {
  readonly step: {
    readonly stepId: string;
    readonly stepIndex: number;
    readonly kind: string;
    readonly targetNodeId: string;
  };
  readonly state: {
    readonly stateId: string;
    readonly stateIndex: number;
  };
}

function validateAppendStepAnswer(value: unknown): AppendStepAnswer {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("append-step answer must be a JSON object");
  }
  const step = value.step;
  const state = value.state;
  if (!isRecord(step)) {
    defects.push("step must be an object");
  } else {
    requireString(step.stepId, "step.stepId", defects);
    if (typeof step.stepIndex !== "number" || !Number.isInteger(step.stepIndex)) {
      defects.push("step.stepIndex must be an integer");
    }
    requireString(step.kind, "step.kind", defects);
    requireString(step.targetNodeId, "step.targetNodeId", defects);
  }
  if (!isRecord(state)) {
    defects.push("state must be an object");
  } else {
    requireString(state.stateId, "state.stateId", defects);
    if (typeof state.stateIndex !== "number" || !Number.isInteger(state.stateIndex)) {
      defects.push("state.stateIndex must be an integer");
    }
  }
  if (defects.length > 0) {
    throw new Error(`append-step answer is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as AppendStepAnswer;
}

/**
 * Append one step LIVE — `POST /v1/interventions/:id/steps` (the scenario id
 * is percent-encoded in the path) with the FLAT wire body carrying the five
 * per-kind required fields + typed-unit properties. The router's `{ step,
 * state }` answer is structurally validated; typed 422s (`unknown_node_ref`,
 * `missing_provenance`, `numeric_value_without_unit`, …) surface as typed
 * failures via the envelope.
 */
export async function appendStepLive(
  fetchImpl: FetchLike,
  scenarioId: string,
  body: AppendStepRequestBody,
): Promise<WriteOutcome<AppendStepAnswer>> {
  const endpoint = `/v1/interventions/${encodeURIComponent(scenarioId)}/steps`;
  const result = envelopePayload(await postJson(fetchImpl, endpoint, body), endpoint);
  if (!result.ok) {
    return result;
  }
  try {
    return {
      ok: true,
      record: validateAppendStepAnswer(result.value),
      endpoint,
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "append-step answer failed validation",
      },
    };
  }
}

/**
 * Create one engineering case LIVE — `POST /v1/cases` with the probe-verified
 * wire body `{ caseId, projectId, title, summary, createdBy, links }`
 * (`projectId` is the auth body scope — POST /v1/cases is BODY-scoped; the
 * cases core parse carries summary/createdBy on the wire unpersisted).
 */
export async function createCaseLive(
  fetchImpl: FetchLike,
  body: CreateCaseRequestBody,
): Promise<WriteOutcome<CaseDetailRecord>> {
  const endpoint = "/v1/cases";
  return payloadField(
    await postJson(fetchImpl, endpoint, body),
    endpoint,
    "case",
    validateCaseDetail,
  );
}

/** One register entry: the verbatim evidence record + invalidation state. */
export interface EvidenceIndexItem {
  readonly evidence: {
    readonly contentId: string;
    readonly acquisitionMethod: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly capturedAt: string;
  };
  readonly invalidation: { readonly reason: string; readonly invalidatedAt: string } | null;
}

function validateEvidenceIndexItem(value: unknown): EvidenceIndexItem {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("evidence index entry must be a JSON object");
  }
  const evidence = value.evidence;
  if (!isRecord(evidence)) {
    defects.push("evidence must be an object");
  } else {
    requireString(evidence.contentId, "evidence.contentId", defects);
    requireString(evidence.acquisitionMethod, "evidence.acquisitionMethod", defects);
    requireString(evidence.mediaType, "evidence.mediaType", defects);
    if (typeof evidence.byteSize !== "number" || !Number.isInteger(evidence.byteSize)) {
      defects.push("evidence.byteSize must be an integer");
    }
    requireString(evidence.capturedAt, "evidence.capturedAt", defects);
  }
  const invalidation = value.invalidation;
  if (invalidation !== null && !isRecord(invalidation)) {
    defects.push("invalidation must be an object or null");
  }
  if (defects.length > 0) {
    throw new Error(`evidence index entry is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as EvidenceIndexItem;
}

/**
 * Load the evidence register LIVE — `GET /v1/evidence` (invalidated records
 * are EXCLUDED by the backend's default query, mirroring the register's own
 * read discipline).
 */
export async function loadEvidenceIndexLive(
  fetchImpl: FetchLike,
): Promise<
  | { readonly ok: true; readonly items: readonly EvidenceIndexItem[]; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure }
> {
  const endpoint = "/v1/evidence";
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.evidence)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return an evidence array` },
    };
  }
  try {
    return {
      ok: true,
      items: payload.evidence.map(validateEvidenceIndexItem),
      endpoint,
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "evidence index failed validation",
      },
    };
  }
}

/** The latest-reality-version projection (what the baseline picker needs). */
export interface LatestRealityVersion {
  readonly versionId: string;
  readonly createdAt: string;
  readonly nodeCount: number;
}

/**
 * Load the project's LATEST reality version LIVE —
 * `GET /v1/reality/projects/:id/versions/latest`. A 404 is an HONEST EMPTY
 * result (`version: null` — no snapshot recorded yet), never an error.
 */
export async function loadLatestRealityVersionLive(
  fetchImpl: FetchLike,
  projectId: string,
): Promise<
  | { readonly ok: true; readonly version: LatestRealityVersion | null; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure }
> {
  const endpoint = `/v1/reality/projects/${encodeURIComponent(projectId)}/versions/latest`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    if (result.failure.kind === "http" && result.failure.status === 404) {
      return { ok: true, version: null, endpoint };
    }
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  try {
    const version = validateGraphVersion(payload.version);
    return {
      ok: true,
      version: {
        versionId: version.versionId,
        createdAt: version.createdAt,
        nodeCount: version.nodes.length,
      },
      endpoint,
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "reality version failed validation",
      },
    };
  }
}

/**
 * Record one approval reference LIVE —
 * `POST /v1/interventions/:id/approval-reference` with the EXACT body
 * `{ caseId, reviewDecision, reviewedAt }` (a Case-domain review reference,
 * recorded VERBATIM). Answers `{ scenario }`.
 */
export async function recordApprovalReferenceLive(
  fetchImpl: FetchLike,
  scenarioId: string,
  body: {
    readonly caseId: string;
    readonly reviewDecision: string;
    readonly reviewedAt: string;
  },
): Promise<WriteOutcome<ViewerScenario>> {
  const endpoint = `/v1/interventions/${encodeURIComponent(scenarioId)}/approval-reference`;
  return payloadField(
    await postJson(fetchImpl, endpoint, {
      caseId: body.caseId,
      reviewDecision: body.reviewDecision,
      reviewedAt: body.reviewedAt,
    }),
    endpoint,
    "scenario",
    validateScenarioRecord,
  );
}

/**
 * Transition a scenario's status LIVE — `POST /v1/interventions/:id/status`
 * with the EXACT body `{ status }` (the governed transition table is the
 * backend's authority; illegal edges are typed 422 `invalid_status_transition`).
 * Answers `{ scenario }`.
 */
export async function transitionScenarioStatusLive(
  fetchImpl: FetchLike,
  scenarioId: string,
  body: { readonly status: string },
): Promise<WriteOutcome<ViewerScenario>> {
  const endpoint = `/v1/interventions/${encodeURIComponent(scenarioId)}/status`;
  return payloadField(
    await postJson(fetchImpl, endpoint, { status: body.status }),
    endpoint,
    "scenario",
    validateScenarioRecord,
  );
}

/** The full execution record (verbatim subset the surface renders). */
export interface ExecutionDetailRecord {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly executedStepIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds: readonly string[];
  readonly executedAt: string;
  readonly recordedAt: string;
  readonly stateTransition: {
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly evidenceIds: readonly string[];
  };
  readonly outcomes: readonly {
    readonly outcomeId: string;
    readonly statement: string;
    readonly epistemicStatus: string;
  }[];
}

function validateExecutionDetail(value: unknown): ExecutionDetailRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("execution record must be a JSON object");
  }
  for (const field of ["executionRecordId", "caseId", "scenarioId", "stateId"] as const) {
    requireString(value[field], field, defects);
  }
  for (const field of ["executedStepIds", "evidenceIds", "captureSessionIds"] as const) {
    if (!Array.isArray(value[field])) {
      defects.push(`${field} must be an array`);
    }
  }
  requireString(value.executedAt, "executedAt", defects);
  requireString(value.recordedAt, "recordedAt", defects);
  const transition = value.stateTransition;
  if (!isRecord(transition)) {
    defects.push("stateTransition must be an object");
  } else {
    requireString(transition.fromStatus, "stateTransition.fromStatus", defects);
    requireString(transition.toStatus, "stateTransition.toStatus", defects);
    if (!Array.isArray(transition.evidenceIds)) {
      defects.push("stateTransition.evidenceIds must be an array");
    }
  }
  if (!Array.isArray(value.outcomes)) {
    defects.push("outcomes must be an array");
  }
  if (defects.length > 0) {
    throw new Error(`execution record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as ExecutionDetailRecord;
}

/**
 * Record one execution LIVE — `POST /v1/executions` with the router's EXACT
 * body (optional `captureSessionIds` OMITTED when absent; `actor` rides the
 * wire unparsed per the probe contract). The full-record answer (with the
 * PROPOSED→EXECUTED state transition + outcomes) is validated.
 */
export async function recordExecutionLive(
  fetchImpl: FetchLike,
  body: RecordExecutionRequestBody,
): Promise<WriteOutcome<ExecutionDetailRecord>> {
  const endpoint = "/v1/executions";
  return payloadField(
    await postJson(fetchImpl, endpoint, body),
    endpoint,
    "execution",
    validateExecutionDetail,
  );
}

/** One recorded OBSERVED outcome (verbatim subset the surface renders). */
export interface OutcomeDetailRecord {
  readonly outcomeId: string;
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly statement: string;
  readonly epistemicStatus: string;
  readonly evidenceIds: readonly string[];
}

function validateOutcomeDetail(value: unknown): OutcomeDetailRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("outcome record must be a JSON object");
  }
  for (const field of [
    "outcomeId",
    "executionRecordId",
    "caseId",
    "statement",
    "epistemicStatus",
  ] as const) {
    requireString(value[field], field, defects);
  }
  if (!Array.isArray(value.evidenceIds)) {
    defects.push("evidenceIds must be an array");
  }
  if (defects.length > 0) {
    throw new Error(`outcome record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as OutcomeDetailRecord;
}

/**
 * Record one OBSERVED post-work outcome LIVE —
 * `POST /v1/executions/:id/outcomes` with the EXACT body (optional
 * `captureSessionIds`/`measurementRefs` omitted when absent; `observedAt` +
 * `actor` ride the wire unparsed per the probe contract).
 */
export async function recordOutcomeLive(
  fetchImpl: FetchLike,
  executionRecordId: string,
  body: RecordOutcomeRequestBody,
): Promise<WriteOutcome<OutcomeDetailRecord>> {
  const endpoint = `/v1/executions/${encodeURIComponent(executionRecordId)}/outcomes`;
  return payloadField(
    await postJson(fetchImpl, endpoint, body),
    endpoint,
    "outcome",
    validateOutcomeDetail,
  );
}

/** The full comparison record (verbatim subset the surface renders). */
export interface ComparisonDetailRecord {
  readonly comparisonId: string;
  readonly realityRef: { readonly projectId: string; readonly versionId: string };
  readonly stats: { readonly totalEntries: number; readonly discrepancies: number };
  readonly inputDigest: string;
  readonly computedAt: string;
}

function validateComparisonDetail(value: unknown): ComparisonDetailRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("comparison record must be a JSON object");
  }
  requireString(value.comparisonId, "comparisonId", defects);
  const realityRef = value.realityRef;
  if (!isRecord(realityRef)) {
    defects.push("realityRef must be an object");
  } else {
    requireString(realityRef.projectId, "realityRef.projectId", defects);
    requireString(realityRef.versionId, "realityRef.versionId", defects);
  }
  const stats = value.stats;
  if (!isRecord(stats)) {
    defects.push("stats must be an object");
  } else {
    if (typeof stats.totalEntries !== "number" || !Number.isInteger(stats.totalEntries)) {
      defects.push("stats.totalEntries must be an integer");
    }
    if (typeof stats.discrepancies !== "number" || !Number.isInteger(stats.discrepancies)) {
      defects.push("stats.discrepancies must be an integer");
    }
  }
  requireString(value.inputDigest, "inputDigest", defects);
  requireString(value.computedAt, "computedAt", defects);
  if (defects.length > 0) {
    throw new Error(`comparison record is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as ComparisonDetailRecord;
}

/**
 * Run one reality-vs-design comparison LIVE — `POST /v1/comparisons` with the
 * EXACT nested body (`designReference.sourceOfRecord` five required fields +
 * `items[].properties` REQUIRED possibly empty; optional `tolerances` /
 * `coverage` OMITTED when absent). The full record (stats + inputDigest) is
 * validated.
 */
export async function runComparisonLive(
  fetchImpl: FetchLike,
  body: RunComparisonRequestBody,
): Promise<WriteOutcome<ComparisonDetailRecord>> {
  const endpoint = "/v1/comparisons";
  return payloadField(
    await postJson(fetchImpl, endpoint, body),
    endpoint,
    "comparison",
    validateComparisonDetail,
  );
}

/** Load one full comparison record LIVE — `GET /v1/comparisons/:id`. */
export async function loadComparisonLive(
  fetchImpl: FetchLike,
  comparisonId: string,
): Promise<WriteOutcome<ComparisonDetailRecord>> {
  const endpoint = `/v1/comparisons/${encodeURIComponent(comparisonId)}`;
  return payloadField(
    await fetchJson(fetchImpl, endpoint),
    endpoint,
    "comparison",
    validateComparisonDetail,
  );
}

/** The verified issue→outcome lineage (verbatim subset the surface renders). */
export interface CaseLineageRecord {
  readonly caseId: string;
  readonly executions: readonly {
    readonly executionRecordId: string;
    readonly executedAt: string;
    readonly executedStepIds: readonly string[];
    readonly executionEvidenceIds: readonly string[];
    readonly outcomes: readonly {
      readonly outcomeId: string;
      readonly statement: string;
      readonly epistemicStatus: string;
    }[];
  }[];
}

function validateCaseLineage(value: unknown): CaseLineageRecord {
  const defects: string[] = [];
  if (!isRecord(value)) {
    throw new Error("case lineage must be a JSON object");
  }
  requireString(value.caseId, "caseId", defects);
  if (!Array.isArray(value.executions)) {
    defects.push("executions must be an array");
  } else {
    for (const execution of value.executions) {
      if (!isRecord(execution) || typeof execution.executionRecordId !== "string") {
        defects.push("every lineage execution must carry an executionRecordId");
        break;
      }
    }
  }
  if (defects.length > 0) {
    throw new Error(`case lineage is not structurally valid: ${defects.join("; ")}`);
  }
  return value as unknown as CaseLineageRecord;
}

/**
 * Load the verified issue→outcome lineage LIVE —
 * `GET /v1/executions/lineage/:caseId` (the case id percent-encoded). A
 * missing execution/outcome link is a TYPED refusal surfaced by the backend
 * (`lineage_missing_execution` / `lineage_missing_outcome`), never coerced.
 */
export async function loadCaseLineageLive(
  fetchImpl: FetchLike,
  caseId: string,
): Promise<WriteOutcome<CaseLineageRecord>> {
  const endpoint = `/v1/executions/lineage/${encodeURIComponent(caseId)}`;
  return payloadField(
    await fetchJson(fetchImpl, endpoint),
    endpoint,
    "lineage",
    validateCaseLineage,
  );
}

/* ------------------------------------------------------------------ */
/* BOQ Lens adapters (PROD-010 round 2 — the joined lens input)        */
/* ------------------------------------------------------------------ */

/**
 * One BOQ import summary (`GET /v1/boq/imports` answers a deployment-wide
 * list ordered by importId — the imports carry no project attribution in
 * this API build, the same honest discipline as the case summaries).
 */
export interface BoqImportSummaryRecord {
  readonly importId: string;
  readonly format: string;
  readonly byteSize: number;
  readonly parseStatus: string;
}

/**
 * Load the BOQ import list LIVE (`GET /v1/boq/imports`, same-origin). The
 * listing is deployment-wide and ordered by the service's own order — the
 * CALLER names which import it opens; this adapter never guesses one.
 */
export async function loadBoqImportsLive(
  fetchImpl: FetchLike,
): Promise<
  | { readonly ok: true; readonly imports: readonly BoqImportSummaryRecord[]; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure }
> {
  const endpoint = "/v1/boq/imports";
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!Array.isArray(payload.imports)) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return an imports array` },
    };
  }
  const imports: BoqImportSummaryRecord[] = [];
  for (const entry of payload.imports) {
    if (!isRecord(entry)) {
      return {
        ok: false,
        failure: { kind: "invalid", detail: `${endpoint} returned a non-object import entry` },
      };
    }
    const source = entry.source;
    const parse = entry.parse;
    const importIdOk = typeof entry.importId === "string" && entry.importId.length > 0;
    const formatOk = typeof entry.format === "string" && entry.format.length > 0;
    const byteSizeOk =
      isRecord(source) && typeof source.byteSize === "number" && Number.isInteger(source.byteSize);
    const parseOk = isRecord(parse) && typeof parse.status === "string" && parse.status.length > 0;
    if (!importIdOk || !formatOk || !byteSizeOk || !parseOk) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          detail: `${endpoint} returned a structurally invalid import entry`,
        },
      };
    }
    imports.push({
      importId: entry.importId as string,
      format: entry.format as string,
      byteSize: (source as Record<string, unknown>).byteSize as number,
      parseStatus: (parse as Record<string, unknown>).status as string,
    });
  }
  return { ok: true, imports, endpoint };
}

/**
 * The joined lens input the lens route answers — a STRUCTURAL MIRROR of the
 * boqlens library's `BoqLensInput` (same discipline as that module's own
 * backend mirrors: a real backend record satisfies the shape as-is). The
 * api-level validation pins the load-bearing scalars; the surface renders
 * the items through the frozen library's own pure functions.
 */
export interface BoqLensLiveRecord {
  readonly importId: string;
  readonly sourceName: string;
  readonly dictionaryVersion: string | null;
  readonly mappingVersion: number | null;
  readonly sourceCellRefs: readonly string[];
  readonly items: readonly unknown[];
}

/**
 * Load the JOINED lens input LIVE — `GET /v1/boq/imports/:id/lens`
 * (PROD-010's joined endpoint: import record + derived normalization view +
 * mapping entries, assembled server-side). A 409 `normalization_required`
 * and a 404 `import_not_found` surface as typed failures, never coerced.
 */
export async function loadBoqLensLive(
  fetchImpl: FetchLike,
  importId: string,
): Promise<WriteOutcome<BoqLensLiveRecord>> {
  const endpoint = `/v1/boq/imports/${encodeURIComponent(importId)}/lens`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  if (!isRecord(payload) || !isRecord(payload.lens)) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: `${endpoint} did not return the expected { ok: true, lens } envelope`,
      },
    };
  }
  const lens = payload.lens as Record<string, unknown>;
  const defects: string[] = [];
  if (typeof lens.importId !== "string" || lens.importId.length === 0) {
    defects.push("lens.importId must be a non-empty string");
  }
  if (typeof lens.sourceName !== "string") {
    defects.push("lens.sourceName must be a string");
  }
  if (lens.dictionaryVersion !== null && typeof lens.dictionaryVersion !== "string") {
    defects.push("lens.dictionaryVersion must be a string or null");
  }
  if (lens.mappingVersion !== null && typeof lens.mappingVersion !== "number") {
    defects.push("lens.mappingVersion must be a number or null");
  }
  if (!Array.isArray(lens.sourceCellRefs)) {
    defects.push("lens.sourceCellRefs must be an array");
  }
  if (!Array.isArray(lens.items)) {
    defects.push("lens.items must be an array");
  }
  if (defects.length > 0) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `lens record is not structurally valid: ${defects.join("; ")}` },
    };
  }
  return {
    ok: true,
    record: payload.lens as unknown as BoqLensLiveRecord,
    endpoint,
  };
}

/* ------------------------------------------------------------------ */
/* PROD-017 — the task-first adapter seam (the W-R1/W-R2 contract        */
/* consumption point: decodeX through @aise/adapter-contract)           */
/* ------------------------------------------------------------------ */

import type { TaskFlowBundle, TaskIntentAnswer } from "./task-contract";
import {
  decodeAuthorizationContextAtSeam,
  decodeTaskFlowBundleAtSeam,
  decodeTaskIntentAnswerAtSeam,
  describeContractFailure,
  type AuthorizationContext,
} from "./task-contract";
import type { TaskIntent } from "@aise/adapter-contract";

/**
 * Load the joined TASK-FLOW bundle LIVE — `GET /v1/adapter/projects/:id/task-flow`
 * (same-origin; the PROD-010 joined-endpoint convention applied to the
 * task-first view). The answer's `flow` object is the server's assembly of
 * the shared adapter-contract semantic objects (ProjectContext,
 * RealitySummary, EvidenceSummary, BOQContext, EngineeringCaseSummary,
 * InterventionScenarioSummary, OutcomeSummary, NextBestAction,
 * AuthorizationContext, TaskCapabilityRequirements) — decoded HERE through
 * the contract's own decoders (task-contract.ts), NEVER through per-module
 * local mirror validators: a genuine contract payload passes as-is; a
 * cross-major version or a malformed object is a typed `invalid` failure
 * carrying the contract error verbatim.
 *
 * A 404 is returned as the typed HTTP failure (the caller renders the
 * explicit "task-flow objects not served on this deployment" unavailable
 * state — the honest provider-gated state, never a guess).
 */
export async function loadTaskFlowLive(
  fetchImpl: FetchLike,
  projectId: string,
): Promise<
  | { readonly ok: true; readonly flow: TaskFlowBundle; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure }
> {
  const endpoint = `/v1/adapter/projects/${encodeURIComponent(projectId)}/task-flow`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
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
  return { ok: true, flow: decoded.value, endpoint };
}

/**
 * W-R1: load the server's AuthorizationContext LIVE — `GET
 * /v1/adapter/projects/:id/authorization` (same-origin). Grants and typed
 * denials are decoded through the CONTRACT decoder and rendered verbatim;
 * this seam replaces app-local authorization-semantics validation for the
 * task-first flow (the AISE-040 broker's decision relay in
 * `createLiveAuthorizationPort` is a different, frozen seam that stays).
 */
export async function loadAuthorizationContextLive(
  fetchImpl: FetchLike,
  projectId: string,
): Promise<
  | { readonly ok: true; readonly authorization: AuthorizationContext; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure }
> {
  const endpoint = `/v1/adapter/projects/${encodeURIComponent(projectId)}/authorization`;
  const result = envelopePayload(await fetchJson(fetchImpl, endpoint), endpoint);
  if (!result.ok) {
    return result;
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
  return { ok: true, authorization: decoded.value, endpoint };
}

/**
 * Submit one typed TaskIntent LIVE — `POST /v1/adapter/task-intents`
 * (same-origin) with the intent wire object as the JSON body (the ONE
 * client-authored semantic object, W-R3). The answer is the
 * SERVER-AUTHORITATIVE result: an OperationResult plus the follow-up
 * NextBestAction (or null) — decoded through the contract decoders, never
 * locally re-validated. The adapter renders the status, the typed failure
 * and the result refs verbatim and never resubmits silently.
 */
export async function submitTaskIntentLive(
  fetchImpl: FetchLike,
  intent: TaskIntent,
): Promise<
  | { readonly ok: true; readonly answer: TaskIntentAnswer; readonly endpoint: string }
  | { readonly ok: false; readonly failure: ApiFailure }
> {
  const endpoint = "/v1/adapter/task-intents";
  const result = envelopePayload(await postJson(fetchImpl, endpoint, intent), endpoint);
  if (!result.ok) {
    return result;
  }
  const payload = result.value as Record<string, unknown>;
  const decoded = decodeTaskIntentAnswerAtSeam({
    result: payload.result,
    action: payload.action ?? null,
  });
  if (!decoded.ok) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: describeContractFailure(decoded.failure),
      },
    };
  }
  return { ok: true, answer: decoded.value, endpoint };
}

/** True when a typed failure is an HTTP 404 (a route this build does not serve). */
export function isNotFoundHttp(failure: ApiFailure): boolean {
  return failure.kind === "http" && failure.status === 404;
}

/* ------------------------------------------------------------------ */
/* PROD-034 — the capture-acquisition + BOQ-import seams (issue #9      */
/* gaps 1 + 2: first-class browser ingestion over the EXISTING server  */
/* routes, consumed read-only — the gateway stays the authority)        */
/* ------------------------------------------------------------------ */

/**
 * A sha-256 content-address implementation. The browser build uses Web
 * Crypto (`crypto.subtle.digest`); tests inject deterministic stubs. The
 * digest is a TRANSPORT step only — the capture gateway re-computes the
 * hash over the received bytes and rejects a mismatch (CONTENT_ID_MISMATCH),
 * so a wrong client digest can never corrupt the store.
 */
export type AssetDigest = (bytes: Uint8Array) => Promise<string>;

/** Hex-encode a digest buffer (lowercase, 64 chars for sha-256). */
function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The browser platform's sha-256 digest, or NULL when the platform does not
 * expose one (Web Crypto is absent — e.g. an insecure context). NULL is the
 * honest unavailable state: the surface renders it, never a fallback hash.
 */
export function webCryptoSha256(): AssetDigest | null {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined || subtle === null) {
    return null;
  }
  return async (bytes: Uint8Array): Promise<string> => {
    const digest = await subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
    return toHex(digest);
  };
}

/** The capture gateway's asset-ingest answer (verbatim fields). */
export interface CaptureAssetUploadRecord {
  /** STORED (new bytes) or DUPLICATE (identical bytes already stored). */
  readonly outcome: "STORED" | "DUPLICATE";
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
}

/**
 * Extract the capture surface's OWN rejection envelope. The asset route's
 * typed rejections carry `{ ok:false, reasonCode, reasonDetail }` — a
 * DIFFERENT shape from the standard `{ error, detail }` envelope — so the
 * codes surface here as additive fields, bounded, never coerced.
 */
async function captureRejection(path: string, response: Response): Promise<ApiFailure> {
  const failure: {
    kind: "http";
    status: number;
    detail: string;
    code?: string;
    reason?: string;
  } = {
    kind: "http",
    status: response.status,
    detail: `${path} answered HTTP ${String(response.status)}`,
  };
  let text: string;
  try {
    text = await response.text();
  } catch {
    return failure;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return failure;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return failure;
  }
  const envelope = parsed as Record<string, unknown>;
  if (typeof envelope.reasonCode === "string" && envelope.reasonCode.length > 0) {
    failure.code = boundedText(envelope.reasonCode, CODE_BOUND);
  }
  if (typeof envelope.error === "string" && envelope.error.length > 0) {
    failure.code = boundedText(envelope.error, CODE_BOUND);
  }
  const detailSource =
    typeof envelope.reasonDetail === "string" && envelope.reasonDetail.length > 0
      ? envelope.reasonDetail
      : typeof envelope.detail === "string" && envelope.detail.length > 0
        ? envelope.detail
        : null;
  if (detailSource !== null) {
    failure.reason = boundedText(detailSource, REASON_BOUND);
  }
  return failure;
}

/**
 * Upload ONE asset to the server-side content-addressed store — `POST
 * /v1/capture/assets/:contentId` with the RAW file bytes as the body and
 * the file's media type as Content-Type (the capture gateway's exact
 * contract, consumed read-only). The declared content id is the client's
 * sha-256 of the same bytes; the SERVER re-computes and verifies it
 * (422 CONTENT_ID_MISMATCH), stores the bytes immutably and answers
 * idempotently (STORED | DUPLICATE). This is the browser-appropriate
 * acquisition entry: authoritative evidence ingestion stays entirely
 * server-side.
 */
export async function uploadCaptureAssetLive(
  fetchImpl: FetchLike,
  digest: AssetDigest,
  bytes: Uint8Array,
  mediaType: string,
): Promise<WriteOutcome<CaptureAssetUploadRecord>> {
  const contentId = await digest(bytes);
  const endpoint = `/v1/capture/assets/${contentId}`;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": mediaType },
      body: bytes as unknown as BodyInit,
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "network",
        detail: error instanceof Error ? error.message : "network request failed",
      },
    };
  }
  if (!response.ok) {
    return { ok: false, failure: await captureRejection(endpoint, response) };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return valid JSON` },
    };
  }
  const payload = parsed as Record<string, unknown>;
  if (
    !isRecord(payload) ||
    payload.ok !== true ||
    (payload.outcome !== "STORED" && payload.outcome !== "DUPLICATE") ||
    typeof payload.contentId !== "string" ||
    typeof payload.byteSize !== "number" ||
    typeof payload.mediaType !== "string"
  ) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: `${endpoint} did not return the expected { ok: true, outcome, contentId, byteSize, mediaType } answer`,
      },
    };
  }
  return {
    ok: true,
    record: {
      outcome: payload.outcome,
      contentId: payload.contentId,
      byteSize: payload.byteSize,
      mediaType: payload.mediaType,
    },
    endpoint,
  };
}

/** The BOQ import answer's structural mirror (the fields the import card renders). */
export interface BoqImportRecord {
  readonly importId: string;
  readonly format: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly importedAt: string | null;
  /** parsed | unsupported_format (the route's own two-status vocabulary). */
  readonly parseStatus: string | null;
  /** Total source rows across sheets, when the document is present. */
  readonly rowCount: number | null;
  /** The recorded reason when the source is stored but not parsed (PDF). */
  readonly parseReason: string | null;
}

/**
 * Structurally validate one BOQ import envelope (the route answers
 * `{ ok: true, import: BoqImport }` — the mirror of `backend/boq/model.ts`,
 * typed defects, never coerced).
 */
function validateBoqImport(value: unknown): BoqImportRecord {
  if (!isRecord(value)) {
    throw new Error("import envelope must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.importId !== "string" || record.importId.length === 0) {
    throw new Error("import.importId must be a non-empty string");
  }
  if (typeof record.format !== "string") {
    throw new Error("import.format must be a string");
  }
  const source = record.source;
  if (!isRecord(source)) {
    throw new Error("import.source must be an object");
  }
  if (typeof source.mediaType !== "string") {
    throw new Error("import.source.mediaType must be a string");
  }
  if (typeof source.byteSize !== "number") {
    throw new Error("import.source.byteSize must be a number");
  }
  const importedAt = source.importedAt;
  if (typeof importedAt !== "string") {
    throw new Error("import.source.importedAt must be a string");
  }
  let parseStatus: string | null = null;
  let rowCount: number | null = null;
  let parseReason: string | null = null;
  const parse = record.parse;
  if (isRecord(parse)) {
    if (parse.status !== undefined && typeof parse.status !== "string") {
      throw new Error("import.parse.status must be a string");
    }
    parseStatus = typeof parse.status === "string" ? parse.status : null;
    if (typeof parse.reason === "string") {
      parseReason = parse.reason;
    }
    const document = parse.document;
    if (isRecord(document) && Array.isArray(document.sheets)) {
      let rows = 0;
      for (const sheet of document.sheets) {
        if (isRecord(sheet) && Array.isArray(sheet.rows)) {
          rows += (sheet.rows as unknown[]).length;
        }
      }
      rowCount = rows;
    }
  }
  return {
    importId: record.importId,
    format: record.format,
    mediaType: source.mediaType,
    byteSize: source.byteSize,
    importedAt,
    parseStatus,
    rowCount,
    parseReason,
  };
}

/** The supported source-BOQ formats (the ingestion route's own vocabulary). */
export const BOQ_IMPORT_FORMATS: readonly {
  readonly format: "csv" | "xlsx" | "pdf";
  readonly label: string;
  readonly mediaType: string;
  readonly extensions: readonly string[];
}[] = Object.freeze([
  Object.freeze({
    format: "csv",
    label: "CSV (comma-separated)",
    mediaType: "text/csv",
    extensions: Object.freeze([".csv"]),
  } as const),
  Object.freeze({
    format: "xlsx",
    label: "XLSX (Excel workbook)",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: Object.freeze([".xlsx"]),
  } as const),
  Object.freeze({
    format: "pdf",
    label: "PDF (stored verbatim; not parsed — the route's honest known limit)",
    mediaType: "application/pdf",
    extensions: Object.freeze([".pdf"]),
  } as const),
] as const);

/** The media type of one import format (the route's own mapping). */
export function boqImportMediaType(format: string): string | null {
  const entry = BOQ_IMPORT_FORMATS.find((candidate) => candidate.format === format);
  return entry === undefined ? null : entry.mediaType;
}

/**
 * Import ONE SOURCE BOQ — `POST /v1/boq/imports?format=<format>` with the
 * RAW source bytes as the body (the explicit format override is the route's
 * own authoritative resolution — it WINS over any content-type sniffing, so
 * the operator's declared format is what the server parses). The source
 * bytes are stored content-addressed BEFORE parsing (the route's own
 * contract); a parse failure keeps the bytes and answers 422
 * `boq_parse_failed` with the failing part. Identical bytes are idempotent
 * (identical importId). The SOURCE BOQ is never overwritten by anything the
 * browser does — derived normalization/mapping are separate server-owned
 * projections.
 */
export async function importBoqSourceLive(
  fetchImpl: FetchLike,
  bytes: Uint8Array,
  format: "csv" | "xlsx" | "pdf",
): Promise<WriteOutcome<BoqImportRecord>> {
  const mediaType = boqImportMediaType(format);
  if (mediaType === null) {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `unknown BOQ import format ${format}` },
    };
  }
  const endpoint = `/v1/boq/imports?format=${format}`;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": mediaType },
      body: bytes as unknown as BodyInit,
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "network",
        detail: error instanceof Error ? error.message : "network request failed",
      },
    };
  }
  if (!response.ok) {
    return { ok: false, failure: await httpFailure(endpoint, response) };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      failure: { kind: "invalid", detail: `${endpoint} did not return valid JSON` },
    };
  }
  const payload = parsed as Record<string, unknown>;
  // The route answers the import envelope directly (canonical JSON) or the
  // standard { ok: true, import } wrapper — both are accepted structurally,
  // never guessed beyond the recorded shapes.
  const candidate = isRecord(payload) && payload.ok === true && isRecord(payload.import)
    ? payload.import
    : payload;
  try {
    return { ok: true, record: validateBoqImport(candidate), endpoint };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        detail: error instanceof Error ? error.message : "import envelope failed validation",
      },
    };
  }
}
