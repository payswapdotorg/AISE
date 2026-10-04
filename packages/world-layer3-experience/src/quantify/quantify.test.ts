/**
 * WORLD-P3 tests — the QUANTIFY family: the BOQ-authority law (the
 * view never recomputes; the projection is NOT a BOQ; engine
 * quantities carried verbatim), the what-if laws (ghost discipline
 * through the P0-C usage port, deviation comparison through the P1
 * vocabulary), the double byte-identity and the fail-closed drills.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { SolutionBoq } from "@aise/solution-boq";
import { SolutionSceneUsageAlternateDouble, SolutionSceneUsageReferenceDouble } from "@aise/world-solution-substrate";
import { classifyWorldDiffs, DIFFERENCE_CLASSIFICATIONS } from "../compare-bridge";
import {
  compareWhatIfAlternatives,
  projectLiveQuantityConsequences,
  viewBoqGraph,
} from "./contract";
import { alternateBoqGraphViewDouble, referenceBoqGraphViewDouble } from "./doubles";
import {
  FIXTURE_QUANTIFY_WORLD,
  fixtureProjectionRequest,
  fixtureWhatIfComparisonRequest,
  fixtureWrongVersionProjectionRequest,
  FIXTURE_WHAT_IF_ALTERNATIVE_A,
  FIXTURE_WHAT_IF_ALTERNATIVE_B,
} from "./corpus";

/* ------------------------------------------------------------------ */
/* QUANTIFY — the BOQ-authority law                                     */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 quantify — the BOQ-authority law (the view never recomputes)", () => {
  const boq: SolutionBoq = FIXTURE_QUANTIFY_WORLD.boq;

  test("the fixture BOQ is derived through the REAL seams (engine replay + validation + derivation)", () => {
    // The corpus drove replaySolution → validateSolutionVersion →
    // deriveSolutionBoq. The BOQ Graph stays the authority; this lane
    // only views it. Structural seals:
    expect(boq.artifactKind).toBe("solution-generated-boq");
    expect(boq.epistemicClass).toBe("PROPOSED");
    expect(boq.solutionId).toBe("solution-demo-001");
    expect(boq.versionNumber).toBe(1);
    expect(boq.lines.length).toBeGreaterThan(0);
    expect(boq.operationIds.length).toBe(3);
  });

  test("the section-totals view carries the BOQ's own records verbatim", () => {
    const outcome = viewBoqGraph({ boq, query: { query: "section-totals" } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    let totalLines = 0;
    for (const section of outcome.value.sectionTotals) {
      const boqSection = boq.sections.find((candidate) => candidate.sectionId === section.sectionId);
      expect(boqSection).toBeDefined();
      if (boqSection === undefined) continue;
      expect(section.lineCount).toBe(boqSection.lineIds.length);
      expect(section.title).toBe(boqSection.title);
      totalLines += section.lineCount;
    }
    expect(totalLines).toBe(boq.lines.length);
    // The net totals echo is the BOQ's own array (byte-identical).
    expect(canonicalJsonStringify(outcome.value.totals)).toBe(
      canonicalJsonStringify(boq.totals),
    );
  });

  test("the line view serves the BOQ's own line record byte-identically + the trace navigation", () => {
    const lineId = boq.lines[0]?.boqLineId;
    expect(typeof lineId).toBe("string");
    if (typeof lineId !== "string") return;
    const outcome = viewBoqGraph({ boq, query: { query: "line", lineId } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(canonicalJsonStringify(outcome.value.line)).toBe(
      canonicalJsonStringify(boq.lines[0]),
    );
    expect(outcome.value.lineOperationIds.length).toBeGreaterThan(0);
    for (const operationId of outcome.value.lineOperationIds) {
      expect(boq.operationIds).toContain(operationId);
    }
  });

  test("the operation-contributions view navigates through the BOQ's own resolvers", () => {
    const operationId = boq.operationIds[0];
    expect(typeof operationId).toBe("string");
    if (typeof operationId !== "string") return;
    const outcome = viewBoqGraph({
      boq,
      query: { query: "operation-contributions", operationId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.operationLineIds.length).toBeGreaterThan(0);
    for (const lineId of outcome.value.operationLineIds) {
      expect(boq.lines.some((line) => line.boqLineId === lineId)).toBe(true);
    }
  });

  test("an unknown line is refused (never a fabricated view)", () => {
    const outcome = viewBoqGraph({ boq, query: { query: "line", lineId: "no-such-line" } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
  });

  test("a non-BOQ view input is refused (only the authority's records)", () => {
    const outcome = viewBoqGraph({
      boq: { ...boq, artifactKind: "source-boq" as never },
      query: { query: "section-totals" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("only authority");
  });

  test("the two BOQ-store doubles serve byte-identical BOQs; unknown versions answer null", () => {
    const reference = referenceBoqGraphViewDouble([boq]);
    const alternate = alternateBoqGraphViewDouble([boq]);
    const request = { solutionId: "solution-demo-001", versionNumber: 1 };
    const a = reference.resolveBoqVersion(request);
    const b = alternate.resolveBoqVersion(request);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value).not.toBeNull();
    expect(b.value).not.toBeNull();
    expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
    const unknown = reference.resolveBoqVersion({
      solutionId: "solution-unknown-042",
      versionNumber: 9,
    });
    expect(unknown.ok).toBe(true);
    if (unknown.ok) {
      expect(unknown.value).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/* QUANTIFY — the live projection law                                   */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 quantify — the live projection law (PROPOSED, never a BOQ)", () => {
  test("the projection groups the engine quantities verbatim with cited calculation refs", () => {
    const outcome = projectLiveQuantityConsequences(fixtureProjectionRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const projection = outcome.value;
    // The projection seal: PROPOSED, a projection kind — NOT a BOQ.
    expect(projection.epistemicClass).toBe("PROPOSED");
    expect(projection.kind).toBe("quantity-consequence-projection");
    expect("artifactKind" in projection).toBe(false);
    expect(projection.baselineBoqId).toBe(FIXTURE_QUANTIFY_WORLD.boq.boqId);
    // Every projected line's value + unit + calculationRef come from the
    // RECORDED engine quantity effects, verbatim.
    const plaster = FIXTURE_QUANTIFY_WORLD.operations.find(
      (operation) =>
        operation.operationId ===
        FIXTURE_QUANTIFY_WORLD.operations[FIXTURE_QUANTIFY_WORLD.operations.length - 1]
          ?.operationId,
    );
    expect(plaster).toBeDefined();
    if (plaster === undefined) return;
    const engineQuantities = plaster.effects
      .filter((effect) => effect.effectKind === "quantity-impact")
      .map((effect) => effect.quantity)
      .filter((quantity): quantity is NonNullable<typeof quantity> => quantity !== undefined);
    expect(engineQuantities.length).toBeGreaterThan(0);
    for (const line of projection.lines) {
      const matching = engineQuantities.find(
        (quantity) =>
          quantity.dimension === line.dimension &&
          quantity.unit === line.unit &&
          quantity.calculationRef === line.calculationRef,
      );
      expect(matching).toBeDefined();
      if (matching !== undefined) {
        expect(line.value).toBe(matching.value);
      }
      expect(line.contributingOperationIds).toEqual([plaster.operationId]);
    }
  });

  test("an operation of another version context is refused (the projection is version-pinned)", () => {
    const outcome = projectLiveQuantityConsequences(fixtureWrongVersionProjectionRequest());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("belongs to");
  });

  test("an empty projection request is refused", () => {
    const outcome = projectLiveQuantityConsequences({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      proposedOperations: [],
      baselineBoq: null,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
  });

  test("operations without quantity effects are honestly censused (never fabricated)", () => {
    // The demolition operation in this fixture world carries quantity
    // effects; strip them to prove the honest census.
    const demolition = FIXTURE_QUANTIFY_WORLD.operations[0];
    expect(demolition).toBeDefined();
    if (demolition === undefined) return;
    const stripped = {
      ...demolition,
      effects: demolition.effects.filter((effect) => effect.effectKind !== "quantity-impact"),
    };
    const outcome = projectLiveQuantityConsequences({
      solutionId: demolition.solutionId,
      versionNumber: demolition.versionNumber,
      proposedOperations: [stripped],
      baselineBoq: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.lines).toEqual([]);
    expect(outcome.value.operationsWithoutQuantityEffects).toEqual([
      demolition.operationId,
    ]);
    expect(outcome.value.baselineBoqId).toBeNull();
  });

  test("the projection id is content-derived (identical requests re-derive it)", () => {
    const a = projectLiveQuantityConsequences(fixtureProjectionRequest());
    const b = projectLiveQuantityConsequences(fixtureProjectionRequest());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.projectionId).toBe(b.value.projectionId);
  });
});

/* ------------------------------------------------------------------ */
/* WHAT-IF — the variant-set + deviation-comparison laws                */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 quantify — the what-if laws", () => {
  test("the alternatives compose through the P0-C usage port with the ghost discipline held", () => {
    const usage = new SolutionSceneUsageReferenceDouble();
    const outcome = compareWhatIfAlternatives(fixtureWhatIfComparisonRequest(), usage);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.alternatives.length).toBe(2);
    for (const alternative of outcome.value.alternatives) {
      // The P0-C composed presentation: token + every variant target a ghost.
      expect(alternative.presentation.presentationToken).toMatch(/^[0-9a-f]{64}$/);
      expect(alternative.presentation.everyVariantTargetIsGhost).toBe(true);
      expect(alternative.presentation.variantTrail.length).toBe(1);
    }
  });

  test("the deviation comparison answers from the P1 closed vocabulary with the declared tolerance", () => {
    const usage = new SolutionSceneUsageReferenceDouble();
    const outcome = compareWhatIfAlternatives(fixtureWhatIfComparisonRequest(), usage);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const a = outcome.value.alternatives.find(
      (alternative) => alternative.alternativeId === FIXTURE_WHAT_IF_ALTERNATIVE_A.alternativeId,
    );
    const b = outcome.value.alternatives.find(
      (alternative) => alternative.alternativeId === FIXTURE_WHAT_IF_ALTERNATIVE_B.alternativeId,
    );
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Both alternatives move the wall geometry beyond the declared
    // tolerance → deviation-detected, with the tolerance carried verbatim.
    expect(a?.deviationVerdicts[0]?.classification).toBe("deviation-detected");
    expect(b?.deviationVerdicts[0]?.classification).toBe("deviation-detected");
    expect(a?.deviationVerdicts[0]?.appliedTolerance).toEqual({ linear: 0.05, angular: 0.001 });
    expect(a?.deviationVerdicts[0]?.deviationMetres).toBeGreaterThan(0.05);
    // The declared quantity deltas are carried verbatim per alternative.
    expect(a?.declaredQuantityDeltas).toEqual(FIXTURE_WHAT_IF_ALTERNATIVE_A.declaredQuantityDeltas);
    expect(b?.declaredQuantityDeltas).toEqual(FIXTURE_WHAT_IF_ALTERNATIVE_B.declaredQuantityDeltas);
  });

  test("a within-tolerance geometry change classifies within-tolerance (the P1 verdict path)", () => {
    // Alternative B's shape differs from baseline by a small z-top
    // reduction (1 → 0.8): the CENTROID deviation is 0.1 > 0.05. Build a
    // tiny-delta alternative to exercise the within-tolerance class.
    const request = fixtureWhatIfComparisonRequest();
    const tinyDelta = {
      ...FIXTURE_WHAT_IF_ALTERNATIVE_B,
      alternativeId: "what-if-tiny-delta",
      elementShapes: [
        {
          elementId: "ghost-add-block-wall-0001",
          shape: {
            kind: "box" as const,
            name: null,
            min: { x: 0, y: 0, z: 0 },
            max: { x: 5, y: 0.1, z: 1.02 },
          },
        },
      ],
    };
    const usage = new SolutionSceneUsageReferenceDouble();
    const outcome = compareWhatIfAlternatives(
      { ...request, alternatives: [tinyDelta] },
      usage,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Centroid z differs by 0.01 → within the 0.05 tolerance.
    expect(outcome.value.alternatives[0]?.deviationVerdicts[0]?.classification).toBe(
      "within-tolerance",
    );
  });

  test("an alternative without a baseline shape classifies missing (the P1 unpaired path)", () => {
    const request = fixtureWhatIfComparisonRequest();
    const newElement = {
      ...FIXTURE_WHAT_IF_ALTERNATIVE_A,
      alternativeId: "what-if-new-element",
      elementShapes: [
        {
          elementId: "ghost-add-block-wall-9999",
          shape: {
            kind: "box" as const,
            name: null,
            min: { x: 9, y: 9, z: 9 },
            max: { x: 10, y: 10, z: 10 },
          },
        },
      ],
    };
    const usage = new SolutionSceneUsageReferenceDouble();
    const outcome = compareWhatIfAlternatives(
      { ...request, alternatives: [newElement] },
      usage,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const verdicts = outcome.value.alternatives[0]?.deviationVerdicts ?? [];
    // The ghost-9999 shape has NO baseline → missing-in-model; the
    // baseline wall shape has no alternative → missing-in-capture.
    const classifications = verdicts.map((verdict) => verdict.classification);
    expect(classifications).toContain("missing-in-model");
    expect(classifications).toContain("missing-in-capture");
  });

  test("a what-if comparison without a declared tolerance is refused", () => {
    const request = fixtureWhatIfComparisonRequest();
    const outcome = compareWhatIfAlternatives(
      { ...request, tolerance: { linear: 0, angular: 0 } },
      new SolutionSceneUsageReferenceDouble(),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("positive-finite");
  });

  test("a what-if variant targeting a NON-ghost element is refused by the P0-C ghost discipline", () => {
    const request = fixtureWhatIfComparisonRequest();
    // A variant set that overrides the CAPTURED wall element (not a ghost).
    const rogueVariantSets = [
      {
        variantSetId: "wall-clearance",
        variants: [
          {
            variantId: "shift-wall-south",
            overrides: [
              {
                elementId: "node-wall-002",
                label: "Rogue variant over captured reality",
              },
            ],
          },
        ],
      },
    ];
    const rogueRequest = {
      ...request,
      variantSets: rogueVariantSets,
    };
    const outcome = compareWhatIfAlternatives(
      rogueRequest,
      new SolutionSceneUsageReferenceDouble(),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("what-if composition refused");
  });

  test("the reference and alternate usage hosts produce the same deviation verdicts (substitution transparency)", () => {
    const request = fixtureWhatIfComparisonRequest();
    const a = compareWhatIfAlternatives(request, new SolutionSceneUsageReferenceDouble());
    const b = compareWhatIfAlternatives(request, new SolutionSceneUsageAlternateDouble());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // The deviation verdicts (the lane's own semantics) are identical;
    // only the substrate provenance differs (P0-C's law 7).
    expect(canonicalJsonStringify(a.value.alternatives.map((alt) => alt.deviationVerdicts))).toBe(
      canonicalJsonStringify(b.value.alternatives.map((alt) => alt.deviationVerdicts)),
    );
    expect(a.value.comparisonId).toBe(b.value.comparisonId);
  });

  test("the compare-bridge re-exports the P1 closed classification vocabulary verbatim", () => {
    expect(DIFFERENCE_CLASSIFICATIONS).toEqual([
      "missing-in-capture",
      "missing-in-model",
      "deviation-detected",
      "within-tolerance",
      "unverifiable",
    ]);
  });

  test("the compare-bridge classifies shape pairs through the P1 transform (composed, not re-implemented)", () => {
    const within = classifyWorldDiffs({
      worldRevision: 1,
      pairs: [
        {
          baselineElementId: "a",
          alternativeElementId: "a",
          baselineShape: {
            kind: "box",
            name: null,
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
          alternativeShape: {
            kind: "box",
            name: null,
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1.01 },
          },
        },
      ],
      tolerance: { linear: 0.05, angular: 0.001 },
      nearBoundaryBand: 0.02,
      units: { linear: "m", angular: "rad" },
      declaredAt: "2026-10-05T10:00:00.000Z",
    });
    expect(within.ok).toBe(true);
    if (!within.ok) return;
    expect(within.value[0]?.classification).toBe("within-tolerance");

    const deviated = classifyWorldDiffs({
      worldRevision: 1,
      pairs: [
        {
          baselineElementId: "a",
          alternativeElementId: "a",
          baselineShape: {
            kind: "box",
            name: null,
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
          alternativeShape: {
            kind: "box",
            name: null,
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 2 },
          },
        },
      ],
      tolerance: { linear: 0.05, angular: 0.001 },
      nearBoundaryBand: 0.02,
      units: { linear: "m", angular: "rad" },
      declaredAt: "2026-10-05T10:00:00.000Z",
    });
    expect(deviated.ok).toBe(true);
    if (!deviated.ok) return;
    expect(deviated.value[0]?.classification).toBe("deviation-detected");
  });

  test("a comparison id is content-derived (identical requests re-derive it)", () => {
    const request = fixtureWhatIfComparisonRequest();
    const a = compareWhatIfAlternatives(request, new SolutionSceneUsageReferenceDouble());
    const b = compareWhatIfAlternatives(request, new SolutionSceneUsageReferenceDouble());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.comparisonId).toBe(b.value.comparisonId);
  });
});
