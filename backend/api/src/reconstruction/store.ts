/**
 * Reconstruction job/artifact persistence (AISE-010) — PERSISTENCE ONLY.
 *
 * Contract (mirrors the capture/evidence/boq store discipline; all lifecycle
 * policy lives in `reconstruction/orchestrator.ts`):
 *
 *  - JOB RECORDS are rewritten on every lifecycle transition via
 *    write-temp-then-rename, but the history lives INSIDE the record as an
 *    append-only `events` list: both store implementations REFUSE any put
 *    whose event list does not start with the previously stored events
 *    (`job_history_truncated`) — history can grow, never shrink or change.
 *  - CANDIDATE ARTIFACTS are immutable, append-only and content-addressed:
 *    `artifacts/<first2>/<sha256(canonical artifact JSON)>.json` is written
 *    once and never rewritten or deleted. Re-running a job produces NEW
 *    artifacts (new artifactId → new content address); the old bytes stay.
 *    A same-artifactId-different-content put is refused
 *    (`artifact_id_collision`, original retained).
 *  - Listing is deterministic everywhere: jobs sort by (createdAt, jobId);
 *    a job's artifacts list in append (journal) order.
 *  - `InMemory*` twins give tests identical, deterministic behavior.
 *
 * File-system layout (both stores root themselves at `<dataDir>/reconstruction/`,
 * created on construction; the dataDir is the constructor argument):
 *
 *   data/reconstruction/jobs/<sha256(jobId)>.json                  job record
 *   data/reconstruction/artifacts/<first2>/<contentHash>.json      artifact
 *   data/reconstruction/artifacts/index/<sha256(artifactId)>.json  id pointer
 *   data/reconstruction/artifacts/by-job/<sha256(jobId)>.jsonl     artifact journal
 *
 * Records use the shared canonical JSON encoder (2-space, sorted keys, tail
 * newline); journal lines use the same canonical key order in compact
 * single-line form. Identical operation sequences always produce identical
 * bytes. The artifact content hash is sha-256 over the exact canonical JSON
 * text of the artifact (including its trailing newline).
 */

import { mkdirSync, promises as fs, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalizeJson, canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type {
  CandidateArtifact,
  InputModality,
  ProviderAvailability,
  ReconstructionFailureCode,
  ReconstructionRequest,
  RepresentationType,
} from "./contract";

/* ------------------------------------------------------------------ */
/* Stored record types                                                 */
/* ------------------------------------------------------------------ */

export type JobState =
  | "queued"
  | "characterizing"
  | "dispatching"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export const TERMINAL_JOB_STATES: readonly JobState[] = [
  "succeeded",
  "failed",
  "partial",
  "cancelled",
];

/** Input characterization recorded on the job before dispatch. */
export interface InputCharacterization {
  /** "evidential": every evidence id was read via the injected reader
   *  (existence AND invalidation verified). "structural": counts and the
   *  request's declared modalities only — nothing was verified. */
  readonly mode: "evidential" | "structural";
  readonly evidenceCount: number;
  readonly modalities: readonly InputModality[];
  /** Evidential mode: resolved evidence whose modality could not be derived. */
  readonly unknownModalityEvidenceIds: readonly string[];
  readonly note: string;
}

/** Why one evaluated provider passed or was filtered out of selection. */
export interface ProviderFilterEntry {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly adapterVersion: string;
  readonly availability: ProviderAvailability;
  readonly filteredOut: boolean;
  /** Empty when eligible. One reason per failing rule, deterministic order. */
  readonly reasons: readonly string[];
}

export interface ProviderSelectionTrace {
  /** Every injected provider in declared order (full evaluation audit). */
  readonly evaluated: readonly ProviderFilterEntry[];
  readonly selectedProviderId: string | null;
}

/** Terminal failure info (explicit, never silent). */
export interface JobFailure {
  readonly code: ReconstructionFailureCode;
  readonly detail: string;
  readonly missingEvidenceIds: readonly string[];
  readonly invalidatedEvidenceIds: readonly string[];
  /** Advisory remediation hints (method→modality table or provider notes). */
  readonly remediation: readonly string[];
}

/** Append-only lifecycle journal entry. `at` comes from the injected clock. */
export type JobEvent =
  | {
      readonly type: "submitted";
      readonly at: string;
      readonly taskId: string;
      readonly evidenceCount: number;
      readonly requestedRepresentations: readonly RepresentationType[];
    }
  | { readonly type: "characterized"; readonly at: string; readonly characterization: InputCharacterization }
  | {
      readonly type: "characterization_rejected";
      readonly at: string;
      readonly code: "INPUT_INCOMPATIBLE";
      readonly missingEvidenceIds: readonly string[];
      readonly invalidatedEvidenceIds: readonly string[];
      readonly remediation: readonly string[];
    }
  | {
      readonly type: "provider_selected";
      readonly at: string;
      readonly providerId: string;
      readonly providerVersion: string;
      readonly adapterVersion: string;
      readonly evaluatedProviders: number;
    }
  | { readonly type: "selection_failed"; readonly at: string; readonly code: "UNAVAILABLE"; readonly remediationNote: string }
  | { readonly type: "dispatch_started"; readonly at: string; readonly cycle: number; readonly providerId: string }
  | {
      readonly type: "attempt_failed";
      readonly at: string;
      readonly cycle: number;
      readonly attempt: number;
      readonly providerId: string;
      readonly code: ReconstructionFailureCode;
      readonly detail: string;
      readonly willRetry: boolean;
    }
  | {
      readonly type: "attempt_succeeded";
      readonly at: string;
      readonly cycle: number;
      readonly attempt: number;
      readonly providerId: string;
      readonly artifactIds: readonly string[];
    }
  | {
      readonly type: "attempt_partial";
      readonly at: string;
      readonly cycle: number;
      readonly attempt: number;
      readonly providerId: string;
      readonly artifactIds: readonly string[];
      readonly detail: string;
    }
  | {
      readonly type: "output_invalid";
      readonly at: string;
      readonly cycle: number;
      readonly attempt: number;
      readonly providerId: string;
      readonly detail: string;
    }
  | { readonly type: "job_cancelled"; readonly at: string; readonly fromState: JobState }
  | { readonly type: "rerun_started"; readonly at: string; readonly cycle: number };

/** The persisted job record (rewritten per transition; events grow only). */
export interface JobRecord {
  readonly jobId: string;
  readonly taskId: string;
  readonly request: ReconstructionRequest;
  readonly state: JobState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly characterization: InputCharacterization | null;
  readonly selection: ProviderSelectionTrace | null;
  readonly selectedProviderId: string | null;
  readonly failure: JobFailure | null;
  readonly partialDetail: string | null;
  /** Links EVERY artifact ever produced for this job (append-only). */
  readonly artifactIds: readonly string[];
  /** Total provider attempts across all run cycles. */
  readonly attemptCount: number;
  /** 1-based run cycle number (re-runs increment it). */
  readonly runCycle: number;
  readonly events: readonly JobEvent[];
}

/** Small helper reused by tests and the orchestrator alike. */
export function isTerminalJobState(state: JobState): boolean {
  return (TERMINAL_JOB_STATES as readonly string[]).includes(state);
}

/* ------------------------------------------------------------------ */
/* Store interfaces                                                    */
/* ------------------------------------------------------------------ */

export interface JobStore {
  /** Rewrite the full job record (atomic temp+rename on the FS twin).
   *  Refuses history truncation with a typed error. */
  put(record: JobRecord): Promise<void>;
  get(jobId: string): Promise<JobRecord | null>;
  list(): Promise<JobRecord[]>;
}

export type PutArtifactOutcome = { readonly kind: "stored" } | { readonly kind: "duplicate" };

export interface ArtifactStore {
  /** Immutable, content-addressed, idempotent append (see module header). */
  put(artifact: CandidateArtifact): Promise<PutArtifactOutcome>;
  get(artifactId: string): Promise<CandidateArtifact | null>;
  /** The job's artifacts in append order (never truncated). */
  listByJob(jobId: string): Promise<CandidateArtifact[]>;
}

export type ReconstructionStoreErrorCode =
  | "job_history_truncated"
  | "artifact_id_collision"
  | "content_collision"
  | "corrupt_job_record";

export class ReconstructionStoreError extends Error {
  readonly code: ReconstructionStoreErrorCode;

  constructor(code: ReconstructionStoreErrorCode, detail: string) {
    super(`reconstruction store: ${code}: ${detail}`);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Canonical deep equality (sorted keys at every level). */
function canonicalEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalizeJson(a)) === JSON.stringify(canonicalizeJson(b));
}

/** True when `previous` is a prefix of `next` (element-wise canonical equality). */
function isEventPrefix(previous: readonly JobEvent[], next: readonly JobEvent[]): boolean {
  if (previous.length > next.length) {
    return false;
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (!canonicalEquals(previous[index], next[index])) {
      return false;
    }
  }
  return true;
}

/** Guard shared by both job-store implementations (history is append-only). */
function assertHistoryPreserved(previous: JobRecord | null, next: JobRecord): void {
  if (previous !== null && !isEventPrefix(previous.events, next.events)) {
    throw new ReconstructionStoreError(
      "job_history_truncated",
      `job '${next.jobId}' event journal may only grow`,
    );
  }
}

function sortJobs(jobs: JobRecord[]): JobRecord[] {
  return jobs.sort((a, b) =>
    a.createdAt === b.createdAt ? a.jobId.localeCompare(b.jobId) : a.createdAt.localeCompare(b.createdAt),
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function parseJobRecord(value: unknown, jobId: string): JobRecord {
  if (typeof value !== "object" || value === null || (value as JobRecord).jobId !== jobId) {
    throw new ReconstructionStoreError("corrupt_job_record", `stored record does not match job id '${jobId}'`);
  }
  return value as JobRecord;
}

/** One canonical compact JSONL line (sorted keys, single line, newline). */
function jsonlLine(value: unknown): string {
  return `${JSON.stringify(canonicalizeJson(value))}\n`;
}

function parseJsonl(text: string): CandidateArtifact[] {
  const values: CandidateArtifact[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    values.push(JSON.parse(line) as CandidateArtifact);
  }
  return values;
}

/* ------------------------------------------------------------------ */
/* In-memory implementations                                           */
/* ------------------------------------------------------------------ */

/** Deterministic in-memory JobStore (tests, embedded scenarios). */
export class InMemoryJobStore implements JobStore {
  private readonly records = new Map<string, JobRecord>();

  async put(record: JobRecord): Promise<void> {
    assertHistoryPreserved(this.records.get(record.jobId) ?? null, record);
    this.records.set(record.jobId, record);
  }

  async get(jobId: string): Promise<JobRecord | null> {
    return this.records.get(jobId) ?? null;
  }

  async list(): Promise<JobRecord[]> {
    return sortJobs([...this.records.values()]);
  }
}

/** Deterministic in-memory ArtifactStore (tests, embedded scenarios). */
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly byId = new Map<string, CandidateArtifact>();
  private readonly byJob = new Map<string, CandidateArtifact[]>();

  async put(artifact: CandidateArtifact): Promise<PutArtifactOutcome> {
    const existing = this.byId.get(artifact.artifactId);
    if (existing !== undefined) {
      if (!canonicalEquals(existing, artifact)) {
        throw new ReconstructionStoreError(
          "artifact_id_collision",
          `artifact id '${artifact.artifactId}' already stores different content — original retained`,
        );
      }
      return { kind: "duplicate" };
    }
    this.byId.set(artifact.artifactId, artifact);
    const journal = this.byJob.get(artifact.jobId) ?? [];
    journal.push(artifact);
    this.byJob.set(artifact.jobId, journal);
    return { kind: "stored" };
  }

  async get(artifactId: string): Promise<CandidateArtifact | null> {
    return this.byId.get(artifactId) ?? null;
  }

  async listByJob(jobId: string): Promise<CandidateArtifact[]> {
    return [...(this.byJob.get(jobId) ?? [])];
  }
}

/* ------------------------------------------------------------------ */
/* File-system implementations                                         */
/* ------------------------------------------------------------------ */

/**
 * File-system-backed JobStore rooted at `<dataDir>/reconstruction/jobs/`
 * (created on construction; unwritable roots fail fast, mirroring the other
 * AISE stores). See the module header for the layout.
 */
export class FsJobStore implements JobStore {
  private readonly jobsDir: string;

  constructor(dataDir: string) {
    this.jobsDir = join(resolve(dataDir), "reconstruction", "jobs");
    mkdirSync(this.jobsDir, { recursive: true });
  }

  /** Absolute path of the job record file (jobId is hashed, opaque ids stay inside). */
  jobPath(jobId: string): string {
    return join(this.jobsDir, `${sha256Hex(jobId)}.json`);
  }

  async put(record: JobRecord): Promise<void> {
    const path = this.jobPath(record.jobId);
    const previous = await this.get(record.jobId);
    assertHistoryPreserved(previous, record);
    // Atomic rewrite: write-temp-then-rename, history preserved above.
    const temp = `${path}.tmp`;
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(temp, canonicalJsonStringify(record));
    await fs.rename(temp, path);
  }

  async get(jobId: string): Promise<JobRecord | null> {
    const value = await readJsonFile<JobRecord>(this.jobPath(jobId));
    return value === null ? null : parseJobRecord(value, jobId);
  }

  async list(): Promise<JobRecord[]> {
    const jobs: JobRecord[] = [];
    for (const file of readdirSync(this.jobsDir).sort()) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const value = await readJsonFile<JobRecord>(join(this.jobsDir, file));
      if (value !== null && typeof value.jobId === "string") {
        jobs.push(value);
      }
    }
    return sortJobs(jobs);
  }
}

/**
 * File-system-backed ArtifactStore rooted at
 * `<dataDir>/reconstruction/artifacts/` (created on construction). See the
 * module header for the layout and the immutability guarantees.
 */
export class FsArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = join(resolve(dataDir), "reconstruction", "artifacts");
    for (const directory of ["index", "by-job"]) {
      mkdirSync(join(this.root, directory), { recursive: true });
    }
  }

  /** Absolute path of the content-addressed artifact file. */
  artifactPath(contentHash: string): string {
    return join(this.root, contentHash.slice(0, 2), `${contentHash}.json`);
  }

  /** Absolute path of the artifactId → contentHash pointer. */
  indexPath(artifactId: string): string {
    return join(this.root, "index", `${sha256Hex(artifactId)}.json`);
  }

  /** Absolute path of the job's append-only artifact journal. */
  byJobPath(jobId: string): string {
    return join(this.root, "by-job", `${sha256Hex(jobId)}.jsonl`);
  }

  async put(artifact: CandidateArtifact): Promise<PutArtifactOutcome> {
    const text = canonicalJsonStringify(artifact);
    const contentHash = sha256Hex(text);

    // 1. Content file: write once; an existing differing file is a collision.
    const contentPath = this.artifactPath(contentHash);
    const existingContent = await fs.readFile(contentPath, "utf8").catch(() => null);
    if (existingContent !== null && existingContent !== text) {
      throw new ReconstructionStoreError(
        "content_collision",
        `content address '${contentHash}' already stores different bytes — original retained`,
      );
    }
    if (existingContent === null) {
      await fs.mkdir(dirname(contentPath), { recursive: true });
      await fs.writeFile(contentPath, text);
    }

    // 2. Id pointer: write once; same id with different content is refused.
    const indexPath = this.indexPath(artifact.artifactId);
    const pointer = { artifactId: artifact.artifactId, contentHash };
    const existingPointer = await readJsonFile<{ artifactId: string; contentHash: string }>(indexPath);
    if (existingPointer !== null) {
      if (existingPointer.contentHash !== contentHash) {
        throw new ReconstructionStoreError(
          "artifact_id_collision",
          `artifact id '${artifact.artifactId}' already stores different content — original retained`,
        );
      }
      return { kind: "duplicate" };
    }
    await fs.writeFile(indexPath, canonicalJsonStringify(pointer));

    // 3. By-job journal: appended exactly once per artifact id.
    const journalPath = this.byJobPath(artifact.jobId);
    await fs.mkdir(dirname(journalPath), { recursive: true });
    await fs.appendFile(journalPath, jsonlLine(artifact));
    return { kind: "stored" };
  }

  async get(artifactId: string): Promise<CandidateArtifact | null> {
    const pointer = await readJsonFile<{ contentHash: string }>(this.indexPath(artifactId));
    if (pointer === null) {
      return null;
    }
    return readJsonFile<CandidateArtifact>(this.artifactPath(pointer.contentHash));
  }

  async listByJob(jobId: string): Promise<CandidateArtifact[]> {
    try {
      const text = await fs.readFile(this.byJobPath(jobId), "utf8");
      return parseJsonl(text);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
  }
}
