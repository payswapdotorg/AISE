/**
 * Capture ingestion handlers (AISE-004) — the domain logic behind
 * each /v1 endpoint.
 *
 * Every handler is synchronous after request parsing: the
 * check-then-commit sections run without awaits, so on the
 * single-threaded event loop they are atomic and concurrent
 * identical uploads cannot interleave between the idempotency check
 * and the commit.
 *
 * Contract invariants implemented here (work-order "critical
 * idempotency rules"):
 * - same logical upload key + same content hash  → `DUPLICATE` with
 *   `duplicateOf` identifying the original asset (never a second
 *   logical asset, never a mutation of the committed record);
 * - same key + different content hash → `IDEMPOTENCY_CONFLICT`,
 *   non-retryable (enforced structurally in errors.ts);
 * - retry decisions come only from `retryable`/`retryAfterMs` data;
 * - a failed upload consumes nothing: only committed uploads are
 *   indexed by idempotency key, so a checksum failure leaves the key
 *   free for a corrected retry;
 * - manifests are validated structurally AND against the AISE-003
 *   cross-field semantics before any asset may upload;
 * - invalid or ambiguous ingestion never creates state.
 */
import { createHash } from "node:crypto";
import type { Logger } from "@aise/backend-logging";
import {
  CONTRACT_VERSION,
  checkCapturePackageSemantics,
  type CaptureSession,
  type Project,
  type UploadRequest,
  type UploadResult,
} from "@aise/shared-contracts";
import { IngestionError } from "./errors.js";
import { DEFAULT_INGESTION_LIMITS, type IngestionLimits } from "./limits.js";
import type { CaptureStore, DeclaredAsset, UploadRecord } from "./store.js";
import {
  readPackageEnvelope,
  readProjectEnvelope,
  readSessionEnvelope,
  readUploadRequestEnvelope,
} from "./validation.js";

export interface HandlerDeps {
  readonly store: CaptureStore;
  readonly logger: Logger;
  readonly limits?: IngestionLimits;
}

export interface IngestionResponse {
  readonly status: number;
  readonly body: unknown;
  readonly location?: string;
}

/** Session lifecycle order for transition validation. */
const SESSION_STATUS_ORDER: Readonly<Record<CaptureSession["status"], number>> = {
  DRAFT: 0,
  READY: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
};

/** Immutable session identity fields. */
const SESSION_IMMUTABLE_FIELDS: readonly (keyof CaptureSession)[] = [
  "projectId",
  "intent",
  "assuranceProfile",
  "createdAt",
];

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function equalJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortJson(a)) === JSON.stringify(sortJson(b));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortJson(record[key])]),
    );
  }
  return value;
}

/** POST /v1/projects — register a project identity. */
export function createProject(deps: HandlerDeps, raw: unknown): IngestionResponse {
  const project: Project = readProjectEnvelope(raw);
  const result = deps.store.createProject(project);
  if (result.status === "exists_conflict") {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `project ${project.projectId} is already registered with different content`,
      { details: { projectId: project.projectId }, status: 409 },
    );
  }
  deps.logger.info("ingestion.project_created", { projectId: project.projectId });
  return {
    status: result.status === "created" ? 201 : 200,
    body: project,
    location: `/v1/projects/${project.projectId}`,
  };
}

/** GET /v1/projects/{projectId} — read a registered project. */
export function getProject(deps: HandlerDeps, projectId: string): IngestionResponse {
  const project = deps.store.getProject(projectId);
  if (project === undefined) {
    throw new IngestionError("PROJECT_NOT_FOUND", `project ${projectId} is not registered`);
  }
  return { status: 200, body: project };
}

/** POST /v1/sessions — register a capture session under a project. */
export function createSession(deps: HandlerDeps, raw: unknown): IngestionResponse {
  const session = readSessionEnvelope(raw);
  if (deps.store.getProject(session.projectId) === undefined) {
    throw new IngestionError(
      "PROJECT_NOT_FOUND",
      `project ${session.projectId} referenced by the capture session is not registered`,
      { details: { projectId: session.projectId } },
    );
  }
  const result = deps.store.createSession(session);
  if (result.status === "exists_conflict") {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `capture session ${session.sessionId} is already registered with different content`,
      { details: { sessionId: session.sessionId }, status: 409 },
    );
  }
  deps.logger.info("ingestion.session_created", {
    sessionId: session.sessionId,
    projectId: session.projectId,
  });
  return {
    status: result.status === "created" ? 201 : 200,
    body: session,
    location: `/v1/sessions/${session.sessionId}`,
  };
}

/** GET /v1/sessions/{sessionId} — session envelope plus ingestion summary. */
export function getSession(deps: HandlerDeps, sessionId: string): IngestionResponse {
  const session = deps.store.getSession(sessionId);
  if (session === undefined) {
    throw new IngestionError("SESSION_NOT_FOUND", `capture session ${sessionId} is not registered`);
  }
  return {
    status: 200,
    body: { session, ingestion: deps.store.sessionIngestion(sessionId) },
  };
}

/** PUT /v1/sessions/{sessionId} — maintain session lifecycle state. */
export function updateSession(
  deps: HandlerDeps,
  urlSessionId: string,
  raw: unknown,
): IngestionResponse {
  const session = readSessionEnvelope(raw);
  if (session.sessionId !== urlSessionId) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "session id in the request path does not match the envelope sessionId",
      { details: { pathSessionId: urlSessionId, envelopeSessionId: session.sessionId } },
    );
  }

  const existing = deps.store.getSession(urlSessionId);
  if (existing === undefined) {
    throw new IngestionError(
      "SESSION_NOT_FOUND",
      `capture session ${urlSessionId} is not registered`,
    );
  }

  const changedImmutable = SESSION_IMMUTABLE_FIELDS.filter(
    (field) => !equalJson(existing[field], session[field]),
  );
  if (changedImmutable.length > 0) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `immutable capture session fields cannot change: ${changedImmutable.join(", ")}`,
      { details: { fields: [...changedImmutable] } },
    );
  }

  if (SESSION_STATUS_ORDER[session.status] < SESSION_STATUS_ORDER[existing.status]) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `capture session status cannot transition backwards from ${existing.status} to ${session.status}`,
      { details: { from: existing.status, to: session.status } },
    );
  }

  deps.store.replaceSession(session);
  deps.logger.info("ingestion.session_updated", {
    sessionId: session.sessionId,
    status: session.status,
  });
  return { status: 200, body: session };
}

/** POST /v1/packages — register a capture package manifest. */
export function registerPackage(deps: HandlerDeps, raw: unknown): IngestionResponse {
  const pkg = readPackageEnvelope(raw);

  const semanticIssues = checkCapturePackageSemantics(pkg);
  if (semanticIssues.length > 0) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "capture package manifest violates cross-field invariants",
      {
        details: {
          issues: semanticIssues.map((issue) => ({
            field: issue.field,
            message: issue.message,
          })),
        },
      },
    );
  }

  const session = deps.store.getSession(pkg.sessionId);
  if (session === undefined) {
    throw new IngestionError(
      "SESSION_NOT_FOUND",
      `capture session ${pkg.sessionId} referenced by the package is not registered`,
      { details: { sessionId: pkg.sessionId } },
    );
  }
  if (session.projectId !== pkg.projectId) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "capture package projectId does not match its capture session",
      { details: { sessionProjectId: session.projectId, packageProjectId: pkg.projectId } },
    );
  }

  const result = deps.store.registerPackage(pkg);
  if (result.status === "exists_conflict") {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `capture package ${pkg.packageId} is already registered with different content`,
      { details: { packageId: pkg.packageId }, status: 409 },
    );
  }
  if (result.status === "asset_conflict") {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "assets in this package are already declared for the session by another package",
      { details: { conflictingAssetIds: [...(result.conflictingAssetIds ?? [])] } },
    );
  }

  deps.logger.info("ingestion.package_registered", {
    packageId: pkg.packageId,
    sessionId: pkg.sessionId,
    assets: pkg.assets.length,
  });
  return {
    status: result.status === "created" ? 201 : 200,
    body: pkg,
    location: `/v1/packages/${pkg.packageId}`,
  };
}

/** POST /v1/uploads — receive one logical upload (envelope + bytes). */
export function uploadAsset(
  deps: HandlerDeps,
  rawEnvelope: unknown,
  payload: Buffer,
): IngestionResponse {
  const envelope: UploadRequest = readUploadRequestEnvelope(rawEnvelope);
  const { store } = deps;

  const maxUploadBytes = (deps.limits ?? DEFAULT_INGESTION_LIMITS).maxUploadBytes;
  if (envelope.byteSize > maxUploadBytes) {
    throw new IngestionError(
      "PAYLOAD_TOO_LARGE",
      `upload declares ${envelope.byteSize} bytes which exceeds the ${maxUploadBytes} byte payload limit`,
    );
  }


  const session = store.getSession(envelope.sessionId);
  if (session === undefined) {
    throw new IngestionError(
      "SESSION_NOT_FOUND",
      `capture session ${envelope.sessionId} referenced by the upload is not registered`,
      { details: { sessionId: envelope.sessionId } },
    );
  }

  const declared = store.findDeclaredAsset(envelope.sessionId, envelope.assetId);
  if (declared === undefined) {
    throw new IngestionError(
      "ASSET_NOT_FOUND",
      `asset ${envelope.assetId} is not declared by any registered capture package for session ${envelope.sessionId}`,
      { details: { assetId: envelope.assetId, sessionId: envelope.sessionId } },
    );
  }

  // v1.0 transfers are single-shot; the `part` descriptor belongs to
  // the future resumable contract revision (AISE-006) and is refused.
  if (envelope.part !== undefined) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "multi-part transfers are not supported by this gateway version",
      { details: { supported: "single-shot" } },
    );
  }

  // Idempotency is checked from envelope data before byte
  // verification: the conflict rules are defined on the declared
  // key/hash binding (AISE-003 upload-request semantics).
  const byKey = store.findUploadByIdempotencyKey(envelope.idempotencyKey);
  if (byKey !== undefined) {
    if (byKey.contentHash !== envelope.contentHash) {
      throw new IngestionError(
        "IDEMPOTENCY_CONFLICT",
        "idempotency key is already committed with a different content hash",
        { details: { idempotencyKey: envelope.idempotencyKey, reason: "content_hash_mismatch" } },
      );
    }
    if (byKey.sessionId !== envelope.sessionId || byKey.assetId !== envelope.assetId) {
      throw new IngestionError(
        "IDEMPOTENCY_CONFLICT",
        "idempotency key is bound to a different logical asset",
        { details: { idempotencyKey: envelope.idempotencyKey, reason: "logical_asset_mismatch" } },
      );
    }
    // Same key, same hash, same logical asset: duplicate path —
    // fall through to byte verification, then answer DUPLICATE.
  }

  // Manifest consistency: the upload must match the pre-declared
  // manifest entry before any state can be accepted.
  if (declared.asset.contentHash !== envelope.contentHash) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "upload content hash does not match the declared package manifest entry",
      {
        details: {
          assetId: envelope.assetId,
          manifestContentHash: declared.asset.contentHash,
          uploadContentHash: envelope.contentHash,
        },
      },
    );
  }
  if (declared.asset.byteSize !== envelope.byteSize) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "upload byteSize does not match the declared package manifest entry",
      {
        details: {
          assetId: envelope.assetId,
          manifestByteSize: declared.asset.byteSize,
          uploadByteSize: envelope.byteSize,
        },
      },
    );
  }

  // Byte verification (applies to fresh uploads and retries alike).
  if (payload.length !== envelope.byteSize) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "payload byte length does not match the declared byteSize",
      {
        details: { expectedByteSize: envelope.byteSize, receivedBytes: payload.length },
      },
    );
  }
  const receivedHash = sha256Hex(payload);
  if (receivedHash !== envelope.contentHash) {
    throw new IngestionError(
      "CHECKSUM_MISMATCH",
      "payload content hash does not match the declared content hash",
      {
        details: {
          declaredHash: envelope.contentHash,
          receivedHash,
        },
      },
    );
  }

  if (byKey !== undefined) {
    // Completed retry of the same logical upload: success outcome,
    // no second logical asset, committed record untouched.
    deps.logger.info("ingestion.upload_duplicate", {
      sessionId: envelope.sessionId,
      assetId: envelope.assetId,
      idempotencyKey: envelope.idempotencyKey,
    });
    const body: UploadResult = {
      contractVersion: CONTRACT_VERSION,
      assetId: envelope.assetId,
      outcome: "DUPLICATE",
      receivedHash: byKey.receivedHash,
      duplicateOf: byKey.assetId,
      note: `logical upload already received under idempotency key ${envelope.idempotencyKey}`,
    };
    return { status: 200, body };
  }

  const byAsset = store.findUploadByAsset(envelope.sessionId, envelope.assetId);
  if (byAsset !== undefined) {
    // A new key for an already-committed asset: the gateway answer is
    // a success DUPLICATE identifying the original logical asset.
    // Rationale (documented decision): the outcome vocabulary has two
    // success outcomes; this path must not create a second logical
    // asset and must not mutate the immutable evidence record.
    deps.logger.info("ingestion.upload_duplicate", {
      sessionId: envelope.sessionId,
      assetId: envelope.assetId,
      idempotencyKey: envelope.idempotencyKey,
      originalIdempotencyKey: byAsset.idempotencyKey,
    });
    const body: UploadResult = {
      contractVersion: CONTRACT_VERSION,
      assetId: envelope.assetId,
      outcome: "DUPLICATE",
      receivedHash: byAsset.receivedHash,
      duplicateOf: byAsset.assetId,
      note: `asset already received under idempotency key ${byAsset.idempotencyKey}`,
    };
    return { status: 200, body };
  }

  const record: UploadRecord = {
    sessionId: envelope.sessionId,
    assetId: envelope.assetId,
    packageId: declared.packageId,
    idempotencyKey: envelope.idempotencyKey,
    contentHash: envelope.contentHash,
    byteSize: envelope.byteSize,
    receivedHash,
    receivedAt: store.now(),
    mimeType: declared.asset.mimeType,
    acquisition: declared.asset.acquisition,
    payload,
  };
  const commit = store.commitUpload(record);
  if (commit.status === "already_present") {
    // Defensive: the pre-checks above make this unreachable on the
    // single-threaded loop; treat any occurrence as a duplicate.
    const existing = store.findUploadByAsset(envelope.sessionId, envelope.assetId);
    const body: UploadResult = {
      contractVersion: CONTRACT_VERSION,
      assetId: envelope.assetId,
      outcome: "DUPLICATE",
      receivedHash: existing?.receivedHash ?? receivedHash,
      duplicateOf: existing?.assetId ?? envelope.assetId,
      note: "logical upload was already present",
    };
    return { status: 200, body };
  }

  deps.logger.info("ingestion.upload_accepted", {
    sessionId: envelope.sessionId,
    assetId: envelope.assetId,
    packageId: declared.packageId,
    idempotencyKey: envelope.idempotencyKey,
    byteSize: envelope.byteSize,
  });
  const body: UploadResult = {
    contractVersion: CONTRACT_VERSION,
    assetId: envelope.assetId,
    outcome: "ACCEPTED",
    receivedHash,
  };
  return {
    status: 201,
    body,
    location: `/v1/sessions/${envelope.sessionId}/assets/${envelope.assetId}`,
  };
}

function assetSummary(declared: DeclaredAsset): Record<string, unknown> {
  return {
    assetId: declared.asset.assetId,
    packageId: declared.packageId,
    assetType: declared.asset.assetType,
    relativePath: declared.asset.relativePath,
    ...(declared.asset.mimeType !== undefined ? { mimeType: declared.asset.mimeType } : {}),
    byteSize: declared.asset.byteSize,
    contentHash: declared.asset.contentHash,
  };
}

/** GET /v1/sessions/{sessionId}/assets/{assetId} — asset evidence record. */
export function getAssetEvidence(
  deps: HandlerDeps,
  sessionId: string,
  assetId: string,
): IngestionResponse {
  const session = deps.store.getSession(sessionId);
  if (session === undefined) {
    throw new IngestionError("SESSION_NOT_FOUND", `capture session ${sessionId} is not registered`);
  }

  const declared = deps.store.findDeclaredAsset(sessionId, assetId);
  if (declared === undefined) {
    throw new IngestionError(
      "ASSET_NOT_FOUND",
      `asset ${assetId} is not declared by any registered capture package for session ${sessionId}`,
      { details: { assetId, sessionId } },
    );
  }

  const record = deps.store.findUploadByAsset(sessionId, assetId);
  if (record === undefined) {
    return {
      status: 200,
      body: { status: "declared", ...assetSummary(declared) },
    };
  }

  return {
    status: 200,
    body: {
      status: "accepted",
      ...assetSummary(declared),
      receivedHash: record.receivedHash,
      idempotencyKey: record.idempotencyKey,
      receivedAt: record.receivedAt,
      acquisition: record.acquisition,
    },
  };
}
