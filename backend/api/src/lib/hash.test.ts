/**
 * Deterministic sha-256 digest-equality proof for lib/hash.ts (PROD-003).
 *
 * The production `sha256Hex` is implemented with node:crypto `createHash`
 * (runtime neutral: Bun AND Node/Vercel). Every content-addressing id in
 * every AISE store is a digest of this function, so the switch away from
 * `Bun.CryptoHasher` MUST NOT change a single digest. These tests prove it
 * two independent ways:
 *
 *   1. FIPS 180-4 reference vectors — runtime-independent ground truth the
 *      historical Bun implementation also produced;
 *   2. a live cross-check against `Bun.CryptoHasher` itself (the historical
 *      implementation, available on this Bun test runtime) over string and
 *      binary inputs spanning the sha-256 block boundaries (55/56/63/64/65
 *      … bytes — where implementation bugs classically appear), full-byte-
 *      range binary, and multi-kilobyte inputs.
 *
 * The wider system proof is the verify suite itself: the existing store and
 * router tests across every domain carry recorded digests and content ids
 * derived from the historical implementation; they stay green only if the
 * digests are byte-identical.
 *
 * Determinism: no clock, no randomness, no network, no filesystem.
 */

import { describe, expect, test } from "bun:test";
import { bytesEqual, sha256Hex } from "./hash";

/** The historical implementation, kept EXACTLY as it was before PROD-003. */
function historicalBunSha256Hex(input: Uint8Array | string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

/** Deterministic pseudo-content bytes (no randomness). */
function patternBytes(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = (index * 31 + seed * 7 + 11) & 0xff;
  }
  return bytes;
}

describe("sha256Hex: FIPS 180-4 reference vectors (runtime-independent truth)", () => {
  test("empty input", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test('"abc"', () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("448-bit multi-block message", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  test('one million repetitions of "a" (compact: 1000), recorded vector', () => {
    // Widely published NIST-style vector for 1000 x "a".
    expect(sha256Hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });

  test("all 256 byte values", () => {
    const all = new Uint8Array(256);
    for (let value = 0; value < 256; value += 1) {
      all[value] = value;
    }
    expect(sha256Hex(all)).toBe(
      "40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880",
    );
  });
});

describe("sha256Hex: digest equality with the historical Bun.CryptoHasher", () => {
  const stringInputs: ReadonlyArray<[string, string]> = [
    ["empty string", ""],
    ["ascii", "AISE-004 content-addressed asset"],
    ["canonical-JSON-like", '{"a":1,"b":["x","y"],"c":"z"}'],
    ["unicode (CJK + emoji + combining)", "É雪 itemBuilder 🏗️ — naïve résümé"],
    ["url-like id", "mission://session-1749?seq=42"],
  ];

  for (const [label, input] of stringInputs) {
    test(`string input: ${label}`, () => {
      expect(sha256Hex(input)).toBe(historicalBunSha256Hex(input));
    });
  }

  test("block-boundary binary inputs (55..129 bytes and full 0..255 range)", () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 128, 129, 255, 256, 257]) {
      const bytes = patternBytes(length, length);
      expect(sha256Hex(bytes)).toBe(historicalBunSha256Hex(bytes));
    }
    const all = new Uint8Array(256);
    for (let value = 0; value < 256; value += 1) {
      all[value] = value;
    }
    expect(sha256Hex(all)).toBe(historicalBunSha256Hex(all));
  });

  test("multi-kilobyte deterministic inputs", () => {
    for (const length of [4096, 65536]) {
      const bytes = patternBytes(length, 3);
      expect(sha256Hex(bytes)).toBe(historicalBunSha256Hex(bytes));
    }
  });

  test("TypedArray views over a shared buffer hash the view's bytes only", () => {
    const backing = patternBytes(300, 5);
    const view = new Uint8Array(backing.buffer, 50, 200);
    expect(sha256Hex(view)).toBe(historicalBunSha256Hex(view));
    // A differently-offset view of the same length must digest differently.
    const other = new Uint8Array(backing.buffer, 51, 200);
    expect(sha256Hex(view)).not.toBe(sha256Hex(other));
  });
});

describe("sha256Hex: content-id discipline", () => {
  test("digest is always 64 lowercase hex characters", () => {
    const samples = ["", "x", JSON.stringify({ k: [1, 2, 3] })];
    for (const sample of samples) {
      expect(sha256Hex(sample)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("identical input → identical digest; different input → different digest", () => {
    expect(sha256Hex("same")).toBe(sha256Hex("same"));
    expect(sha256Hex("same")).not.toBe(sha256Hex("different"));
  });

  test("UTF-8 string and its explicit byte form digest identically", () => {
    const text = "sha-256 over UTF-8 must equal sha-256 over the encoded bytes";
    const encoded = new TextEncoder().encode(text);
    expect(sha256Hex(text)).toBe(sha256Hex(encoded));
  });
});

describe("bytesEqual", () => {
  test("equal buffers", () => {
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  test("different lengths", () => {
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });

  test("same length, differing byte", () => {
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  test("empty buffers", () => {
    expect(bytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});
