/**
 * Store + service tests (AISE-011): content-addressed source preservation
 * (raw bytes unchanged on disk), idempotent re-imports, determinism across
 * fresh stores (byte-identical records), the PDF unsupported-format path,
 * the InMemory twin, and orphaned-but-preserved sources for failed parses.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bytesEqual, sha256Hex } from "../lib/hash";
import { BoqParseError, PDF_UNSUPPORTED_REASON, type BoqImport } from "./model";
import { BoqService } from "./service";
import { FsBoqStore, InMemoryBoqStore, type BoqStore } from "./store";
import { buildXlsx, fixtureBytes, fixedClock, text, withTempDir } from "./testkit";

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_BLOB = text("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

function serviceWith(store: BoqStore): BoqService {
  return new BoqService({ store, clock: fixedClock });
}

function createStore(root: string): FsBoqStore {
  return new FsBoqStore(join(root, "data"));
}

describe("FsBoqStore layout and preservation", () => {
  test("blob, sidecar and record land at the documented paths", async () => {
    await withTempDir(async (root) => {
      const bytes = await fixtureBytes();
      const store = createStore(root);
      const imported = await serviceWith(store).importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      const importId = imported.importId;
      const blob = join(root, "data", "boq", "sources", importId.slice(0, 2), importId);
      // 1. RAW source bytes on disk are unchanged by parsing (immutability).
      expect(existsSync(blob)).toBe(true);
      expect(bytesEqual(new Uint8Array(readFileSync(blob)), bytes)).toBe(true);
      // 2. Sidecar records mediaType/byteSize/importedAt (injected clock).
      const sidecar = JSON.parse(readFileSync(`${blob}.json`, "utf8")) as Record<string, unknown>;
      expect(sidecar).toEqual({
        contentId: importId,
        mediaType: XLSX_MEDIA_TYPE,
        byteSize: bytes.length,
        importedAt: fixedClock(),
      });
      // 3. Record under documents/<sha256(importId)>.json, canonical JSON.
      const recordPath = join(root, "data", "boq", "documents", `${sha256Hex(importId)}.json`);
      expect(existsSync(recordPath)).toBe(true);
      const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
      expect(record.importId).toBe(importId);
      // Timestamp-free document: no importedAt anywhere inside the record.
      expect(JSON.stringify(record)).not.toContain("importedAt");
    });
  });

  test("source directory contains EXACTLY one copy per import", async () => {
    await withTempDir(async (root) => {
      const store = createStore(root);
      const service = serviceWith(store);
      const bytes = await fixtureBytes();
      await service.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      await service.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx"); // idempotent
      const sourcesRoot = join(root, "data", "boq", "sources");
      const files: string[] = [];
      for (const dir of readdirSync(sourcesRoot)) {
        for (const name of readdirSync(join(sourcesRoot, dir))) {
          files.push(name);
        }
      }
      expect(files.length).toBe(2); // the blob + its sidecar, nothing else
    });
  });
});

describe("service semantics", () => {
  test("importId is the content hash; re-import is fully idempotent", async () => {
    await withTempDir(async (root) => {
      const store = createStore(root);
      const service = serviceWith(store);
      const bytes = await fixtureBytes();
      const expectedId = sha256Hex(bytes);
      const first = await service.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      const second = await service.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      expect(first.importId).toBe(expectedId);
      expect(second.importId).toBe(expectedId);
      expect(second.source.importedAt).toBe(first.source.importedAt);
      // Re-parse of identical bytes produces a byte-identical record.
      const recordText = await store.getRecordText(expectedId);
      const text1 = recordText!;
      await service.importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      expect(await store.getRecordText(expectedId)).toBe(text1);
    });
  });

  test("determinism: two FRESH stores produce byte-identical records", async () => {
    const bytes = await fixtureBytes();
    const results: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await withTempDir(async (root) => {
        const store = createStore(root);
        await serviceWith(store).importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
        results.push((await store.getRecordText(sha256Hex(bytes)))!);
      });
    }
    expect(results[0]).toBe(results[1]);
  });

  test("PDF path: stored + registered as unsupported_format, source retrievable", async () => {
    await withTempDir(async (root) => {
      const service = serviceWith(createStore(root));
      const imported = await service.importSource(PDF_BLOB, "application/pdf", "pdf");
      expect(imported.parse.status).toBe("unsupported_format");
      expect(imported.parse.reason).toBe(PDF_UNSUPPORTED_REASON);
      expect(imported.parse.document).toBeUndefined();
      expect(imported.source.byteSize).toBe(PDF_BLOB.length);
      expect(imported.source.mediaType).toBe("application/pdf");
      const source = await service.getSource(imported.importId);
      expect(bytesEqual(source?.bytes ?? new Uint8Array(0), PDF_BLOB)).toBe(true);
      expect(source?.mediaType).toBe("application/pdf");
      // The PDF import is listed like any other import.
      const all = await service.listImports();
      expect(all.map((item) => item.importId)).toEqual([imported.importId]);
    });
  });

  test("broken xlsx: typed parse error, bytes preserved but NOT recorded", async () => {
    await withTempDir(async (root) => {
      const store = createStore(root);
      const service = serviceWith(store);
      const broken = buildXlsx({
        worksheet: "<worksheet><sheetData>", // unclosed elements
      });
      let error: unknown;
      try {
        await service.importSource(broken, XLSX_MEDIA_TYPE, "xlsx");
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BoqParseError);
      // Source preservation is unconditional: blob + sidecar exist...
      const importId = sha256Hex(broken);
      expect(bytesEqual((await store.getSourceBytes(importId)) ?? new Uint8Array(0), broken)).toBe(true);
      expect(await store.getSidecar(importId)).not.toBeNull();
      // ...but no import record exists (honest unknown until a parser can).
      expect(await store.getRecord(importId)).toBeNull();
      expect(await service.getImport(importId)).toBeNull();
      expect((await service.listImports()).length).toBe(0);
    });
  });

  test("getImport / listImports ordering and unknown ids", async () => {
    await withTempDir(async (root) => {
      const service = serviceWith(createStore(root));
      const a = await service.importSource(text("a,b\n1,2"), "text/csv", "csv");
      const b = await service.importSource(PDF_BLOB, "application/pdf", "pdf");
      const listed = await service.listImports();
      const ids = listed.map((item: BoqImport) => item.importId);
      expect(ids.sort()).toEqual([a.importId, b.importId].sort());
      expect(await service.getImport("0".repeat(64))).toBeNull();
      expect(await service.getSource("f".repeat(64))).toBeNull();
    });
  });
});

describe("InMemory twin parity", () => {
  test("same bytes -> byte-identical record text as the Fs store", async () => {
    const bytes = await fixtureBytes();
    const fsTexts: string[] = [];
    await withTempDir(async (root) => {
      const fsStore = createStore(root);
      await serviceWith(fsStore).importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
      fsTexts.push((await fsStore.getRecordText(sha256Hex(bytes)))!);
    });
    const memoryStore = new InMemoryBoqStore();
    await serviceWith(memoryStore).importSource(bytes, XLSX_MEDIA_TYPE, "xlsx");
    const memoryText = await memoryStore.getRecordText(sha256Hex(bytes));
    expect(memoryText).toBe(fsTexts[0]!);
    // Duplicate put is a no-op; source bytes are served unchanged.
    expect(await memoryStore.putSource(sha256Hex(bytes), bytes, {
      contentId: sha256Hex(bytes),
      mediaType: XLSX_MEDIA_TYPE,
      byteSize: bytes.length,
      importedAt: fixedClock(),
    })).toEqual({ kind: "duplicate" });
    expect(bytesEqual((await memoryStore.getSourceBytes(sha256Hex(bytes))) ?? new Uint8Array(0), bytes)).toBe(true);
  });

  test("write-once records refuse divergent content", async () => {
    const store = new InMemoryBoqStore();
    const record = {
      importId: "a".repeat(64),
      source: { contentId: "a".repeat(64), mediaType: "text/csv", byteSize: 1 },
      format: "csv" as const,
      parse: { status: "unsupported_format" as const, reason: "x" },
    };
    await store.putRecord(record);
    await store.putRecord(record); // identical -> no-op
    await expect(
      store.putRecord({ ...record, format: "pdf" }),
    ).rejects.toThrow();
  });
});
