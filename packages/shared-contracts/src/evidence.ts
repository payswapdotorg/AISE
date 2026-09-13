/**
 * Evidence contracts (AISE-003) — family `evidence`.
 *
 * `Evidence` is content-addressed raw field evidence: its identity IS its
 * content address (sha-256 over the frozen AISE-CONTENT-V1 canonical
 * encoding of payload + acquisition metadata, established by the AISE-002
 * Android foundation). Evidence is append-only and immutable; raw evidence
 * is never rewritten (spec/architecture-lock.md).
 *
 * `ProvenanceLink` binds a consequential assertion/artifact to the evidence
 * that supports it. `Derivation` records how a derived artifact was produced
 * from input evidence (method identity, method version, parameters) without
 * granting any engine or provider authority. `EvidenceBundle` is a stable,
 * described grouping of evidence content ids.
 *
 * Acquisition metadata is an OPEN string map. The well-known keys below are
 * the canonical cross-platform vocabulary deferred to this package by the
 * AISE-002 foundation (`AcquisitionMetadataKeys` in
 * `apps/android/core/.../capture/AcquisitionMetadata.kt`): producers may add
 * their own keys; consumers must ignore keys they do not understand.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  mediaTypeSchema,
  nonNegativeIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "./common";
import { createWireCodec } from "./codec";

/**
 * Canonical acquisition-metadata keys (string keys keep the wire
 * representation transport-safe and inspectable across platforms).
 * Aligned 1:1 with the AISE-002 advisory keys.
 */
export const ACQUISITION_METADATA_KEYS = {
  missionId: "mission.id",
  sessionId: "session.id",
  deviceId: "device.id",
  captureKind: "capture.kind",
  sensorId: "acquisition.sensorId",
} as const;

/**
 * How evidence is acquired. Grounded in spec/architecture.md (§3 evidence
 * substitution chain, §7 evidence kinds). Each method carries its own
 * uncertainty/epistemic semantics; substituting a fallback method never
 * silently preserves the stronger evidence claim.
 */
export const EVIDENCE_METHODS = [
  "DEPTH_SENSING",
  "VISUAL_RECONSTRUCTION",
  "CALIBRATED_REFERENCE",
  "MANUAL_MEASUREMENT",
  "SPECIALIST_INSTRUMENT",
  "VIDEO_FOOTAGE",
  "STILL_IMAGERY",
  "INSTRUMENT_READING",
  "HUMAN_ANSWER",
  "DOCUMENT_REGION",
] as const;
export type EvidenceMethod = (typeof EVIDENCE_METHODS)[number];

export const evidenceMethodSchema = z.enum(EVIDENCE_METHODS);

/** Role an evidence item plays for its provenance subject. */
export const PROVENANCE_ROLES = [
  "SUPPORTS",
  "CONTRADICTS",
  "DERIVED_FROM",
  "CONTEXT",
] as const;
export type ProvenanceRole = (typeof PROVENANCE_ROLES)[number];

export const provenanceRoleSchema = z.enum(PROVENANCE_ROLES);

/* ------------------------------------------------------------------ */
/* Evidence                                                             */
/* ------------------------------------------------------------------ */

export const EvidenceSchema = z
  .object({
    contractVersion: contractVersionSchema,
    contentId: contentIdSchema.describe(
      "Content address: sha-256 over the AISE-CONTENT-V1 canonical encoding of " +
        "(payload, acquisitionMetadata). This IS the evidence identity.",
    ),
    byteSize: nonNegativeIntSchema.describe("Payload size in bytes."),
    mediaType: mediaTypeSchema,
    capturedAt: isoTimestampSchema.describe("Acquisition instant (UTC)."),
    acquisitionMethod: evidenceMethodSchema,
    acquisitionMetadata: z
      .record(z.string(), z.string())
      .describe(
        "Open string map. Well-known keys: mission.id, session.id, device.id, " +
          "capture.kind, acquisition.sensorId. Unknown keys are data and must be preserved.",
      ),
  })
  .passthrough();
export type Evidence = z.infer<typeof EvidenceSchema>;

/* ------------------------------------------------------------------ */
/* Provenance link                                                      */
/* ------------------------------------------------------------------ */

export const ProvenanceLinkSchema = z
  .object({
    contractVersion: contractVersionSchema,
    subjectKind: shortTextSchema.describe(
      "Open vocabulary (lower_snake_case) naming the subject's entity kind, " +
        "seeded from spec/domain-model.md entity families (e.g. `property_assertion`, " +
        "`measurement`, `reality_object`, `boq_item`).",
    ),
    subjectId: stableIdSchema,
    evidenceContentId: contentIdSchema,
    role: provenanceRoleSchema,
  })
  .passthrough();
export type ProvenanceLink = z.infer<typeof ProvenanceLinkSchema>;

/* ------------------------------------------------------------------ */
/* Derivation                                                           */
/* ------------------------------------------------------------------ */

export const DerivationSchema = z
  .object({
    contractVersion: contractVersionSchema,
    derivationId: stableIdSchema,
    outputContentId: contentIdSchema.describe(
      "Content address of the derived artifact (derived outputs are content-addressed too).",
    ),
    inputEvidenceContentIds: z
      .array(contentIdSchema)
      .describe("Ordered input evidence content ids."),
    method: shortTextSchema.describe(
      "Provider-neutral method identity, e.g. `reconstruction.worldsculpt`. " +
        "No engine is an authority; outputs are candidates until AISE gates accept them.",
    ),
    methodVersion: shortTextSchema.describe("Method/engine/checkpoint version identity."),
    parameters: z
      .record(z.string(), z.string())
      .describe("Deterministic parameters as an inspectable string map."),
    createdAt: isoTimestampSchema,
  })
  .passthrough();
export type Derivation = z.infer<typeof DerivationSchema>;

/* ------------------------------------------------------------------ */
/* Evidence bundle                                                      */
/* ------------------------------------------------------------------ */

export const EvidenceBundleSchema = z
  .object({
    contractVersion: contractVersionSchema,
    bundleId: stableIdSchema,
    description: textSchema.describe("Human-readable purpose of this grouping."),
    evidenceContentIds: z
      .array(contentIdSchema)
      .describe("Evidence content ids in listed order; entries should be unique."),
  })
  .passthrough();
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

/* Codecs ------------------------------------------------------------------ */

export const EvidenceCodec = createWireCodec<Evidence>({
  name: "Evidence",
  family: "evidence",
  schema: EvidenceSchema,
});
export const decodeEvidence = EvidenceCodec.decode;
export const decodeEvidenceStrict = EvidenceCodec.decodeStrict;
export const encodeEvidence = EvidenceCodec.encode;

export const ProvenanceLinkCodec = createWireCodec<ProvenanceLink>({
  name: "ProvenanceLink",
  family: "evidence",
  schema: ProvenanceLinkSchema,
});
export const decodeProvenanceLink = ProvenanceLinkCodec.decode;
export const decodeProvenanceLinkStrict = ProvenanceLinkCodec.decodeStrict;
export const encodeProvenanceLink = ProvenanceLinkCodec.encode;

export const DerivationCodec = createWireCodec<Derivation>({
  name: "Derivation",
  family: "evidence",
  schema: DerivationSchema,
});
export const decodeDerivation = DerivationCodec.decode;
export const decodeDerivationStrict = DerivationCodec.decodeStrict;
export const encodeDerivation = DerivationCodec.encode;

export const EvidenceBundleCodec = createWireCodec<EvidenceBundle>({
  name: "EvidenceBundle",
  family: "evidence",
  schema: EvidenceBundleSchema,
});
export const decodeEvidenceBundle = EvidenceBundleCodec.decode;
export const decodeEvidenceBundleStrict = EvidenceBundleCodec.decodeStrict;
export const encodeEvidenceBundle = EvidenceBundleCodec.encode;
