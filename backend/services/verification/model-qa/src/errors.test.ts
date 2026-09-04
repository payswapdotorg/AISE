import { describe, expect, it } from "vitest";
import { EngineeringModelError, EvidenceError } from "@aise/engineering-model";
import { isModelQaError, ModelQaError, toModelQaError } from "./errors.js";

describe("ModelQaError", () => {
  it("carries a stable machine code, message and structured details", () => {
    const error = new ModelQaError("GRAPH_INVALID", "the graph failed boundary validation", {
      details: { field: "digest", value: "0".repeat(64) },
    });
    expect(error.code).toBe("GRAPH_INVALID");
    expect(error.name).toBe("ModelQaError");
    expect(error.details.fields?.field).toBe("digest");
    expect(error.message).toContain("boundary validation");
  });

  it("preserves wrapped pure-layer causes and their codes", () => {
    const cause = new EngineeringModelError("MODEL_INVALID", "inner failure");
    const error = new ModelQaError("GRAPH_INVALID", "wrapped", { cause });
    expect(error.cause).toBe(cause);
    expect(error.causeCode).toBe("MODEL_INVALID");
  });

  it("preserves evidence-layer cause codes", () => {
    const cause = new EvidenceError("SUBJECT_INVALID", "inner evidence failure");
    const error = new ModelQaError("MAPPING_INVALID", "wrapped", { cause });
    expect(error.causeCode).toBe("SUBJECT_INVALID");
  });

  it("falls back to the INTERNAL_ERROR class for unknown errors", () => {
    const error = toModelQaError(new Error("boom"));
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.causeCode).toBeUndefined();
  });

  it("keeps ModelQaError identity through toModelQaError", () => {
    const original = new ModelQaError("BOUNDS_EXCEEDED", "too big");
    expect(toModelQaError(original)).toBe(original);
  });

  it("narrows unknown errors with isModelQaError", () => {
    expect(isModelQaError(new ModelQaError("QA_INPUT_INVALID", "x"))).toBe(true);
    expect(isModelQaError(new Error("x"))).toBe(false);
    expect(isModelQaError("not an error")).toBe(false);
  });

  it("stringifies non-Error causes honestly", () => {
    const error = toModelQaError("a string failure");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toContain("a string failure");
  });

  it("every documented code is constructible and non-retryable by construction", () => {
    const codes = [
      "QA_INPUT_INVALID",
      "MODEL_NOT_FOUND",
      "GRAPH_INVALID",
      "MAPPING_INVALID",
      "CONTEXT_INVALID",
      "PROJECT_MISMATCH",
      "BOUNDS_EXCEEDED",
      "INTERNAL_ERROR",
    ] as const;
    for (const code of codes) {
      const error = new ModelQaError(code, "message");
      expect(error.details.code).toBe(code);
    }
  });

  it("cause codes of unknown coded errors are surfaced", () => {
    const cause = Object.assign(new Error("coded"), { code: "SOMETHING_ELSE" });
    const error = new ModelQaError("GRAPH_INVALID", "wrapped", { cause });
    expect(error.causeCode).toBe("SOMETHING_ELSE");
  });
});
