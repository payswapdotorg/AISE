/**
 * ANCHOR-002 tests — the output guard: the three port LAWS as typed, tested
 * invariants (the spike's neg-006 corruption classes and the ANCHOR-002
 * partial/identity laws as sabotage drills).
 *
 *   law 1 — no provider type crosses: unknown fields refused WITH THE FIELD
 *            NAMED, at every nesting level;
 *   law 2 — AISE owns identity: ids echoed never invented; executionId
 *            echoed; provider refs only in externalReferences;
 *   law 3 — fail closed BEFORE anchoring: every refusal carries ZERO
 *            hypotheses; partial accounting is exact.
 */

import { describe, expect, test } from "bun:test";
import { guardAnchoringResponse, deterministicProjection } from "./guard";
import { refuseAnchoring, buildPartialResponse, refuseStill } from "./laws";
import {
  fixtureAnchoredResponse,
  fixtureHypothesis,
  fixtureProvenance,
  fixtureRequest,
} from "./test-fixtures";

describe("law 1 — no provider type crosses (unknown fields, named)", () => {
  test("the lawful anchored response passes with zero violations", () => {
    const request = fixtureRequest();
    expect(guardAnchoringResponse(fixtureAnchoredResponse(request), request)).toEqual([]);
  });

  test("an unknown TOP-LEVEL field is refused with the field named (neg-006a class)", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      mysteryPoseGraph: { nodes: 17 },
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.code).toBe("unknown-field");
    expect(violations[0]!.path).toBe("mysteryPoseGraph");
    expect(violations[0]!.detail).toContain("mysteryPoseGraph");
  });

  test("a provider HANDLE LEAK inside a hypothesis is refused with the field named (neg-006b class)", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      hypotheses: [
        { ...fixtureHypothesis(request, 0), siftKeyPointHandle: 0x1f },
        ...fixtureAnchoredResponse(request).hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "unknown-field" && v.path === "hypotheses[0].siftKeyPointHandle")).toBe(true);
  });

  test("an unknown field nested in provenance is refused with its path named", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      provenance: { ...fixtureProvenance(request), vendorAccountId: "acct-9" },
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "unknown-field" && v.path === "provenance.vendorAccountId")).toBe(true);
  });

  test("a provider ref outside externalReferences is an unknown field (law 2's shape)", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      hypotheses: [
        { ...fixtureHypothesis(request, 0), providerRunRef: "provider-internal-run-42" },
        ...fixtureAnchoredResponse(request).hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "unknown-field" && v.path === "hypotheses[0].providerRunRef")).toBe(true);
  });

  test("provider refs INSIDE externalReferences are lawful", () => {
    const request = fixtureRequest();
    const response = fixtureAnchoredResponse(request);
    expect(response.provenance.externalReferences).toBeDefined();
    expect(guardAnchoringResponse(response, request)).toEqual([]);
  });

  test("a non-finite matrix entry is refused (neg-006c class)", () => {
    const request = fixtureRequest();
    const bad = fixtureAnchoredResponse(request);
    const matrix = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    (matrix[0] as number[])[0] = Number.NaN;
    const response = {
      ...bad,
      hypotheses: [
        { ...bad.hypotheses[0]!, transform: { ...bad.hypotheses[0]!.transform, matrix } },
        ...bad.hypotheses.slice(1),
      ],
    } as unknown;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "type-mismatch" && v.path === "hypotheses[0].transform.matrix")).toBe(true);
  });
});

describe("law 2 — AISE owns identity (echoed, never invented)", () => {
  test("an INVENTED hypothesis content id is refused (identity-echo)", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      hypotheses: [
        { ...fixtureHypothesis(request, 0), evidenceContentId: "e".repeat(64) },
        ...fixtureAnchoredResponse(request).hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "identity-echo" && v.path === "hypotheses[0].evidenceContentId")).toBe(true);
  });

  test("a foreign executionId is refused (the provider never invents identity)", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      executionId: "provider-invented-execution-42",
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "identity-echo" && v.path === "executionId")).toBe(true);
  });

  test("a partial refusing an UNSUPPLIED still id is refused (identity-echo)", () => {
    const request = fixtureRequest();
    const anchored = fixtureAnchoredResponse(request);
    const response = {
      ...anchored,
      status: "partial",
      partialSummary: { anchoredStills: 3, refusedStills: 1 },
      refusedStills: [
        { contentId: "d".repeat(64), reasonCode: "insufficient-features", detail: "invented" },
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "identity-echo" && v.path === "refusedStills[0].contentId")).toBe(true);
  });
});

describe("law 3 — fail closed BEFORE anchoring (zero hypotheses on refusal)", () => {
  test("a refused response carrying hypotheses is refused (neg-006d class — fabricated anchors)", () => {
    const request = fixtureRequest();
    const refused = refuseAnchoring(request, {
      reasonCode: "insufficient-stills",
      refusalDetail: "1 still < policy floor 2",
      provenance: fixtureProvenance(request),
      executionTimeMs: 120.0,
    });
    const response = {
      ...refused,
      hypotheses: [fixtureHypothesis(request, 0)],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(
      violations.some(
        (v) => v.code === "refusal-discipline" && v.path === "hypotheses" && v.detail.includes("NO hypotheses"),
      ),
    ).toBe(true);
  });

  test("a refusal with an open vocabulary reasonCode is refused", () => {
    const request = fixtureRequest();
    const response = {
      ...refuseAnchoring(request, {
        reasonCode: "plan-context-missing",
        refusalDetail: "no plan",
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      }),
      reasonCode: "vibes-wrong",
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "vocabulary-violation" && v.path === "reasonCode")).toBe(true);
  });

  test("a refusal with an empty refusalDetail is refused", () => {
    const request = fixtureRequest();
    const response = {
      ...refuseAnchoring(request, {
        reasonCode: "plan-context-missing",
        refusalDetail: "no plan",
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      }),
      refusalDetail: "",
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "refusal-discipline" && v.path === "refusalDetail")).toBe(true);
  });

  test("a lawful refusal passes the guard with zero violations and zero hypotheses", () => {
    const request = fixtureRequest();
    const refused = refuseAnchoring(request, {
      reasonCode: "insufficient-stills",
      refusalDetail: "1 still < policy floor 2 — refusing rather than emitting self-referential inliers",
      provenance: fixtureProvenance(request),
      executionTimeMs: 120.0,
    });
    expect(guardAnchoringResponse(refused, request)).toEqual([]);
    expect(refused.hypotheses).toHaveLength(0);
    expect(refused.refusedStills).toBeUndefined();
  });

  test("an anchored response carrying partialSummary is refused (outcome discipline)", () => {
    const request = fixtureRequest();
    const response = {
      ...fixtureAnchoredResponse(request),
      partialSummary: { anchoredStills: 3, refusedStills: 0 },
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "refusal-discipline" && v.path === "partialSummary")).toBe(true);
  });

  test("a partial whose summary disagrees with its arrays is refused (partial-accounting)", () => {
    const request = fixtureRequest();
    const partial = buildPartialResponse(request, {
      anchoredHypotheses: [fixtureHypothesis(request, 0)],
      refusedStills: [
        refuseStill(request.evidence[1]!.contentId, "insufficient-features", "still-002"),
        refuseStill(request.evidence[2]!.contentId, "registration-unreliable", "still-003"),
      ],
      provenance: fixtureProvenance(request),
      executionTimeMs: 1,
    });
    const response = {
      ...partial,
      partialSummary: { anchoredStills: 9, refusedStills: 9 },
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "partial-accounting" && v.path === "partialSummary.anchoredStills")).toBe(true);
    expect(violations.some((v) => v.code === "partial-accounting" && v.path === "partialSummary.refusedStills")).toBe(true);
  });

  test("an anchored response that drops a requested still from its hypotheses is refused (exactly once)", () => {
    const request = fixtureRequest();
    const anchored = fixtureAnchoredResponse(request);
    const missing = {
      ...anchored,
      hypotheses: anchored.hypotheses.slice(0, 2),
    } as Record<string, unknown>;
    // still-003 is covered by NEITHER array — the identity accounting must catch it
    const violations = guardAnchoringResponse(missing, request);
    expect(
      violations.some((v) => v.code === "partial-accounting" && v.detail.includes("appears 0 times")),
    ).toBe(true);
  });

  test("a duplicated still across hypotheses and refusedStills is refused (exactly once)", () => {
    const request = fixtureRequest();
    const partial = buildPartialResponse(request, {
      anchoredHypotheses: [fixtureHypothesis(request, 0)],
      refusedStills: [
        refuseStill(request.evidence[1]!.contentId, "insufficient-features", "still-002"),
        refuseStill(request.evidence[2]!.contentId, "registration-unreliable", "still-003"),
      ],
      provenance: fixtureProvenance(request),
      executionTimeMs: 1,
    });
    const response = {
      ...partial,
      hypotheses: [...partial.hypotheses, partial.hypotheses[0]],
      partialSummary: { anchoredStills: 2, refusedStills: 2 },
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "partial-accounting" && v.detail.includes("appears 2 times"))).toBe(true);
  });
});

describe("the numeric disciplines (the spike's guard, lifted)", () => {
  const request = fixtureRequest();
  const base = fixtureAnchoredResponse(request);

  test("a non-normalized matrix (h[2][2] !== 1) is refused (matrix-normalization)", () => {
    const matrix = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 2],
    ];
    const response = {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0]!, transform: { ...base.hypotheses[0]!.transform, matrix } },
        ...base.hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "matrix-normalization")).toBe(true);
  });

  test("a budget95M below floorRmsM is refused (budget-ordering)", () => {
    const response = {
      ...base,
      hypotheses: [
        {
          ...base.hypotheses[0]!,
          uncertainty: { ...base.hypotheses[0]!.uncertainty, budget95M: 0.001 },
        },
        ...base.hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "budget-ordering")).toBe(true);
  });

  test("a confidence above 1 is refused (declared support score, never a probability)", () => {
    const response = {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0]!, confidence: 1.5 },
        ...base.hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "value-out-of-range" && v.path === "hypotheses[0].confidence")).toBe(true);
  });

  test("a CONFIRMED epistemic label is refused (hypotheses are ALWAYS INFERRED candidates)", () => {
    const response = {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0]!, epistemicLabel: "CONFIRMED" },
        ...base.hypotheses.slice(1),
      ],
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "vocabulary-violation" && v.path === "hypotheses[0].epistemicLabel")).toBe(true);
  });

  test("the spike's portVersion is refused — the lanes are physically distinct", () => {
    const response = {
      ...base,
      portVersion: "anchor001-anchoring-port/1",
    } as Record<string, unknown>;
    const violations = guardAnchoringResponse(response, request);
    expect(violations.some((v) => v.code === "vocabulary-violation" && v.path === "portVersion")).toBe(true);
  });
});

describe("the deterministic projection (digest discipline)", () => {
  test("excludes executionId/executionTimeMs/stageTimingsMs; identical semantics project identically", () => {
    const request = fixtureRequest();
    const a = fixtureAnchoredResponse(request);
    const b: typeof a = {
      ...a,
      executionId: "anchor002-test-run-002",
      executionTimeMs: 99999.0,
      stageTimingsMs: { detect: 1 },
    };
    expect(deterministicProjection(a)).toBe(deterministicProjection(b));
  });

  test("a semantic difference changes the projection", () => {
    const request = fixtureRequest();
    const a = fixtureAnchoredResponse(request);
    const b: typeof a = { ...a, hypotheses: [...a.hypotheses.slice(1)] };
    expect(deterministicProjection(a)).not.toBe(deterministicProjection(b));
  });
});
