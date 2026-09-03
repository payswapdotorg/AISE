/**
 * Capture-upload adapter tests: the ingestion-boundary bridge that
 * turns committed uploads into first-class evidence records, with
 * the binding pinned to the SERVER-COMPUTED received hash.
 */
import { describe, expect, it } from "vitest";
import type { CaptureUploadView } from "./capture.js";
import {
  DEFAULT_KIND_BY_ASSET_TYPE,
  evidenceFromUpload,
} from "./capture.js";
import { EvidenceServiceError } from "./errors.js";
import {
  deriveEvidenceId,
  recordContentHash,
  type EvidenceRecord,
} from "@aise/engineering-model";

const RECORDED_AT = "2026-09-04T10:00:00Z";

/** A valid DEPTH upload view (the default fixture). */
function uploadView(overrides: Partial<CaptureUploadView> = {}): CaptureUploadView {
  return {
    projectId: "project-capture",
    sessionId: "session-0123456789abcdef",
    assetId: "asset-0123456789abcdef",
    packageId: "package-0123456789abcdef",
    assetType: "DEPTH",
    receivedHash: "a".repeat(64),
    byteSize: 2048,
    mimeType: "application/octet-stream",
    acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
    ...overrides,
  };
}

function errorOf(action: () => unknown): EvidenceServiceError | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceServiceError);
    return error as EvidenceServiceError;
  }
}

describe("DEFAULT_KIND_BY_ASSET_TYPE (the v1 mapping)", () => {
  it("maps every capture asset type to a compatible evidence kind", () => {
    expect(DEFAULT_KIND_BY_ASSET_TYPE).toEqual({
      PHOTO: "IMAGE",
      VIDEO: "VIDEO",
      DEPTH: "LIDAR",
      DOCUMENT: "DOCUMENT",
      SKETCH: "DOCUMENT",
      VOICE: "HUMAN_OBSERVATION",
      // METADATA is present only so the table is total; the adapter
      // rejects it before the mapping is ever consulted.
      METADATA: expect.any(String),
    });
  });
});

describe("evidenceFromUpload (the happy path)", () => {
  it("builds a LIDAR record from a DEPTH upload", () => {
    const upload = uploadView();
    const record = evidenceFromUpload(upload, { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    expect(record.kind).toBe("LIDAR");
    expect(record.evidenceId).toMatch(/^ev-[0-9a-f]{16}$/);
    expect(record.recordedBy).toBe("svc:ingest");
    expect(record.recordedAt).toBe(RECORDED_AT);
    expect(record.notes).toBeUndefined();
  });

  it("pins the binding to the server-computed received hash (never a client claim)", () => {
    const upload = uploadView();
    const record = evidenceFromUpload(upload, { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    const source = record.source as { kind: "capture"; contentHash: string };
    expect(source.kind).toBe("capture");
    expect(source.contentHash).toBe(upload.receivedHash);
    expect(record.contentHash).toBe(recordContentHash(record.kind, record.source));
  });

  it("preserves acquisition metadata verbatim (raw preservation)", () => {
    const upload = uploadView({
      acquisition: {
        capturedAt: "2026-09-01T09:30:00Z",
        deviceRef: "device-field-01",
        sensorRef: "sensor-lidar-01",
        geolocation: { latitude: 5.6037, longitude: -0.187, altitudeM: 76, accuracyM: 4 },
      },
    });
    const record = evidenceFromUpload(upload, { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    expect((record.source as { acquisition: unknown }).acquisition).toEqual(upload.acquisition);
  });

  it("carries optional mimeType and notes", () => {
    const record = evidenceFromUpload(uploadView(), {
      recordedBy: "svc:ingest",
      recordedAt: RECORDED_AT,
      notes: "as-built scan",
    });
    expect((record.source as { mimeType?: string }).mimeType).toBe("application/octet-stream");
    expect(record.notes).toBe("as-built scan");
  });

  it("is deterministic: the same upload derives the identical record", () => {
    const first = evidenceFromUpload(uploadView(), { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    const second = evidenceFromUpload(uploadView(), { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    expect(second).toEqual(first);
  });

  it("returns a deep-frozen record (immutable by construction)", () => {
    const record = evidenceFromUpload(uploadView(), { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.source)).toBe(true);
  });
});

describe("kind selection (fail closed)", () => {
  it("rejects METADATA uploads — session metadata is not evidence", () => {
    const error = errorOf(() =>
      evidenceFromUpload(uploadView({ assetType: "METADATA" }), {
        recordedBy: "svc:ingest",
        recordedAt: RECORDED_AT,
      }),
    );
    expect(error?.code).toBe("EVIDENCE_INVALID");
    expect(error?.details.assetId).toBe("asset-0123456789abcdef");
  });

  it("rejects an explicit kind incompatible with the asset type", () => {
    const error = errorOf(() =>
      evidenceFromUpload(uploadView(), {
        kind: "IMAGE",
        recordedBy: "svc:ingest",
        recordedAt: RECORDED_AT,
      }),
    );
    expect(error?.code).toBe("KIND_INCOMPATIBLE");
  });

  it("accepts an explicit compatible kind", () => {
    const record = evidenceFromUpload(uploadView(), {
      kind: "LIDAR",
      recordedBy: "svc:ingest",
      recordedAt: RECORDED_AT,
    });
    expect(record.kind).toBe("LIDAR");
  });

  it("defaults each non-METADATA asset type to its compatible kind", () => {
    const cases: readonly [string, string][] = [
      ["PHOTO", "IMAGE"],
      ["VIDEO", "VIDEO"],
      ["DOCUMENT", "DOCUMENT"],
      ["SKETCH", "DOCUMENT"],
      ["VOICE", "HUMAN_OBSERVATION"],
    ];
    let variant = 1;
    for (const [assetType, kind] of cases) {
      const record = evidenceFromUpload(
        uploadView({
          assetType: assetType as CaptureUploadView["assetType"],
          receivedHash: String(variant).repeat(64),
        }),
        { recordedBy: "svc:ingest", recordedAt: RECORDED_AT },
      );
      expect(record.kind).toBe(kind);
      variant += 1;
    }
  });
});

describe("upload validation (defense in depth)", () => {
  it("rejects a malformed received hash", () => {
    const error = errorOf(() =>
      evidenceFromUpload(uploadView({ receivedHash: "not-a-hash" }), {
        recordedBy: "svc:ingest",
        recordedAt: RECORDED_AT,
      }),
    );
    expect(error?.code).toBe("EVIDENCE_INVALID");
  });

  it("rejects a negative byte size", () => {
    const error = errorOf(() =>
      evidenceFromUpload(uploadView({ byteSize: -1 }), {
        recordedBy: "svc:ingest",
        recordedAt: RECORDED_AT,
      }),
    );
    expect(error?.code).toBe("EVIDENCE_INVALID");
  });

  it("rejects a malformed capturedAt", () => {
    const error = errorOf(() =>
      evidenceFromUpload(uploadView({ acquisition: { capturedAt: "yesterday" } }), {
        recordedBy: "svc:ingest",
        recordedAt: RECORDED_AT,
      }),
    );
    expect(error?.code).toBe("EVIDENCE_INVALID");
  });
});

describe("identity discipline (lineage, not mutable content)", () => {
  it("non-pin content drift keeps the identity but changes the content hash", () => {
    const base = evidenceFromUpload(uploadView(), { recordedBy: "svc:ingest", recordedAt: RECORDED_AT });
    const drifted = evidenceFromUpload(uploadView({ byteSize: 4096 }), {
      recordedBy: "svc:ingest",
      recordedAt: RECORDED_AT,
    });
    expect(drifted.evidenceId).toBe(base.evidenceId);
    expect(drifted.contentHash).not.toBe(base.contentHash);
  });

  it("registration metadata never enters identity or content", () => {
    const first = evidenceFromUpload(uploadView(), { recordedBy: "svc:a", recordedAt: RECORDED_AT });
    const second = evidenceFromUpload(uploadView(), {
      recordedBy: "user:other",
      recordedAt: "2026-09-05T08:00:00Z",
    });
    expect(second.evidenceId).toBe(first.evidenceId);
    expect(second.contentHash).toBe(first.contentHash);
  });

  it("the public deriver agrees with the adapter's identity", () => {
    const record: EvidenceRecord = evidenceFromUpload(uploadView(), {
      recordedBy: "svc:ingest",
      recordedAt: RECORDED_AT,
    });
    expect(deriveEvidenceId(record.kind, record.source)).toBe(record.evidenceId);
  });
});
