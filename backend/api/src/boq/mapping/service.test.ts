/**
 * Mapping service tests (AISE-017) — the policy engine over real temporary
 * file-system stores: full 011 -> 014 -> 017 pipeline over a CSV BOQ,
 * normalization_required refusal, manual revisions with untouched earlier
 * bytes, deterministic matcher re-runs (v3 identical entries), source
 * immutability (BOQ record + normalized view bytes unchanged) and
 * byte-identical determinism across two fresh pipelines.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { NormalizationService } from "../normalization/service";
import { FsNormalizationStore } from "../normalization/store";
import { NORMALIZER_ID } from "../normalization/types";
import { BoqService } from "../service";
import { FsBoqStore } from "../store";
import { fixedClock, text, withTempDir } from "../testkit";
import { MappingError, computeMappingStats, mappingIdentity, type GraphSnapshot } from "./model";
import { MappingService, MappingServiceError } from "./service";
import { FsMappingStore } from "./store";

const CSV_MEDIA_TYPE = "text/csv";

const BOQ_CSV = text(
  [
    "Item,Description,Unit,Qty,Rate",
    "1,Plaster to internal walls,m2,100,5",
    "2,Steel work,m2,100,5",
    "TOTAL,,,200,10",
    "",
  ].join("\n"),
);

function wallsSnapshot(): GraphSnapshot {
  return {
    nodes: [1, 2, 3].map((index) => ({
      nodeId: `wall-${index}`,
      kind: "element",
      properties: [{ key: "semantic.kind", value: "wall" }],
    })),
  };
}

interface Pipeline {
  readonly boq: BoqService;
  readonly mapping: MappingService;
  readonly store: FsMappingStore;
  readonly importId: string;
  readonly dataDir: string;
}

/** Import the CSV, normalize it and return the wired pipeline. */
async function pipeline(dataDir: string, normalize = true): Promise<Pipeline> {
  const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
  const normalization = new NormalizationService({
    store: new FsNormalizationStore(dataDir),
    clock: fixedClock,
    boq,
  });
  const store = new FsMappingStore(dataDir);
  const mapping = new MappingService({
    store,
    clock: fixedClock,
    normalization,
    boq,
  });
  const imported = await boq.importSource(BOQ_CSV, CSV_MEDIA_TYPE, "csv");
  expect(imported.parse.status).toBe("parsed");
  if (normalize) {
    await normalization.normalizeImport(imported.importId);
  }
  return { boq, mapping, store, importId: imported.importId, dataDir };
}

describe("MappingService.runMatcher", () => {
  test("full pipeline: v1 persisted with stats, provenance and one-to-many targets", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir);
      const result = await mapping.runMatcher(importId, wallsSnapshot());
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.mappingId).toBe(mappingIdentity(importId));
      expect(result!.entries.length).toBe(2);
      const plaster = result!.entries[0]!;
      expect(plaster.status).toBe("mapped");
      expect(plaster.targets.map((target) => target.nodeId).sort()).toEqual([
        "wall-1",
        "wall-2",
        "wall-3",
      ]);
      expect(plaster.provenance.dictionaryVersion).toBe("1.0.0");
      expect(plaster.provenance.normalizerVersion).toBe(NORMALIZER_ID);
      expect(plaster.provenance.recordedAt).toBe(fixedClock());
      const steel = result!.entries[1]!;
      expect(steel.status).toBe("unmapped");
      expect(steel.method).toBe("unresolved");
      expect(computeMappingStats(result!)).toEqual({
        mapped: 1,
        ambiguous: 0,
        unmapped: 1,
        byConfidence: { high: 0, medium: 1, low: 0, uncertain: 1 },
      });
      // Persisted under the append-only versioned tree.
      expect(await mapping.listVersions(importId)).toEqual([1]);
      const path = join(dataDir, "boq", "mappings", sha256Hex(importId), "v001.json");
      expect(readFileSync(path, "utf8")).toBe(canonicalJsonStringify(result));
    });
  });

  test("unknown import -> null (router answers a precise 404)", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping } = await pipeline(dataDir);
      expect(await mapping.runMatcher("ee".repeat(32), wallsSnapshot())).toBeNull();
    });
  });

  test("no stored normalization -> typed normalization_required (never guessed)", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir, false);
      try {
        await mapping.runMatcher(importId, wallsSnapshot());
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(MappingServiceError);
        expect((error as MappingServiceError).code).toBe("normalization_required");
      }
      expect(await mapping.listVersions(importId)).toEqual([]);
    });
  });

  test("sources stay untouched: BOQ record + raw source + view bytes unchanged", async () => {
    await withTempDir(async (dataDir) => {
      const { boq, mapping, importId } = await pipeline(dataDir);
      const recordBefore = readFileSync(
        join(dataDir, "boq", "documents", `${sha256Hex(importId)}.json`),
        "utf8",
      );
      const contentId = sha256Hex(BOQ_CSV);
      const sourceBefore = readFileSync(
        join(dataDir, "boq", "sources", contentId.slice(0, 2), contentId),
      );
      const viewKey = sha256Hex(importId + "1.0.0");
      const viewBefore = readFileSync(
        join(dataDir, "boq", "normalizations", `${viewKey}.json`),
        "utf8",
      );
      await mapping.runMatcher(importId, wallsSnapshot());
      expect(
        readFileSync(join(dataDir, "boq", "documents", `${sha256Hex(importId)}.json`), "utf8"),
      ).toBe(recordBefore);
      expect(
        readFileSync(join(dataDir, "boq", "sources", contentId.slice(0, 2), contentId)),
      ).toEqual(sourceBefore);
      expect(readFileSync(join(dataDir, "boq", "normalizations", `${viewKey}.json`), "utf8")).toBe(
        viewBefore,
      );
      expect(boq.getImport(importId)).resolves.toBeTruthy();
    });
  });
});

describe("MappingService.applyManualMapping", () => {
  test("manual decision -> v2; v1 bytes unchanged on disk; note recorded", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir);
      const v1 = await mapping.runMatcher(importId, wallsSnapshot());
      const v1Path = join(dataDir, "boq", "mappings", sha256Hex(importId), "v001.json");
      const v1Bytes = readFileSync(v1Path, "utf8");
      const target = v1!.entries[1]!; // the unresolved "Steel work" row
      const v2 = await mapping.applyManualMapping(importId, {
        entryId: target.entryId,
        targets: [{ nodeId: "beam-9", spacePath: ["Ground Floor"] }],
        note: "beam over the ground-floor entrance",
      });
      expect(v2!.version).toBe(2);
      expect(readFileSync(v1Path, "utf8")).toBe(v1Bytes);
      expect(await mapping.listVersions(importId)).toEqual([1, 2]);
      const manual = v2!.entries[1]!;
      expect(manual.method).toBe("manual");
      expect(manual.status).toBe("mapped");
      expect(manual.confidence).toBe("high");
      expect(manual.targets[0]!.matchNote).toBe("beam over the ground-floor entrance");
      expect((await mapping.getLatest(importId))!.version).toBe(2);
    });
  });

  test("unknown import -> null; no mapping yet -> typed mapping_not_found", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir);
      expect(
        await mapping.applyManualMapping("ee".repeat(32), {
          entryId: "x",
          targets: [{ nodeId: "n" }],
        }),
      ).toBeNull();
      try {
        await mapping.applyManualMapping(importId, { entryId: "x", targets: [{ nodeId: "n" }] });
        expect.unreachable();
      } catch (error) {
        expect((error as MappingServiceError).code).toBe("mapping_not_found");
      }
    });
  });

  test("unknown entryId -> typed entry_not_found (never a silent no-op)", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir);
      await mapping.runMatcher(importId, wallsSnapshot());
      try {
        await mapping.applyManualMapping(importId, {
          entryId: "missing-entry",
          targets: [{ nodeId: "n" }],
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(MappingError);
        expect((error as MappingError).code).toBe("entry_not_found");
      }
    });
  });
});

describe("versioning + determinism", () => {
  test("re-running the matcher appends v3 with byte-identical entries to v1", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir);
      const v1 = await mapping.runMatcher(importId, wallsSnapshot());
      await mapping.applyManualMapping(importId, {
        entryId: v1!.entries[1]!.entryId,
        targets: [{ nodeId: "beam-9" }],
        note: "manual",
      });
      const v3 = await mapping.runMatcher(importId, wallsSnapshot());
      expect(v3!.version).toBe(3);
      expect(canonicalJsonStringify(v3!.entries)).toBe(canonicalJsonStringify(v1!.entries));
      expect((await mapping.getLatest(importId))!.version).toBe(3);
      expect(await mapping.listVersions(importId)).toEqual([1, 2, 3]);
      // v2 (the manual revision) is still readable and intact.
      const v2 = await mapping.getVersion(importId, 2);
      expect(v2!.entries[1]!.method).toBe("manual");
    });
  });

  test("two fresh pipelines with identical inputs -> byte-identical v1 JSON", async () => {
    await withTempDir(async (first) => {
      await withTempDir(async (second) => {
        const left = await pipeline(first);
        const right = await pipeline(second);
        await left.mapping.runMatcher(left.importId, wallsSnapshot());
        await right.mapping.runMatcher(right.importId, wallsSnapshot());
        expect(await left.store.getText(left.importId, 1)).toBe(
          await right.store.getText(right.importId, 1),
        );
      });
    });
  });

  test("getVersion unknown version -> null; explicit versions readable", async () => {
    await withTempDir(async (dataDir) => {
      const { mapping, importId } = await pipeline(dataDir);
      await mapping.runMatcher(importId, wallsSnapshot());
      expect(await mapping.getVersion(importId, 2)).toBeNull();
      expect((await mapping.getVersion(importId, 1))!.version).toBe(1);
    });
  });
});
