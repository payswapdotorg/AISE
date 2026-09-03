/**
 * Epistemic-state machinery tests: the four states, the no-upgrade
 * guard, weakest-link derivation, and the presence vocabulary.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import {
  EPISTEMIC_STATES,
  MODEL_PRESENCE_STATES,
  assertNoEpistemicUpgrade,
  assertValidEpistemicState,
  assertValidPresence,
  deriveWeakestState,
  epistemicRank,
} from "./epistemic.js";

describe("epistemicRank", () => {
  it("orders PROPOSED weakest, then INFERRED, OBSERVED, CONFIRMED strongest", () => {
    expect(epistemicRank("PROPOSED")).toBeLessThan(epistemicRank("INFERRED"));
    expect(epistemicRank("INFERRED")).toBeLessThan(epistemicRank("OBSERVED"));
    expect(epistemicRank("OBSERVED")).toBeLessThan(epistemicRank("CONFIRMED"));
  });

  it("covers exactly the four architecture states", () => {
    expect([...EPISTEMIC_STATES].sort()).toEqual(
      ["CONFIRMED", "INFERRED", "OBSERVED", "PROPOSED"].sort(),
    );
  });
});

describe("assertValidEpistemicState", () => {
  it("accepts the four states", () => {
    for (const state of EPISTEMIC_STATES) {
      expect(() => assertValidEpistemicState(state, "test")).not.toThrow();
    }
  });

  it("rejects anything else (runtime guard beyond the type system)", () => {
    expect(() => assertValidEpistemicState("GUESSED" as never, "test")).toThrow(EngineeringModelError);
    expect(() => assertValidEpistemicState("observed" as never, "test")).toThrow(EngineeringModelError);
  });
});

describe("assertNoEpistemicUpgrade (the architect rule)", () => {
  it("accepts equal states", () => {
    expect(() => assertNoEpistemicUpgrade("INFERRED", "INFERRED", "ctx")).not.toThrow();
    expect(() => assertNoEpistemicUpgrade("CONFIRMED", "CONFIRMED", "ctx")).not.toThrow();
  });

  it("accepts downgrades (weakening is always allowed)", () => {
    expect(() => assertNoEpistemicUpgrade("OBSERVED", "INFERRED", "ctx")).not.toThrow();
    expect(() => assertNoEpistemicUpgrade("CONFIRMED", "PROPOSED", "ctx")).not.toThrow();
  });

  it("rejects every upgrade direction", () => {
    expect(() => assertNoEpistemicUpgrade("INFERRED", "OBSERVED", "ctx")).toThrow(EngineeringModelError);
    expect(() => assertNoEpistemicUpgrade("INFERRED", "CONFIRMED", "ctx")).toThrow(EngineeringModelError);
    expect(() => assertNoEpistemicUpgrade("PROPOSED", "INFERRED", "ctx")).toThrow(EngineeringModelError);
    expect(() => assertNoEpistemicUpgrade("OBSERVED", "CONFIRMED", "ctx")).toThrow(EngineeringModelError);
  });

  it("reports EPISTEMIC_UPGRADE with context", () => {
    try {
      assertNoEpistemicUpgrade("INFERRED", "CONFIRMED", "ingest wall-1");
      expect.unreachable("must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EngineeringModelError);
      expect((error as EngineeringModelError).code).toBe("EPISTEMIC_UPGRADE");
      expect((error as EngineeringModelError).message).toContain("ingest wall-1");
    }
  });
});

describe("deriveWeakestState", () => {
  it("returns PROPOSED for an empty composite (no reality claim)", () => {
    expect(deriveWeakestState([])).toBe("PROPOSED");
  });

  it("returns the weakest member", () => {
    expect(deriveWeakestState(["OBSERVED", "INFERRED", "CONFIRMED"])).toBe("INFERRED");
    expect(deriveWeakestState(["OBSERVED", "CONFIRMED"])).toBe("OBSERVED");
    expect(deriveWeakestState(["PROPOSED", "OBSERVED"])).toBe("PROPOSED");
  });

  it("preserves PROPOSED propagation through composites", () => {
    expect(deriveWeakestState(["INFERRED", "PROPOSED", "CONFIRMED"])).toBe("PROPOSED");
  });

  it("validates every member (fail closed)", () => {
    expect(() => deriveWeakestState(["INFERRED", "BAD" as never])).toThrow(EngineeringModelError);
  });
});

describe("presence vocabulary", () => {
  it("covers the architecture's presence states plus CONFIRMED_ABSENT", () => {
    expect([...MODEL_PRESENCE_STATES].sort()).toEqual(
      ["CONFIRMED_ABSENT", "NOT_OBSERVED", "OCCLUDED", "UNKNOWN"].sort(),
    );
  });

  it("validates presence states (runtime guard)", () => {
    for (const presence of MODEL_PRESENCE_STATES) {
      expect(() => assertValidPresence(presence, "test")).not.toThrow();
    }
    expect(() => assertValidPresence("ABSENT" as never, "test")).toThrow(EngineeringModelError);
  });
});
