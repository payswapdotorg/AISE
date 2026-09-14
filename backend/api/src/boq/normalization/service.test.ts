/**
 * Normalization service + store tests (AISE-014) — the policy engine over
 * the Fs/in-memory normalization stores, driven by REAL imports through the
 * read-only BoqService (the committed binary fixture and a PDF source):
 * idempotent byte-identical persistence, source-record immutability,
 * dual-store parity, precise 404 semantics at the service level, the PDF
 * honest refusal, dictionary-version keying and store conflict detection.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { BoqService } from "../service";
import { FsBoqStore, InMemoryBoqStore } from "../store";
import { fixtureBytes, fixedClock, text, withTempDir } from "../testkit";
import { DICTIONARY_VERSION } from "./dictionaries";
import { NormalizationService, NormalizationServiceError } from "./service";
import {
  FsNormalizationStore,
  InMemoryNormalizationStore,
  normalizationViewKey,
} from "./store";

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MEDIA_TYPE = "application/pdf";

describe("NormalizationService over the file-system store", () => {
  test("normalizeImport: derives the view and persists it content-addressed", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const imported = await boq.importSource(await fixtureBytes(), XLSX_MEDIA_TYPE, "xlsx");
      const view = await service.normalizeImport(imported.importId);

      expect(view?.importId).toBe(imported.importId);
      expect(view?.dictionaryVersion).toBe(DICTIONARY_VERSION);
      expect(view?.stats.totalItems).toBe(4);
      expect(view?.stats.rowsWithoutInterpretableCells).toBe(1);
      expect(view?.stats.resolvedConcepts).toBe(3);
      expect(view?.stats.resolvedUnits).toBe(3);

      // The view file lands exactly at the designed content-addressed path.
      const key = normalizationViewKey(imported.importId, DICTIONARY_VERSION);
      expect(key).toBe(sha256Hex(imported.importId + DICTIONARY_VERSION));
      const filePath = join(dataDir, "boq", "normalizations", `${key}.json`);
      const fileText = readFileSync(filePath, "utf8");
      expect(fileText).toBe(canonicalJsonStringify(view));
    });
  });

  test("re-normalization is idempotent: byte-identical file and equal view", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const imported = await boq.importSource(await fixtureBytes(), XLSX_MEDIA_TYPE, "xlsx");
      const first = await service.normalizeImport(imported.importId);
      const key = normalizationViewKey(imported.importId, DICTIONARY_VERSION);
      const filePath = join(dataDir, "boq", "normalizations", `${key}.json`);
      const firstBytes = readFileSync(filePath, "utf8");
      const second = await service.normalizeImport(imported.importId);
      expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
      expect(readFileSync(filePath, "utf8")).toBe(firstBytes);
      // The stored read returns the same view.
      const stored = await service.getNormalization(imported.importId);
      expect(canonicalJsonStringify(stored)).toBe(firstBytes);
    });
  });

  test("source immutability: the BoqImport RECORD bytes are unchanged by normalization", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boqStore = new FsBoqStore(dataDir);
      const boq = new BoqService({ store: boqStore, clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const imported = await boq.importSource(await fixtureBytes(), XLSX_MEDIA_TYPE, "xlsx");
      const before = await boqStore.getRecordText(imported.importId);
      await service.normalizeImport(imported.importId);
      await service.normalizeImport(imported.importId);
      const after = await boqStore.getRecordText(imported.importId);
      expect(after).toBe(before);
      // The raw source bytes stay retrievable and untouched.
      const source = await boq.getSource(imported.importId);
      expect(source !== null && sha256Hex(source.bytes)).toBe(imported.importId);
    });
  });

  test("unknown import -> null (router answers 404); no stored view -> null", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const unknown = "b".repeat(64);
      expect(await service.normalizeImport(unknown)).toBeNull();
      expect(await service.getNormalization(unknown)).toBeNull();
      // Known import that was never normalized.
      const imported = await boq.importSource(await fixtureBytes(), XLSX_MEDIA_TYPE, "xlsx");
      expect(await service.getNormalization(imported.importId)).toBeNull();
    });
  });

  test("PDF import (no parsed document) -> typed honest refusal, never a fake view", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const imported = await boq.importSource(text("%PDF-1.4\n%%EOF"), PDF_MEDIA_TYPE, "pdf");
      expect(imported.parse.status).toBe("unsupported_format");
      let refused: unknown = null;
      try {
        await service.normalizeImport(imported.importId);
      } catch (error) {
        refused = error;
      }
      expect(refused).toBeInstanceOf(NormalizationServiceError);
      const typed = refused as NormalizationServiceError;
      expect(typed.code).toBe("no_parsed_document");
      expect(typed.part).toBe("boq:normalization");
      expect(typed.message).toContain(imported.importId);
    });
  });

  test("determinism across independent stores: two fresh runs -> byte-identical view files", async () => {
    await withTempDir(async (root) => {
      const bytes = await fixtureBytes();
      const texts: string[] = [];
      for (const sub of ["one", "two"]) {
        const dataDir = join(root, sub);
        const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
        const service = new NormalizationService({
          store: new FsNormalizationStore(dataDir),
          clock: fixedClock,
          boq,
        });
        const imported = await boq.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
        const view = await service.normalizeImport(imported.importId);
        texts.push(canonicalJsonStringify(view));
      }
      expect(texts[0]).toBe(texts[1]);
    });
  });

  test("store conflict: a corrupted stored view is refused, not overwritten", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const imported = await boq.importSource(await fixtureBytes(), XLSX_MEDIA_TYPE, "xlsx");
      await service.normalizeImport(imported.importId);
      const key = normalizationViewKey(imported.importId, DICTIONARY_VERSION);
      writeFileSync(join(dataDir, "boq", "normalizations", `${key}.json`), "{\"corrupted\":true}\n");
      let refused: unknown = null;
      try {
        await service.normalizeImport(imported.importId);
      } catch (error) {
        refused = error;
      }
      expect((refused as { part?: string }).part).toBe("boq:normalization");
      expect((refused as Error).message).toContain("already exists with different content");
    });
  });
});

describe("dual-store parity and store contract", () => {
  test("in-memory twin produces byte-identical view text for the same import", async () => {
    await withTempDir(async (root) => {
      const bytes = await fixtureBytes();
      const dataDir = join(root, "data");
      const fsBoq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const fsService = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq: fsBoq,
      });
      const memBoq = new BoqService({ store: new InMemoryBoqStore(), clock: fixedClock });
      const memService = new NormalizationService({
        store: new InMemoryNormalizationStore(),
        clock: fixedClock,
        boq: memBoq,
      });
      const fsImported = await fsBoq.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      const memImported = await memBoq.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      expect(memImported.importId).toBe(fsImported.importId);
      await fsService.normalizeImport(fsImported.importId);
      await memService.normalizeImport(memImported.importId);
      const fsText = await new FsNormalizationStore(dataDir).getText(
        fsImported.importId,
        DICTIONARY_VERSION,
      );
      const memText = await memService.getNormalization(memImported.importId).then((view) =>
        view === null ? null : canonicalJsonStringify(view),
      );
      expect(memText).toBe(fsText);
    });
  });

  test("dictionary-version keying: a different version derives a different, coexisting view", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const service = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const imported = await boq.importSource(await fixtureBytes(), XLSX_MEDIA_TYPE, "xlsx");
      const view = await service.normalizeImport(imported.importId);
      if (view === null) {
        throw new Error("view expected");
      }
      const otherVersion = { ...view, dictionaryVersion: "0.9.0" };
      const store = new FsNormalizationStore(dataDir);
      await store.put(otherVersion);
      // Distinct keys -> both files coexist; old versions are never overwritten.
      expect(normalizationViewKey(imported.importId, "0.9.0")).not.toBe(
        normalizationViewKey(imported.importId, DICTIONARY_VERSION),
      );
      expect(await store.get(imported.importId, "0.9.0")).toEqual(otherVersion);
      expect(await store.get(imported.importId, DICTIONARY_VERSION)).toEqual(view);
    });
  });

  test("malformed import ids are rejected by both store implementations", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsNormalizationStore(join(root, "data"));
      const memStore = new InMemoryNormalizationStore();
      const view = {
        importId: "not-a-valid-id",
        dictionaryVersion: DICTIONARY_VERSION,
        generatedBy: "aise-boq-normalizer/1.0",
        columnRoles: [],
        interpretations: [],
        perItem: [],
        stats: {
          totalItems: 0,
          rowsWithoutInterpretableCells: 0,
          resolvedConcepts: 0,
          unresolvedConcepts: 0,
          ambiguousDescriptions: 0,
          resolvedUnits: 0,
          unresolvedUnits: 0,
        },
      };
      for (const store of [fsStore, memStore]) {
        await expect(store.put(view)).rejects.toThrow("import id must be 64 lowercase hex");
        await expect(store.get("nope", "1.0.0")).rejects.toThrow("import id must be 64 lowercase hex");
      }
    });
  });
});
