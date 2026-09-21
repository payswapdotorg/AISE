/**
 * PROD-024 — the VIEWER tests: the documented projection (worked
 * examples, the AISE-021 discipline), the OBSERVED-vs-PROPOSED layered
 * SVG (structural separation + selection/isolation/highlight toggles +
 * byte-determinism) and the overlay projection from ENGINE-recorded
 * operations.
 */

import { describe, expect, test } from "bun:test";
import {
  OBSERVED_STROKE,
  PROPOSED_ADDED_STROKE,
  PROPOSED_REMOVED_STROKE,
  renderSceneSvg,
  sceneTextAlternative,
} from "./svg";
import { projectAxonometric, projectPlan } from "./projection";
import { overlayOfOperation, proposedOverlaysOf } from "./model";
import type { ObservedScene, SceneElement, ProposedOverlay } from "./model";
import type { EngineeringOperation } from "../../../../../packages/solution-contract/src/index";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const WALL: SceneElement = {
  elementId: "node-wall-002",
  label: "Damaged ground-floor wall faces",
  kind: "wall",
  selectorKind: "face-set",
  nodeRefs: ["node-wall-002"],
  geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
  polygons: [
    [
      [0, 0, 0],
      [5, 0, 0],
      [5, 0, 2.5],
      [0, 0, 2.5],
    ],
  ],
  anchor: {
    origin: [0, 0, 0],
    lengthAxis: [1, 0, 0],
    outAxis: [0, -1, 0],
    anchorLength: 5,
    anchorHeight: 2.5,
  },
  facts: [{ label: "Observed area (south face set)", value: "12.5 m2" }],
};

const SCENE: ObservedScene = {
  realityVersionId: "rgv-demo-0007",
  elements: [WALL],
};

function operationOf(input: {
  operationId: string;
  operationType: string;
  parameters: { name: string; value: number | string; unit?: string }[];
  direction: "added" | "removed";
  geometryRef?: string;
}): EngineeringOperation {
  return {
    contractVersion: "1.0.0",
    operationId: input.operationId,
    solutionId: "solution-demo-001",
    versionNumber: 1,
    operationIndex: 1,
    operationType: input.operationType,
    domain: { contractVersion: "1.0.0", vertical: "building", operationVocabulary: "v", extensions: [] },
    parameters: input.parameters as EngineeringOperation["parameters"],
    target: {
      contractVersion: "1.0.0",
      selectorKind: "face-set",
      nodeRefs: ["node-wall-002"],
      geometryRefs: [
        { kind: "polygon", ref: input.geometryRef ?? "geo-wall-faces-002" },
      ],
      units: { linear: "m", angular: "rad" },
      description: "the wall",
    },
    dependsOn: [],
    effects: [
      {
        contractVersion: "1.0.0",
        effectKind: "quantity-impact",
        affectedNodeRefs: ["node-wall-002"],
        geometryRefs: [],
        quantity: { dimension: "volume", value: 1, unit: "m3", calculationRef: "ref" },
        direction: input.direction,
      },
    ],
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "user-demo-engineer",
      authoredAt: "2026-09-16T09:00:00.000Z",
      evidenceIds: [],
      derivationNote: "test",
    },
  } as unknown as EngineeringOperation;
}

/* ------------------------------------------------------------------ */
/* The documented projection                                           */
/* ------------------------------------------------------------------ */

describe("PROD-024 projection (documented, hand-verifiable)", () => {
  test("az = π/2, el = 0 maps (x, y, z) → (x, −z) — a north elevation", () => {
    expect(projectAxonometric([1, 2, 3], { azimuthRad: Math.PI / 2, elevationRad: 0 })).toEqual([
      1, -3,
    ]);
  });

  test("az = 0, el = 0 maps (x, y, z) → (−y, −z) — an east elevation", () => {
    expect(projectAxonometric([1, 2, 3], { azimuthRad: 0, elevationRad: 0 })).toEqual([-2, -3]);
  });

  test("the plan view maps (x, y, z) → (x, −y), ignoring height", () => {
    expect(projectPlan([1, 2, 3])).toEqual([1, -2]);
  });

  test("quantization kills float dust (−0 canonicalized, 1 µm grid)", () => {
    const point = projectAxonometric([1e-9, -1e-9, 0], { azimuthRad: 0.3, elevationRad: 0.2 });
    expect(point[0]).toBe(0);
    expect(Object.is(point[0], 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The layered scene SVG                                               */
/* ------------------------------------------------------------------ */

describe("PROD-024 layered scene SVG (observed vs proposed)", () => {
  test("the two layers are structurally distinct groups with distinct epistemic seals", () => {
    const demolition = operationOf({
      operationId: "op-demolition",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      direction: "removed",
    });
    const overlay = overlayOfOperation(demolition, SCENE);
    if (overlay === undefined) throw new Error("overlay missing");
    const svg = renderSceneSvg(SCENE, [overlay], { azimuthRad: 0.5, elevationRad: 0.4 }, "axonometric");
    expect(svg).toContain('<g data-layer="observed" data-epistemic-class="OBSERVED">');
    expect(svg).toContain('<g data-layer="proposed" data-epistemic-class="PROPOSED">');
    expect(svg).toContain('data-element-id="node-wall-002" data-epistemic="OBSERVED"');
    expect(svg).toContain('data-operation-id="op-demolition" data-epistemic="PROPOSED"');
    expect(svg).toContain('data-direction="removed"');
    expect(svg).toContain(PROPOSED_REMOVED_STROKE);
    expect(svg).toContain(OBSERVED_STROKE);
    // the observed element precedes the proposed layer in document order
    expect(svg.indexOf('data-layer="observed"')).toBeLessThan(svg.indexOf('data-layer="proposed"'));
  });

  test("an ADDED operation renders with the added tone and dash", () => {
    const blockWall = operationOf({
      operationId: "op-blockwall",
      operationType: "block-wall-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "concrete-block" },
      ],
      direction: "added",
      geometryRef: "geo-wall-line-002-alt",
    });
    const overlay = overlayOfOperation(blockWall, SCENE);
    if (overlay === undefined) throw new Error("overlay missing");
    const svg = renderSceneSvg(SCENE, [overlay], { azimuthRad: 0.5, elevationRad: 0.4 }, "axonometric");
    expect(svg).toContain(PROPOSED_ADDED_STROKE);
    expect(svg).toContain('data-direction="added"');
  });

  test("identical input renders BYTE-IDENTICAL SVG (determinism)", () => {
    const demolition = operationOf({
      operationId: "op-demolition",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      direction: "removed",
    });
    const overlay = overlayOfOperation(demolition, SCENE) as ProposedOverlay;
    const view = { azimuthRad: 0.7, elevationRad: 0.3 };
    const one = renderSceneSvg(SCENE, [overlay], view, "axonometric");
    const two = renderSceneSvg(structuredClone(SCENE), [structuredClone(overlay)], { ...view }, "axonometric");
    expect(one).toBe(two);
  });

  test("selection and isolation toggle PRESENTATION attributes only", () => {
    const demolition = operationOf({
      operationId: "op-demolition",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      direction: "removed",
    });
    const overlay = overlayOfOperation(demolition, SCENE) as ProposedOverlay;
    const view = { azimuthRad: 0.2, elevationRad: 0.5 };
    const plain = renderSceneSvg(SCENE, [overlay], view, "axonometric");
    const selected = renderSceneSvg(SCENE, [overlay], view, "axonometric", {
      selectedElementId: "node-wall-002",
    });
    expect(selected).toContain('data-element-id="node-wall-002" data-epistemic="OBSERVED" data-selected="true"');
    expect(plain).not.toContain("data-selected");
    const isolated = renderSceneSvg(SCENE, [overlay], view, "axonometric", {
      selectedOperationId: "op-demolition",
      isolateOperationId: "op-demolition",
    });
    expect(isolated).toContain('data-selected="true"');
    // isolating the operation dims nothing else here (the only observed
    // element IS the operation's anchor) — the dimming join is structural.
    const boqHighlighted = renderSceneSvg(SCENE, [overlay], view, "axonometric", {
      highlightOperationIds: ["op-demolition"],
      highlightGeometryRefs: ["geo-wall-faces-002"],
    });
    expect(boqHighlighted).toContain('data-boq-highlight="true"');
  });

  test("the text alternative lists observed and proposed content with real-world labels", () => {
    const demolition = operationOf({
      operationId: "op-demolition",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      direction: "removed",
    });
    const overlay = overlayOfOperation(demolition, SCENE) as ProposedOverlay;
    const alternative = sceneTextAlternative(SCENE, [overlay]);
    expect(alternative).toContain("Observed building:");
    expect(alternative).toContain("Damaged ground-floor wall faces");
    expect(alternative).toContain("Removed section");
    expect(alternative).toContain("proposed, removed");
    expect(sceneTextAlternative(SCENE, [])).toContain(
      "no proposed work visible at this step",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Overlay projection from ENGINE-recorded operations                   */
/* ------------------------------------------------------------------ */

describe("PROD-024 overlay projection (engine-recorded operations)", () => {
  test("an excavation projects a sunk box whose depth follows the ENGINE unit resolution", () => {
    const excavation = operationOf({
      operationId: "op-excavation",
      operationType: "excavation",
      parameters: [
        { name: "depth", value: 1500, unit: "mm" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ],
      direction: "removed",
      geometryRef: "geo-pit-outline-001",
    });
    const overlay = overlayOfOperation(excavation, SCENE);
    if (overlay === undefined) throw new Error("overlay missing");
    expect(overlay.direction).toBe("removed");
    // top quad at z = 0 and bottom quad at z = −1.5 m (1500 mm → 1.5 m)
    expect(overlay.polygons).toHaveLength(2);
    const bottom = overlay.polygons[1]!;
    for (const point of bottom) {
      expect(point[2]).toBe(-1.5);
    }
  });

  test("proposedOverlaysOf returns ONLY the operations applied at the viewed layer", () => {
    const demolition = operationOf({
      operationId: "op-demolition",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      direction: "removed",
    });
    const version = {
      contractVersion: "1.0.0",
      solutionId: "solution-demo-001",
      versionNumber: 1,
      status: "draft" as const,
      operations: [demolition],
      states: [
        {
          contractVersion: "1.0.0",
          stateId: "a".repeat(64),
          solutionId: "solution-demo-001",
          versionNumber: 1,
          stateIndex: 0,
          baselineRealityVersionId: "rgv-demo-0007",
          epistemicStatus: "PROPOSED" as const,
          appliedOperationIds: [],
          materializedAt: "2026-09-16T10:00:00.000Z",
        },
        {
          contractVersion: "1.0.0",
          stateId: "b".repeat(64),
          solutionId: "solution-demo-001",
          versionNumber: 1,
          stateIndex: 1,
          baselineRealityVersionId: "rgv-demo-0007",
          epistemicStatus: "PROPOSED" as const,
          appliedOperationIds: ["op-demolition"],
          materializedAt: "2026-09-16T10:01:00.000Z",
        },
      ],
      createdAt: "2026-09-16T08:00:00.000Z",
    };
    expect(proposedOverlaysOf(version, SCENE, 0)).toHaveLength(0);
    const atLayerOne = proposedOverlaysOf(version, SCENE, 1);
    expect(atLayerOne).toHaveLength(1);
    expect(atLayerOne[0]?.operationId).toBe("op-demolition");
    expect(atLayerOne[0]?.visibleFromStateIndex).toBe(1);
  });

  test("an operation whose parameters cannot be resolved answers NO overlay (never invented geometry)", () => {
    const broken = operationOf({
      operationId: "op-broken",
      operationType: "excavation",
      parameters: [{ name: "depth", value: -0, unit: "m" }],
      direction: "removed",
      geometryRef: "geo-pit-outline-001",
    });
    expect(overlayOfOperation(broken, SCENE)).toBeUndefined();
  });
});
