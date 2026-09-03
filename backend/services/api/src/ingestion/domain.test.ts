/**
 * Unit tests for the ingestion protocol invariants and the in-memory
 * capture store's composite (transaction-shaped) operations.
 *
 * These prove at the unit level:
 * - IDEMPOTENCY_CONFLICT can never be constructed retryable;
 * - every emitted error envelope satisfies the AISE-003 sync-error
 *   contract (validated with the shared-contracts validator);
 * - store operations implement create-if-absent, idempotency-key and
 *   per-asset uniqueness, and never mutate committed records.
 */
import { describe, expect, it } from "vitest";
import { validateSyncError, type CaptureSession, type Project } from "@aise/shared-contracts";
import { IngestionError } from "./errors.js";
import { createInMemoryCaptureStore, type UploadRecord } from "./store.js";
import type { AcquisitionMetadata } from "@aise/shared-contracts";

const project: Project = {
  contractVersion: "1.0",
  projectId: "5f0c9d8e-3a47-4b21-9f6a-8c2d1e4b7a30",
  name: "Unit test project",
  createdAt: "2026-09-01T08:30:00Z",
};

const session: CaptureSession = {
  contractVersion: "1.0",
  sessionId: "2d7e8f4a-1c9b-46f3-a5e8-93d2c7b0e615",
  projectId: project.projectId,
  intent: "AS_BUILT",
  assuranceProfile: "HIGH_ASSURANCE",
  status: "READY",
  createdAt: "2026-09-03T07:05:00Z",
};

const acquisition: AcquisitionMetadata = { capturedAt: "2026-09-03T07:12:31Z" };

function uploadRecord(overrides: Partial<UploadRecord> = {}): UploadRecord {
  return {
    sessionId: session.sessionId,
    assetId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
    packageId: "9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    idempotencyKey: "8b2e4c6a-9d0f-4e1a-b3c5-7d9e1f3a5c7e",
    contentHash: "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
    byteSize: 6,
    receivedHash: "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
    receivedAt: "2026-09-03T08:00:00Z",
    mimeType: undefined,
    acquisition,
    payload: Buffer.from("evidence"),
    ...overrides,
  };
}

describe("IngestionError contract invariants", () => {
  it("IDEMPOTENCY_CONFLICT cannot be constructed as retryable", () => {
    expect(() => {
      new IngestionError("IDEMPOTENCY_CONFLICT", "conflict", { retryable: true });
    }).toThrow(/must never be constructed as retryable/);
  });

  it("every code it can emit produces a sync-error-valid envelope", () => {
    const codes = [
      "VALIDATION_FAILED",
      "PROJECT_NOT_FOUND",
      "SESSION_NOT_FOUND",
      "ASSET_NOT_FOUND",
      "IDEMPOTENCY_CONFLICT",
      "CHECKSUM_MISMATCH",
      "PAYLOAD_TOO_LARGE",
      "CONTRACT_VERSION_UNSUPPORTED",
      "SERVER_ERROR",
    ] as const;
    for (const code of codes) {
      const error = new IngestionError(code, `unit test message for ${code}`, {
        details: { code },
      });
      const outcome = validateSyncError(error.envelope);
      expect(outcome.errors, code).toEqual([]);
      expect(outcome.ok, code).toBe(true);
      expect(error.envelope.code).toBe(code);
    }
  });

  it("conflict and validation failures are non-retryable; checksum mismatch is retryable with delay", () => {
    const conflict = new IngestionError("IDEMPOTENCY_CONFLICT", "conflict");
    expect(conflict.envelope.retryable).toBe(false);
    expect(conflict.status).toBe(409);

    const validation = new IngestionError("VALIDATION_FAILED", "invalid");
    expect(validation.envelope.retryable).toBe(false);
    expect(validation.status).toBe(400);

    const checksum = new IngestionError("CHECKSUM_MISMATCH", "corrupt");
    expect(checksum.envelope.retryable).toBe(true);
    expect(checksum.envelope.retryAfterMs).toBeDefined();
    expect(checksum.status).toBe(422);
  });
});

describe("in-memory capture store", () => {
  it("createProject/createSession are create-if-absent with identical/conflict results", () => {
    const store = createInMemoryCaptureStore();
    expect(store.createProject(project).status).toBe("created");
    expect(store.createProject({ ...project }).status).toBe("exists_identical");
    expect(store.createProject({ ...project, name: "different" }).status).toBe("exists_conflict");
    expect(store.getProject(project.projectId)).toBeDefined();

    expect(store.createSession(session).status).toBe("created");
    expect(store.createSession({ ...session }).status).toBe("exists_identical");
    expect(store.createSession({ ...session, intent: "INSPECTION" }).status).toBe("exists_conflict");
  });

  it("registerPackage reports asset conflicts across packages of one session", () => {
    const store = createInMemoryCaptureStore();
    store.createProject(project);
    store.createSession(session);

    const first = {
      contractVersion: "1.0",
      packageId: "11111111-1111-4111-8111-111111111111",
      sessionId: session.sessionId,
      projectId: project.projectId,
      createdAt: "2026-09-03T07:40:00Z",
      checksumAlgorithm: "sha256" as const,
      assets: [
        {
          assetId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
          assetType: "PHOTO" as const,
          relativePath: "photos/IMG_0001.jpg",
          contentHash: "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
          byteSize: 6,
          acquisition,
        },
      ],
    };
    expect(store.registerPackage(first).status).toBe("created");

    const second = {
      ...first,
      packageId: "22222222-2222-4222-8222-222222222222",
      assets: [
        {
          ...first.assets[0]!,
          relativePath: "photos/OTHER.jpg",
        },
      ],
    };
    const result = store.registerPackage(second);
    expect(result.status).toBe("asset_conflict");
    expect(result.conflictingAssetIds).toContain("1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b");
  });

  it("commitUpload is once-only per idempotency key and per logical asset", () => {
    const store = createInMemoryCaptureStore();
    const record = uploadRecord();
    expect(store.commitUpload(record).status).toBe("committed");

    // Same key, same asset (a full duplicate commit attempt):
    expect(store.commitUpload(uploadRecord()).status).toBe("already_present");

    // Same key, different asset:
    expect(
      store.commitUpload(uploadRecord({ assetId: "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c" })).status,
    ).toBe("already_present");

    // Different key, same asset:
    expect(
      store.commitUpload(uploadRecord({ idempotencyKey: "0c1d2e3f-4a5b-46c7-8d9e-0f1a2b3c4d5e" }))
        .status,
    ).toBe("already_present");
  });

  it("committed records are never mutated by later store operations", () => {
    const store = createInMemoryCaptureStore();
    const record = uploadRecord();
    store.commitUpload(record);

    store.commitUpload(uploadRecord()); // already present
    store.replaceSession({ ...session, status: "COMPLETED", updatedAt: "2026-09-03T09:00:00Z" });

    const stored = store.findUploadByAsset(session.sessionId, record.assetId);
    expect(stored).toEqual(record);
    expect(store.findUploadByIdempotencyKey(record.idempotencyKey)).toEqual(record);
  });

  it("sessionIngestion summarizes packages, assets and received bytes", () => {
    const store = createInMemoryCaptureStore();
    store.createProject(project);
    store.createSession(session);
    const pkg = {
      contractVersion: "1.0",
      packageId: "11111111-1111-4111-8111-111111111111",
      sessionId: session.sessionId,
      projectId: project.projectId,
      createdAt: "2026-09-03T07:40:00Z",
      checksumAlgorithm: "sha256" as const,
      assets: [
        {
          assetId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
          assetType: "PHOTO" as const,
          relativePath: "photos/IMG_0001.jpg",
          contentHash: "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
          byteSize: 6,
          acquisition,
        },
        {
          assetId: "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c",
          assetType: "METADATA" as const,
          relativePath: "metadata/session.json",
          contentHash: "f7a28a39396c14dfbb1d56edca817fe7e1a234ba1c1fc4233a060db4a7f0c24d",
          byteSize: 9,
          acquisition,
        },
      ],
    };
    store.registerPackage(pkg);
    store.commitUpload(uploadRecord());

    const ingestion = store.sessionIngestion(session.sessionId);
    expect(ingestion.declaredAssets).toBe(2);
    expect(ingestion.acceptedAssets).toBe(1);
    expect(ingestion.receivedBytes).toBe(6);
    expect(ingestion.packages).toHaveLength(1);
    expect(ingestion.packages[0]?.packageId).toBe(pkg.packageId);
    expect(ingestion.packages[0]?.acceptedAssets).toBe(1);
  });
});
