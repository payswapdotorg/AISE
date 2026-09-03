/**
 * Evidence-service composition (AISE-012 backend).
 *
 * Binds the capture adapter, the boundary-verifying store, and
 * the pure validity projection into one service object with
 * bounded-compute defaults:
 *
 * - bounded registration: projects above `maxEvidenceRecords`
 *   (default 10,000) or `maxLinks` (default 50,000) are rejected
 *   (`BOUNDS_EXCEEDED`) — unbounded growth is the store's enemy;
 * - the service adds NO authority of its own: it is transport
 *   and projection. The canonical Reality Graph is never read
 *   for anything except subject resolution and validity
 *   computation, and NEVER written — `computeVersionValidity`
 *   returns a derived report; the graph's immutable history
 *   stands (the no-second-canonical-authority guarantee, proven
 *   by tests: graph digests are bit-identical before and after
 *   every evidence operation);
 * - validity computation is version-pinned: it reads exactly one
 *   committed version's graph and the project's current mapping
 *   snapshot; it is a pure function of those two inputs.
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import {
  assembleEvidenceGraph,
  computeVersionValidity,
  evidenceCoverage,
  evidenceBundleForEntity,
  evidenceLink,
  type EvidenceGraph,
  type EvidenceKind,
  type EvidenceLink,
  type EvidenceRecord,
  type EvidenceSubject,
  type EvidenceCoverageReport,
  type VersionValidityReport,
  type SubjectEvidenceBundle,
} from "@aise/engineering-model";
import { EvidenceServiceError, toEvidenceServiceError } from "./errors.js";
import {
  createInMemoryEvidenceStore,
  type AddLinkResult,
  type EvidenceStore,
  type ModelGraphReader,
  type RegisterEvidenceResult,
  type RetractResult,
  type StoredEvidence,
  type StoredLink,
} from "./store.js";
import { evidenceFromUpload, type CaptureUploadReader } from "./capture.js";

/** Default upper bound on evidence records per project. */
export const DEFAULT_MAX_EVIDENCE_RECORDS = 10_000;
/** Default upper bound on evidence links per project. */
export const DEFAULT_MAX_EVIDENCE_LINKS = 50_000;

/** The evidence service surface. */
export interface EvidenceService {
  /**
   * Registers capture evidence for one committed upload. The
   * binding is read from the capture reader by (sessionId,
   * assetId) — the caller never supplies binding content.
   */
  readonly registerCaptureEvidence: (
    projectId: string,
    upload: { sessionId: string; assetId: string },
    options: { kind?: EvidenceKind; recordedBy: string; notes?: string },
  ) => { result: RegisterEvidenceResult; record: EvidenceRecord };

  /** Registers an already-constructed evidence record. */
  readonly registerEvidence: (
    projectId: string,
    record: EvidenceRecord,
  ) => RegisterEvidenceResult;

  /**
   * Links evidence to one assertion subject. `linkedAt` is the
   * service clock; the subject is verified against the committed
   * model version inside the store boundary.
   */
  readonly linkEvidence: (
    projectId: string,
    subject: EvidenceSubject,
    evidenceId: string,
    options: { linkedBy: string; method?: string; linkedAt?: string },
  ) => AddLinkResult;

  /** Retracts one link (append-only; removal invalidates support). */
  readonly retractLink: (
    projectId: string,
    linkId: string,
    retraction: { retractedBy: string; reason: string; retractedAt?: string },
  ) => RetractResult;

  /** Retracts one evidence record (append-only; final). */
  readonly retractEvidence: (
    projectId: string,
    evidenceId: string,
    retraction: { retractedBy: string; reason: string; retractedAt?: string },
  ) => RetractResult;

  readonly getEvidence: (projectId: string, evidenceId: string) => StoredEvidence | undefined;
  readonly listEvidence: (projectId: string) => readonly StoredEvidence[];
  readonly getLink: (projectId: string, linkId: string) => StoredLink | undefined;
  readonly listLinks: (projectId: string) => readonly StoredLink[];
  readonly linksForSubject: (projectId: string, subject: EvidenceSubject) => readonly EvidenceLink[];
  readonly evidenceForSubject: (projectId: string, subject: EvidenceSubject) => readonly EvidenceRecord[];
  readonly subjectsForEvidence: (projectId: string, evidenceId: string) => readonly EvidenceSubject[];

  /**
   * The verification-validity projection of one committed model
   * version (AC-062/AC-063). Derived read view: the graph is
   * never modified.
   */
  readonly computeVersionValidity: (modelId: string, version: number) => VersionValidityReport;

  /** Per-entity evidence coverage (the AISE-013 completeness input). */
  readonly evidenceCoverage: (modelId: string, version: number) => EvidenceCoverageReport;

  /** The evidence bundle of one entity (the AISE-016 review input). */
  readonly evidenceBundle: (
    modelId: string,
    version: number,
    entityId: string,
  ) => readonly SubjectEvidenceBundle[];

  /** The frozen canonical mapping snapshot (digest included). */
  readonly snapshot: (projectId: string) => EvidenceGraph | undefined;

  readonly limits: {
    readonly maxEvidenceRecords: number;
    readonly maxEvidenceLinks: number;
  };
}

export interface BuildEvidenceServiceOptions {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
  readonly captureReader?: CaptureUploadReader;
  readonly modelReader?: ModelGraphReader;
  readonly store?: EvidenceStore;
  readonly maxEvidenceRecords?: number;
  readonly maxEvidenceLinks?: number;
}

/** Builds the evidence service (fail-closed boot path uses this). */
export function buildEvidenceService(
  config: AiseConfig,
  logger: Logger,
  options: BuildEvidenceServiceOptions = {},
): EvidenceService {
  const now = options.now ?? (() => new Date().toISOString());
  const store =
    options.store ??
    createInMemoryEvidenceStore({
      now,
      ...(options.captureReader !== undefined ? { captureReader: options.captureReader } : {}),
      ...(options.modelReader !== undefined ? { modelReader: options.modelReader } : {}),
    });
  const modelReader = options.modelReader;
  const maxEvidenceRecords = options.maxEvidenceRecords ?? DEFAULT_MAX_EVIDENCE_RECORDS;
  const maxEvidenceLinks = options.maxEvidenceLinks ?? DEFAULT_MAX_EVIDENCE_LINKS;

  if (maxEvidenceRecords < 1 || maxEvidenceLinks < 1) {
    throw new EvidenceServiceError(
      "BOUNDS_EXCEEDED",
      "evidence bounds must be positive (bounded compute is mandatory)",
      { details: { maxEvidenceRecords: String(maxEvidenceRecords), maxEvidenceLinks: String(maxEvidenceLinks) } },
    );
  }

  const graphOf = (modelId: string, version: number) => {
    if (modelReader === undefined) {
      throw new EvidenceServiceError(
        "MODEL_VERSION_NOT_FOUND",
        "no model-graph reader configured (validity computation requires committed model access)",
        { details: { modelId, version: String(version) } },
      );
    }
    const stored = modelReader.getModelGraph(modelId, version);
    if (stored === undefined) {
      throw new EvidenceServiceError(
        "MODEL_VERSION_NOT_FOUND",
        `model ${modelId} version ${String(version)} is not committed`,
        { details: { modelId, version: String(version) } },
      );
    }
    return stored;
  };

  const service: EvidenceService = {
    registerCaptureEvidence: (projectId, upload, registration) => {
      try {
        const view = readUpload(projectId, upload);
        const record = evidenceFromUpload(view, {
          ...(registration.kind !== undefined ? { kind: registration.kind } : {}),
          recordedBy: registration.recordedBy,
          recordedAt: now(),
          ...(registration.notes !== undefined ? { notes: registration.notes } : {}),
        });
        const result = service.registerEvidence(projectId, record);
        return { result, record };
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
    },

    registerEvidence: (projectId, record) => {
      try {
        const counts = store.counts(projectId);
        if (counts.records >= maxEvidenceRecords) {
          throw new EvidenceServiceError(
            "BOUNDS_EXCEEDED",
            `project ${projectId} is at the evidence-record bound (${String(maxEvidenceRecords)})`,
            { details: { projectId, maxEvidenceRecords: String(maxEvidenceRecords) } },
          );
        }
        return store.registerEvidence(projectId, record);
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
    },

    linkEvidence: (projectId, subject, evidenceId, link) => {
      try {
        const counts = store.counts(projectId);
        if (counts.links >= maxEvidenceLinks) {
          throw new EvidenceServiceError(
            "BOUNDS_EXCEEDED",
            `project ${projectId} is at the evidence-link bound (${String(maxEvidenceLinks)})`,
            { details: { projectId, maxEvidenceLinks: String(maxEvidenceLinks) } },
          );
        }
        const record: EvidenceLink = evidenceLink({
          subject,
          evidenceId,
          linkedBy: link.linkedBy,
          linkedAt: link.linkedAt ?? now(),
          ...(link.method !== undefined ? { method: link.method } : {}),
        });
        const result = store.addLink(projectId, record);
        logger.info("evidence.link", {
          projectId,
          linkId: record.linkId,
          evidenceId,
          status: result.status,
        });
        return result;
      } catch (error) {
        throw toEvidenceServiceError(error);
      }
    },

    retractLink: (projectId, linkId, retraction) => {
      const result = store.retractLink(projectId, linkId, retraction);
      logger.info("evidence.link_retracted", { projectId, linkId, status: result.status });
      return result;
    },

    retractEvidence: (projectId, evidenceId, retraction) => {
      const result = store.retractEvidence(projectId, evidenceId, retraction);
      logger.info("evidence.evidence_retracted", { projectId, evidenceId, status: result.status });
      return result;
    },

    getEvidence: (projectId, evidenceId) => store.getEvidence(projectId, evidenceId),
    listEvidence: (projectId) => store.listEvidence(projectId),
    getLink: (projectId, linkId) => store.getLink(projectId, linkId),
    listLinks: (projectId) => store.listLinks(projectId),
    linksForSubject: (projectId, subject) => store.linksForSubject(projectId, subject),
    evidenceForSubject: (projectId, subject) => store.evidenceForSubject(projectId, subject),
    subjectsForEvidence: (projectId, evidenceId) => store.subjectsForEvidence(projectId, evidenceId),

    computeVersionValidity: (modelId, version) => {
      const graph = graphOf(modelId, version);
      const evidence = store.snapshot(graph.projectId);
      if (evidence === undefined) {
        // No mapping at all: every CONFIRMED assertion is
        // invalidated (no live support) — the honest empty case.
        return computeVersionValidity(graph, version, emptyGraphOf(graph.projectId));
      }
      return computeVersionValidity(graph, version, evidence);
    },

    evidenceCoverage: (modelId, version) => {
      const graph = graphOf(modelId, version);
      const evidence = store.snapshot(graph.projectId) ?? emptyGraphOf(graph.projectId);
      return evidenceCoverage(graph, version, evidence);
    },

    evidenceBundle: (modelId, version, entityId) => {
      const graph = graphOf(modelId, version);
      const evidence = store.snapshot(graph.projectId) ?? emptyGraphOf(graph.projectId);
      return evidenceBundleForEntity(graph, version, evidence, entityId);
    },

    snapshot: (projectId) => store.snapshot(projectId),

    limits: {
      maxEvidenceRecords,
      maxEvidenceLinks,
    },
  };

  function readUpload(
    projectId: string,
    upload: { sessionId: string; assetId: string },
  ) {
    if (options.captureReader === undefined) {
      throw new EvidenceServiceError(
        "CAPTURE_UPLOAD_NOT_FOUND",
        "no capture-upload reader configured (capture evidence registration requires ingestion-boundary access)",
        { details: { projectId, sessionId: upload.sessionId, assetId: upload.assetId } },
      );
    }
    const view = options.captureReader.getUpload(upload.sessionId, upload.assetId);
    if (view === undefined) {
      throw new EvidenceServiceError(
        "CAPTURE_UPLOAD_NOT_FOUND",
        `no committed upload for ${upload.sessionId}/${upload.assetId}`,
        { details: { projectId, sessionId: upload.sessionId, assetId: upload.assetId } },
      );
    }
    if (view.projectId !== projectId) {
      throw new EvidenceServiceError(
        "PROJECT_MISMATCH",
        `capture upload ${upload.sessionId}/${upload.assetId} belongs to project ${view.projectId}, not ${projectId}`,
        { details: { uploadProject: view.projectId, projectId } },
      );
    }
    return view;
  }

  return service;
}

/** The empty mapping of a project (the honest no-evidence case). */
function emptyGraphOf(projectId: string) {
  return assembleEvidenceGraph({
    projectId,
    records: [],
    evidenceRetractions: [],
    links: [],
    linkRetractions: [],
  });
}
