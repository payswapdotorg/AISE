/**
 * Evidence-service error tests: typed codes, detail records,
 * wrapped pure-layer causes, and the fail-closed narrowing rules.
 */
import { describe, expect, it } from "vitest";
import { EvidenceError, toEvidenceError } from "@aise/engineering-model";
import {
  EvidenceServiceError,
  toEvidenceServiceError,
} from "./errors.js";

describe("EvidenceServiceError", () => {
  it("carries code, details, and message", () => {
    const error = new EvidenceServiceError("EVIDENCE_INVALID", "bad record", {
      details: { field: "kind", value: "PHOTO" },
    });
    expect(error.name).toBe("EvidenceServiceError");
    expect(error.code).toBe("EVIDENCE_INVALID");
    expect(error.message).toBe("bad record");
    expect(error.details).toEqual({ field: "kind", value: "PHOTO" });
    expect(error.cause).toBeUndefined();
    expect(error.errorCauses()).toEqual([]);
  });

  it("defaults details to the empty record", () => {
    const error = new EvidenceServiceError("BOUNDS_EXCEEDED", "too many");
    expect(error.details).toEqual({});
  });

  it("preserves a wrapped pure-layer EvidenceError cause", () => {
    const cause = new EvidenceError("KIND_INCOMPATIBLE", "LIDAR needs DEPTH");
    const error = new EvidenceServiceError("KIND_INCOMPATIBLE", cause.message, { cause });
    expect(error.cause).toBe(cause);
    expect(error.errorCauses()).toEqual([
      { source: "engineering-model/evidence", code: "KIND_INCOMPATIBLE", message: cause.message },
    ]);
  });

  it("ignores non-EvidenceError causes (the chain stays typed)", () => {
    const error = new EvidenceServiceError("INTERNAL_ERROR", "boom", {
      cause: new Error("plain"),
    });
    expect(error.cause).toBeUndefined();
    expect(error.errorCauses()).toEqual([]);
  });
});

describe("toEvidenceServiceError (fail-closed narrowing)", () => {
  it("passes EvidenceServiceError through unchanged", () => {
    const original = new EvidenceServiceError("LINK_INVALID", "nope");
    expect(toEvidenceServiceError(original)).toBe(original);
  });

  it("wraps EvidenceError with its own code and the cause preserved", () => {
    const cause = new EvidenceError("MAPPING_INVALID", "integrity");
    const wrapped = toEvidenceServiceError(cause);
    expect(wrapped).toBeInstanceOf(EvidenceServiceError);
    expect(wrapped.code).toBe("MAPPING_INVALID");
    expect(wrapped.message).toBe("integrity");
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.errorCauses()[0]!.code).toBe("MAPPING_INVALID");
  });

  it("maps pure-layer codes outside the service vocabulary to EVIDENCE_INVALID", () => {
    // INTERNAL_ERROR is a valid pure-layer code but not a service
    // boundary outcome — it must surface as a domain failure, never
    // leak a generic panic code.
    const wrapped = toEvidenceServiceError(new EvidenceError("INTERNAL_ERROR", "internal"));
    expect(wrapped.code).toBe("EVIDENCE_INVALID");
    expect(wrapped.cause).toBeInstanceOf(EvidenceError);
  });

  it("wraps unknown errors as INTERNAL_ERROR without a cause chain", () => {
    const fromError = toEvidenceServiceError(new TypeError("cannot read"));
    expect(fromError.code).toBe("INTERNAL_ERROR");
    expect(fromError.message).toBe("cannot read");
    expect(fromError.cause).toBeUndefined();

    const fromString = toEvidenceServiceError("plain failure");
    expect(fromString.code).toBe("INTERNAL_ERROR");
    expect(fromString.message).toBe("plain failure");
  });

  it("re-exports the pure-layer narrowing helper", () => {
    const error = toEvidenceError(new TypeError("x"));
    expect(error).toBeInstanceOf(EvidenceError);
    expect(error.code).toBe("INTERNAL_ERROR");
  });
});
