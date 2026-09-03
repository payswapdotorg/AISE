/**
 * Envelope reading for ingestion payloads, applying the AISE-003
 * versioning and compatibility rules exactly as finalized:
 *
 * - dispatch on `contractVersion` before deep validation;
 * - cross-MAJOR payloads are rejected with CONTRACT_VERSION_UNSUPPORTED
 *   advertising the supported versions;
 * - same-MAJOR newer-MINOR payloads are read tolerantly: unknown
 *   fields are dropped, then the v1.0 subset is strict-validated
 *   (the documented reader obligation);
 * - malformed payloads fail closed with VALIDATION_FAILED carrying
 *   the schema errors in `details`.
 */
import {
  CONTRACT_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
  isContractVersionFormat,
  majorOf,
  readContractVersion,
  stripUnknownFields,
  validateCapturePackage,
  validateCaptureSession,
  validateProject,
  validateUploadRequest,
  type CapturePackage,
  type CaptureSession,
  type Project,
  type UploadRequest,
  type ValidationOutcome,
} from "@aise/shared-contracts";
import { IngestionError } from "./errors.js";

type EnvelopeKind = "project" | "session" | "package" | "uploadRequest";

type EnvelopeValidator = (payload: unknown) => ValidationOutcome;

/**
 * The v1.0 field sets used for tolerant reading of newer-MINOR
 * payloads (mirroring the AISE-003 contract surface per kind).
 */
const V1_FIELDS: Record<EnvelopeKind, readonly string[]> = {
  project: ["contractVersion", "projectId", "name", "description", "createdAt", "updatedAt"],
  session: [
    "contractVersion",
    "sessionId",
    "projectId",
    "intent",
    "assuranceProfile",
    "status",
    "createdAt",
    "updatedAt",
    "operatorRef",
    "notes",
  ],
  package: [
    "contractVersion",
    "packageId",
    "sessionId",
    "projectId",
    "createdAt",
    "checksumAlgorithm",
    "totalByteSize",
    "assets",
  ],
  uploadRequest: [
    "contractVersion",
    "sessionId",
    "assetId",
    "idempotencyKey",
    "contentHash",
    "byteSize",
    "part",
  ],
};

function readEnvelope<T>(
  kind: EnvelopeKind,
  label: string,
  raw: unknown,
  validate: EnvelopeValidator,
): T {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new IngestionError("VALIDATION_FAILED", `${label} payload must be a JSON object`);
  }
  const record = raw as Record<string, unknown>;

  const version = readContractVersion(record);
  if (version === null) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `${label} envelope is missing a string contractVersion`,
    );
  }
  if (!isContractVersionFormat(version)) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `${label} contractVersion must be MAJOR.MINOR (got "${version}")`,
    );
  }
  if (majorOf(version) !== majorOf(CONTRACT_VERSION)) {
    throw new IngestionError(
      "CONTRACT_VERSION_UNSUPPORTED",
      `contract version ${version} is not supported by this gateway`,
      { details: { supportedVersions: [...SUPPORTED_CONTRACT_VERSIONS] } },
    );
  }

  // v1.0 envelopes are strict; newer same-MAJOR minors are read
  // tolerantly by dropping fields unknown to this version.
  const candidate =
    version === CONTRACT_VERSION
      ? record
      : stripUnknownFields(record, V1_FIELDS[kind]);

  const outcome = validate({ ...candidate, contractVersion: CONTRACT_VERSION });
  if (!outcome.ok) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `${label} payload does not satisfy the v${CONTRACT_VERSION} contract`,
      { details: { validationErrors: [...outcome.errors] } },
    );
  }

  return { ...candidate, contractVersion: CONTRACT_VERSION } as T;
}

/** Reads and validates a Project envelope. */
export function readProjectEnvelope(raw: unknown): Project {
  return readEnvelope<Project>("project", "project", raw, validateProject);
}

/** Reads and validates a CaptureSession envelope. */
export function readSessionEnvelope(raw: unknown): CaptureSession {
  return readEnvelope<CaptureSession>("session", "capture session", raw, validateCaptureSession);
}

/** Reads and validates a CapturePackage manifest envelope. */
export function readPackageEnvelope(raw: unknown): CapturePackage {
  return readEnvelope<CapturePackage>("package", "capture package", raw, validateCapturePackage);
}

/** Reads and validates an UploadRequest envelope. */
export function readUploadRequestEnvelope(raw: unknown): UploadRequest {
  return readEnvelope<UploadRequest>("uploadRequest", "upload request", raw, validateUploadRequest);
}
