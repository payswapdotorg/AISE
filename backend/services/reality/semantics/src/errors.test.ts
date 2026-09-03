/**
 * Semantics error model tests (AISE-010).
 *
 * Fail-closed defaults, non-retryable by construction (except
 * INTERNAL_ERROR), GeometryError wrapping with preserved lineage.
 */
import { describe, expect, it } from "vitest";
import { GeometryError } from "@aise/backend-geometry";
import { SemanticsError, toSemanticsError, wrapGeometryFailure } from "./errors.js";

describe("SemanticsError", () => {
  it("carries code, message, details, and name", () => {
    const error = new SemanticsError("VALIDATION_FAILED", "bad input", {
      details: { field: "unit", value: "furlong" },
    });
    expect(error.name).toBe("SemanticsError");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toBe("bad input");
    expect(error.details).toEqual({ field: "unit", value: "furlong" });
  });

  it("defaults to details {} and non-retryable", () => {
    const error = new SemanticsError("INSUFFICIENT_POINTS", "too few");
    expect(error.details).toEqual({});
    expect(error.retryable).toBe(false);
  });

  it("INTERNAL_ERROR defaults to retryable (implementation defect, not input property)", () => {
    const error = new SemanticsError("INTERNAL_ERROR", "unexpected");
    expect(error.retryable).toBe(true);
  });

  it("retryable is settable only explicitly", () => {
    const error = new SemanticsError("BOUNDS_EXCEEDED", "cap", {
      details: {},
      retryable: true,
    });
    expect(error.retryable).toBe(true);
    const normal = new SemanticsError("BOUNDS_EXCEEDED", "cap");
    expect(normal.retryable).toBe(false);
  });

  it("is an Error instance", () => {
    expect(new SemanticsError("VALIDATION_FAILED", "x")).toBeInstanceOf(Error);
  });
});

describe("toSemanticsError", () => {
  it("narrows SemanticsError and rejects everything else", () => {
    const error = new SemanticsError("DEGENERATE_GEOMETRY", "collapsed");
    expect(toSemanticsError(error)).toBe(error);
    expect(toSemanticsError(new Error("plain"))).toBeNull();
    expect(toSemanticsError("string")).toBeNull();
    expect(toSemanticsError(null)).toBeNull();
  });
});

describe("wrapGeometryFailure", () => {
  it("wraps a GeometryError into PLANE_FIT_FAILED with the cause chain", () => {
    const cause = new GeometryError("DEGENERATE_GEOMETRY", "degenerate plane");
    const wrapped = wrapGeometryFailure("segmentation", cause);
    expect(wrapped.code).toBe("PLANE_FIT_FAILED");
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.message).toContain("segmentation");
    expect(wrapped.details.stage).toBe("segmentation");
    const causeRecord = wrapped.details.cause as Record<string, string>;
    expect(causeRecord.service).toBe("aise.geometry");
    expect(causeRecord.code).toBe("DEGENERATE_GEOMETRY");
    expect(causeRecord.message).toBe("degenerate plane");
  });

  it("wraps non-geometry failures as retryable INTERNAL_ERROR", () => {
    const wrapped = wrapGeometryFailure("stage-x", new Error("boom"));
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.retryable).toBe(true);
    expect(wrapped.details.stage).toBe("stage-x");
    expect(String(wrapped.details.message)).toContain("boom");
  });

  it("wraps thrown non-errors as retryable INTERNAL_ERROR", () => {
    const wrapped = wrapGeometryFailure("stage-y", "just a string");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.retryable).toBe(true);
  });
});
