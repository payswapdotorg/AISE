/**
 * Contract consumer test for the API service (AISE-003, explicitly
 * assigned backend consumer validation).
 *
 * The API service is the future capture gateway (AISE-004). These
 * tests prove the Z.ai backend consumes and validates the exact same
 * schema/fixture set the Android side validates against (work-order
 * acceptance criterion 3), and that the interchange invariants it
 * will rely on are machine-checked:
 *
 * - capture package manifests validate structurally and semantically;
 * - upload request/result fixtures validate, and idempotency
 *   semantics are as documented (DUPLICATE is a success outcome;
 *   IDEMPOTENCY_CONFLICT is a halt);
 * - sync errors carry authoritative retry data;
 * - envelope contract versions are supported.
 */
import { describe, expect, it } from "vitest";
import {
  checkCapturePackageSemantics,
  isSupportedContractVersion,
  loadFixtureJson,
  readContractVersion,
  syncRetryDecision,
  type CapturePackage,
  type SyncError,
  type UploadResult,
  validateCapturePackage,
  validateSyncError,
  validateUploadRequest,
  validateUploadResult,
} from "@aise/shared-contracts";

describe("capture gateway consumes capture package fixtures", () => {
  it("the representative manifest validates structurally", () => {
    const outcome = validateCapturePackage(loadFixtureJson("capture-package.full.json"));
    expect(outcome.errors).toEqual([]);
    expect(outcome.ok).toBe(true);
  });

  it("the representative manifest passes cross-field semantics", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as CapturePackage;
    expect(checkCapturePackageSemantics(pkg)).toEqual([]);
    expect(pkg.assets.length).toBeGreaterThan(0);
  });

  it("a manifest with a drifted totalByteSize is rejected by semantics", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as CapturePackage;
    const drifted: CapturePackage = { ...pkg, totalByteSize: (pkg.totalByteSize ?? 0) + 1 };
    expect(checkCapturePackageSemantics(drifted).length).toBeGreaterThan(0);
  });
});

describe("capture gateway consumes upload fixtures", () => {
  it("the upload request fixture validates", () => {
    const outcome = validateUploadRequest(loadFixtureJson("upload-request.json"));
    expect(outcome.errors).toEqual([]);
    expect(outcome.ok).toBe(true);
  });

  it("accepted and duplicate results are both successful outcomes", () => {
    const accepted = validateUploadResult(loadFixtureJson("upload-result.accepted.json"));
    const duplicate = validateUploadResult(loadFixtureJson("upload-result.duplicate.json"));
    expect(accepted.ok).toBe(true);
    expect(duplicate.ok).toBe(true);

    const duplicatePayload = loadFixtureJson("upload-result.duplicate.json") as UploadResult;
    // AC-012: a retried logical upload never creates a second asset.
    expect(duplicatePayload.outcome).toBe("DUPLICATE");
    expect(duplicatePayload.duplicateOf).toBeDefined();
  });
});

describe("capture gateway consumes sync error fixtures", () => {
  it("all sync error fixtures validate", () => {
    for (const fixture of [
      "sync-error.retryable.json",
      "sync-error.fatal.json",
      "sync-error.version-unsupported.json",
    ]) {
      const outcome = validateSyncError(loadFixtureJson(fixture));
      expect(outcome.ok, fixture).toBe(true);
    }
  });

  it("retry decisions come from error data fields", () => {
    const retryable = loadFixtureJson("sync-error.retryable.json") as SyncError;
    const fatal = loadFixtureJson("sync-error.fatal.json") as SyncError;
    expect(syncRetryDecision(retryable)).toBe("retry_after");
    expect(syncRetryDecision(fatal)).toBe("halt");
  });

  it("an idempotency conflict halts rather than retries", () => {
    const conflict = loadFixtureJson("sync-error.fatal.json") as SyncError;
    expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(conflict.retryable).toBe(false);
    expect(syncRetryDecision(conflict)).toBe("halt");
  });

  it("version negotiation reports the supported versions", () => {
    const unsupported = loadFixtureJson("sync-error.version-unsupported.json") as SyncError;
    expect(unsupported.code).toBe("CONTRACT_VERSION_UNSUPPORTED");
    const supported = unsupported.details?.["supportedVersions"];
    expect(Array.isArray(supported)).toBe(true);
    for (const version of (supported as string[] | undefined) ?? []) {
      expect(isSupportedContractVersion(version)).toBe(true);
    }
  });
});

describe("envelope version dispatch", () => {
  it("every fixture the gateway consumes declares a supported contract version", () => {
    const envelopes = [
      "capture-package.full.json",
      "upload-request.json",
      "upload-result.accepted.json",
      "upload-result.duplicate.json",
      "sync-error.retryable.json",
      "sync-error.fatal.json",
      "sync-error.version-unsupported.json",
    ];
    for (const fixture of envelopes) {
      const version = readContractVersion(loadFixtureJson(fixture));
      expect(version, fixture).not.toBeNull();
      expect(isSupportedContractVersion(version as string), fixture).toBe(true);
    }
  });
});
