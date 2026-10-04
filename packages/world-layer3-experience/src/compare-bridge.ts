/**
 * WORLD-P3 — the P1 DEVIATION-VOCABULARY BRIDGE (`src/compare-bridge.ts`).
 *
 * The thin composition layer through which the Layer-3 what-if
 * comparison re-uses the Layer-1 COMPARE transform VERBATIM: same
 * centroid-proxy deviation kernel, same tolerance-declared gates, same
 * closed classification vocabulary (`DIFFERENCE_CLASSIFICATIONS`).
 * This lane COMPOSES the P1 lane — it never re-implements a comparison
 * semantic (the substitution contract's law 1: composition, not
 * semantics change).
 *
 * The mapping (the honest one, stated once): a what-if alternative
 * plays the MODEL side (the proposed state), the baseline plays the
 * CAPTURE side (the state the world is at) — exactly the P1 lane's
 * model-vs-capture semantics re-targeted at proposal-vs-baseline. The
 * P1 gates (tolerance declared, near-boundary band declared, units
 * declared, finite shapes, no double pairing) apply verbatim: the P3
 * what-if law 5 IS the P1 compare law.
 */

import {
  compareModelToCapture,
  type AlignedPair,
  type ComparableShape,
  type ComparisonRequest,
  type DifferenceClassification,
} from "@aise/world-layer1-experience";
import type { GeometryToleranceDeclaration, GeometryUnitDeclaration } from "@aise/world-understanding-substrate";
import type { SceneElementId } from "@aise/world-reality-substrate";
import { laneRefused, type LaneOutcome, type Layer3Family } from "./seam";

const FAMILY: Layer3Family = "quantify";

/** One declared what-if diff pair (baseline vs alternative shape). */
export interface WorldDiffPair {
  readonly baselineElementId: SceneElementId;
  readonly alternativeElementId: SceneElementId;
  readonly baselineShape: ComparableShape;
  readonly alternativeShape: ComparableShape;
}

/** One classified diff (the P1 vocabulary + deviation evidence). */
export interface WorldDiffClassification {
  readonly baselineElementId: SceneElementId;
  readonly alternativeElementId: SceneElementId;
  readonly classification: DifferenceClassification;
  readonly deviationMetres: number;
  readonly withinTolerance: boolean;
  readonly nearBoundary: boolean;
}

/**
 * Classify a set of baseline-vs-alternative shape pairs through the P1
 * COMPARE transform (composed verbatim): builds the `ComparisonRequest`
 * (model side = alternative, capture side = baseline), runs
 * `compareModelToCapture`, and surfaces the per-pair classifications.
 * PURE.
 */
export function classifyWorldDiffs(input: {
  readonly worldRevision: number;
  readonly pairs: readonly WorldDiffPair[];
  readonly tolerance: GeometryToleranceDeclaration;
  readonly nearBoundaryBand: number;
  readonly units: GeometryUnitDeclaration;
  readonly declaredAt: string;
}): LaneOutcome<readonly WorldDiffClassification[]> {
  if (input.pairs.length === 0) {
    return laneRefused<readonly WorldDiffClassification[]>(
      FAMILY,
      "contract-mismatch",
      "a world diff classification needs at least one pair",
    );
  }
  const pairs: AlignedPair[] = input.pairs.map((pair) => ({
    modelElementId: pair.alternativeElementId,
    captureElementId: pair.baselineElementId,
    modelShape: pair.alternativeShape,
    captureShape: pair.baselineShape,
  }));
  const request: ComparisonRequest = {
    worldRevision: input.worldRevision,
    pairs,
    unpairedModelElementIds: [],
    unpairedCaptureElementIds: [],
    tolerance: input.tolerance,
    nearBoundaryBand: input.nearBoundaryBand,
    units: input.units,
    declaredAt: input.declaredAt,
  };
  const report = compareModelToCapture(request);
  if (!report.ok) {
    // The P1 refusal translates into this lane's typed failure shape
    // (kind + honest detail preserved verbatim — no semantics change).
    return laneRefused<readonly WorldDiffClassification[]>(
      FAMILY,
      report.failure.kind,
      `the P1 compare transform refused the what-if diff: ${report.failure.detail}`,
    );
  }
  const classifications: WorldDiffClassification[] = report.value.verdicts.map(
    (verdict) => ({
      baselineElementId: verdict.captureElementId,
      alternativeElementId: verdict.modelElementId,
      classification: verdict.classification,
      deviationMetres: verdict.deviationMetres,
      withinTolerance: verdict.withinTolerance,
      nearBoundary: verdict.nearBoundary,
    }),
  );
  return { ok: true, value: classifications };
}

/** Re-export the P1 closed classification vocabulary (composed surface). */
export { DIFFERENCE_CLASSIFICATIONS } from "@aise/world-layer1-experience";
export type { DifferenceClassification } from "@aise/world-layer1-experience";
