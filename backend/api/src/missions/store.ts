/**
 * Capture mission store — persistence abstraction (AISE-007).
 *
 * Contract (spec/work-orders.md §007; spec/architecture-lock.md "Derived
 * models are versioned; reprocessing creates new versions" and the mission
 * family contract: "state transitions create new revisions — they never
 * rewrite history"):
 *
 *  - The store is PERSISTENCE ONLY. It performs no planning policy: no
 *    method selection, no escalation rules, no readiness judgement. All
 *    policy lives in `missions/planner.ts`.
 *  - Missions are APPEND-ONLY versioned records. `save` appends
 *    `<revision>.json` (canonical JSON, shared encoder) under the mission's
 *    content-hashed directory; an existing revision is never rewritten
 *    (byte-identical re-save is an idempotent no-op; a conflicting re-save or
 *    a revision regression is refused with a thrown Error).
 *  - State transitions (draft → active → completed/escalated/abandoned) are
 *    performed by CALLERS constructing a new mission object with the next
 *    revision (the guided executor, AISE-009, will do this); the store only
 *    guarantees the append-only discipline.
 *  - The interface exists so tests can run an in-memory implementation
 *    (`InMemoryMissionStore`) with identical, deterministic behavior — both
 *    stores serialize through the same canonical JSON encoder, so the same
 *    save sequence produces identical bytes.
 *
 * File-system layout (`FsMissionStore`, rooted at `<dataDir>/missions/`,
 * following the `FsCaptureStore` constructor convention — the RESOLVED data
 * dir is injected, config is never read here):
 *
 *   data/missions/<sha256(missionId)>/<revision>.json   immutable mission revision
 *
 * Opaque mission ids are hashed into filesystem-safe directory names and
 * stored verbatim inside the JSON documents.
 */

import { mkdirSync, promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import {
  canonicalJsonStringify,
  type CaptureMission,
  type MissionState,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Stored record types                                                  */
/* ------------------------------------------------------------------ */

/** One revision entry in a mission's append-only history. */
export interface MissionRevisionSummary {
  readonly revision: number;
  readonly state: MissionState;
}

/** A stored mission: latest revision + full revision history. */
export interface StoredMission {
  readonly missionId: string;
  readonly current: CaptureMission;
  readonly history: ReadonlyArray<MissionRevisionSummary>;
}

/** List projection (id, state, intent, revision). */
export interface MissionSummary {
  readonly missionId: string;
  readonly state: MissionState;
  readonly intent: string;
  readonly revision: number;
}

/**
 * Persistence boundary for the mission planner surface. Implementations MUST
 * be deterministic given the same call sequence and MUST NOT implement
 * planning policy (see module header).
 */
export interface MissionStore {
  /** Append one mission revision (idempotent for identical bytes). */
  save(mission: CaptureMission): Promise<CaptureMission>;
  /** Latest revision + history, or null when the mission is unknown. */
  get(missionId: string): Promise<StoredMission | null>;
  /** All stored missions, sorted by missionId (deterministic order). */
  list(): Promise<MissionSummary[]>;
}

/* ------------------------------------------------------------------ */
/* Shared append-only discipline                                        */
/* ------------------------------------------------------------------ */

/**
 * Append-only revision discipline (binding for both implementations):
 *   - an EXISTING revision re-saved with byte-identical content is a no-op;
 *   - an EXISTING revision re-saved with different content is refused
 *     (history is never rewritten);
 *   - a new revision must be exactly `latest + 1` (monotonic, no gaps):
 *     state transitions append the NEXT revision, never a jump or a regress.
 * Returns "noop" for the idempotent case, "append" when the revision may be
 * appended; throws otherwise.
 */
function assertRevisionDiscipline(
  revisions: ReadonlyArray<number>,
  mission: CaptureMission,
  existingCanonical: string | null,
  incomingCanonical: string,
): "noop" | "append" {
  const latest = revisions.length === 0 ? -1 : revisions[revisions.length - 1]!;
  if (revisions.includes(mission.revision)) {
    if (existingCanonical === incomingCanonical) {
      return "noop"; // idempotent re-save of identical bytes
    }
    throw new Error(
      `mission store: revision ${mission.revision} already exists with different content (append-only)`,
    );
  }
  if (mission.revision !== latest + 1) {
    throw new Error(
      `mission store: revision ${mission.revision} is not the next revision after ${latest} ` +
        "(append-only, monotonic revisions — no gaps, no rewrites)",
    );
  }
  return "append";
}

function summariesFrom(
  records: ReadonlyArray<{ revision: number; mission: CaptureMission }>,
): MissionSummary[] {
  return records
    .map((record) => ({
      missionId: record.mission.missionId,
      state: record.mission.state,
      intent: record.mission.intent,
      revision: record.mission.revision,
    }))
    .sort((a, b) => (a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* In-memory implementation                                             */
/* ------------------------------------------------------------------ */

interface MemoryRecord {
  readonly revision: number;
  readonly canonical: string;
  readonly mission: CaptureMission;
}

/** Deterministic in-memory MissionStore (tests, embedded scenarios). */
export class InMemoryMissionStore implements MissionStore {
  private readonly missions = new Map<string, MemoryRecord[]>();

  async save(mission: CaptureMission): Promise<CaptureMission> {
    const canonical = canonicalJsonStringify(mission);
    const records = this.missions.get(mission.missionId) ?? [];
    const existing = records.find((record) => record.revision === mission.revision);
    const verdict = assertRevisionDiscipline(
      records.map((record) => record.revision),
      mission,
      existing === undefined ? null : existing.canonical,
      canonical,
    );
    if (verdict === "append") {
      records.push({ revision: mission.revision, canonical, mission });
      this.missions.set(mission.missionId, records);
    }
    return mission;
  }

  async get(missionId: string): Promise<StoredMission | null> {
    const records = this.missions.get(missionId);
    if (records === undefined || records.length === 0) {
      return null;
    }
    const latest = records[records.length - 1]!;
    return {
      missionId: latest.mission.missionId,
      current: latest.mission,
      history: records.map((record) => ({
        revision: record.revision,
        state: record.mission.state,
      })),
    };
  }

  async list(): Promise<MissionSummary[]> {
    const all: Array<{ revision: number; mission: CaptureMission }> = [];
    for (const records of this.missions.values()) {
      const latest = records[records.length - 1];
      if (latest !== undefined) {
        all.push({ revision: latest.revision, mission: latest.mission });
      }
    }
    return summariesFrom(all);
  }
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                           */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const text = await fs.readFile(path, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * File-system-backed MissionStore rooted at `<dataDir>/missions/` (directory
 * created on construction; an unwritable root fails fast with a thrown Error
 * so callers can refuse to start). See the module header for the layout.
 */
export class FsMissionStore implements MissionStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = join(resolve(dataDir), "missions");
    mkdirSync(this.root, { recursive: true });
  }

  private missionDir(missionId: string): string {
    return join(this.root, sha256Hex(missionId));
  }

  private revisionPath(missionId: string, revision: number): string {
    return join(this.missionDir(missionId), `${revision}.json`);
  }

  /** Sorted stored revision numbers for a mission (empty when unknown). */
  private async revisions(missionId: string): Promise<number[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.missionDir(missionId));
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    return names
      .map((name) => /^(\d+)\.json$/.exec(name))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number.parseInt(match[1]!, 10))
      .sort((a, b) => a - b);
  }

  async save(mission: CaptureMission): Promise<CaptureMission> {
    const canonical = canonicalJsonStringify(mission);
    const storedRevisions = await this.revisions(mission.missionId);
    let existingCanonical: string | null = null;
    if (storedRevisions.includes(mission.revision)) {
      try {
        existingCanonical = await fs.readFile(
          this.revisionPath(mission.missionId, mission.revision),
          "utf8",
        );
      } catch {
        existingCanonical = null;
      }
    }
    const verdict = assertRevisionDiscipline(storedRevisions, mission, existingCanonical, canonical);
    if (verdict === "append") {
      await fs.mkdir(this.missionDir(mission.missionId), { recursive: true });
      await fs.writeFile(this.revisionPath(mission.missionId, mission.revision), canonical);
    }
    return mission;
  }

  async get(missionId: string): Promise<StoredMission | null> {
    const revisions = await this.revisions(missionId);
    if (revisions.length === 0) {
      return null;
    }
    let current: CaptureMission | null = null;
    const history: MissionRevisionSummary[] = [];
    for (const revision of revisions) {
      const mission = await readJsonFile<CaptureMission>(
        this.revisionPath(missionId, revision),
      );
      if (mission === null) {
        continue; // a vanished revision is not a state we fabricate
      }
      history.push({ revision, state: mission.state });
      current = mission;
    }
    if (current === null) {
      return null;
    }
    return { missionId: current.missionId, current, history };
  }

  async list(): Promise<MissionSummary[]> {
    let directories: string[];
    try {
      directories = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const all: Array<{ revision: number; mission: CaptureMission }> = [];
    for (const directory of directories.sort()) {
      let names: string[];
      try {
        names = await fs.readdir(join(this.root, directory));
      } catch (error) {
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }
      const latest = names
        .map((name) => /^(\d+)\.json$/.exec(name))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => Number.parseInt(match[1]!, 10))
        .sort((a, b) => a - b)
        .at(-1);
      if (latest === undefined) {
        continue;
      }
      const mission = await readJsonFile<CaptureMission>(join(this.root, directory, `${latest}.json`));
      if (mission !== null) {
        all.push({ revision: latest, mission });
      }
    }
    return summariesFrom(all);
  }
}
