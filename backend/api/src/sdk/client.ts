/**
 * AISE-038 — Developer API/SDK: the TYPED CLIENT BUILDERS.
 *
 * Request constructors for the registered HTTP operations — nothing more.
 * The builders are a CONTRACT LAYER: every path is DERIVED from the
 * operation registry by stable operation id (a typo is a typed
 * `unknown_operation` refusal, never a silently wrong URL), and every
 * builder enforces the documented conventions:
 *
 *  - STABLE-ID CONVENTION: `caller-stable-id` operations REQUIRE their
 *    caller-supplied id (the registry's `stableIdField`); a missing or
 *    empty id is a typed `stable_id_required` refusal — the client never
 *    sends an unidentifiable create that the domain would have to guess
 *    an id for (and never encourages blind retries).
 *  - GET-LITERAL READS: GET requests carry NO body, by construction and
 *    by defensive check at materialization time.
 *  - PATH PARAMETERS are URI-encoded and required (a missing parameter
 *    is a typed `path_parameter_required` refusal naming it).
 *
 * The builders construct REQUESTS; they never execute them and never
 * interpret responses — execution belongs to the caller's transport
 * (e.g. `sdkRequestToFetchRequest` + fetch against the deployed API).
 * Input types are TYPE-ONLY imports from the owning domain models: the
 * wire shapes stay owned by the authorities.
 */

import type { SyncBatch } from "@aise/shared-contracts";
import type { ChangeRecord } from "../reality/model";
import type {
  CreateCaseInput,
  AddObservationInput,
  AddHypothesisInput,
  AddMissingEvidenceInput,
  SubmitReviewInput,
} from "../cases/model";
import type {
  CreateScenarioInput,
  AddStepInput,
  ApprovalReferenceInput,
} from "../intervention/model";
import type { GraphSnapshot, ManualMappingInput } from "../boq/mapping/model";
import {
  type SdkContract,
  type SdkHttpMethod,
  type SdkHttpOperation,
} from "./model";

/* ------------------------------------------------------------------ */
/* Request descriptor + materializer                                    */
/* ------------------------------------------------------------------ */

export type SdkRequestBody =
  | { readonly kind: "none" }
  | { readonly kind: "json"; readonly text: string }
  | {
      readonly kind: "bytes";
      readonly bytes: Uint8Array;
      readonly contentType: string;
    };

/** One constructed API call (transport-agnostic). */
export interface SdkRequest {
  readonly method: SdkHttpMethod;
  /** Path (with query string when the operation has one). */
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: SdkRequestBody;
}

export const SDK_CLIENT_ERROR_CODES = Object.freeze([
  "unknown_operation",
  "path_parameter_required",
  "stable_id_required",
  "get_has_no_body",
] as const);
export type SdkClientErrorCode = (typeof SDK_CLIENT_ERROR_CODES)[number];

export class SdkClientError extends Error {
  readonly code: SdkClientErrorCode;
  readonly detail: string;

  constructor(code: SdkClientErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SdkClientError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Materialize one constructed call as a fetch API `Request`. GET requests
 * are defended literally: a GET with a body is a typed refusal (it can
 * only happen through deliberate descriptor misuse).
 */
export function sdkRequestToFetchRequest(
  sdkRequest: SdkRequest,
  baseUrl: string = "http://localhost",
): Request {
  if (sdkRequest.method === "GET" && sdkRequest.body.kind !== "none") {
    throw new SdkClientError(
      "get_has_no_body",
      "GET requests are literal reads — a GET call must not carry a request body",
    );
  }
  const headers: Record<string, string> = { ...sdkRequest.headers };
  let body: Uint8Array | string | undefined;
  switch (sdkRequest.body.kind) {
    case "none":
      body = undefined;
      break;
    case "json":
      headers["content-type"] ??= "application/json; charset=utf-8";
      body = sdkRequest.body.text;
      break;
    case "bytes":
      headers["content-type"] = sdkRequest.body.contentType;
      body = sdkRequest.body.bytes;
      break;
  }
  return new Request(`${baseUrl}${sdkRequest.path}`, {
    method: sdkRequest.method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

/* ------------------------------------------------------------------ */
/* Builder internals (registry-derived, convention-enforcing)           */
/* ------------------------------------------------------------------ */

/** Bind one registered HTTP operation by stable id (typed refusal when unknown). */
function httpOperationOf(contract: SdkContract, operationId: string): SdkHttpOperation {
  const operation = contract.operationById(operationId);
  if (operation === undefined) {
    throw new SdkClientError(
      "unknown_operation",
      `operation '${operationId}' is not registered in this contract`,
    );
  }
  if (operation.transport !== "http") {
    throw new SdkClientError(
      "unknown_operation",
      `operation '${operationId}' is registered with transport '${operation.transport}' — ` +
        `only HTTP operations have request builders`,
    );
  }
  return operation;
}

/** Interpolate + URI-encode path parameters into a registered template. */
function fillPath(
  operationId: string,
  template: string,
  params: Record<string, string>,
): string {
  const segments = template
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => {
      if (!segment.startsWith(":")) {
        return segment;
      }
      const name = segment.slice(1);
      const value = params[name];
      if (typeof value !== "string" || value.length === 0) {
        throw new SdkClientError(
          "path_parameter_required",
          `operation '${operationId}' requires path parameter ':${name}'`,
        );
      }
      return encodeURIComponent(value);
    });
  return `/${segments.join("/")}`;
}

/**
 * Enforce the stable-id convention: a `caller-stable-id` operation REQUIRES
 * a non-empty caller-supplied id in the registry's documented field.
 */
function requireStableId(
  operation: SdkHttpOperation,
  id: string | undefined,
): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new SdkClientError(
      "stable_id_required",
      `operation '${operation.id}' carries the caller-stable-id convention: supply a ` +
        `non-empty '${operation.idField}' — replaying the same id is refused by the ` +
        `domain as a typed duplicate, and an id-less create is never sent`,
    );
  }
  return id;
}

interface BuilderDeps {
  readonly contract: SdkContract;
}

function getRequest(
  deps: BuilderDeps,
  operationId: string,
  params: Record<string, string>,
): SdkRequest {
  const operation = httpOperationOf(deps.contract, operationId);
  return {
    method: operation.method,
    path: fillPath(operationId, operation.path, params),
    headers: {},
    body: { kind: "none" },
  };
}

function postJson(
  deps: BuilderDeps,
  operationId: string,
  params: Record<string, string>,
  payload: unknown,
): SdkRequest {
  const operation = httpOperationOf(deps.contract, operationId);
  return {
    method: operation.method,
    path: fillPath(operationId, operation.path, params),
    headers: {},
    body: { kind: "json", text: JSON.stringify(payload) },
  };
}

/** POST operations that take no request body (the routes read no body). */
function postNone(
  deps: BuilderDeps,
  operationId: string,
  params: Record<string, string>,
): SdkRequest {
  const operation = httpOperationOf(deps.contract, operationId);
  return {
    method: operation.method,
    path: fillPath(operationId, operation.path, params),
    headers: {},
    body: { kind: "none" },
  };
}

/* ------------------------------------------------------------------ */
/* The typed client surface (one builder namespace per domain)          */
/* ------------------------------------------------------------------ */

/** Capture ingestion builders (AISE-004 routes). */
export interface SdkCaptureClient {
  /** POST /v1/capture/assets/:contentId — raw content-addressed upload. */
  uploadAsset(input: {
    contentId: string;
    bytes: Uint8Array;
    mediaType: string;
  }): SdkRequest;
  /** POST /v1/capture/sync — SyncBatch ingestion (idempotency-keyed). */
  syncSession(batch: SyncBatch): SdkRequest;
  /** GET /v1/capture/sessions/:sessionId — stored session projection. */
  getSession(sessionId: string): SdkRequest;
}

/** Reality Graph builders (AISE-016 routes). */
export interface SdkRealityClient {
  /** POST /v1/reality/projects — caller-stable projectId; replay refused. */
  createProject(input: { projectId: string }): SdkRequest;
  /** GET /v1/reality/projects/:projectId — header + version list. */
  getProject(projectId: string): SdkRequest;
  /** GET /v1/reality/projects/:projectId/versions/:versionId — full snapshot. */
  getVersion(input: { projectId: string; versionId: string }): SdkRequest;
  /** POST /v1/reality/projects/:projectId/changes — append one version. */
  applyChanges(input: { projectId: string; changes: readonly ChangeRecord[] }): SdkRequest;
  /** GET /v1/reality/projects/:projectId/nodes/:nodeId — node history. */
  getNodeHistory(input: { projectId: string; nodeId: string }): SdkRequest;
}

/** BOQ builders (AISE-011/014/017 routes). */
export interface SdkBoqClient {
  /** POST /v1/boq/imports?format= — raw source upload (content-addressed). */
  importSource(input: {
    format: "xlsx" | "csv" | "pdf";
    bytes: Uint8Array;
  }): SdkRequest;
  /** GET /v1/boq/imports — list imports. */
  listImports(): SdkRequest;
  /** GET /v1/boq/imports/:importId — one import + document. */
  getImport(importId: string): SdkRequest;
  /** GET /v1/boq/imports/:importId/source — raw preserved bytes. */
  getSource(importId: string): SdkRequest;
  /** POST /v1/boq/imports/:importId/normalization — run derived view. */
  runNormalization(importId: string): SdkRequest;
  /** GET /v1/boq/imports/:importId/normalization — stored derived view. */
  getNormalization(importId: string): SdkRequest;
  /** POST /v1/boq/imports/:importId/mappings — run matcher (append). */
  runMatcher(input: { importId: string; graphSnapshot: GraphSnapshot }): SdkRequest;
  /** GET /v1/boq/imports/:importId/mappings — latest mapping version. */
  getLatestMapping(importId: string): SdkRequest;
  /** POST /v1/boq/imports/:importId/mappings/manual — one manual decision. */
  applyManualMapping(input: {
    importId: string;
    decision: ManualMappingInput;
  }): SdkRequest;
  /** GET /v1/boq/imports/:importId/mappings/:version — one explicit version. */
  getMappingVersion(input: { importId: string; version: number | string }): SdkRequest;
}

/** Engineering Case builders (AISE-025 routes). */
export interface SdkCasesClient {
  /** POST /v1/cases — caller-stable caseId; replay refused as case_exists. */
  createCase(input: CreateCaseInput): SdkRequest;
  /** GET /v1/cases — list summaries. */
  listCases(): SdkRequest;
  /** GET /v1/cases/:caseId — full case record. */
  getCase(caseId: string): SdkRequest;
  /** POST /v1/cases/:caseId/observations — add an OBSERVED fact. */
  addObservation(input: {
    caseId: string;
    observation: AddObservationInput;
  }): SdkRequest;
  /** POST /v1/cases/:caseId/hypotheses — add an interpretation. */
  addHypothesis(input: { caseId: string; hypothesis: AddHypothesisInput }): SdkRequest;
  /** POST /v1/cases/:caseId/missing-evidence — declare a gap. */
  addMissingEvidence(input: {
    caseId: string;
    missing: AddMissingEvidenceInput;
  }): SdkRequest;
  /** POST .../missing-evidence/:missingId/collect — mark collected. */
  collectEvidence(input: { caseId: string; missingId: string }): SdkRequest;
  /** POST .../missing-evidence/:missingId/waive — waive (note required). */
  waiveEvidence(input: { caseId: string; missingId: string; note: string }): SdkRequest;
  /** POST /v1/cases/:caseId/review — submit human review. */
  submitReview(input: { caseId: string; review: SubmitReviewInput }): SdkRequest;
  /** POST /v1/cases/:caseId/resolve — resolve (approved review required). */
  resolveCase(caseId: string): SdkRequest;
}

/** Intervention Studio builders (AISE-026 routes). */
export interface SdkInterventionsClient {
  /** POST /v1/interventions — caller-stable scenarioId; replay refused. */
  createScenario(
    input: Omit<CreateScenarioInput, "baseline">,
  ): SdkRequest;
  /** GET /v1/interventions — list scenario summaries. */
  listScenarios(): SdkRequest;
  /** GET /v1/interventions/:scenarioId — full scenario record. */
  getScenario(scenarioId: string): SdkRequest;
  /** POST /v1/interventions/:scenarioId/steps — append step + state layer. */
  addStep(input: { scenarioId: string; step: AddStepInput }): SdkRequest;
  /** GET /v1/interventions/:scenarioId/states/:selector — one state layer. */
  getState(input: { scenarioId: string; selector: number | "latest" }): SdkRequest;
  /** POST /v1/interventions/:scenarioId/approval-reference — record review ref. */
  recordApprovalReference(input: {
    scenarioId: string;
    reference: ApprovalReferenceInput;
  }): SdkRequest;
  /** POST /v1/interventions/:scenarioId/status — governed transition. */
  transitionStatus(input: { scenarioId: string; status: string }): SdkRequest;
}

export interface SdkClient {
  readonly capture: SdkCaptureClient;
  readonly reality: SdkRealityClient;
  readonly boq: SdkBoqClient;
  readonly cases: SdkCasesClient;
  readonly interventions: SdkInterventionsClient;
}

const BOQ_FORMAT_MEDIA_TYPES: Readonly<Record<"xlsx" | "csv" | "pdf", string>> = Object.freeze({
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pdf: "application/pdf",
});

/**
 * Create the typed client over a contract (defaults to the shipped
 * SDK_CONTRACT). Every builder resolves its route from the registry at
 * call time, so a client and its contract can never disagree about a
 * path — and the stable-id / GET-literal conventions are enforced on
 * every constructed call.
 */
export function createSdkClient(contract: SdkContract): SdkClient {
  const deps: BuilderDeps = { contract };
  return {
    capture: {
      uploadAsset: ({ contentId, bytes, mediaType }) => {
        const operation = httpOperationOf(contract, "capture.assets.upload");
        if (typeof contentId !== "string" || contentId.length === 0) {
          throw new SdkClientError(
            "path_parameter_required",
            "operation 'capture.assets.upload' requires path parameter ':contentId'",
          );
        }
        return {
          method: operation.method,
          path: fillPath("capture.assets.upload", operation.path, { contentId }),
          headers: {},
          body: { kind: "bytes", bytes, contentType: mediaType },
        };
      },
      syncSession: (batch) =>
        postJson(deps, "capture.sync.upload", {}, batch),
      getSession: (sessionId) =>
        getRequest(deps, "capture.sessions.get", { sessionId }),
    },
    reality: {
      createProject: ({ projectId }) => {
        const operation = httpOperationOf(contract, "reality.projects.create");
        requireStableId(operation, projectId);
        return postJson(deps, "reality.projects.create", {}, { projectId });
      },
      getProject: (projectId) =>
        getRequest(deps, "reality.projects.get", { projectId }),
      getVersion: ({ projectId, versionId }) =>
        getRequest(deps, "reality.projects.versions.get", { projectId, versionId }),
      applyChanges: ({ projectId, changes }) =>
        postJson(deps, "reality.projects.changes.apply", { projectId }, { changes }),
      getNodeHistory: ({ projectId, nodeId }) =>
        getRequest(deps, "reality.projects.nodes.get", { projectId, nodeId }),
    },
    boq: {
      importSource: ({ format, bytes }) => {
        const operation = httpOperationOf(contract, "boq.imports.upload");
        const mediaType = BOQ_FORMAT_MEDIA_TYPES[format];
        if (mediaType === undefined) {
          throw new SdkClientError(
            "unknown_operation",
            `boq.imports.upload cannot build a '${String(format)}' source — the format ` +
              `must be xlsx, csv or pdf`,
          );
        }
        return {
          method: operation.method,
          path: `${fillPath("boq.imports.upload", operation.path, {})}?format=${encodeURIComponent(format)}`,
          headers: {},
          body: { kind: "bytes", bytes, contentType: mediaType },
        };
      },
      listImports: () => getRequest(deps, "boq.imports.list", {}),
      getImport: (importId) => getRequest(deps, "boq.imports.get", { importId }),
      getSource: (importId) => getRequest(deps, "boq.imports.source.get", { importId }),
      runNormalization: (importId) =>
        postNone(deps, "boq.imports.normalization.run", { importId }),
      getNormalization: (importId) =>
        getRequest(deps, "boq.imports.normalization.get", { importId }),
      runMatcher: ({ importId, graphSnapshot }) =>
        postJson(
          deps,
          "boq.imports.mappings.run",
          { importId },
          { nodes: graphSnapshot.nodes },
        ),
      getLatestMapping: (importId) =>
        getRequest(deps, "boq.imports.mappings.latest", { importId }),
      applyManualMapping: ({ importId, decision }) =>
        postJson(deps, "boq.imports.mappings.manual", { importId }, decision),
      getMappingVersion: ({ importId, version }) =>
        getRequest(deps, "boq.imports.mappings.version", {
          importId,
          version: String(version),
        }),
    },
    cases: {
      createCase: (input) => {
        const operation = httpOperationOf(contract, "cases.create");
        requireStableId(operation, input?.caseId);
        return postJson(deps, "cases.create", {}, input);
      },
      listCases: () => getRequest(deps, "cases.list", {}),
      getCase: (caseId) => getRequest(deps, "cases.get", { caseId }),
      addObservation: ({ caseId, observation }) =>
        postJson(deps, "cases.observations.add", { caseId }, observation),
      addHypothesis: ({ caseId, hypothesis }) =>
        postJson(deps, "cases.hypotheses.add", { caseId }, hypothesis),
      addMissingEvidence: ({ caseId, missing }) =>
        postJson(deps, "cases.missingEvidence.add", { caseId }, missing),
      collectEvidence: ({ caseId, missingId }) =>
        postNone(deps, "cases.missingEvidence.collect", { caseId, missingId }),
      waiveEvidence: ({ caseId, missingId, note }) =>
        postJson(deps, "cases.missingEvidence.waive", { caseId, missingId }, { note }),
      submitReview: ({ caseId, review }) =>
        postJson(deps, "cases.review.submit", { caseId }, review),
      resolveCase: (caseId) => postNone(deps, "cases.resolve", { caseId }),
    },
    interventions: {
      createScenario: (input) => {
        const operation = httpOperationOf(contract, "interventions.create");
        requireStableId(operation, input?.scenarioId);
        return postJson(deps, "interventions.create", {}, input);
      },
      listScenarios: () => getRequest(deps, "interventions.list", {}),
      getScenario: (scenarioId) =>
        getRequest(deps, "interventions.get", { scenarioId }),
      addStep: ({ scenarioId, step }) =>
        postJson(deps, "interventions.steps.add", { scenarioId }, step),
      getState: ({ scenarioId, selector }) =>
        getRequest(deps, "interventions.states.get", {
          scenarioId,
          index: String(selector),
        }),
      recordApprovalReference: ({ scenarioId, reference }) =>
        postJson(deps, "interventions.approvalReference.record", { scenarioId }, reference),
      transitionStatus: ({ scenarioId, status }) =>
        postJson(deps, "interventions.status.transition", { scenarioId }, { status }),
    },
  };
}
