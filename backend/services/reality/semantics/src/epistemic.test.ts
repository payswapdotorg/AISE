/**
 * Epistemic semantics tests (AISE-010).
 *
 * The architect rule, executable: recognition is inference —
 * extraction output may never outrank INFERRED; composite states
 * are the weakest input; upgrades fail closed; PROPOSED propagates.
 */
import { describe, expect, it } from "vitest";
import {
  EPISTEMIC_STATES,
  EXTRACTION_EPISTEMIC_STATE,
  assertExtractionMaxRank,
  assertNoEpistemicUpgrade,
  assertValidEpistemicState,
  deriveCompositeState,
  deriveExtractionState,
  epistemicRank,
} from "./epistemic.js";
import { toSemanticsError } from "./errors.js";

describe("epistemicRank", () => {
  it("orders the strength lattice OBSERVED > CONFIRMED > INFERRED > PROPOSED", () => {
    expect(epistemicRank("OBSERVED")).toBeGreaterThan(epistemicRank("CONFIRMED"));
    expect(epistemicRank("CONFIRMED")).toBeGreaterThan(epistemicRank("INFERRED"));
    expect(epistemicRank("INFERRED")).toBeGreaterThan(epistemicRank("PROPOSED"));
  });
});

describe("assertValidEpistemicState", () => {
  it("accepts exactly the four architecture states", () => {
    expect(EPISTEMIC_STATES).toEqual(["OBSERVED", "INFERRED", "CONFIRMED", "PROPOSED"]);
    for (const state of EPISTEMIC_STATES) {
      expect(assertValidEpistemicState(state)).toBe(state);
    }
  });

  it("rejects anything else with VALIDATION_FAILED", () => {
    for (const bad of ["GUESSED", "observed", "", null, 1, undefined]) {
      const error = capture(() => assertValidEpistemicState(bad));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("assertExtractionMaxRank", () => {
  it("EXTRACTION_EPISTEMIC_STATE is INFERRED (pinned constant)", () => {
    expect(EXTRACTION_EPISTEMIC_STATE).toBe("INFERRED");
  });

  it("accepts INFERRED (recognition output)", () => {
    expect(() => assertExtractionMaxRank("INFERRED", "wall")).not.toThrow();
  });

  it("accepts PROPOSED (weaker content propagates, never upgrades)", () => {
    expect(() => assertExtractionMaxRank("PROPOSED", "wall")).not.toThrow();
  });

  it("rejects OBSERVED — capture/measurement can never be produced by recognition", () => {
    const error = capture(() => assertExtractionMaxRank("OBSERVED", "wall"));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
    expect(error?.details.claimed).toBe("OBSERVED");
  });

  it("rejects CONFIRMED — authorized validation is a review act, not a recognition act", () => {
    const error = capture(() => assertExtractionMaxRank("CONFIRMED", "door"));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
    expect(error?.details.claimed).toBe("CONFIRMED");
  });
});

describe("deriveExtractionState", () => {
  it("OBSERVED survey points still yield INFERRED objects (floor-ness is interpretation)", () => {
    expect(deriveExtractionState(["OBSERVED"])).toBe("INFERRED");
  });

  it("PROPOSED design points yield PROPOSED objects (no upgrade to INFERRED)", () => {
    expect(deriveExtractionState(["PROPOSED"])).toBe("PROPOSED");
  });

  it("INFERRED sources yield INFERRED", () => {
    expect(deriveExtractionState(["INFERRED", "INFERRED"])).toBe("INFERRED");
  });

  it("mixed sources take the weakest", () => {
    expect(deriveExtractionState(["OBSERVED", "PROPOSED"])).toBe("PROPOSED");
    expect(deriveExtractionState(["CONFIRMED", "OBSERVED", "INFERRED"])).toBe("INFERRED");
  });
});

describe("deriveCompositeState", () => {
  it("the scene is only as strong as its weakest input", () => {
    expect(deriveCompositeState(["OBSERVED", "CONFIRMED", "PROPOSED"])).toBe("PROPOSED");
    expect(deriveCompositeState(["INFERRED"])).toBe("INFERRED");
    expect(deriveCompositeState(["OBSERVED", "INFERRED"])).toBe("INFERRED");
  });

  it("rejects zero inputs (no state can be derived from nothing)", () => {
    const error = capture(() => deriveCompositeState([]));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("validates every input state", () => {
    const error = capture(() => deriveCompositeState(["INFERRED", "BAD" as never]));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });
});

describe("assertNoEpistemicUpgrade", () => {
  it("accepts a claimed state at or below every input", () => {
    expect(() => assertNoEpistemicUpgrade("INFERRED", ["INFERRED", "OBSERVED"])).not.toThrow();
    expect(() => assertNoEpistemicUpgrade("PROPOSED", ["INFERRED"])).not.toThrow();
  });

  it("rejects a claimed state that outranks any input", () => {
    const error = capture(() => assertNoEpistemicUpgrade("OBSERVED", ["INFERRED", "CONFIRMED"]));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
    expect(error?.details.claimed).toBe("OBSERVED");
    expect(error?.details.input).toBe("INFERRED");
  });

  it("rejects INFERRED claim over PROPOSED input (weaker propagates)", () => {
    const error = capture(() => assertNoEpistemicUpgrade("INFERRED", ["PROPOSED"]));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
  });
});

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    fn();
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, "expected a SemanticsError").not.toBeNull();
    return semantics;
  }
  throw new Error("expected the call to throw");
}
