/**
 * Deterministic BOQ test fixtures (AISE-011) — TEST SUPPORT ONLY, never
 * imported by production modules.
 *
 * Provides: the committed binary XLSX fixture, a tiny ZIP WRITER (so tests
 * can build synthetic XLSX packages — including deliberately broken ones —
 * using node:zlib DEFLATE and STORED entries), a fixed clock and temp-dir
 * helper mirroring the capture testkit conventions.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { sha256Hex } from "../lib/hash";

export const FIXED_NOW = "2026-01-15T10:00:00.000Z";
/** Injected clock: constant, so imports and sidecars are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-boq-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The committed binary fixture (see __fixtures__/boq-substructure.xlsx). */
export async function fixtureBytes(): Promise<Uint8Array> {
  return new Uint8Array(
    await Bun.file(join(import.meta.dir, "__fixtures__", "boq-substructure.xlsx")).arrayBuffer(),
  );
}

export async function fixtureSha256(): Promise<string> {
  return sha256Hex(await fixtureBytes());
}

/* ------------------------------------------------------------------ */
/* Test-only ZIP writer                                                */
/* ------------------------------------------------------------------ */

const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface ZipInput {
  readonly name: string;
  readonly data: Uint8Array;
  /** Compression method: 8 = DEFLATE (default), 0 = STORED. */
  readonly method?: 0 | 8;
}

/** Build a classic (non-zip64) ZIP archive from the given entries. */
export function buildZip(inputs: readonly ZipInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  inputs.forEach((input) => {
    const nameBytes = encoder.encode(input.name);
    const method = input.method ?? 8;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(input.data)) : input.data;
    const crc = crc32(input.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, input.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localChunks.push(local, compressed);
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(10, method, true); // compression method
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, input.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    offset += local.length + compressed.length;
  });
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, inputs.length, true); // entries on this disk
  eocdView.setUint16(10, inputs.length, true); // total entries
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  return concat([...localChunks, ...centralChunks, eocd]);
}

/* ------------------------------------------------------------------ */
/* Synthetic XLSX packages                                             */
/* ------------------------------------------------------------------ */

export interface SyntheticXlsxOptions {
  /** Raw worksheet XML (xl/worksheets/sheet1.xml). */
  readonly worksheet: string;
  /** Raw shared strings XML (xl/sharedStrings.xml); omit to skip the part. */
  readonly sharedStrings?: string;
  /** Sheet display name (workbook.xml). */
  readonly sheetName?: string;
}

/**
 * Build a minimal but realistic XLSX package: content types, package rels,
 * workbook, workbook rels, optional shared strings, one worksheet.
 */
export function buildXlsx(options: SyntheticXlsxOptions): Uint8Array {
  const encoder = new TextEncoder();
  const files: ZipInput[] = [
    {
      name: "[Content_Types].xml",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${
          options.sharedStrings === undefined
            ? ""
            : '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        }</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: "xl/workbook.xml",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${
          options.sheetName ?? "Sheet1"
        }" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${
          options.sharedStrings === undefined
            ? ""
            : '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        }</Relationships>`,
      ),
    },
  ];
  if (options.sharedStrings !== undefined) {
    files.push({ name: "xl/sharedStrings.xml", data: encoder.encode(options.sharedStrings) });
  }
  files.push({ name: "xl/worksheets/sheet1.xml", data: encoder.encode(options.worksheet) });
  return buildZip(files);
}

export const text = (value: string): Uint8Array => new TextEncoder().encode(value);
