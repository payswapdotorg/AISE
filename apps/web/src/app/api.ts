/**
 * PROD-002 — the same-origin API seam of the product web shell.
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

import type { RealityPaneView } from "../shell";
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
  | { readonly kind: "http"; readonly status: number; readonly detail: string }
  | { readonly kind: "invalid"; readonly detail: string };

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
      failure: {
        kind: "http",
        status: response.status,
        detail: `${path} answered HTTP ${String(response.status)}`,
      },
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
 * (`GET /v1/identity/organizations/:orgId/projects`, same-origin).
 */
export async function loadProjectsLive(
  fetchImpl: FetchLike,
  organizationId: string,
): Promise<
  | { ok: true; projects: readonly LiveRecord<ProjectRecord>[] }
  | { ok: false; failure: ApiFailure }
> {
  const endpoint = `/v1/identity/organizations/${encodeURIComponent(organizationId)}/projects`;
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
    case "http":
      return failure.detail;
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
