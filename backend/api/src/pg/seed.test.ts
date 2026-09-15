/**
 * Demo-seed tests (PROD-005): schema-valid fixtures, one-transaction run,
 * content-hash markers, and IDEMPOTENCY (run twice → second run writes
 * NOTHING) — plus the honesty branch: existing user state is never
 * overwritten. All offline, over the in-memory fake executor with the
 * REAL v001 schema (no database needed; the verify gate stays green).
 */

import { describe, expect, test } from "bun:test";
import {
  canonicalJsonStringify,
  CaptureMissionSchema,
  EvidenceSchema,
} from "@aise/shared-contracts";
import { parseCaseRecord } from "../cases/model";
import { runMigrations } from "./migrate";
import {
  demoCase,
  demoEvidence,
  demoMission,
  runSeed,
  seedMarkerKey,
} from "./seed";
import { fakePgExecutor } from "./testing";
import { insertRecordIfAbsentSql, PG_TABLES, selectSeedMarkerSql } from "./sql";
import { PgEvidenceStore } from "./stores/evidence";

/** A migrated fake (the seed's precondition: schema exists). */
async function migratedFake() {
  const executor = fakePgExecutor();
  await runMigrations(executor);
  return executor;
}

/** Full byte-state snapshot of the fake (idempotency comparisons). */
function snapshotOf(executor: ReturnType<typeof fakePgExecutor>) {
  const tables = [
    PG_TABLES.seedMarkers,
    PG_TABLES.evidenceRecords,
    PG_TABLES.caseRecords,
    PG_TABLES.missionRevisions,
  ];
  return Object.fromEntries(
    tables.map((table) => [table, executor.rowsOf(table).map((row) => ({ ...row }))]),
  );
}

describe("pg demo seed: fixtures", () => {
  test("demo evidence is schema-valid", () => {
    const evidence = demoEvidence();
    expect(EvidenceSchema.safeParse(JSON.parse(canonicalJsonStringify(evidence))).success).toBe(
      true,
    );
  });

  test("demo case is model-valid", () => {
    expect(() => parseCaseRecord(JSON.parse(canonicalJsonStringify(demoCase("0".repeat(64)))))).not
      .toThrow();
  });

  test("demo mission is schema-valid at revision 0", () => {
    const mission = demoMission();
    expect(mission.revision).toBe(0);
    expect(CaptureMissionSchema.safeParse(JSON.parse(canonicalJsonStringify(mission))).success).toBe(
      true,
    );
  });

  test("marker keys are content-addressed and stable", () => {
    const canonical = canonicalJsonStringify(demoEvidence());
    expect(seedMarkerKey(canonical)).toBe(seedMarkerKey(canonical));
    expect(seedMarkerKey(canonical)).not.toBe(seedMarkerKey(canonicalJsonStringify(demoMission())));
  });
});

describe("pg demo seed: idempotent run", () => {
  test("fresh run seeds evidence + case + mission and writes their markers", async () => {
    const executor = await migratedFake();
    const outcome = await runSeed(executor);

    expect(outcome.items.map((item) => item.action)).toEqual(["seeded", "seeded", "seeded"]);
    expect(outcome.items.map((item) => item.kind)).toEqual(["evidence", "case", "mission"]);
    // Markers: one per seeded item, keyed by the payload content hash.
    const evidence = demoEvidence();
    const markers = executor.rowsOf(PG_TABLES.seedMarkers);
    expect(markers).toHaveLength(3);
    expect(markers.map((row) => row["record_key"])).toContain(seedMarkerKey(canonicalJsonStringify(evidence)));
    // The domain rows carry the byte-exact canonical fixtures.
    expect(executor.rowsOf(PG_TABLES.evidenceRecords)).toHaveLength(1);
    expect(executor.rowsOf(PG_TABLES.evidenceRecords)[0]?.["canonical"]).toBe(
      canonicalJsonStringify(evidence),
    );
    expect(executor.rowsOf(PG_TABLES.caseRecords)).toHaveLength(1);
    expect(executor.rowsOf(PG_TABLES.missionRevisions)).toHaveLength(1);
  });

  test("the whole run is ONE transaction (every statement inside it)", async () => {
    const executor = await migratedFake();
    const baseline = executor.log.length;
    await runSeed(executor);
    const seedStatements = executor.log.slice(baseline);
    expect(seedStatements.length).toBeGreaterThan(0);
    expect(seedStatements.every((entry) => entry.inTransaction)).toBe(true);
    expect(executor.hasCommitted()).toBe(true);
  });

  test("second run writes NOTHING: byte-identical state, markers skipped", async () => {
    const executor = await migratedFake();
    await runSeed(executor);
    const before = snapshotOf(executor);
    const statementCount = executor.log.length;

    const second = await runSeed(executor);

    expect(second.items.map((item) => item.action)).toEqual([
      "skipped-marker",
      "skipped-marker",
      "skipped-marker",
    ]);
    // Only the three marker SELECTs ran — no writes at all.
    expect(executor.log.length - statementCount).toBe(3);
    for (const entry of executor.log.slice(statementCount)) {
      expect(entry.sql).toBe(selectSeedMarkerSql());
    }
    expect(snapshotOf(executor)).toEqual(before);
  });

  test("existing user state wins: no overwrite, no marker, bytes untouched", async () => {
    const executor = await migratedFake();
    // Real user state occupying the demo evidence content id with DIFFERENT bytes.
    const userEvidence = { ...demoEvidence(), byteSize: 999999 };
    await new PgEvidenceStore(executor).putEvidenceRecord(userEvidence);

    const outcome = await runSeed(executor);

    expect(outcome.items[0]).toEqual({
      kind: "evidence",
      id: userEvidence.contentId,
      action: "kept-existing",
    });
    expect(outcome.items[1]?.action).toBe("seeded");
    expect(outcome.items[2]?.action).toBe("seeded");
    // No marker for the kept item — the conflict is re-evaluated on every run.
    expect(executor.rowsOf(PG_TABLES.seedMarkers)).toHaveLength(2);
    // The user's bytes are untouched.
    expect(executor.rowsOf(PG_TABLES.evidenceRecords)[0]?.["canonical"]).toBe(
      canonicalJsonStringify(userEvidence),
    );
    // Insert-if-absent never rewrote the row.
    expect(
      executor.log.some((entry) => entry.sql === insertRecordIfAbsentSql(PG_TABLES.evidenceRecords) && entry.params[0] === userEvidence.contentId),
    ).toBe(true);
    expect(await new PgEvidenceStore(executor).getEvidenceRecord(userEvidence.contentId)).toEqual(
      userEvidence,
    );
  });
});
