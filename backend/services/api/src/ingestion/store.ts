/**
 * Capture ingestion store (AISE-004).
 *
 * This is the API's ingestion-boundary state: registered project and
 * session identities, capture-package manifests, and committed
 * logical uploads with their raw-evidence records. It is explicitly
 * NOT the canonical Reality Graph (AISE-011) and not a second
 * engineering-model authority — it never derives model state, only
 * records what was ingested.
 *
 * Persistence strategy: an in-memory implementation behind a narrow
 * interface of composite (transaction-shaped) operations, following
 * the AISE-001 in-memory JobQueue placeholder precedent. Durable
 * ingestion storage is deferred; when it arrives it must preserve
 * these operation semantics (create-if-absent, idempotency key
 * uniqueness, per-asset upload uniqueness).
 *
 * Immutability: committed `UploadRecord`s are never mutated by any
 * store operation; retries and new keys for an already-committed
 * asset leave the original record untouched.
 */
import type { AcquisitionMetadata, Project } from "@aise/shared-contracts";
import type { ReaderCapturePackage, ReaderCaptureSession, ReaderPackageAsset } from "./validation.js";

/**
 * Immutable raw-evidence record for one committed logical upload.
 * `acquisition` is enum-free in v1.0, so the strict contract type is
 * exact here; only session/package envelopes carry enum surfaces that
 * can hold the cross-MINOR reader sentinel.
 */
export interface UploadRecord {
  readonly sessionId: string;
  readonly assetId: string;
  readonly packageId: string;
  readonly idempotencyKey: string;
  /** Declared content hash (verified equal to the received hash at commit). */
  readonly contentHash: string;
  readonly byteSize: number;
  /** Server-computed SHA-256 of the stored payload bytes. */
  readonly receivedHash: string;
  /** RFC 3339 timestamp recorded when the upload was accepted. */
  readonly receivedAt: string;
  readonly mimeType: string | undefined;
  /** Acquisition metadata preserved verbatim from the package manifest. */
  readonly acquisition: AcquisitionMetadata;
  /** Raw evidence bytes (in-memory placeholder for durable object storage). */
  readonly payload: Buffer;
}

/** Ingestion summary for one capture session (read model). */
export interface SessionIngestion {
  readonly packages: ReadonlyArray<{
    readonly packageId: string;
    readonly declaredAssets: number;
    readonly acceptedAssets: number;
  }>;
  readonly declaredAssets: number;
  readonly acceptedAssets: number;
  readonly receivedBytes: number;
}

export interface CreateResult {
  readonly status: "created" | "exists_identical" | "exists_conflict";
}

export interface RegisterPackageResult {
  readonly status: "created" | "exists_identical" | "exists_conflict" | "asset_conflict";
  /** Asset ids already declared for the session by another package. */
  readonly conflictingAssetIds?: readonly string[];
}

export interface CommitUploadResult {
  readonly status: "committed" | "already_present";
}

export interface DeclaredAsset {
  readonly asset: ReaderPackageAsset;
  readonly packageId: string;
}

/** Composite (transaction-shaped) operations on ingestion state. */
export interface CaptureStore {
  /** Stable description for observability (e.g. readiness reporting). */
  readonly kind: string;
  /** RFC 3339 timestamp provider used for `receivedAt` stamps. */
  now(): string;

  getProject(projectId: string): Project | undefined;
  createProject(project: Project): CreateResult;

  getSession(sessionId: string): ReaderCaptureSession | undefined;
  createSession(session: ReaderCaptureSession): CreateResult;
  /** Replaces the stored session envelope (identity fields validated by the caller). */
  replaceSession(session: ReaderCaptureSession): void;

  getPackage(packageId: string): ReaderCapturePackage | undefined;
  registerPackage(pkg: ReaderCapturePackage): RegisterPackageResult;
  /** Finds an asset declaration for a session across all registered packages. */
  findDeclaredAsset(sessionId: string, assetId: string): DeclaredAsset | undefined;

  findUploadByIdempotencyKey(idempotencyKey: string): UploadRecord | undefined;
  findUploadByAsset(sessionId: string, assetId: string): UploadRecord | undefined;
  /** Records the first commit for a logical upload; never overwrites. */
  commitUpload(record: UploadRecord): CommitUploadResult;

  sessionIngestion(sessionId: string): SessionIngestion;
}

export interface InMemoryCaptureStoreOptions {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
}

function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => jsonEquals(item, b[index]));
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  return aKeys.every((key) => jsonEquals(aRecord[key], bRecord[key]));
}

function assetKey(sessionId: string, assetId: string): string {
  return `${sessionId}/${assetId}`;
}

/**
 * Creates an in-memory capture store. State is process-local and is
 * lost on restart — a documented v1.0 limitation, not a durability
 * claim.
 */
export function createInMemoryCaptureStore(
  options: InMemoryCaptureStoreOptions = {},
): CaptureStore {
  const projects = new Map<string, Project>();
  const sessions = new Map<string, ReaderCaptureSession>();
  const packages = new Map<string, ReaderCapturePackage>();
  /** sessionId → ordered package ids registered for that session. */
  const sessionPackages = new Map<string, string[]>();
  /** sessionId → assetId → declaring packageId. */
  const declaredAssets = new Map<string, Map<string, string>>();
  const uploadsByKey = new Map<string, UploadRecord>();
  const uploadsByAsset = new Map<string, UploadRecord>();
  const now = options.now ?? (() => new Date().toISOString());

  function createIfAbsent<T>(
    map: Map<string, T>,
    id: string,
    value: T,
  ): CreateResult {
    const existing = map.get(id);
    if (existing === undefined) {
      map.set(id, value);
      return { status: "created" };
    }
    return jsonEquals(existing, value) ? { status: "exists_identical" } : { status: "exists_conflict" };
  }

  return {
    kind: "memory",

    now,

    getProject: (projectId) => projects.get(projectId),

    createProject: (project) => createIfAbsent(projects, project.projectId, project),

    getSession: (sessionId) => sessions.get(sessionId),

    createSession: (session) => createIfAbsent(sessions, session.sessionId, session),

    replaceSession: (session) => {
      sessions.set(session.sessionId, session);
    },

    getPackage: (packageId) => packages.get(packageId),

    registerPackage: (pkg) => {
      const existing = packages.get(pkg.packageId);
      if (existing !== undefined) {
        return jsonEquals(existing, pkg)
          ? { status: "exists_identical" }
          : { status: "exists_conflict" };
      }

      const sessionAssetIndex =
        declaredAssets.get(pkg.sessionId) ?? new Map<string, string>();
      const conflictingAssetIds = pkg.assets
        .map((asset) => asset.assetId)
        .filter((assetId) => sessionAssetIndex.has(assetId));
      if (conflictingAssetIds.length > 0) {
        return { status: "asset_conflict", conflictingAssetIds };
      }

      packages.set(pkg.packageId, pkg);
      for (const asset of pkg.assets) {
        sessionAssetIndex.set(asset.assetId, pkg.packageId);
      }
      declaredAssets.set(pkg.sessionId, sessionAssetIndex);
      const registered = sessionPackages.get(pkg.sessionId) ?? [];
      registered.push(pkg.packageId);
      sessionPackages.set(pkg.sessionId, registered);
      return { status: "created" };
    },

    findDeclaredAsset: (sessionId, assetId) => {
      const packageId = declaredAssets.get(sessionId)?.get(assetId);
      if (packageId === undefined) {
        return undefined;
      }
      const pkg = packages.get(packageId);
      const asset = pkg?.assets.find((candidate) => candidate.assetId === assetId);
      if (pkg === undefined || asset === undefined) {
        return undefined;
      }
      return { asset, packageId };
    },

    findUploadByIdempotencyKey: (idempotencyKey) => uploadsByKey.get(idempotencyKey),

    findUploadByAsset: (sessionId, assetId) =>
      uploadsByAsset.get(assetKey(sessionId, assetId)),

    commitUpload: (record) => {
      const key = assetKey(record.sessionId, record.assetId);
      if (uploadsByKey.has(record.idempotencyKey) || uploadsByAsset.has(key)) {
        return { status: "already_present" };
      }
      uploadsByKey.set(record.idempotencyKey, record);
      uploadsByAsset.set(key, record);
      return { status: "committed" };
    },

    sessionIngestion: (sessionId) => {
      const registeredPackageIds = sessionPackages.get(sessionId) ?? [];
      const packageSummaries = registeredPackageIds.map((packageId) => {
        const pkg = packages.get(packageId);
        const declared = pkg?.assets ?? [];
        const accepted = declared.filter(
          (asset) => uploadsByAsset.has(assetKey(sessionId, asset.assetId)),
        ).length;
        return {
          packageId,
          declaredAssets: declared.length,
          acceptedAssets: accepted,
        };
      });

      let receivedBytes = 0;
      for (const [key, record] of uploadsByAsset) {
        if (key.startsWith(`${sessionId}/`)) {
          receivedBytes += record.byteSize;
        }
      }

      return {
        packages: packageSummaries,
        declaredAssets: packageSummaries.reduce((sum, entry) => sum + entry.declaredAssets, 0),
        acceptedAssets: packageSummaries.reduce((sum, entry) => sum + entry.acceptedAssets, 0),
        receivedBytes,
      };
    },
  };
}
