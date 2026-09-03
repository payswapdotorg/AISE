/**
 * Canonical serialization and content hashing tests.
 */
import { describe, expect, it } from "vitest";
import { canonicalContentHash, canonicalJsonString } from "./canonical.js";

describe("canonicalJsonString", () => {
  it("sorts object keys", () => {
    expect(canonicalJsonString({ b: 1, a: 2 })).toBe(
      canonicalJsonString({ a: 2, b: 1 }),
    );
    expect(canonicalJsonString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("preserves array order (order is content)", () => {
    expect(canonicalJsonString([1, 2, 3])).not.toBe(canonicalJsonString([3, 2, 1]));
    expect(canonicalJsonString([1, 2, 3])).toBe("[1,2,3]");
  });

  it("treats undefined-valued members as absent", () => {
    expect(canonicalJsonString({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJsonString({ b: 1 })).toBe('{"b":1}');
  });

  it("serializes null, booleans, and strings", () => {
    expect(canonicalJsonString(null)).toBe("null");
    expect(canonicalJsonString(true)).toBe("true");
    expect(canonicalJsonString("x\"y")).toBe('"x\\"y"');
  });

  it("normalizes negative zero", () => {
    expect(canonicalJsonString(-0)).toBe("0");
    expect(canonicalJsonString(0)).toBe("0");
  });

  it("rejects non-finite numbers loudly", () => {
    expect(() => canonicalJsonString(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJsonString(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => canonicalJsonString({ a: Number.NaN })).toThrow(/non-finite/);
  });

  it("rejects unsupported types", () => {
    expect(() => canonicalJsonString(() => 1)).toThrow(/cannot canonically serialize/);
    expect(() => canonicalJsonString(Symbol("x"))).toThrow(/cannot canonically serialize/);
  });

  it("is recursive and deterministic on nested content", () => {
    const value = { z: [{ b: 2, a: 1 }, "s", 3], a: { y: null, x: false } };
    expect(canonicalJsonString(value)).toBe(
      '{"a":{"x":false,"y":null},"z":[{"a":1,"b":2},"s",3]}',
    );
  });
});

describe("canonicalContentHash", () => {
  it("produces lowercase 64-hex digests", () => {
    const digest = canonicalContentHash({ a: 1 });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is order-invariant over object keys and order-sensitive over arrays", () => {
    expect(canonicalContentHash({ a: 1, b: [1, 2] })).toBe(
      canonicalContentHash({ b: [1, 2], a: 1 }),
    );
    expect(canonicalContentHash({ a: [1, 2] })).not.toBe(canonicalContentHash({ a: [2, 1] }));
  });

  it("distinguishes different content", () => {
    expect(canonicalContentHash({ a: 1 })).not.toBe(canonicalContentHash({ a: 2 }));
  });
});
