/**
 * Store-twin equivalence spot checks (PROD-005): the SAME schema-valid
 * fixtures through the Fs twins (real temp dirs) and the Pg twins (the
 * in-memory fake executor over the REAL v001 schema) produce IDENTICAL
 * parsed records — and, where the store exposes text, BYTE-IDENTICAL
 * canonical JSON. This is the interface-parity proof that DATABASE_URL
 * switches the storage medium without changing one domain byte.
 *
 * Fixtures are the demo-seed records (seed.ts) — schema-valid contract
 * objects built through the same codecs/parsers the domain uses.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { FsBoqStore } from "../../boq/store";
import { FsCaseStore } from "../../cases/store";
import { FsEvidenceStore } from "../../evidence/store";
import { FsMissionStore } from "../../missions/store";
import { runMigrations } from "../migrate";
import { demoCase, demoEvidence, demoMission } from "../seed";
import { fakePgExecutor } from "../testing";
import { PgBoqStore } from "./boq";
import { PgCaseStore } from "./cases";
import { PgEvidenceStore } from "./evidence";
import { PgMissionStore } from "./missions";

/** Fresh temp dir, removed when `fn` settles (Fs twin root). */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-pg-twins-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A fake executor with the REAL v001 schema applied (the Pg twin's DB). */
async function migratedFake() {
  const executor = fakePgExecutor();
  await runMigrations(executor);
  return executor;
}

describe("pg store twins: Fs ⇄ Pg equivalence over identical fixtures", () => {
  test("evidence: put/get/list are identical", async () => {
    const evidence = demoEvidence();
    await withTempDir(async (dir) => {
      const fs = new FsEvidenceStore(dir);
      await fs.putEvidenceRecord(evidence);
      const pg = new PgEvidenceStore(await migratedFake());
      await pg.putEvidenceRecord(evidence);

      expect(await pg.getEvidenceRecord(evidence.contentId)).toEqual(
        await fs.getEvidenceRecord(evidence.contentId),
      );
      expect(await pg.listEvidenceRecords()).toEqual(await fs.listEvidenceRecords());
    });
  });

  test("case: put/get/list are identical (canonical rewrite semantics)", async () => {
    const record = demoCase(demoEvidence().contentId);
    await withTempDir(async (dir) => {
      const fs = new FsCaseStore(dir);
      await fs.put(record);
      const pg = new PgCaseStore(await migratedFake());
      await pg.put(record);

      expect(await pg.get(record.caseId)).toEqual(await fs.get(record.caseId));
      expect(await pg.list()).toEqual(await fs.list());
    });
  });

  test("mission: append-only revision 0 round-trips identically", async () => {
    const mission = demoMission();
    await withTempDir(async (dir) => {
      const fs = new FsMissionStore(dir);
      await fs.save(mission);
      const pg = new PgMissionStore(await migratedFake());
      await pg.save(mission);

      const fsStored = await fs.get(mission.missionId);
      const pgStored = await pg.get(mission.missionId);
      expect(pgStored?.current).toEqual(fsStored?.current);
      expect(pgStored?.history).toEqual(fsStored?.history);
      expect(await pg.list()).toEqual(await fs.list());
    });
  });

  test("boq: source bytes, sidecar and record texts are identical", async () => {
    const contentId = demoEvidence().contentId; // any 64-hex content id
    const bytes = new TextEncoder().encode("aise-pg-twins: demo boq source bytes");
    const sidecar = {
      contentId,
      mediaType: "application/pdf",
      byteSize: bytes.byteLength,
      importedAt: "2026-01-15T10:00:00.000Z",
    };
    const record = {
      importId: contentId,
      source: { contentId, mediaType: "application/pdf", byteSize: bytes.byteLength },
      format: "pdf" as const,
      parse: { status: "unsupported_format" as const, reason: "demo: pdf is preserved, not parsed" },
    };
    await withTempDir(async (dir) => {
      const fs = new FsBoqStore(dir);
      const fsPut = await fs.putSource(contentId, bytes, sidecar);
      await fs.putRecord(record);
      const pg = new PgBoqStore(await migratedFake());
      const pgPut = await pg.putSource(contentId, bytes, sidecar);
      await pg.putRecord(record);

      expect(pgPut).toEqual(fsPut);
      expect(await pg.getSourceBytes(contentId)).toEqual(await fs.getSourceBytes(contentId));
      expect(await pg.getSidecar(contentId)).toEqual(await fs.getSidecar(contentId));
      expect(await pg.getRecord(contentId)).toEqual(await fs.getRecord(contentId));
      // BYTE-identical canonical record texts across the two stores.
      expect(await pg.getRecordText(contentId)).toBe(await fs.getRecordText(contentId));
      expect(await pg.getRecordText(contentId)).toBe(canonicalJsonStringify(record));
      expect(await pg.listRecords()).toEqual(await fs.listRecords());
    });
  });
});
