/**
 * Deterministic IFC GUID tests (AISE-018).
 *
 * Acceptance core (AC-102): stable identifiers — the same seed
 * derives the same 22-character IfcGloballyUniqueId every time
 * (deterministic derivation, no random generation), distinct
 * seeds derive distinct GUIDs, and the compression-scheme
 * discipline (2-bit head) holds.
 */
import { describe, expect, it } from "vitest";
import { ifcGuidOf, isWellFormedIfcGuid, isValidIfcGuid, IFC_GUID_LENGTH, GUID_ALPHABET } from "./guid.js";

describe("ifcGuidOf", () => {
  it("derives 22-character GUIDs over the IFC alphabet", () => {
    const guid = ifcGuidOf("model-golden:object:ro-1");
    expect(guid).toHaveLength(IFC_GUID_LENGTH);
    for (const character of guid) {
      expect(GUID_ALPHABET.includes(character)).toBe(true);
    }
  });

  it("encodes the 2-bit head: the first character's alphabet index is < 4", () => {
    for (const seed of ["a", "b", "c", "model-golden:object:ro-1", "seed-with-$pecial:chars", "x".repeat(100)]) {
      const guid = ifcGuidOf(seed);
      expect(GUID_ALPHABET.indexOf(guid[0]!)).toBeLessThan(4);
    }
  });

  it("is deterministic: the same seed derives the identical GUID", () => {
    expect(ifcGuidOf("model-golden:object:ro-1")).toBe(ifcGuidOf("model-golden:object:ro-1"));
  });

  it("discriminates: distinct seeds derive distinct GUIDs", () => {
    const guids = [
      ifcGuidOf("model-golden:object:ro-1"),
      ifcGuidOf("model-golden:object:ro-2"),
      ifcGuidOf("model-golden:space:room-golden"),
      ifcGuidOf("model-golden:opening:ro-1"),
      ifcGuidOf("model-golden:spine:site"),
    ];
    expect(new Set(guids).size).toBe(guids.length);
  });

  it("the same identity in different models derives different GUIDs (model-scoped seeds)", () => {
    expect(ifcGuidOf("model-a:object:ro-1")).not.toBe(ifcGuidOf("model-b:object:ro-1"));
  });

  it("fails closed on empty or non-string seeds", () => {
    expect(() => ifcGuidOf("")).toThrow();
    expect(() => ifcGuidOf(undefined as unknown as string)).toThrow();
  });
});

describe("GUID validation", () => {
  it("accepts well-formed 22-character GUIDs", () => {
    expect(isValidIfcGuid(ifcGuidOf("seed"))).toBe(true);
    expect(isWellFormedIfcGuid(ifcGuidOf("seed"))).toBe(true);
  });

  it("rejects wrong length, bad alphabet, and bad head characters", () => {
    expect(isValidIfcGuid("0YvctVUKr0kugbFTf53O9L")).toBe(true); // 22 chars, valid alphabet
    expect(isValidIfcGuid("0YvctVUKr0kugbFTf53O9")).toBe(false); // 21 chars
    expect(isValidIfcGuid("0YvctVUKr0kugbFTf53O9Lx")).toBe(false); // 23 chars
    expect(isValidIfcGuid("0YvctVUKr0kugbFTf53O9!")).toBe(false); // bad alphabet character
    // The head character must have alphabet index < 4 (chars 0-3).
    expect(isWellFormedIfcGuid("4YvctVUKr0kugbFTf53O9L")).toBe(false);
    expect(isWellFormedIfcGuid("0YvctVUKr0kugbFTf53O9L")).toBe(true);
  });
});
