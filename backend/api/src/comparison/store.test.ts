/**
 * AISE-032 — Comparison store tests: file conventions, canonical bytes,
 * the write-once/append-only surface (no update path exists), Fs +
 * InMemory twin byte-parity, typed rejections of corrupted records
 * (invalid JSON, inconsistent stats, rewritten history) and stable list
 * ordering.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { ComparisonError, parseComparisonRecord } from "./model";
import { ComparisonService } from "./service";
import { FsComparisonStore, InMemoryComparisonStore } from "./store";
import {
  COMPARISON_ID,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  PROJECT_ID,
  VERSION_ID,
  buildCanonicalInput,
  makeComparisonService,
  withTempDir,
} from "./testkit";

describe("comparison store: file conventions and canonical bytes", () => {
  test("records live at comparisons/<sha256(id)>.json in canonical JSON", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      const record = await service.runComparison(buildCanonicalInput());
      const path = store.pathOf(COMPARISON_ID);
      expect(path).toBe(join(root, "data", "comparisons", `${sha256Hex(COMPARISON_ID)}.json`));
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(canonicalJsonStringify(record));
      expect(readFileSync(path, "utf8")).toContain('"status": "deviation_beyond_tolerance"');
    });
  });

  test("get/list round-trip through the parser; list is sorted by comparisonId", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      await service.runComparison({ ...buildCanonicalInput(), comparisonId: "comparison-b" });
      await service.runComparison({ ...buildCanonicalInput(), comparisonId: "comparison-a" });
      const fetched = await store.get("comparison-a");
      expect(fetched?.comparisonId).toBe("comparison-a");
      expect(await store.get("comparison-ghost")).toBeNull();
      const listed = await store.list();
      expect(listed.map((record) => record.comparisonId)).toEqual(["comparison-a", "comparison-b"]);
    });
  });

  test("an empty store lists nothing and misses without touching the filesystem tree", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      expect(await store.list()).toEqual([]);
      expect(await store.get(COMPARISON_ID)).toBeNull();
    });
  });

  test("foreign files (.tmp leftovers, non-JSON) are never touched by list()", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      await service.runComparison(buildCanonicalInput());
      const dir = join(root, "data", "comparisons");
      writeFileSync(join(dir, `${sha256Hex("leftover")}.json.tmp`), "garbage");
      const listed = await store.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.comparisonId).toBe(COMPARISON_ID);
    });
  });
});

describe("comparison store: corrupted records are typed rejections (never silent)", () => {
  test("invalid JSON on disk is invalid_comparison_record", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const dir = join(root, "data", "comparisons");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${sha256Hex(COMPARISON_ID)}.json`), "{not json");
      try {
        await store.get(COMPARISON_ID);
        expect.unreachable();
      } catch (error) {
        const typed = error as ComparisonError;
        expect(typed.code).toBe("invalid_comparison_record");
        expect(typed.detail).toContain("not valid JSON");
      }
    });
  });

  test("rewritten history (digest no longer pinning the content) is corruption", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      const record = await service.runComparison(buildCanonicalInput());
      // Simulate history tampering: append a second (forged) event whose
      // digest pins nothing — a record with rewritten history must refuse
      // to read back.
      const tampered = {
        ...record,
        history: [
          ...record.history,
          {
            eventId: "evt-000002",
            eventType: "comparison_recorded",
            occurredAt: FIXED_NOW,
            recordDigest: "0".repeat(64),
          },
        ],
      };
      writeFileSync(store.pathOf(COMPARISON_ID), canonicalJsonStringify(tampered));
      try {
        await store.get(COMPARISON_ID);
        expect.unreachable();
      } catch (error) {
        expect((error as ComparisonError).code).toBe("invalid_comparison_record");
        expect((error as ComparisonError).detail).toContain("history");
      }
    });
  });

  test("stats inconsistent with the persisted entries are corruption", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      const record = await service.runComparison(buildCanonicalInput());
      const tampered = {
        ...record,
        stats: { ...record.stats, discrepancies: record.stats.discrepancies + 1 },
      };
      writeFileSync(store.pathOf(COMPARISON_ID), canonicalJsonStringify(tampered));
      try {
        await store.get(COMPARISON_ID);
        expect.unreachable();
      } catch (error) {
        expect((error as ComparisonError).code).toBe("invalid_comparison_record");
        expect((error as ComparisonError).detail).toContain("stats.discrepancies");
      }
    });
  });

  test("the parser re-verified on every read: missing creation event is corruption", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      const record = await service.runComparison(buildCanonicalInput());
      writeFileSync(store.pathOf(COMPARISON_ID), canonicalJsonStringify({ ...record, history: [] }));
      try {
        await store.get(COMPARISON_ID);
        expect.unreachable();
      } catch (error) {
        expect((error as ComparisonError).code).toBe("invalid_comparison_record");
        expect((error as ComparisonError).detail).toContain("NON-EMPTY");
      }
    });
  });
});

describe("comparison store: Fs + InMemory twins (byte-identical behavior)", () => {
  test("the same operation sequence over fresh twins yields identical canonical texts", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsComparisonStore(join(root, "data"));
      const memoryStore = new InMemoryComparisonStore();
      const ids = [COMPARISON_ID, "comparison-twin-2", "comparison-twin-0"];
      for (const comparisonId of ids) {
        await makeComparisonService(fsStore).runComparison({
          ...buildCanonicalInput(),
          comparisonId,
        });
        await makeComparisonService(memoryStore).runComparison({
          ...buildCanonicalInput(),
          comparisonId,
        });
      }
      for (const comparisonId of ids) {
        const fromFs = await fsStore.get(comparisonId);
        const fromMemory = await memoryStore.get(comparisonId);
        expect(canonicalJsonStringify(fromMemory)).toBe(canonicalJsonStringify(fromFs));
      }
      expect(canonicalJsonStringify(await memoryStore.list())).toBe(
        canonicalJsonStringify(await fsStore.list()),
      );
    });
  });

  test("the InMemory twin rejects corrupted canonical text exactly like the Fs twin", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(fsStore);
      const record = await service.runComparison(buildCanonicalInput());
      const memoryStore = new InMemoryComparisonStore();
      await memoryStore.put({
        ...record,
        stats: { ...record.stats, totalEntries: 999 },
      });
      try {
        await memoryStore.get(COMPARISON_ID);
        expect.unreachable();
      } catch (error) {
        expect((error as ComparisonError).code).toBe("invalid_comparison_record");
      }
    });
  });

  test("put is the ONLY mutation; a re-put of identical bytes is idempotent (write-once content)", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      const record = await service.runComparison(buildCanonicalInput());
      const before = readFileSync(store.pathOf(COMPARISON_ID), "utf8");
      // Re-put the SAME record (no-op rewrite of identical canonical bytes):
      await store.put(record);
      expect(readFileSync(store.pathOf(COMPARISON_ID), "utf8")).toBe(before);
    });
  });
});

describe("comparison store: determinism across fresh stores", () => {
  test("two fresh Fs stores over the same operation sequence produce byte-identical trees", async () => {
    await withTempDir(async (rootA) => {
      await withTempDir(async (rootB) => {
        const storeA = new FsComparisonStore(join(rootA, "data"));
        const storeB = new FsComparisonStore(join(rootB, "data"));
        for (const comparisonId of [COMPARISON_ID, "comparison-det-2"]) {
          await makeComparisonService(storeA).runComparison({
            ...buildCanonicalInput(),
            comparisonId,
          });
          await makeComparisonService(storeB).runComparison({
            ...buildCanonicalInput(),
            comparisonId,
          });
        }
        for (const comparisonId of [COMPARISON_ID, "comparison-det-2"]) {
          expect(readFileSync(storeA.pathOf(comparisonId), "utf8")).toBe(
            readFileSync(storeB.pathOf(comparisonId), "utf8"),
          );
        }
      });
    });
  });

  test("a deleted data dir recovers as an empty store (rebuildable projection)", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      await service.runComparison(buildCanonicalInput());
      rmSync(join(root, "data", "comparisons"), { recursive: true, force: true });
      expect(await store.list()).toEqual([]);
      // And a fresh run after the wipe re-persists cleanly.
      const record = await service.runComparison({
        ...buildCanonicalInput(),
        comparisonId: "comparison-after-wipe",
      });
      expect(record.comparisonId).toBe("comparison-after-wipe");
      expect(await store.get("comparison-after-wipe")).not.toBeNull();
    });
  });
});

describe("comparison store: the parsed record is parser-clean", () => {
  test("a record built by the service parses standalone through parseComparisonRecord", async () => {
    await withTempDir(async (root) => {
      const store = new FsComparisonStore(join(root, "data"));
      const service = makeComparisonService(store);
      await service.runComparison(buildCanonicalInput());
      const raw = JSON.parse(readFileSync(store.pathOf(COMPARISON_ID), "utf8")) as unknown;
      const parsed = parseComparisonRecord(raw);
      expect(parsed.realityRef).toEqual({ projectId: PROJECT_ID, versionId: VERSION_ID });
      expect(parsed.stats.totalEntries).toBe(12);
    });
  });

  test("a service over the InMemory twin behaves identically for reads and lists", async () => {
    const store = new InMemoryComparisonStore();
    const service: ComparisonService = makeComparisonService(store);
    await service.runComparison(buildCanonicalInput());
    const fetched = await service.getComparison(COMPARISON_ID);
    expect(fetched?.inputDigest).toMatch(/^[0-9a-f]{64}$/);
    const summaries = await service.listComparisons();
    expect(summaries[0]?.designSystemClass).toBe("bim-ifc");
    expect(summaries[0]?.discrepancies).toBe(1);
    // The membership fixture keeps evidence resolvable:
    expect(KNOWN_EVIDENCE.length).toBe(8);
  });
});
