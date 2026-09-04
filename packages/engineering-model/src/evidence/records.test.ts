/**
 * Evidence-record tests: constructor validation, the
 * kind↔source compatibility matrix, deterministic identity
 * (lineage pin), content pinning, immutability, defense-in-depth
 * acquisition validation.
 */
import { describe, expect, it } from "vitest";
import { EvidenceError } from "./errors.js";
import {
  compatibleAssetTypes,
  deriveEvidenceId,
  evidenceRecord,
  EVIDENCE_KINDS,
  recordContentHash,
  sourcePin,
} from "./records.js";
import {
  captureSource,
  documentEvidence,
  lidarEvidence,
  measurementEvidence,
  observationEvidence,
  recordInput,
} from "./testing.js";

describe("kind vocabulary (AC-060)", () => {
  it("covers image/video/LiDAR/measurement/document/human-observation", () => {
    expect(EVIDENCE_KINDS).toEqual([
      "IMAGE",
      "VIDEO",
      "LIDAR",
      "MEASUREMENT",
      "DOCUMENT",
      "HUMAN_OBSERVATION",
    ]);
  });

  it("rejects unknown kinds", () => {
    expect(() =>
      evidenceRecord(recordInput("PHOTO" as never, captureSource())),
    ).toThrow(EvidenceError);
  });
});

describe("kind ↔ source compatibility (fail closed)", () => {
  it("accepts LIDAR ← DEPTH capture", () => {
    expect(lidarEvidence().kind).toBe("LIDAR");
  });

  it("rejects IMAGE ← DEPTH capture (KIND_INCOMPATIBLE)", () => {
    const error = captureError(() =>
      evidenceRecord(recordInput("IMAGE", captureSource())),
    );
    expect(error?.code).toBe("KIND_INCOMPATIBLE");
  });

  it("rejects IMAGE ← PHOTO capture is accepted; LIDAR ← PHOTO is rejected", () => {
    const photo = captureSource({ assetType: "PHOTO", contentHash: "f".repeat(64) });
    expect(evidenceRecord(recordInput("IMAGE", photo)).kind).toBe("IMAGE");
    expect(captureError(() => evidenceRecord(recordInput("LIDAR", photo)))?.code).toBe(
      "KIND_INCOMPATIBLE",
    );
  });

  it("rejects MEASUREMENT ← capture (measurements are never capture-bound)", () => {
    expect(compatibleAssetTypes("MEASUREMENT")).toEqual([]);
    expect(
      captureError(() => evidenceRecord(recordInput("MEASUREMENT", captureSource())))?.code,
    ).toBe("KIND_INCOMPATIBLE");
  });

  it("accepts DOCUMENT ← DOCUMENT and SKETCH captures", () => {
    expect(
      evidenceRecord(
        recordInput("DOCUMENT", captureSource({ assetType: "DOCUMENT", contentHash: "1".repeat(64) })),
      ).kind,
    ).toBe("DOCUMENT");
    expect(
      evidenceRecord(
        recordInput("DOCUMENT", captureSource({ assetType: "SKETCH", contentHash: "2".repeat(64) })),
      ).kind,
    ).toBe("DOCUMENT");
  });

  it("accepts HUMAN_OBSERVATION ← VOICE capture; rejects ← PHOTO", () => {
    const voice = captureSource({ assetType: "VOICE", contentHash: "3".repeat(64) });
    expect(evidenceRecord(recordInput("HUMAN_OBSERVATION", voice)).kind).toBe(
      "HUMAN_OBSERVATION",
    );
    expect(
      captureError(() =>
        evidenceRecord(
          recordInput("HUMAN_OBSERVATION", captureSource({ assetType: "PHOTO", contentHash: "4".repeat(64) })),
        ),
      )?.code,
    ).toBe("KIND_INCOMPATIBLE");
  });

  it("rejects METADATA assets for every kind (session metadata is not evidence)", () => {
    const metadata = captureSource({ assetType: "METADATA", contentHash: "5".repeat(64) });
    for (const kind of EVIDENCE_KINDS) {
      expect(captureError(() => evidenceRecord(recordInput(kind, metadata)))?.code).toBe(
        "KIND_INCOMPATIBLE",
      );
    }
  });
});

describe("deterministic identity (immutable source identity)", () => {
  it("derives `ev-<hex16>` identities", () => {
    expect(lidarEvidence().evidenceId).toMatch(/^ev-[0-9a-f]{16}$/);
  });

  it("identity is stable across registrations (lineage, not mutable content)", () => {
    const first = evidenceRecord(recordInput("LIDAR", captureSource()));
    const second = evidenceRecord(
      recordInput("LIDAR", captureSource(), { recordedBy: "user:other", recordedAt: "2026-09-05T08:00:00Z" }),
    );
    expect(second.evidenceId).toBe(first.evidenceId);
    // Registration metadata is provenance of registration, not content.
    expect(second.contentHash).toBe(first.contentHash);
  });

  it("any pin-member change yields a new identity", () => {
    const base = lidarEvidence();
    const changedSession = evidenceRecord(
      recordInput("LIDAR", captureSource({ sessionId: "session-fedcba9876543210" })),
    );
    const changedHash = evidenceRecord(
      recordInput("LIDAR", captureSource({ contentHash: "c".repeat(64) })),
    );
    expect(changedSession.evidenceId).not.toBe(base.evidenceId);
    expect(changedHash.evidenceId).not.toBe(base.evidenceId);
  });

  it("non-pin content changes keep identity but change the content hash (detectable)", () => {
    const base = lidarEvidence();
    const drifted = evidenceRecord(
      recordInput("LIDAR", captureSource({ byteSize: 4096 })),
    );
    expect(drifted.evidenceId).toBe(base.evidenceId);
    expect(drifted.contentHash).not.toBe(base.contentHash);
  });

  it("the pin excludes registration metadata and non-pin fields", () => {
    const source = captureSource();
    expect(sourcePin("LIDAR", source)).toEqual({
      kind: "LIDAR",
      source: "capture",
      sessionId: source.sessionId,
      assetId: source.assetId,
      contentHash: source.contentHash,
    });
  });

  it("manual-measurement pins include the measured value (identity = lineage)", () => {
    const base = measurementEvidence();
    const differentValue = evidenceRecord(
      recordInput("MEASUREMENT", captureSource() as never, {
        source: { kind: "manual-measurement", value: 3.1, unit: "m", method: "survey/total-station", measuredBy: "surveyor-bob", measuredAt: "2026-09-03T14:00:00Z" },
      }),
    );
    expect(differentValue.evidenceId).not.toBe(base.evidenceId);
  });
});

describe("content pinning", () => {
  it("contentHash is the canonical hash of {kind, source}", () => {
    const record = documentEvidence();
    expect(record.contentHash).toBe(recordContentHash(record.kind, record.source));
  });

  it("every source field change changes the content hash", () => {
    const base = observationEvidence();
    const changed = evidenceRecord(
      recordInput("HUMAN_OBSERVATION", {
        kind: "human-observation",
        observer: "operator-dan",
        observedAt: "2026-09-01T09:45:00Z",
        statement: "Different statement",
      }),
    );
    expect(changed.contentHash).not.toBe(base.contentHash);
  });
});

describe("validation (fail closed)", () => {
  it("rejects malformed capture hashes", () => {
    expect(
      captureError(() =>
        evidenceRecord(recordInput("LIDAR", captureSource({ contentHash: "not-a-hash" }))),
      )?.code,
    ).toBe("EVIDENCE_INVALID");
  });

  it("rejects negative/invalid byteSize", () => {
    expect(
      captureError(() => evidenceRecord(recordInput("LIDAR", captureSource({ byteSize: -1 }))))?.code,
    ).toBe("EVIDENCE_INVALID");
    expect(
      captureError(() => evidenceRecord(recordInput("LIDAR", captureSource({ byteSize: 1.5 }))))?.code,
    ).toBe("EVIDENCE_INVALID");
  });

  it("rejects malformed recordedAt timestamps", () => {
    expect(
      captureError(() =>
        evidenceRecord(recordInput("LIDAR", captureSource(), { recordedAt: "2026-09-04 10:00" })),
      )?.code,
    ).toBe("EVIDENCE_INVALID");
  });

  it("rejects malformed actor identities", () => {
    expect(
      captureError(() =>
        evidenceRecord(recordInput("LIDAR", captureSource(), { recordedBy: "bad actor!" })),
      )?.code,
    ).toBe("EVIDENCE_INVALID");
  });

  it("rejects non-finite measurement values", () => {
    expect(
      captureError(() =>
        evidenceRecord(
          recordInput("MEASUREMENT", { kind: "manual-measurement", value: Number.NaN, unit: "m", method: "survey/total-station", measuredBy: "surveyor-bob", measuredAt: "2026-09-03T14:00:00Z" }),
        ),
      )?.code,
    ).toBe("EVIDENCE_INVALID");
  });

  it("rejects out-of-range geolocation (defense in depth)", () => {
    expect(
      captureError(() =>
        evidenceRecord(
          recordInput("LIDAR", captureSource({ acquisition: { capturedAt: "2026-09-01T09:30:00Z", geolocation: { latitude: 200, longitude: 0 } } })),
        ),
      )?.code,
    ).toBe("EVIDENCE_INVALID");
  });

  it("rejects non-finite orientation quaternions (defense in depth)", () => {
    expect(
      captureError(() =>
        evidenceRecord(
          recordInput("LIDAR", captureSource({ acquisition: { capturedAt: "2026-09-01T09:30:00Z", orientation: { quaternion: { x: 0, y: 0, z: 0, w: Number.POSITIVE_INFINITY } } } })),
        ),
      )?.code,
    ).toBe("EVIDENCE_INVALID");
  });
});

describe("immutability", () => {
  it("records are deep-frozen", () => {
    const record = measurementEvidence();
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.source)).toBe(true);
    expect(() => {
      (record as unknown as Record<string, unknown>).notes = "mutation";
    }).toThrow(TypeError);
  });
});

describe("identity derivation is public and consistent", () => {
  it("deriveEvidenceId matches the constructor's identity", () => {
    const record = observationEvidence();
    expect(deriveEvidenceId(record.kind, record.source)).toBe(record.evidenceId);
  });
});

function captureError(action: () => unknown): EvidenceError | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceError);
    return error as EvidenceError;
  }
}
