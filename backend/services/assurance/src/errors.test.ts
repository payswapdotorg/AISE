import { describe, expect, it } from "vitest";
import { EngineeringModelError, EvidenceError } from "@aise/engineering-model";
import { AssuranceError, isAssuranceError, toAssuranceError } from "./errors.js";

describe("AssuranceError", () => {
  it("carries a stable code, message, and details", () => {
    const error = new AssuranceError("PROFILE_INVALID", "taskId is bad", {
      details: { field: "taskId", value: "!!" },
    });
    expect(error.code).toBe("PROFILE_INVALID");
    expect(error.message).toBe("taskId is bad");
    expect(error.details).toEqual({ code: "PROFILE_INVALID", fields: { field: "taskId", value: "!!" } });
    expect(error.name).toBe("AssuranceError");
    expect(error.causeCode).toBeUndefined();
  });

  it("preserves wrapped EngineeringModelError causes with their code", () => {
    const cause = new EngineeringModelError("MODEL_INVALID", "graph rejected");
    const error = new AssuranceError("GRAPH_INVALID", "boundary rejected the graph", {
      details: { causeCode: cause.code },
      cause,
    });
    expect(error.cause).toBe(cause);
    expect(error.causeCode).toBe("MODEL_INVALID");
  });

  it("is narrowed by isAssuranceError", () => {
    expect(isAssuranceError(new AssuranceError("INTERNAL_ERROR", "x"))).toBe(true);
    expect(isAssuranceError(new Error("x"))).toBe(false);
    expect(isAssuranceError(undefined)).toBe(false);
  });

  it("passes itself through toAssuranceError unchanged", () => {
    const original = new AssuranceError("TASK_NOT_FOUND", "missing");
    expect(toAssuranceError(original, "ctx")).toBe(original);
  });

  it("wraps EngineeringModelError as GRAPH_INVALID with causeCode", () => {
    const cause = new EngineeringModelError("MODEL_INVALID", "tampered");
    const wrapped = toAssuranceError(cause, "assessment of m v1");
    expect(wrapped.code).toBe("GRAPH_INVALID");
    expect(wrapped.causeCode).toBe("MODEL_INVALID");
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.message).toContain("assessment of m v1");
  });

  it("wraps EvidenceError as MAPPING_INVALID with causeCode", () => {
    const cause = new EvidenceError("MAPPING_INVALID", "bad mapping");
    const wrapped = toAssuranceError(cause, "ctx");
    expect(wrapped.code).toBe("MAPPING_INVALID");
    expect(wrapped.causeCode).toBe("MAPPING_INVALID");
    expect(wrapped.cause).toBe(cause);
  });

  it("wraps unknown errors as INTERNAL_ERROR with the cause attached", () => {
    const cause = new Error("boom");
    const wrapped = toAssuranceError(cause, "ctx");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.message).toContain("ctx");
    expect(wrapped.message).toContain("boom");
  });

  it("wraps non-Error throwables without exploding", () => {
    const wrapped = toAssuranceError("a string", "ctx");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.message).toContain("a string");
  });

  it("has no retryable input-error codes (fail-closed by construction)", () => {
    // Every code except INTERNAL_ERROR is an input/boundary
    // violation: identical inputs must produce the identical
    // failure, never a retry loop.
    const inputCodes: ReadonlyArray<string> = [
      "PROFILE_INVALID",
      "TASK_NOT_FOUND",
      "MODEL_NOT_FOUND",
      "PROJECT_MISMATCH",
      "GRAPH_INVALID",
      "MAPPING_INVALID",
      "RECORD_INVALID",
      "BOUNDS_EXCEEDED",
    ];
    for (const code of inputCodes) {
      expect(new AssuranceError(code as never, "x").code).toBe(code);
    }
  });
});
