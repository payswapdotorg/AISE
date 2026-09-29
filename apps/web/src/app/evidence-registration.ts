/**
 * PROD-016b — the evidence REGISTRATION draft's pure logic (no React, no
 * fetch). The second half of the capture → reality journey: the upload
 * panel stores bytes in the content-addressed store, but a capture becomes
 * EVIDENCE (pickable as provenance by the reality recorder, listed by the
 * SiteTwin) only through the server-validated registration step
 * (`POST /v1/evidence`, family `evidence` — the register is the
 * authority). Until now that step was API-only — the documented blocker
 * this module removes for the first-time user.
 *
 * Discipline (the create-forms family):
 *  - the acquisition-method vocabulary mirrors the shared contract's
 *    EVIDENCE_METHODS VERBATIM (pinned by test — no second-enum drift);
 *  - every defect is NAMED, never thrown;
 *  - the wire body is the EXACT Evidence document (contractVersion pinned
 *    to the shared CONTRACT_VERSION constant — never a literal here);
 *  - the panel NEVER invents content: every field is prefilled from the
 *    upload's own record (content id, byte size, media type) or entered
 *    by the user (captured instant, method, optional session id).
 */

import { CONTRACT_VERSION } from "../../../../packages/shared-contracts/src/index";

/** The acquisition-method closed vocabulary — mirrors EVIDENCE_METHODS. */
export const EVIDENCE_ACQUISITION_METHODS = [
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
  "VOICE_NOTE",
] as const;

/** One registration draft (raw user input over the upload's own record). */
export interface EvidenceRegistrationDraft {
  /** The upload's content address (64-hex, prefilled — hand-correctable). */
  readonly contentId: string;
  /** The upload's byte size (prefilled). */
  readonly byteSize: string;
  /** The upload's media type (prefilled). */
  readonly mediaType: string;
  /** Acquisition instant (ISO 8601 UTC; prefilled with the upload instant). */
  readonly capturedAt: string;
  /** One of EVIDENCE_ACQUISITION_METHODS (select, never trusted). */
  readonly acquisitionMethod: string;
  /** Optional session id (the well-known `session.id` metadata key). */
  readonly sessionId: string;
}

/** The exact POST /v1/evidence body (family `evidence`). */
export interface EvidenceRegistrationRequestBody {
  readonly contractVersion: string;
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly capturedAt: string;
  readonly acquisitionMethod: string;
  readonly acquisitionMetadata: Record<string, string>;
}

/** Millisecond precision, Z suffix — the shared contract's exact rule. */
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Validate a registration draft: 64-hex content id, non-negative integer
 * byte size, non-empty media type, ISO-8601-UTC captured instant, and the
 * closed acquisition-method vocabulary. Returns the named defects.
 */
export function validateEvidenceRegistrationDraft(
  draft: EvidenceRegistrationDraft,
): readonly string[] {
  const defects: string[] = [];
  if (!/^[0-9a-f]{64}$/.test(draft.contentId.trim())) {
    defects.push("content id must be a 64-hex content address");
  }
  const byteSize = draft.byteSize.trim();
  if (!/^\d+$/.test(byteSize)) {
    defects.push("byte size must be a non-negative integer");
  }
  const mediaType = draft.mediaType.trim();
  if (mediaType.length === 0 || mediaType.length > 256) {
    defects.push("media type must be 1..256 characters");
  }
  if (!ISO_8601_UTC.test(draft.capturedAt.trim())) {
    defects.push(
      "captured instant must be ISO 8601 UTC with millisecond precision (e.g. 2026-09-29T12:00:00.000Z)",
    );
  }
  if (!(EVIDENCE_ACQUISITION_METHODS as readonly string[]).includes(draft.acquisitionMethod)) {
    defects.push(
      `acquisition method "${draft.acquisitionMethod}" is not in the closed vocabulary (${EVIDENCE_ACQUISITION_METHODS.join("|")})`,
    );
  }
  return defects;
}

/**
 * Map a validated draft to the EXACT registration body. The session id,
 * when present, rides the well-known `session.id` metadata key (the open
 * map stays otherwise empty — nothing invented).
 */
export function evidenceRegistrationRequestBody(
  draft: EvidenceRegistrationDraft,
): { readonly ok: true; readonly body: EvidenceRegistrationRequestBody } | { readonly ok: false; readonly defects: readonly string[] } {
  const defects = validateEvidenceRegistrationDraft(draft);
  if (defects.length > 0) {
    return { ok: false, defects };
  }
  const sessionId = draft.sessionId.trim();
  return {
    ok: true,
    body: {
      contractVersion: CONTRACT_VERSION,
      contentId: draft.contentId.trim(),
      byteSize: Number(draft.byteSize.trim()),
      mediaType: draft.mediaType.trim(),
      capturedAt: draft.capturedAt.trim(),
      acquisitionMethod: draft.acquisitionMethod,
      acquisitionMetadata: sessionId.length === 0 ? {} : { "session.id": sessionId },
    },
  };
}

/** The default acquisition method for a media type (the honest prefill). */
export function defaultAcquisitionMethod(mediaType: string): string {
  if (mediaType.startsWith("video/")) {
    return "VIDEO_FOOTAGE";
  }
  if (mediaType.startsWith("image/")) {
    return "STILL_IMAGERY";
  }
  // VOICE-001: raw audio is a field voice note — never a document.
  if (mediaType.startsWith("audio/")) {
    return "VOICE_NOTE";
  }
  return "DOCUMENT_REGION";
}
