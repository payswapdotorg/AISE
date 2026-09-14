import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSyncAck, type SyncAck } from "@aise/shared-contracts";
import pkg from "../../package.json" with { type: "json" };
import { sha256Hex } from "../lib/hash";
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "./gateway";
import { FsCaptureStore } from "./store";
import {
  canonicalBatchBody,
  fixedClock,
  makeAsset,
  makeBatch,
  mutateBatch,
  rawBody,
  withTempDir,
} from "./testkit";
import { createRequestHandler } from "../server";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler backed by the REAL file-system store rooted at `root`. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({
      store: new FsCaptureStore(join(root, "data")),
      clock: fixedClock,
    }),
  });
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function postAsset(
  path: string,
  bytes: Uint8Array,
  mediaType: string,
  headers?: Record<string, string>,
): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: bytes,
    headers: { "content-type": mediaType, ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

async function uploadAsset(
  handler: (request: Request) => Promise<Response>,
  asset: ReturnType<typeof makeAsset>,
): Promise<Response> {
  return handler(postAsset(`/v1/capture/assets/${asset.contentId}`, asset.bytes, asset.mediaType));
}

async function ackBody(response: Response): Promise<SyncAck> {
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  return decodeSyncAck(await response.json());
}

describe("capture HTTP surface: happy path", () => {
  test("upload -> sync -> read persists assets and the session verbatim", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const first = makeAsset("http-happy-1", "image/jpeg");
      const second = makeAsset("http-happy-2", "video/mp4");

      // Two content-addressed asset uploads.
      const uploadOne = await uploadAsset(handler, first);
      expect(uploadOne.status).toBe(200);
      expect(await uploadOne.json()).toEqual({
        ok: true,
        outcome: "STORED",
        contentId: first.contentId,
        byteSize: first.byteSize,
        mediaType: "image/jpeg",
      });
      const uploadTwo = await uploadAsset(handler, second);
      expect(uploadTwo.status).toBe(200);

      // Asset bytes are on disk at the content-addressed paths.
      const dataRoot = join(root, "data");
      for (const asset of [first, second]) {
        const blobPath = join(dataRoot, "content", asset.contentId.slice(0, 2), asset.contentId);
        expect(existsSync(blobPath)).toBe(true);
        expect([...readFileSync(blobPath)]).toEqual([...asset.bytes]);
      }

      // The sync batch is accepted.
      const batch = makeBatch({
        sessionId: "session-http-happy",
        sequence: 0,
        assets: [first, second],
      });
      const syncResponse = await handler(postJson("/v1/capture/sync", canonicalBatchBody(batch)));
      expect(syncResponse.status).toBe(200);
      const ack = await ackBody(syncResponse);
      expect(ack.outcome).toBe("ACCEPTED");
      expect(ack.batchId).toBe(batch.batchId);
      expect(ack.idempotencyKey).toBe(batch.idempotencyKey);
      expect(ack.lastAcceptedSequence).toBe(0);
      expect(ack.reasonCode).toBeUndefined();
      expect(ack.acknowledgedAt).toBe(fixedClock());

      // The session projection returns the verbatim source metadata.
      const sessionResponse = await handler(get("/v1/capture/sessions/session-http-happy"));
      expect(sessionResponse.status).toBe(200);
      const body = (await sessionResponse.json()) as {
        ok: boolean;
        session: {
          sessionId: string;
          envelope: typeof batch.envelope;
          assets: Array<{ contentId: string }>;
          batches: Array<{ sequence: number }>;
          lastAcceptedSequence: number;
        };
      };
      expect(body.ok).toBe(true);
      expect(body.session.sessionId).toBe("session-http-happy");
      expect(body.session.envelope).toEqual(batch.envelope);
      expect(body.session.assets.map((asset) => asset.contentId)).toEqual([
        first.contentId,
        second.contentId,
      ]);
      expect(body.session.batches.map((entry) => entry.sequence)).toEqual([0]);
      expect(body.session.lastAcceptedSequence).toBe(0);
    });
  });
});

describe("capture HTTP surface: duplicate and retry behavior", () => {
  test("re-uploading identical asset content succeeds without duplication", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-dup-asset");

      const first = await uploadAsset(handler, asset);
      expect(first.status).toBe(200);
      expect(((await first.json()) as { outcome: string }).outcome).toBe("STORED");

      const again = await uploadAsset(handler, asset);
      expect(again.status).toBe(200);
      expect(((await again.json()) as { outcome: string }).outcome).toBe("DUPLICATE");

      // Exactly one blob file exists for the content id (sorted for a
      // deterministic directory listing).
      const blobDir = join(root, "data", "content", asset.contentId.slice(0, 2));
      expect(readdirSync(blobDir).sort()).toEqual([asset.contentId, `${asset.contentId}.json`]);
    });
  });

  test("reposting the same batch is a DUPLICATE with the correct lastAcceptedSequence", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-retry");
      await uploadAsset(handler, asset);
      const batch = makeBatch({ sessionId: "session-http-retry", sequence: 0, assets: [asset] });
      const body = canonicalBatchBody(batch);

      expect((await ackBody(await handler(postJson("/v1/capture/sync", body)))).outcome).toBe(
        "ACCEPTED",
      );
      const retry = await handler(postJson("/v1/capture/sync", body));
      expect(retry.status).toBe(200);
      const ack = await ackBody(retry);
      expect(ack.outcome).toBe("DUPLICATE");
      expect(ack.lastAcceptedSequence).toBe(0);

      // No second session record: the projection still shows one batch.
      const session = (await (
        await handler(get("/v1/capture/sessions/session-http-retry"))
      ).json()) as { session: { batches: unknown[] } };
      expect(session.session.batches).toHaveLength(1);
    });
  });

  test("the same idempotency key with mutated content is REJECTED IDEMPOTENCY_CONFLICT", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const first = makeAsset("http-idem-1");
      const second = makeAsset("http-idem-2");
      await uploadAsset(handler, first);
      await uploadAsset(handler, second);

      const original = makeBatch({
        sessionId: "session-http-idem",
        sequence: 0,
        assets: [first],
        idempotencyKey: "idem-http-shared",
      });
      const originalAck = await ackBody(
        await handler(postJson("/v1/capture/sync", canonicalBatchBody(original))),
      );
      expect(originalAck.outcome).toBe("ACCEPTED");

      const mutated = makeBatch({
        sessionId: "session-http-idem",
        sequence: 0,
        assets: [second],
        batchId: "batch-http-mutated",
        idempotencyKey: "idem-http-shared",
      });
      const response = await handler(postJson("/v1/capture/sync", canonicalBatchBody(mutated)));
      expect(response.status).toBe(422);
      const ack = await ackBody(response);
      expect(ack.outcome).toBe("REJECTED");
      expect(ack.reasonCode).toBe("IDEMPOTENCY_CONFLICT");
    });
  });
});

describe("capture HTTP surface: rejection matrix", () => {
  test("an asset upload whose sha-256 differs from the path is rejected", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-mismatch");
      const wrongBytes = new TextEncoder().encode("these-bytes-do-not-hash-to-the-id");

      const response = await handler(
        postAsset(`/v1/capture/assets/${asset.contentId}`, wrongBytes, "image/jpeg"),
      );
      expect(response.status).toBe(422);
      const body = (await response.json()) as {
        ok: boolean;
        reasonCode: string;
        reasonDetail: string;
      };
      expect(body.ok).toBe(false);
      expect(body.reasonCode).toBe("CONTENT_ID_MISMATCH");
      // The detail names the COMPUTED hash of the received bytes.
      expect(body.reasonDetail).toContain(sha256Hex(wrongBytes));
    });
  });

  test("a manifest entry with a mismatched mediaType is REJECTED MANIFEST_MISMATCH", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-manifest-media", "image/jpeg");
      await uploadAsset(handler, asset);

      const batch = mutateBatch(
        makeBatch({ sessionId: "session-http-mm", sequence: 0, assets: [asset] }),
        (draft) => {
          draft.manifest[0]!.mediaType = "video/mp4";
        },
      );
      const response = await handler(postJson("/v1/capture/sync", rawBody(batch)));
      expect(response.status).toBe(422);
      const ack = await ackBody(response);
      expect(ack.outcome).toBe("REJECTED");
      expect(ack.reasonCode).toBe("MANIFEST_MISMATCH");
    });
  });

  test("a manifest entry for a never-uploaded asset is REJECTED MANIFEST_MISMATCH", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const uploaded = makeAsset("http-manifest-present");
      const missing = makeAsset("http-manifest-absent");
      await uploadAsset(handler, uploaded);

      const batch = makeBatch({
        sessionId: "session-http-missing",
        sequence: 0,
        assets: [uploaded, missing],
      });
      const response = await handler(postJson("/v1/capture/sync", canonicalBatchBody(batch)));
      expect(response.status).toBe(422);
      const ack = await ackBody(response);
      expect(ack.outcome).toBe("REJECTED");
      expect(ack.reasonCode).toBe("MANIFEST_MISMATCH");
      expect(ack.reasonDetail).toContain(missing.contentId);
    });
  });

  test("a sequence gap is REJECTED SEQUENCE_GAP with resumeFromSequence", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-gap");
      await uploadAsset(handler, asset);
      const zero = makeBatch({ sessionId: "session-http-gap", sequence: 0, assets: [asset] });
      const zeroAck = await ackBody(
        await handler(postJson("/v1/capture/sync", canonicalBatchBody(zero))),
      );
      expect(zeroAck.outcome).toBe("ACCEPTED");

      const two = makeBatch({
        sessionId: "session-http-gap",
        sequence: 2,
        assets: [asset],
        batchId: "batch-http-gap-2",
        idempotencyKey: "idem-http-gap-2",
      });
      const response = await handler(postJson("/v1/capture/sync", canonicalBatchBody(two)));
      expect(response.status).toBe(422);
      const ack = await ackBody(response);
      expect(ack.outcome).toBe("REJECTED");
      expect(ack.reasonCode).toBe("SEQUENCE_GAP");
      expect(ack.lastAcceptedSequence).toBe(0);
      expect(ack.resumeFromSequence).toBe(1);
    });
  });

  test("a different envelope at an accepted sequence is REJECTED SESSION_CONFLICT", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const first = makeAsset("http-conflict-1");
      const second = makeAsset("http-conflict-2");
      await uploadAsset(handler, first);
      await uploadAsset(handler, second);

      const original = makeBatch({
        sessionId: "session-http-conflict",
        sequence: 0,
        assets: [first],
      });
      const originalAck = await ackBody(
        await handler(postJson("/v1/capture/sync", canonicalBatchBody(original))),
      );
      expect(originalAck.outcome).toBe("ACCEPTED");

      const different = makeBatch({
        sessionId: "session-http-conflict",
        sequence: 0,
        assets: [second],
        batchId: "batch-http-conflict-b",
        idempotencyKey: "idem-http-conflict-b",
      });
      const response = await handler(postJson("/v1/capture/sync", canonicalBatchBody(different)));
      expect(response.status).toBe(422);
      const ack = await ackBody(response);
      expect(ack.outcome).toBe("REJECTED");
      expect(ack.reasonCode).toBe("SESSION_CONFLICT");
      expect(ack.lastAcceptedSequence).toBe(0);
    });
  });

  test("an unsupported major contractVersion is REJECTED CONTRACT_VERSION_UNSUPPORTED", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-version");
      await uploadAsset(handler, asset);
      const batch = mutateBatch(
        makeBatch({ sessionId: "session-http-version", sequence: 0, assets: [asset] }),
        (draft) => {
          draft.contractVersion = "99.0.0";
        },
      );
      const response = await handler(postJson("/v1/capture/sync", rawBody(batch)));
      expect(response.status).toBe(422);
      const ack = await ackBody(response);
      expect(ack.outcome).toBe("REJECTED");
      expect(ack.reasonCode).toBe("CONTRACT_VERSION_UNSUPPORTED");
      expect(ack.reasonDetail).toContain("99.0.0");
      expect(ack.batchId).toBe(batch.batchId);
      expect(ack.idempotencyKey).toBe(batch.idempotencyKey);
    });
  });
});

describe("capture HTTP surface: transport-level errors", () => {
  test("malformed JSON bodies are 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/capture/sync", "{definitely-not-json"));
      expect(response.status).toBe(400);
      const body = (await response.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe("malformed_json");
    });
  });

  test("schema-invalid JSON bodies are 400 with structured issues", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson("/v1/capture/sync", rawBody({ hello: "world" })),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        ok: boolean;
        error: string;
        issues: Array<{ path: string }>;
      };
      expect(body.error).toBe("schema_invalid");
      expect(body.issues.some((issue) => issue.path === "contractVersion")).toBe(true);
    });
  });

  test("wrong methods are 405 with an explicit allow header", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const sync = await handler(get("/v1/capture/sync"));
      expect(sync.status).toBe(405);
      expect(sync.headers.get("allow")).toBe("POST");

      const assetId = makeAsset("http-method").contentId;
      const assetGet = await handler(get(`/v1/capture/assets/${assetId}`));
      expect(assetGet.status).toBe(405);
      expect(assetGet.headers.get("allow")).toBe("POST");

      const sessionPost = await handler(
        postJson("/v1/capture/sessions/session-x", "{}"),
      );
      expect(sessionPost.status).toBe(405);
      expect(sessionPost.headers.get("allow")).toBe("GET");
    });
  });

  test("unknown routes are 404 and unknown sessions are session_not_found", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unknown = await handler(get("/v1/capture/nope"));
      expect(unknown.status).toBe(404);

      const missingSession = await handler(get("/v1/capture/sessions/never-synced"));
      expect(missingSession.status).toBe(404);
      const body = (await missingSession.json()) as { ok: boolean; error: string };
      expect(body.error).toBe("session_not_found");
    });
  });

  test("invalid content ids and media types are 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const badId = await handler(
        postAsset("/v1/capture/assets/not-a-content-id", new Uint8Array([1]), "image/jpeg"),
      );
      expect(badId.status).toBe(400);
      expect(((await badId.json()) as { error: string }).error).toBe("invalid_content_id");

      const asset = makeAsset("http-media");
      const badMedia = await handler(
        new Request(`http://localhost/v1/capture/assets/${asset.contentId}`, {
          method: "POST",
          body: asset.bytes,
          headers: { "content-type": "not a media type" },
        }),
      );
      expect(badMedia.status).toBe(400);
      expect(((await badMedia.json()) as { error: string }).error).toBe("invalid_media_type");
    });
  });

  test("every capture response echoes the x-request-id correlation header", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const asset = makeAsset("http-request-id");
      const upload = await handler(
        postAsset(`/v1/capture/assets/${asset.contentId}`, asset.bytes, asset.mediaType, {
          "x-request-id": "corr-capture-1",
        }),
      );
      expect(upload.headers.get("x-request-id")).toBe("corr-capture-1");

      const generated = await handler(get("/v1/capture/sessions/anything"));
      expect(generated.headers.get("x-request-id")).toBeTruthy();
    });
  });
});

describe("capture HTTP surface: end-to-end over Bun.serve (loopback)", () => {
  test("upload and sync through a real socket", async () => {
    await withTempDir(async (root) => {
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: handlerWith(root),
      });
      try {
        const asset = makeAsset("http-e2e");
        const base = `http://127.0.0.1:${server.port}`;
        const upload = await fetch(`${base}/v1/capture/assets/${asset.contentId}`, {
          method: "POST",
          body: asset.bytes,
          headers: { "content-type": asset.mediaType },
        });
        expect(upload.status).toBe(200);
        expect(upload.headers.get("x-request-id")).toBeTruthy();

        const batch = makeBatch({ sessionId: "session-e2e", sequence: 0, assets: [asset] });
        const sync = await fetch(`${base}/v1/capture/sync`, {
          method: "POST",
          body: canonicalBatchBody(batch),
          headers: { "content-type": "application/json" },
        });
        expect(sync.status).toBe(200);
        const ack = decodeSyncAck(await sync.json());
        expect(ack.outcome).toBe("ACCEPTED");

        const session = await fetch(`${base}/v1/capture/sessions/session-e2e`);
        expect(session.status).toBe(200);
      } finally {
        server.stop(true);
      }
    });
  });
});
