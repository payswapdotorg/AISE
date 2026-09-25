/**
 * HFX-303 tests — SEMANTIC NON-INTERFERENCE (the lane's first law,
 * TEST-PROVEN, zero tolerance): generated visuals can never change
 * quantities, validation or canonical Solution Graph state.
 *
 * The proof has three layers:
 *
 *  1. STRUCTURAL: the request carries presentation inputs only (state
 *     identity + already-computed projection snapshots, CLONED and
 *     DEEP-FROZEN by the governed lane entry) — a provider cannot reach
 *     the Solution Graph, the engine, the quantities or the validation
 *     state through the port. The corpus objects stay byte-identical
 *     through every render.
 *  2. ENGINE-RE-DERIVATION: after rendering through EVERY provider, the
 *     canonical engine's public surface re-derives the state's quantity
 *     inventory and the version's validation snapshot — EXACT equality
 *     with the no-visual baseline (zero tolerance: ANY numeric delta is a
 *     failure).
 *  3. THE CHECK HAS TEETH: a rogue provider that performs a NUMERIC
 *     MUTATION is (a) refused fail-closed through the governed lane and
 *     (b) DETECTED by the byte-comparison when the lane is bypassed —
 *     the sabotage twin proves the drill cannot silently pass.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { deriveStateQuantities, validateSolutionVersion } from "@aise/solution-engine";
import { REFERENCE_BUILDING_OPERATION_PROFILE } from "@aise/solution-contract";
import { renderThroughLane, type VisualRenderProvider } from "./port";
import { buildVisualCorpus, demoBaselineGeometryResolver } from "./corpus";
import { createReferenceVisualProvider } from "./providers/reference";
import { createAlternateVisualProvider } from "./providers/alternate";
import { createFailingVisualProvider } from "./providers/failing";
import { createRogueMutatingProvider } from "./lane";

const corpus = buildVisualCorpus();
const VALIDATED_AT = "2026-09-16T12:00:00.000Z";

function allLaneProviders(): readonly VisualRenderProvider[] {
  return [
    createReferenceVisualProvider(),
    createAlternateVisualProvider(),
    createFailingVisualProvider(),
  ];
}

describe("semantic non-interference (zero tolerance)", () => {
  test("renders through EVERY provider leave the canonical state and version BYTE-IDENTICAL", () => {
    for (const corpusCase of corpus) {
      const stateBytesBefore = canonicalJsonStringify(corpusCase.state);
      const versionBytesBefore = canonicalJsonStringify(corpusCase.version);
      const requestBytesBefore = canonicalJsonStringify(corpusCase.request);

      for (const provider of allLaneProviders()) {
        const outcome = renderThroughLane(provider, corpusCase.request);
        // The outcome itself may be a typed failure (the failing fixture)
        // — that is a lawful answer; the CANONICAL data must not move.
        void outcome;
        expect(canonicalJsonStringify(corpusCase.state)).toBe(stateBytesBefore);
        expect(canonicalJsonStringify(corpusCase.version)).toBe(versionBytesBefore);
        expect(canonicalJsonStringify(corpusCase.request)).toBe(requestBytesBefore);
      }
    }
  });

  test("quantities and validation verdicts re-derived AFTER every render are EXACTLY the no-visual baseline", () => {
    for (const corpusCase of corpus) {
      // The no-visual baseline (fresh derivation, before any render).
      const baselineQuantities = canonicalJsonStringify(
        deriveStateQuantities(corpusCase.version, corpusCase.state.stateIndex),
      );
      const baselineValidation = canonicalJsonStringify(
        validateSolutionVersion({
          version: corpusCase.version,
          capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
          validatedAt: VALIDATED_AT,
          baselineGeometry: demoBaselineGeometryResolver(),
        }),
      );
      expect(baselineQuantities).toBe(corpusCase.canonicalQuantitiesBytes);
      expect(baselineValidation).toBe(corpusCase.canonicalValidationBytes);

      // Render through every provider...
      for (const provider of allLaneProviders()) {
        void renderThroughLane(provider, corpusCase.request);
      }

      // ...then re-derive through the engine's public surface: EXACT
      // equality, zero tolerance.
      const postQuantities = canonicalJsonStringify(
        deriveStateQuantities(corpusCase.version, corpusCase.state.stateIndex),
      );
      const postValidation = canonicalJsonStringify(
        validateSolutionVersion({
          version: corpusCase.version,
          capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
          validatedAt: VALIDATED_AT,
          baselineGeometry: demoBaselineGeometryResolver(),
        }),
      );
      expect(postQuantities).toBe(baselineQuantities);
      expect(postValidation).toBe(baselineValidation);
    }
  });

  test("the canonical PROJECTIONS are byte-identical after every render (the drawing source never moves)", () => {
    for (const corpusCase of corpus) {
      const planBefore = canonicalJsonStringify(corpusCase.request.canonicalProjections.plan);
      const axonometricBefore = canonicalJsonStringify(
        corpusCase.request.canonicalProjections.axonometric,
      );
      for (const provider of allLaneProviders()) {
        void renderThroughLane(provider, corpusCase.request);
        expect(canonicalJsonStringify(corpusCase.request.canonicalProjections.plan)).toBe(planBefore);
        expect(canonicalJsonStringify(corpusCase.request.canonicalProjections.axonometric)).toBe(
          axonometricBefore,
        );
      }
    }
  });
});

describe("the sabotage twin (the check has teeth)", () => {
  test("a rogue NUMERIC MUTATION through the governed lane is refused fail-closed and changes nothing", () => {
    for (const corpusCase of corpus) {
      if (corpusCase.request.canonicalProjections.plan.shapes.length === 0) {
        continue; // the empty edge case has nothing to mutate
      }
      const planBefore = canonicalJsonStringify(corpusCase.request.canonicalProjections.plan);
      const outcome = renderThroughLane(createRogueMutatingProvider(), corpusCase.request);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("threw");
      expect(canonicalJsonStringify(corpusCase.request.canonicalProjections.plan)).toBe(planBefore);
    }
  });

  test("a rogue NUMERIC MUTATION with the lane BYPASSED is DETECTED by the byte-comparison (the drill fails loudly)", () => {
    for (const corpusCase of corpus) {
      if (corpusCase.request.canonicalProjections.plan.shapes.length === 0) {
        continue; // the empty edge case has nothing to mutate
      }
      const planBefore = canonicalJsonStringify(corpusCase.request.canonicalProjections.plan);
      const working = structuredClone(corpusCase.request);
      createRogueMutatingProvider().renderVisual(working);
      const planAfter = canonicalJsonStringify(working.canonicalProjections.plan);
      // The mutation LANDED on the working copy — a drill comparing
      // before/after MUST record a divergence here (detection proof).
      expect(planAfter).not.toBe(planBefore);
      // ...and the caller's original request is still untouched.
      expect(canonicalJsonStringify(corpusCase.request.canonicalProjections.plan)).toBe(planBefore);
    }
  });

  test("a rogue provider returning a MISBOUND artifact cannot smuggle it through the lane", () => {
    const baselineCase = corpus.find((entry) => entry.caseId === "demo-world-baseline");
    const multiOpCase = corpus.find((entry) => entry.caseId === "demo-world-multi-operation");
    if (baselineCase === undefined || multiOpCase === undefined) {
      throw new Error("the corpus is missing a mandated case");
    }
    const legitimate = renderThroughLane(
      createReferenceVisualProvider(),
      multiOpCase.request,
    );
    expect(legitimate.ok).toBe(true);
    if (!legitimate.ok) return;
    const rogue: VisualRenderProvider = {
      descriptor: createReferenceVisualProvider().descriptor,
      renderVisual: () => ({ ok: true, artifact: legitimate.artifact }),
    };
    const outcome = renderThroughLane(rogue, baselineCase.request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("provenance-binding-mismatch");
  });
});
