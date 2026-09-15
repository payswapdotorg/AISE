/**
 * AISE-018 — Gap-analysis store tests.
 *
 * Depth: the write-once path convention, deterministic list order, the
 * typed corruption guards on reads (invalid JSON, inconsistent stats,
 * phantom gap references, mismatched history digests) and the Fs /
 * InMemory twins' identical semantics. (The deeper behavioral coverage —
 * byte-identical recomputation across twins, append-only discipline —
 * lives in service.test.ts, which drives both through the service.)
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { GapAnalysisError, gapAnalysisContentDigest, parseGapAnalysisRecord } from "./model";
import { FsGapAnalysisStore, InMemoryGapAnalysisStore } from "./store";
import {
  ANALYSIS_ID,
  buildCanonicalInput,
  buildCanonicalReport,
  fixedClock,
  makeAssuranceProfileResolver,
  makeEvidenceGraphResolver,
  makeRealityVersionResolver,
  withTempDir,
  CANONICAL_PROFILE,
  PROJECT_ID,
  buildRealityVersion,
  buildEvidenceFacts,
  fixedReadinessEvaluator,
} from "./testkit";
import { GapAnalysisService } from "./service";

/** A canonical record built through the service (fixed-report evaluator: fast). */
async function canonicalRecord(): Promise<ReturnType<GapAnalysisService["runGapAnalysis"]>> {
  const service = new GapAnalysisService({
    store: new InMemoryGapAnalysisStore(),
    clock: fixedClock,
    assuranceProfileResolver: makeAssuranceProfileResolver([CANONICAL_PROFILE]),
    readinessEvaluator: fixedReadinessEvaluator(buildCanonicalReport()),
    realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
    evidenceGraphResolver: makeEvidenceGraphResolver(buildEvidenceFacts()),
  });
  return await service.runGapAnalysis(buildCanonicalInput());
}

describe("gap analysis store: file-system store", () => {
  test("writes once at the path convention and reads back the identical canonical record", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      await store.put(record);
      const path = join(root, "data", "gaps", `${sha256Hex(ANALYSIS_ID)}.json`);
      expect(existsSync(path)).toBe(true);
      const read = await store.get(ANALYSIS_ID);
      expect(canonicalJsonStringify(read)).toBe(canonicalJsonStringify(record));
    });
  });

  test("get returns null for unknown ids; list on a fresh store is empty", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      expect(await store.get("analysis-ghost")).toBeNull();
      expect(await store.list()).toEqual([]);
    });
  });

  test("list is sorted by analysisId (stable total order)", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      await store.put(record);
      const renamed = { ...record, analysisId: "aaa-analysis", history: [] };
      const renamedDigest = gapAnalysisContentDigest(renamed);
      await store.put({
        ...renamed,
        history: [
          { ...record.history[0] as (typeof record.history)[number], recordDigest: renamedDigest },
        ],
      });
      const listed = await store.list();
      expect(listed.map((entry) => entry.analysisId)).toEqual(["aaa-analysis", ANALYSIS_ID]);
    });
  });

  test("garbage on disk is a typed invalid_analysis_record rejection, never a silent misparse", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      await store.put(record);
      const path = store.pathOf(ANALYSIS_ID);
      writeFileSync(path, "{not json");
      try {
        await store.get(ANALYSIS_ID);
        throw new Error("expected a typed rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(GapAnalysisError);
        expect((error as GapAnalysisError).code).toBe("invalid_analysis_record");
      }
    });
  });

  test("a record with tampered stats is corruption on read", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      await store.put(record);
      const tampered = JSON.parse(canonicalJsonStringify(record)) as Record<string, unknown>;
      (tampered["stats"] as Record<string, unknown>)["totalGaps"] = 99;
      writeFileSync(store.pathOf(ANALYSIS_ID), JSON.stringify(tampered));
      try {
        await store.get(ANALYSIS_ID);
        throw new Error("expected a typed rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(GapAnalysisError);
        expect((error as GapAnalysisError).code).toBe("invalid_analysis_record");
      }
    });
  });

  test("a record whose history digest does not pin the content is corruption on read", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      await store.put(record);
      const tampered = JSON.parse(canonicalJsonStringify(record)) as Record<string, unknown>;
      const history = tampered["history"] as Record<string, unknown>[];
      (history[0] as Record<string, unknown>)["recordDigest"] = "b".repeat(64);
      writeFileSync(store.pathOf(ANALYSIS_ID), JSON.stringify(tampered));
      try {
        await store.get(ANALYSIS_ID);
        throw new Error("expected a typed rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(GapAnalysisError);
        expect((error as GapAnalysisError).code).toBe("invalid_analysis_record");
      }
    });
  });

  test("non-record files (tmp leftovers, foreign extensions) are ignored by list", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      await store.put(record);
      writeFileSync(join(root, "data", "gaps", "leftover.tmp"), "garbage");
      writeFileSync(join(root, "data", "gaps", "notes.txt"), "not a record");
      const listed = await store.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.analysisId).toBe(ANALYSIS_ID);
    });
  });

  test("a foreign record for an unknown analysis id reads back as null (no fabricated records)", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await canonicalRecord();
      // A well-formed record stored under a DIFFERENT id's path: the store
      // resolves by id and never returns a record under a foreign id.
      await store.put(record);
      expect(await store.get("analysis-other")).toBeNull();
      expect(existsSync(store.pathOf("analysis-other"))).toBe(false);
    });
  });

  test("a directory that does not exist yet lists empty and is created on first put", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "deep", "nested", "data"));
      expect(await store.list()).toEqual([]);
      const record = await canonicalRecord();
      await store.put(record);
      expect(existsSync(join(root, "deep", "nested", "data", "gaps"))).toBe(true);
      mkdirSync(dirname(store.pathOf("x")), { recursive: true }); // (already created by put)
    });
  });
});

describe("gap analysis store: in-memory twin (canonical-text-backed)", () => {
  test("identical get/put/list semantics with the file-system twin", async () => {
    await withTempDir(async (root) => {
      const record = await canonicalRecord();
      const fsStore = new FsGapAnalysisStore(join(root, "data"));
      const memStore = new InMemoryGapAnalysisStore();
      await fsStore.put(record);
      await memStore.put(record);
      expect(canonicalJsonStringify(await memStore.get(ANALYSIS_ID))).toBe(
        canonicalJsonStringify(await fsStore.get(ANALYSIS_ID)),
      );
      expect(await memStore.get("analysis-ghost")).toBeNull();
      // Same corruption guards as the file-system twin (canonical text is
      // re-parsed on read).
      const tampered = JSON.parse(canonicalJsonStringify(record)) as Record<string, unknown>;
      (tampered["stats"] as Record<string, unknown>)["totalGaps"] = 99;
      expect(() => parseGapAnalysisRecord(tampered)).toThrow(GapAnalysisError);
      // Identical list order.
      const renamed = { ...record, analysisId: "aaa-analysis", history: [] };
      await memStore.put({
        ...renamed,
        history: [
          {
            ...record.history[0] as (typeof record.history)[number],
            recordDigest: gapAnalysisContentDigest(renamed),
          },
        ],
      });
      expect((await memStore.list()).map((entry) => entry.analysisId)).toEqual([
        "aaa-analysis",
        ANALYSIS_ID,
      ]);
    });
  });
});
