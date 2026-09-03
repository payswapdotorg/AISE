/**
 * Reality-model service error tests: wrapping, cause chains, code
 * mapping.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "@aise/engineering-model";
import { RealityModelError, toRealityModelError } from "./errors.js";

describe("RealityModelError", () => {
  it("carries code, details, and an optional wrapped cause", () => {
    const cause = new EngineeringModelError("REFERENTIAL_INTEGRITY", "dangling");
    const error = new RealityModelError("MODEL_INVALID", "graph failed", { cause });
    expect(error.code).toBe("MODEL_INVALID");
    expect(error.message).toBe("graph failed");
    expect(error.cause).toBe(cause);
    expect(error.errorCauses()).toEqual([
      { source: "engineering-model", code: "REFERENTIAL_INTEGRITY", message: "dangling" },
    ]);
  });

  it("has an empty cause chain without a cause", () => {
    const error = new RealityModelError("MODEL_NOT_FOUND", "missing");
    expect(error.cause).toBeUndefined();
    expect(error.errorCauses()).toEqual([]);
  });
});

describe("toRealityModelError", () => {
  it("passes RealityModelError through", () => {
    const error = new RealityModelError("MODEL_INVALID", "x");
    expect(toRealityModelError(error)).toBe(error);
  });

  it("wraps EngineeringModelError with pass-through codes", () => {
    for (const code of [
      "MODEL_INVALID",
      "MODEL_MISMATCH",
      "IDENTITY_COLLISION",
      "REFERENTIAL_INTEGRITY",
      "EPISTEMIC_UPGRADE",
      "PROVENANCE_INCOMPLETE",
    ] as const) {
      const wrapped = toRealityModelError(new EngineeringModelError(code, "m"));
      expect(wrapped.code).toBe(code);
      expect(wrapped.cause).toBeInstanceOf(EngineeringModelError);
    }
  });

  it("maps model-only codes to MODEL_INVALID with the cause preserved", () => {
    const wrapped = toRealityModelError(new EngineeringModelError("EPISTEMIC_INVALID", "m"));
    expect(wrapped.code).toBe("MODEL_INVALID");
    expect(wrapped.cause?.code).toBe("EPISTEMIC_INVALID");
  });

  it("wraps unknown throwables as INTERNAL_ERROR", () => {
    expect(toRealityModelError(new Error("boom")).code).toBe("INTERNAL_ERROR");
    expect(toRealityModelError("plain string").code).toBe("INTERNAL_ERROR");
  });
});
