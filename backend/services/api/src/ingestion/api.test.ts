/**
 * HTTP-level integration tests for the AISE-004 capture ingestion
 * boundary, run against a real server on an ephemeral port (real
 * fetch, real multipart bodies, real hashing).
 *
 * These are the work-order evidence tests:
 * - valid project/session/package/upload payloads are accepted;
 * - malformed contracts are rejected (schema, semantics, framing);
 * - manifest byte totals and content hashes are checked;
 * - duplicate asset identity cannot create a second logical asset;
 * - repeated identical uploads return DUPLICATE (with duplicateOf);
 * - same idempotency key + different content hash →
 *   IDEMPOTENCY_CONFLICT, fail-closed, non-retryable;
 * - a new key for an already-committed asset is rejected
 *   fail-closed and never answered as DUPLICATE (the contract
 *   reserves DUPLICATE for same-key retries);
 * - newer-MINOR (same-MAJOR) envelopes are read tolerantly:
 *   unknown fields dropped recursively, unknown enum values mapped
 *   to the reader sentinel, never coerced onto existing members;
 * - raw evidence metadata is preserved and immutable;
 * - session/project relationships stay consistent;
 * - invalid/ambiguous ingestion creates no state.
 *
 * Every success response is validated against the AISE-003
 * upload-result schema; every error response against the sync-error
 * schema — proving the gateway emits only contract-shaped envelopes.
 *
 * Each describe runs against its own server with its own store, and
 * every `registerChain` call uses a fresh session/package identity so
 * tests cannot collide through shared declarations.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiseConfig } from "@aise/backend-config";
import { createLogger, type Logger } from "@aise/backend-logging";
import {
  loadFixtureJson,
  validateProject,
  validateSyncError,
  validateUploadResult,
  type CapturePackage,
  type CaptureSession,
  type Project,
  type SyncError,
  type SyncErrorCode,
  type UploadRequest,
  type UploadResult,
} from "@aise/shared-contracts";
import { createApiServer, type ApiServer } from "../server.js";
import type { IngestionLimits } from "./limits.js";
import { createInMemoryCaptureStore, type CaptureStore } from "./store.js";

const config: AiseConfig = {
  env: "test",
  logLevel: "error",
  api: { host: "127.0.0.1", port: 0 },
  worker: { pollIntervalMs: 1000 },
};

interface TestApi {
  readonly baseUrl: string;
  readonly store: CaptureStore;
}

async function startApi(
  limits?: IngestionLimits,
): Promise<TestApi & { stop(): Promise<void> }> {
  const logger: Logger = createLogger({
    level: "error",
    module: "api-ing-test",
    sink: () => undefined,
  });
  const store: CaptureStore = createInMemoryCaptureStore();
  const api: ApiServer = createApiServer({
    config,
    logger,
    store,
    ...(limits !== undefined ? { limits } : {}),
  });
  const address = await api.start();
  return { baseUrl: `http://127.0.0.1:${address.port}`, store, stop: () => api.stop() };
}

// ---------------------------------------------------------------------------
// Test data built from the AISE-003 representative fixtures
// ---------------------------------------------------------------------------

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const PROJECT_FIXTURE = loadFixtureJson("project.full.json") as Project;
const SESSION_FIXTURE = loadFixtureJson("capture-session.full.json") as CaptureSession;
const PACKAGE_FIXTURE = loadFixtureJson("capture-package.full.json") as CapturePackage;

const PROJECT_ID = PROJECT_FIXTURE.projectId;

/**
 * A capture package manifest whose first asset matches real test
 * bytes (hash and size rewritten from the representative fixture).
 * `sessionId` is refreshed so each chain is independently declared.
 */
function consistentPackage(bytes: Buffer, sessionId: string): CapturePackage {
  const pkg = clone(PACKAGE_FIXTURE);
  pkg.packageId = randomUUID();
  pkg.sessionId = sessionId;
  const asset = pkg.assets[0]!;
  asset.contentHash = sha256Hex(bytes);
  asset.byteSize = bytes.length;
  pkg.totalByteSize = pkg.assets.reduce((sum, entry) => sum + entry.byteSize, 0);
  return pkg;
}

function uploadEnvelope(
  pkg: CapturePackage,
  bytes: Buffer,
  overrides: Partial<UploadRequest> = {},
): UploadRequest {
  const asset = pkg.assets[0]!;
  return {
    contractVersion: "1.0",
    sessionId: pkg.sessionId,
    assetId: asset.assetId,
    idempotencyKey: randomUUID(),
    contentHash: asset.contentHash,
    byteSize: bytes.length,
    ...overrides,
  };
}

const BOUNDARY = "test-upload-boundary-3f7a9c1d";

interface RawPart {
  readonly name: string;
  readonly contentType?: string;
  readonly data: Buffer;
}

function rawMultipart(parts: readonly RawPart[]): { body: Buffer; contentType: string } {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"\r\n` +
          (part.contentType !== undefined ? `Content-Type: ${part.contentType}\r\n` : "") +
          "\r\n",
        "utf8",
      ),
    );
    chunks.push(part.data);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

function multipartUpload(envelope: unknown, payload: Buffer): { body: Buffer; contentType: string } {
  return rawMultipart([
    {
      name: "request",
      contentType: "application/json",
      data: Buffer.from(JSON.stringify(envelope), "utf8"),
    },
    { name: "payload", contentType: "application/octet-stream", data: payload },
  ]);
}

async function postJson(baseUrl: string, path: string, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function putJson(baseUrl: string, path: string, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function postUpload(
  baseUrl: string,
  envelope: unknown,
  payload: Buffer,
): Promise<Response> {
  const { body, contentType } = multipartUpload(envelope, payload);
  return fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

async function postRawMultipart(
  baseUrl: string,
  parts: readonly RawPart[],
): Promise<Response> {
  const { body, contentType } = rawMultipart(parts);
  return fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

// ---------------------------------------------------------------------------
// Contract-shape assertions (applied to every response, every time)
// ---------------------------------------------------------------------------

async function expectUploadResult(
  response: Response,
  expectedStatus: number,
  outcome: "ACCEPTED" | "DUPLICATE",
): Promise<UploadResult> {
  expect(response.status).toBe(expectedStatus);
  const body = (await response.json()) as UploadResult;
  const validation = validateUploadResult(body);
  expect(validation.errors, JSON.stringify(body)).toEqual([]);
  expect(validation.ok).toBe(true);
  expect(body.outcome).toBe(outcome);
  if (body.outcome === "DUPLICATE") {
    // The AISE-003 conditional: a duplicate must identify the
    // original asset. The schema enforces it; assert it explicitly.
    expect(typeof body.duplicateOf).toBe("string");
    expect((body.duplicateOf ?? "").length).toBeGreaterThan(0);
  }
  return body;
}

async function expectSyncError(
  response: Response,
  expectedStatus: number,
  code: SyncErrorCode,
): Promise<SyncError> {
  expect(response.status).toBe(expectedStatus);
  const body = (await response.json()) as SyncError;
  const validation = validateSyncError(body);
  expect(validation.errors, JSON.stringify(body)).toEqual([]);
  expect(validation.ok).toBe(true);
  expect(body.code).toBe(code);
  return body;
}

/**
 * Registers the full happy-path chain (project, then a fresh session,
 * then a manifest consistent with `bytes`) and returns the pieces.
 */
async function registerChain(
  api: TestApi,
  bytes: Buffer,
): Promise<{ session: CaptureSession; pkg: CapturePackage }> {
  const project = await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
  expect([200, 201]).toContain(project.status);

  const session: CaptureSession = { ...clone(SESSION_FIXTURE), sessionId: randomUUID() };
  const sessionResponse = await postJson(api.baseUrl, "/v1/sessions", session);
  expect(sessionResponse.status).toBe(201);

  const pkg = consistentPackage(bytes, session.sessionId);
  const manifest = await postJson(api.baseUrl, "/v1/packages", pkg);
  expect(manifest.status).toBe(201);

  return { session, pkg };
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe("capture ingestion happy path", () => {
  let api: TestApi;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
  });
  afterAll(async () => {
    await stop();
  });

  it("accepts valid project, session, package and upload payloads", async () => {
    const bytes = Buffer.from("warehouse-b-mezzanine-photo-evidence", "utf8");
    const { session, pkg } = await registerChain(api, bytes);

    const envelope = uploadEnvelope(pkg, bytes);
    const response = await postUpload(api.baseUrl, envelope, bytes);
    const result = await expectUploadResult(response, 201, "ACCEPTED");
    expect(result.receivedHash).toBe(sha256Hex(bytes));
    expect(result.assetId).toBe(envelope.assetId);
    expect(response.headers.get("location")).toBe(
      `/v1/sessions/${session.sessionId}/assets/${envelope.assetId}`,
    );
  });

  it("round-trips the project/session/package envelopes as stored", async () => {
    const project = await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
    expect([200, 201]).toContain(project.status);
    const projectBody = (await project.json()) as Project;
    expect(validateProject(projectBody).ok).toBe(true);
    expect(projectBody).toEqual(PROJECT_FIXTURE);

    const bytes = Buffer.from("round-trip-evidence");
    const { session, pkg } = await registerChain(api, bytes);
    expect(await (await postJson(api.baseUrl, "/v1/sessions", session)).json()).toEqual(session);
    expect(await (await postJson(api.baseUrl, "/v1/packages", pkg)).json()).toEqual(pkg);
  });

  it("re-registering identical project/session/package is idempotent (200)", async () => {
    const bytes = Buffer.from("idempotent-reregistration");
    const { session, pkg } = await registerChain(api, bytes);

    expect((await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE)).status).toBe(200);
    expect((await postJson(api.baseUrl, "/v1/sessions", session)).status).toBe(200);
    expect((await postJson(api.baseUrl, "/v1/packages", pkg)).status).toBe(200);
  });

  it("re-registering with different content conflicts (409, VALIDATION_FAILED)", async () => {
    const bytes = Buffer.from("conflicting-reregistration");
    const { session, pkg } = await registerChain(api, bytes);

    await expectSyncError(
      await postJson(api.baseUrl, "/v1/projects", { ...PROJECT_FIXTURE, name: "different" }),
      409,
      "VALIDATION_FAILED",
    );
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/sessions", { ...session, notes: "changed" }),
      409,
      "VALIDATION_FAILED",
    );
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", { ...pkg, createdAt: "2020-01-01T00:00:00Z" }),
      409,
      "VALIDATION_FAILED",
    );
  });

  it("serves the session read model with a consistent ingestion summary", async () => {
    const bytes = Buffer.from("read-model-evidence");
    const { session, pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes);
    await postUpload(api.baseUrl, envelope, bytes);

    const response = await fetch(`${api.baseUrl}/v1/sessions/${session.sessionId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: CaptureSession;
      ingestion: {
        packages: Array<{ packageId: string; declaredAssets: number; acceptedAssets: number }>;
        declaredAssets: number;
        acceptedAssets: number;
        receivedBytes: number;
      };
    };
    expect(body.session).toEqual(session);
    expect(body.ingestion.declaredAssets).toBe(pkg.assets.length);
    expect(body.ingestion.acceptedAssets).toBe(1);
    expect(body.ingestion.receivedBytes).toBe(bytes.length);
    expect(body.ingestion.packages[0]?.packageId).toBe(pkg.packageId);
  });

  it("serves registered projects by id", async () => {
    await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
    const response = await fetch(`${api.baseUrl}/v1/projects/${PROJECT_ID}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PROJECT_FIXTURE);
    await expectSyncError(
      await fetch(`${api.baseUrl}/v1/projects/${randomUUID()}`),
      404,
      "PROJECT_NOT_FOUND",
    );
  });
});

describe("malformed contract rejection", () => {
  let api: TestApi;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
  });
  afterAll(async () => {
    await stop();
  });

  it("rejects a project envelope with an unknown field (writer-strict)", async () => {
    const error = await expectSyncError(
      await postJson(api.baseUrl, "/v1/projects", { ...PROJECT_FIXTURE, siteCode: "WHB" }),
      400,
      "VALIDATION_FAILED",
    );
    expect(Array.isArray(error.details?.["validationErrors"])).toBe(true);
  });

  it("rejects a project envelope with a malformed id", async () => {
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/projects", { ...PROJECT_FIXTURE, projectId: "not-a-uuid" }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects a session envelope with an unknown intent", async () => {
    await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/sessions", { ...SESSION_FIXTURE, intent: "SPOT_CHECK" }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects a package manifest with empty assets (schema minItems)", async () => {
    const bytes = Buffer.from("empty-assets");
    const { session } = await registerChain(api, bytes);
    const pkg = consistentPackage(bytes, session.sessionId);
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", { ...pkg, assets: [] }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects a manifest whose totalByteSize does not match the asset sum", async () => {
    const bytes = Buffer.from("byte-total-drift");
    const { session } = await registerChain(api, bytes);
    const pkg = consistentPackage(bytes, session.sessionId);
    const drifted = { ...pkg, totalByteSize: (pkg.totalByteSize ?? 0) + 1 };
    const error = await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", drifted),
      400,
      "VALIDATION_FAILED",
    );
    const issues = error.details?.["issues"] as Array<{ field: string }>;
    expect(issues?.some((issue) => issue.field === "totalByteSize")).toBe(true);
  });

  it("rejects a manifest with duplicate asset ids (cross-field semantics)", async () => {
    const bytes = Buffer.from("duplicate-ids");
    const { session } = await registerChain(api, bytes);
    const pkg = consistentPackage(bytes, session.sessionId);
    const duplicated = {
      ...pkg,
      assets: [pkg.assets[0]!, { ...pkg.assets[1]!, assetId: pkg.assets[0]!.assetId }],
    };
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", duplicated),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects malformed JSON bodies", async () => {
    const response = await fetch(`${api.baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    await expectSyncError(response, 400, "VALIDATION_FAILED");
  });

  it("rejects non-JSON media types on envelope endpoints (415)", async () => {
    const response = await fetch(`${api.baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(response.status).toBe(415);
    expect(((await response.json()) as { error: string }).error).toBe("unsupported_media_type");
  });

  it("rejects non-multipart media types on the upload endpoint (415)", async () => {
    const response = await fetch(`${api.baseUrl}/v1/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(415);
    expect(((await response.json()) as { error: string }).error).toBe("unsupported_media_type");
  });

  it("rejects uploads with missing, extra or mis-typed multipart parts", async () => {
    const bytes = Buffer.from("multipart-rejection");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes);
    const envelopeJson = Buffer.from(JSON.stringify(envelope), "utf8");

    // Missing payload part
    await expectSyncError(
      await postRawMultipart(api.baseUrl, [
        { name: "request", contentType: "application/json", data: envelopeJson },
      ]),
      400,
      "VALIDATION_FAILED",
    );

    // Extra part
    await expectSyncError(
      await postRawMultipart(api.baseUrl, [
        { name: "request", contentType: "application/json", data: envelopeJson },
        { name: "payload", contentType: "application/octet-stream", data: bytes },
        { name: "other", data: Buffer.from("x") },
      ]),
      400,
      "VALIDATION_FAILED",
    );

    // Request part without application/json content type
    await expectSyncError(
      await postRawMultipart(api.baseUrl, [
        { name: "request", data: envelopeJson },
        { name: "payload", contentType: "application/octet-stream", data: bytes },
      ]),
      400,
      "VALIDATION_FAILED",
    );

    // Envelope part that is not JSON
    await expectSyncError(
      await postRawMultipart(api.baseUrl, [
        { name: "request", contentType: "application/json", data: Buffer.from("{broken") },
        { name: "payload", contentType: "application/octet-stream", data: bytes },
      ]),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects an upload envelope with a malformed idempotency key", async () => {
    const bytes = Buffer.from("bad-key");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes, { idempotencyKey: "123" });
    await expectSyncError(await postUpload(api.baseUrl, envelope, bytes), 400, "VALIDATION_FAILED");
  });

  it("rejects cross-MAJOR envelope versions with CONTRACT_VERSION_UNSUPPORTED", async () => {
    const bytes = Buffer.from("version-negotiation");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes, { contractVersion: "2.0" });
    const error = await expectSyncError(
      await postUpload(api.baseUrl, envelope, bytes),
      400,
      "CONTRACT_VERSION_UNSUPPORTED",
    );
    const supported = error.details?.["supportedVersions"] as string[];
    expect(Array.isArray(supported)).toBe(true);
    expect(supported).toContain("1.0");
  });

  it("tolerantly reads a newer-MINOR envelope with unknown fields (same MAJOR)", async () => {
    const bytes = Buffer.from("tolerant-read-evidence");
    const { pkg } = await registerChain(api, bytes);
    const envelope = {
      ...uploadEnvelope(pkg, bytes),
      contractVersion: "1.1",
      futureField: "ignored-by-v1.0-reader",
    };
    const response = await postUpload(api.baseUrl, envelope, bytes);
    await expectUploadResult(response, 201, "ACCEPTED");
  });

  it("rejects multi-part transfer descriptors (reserved for a future revision)", async () => {
    const bytes = Buffer.from("single-shot-only");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes, { part: { index: 1, total: 2 } });
    await expectSyncError(await postUpload(api.baseUrl, envelope, bytes), 400, "VALIDATION_FAILED");
  });

  it("rejects unknown /v1 paths and wrong methods with foundation semantics", async () => {
    const notFound = await fetch(`${api.baseUrl}/v1/definitely-not-a-route`);
    expect(notFound.status).toBe(404);
    expect(((await notFound.json()) as { error: string }).error).toBe("not_found");

    const wrongMethod = await fetch(`${api.baseUrl}/v1/projects`, { method: "PUT" });
    expect(wrongMethod.status).toBe(405);
    expect(((await wrongMethod.json()) as { error: string }).error).toBe("method_not_allowed");
  });
});

describe("session/project linkage", () => {
  let api: TestApi;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
  });
  afterAll(async () => {
    await stop();
  });

  it("rejects a session for an unregistered project (404 PROJECT_NOT_FOUND)", async () => {
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/sessions", SESSION_FIXTURE),
      404,
      "PROJECT_NOT_FOUND",
    );
  });

  it("rejects a package for an unregistered session (404 SESSION_NOT_FOUND)", async () => {
    await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
    const bytes = Buffer.from("unknown-session");
    const session: CaptureSession = { ...clone(SESSION_FIXTURE), sessionId: randomUUID() };
    const pkg = consistentPackage(bytes, session.sessionId);
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", pkg),
      404,
      "SESSION_NOT_FOUND",
    );
  });

  it("rejects a package whose projectId disagrees with its session", async () => {
    await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
    const bytes = Buffer.from("project-mismatch");
    const session: CaptureSession = { ...clone(SESSION_FIXTURE), sessionId: randomUUID() };
    await postJson(api.baseUrl, "/v1/sessions", session);
    const pkg = consistentPackage(bytes, session.sessionId);
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", { ...pkg, projectId: randomUUID() }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects an upload for an unregistered session (404 SESSION_NOT_FOUND)", async () => {
    const bytes = Buffer.from("upload-unknown-session");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes, { sessionId: randomUUID() });
    await expectSyncError(await postUpload(api.baseUrl, envelope, bytes), 404, "SESSION_NOT_FOUND");
  });

  it("rejects an upload for an asset no manifest declares (404 ASSET_NOT_FOUND)", async () => {
    const bytes = Buffer.from("upload-undeclared-asset");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes, { assetId: randomUUID() });
    await expectSyncError(await postUpload(api.baseUrl, envelope, bytes), 404, "ASSET_NOT_FOUND");
  });

  it("rejects a second package declaring an already-declared asset", async () => {
    const bytes = Buffer.from("asset-redeclaration");
    const { pkg } = await registerChain(api, bytes);
    const second = { ...pkg, packageId: randomUUID() };
    const error = await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", second),
      400,
      "VALIDATION_FAILED",
    );
    const conflicting = error.details?.["conflictingAssetIds"] as string[];
    expect(conflicting).toContain(pkg.assets[0]!.assetId);
  });
});

describe("hash and byte verification", () => {
  let api: TestApi;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
  });
  afterAll(async () => {
    await stop();
  });

  it("rejects bytes whose hash does not match the declared hash (422 CHECKSUM_MISMATCH)", async () => {
    const bytes = Buffer.from("correct-evidence-bytes");
    const { pkg } = await registerChain(api, bytes);
    const envelope = uploadEnvelope(pkg, bytes);
    // Same length, different content: only the hash check can catch it.
    const corrupted = Buffer.from(bytes);
    corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
    const error = await expectSyncError(
      await postUpload(api.baseUrl, envelope, corrupted),
      422,
      "CHECKSUM_MISMATCH",
    );
    expect(error.retryable).toBe(true);
    expect(typeof error.retryAfterMs).toBe("number");
    expect(error.details?.["receivedHash"]).toBe(sha256Hex(corrupted));
  });

  it("rejects an upload whose declared hash disagrees with the manifest entry", async () => {
    const bytes = Buffer.from("manifest-hash-consistency");
    const { pkg } = await registerChain(api, bytes);
    const wrongHash = sha256Hex(Buffer.from("different-bytes-entirely"));
    const envelope = uploadEnvelope(pkg, bytes, { contentHash: wrongHash });
    const error = await expectSyncError(
      await postUpload(api.baseUrl, envelope, bytes),
      400,
      "VALIDATION_FAILED",
    );
    expect(error.details?.["manifestContentHash"]).toBe(pkg.assets[0]!.contentHash);
  });

  it("rejects a payload whose length does not match the declared byteSize", async () => {
    const bytes = Buffer.from("length-check");
    const { pkg } = await registerChain(api, bytes);
    const truncated = bytes.subarray(0, bytes.length - 1);
    const envelope = uploadEnvelope(pkg, bytes);
    const error = await expectSyncError(
      await postUpload(api.baseUrl, envelope, truncated),
      400,
      "VALIDATION_FAILED",
    );
    expect(error.details?.["receivedBytes"]).toBe(truncated.length);
  });

  it("fails closed on oversized payloads (413 PAYLOAD_TOO_LARGE)", async () => {
    // Payload limit: register the chain normally, then upload bytes
    // that exceed the injected cap.
    const payloadLimited = await startApi({ maxJsonBodyBytes: 8 * 1024 * 1024, maxUploadBytes: 8 });
    try {
      const bytes = Buffer.from("oversized-payload-evidence");
      const { pkg } = await registerChain(payloadLimited, bytes);
      const envelope = uploadEnvelope(pkg, bytes);
      await expectSyncError(
        await postUpload(payloadLimited.baseUrl, envelope, bytes),
        413,
        "PAYLOAD_TOO_LARGE",
      );
    } finally {
      await payloadLimited.stop();
    }

    // JSON limit: a project envelope larger than the injected cap.
    const jsonLimited = await startApi({ maxJsonBodyBytes: 10, maxUploadBytes: 1024 });
    try {
      const bigProject = { ...PROJECT_FIXTURE, description: "x".repeat(200) };
      await expectSyncError(
        await postJson(jsonLimited.baseUrl, "/v1/projects", bigProject),
        413,
        "PAYLOAD_TOO_LARGE",
      );
    } finally {
      await jsonLimited.stop();
    }
  });
});

describe("idempotent upload semantics", () => {
  let api: TestApi;
  let stop: () => Promise<void>;
  const bytes = Buffer.from("the-logical-upload-evidence-bytes");
  let session: CaptureSession;
  let pkg: CapturePackage;
  let envelope: UploadRequest;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
    const chain = await registerChain(api, bytes);
    session = chain.session;
    pkg = chain.pkg;
    envelope = uploadEnvelope(pkg, bytes);
  });
  afterAll(async () => {
    await stop();
  });

  it("a repeated identical upload returns DUPLICATE identifying the original asset", async () => {
    const first = await postUpload(api.baseUrl, envelope, bytes);
    await expectUploadResult(first, 201, "ACCEPTED");

    const retry = await postUpload(api.baseUrl, envelope, bytes);
    const result = await expectUploadResult(retry, 200, "DUPLICATE");
    expect(result).toMatchObject({ duplicateOf: envelope.assetId });
    expect(result.receivedHash).toBe(sha256Hex(bytes));
  });

  it("many retries never create a second logical asset", async () => {
    for (let i = 0; i < 3; i += 1) {
      await postUpload(api.baseUrl, envelope, bytes);
    }
    const response = await fetch(`${api.baseUrl}/v1/sessions/${session.sessionId}`);
    const body = (await response.json()) as {
      ingestion: { acceptedAssets: number; declaredAssets: number };
    };
    expect(body.ingestion.acceptedAssets).toBe(1);
    expect(body.ingestion.declaredAssets).toBe(pkg.assets.length);
  });

  it("the same key with a different content hash produces IDEMPOTENCY_CONFLICT (fail-closed)", async () => {
    const conflictingBytes = Buffer.from("conflicting-logical-upload");
    const conflict = uploadEnvelope(pkg, bytes, {
      idempotencyKey: envelope.idempotencyKey,
      contentHash: sha256Hex(conflictingBytes),
    });
    const error = await expectSyncError(
      await postUpload(api.baseUrl, conflict, conflictingBytes),
      409,
      "IDEMPOTENCY_CONFLICT",
    );
    // Contract invariant: a conflict is never retryable.
    expect(error.retryable).toBe(false);

    // Fail closed: the original upload is untouched and still answers
    // DUPLICATE, and repeated conflict attempts stay conflicts.
    const retry = await postUpload(api.baseUrl, envelope, bytes);
    await expectUploadResult(retry, 200, "DUPLICATE");
    const errorAgain = await expectSyncError(
      await postUpload(api.baseUrl, conflict, conflictingBytes),
      409,
      "IDEMPOTENCY_CONFLICT",
    );
    expect(errorAgain.retryable).toBe(false);
  });

  it("a key bound to a different logical asset conflicts even with the same hash", async () => {
    // A second manifest (fresh package) declaring ONE fresh asset with
    // the same content hash under the same session.
    const secondPkg = clone(PACKAGE_FIXTURE);
    secondPkg.packageId = randomUUID();
    secondPkg.sessionId = session.sessionId;
    const secondAsset = { ...secondPkg.assets[1]!, assetId: randomUUID() };
    secondAsset.contentHash = pkg.assets[0]!.contentHash;
    secondAsset.byteSize = bytes.length;
    secondPkg.assets = [secondAsset];
    secondPkg.totalByteSize = bytes.length;
    const registered = await postJson(api.baseUrl, "/v1/packages", secondPkg);
    expect(registered.status).toBe(201);

    const misbound: UploadRequest = {
      contractVersion: "1.0",
      sessionId: session.sessionId,
      assetId: secondAsset.assetId,
      idempotencyKey: envelope.idempotencyKey,
      contentHash: pkg.assets[0]!.contentHash,
      byteSize: bytes.length,
    };
    const error = await expectSyncError(
      await postUpload(api.baseUrl, misbound, bytes),
      409,
      "IDEMPOTENCY_CONFLICT",
    );
    expect(error.details?.["reason"]).toBe("logical_asset_mismatch");
  });

  it("a new key for a committed asset is rejected fail-closed, never answered as DUPLICATE", async () => {
    // The finalized AISE-003 contract reserves DUPLICATE for the
    // idempotent retry of the SAME logical upload key. A new key
    // claiming an already-committed asset identity is a different
    // logical upload, so it must not produce a success outcome: the
    // gateway fails closed with a conflict carrying the committed
    // upload's reconciliation details (architect review, PR #7).
    const freshKey = uploadEnvelope(pkg, bytes, { idempotencyKey: randomUUID() });
    const response = await postUpload(api.baseUrl, freshKey, bytes);
    const body = (await response.json()) as unknown;
    const error = body as SyncError;

    // The rejection is a contract-shaped sync error (read the body
    // once; it is also reused for the upload-result regression pin).
    const syncValidation = validateSyncError(error);
    expect(syncValidation.errors, JSON.stringify(body)).toEqual([]);
    expect(response.status).toBe(409);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.retryable).toBe(false);
    expect(error.details).toMatchObject({
      reason: "asset_already_committed",
      assetId: envelope.assetId,
      sessionId: session.sessionId,
      originalIdempotencyKey: envelope.idempotencyKey,
    });

    // Regression pin for the semantic blocker: this path must never
    // emit an upload-result envelope (success/DUPLICATE semantics).
    expect(validateUploadResult(body).ok).toBe(false);

    // No second logical asset and no mutation of the committed record.
    const summaryResponse = await fetch(`${api.baseUrl}/v1/sessions/${session.sessionId}`);
    const summary = (await summaryResponse.json()) as { ingestion: { acceptedAssets: number } };
    expect(summary.ingestion.acceptedAssets).toBe(1);
    const evidence = (await (
      await fetch(
        `${api.baseUrl}/v1/sessions/${session.sessionId}/assets/${envelope.assetId}`,
      )
    ).json()) as { idempotencyKey: string };
    expect(evidence.idempotencyKey).toBe(envelope.idempotencyKey);

    // The rejected new key is not consumed: it stays free for a
    // genuinely new logical upload (fresh session/package/asset),
    // proving the failed attempt created no idempotency-key state.
    const secondBytes = Buffer.from("key-stays-free-evidence");
    const secondChain = await registerChain(api, secondBytes);
    const secondAttempt = uploadEnvelope(secondChain.pkg, secondBytes, {
      idempotencyKey: freshKey.idempotencyKey,
    });
    await expectUploadResult(
      await postUpload(api.baseUrl, secondAttempt, secondBytes),
      201,
      "ACCEPTED",
    );
  });

  it("a checksum failure consumes neither the key nor the asset slot", async () => {
    const fresh = Buffer.from("first-attempt-will-fail-evidence");
    const chain = await registerChain(api, fresh);

    const attempt = uploadEnvelope(chain.pkg, fresh);
    // Same-length wrong bytes first: 422 (hash mismatch), no state.
    const wrongBytes = Buffer.alloc(fresh.length, 0x58);
    await expectSyncError(
      await postUpload(api.baseUrl, attempt, wrongBytes),
      422,
      "CHECKSUM_MISMATCH",
    );
    // Corrected retry with the SAME key: accepted.
    await expectUploadResult(await postUpload(api.baseUrl, attempt, fresh), 201, "ACCEPTED");
  });

  it("uploads for assets of a rejected manifest find no declaration (no state from rejection)", async () => {
    const fresh = Buffer.from("rejected-manifest-asset");
    const chain = await registerChain(api, fresh);

    // A manifest for a brand-new asset, rejected for byte-total drift.
    const rejected = consistentPackage(fresh, chain.session.sessionId);
    const freshAssetId = randomUUID();
    rejected.assets[0]!.assetId = freshAssetId;
    rejected.totalByteSize = (rejected.totalByteSize ?? 0) + 1;
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", rejected),
      400,
      "VALIDATION_FAILED",
    );

    // Its asset is undeclared, so the upload fails closed with 404.
    const attempt = uploadEnvelope(rejected, fresh);
    await expectSyncError(await postUpload(api.baseUrl, attempt, fresh), 404, "ASSET_NOT_FOUND");
  });
});

describe("raw evidence metadata preservation", () => {
  let api: TestApi;
  let stop: () => Promise<void>;
  const bytes = Buffer.from("immutable-raw-evidence-payload");
  let session: CaptureSession;
  let pkg: CapturePackage;
  let envelope: UploadRequest;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
    const chain = await registerChain(api, bytes);
    session = chain.session;
    pkg = chain.pkg;
    envelope = uploadEnvelope(pkg, bytes);
    await postUpload(api.baseUrl, envelope, bytes);
  });
  afterAll(async () => {
    await stop();
  });

  function evidenceUrl(): string {
    return `${api.baseUrl}/v1/sessions/${session.sessionId}/assets/${envelope.assetId}`;
  }

  it("stores the acquisition metadata verbatim with server-computed hash and receipt time", async () => {
    const response = await fetch(evidenceUrl());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      acquisition: Record<string, unknown>;
      receivedHash: string;
      receivedAt: string;
      idempotencyKey: string;
      byteSize: number;
      contentHash: string;
      packageId: string;
    };
    expect(body.status).toBe("accepted");
    expect(body.acquisition).toEqual(pkg.assets[0]!.acquisition);
    expect(body.receivedHash).toBe(sha256Hex(bytes));
    expect(body.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
    expect(body.idempotencyKey).toBe(envelope.idempotencyKey);
    expect(body.byteSize).toBe(bytes.length);
    expect(body.contentHash).toBe(pkg.assets[0]!.contentHash);
    expect(body.packageId).toBe(pkg.packageId);
  });

  it("declared-but-not-uploaded assets answer with status declared", async () => {
    const declaredAsset = pkg.assets[1]!;
    const response = await fetch(
      `${api.baseUrl}/v1/sessions/${session.sessionId}/assets/${declaredAsset.assetId}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; assetId: string };
    expect(body.status).toBe("declared");
    expect(body.assetId).toBe(declaredAsset.assetId);
  });

  it("unknown assets answer 404 ASSET_NOT_FOUND with a contract-shaped error", async () => {
    await expectSyncError(
      await fetch(`${api.baseUrl}/v1/sessions/${session.sessionId}/assets/${randomUUID()}`),
      404,
      "ASSET_NOT_FOUND",
    );
  });

  it("the evidence record is immutable across retries, new keys and conflicts", async () => {
    const before = await (await fetch(evidenceUrl())).json();

    await postUpload(api.baseUrl, envelope, bytes); // duplicate retry (200 DUPLICATE)
    await postUpload(
      api.baseUrl,
      uploadEnvelope(pkg, bytes, { idempotencyKey: randomUUID() }),
      bytes,
    ); // new key: rejected (409), never a second logical asset
    await postUpload(
      api.baseUrl,
      uploadEnvelope(pkg, bytes, {
        idempotencyKey: envelope.idempotencyKey,
        contentHash: sha256Hex(Buffer.from("conflicting evidence bytes")),
      }),
      Buffer.from("conflicting evidence bytes"),
    ); // conflict attempt (409 IDEMPOTENCY_CONFLICT)

    const after = await (await fetch(evidenceUrl())).json();
    expect(after).toEqual(before);
  });
});

describe("capture session maintenance", () => {
  let api: TestApi;
  let stop: () => Promise<void>;
  let session: CaptureSession;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
    await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
    session = { ...clone(SESSION_FIXTURE), sessionId: randomUUID() };
    const response = await postJson(api.baseUrl, "/v1/sessions", session);
    expect(response.status).toBe(201);
  });
  afterAll(async () => {
    await stop();
  });

  it("accepts forward status transitions and mutable field updates", async () => {
    const completed: CaptureSession = { ...session, status: "COMPLETED", updatedAt: "2026-09-04T09:00:00Z" };
    const response = await putJson(api.baseUrl, `/v1/sessions/${session.sessionId}`, completed);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(completed);
  });

  it("rejects backwards status transitions", async () => {
    const backwards: CaptureSession = { ...session, status: "DRAFT" };
    const error = await expectSyncError(
      await putJson(api.baseUrl, `/v1/sessions/${session.sessionId}`, backwards),
      400,
      "VALIDATION_FAILED",
    );
    expect(error.details?.["from"]).toBe("COMPLETED");
    expect(error.details?.["to"]).toBe("DRAFT");
  });

  it("rejects changes to immutable identity fields", async () => {
    const mutated: CaptureSession = { ...session, intent: "INSPECTION" };
    const error = await expectSyncError(
      await putJson(api.baseUrl, `/v1/sessions/${session.sessionId}`, mutated),
      400,
      "VALIDATION_FAILED",
    );
    const fields = error.details?.["fields"] as string[];
    expect(fields).toContain("intent");
  });

  it("rejects a path/envelope session id mismatch", async () => {
    await expectSyncError(
      await putJson(api.baseUrl, `/v1/sessions/${randomUUID()}`, session),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects updates and reads for unregistered sessions (404 SESSION_NOT_FOUND)", async () => {
    const unknown: CaptureSession = { ...session, sessionId: randomUUID() };
    await expectSyncError(
      await putJson(api.baseUrl, `/v1/sessions/${unknown.sessionId}`, unknown),
      404,
      "SESSION_NOT_FOUND",
    );
    await expectSyncError(
      await fetch(`${api.baseUrl}/v1/sessions/${randomUUID()}`),
      404,
      "SESSION_NOT_FOUND",
    );
  });
});

describe("tolerant reading of newer-MINOR payloads (same MAJOR)", () => {
  let api: TestApi;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const started = await startApi();
    api = started;
    stop = started.stop;
    await postJson(api.baseUrl, "/v1/projects", PROJECT_FIXTURE);
  });
  afterAll(async () => {
    await stop();
  });

  it("accepts a 1.1 session with unknown fields and unknown enum values; the read model carries the reader sentinel", async () => {
    // A newer-MINOR payload carries enum values outside the v1.0
    // vocabulary, so it is deliberately NOT typed as CaptureSession.
    const newer = {
      ...clone(SESSION_FIXTURE),
      sessionId: randomUUID(),
      contractVersion: "1.1",
      intent: "SPOT_CHECK", // a future v1.1 intent unknown to v1.0
      assuranceProfile: "AUDIT_PROFILE",
      status: "PAUSED",
      futureSessionField: "ignored-by-v1.0-reader",
    };
    const response = await postJson(api.baseUrl, "/v1/sessions", newer);
    expect(response.status).toBe(201);
    const echo = (await response.json()) as Record<string, unknown>;

    // Unknown fields dropped; unknown enum values mapped to the
    // documented reader sentinel `unknown` — never coerced onto an
    // existing member; contractVersion read as the v1.0 subset.
    expect(echo["futureSessionField"]).toBeUndefined();
    expect(echo["intent"]).toBe("unknown");
    expect(echo["assuranceProfile"]).toBe("unknown");
    expect(echo["status"]).toBe("unknown");
    expect(echo["contractVersion"]).toBe("1.0");
    expect(echo["sessionId"]).toBe(newer.sessionId);

    // The read model round-trips the same projection.
    const read = await (await fetch(`${api.baseUrl}/v1/sessions/${newer.sessionId}`)).json();
    expect((read as { session: Record<string, unknown> }).session).toEqual(echo);
  });

  it("preserves known enum members through the tolerant path", async () => {
    const newer: CaptureSession = {
      ...clone(SESSION_FIXTURE),
      sessionId: randomUUID(),
      contractVersion: "1.1",
    };
    const response = await postJson(api.baseUrl, "/v1/sessions", newer);
    expect(response.status).toBe(201);
    const echo = (await response.json()) as Record<string, unknown>;
    // v1.0 members survive the projection unchanged (the enum
    // vocabularies are derived from the canonical schemas, so a
    // member can never be mistaken for an unknown value).
    expect(echo["intent"]).toBe("AS_BUILT");
    expect(echo["assuranceProfile"]).toBe("HIGH_ASSURANCE");
    expect(echo["status"]).toBe("IN_PROGRESS");
  });

  it("accepts a 1.1 manifest with unknown nested fields at every level; the echo drops them all", async () => {
    const bytes = Buffer.from("newer-minor-nested-evidence");
    const sessionId = randomUUID();
    const base = consistentPackage(bytes, sessionId);
    const session: CaptureSession = { ...clone(SESSION_FIXTURE), sessionId };
    expect((await postJson(api.baseUrl, "/v1/sessions", session)).status).toBe(201);

    const newer = base as unknown as Record<string, unknown>;
    newer["contractVersion"] = "1.1";
    newer["futurePackageField"] = "ignored";
    const asset = (base.assets[0] as unknown as Record<string, unknown>);
    asset["futureAssetField"] = "ignored";
    asset["assetType"] = "THERMAL"; // unknown to v1.0
    const acquisition = asset["acquisition"] as Record<string, unknown>;
    acquisition["futureAcquisitionField"] = "ignored";
    (acquisition["geolocation"] as Record<string, unknown>)["futureGeolocationField"] = "ignored";
    (acquisition["orientation"] as Record<string, unknown>)["futureOrientationField"] = "ignored";
    (
      (acquisition["orientation"] as Record<string, unknown>)["quaternion"] as Record<string, unknown>
    )["futureQuaternionField"] = "ignored";

    const response = await postJson(api.baseUrl, "/v1/packages", newer);
    expect(response.status).toBe(201);
    const echo = (await response.json()) as Record<string, unknown>;
    const echoedAssets = echo["assets"] as Array<Record<string, unknown>>;

    expect(echo["contractVersion"]).toBe("1.0");
    const echoedAsset = echoedAssets[0]!;
    const echoedAcquisition = echoedAsset["acquisition"] as Record<string, unknown>;

    // Unknown fields are dropped at EVERY nesting level — top level,
    // asset, acquisition, geolocation, orientation and quaternion.
    expect(echo["futurePackageField"]).toBeUndefined();
    expect(echoedAsset["futureAssetField"]).toBeUndefined();
    expect(echoedAcquisition["futureAcquisitionField"]).toBeUndefined();
    expect((echoedAcquisition["geolocation"] as Record<string, unknown>)["futureGeolocationField"]).toBeUndefined();
    expect((echoedAcquisition["orientation"] as Record<string, unknown>)["futureOrientationField"]).toBeUndefined();
    expect(
      ((echoedAcquisition["orientation"] as Record<string, unknown>)["quaternion"] as Record<string, unknown>)[
        "futureQuaternionField"
      ],
    ).toBeUndefined();

    // Known nested evidence values are preserved verbatim…
    const geolocation = echoedAcquisition["geolocation"] as Record<string, number>;
    expect(geolocation["latitude"]).toBe(5.6037);
    const quaternion = (echoedAcquisition["orientation"] as Record<string, unknown>)["quaternion"] as Record<
      string,
      number
    >;
    expect(quaternion["w"]).toBe(0.9996);
    // …and the unknown assetType is the reader sentinel, never a member.
    expect(echoedAsset["assetType"]).toBe("unknown");
    expect(echoedAssets[1]!["assetType"]).toBe("DEPTH");
  });

  it("still rejects malformed known fields inside newer-MINOR payloads (tolerant is not lax)", async () => {
    const newer: CaptureSession = {
      ...clone(SESSION_FIXTURE),
      sessionId: randomUUID(),
      contractVersion: "1.1",
      projectId: "not-a-uuid",
    };
    const error = await expectSyncError(
      await postJson(api.baseUrl, "/v1/sessions", newer),
      400,
      "VALIDATION_FAILED",
    );
    expect(Array.isArray(error.details?.["validationErrors"])).toBe(true);
  });

  it("rejects non-string enum values in newer-MINOR payloads (only strings map to the sentinel)", async () => {
    const newer = {
      ...clone(SESSION_FIXTURE),
      sessionId: randomUUID(),
      contractVersion: "1.1",
      intent: 42,
    };
    await expectSyncError(
      await postJson(api.baseUrl, "/v1/sessions", newer),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects a newer-MINOR manifest missing a required v1.0 field", async () => {
    const bytes = Buffer.from("newer-minor-missing-field-evidence");
    const sessionId = randomUUID();
    const base = consistentPackage(bytes, sessionId);
    const session: CaptureSession = { ...clone(SESSION_FIXTURE), sessionId };
    expect((await postJson(api.baseUrl, "/v1/sessions", session)).status).toBe(201);

    const newer = base as unknown as Record<string, unknown>;
    newer["contractVersion"] = "1.1";
    delete (newer["assets"] as Array<Record<string, unknown>>)[0]!["contentHash"];

    await expectSyncError(
      await postJson(api.baseUrl, "/v1/packages", newer),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("fails closed on session updates whose status the reader cannot evaluate (sentinel)", async () => {
    // The 1.1 status "PAUSED" is unknown to v1.0, so this payload is
    // deliberately NOT typed as CaptureSession.
    const unknownStatus = {
      ...clone(SESSION_FIXTURE),
      sessionId: randomUUID(),
      contractVersion: "1.1",
      status: "PAUSED", // unknown to v1.0 → read as the sentinel
    };
    expect((await postJson(api.baseUrl, "/v1/sessions", unknownStatus)).status).toBe(201);

    // Updating with the same newer-MINOR envelope: both statuses are
    // the sentinel — the real transition is unverifiable → fail closed.
    const sameAgain = await putJson(
      api.baseUrl,
      `/v1/sessions/${unknownStatus.sessionId}`,
      unknownStatus,
    );
    const sameError = await expectSyncError(sameAgain, 400, "VALIDATION_FAILED");
    expect(sameError.details).toMatchObject({ reason: "unknown_status_value" });

    // Updating to a KNOWN v1.0 status is equally unevaluable: the
    // stored status is the sentinel → fail closed, no state change.
    const promoted = {
      ...unknownStatus,
      contractVersion: "1.0",
      status: "IN_PROGRESS",
    };
    const promoteError = await expectSyncError(
      await putJson(api.baseUrl, `/v1/sessions/${unknownStatus.sessionId}`, promoted),
      400,
      "VALIDATION_FAILED",
    );
    expect(promoteError.details).toMatchObject({ reason: "unknown_status_value" });

    // The stored session was never mutated by the rejected updates.
    const stored = (await (
      await fetch(`${api.baseUrl}/v1/sessions/${unknownStatus.sessionId}`)
    ).json()) as { session: Record<string, unknown> };
    expect(stored.session["status"]).toBe("unknown");
  });
});
