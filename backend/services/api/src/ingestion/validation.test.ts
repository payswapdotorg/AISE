/**
 * Unit tests for the envelope readers (validation.ts) — the tolerant
 * reading of newer-MINOR (same-MAJOR) ingestion payloads.
 *
 * These pin the finalized AISE-003 reader obligation at the unit
 * level (architect review, PR #7):
 * - unknown fields are dropped RECURSIVELY (top level, assets[],
 *   acquisition, geolocation, orientation, quaternion);
 * - unrecognized enum values are mapped to the `unknown` reader
 *   sentinel with the canonical `tolerateEnumValue` semantics — never
 *   onto an existing member, never rejected;
 * - non-string enum values are NOT mapped (only strings can be
 *   unknown enum values) and fail closed;
 * - tolerant reading is not lax: malformed known fields, missing
 *   required fields and cross-MAJOR versions are still rejected;
 * - the reader-view schemas are equivalent to the strict v1.0
 *   schemas for every canonical fixture (format regexes and enum
 *   vocabularies included).
 */
import { describe, expect, it } from "vitest";
import {
  loadFixtureJson,
  UNKNOWN_ENUM,
  type CapturePackage,
  type CaptureSession,
  type Project,
  type UploadRequest,
} from "@aise/shared-contracts";
import { IngestionError } from "./errors.js";
import {
  readPackageEnvelope,
  readProjectEnvelope,
  readSessionEnvelope,
  readUploadRequestEnvelope,
} from "./validation.js";

const PROJECT_FIXTURE = loadFixtureJson("project.full.json") as Project;
const SESSION_FIXTURE = loadFixtureJson("capture-session.full.json") as CaptureSession;
const PACKAGE_FIXTURE = loadFixtureJson("capture-package.full.json") as CapturePackage;
const UPLOAD_REQUEST_FIXTURE = loadFixtureJson("upload-request.json") as UploadRequest;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectIngestionError(fn: () => unknown, code: string): IngestionError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(IngestionError);
    const ingestionError = error as IngestionError;
    expect(ingestionError.envelope.code).toBe(code);
    return ingestionError;
  }
  throw new Error("expected readEnvelope to throw");
}

describe("tolerant reading of newer-MINOR sessions", () => {
  it("drops unknown fields and maps unknown enum values onto the reader sentinel", () => {
    const newer = {
      ...clone(SESSION_FIXTURE),
      contractVersion: "1.1",
      intent: "SPOT_CHECK",
      assuranceProfile: "AUDIT_PROFILE",
      status: "PAUSED",
      futureSessionField: "ignored",
    };
    const session = readSessionEnvelope(newer);
    expect(session.intent).toBe(UNKNOWN_ENUM);
    expect(session.assuranceProfile).toBe(UNKNOWN_ENUM);
    expect(session.status).toBe(UNKNOWN_ENUM);
    expect(session.contractVersion).toBe("1.0");
    expect("futureSessionField" in session).toBe(false);
    expect(session.sessionId).toBe(SESSION_FIXTURE.sessionId);
  });

  it("preserves v1.0 enum members unchanged (never coerced to the sentinel)", () => {
    const newer = { ...clone(SESSION_FIXTURE), contractVersion: "1.1" };
    const session = readSessionEnvelope(newer);
    expect(session.intent).toBe(SESSION_FIXTURE.intent);
    expect(session.assuranceProfile).toBe(SESSION_FIXTURE.assuranceProfile);
    expect(session.status).toBe(SESSION_FIXTURE.status);
  });

  it("rejects non-string enum values instead of mapping them (only strings can be unknown)", () => {
    const newer = { ...clone(SESSION_FIXTURE), contractVersion: "1.1", intent: 42 };
    const error = expectIngestionError(() => readSessionEnvelope(newer), "VALIDATION_FAILED");
    expect(Array.isArray(error.envelope.details?.["validationErrors"])).toBe(true);
  });

  it("rejects a newer-MINOR session missing a required v1.0 field", () => {
    const newer = { ...clone(SESSION_FIXTURE), contractVersion: "1.1" };
    delete (newer as Record<string, unknown>)["intent"];
    expectIngestionError(() => readSessionEnvelope(newer), "VALIDATION_FAILED");
  });

  it("keeps exact v1.0 envelopes writer-strict (unknown fields still fail)", () => {
    const strict = { ...clone(SESSION_FIXTURE), smuggledField: "typo-or-smuggling" };
    expectIngestionError(() => readSessionEnvelope(strict), "VALIDATION_FAILED");
  });
});

describe("tolerant reading of newer-MINOR manifests (recursive projection)", () => {
  function newerManifest(): Record<string, unknown> {
    const pkg = clone(PACKAGE_FIXTURE) as unknown as Record<string, unknown>;
    pkg["contractVersion"] = "1.1";
    pkg["futurePackageField"] = "ignored";
    const assets = pkg["assets"] as Array<Record<string, unknown>>;
    const asset = assets[0]!;
    asset["futureAssetField"] = "ignored";
    asset["assetType"] = "THERMAL";
    const acquisition = asset["acquisition"] as Record<string, unknown>;
    acquisition["futureAcquisitionField"] = "ignored";
    (acquisition["geolocation"] as Record<string, unknown>)["futureGeolocationField"] = "ignored";
    (acquisition["orientation"] as Record<string, unknown>)["futureOrientationField"] = "ignored";
    (
      (acquisition["orientation"] as Record<string, unknown>)["quaternion"] as Record<string, unknown>
    )["futureQuaternionField"] = "ignored";
    return pkg;
  }

  it("drops unknown fields at every nesting level", () => {
    const pkg = readPackageEnvelope(newerManifest());

    expect("futurePackageField" in pkg).toBe(false);
    const asset = pkg.assets[0]!;
    expect("futureAssetField" in asset).toBe(false);

    const acquisition = asset.acquisition as unknown as Record<string, unknown>;
    expect("futureAcquisitionField" in acquisition).toBe(false);
    expect("futureGeolocationField" in (acquisition["geolocation"] as object)).toBe(false);
    const orientation = acquisition["orientation"] as Record<string, unknown>;
    expect("futureOrientationField" in orientation).toBe(false);
    expect("futureQuaternionField" in (orientation["quaternion"] as object)).toBe(false);

    // Known nested evidence is preserved verbatim.
    const geolocation = acquisition["geolocation"] as Record<string, number>;
    expect(geolocation["latitude"]).toBe(5.6037);
    expect(geolocation["longitude"]).toBe(-0.187);
    const quaternion = orientation["quaternion"] as Record<string, number>;
    expect(quaternion["x"]).toBe(0.01);
    expect(quaternion["w"]).toBe(0.9996);
    expect(acquisition["notes"]).toBe(PACKAGE_FIXTURE.assets[0]!.acquisition.notes);
  });

  it("maps an unknown assetType onto the sentinel and preserves member values", () => {
    const pkg = readPackageEnvelope(newerManifest());
    expect(pkg.assets[0]!.assetType).toBe(UNKNOWN_ENUM);
    expect(pkg.assets[1]!.assetType).toBe(PACKAGE_FIXTURE.assets[1]!.assetType);
  });

  it("rejects malformed known nested fields inside newer-MINOR manifests (tolerant is not lax)", () => {
    const manifest = newerManifest();
    const assets = manifest["assets"] as Array<Record<string, unknown>>;
    (assets[0]!["acquisition"] as Record<string, unknown>)["capturedAt"] = "not-a-timestamp";
    const error = expectIngestionError(() => readPackageEnvelope(manifest), "VALIDATION_FAILED");
    expect(Array.isArray(error.envelope.details?.["validationErrors"])).toBe(true);
  });
});

describe("tolerant reading of newer-MINOR upload requests", () => {
  it("drops unknown fields and keeps the single-shot envelope valid", () => {
    const newer = {
      ...clone(UPLOAD_REQUEST_FIXTURE),
      contractVersion: "1.1",
      futureUploadField: "ignored",
    };
    const envelope = readUploadRequestEnvelope(newer);
    expect("futureUploadField" in envelope).toBe(false);
    expect(envelope.contractVersion).toBe("1.0");
    expect(envelope.idempotencyKey).toBe(UPLOAD_REQUEST_FIXTURE.idempotencyKey);
  });

  it("strips unknown fields inside a (rejected later, but still projected) part descriptor", () => {
    const newer = {
      ...clone(UPLOAD_REQUEST_FIXTURE),
      contractVersion: "1.1",
      part: { index: 1, total: 2, futurePartField: "ignored" },
    };
    const envelope = readUploadRequestEnvelope(newer);
    expect(envelope.part).toEqual({ index: 1, total: 2 });
  });
});

describe("version dispatch", () => {
  it("rejects cross-MAJOR envelopes with CONTRACT_VERSION_UNSUPPORTED and the supported list", () => {
    const error = expectIngestionError(
      () => readSessionEnvelope({ ...clone(SESSION_FIXTURE), contractVersion: "2.0" }),
      "CONTRACT_VERSION_UNSUPPORTED",
    );
    expect(error.envelope.details?.["supportedVersions"]).toEqual(["1.0"]);
  });

  it("rejects malformed version strings", () => {
    expectIngestionError(
      () => readSessionEnvelope({ ...clone(SESSION_FIXTURE), contractVersion: "1" }),
      "VALIDATION_FAILED",
    );
    expectIngestionError(
      () => readSessionEnvelope({ ...clone(SESSION_FIXTURE), contractVersion: "v1.0" }),
      "VALIDATION_FAILED",
    );
  });
});

describe("reader-view equivalence with the strict v1.0 schemas", () => {
  it("routes every canonical fixture envelope through the tolerant path unchanged", () => {
    // Sending the fixtures as newer-MINOR payloads (contractVersion
    // "1.1") exercises the reader-view schemas and the projection:
    // every fixture value is a v1.0 member or v1.0-shaped, so the
    // result must equal the fixture (stamped "1.0"). This pins the
    // format regexes and enum vocabularies as equivalent to the
    // canonical ones.
    const project = readProjectEnvelope({
      ...clone(PROJECT_FIXTURE),
      contractVersion: "1.1",
    });
    expect(project).toEqual({ ...clone(PROJECT_FIXTURE), contractVersion: "1.0" });

    const session = readSessionEnvelope({
      ...clone(SESSION_FIXTURE),
      contractVersion: "1.1",
    });
    expect(session).toEqual({ ...clone(SESSION_FIXTURE), contractVersion: "1.0" });

    const pkg = readPackageEnvelope({
      ...clone(PACKAGE_FIXTURE),
      contractVersion: "1.1",
    });
    expect(pkg).toEqual({ ...clone(PACKAGE_FIXTURE), contractVersion: "1.0" });

    const upload = readUploadRequestEnvelope({
      ...clone(UPLOAD_REQUEST_FIXTURE),
      contractVersion: "1.1",
    });
    expect(upload).toEqual({ ...clone(UPLOAD_REQUEST_FIXTURE), contractVersion: "1.0" });
  });
});
