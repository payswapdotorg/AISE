/**
 * Envelope reading for ingestion payloads, applying the AISE-003
 * versioning and compatibility rules exactly as finalized:
 *
 * - dispatch on `contractVersion` before deep validation;
 * - cross-MAJOR payloads are rejected with CONTRACT_VERSION_UNSUPPORTED
 *   advertising the supported versions;
 * - exact v1.0 payloads are strict-validated against the shared
 *   validators (writer-strict: unknown fields fail);
 * - same-MAJOR newer-MINOR payloads are read tolerantly, per the
 *   finalized reader obligation: unrecognized fields are dropped
 *   RECURSIVELY (top level, assets[], acquisition, geolocation,
 *   orientation, quaternion, …), unrecognized enum values are mapped
 *   to the `unknown` reader sentinel (never coerced onto an existing
 *   member), and the result is validated against the reader view of
 *   the v1.0 schema (see reader-view.ts);
 * - malformed payloads fail closed with VALIDATION_FAILED carrying
 *   the schema errors in `details`.
 *
 * The values returned by these readers use the `Reader*` types: the
 * v1.0 contract types with their enum surfaces widened to
 * `EnumOrUnknown<T>` so the sentinel is explicit in the type system
 * and every consumer must handle it.
 */
import {
  CONTRACT_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
  isContractVersionFormat,
  loadAllSchemas,
  majorOf,
  readContractVersion,
  tolerateEnumValue,
  validateCapturePackage,
  validateCaptureSession,
  validateProject,
  validateUploadRequest,
  type AssuranceProfile,
  type AssetType,
  type CaptureIntent,
  type CapturePackage,
  type CaptureSession,
  type EnumOrUnknown,
  type PackageAsset,
  type Project,
  type SessionStatus,
  type UploadRequest,
  type ValidationOutcome,
} from "@aise/shared-contracts";
import { IngestionError } from "./errors.js";
import { validateReaderView, type ReaderViewKind } from "./reader-view.js";

// ---------------------------------------------------------------------------
// Reader types: v1.0 contracts with enum surfaces widened to the sentinel
// ---------------------------------------------------------------------------

/**
 * A capture session as read by this gateway: the v1.0 contract with
 * the three enum surfaces widened to the cross-MINOR reader sentinel.
 * Only newer-MINOR payloads can carry the sentinel at runtime.
 */
export type ReaderCaptureSession = Omit<
  CaptureSession,
  "intent" | "assuranceProfile" | "status"
> & {
  readonly intent: EnumOrUnknown<CaptureIntent>;
  readonly assuranceProfile: EnumOrUnknown<AssuranceProfile>;
  readonly status: EnumOrUnknown<SessionStatus>;
};

/** One manifest asset with `assetType` widened to the reader sentinel. */
export type ReaderPackageAsset = Omit<PackageAsset, "assetType"> & {
  readonly assetType: EnumOrUnknown<AssetType>;
};

/** A capture package manifest whose assets use the reader type above. */
export type ReaderCapturePackage = Omit<CapturePackage, "assets"> & {
  readonly assets: readonly ReaderPackageAsset[];
};

// ---------------------------------------------------------------------------
// v1.0 field shapes (for recursive tolerant projection)
// ---------------------------------------------------------------------------

/**
 * How one field/value is treated during the tolerant projection of a
 * newer-MINOR payload onto the v1.0 subset.
 */
type ValueSpec =
  | { readonly kind: "pass" }
  | { readonly kind: "enum"; readonly known: readonly string[] }
  | { readonly kind: "object"; readonly fields: Record<string, ValueSpec> }
  | { readonly kind: "array"; readonly item: ValueSpec };

const PASS: ValueSpec = { kind: "pass" };

/**
 * Reads an enum vocabulary straight from the canonical v1.0 schema
 * documents (loaded via the shared package's public API), so the
 * tolerant projection can never drift from the contract it mirrors.
 */
function schemaEnumAt(file: string, path: readonly string[]): readonly string[] {
  const document = loadAllSchemas()[file] as Record<string, unknown> | undefined;
  let node: unknown = document;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) {
      throw new Error(`schema walk failed for ${file} at ${segment}`);
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (!Array.isArray(node) || node.some((member) => typeof member !== "string")) {
    throw new Error(`schema node is not a string enum: ${file}#${path.join("/")}`);
  }
  return node as readonly string[];
}

function sessionEnumVocabulary(field: "intent" | "assuranceProfile" | "status"): readonly string[] {
  return schemaEnumAt("capture-session.schema.json", ["properties", field, "enum"]);
}

function packageAssetEnumVocabulary(): readonly string[] {
  return schemaEnumAt("capture-package.schema.json", [
    "$defs",
    "packageAsset",
    "properties",
    "assetType",
    "enum",
  ]);
}

/** v1.0 shape of one manifest asset (nested through acquisition metadata). */
const PACKAGE_ASSET_SPEC: ValueSpec = {
  kind: "object",
  fields: {
    assetId: PASS,
    assetType: { kind: "enum", known: packageAssetEnumVocabulary() },
    relativePath: PASS,
    contentHash: PASS,
    byteSize: PASS,
    mimeType: PASS,
    acquisition: {
      kind: "object",
      fields: {
        capturedAt: PASS,
        deviceRef: PASS,
        sensorRef: PASS,
        geolocation: {
          kind: "object",
          fields: { latitude: PASS, longitude: PASS, altitudeM: PASS, accuracyM: PASS },
        },
        orientation: {
          kind: "object",
          fields: {
            quaternion: {
              kind: "object",
              fields: { x: PASS, y: PASS, z: PASS, w: PASS },
            },
          },
        },
        notes: PASS,
      },
    },
  },
};

/**
 * The v1.0 field sets per envelope kind, at every nesting level
 * (mirroring the AISE-003 contract surface per kind). Used only on
 * the tolerant path for newer-MINOR payloads.
 */
const V1_OBJECT_SPECS: Record<ReaderViewKind, Record<string, ValueSpec>> = {
  project: {
    contractVersion: PASS,
    projectId: PASS,
    name: PASS,
    description: PASS,
    createdAt: PASS,
    updatedAt: PASS,
  },
  session: {
    contractVersion: PASS,
    sessionId: PASS,
    projectId: PASS,
    intent: { kind: "enum", known: sessionEnumVocabulary("intent") },
    assuranceProfile: { kind: "enum", known: sessionEnumVocabulary("assuranceProfile") },
    status: { kind: "enum", known: sessionEnumVocabulary("status") },
    createdAt: PASS,
    updatedAt: PASS,
    operatorRef: PASS,
    notes: PASS,
  },
  package: {
    contractVersion: PASS,
    packageId: PASS,
    sessionId: PASS,
    projectId: PASS,
    createdAt: PASS,
    checksumAlgorithm: PASS,
    totalByteSize: PASS,
    assets: { kind: "array", item: PACKAGE_ASSET_SPEC },
  },
  uploadRequest: {
    contractVersion: PASS,
    sessionId: PASS,
    assetId: PASS,
    idempotencyKey: PASS,
    contentHash: PASS,
    byteSize: PASS,
    part: {
      kind: "object",
      fields: { index: PASS, total: PASS },
    },
  },
};

// ---------------------------------------------------------------------------
// Tolerant projection
// ---------------------------------------------------------------------------

/**
 * Projects a newer-MINOR value onto the v1.0 subset described by
 * `spec`: unknown object fields are dropped at EVERY nesting level,
 * array items are projected element-wise, and string enum values that
 * are not v1.0 members are mapped to the `unknown` sentinel with the
 * canonical `tolerateEnumValue` helper. Values with the wrong JSON
 * shape pass through untouched — the reader-view schema rejects them
 * (tolerant reading is not lax validation).
 */
function projectOntoV1(spec: ValueSpec, value: unknown): unknown {
  switch (spec.kind) {
    case "pass":
      return value;
    case "enum":
      return typeof value === "string" ? tolerateEnumValue(value, spec.known) : value;
    case "array":
      return Array.isArray(value) ? value.map((item) => projectOntoV1(spec.item, item)) : value;
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return value;
      }
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [field, fieldSpec] of Object.entries(spec.fields)) {
        if (field in record) {
          out[field] = projectOntoV1(fieldSpec, record[field]);
        }
      }
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// Envelope reading
// ---------------------------------------------------------------------------

type StrictValidator = (payload: unknown) => ValidationOutcome;

const LABELS: Record<ReaderViewKind, string> = {
  project: "project",
  session: "capture session",
  package: "capture package",
  uploadRequest: "upload request",
};

function readEnvelope<T>(kind: ReaderViewKind, raw: unknown, strictValidate: StrictValidator): T {
  const label = LABELS[kind];
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

  let outcome: { ok: boolean; errors: string[] };
  let candidate: Record<string, unknown>;

  if (version === CONTRACT_VERSION) {
    // Exact v1.0: writer-strict validation, no projection.
    candidate = { ...record, contractVersion: CONTRACT_VERSION };
    outcome = strictValidate(candidate);
  } else {
    // Newer same-MAJOR MINOR: the finalized reader obligation —
    // recursively drop fields unknown to v1.0, map unrecognized enum
    // values onto the reader sentinel, then validate the v1.0 subset
    // (sentinel admitted) against the reader-view schema.
    const projected = projectOntoV1(
      { kind: "object", fields: V1_OBJECT_SPECS[kind] },
      record,
    ) as Record<string, unknown>;
    candidate = { ...projected, contractVersion: CONTRACT_VERSION };
    outcome = validateReaderView(kind, candidate);
  }

  if (!outcome.ok) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      `${label} payload does not satisfy the v${CONTRACT_VERSION} contract`,
      { details: { validationErrors: [...outcome.errors] } },
    );
  }

  return candidate as T;
}

/** Reads and validates a Project envelope. */
export function readProjectEnvelope(raw: unknown): Project {
  return readEnvelope<Project>("project", raw, validateProject);
}

/** Reads and validates a CaptureSession envelope (reader type). */
export function readSessionEnvelope(raw: unknown): ReaderCaptureSession {
  return readEnvelope<ReaderCaptureSession>("session", raw, validateCaptureSession);
}

/** Reads and validates a CapturePackage manifest envelope (reader type). */
export function readPackageEnvelope(raw: unknown): ReaderCapturePackage {
  return readEnvelope<ReaderCapturePackage>("package", raw, validateCapturePackage);
}

/** Reads and validates an UploadRequest envelope. */
export function readUploadRequestEnvelope(raw: unknown): UploadRequest {
  return readEnvelope<UploadRequest>("uploadRequest", raw, validateUploadRequest);
}
