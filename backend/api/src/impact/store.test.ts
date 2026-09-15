/**
 * AISE-028 — Impact store tests (write-once persistence).
 *
 * Covers: the Fs/InMemory twins' byte-identical behavior, the write-once
 * discipline (no update/delete surface; different-content overwrites are a
 * typed divergence; identical re-puts are no-ops), the path convention,
 * deterministic listing and the corrupted-file guard.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { ImpactError, type ImpactRecord } from "./model";
import { FsImpactStore, InMemoryImpactStore } from "./store";
import { CANONICAL_COMPUTE, canonicalResolvers, fixedClock, withTempDir } from "./testkit";
import { ImpactService } from "./service";

async function computeRecord(): Promise<ImpactRecord> {
  const service = new ImpactService({
    store: new InMemoryImpactStore(),
    clock: fixedClock,
    ...canonicalResolvers(),
  });
  return service.computeImpact(CANONICAL_COMPUTE);
}

describe("impact store: the write-once discipline", () => {
  test("the store interface exposes NO update or delete surface (append-only by shape)", () => {
    for (const store of [new FsImpactStore("/tmp/aise-impact-shape"), new InMemoryImpactStore()]) {
      const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(store)).filter(
        (name) => name !== "constructor",
      );
      expect(methodNames.sort()).toEqual(
        [...(store instanceof FsImpactStore ? ["pathOf"] : []), "get", "list", "put"].sort(),
      );
      for (const forbidden of ["update", "delete", "remove", "overwrite"]) {
        expect(methodNames.includes(forbidden)).toBe(false);
      }
    }
  });

  test("Fs put/get round-trip at the documented path convention", async () => {
    const record = await computeRecord();
    await withTempDir(async (root) => {
      const store = new FsImpactStore(root);
      await store.put(record);
      const path = join(root, "impacts", `${sha256Hex(record.impactId)}.json`);
      expect(existsSync(path)).toBe(true);
      expect((await store.get(record.impactId))!.impactId).toBe(record.impactId);
    });
  });

  test("a byte-identical re-put is a no-op; a DIFFERENT record under the same id is a typed divergence", async () => {
    const record = await computeRecord();
    const other = await computeRecord();
    const tampered: ImpactRecord = {
      ...record,
      report: { ...record.report, title: "Different content" },
    };
    // In-memory twin:
    const memory = new InMemoryImpactStore();
    await memory.put(record);
    await memory.put(record); // identical -> no-op
    expect(await memory.get(record.impactId)).not.toBeNull();
    let refused = false;
    try {
      await memory.put(tampered);
    } catch (error) {
      refused = true;
      expect(error).toBeInstanceOf(ImpactError);
      expect((error as ImpactError).code).toBe("impact_record_divergence");
    }
    expect(refused).toBe(true);
    void other;
    // File-system twin: same discipline.
    await withTempDir(async (root) => {
      const store = new FsImpactStore(root);
      await store.put(record);
      await store.put(record); // identical -> no-op
      let fsRefused = false;
      try {
        await store.put(tampered);
      } catch (error) {
        fsRefused = true;
        expect((error as ImpactError).code).toBe("impact_record_divergence");
      }
      expect(fsRefused).toBe(true);
    });
  });
});

describe("impact store: the Fs and InMemory twins are byte-identical", () => {
  test("the same operation sequence produces identical canonical record text in both stores", async () => {
    const record = await computeRecord();
    await withTempDir(async (root) => {
      const fsStore = new FsImpactStore(root);
      const memoryStore = new InMemoryImpactStore();
      await fsStore.put(record);
      await memoryStore.put(record);
      const fromFs = await fsStore.get(record.impactId);
      const fromMemory = await memoryStore.get(record.impactId);
      expect(canonicalJsonStringify(fromMemory)).toBe(canonicalJsonStringify(fromFs));
      expect(canonicalJsonStringify(fromFs)).toBe(canonicalJsonStringify(record));
    });
  });

  test("listing is deterministic (sorted by impactId) in both twins", async () => {
    const record = await computeRecord();
    const second = await new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      ...canonicalResolvers(),
    }).computeImpact({ ...CANONICAL_COMPUTE, rates: CANONICAL_COMPUTE.rates?.slice(0, 2) });
    await withTempDir(async (root) => {
      const fsStore = new FsImpactStore(root);
      const memoryStore = new InMemoryImpactStore();
      for (const entry of [record, second]) {
        await fsStore.put(entry);
        await memoryStore.put(entry);
      }
      const fsList = (await fsStore.list()).map((entry) => entry.impactId);
      const memoryList = (await memoryStore.list()).map((entry) => entry.impactId);
      expect(memoryList).toEqual(fsList);
      expect([...fsList].sort()).toEqual(fsList);
      expect(fsList).toHaveLength(2);
    });
  });

  test("an empty store lists nothing", async () => {
    await withTempDir(async (root) => {
      expect(await new FsImpactStore(root).list()).toEqual([]);
    });
    expect(await new InMemoryImpactStore().list()).toEqual([]);
  });
});

describe("impact store: the corrupted-file guard", () => {
  test("garbage JSON on disk is a typed invalid_impact_record, never a silent misparse", async () => {
    const record = await computeRecord();
    await withTempDir(async (root) => {
      const store = new FsImpactStore(root);
      await store.put(record);
      writeFileSync(store.pathOf(record.impactId), "not json at all");
      let refused = false;
      try {
        await store.get(record.impactId);
      } catch (error) {
        refused = true;
        expect(error).toBeInstanceOf(ImpactError);
        expect((error as ImpactError).code).toBe("invalid_impact_record");
      }
      expect(refused).toBe(true);
    });
  });

  test("a tampered report body (digest mismatch) is a typed invalid_impact_record on read", async () => {
    const record = await computeRecord();
    await withTempDir(async (root) => {
      const store = new FsImpactStore(root);
      await store.put(record);
      const text = readFileSync(store.pathOf(record.impactId), "utf8");
      const parsed = JSON.parse(text) as { report: { title: string } };
      parsed.report.title = "Tampered after the fact";
      writeFileSync(store.pathOf(record.impactId), JSON.stringify(parsed, null, 2));
      let refused = false;
      try {
        await store.get(record.impactId);
      } catch (error) {
        refused = true;
        expect((error as ImpactError).code).toBe("invalid_impact_record");
        expect((error as ImpactError).detail).toContain("reportDigest");
      }
      expect(refused).toBe(true);
    });
  });
});
