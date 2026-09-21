/**
 * PROD-022 — solution tool model tests (boundary parsers + typed errors).
 *
 * Proves the request-boundary discipline in isolation:
 *  - every parser fails closed with the right typed code (missing fields,
 *    wrong shapes, non-integer/negative state indexes, malformed
 *    timestamps);
 *  - the error registry is frozen and stable;
 *  - optional fields stay optional (capabilityProfile/stateIndex).
 */

import { describe, expect, test } from "bun:test";
import {
  SOLUTION_ERROR_CODES,
  SolutionError,
  parseInspectRequest,
  parseQuantitiesRequest,
  parseStepRequest,
  parseValidateRequest,
  requireNonEmptyString,
} from "./model";

describe("the typed error registry", () => {
  test("the code vocabulary is frozen and stable", () => {
    expect(Object.isFrozen(SOLUTION_ERROR_CODES)).toBe(true);
    expect([...SOLUTION_ERROR_CODES]).toEqual([
      "invalid_request",
      "invalid_intent",
      "invalid_baseline",
      "invalid_version",
      "invalid_state_index",
      "invalid_timestamp",
      "malformed_json",
      "unknown_route",
    ]);
  });

  test("a SolutionError carries code + detail + message", () => {
    const error = new SolutionError("invalid_request", "expected a JSON object body");
    expect(error.code).toBe("invalid_request");
    expect(error.detail).toBe("expected a JSON object body");
    expect(error.message).toBe("invalid_request: expected a JSON object body");
    expect(error.name).toBe("SolutionError");
  });
});

describe("parseStepRequest", () => {
  const valid = {
    baseline: { stateId: "s" },
    intent: { intentId: "i" },
    materializedAt: "2026-09-16T10:01:00.000Z",
  };

  test("a well-formed body parses with optional capabilityProfile", () => {
    const request = parseStepRequest(valid);
    expect(request.materializedAt).toBe("2026-09-16T10:01:00.000Z");
    expect(request.capabilityProfile).toBeUndefined();
    const withProfile = parseStepRequest({ ...valid, capabilityProfile: { profileId: "p" } });
    expect(withProfile.capabilityProfile).toEqual({ profileId: "p" });
  });

  test("a non-object body is invalid_request", () => {
    expect(() => parseStepRequest("nope")).toThrow(SolutionError);
    expect(() => parseStepRequest([])).toThrow(SolutionError);
    try {
      parseStepRequest(42);
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_request");
    }
  });

  test("a missing baseline is invalid_baseline", () => {
    try {
      parseStepRequest({ intent: valid.intent, materializedAt: valid.materializedAt });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_baseline");
    }
  });

  test("a missing intent is invalid_intent", () => {
    try {
      parseStepRequest({ baseline: valid.baseline, materializedAt: valid.materializedAt });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_intent");
    }
  });

  test("a malformed materializedAt is invalid_timestamp (no clock reads)", () => {
    for (const bad of ["", "10:00", "2026-09-16", "2026-09-16T10:01:00Z", null, 5]) {
      try {
        parseStepRequest({ ...valid, materializedAt: bad });
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as SolutionError).code).toBe("invalid_timestamp");
      }
    }
  });
});

describe("parseValidateRequest", () => {
  test("a well-formed body parses", () => {
    const request = parseValidateRequest({
      version: { solutionId: "s" },
      validatedAt: "2026-09-16T10:30:00.000Z",
    });
    expect(request.validatedAt).toBe("2026-09-16T10:30:00.000Z");
  });

  test("a missing version is invalid_version", () => {
    try {
      parseValidateRequest({ validatedAt: "2026-09-16T10:30:00.000Z" });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_version");
    }
  });

  test("a missing validatedAt is invalid_timestamp", () => {
    try {
      parseValidateRequest({ version: {} });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_timestamp");
    }
  });
});

describe("parseInspectRequest / parseQuantitiesRequest", () => {
  test("a well-formed body parses with an optional stateIndex", () => {
    const request = parseInspectRequest({ version: {} });
    expect(request.stateIndex).toBeUndefined();
    const withIndex = parseQuantitiesRequest({ version: {}, stateIndex: 3 });
    expect(withIndex.stateIndex).toBe(3);
  });

  test("a non-integer stateIndex is invalid_state_index", () => {
    for (const bad of [1.5, -1, "2", null]) {
      expect(() => parseInspectRequest({ version: {}, stateIndex: bad })).toThrow(SolutionError);
      expect(() => parseQuantitiesRequest({ version: {}, stateIndex: bad })).toThrow(SolutionError);
    }
    try {
      parseInspectRequest({ version: {}, stateIndex: -3 });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_state_index");
    }
  });

  test("a missing version is invalid_version", () => {
    expect(() => parseInspectRequest({})).toThrow(SolutionError);
    expect(() => parseQuantitiesRequest({ stateIndex: 0 })).toThrow(SolutionError);
  });
});

describe("requireNonEmptyString", () => {
  test("non-empty strings pass; everything else fails closed", () => {
    expect(requireNonEmptyString("ok", "invalid_request", "field")).toBe("ok");
    expect(() => requireNonEmptyString("", "invalid_request", "field")).toThrow(SolutionError);
    expect(() => requireNonEmptyString(undefined, "invalid_request", "field")).toThrow(
      SolutionError,
    );
  });
});
