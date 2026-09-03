/**
 * Preprocessing tests (AISE-008).
 *
 * Cover the fail-closed integrity re-verification, the deterministic
 * derived view, the explicit (never silent) exclusion of non-visual
 * assets, the ambiguous-asset-type halt, and — as a contract
 * consumer obligation — that the AISE-003 fixture acquisition
 * metadata flows through preprocessing unchanged.
 */
import { describe, expect, it } from "vitest";
import {
  loadFixtureJson,
  validateCapturePackage,
  type CapturePackage,
} from "@aise/shared-contracts";
import {
  createFailClosedCaptureSource,
  createStaticCaptureSource,
  type CommittedCaptureUpload,
} from "../capture/source.js";
import { preprocessSession } from "./preprocess.js";
import { buildUpload, payloadFor } from "../testing/test-uploads.js";
import { ReconstructionError } from "../errors.js";
import { sha256HexBytes } from "../canonical.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

function sourceOf(uploads: CommittedCaptureUpload[]) {
  return createStaticCaptureSource(uploads);
}

function expectErrorCode(fn: () => unknown, code: string): ReconstructionError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ReconstructionError);
  const reconstructionError = caught as ReconstructionError;
  expect(reconstructionError.code).toBe(code);
  return reconstructionError;
}

describe("capture source port", () => {
  it("groups committed uploads by session and answers undefined for unknown sessions", () => {
    const upload = buildUpload({ sessionId: SESSION });
    const source = sourceOf([upload]);
    expect(source.listCommittedUploads(SESSION)).toEqual([upload]);
    expect(source.listCommittedUploads("99999999-9999-4999-8999-999999999999")).toBeUndefined();
  });

  it("separates sessions", () => {
    const a = buildUpload({ sessionId: "aaaaaaaa-0000-4000-8000-000000000001" });
    const b = buildUpload({ sessionId: "aaaaaaaa-0000-4000-8000-000000000002" });
    const source = sourceOf([a, b]);
    expect(source.listCommittedUploads(a.sessionId)).toEqual([a]);
    expect(source.listCommittedUploads(b.sessionId)).toEqual([b]);
  });

  it("the fail-closed default source refuses to answer", () => {
    const source = createFailClosedCaptureSource();
    expect(() => source.listCommittedUploads(SESSION)).toThrowError(ReconstructionError);
    expectErrorCode(
      () => source.listCommittedUploads(SESSION),
      "CAPTURE_SOURCE_UNAVAILABLE",
    );
  });
});

describe("preprocessSession — happy path and determinism", () => {
  it("produces sorted frames and an explicit exclusion record", () => {
    const source = sourceOf([
      buildUpload({ sessionId: SESSION, assetId: "c-asset", capturedAt: "2026-09-03T07:13:02Z" }),
      buildUpload({ sessionId: SESSION, assetId: "a-asset", capturedAt: "2026-09-03T07:12:31Z" }),
      buildUpload({
        sessionId: SESSION,
        assetId: "z-voice",
        capturedAt: "2026-09-03T07:12:00Z",
        assetType: "VOICE",
        mimeType: "audio/ogg",
      }),
    ]);

    const result = preprocessSession(source, SESSION);

    expect(result.sessionId).toBe(SESSION);
    expect(result.frames.map((frame) => frame.assetId)).toEqual(["a-asset", "c-asset"]);
    expect(result.frames.map((frame) => frame.assetType)).toEqual(["PHOTO", "PHOTO"]);
    expect(result.excludedAssets).toEqual([
      { assetId: "z-voice", assetType: "VOICE", reason: "not_reconstructable_asset_type" },
    ]);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.formatVersion).toBe("1.0");
  });

  it("breaks capturedAt ties deterministically by assetId", () => {
    const uploadA = buildUpload({ sessionId: SESSION, assetId: "b-asset", capturedAt: "2026-09-03T07:12:31Z" });
    const uploadB = buildUpload({ sessionId: SESSION, assetId: "a-asset", capturedAt: "2026-09-03T07:12:31Z" });

    const forward = preprocessSession(sourceOf([uploadA, uploadB]), SESSION);
    const backward = preprocessSession(sourceOf([uploadB, uploadA]), SESSION);

    expect(forward.frames.map((frame) => frame.assetId)).toEqual(["a-asset", "b-asset"]);
    expect(backward.frames.map((frame) => frame.assetId)).toEqual(["a-asset", "b-asset"]);
    expect(forward.fingerprint).toBe(backward.fingerprint);
  });

  it("is deterministic: equal inputs produce equal fingerprints regardless of input order", () => {
    const uploads = [
      buildUpload({ sessionId: SESSION, assetId: "a-asset", capturedAt: "2026-09-03T07:12:31Z" }),
      buildUpload({ sessionId: SESSION, assetId: "b-asset", capturedAt: "2026-09-03T07:13:02Z" }),
      buildUpload({
        sessionId: SESSION,
        assetId: "m-doc",
        capturedAt: "2026-09-03T07:14:00Z",
        assetType: "DOCUMENT",
      }),
    ];
    const first = preprocessSession(sourceOf(uploads), SESSION);
    const second = preprocessSession(sourceOf([...uploads].reverse()), SESSION);
    expect(first.fingerprint).toBe(second.fingerprint);
    // Exclusions are sorted by assetId, not input order.
    expect(second.excludedAssets.map((asset) => asset.assetId)).toEqual(["m-doc"]);
  });

  it("changes the fingerprint when content changes", () => {
    const base = buildUpload({ sessionId: SESSION, assetId: "a-asset" });
    const tampered = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      payload: payloadFor("other-payload"),
    });
    const first = preprocessSession(sourceOf([base]), SESSION);
    const second = preprocessSession(sourceOf([tampered]), SESSION);
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("carries identity and metadata but never payload bytes", () => {
    const source = sourceOf([buildUpload({ sessionId: SESSION, assetId: "a-asset" })]);
    const result = preprocessSession(source, SESSION);
    const frame = result.frames[0];
    expect(frame).toBeDefined();
    expect(Object.keys(frame ?? {}).sort()).toEqual(
      [
        "acquisition",
        "assetId",
        "assetType",
        "byteSize",
        "capturedAt",
        "contentHash",
        "frameId",
        "mimeType",
      ].sort(),
    );
    expect(frame?.byteSize).toBe(96);
    expect(frame?.mimeType).toBe("image/jpeg");
  });
});

describe("preprocessSession — fail-closed integrity re-verification", () => {
  it("fails closed when the payload hash does not match the declared content hash", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      payload: payloadFor("real-bytes"),
      contentHash: sha256HexBytes(payloadFor("tampered-bytes")),
    });
    const error = expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "INTEGRITY_MISMATCH");
    expect(error.details).toMatchObject({
      assetId: "a-asset",
      declared: sha256HexBytes(payloadFor("tampered-bytes")),
      recomputed: sha256HexBytes(payloadFor("real-bytes")),
    });
  });

  it("fails closed when the ingestion-recorded received hash diverges from the declared hash", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      receivedHash: sha256HexBytes(payloadFor("other-bytes")),
    });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "INTEGRITY_MISMATCH");
  });

  it("fails closed when the payload byte length does not match the declared byte size", () => {
    const upload = buildUpload({ sessionId: SESSION, assetId: "a-asset", byteSize: 95 });
    const error = expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "INTEGRITY_MISMATCH");
    expect(error.details).toMatchObject({ declared: 95, actual: 96 });
  });

  it("fails closed on a malformed declared hash", () => {
    const upload = buildUpload({ sessionId: SESSION, assetId: "a-asset", contentHash: "not-a-hash" });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "VALIDATION_FAILED");
  });
});

describe("preprocessSession — metadata validation (fail closed, never repaired)", () => {
  it("fails closed when capturedAt is missing", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      acquisition: { capturedAt: undefined as unknown as string },
    });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "VALIDATION_FAILED");
  });

  it("fails closed when capturedAt is not a parseable timestamp", () => {
    const upload = buildUpload({ sessionId: SESSION, assetId: "a-asset", capturedAt: "not-a-timestamp" });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "VALIDATION_FAILED");
  });

  it("fails closed on a non-finite quaternion component", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      orientation: { x: Number.NaN, y: 0, z: 0, w: 1 },
    });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "VALIDATION_FAILED");
  });

  it("fails closed on a zero-norm quaternion", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      orientation: { x: 0, y: 0, z: 0, w: 0 },
    });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "VALIDATION_FAILED");
  });

  it("fails closed on out-of-range geolocation", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      geolocation: { latitude: 91, longitude: 0 },
    });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "VALIDATION_FAILED");
  });

  it("fails closed on a duplicated committed asset id", () => {
    const upload = buildUpload({ sessionId: SESSION, assetId: "a-asset" });
    expectErrorCode(
      () => preprocessSession(sourceOf([upload, { ...upload }]), SESSION),
      "VALIDATION_FAILED",
    );
  });
});

describe("preprocessSession — routing and emptiness", () => {
  it("fails closed on the cross-MINOR reader sentinel asset type", () => {
    const upload = buildUpload({ sessionId: SESSION, assetId: "a-asset", assetType: "unknown" });
    const error = expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "UNKNOWN_ASSET_TYPE");
    expect(error.details).toMatchObject({ assetId: "a-asset", assetType: "unknown" });
  });

  it("fails closed on an unexpected asset type value", () => {
    const upload = buildUpload({
      sessionId: SESSION,
      assetId: "a-asset",
      assetType: "HOLOGRAM" as CommittedCaptureUpload["assetType"],
    });
    expectErrorCode(() => preprocessSession(sourceOf([upload]), SESSION), "UNKNOWN_ASSET_TYPE");
  });

  it("fails closed when no committed upload is reconstructable", () => {
    const uploads = [
      buildUpload({ sessionId: SESSION, assetId: "v-1", assetType: "VOICE" }),
      buildUpload({ sessionId: SESSION, assetId: "s-1", assetType: "SKETCH" }),
    ];
    const error = expectErrorCode(() => preprocessSession(sourceOf(uploads), SESSION), "NO_RECONSTRUCTABLE_FRAMES");
    expect(error.details).toMatchObject({ excludedAssets: 2 });
  });

  it("fails closed for an unknown session", () => {
    expectErrorCode(
      () => preprocessSession(sourceOf([]), "99999999-9999-4999-8999-999999999999"),
      "SESSION_NOT_FOUND",
    );
  });

  it("fails closed for a known session with zero committed uploads", () => {
    // Known session (the source answers, not undefined) but empty:
    // distinct from SESSION_NOT_FOUND, and not a silent success.
    const emptySource = {
      kind: "empty",
      listCommittedUploads: (sessionId: string) => (sessionId === SESSION ? [] : undefined),
    };
    expectErrorCode(() => preprocessSession(emptySource, SESSION), "NO_COMMITTED_UPLOADS");
  });
});

describe("contract consumer: AISE-003 fixture acquisition metadata", () => {
  it("the full capture-package fixture validates against the v1.0 schema", () => {
    const outcome = validateCapturePackage(loadFixtureJson("capture-package.full.json"));
    expect(outcome.errors).toEqual([]);
    expect(outcome.ok).toBe(true);
  });

  it("fixture acquisition metadata flows through preprocessing unchanged", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as CapturePackage;
    const uploads = pkg.assets.map((asset) =>
      buildUpload({
        sessionId: pkg.sessionId,
        assetId: asset.assetId,
        assetType: asset.assetType,
        mimeType: asset.mimeType,
        acquisition: asset.acquisition,
      }),
    );
    const result = preprocessSession(sourceOf(uploads), pkg.sessionId);

    // PHOTO + DEPTH become frames (order by capturedAt), METADATA is excluded.
    expect(result.frames.map((frame) => frame.assetType)).toEqual(["PHOTO", "DEPTH"]);
    expect(result.frames.map((frame) => frame.assetId)).toEqual([pkg.assets[0]?.assetId, pkg.assets[1]?.assetId]);
    expect(result.excludedAssets).toEqual([
      { assetId: pkg.assets[2]?.assetId, assetType: "METADATA", reason: "not_reconstructable_asset_type" },
    ]);

    // The quaternion and geolocation from the fixture are preserved verbatim.
    const photoFrame = result.frames[0];
    expect(photoFrame?.acquisition.orientation?.quaternion).toEqual(
      pkg.assets[0]?.acquisition.orientation?.quaternion,
    );
    expect(photoFrame?.acquisition.geolocation).toEqual(pkg.assets[0]?.acquisition.geolocation);
    expect(photoFrame?.capturedAt).toBe(pkg.assets[0]?.acquisition.capturedAt);
  });
});
