/**
 * Evidence links and retractions: the authoritative provenance
 * mapping (AISE-012).
 *
 * Architecture-lock §1: "The Evidence subsystem is the
 * authoritative provenance mapping for engineering assertions."
 * The mapping is an APPEND-ONLY event structure:
 *
 * - an `EvidenceLink` attaches one evidence record to one
 *   assertion subject, with its own provenance (who linked,
 *   when, by which method) — the graph's own `evidenceRefs`
 *   citations say what the PRODUCER claimed; the live link set
 *   is what the evidence subsystem ATTESTS;
 * - a retraction (of a link or of an evidence record) is a NEW
 *   immutable event, never a mutation or deletion: "removing
 *   required evidence" (AC-063) is realized as retraction, and
 *   prior evidence remains discoverable in the mapping history
 *   (architecture §2.10: reprocessing cannot erase prior
 *   evidence);
 * - retraction is FINAL in v1: a retracted evidence record
 *   cannot be reinstated under the same identity (a source that
 *   returns is new content → a new identity); a retracted link
 *   can be followed by a NEW link event (different
 *   linkedAt/linkedBy → different identity) so evidence can be
 *   re-attached deliberately, with both events preserved.
 *
 * Identity: `linkId` derives from the full link event (subject,
 * evidence, linker, instant, method) — the same event replayed
 * derives the same id (idempotent), and any deliberate re-attach
 * after retraction is a distinct event with a distinct id.
 */
import { EvidenceError } from "./errors.js";
import { canonicalContentHash } from "../canonical.js";
import { deepFreeze } from "../identity.js";
import { subjectKey, validateSubject, type EvidenceSubject } from "./subjects.js";

const ACTOR_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const METHOD_PATTERN = /^[a-z0-9][a-z0-9./-]*$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const LINK_ID_PREFIX = "lnk-";
const ID_HEX_LENGTH = 16;

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** One evidence→assertion attachment event (immutable). */
export interface EvidenceLink {
  /** Deterministic identity (`lnk-<hex16>`) of this link event. */
  readonly linkId: string;
  readonly subject: EvidenceSubject;
  readonly evidenceId: string;
  /** Who created the link (service or user identity). */
  readonly linkedBy: string;
  /** RFC 3339 UTC link instant. */
  readonly linkedAt: string;
  /** How the link was established (AC-061 discipline on the mapping itself). */
  readonly method?: string;
}

/** Constructor input (identity is derived, not caller-supplied). */
export interface EvidenceLinkInput {
  readonly subject: EvidenceSubject;
  readonly evidenceId: string;
  readonly linkedBy: string;
  readonly linkedAt: string;
  readonly method?: string;
}

/** Builds and validates one link event (fail closed). */
export function evidenceLink(input: EvidenceLinkInput): EvidenceLink {
  validateSubject(input.subject);
  if (typeof input.evidenceId !== "string" || input.evidenceId.length === 0) {
    throw new EvidenceError("LINK_INVALID", "link.evidenceId must be a non-empty string", {
      details: { field: "evidenceId", value: String(input.evidenceId) },
    });
  }
  requireActor(input.linkedBy, "linkedBy");
  requireTimestamp(input.linkedAt, "linkedAt");
  if (input.method !== undefined) {
    if (typeof input.method !== "string" || !METHOD_PATTERN.test(input.method)) {
      throw new EvidenceError("LINK_INVALID", `link.method must match ${METHOD_PATTERN}: ${String(input.method)}`, {
        details: { field: "method", value: String(input.method) },
      });
    }
  }
  const link: EvidenceLink = {
    linkId: deriveLinkId(input),
    subject: input.subject,
    evidenceId: input.evidenceId,
    linkedBy: input.linkedBy,
    linkedAt: input.linkedAt,
    ...(input.method !== undefined ? { method: input.method } : {}),
  };
  return deepFreeze(link);
}

/** Derives the deterministic link-event identity. */
export function deriveLinkId(input: EvidenceLinkInput): string {
  const hash = canonicalContentHash({
    subject: subjectKey(input.subject),
    evidenceId: input.evidenceId,
    linkedBy: input.linkedBy,
    linkedAt: input.linkedAt,
    ...(input.method !== undefined ? { method: input.method } : {}),
  });
  return `${LINK_ID_PREFIX}${hash.slice(0, ID_HEX_LENGTH)}`;
}

/** Re-validates a link (store boundary; never trusts the caller). */
export function validateLink(link: EvidenceLink): void {
  if (link === null || typeof link !== "object") {
    throw new EvidenceError("LINK_INVALID", "link must be a record", { details: { field: "link" } });
  }
  validateSubject(link.subject);
  if (typeof link.evidenceId !== "string" || link.evidenceId.length === 0) {
    throw new EvidenceError("LINK_INVALID", "link.evidenceId must be a non-empty string", {
      details: { field: "evidenceId", value: String(link.evidenceId) },
    });
  }
  requireActor(link.linkedBy, "linkedBy");
  requireTimestamp(link.linkedAt, "linkedAt");
  if (link.method !== undefined) {
    if (typeof link.method !== "string" || !METHOD_PATTERN.test(link.method)) {
      throw new EvidenceError("LINK_INVALID", `link.method must match ${METHOD_PATTERN}: ${String(link.method)}`, {
        details: { field: "method", value: String(link.method) },
      });
    }
  }
  const derived = deriveLinkId({ ...link });
  if (derived !== link.linkId) {
    throw new EvidenceError("IDENTITY_COLLISION", `link.linkId must be the derived identity: expected ${derived}, found ${String(link.linkId)}`, {
      details: { field: "linkId", value: String(link.linkId), expected: derived },
    });
  }
}

// ---------------------------------------------------------------------------
// Retractions
// ---------------------------------------------------------------------------

/** The retraction of one evidence link (append-only event). */
export interface LinkRetraction {
  readonly linkId: string;
  readonly retractedBy: string;
  readonly retractedAt: string;
  /** Mandatory reason — retractions are consequential acts. */
  readonly reason: string;
}

/** The retraction of one evidence record (append-only event). */
export interface EvidenceRetraction {
  readonly evidenceId: string;
  readonly retractedBy: string;
  readonly retractedAt: string;
  readonly reason: string;
}

/** Builds and validates a link retraction (fail closed). */
export function linkRetraction(retraction: LinkRetraction): LinkRetraction {
  validateLinkRetraction(retraction);
  return deepFreeze({ ...retraction });
}

/** Builds and validates an evidence retraction (fail closed). */
export function evidenceRetraction(retraction: EvidenceRetraction): EvidenceRetraction {
  validateEvidenceRetraction(retraction);
  return deepFreeze({ ...retraction });
}

export function validateLinkRetraction(retraction: LinkRetraction): void {
  if (retraction === null || typeof retraction !== "object") {
    throw new EvidenceError("RETRACTION_INVALID", "link retraction must be a record", {
      details: { field: "retraction" },
    });
  }
  if (typeof retraction.linkId !== "string" || retraction.linkId.length === 0) {
    throw new EvidenceError("RETRACTION_INVALID", "link retraction linkId must be a non-empty string", {
      details: { field: "linkId", value: String(retraction.linkId) },
    });
  }
  requireActor(retraction.retractedBy, "retractedBy", "RETRACTION_INVALID");
  requireTimestamp(retraction.retractedAt, "retractedAt", "RETRACTION_INVALID");
  requireReason(retraction.reason);
}

export function validateEvidenceRetraction(retraction: EvidenceRetraction): void {
  if (retraction === null || typeof retraction !== "object") {
    throw new EvidenceError("RETRACTION_INVALID", "evidence retraction must be a record", {
      details: { field: "retraction" },
    });
  }
  if (typeof retraction.evidenceId !== "string" || retraction.evidenceId.length === 0) {
    throw new EvidenceError("RETRACTION_INVALID", "evidence retraction evidenceId must be a non-empty string", {
      details: { field: "evidenceId", value: String(retraction.evidenceId) },
    });
  }
  requireActor(retraction.retractedBy, "retractedBy", "RETRACTION_INVALID");
  requireTimestamp(retraction.retractedAt, "retractedAt", "RETRACTION_INVALID");
  requireReason(retraction.reason);
}

/**
 * Instant-ordering consistency: a retraction cannot precede the
 * event it retracts (both instants are pattern-validated RFC 3339
 * UTC; equality is allowed — same-instant administrative
 * corrections are honest).
 */
export function assertRetractionNotBefore(
  retractedAt: string,
  createdAt: string,
  context: string,
): void {
  const retractionMs = Date.parse(retractedAt);
  const creationMs = Date.parse(createdAt);
  if (Number.isNaN(retractionMs) || Number.isNaN(creationMs)) {
    throw new EvidenceError("RETRACTION_INVALID", `${context}: unparseable instant`, {
      details: { field: "retractedAt", value: retractedAt },
    });
  }
  if (retractionMs < creationMs) {
    throw new EvidenceError(
      "RETRACTION_INVALID",
      `${context}: retraction instant ${retractedAt} precedes the event it retracts (${createdAt})`,
      { details: { field: "retractedAt", value: retractedAt, created: createdAt } },
    );
  }
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function requireActor(
  value: string,
  field: string,
  code: "LINK_INVALID" | "RETRACTION_INVALID" = "LINK_INVALID",
): void {
  if (typeof value !== "string" || !ACTOR_PATTERN.test(value)) {
    throw new EvidenceError(code, `${field} must match ${ACTOR_PATTERN}: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireTimestamp(
  value: string,
  field: string,
  code: "LINK_INVALID" | "RETRACTION_INVALID" = "LINK_INVALID",
): void {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw new EvidenceError(code, `${field} must be an RFC 3339 UTC timestamp: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function requireReason(value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvidenceError("RETRACTION_INVALID", `retraction reason must be a non-empty string: ${String(value)}`, {
      details: { field: "reason", value: String(value) },
    });
  }
}
