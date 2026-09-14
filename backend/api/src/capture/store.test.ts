import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  FsCaptureStore,
  InMemoryCaptureStore,
  type AcceptBatchInput,
  type CaptureStore,
} from "./store";
import { fixedClock, makeAsset, makeBatch, makeEnvelope, withTempDir } from "./testkit";

/**
 * Shared behavioral suite: every CaptureStore implementation must satisfy it
 * identically — the interface is the contract, the implementations are
 * interchangeable (that is why tests can run an in-memory store). Registers
 * one test per behavior into the ENCLOSING describe scope.
 */
function storeBehavior(name: string, factory: () => CaptureStore): void {
  test(`${name}: stores an asset once, idempotently, never rewrites it`, async () => {
    const store = factory();
    const bytes = new TextEncoder().encode("payload-alpha");
    const contentId = sha256Hex(bytes);

    const first = await store.putAsset(contentId, bytes, "image/jpeg", fixedClock());
    expect(first.outcome).toBe("STORED");
    if (first.outcome !== "STORED") {
      return;
    }
    expect(first.asset).toEqual({
      contentId,
      byteSize: bytes.length,
      mediaType: "image/jpeg",
      storedAt: fixedClock(),
    });

    const again = await store.putAsset(contentId, bytes, "image/jpeg", fixedClock());
    expect(again.outcome).toBe("DUPLICATE");

    expect(await store.getAsset(contentId)).toEqual(first.asset);
    const roundTrip = await store.readAssetBytes(contentId);
    expect(roundTrip).not.toBeNull();
    expect([...(roundTrip ?? [])]).toEqual([...bytes]);
  });

  test(`${name}: refuses a colliding re-put (different media type, same bytes)`, async () => {
    const store = factory();
    const bytes = new TextEncoder().encode("payload-beta");
    const contentId = sha256Hex(bytes);
    await store.putAsset(contentId, bytes, "image/jpeg", fixedClock());

    const collision = await store.putAsset(contentId, bytes, "video/mp4", fixedClock());
    expect(collision.outcome).toBe("COLLISION");
    if (collision.outcome === "COLLISION") {
      expect(collision.existing.mediaType).toBe("image/jpeg");
    }
    // The original record is retained verbatim.
    expect((await store.getAsset(contentId))?.mediaType).toBe("image/jpeg");
  });

  test(`${name}: defensively refuses different bytes under a stored content id`, async () => {
    const store = factory();
    const bytes = new TextEncoder().encode("payload-gamma");
    const contentId = sha256Hex(bytes);
    await store.putAsset(contentId, bytes, "image/jpeg", fixedClock());

    const other = new TextEncoder().encode("payload-gamma-collision");
    const collision = await store.putAsset(contentId, other, "image/jpeg", fixedClock());
    expect(collision.outcome).toBe("COLLISION");
    expect((await store.readAssetBytes(contentId))?.length).toBe(bytes.length);
  });

  test(`${name}: returns null for unknown assets, sessions, batches and keys`, async () => {
    const store = factory();
    const unknownId = sha256Hex("never-stored");
    expect(await store.getAsset(unknownId)).toBeNull();
    expect(await store.readAssetBytes(unknownId)).toBeNull();
    expect(await store.getSession("never-synced")).toBeNull();
    expect(await store.getBatchRecord("never-synced", 0)).toBeNull();
    expect(await store.getIdempotencyRecord("unknown-key")).toBeNull();
  });

  test(`${name}: acceptBatch creates the session with verbatim envelope and manifest`, async () => {
    const store = factory();
    const asset = makeAsset("store-happy-1");
    const batch = makeBatch({
      sessionId: "session-A",
      sequence: 0,
      assets: [asset],
    });
    const input: AcceptBatchInput = {
      sessionId: "session-A",
      batch,
      contentFingerprint: "fingerprint-batch",
      envelopeFingerprint: "fingerprint-envelope",
      acceptedAt: fixedClock(),
      timestamp: fixedClock(),
    };
    const session = await store.acceptBatch(input);

    expect(session.sessionId).toBe("session-A");
    expect(session.lastAcceptedSequence).toBe(0);
    expect(session.envelope).toEqual(batch.envelope);
    expect(session.assets).toEqual([
      {
        contentId: asset.contentId,
        byteSize: asset.byteSize,
        mediaType: asset.mediaType,
      },
    ]);
    expect(session.batches).toHaveLength(1);
    expect(session.batches[0]).toEqual({
      batchId: batch.batchId,
      sequence: 0,
      idempotencyKey: batch.idempotencyKey,
      contentFingerprint: "fingerprint-batch",
      envelopeFingerprint: "fingerprint-envelope",
      acceptedAt: fixedClock(),
    });
    expect(session.createdAt).toBe(fixedClock());
    expect(session.updatedAt).toBe(fixedClock());
    expect(await store.getSession("session-A")).toEqual(session);
  });

  test(`${name}: acceptBatch appends batches, accumulates assets, updates envelope`, async () => {
    const store = factory();
    const firstAsset = makeAsset("store-append-1");
    const secondAsset = makeAsset("store-append-2");
    const first = makeBatch({
      sessionId: "session-B",
      sequence: 0,
      assets: [firstAsset],
    });
    await store.acceptBatch({
      sessionId: "session-B",
      batch: first,
      contentFingerprint: "fp-1",
      envelopeFingerprint: "fe-1",
      acceptedAt: fixedClock(),
      timestamp: fixedClock(),
    });

    const second = makeBatch({
      sessionId: "session-B",
      sequence: 1,
      assets: [firstAsset, secondAsset],
    });
    const session = await store.acceptBatch({
      sessionId: "session-B",
      batch: second,
      contentFingerprint: "fp-2",
      envelopeFingerprint: "fe-2",
      acceptedAt: fixedClock(),
      timestamp: fixedClock(),
    });

    expect(session.lastAcceptedSequence).toBe(1);
    expect(session.batches.map((batch) => batch.sequence)).toEqual([0, 1]);
    expect(session.envelope).toEqual(second.envelope);
    // Asset accumulation: deduped by content id, first-appearance order.
    expect(session.assets.map((asset) => asset.contentId)).toEqual([
      firstAsset.contentId,
      secondAsset.contentId,
    ]);
    // The first batch's record is preserved append-only.
    const firstRecord = await store.getBatchRecord("session-B", 0);
    expect(firstRecord?.batch).toEqual(first);
    expect(firstRecord?.envelopeFingerprint).toBe("fe-1");
    expect((await store.getBatchRecord("session-B", 1))?.batch).toEqual(second);
  });

  test(`${name}: idempotency ledger is put-if-absent and never overwritten`, async () => {
    const store = factory();
    const first = {
      idempotencyKey: "key-1",
      batchId: "batch-1",
      sessionId: "session-D",
      sequence: 0,
      contentFingerprint: "fp-1",
    };
    expect(await store.putIdempotencyRecord(first)).toBeNull();

    const raced = await store.putIdempotencyRecord({
      idempotencyKey: "key-1",
      batchId: "batch-OTHER",
      sessionId: "session-D",
      sequence: 0,
      contentFingerprint: "fp-OTHER",
    });
    expect(raced).toEqual(first);
    expect(await store.getIdempotencyRecord("key-1")).toEqual(first);
  });
}

describe("InMemoryCaptureStore", () => {
  storeBehavior("InMemoryCaptureStore", () => new InMemoryCaptureStore());
});

describe("FsCaptureStore", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Each test gets a fresh temporary root; nothing leaks between cases.
  storeBehavior("FsCaptureStore", () => {
    const dir = mkdtempSync(join(tmpdir(), "aise-store-"));
    roots.push(dir);
    return new FsCaptureStore(dir);
  });
});

describe("FsCaptureStore file layout", () => {
  test("content blobs and metadata live at content-addressed paths", async () => {
    await withTempDir(async (root) => {
      const store = new FsCaptureStore(root);
      const bytes = new TextEncoder().encode("blob-layout");
      const contentId = sha256Hex(bytes);
      const first2 = contentId.slice(0, 2);

      await store.putAsset(contentId, bytes, "image/png", fixedClock());

      const blobPath = store.contentBlobPath(contentId);
      const metaPath = store.contentMetaPath(contentId);
      expect(blobPath).toBe(join(root, "content", first2, contentId));
      expect(metaPath).toBe(`${blobPath}.json`);
      expect(existsSync(blobPath)).toBe(true);
      expect(existsSync(metaPath)).toBe(true);
      expect([...readFileSync(blobPath)]).toEqual([...bytes]);

      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
        contentId: string;
        mediaType: string;
      };
      expect(meta.contentId).toBe(contentId);
      expect(meta.mediaType).toBe("image/png");
      // Canonical JSON bytes: sorted keys, 2-space indent, trailing newline.
      expect(readFileSync(metaPath, "utf8")).toBe(
        canonicalJsonStringify({
          contentId,
          byteSize: bytes.length,
          mediaType: "image/png",
          storedAt: fixedClock(),
        }),
      );
    });
  });

  test("sessions, batch records and idempotency records use hashed, safe paths", async () => {
    await withTempDir(async (root) => {
      const store = new FsCaptureStore(root);
      const sessionId = "session/with risky characters ✓";
      const batch = makeBatch({ sessionId, sequence: 0, assets: [] });
      await store.acceptBatch({
        sessionId,
        batch,
        contentFingerprint: "fp",
        envelopeFingerprint: "fe",
        acceptedAt: fixedClock(),
        timestamp: fixedClock(),
      });
      await store.putIdempotencyRecord({
        idempotencyKey: batch.idempotencyKey,
        batchId: batch.batchId,
        sessionId,
        sequence: 0,
        contentFingerprint: "fp",
      });

      const sessionDir = join(root, "sessions", sha256Hex(sessionId));
      expect(existsSync(join(sessionDir, "session.json"))).toBe(true);
      const batchFile = join(
        sessionDir,
        "batches",
        `00000000-${sha256Hex(batch.batchId)}.json`,
      );
      expect(existsSync(batchFile)).toBe(true);
      const record = JSON.parse(readFileSync(batchFile, "utf8")) as {
        batch: { batchId: string };
        envelopeFingerprint: string;
      };
      expect(record.batch.batchId).toBe(batch.batchId);
      expect(record.envelopeFingerprint).toBe("fe");

      const idempotencyFile = join(
        root,
        "idempotency",
        `${sha256Hex(batch.idempotencyKey)}.json`,
      );
      expect(existsSync(idempotencyFile)).toBe(true);
    });
  });

  test("creates its root directories deterministically", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "nested", "data");
      new FsCaptureStore(dataDir);
      expect(existsSync(join(dataDir, "content"))).toBe(true);
      expect(existsSync(join(dataDir, "sessions"))).toBe(true);
      expect(existsSync(join(dataDir, "idempotency"))).toBe(true);
    });
  });
});

describe("InMemoryCaptureStore envelope preservation", () => {
  test("stores the envelope object deeply equal to the decoded source", async () => {
    const store = new InMemoryCaptureStore();
    const envelope = makeEnvelope("session-E", []);
    const batch = makeBatch({ sessionId: "session-E", sequence: 0, assets: [] });
    const session = await store.acceptBatch({
      sessionId: "session-E",
      batch: { ...batch, envelope },
      contentFingerprint: "fp",
      envelopeFingerprint: "fe",
      acceptedAt: fixedClock(),
      timestamp: fixedClock(),
    });
    expect(session.envelope).toEqual(envelope);
    // Deep equality includes the open acquisition metadata map and every
    // capability descriptor — verbatim preservation.
    expect(session.envelope.capabilityProfile.calibration.status).toBe("unknown");
  });
});
