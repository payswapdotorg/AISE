/**
 * Sync envelope contracts (AISE-003) — family `sync`.
 *
 * The offline-first synchronization envelopes between the field client
 * (AISE-005, mission executor) and the capture ingestion gateway
 * (AISE-004). This module defines the SHAPES only — no transport, no
 * retry policy, no server behavior.
 *
 *  - `CaptureSessionEnvelope`: the semantic session record — session id,
 *    optional mission reference, device identity, the session-time
 *    capability snapshot, and the `Evidence` records for every asset
 *    captured in the session.
 *  - `SyncBatch`: the ordered transport unit — idempotency key stable
 *    across retries, per-session sequence, the embedded envelope, and a
 *    content manifest with the per-asset sha-256 content address, byte
 *    size and media type.
 *  - `SyncAck`: the gateway's idempotent verdict — accepted / duplicate /
 *    rejected with stable reason codes, plus conflict/resume semantics
 *    fields (`lastAcceptedSequence`, `resumeFromSequence`).
 *
 * A device may collect richer data locally than the server requires; raw
 * evidence is preserved and no client can declare engineering authority
 * (spec/architecture.md §4).
 */

import { z } from "zod";
import {
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  mediaTypeSchema,
  nonNegativeIntSchema,
  stableIdSchema,
  textSchema,
} from "./common";
import { createWireCodec } from "./codec";
import { DeviceCapabilityProfileSchema, DeviceIdentitySchema } from "./capability";
import { EvidenceSchema } from "./evidence";

/* ------------------------------------------------------------------ */
/* Capture session envelope                                             */
/* ------------------------------------------------------------------ */

export const CaptureSessionEnvelopeSchema = z
  .object({
    contractVersion: contractVersionSchema,
    sessionId: stableIdSchema,
    missionRef: stableIdSchema
      .optional()
      .describe("Mission this session executes, when known (metadata key `mission.id`)."),
    deviceIdentity: DeviceIdentitySchema,
    capabilityProfile: DeviceCapabilityProfileSchema.describe(
      "Session-time capability snapshot embedded with the session.",
    ),
    startedAt: isoTimestampSchema,
    endedAt: isoTimestampSchema.optional(),
    assets: z
      .array(EvidenceSchema)
      .describe("Evidence record for every asset captured in this session."),
  })
  .passthrough();
export type CaptureSessionEnvelope = z.infer<typeof CaptureSessionEnvelopeSchema>;

/* ------------------------------------------------------------------ */
/* Sync batch                                                           */
/* ------------------------------------------------------------------ */

/** Per-asset manifest entry: content address + size + media type. */
const SyncManifestEntrySchema = z
  .object({
    contentId: contentIdSchema.describe("Per-asset sha-256 content address."),
    byteSize: nonNegativeIntSchema,
    mediaType: mediaTypeSchema,
  })
  .passthrough();

export const SyncBatchSchema = z
  .object({
    contractVersion: contractVersionSchema,
    batchId: stableIdSchema,
    sessionId: stableIdSchema,
    sequence: nonNegativeIntSchema.describe(
      "0-based, per-session, monotonically increasing batch order.",
    ),
    idempotencyKey: stableIdSchema.describe(
      "Client-generated key that is STABLE across retries of the same batch.",
    ),
    envelope: CaptureSessionEnvelopeSchema,
    manifest: z
      .array(SyncManifestEntrySchema)
      .describe(
        "Content manifest: one entry per asset, each carrying its sha-256 content address.",
      ),
  })
  .passthrough();
export type SyncBatch = z.infer<typeof SyncBatchSchema>;

/* ------------------------------------------------------------------ */
/* Sync ack                                                             */
/* ------------------------------------------------------------------ */

export const SYNC_OUTCOMES = ["ACCEPTED", "DUPLICATE", "REJECTED"] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

export const syncOutcomeSchema = z.enum(SYNC_OUTCOMES);

/**
 * Stable reason codes. `CONTENT_ID_MISMATCH` and `CONTENT_COLLISION` mirror
 * the AISE-002 local-store rejection reasons for cross-platform parity.
 * Policy: `reasonCode` is REQUIRED when outcome is REJECTED and SHOULD be
 * absent otherwise.
 */
export const SYNC_REASON_CODES = [
  "CONTENT_ID_MISMATCH",
  "CONTENT_COLLISION",
  "MANIFEST_MISMATCH",
  "CONTRACT_VERSION_UNSUPPORTED",
  "SEQUENCE_GAP",
  "IDEMPOTENCY_CONFLICT",
  "SESSION_CONFLICT",
] as const;
export type SyncReasonCode = (typeof SYNC_REASON_CODES)[number];

export const syncReasonCodeSchema = z.enum(SYNC_REASON_CODES);

export const SyncAckSchema = z
  .object({
    contractVersion: contractVersionSchema,
    batchId: stableIdSchema,
    idempotencyKey: stableIdSchema,
    outcome: syncOutcomeSchema,
    reasonCode: syncReasonCodeSchema.optional(),
    reasonDetail: textSchema
      .optional()
      .describe("Human-readable supplement; never replaces the stable reason code."),
    lastAcceptedSequence: nonNegativeIntSchema
      .optional()
      .describe(
        "Last accepted batch sequence for the session, when relevant (resume semantics).",
      ),
    resumeFromSequence: nonNegativeIntSchema
      .optional()
      .describe("Sequence the client should resend from (conflict/gap recovery)."),
    acknowledgedAt: isoTimestampSchema,
  })
  .passthrough();
export type SyncAck = z.infer<typeof SyncAckSchema>;

/* Codecs ------------------------------------------------------------------ */

export const CaptureSessionEnvelopeCodec = createWireCodec<CaptureSessionEnvelope>({
  name: "CaptureSessionEnvelope",
  family: "sync",
  schema: CaptureSessionEnvelopeSchema,
});
export const decodeCaptureSessionEnvelope = CaptureSessionEnvelopeCodec.decode;
export const decodeCaptureSessionEnvelopeStrict = CaptureSessionEnvelopeCodec.decodeStrict;
export const encodeCaptureSessionEnvelope = CaptureSessionEnvelopeCodec.encode;

export const SyncBatchCodec = createWireCodec<SyncBatch>({
  name: "SyncBatch",
  family: "sync",
  schema: SyncBatchSchema,
});
export const decodeSyncBatch = SyncBatchCodec.decode;
export const decodeSyncBatchStrict = SyncBatchCodec.decodeStrict;
export const encodeSyncBatch = SyncBatchCodec.encode;

export const SyncAckCodec = createWireCodec<SyncAck>({
  name: "SyncAck",
  family: "sync",
  schema: SyncAckSchema,
});
export const decodeSyncAck = SyncAckCodec.decode;
export const decodeSyncAckStrict = SyncAckCodec.decodeStrict;
export const encodeSyncAck = SyncAckCodec.encode;
