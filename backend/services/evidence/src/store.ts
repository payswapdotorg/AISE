/**
 * Evidence persistence store (AISE-012 backend).
 *
 * Holds one project's authoritative provenance mapping: immutable
 * content-pinned evidence records, append-only subject→evidence
 * links, and append-only retraction events. Records, links, and
 * retractions are never mutated or erased — "removing required
 * evidence" is retraction, and retraction is history.
 *
 * Persistence strategy: an in-memory implementation behind a
 * narrow interface of composite (transaction-shaped) operations,
 * following the AISE-001 in-memory placeholder precedent (the
 * AISE-004 capture store, the AISE-008 reconstruction store, the
 * AISE-011 reality-model store). Durable evidence storage is
 * deferred; when it arrives it must preserve these operation
 * semantics.
 *
 * Boundary discipline (the AISE-008 lesson, hardened in the PR #9
 * review): **the store does not trust the caller.**
 *
 * - `registerEvidence` re-derives the record's identity and
 *   content hash from its asserted content — a tampered or
 *   forged record (wrong id, wrong hash, drift) throws and
 *   nothing is stored.
 * - A capture-bound record is verified against the INJECTED
 *   upload reader: the upload must exist, belong to the same
 *   project (tenant integrity), and every binding field (the
 *   server-computed received hash, byte size, package, mime
 *   type, acquisition captured-at) must match what the ingestion
 *   boundary recorded — the caller cannot claim a different
 *   source than what was ingested.
 * - `addLink` resolves the link's subject against the INJECTED
 *   model-graph reader: the model version must exist, the
 *   assertion subject must resolve inside the committed graph,
 *   and the graph's project must match the store's project
 *   (cross-project links are rejected — tenant integrity).
 *   The link's identity is re-derived; live-link idempotency and
 *   retracted-event collision follow deterministic rules.
 * - Idempotency: registering the identical record again returns
 *   `exists_identical`; replaying the identical link event
 *   returns `already_present`; re-retracting returns
 *   `already_retracted`.
 */
import {
  assertRetractionNotBefore,
  deriveEvidenceId,
  evidenceRetraction as buildEvidenceRetraction,
  linkRetraction as buildLinkRetraction,
  liveLinks,
  liveRecords,
  recordContentHash,
  resolveSubject,
  subjectsForEvidence as liveSubjectsForEvidence,
  subjectKey,
  validateLink,
  assembleEvidenceGraph,
  type EvidenceGraph,
  type EvidenceLink,
  type EvidenceRecord,
  type EvidenceRetraction,
  type EvidenceSubject,
  type LinkRetraction,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { EvidenceServiceError, toEvidenceServiceError } from "./errors.js";
import type { CaptureUploadReader } from "./capture.js";

/** Reader of committed reality-model versions (injected; structural). */
export interface ModelGraphReader {
  /** The committed graph of one version, or undefined when absent. */
  getModelGraph(modelId: string, version: number): RealityModelGraph | undefined;
}

/** Result of registering evidence. */
export interface RegisterEvidenceResult {
  readonly status: "created" | "exists_identical" | "exists_conflict";
}

/** Result of adding a link. */
export interface AddLinkResult {
  readonly status: "added" | "already_present" | "retracted_collision";
}

/** Result of a retraction. */
export interface RetractResult {
  readonly status: "retracted" | "already_retracted" | "not_found";
}

/** One registered evidence record with its live state. */
export interface StoredEvidence {
  readonly record: EvidenceRecord;
  /** The retraction event when the record was removed. */
  readonly retraction?: EvidenceRetraction;
}

/** One stored link with its live state. */
export interface StoredLink {
  readonly link: EvidenceLink;
  /** The retraction event when the link was removed. */
  readonly retraction?: LinkRetraction;
}

export interface EvidenceStore {
  /** Stable description for observability. */
  readonly kind: string;
  /** RFC 3339 timestamp provider (injectable for tests). */
  now(): string;

  /**
   * Registers one evidence record. The boundary re-derives
   * identity and content hash, and verifies capture bindings
   * against the upload reader before anything is stored.
   */
  registerEvidence(projectId: string, record: EvidenceRecord): RegisterEvidenceResult;

  /** Retracts one evidence record (append-only; final). */
  retractEvidence(
    projectId: string,
    evidenceId: string,
    retraction: { retractedBy: string; reason: string; retractedAt?: string },
  ): RetractResult;

  /**
   * Adds one evidence→subject link. The boundary re-derives the
   * link identity, resolves the subject against the committed
   * model version, and enforces the project boundary before
   * anything is stored.
   */
  addLink(projectId: string, link: EvidenceLink): AddLinkResult;

  /** Retracts one link (append-only; re-attachment is a new event). */
  retractLink(
    projectId: string,
    linkId: string,
    retraction: { retractedBy: string; reason: string; retractedAt?: string },
  ): RetractResult;

  getEvidence(projectId: string, evidenceId: string): StoredEvidence | undefined;
  listEvidence(projectId: string): readonly StoredEvidence[];
  getLink(projectId: string, linkId: string): StoredLink | undefined;
  listLinks(projectId: string): readonly StoredLink[];
  /** Live links for one subject (retracted links excluded). */
  linksForSubject(projectId: string, subject: EvidenceSubject): readonly EvidenceLink[];
  /** Live evidence records attached to one subject. */
  evidenceForSubject(projectId: string, subject: EvidenceSubject): readonly EvidenceRecord[];
  /** Subjects with at least one live link to one evidence record. */
  subjectsForEvidence(projectId: string, evidenceId: string): readonly EvidenceSubject[];
  /** The frozen canonical mapping snapshot (digest included). */
  snapshot(projectId: string): EvidenceGraph | undefined;
  /** Mapping cardinalities (bounded-compute observability). */
  counts(projectId: string): { records: number; links: number; evidenceRetractions: number; linkRetractions: number };
}

interface ProjectState {
  readonly records: Map<string, StoredEvidence>;
  readonly links: Map<string, StoredLink>;
}

export interface InMemoryEvidenceStoreOptions {
  readonly now?: () => string;
  /** Upload reader for capture-boundary verification (required for capture-bound records). */
  readonly captureReader?: CaptureUploadReader;
  /** Model-version reader for subject verification. */
  readonly modelReader?: ModelGraphReader;
}

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Creates a process-local in-memory evidence store. Lost on
 * restart — a documented v1.0 limitation, not a durability
 * claim.
 */
export function createInMemoryEvidenceStore(
  options: InMemoryEvidenceStoreOptions = {},
): EvidenceStore {
  const now = options.now ?? (() => new Date().toISOString());
  const projects = new Map<string, ProjectState>();

  function stateOf(projectId: string): ProjectState {
    if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) {
      throw new EvidenceServiceError("EVIDENCE_INVALID", `projectId must match ${PROJECT_ID_PATTERN}: ${String(projectId)}`, {
        details: { field: "projectId", value: String(projectId) },
      });
    }
    let state = projects.get(projectId);
    if (state === undefined) {
      state = { records: new Map(), links: new Map() };
      projects.set(projectId, state);
    }
    return state;
  }

  return {
    kind: "in-memory evidence store",

    now,

    registerEvidence: (projectId, record) => {
      const state = stateOf(projectId);
      try {
        // Boundary rule 1: identity and content are re-derived —
        // the caller's id/hash claims are checked, never trusted.
        const derivedId = deriveEvidenceId(record.kind, record.source);
        if (derivedId !== record.evidenceId) {
          throw new EvidenceServiceError(
            "IDENTITY_COLLISION",
            `record identity must be the derived identity: expected ${derivedId}, found ${String(record.evidenceId)}`,
            { details: { field: "evidenceId", value: String(record.evidenceId), expected: derivedId } },
          );
        }
        const derivedHash = recordContentHash(record.kind, record.source);
        if (derivedHash !== record.contentHash) {
          throw new EvidenceServiceError(
            "IDENTITY_COLLISION",
            `record contentHash must match its content: expected ${derivedHash}, found ${String(record.contentHash)}`,
            { details: { field: "contentHash", value: String(record.contentHash), expected: derivedHash } },
          );
        }

        // Boundary rule 2: capture-bound records are verified
        // against the ingestion boundary's own record.
        if (record.source.kind === "capture") {
          verifyCaptureBinding(projectId, record);
        }

        const existing = state.records.get(record.evidenceId);
        if (existing !== undefined) {
          return existing.record.contentHash === record.contentHash
            ? { status: "exists_identical" }
            : { status: "exists_conflict" };
        }
        state.records.set(record.evidenceId, { record });
        return { status: "created" };
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
    },

    retractEvidence: (projectId, evidenceId, retraction) => {
      const state = stateOf(projectId);
      const stored = state.records.get(evidenceId);
      if (stored === undefined) {
        return { status: "not_found" };
      }
      if (stored.retraction !== undefined) {
        return { status: "already_retracted" };
      }
      let event: EvidenceRetraction;
      try {
        event = buildEvidenceRetraction({
          evidenceId,
          retractedBy: retraction.retractedBy,
          retractedAt: retraction.retractedAt ?? now(),
          reason: retraction.reason,
        });
        assertRetractionNotBefore(event.retractedAt, stored.record.recordedAt, "evidence retraction");
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
      state.records.set(evidenceId, { record: stored.record, retraction: event });
      return { status: "retracted" };
    },

    addLink: (projectId, link) => {
      const state = stateOf(projectId);
      try {
        // Boundary rule 1: the link is re-validated and its
        // identity re-derived (validateLink checks both).
        validateLink(link);

        // Boundary rule 2: the target evidence must be registered
        // and live (retracted evidence provides no support).
        const target = state.records.get(link.evidenceId);
        if (target === undefined) {
          throw new EvidenceServiceError(
            "EVIDENCE_NOT_FOUND",
            `link ${link.linkId} targets unregistered evidence ${link.evidenceId}`,
            { details: { field: "evidenceId", value: link.evidenceId, linkId: link.linkId } },
          );
        }
        if (target.retraction !== undefined) {
          throw new EvidenceServiceError(
            "EVIDENCE_RETRACTED",
            `link ${link.linkId} targets retracted evidence ${link.evidenceId} (retraction is final — re-attaching requires new evidence content, hence a new identity)`,
            { details: { field: "evidenceId", value: link.evidenceId, linkId: link.linkId } },
          );
        }

        // Boundary rule 3: the subject must resolve inside the
        // committed model version, in the same project.
        verifySubject(projectId, link);

        const existing = state.links.get(link.linkId);
        if (existing !== undefined) {
          if (existing.retraction === undefined) {
            return { status: "already_present" };
          }
          // The identical event was retracted before: replaying it
          // cannot resurrect it — a deliberate re-attachment is a
          // NEW event (different linkedAt/linkedBy → new identity).
          throw new EvidenceServiceError(
            "IDENTITY_COLLISION",
            `link ${link.linkId} re-uses a retracted event identity — re-attach with a new link event (different linkedBy or linkedAt)`,
            { details: { field: "linkId", value: link.linkId } },
          );
        }
        state.links.set(link.linkId, { link });
        return { status: "added" };
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
    },

    retractLink: (projectId, linkId, retraction) => {
      const state = stateOf(projectId);
      const stored = state.links.get(linkId);
      if (stored === undefined) {
        return { status: "not_found" };
      }
      if (stored.retraction !== undefined) {
        return { status: "already_retracted" };
      }
      let event: LinkRetraction;
      try {
        event = buildLinkRetraction({
          linkId,
          retractedBy: retraction.retractedBy,
          retractedAt: retraction.retractedAt ?? now(),
          reason: retraction.reason,
        });
        assertRetractionNotBefore(event.retractedAt, stored.link.linkedAt, "link retraction");
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
      state.links.set(linkId, { link: stored.link, retraction: event });
      return { status: "retracted" };
    },

    getEvidence: (projectId, evidenceId) => stateOf(projectId).records.get(evidenceId),

    listEvidence: (projectId) =>
      [...stateOf(projectId).records.values()].sort((a, b) =>
        a.record.evidenceId < b.record.evidenceId ? -1 : a.record.evidenceId > b.record.evidenceId ? 1 : 0,
      ),

    getLink: (projectId, linkId) => stateOf(projectId).links.get(linkId),

    listLinks: (projectId) =>
      [...stateOf(projectId).links.values()].sort((a, b) =>
        a.link.linkId < b.link.linkId ? -1 : a.link.linkId > b.link.linkId ? 1 : 0,
      ),

    linksForSubject: (projectId, subject) => {
      const graph = buildSnapshot(stateOf(projectId), projectId);
      if (graph === undefined) {
        return [];
      }
      const key = subjectKey(subject);
      return liveLinks(graph).filter((link) => subjectKey(link.subject) === key);
    },

    evidenceForSubject: (projectId, subject) => {
      const graph = buildSnapshot(stateOf(projectId), projectId);
      if (graph === undefined) {
        return [];
      }
      const key = subjectKey(subject);
      const live = new Set(
        liveLinks(graph).filter((link) => subjectKey(link.subject) === key).map((link) => link.evidenceId),
      );
      return liveRecords(graph).filter((record) => live.has(record.evidenceId));
    },

    subjectsForEvidence: (projectId, evidenceId) => {
      const graph = buildSnapshot(stateOf(projectId), projectId);
      if (graph === undefined) {
        return [];
      }
      // The model layer owns the inverse-mapping semantics (live
      // links to live evidence); the store delegates rather than
      // re-deriving them.
      return liveSubjectsForEvidence(graph, evidenceId);
    },

    snapshot: (projectId) => buildSnapshot(stateOf(projectId), projectId),

    counts: (projectId) => {
      const state = stateOf(projectId);
      return {
        records: state.records.size,
        links: state.links.size,
        evidenceRetractions: [...state.records.values()].filter((entry) => entry.retraction !== undefined).length,
        linkRetractions: [...state.links.values()].filter((entry) => entry.retraction !== undefined).length,
      };
    },
  };

  // -----------------------------------------------------------------------
  // Boundary verifications
  // -----------------------------------------------------------------------

  function verifyCaptureBinding(projectId: string, record: EvidenceRecord): void {
    const source = record.source;
    if (source.kind !== "capture") {
      return;
    }
    if (options.captureReader === undefined) {
      throw new EvidenceServiceError(
        "CAPTURE_BINDING_INVALID",
        "capture-bound evidence requires a configured upload reader (boundary verification is mandatory, not optional)",
        { details: { field: "source.kind", value: "capture", evidenceId: record.evidenceId } },
      );
    }
    const upload = options.captureReader.getUpload(source.sessionId, source.assetId);
    if (upload === undefined) {
      throw new EvidenceServiceError(
        "CAPTURE_UPLOAD_NOT_FOUND",
        `no committed upload for ${source.sessionId}/${source.assetId} — evidence cannot bind to un-ingested content`,
        { details: { sessionId: source.sessionId, assetId: source.assetId } },
      );
    }
    if (upload.projectId !== projectId) {
      throw new EvidenceServiceError(
        "PROJECT_MISMATCH",
        `capture upload ${source.sessionId}/${source.assetId} belongs to project ${upload.projectId}, not ${projectId} (tenant boundary)`,
        { details: { uploadProject: upload.projectId, projectId } },
      );
    }
    if (upload.assetType !== source.assetType) {
      throw new EvidenceServiceError(
        "CAPTURE_BINDING_INVALID",
        `capture binding assetType ${source.assetType} disagrees with the ingested upload (${upload.assetType})`,
        { details: { field: "assetType", value: source.assetType, uploaded: upload.assetType } },
      );
    }
    if (upload.receivedHash !== source.contentHash) {
      throw new EvidenceServiceError(
        "CAPTURE_BINDING_INVALID",
        `capture binding hash ${source.contentHash} disagrees with the ingestion boundary's received hash ${upload.receivedHash}`,
        { details: { field: "contentHash", value: source.contentHash, received: upload.receivedHash } },
      );
    }
    if (upload.packageId !== source.packageId) {
      throw new EvidenceServiceError(
        "CAPTURE_BINDING_INVALID",
        `capture binding packageId ${source.packageId} disagrees with the ingested upload (${upload.packageId})`,
        { details: { field: "packageId", value: source.packageId, uploaded: upload.packageId } },
      );
    }
    if (upload.byteSize !== source.byteSize) {
      throw new EvidenceServiceError(
        "CAPTURE_BINDING_INVALID",
        `capture binding byteSize ${String(source.byteSize)} disagrees with the ingested upload (${String(upload.byteSize)})`,
        { details: { field: "byteSize", value: String(source.byteSize), uploaded: String(upload.byteSize) } },
      );
    }
    if (upload.acquisition.capturedAt !== source.acquisition.capturedAt) {
      throw new EvidenceServiceError(
        "CAPTURE_BINDING_INVALID",
        `capture binding capturedAt ${source.acquisition.capturedAt} disagrees with the ingested upload (${upload.acquisition.capturedAt})`,
        { details: { field: "capturedAt", value: source.acquisition.capturedAt, uploaded: upload.acquisition.capturedAt } },
      );
    }
  }

  function verifySubject(projectId: string, link: EvidenceLink): void {
    if (options.modelReader === undefined) {
      throw new EvidenceServiceError(
        "SUBJECT_INVALID",
        "evidence links require a configured model-graph reader (subject verification is mandatory, not optional)",
        { details: { field: "subject", value: subjectKey(link.subject) } },
      );
    }
    const graph = options.modelReader.getModelGraph(link.subject.modelId, link.subject.version);
    if (graph === undefined) {
      throw new EvidenceServiceError(
        "MODEL_VERSION_NOT_FOUND",
        `model ${link.subject.modelId} version ${String(link.subject.version)} is not committed — links target committed assertions only`,
        { details: { modelId: link.subject.modelId, version: String(link.subject.version) } },
      );
    }
    if (graph.projectId !== projectId) {
      throw new EvidenceServiceError(
        "PROJECT_MISMATCH",
        `model ${link.subject.modelId} belongs to project ${graph.projectId}, not ${projectId} (tenant boundary)`,
        { details: { modelProject: graph.projectId, projectId } },
      );
    }
    const resolved = resolveSubject(link.subject, graph);
    if (resolved === undefined) {
      throw new EvidenceServiceError(
        "SUBJECT_NOT_FOUND",
        `subject does not resolve in model ${link.subject.modelId} v${String(link.subject.version)}`,
        { details: { subject: subjectKey(link.subject) } },
      );
    }
  }

  function buildSnapshot(state: ProjectState, projectId: string): EvidenceGraph | undefined {
    if (state.records.size === 0 && state.links.size === 0) {
      return undefined;
    }
    const evidenceRetractions: EvidenceRetraction[] = [];
    for (const stored of state.records.values()) {
      if (stored.retraction !== undefined) {
        evidenceRetractions.push(stored.retraction);
      }
    }
    const linkRetractions: LinkRetraction[] = [];
    for (const stored of state.links.values()) {
      if (stored.retraction !== undefined) {
        linkRetractions.push(stored.retraction);
      }
    }
    return assembleEvidenceGraph({
      projectId,
      records: [...state.records.values()].map((stored) => stored.record),
      evidenceRetractions,
      links: [...state.links.values()].map((stored) => stored.link),
      linkRetractions,
    });
  }
};
