/**
 * Deterministic identity and immutability tests.
 */
import { describe, expect, it } from "vitest";
import { deepFreeze, deriveObjectId, deriveRelationId } from "./identity.js";

describe("deriveObjectId", () => {
  it("produces ro-prefixed 16-hex identities", () => {
    const id = deriveObjectId({
      modelId: "model-1",
      objectClass: "WALL",
      sourceServiceId: "aise.semantics",
      sourceMethod: "structure/wall-rectangle-v1",
      sourceObjectId: "wall-0123456789abcdef",
      sourceContentHash: "a".repeat(64),
    });
    expect(id).toMatch(/^ro-[0-9a-f]{16}$/);
  });

  it("is deterministic for the same source pin", () => {
    const input = {
      modelId: "model-1",
      objectClass: "WALL",
      sourceServiceId: "aise.semantics",
      sourceMethod: "structure/wall-rectangle-v1",
      sourceObjectId: "wall-0123456789abcdef",
      sourceContentHash: "a".repeat(64),
    };
    expect(deriveObjectId(input)).toBe(deriveObjectId(input));
  });

  it("differs across models (identity is model-scoped)", () => {
    const base = {
      objectClass: "WALL" as const,
      sourceServiceId: "aise.semantics",
      sourceMethod: "structure/wall-rectangle-v1",
      sourceObjectId: "wall-0123456789abcdef",
      sourceContentHash: "a".repeat(64),
    };
    expect(deriveObjectId({ ...base, modelId: "model-1" })).not.toBe(
      deriveObjectId({ ...base, modelId: "model-2" }),
    );
  });

  it("differs across classes and source pins", () => {
    const base = {
      modelId: "model-1",
      sourceServiceId: "aise.semantics",
      sourceMethod: "structure/wall-rectangle-v1",
      sourceObjectId: "wall-0123456789abcdef",
      sourceContentHash: "a".repeat(64),
    };
    expect(deriveObjectId({ ...base, objectClass: "WALL" })).not.toBe(
      deriveObjectId({ ...base, objectClass: "FLOOR" }),
    );
    expect(
      deriveObjectId({ ...base, objectClass: "WALL", sourceContentHash: "b".repeat(64) }),
    ).not.toBe(deriveObjectId({ ...base, objectClass: "WALL", sourceContentHash: "c".repeat(64) }));
  });

  it("is stable under mutable-content changes (identity is lineage)", () => {
    // The identity input has no property/content fields — later
    // corrections cannot change identity.
    const id = deriveObjectId({
      modelId: "model-1",
      objectClass: "WALL",
      sourceServiceId: "aise.semantics",
      sourceMethod: "structure/wall-rectangle-v1",
      sourceObjectId: "wall-0123456789abcdef",
      sourceContentHash: "a".repeat(64),
    });
    expect(id).toBe(
      deriveObjectId({
        modelId: "model-1",
        objectClass: "WALL",
        sourceServiceId: "aise.semantics",
        sourceMethod: "structure/wall-rectangle-v1",
        sourceObjectId: "wall-0123456789abcdef",
        sourceContentHash: "a".repeat(64),
      }),
    );
  });
});

describe("deriveRelationId", () => {
  it("produces rel-prefixed identities from the triple", () => {
    expect(deriveRelationId("CONTAINS", "space-1", "ro-1")).toMatch(/^rel-[0-9a-f]{16}$/);
    expect(deriveRelationId("CONTAINS", "space-1", "ro-1")).toBe(
      deriveRelationId("CONTAINS", "space-1", "ro-1"),
    );
    expect(deriveRelationId("CONTAINS", "space-1", "ro-1")).not.toBe(
      deriveRelationId("CONTAINS", "space-1", "ro-2"),
    );
    expect(deriveRelationId("CONTAINS", "space-1", "ro-1")).not.toBe(
      deriveRelationId("OPENING_IN", "space-1", "ro-1"),
    );
  });
});

describe("deepFreeze", () => {
  it("freezes nested structures so mutation throws (strict mode)", () => {
    const frozen = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
    expect(Object.isFrozen(frozen.a.b[1])).toBe(true);
    expect(() => {
      (frozen.a as { b: number[] }).b = [2];
    }).toThrow(TypeError);
    expect(() => {
      (frozen.a.b as number[]).push(3);
    }).toThrow(TypeError);
  });

  it("passes primitives through and is idempotent", () => {
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze("x")).toBe("x");
    expect(deepFreeze(null)).toBeNull();
    const once = deepFreeze({ a: 1 });
    expect(deepFreeze(once)).toBe(once);
  });
});
