/**
 * Zero-dependency ZIP reader for XLSX parsing (AISE-011).
 *
 * Supported subset (documented deliberately — anything outside it is a
 * typed `BoqParseError`, never a silent mis-parse):
 *  - classic ZIP archives with an End Of Central Directory record and a
 *    central directory (the layout every real .xlsx writer emits);
 *  - entry compression method 0 (stored) and 8 (DEFLATE, inflated with
 *    node:zlib `inflateRawSync` — a Node builtin, not an npm dependency);
 *  - data descriptors (general-purpose flag bit 3): the CENTRAL DIRECTORY
 *    sizes are authoritative, so no second pass over the local header is
 *    needed;
 *  - entry names decoded as UTF-8.
 *
 * Explicitly NOT supported (typed errors, part "zip:…"):
 *  - zip64 archives (0xFFFFFFFF markers in EOCD or central directory);
 *  - encrypted entries (general-purpose flag bit 0);
 *  - compression methods other than 0 and 8.
 *
 * Every entry is CRC-32 verified against the central directory so
 * truncation and corruption are caught with the entry named.
 */

import { inflateRawSync } from "node:zlib";
import { BoqParseError } from "./model";

export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly crc32: number;
  readonly uncompressedSize: number;
  /** Inflated entry bytes. */
  readonly data: Uint8Array;
}

/* --- little-endian readers (DataView over the whole archive) --------- */

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/* --- CRC-32 (IEEE 802.3 polynomial, standard table) -------------------- */

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

/* --- End Of Central Directory ---------------------------------------- */

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_LENGTH = 22;
/** Maximum EOCD search window: 22-byte record + 0xFFFF-byte comment. */
const EOCD_MAX_COMMENT = 0xffff;

/** Locate the EOCD record; nearest-to-end wins. Throws when absent. */
function findEocdOffset(view: DataView): number {
  const limit = Math.max(0, view.byteLength - EOCD_MIN_LENGTH - EOCD_MAX_COMMENT);
  for (let offset = view.byteLength - EOCD_MIN_LENGTH; offset >= limit; offset -= 1) {
    if (u16(view, offset) !== (EOCD_SIGNATURE & 0xffff)) {
      continue;
    }
    if (u16(view, offset + 2) !== (EOCD_SIGNATURE >>> 16)) {
      continue;
    }
    const commentLength = u16(view, offset + 20);
    if (offset + EOCD_MIN_LENGTH + commentLength <= view.byteLength) {
      return offset;
    }
  }
  throw new BoqParseError(
    "zip:end-of-central-directory",
    "record not found — archive is truncated, empty or not a ZIP file",
  );
}

/* --- Archive iteration ------------------------------------------------ */

/**
 * Read the archive and return its entries keyed by name (directories are
 * skipped; a duplicated name keeps the LAST occurrence, deterministic).
 */
export function readZipArchive(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocdOffset(view);
  const entryCount = u16(view, eocd + 10);
  const centralDirectorySize = u32(view, eocd + 12);
  const centralDirectoryOffset = u32(view, eocd + 16);
  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new BoqParseError("zip:end-of-central-directory", "zip64 archives are not supported");
  }
  if (centralDirectoryOffset + centralDirectorySize > view.byteLength) {
    throw new BoqParseError(
      "zip:central-directory",
      "central directory extends past end of archive — truncated archive",
    );
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (u32(view, cursor) !== 0x02014b50) {
      throw new BoqParseError(
        "zip:central-directory",
        `bad entry signature at index ${index} — corrupt central directory`,
      );
    }
    const flags = u16(view, cursor + 8);
    const method = u16(view, cursor + 10);
    const crc = u32(view, cursor + 16);
    const compressedSize = u32(view, cursor + 20);
    const uncompressedSize = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localHeaderOffset = u32(view, cursor + 42);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if ((flags & 0x0001) !== 0) {
      throw new BoqParseError("zip:central-directory", `encrypted entry '${name}' is not supported`);
    }
    if (method !== 0 && method !== 8) {
      throw new BoqParseError(
        "zip:central-directory",
        `unsupported compression method ${method} for entry '${name}'`,
      );
    }
    if (name.endsWith("/")) {
      continue; // directory record — no data
    }
    entries.set(name, readEntry(bytes, view, name, method, crc, compressedSize, uncompressedSize, localHeaderOffset));
  }
  return entries;
}

/** Inflate one entry via its local file header; verify size and CRC. */
function readEntry(
  bytes: Uint8Array,
  view: DataView,
  name: string,
  method: number,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
  localHeaderOffset: number,
): ZipEntry {
  const part = "zip:local-header";
  if (u32(view, localHeaderOffset) !== 0x04034b50) {
    throw new BoqParseError(part, `bad local header signature for entry '${name}'`);
  }
  const nameLength = u16(view, localHeaderOffset + 26);
  const extraLength = u16(view, localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > bytes.length) {
    throw new BoqParseError(
      "zip:local-header",
      `compressed data of entry '${name}' extends past end of archive — truncated archive`,
    );
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  let data: Uint8Array;
  if (method === 0) {
    data = compressed;
  } else {
    try {
      data = new Uint8Array(inflateRawSync(compressed));
    } catch (error) {
      throw new BoqParseError(
        "zip:inflate",
        `DEFLATE stream of entry '${name}' is corrupt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (data.length !== uncompressedSize) {
    throw new BoqParseError(
      "zip:inflate",
      `uncompressed size mismatch for entry '${name}': expected ${uncompressedSize}, got ${data.length}`,
    );
  }
  if (crc32(data) !== crc) {
    throw new BoqParseError("zip:crc", `CRC-32 mismatch for entry '${name}' — corrupt entry`);
  }
  return { name, method, crc32: crc, uncompressedSize, data };
}
