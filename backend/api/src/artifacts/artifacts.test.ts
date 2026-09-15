/**
 * Artifact service + router tests — PROD-006 (offline, deterministic).
 *
 * Coverage discipline (the work order's acceptance surface):
 *  - LIMITS MATRIX BEFORE STORAGE: cap-1/cap/cap+1 → 200/200/413; type
 *    allowlist → 415; empty body → 400 (all with the stable envelope);
 *  - ACCESS MATRIX through the real port: own project → allow, cross-project
 *    → 403, anonymous → 401 (test predicate; PROD-010 wires the real one);
 *  - LIFECYCLE ROUND-TRIP over the Fs twin: upload → list → get → content →
 *    delete (idempotent), duplicate/conflict semantics, content-addressed
 *    blob dedup with refcounted removal, metadata provenance links BY
 *    REFERENCE, retention enumeration (never auto-deletion), determinism
 *    (byte-identical rows for identical inputs);
 *  - QUOTA/AVAILABILITY: typed storage failures map to 503 codes.
 *
 * Everything runs against injected fakes / temp dirs — never live R2.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../lib/log";
import { sha256Hex } from "../lib/hash";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler, type HandlerOptions } from "../server";
import {
  ANONYMOUS_ARTIFACT_CONTEXT,
  principalTenantPredicate,
  type ArtifactAccessContext,
  type ArtifactAccessPredicate,
} from "./access";
import { ArtifactService, ArtifactServiceError } from "./service";
import { FsArtifactStorage } from "./fs-storage";
import { FsArtifactMetadataStore, InMemoryArtifactMetadataStore } from "./store";
import { ArtifactStorageError, type ArtifactStorage } from "./storage";
import { handleArtifactsRequest, type ArtifactsRouteOptions } from "./router";
import { RETENTION_POLICY } from "./model";

const quietLogger = createLogger("error");
const FIXED_CLOCK = "2026-01-01T00:00:00.000Z";

/** A tiny in-memory content-addressed blob store (tests the SERVICE logic). */
class MemoryBlobStorage implements ArtifactStorage {
  private readonly blobs = new Map<string, Uint8Array>();

  async put(contentSha256: string, bytes: Uint8Array): Promise<{ outcome: "stored"; byteSize: number }> {
    this.blobs.set(contentSha256, new Uint8Array(bytes));
    return { outcome: "stored", byteSize: bytes.length };
  }

  async get(contentSha256: string): Promise<Uint8Array | null> {
    const blob = this.blobs.get(contentSha256);
    return blob === undefined ? null : new Uint8Array(blob);
  }

  async head(contentSha256: string): Promise<{ byteSize: number } | null> {
    const blob = this.blobs.get(contentSha256);
    return blob === undefined ? null : { byteSize: blob.length };
  }

  async remove(contentSha256: string): Promise<boolean> {
    return this.blobs.delete(contentSha256);
  }

  describe(): { kind: "local-fs"; root: string } {
    return { kind: "local-fs", root: "memory://artifacts" };
  }

  get size(): number {
    return this.blobs.size;
  }
}

/** A blob store whose every operation fails with a typed error (503 paths). */
class FailingBlobStorage implements ArtifactStorage {
  constructor(private readonly failureKind: "unavailable" | "quota_exceeded" | "auth_failed") {}

  private fail(): never {
    throw new ArtifactStorageError(this.failureKind, `injected ${this.failureKind} failure`);
  }

  put(): Promise<never> {
    this.fail();
  }

  get(): Promise<never> {
    this.fail();
  }

  head(): Promise<never> {
    this.fail();
  }

  remove(): Promise<never> {
    this.fail();
  }

  describe(): { kind: "unavailable"; reason: string } {
    return { kind: "unavailable", reason: "injected failure" };
  }
}

function memoryService(maxBytes = 25 * 1024 * 1024): {
  service: ArtifactService;
  storage: MemoryBlobStorage;
} {
  const storage = new MemoryBlobStorage();
  const service = new ArtifactService({
    storage,
    metadata: new InMemoryArtifactMetadataStore(),
    limits: { maxBytes },
    clock: (): string => FIXED_CLOCK,
  });
  return { service, storage };
}

function routeOptions(
  service: ArtifactService,
  accessPredicate: ArtifactAccessPredicate = async () => ({ outcome: "allow" }),
  accessContextFromRequest?: (request: Request) => ArtifactAccessContext,
): ArtifactsRouteOptions {
  return {
    service,
    logger: quietLogger,
    accessPredicate,
    ...(accessContextFromRequest === undefined ? {} : { accessContextFromRequest }),
  };
}

const BASE = "http://localhost";

function artifactUrl(path: string): string {
  return `${BASE}${path}`;
}

function uploadRequest(
  body: Uint8Array | string,
  headers: Record<string, string>,
): Request {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return new Request(artifactUrl("/v1/artifacts"), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: new Uint8Array(bytes),
  });
}

const PLAIN_HEADERS = { "x-aise-project-id": "proj-a", "x-aise-kind": "boq" };

async function call(
  request: Request,
  options: ArtifactsRouteOptions,
): Promise<Response> {
  const response = await handleArtifactsRequest(
    request,
    new URL(request.url),
    "req-test",
    options,
  );
  expect(response).not.toBeNull();
  return response!;
}

/* ------------------------------------------------------------------ */
/* Limits boundary matrix (BEFORE any storage call)                    */
/* ------------------------------------------------------------------ */

describe("upload limits matrix (enforced before storage, stable envelope)", () => {
  const CAP = 10;

  test("cap-1 and cap are stored; cap+1 is rejected 413 with zero bytes written", async () => {
    const { service, storage } = memoryService(CAP);
    const options = routeOptions(service);

    const under = await call(
      uploadRequest("a".repeat(CAP - 1), PLAIN_HEADERS),
      options,
    );
    expect(under.status).toBe(201);

    const exact = await call(uploadRequest("a".repeat(CAP), PLAIN_HEADERS), options);
    expect(exact.status).toBe(201);
    expect(storage.size).toBe(2);

    const over = await call(uploadRequest("a".repeat(CAP + 1), PLAIN_HEADERS), options);
    expect(over.status).toBe(413);
    const body = (await over.json()) as { ok: boolean; error: string; detail?: string };
    expect(body).toEqual({ ok: false, error: "payload_too_large", detail: expect.stringContaining("AISE_ARTIFACT_MAX_BYTES") });
    // The rejected upload never wrote a byte.
    expect(storage.size).toBe(2);
  });

  test("empty body is rejected 400 empty_body before storage", async () => {
    const { service, storage } = memoryService();
    const response = await call(uploadRequest(new Uint8Array([]), PLAIN_HEADERS), routeOptions(service));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "empty_body" });
    expect(storage.size).toBe(0);
  });

  test("type allowlist: wrong content-type for the kind is 415; right one is stored", async () => {
    const { service } = memoryService();
    const options = routeOptions(service);

    const wrong = await call(
      uploadRequest("{}", { ...PLAIN_HEADERS, "content-type": "text/plain" }),
      options,
    );
    expect(wrong.status).toBe(415);
    expect(await wrong.json()).toMatchObject({ ok: false, error: "unsupported_media_type" });

    const right = await call(uploadRequest("{}", PLAIN_HEADERS), options);
    expect(right.status).toBe(201);
  });

  test("kind type matrix: boq json/csv/xlsx, image jpeg/png/webp, video mp4/mov pass; others 415", async () => {
    const { service } = memoryService();
    const options = routeOptions(service);
    const cases: Array<{ kind: string; type: string; ok: boolean }> = [
      { kind: "boq", type: "application/json", ok: true },
      { kind: "boq", type: "text/csv", ok: true },
      {
        kind: "boq",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ok: true,
      },
      { kind: "boq", type: "image/png", ok: false },
      { kind: "image", type: "image/jpeg", ok: true },
      { kind: "image", type: "image/png", ok: true },
      { kind: "image", type: "image/webp", ok: true },
      { kind: "image", type: "image/gif", ok: false },
      { kind: "video", type: "video/mp4", ok: true },
      { kind: "video", type: "video/quicktime", ok: true },
      { kind: "video", type: "video/x-msvideo", ok: false },
      { kind: "capture", type: "image/jpeg", ok: true },
      { kind: "capture", type: "application/json", ok: true },
      { kind: "capture", type: "audio/mpeg", ok: false },
    ];
    for (const [index, testCase] of cases.entries()) {
      const response = await call(
        uploadRequest(`case-${index}`, {
          "x-aise-project-id": "proj-a",
          "x-aise-kind": testCase.kind,
          "content-type": testCase.type,
        }),
        options,
      );
      expect([response.status, testCase.kind, testCase.type]).toEqual([
        testCase.ok ? 201 : 415,
        testCase.kind,
        testCase.type,
      ]);
    }
  });

  test("derived artifacts require a filename with an allowed extension", async () => {
    const { service } = memoryService();
    const options = routeOptions(service);

    const noName = await call(
      uploadRequest("x", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "derived",
        "content-type": "application/octet-stream",
      }),
      options,
    );
    expect(noName.status).toBe(400);
    expect(await noName.json()).toMatchObject({ ok: false, error: "filename_required" });

    const good = await call(
      uploadRequest("x", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "derived",
        "x-aise-filename": "mesh.obj",
        "content-type": "application/octet-stream",
      }),
      options,
    );
    expect(good.status).toBe(201);

    const badExtension = await call(
      uploadRequest("x", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "derived",
        "x-aise-filename": "mesh.exe",
        "content-type": "application/octet-stream",
      }),
      options,
    );
    expect(badExtension.status).toBe(415);
  });

  test("content-type parameters are stripped before the allowlist check", async () => {
    const { service } = memoryService();
    const response = await call(
      uploadRequest("{}", { ...PLAIN_HEADERS, "content-type": "application/json; charset=utf-8" }),
      routeOptions(service),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { artifact: { contentType: string } };
    expect(body.artifact.contentType).toBe("application/json");
  });

  test("unknown kinds and invalid scopes are 400", async () => {
    const { service } = memoryService();
    const options = routeOptions(service);

    const badKind = await call(
      uploadRequest("x", { "x-aise-project-id": "proj-a", "x-aise-kind": "mystery" }),
      options,
    );
    expect(badKind.status).toBe(400);
    expect(await badKind.json()).toMatchObject({ ok: false, error: "invalid_kind" });

    const badScope = await call(
      uploadRequest("x", { "x-aise-project-id": "../escape", "x-aise-kind": "boq" }),
      options,
    );
    expect(badScope.status).toBe(400);
    expect(await badScope.json()).toMatchObject({ ok: false, error: "invalid_project_id" });
  });
});

/* ------------------------------------------------------------------ */
/* Access predicate matrix (the port is the authority)                 */
/* ------------------------------------------------------------------ */

describe("access predicate matrix (own / cross-project / anonymous)", () => {
  const predicate = principalTenantPredicate({
    resolveTenant: (projectId) => (projectId === "proj-a" ? "tenant-1" : "tenant-2"),
  });
  const contextFrom = (request: Request): ArtifactAccessContext => {
    const principal = request.headers.get("x-test-principal");
    if (principal === null) {
      return ANONYMOUS_ARTIFACT_CONTEXT;
    }
    return { kind: "principal", principalId: principal, tenantId: request.headers.get("x-test-tenant") };
  };

  async function prepared(): Promise<{ options: ArtifactsRouteOptions; artifactId: string }> {
    const { service } = memoryService();
    const options = routeOptions(service, predicate, contextFrom);
    const response = await call(
      uploadRequest("seed", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "boq",
        "x-test-principal": "p1",
        "x-test-tenant": "tenant-1",
      }),
      options,
    );
    const body = (await response.json()) as { artifact: { artifactId: string } };
    return { options, artifactId: body.artifact.artifactId };
  }

  test("own-project principal can list, read, fetch content and delete", async () => {
    const { options, artifactId } = await prepared();
    const own = { "x-test-principal": "p1", "x-test-tenant": "tenant-1" };

    const list = await call(
      new Request(artifactUrl("/v1/artifacts?projectId=proj-a"), { headers: own }),
      options,
    );
    expect(list.status).toBe(200);

    const read = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        headers: { "x-aise-project-id": "proj-a", ...own },
      }),
      options,
    );
    expect(read.status).toBe(200);

    const content = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}/content`), {
        headers: { "x-aise-project-id": "proj-a", ...own },
      }),
      options,
    );
    expect(content.status).toBe(200);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(new TextEncoder().encode("seed"));

    const removed = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-a", ...own },
      }),
      options,
    );
    expect(removed.status).toBe(200);
  });

  test("cross-project principal gets 403 forbidden on every operation", async () => {
    const { options, artifactId } = await prepared();
    const foreign = { "x-test-principal": "p2", "x-test-tenant": "tenant-2" };

    const list = await call(
      new Request(artifactUrl("/v1/artifacts?projectId=proj-a"), { headers: foreign }),
      options,
    );
    expect(list.status).toBe(403);
    expect(await list.json()).toMatchObject({ ok: false, error: "forbidden" });

    const read = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        headers: { "x-aise-project-id": "proj-a", ...foreign },
      }),
      options,
    );
    expect(read.status).toBe(403);

    const content = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}/content`), {
        headers: { "x-aise-project-id": "proj-a", ...foreign },
      }),
      options,
    );
    expect(content.status).toBe(403);

    const removed = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-a", ...foreign },
      }),
      options,
    );
    expect(removed.status).toBe(403);

    const upload = await call(
      uploadRequest("x", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "boq",
        ...foreign,
      }),
      options,
    );
    expect(upload.status).toBe(403);
  });

  test("anonymous gets 401 unauthorized when the predicate requires a principal", async () => {
    const { options, artifactId } = await prepared();

    const list = await call(
      new Request(artifactUrl("/v1/artifacts?projectId=proj-a")),
      options,
    );
    expect(list.status).toBe(401);
    expect(await list.json()).toMatchObject({ ok: false, error: "unauthorized" });

    const read = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(read.status).toBe(401);

    const removed = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(removed.status).toBe(401);
  });

  test("every denial carries the x-request-id correlation header", async () => {
    const { options } = await prepared();
    const response = await call(
      new Request(artifactUrl("/v1/artifacts?projectId=proj-a")),
      options,
    );
    expect(response.headers.get("x-request-id")).toBe("req-test");
  });
});

/* ------------------------------------------------------------------ */
/* Fs twin lifecycle round-trip + provenance + dedup + retention       */
/* ------------------------------------------------------------------ */

describe("Fs adapter lifecycle round-trip", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "aise-artifacts-test-"));
  });

  test("upload → list → get → content → delete → idempotent re-delete", async () => {
    const service = new ArtifactService({
      storage: new FsArtifactStorage(dataDir),
      metadata: new FsArtifactMetadataStore(dataDir),
      limits: { maxBytes: 1024 },
      clock: (): string => FIXED_CLOCK,
    });
    const options = routeOptions(service);

    const evidenceId = "a".repeat(64);
    const derivationId = "derivation-001";
    const upload = await call(
      uploadRequest("round-trip-body", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "boq",
        "x-aise-filename": "boq.json",
        "x-aise-evidence-ids": `${evidenceId},${evidenceId}`,
        "x-aise-derivation-ids": derivationId,
      }),
      options,
    );
    expect(upload.status).toBe(201);
    const uploaded = (await upload.json()) as {
      artifact: {
        artifactId: string;
        evidenceIds: string[];
        derivationIds: string[];
        sha256: string;
        retention: string;
      };
    };
    // Content addressing: the id IS the sha-256 of the bytes.
    expect(uploaded.artifact.artifactId).toBe(uploaded.artifact.sha256);
    // Provenance links BY REFERENCE, duplicates collapsed.
    expect(uploaded.artifact.evidenceIds).toEqual([evidenceId]);
    expect(uploaded.artifact.derivationIds).toEqual([derivationId]);
    expect(uploaded.artifact.retention).toBe("project-evidence");

    const artifactId = uploaded.artifact.artifactId;

    const list = await call(
      new Request(artifactUrl("/v1/artifacts?projectId=proj-a")),
      options,
    );
    expect(((await list.json()) as { artifacts: unknown[] }).artifacts).toHaveLength(1);

    const read = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(read.status).toBe(200);

    const content = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}/content`), {
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(content.headers.get("content-type")).toBe("application/json");
    expect(content.headers.get("x-artifact-id")).toBe(artifactId);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(
      new TextEncoder().encode("round-trip-body"),
    );

    const removed = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { artifact: { state: string } }).artifact.state).toBe("deleted");

    // Tombstones read as absent; re-delete is idempotent.
    const afterDelete = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(afterDelete.status).toBe(404);
    const reDelete = await call(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(reDelete.status).toBe(200);
  });

  test("same content + same metadata re-upload is an idempotent duplicate; different metadata is a 409 conflict", async () => {
    const service = new ArtifactService({
      storage: new FsArtifactStorage(dataDir),
      metadata: new FsArtifactMetadataStore(dataDir),
      limits: { maxBytes: 1024 },
      clock: (): string => FIXED_CLOCK,
    });
    const options = routeOptions(service);
    const headers = { "x-aise-project-id": "proj-a", "x-aise-kind": "boq" };

    const first = await call(uploadRequest("same-bytes", headers), options);
    expect(first.status).toBe(201);

    const second = await call(uploadRequest("same-bytes", headers), options);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { duplicate: boolean }).duplicate).toBe(true);

    const conflicting = await call(
      uploadRequest("same-bytes", { ...headers, "x-aise-filename": "renamed.json" }),
      options,
    );
    expect(conflicting.status).toBe(409);
    expect(await conflicting.json()).toMatchObject({ ok: false, error: "artifact_conflict" });
  });

  test("content-addressed blob dedup across projects with refcounted removal", async () => {
    const storage = new FsArtifactStorage(dataDir);
    const service = new ArtifactService({
      storage,
      metadata: new FsArtifactMetadataStore(dataDir),
      limits: { maxBytes: 1024 },
      clock: (): string => FIXED_CLOCK,
    });
    const options = routeOptions(service);

    const uploadA = await call(
      uploadRequest("shared-bytes", { "x-aise-project-id": "proj-a", "x-aise-kind": "boq" }),
      options,
    );
    const uploadB = await call(
      uploadRequest("shared-bytes", { "x-aise-project-id": "proj-b", "x-aise-kind": "boq" }),
      options,
    );
    const idA = ((await uploadA.json()) as { artifact: { artifactId: string } }).artifact.artifactId;
    const idB = ((await uploadB.json()) as { artifact: { artifactId: string } }).artifact.artifactId;
    expect(idA).toBe(idB);

    // Deleting one project's row keeps the shared blob; deleting the last
    // reference removes it.
    await call(
      new Request(artifactUrl(`/v1/artifacts/${idA}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-a" },
      }),
      options,
    );
    expect(await storage.head(idA)).toEqual({ byteSize: "shared-bytes".length });

    await call(
      new Request(artifactUrl(`/v1/artifacts/${idB}`), {
        method: "DELETE",
        headers: { "x-aise-project-id": "proj-b" },
      }),
      options,
    );
    expect(await storage.head(idB)).toBeNull();
  });

  test("determinism: identical inputs produce byte-identical metadata rows", async () => {
    const dirs = [
      mkdtempSync(join(tmpdir(), "aise-det-1-")),
      mkdtempSync(join(tmpdir(), "aise-det-2-")),
    ];
    const artifactIds: string[] = [];
    for (const dir of dirs) {
      const service = new ArtifactService({
        storage: new FsArtifactStorage(dir),
        metadata: new FsArtifactMetadataStore(dir),
        limits: { maxBytes: 1024 },
        clock: (): string => FIXED_CLOCK,
      });
      const response = await call(
        uploadRequest("deterministic-bytes", {
          "x-aise-project-id": "proj-a",
          "x-aise-kind": "boq",
          "x-aise-evidence-ids": `${"b".repeat(64)},${"c".repeat(64)}`,
        }),
        routeOptions(service),
      );
      artifactIds.push(((await response.json()) as { artifact: { artifactId: string } }).artifact.artifactId);
    }
    expect(artifactIds[0]).toBe(artifactIds[1]);
    const projectDir = sha256Hex("proj-a");
    const rowA = readFileSync(
      join(dirs[0]!, "artifacts", "records", projectDir, `${artifactIds[0]}.json`),
      "utf8",
    );
    const rowB = readFileSync(
      join(dirs[1]!, "artifacts", "records", projectDir, `${artifactIds[1]}.json`),
      "utf8",
    );
    expect(rowA).toBe(rowB);
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("retention enumeration: demo-fixture purgeable, project-evidence never, derived-cache after TTL", async () => {
    const service = new ArtifactService({
      storage: new FsArtifactStorage(dataDir),
      metadata: new FsArtifactMetadataStore(dataDir),
      limits: { maxBytes: 1024 },
      clock: (): string => FIXED_CLOCK,
    });
    const options = routeOptions(service);

    await call(
      uploadRequest("fixture", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "boq",
        "x-aise-retention": "demo-fixture",
      }),
      options,
    );
    await call(uploadRequest("evidence", PLAIN_HEADERS), options);
    await call(
      uploadRequest("derived-cache", {
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "boq",
        "x-aise-retention": "derived-cache",
      }),
      options,
    );

    const uploadedAt = Date.parse(FIXED_CLOCK);
    const ttlMs = RETENTION_POLICY["derived-cache"].ttlSeconds! * 1000;

    // Before the TTL: only the demo fixture is a candidate.
    const early = await service.purgeScan(uploadedAt + ttlMs - 1);
    expect(early.map((record) => record.retention)).toEqual(["demo-fixture"]);

    // After the TTL: fixture + expired cache (evidence NEVER).
    const late = await service.purgeScan(uploadedAt + ttlMs + 1);
    expect(late.map((record) => record.retention).sort()).toEqual(["demo-fixture", "derived-cache"]);

    // purgeScan never deletes; the explicit purge call does.
    expect((await service.listArtifacts("proj-a")).length).toBe(3);
    const purged = await service.purgeArtifacts(uploadedAt + ttlMs + 1);
    expect(purged).toHaveLength(2);
    expect((await service.listArtifacts("proj-a")).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Quota / availability honesty                                        */
/* ------------------------------------------------------------------ */

describe("typed storage failures map to 503 codes", () => {
  for (const failureKind of ["unavailable", "quota_exceeded", "auth_failed"] as const) {
    test(`${failureKind} → 503 with the stable envelope`, async () => {
      const service = new ArtifactService({
        storage: new FailingBlobStorage(failureKind),
        metadata: new InMemoryArtifactMetadataStore(),
        limits: { maxBytes: 1024 },
        clock: (): string => FIXED_CLOCK,
      });
      const response = await call(
        uploadRequest("x", PLAIN_HEADERS),
        routeOptions(service),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: `storage_${failureKind}`,
      });
    });
  }

  test("the service maps storage failure kinds 1:1 to its error codes", async () => {
    const service = new ArtifactService({
      storage: new FailingBlobStorage("quota_exceeded"),
      metadata: new InMemoryArtifactMetadataStore(),
      limits: { maxBytes: 1024 },
      clock: (): string => FIXED_CLOCK,
    });
    await expect(service.uploadArtifact({
      projectId: "proj-a",
      tenantId: "default",
      kind: "boq",
      filename: null,
      contentTypeHeader: "application/json",
      bytes: new TextEncoder().encode("x"),
      evidenceIds: [],
      derivationIds: [],
    })).rejects.toMatchObject({ code: "storage_quota_exceeded" });
    expect(() => {
      throw new ArtifactServiceError("storage_unavailable", "x");
    }).toThrow(/storage_unavailable/);
  });
});

/* ------------------------------------------------------------------ */
/* Router surface details                                              */
/* ------------------------------------------------------------------ */

describe("router surface details", () => {
  test("non-artifact paths return null (the server's 404 applies)", async () => {
    const { service } = memoryService();
    const response = await handleArtifactsRequest(
      new Request(artifactUrl("/v1/other"), { method: "GET" }),
      new URL(artifactUrl("/v1/other")),
      "req-test",
      routeOptions(service),
    );
    expect(response).toBeNull();
  });

  test("status route reports backend + limits (never credentials)", async () => {
    const { service } = memoryService(1234);
    const response = await call(
      new Request(artifactUrl("/v1/artifacts/status")),
      routeOptions(service),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      backend: { kind: "local-fs", root: "memory://artifacts" },
      limits: { maxBytes: 1234 },
    });
  });

  test("wrong methods get 405 with an explicit allow", async () => {
    const { service } = memoryService();
    const options = routeOptions(service);

    const put = await call(new Request(artifactUrl("/v1/artifacts"), { method: "PUT" }), options);
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toBe("GET, POST");

    const post = await call(
      new Request(artifactUrl("/v1/artifacts/status"), { method: "POST" }),
      options,
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET");
  });

  test("unknown artifact ids answer 404 artifact_not_found", async () => {
    const { service } = memoryService();
    const response = await call(
      new Request(artifactUrl(`/v1/artifacts/${"a".repeat(64)}`), {
        headers: { "x-aise-project-id": "proj-a" },
      }),
      routeOptions(service),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: "artifact_not_found" });
  });
});

/* ------------------------------------------------------------------ */
/* Server delegation block (the /v1/artifacts path guard)              */
/* ------------------------------------------------------------------ */

describe("server delegation over createRequestHandler", () => {
  test("the lazy default wiring serves /v1/artifacts over the Fs twin under the data dir", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "aise-server-artifacts-"));
    const options: HandlerOptions = {
      envSource: () => ({ AISE_DATA_DIR: dataDir }),
      version: "0.0.0-test",
      logger: quietLogger,
      capture: createCaptureGateway({
        store: new InMemoryCaptureStore(),
        clock: (): string => FIXED_CLOCK,
      }),
    };
    const handler = createRequestHandler(options);

    const status = await handler(new Request(artifactUrl("/v1/artifacts/status")));
    expect(status.status).toBe(200);
    const statusBody = (await status.json()) as {
      backend: { kind: string; root: string };
      limits: { maxBytes: number };
    };
    expect(statusBody.backend.kind).toBe("local-fs");
    expect(statusBody.backend.root).toBe(join(dataDir, "artifacts", "blobs"));
    expect(statusBody.limits.maxBytes).toBe(25 * 1024 * 1024);

    const upload = await handler(
      new Request(artifactUrl("/v1/artifacts"), {
        method: "POST",
        headers: { "content-type": "application/json", ...PLAIN_HEADERS },
        body: "delegated",
      }),
    );
    expect(upload.status).toBe(201);
    const artifactId = ((await upload.json()) as { artifact: { artifactId: string } }).artifact
      .artifactId;

    const content = await handler(
      new Request(artifactUrl(`/v1/artifacts/${artifactId}/content`), {
        headers: { "x-aise-project-id": "proj-a" },
      }),
    );
    expect(await content.text()).toBe("delegated");

    // Non-artifact routes are untouched by the delegation block.
    const health = await handler(new Request(artifactUrl("/healthz")));
    expect(health.status).toBe(200);
    rmSync(dataDir, { recursive: true, force: true });
  });
});
