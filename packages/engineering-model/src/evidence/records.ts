/**
 * Evidence records: first-class, immutable, content-pinned source
 * evidence (AISE-012).
 *
 * Architecture §4.5: "Evidence may include image regions, video
 * frames, LiDAR regions, manual measurements, survey controls,
 * drawings, specifications, and verified human observations."
 * Requirements AC-060 enumerates the source vocabulary: image /
 * video / LiDAR / measurement / document / human-observation.
 * Architecture-lock §2: "Raw captures are immutable evidence
 * artifacts" — capture-bound evidence therefore REFERENCES the
 * ingested upload (identity-pinned by the ingestion boundary's
 * server-computed hash) instead of copying or re-asserting its
 * bytes.
 *
 * Design rules (the work-item goal "immutable source identity"):
 *
 * - **Identity is lineage, not content** (the AISE-011 object
 *   identity rule, applied to sources): `evidenceId` derives from
 *   a small source PIN — for a capture: (session, asset,
 *   received-hash); for a manual measurement: (who, when, method,
 *   value, unit); for a document: (document id, hash?); for a
 *   human observation: (observer, when, statement). Two records
 *   with the same pin are the SAME source; anything else in the
 *   record is content that must agree (`exists_identical`) or is
 *   a conflicting claim (`exists_conflict` — never merged).
 * - **Content is pinned**: `contentHash` is the canonical hash of
 *   `{kind, source}` — the record's asserted content. Tampering
 *   with any source field changes the content hash while the
 *   identity stays → detectable conflict, never silent drift.
 * - **Registration provenance is separate** (`recordedBy` /
 *   `recordedAt` / `notes`): who registered the evidence and
 *   when is provenance OF THE REGISTRATION, not content of the
 *   source — it never enters identity or content pinning.
 * - **Kind ↔ source compatibility is fail-closed**: an IMAGE
 *   must be capture-bound to a PHOTO asset; a LIDAR to a DEPTH
 *   asset; MEASUREMENT comes only from manual/survey entry;
 *   DOCUMENT is standalone or capture-bound DOCUMENT/SKETCH;
 *   HUMAN_OBSERVATION is standalone or capture-bound VOICE. A
 *   capture METADATA asset is never evidence (session metadata
 *   is not a source observation).
 * - **Records are deep-frozen on construction.**
 *
 * Units in manual measurements stay free-form strings: a source
 * preserves what was recorded, verbatim (the AISE-004
 * acquisition-passthrough precedent); the canonical model
 * validates units when an assertion is DERIVED from evidence.
 */
import { EvidenceError } from "./errors.js";
import { canonicalContentHash } from "../canonical.js";
import { deepFreeze } from "../identity.js";
import type {
  AcquisitionMetadata,
  AssetType,
  Geolocation,
  Orientation,
} from "@aise/shared-contracts";

/** Evidence source vocabulary (AC-060). */
export type EvidenceKind =
  | "IMAGE"
  | "VIDEO"
  | "LIDAR"
  | "MEASUREMENT"
  | "DOCUMENT"
  | "HUMAN_OBSERVATION";

/** All evidence kinds, in canonical order (tests and reports). */
export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  "IMAGE",
  "VIDEO",
  "LIDAR",
  "MEASUREMENT",
  "DOCUMENT",
  "HUMAN_OBSERVATION",
];

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const ACTOR_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const EVIDENCE_ID_PREFIX = "ev-";
const ID_HEX_LENGTH = 16;

/** Capture asset types that can back each evidence kind (v1 mapping). */
const CAPTURE_KIND_COMPATIBILITY: Readonly<Record<EvidenceKind, readonly AssetType[]>> = {
  IMAGE: ["PHOTO"],
  VIDEO: ["VIDEO"],
  LIDAR: ["DEPTH"],
  MEASUREMENT: [],
  DOCUMENT: ["DOCUMENT", "SKETCH"],
  HUMAN_OBSERVATION: ["VOICE"],
};

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * A capture-bound source: references the immutable raw upload
 * ingested through the AISE-004 boundary. `contentHash` is the
 * ingestion boundary's server-computed received hash — the pin
 * binding evidence to raw bytes the subsystem never re-asserts.
 */
export interface CaptureSource {
  readonly kind: "capture";
  readonly sessionId: string;
  readonly assetId: string;
  readonly packageId: string;
  readonly assetType: AssetType;
  /** Server-computed hash of the stored upload (the binding pin). */
  readonly contentHash: string;
  readonly byteSize: number;
  readonly mimeType?: string;
  /** Acquisition metadata preserved verbatim from the upload. */
  readonly acquisition: AcquisitionMetadata;
}

/** A manually-entered measurement (survey/laser-tape/manual reading). */
export interface ManualMeasurementSource {
  readonly kind: "manual-measurement";
  readonly value: number;
  readonly unit: string;
  readonly method: string;
  readonly measuredBy: string;
  readonly measuredAt: string;
}

/** A document source (drawing, specification, survey control sheet). */
export interface DocumentSource {
  readonly kind: "document";
  readonly documentId: string;
  /** SHA-256 of the document content, when available. */
  readonly documentHash?: string;
  readonly title?: string;
  readonly issuedBy?: string;
  readonly issuedAt?: string;
}

/** A verified human observation recorded as text. */
export interface HumanObservationSource {
  readonly kind: "human-observation";
  readonly observer: string;
  readonly observedAt: string;
  readonly statement: string;
}

export type EvidenceSource =
  | CaptureSource
  | ManualMeasurementSource
  | DocumentSource
  | HumanObservationSource;

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** One immutable, content-pinned evidence record. */
export interface EvidenceRecord {
  /** Deterministic identity (`ev-<hex16>`) derived from the source pin. */
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
  readonly source: EvidenceSource;
  /** Canonical content hash of `{kind, source}`. */
  readonly contentHash: string;
  /** Who registered this evidence (service or user identity). */
  readonly recordedBy: string;
  /** RFC 3339 UTC registration instant. */
  readonly recordedAt: string;
  readonly notes?: string;
}

/** Constructor input (registration metadata; source and kind are the content). */
export interface EvidenceRecordInput {
  readonly kind: EvidenceKind;
  readonly source: EvidenceSource;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly notes?: string;
}

/**
 * Builds and validates one evidence record (fail closed):
 * kind↔source compatibility, field patterns, finite numerics,
 * deterministic identity from the source pin, content pinning,
 * deep freeze. Returns a NEW frozen record — callers never
 * construct records by hand.
 */
export function evidenceRecord(input: EvidenceRecordInput): EvidenceRecord {
  if (!isEvidenceKind(input.kind)) {
    throw new EvidenceError(
      "EVIDENCE_INVALID",
      `evidence kind must be one of ${EVIDENCE_KINDS.join("|")}: ${String(input.kind)}`,
      { details: { field: "kind", value: String(input.kind) } },
    );
  }
  const source = validateSource(input.source, input.kind) as EvidenceSource;
  requireActor(input.recordedBy, "recordedBy");
  requireTimestamp(input.recordedAt, "recordedAt");
  if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length === 0)) {
    throw new EvidenceError(
      "EVIDENCE_INVALID",
      "evidence notes must be a non-empty string when present",
      { details: { field: "notes" } },
    );
  }

  const contentHash = recordContentHash(input.kind, source);
  const record: EvidenceRecord = {
    evidenceId: deriveEvidenceId(input.kind, source),
    kind: input.kind,
    source,
    contentHash,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
  return deepFreeze(record);
}

/** Canonical content hash of the record's asserted content. */
export function recordContentHash(kind: EvidenceKind, source: EvidenceSource): string {
  return canonicalContentHash({ kind, source });
}

/**
 * Deterministic evidence identity from the source PIN (lineage):
 * the pin is the minimal stable identity of the source. Any
 * pin-member change yields a new identity; non-pin content
 * changes keep the identity but change the content hash
 * (detectable conflict, never silent merge).
 */
export function deriveEvidenceId(kind: EvidenceKind, source: EvidenceSource): string {
  const pin = sourcePin(kind, source);
  const hash = canonicalContentHash(pin);
  return `${EVIDENCE_ID_PREFIX}${hash.slice(0, ID_HEX_LENGTH)}`;
}

/** The source pin (the lineage identity of a source). */
export function sourcePin(kind: EvidenceKind, source: EvidenceSource): Readonly<Record<string, unknown>> {
  switch (source.kind) {
    case "capture":
      return { kind, source: "capture", sessionId: source.sessionId, assetId: source.assetId, contentHash: source.contentHash };
    case "manual-measurement":
      return {
        kind,
        source: "manual-measurement",
        measuredBy: source.measuredBy,
        measuredAt: source.measuredAt,
        method: source.method,
        value: source.value,
        unit: source.unit,
      };
    case "document":
      return { kind, source: "document", documentId: source.documentId };
    case "human-observation":
      return { kind, source: "human-observation", observer: source.observer, observedAt: source.observedAt };
  }
}

/** The capture asset types compatible with an evidence kind (v1 mapping). */
export function compatibleAssetTypes(kind: EvidenceKind): readonly AssetType[] {
  return CAPTURE_KIND_COMPATIBILITY[kind];
}

function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === "string" && (EVIDENCE_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Source validation
// ---------------------------------------------------------------------------

function validateSource(source: EvidenceSource, kind: EvidenceKind): EvidenceSource {
  if (source === null || typeof source !== "object") {
    throw new EvidenceError("EVIDENCE_INVALID", "evidence source must be a record", {
      details: { field: "source" },
    });
  }
  switch (source.kind) {
    case "capture":
      validateCaptureSource(source, kind);
      return deepFreeze(source);
    case "manual-measurement":
      validateManualMeasurement(source);
      return deepFreeze(source);
    case "document":
      validateDocumentSource(source);
      return deepFreeze(source);
    case "human-observation":
      validateHumanObservation(source);
      return deepFreeze(source);
    default:
      throw new EvidenceError("EVIDENCE_INVALID", `unknown evidence source kind: ${String((source as { kind?: unknown }).kind)}`, {
        details: { field: "source.kind", value: String((source as { kind?: unknown }).kind) },
      });
  }
}

function validateCaptureSource(source: CaptureSource, kind: EvidenceKind): void {
  requireId(source.sessionId, "source.sessionId");
  requireId(source.assetId, "source.assetId");
  requireId(source.packageId, "source.packageId");
  requireAssetType(source.assetType);
  requireHash(source.contentHash, "source.contentHash");
  if (!Number.isInteger(source.byteSize) || source.byteSize < 0) {
    throw new EvidenceError(
      "EVIDENCE_INVALID",
      `source.byteSize must be a non-negative integer: ${String(source.byteSize)}`,
      { details: { field: "source.byteSize", value: String(source.byteSize) } },
    );
  }
  if (source.mimeType !== undefined && (typeof source.mimeType !== "string" || source.mimeType.length === 0)) {
    throw new EvidenceError("EVIDENCE_INVALID", "source.mimeType must be a non-empty string when present", {
      details: { field: "source.mimeType" },
    });
  }
  // Kind compatibility: capture-bound evidence must be backed by a
  // compatible asset type, and METADATA assets are never evidence.
  const compatible = CAPTURE_KIND_COMPATIBILITY[kind];
  if (!compatible.includes(source.assetType)) {
    throw new EvidenceError(
      "KIND_INCOMPATIBLE",
      `evidence kind ${kind} cannot be backed by a ${source.assetType} capture asset (compatible: ${compatible.join("|") || "none — this kind is not capture-bound"})`,
      { details: { field: "source.assetType", value: source.assetType, kind } },
    );
  }
  validateAcquisition(source.acquisition);
}

function validateManualMeasurement(source: ManualMeasurementSource): void {
  if (!Number.isFinite(source.value)) {
    throw new EvidenceError("EVIDENCE_INVALID", `source.value must be finite: ${String(source.value)}`, {
      details: { field: "source.value", value: String(source.value) } },
    );
  }
  requireNonEmpty(source.unit, "source.unit");
  requireNonEmpty(source.method, "source.method");
  requireActor(source.measuredBy, "source.measuredBy");
  requireTimestamp(source.measuredAt, "source.measuredAt");
}

function validateDocumentSource(source: DocumentSource): void {
  requireId(source.documentId, "source.documentId");
  if (source.documentHash !== undefined) {
    requireHash(source.documentHash, "source.documentHash");
  }
  if (source.title !== undefined && (typeof source.title !== "string" || source.title.length === 0)) {
    throw new EvidenceError("EVIDENCE_INVALID", "source.title must be a non-empty string when present", {
      details: { field: "source.title" },
    });
  }
  if (source.issuedBy !== undefined) {
    requireActor(source.issuedBy, "source.issuedBy");
  }
  if (source.issuedAt !== undefined) {
    requireTimestamp(source.issuedAt, "source.issuedAt");
  }
}

function validateHumanObservation(source: HumanObservationSource): void {
  requireActor(source.observer, "source.observer");
  requireTimestamp(source.observedAt, "source.observedAt");
  requireNonEmpty(source.statement, "source.statement");
}

/** Defense-in-depth re-validation of preserved acquisition metadata. */
export function validateAcquisition(acquisition: AcquisitionMetadata): void {
  if (acquisition === null || typeof acquisition !== "object") {
    throw new EvidenceError("EVIDENCE_INVALID", "capture acquisition metadata must be a record", {
      details: { field: "source.acquisition" },
    });
  }
  requireTimestamp(acquisition.capturedAt, "source.acquisition.capturedAt");
  if (acquisition.deviceRef !== undefined) {
    requireNonEmpty(acquisition.deviceRef, "source.acquisition.deviceRef");
  }
  if (acquisition.sensorRef !== undefined) {
    requireNonEmpty(acquisition.sensorRef, "source.acquisition.sensorRef");
  }
  if (acquisition.notes !== undefined && (typeof acquisition.notes !== "string" || acquisition.notes.length === 0)) {
    throw new EvidenceError("EVIDENCE_INVALID", "acquisition notes must be a non-empty string when present", {
      details: { field: "source.acquisition.notes" },
    });
  }
  if (acquisition.geolocation !== undefined) {
    validateGeolocation(acquisition.geolocation);
  }
  if (acquisition.orientation !== undefined) {
    validateOrientation(acquisition.orientation);
  }
}

function validateGeolocation(geolocation: Geolocation): void {
  const { latitude, longitude } = geolocation;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new EvidenceError("EVIDENCE_INVALID", `geolocation.latitude must be finite on [-90, 90]: ${String(latitude)}`, {
      details: { field: "source.acquisition.geolocation.latitude", value: String(latitude) },
    });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new EvidenceError("EVIDENCE_INVALID", `geolocation.longitude must be finite on [-180, 180]: ${String(longitude)}`, {
      details: { field: "source.acquisition.geolocation.longitude", value: String(longitude) },
    });
  }
  if (geolocation.altitudeM !== undefined && !Number.isFinite(geolocation.altitudeM)) {
    throw new EvidenceError("EVIDENCE_INVALID", "geolocation.altitudeM must be finite when present", {
      details: { field: "source.acquisition.geolocation.altitudeM" },
    });
  }
  if (geolocation.accuracyM !== undefined && (!Number.isFinite(geolocation.accuracyM) || geolocation.accuracyM < 0)) {
    throw new EvidenceError("EVIDENCE_INVALID", "geolocation.accuracyM must be finite and non-negative when present", {
      details: { field: "source.acquisition.geolocation.accuracyM" },
    });
  }
}

function validateOrientation(orientation: Orientation): void {
  const quaternion = orientation.quaternion;
  if (quaternion === null || typeof quaternion !== "object") {
    throw new EvidenceError("EVIDENCE_INVALID", "orientation.quaternion must be a record", {
      details: { field: "source.acquisition.orientation.quaternion" },
    });
  }
  for (const component of ["x", "y", "z", "w"] as const) {
    const value = quaternion[component];
    if (!Number.isFinite(value)) {
      throw new EvidenceError("EVIDENCE_INVALID", `orientation.quaternion.${component} must be finite: ${String(value)}`, {
        details: { field: `source.acquisition.orientation.quaternion.${component}`, value: String(value) },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function requireId(value: string, field: string): void {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new EvidenceError("EVIDENCE_INVALID", `${field} must match ${ID_PATTERN}: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireActor(value: string, field: string): void {
  if (typeof value !== "string" || !ACTOR_PATTERN.test(value)) {
    throw new EvidenceError("EVIDENCE_INVALID", `${field} must match ${ACTOR_PATTERN}: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvidenceError("EVIDENCE_INVALID", `${field} must be a non-empty string: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireHash(value: string, field: string): void {
  if (typeof value !== "string" || !CONTENT_HASH_PATTERN.test(value)) {
    throw new EvidenceError("EVIDENCE_INVALID", `${field} must be a lowercase 64-hex content hash: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireTimestamp(value: string, field: string): void {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw new EvidenceError("EVIDENCE_INVALID", `${field} must be an RFC 3339 UTC timestamp: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireAssetType(value: AssetType): void {
  const assetTypes = ["PHOTO", "VIDEO", "DEPTH", "METADATA", "SKETCH", "VOICE", "DOCUMENT"] as const;
  if (!(assetTypes as readonly string[]).includes(value)) {
    throw new EvidenceError("EVIDENCE_INVALID", `source.assetType must be a known capture asset type: ${String(value)}`, {
      details: { field: "source.assetType", value: String(value) },
    });
  }
}
