/**
 * PROD-008 — Apify OPTIONAL web-acquisition connector: the ADAPTER.
 *
 * An injected implementation of the AISE-037 `StorageDocumentAdapter` port
 * (the IncumbentAdapter family member for acquisition-class systems that
 * exchange documents). The full port contract is honored:
 *
 *  - OPTIONAL / DISABLED BY DEFAULT: the connector refuses with a typed
 *    `disabled` outcome BEFORE any HTTP traffic when `enabled=false`. The
 *    product — and the golden demo — work without Apify; this package adds
 *    ZERO npm dependencies (the global fetch, injectable for tests).
 *  - CREDENTIAL ISOLATION: the config token is read exactly once per HTTP
 *    request, to build the `authorization: Bearer <token>` header — and
 *    nowhere else. It never appears in any URL, query string, body, outcome,
 *    provenance, failure detail or status probe (structurally tested).
 *  - PROVENANCE VERBATIM (R14): import requests name incumbent record ids
 *    (actor run ids / dataset ids) VERBATIM. `sourceOfRecord.sourceRecordId`
 *    is the id AS NAMED; run/dataset/actor identities ride verbatim in the
 *    evidence `sourceMetadata`; the AISE content id (sha-256 of the served
 *    bytes) is ADDED alongside, never substituted. Imports are EVIDENCE,
 *    never canonical writes.
 *  - NO CLOCK OF ITS OWN: every timestamp comes from the injected execution
 *    clock (syncId/attempt/clock — the sync engine's stamps).
 *  - TYPED OUTCOMES ONLY: nothing throws across the boundary. The detailed
 *    Apify failure family (quota_exceeded / rate_limited / disabled /
 *    invalid_actor / network_error) is total over the observable exchange
 *    and maps through the frozen table in ./model into the AISE-037 taxonomy.
 *  - DESCRIPTOR HONESTY: the descriptor declares ONLY what this connector
 *    can do — `import-documents` + `query-status` under `storage-document`.
 *    Apify is acquisition-ONLY: `export-derived` is honestly OMITTED, and
 *    the export port method answers with a typed CONTRACT_VIOLATION refusal
 *    (zero HTTP) if it is ever called anyway.
 */

import { sha256Hex } from "../../lib/hash";
import type {
  StorageDocumentAdapter,
  StorageDocumentExportRequest,
  StorageDocumentImportRequest,
  SyncContext,
  SyncExecution,
} from "../adapter";
import type {
  AdapterDescriptor,
  CanonicalSnapshotRef,
  ConnectorStatus,
  ExportOutcome,
  ImportOutcome,
  ImportRecordOutcome,
  SourceOfRecordIdentity,
} from "../model";
import { checkScope } from "../permissions";
import { scopeRefusal } from "../reference/internal";
import {
  APIFY_CONNECTOR_ID,
  APIFY_CONNECTOR_VERSION,
  APIFY_SYSTEM_CLASS,
  apifyConnectorConfig,
  apifyFailureToIntegrationFailure,
  toPortImportOutcome,
  type ApifyConnectorConfig,
  type ApifyConnectorFailure,
  type ApifyImportOutcome,
} from "./model";

/* ------------------------------------------------------------------ */
/* Injectable fetch seam (adapters own their I/O)                       */
/* ------------------------------------------------------------------ */

/** Minimal fetch shape — injectable for deterministic tests. */
export type ApifyFetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<Response>;

export interface ApifyConnectorDeps {
  /**
   * Fetch implementation (default: the global fetch). Tests inject the
   * deterministic recorder from ./testkit — no network anywhere.
   */
  readonly fetchImpl?: ApifyFetch;
}

/* ------------------------------------------------------------------ */
/* The detailed (Apify-typed) import request                            */
/* ------------------------------------------------------------------ */

/**
 * The acquisition request on the connector's detailed typed surface. Ids are
 * the VERBATIM incumbent record ids — never re-keyed, merged or normalized:
 *
 *  - `runIds`    each names an actor RUN; the run object is fetched first and
 *                its `defaultDatasetId` (plus the actor id) ride VERBATIM in
 *                the imported record's provenance metadata;
 *  - `datasetIds` each names a dataset whose items are fetched directly.
 *
 * The PORT method (`importDocuments`) maps its `documentIds` onto
 * `datasetIds` — the port's uniform id list is the direct-dataset form.
 */
export interface ApifyAcquisitionRequest {
  readonly port: typeof APIFY_SYSTEM_CLASS;
  readonly direction: "import";
  readonly context: SyncContext;
  readonly runIds: readonly string[];
  readonly datasetIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* HTTP exchange classification (pure, total, deterministic)            */
/* ------------------------------------------------------------------ */

type ApifyHttpExchange =
  | { readonly kind: "ok"; readonly response: Response }
  | { readonly kind: "transport-error"; readonly error: unknown };

type ClassifiedExchange =
  | { readonly kind: "content"; readonly response: Response }
  | { readonly kind: "failure"; readonly failure: ApifyConnectorFailure }
  | { readonly kind: "invalid-source"; readonly status: number };

/** The disabled detail (shared by import + status probe — zero HTTP). */
const DISABLED_DETAIL =
  "the apify connector is disabled by configuration (enabled=false) — this optional " +
  "third-party acquisition connector is off; no HTTP traffic was attempted and the product " +
  "works without Apify";

function quotaFailure(instanceId: string): ApifyConnectorFailure {
  return {
    code: "quota_exceeded",
    httpStatus: 402,
    detail:
      `apify free-plan quota exhausted (HTTP 402 Payment Required) on instance '${instanceId}': ` +
      "the monthly usage limit of the account's plan is used up — upgrade the plan or wait " +
      "for the quota reset; the import was aborted and no further records were fetched",
  };
}

function rateLimitFailure(instanceId: string, retryAfterSeconds: number | null): ApifyConnectorFailure {
  const retryNote =
    retryAfterSeconds === null
      ? "no retry-after interval was served"
      : `retry-after: ${retryAfterSeconds}s`;
  return {
    code: "rate_limited",
    httpStatus: 429,
    retryAfterSeconds,
    detail:
      `apify rate limit hit (HTTP 429 Too Many Requests) on instance '${instanceId}' — ${retryNote}; ` +
      "the import was aborted and no further records were fetched",
  };
}

function transportFailure(error: unknown): ApifyConnectorFailure {
  return {
    code: "network_error",
    httpStatus: null,
    detail: `the apify endpoint could not be reached (${describeTransportError(error)})`,
  };
}

function unexpectedStatusFailure(status: number, instanceId: string): ApifyConnectorFailure {
  return {
    code: "network_error",
    httpStatus: status,
    detail:
      `unexpected HTTP status ${status} from the apify endpoint (instance '${instanceId}') — ` +
      "outside the classified family (402 quota, 429 rate limit, 400/404/410 invalid record); " +
      "treated as transport-tier and not retried by the connector",
  };
}

function describeTransportError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/** Parse the `retry-after` response header (integer seconds; null otherwise). */
function parseRetryAfter(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

/**
 * Classify one completed HTTP exchange. 200 → content; 402 → quota_exceeded;
 * 429 → rate_limited (+ retry-after); 400/404/410 → invalid-source (the
 * caller decides whether that aborts the named record or the call); fetch
 * rejection and every other status → network_error (transport-tier).
 */
function classifyExchange(exchange: ApifyHttpExchange, instanceId: string): ClassifiedExchange {
  if (exchange.kind === "transport-error") {
    return { kind: "failure", failure: transportFailure(exchange.error) };
  }
  const status = exchange.response.status;
  if (status === 200) {
    return { kind: "content", response: exchange.response };
  }
  if (status === 402) {
    return { kind: "failure", failure: quotaFailure(instanceId) };
  }
  if (status === 429) {
    return { kind: "failure", failure: rateLimitFailure(instanceId, parseRetryAfter(exchange.response)) };
  }
  if (status === 400 || status === 404 || status === 410) {
    return { kind: "invalid-source", status };
  }
  return { kind: "failure", failure: unexpectedStatusFailure(status, instanceId) };
}

/**
 * Read the run descriptor out of a 200 actor-run body (Apify API v2 envelope
 * `{ data: { defaultDatasetId, actId } }`). Null when the body is not a
 * usable run object — an honest per-record refusal, never a throw.
 */
function readRunDescriptor(
  body: string,
): { readonly defaultDatasetId: string; readonly actId: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const data = (parsed as Record<string, unknown>)["data"];
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const defaultDatasetId = record["defaultDatasetId"];
  const actId = record["actId"];
  if (typeof defaultDatasetId !== "string" || defaultDatasetId.length === 0) {
    return null;
  }
  return {
    defaultDatasetId,
    actId: typeof actId === "string" ? actId : null,
  };
}

/* ------------------------------------------------------------------ */
/* The connector                                                        */
/* ------------------------------------------------------------------ */

/**
 * The OPTIONAL Apify acquisition connector — an injected implementation of
 * the `StorageDocumentAdapter` port. NOT registered anywhere by this package
 * (wiring is the Lead's / PROD-010's scope); the connector is constructed
 * disabled unless explicitly enabled by configuration.
 */
export class ApifyConnector implements StorageDocumentAdapter {
  readonly descriptor: AdapterDescriptor = {
    adapterId: APIFY_CONNECTOR_ID,
    systemClass: APIFY_SYSTEM_CLASS,
    displayName:
      "Apify web-acquisition connector (optional third-party; import-only; disabled by default)",
    capabilities: ["import-documents", "query-status"],
    version: APIFY_CONNECTOR_VERSION,
  };

  /** Test instrumentation: port calls actually executed. */
  public readonly calls = { import: 0, export: 0, status: 0 };

  /** Lineage memory: content id → sync id of the FIRST import. */
  private readonly firstImportSync = new Map<string, string>();

  private readonly config: ApifyConnectorConfig;
  private readonly fetchImpl: ApifyFetch;
  private readonly baseUrl: string;

  constructor(config: ApifyConnectorConfig, deps: ApifyConnectorDeps = {}) {
    // Re-run the config invariants (a hand-built literal gets the same typed
    // construction refusal as a factory misuse — never a silent bad config).
    this.config = apifyConnectorConfig(config);
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.baseUrl = this.config.baseUrl.replace(/\/+$/, "");
  }

  /* ------------------ the detailed typed surface ------------------- */

  /**
   * The Apify-typed import: the connector's own surface (the port method
   * below delegates here). Scope enforcement lives at the PORT (defense in
   * depth with the sync engine's pre-check); this surface owns the Apify
   * protocol: disabled refusal, verbatim-id validation, per-record fetches,
   * content-addressed duplicates, and the total failure family.
   */
  async importAcquisition(
    request: ApifyAcquisitionRequest,
    execution: SyncExecution,
  ): Promise<ApifyImportOutcome> {
    this.calls.import += 1;

    if (!this.config.enabled) {
      return { kind: "failure", failure: { code: "disabled", detail: DISABLED_DETAIL } };
    }

    const instanceId = request.context.sourceSystem.systemInstanceId;
    const allIds = [
      ...request.runIds.map((id) => ({ id, kind: "actor run" as const })),
      ...request.datasetIds.map((id) => ({ id, kind: "dataset" as const })),
    ];
    for (let index = 0; index < allIds.length; index += 1) {
      const entry = allIds[index];
      if (entry === undefined || entry.id.trim().length === 0) {
        return {
          kind: "failure",
          failure: {
            code: "invalid_actor",
            detail:
              `the import request names a blank incumbent record id (position ${index}, ` +
              `${entry?.kind ?? "record"}) — actor run ids / dataset ids are carried VERBATIM ` +
              "into the request path and must be non-blank",
          },
        };
      }
    }

    const records: ImportRecordOutcome[] = [];
    for (const runId of request.runIds) {
      const runExchange = await this.getJson(this.actorRunUrl(runId));
      const runClassified = classifyExchange(runExchange, instanceId);
      if (runClassified.kind === "failure") {
        return { kind: "failure", failure: runClassified.failure };
      }
      if (runClassified.kind === "invalid-source") {
        records.push({
          status: "failed",
          sourceRecordId: runId,
          failure: {
            code: "SOURCE_NOT_FOUND",
            detail:
              `apify invalid_actor (HTTP ${runClassified.status}): actor run '${runId}' was ` +
              `refused by instance '${instanceId}' — the named run does not exist or is not accessible`,
          },
        });
        continue;
      }
      const runBody = await runClassified.response.text();
      const descriptor = readRunDescriptor(runBody);
      if (descriptor === null) {
        records.push({
          status: "failed",
          sourceRecordId: runId,
          failure: {
            code: "SOURCE_NOT_FOUND",
            detail:
              `apify invalid_actor: actor run '${runId}' on instance '${instanceId}' returned ` +
              "a run object without a usable default dataset",
          },
        });
        continue;
      }
      const itemsExchange = await this.getJson(this.datasetItemsUrl(descriptor.defaultDatasetId));
      const itemsClassified = classifyExchange(itemsExchange, instanceId);
      if (itemsClassified.kind === "failure") {
        return { kind: "failure", failure: itemsClassified.failure };
      }
      if (itemsClassified.kind === "invalid-source") {
        records.push({
          status: "failed",
          sourceRecordId: runId,
          failure: {
            code: "SOURCE_NOT_FOUND",
            detail:
              `apify invalid_actor (HTTP ${itemsClassified.status}): the default dataset ` +
              `'${descriptor.defaultDatasetId}' of actor run '${runId}' was refused by ` +
              `instance '${instanceId}'`,
          },
        });
        continue;
      }
      const sourceMetadata: Record<string, string> = {
        "apify.runId": runId,
        "apify.datasetId": descriptor.defaultDatasetId,
      };
      if (descriptor.actId !== null) {
        sourceMetadata["apify.actorId"] = descriptor.actId;
      }
      records.push(
        await this.evidenceRecord(
          runId,
          itemsClassified.response,
          sourceMetadata,
          request.context,
          execution,
        ),
      );
    }

    for (const datasetId of request.datasetIds) {
      const exchange = await this.getJson(this.datasetItemsUrl(datasetId));
      const classified = classifyExchange(exchange, instanceId);
      if (classified.kind === "failure") {
        return { kind: "failure", failure: classified.failure };
      }
      if (classified.kind === "invalid-source") {
        records.push({
          status: "failed",
          sourceRecordId: datasetId,
          failure: {
            code: "SOURCE_NOT_FOUND",
            detail:
              `apify invalid_actor (HTTP ${classified.status}): dataset '${datasetId}' was ` +
              `refused by instance '${instanceId}' — the named dataset does not exist or is not accessible`,
          },
        });
        continue;
      }
      records.push(
        await this.evidenceRecord(
          datasetId,
          classified.response,
          { "apify.datasetId": datasetId },
          request.context,
          execution,
        ),
      );
    }

    return { kind: "success", records };
  }

  /* ----------------------- the PORT methods ------------------------ */

  async importDocuments(
    request: StorageDocumentImportRequest,
    execution: SyncExecution,
  ): Promise<ImportOutcome> {
    // Defense in depth: the sync engine pre-checks scopes; the adapter
    // refuses again before touching the incumbent (least privilege is a
    // property of the contract, not only of the engine).
    const scope = checkScope(request.context.grantedScopes, "read:documents");
    if (!scope.ok) {
      return { kind: "failure", failure: scopeRefusal(scope) };
    }
    const detailed = await this.importAcquisition(
      {
        port: APIFY_SYSTEM_CLASS,
        direction: "import",
        context: request.context,
        runIds: [],
        datasetIds: [...request.documentIds],
      },
      execution,
    );
    return toPortImportOutcome(detailed);
  }

  async exportDerivedDocumentPackage(
    snapshot: CanonicalSnapshotRef,
    _request: StorageDocumentExportRequest,
    execution: SyncExecution,
  ): Promise<ExportOutcome> {
    this.calls.export += 1;
    return {
      kind: "failure",
      failure: {
        code: "CONTRACT_VIOLATION",
        detail:
          `the apify connector '${APIFY_CONNECTOR_ID}' refused the export of canonical snapshot ` +
          `'${snapshot.snapshotContentId}' (version '${snapshot.sourceVersionId}', sync attempt ` +
          `${execution.attempt}): the connector is acquisition-only — its descriptor honestly ` +
          `declares capabilities [${this.descriptor.capabilities.join(", ")}] without ` +
          "'export-derived' — nothing is ever derived-exported through this optional third-party " +
          "acquisition connector (no HTTP traffic was attempted)",
      },
    };
  }

  async queryStatus(context: SyncContext): Promise<ConnectorStatus> {
    const scope = checkScope(context.grantedScopes, "query:status");
    if (!scope.ok) {
      return {
        available: false,
        detail: "query:status scope not granted (deny-by-default)",
        failure: scopeRefusal(scope),
      };
    }
    this.calls.status += 1;

    if (!this.config.enabled) {
      return {
        available: false,
        detail:
          "apify connector disabled by configuration — optional third-party acquisition " +
          "connector; the product works without Apify; no HTTP traffic was attempted",
        failure: apifyFailureToIntegrationFailure({ code: "disabled", detail: DISABLED_DETAIL }),
      };
    }

    // Cheap availability probe (NOT a sync; not journaled): the account's
    // own user endpoint answers 200 when the credential + endpoint work.
    const exchange = await this.getJson(`${this.baseUrl}/v2/users/me`);
    const classified = classifyExchange(exchange, context.sourceSystem.systemInstanceId);
    if (classified.kind === "content") {
      return {
        available: true,
        detail:
          `apify connector ready (optional third-party web-acquisition; baseUrl ` +
          `'${this.baseUrl}'; import-only; disabled by default — currently enabled)`,
        failure: null,
      };
    }
    const failure =
      classified.kind === "failure"
        ? classified.failure
        : unexpectedStatusFailure(classified.status, context.sourceSystem.systemInstanceId);
    return {
      available: false,
      detail: `apify endpoint probe refused the connector: ${failure.detail}`,
      failure: apifyFailureToIntegrationFailure(failure),
    };
  }

  /* -------------------------- internals ---------------------------- */

  /** One GET with the credential in the `authorization` header — and ONLY there. */
  private async getJson(url: string): Promise<ApifyHttpExchange> {
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${this.config.token}` },
      });
      return { kind: "ok", response };
    } catch (error) {
      return { kind: "transport-error", error };
    }
  }

  private actorRunUrl(runId: string): string {
    return `${this.baseUrl}/v2/actor-runs/${encodeURIComponent(runId)}`;
  }

  private datasetItemsUrl(datasetId: string): string {
    return `${this.baseUrl}/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`;
  }

  /**
   * Build one evidence record from a served 200 items response: the bytes
   * are preserved EXACTLY as served (content-addressed by sha-256), the
   * media type rides verbatim from the response header, and the provenance
   * carries the source system identity + the VERBATIM named record id. The
   * same content fetched again is a content-addressed duplicate naming the
   * first sync.
   */
  private async evidenceRecord(
    sourceRecordId: string,
    response: Response,
    sourceMetadata: Readonly<Record<string, string>>,
    context: SyncContext,
    execution: SyncExecution,
  ): Promise<ImportRecordOutcome> {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentId = sha256Hex(bytes);
    const sourceOfRecord: SourceOfRecordIdentity = {
      sourceSystem: context.sourceSystem,
      sourceRecordId,
      fetchedAt: execution.clock(),
      contentId,
      syncId: execution.syncId,
    };
    const firstSyncId = this.firstImportSync.get(contentId);
    if (firstSyncId !== undefined) {
      return {
        status: "skipped-duplicate",
        sourceOfRecord,
        duplicateOf: { contentId, firstSyncId },
      };
    }
    this.firstImportSync.set(contentId, execution.syncId);
    return {
      status: "imported",
      sourceOfRecord,
      evidencePayload: {
        contentId,
        byteSize: bytes.byteLength,
        mediaType: response.headers.get("content-type") ?? "application/json",
        bytes,
        sourceMetadata: { ...sourceMetadata },
      },
      derivationHints: [
        {
          kind: "web-acquisition-review",
          note:
            "imported apify dataset items are evidence for downstream human review " +
            "(advisory hint only; acting on it is a governed downstream decision)",
        },
      ],
    };
  }
}
