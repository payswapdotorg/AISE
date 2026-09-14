/**
 * Mapping store tests (AISE-017) — append-only versioned persistence
 * discipline over real temporary file-system trees and the in-memory twin:
 * canonical bytes on disk, monotonic versions, byte-untouched earlier
 * versions, typed version_exists/version_gap/lineage refusals, defensive
 * record parsing and cross-store byte parity.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { fixedClock, withTempDir } from "../testkit";
import { MappingError, mappingIdentity, type BoqMapping, type MappingEntry, type MappingStatus } from "./model";
import { FsMappingStore, InMemoryMappingStore } from "./store";

const IMPORT_ID = `ab`.repeat(32);
const FIXED_NOW = fixedClock();
const FIXED_NOW2 = "2026-02-02T09:00:00.000Z";

function entryOf(entryId: string, status: MappingStatus): MappingEntry {
  return {
    entryId,
    boqItem: {
      sectionTitle: null,
      rowNumber: 4,
      descriptionCellRef: "Finishes!B4",
      unitCellRef: "Finishes!C4",
      originalText: "Plaster to internal walls",
    },
    targets: status === "mapped" ? [{ nodeId: "wall-1", matchNote: "concept PLASTERING" }] : [],
    status,
    confidence: status === "mapped" ? "medium" : status === "ambiguous" ? "low" : "uncertain",
    method: status === "unmapped" ? "unresolved" : "normalized_concept_match",
    provenance: { recordedAt: FIXED_NOW },
  };
}

function mappingV(version: number, entryId = "e1"): BoqMapping {
  return {
    mappingId: mappingIdentity(IMPORT_ID),
    importId: IMPORT_ID,
    version,
    entries: [entryOf(entryId, version === 2 ? "mapped" : "unmapped")],
  };
}

describe("FsMappingStore (append-only, versioned)", () => {
  test("put v1: canonical bytes on disk under sha256(importId)/v001.json", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      const mapping = mappingV(1);
      await store.put(mapping);
      const path = join(dataDir, "boq", "mappings", sha256Hex(IMPORT_ID), "v001.json");
      expect(readFileSync(path, "utf8")).toBe(canonicalJsonStringify(mapping));
      expect(await store.getText(IMPORT_ID, 1)).toBe(canonicalJsonStringify(mapping));
    });
  });

  test("monotonic versions round-trip; latest follows the chain", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1));
      await store.put(mappingV(2));
      expect(await store.listVersions(IMPORT_ID)).toEqual([1, 2]);
      const latest = await store.getLatest(IMPORT_ID);
      expect(latest?.version).toBe(2);
      const v1 = await store.getVersion(IMPORT_ID, 1);
      expect(v1?.version).toBe(1);
      expect(v1?.entries[0]?.status).toBe("unmapped");
    });
  });

  test("v1 bytes stay UNCHANGED after later versions are appended", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1));
      const path = join(dataDir, "boq", "mappings", sha256Hex(IMPORT_ID), "v001.json");
      const before = readFileSync(path, "utf8");
      await store.put(mappingV(2));
      await store.put({ ...mappingV(1), version: 3, entries: [entryOf("e3", "mapped")] });
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(await store.getText(IMPORT_ID, 1)).toBe(before);
    });
  });

  test("version_exists refusal on differing content; original retained", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1));
      const original = await store.getText(IMPORT_ID, 1);
      await expect(store.put({ ...mappingV(1), entries: [entryOf("other", "mapped")] })).rejects.toThrow();
      expect(await store.getText(IMPORT_ID, 1)).toBe(original);
    });
  });

  test("identical re-put of an existing version is an idempotent no-op", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1));
      await store.put(mappingV(2));
      await expect(store.put(mappingV(1))).resolves.toBeUndefined();
      expect(await store.listVersions(IMPORT_ID)).toEqual([1, 2]);
    });
  });

  test("version_gap refusal: v3 after v1 is rejected (gap-free chain)", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1));
      await expect(store.put(mappingV(3))).rejects.toThrow();
      expect(await store.listVersions(IMPORT_ID)).toEqual([1]);
    });
  });

  test("invalid import ids and mismatching lineage identities are refused", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await expect(store.put({ ...mappingV(1), importId: "nothex" })).rejects.toThrow();
      await expect(store.getVersion("zz", 1)).rejects.toThrow();
      await expect(
        store.put({ ...mappingV(1), mappingId: "0".repeat(64) }),
      ).rejects.toThrow();
      await expect(store.put({ ...mappingV(1), version: 0 })).rejects.toThrow();
    });
  });

  test("empty lineage: null lookups and empty version list", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      expect(await store.getLatest(IMPORT_ID)).toBeNull();
      expect(await store.getVersion(IMPORT_ID, 1)).toBeNull();
      expect(await store.getText(IMPORT_ID, 1)).toBeNull();
      expect(await store.listVersions(IMPORT_ID)).toEqual([]);
    });
  });

  test("garbage stored bytes -> typed invalid_mapping_record", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1));
      const path = join(dataDir, "boq", "mappings", sha256Hex(IMPORT_ID), "v001.json");
      writeFileSync(path, "{not json");
      await expect(store.getVersion(IMPORT_ID, 1)).rejects.toThrow(MappingError);
      writeFileSync(
        path,
        JSON.stringify({ importId: IMPORT_ID, mappingId: mappingIdentity(IMPORT_ID), version: 1, entries: [] }),
      );
      await expect(store.getVersion(IMPORT_ID, 1)).resolves.toMatchObject({ version: 1 });
    });
  });

  test("two fresh stores produce byte-identical version files", async () => {
    const runSequence = async (dataDir: string): Promise<string[]> => {
      const store = new FsMappingStore(dataDir);
      await store.put(mappingV(1, "e1"));
      await store.put(mappingV(2, "e2"));
      return [
        (await store.getText(IMPORT_ID, 1)) ?? "",
        (await store.getText(IMPORT_ID, 2)) ?? "",
      ];
    };
    await withTempDir(async (first) => {
      await withTempDir(async (second) => {
        expect(await runSequence(first)).toEqual(await runSequence(second));
      });
    });
  });
});

describe("InMemoryMappingStore (deterministic twin)", () => {
  test("same append-only discipline: exists / gap / idempotent / null lookups", async () => {
    const store = new InMemoryMappingStore();
    await store.put(mappingV(1));
    await expect(store.put({ ...mappingV(1), entries: [entryOf("x", "mapped")] })).rejects.toThrow();
    await expect(store.put(mappingV(3))).rejects.toThrow();
    await store.put(mappingV(2));
    await expect(store.put(mappingV(1))).resolves.toBeUndefined();
    expect(await store.listVersions(IMPORT_ID)).toEqual([1, 2]);
    expect(await store.getLatest(IMPORT_ID)).toMatchObject({ version: 2 });
    expect(await store.getLatest("cd".repeat(32))).toBeNull();
    expect(await store.listVersions("cd".repeat(32))).toEqual([]);
    await expect(store.put({ ...mappingV(1), importId: "bad" })).rejects.toThrow();
  });

  test("byte parity with the file-system store (canonical text identical)", async () => {
    await withTempDir(async (dataDir) => {
      const fsStore = new FsMappingStore(dataDir);
      const memoryStore = new InMemoryMappingStore();
      for (const version of [1, 2, 3]) {
        const mapping = { ...mappingV(version), version, entries: [entryOf(`e${version}`, "mapped")] };
        await fsStore.put(mapping);
        await memoryStore.put(mapping);
      }
      for (const version of [1, 2, 3]) {
        expect(await memoryStore.getText(IMPORT_ID, version)).toBe(
          await fsStore.getText(IMPORT_ID, version),
        );
      }
      expect(await memoryStore.getLatest(IMPORT_ID)).toEqual(await fsStore.getLatest(IMPORT_ID));
    });
  });

  test("recordedAt differences are the only permitted byte differences (append semantics)", async () => {
    const store = new InMemoryMappingStore();
    const base = mappingV(1);
    await store.put(base);
    const later: BoqMapping = {
      ...base,
      version: 2,
      entries: [{ ...entryOf("e1", "mapped"), provenance: { recordedAt: FIXED_NOW2 } }],
    };
    await store.put(later);
    expect(await store.getText(IMPORT_ID, 1)).toBe(canonicalJsonStringify(base));
    expect(await store.getText(IMPORT_ID, 2)).toBe(canonicalJsonStringify(later));
  });
});
