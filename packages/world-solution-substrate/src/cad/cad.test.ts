/**
 * WORLD-P0-C tests — the PARAMETRIC CAD family: the engine-neutral
 * FreeCAD-reference contract, its deterministic rebuild semantics, the
 * FreeCAD-external-label identity law, the exact-geometry DELEGATION to
 * the P0-B vocabulary (tolerance-DECLARED), and the glTF/IFC exports
 * through the sibling delivery/interpretation vocabularies — including
 * the real cross-family ROUND-TRIPS (CAD glTF export → the P0-A
 * delivery port's real parser; CAD IFC export → the P0-B IFC
 * interpretation port's real STEP scanner).
 */

import { describe, expect, test } from "bun:test";
import { InMemoryGltfDeliveryDouble } from "@aise/world-reality-substrate";
import {
  computeThroughGeometryPort,
  referenceGeometryDouble,
  validateGeometryComputationRequest,
  type GeometryComputationRequest,
} from "@aise/world-understanding-substrate";
import {
  interpretThroughIfcPort,
  referenceIfcDouble,
  type IfcInterpretationRequest,
} from "@aise/world-understanding-substrate";
import {
  AlternateCadDouble,
  ReferenceCadDouble,
  derivedShapeTableOf,
} from "./doubles";
import {
  CAD_REFERENCE_IMPLEMENTATION_NOTE,
  assembleGeometryRequest,
  freecadObjectNameOf,
  type CadCreateModelRequest,
  type CadFeatureDefinition,
  type CadGeometryEvaluationSpec,
  type CadModelHandle,
  type CadModelMutation,
  type CadSketchDefinition,
  type ParametricCadAdapter,
} from "./contract";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const SUBJECT_REF = "a".repeat(64);
const EVIDENCE_ID = "b".repeat(64);
const RECORDED_AT = "2026-10-02T00:00:00.000Z";

function createRequest(): CadCreateModelRequest {
  return {
    kind: "parametric-cad-model",
    schemaVersion: "parametric-cad/1",
    modelId: "model-lintel-001",
    label: "Lintel replacement parametric model",
    units: { linear: "m", angular: "rad" },
    documentLabel: { namespace: "freecad-document", value: "LintelDoc" },
  };
}

/** A rectangle sketch on the XY plane at the origin (4 exact segments). */
function rectangleSketch(): CadSketchDefinition {
  return {
    sketchId: "sketch-lintel-profile",
    plane: { origin: { x: 0, y: 0, z: 0 }, normal: [0, 0, 1] },
    elements: [
      { kind: "line-segment", elementId: "seg-bottom", from: { u: 0, v: 0 }, to: { u: 5, v: 0 } },
      { kind: "line-segment", elementId: "seg-right", from: { u: 5, v: 0 }, to: { u: 5, v: 1 } },
      { kind: "line-segment", elementId: "seg-top", from: { u: 5, v: 1 }, to: { u: 0, v: 1 } },
      { kind: "line-segment", elementId: "seg-left", from: { u: 0, v: 1 }, to: { u: 0, v: 0 } },
    ],
    constraints: [
      { kind: "horizontal", elementId: "seg-bottom" },
      { kind: "vertical", elementId: "seg-right" },
      { kind: "parallel", firstElementId: "seg-bottom", secondElementId: "seg-top" },
      { kind: "distance", firstElementId: "seg-bottom", value: 5, unit: "m" },
      { kind: "radius", elementId: "seg-left", value: 0.5, unit: "m" },
    ],
  };
}

const PAD_FEATURE: CadFeatureDefinition = {
  featureId: "feature-pad-001",
  featureKind: "pad",
  fromSketchId: "sketch-lintel-profile",
  parentFeatureId: null,
  parameters: [
    { name: "length", value: 3, unit: "m" },
    { name: "material", value: "steel-S235", unit: null },
  ],
};

const FILLET_FEATURE: CadFeatureDefinition = {
  featureId: "feature-fillet-001",
  featureKind: "fillet",
  fromSketchId: null,
  parentFeatureId: "feature-pad-001",
  parameters: [{ name: "radius", value: 0.02, unit: "m" }],
};

function buildModel(adapter: ParametricCadAdapter): CadModelHandle {
  const created = adapter.createModel(createRequest());
  if (!created.ok) {
    throw new Error("fixture model creation failed");
  }
  const mutations: CadModelMutation[] = [
    { mutation: "add-sketch", sketch: rectangleSketch() },
    { mutation: "add-feature", feature: PAD_FEATURE },
    { mutation: "add-feature", feature: FILLET_FEATURE },
    { mutation: "set-parameter", featureId: "feature-pad-001", parameterName: "length", value: 4, unit: "m" },
  ];
  for (const mutation of mutations) {
    const applied = adapter.applyMutation(created.value, mutation);
    if (!applied.ok) {
      throw new Error(`fixture mutation failed: ${applied.failure.detail}`);
    }
  }
  return { ...created.value, revision: 4 };
}

function evaluationSpec(): CadGeometryEvaluationSpec {
  return {
    subjectRef: SUBJECT_REF,
    evidenceContentId: EVIDENCE_ID,
    recordedAt: RECORDED_AT,
    tolerance: { linear: 0.001, angular: 0.0001 },
    units: { linear: "m", angular: "rad" },
    // derived shape table order: 4 sketch segments (indices 0..3) then
    // feature boxes (4 = pad, 5 = fillet)
    operations: [
      { operation: "segment-length", segment: 0 },
      { operation: "box-volume", box: 4 },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Model lifecycle + the FreeCAD external-label identity law            */
/* ------------------------------------------------------------------ */

describe("cad — model creation and the identity law", () => {
  test("createModel issues a revision-0 handle with the AISE model id", () => {
    const adapter = new ReferenceCadDouble();
    const outcome = adapter.createModel(createRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.handleKind).toBe("cad-model");
    expect(outcome.value.modelId).toBe("model-lintel-001");
    expect(outcome.value.revision).toBe(0);
  });

  test("createModel refuses malformed requests with the field named", () => {
    const adapter = new ReferenceCadDouble();
    const emptyId = adapter.createModel({ ...createRequest(), modelId: "" });
    expect(emptyId.ok).toBe(false);
    if (emptyId.ok) return;
    expect(emptyId.failure.kind).toBe("contract-mismatch");
    expect(emptyId.failure.detail).toContain("modelId must be non-empty");

    const wrongNamespace = adapter.createModel({
      ...createRequest(),
      documentLabel: { namespace: "freecad-object", value: "LintelDoc" },
    });
    expect(wrongNamespace.ok).toBe(false);
    if (wrongNamespace.ok) return;
    expect(wrongNamespace.failure.detail).toContain("freecad-document");

    const badName = adapter.createModel({
      ...createRequest(),
      documentLabel: { namespace: "freecad-document", value: "/usr/bin/doc" },
    });
    expect(badName.ok).toBe(false);
    if (badName.ok) return;
    expect(badName.failure.detail).toContain("not FreeCAD-name shaped");
  });

  test("duplicate model ids are refused", () => {
    const adapter = new ReferenceCadDouble();
    expect(adapter.createModel(createRequest()).ok).toBe(true);
    const second = adapter.createModel(createRequest());
    expect(second.ok).toBe(false);
  });

  test("the freecad object-name projection is documented and deterministic", () => {
    expect(freecadObjectNameOf("Sketch", "sketch-lintel-profile")).toBe("Sketch_sketch_lintel_profile");
    expect(freecadObjectNameOf("Pad", "feature-pad-001")).toBe("Pad_feature_pad_001");
    // the SAME projection on both doubles (reproducible external labels)
    expect(freecadObjectNameOf("Fillet", "feature-fillet-001")).toBe("Fillet_feature_fillet_001");
  });
});

/* ------------------------------------------------------------------ */
/* Mutations: sketch/feature semantics + fail-closed discipline         */
/* ------------------------------------------------------------------ */

describe("cad — typed mutations", () => {
  test("add-sketch appends and reports the freecad-object label", () => {
    const adapter = new ReferenceCadDouble();
    const created = adapter.createModel(createRequest());
    if (!created.ok) throw new Error("setup failed");
    const applied = adapter.applyMutation(created.value, {
      mutation: "add-sketch",
      sketch: rectangleSketch(),
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.revision).toBe(1);
    expect(applied.value.objectLabels).toEqual([
      { namespace: "freecad-object", value: "Sketch_sketch_lintel_profile" },
    ]);
    expect(applied.value.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("add-sketch refuses degenerate geometry, unknown constraint refs and missing units", () => {
    const adapter = new ReferenceCadDouble();
    const created = adapter.createModel(createRequest());
    if (!created.ok) throw new Error("setup failed");

    const degenerate = adapter.applyMutation(created.value, {
      mutation: "add-sketch",
      sketch: {
        ...rectangleSketch(),
        elements: [
          { kind: "line-segment", elementId: "seg-zero", from: { u: 1, v: 1 }, to: { u: 1, v: 1 } },
        ],
      },
    });
    expect(degenerate.ok).toBe(false);
    if (!degenerate.ok) {
      expect(degenerate.failure.detail).toContain("degenerate line-segment");
    }

    const unknownRef = adapter.applyMutation(created.value, {
      mutation: "add-sketch",
      sketch: {
        ...rectangleSketch(),
        constraints: [{ kind: "horizontal", elementId: "seg-missing" }],
      },
    });
    expect(unknownRef.ok).toBe(false);
    if (!unknownRef.ok) {
      expect(unknownRef.failure.detail).toContain("seg-missing");
    }

    const missingUnit = adapter.applyMutation(created.value, {
      mutation: "add-sketch",
      sketch: {
        ...rectangleSketch(),
        constraints: [{ kind: "distance", firstElementId: "seg-bottom", value: 5, unit: "" }],
      },
    });
    expect(missingUnit.ok).toBe(false);
    if (!missingUnit.ok) {
      expect(missingUnit.failure.detail).toContain("requires a declared unit");
    }

    const badRadius = adapter.applyMutation(created.value, {
      mutation: "add-sketch",
      sketch: {
        ...rectangleSketch(),
        elements: [{ kind: "circle", elementId: "circ-zero", center: { u: 0, v: 0 }, radius: 0 }],
      },
    });
    expect(badRadius.ok).toBe(false);
  });

  test("add-feature refuses law violations with the feature named", () => {
    const adapter = new ReferenceCadDouble();
    const created = adapter.createModel(createRequest());
    if (!created.ok) throw new Error("setup failed");
    const sketched = adapter.applyMutation(created.value, {
      mutation: "add-sketch",
      sketch: rectangleSketch(),
    });
    if (!sketched.ok) throw new Error("setup failed");

    const noSketch = adapter.applyMutation(created.value, {
      mutation: "add-feature",
      feature: { ...PAD_FEATURE, fromSketchId: null },
    });
    expect(noSketch.ok).toBe(false);
    if (!noSketch.ok) {
      expect(noSketch.failure.detail).toContain("pad requires a source sketch");
    }

    const unknownSketch = adapter.applyMutation(created.value, {
      mutation: "add-feature",
      feature: { ...PAD_FEATURE, fromSketchId: "sketch-missing" },
    });
    expect(unknownSketch.ok).toBe(false);

    const noParentFillet = adapter.applyMutation(created.value, {
      mutation: "add-feature",
      feature: { ...FILLET_FEATURE, parentFeatureId: null },
    });
    expect(noParentFillet.ok).toBe(false);
    if (!noParentFillet.ok) {
      expect(noParentFillet.ok === false && noParentFillet.failure.detail).toContain("fillet requires a parent feature");
    }

    const numericWithoutUnit = adapter.applyMutation(created.value, {
      mutation: "add-feature",
      feature: { ...PAD_FEATURE, parameters: [{ name: "length", value: 3, unit: null }] },
    });
    expect(numericWithoutUnit.ok).toBe(false);
    if (!numericWithoutUnit.ok) {
      expect(numericWithoutUnit.ok === false && numericWithoutUnit.failure.detail).toContain(
        "numeric parameter length requires a declared unit",
      );
    }
  });

  test("set-parameter applies and queries reflect the override", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const query = adapter.queryModel(handle);
    expect(query.ok).toBe(true);
    if (!query.ok) return;
    const lengthBinding = query.value.parameters.find(
      (p) => p.featureId === "feature-pad-001" && p.parameterName === "length",
    );
    expect(lengthBinding?.value).toBe(4);
    expect(lengthBinding?.unit).toBe("m");
    // the non-numeric parameter carries NO unit
    const materialBinding = query.value.parameters.find(
      (p) => p.featureId === "feature-pad-001" && p.parameterName === "material",
    );
    expect(materialBinding?.unit).toBeNull();
  });

  test("set-parameter refuses unknown features/parameters and missing units", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const unknownFeature = adapter.applyMutation(handle, {
      mutation: "set-parameter",
      featureId: "feature-missing",
      parameterName: "length",
      value: 5,
      unit: "m",
    });
    expect(unknownFeature.ok).toBe(false);

    const unknownParameter = adapter.applyMutation(handle, {
      mutation: "set-parameter",
      featureId: "feature-pad-001",
      parameterName: "depth",
      value: 5,
      unit: "m",
    });
    expect(unknownParameter.ok).toBe(false);

    const missingUnit = adapter.applyMutation(handle, {
      mutation: "set-parameter",
      featureId: "feature-pad-001",
      parameterName: "length",
      value: 5,
      unit: null,
    });
    expect(missingUnit.ok).toBe(false);
    if (!missingUnit.ok) {
      expect(missingUnit.failure.detail).toContain("requires a declared unit");
    }
  });

  test("queryModel carries the document label as external label and never as identity", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const query = adapter.queryModel(handle);
    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query.value.documentLabel).toEqual({
      namespace: "freecad-document",
      value: "LintelDoc",
    });
    expect(query.value.modelId).toBe("model-lintel-001");
    // every object label is a freecad-object external label
    for (const label of query.value.objectLabels) {
      expect(label.namespace).toBe("freecad-object");
    }
    // and no object label value equals an AISE-side id
    for (const label of query.value.objectLabels) {
      expect(label.value).not.toBe(query.value.modelId);
      expect(label.value).not.toBe("feature-pad-001");
      expect(label.value).not.toBe("sketch-lintel-profile");
    }
  });

  test("dispose kills the handle (fail-closed afterwards)", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    expect(adapter.dispose(handle).ok).toBe(true);
    const query = adapter.queryModel(handle);
    expect(query.ok).toBe(false);
    if (query.ok) return;
    expect(query.failure.detail).toContain("unknown or disposed model handle");
  });
});

/* ------------------------------------------------------------------ */
/* Deterministic rebuild (law 2) + substitution equivalence (law 1)     */
/* ------------------------------------------------------------------ */

describe("cad — deterministic rebuild + substitution", () => {
  test("the same mutation sequence yields byte-identical digests on BOTH doubles", () => {
    const reference = new ReferenceCadDouble();
    const alternate = new AlternateCadDouble();
    const digests: string[][] = [[], []];
    for (const [index, adapter] of [reference, alternate].entries()) {
      const created = adapter.createModel(createRequest());
      if (!created.ok) throw new Error("setup failed");
      const mutations: CadModelMutation[] = [
        { mutation: "add-sketch", sketch: rectangleSketch() },
        { mutation: "add-feature", feature: PAD_FEATURE },
        { mutation: "add-feature", feature: FILLET_FEATURE },
        { mutation: "set-parameter", featureId: "feature-pad-001", parameterName: "length", value: 4, unit: "m" },
      ];
      for (const mutation of mutations) {
        const applied = adapter.applyMutation(created.value, mutation);
        if (!applied.ok) throw new Error(`mutation failed: ${applied.failure.detail}`);
        digests[index]!.push(applied.value.contentDigest);
      }
    }
    expect(digests[0]).toEqual(digests[1]);
  });

  test("fresh instances reproduce the same digests (content = f(mutation history))", () => {
    const run = (): string[] => {
      const adapter = new ReferenceCadDouble();
      const created = adapter.createModel(createRequest());
      if (!created.ok) throw new Error("setup failed");
      const out: string[] = [];
      for (const mutation of [
        { mutation: "add-sketch", sketch: rectangleSketch() },
        { mutation: "add-feature", feature: PAD_FEATURE },
      ] as CadModelMutation[]) {
        const applied = adapter.applyMutation(created.value, mutation);
        if (!applied.ok) throw new Error("mutation failed");
        out.push(applied.value.contentDigest);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  test("query results are identical across the doubles (the journaled rebuild agrees)", () => {
    const a = new ReferenceCadDouble();
    const b = new AlternateCadDouble();
    const handleA = buildModel(a);
    const handleB = buildModel(b);
    const qa = a.queryModel(handleA);
    const qb = b.queryModel(handleB);
    expect(qa.ok).toBe(true);
    expect(qb.ok).toBe(true);
    if (!qa.ok || !qb.ok) return;
    expect(qa.value.contentDigest).toBe(qb.value.contentDigest);
    expect(qa.value.objectLabels).toEqual(qb.value.objectLabels);
    expect(qa.value.parameters).toEqual(qb.value.parameters);
    expect(qa.value.sketches).toEqual(qb.value.sketches);
    expect(qa.value.features).toEqual(qb.value.features);
  });

  test("the reference-implementation note records the FreeCAD direction honestly", () => {
    expect(CAD_REFERENCE_IMPLEMENTATION_NOTE).toContain("FreeCAD");
    expect(CAD_REFERENCE_IMPLEMENTATION_NOTE).toContain("never canonical AISE identity");
  });
});

/* ------------------------------------------------------------------ */
/* The derived-geometry projection + the P0-B delegation (law 4)        */
/* ------------------------------------------------------------------ */

describe("cad — derived geometry + exact-geometry delegation", () => {
  test("the derived shape table projects sketches and features deterministically", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const query = adapter.queryModel(handle);
    if (!query.ok) throw new Error("query failed");
    const shapes = derivedShapeTableOf(
      query.value.sketches,
      query.value.features,
      new Map(),
    );
    // 4 sketch segments then 2 feature boxes
    expect(shapes.map((s) => s.kind)).toEqual([
      "segment", "segment", "segment", "segment", "box", "box",
    ]);
    // the bottom segment projects exactly onto the XY plane at the origin
    expect(shapes[0]).toEqual({
      kind: "segment",
      name: "SketchLine_seg_bottom",
      a: { x: 0, y: 0, z: 0 },
      b: { x: 5, y: 0, z: 0 },
    });
  });

  test("exactGeometryRequest emits a VALID P0-B request with the tolerance carried VERBATIM", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const outcome = adapter.exactGeometryRequest(handle, evaluationSpec());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const request: GeometryComputationRequest = outcome.value;
    // the P0-B validator accepts it (the delegation is well-formed)
    const validation = validateGeometryComputationRequest(request);
    expect(validation.ok).toBe(true);
    // the DECLARED tolerance is carried byte-identically
    expect(request.tolerance).toEqual({ linear: 0.001, angular: 0.0001 });
    expect(request.subjectRef).toBe(SUBJECT_REF);
    expect(request.evidenceContentId).toBe(EVIDENCE_ID);
    expect(request.recordedAt).toBe(RECORDED_AT);
    expect(request.operations).toEqual(evaluationSpec().operations);
    expect(request.shapes.length).toBe(6);
  });

  test("the emitted request computes through the P0-B exact-geometry port (the delegation proof)", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const outcome = adapter.exactGeometryRequest(handle, evaluationSpec());
    if (!outcome.ok) throw new Error("emission failed");
    const computed = computeThroughGeometryPort(referenceGeometryDouble, outcome.value);
    expect(computed.ok).toBe(true);
    if (!computed.ok) return;
    // segment-length of the 5 m bottom segment; box-volume of the pad box
    // (uv bounds 0..5 × 0..1 extruded 4 m along +Z → 5 × 1 × 4 = 20 m3)
    const length = computed.value.measurements.find((m) => m.operation === "segment-length");
    const volume = computed.value.measurements.find((m) => m.operation === "box-volume");
    expect(length?.value).toBe(5);
    expect(volume?.value).toBe(20);
    // the applied tolerance is the request's declaration, verbatim
    expect(computed.value.appliedTolerance).toEqual({ linear: 0.001, angular: 0.0001 });
  });

  test("the delegation is refused for operand violations (out-of-range and kind mismatch)", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const outOfRange = adapter.exactGeometryRequest(handle, {
      ...evaluationSpec(),
      operations: [{ operation: "box-volume", box: 99 }],
    });
    expect(outOfRange.ok).toBe(false);
    if (outOfRange.ok) return;
    expect(outOfRange.failure.kind).toBe("contract-mismatch");
    expect(outOfRange.failure.detail).toContain("outside the derived shape table");

    const kindMismatch = adapter.exactGeometryRequest(handle, {
      ...evaluationSpec(),
      operations: [{ operation: "polygon-area", polygon: 0 }],
    });
    expect(kindMismatch.ok).toBe(false);
    if (kindMismatch.ok) return;
    expect(kindMismatch.failure.detail).toContain("needs a polygon shape");
  });

  test("a non-positive declared tolerance is refused (tolerances are declared, never implicit)", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const outcome = adapter.exactGeometryRequest(handle, {
      ...evaluationSpec(),
      tolerance: { linear: 0, angular: 0.0001 },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("strictly positive");
  });

  test("assembleGeometryRequest surfaces the P0-B validator's own refusals verbatim", () => {
    // valid operands, INVALID subjectRef: the pre-validation passes and the
    // P0-B validator's own refusal surfaces verbatim
    const refusal = assembleGeometryRequest(
      {
        ...evaluationSpec(),
        subjectRef: "not-a-digest",
        operations: [{ operation: "segment-length", segment: 0 }],
      },
      derivedShapeTableOf([rectangleSketch()], [PAD_FEATURE], new Map()),
    );
    expect(refusal !== null && !refusal.ok).toBe(true);
    if (refusal === null || refusal.ok) return;
    expect(refusal.failure.kind).toBe("contract-mismatch");
    expect(refusal.failure.detail).toContain("P0-B exact-geometry validator refused");
    expect(refusal.failure.detail).toContain("subjectRef");
  });
});

/* ------------------------------------------------------------------ */
/* Exports through the sibling vocabularies (law 5) + round-trips       */
/* ------------------------------------------------------------------ */

describe("cad — glTF export through the P0-A delivery vocabulary", () => {
  test("the export delivers cleanly through the P0-A real parser", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const exported = adapter.exportGltf(handle, {
      model: handle,
      assetId: "asset-cad-lintel",
      format: "gltf-json",
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.source.assetId).toBe("asset-cad-lintel");
    expect(exported.value.source.format).toBe("gltf-json");
    // part labels are gltf-part external labels, one per feature
    expect(exported.value.partLabels).toEqual([
      { namespace: "gltf-part", value: "mesh:0" },
      { namespace: "gltf-part", value: "mesh:1" },
    ]);
    // REAL round-trip: the P0-A delivery port validates the bytes
    const delivery = new InMemoryGltfDeliveryDouble();
    const delivered = delivery.deliver(exported.value.source);
    expect(delivered.ok).toBe(true);
    if (delivered.ok) {
      expect(delivered.value.partIds).toContain("mesh:0");
      expect(delivered.value.partIds).toContain("mesh:1");
    }
  });

  test("both doubles emit byte-identical glTF documents", () => {
    const a = new ReferenceCadDouble();
    const b = new AlternateCadDouble();
    const handleA = buildModel(a);
    const handleB = buildModel(b);
    const exportA = a.exportGltf(handleA, { model: handleA, assetId: "asset-x", format: "gltf-json" });
    const exportB = b.exportGltf(handleB, { model: handleB, assetId: "asset-x", format: "gltf-json" });
    if (!exportA.ok || !exportB.ok) throw new Error("export failed");
    expect(new TextDecoder().decode(exportA.value.source.bytes)).toBe(
      new TextDecoder().decode(exportB.value.source.bytes),
    );
  });

  test("GLB emission is honestly refused (the in-memory double's declared limit)", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const outcome = adapter.exportGltf(handle, {
      model: handle,
      assetId: "asset-cad-lintel",
      format: "glb",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("gltf-json only");
  });
});

describe("cad — IFC export through the P0-B interpretation vocabulary", () => {
  test("the export emits IFC4 STEP text with the declared media type", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const exported = adapter.exportIfc(handle, {
      model: handle,
      projectName: "Demo Project",
      siteName: "Site Alpha",
      buildingName: "Building A",
      storeyName: "Ground Floor",
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.mediaType).toBe("application/ifc");
    expect(exported.value.stepText.startsWith("ISO-10303-21;")).toBe(true);
    expect(exported.value.stepText).toContain("FILE_SCHEMA(('IFC4'))");
    expect(exported.value.entityCount).toBeGreaterThan(0);
  });

  test("REAL round-trip: the P0-B IFC interpretation port reads the export", () => {
    const adapter = new ReferenceCadDouble();
    const handle = buildModel(adapter);
    const exported = adapter.exportIfc(handle, {
      model: handle,
      projectName: "Demo Project",
      siteName: "Site Alpha",
      buildingName: "Building A",
      storeyName: "Ground Floor",
    });
    if (!exported.ok) throw new Error("export failed");
    const request: IfcInterpretationRequest = {
      kind: "ifc-interpretation-request",
      schemaVersion: "ifc-interpretation-request/1",
      model: {
        stepText: exported.value.stepText,
        mediaType: "application/ifc",
        fileName: "aise-cad-export.ifc",
      },
      schemaIntent: "IFC4",
      intents: {
        spatialContainment: true,
        elementProperties: true,
        quantities: true,
        relationships: true,
        classification: false,
      },
      evidenceContentId: EVIDENCE_ID,
      modelUnits: { linear: "m", angular: "rad" },
      recordedAt: RECORDED_AT,
    };
    const interpreted = interpretThroughIfcPort(referenceIfcDouble, request);
    expect(interpreted.ok).toBe(true);
    if (!interpreted.ok) return;
    const result = interpreted.value;
    // the spatial tree is the full 4-level chain
    const roles = result.spatialNodes.map((n) => n.role);
    expect(roles).toContain("project");
    expect(roles).toContain("site");
    expect(roles).toContain("building");
    expect(roles).toContain("storey");
    // the pad feature exported as an IFCWALL element with its AISE id as name
    const wall = result.elements.find((e) => e.name === "feature-pad-001");
    expect(wall?.ifcClass).toBe("IFCWALL");
    // the base quantities round-trip (5 m × 1 m footprint × 4 m extrusion)
    const quantitySet = result.quantitySets.find((q) => q.name === "Qto_WallBaseQuantities");
    expect(quantitySet).toBeDefined();
    const netVolume = quantitySet?.quantities.find((q) => q.name === "NetVolume");
    expect(netVolume?.value).toBe(20);
    // the containment chain carries the elements in the storey
    const containment = result.relationships.find((r) => r.kind === "containment");
    expect(containment).toBeDefined();
    expect(containment?.related.some((label) => label.namespace === "ifc-guid")).toBe(true);
  });

  test("both doubles emit byte-identical IFC STEP text", () => {
    const a = new ReferenceCadDouble();
    const b = new AlternateCadDouble();
    const handleA = buildModel(a);
    const handleB = buildModel(b);
    const names = {
      projectName: "Demo Project",
      siteName: "Site Alpha",
      buildingName: "Building A",
      storeyName: "Ground Floor",
    };
    const exportA = a.exportIfc(handleA, { model: handleA, ...names });
    const exportB = b.exportIfc(handleB, { model: handleB, ...names });
    if (!exportA.ok || !exportB.ok) throw new Error("export failed");
    expect(exportA.value.stepText).toBe(exportB.value.stepText);
    expect(exportA.value.entityCount).toBe(exportB.value.entityCount);
  });
});
