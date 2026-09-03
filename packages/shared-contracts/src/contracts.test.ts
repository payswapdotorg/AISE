/**
 * Contract validation tests: every fixture must validate against its
 * schema, typed literals must validate (TS type <-> schema
 * consistency), and negative mutations must fail. These fixtures are
 * the same files the Android side validates against (work-order
 * acceptance criterion 3).
 */
import { describe, expect, it } from "vitest";
import type {
  CapturePackage,
  CaptureSession,
  MeasurementTransport,
  ModelVersionId,
  Project,
  SyncError,
  UploadRequest,
  UploadResult,
} from "./types.js";
import {
  validateCapturePackage,
  validateCaptureSession,
  validateEpistemicState,
  validateMeasurement,
  validateModelObjectRef,
  validateModelVersion,
  validateObservationPresence,
  validateProject,
  validateSyncError,
  validateUploadRequest,
  validateUploadResult,
} from "./validate.js";
import { loadFixtureJson } from "./io.js";
import { checkCapturePackageSemantics } from "./semantics.js";
import { CONTRACT_VERSION } from "./versions.js";

function expectValid(outcome: { ok: boolean; errors: string[] }): void {
  expect(outcome.errors).toEqual([]);
  expect(outcome.ok).toBe(true);
}

function expectInvalid(outcome: { ok: boolean; errors: string[] }): void {
  expect(outcome.ok).toBe(false);
  expect(outcome.errors.length).toBeGreaterThan(0);
}

describe("fixtures validate against their schemas", () => {
  const cases: Array<[string, (payload: unknown) => { ok: boolean; errors: string[] }]> = [
    ["project.full.json", validateProject],
    ["capture-session.full.json", validateCaptureSession],
    ["capture-session.minimal.json", validateCaptureSession],
    ["capture-package.full.json", validateCapturePackage],
    ["upload-request.json", validateUploadRequest],
    ["upload-result.accepted.json", validateUploadResult],
    ["upload-result.duplicate.json", validateUploadResult],
    ["sync-error.retryable.json", validateSyncError],
    ["sync-error.fatal.json", validateSyncError],
    ["sync-error.version-unsupported.json", validateSyncError],
    ["model-version.full.json", validateModelVersion],
    ["model-object-ref.json", validateModelObjectRef],
    ["measurement.transport.full.json", validateMeasurement],
    ["measurement.transport.estimate.json", validateMeasurement],
  ];

  for (const [fixture, validator] of cases) {
    it(`${fixture} is valid`, () => {
      expectValid(validator(loadFixtureJson(fixture)));
    });
  }

  it("evidence vocabulary fixture covers both vocabulary members", () => {
    const vocabulary = loadFixtureJson("evidence-vocabulary.json") as {
      epistemicState: string;
      observationPresence: string;
    };
    expectValid(validateEpistemicState(vocabulary.epistemicState));
    expectValid(validateObservationPresence(vocabulary.observationPresence));
  });

  it("every envelope fixture declares contract version 1.0", () => {
    const envelopes = [
      "project.full.json",
      "capture-session.full.json",
      "capture-session.minimal.json",
      "capture-package.full.json",
      "upload-request.json",
      "upload-result.accepted.json",
      "upload-result.duplicate.json",
      "sync-error.retryable.json",
      "sync-error.fatal.json",
      "sync-error.version-unsupported.json",
      "model-version.full.json",
    ];
    for (const fixture of envelopes) {
      const payload = loadFixtureJson(fixture) as { contractVersion?: string };
      expect(payload.contractVersion, fixture).toBe(CONTRACT_VERSION);
    }
  });
});

describe("typed literals validate (TypeScript types match schemas)", () => {
  it("a fully-typed Project literal validates", () => {
    const project: Project = {
      contractVersion: CONTRACT_VERSION,
      projectId: "5f0c9d8e-3a47-4b21-9f6a-8c2d1e4b7a30",
      name: "Typed sample project",
      createdAt: "2026-09-01T08:30:00Z",
    };
    expectValid(validateProject(project));
  });

  it("a fully-typed CaptureSession literal validates", () => {
    const session: CaptureSession = {
      contractVersion: CONTRACT_VERSION,
      sessionId: "2d7e8f4a-1c9b-46f3-a5e8-93d2c7b0e615",
      projectId: "5f0c9d8e-3a47-4b21-9f6a-8c2d1e4b7a30",
      intent: "MAINTENANCE",
      assuranceProfile: "STANDARD",
      status: "READY",
      createdAt: "2026-09-03T07:05:00Z",
    };
    expectValid(validateCaptureSession(session));
  });

  it("a fully-typed UploadRequest/UploadResult pair validates", () => {
    const request: UploadRequest = {
      contractVersion: CONTRACT_VERSION,
      sessionId: "2d7e8f4a-1c9b-46f3-a5e8-93d2c7b0e615",
      assetId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
      idempotencyKey: "8b2e4c6a-9d0f-4e1a-b3c5-7d9e1f3a5c7e",
      contentHash: "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
      byteSize: 4825311,
    };
    const result: UploadResult = {
      contractVersion: CONTRACT_VERSION,
      assetId: request.assetId,
      outcome: "ACCEPTED",
      receivedHash: request.contentHash,
    };
    expectValid(validateUploadRequest(request));
    expectValid(validateUploadResult(result));
  });

  it("a fully-typed DUPLICATE UploadResult literal validates and identifies the original asset", () => {
    // Type-level mirror of the schema's conditional rule: the
    // DUPLICATE arm requires duplicateOf at compile time, and the
    // constructed literal validates against the schema.
    const duplicate: UploadResult = {
      contractVersion: CONTRACT_VERSION,
      assetId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
      outcome: "DUPLICATE",
      receivedHash: "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
      duplicateOf: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
    };
    expectValid(validateUploadResult(duplicate));
  });

  it("a fully-typed ModelVersionId literal validates", () => {
    const modelVersion: ModelVersionId = {
      contractVersion: CONTRACT_VERSION,
      projectId: "5f0c9d8e-3a47-4b21-9f6a-8c2d1e4b7a30",
      modelId: "3c5d7e9f-1a2b-4c3d-8e7f-9a0b1c2d3e4f",
      version: 3,
      parentVersion: 2,
    };
    expectValid(validateModelVersion(modelVersion));
  });

  it("a fully-typed SyncError literal validates", () => {
    const error: SyncError = {
      contractVersion: CONTRACT_VERSION,
      code: "RATE_LIMITED",
      message: "Typed sample error",
      retryable: true,
      retryAfterMs: 30000,
    };
    expectValid(validateSyncError(error));
  });

  it("fully-typed measurement and estimate literals validate", () => {
    const measurement: MeasurementTransport = {
      kind: "measurement",
      value: 2.417,
      unit: "m",
      uncertainty: { plusMinus: 0.008, unit: "m", type: "absolute_tolerance" },
      method: "laser_distance_meter",
    };
    const estimate: MeasurementTransport = {
      kind: "estimate",
      value: 2.4,
      unit: "m",
      confidence: 0.62,
    };
    expectValid(validateMeasurement(measurement));
    expectValid(validateMeasurement(estimate));
  });
});

describe("negative validation (writer-strict schema discipline)", () => {
  const project = loadFixtureJson("project.full.json") as Record<string, unknown>;

  it("rejects a missing required field", () => {
    const missingName = { ...project };
    delete missingName["name"];
    expectInvalid(validateProject(missingName));
  });

  it("rejects a malformed id", () => {
    expectInvalid(validateProject({ ...project, projectId: "not-a-uuid" }));
  });

  it("rejects an unknown field (typo detection)", () => {
    expectInvalid(validateProject({ ...project, nmae: "typo" }));
  });

  it("rejects a malformed timestamp", () => {
    expectInvalid(validateProject({ ...project, createdAt: "2026-09-01 08:30" }));
  });

  it("rejects an unsupported contract version", () => {
    expectInvalid(validateProject({ ...project, contractVersion: "2.0" }));
  });

  it("rejects an unknown capture intent", () => {
    const session = loadFixtureJson("capture-session.full.json") as Record<string, unknown>;
    expectInvalid(validateCaptureSession({ ...session, intent: "SPOT_CHECK" }));
  });

  it("rejects a capture package with no assets", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as Record<string, unknown>;
    expectInvalid(validateCapturePackage({ ...pkg, assets: [] }));
  });

  it("rejects path traversal in a relative path", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as {
      assets: Array<Record<string, unknown>>;
    };
    const evil = pkg.assets.map((asset, index) =>
      index === 0 ? { ...asset, relativePath: "../escape.jpg" } : asset,
    );
    expectInvalid(validateCapturePackage({ ...pkg, assets: evil }));
  });

  it("rejects an absolute path in a relative path", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as {
      assets: Array<Record<string, unknown>>;
    };
    const absolute = pkg.assets.map((asset, index) =>
      index === 0 ? { ...asset, relativePath: "/etc/passwd" } : asset,
    );
    expectInvalid(validateCapturePackage({ ...pkg, assets: absolute }));
  });

  it("rejects a non-hex content hash", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as {
      assets: Array<Record<string, unknown>>;
    };
    const hashed = pkg.assets.map((asset, index) =>
      index === 0 ? { ...asset, contentHash: "zzzz" } : asset,
    );
    expectInvalid(validateCapturePackage({ ...pkg, assets: hashed }));
  });

  it("rejects zero byte sizes", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as {
      assets: Array<Record<string, unknown>>;
    };
    const sized = pkg.assets.map((asset, index) =>
      index === 0 ? { ...asset, byteSize: 0 } : asset,
    );
    expectInvalid(validateCapturePackage({ ...pkg, assets: sized }));
  });

  it("rejects acquisition metadata without capturedAt", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as {
      assets: Array<Record<string, unknown>>;
    };
    const stripped = pkg.assets.map((asset, index) => {
      if (index !== 0) {
        return asset;
      }
      const mutated = { ...asset } as { acquisition?: Record<string, unknown> };
      delete mutated["acquisition"];
      return mutated;
    });
    expectInvalid(validateCapturePackage({ ...pkg, assets: stripped }));
  });

  it("rejects an upload request with a non-uuid idempotency key", () => {
    const request = loadFixtureJson("upload-request.json") as Record<string, unknown>;
    expectInvalid(validateUploadRequest({ ...request, idempotencyKey: "123" }));
  });

  it("rejects an upload result with an unknown outcome", () => {
    const result = loadFixtureJson("upload-result.accepted.json") as Record<string, unknown>;
    expectInvalid(validateUploadResult({ ...result, outcome: "REJECTED" }));
  });

  it("rejects a DUPLICATE upload result without duplicateOf", () => {
    // Conditional enforcement: a DUPLICATE acknowledgement must
    // identify the original logical asset (duplicateOf); without it
    // the client cannot reconcile the retried upload with the
    // already-stored asset, so the payload is invalid.
    const result = loadFixtureJson("upload-result.duplicate.json") as Record<string, unknown>;
    const mutated = { ...result };
    delete mutated["duplicateOf"];
    expectInvalid(validateUploadResult(mutated));
  });

  it("rejects a sync error with a string retryable flag", () => {
    const error = loadFixtureJson("sync-error.retryable.json") as Record<string, unknown>;
    expectInvalid(validateSyncError({ ...error, retryable: "yes" }));
  });

  it("rejects a sync error with an unknown code", () => {
    const error = loadFixtureJson("sync-error.retryable.json") as Record<string, unknown>;
    expectInvalid(validateSyncError({ ...error, code: "MYSTERY" }));
  });

  it("rejects model version 0", () => {
    const modelVersion = loadFixtureJson("model-version.full.json") as Record<string, unknown>;
    expectInvalid(validateModelVersion({ ...modelVersion, version: 0 }));
  });

  it("rejects confidence outside [0, 1]", () => {
    const estimate = loadFixtureJson("measurement.transport.estimate.json") as Record<
      string,
      unknown
    >;
    expectInvalid(validateMeasurement({ ...estimate, confidence: 1.5 }));
    expectInvalid(validateMeasurement({ ...estimate, confidence: -0.1 }));
  });

  it("rejects an estimate without a unit", () => {
    const estimate = loadFixtureJson("measurement.transport.estimate.json") as Record<
      string,
      unknown
    >;
    const unitless = { ...estimate };
    delete unitless["unit"];
    expectInvalid(validateMeasurement(unitless));
  });

  it("rejects zero/negative plus-minus uncertainty", () => {
    const measurement = loadFixtureJson("measurement.transport.full.json") as {
      uncertainty?: Record<string, unknown>;
    };
    const mutated = {
      ...measurement,
      uncertainty: { ...measurement.uncertainty, plusMinus: 0 },
    };
    expectInvalid(validateMeasurement(mutated));
  });

  it("rejects an unknown measurement kind", () => {
    const measurement = loadFixtureJson("measurement.transport.full.json") as Record<
      string,
      unknown
    >;
    expectInvalid(validateMeasurement({ ...measurement, kind: "guess" }));
  });

  it("rejects CONFIRMED_ABSENT as an observation presence value", () => {
    // Architecture-lock 2: UNKNOWN/NOT_OBSERVED/OCCLUDED must never
    // be encoded as confirmed absence; the vocabulary intentionally
    // has no such member.
    expectInvalid(validateObservationPresence("CONFIRMED_ABSENT"));
  });
});

describe("capture package semantic invariants", () => {
  it("the representative fixture passes semantics", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as CapturePackage;
    expect(checkCapturePackageSemantics(pkg)).toEqual([]);
  });

  it("totalByteSize must equal the sum of asset byte sizes", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as CapturePackage;
    const drifted = { ...pkg, totalByteSize: (pkg.totalByteSize ?? 0) + 1 };
    const issues = checkCapturePackageSemantics(drifted);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("totalByteSize");
  });

  it("duplicate asset ids are reported", () => {
    const pkg = loadFixtureJson("capture-package.full.json") as CapturePackage;
    const duplicated: CapturePackage = {
      ...pkg,
      assets: [pkg.assets[0]!, { ...pkg.assets[1]!, assetId: pkg.assets[0]!.assetId }],
    };
    const issues = checkCapturePackageSemantics(duplicated);
    expect(issues.some((issue) => issue.field.endsWith("assetId"))).toBe(true);
  });
});
