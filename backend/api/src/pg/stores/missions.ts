/**
 * Pg twin for the mission store (PROD-005).
 *
 * `PgMissionStore` implements the EXACT `MissionStore` interface the Fs and
 * In-memory twins implement (missions/store.ts — read it before changing
 * anything here): append-only versioned mission revisions with the binding
 * discipline (identical re-save = no-op; conflicting re-save = refusal; new
 * revision = latest + 1, monotonic, no gaps).
 *
 * Table mapping (v001): `mission_revisions` (mission_id, revision) — one row
 * per immutable revision; `canonical` holds the BYTE-EXACT canonical JSON of
 * the CaptureMission, so an Fs revision file and a Pg row of the same
 * revision are byte-identical after a round-trip. The append-only discipline
 * is enforced by the store (INSERT ... ON CONFLICT DO NOTHING plus the same
 * revision checks the Fs twin performs BEFORE writing).
 */

import { canonicalJsonStringify, type CaptureMission } from "@aise/shared-contracts";
import type {
  MissionRevisionSummary,
  MissionStore,
  MissionSummary,
  StoredMission,
} from "../../missions/store";
import type { PgExecutor, PgRow } from "../executor";
import {
  insertMissionRevisionIfAbsentSql,
  listMissionRevisionsSql,
  PG_TABLES,
  selectMissionRevisionSql,
  selectMissionRevisionsSql,
} from "../sql";
import { parseCanonicalJson } from "./records";

interface MissionRevisionRow extends PgRow {
  readonly mission_id: string;
  readonly revision: number;
  readonly canonical: string;
}

function parseMission(text: string, missionId: string): CaptureMission {
  const mission = parseCanonicalJson(text, "mission revision") as CaptureMission;
  if (mission.missionId !== missionId) {
    throw new Error(
      `mission store: revision for '${missionId}' carries a mismatching missionId`,
    );
  }
  return mission;
}

export class PgMissionStore implements MissionStore {
  constructor(private readonly executor: PgExecutor) {}

  async save(mission: CaptureMission): Promise<CaptureMission> {
    const canonical = canonicalJsonStringify(mission);
    const rows = await this.executor.execute<{ revision: number }>(
      selectMissionRevisionsSql(),
      [mission.missionId],
    );
    const revisions = rows.map((row) => row.revision);
    const latest = revisions.length === 0 ? -1 : revisions[revisions.length - 1]!;

    if (revisions.includes(mission.revision)) {
      const existing = await this.executor.execute<{ canonical: string }>(
        selectMissionRevisionSql(),
        [mission.missionId, mission.revision],
      );
      const existingCanonical = existing[0]?.canonical ?? null;
      if (existingCanonical === canonical) {
        return mission; // idempotent re-save of identical bytes
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
    const inserted = await this.executor.execute<{ canonical: string }>(
      insertMissionRevisionIfAbsentSql(),
      [mission.missionId, mission.revision, canonical, canonical],
    );
    if (inserted.length === 0) {
      // Lost an append race: re-read and require byte-identical content.
      const existing = await this.executor.execute<{ canonical: string }>(
        selectMissionRevisionSql(),
        [mission.missionId, mission.revision],
      );
      const existingCanonical = existing[0]?.canonical ?? null;
      if (existingCanonical === canonical) {
        return mission;
      }
      throw new Error(
        `mission store: revision ${mission.revision} already exists with different content (append-only)`,
      );
    }
    return mission;
  }

  async get(missionId: string): Promise<StoredMission | null> {
    const rows = await this.executor.execute<MissionRevisionRow>(
      selectMissionRevisionsSql(),
      [missionId],
    );
    if (rows.length === 0) {
      return null;
    }
    const history: MissionRevisionSummary[] = [];
    let current: CaptureMission | null = null;
    for (const row of rows) {
      const mission = parseMission(row.canonical, missionId);
      history.push({ revision: mission.revision, state: mission.state });
      current = mission; // rows are ORDER BY revision ASC — last is latest
    }
    return { missionId, current: current!, history };
  }

  async list(): Promise<MissionSummary[]> {
    const rows = await this.executor.execute<MissionRevisionRow>(listMissionRevisionsSql());
    const latestByMission = new Map<string, CaptureMission>();
    for (const row of rows) {
      const mission = parseMission(row.canonical, row.mission_id);
      const seen = latestByMission.get(row.mission_id);
      if (seen === undefined || mission.revision > seen.revision) {
        latestByMission.set(row.mission_id, mission);
      }
    }
    const summaries: MissionSummary[] = [];
    for (const [missionId, mission] of latestByMission) {
      summaries.push({
        missionId,
        state: mission.state,
        intent: mission.intent,
        revision: mission.revision,
      });
    }
    // Deterministic order: sorted by missionId (the Fs twin's order).
    return summaries.sort((a, b) =>
      a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0,
    );
  }
}

// Re-exported so consumers wiring the Pg family never need the raw table name.
export const MISSION_REVISIONS_TABLE = PG_TABLES.missionRevisions;
