/**
 * The evidence graph: one project's authoritative provenance
 * mapping (AISE-012).
 *
 * The aggregate is the current state of the mapping built from
 * append-only events:
 *
 * ```text
 * EvidenceGraph
 *   ├── records            (immutable, content-pinned sources)
 *   ├── evidenceRetractions (append-only removal events)
 *   ├── links              (subject → evidence attachments)
 *   └── linkRetractions     (append-only removal events)
 * ```
 *
 * Assembly (`assembleEvidenceGraph`) is the fail-closed
 * constructor: every record, link, and retraction is fully
 * re-validated; referential integrity holds (links cite
 * registered evidence, retractions cite existing events);
 * duplicate identities fail closed; the content is canonically
 * ordered (order is content — any input order yields the
 * identical digest); the digest is computed; the result is
 * deep-frozen.
 *
 * The no-second-authority guarantee is structural: this
 * aggregate carries ONLY sources and the mapping — no assertion
 * values, no geometry, no epistemic state. A source-scan test
 * enforces that discipline on the serialized form.
 */
import { EvidenceError } from "./errors.js";
import { canonicalContentHash } from "../canonical.js";
import { deepFreeze } from "../identity.js";
import {
  validateLink,
  validateEvidenceRetraction,
  validateLinkRetraction,
  type EvidenceLink,
  type EvidenceRetraction,
  type LinkRetraction,
} from "./links.js";
import {
  validateSubject,
  subjectKey,
  type EvidenceSubject,
} from "./subjects.js";
import type { EvidenceRecord } from "./records.js";

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** One project's evidence-mapping state (canonical, frozen). */
export interface EvidenceGraph {
  readonly projectId: string;
  /** Registered evidence records, canonical order (evidenceId). */
  readonly records: readonly EvidenceRecord[];
  /** Evidence-record retractions, canonical order (evidenceId, retractedAt). */
  readonly evidenceRetractions: readonly EvidenceRetraction[];
  /** Evidence links, canonical order (linkId). */
  readonly links: readonly EvidenceLink[];
  /** Link retractions, canonical order (linkId, retractedAt). */
  readonly linkRetractions: readonly LinkRetraction[];
  /** Canonical content hash of the ordered mapping state. */
  readonly digest: string;
}

/** Input for `assembleEvidenceGraph` (current state, any order). */
export interface AssembleEvidenceGraphInput {
  readonly projectId: string;
  readonly records: readonly EvidenceRecord[];
  readonly evidenceRetractions: readonly EvidenceRetraction[];
  readonly links: readonly EvidenceLink[];
  readonly linkRetractions: readonly LinkRetraction[];
}

/** Live-state view of one link or record (retraction still in history). */
export interface LiveEntry<T> {
  readonly entry: T;
  /** The retraction event when this entry was removed. */
  readonly retraction?: LinkRetraction | EvidenceRetraction;
}

/**
 * Assembles one project's evidence graph: validates every event,
 * checks mapping integrity, orders canonically, computes the
 * digest, and deep-freezes the result.
 */
export function assembleEvidenceGraph(input: AssembleEvidenceGraphInput): EvidenceGraph {
  if (typeof input.projectId !== "string" || !ID_PATTERN.test(input.projectId)) {
    throw new EvidenceError("MAPPING_INVALID", `projectId must match ${ID_PATTERN}: ${String(input.projectId)}`, {
      details: { field: "projectId", value: String(input.projectId) },
    });
  }

  // --- Records: unique identities, validated -----------------------------
  const recordById = new Map<string, EvidenceRecord>();
  for (const record of input.records) {
    if (record === null || typeof record !== "object") {
      throw new EvidenceError("MAPPING_INVALID", "evidence records must be records", {
        details: { field: "records" },
      });
    }
    const derivedHash = canonicalContentHash({ kind: record.kind, source: record.source });
    if (derivedHash !== record.contentHash) {
      throw new EvidenceError("MAPPING_INVALID", `record ${String(record.evidenceId)} contentHash does not match its content`, {
        details: { field: "contentHash", value: String(record.contentHash), evidenceId: String(record.evidenceId) },
      });
    }
    if (recordById.has(record.evidenceId)) {
      throw new EvidenceError("IDENTITY_COLLISION", `duplicate evidence record identity ${record.evidenceId}`, {
        details: { field: "evidenceId", value: record.evidenceId },
      });
    }
    recordById.set(record.evidenceId, record);
  }

  // --- Evidence retractions: cite existing records, at most one ----------
  const retractedEvidence = new Set<string>();
  for (const retraction of input.evidenceRetractions) {
    validateEvidenceRetraction(retraction);
    const record = recordById.get(retraction.evidenceId);
    if (record === undefined) {
      throw new EvidenceError("MAPPING_INVALID", `evidence retraction cites unknown record ${retraction.evidenceId}`, {
        details: { field: "evidenceId", value: retraction.evidenceId },
      });
    }
    if (retractedEvidence.has(retraction.evidenceId)) {
      throw new EvidenceError("MAPPING_INVALID", `duplicate retraction for evidence ${retraction.evidenceId} (retraction is final)`, {
        details: { field: "evidenceId", value: retraction.evidenceId },
      });
    }
    assertInstantNotBefore(retraction.retractedAt, record.recordedAt, "evidence retraction");
    retractedEvidence.add(retraction.evidenceId);
  }

  // --- Links: validated, unique identities, targets registered ----------
  const linkById = new Map<string, EvidenceLink>();
  for (const link of input.links) {
    validateLink(link);
    if (recordById.get(link.evidenceId) === undefined) {
      throw new EvidenceError("EVIDENCE_NOT_FOUND", `link ${link.linkId} cites unregistered evidence ${link.evidenceId}`, {
        details: { field: "evidenceId", value: link.evidenceId, linkId: link.linkId },
      });
    }
    if (linkById.has(link.linkId)) {
      throw new EvidenceError("IDENTITY_COLLISION", `duplicate link identity ${link.linkId}`, {
        details: { field: "linkId", value: link.linkId },
      });
    }
    linkById.set(link.linkId, link);
  }

  // --- Link retractions: cite existing links, at most one ----------------
  const retractedLinks = new Set<string>();
  for (const retraction of input.linkRetractions) {
    validateLinkRetraction(retraction);
    const link = linkById.get(retraction.linkId);
    if (link === undefined) {
      throw new EvidenceError("MAPPING_INVALID", `link retraction cites unknown link ${retraction.linkId}`, {
        details: { field: "linkId", value: retraction.linkId },
      });
    }
    if (retractedLinks.has(retraction.linkId)) {
      throw new EvidenceError("MAPPING_INVALID", `duplicate retraction for link ${retraction.linkId} (retraction is final)`, {
        details: { field: "linkId", value: retraction.linkId },
      });
    }
    assertInstantNotBefore(retraction.retractedAt, link.linkedAt, "link retraction");
    retractedLinks.add(retraction.linkId);
  }

  // --- Canonical ordering (order is content — normalized) ----------------
  const orderedRecords = [...input.records].sort((a, b) => compare(a.evidenceId, b.evidenceId));
  const orderedEvidenceRetractions = [...input.evidenceRetractions].sort(
    (a, b) => compare(a.evidenceId, b.evidenceId) || compare(a.retractedAt, b.retractedAt),
  );
  const orderedLinks = [...input.links].sort((a, b) => compare(a.linkId, b.linkId));
  const orderedLinkRetractions = [...input.linkRetractions].sort(
    (a, b) => compare(a.linkId, b.linkId) || compare(a.retractedAt, b.retractedAt),
  );

  const digest = canonicalContentHash({
    projectId: input.projectId,
    records: orderedRecords,
    evidenceRetractions: orderedEvidenceRetractions,
    links: orderedLinks,
    linkRetractions: orderedLinkRetractions,
  });

  const graph: EvidenceGraph = {
    projectId: input.projectId,
    records: Object.freeze([...orderedRecords]),
    evidenceRetractions: Object.freeze([...orderedEvidenceRetractions]),
    links: Object.freeze([...orderedLinks]),
    linkRetractions: Object.freeze([...orderedLinkRetractions]),
    digest,
  };
  return deepFreeze(graph);
}

// ---------------------------------------------------------------------------
// Live-state computation (retractions remove; history remains)
// ---------------------------------------------------------------------------

/** The live links (not retracted) of the mapping. */
export function liveLinks(graph: EvidenceGraph): readonly EvidenceLink[] {
  const retracted = new Set(graph.linkRetractions.map((retraction) => retraction.linkId));
  return graph.links.filter((link) => !retracted.has(link.linkId));
}

/** The live evidence records (not retracted) of the mapping. */
export function liveRecords(graph: EvidenceGraph): readonly EvidenceRecord[] {
  const retracted = new Set(graph.evidenceRetractions.map((retraction) => retraction.evidenceId));
  return graph.records.filter((record) => !retracted.has(record.evidenceId));
}

/** Whether an evidence record is registered and not retracted. */
export function isEvidenceLive(graph: EvidenceGraph, evidenceId: string): boolean {
  return (
    graph.records.some((record) => record.evidenceId === evidenceId) &&
    !graph.evidenceRetractions.some((retraction) => retraction.evidenceId === evidenceId)
  );
}

/** The live links attached to one subject. */
export function liveLinksForSubject(graph: EvidenceGraph, subject: EvidenceSubject): readonly EvidenceLink[] {
  validateSubject(subject);
  const key = subjectKey(subject);
  return liveLinks(graph).filter((link) => subjectKey(link.subject) === key);
}

/** The live evidence records attached to one subject (via live links). */
export function liveEvidenceForSubject(graph: EvidenceGraph, subject: EvidenceSubject): readonly EvidenceRecord[] {
  const live = new Set(liveLinksForSubject(graph, subject).map((link) => link.evidenceId));
  return liveRecords(graph).filter((record) => live.has(record.evidenceId));
}

/**
 * The subjects with at least one live link to one LIVE (non-retracted)
 * evidence record. This is the exact inverse of
 * `liveEvidenceForSubject`: a subject is attached to an evidence
 * record iff that record is in the subject's live support.
 */
export function subjectsForEvidence(graph: EvidenceGraph, evidenceId: string): readonly EvidenceSubject[] {
  if (!isEvidenceLive(graph, evidenceId)) {
    return [];
  }
  const subjects = liveLinks(graph)
    .filter((link) => link.evidenceId === evidenceId)
    .map((link) => link.subject);
  const seen = new Set<string>();
  const unique: EvidenceSubject[] = [];
  for (const subject of subjects) {
    const key = subjectKey(subject);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(subject);
    }
  }
  return unique.sort((a, b) => compare(subjectKey(a), subjectKey(b)));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertInstantNotBefore(instant: string, notBefore: string, context: string): void {
  const instantMs = Date.parse(instant);
  const beforeMs = Date.parse(notBefore);
  if (instantMs < beforeMs) {
    throw new EvidenceError("MAPPING_INVALID", `${context} instant ${instant} precedes the event it retracts (${notBefore})`, {
      details: { field: "retractedAt", value: instant, created: notBefore },
    });
  }
}
