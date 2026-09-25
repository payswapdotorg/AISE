/**
 * HFX-303 tests — the LANE ↔ VIEWER COMPATIBILITY proof (end-to-end).
 *
 * The strongest seam proof: a LIVE artifact produced by the visual
 * lane's governed entry (the real `@aise/visual-render` package, imported
 * relatively — the apps→packages boundary-legal convention of
 * apps/web/src/solution/service.ts) is attached to a `ViewerInput` and
 * rendered by the real viewer. This proves:
 *
 *  1. the wire mirror types are structurally satisfied by REAL package
 *     output (the mirror discipline is not aspirational);
 *  2. the generated pane renders the live artifact's SVG, labels and
 *     provenance;
 *  3. the canonical panes stay byte-identical with the live artifact
 *     attached (the non-interference law at the VIEWER seam);
 *  4. the live lane over the INTERVENTION family (the 026/027 scenario
 *     states) binds artifacts to the scenario's state revision;
 *  5. the corpus's documented mirrors (the demo scene + the overlay
 *     projection + the AISE-021 formulas) equal the SOLUTION WORKSPACE's
 *     own projection of the same engine version — the mirror stays
 *     honest, cross-checked against apps/web/src/solution's live code.
 */

import { describe, expect, test } from "bun:test";
import { renderInterventionViewer } from "../render";
import { stateAt } from "../sync";
import { projectPane } from "../projection";
import { DEFAULT_VIEW } from "../projection";
import { viewerInput, canonicalScenario, viewerGeometries } from "../fixtures";
import type { GeneratedVisualArtifact } from "./model";
import type {
  VisualArtifact,
  VisualStateRequest,
} from "../../../../../packages/visual-render/src/index";
import {
  createReferenceVisualProvider,
  createAlternateVisualProvider,
  createFailingVisualProvider,
  fallbackForMissingProvider,
  fallbackForProviderFailure,
  renderThroughLane,
} from "../../../../../packages/visual-render/src/index";
import { buildVisualCorpus, replayDemoWorld } from "../../../../../packages/visual-render/src/corpus";
// The solution workspace's own projection seam (apps→apps, legal) — the
// cross-check that keeps the package's documented mirrors honest.
import { demoObservedScene } from "../../solution/demo-world";
import { proposedOverlaysOf } from "../../solution/viewer/model";
import { projectPolygon } from "../../solution/viewer/projection";

function paneOf(html: string, paneId: string): string {
  const start = html.indexOf(`<section class="pane" id="${paneId}"`);
  if (start === -1) {
    throw new Error(`pane not found: ${paneId}`);
  }
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

/* ------------------------------------------------------------------ */
/* 1-4: the intervention family end-to-end                              */
/* ------------------------------------------------------------------ */

describe("the live lane over the intervention family (the viewer seam, end-to-end)", () => {
  function interventionRequest(stateIndex: number): VisualStateRequest {
    const scenario = canonicalScenario();
    const state = stateAt(scenario, stateIndex);
    const geometries = viewerGeometries();
    return {
      kind: "visual-state-request",
      visualClass: "elevation-hypothesis",
      state: {
        solutionId: scenario.scenarioId,
        versionRef: scenario.baselineVersionId,
        stateId: state.stateId,
        stateIndex: state.stateIndex,
        appliedOperationIds: [...state.appliedStepIds],
      },
      canonicalProjections: {
        // The port's snapshot carries the mode seal explicitly; the
        // viewer's PaneProjection provides the shapes + omissions.
        plan: { mode: "plan", ...projectPane(state, geometries, { mode: "plan" }) },
        axonometric: {
          mode: "axonometric",
          ...projectPane(state, geometries, { mode: "axonometric", view: DEFAULT_VIEW }),
        },
      },
    };
  }

  test("a LIVE reference artifact attaches to the viewer and renders in the generated pane", () => {
    const request = interventionRequest(2);
    const outcome = renderThroughLane(createReferenceVisualProvider(), request);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const artifact: VisualArtifact = outcome.artifact;

    // The wire mirror type is satisfied by the live artifact as-is.
    const wire: GeneratedVisualArtifact = artifact;
    void wire;

    const html = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisual: artifact }),
    );
    const pane = paneOf(html, "pane-generated");
    expect(pane).toContain("GENERATED — HYPOTHETICAL VISUAL, NOT ENGINEERING GEOMETRY");
    expect(pane).toContain(artifact.content.svg.trimEnd());
    for (const label of artifact.labels) {
      expect(pane).toContain(`data-region-id="${label.regionId}"`);
      expect(pane).toContain(label.label);
    }
    expect(pane).toContain(artifact.provenance.stateId);
    expect(pane).toContain(artifact.provenance.provider.providerId);
    expect(pane).toContain(artifact.provenance.provider.descriptorDigest);
  });

  test("the canonical panes are byte-identical with the LIVE artifact attached (viewer-seam non-interference)", () => {
    const request = interventionRequest(2);
    const outcome = renderThroughLane(createReferenceVisualProvider(), request);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const withoutVisual: string = renderInterventionViewer(viewerInput({ stateIndex: 2 }));
    const withVisual: string = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisual: outcome.artifact }),
    );
    for (const paneId of ["pane-3d", "pane-2d", "pane-boq"]) {
      expect(paneOf(withVisual, paneId)).toBe(paneOf(withoutVisual, paneId));
    }
    // And the canonical SVG content itself is untouched.
    expect(withVisual).toContain(paneOf(withoutVisual, "pane-3d"));
  });

  test("the alternate provider swaps in over the SAME state — different pane content, same canonical panes", () => {
    const request = interventionRequest(2);
    const reference = renderThroughLane(createReferenceVisualProvider(), request);
    const alternate = renderThroughLane(createAlternateVisualProvider(), request);
    expect(reference.ok).toBe(true);
    expect(alternate.ok).toBe(true);
    if (!reference.ok || !alternate.ok) return;
    expect(reference.artifact.artifactId).not.toBe(alternate.artifact.artifactId);

    const htmlReference = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisual: reference.artifact }),
    );
    const htmlAlternate = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisual: alternate.artifact }),
    );
    expect(paneOf(htmlReference, "pane-generated")).not.toBe(paneOf(htmlAlternate, "pane-generated"));
    for (const paneId of ["pane-3d", "pane-2d", "pane-boq"]) {
      expect(paneOf(htmlReference, paneId)).toBe(paneOf(htmlAlternate, paneId));
    }
  });

  test("the failing provider over the intervention family yields the live fallback record + the viewer notice", () => {
    const request = interventionRequest(2);
    const outcome = renderThroughLane(createFailingVisualProvider(), request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    const record = fallbackForProviderFailure(request, outcome.failure);
    const html = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisualFallback: record }),
    );
    const pane = paneOf(html, "pane-generated-fallback");
    expect(pane).toContain(outcome.failure.kind);
    expect(pane).toContain("the canonical deterministic views remain the engineering views");
    for (const paneId of ["pane-3d", "pane-2d", "pane-boq"]) {
      expect(html).toContain(`<section class="pane" id="${paneId}"`);
    }

    const missing = fallbackForMissingProvider(request);
    const htmlMissing = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisualFallback: missing }),
    );
    expect(paneOf(htmlMissing, "pane-generated-fallback")).toContain(
      "No visual-generation provider was available",
    );
  });
});

/* ------------------------------------------------------------------ */
/* 5: the corpus mirror cross-check (the package's projections equal     */
/*    the solution workspace's own projection of the same version)      */
/* ------------------------------------------------------------------ */

describe("the corpus's documented mirrors equal the solution workspace's live projection", () => {
  test("the package's canonical projections equal proposedOverlaysOf + projectPolygon over the same engine version", () => {
    const corpus = buildVisualCorpus();
    const multiOp = corpus.find((entry) => entry.caseId === "demo-world-multi-operation");
    const baseline = corpus.find((entry) => entry.caseId === "demo-world-baseline");
    if (multiOp === undefined || baseline === undefined) {
      throw new Error("the corpus is missing a mandated case");
    }
    const version = replayDemoWorld();
    const scene = demoObservedScene();
    const stateIndex = multiOp.request.state.stateIndex;

    // The apps-side projection: observed scene elements + proposed overlays.
    const overlays = proposedOverlaysOf(version, scene, stateIndex);
    const expected: {
      nodeId: string;
      points: readonly (readonly [number, number])[];
      origin: string;
    }[] = [];
    for (const element of scene.elements) {
      element.polygons.forEach((polygon, index) => {
        expected.push({
          nodeId: index === 0 ? element.elementId : `${element.elementId}#${String(index)}`,
          points: projectPolygon(polygon, { azimuthRad: Math.PI / 6, elevationRad: Math.PI / 5 }, "plan"),
          origin: "observed",
        });
      });
    }
    for (const overlay of overlays) {
      overlay.polygons.forEach((polygon, index) => {
        expected.push({
          nodeId:
            index === 0 ? overlay.operationId : `${overlay.operationId}#${String(index)}`,
          points: projectPolygon(polygon, { azimuthRad: Math.PI / 6, elevationRad: Math.PI / 5 }, "plan"),
          origin: `proposed-${overlay.direction}`,
        });
      });
    }

    const packageShapes = multiOp.request.canonicalProjections.plan.shapes;
    expect(packageShapes.length).toBe(expected.length);
    for (const [index, shape] of packageShapes.entries()) {
      const mirror = expected[index];
      if (mirror === undefined) throw new Error(`missing mirror shape at ${String(index)}`);
      expect(shape.nodeId).toBe(mirror.nodeId);
      expect(shape.origin).toBe(mirror.origin);
      expect(shape.points.length).toBe(mirror.points.length);
      for (const [pointIndex, point] of shape.points.entries()) {
        const mirrorPoint = mirror.points[pointIndex];
        if (mirrorPoint === undefined) {
          throw new Error(`missing mirror point at ${String(pointIndex)}`);
        }
        expect(point[0]).toBe(mirrorPoint[0]);
        expect(point[1]).toBe(mirrorPoint[1]);
      }
    }

    // The baseline case's overlays are empty (layer 0).
    expect(proposedOverlaysOf(version, scene, baseline.request.state.stateIndex)).toEqual([]);
  });
});
