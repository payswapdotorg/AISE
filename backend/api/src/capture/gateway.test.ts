import { describe, expect, test } from "bun:test";
import {
  canonicalJsonStringify,
  decodeSyncAckStrict,
  decodeSyncBatchStrict,
  SyncAckCodec,
  type SyncAck,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { createCaptureGateway, type CaptureGateway, type SyncIngestResult } from "./gateway";
import { InMemoryCaptureStore } from "./store";
import {
  canonicalBatchBody,
  fixedClock,
  makeAsset,
  makeBatch,
  mutateBatch,
  rawBody,
  shuffledKeyOrderBody,
} from "./testkit";

function makeGateway(): { gateway: CaptureGateway; store: InMemoryCaptureStore } {
  const store = new InMemoryCaptureStore();
  return { gateway: createCaptureGateway({ store, clock: fixedClock }), store };
}

function ackOf(result: SyncIngestResult): SyncAck {
  if (result.kind !== "ack") {
    throw new Error(`expected an ack result, got: ${JSON.stringify(result)}`);
  }
  return result.ack;
}

/** The ack must survive a strict codec round trip (valid wire object). */
function expectValidAck(ack: SyncAck): void {
  const encoded = SyncAckCodec.encode(ack);
  expect(decodeSyncAckStrict(JSON.parse(encoded))).toEqual(ack);
}

async function upload(gateway: CaptureGateway, asset: ReturnType<typeof makeAsset>): Promise<void> {
  const result = await gateway.ingestAsset(asset.contentId, asset.bytes, asset.mediaType);
  expect(result.kind === "stored" || result.kind === "duplicate").toBe(true);
}

describe("capture gateway: happy path", () => {
  test("accepts a batch whose assets are uploaded and stores the session verbatim", async () => {
    const { gateway, store } = makeGateway();
    const first = makeAsset("happy-1", "image/jpeg");
    const second = makeAsset("happy-2", "video/mp4");
    await upload(gateway, first);
    await upload(gateway, second);

    const batch = makeBatch({
      sessionId: "session-happy",
      sequence: 0,
      assets: [first, second],
    });
    const result = await gateway.ingestSyncBatch(canonicalBatchBody(batch));

    const ack = ackOf(result);
    expect(ack.outcome).toBe("ACCEPTED");
    expect(ack.batchId).toBe(batch.batchId);
    expect(ack.idempotencyKey).toBe(batch.idempotencyKey);
    expect(ack.lastAcceptedSequence).toBe(0);
    expect(ack.acknowledgedAt).toBe(fixedClock());
    expect(ack.reasonCode).toBeUndefined();
    expectValidAck(ack);

    const session = await store.getSession("session-happy");
    expect(session).not.toBeNull();
    expect(session?.envelope).toEqual(batch.envelope);
    expect(session?.assets.map((asset) => asset.contentId)).toEqual([
      first.contentId,
      second.contentId,
    ]);
    expect(session?.lastAcceptedSequence).toBe(0);
    expect(session?.batches).toHaveLength(1);
    // Verbatim source metadata: open acquisition metadata keys survive.
    expect(session?.envelope.assets[0]?.acquisitionMetadata["lens.focal.length.mm"]).toBe("6.9");
  });

  test("multi-batch sessions progress in sequence and accumulate assets", async () => {
    const { gateway, store } = makeGateway();
    const first = makeAsset("multi-1");
    const second = makeAsset("multi-2");
    await upload(gateway, first);
    await upload(gateway, second);

    const batchZero = makeBatch({
      sessionId: "session-multi",
      sequence: 0,
      assets: [first],
    });
    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batchZero))).outcome).toBe(
      "ACCEPTED",
    );

    const batchOne = makeBatch({
      sessionId: "session-multi",
      sequence: 1,
      assets: [first, second],
    });
    const ack = ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batchOne)));
    expect(ack.outcome).toBe("ACCEPTED");
    expect(ack.lastAcceptedSequence).toBe(1);

    const session = await store.getSession("session-multi");
    expect(session?.lastAcceptedSequence).toBe(1);
    expect(session?.batches.map((batch) => batch.sequence)).toEqual([0, 1]);
    expect(session?.envelope).toEqual(batchOne.envelope);
    expect(session?.assets.map((asset) => asset.contentId)).toEqual([
      first.contentId,
      second.contentId,
    ]);
  });
});

describe("capture gateway: retry and duplicate semantics", () => {
  test("an exact retry is a DUPLICATE and never creates a second session record", async () => {
    const { gateway, store } = makeGateway();
    const asset = makeAsset("retry-1");
    await upload(gateway, asset);
    const batch = makeBatch({ sessionId: "session-retry", sequence: 0, assets: [asset] });
    const body = canonicalBatchBody(batch);

    expect(ackOf(await gateway.ingestSyncBatch(body)).outcome).toBe("ACCEPTED");
    const retry = ackOf(await gateway.ingestSyncBatch(body));
    expect(retry.outcome).toBe("DUPLICATE");
    expect(retry.lastAcceptedSequence).toBe(0);
    expect(retry.reasonCode).toBeUndefined();
    expectValidAck(retry);

    const session = await store.getSession("session-retry");
    expect(session?.batches).toHaveLength(1);
    expect((await store.getIdempotencyRecord(batch.idempotencyKey))?.batchId).toBe(
      batch.batchId,
    );
  });

  test("a retry after the session advanced reports the LATEST lastAcceptedSequence", async () => {
    const { gateway } = makeGateway();
    const first = makeAsset("retry-late-1");
    const second = makeAsset("retry-late-2");
    await upload(gateway, first);
    await upload(gateway, second);

    const batchZero = makeBatch({
      sessionId: "session-late",
      sequence: 0,
      assets: [first],
      idempotencyKey: "idem-late-0",
    });
    const bodyZero = canonicalBatchBody(batchZero);
    expect(ackOf(await gateway.ingestSyncBatch(bodyZero)).outcome).toBe("ACCEPTED");

    const batchOne = makeBatch({
      sessionId: "session-late",
      sequence: 1,
      assets: [second],
      idempotencyKey: "idem-late-1",
    });
    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batchOne))).outcome).toBe(
      "ACCEPTED",
    );

    const retryZero = ackOf(await gateway.ingestSyncBatch(bodyZero));
    expect(retryZero.outcome).toBe("DUPLICATE");
    expect(retryZero.lastAcceptedSequence).toBe(1);
  });

  test("semantically-equal JSON with shuffled key order is the same content", async () => {
    const { gateway, store } = makeGateway();
    const asset = makeAsset("shuffle-1");
    await upload(gateway, asset);
    const batch = makeBatch({ sessionId: "session-shuffle", sequence: 0, assets: [asset] });

    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batch))).outcome).toBe(
      "ACCEPTED",
    );
    const retry = ackOf(await gateway.ingestSyncBatch(shuffledKeyOrderBody(batch)));
    expect(retry.outcome).toBe("DUPLICATE");
    expect((await store.getSession("session-shuffle"))?.batches).toHaveLength(1);
  });

  test("the same envelope re-posted with a NEW idempotency key is idempotent", async () => {
    const { gateway, store } = makeGateway();
    const asset = makeAsset("envelope-equal-1");
    await upload(gateway, asset);
    const original = makeBatch({
      sessionId: "session-env",
      sequence: 0,
      assets: [asset],
      idempotencyKey: "idem-original",
    });
    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(original))).outcome).toBe(
      "ACCEPTED",
    );

    const repost = makeBatch({
      sessionId: "session-env",
      sequence: 0,
      assets: [asset],
      batchId: "batch-repost",
      idempotencyKey: "idem-repost",
    });
    const ack = ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(repost)));
    expect(ack.outcome).toBe("DUPLICATE");
    expect(ack.lastAcceptedSequence).toBe(0);
    expect((await store.getSession("session-env"))?.batches).toHaveLength(1);
  });

  test("an interrupted accept (ledger written, batch missing) is completed on retry", async () => {
    const { gateway, store } = makeGateway();
    const asset = makeAsset("recover-1");
    await upload(gateway, asset);
    const batch = makeBatch({ sessionId: "session-recover", sequence: 0, assets: [asset] });
    const body = canonicalBatchBody(batch);

    // Simulate a crash between the idempotency ledger write and the append.
    const decoded = decodeSyncBatchStrict(JSON.parse(body));
    await store.putIdempotencyRecord({
      idempotencyKey: decoded.idempotencyKey,
      batchId: decoded.batchId,
      sessionId: decoded.sessionId,
      sequence: decoded.sequence,
      contentFingerprint: sha256Hex(canonicalJsonStringify(decoded)),
    });
    expect(await store.getSession("session-recover")).toBeNull();

    const ack = ackOf(await gateway.ingestSyncBatch(body));
    expect(ack.outcome).toBe("ACCEPTED");
    expect(ack.lastAcceptedSequence).toBe(0);
    expect((await store.getSession("session-recover"))?.batches).toHaveLength(1);
  });
});

describe("capture gateway: rejections", () => {
  test("same idempotency key with different content is an IDEMPOTENCY_CONFLICT", async () => {
    const { gateway } = makeGateway();
    const first = makeAsset("idem-conflict-1");
    const second = makeAsset("idem-conflict-2");
    await upload(gateway, first);
    await upload(gateway, second);

    const original = makeBatch({
      sessionId: "session-idem",
      sequence: 0,
      assets: [first],
      idempotencyKey: "idem-shared",
    });
    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(original))).outcome).toBe(
      "ACCEPTED",
    );

    const mutated = makeBatch({
      sessionId: "session-idem",
      sequence: 0,
      assets: [second],
      batchId: "batch-mutated",
      idempotencyKey: "idem-shared",
    });
    const ack = ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(mutated)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("IDEMPOTENCY_CONFLICT");
    expect(ack.lastAcceptedSequence).toBe(0);
    expectValidAck(ack);
  });

  test("a sequence gap is rejected with resumeFromSequence", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("gap-1");
    await upload(gateway, asset);
    const batchZero = makeBatch({ sessionId: "session-gap", sequence: 0, assets: [asset] });
    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batchZero))).outcome).toBe(
      "ACCEPTED",
    );

    const batchTwo = makeBatch({ sessionId: "session-gap", sequence: 2, assets: [asset] });
    const ack = ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batchTwo)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("SEQUENCE_GAP");
    expect(ack.lastAcceptedSequence).toBe(0);
    expect(ack.resumeFromSequence).toBe(1);
  });

  test("an already-accepted sequence replayed with different content is a SESSION_CONFLICT", async () => {
    const { gateway, store } = makeGateway();
    const first = makeAsset("conflict-1");
    const second = makeAsset("conflict-2");
    await upload(gateway, first);
    await upload(gateway, second);

    const original = makeBatch({
      sessionId: "session-conflict",
      sequence: 0,
      assets: [first],
    });
    expect(ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(original))).outcome).toBe(
      "ACCEPTED",
    );

    const different = makeBatch({
      sessionId: "session-conflict",
      sequence: 0,
      assets: [second],
      batchId: "batch-different",
      idempotencyKey: "idem-different",
    });
    const ack = ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(different)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("SESSION_CONFLICT");
    expect(ack.lastAcceptedSequence).toBe(0);
    expectValidAck(ack);
    // The stored session is untouched by the conflict.
    expect((await store.getSession("session-conflict"))?.batches).toHaveLength(1);
  });

  test("an envelope whose sessionId differs from the batch is a SESSION_CONFLICT", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("mismatch-session-1");
    await upload(gateway, asset);
    const batch = mutateBatch(
      makeBatch({ sessionId: "session-batch", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.envelope.sessionId = "session-OTHER";
      },
    );
    const ack = ackOf(await gateway.ingestSyncBatch(rawBody(batch)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("SESSION_CONFLICT");
  });

  test("a manifest entry without an uploaded asset is a MANIFEST_MISMATCH", async () => {
    const { gateway } = makeGateway();
    const uploaded = makeAsset("manifest-missing-1");
    await upload(gateway, uploaded);
    const neverUploaded = makeAsset("manifest-missing-2");

    const batch = makeBatch({
      sessionId: "session-manifest-missing",
      sequence: 0,
      assets: [uploaded, neverUploaded],
    });
    const ack = ackOf(await gateway.ingestSyncBatch(canonicalBatchBody(batch)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("MANIFEST_MISMATCH");
    expect(ack.lastAcceptedSequence).toBeUndefined();
  });

  test("a manifest entry whose mediaType differs from the stored asset is a MANIFEST_MISMATCH", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("manifest-media-1", "image/jpeg");
    await upload(gateway, asset);

    const batch = mutateBatch(
      makeBatch({ sessionId: "session-manifest-media", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.manifest[0]!.mediaType = "video/mp4";
      },
    );
    const ack = ackOf(await gateway.ingestSyncBatch(rawBody(batch)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("MANIFEST_MISMATCH");
  });

  test("a manifest entry whose byteSize differs from the stored asset is a MANIFEST_MISMATCH", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("manifest-size-1");
    await upload(gateway, asset);

    const batch = mutateBatch(
      makeBatch({ sessionId: "session-manifest-size", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.manifest[0]!.byteSize = asset.byteSize + 1;
      },
    );
    const ack = ackOf(await gateway.ingestSyncBatch(rawBody(batch)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("MANIFEST_MISMATCH");
  });

  test("an unsupported contract major version is a CONTRACT_VERSION_UNSUPPORTED ack", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("version-1");
    await upload(gateway, asset);
    const batch = mutateBatch(
      makeBatch({ sessionId: "session-version", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.contractVersion = "99.0.0";
      },
    );
    const ack = ackOf(await gateway.ingestSyncBatch(rawBody(batch)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("CONTRACT_VERSION_UNSUPPORTED");
    expect(ack.reasonDetail).toContain("99.0.0");
    expectValidAck(ack);
  });

  test("an unsupported ENVELOPE contract major version is a CONTRACT_VERSION_UNSUPPORTED ack", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("version-2");
    await upload(gateway, asset);
    const batch = mutateBatch(
      makeBatch({ sessionId: "session-version-env", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.envelope.contractVersion = "0.9.0";
      },
    );
    const ack = ackOf(await gateway.ingestSyncBatch(rawBody(batch)));
    expect(ack.outcome).toBe("REJECTED");
    expect(ack.reasonCode).toBe("CONTRACT_VERSION_UNSUPPORTED");
  });

  test("an unsupported version without ackable identity fields is a plain bad request", async () => {
    const { gateway } = makeGateway();
    const result = await gateway.ingestSyncBatch(
      rawBody({ contractVersion: "99.0.0", batchId: "", idempotencyKey: "" }),
    );
    expect(result.kind).toBe("bad_request");
    if (result.kind === "bad_request") {
      expect(result.error).toBe("version_unsupported");
      expect(result.detail).toContain("99.0.0");
    }
  });

  test("malformed JSON is a bad request", async () => {
    const { gateway } = makeGateway();
    const result = await gateway.ingestSyncBatch("{not json");
    expect(result.kind).toBe("bad_request");
    if (result.kind === "bad_request") {
      expect(result.error).toBe("malformed_json");
    }
  });

  test("schema-invalid payloads are bad requests with structured issues", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("schema-1");
    await upload(gateway, asset);

    const negativeSequence = mutateBatch(
      makeBatch({ sessionId: "session-schema", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.sequence = -1;
      },
    );
    const result = await gateway.ingestSyncBatch(rawBody(negativeSequence));
    expect(result.kind).toBe("bad_request");
    if (result.kind === "bad_request") {
      expect(result.error).toBe("schema_invalid");
      expect(result.issues?.map((issue) => issue.path)).toContain("sequence");
    }

    const unknownKey = mutateBatch(
      makeBatch({ sessionId: "session-schema", sequence: 0, assets: [asset] }),
      (draft) => {
        draft.somethingUnknown = "x";
      },
    );
    const strict = await gateway.ingestSyncBatch(rawBody(unknownKey));
    expect(strict.kind).toBe("bad_request");
    if (strict.kind === "bad_request") {
      expect(strict.error).toBe("schema_invalid");
      expect(strict.issues?.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });

  test("non-object JSON bodies are schema-invalid bad requests", async () => {
    const { gateway } = makeGateway();
    const result = await gateway.ingestSyncBatch(rawBody([1, 2, 3]));
    expect(result.kind).toBe("bad_request");
    if (result.kind === "bad_request") {
      expect(result.error).toBe("schema_invalid");
      expect(result.issues?.[0]?.path).toBe("<root>");
    }
  });
});

describe("capture gateway: asset uploads", () => {
  test("rejects bytes whose sha-256 differs from the declared content id", async () => {
    const { gateway, store } = makeGateway();
    const asset = makeAsset("upload-mismatch");
    const otherBytes = new TextEncoder().encode("definitely-not-the-same-content");

    const result = await gateway.ingestAsset(asset.contentId, otherBytes, "image/jpeg");
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reasonCode).toBe("CONTENT_ID_MISMATCH");
      expect(result.reasonDetail).toContain(sha256Hex(otherBytes));
    }
    // Nothing was stored under the declared id.
    expect(await store.getAsset(asset.contentId)).toBeNull();
  });

  test("rejects a media-type collision on already-stored content", async () => {
    const { gateway } = makeGateway();
    const asset = makeAsset("upload-collision", "image/jpeg");
    expect((await gateway.ingestAsset(asset.contentId, asset.bytes, "image/jpeg")).kind).toBe(
      "stored",
    );
    const result = await gateway.ingestAsset(asset.contentId, asset.bytes, "video/mp4");
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reasonCode).toBe("CONTENT_COLLISION");
    }
  });

  test("re-uploading identical content is an idempotent duplicate", async () => {
    const { gateway, store } = makeGateway();
    const asset = makeAsset("upload-duplicate");
    expect((await gateway.ingestAsset(asset.contentId, asset.bytes, "image/jpeg")).kind).toBe(
      "stored",
    );
    const again = await gateway.ingestAsset(asset.contentId, asset.bytes, "image/jpeg");
    expect(again.kind).toBe("duplicate");
    if (again.kind === "duplicate") {
      expect(again.asset.byteSize).toBe(asset.byteSize);
    }
    expect(await store.readAssetBytes(asset.contentId)).not.toBeNull();
  });
});
