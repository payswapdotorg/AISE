/**
 * Adoption store — persistence abstraction (AISE-041).
 *
 * Contract (mirrors the comparison/case store discipline — the store is
 * PERSISTENCE ONLY, no adoption policy):
 *
 *  - Three record families, one file per record, all under the adoption
 *    root `<dataDir>/adoption/`:
 *      workflows/   <sha256(workflowId)>.json    IncumbentWorkflow
 *      candidates/  <sha256(candidateId)>.json  MigrationCandidate
 *      assessments/ <sha256(assessmentId)>.json IntegrationReadinessAssessment
 *    written with the shared canonical JSON encoder via
 *    write-temp-rename (never a half-written record on disk). Opaque ids
 *    are hashed into filesystem-safe names and stored verbatim inside
 *    the JSON records.
 *  - APPEND-ONLY DISCIPLINE, CASES-STYLE: candidate/workflow mutations
 *    REWRITE the file (the file is a rebuildable projection of the
 *    record), but the record itself carries the append-only audit
 *    history — every event pins the sha-256 content digest of the record
 *    AFTER its mutation, prior events never change, and the
 *    stored-record parser re-verifies the last event's digest on EVERY
 *    read (a rewritten or truncated history is corruption). Assessments
 *    are WRITE-ONCE (there is no update path for derived records; id
 *    reuse is refused by the service with `assessment_exists`).
 *  - Reads are validated with the model's stored-record parsers: garbage
 *    on disk (malformed shapes, inconsistent statistics, incoherent
 *    ranking order, or a history digest that does not pin the persisted
 *    content) is a typed `invalid_*_record` rejection, never a silent
 *    misparse. Writes are trusted (the service validated the record
 *    before committing).
 *  - `InMemoryAdoptionStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior (identical get/put semantics,
 *    identical list orders — sorted by record id).
 *
 * Single-writer assumption: one service instance per data dir (same as
 * the comparison/case stores); concurrent writers are the deployment's
 * duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  AdoptionError,
  parseIncumbentWorkflow,
  parseIntegrationReadinessAssessment,
  parseMigrationCandidate,
  type AdoptionErrorCode,
  type IncumbentWorkflow,
  type IntegrationReadinessAssessment,
  type MigrationCandidate,
} from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface AdoptionStore {
  /** Persist one workflow record (canonical JSON, atomically). */
  putWorkflow(record: IncumbentWorkflow): Promise<void>;
  /** The stored workflow record, or null when the id is unknown. */
  getWorkflow(workflowId: string): Promise<IncumbentWorkflow | null>;
  /** All stored workflows, sorted by workflowId (stable total order). */
  listWorkflows(): Promise<IncumbentWorkflow[]>;
  /** Persist one candidate record (canonical JSON, atomically). */
  putCandidate(record: MigrationCandidate): Promise<void>;
  /** The stored candidate record, or null when the id is unknown. */
  getCandidate(candidateId: string): Promise<MigrationCandidate | null>;
  /** All stored candidates, sorted by candidateId. */
  listCandidates(): Promise<MigrationCandidate[]>;
  /** Persist one assessment record (write-once, canonical JSON, atomically). */
  putAssessment(record: IntegrationReadinessAssessment): Promise<void>;
  /** The stored assessment record, or null when the id is unknown. */
  getAssessment(assessmentId: string): Promise<IntegrationReadinessAssessment | null>;
  /** All stored assessments, sorted by assessmentId. */
  listAssessments(): Promise<IntegrationReadinessAssessment[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Write-temp-rename canonical JSON (never a half-written record on disk). */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, canonicalJsonStringify(value));
  await fs.rename(tmp, path);
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* File-system store                                                    */
/* ------------------------------------------------------------------ */

export class FsAdoptionStore implements AdoptionStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "adoption"));
  }

  /** Exposed for tests: the canonical file path of one workflow id. */
  workflowPathOf(workflowId: string): string {
    return join(this.root, "workflows", `${sha256Hex(workflowId)}.json`);
  }

  /** Exposed for tests: the canonical file path of one candidate id. */
  candidatePathOf(candidateId: string): string {
    return join(this.root, "candidates", `${sha256Hex(candidateId)}.json`);
  }

  /** Exposed for tests: the canonical file path of one assessment id. */
  assessmentPathOf(assessmentId: string): string {
    return join(this.root, "assessments", `${sha256Hex(assessmentId)}.json`);
  }

  async putWorkflow(record: IncumbentWorkflow): Promise<void> {
    await writeJsonAtomic(this.workflowPathOf(record.workflowId), record);
  }

  async getWorkflow(workflowId: string): Promise<IncumbentWorkflow | null> {
    return readJson(this.workflowPathOf(workflowId), parseIncumbentWorkflow, "invalid_workflow_record");
  }

  async listWorkflows(): Promise<IncumbentWorkflow[]> {
    return listJson(join(this.root, "workflows"), parseIncumbentWorkflow, (record) => ({
      id: record.workflowId,
    }), "invalid_workflow_record");
  }

  async putCandidate(record: MigrationCandidate): Promise<void> {
    await writeJsonAtomic(this.candidatePathOf(record.candidateId), record);
  }

  async getCandidate(candidateId: string): Promise<MigrationCandidate | null> {
    return readJson(this.candidatePathOf(candidateId), parseMigrationCandidate, "invalid_candidate_record");
  }

  async listCandidates(): Promise<MigrationCandidate[]> {
    return listJson(join(this.root, "candidates"), parseMigrationCandidate, (record) => ({
      id: record.candidateId,
    }), "invalid_candidate_record");
  }

  async putAssessment(record: IntegrationReadinessAssessment): Promise<void> {
    await writeJsonAtomic(this.assessmentPathOf(record.assessmentId), record);
  }

  async getAssessment(assessmentId: string): Promise<IntegrationReadinessAssessment | null> {
    return readJson(
      this.assessmentPathOf(assessmentId),
      parseIntegrationReadinessAssessment,
      "invalid_assessment_record",
    );
  }

  async listAssessments(): Promise<IntegrationReadinessAssessment[]> {
    return listJson(
      join(this.root, "assessments"),
      parseIntegrationReadinessAssessment,
      (record) => ({ id: record.assessmentId }),
      "invalid_assessment_record",
    );
  }
}

/** Read + parse one record file; ENOENT maps to null (unknown id). */
async function readJson<T>(
  path: string,
  parse: (value: unknown) => T,
  malformedCode: AdoptionErrorCode,
): Promise<T | null> {
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
  return parseStoredText(text, parse, malformedCode);
}

/** List + parse every .json record file in one family directory. */
async function listJson<T>(
  dir: string,
  parse: (value: unknown) => T,
  keyOf: (record: T) => { readonly id: string },
  malformedCode: AdoptionErrorCode,
): Promise<T[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
  const records: T[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".json")) {
      continue; // never touch .tmp leftovers or foreign files
    }
    records.push(parseStoredText(await fs.readFile(join(dir, entry), "utf8"), parse, malformedCode));
  }
  return records.sort((a, b) => byId(keyOf(a), keyOf(b)));
}

/** Parse one record file's text: invalid JSON is a typed rejection. */
function parseStoredText<T>(
  text: string,
  parse: (value: unknown) => T,
  malformedCode: AdoptionErrorCode,
): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AdoptionError(malformedCode, "adoption record file is not valid JSON");
  }
  return parse(value);
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryAdoptionStore implements AdoptionStore {
  private readonly workflows = new Map<string, string>();
  private readonly candidates = new Map<string, string>();
  private readonly assessments = new Map<string, string>();

  async putWorkflow(record: IncumbentWorkflow): Promise<void> {
    this.workflows.set(record.workflowId, canonicalJsonStringify(record));
  }

  async getWorkflow(workflowId: string): Promise<IncumbentWorkflow | null> {
    const text = this.workflows.get(workflowId);
    if (text === undefined) {
      return null;
    }
    return parseStoredText(text, parseIncumbentWorkflow, "invalid_workflow_record");
  }

  async listWorkflows(): Promise<IncumbentWorkflow[]> {
    const records: IncumbentWorkflow[] = [];
    for (const text of this.workflows.values()) {
      records.push(parseStoredText(text, parseIncumbentWorkflow, "invalid_workflow_record"));
    }
    return records.sort((a, b) => byId({ id: a.workflowId }, { id: b.workflowId }));
  }

  async putCandidate(record: MigrationCandidate): Promise<void> {
    this.candidates.set(record.candidateId, canonicalJsonStringify(record));
  }

  async getCandidate(candidateId: string): Promise<MigrationCandidate | null> {
    const text = this.candidates.get(candidateId);
    if (text === undefined) {
      return null;
    }
    return parseStoredText(text, parseMigrationCandidate, "invalid_candidate_record");
  }

  async listCandidates(): Promise<MigrationCandidate[]> {
    const records: MigrationCandidate[] = [];
    for (const text of this.candidates.values()) {
      records.push(parseStoredText(text, parseMigrationCandidate, "invalid_candidate_record"));
    }
    return records.sort((a, b) => byId({ id: a.candidateId }, { id: b.candidateId }));
  }

  async putAssessment(record: IntegrationReadinessAssessment): Promise<void> {
    this.assessments.set(record.assessmentId, canonicalJsonStringify(record));
  }

  async getAssessment(assessmentId: string): Promise<IntegrationReadinessAssessment | null> {
    const text = this.assessments.get(assessmentId);
    if (text === undefined) {
      return null;
    }
    return parseStoredText(text, parseIntegrationReadinessAssessment, "invalid_assessment_record");
  }

  async listAssessments(): Promise<IntegrationReadinessAssessment[]> {
    const records: IntegrationReadinessAssessment[] = [];
    for (const text of this.assessments.values()) {
      records.push(parseStoredText(text, parseIntegrationReadinessAssessment, "invalid_assessment_record"));
    }
    return records.sort((a, b) => byId({ id: a.assessmentId }, { id: b.assessmentId }));
  }
}
