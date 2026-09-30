/**
 * ANCHOR-002 tests — the typed PARTIAL outcome (PORT.md §7's first open
 * question, resolved at the contract layer): per-still results typecheck
 * and round-trip through the codec; the outcome vocabulary is closed.
 */

import { describe, expect, test } from "bun:test";
import {
  anchoringRefusedStillSchema,
  anchoringResponseSchema,
} from "./response";
import { buildPartialResponse, refuseStill } from "./laws";
import { guardAnchoringResponse } from "./guard";
import {
  fixtureAnchoredResponse,
  fixtureHypothesis,
  fixtureProvenance,
  fixtureRequest,
} from "./test-fixtures";

describe("the typed PARTIAL outcome", () => {
  const request = fixtureRequest();

  const partial = buildPartialResponse(request, {
    anchoredHypotheses: [fixtureHypothesis(request, 0), fixtureHypothesis(request, 1)],
    refusedStills: [
      refuseStill(request.evidence[2]!.contentId, "insufficient-features", "still-003: 4 keypoints < floor 80"),
    ],
    provenance: fixtureProvenance(request),
    executionTimeMs: 9000.0,
  });

  test("a lawful partial parses through the wire schema", () => {
    const result = anchoringResponseSchema.safeParse(partial);
    expect(result.success).toBe(true);
  });

  test("the partial summary matches the arrays and the guard accepts the partial", () => {
    expect(partial.status).toBe("partial");
    expect(partial.partialSummary).toEqual({ anchoredStills: 2, refusedStills: 1 });
    expect(partial.hypotheses).toHaveLength(2);
    expect(partial.refusedStills).toHaveLength(1);
    expect(guardAnchoringResponse(partial, request)).toEqual([]);
  });

  test("every refused still carries a typed per-still reason code from the closed vocabulary", () => {
    for (const still of partial.refusedStills ?? []) {
      expect(still.reasonCode).toBeOneOf([
        "evidence-method-unsupported",
        "evidence-bytes-mismatch",
        "insufficient-features",
        "registration-unreliable",
      ]);
    }
    const parsed = anchoringRefusedStillSchema.safeParse(partial.refusedStills?.[0]);
    expect(parsed.success).toBe(true);
  });

  test("a whole-request-only code cannot name a still (insufficient-stills is refused)", () => {
    const result = anchoringRefusedStillSchema.safeParse({
      contentId: request.evidence[0]!.contentId,
      reasonCode: "insufficient-stills",
      detail: "not a per-still code",
    });
    expect(result.success).toBe(false);
  });

  test("a partial that double-covers a still is refused at construction (exactly once)", () => {
    expect(() =>
      buildPartialResponse(request, {
        anchoredHypotheses: [
          fixtureHypothesis(request, 0),
          fixtureHypothesis(request, 1),
          fixtureHypothesis(request, 2),
        ],
        refusedStills: [
          refuseStill(request.evidence[2]!.contentId, "registration-unreliable", "double-covered"),
        ],
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      }),
    ).toThrow(/exactly once is required/);
  });

  test("a partial that invents a still id is refused at construction (ids are echoed)", () => {
    expect(() =>
      buildPartialResponse(request, {
        anchoredHypotheses: [fixtureHypothesis(request, 0)],
        refusedStills: [
          refuseStill(
            "f".repeat(64),
            "insufficient-features",
            "an id AISE never supplied",
          ),
        ],
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      }),
    ).toThrow(/not supplied by AISE/);
  });

  test("a partial with no refused still is refused at construction (that is an anchored outcome)", () => {
    expect(() =>
      buildPartialResponse(request, {
        anchoredHypotheses: [fixtureHypothesis(request, 0)],
        refusedStills: [],
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      }),
    ).toThrow(/refuses at least one still/);
  });

  test("the outcome vocabulary is closed — an unknown status is refused", () => {
    const result = anchoringResponseSchema.safeParse({
      ...fixtureAnchoredResponse(request),
      status: "mostly-anchored",
    });
    expect(result.success).toBe(false);
  });
});
