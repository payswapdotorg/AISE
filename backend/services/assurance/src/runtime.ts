/**
 * Assurance-service composition (AISE-013 backend).
 *
 * Binds the task-profile store, the append-only assessment
 * store, the model-graph reader port, and the evidence-mapping
 * reader port into one service object:
 *
 * - bounded compute: assessed versions above `maxAssertions`
 *   (default 50,000 assertions) are rejected (`BOUNDS_EXCEEDED`)
 *   — unbounded report growth is the store's enemy;
 * - the service adds NO authority over model content: it reads
 *   committed graphs and the current mapping, computes a PURE
 *   derived report, and records it. The Reality Graph and the
 *   evidence mapping are never written (no second authority —
 *   proven by tests: digests are bit-identical before and after
 *   every assurance operation);
 * - every assessment is version-pinned and content-pinned: the
 *   report pins (modelId, version, graphDigest, mappingDigest,
 *   taskId, profileDigest); re-assessment recomputes from
 *   current inputs — identical content is idempotent, changed
 *   mapping appends (history preserved, prior records remain
 *   discoverable);
 * - `latestAssessment` reports staleness honestly: a record whose
 *   mapping pin no longer matches the project's current mapping
 *   is `stale` — the assessment described a past mapping state.
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import { toAssuranceError, AssuranceError } from "./errors.js";
import {
  createInMemoryAssuranceStore,
  emptyMapping,
  DEFAULT_MAX_ASSERTIONS,
  type AssuranceStore,
  type EvidenceMappingReader,
  type ModelGraphReader,
  type ReadinessAssessmentRecord,
  type RegisterProfileResult,
  type RecordAssessmentResult,
} from "./store.js";
import {
  computeReadiness,
  readinessReportDigest,
  type ReadinessReport,
} from "./readiness.js";
import type { TaskProfileInput, TaskProfileRecord } from "./profile.js";

/** The assurance service surface. */
export interface AssuranceService {
  /** Registers (declares) one task profile — immutable, content-pinned. */
  readonly registerTaskProfile: (
    projectId: string,
    input: TaskProfileInput,
  ) => RegisterProfileResult;

  readonly getTaskProfile: (projectId: string, taskId: string) => TaskProfileRecord | undefined;
  readonly listTaskProfiles: (projectId: string) => readonly TaskProfileRecord[];

  /**
   * Assesses one committed model version against one declared
   * task profile and records the result (append-only; identical
   * content is idempotent). Fail-closed: invalid profiles,
   * unknown versions, project mismatch, tampered graphs/mappings,
   * and exceeded bounds throw — a verdict is never produced over
   * unverifiable inputs.
   */
  readonly assessModelVersion: (
    projectId: string,
    request: { modelId: string; version: number; taskId: string; assessedBy: string },
  ) => { status: "recorded" | "already_present"; record: ReadinessAssessmentRecord; report: ReadinessReport };

  /**
   * The latest assessment of one (model, version, task) with an
   * honest staleness flag: `stale` when the project's current
   * evidence mapping no longer matches the mapping the
   * assessment was computed against.
   */
  readonly latestAssessment: (
    projectId: string,
    modelId: string,
    version: number,
    taskId: string,
  ) => { record: ReadinessAssessmentRecord; stale: boolean } | undefined;

  /** Full assessment history (append order), filtered. */
  readonly assessmentHistory: (
    projectId: string,
    filter: { modelId: string; version: number; taskId: string },
  ) => readonly ReadinessAssessmentRecord[];

  readonly limits: { readonly maxAssertions: number; readonly maxTaskProfiles: number; readonly maxAssessments: number };
}

export interface BuildAssuranceServiceOptions {
  /** Committed-graph reader (the reality-model boundary). */
  readonly modelReader: ModelGraphReader;
  /** Current-mapping reader (the evidence boundary). */
  readonly evidenceReader: EvidenceMappingReader;
  /** Store override (tests inject fixed clocks / bounds). */
  readonly store?: AssuranceStore;
  /** Assertion-count bound override (tests inject small bounds). */
  readonly maxAssertions?: number;
}

export function buildAssuranceService(
  config: AiseConfig,
  logger: Logger,
  options: BuildAssuranceServiceOptions,
): AssuranceService {
  const { modelReader, evidenceReader } = options;
  const maxAssertions = options.maxAssertions ?? defaultMaxAssertions(config);
  const maxTaskProfiles = defaultMaxTaskProfiles(config);
  const maxAssessments = defaultMaxAssessments(config);
  const store =
    options.store ??
    createInMemoryAssuranceStore({
      maxTaskProfiles,
      maxAssessments,
    });

  logger.info("assurance.service.built", {
    store: store.kind,
    maxAssertions,
    maxTaskProfiles,
    maxAssessments,
    note: "task-specific model-readiness authority: profile registration, assessment, history; reads committed graphs and the current evidence mapping, writes neither",
  });

  return {
    registerTaskProfile(projectId, input) {
      const result = store.registerProfile(projectId, input);
      logger.info("assurance.profile.registered", {
        projectId,
        taskId: result.record.taskId,
        profile: result.record.profile,
        intent: result.record.intent,
        status: result.status,
      });
      return result;
    },

    getTaskProfile: (projectId, taskId) => store.getProfile(projectId, taskId),
    listTaskProfiles: (projectId) => store.listProfiles(projectId),

    assessModelVersion(projectId, request) {
      const profile = store.getProfile(projectId, request.taskId);
      if (profile === undefined) {
        throw new AssuranceError(
          "TASK_NOT_FOUND",
          `task profile "${request.taskId}" is not registered for project "${projectId}"`,
          { details: { field: "taskId", value: request.taskId } },
        );
      }
      const graph = modelReader.getModelGraph(request.modelId, request.version);
      if (graph === undefined) {
        throw new AssuranceError(
          "MODEL_NOT_FOUND",
          `model "${request.modelId}" version ${request.version} is not committed`,
          { details: { field: "version", value: String(request.version) } },
        );
      }
      if (graph.projectId !== projectId) {
        throw new AssuranceError(
          "PROJECT_MISMATCH",
          `model "${request.modelId}" belongs to project "${graph.projectId}", not "${projectId}"`,
          { details: { field: "projectId", value: projectId } },
        );
      }
      const assertionCount = countAssertions(graph);
      if (assertionCount > maxAssertions) {
        throw new AssuranceError(
          "BOUNDS_EXCEEDED",
          `model "${request.modelId}" v${request.version} carries ${assertionCount} assertions (max ${maxAssertions})`,
          { details: { field: "assertionCount", value: String(assertionCount) } },
        );
      }

      const liveMapping = evidenceReader.getMapping(projectId);
      const mapping = liveMapping ?? emptyMapping(projectId);
      const mappingPresent = liveMapping !== undefined;

      let report: ReadinessReport;
      try {
        report = computeReadiness({
          graph,
          version: request.version,
          mapping,
          mappingPresent,
          profile,
        });
      } catch (error) {
        throw toAssuranceError(error, `assessment of ${request.modelId} v${request.version}`);
      }

      const result: RecordAssessmentResult = store.recordAssessment(projectId, {
        modelId: request.modelId,
        version: request.version,
        taskId: request.taskId,
        report,
        assessedBy: request.assessedBy,
      });
      logger.info("assurance.assessment.recorded", {
        projectId,
        modelId: request.modelId,
        version: request.version,
        taskId: request.taskId,
        verdict: report.verdict,
        status: result.status,
        reportDigest: result.record.reportDigest,
      });
      return { status: result.status, record: result.record, report };
    },

    latestAssessment(projectId, modelId, version, taskId) {
      const records = [...store.listAssessments(projectId, { modelId, version, taskId })].sort(
        (a, b) => (a.assessedAt < b.assessedAt ? -1 : a.assessedAt > b.assessedAt ? 1 : 0),
      );
      const record = records[records.length - 1];
      if (record === undefined) {
        return undefined;
      }
      // Integrity on read (tamper detection, fail-closed).
      if (readinessReportDigest(record.report) !== record.reportDigest) {
        throw new AssuranceError(
          "RECORD_INVALID",
          `assessment "${record.assessmentId}" failed integrity re-verification`,
          { details: { field: "assessmentId", value: record.assessmentId } },
        );
      }
      const currentMapping = evidenceReader.getMapping(projectId) ?? emptyMapping(projectId);
      const stale = record.report.mappingDigest !== currentMapping.digest;
      return { record, stale };
    },

    assessmentHistory(projectId, filter) {
      return store.listAssessments(projectId, filter);
    },

    limits: {
      maxAssertions,
      maxTaskProfiles: defaultMaxTaskProfiles(config),
      maxAssessments: defaultMaxAssessments(config),
    },
  };
}

/** Counts assertions exactly as the support view enumerates them. */
function countAssertions(graph: Parameters<typeof computeReadiness>[0]["graph"]): number {
  let count = graph.objects.length; // object existences
  for (const object of graph.objects) {
    count += object.properties.length;
  }
  for (const space of graph.spaces) {
    count += (space.properties ?? []).length;
  }
  return count;
}

// Deterministic defaults (bounded compute; configurable bounds
// arrive with the persistence layer — v1.0 keeps them fixed).
function defaultMaxAssertions(config: AiseConfig): number {
  void config;
  return DEFAULT_MAX_ASSERTIONS;
}

function defaultMaxTaskProfiles(config: AiseConfig): number {
  void config;
  return 1_000;
}

function defaultMaxAssessments(config: AiseConfig): number {
  void config;
  return 10_000;
}
