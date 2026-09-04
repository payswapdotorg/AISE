/**
 * Assurance-service persistence (AISE-013 backend).
 *
 * Two stores, one per project, both append-only/immutable:
 *
 * - **task profiles** — the declared task/assurance bindings.
 *   Content-pinned (digest derived at construction), immutable
 *   after registration: the same `taskId` may only re-register
 *   bit-identical content (`exists_identical`); different
 *   content conflicts (`exists_conflict`). The binding an
 *   assessment was computed under is permanently inspectable.
 *
 * - **readiness assessments** — one record per (model, version,
 *   task, report content). The record is the authority artifact
 *   of architecture-lock §1 ("the Accuracy/Assurance subsystem
 *   is the only authority for model-readiness and validation
 *   status"): it pins WHICH graph (modelId + version +
 *   graphDigest), WHICH mapping state (mappingDigest), WHICH
 *   task binding (taskId + profileDigest), and the report
 *   content itself (reportDigest). Records are never mutated or
 *   overwritten — re-assessment with different content appends;
 *   identical content is idempotent (`already_present` — the
 *   AISE-011/012 retry discipline).
 *
 * Boundary discipline (the store does not trust the caller):
 *
 * - the report digest is RE-DERIVED from the report content —
 *   the caller cannot pin a digest that does not match the
 *   report;
 * - the assessment identity is derived from the pinned inputs
 *   (projectId, modelId, version, taskId, report digest) — the
 *   caller cannot choose it;
 * - stored records are integrity-verified on read: a report
 *   whose digest no longer matches its content fails closed
 *   (`RECORD_INVALID` — storage tampering);
 * - bounded: profile and assessment counts are capped
 *   (`BOUNDS_EXCEEDED`) — unbounded growth is the store's
 *   enemy.
 *
 * v1.0 limitation (documented, not hidden): in-memory,
 * process-local — lost on restart (the AISE-001 precedent).
 * Durability arrives with the persistence layer.
 */
import {
  assembleEvidenceGraph,
  canonicalContentHash,
  type EvidenceGraph,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { AssuranceError } from "./errors.js";
import { taskProfile, type TaskProfileInput, type TaskProfileRecord } from "./profile.js";
import { readinessReportDigest, type ReadinessReport } from "./readiness.js";

/** Reads committed model graphs (the reality-model boundary port). */
export interface ModelGraphReader {
  /** The committed graph of one version, or undefined when absent. */
  getModelGraph(modelId: string, version: number): RealityModelGraph | undefined;
}

/** Reads the project's current evidence mapping (the evidence boundary port). */
export interface EvidenceMappingReader {
  /** The frozen mapping snapshot, or undefined when the project has none. */
  getMapping(projectId: string): EvidenceGraph | undefined;
}

/** Default upper bound on registered task profiles per project. */
export const DEFAULT_MAX_TASK_PROFILES = 1_000;
/** Default upper bound on stored assessments per project. */
export const DEFAULT_MAX_ASSESSMENTS = 10_000;
/** Default upper bound on assertions per assessed model version. */
export const DEFAULT_MAX_ASSERTIONS = 50_000;

/** One recorded readiness assessment (append-only history). */
export interface ReadinessAssessmentRecord {
  /** Deterministic identity: derived from the pinned inputs. */
  readonly assessmentId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly modelId: string;
  readonly version: number;
  readonly report: ReadinessReport;
  /** Re-derived at the boundary; never caller-supplied. */
  readonly reportDigest: string;
  /** Store clock (record metadata — reports stay timestamp-free). */
  readonly assessedAt: string;
  readonly assessedBy: string;
}

/** Result of registering a task profile. */
export interface RegisterProfileResult {
  readonly status: "created" | "exists_identical" | "exists_conflict";
  readonly record: TaskProfileRecord;
}

/** Result of recording an assessment. */
export interface RecordAssessmentResult {
  readonly status: "recorded" | "already_present";
  readonly record: ReadinessAssessmentRecord;
}

export interface InMemoryAssuranceStoreOptions {
  readonly now?: () => string;
  readonly maxTaskProfiles?: number;
  readonly maxAssessments?: number;
}

interface ProjectState {
  readonly profiles: Map<string, TaskProfileRecord>;
  readonly assessments: ReadinessAssessmentRecord[];
}

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

/** The assurance store surface. */
export interface AssuranceStore {
  readonly kind: string;
  /** RFC 3339 timestamp provider (injectable for tests). */
  now(): string;

  registerProfile(projectId: string, input: TaskProfileInput): RegisterProfileResult;
  getProfile(projectId: string, taskId: string): TaskProfileRecord | undefined;
  listProfiles(projectId: string): readonly TaskProfileRecord[];

  recordAssessment(
    projectId: string,
    input: {
      modelId: string;
      version: number;
      taskId: string;
      report: ReadinessReport;
      assessedBy: string;
    },
  ): RecordAssessmentResult;

  listAssessments(
    projectId: string,
    filter?: { modelId?: string; version?: number; taskId?: string },
  ): readonly ReadinessAssessmentRecord[];

  /** Integrity-verified record fetch (digest re-derivation on read). */
  getAssessment(projectId: string, assessmentId: string): ReadinessAssessmentRecord | undefined;

  /** Cardinalities (bounded-compute observability). */
  counts(projectId: string): { profiles: number; assessments: number };
}

/** Creates the process-local in-memory assurance store. */
export function createInMemoryAssuranceStore(
  options: InMemoryAssuranceStoreOptions = {},
): AssuranceStore {
  const now = options.now ?? defaultNow;
  const maxTaskProfiles = options.maxTaskProfiles ?? DEFAULT_MAX_TASK_PROFILES;
  const maxAssessments = options.maxAssessments ?? DEFAULT_MAX_ASSESSMENTS;
  const projects = new Map<string, ProjectState>();

  const stateOf = (projectId: string): ProjectState => {
    if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) {
      throw new AssuranceError(
        "PROFILE_INVALID",
        `projectId must match ${PROJECT_ID_PATTERN}: ${String(projectId)}`,
        { details: { field: "projectId", value: String(projectId) } },
      );
    }
    let state = projects.get(projectId);
    if (state === undefined) {
      state = { profiles: new Map(), assessments: [] };
      projects.set(projectId, state);
    }
    return state;
  };

  return {
    kind: "in-memory-assurance-store",
    now,

    registerProfile(projectId, input) {
      const record = taskProfile(input); // fail-closed validation + digest
      const state = stateOf(projectId);
      const existing = state.profiles.get(record.taskId);
      if (existing !== undefined) {
        return existing.digest === record.digest
          ? { status: "exists_identical", record: existing }
          : {
              status: "exists_conflict",
              record: existing,
            };
      }
      if (state.profiles.size >= maxTaskProfiles) {
        throw new AssuranceError(
          "BOUNDS_EXCEEDED",
          `project "${projectId}" already carries ${state.profiles.size} task profiles (max ${maxTaskProfiles})`,
          { details: { field: "taskId", value: record.taskId } },
        );
      }
      state.profiles.set(record.taskId, record);
      return { status: "created", record };
    },

    getProfile(projectId, taskId) {
      return stateOf(projectId).profiles.get(taskId);
    },

    listProfiles(projectId) {
      return [...stateOf(projectId).profiles.values()].sort((a, b) =>
        a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0,
      );
    },

    recordAssessment(projectId, input) {
      const state = stateOf(projectId);
      // Boundary: the digest is re-derived from the content — the
      // caller cannot pin a mismatched digest.
      const reportDigest = readinessReportDigest(input.report);
      const assessmentId = deriveAssessmentId(
        projectId,
        input.modelId,
        input.version,
        input.taskId,
        reportDigest,
      );
      const existing = state.assessments.find((record) => record.assessmentId === assessmentId);
      if (existing !== undefined) {
        return { status: "already_present", record: existing };
      }
      if (state.assessments.length >= maxAssessments) {
        throw new AssuranceError(
          "BOUNDS_EXCEEDED",
          `project "${projectId}" already carries ${state.assessments.length} assessments (max ${maxAssessments})`,
          { details: { field: "assessmentId", value: assessmentId } },
        );
      }
      const record: ReadinessAssessmentRecord = Object.freeze({
        assessmentId,
        projectId,
        taskId: input.taskId,
        modelId: input.modelId,
        version: input.version,
        report: input.report,
        reportDigest,
        assessedAt: now(),
        assessedBy: input.assessedBy,
      });
      state.assessments.push(record);
      return { status: "recorded", record };
    },

    listAssessments(projectId, filter) {
      return stateOf(projectId)
        .assessments.filter(
          (record) =>
            (filter?.modelId === undefined || record.modelId === filter.modelId) &&
            (filter?.version === undefined || record.version === filter.version) &&
            (filter?.taskId === undefined || record.taskId === filter.taskId),
        )
        .slice();
    },

    getAssessment(projectId, assessmentId) {
      const record = stateOf(projectId).assessments.find((entry) => entry.assessmentId === assessmentId);
      if (record === undefined) {
        return undefined;
      }
      // Integrity on read: storage tampering fails closed.
      if (readinessReportDigest(record.report) !== record.reportDigest) {
        throw new AssuranceError(
          "RECORD_INVALID",
          `assessment "${assessmentId}" failed integrity re-verification (report digest mismatch)`,
          { details: { field: "assessmentId", value: assessmentId } },
        );
      }
      return record;
    },

    counts(projectId) {
      const state = stateOf(projectId);
      return { profiles: state.profiles.size, assessments: state.assessments.length };
    },
  };
}

/** Deterministic assessment identity from the pinned inputs. */
export function deriveAssessmentId(
  projectId: string,
  modelId: string,
  version: number,
  taskId: string,
  reportDigest: string,
): string {
  return `ra-${canonicalContentHash({ projectId, modelId, version, taskId, reportDigest })}`;
}

/**
 * The canonical empty mapping for projects without one (the
 * assessment is honest about absence — `NO_EVIDENCE_MAPPING`
 * finding — rather than refusing to compute).
 */
export function emptyMapping(projectId: string): EvidenceGraph {
  return assembleEvidenceGraph({
    projectId,
    records: [],
    evidenceRetractions: [],
    links: [],
    linkRetractions: [],
  });
}

function defaultNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
