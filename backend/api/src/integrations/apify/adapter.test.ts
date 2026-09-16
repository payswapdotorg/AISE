/**
 * PROD-008 — Apify connector ADAPTER tests: the §PROD-008 acceptance mapping,
 * all deterministic (scripted fetch recorder; no network, no wall clock, no
 * randomness).
 *
 *  - ENABLED import: full happy path → typed outcome with VERBATIM provenance
 *    (source system identity + run id + dataset/actor ids), evidence bytes
 *    preserved exactly, content-addressed, timestamps from the injected clock.
 *  - DISABLED state: typed `disabled` outcome, ZERO HTTP calls, no token
 *    needed — the product works without Apify.
 *  - QUOTA simulation: HTTP 402 → `quota_exceeded` (free-plan exhaustion
 *    explicit) and the port-side AUTH_REVOKED permanent mapping.
 *  - RATE-LIMIT simulation: HTTP 429 → `rate_limited` with the retry-after
 *    interval surfaced (and the no-header variant → null).
 *  - INVALID ACTOR: per-record 404 refusals with verbatim ids + the blank-id
 *    call-level typed refusal.
 *  - NETWORK ERROR: transport rejection + unexpected-status catch-all, mapped
 *    to the transient family at the port.
 *  - CREDENTIAL ISOLATION: the token appears ONLY in the authorization header
 *    (structural assertions over recorded traffic) and in NO outcome,
 *    provenance, status or redacted config (JSON-serialization hunt).
 *  - PORT CONTRACT: compile-time + runtime conformance with the AISE-037
 *    StorageDocumentAdapter port, descriptor honesty (validated, honest
 *    capability subset, acquisition-only export refusal), scope defense in
 *    depth, and dispatch through the REAL dispatchImport machinery.
 */

import { describe, expect, test } from "bun:test";
import { dispatchImport, isStorageDocumentAdapter } from "../adapter";
import type { StorageDocumentAdapter, SyncContext, SyncExecution } from "../adapter";
import { CLASS_CAPABILITIES, validateAdapterDescriptor } from "../model";
import type { ImportOutcome, ImportRecordOutcome } from "../model";
import type { GrantedScopes } from "../permissions";
import { FIXED_NOW, importRequestFor, makeContext, makeExecution } from "../testkit";
import { sha256Hex } from "../../lib/hash";
import { ApifyConnector } from "./adapter";
import type { ApifyAcquisitionRequest, ApifyFetch } from "./adapter";
import { apifyConnectorConfig, redactedApifyConfigSummary } from "./model";
import type { ApifyConnectorConfig, ApifyConnectorFailure, ApifyImportOutcome } from "./model";
import {
  APIFY_FIXTURE_ACTOR_ID,
  APIFY_FIXTURE_DATASET_ID,
  APIFY_FIXTURE_MEDIA_TYPE,
  APIFY_FIXTURE_RUN_ID,
  APIFY_FIXTURE_SECOND_DATASET_ID,
  APIFY_FIXTURE_TOKEN,
  FIXTURE_DATASET_OK,
  FIXTURE_NOT_FOUND_404,
  FIXTURE_QUOTA_EXCEEDED_402,
  FIXTURE_RATE_LIMITED_429,
  FIXTURE_RATE_LIMITED_429_NO_RETRY_AFTER,
  FIXTURE_RUN_OK,
  FIXTURE_SECOND_DATASET_OK,
  FIXTURE_UNEXPECTED_401,
  FIXTURE_USERS_ME_OK,
  fixtureDatasetItemsBody,
} from "./fixtures";
import type { ScriptedApifyResponse } from "./testkit";
import { ApifyFetchRecorder, apifyTokenIsolationViolations } from "./testkit";

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

const APIFY_BASE = "https://api.apify.com";

function enabledConnectorConfig(): ApifyConnectorConfig {
  return apifyConnectorConfig({ token: APIFY_FIXTURE_TOKEN, enabled: true });
}

function makeConnector(
  script: readonly ScriptedApifyResponse[],
  config: ApifyConnectorConfig = enabledConnectorConfig(),
): { connector: ApifyConnector; recorder: ApifyFetchRecorder } {
  const recorder = new ApifyFetchRecorder(script);
  const connector = new ApifyConnector(config, { fetchImpl: recorder.fetch });
  return { connector, recorder };
}

const context: SyncContext = makeContext({
  systemClass: "storage-document",
  systemInstanceId: "apify-hosted-fixture",
});

const execution: SyncExecution = makeExecution();

function acquisitionRequest(
  runIds: readonly string[],
  datasetIds: readonly string[],
): ApifyAcquisitionRequest {
  return {
    port: "storage-document",
    direction: "import",
    context,
    runIds: [...runIds],
    datasetIds: [...datasetIds],
  };
}

function portImport(
  connector: StorageDocumentAdapter,
  documentIds: readonly string[],
): Promise<ImportOutcome> {
  return connector.importDocuments(
    {
      port: "storage-document",
      direction: "import",
      context,
      documentIds: [...documentIds],
    },
    execution,
  );
}

function asSuccess(outcome: ApifyImportOutcome): readonly ImportRecordOutcome[] {
  if (outcome.kind !== "success") {
    throw new Error(`expected a success outcome, got failure '${outcome.failure.code}'`);
  }
  return outcome.records;
}

function asFailure(outcome: ApifyImportOutcome): ApifyConnectorFailure {
  if (outcome.kind !== "failure") {
    throw new Error("expected a failure outcome, got success");
  }
  return outcome.failure;
}

function portRecords(outcome: ImportOutcome): readonly ImportRecordOutcome[] {
  if (outcome.kind !== "success") {
    throw new Error(`expected a port success, got failure '${outcome.failure.code}'`);
  }
  return outcome.records;
}

/* ------------------------------------------------------------------ */
/* Descriptor honesty + port contract conformance                       */
/* ------------------------------------------------------------------ */

describe("apify adapter: descriptor honesty + port conformance", () => {
  const { connector } = makeConnector([]);

  test("descriptor states the optional/third-party constraints honestly", () => {
    expect(connector.descriptor.adapterId).toBe("apify-web-acquisition");
    expect(connector.descriptor.systemClass).toBe("storage-document");
    expect(connector.descriptor.version).toBe("1.0.0");
    expect(connector.descriptor.displayName).toContain("optional");
    expect(connector.descriptor.displayName).toContain("third-party");
    expect(connector.descriptor.displayName).toContain("disabled by default");
  });

  test("descriptor passes the FROZEN AISE-037 descriptor validator", () => {
    const validation = validateAdapterDescriptor(connector.descriptor);
    expect(validation.ok).toBe(true);
  });

  test("capabilities are the honest subset: import + status, NO export-derived", () => {
    expect(connector.descriptor.capabilities).toEqual(["import-documents", "query-status"]);
    for (const capability of connector.descriptor.capabilities) {
      expect(CLASS_CAPABILITIES["storage-document"]).toContain(capability);
    }
    expect(connector.descriptor.capabilities).not.toContain("export-derived");
  });

  test("compile-time + runtime conformance with the StorageDocumentAdapter port", () => {
    const asPort: StorageDocumentAdapter = connector;
    expect(typeof asPort.importDocuments).toBe("function");
    expect(typeof asPort.exportDerivedDocumentPackage).toBe("function");
    expect(typeof asPort.queryStatus).toBe("function");
    expect(isStorageDocumentAdapter(connector)).toBe(true);
  });

  test("dispatches through the REAL dispatchImport machinery", async () => {
    const { connector, recorder } = makeConnector([FIXTURE_DATASET_OK]);
    const request = importRequestFor("storage-document", [APIFY_FIXTURE_DATASET_ID], context);
    const outcome = await dispatchImport(connector, request, execution);
    expect(outcome.kind).toBe("success");
    expect(recorder.callCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* ENABLED import: the full happy path                                  */
/* ------------------------------------------------------------------ */

describe("apify adapter: enabled import (happy path, provenance verbatim)", () => {
  test("actor-run import carries source identity + run id VERBATIM", async () => {
    const { connector, recorder } = makeConnector([FIXTURE_RUN_OK, FIXTURE_DATASET_OK]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([APIFY_FIXTURE_RUN_ID], []),
      execution,
    );
    const records = asSuccess(outcome);
    expect(records.length).toBe(1);
    const record = records[0];
    if (record === undefined || record.status !== "imported") {
      throw new Error("expected an imported record");
    }
    // VERBATIM provenance: the id AS NAMED + the caller's source system identity.
    expect(record.sourceOfRecord.sourceRecordId).toBe(APIFY_FIXTURE_RUN_ID);
    expect(record.sourceOfRecord.sourceSystem).toBe(context.sourceSystem);
    expect(record.sourceOfRecord.sourceSystem.systemInstanceId).toBe("apify-hosted-fixture");
    // Run/actor/dataset identities ride VERBATIM in the evidence metadata.
    expect(record.evidencePayload.sourceMetadata["apify.runId"]).toBe(APIFY_FIXTURE_RUN_ID);
    expect(record.evidencePayload.sourceMetadata["apify.actorId"]).toBe(APIFY_FIXTURE_ACTOR_ID);
    expect(record.evidencePayload.sourceMetadata["apify.datasetId"]).toBe(
      APIFY_FIXTURE_DATASET_ID,
    );
    // Timestamps come from the INJECTED execution clock — never a wall clock.
    expect(record.sourceOfRecord.fetchedAt).toBe(FIXED_NOW);
    expect(record.sourceOfRecord.syncId).toBe(execution.syncId);
    expect(recorder.callCount).toBe(2);
  });

  test("evidence bytes are preserved EXACTLY as served (content-addressed)", async () => {
    const { connector } = makeConnector([FIXTURE_DATASET_OK]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const records = asSuccess(outcome);
    const record = records[0];
    if (record === undefined || record.status !== "imported") {
      throw new Error("expected an imported record");
    }
    const expectedBytes = new TextEncoder().encode(
      fixtureDatasetItemsBody(APIFY_FIXTURE_DATASET_ID),
    );
    expect(record.evidencePayload.bytes).toEqual(expectedBytes);
    expect(record.evidencePayload.byteSize).toBe(expectedBytes.byteLength);
    expect(record.evidencePayload.mediaType).toBe(APIFY_FIXTURE_MEDIA_TYPE);
    expect(record.evidencePayload.contentId).toBe(sha256Hex(expectedBytes));
    expect(record.sourceOfRecord.contentId).toBe(sha256Hex(expectedBytes));
  });

  test("dataset-direct import through the PORT issues the exact Apify request", async () => {
    const { connector, recorder } = makeConnector([FIXTURE_DATASET_OK]);
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID]);
    expect(outcome.kind).toBe("success");
    expect(recorder.callCount).toBe(1);
    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("expected one recorded request");
    }
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      `${APIFY_BASE}/v2/datasets/${APIFY_FIXTURE_DATASET_ID}/items?clean=true&format=json`,
    );
    expect(request.headers["authorization"]).toBe(`Bearer ${APIFY_FIXTURE_TOKEN}`);
  });

  test("multiple datasets import in REQUEST ORDER with distinct content ids", async () => {
    const { connector } = makeConnector([FIXTURE_DATASET_OK, FIXTURE_SECOND_DATASET_OK]);
    const outcome = await portImport(connector, [
      APIFY_FIXTURE_DATASET_ID,
      APIFY_FIXTURE_SECOND_DATASET_ID,
    ]);
    const records = portRecords(outcome);
    expect(records.length).toBe(2);
    const first = records[0];
    const second = records[1];
    if (
      first === undefined ||
      second === undefined ||
      first.status !== "imported" ||
      second.status !== "imported"
    ) {
      throw new Error("expected two imported records");
    }
    expect(first.sourceOfRecord.sourceRecordId).toBe(APIFY_FIXTURE_DATASET_ID);
    expect(second.sourceOfRecord.sourceRecordId).toBe(APIFY_FIXTURE_SECOND_DATASET_ID);
    expect(first.evidencePayload.contentId).not.toBe(second.evidencePayload.contentId);
  });

  test("identical content fetched again is a content-addressed duplicate", async () => {
    const { connector } = makeConnector([FIXTURE_DATASET_OK, FIXTURE_DATASET_OK]);
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID, APIFY_FIXTURE_DATASET_ID]);
    const records = portRecords(outcome);
    expect(records.length).toBe(2);
    const first = records[0];
    const second = records[1];
    if (first === undefined || second === undefined) {
      throw new Error("expected two records");
    }
    expect(first.status).toBe("imported");
    expect(second.status).toBe("skipped-duplicate");
    if (second.status !== "skipped-duplicate" || first.status !== "imported") {
      throw new Error("narrowing bug");
    }
    expect(second.duplicateOf.contentId).toBe(first.sourceOfRecord.contentId);
    expect(second.duplicateOf.firstSyncId).toBe(execution.syncId);
    expect(second.sourceOfRecord.sourceRecordId).toBe(APIFY_FIXTURE_DATASET_ID);
  });

  test("derivation hints are ADVISORY only", async () => {
    const { connector } = makeConnector([FIXTURE_DATASET_OK]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const records = asSuccess(outcome);
    const record = records[0];
    if (record === undefined || record.status !== "imported") {
      throw new Error("expected an imported record");
    }
    expect(record.derivationHints.length).toBe(1);
    expect(record.derivationHints[0]?.kind).toBe("web-acquisition-review");
    expect(record.derivationHints[0]?.note).toContain("advisory");
  });
});

/* ------------------------------------------------------------------ */
/* DISABLED state                                                        */
/* ------------------------------------------------------------------ */

describe("apify adapter: disabled state (zero HTTP, product works)", () => {
  test("disabled import through the PORT: typed failure, ZERO fetches", async () => {
    // EMPTY script: any fetch attempt is a hard test failure.
    const { connector, recorder } = makeConnector([], apifyConnectorConfig());
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID]);
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("CONTRACT_VIOLATION");
      expect(outcome.failure.detail).toContain("disabled");
      expect(outcome.failure.detail).toContain("[apify:disabled]");
    }
    expect(recorder.callCount).toBe(0);
  });

  test("disabled import on the detailed surface: code 'disabled', no credentials needed", async () => {
    const { connector, recorder } = makeConnector([], apifyConnectorConfig());
    const outcome = await connector.importAcquisition(
      acquisitionRequest([APIFY_FIXTURE_RUN_ID], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const failure = asFailure(outcome);
    expect(failure.code).toBe("disabled");
    expect(failure.detail).toContain("enabled=false");
    expect(failure.detail).toContain("works without Apify");
    expect(recorder.callCount).toBe(0);
  });

  test("disabled status probe: unavailable, typed reason, ZERO fetches", async () => {
    const { connector, recorder } = makeConnector([], apifyConnectorConfig());
    const status = await connector.queryStatus(context);
    expect(status.available).toBe(false);
    expect(status.detail).toContain("disabled");
    expect(status.failure).not.toBeNull();
    expect(status.failure?.code).toBe("CONTRACT_VIOLATION");
    expect(recorder.callCount).toBe(0);
  });

  test("a connector with NO token at all still answers typed outcomes (no throw)", async () => {
    const { connector, recorder } = makeConnector([], apifyConnectorConfig());
    const outcome = await portImport(connector, []);
    expect(outcome.kind).toBe("failure");
    expect(recorder.callCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* QUOTA simulation (HTTP 402)                                           */
/* ------------------------------------------------------------------ */

describe("apify adapter: quota simulation (free-plan exhaustion, HTTP 402)", () => {
  test("402 → typed quota_exceeded with the free-plan exhaustion EXPLICIT", async () => {
    const { connector } = makeConnector([FIXTURE_QUOTA_EXCEEDED_402]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const failure = asFailure(outcome);
    expect(failure.code).toBe("quota_exceeded");
    if (failure.code !== "quota_exceeded") {
      throw new Error("narrowing bug");
    }
    expect(failure.httpStatus).toBe(402);
    expect(failure.detail).toContain("free-plan");
    expect(failure.detail).toContain("402");
    expect(failure.detail).toContain("Payment Required");
  });

  test("402 → the port-side AUTH_REVOKED PERMANENT mapping (fail fast)", async () => {
    const { connector } = makeConnector([FIXTURE_QUOTA_EXCEEDED_402]);
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID]);
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("AUTH_REVOKED");
      expect(outcome.failure.detail).toContain("[apify:quota_exceeded]");
    }
  });

  test("quota exhaustion ABORTS the remaining records (account-side state)", async () => {
    const { connector, recorder } = makeConnector([FIXTURE_DATASET_OK, FIXTURE_QUOTA_EXCEEDED_402]);
    const outcome = await portImport(connector, [
      APIFY_FIXTURE_DATASET_ID,
      APIFY_FIXTURE_SECOND_DATASET_ID,
    ]);
    expect(outcome.kind).toBe("failure");
    expect(recorder.callCount).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* RATE-LIMIT simulation (HTTP 429)                                     */
/* ------------------------------------------------------------------ */

describe("apify adapter: rate-limit simulation (HTTP 429)", () => {
  test("429 → typed rate_limited with the retry-after interval SURFACED", async () => {
    const { connector } = makeConnector([FIXTURE_RATE_LIMITED_429]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const failure = asFailure(outcome);
    expect(failure.code).toBe("rate_limited");
    if (failure.code !== "rate_limited") {
      throw new Error("narrowing bug");
    }
    expect(failure.httpStatus).toBe(429);
    expect(failure.retryAfterSeconds).toBe(30);
    expect(failure.detail).toContain("retry-after: 30s");
  });

  test("429 without a retry-after header surfaces null EXPLICITLY", async () => {
    const { connector } = makeConnector([FIXTURE_RATE_LIMITED_429_NO_RETRY_AFTER]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const failure = asFailure(outcome);
    if (failure.code !== "rate_limited") {
      throw new Error("expected rate_limited");
    }
    expect(failure.retryAfterSeconds).toBe(null);
    expect(failure.detail).toContain("no retry-after interval was served");
  });

  test("429 → the port-side RATE_LIMITED TRANSIENT mapping (retry is legitimate)", async () => {
    const { connector } = makeConnector([FIXTURE_RATE_LIMITED_429]);
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID]);
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("RATE_LIMITED");
      expect(outcome.failure.detail).toContain("retry-after: 30s");
    }
  });
});

/* ------------------------------------------------------------------ */
/* INVALID ACTOR                                                         */
/* ------------------------------------------------------------------ */

describe("apify adapter: invalid actor (bad named incumbent record ids)", () => {
  test("dataset 404 → per-record SOURCE_NOT_FOUND with the id VERBATIM (sync continues)", async () => {
    const { connector } = makeConnector([FIXTURE_NOT_FOUND_404]);
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID]);
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      throw new Error("narrowing bug");
    }
    const record = outcome.records[0];
    if (record === undefined || record.status !== "failed") {
      throw new Error("expected a failed record");
    }
    expect(record.sourceRecordId).toBe(APIFY_FIXTURE_DATASET_ID);
    expect(record.failure.code).toBe("SOURCE_NOT_FOUND");
    expect(record.failure.detail).toContain("apify invalid_actor");
    expect(record.failure.detail).toContain("404");
    expect(record.failure.detail).toContain(APIFY_FIXTURE_DATASET_ID);
  });

  test("actor-run 404 → per-record failure with the run id VERBATIM", async () => {
    const { connector } = makeConnector([FIXTURE_NOT_FOUND_404]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([APIFY_FIXTURE_RUN_ID], []),
      execution,
    );
    const records = asSuccess(outcome);
    const record = records[0];
    if (record === undefined || record.status !== "failed") {
      throw new Error("expected a failed record");
    }
    expect(record.sourceRecordId).toBe(APIFY_FIXTURE_RUN_ID);
    expect(record.failure.code).toBe("SOURCE_NOT_FOUND");
    expect(record.failure.detail).toContain("actor run");
    expect(record.failure.detail).toContain(APIFY_FIXTURE_RUN_ID);
  });

  test("a BLANK named id is a call-level invalid_actor refusal (zero HTTP)", async () => {
    const { connector, recorder } = makeConnector([]);
    const outcome = await portImport(connector, ["", "   "]);
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("SOURCE_NOT_FOUND");
      expect(outcome.failure.detail).toContain("[apify:invalid_actor]");
      expect(outcome.failure.detail).toContain("blank");
    }
    const detailed = await connector.importAcquisition(acquisitionRequest([""], []), execution);
    expect(asFailure(detailed).code).toBe("invalid_actor");
    expect(recorder.callCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* NETWORK ERROR                                                         */
/* ------------------------------------------------------------------ */

describe("apify adapter: network errors (transport tier)", () => {
  test("fetch rejection → typed network_error (no raw throw crosses the boundary)", async () => {
    const { connector } = makeConnector([
      { transportError: new TypeError("fetch failed: DNS resolution") },
    ]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const failure = asFailure(outcome);
    expect(failure.code).toBe("network_error");
    if (failure.code !== "network_error") {
      throw new Error("narrowing bug");
    }
    expect(failure.httpStatus).toBe(null);
    expect(failure.detail).toContain("could not be reached");
    expect(failure.detail).toContain("fetch failed: DNS resolution");
  });

  test("an unexpected HTTP status is the documented transport-tier catch-all", async () => {
    const { connector } = makeConnector([FIXTURE_UNEXPECTED_401]);
    const outcome = await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    const failure = asFailure(outcome);
    if (failure.code !== "network_error") {
      throw new Error("expected network_error");
    }
    expect(failure.httpStatus).toBe(401);
    expect(failure.detail).toContain("unexpected HTTP status 401");
  });

  test("network errors map to the TRANSIENT family at the port", async () => {
    const { connector } = makeConnector([
      { transportError: new TypeError("fetch failed") },
    ]);
    const outcome = await portImport(connector, [APIFY_FIXTURE_DATASET_ID]);
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("RETRYABLE_TIMEOUT");
    }
  });
});

/* ------------------------------------------------------------------ */
/* CREDENTIAL ISOLATION (structural)                                    */
/* ------------------------------------------------------------------ */

describe("apify adapter: credential isolation (token ONLY in the authorization header)", () => {
  test("recorded traffic: the token appears ONLY as the Bearer authorization header", async () => {
    const { connector, recorder } = makeConnector([
      FIXTURE_RUN_OK,
      FIXTURE_DATASET_OK,
      FIXTURE_RATE_LIMITED_429,
      FIXTURE_USERS_ME_OK,
    ]);
    await connector.importAcquisition(acquisitionRequest([APIFY_FIXTURE_RUN_ID], []), execution);
    await connector.importAcquisition(
      acquisitionRequest([], [APIFY_FIXTURE_DATASET_ID]),
      execution,
    );
    await connector.queryStatus(context);
    // Every recorded request: token in the authorization header and NOWHERE else.
    expect(apifyTokenIsolationViolations(recorder, APIFY_FIXTURE_TOKEN)).toEqual([]);
    expect(recorder.callCount).toBe(4);
    for (const request of recorder.requests) {
      expect(request.headers["authorization"]).toBe(`Bearer ${APIFY_FIXTURE_TOKEN}`);
      expect(request.url.includes(APIFY_FIXTURE_TOKEN)).toBe(false);
    }
  });

  test("outcomes/provenance/status/config: the token appears in NONE of them", async () => {
    const outcomes: unknown[] = [];
    const configs = [
      apifyConnectorConfig(),
      enabledConnectorConfig(),
      apifyConnectorConfig({ enabled: true, baseUrl: "https://api.apify.example", token: APIFY_FIXTURE_TOKEN }),
    ];

    const disabled = makeConnector([], apifyConnectorConfig());
    outcomes.push(await disabled.connector.importDocuments(
      { port: "storage-document", direction: "import", context, documentIds: ["ds"] },
      execution,
    ));
    outcomes.push(await disabled.connector.queryStatus(context));

    const quota = makeConnector([FIXTURE_QUOTA_EXCEEDED_402]);
    outcomes.push(await quota.connector.importAcquisition(acquisitionRequest([], ["ds"]), execution));

    const rate = makeConnector([FIXTURE_RATE_LIMITED_429]);
    outcomes.push(await rate.connector.importAcquisition(acquisitionRequest([], ["ds"]), execution));

    const network = makeConnector([{ transportError: new TypeError("fetch failed") }]);
    outcomes.push(await network.connector.importAcquisition(acquisitionRequest([], ["ds"]), execution));

    const happy = makeConnector([FIXTURE_RUN_OK, FIXTURE_DATASET_OK]);
    outcomes.push(
      await happy.connector.importAcquisition(acquisitionRequest([APIFY_FIXTURE_RUN_ID], []), execution),
    );

    const probe = makeConnector([FIXTURE_USERS_ME_OK]);
    outcomes.push(await probe.connector.queryStatus(context));

    for (const outcome of outcomes) {
      expect(JSON.stringify(outcome).includes(APIFY_FIXTURE_TOKEN)).toBe(false);
    }
    for (const config of configs) {
      expect(redactedApifyConfigSummary(config).includes(APIFY_FIXTURE_TOKEN)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Scope defense + acquisition-only export honesty                      */
/* ------------------------------------------------------------------ */

describe("apify adapter: scope defense + acquisition-only export", () => {
  test("import without read:documents → typed SCOPE_DENIED, zero HTTP", async () => {
    const { connector, recorder } = makeConnector([]);
    const queryOnlyGrant: GrantedScopes = {
      systemClass: "storage-document",
      scopes: ["query:status"],
    };
    const noReadContext = makeContext({
      systemClass: "storage-document",
      systemInstanceId: "apify-hosted-fixture",
      granted: queryOnlyGrant,
    });
    const outcome = await connector.importDocuments(
      {
        port: "storage-document",
        direction: "import",
        context: noReadContext,
        documentIds: [APIFY_FIXTURE_DATASET_ID],
      },
      execution,
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("SCOPE_DENIED");
    }
    expect(recorder.callCount).toBe(0);
  });

  test("the export port method refuses honestly (acquisition-only, zero HTTP)", async () => {
    const { connector, recorder } = makeConnector([]);
    const outcome = await connector.exportDerivedDocumentPackage(
      {
        tenantId: "tenant-alpha",
        projectId: "project-1",
        sourceVersionId: "v003",
        snapshotContentId: "c".repeat(64),
      },
      { port: "storage-document", direction: "export", context },
      execution,
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("CONTRACT_VIOLATION");
      expect(outcome.failure.detail).toContain("acquisition-only");
      expect(outcome.failure.detail).toContain("export-derived");
    }
    expect(recorder.callCount).toBe(0);
  });

  test("enabled status probe: ready + exactly ONE cheap HTTP call", async () => {
    const { connector, recorder } = makeConnector([FIXTURE_USERS_ME_OK]);
    const status = await connector.queryStatus(context);
    expect(status.available).toBe(true);
    expect(status.detail).toContain("ready");
    expect(status.detail).toContain("optional third-party");
    expect(status.failure).toBe(null);
    expect(recorder.callCount).toBe(1);
    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("expected one recorded request");
    }
    expect(request.url).toBe(`${APIFY_BASE}/v2/users/me`);
  });

  test("quota-exhausted status probe: unavailable with the typed account reason", async () => {
    const { connector } = makeConnector([FIXTURE_QUOTA_EXCEEDED_402]);
    const status = await connector.queryStatus(context);
    expect(status.available).toBe(false);
    expect(status.failure?.code).toBe("AUTH_REVOKED");
    expect(status.detail).toContain("402");
  });
});

/* ------------------------------------------------------------------ */
/* The fetch seam is injectable (zero npm deps, no ambient network)      */
/* ------------------------------------------------------------------ */

describe("apify adapter: fetch seam", () => {
  test("default wiring uses the global fetch; a disabled connector still fetches nothing", async () => {
    // No fetch injected: the default seam is the GLOBAL fetch (zero npm
    // dependencies added). The connector is disabled, so the port answers
    // with the typed disabled outcome WITHOUT ever touching the seam.
    const connector = new ApifyConnector(apifyConnectorConfig());
    const outcome = await portImport(connector, ["ds"]);
    expect(outcome.kind).toBe("failure");
  });

  test("the injected recorder satisfies the ApifyFetch seam structurally", () => {
    const recorder = new ApifyFetchRecorder([]);
    const fetchImpl: ApifyFetch = recorder.fetch;
    expect(typeof fetchImpl).toBe("function");
  });
});
