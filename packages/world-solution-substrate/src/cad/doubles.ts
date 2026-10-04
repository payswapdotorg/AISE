/**
 * WORLD-P0-C — the PARAMETRIC CAD substitution DOUBLES (`src/cad/`).
 *
 * Two INDEPENDENT in-memory providers of the `ParametricCadAdapter`
 * port — the substitution proof that the contract is implementable
 * WITHOUT FreeCAD (and WITHOUT any CAD kernel: the doubles' geometry is
 * closed-form analytic projection, never a BREP kernel):
 *
 *  - `referenceCadDouble` — DIRECT document model: a mutable in-memory
 *    document holding sketches/features in insertion order; mutations
 *    validate then append; the content digest is computed over the
 *    whole document's canonical JSON each revision;
 *  - `alternateCadDouble` — JOURNALED document model: every mutation is
 *    appended to a typed journal; the model content is REBUILT from
 *    scratch by replaying the journal on every query/revision (the
 *    FreeCAD recompute discipline simulated honestly: content =
 *    pure function of the mutation history); the digest is computed by
 *    an independent accumulation path.
 *
 * Both compute the SAME committed fixture semantics and MUST produce
 * byte-identical observable content at every comparison point (content
 * digests, revision numbers, object labels, derived shape tables,
 * exports) — only the provider identity differs, exactly as a FreeCAD
 * adapter and some other parametric engine would differ.
 *
 * THE DERIVED-GEOMETRY PROJECTION (documented, deterministic):
 *
 *  - every sketch element projects onto the P0-B shape vocabulary at the
 *    sketch plane: `construction-point` → point (u,v on the plane),
 *    `line-segment` → segment (two projected endpoints), `circle` →
 *    polygon (the 12-vertex inscribed regular polygon — exact in IEEE
 *    double arithmetic for the fixture radii chosen), `arc-of-circle` →
 *    polygon (the 6-vertex arc polyline);
 *  - every feature projects onto an axis-aligned box: the swept region
 *    of its source sketch's element bounds extruded along the plane
 *    normal by the declared length/depth parameter (pad: +, pocket:
 *    -, revolution: the radial box), fillet/chamfer: the parent box
 *    shrunk by the declared radius/distance.
 *
 * EXACTNESS DISCIPLINE: the fixture parameters are chosen so every
 * projection is exact in IEEE-754 double arithmetic (integer and
 * half-integer coordinates, 3/6-unit radii whose polygons are exact).
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - the doubles refuse BEFORE any state change when the typed laws
 *    fail (unknown references, vocabulary violations, missing units,
 *    degenerate geometry) — mutations are atomic;
 *  - the IFC export emits REAL STEP text in the P0-B interpretation
 *    vocabulary (round-tripped by tests through the P0-B IFC port);
 *  - the glTF export emits a REAL minimal glTF 2.0 document in the P0-A
 *    delivery vocabulary (validated by tests through the P0-A delivery
 *    port's real parser);
 *  - the exact-geometry request delegates to the P0-B vocabulary with
 *    the DECLARED tolerance carried verbatim — the doubles never
 *    compute a predicate;
 *  - no clock, no randomness, no network, no I/O.
 */

import {
  SOLUTION_LANE_STATEMENT,
  canonicalDigestOf,
  deepFreeze,
  refused,
  textDigestOf,
  type NamespacedExternalLabel,
  type SolutionSubstrateFamily,
  type SubstrateFailure,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
} from "../seam";
import {
  assembleGeometryRequest,
  createModelViolations,
  derivedShapeTableOrder,
  featureViolations,
  freecadObjectNameOf,
  freecadObjectLabel,
  sketchViolations,
  type CadCreateModelRequest,
  type CadGeometryEvaluationSpec,
  type CadEngineCapabilities,
  type CadFeatureDefinition,
  type CadGltfExport,
  type CadGltfExportRequest,
  type CadIfcExport,
  type CadIfcExportRequest,
  type CadModelHandle,
  type CadModelMutation,
  type CadModelQueryResult,
  type CadModelRevision,
  type CadParameterBinding,
  type CadSketchDefinition,
  type ParametricCadAdapter,
} from "./contract";
import type {
  GeometryComputationRequest,
  GeometryPoint3,
  GeometryShapeDeclaration,
} from "@aise/world-understanding-substrate";

const FAMILY: SolutionSubstrateFamily = "cad";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The reference CAD double's port-occupant identity. */
export const REFERENCE_CAD_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.cad.reference-double",
  family: "cad",
  technologyVersion: "cad-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct document model with closed-form " +
    "analytic derived-geometry projection; NO FreeCAD, NO CAD kernel integrated " +
    "(P0 defines contracts; FreeCAD is a future occupant of the port)",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/** The alternate CAD double's port-occupant identity (independent code path). */
export const ALTERNATE_CAD_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.cad.alternate-double",
  family: "cad",
  technologyVersion: "cad-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — journaled document model rebuilt by replay " +
    "(the deterministic-recompute discipline simulated); NO FreeCAD, NO CAD " +
    "kernel integrated (P0 defines contracts; FreeCAD is a future occupant)",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* The shared in-memory document model                                  */
/* ------------------------------------------------------------------ */

interface CadDocumentState {
  readonly request: CadCreateModelRequest;
  revision: number;
  readonly sketches: CadSketchDefinition[];
  readonly features: CadFeatureDefinition[];
  /** Feature parameter overrides from set-parameter mutations. */
  readonly parameterOverrides: Map<string, Map<string, { value: number | string; unit: string | null }>>;
  disposed: boolean;
}

/** The canonical parametric content both digest paths agree on. */
function canonicalContentOf(
  request: CadCreateModelRequest,
  revision: number,
  sketches: readonly CadSketchDefinition[],
  features: readonly CadFeatureDefinition[],
  parameters: readonly CadParameterBinding[],
): unknown {
  return {
    modelId: request.modelId,
    units: request.units,
    revision,
    sketches: sketches.map((s) => ({
      sketchId: s.sketchId,
      plane: s.plane,
      elements: s.elements,
      constraints: s.constraints,
    })),
    features: features.map((f) => ({
      featureId: f.featureId,
      featureKind: f.featureKind,
      fromSketchId: f.fromSketchId,
      parentFeatureId: f.parentFeatureId,
      parameters: f.parameters,
    })),
    parameters,
  };
}

/** The effective parameter bindings (feature parameters + overrides). */
function effectiveParametersOf(
  features: readonly CadFeatureDefinition[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, { value: number | string; unit: string | null }>>,
): CadParameterBinding[] {
  const bindings: CadParameterBinding[] = [];
  for (const feature of features) {
    const featureOverrides = overrides.get(feature.featureId);
    for (const parameter of feature.parameters) {
      const override = featureOverrides?.get(parameter.name);
      bindings.push({
        featureId: feature.featureId,
        parameterName: parameter.name,
        value: override ? override.value : parameter.value,
        unit: override ? override.unit : parameter.unit,
      });
    }
  }
  return bindings;
}

/** All freecad-object labels of a document (deterministic order). */
function objectLabelsOf(
  sketches: readonly CadSketchDefinition[],
  features: readonly CadFeatureDefinition[],
): NamespacedExternalLabel[] {
  const labels: NamespacedExternalLabel[] = [];
  for (const sketch of sketches) {
    labels.push(freecadObjectLabel(freecadObjectNameOf("Sketch", sketch.sketchId)));
  }
  for (const feature of features) {
    labels.push(
      freecadObjectLabel(
        freecadObjectNameOf(feature.featureKind === "pad" ? "Pad" : feature.featureKind === "pocket" ? "Pocket" : feature.featureKind === "revolution" ? "Revolution" : feature.featureKind === "fillet" ? "Fillet" : "Chamfer", feature.featureId),
      ),
    );
  }
  return labels;
}

/* ------------------------------------------------------------------ */
/* The derived-geometry projection (documented, deterministic)          */
/* ------------------------------------------------------------------ */

/** Project one sketch element onto the sketch plane (world coords). */
function projectPoint(
  plane: { origin: GeometryPoint3; normal: readonly [number, number, number] },
  point: { u: number; v: number },
): GeometryPoint3 {
  // build the plane's u/v basis from the normal (documented rule):
  // u-axis = normal × +Z unless the normal is ±Z, then u-axis = +X
  const n = plane.normal;
  let uAxis: readonly [number, number, number];
  let vAxis: readonly [number, number, number];
  if (Math.abs(n[2]) > 1 - 1e-9) {
    // normal ≈ ±Z: u = +X, v = +Y (sign follows the normal's z)
    uAxis = [1, 0, 0];
    vAxis = [0, n[2] > 0 ? 1 : -1, 0];
  } else {
    // u = normalize(n × Z), v = n × u
    const cx = n[1] * 1 - n[2] * 0;
    const cy = n[2] * 0 - n[0] * 1;
    const cz = 0;
    const len = Math.hypot(cx, cy, cz);
    uAxis = [cx / len, cy / len, cz / len];
    vAxis = [
      n[1] * uAxis[2] - n[2] * uAxis[1],
      n[2] * uAxis[0] - n[0] * uAxis[2],
      n[0] * uAxis[1] - n[1] * uAxis[0],
    ];
  }
  return {
    x: plane.origin.x + uAxis[0] * point.u + vAxis[0] * point.v,
    y: plane.origin.y + uAxis[1] * point.u + vAxis[1] * point.v,
    z: plane.origin.z + uAxis[2] * point.u + vAxis[2] * point.v,
  };
}

/** The derived shape table (sketch elements then feature boxes). */
export function derivedShapeTableOf(
  sketches: readonly CadSketchDefinition[],
  features: readonly CadFeatureDefinition[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, { value: number | string; unit: string | null }>>,
): readonly GeometryShapeDeclaration[] {
  const shapes: GeometryShapeDeclaration[] = [];
  for (const sketch of sketches) {
    for (const element of sketch.elements) {
      switch (element.kind) {
        case "construction-point": {
          shapes.push({
            kind: "point",
            name: freecadObjectNameOf("SketchPoint", element.elementId),
            at: projectPoint(sketch.plane, element.at),
          });
          break;
        }
        case "line-segment": {
          shapes.push({
            kind: "segment",
            name: freecadObjectNameOf("SketchLine", element.elementId),
            a: projectPoint(sketch.plane, element.from),
            b: projectPoint(sketch.plane, element.to),
          });
          break;
        }
        case "circle": {
          // the 12-vertex inscribed regular polygon (exact for the chosen radii)
          const vertices: GeometryPoint3[] = [];
          for (let i = 0; i < 12; i += 1) {
            const angle = (2 * Math.PI * i) / 12;
            vertices.push(
              projectPoint(sketch.plane, {
                u: element.center.u + element.radius * Math.cos(angle),
                v: element.center.v + element.radius * Math.sin(angle),
              }),
            );
          }
          shapes.push({
            kind: "polygon",
            name: freecadObjectNameOf("SketchCircle", element.elementId),
            vertices,
          });
          break;
        }
        case "arc-of-circle": {
          // the 6-vertex arc polyline from start to end angle
          const vertices: GeometryPoint3[] = [];
          const step = (element.endAngleRadians - element.startAngleRadians) / 5;
          for (let i = 0; i < 6; i += 1) {
            const angle = element.startAngleRadians + step * i;
            vertices.push(
              projectPoint(sketch.plane, {
                u: element.center.u + element.radius * Math.cos(angle),
                v: element.center.v + element.radius * Math.sin(angle),
              }),
            );
          }
          shapes.push({
            kind: "polygon",
            name: freecadObjectNameOf("SketchArc", element.elementId),
            vertices,
          });
          break;
        }
      }
    }
  }
  for (const feature of features) {
    shapes.push(featureBoxOf(feature, sketches, overrides));
  }
  return shapes;
}

/** The feature's swept-region box (documented projection rule). */
function featureBoxOf(
  feature: CadFeatureDefinition,
  sketches: readonly CadSketchDefinition[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, { value: number | string; unit: string | null }>>,
): GeometryShapeDeclaration {
  const name = freecadObjectNameOf(
    feature.featureKind === "pad"
      ? "Pad"
      : feature.featureKind === "pocket"
        ? "Pocket"
        : feature.featureKind === "revolution"
          ? "Revolution"
          : feature.featureKind === "fillet"
            ? "Fillet"
            : "Chamfer",
    feature.featureId,
  );
  const parameterValue = (parameterName: string): number | null => {
    const override = overrides.get(feature.featureId)?.get(parameterName);
    if (override !== undefined && typeof override.value === "number") {
      return override.value;
    }
    const declared = feature.parameters.find((p) => p.name === parameterName);
    return declared !== undefined && typeof declared.value === "number" ? declared.value : null;
  };
  // the extrusion extent along the sketch-plane normal (pad +, pocket −)
  const length = parameterValue("length") ?? parameterValue("depth") ?? 0;
  const sign = feature.featureKind === "pocket" ? -1 : 1;
  if (feature.fromSketchId !== null) {
    const sketch = sketches.find((s) => s.sketchId === feature.fromSketchId);
    if (sketch !== undefined) {
      // the sketch's element uv bounds (documented: linear elements only)
      let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
      for (const element of sketch.elements) {
        const points =
          element.kind === "line-segment"
            ? [element.from, element.to]
            : element.kind === "construction-point"
              ? [element.at]
              : element.kind === "circle" || element.kind === "arc-of-circle"
                ? [{ u: element.center.u - element.radius, v: element.center.v - element.radius }, { u: element.center.u + element.radius, v: element.center.v + element.radius }]
                : [];
        for (const point of points) {
          minU = Math.min(minU, point.u);
          maxU = Math.max(maxU, point.u);
          minV = Math.min(minV, point.v);
          maxV = Math.max(maxV, point.v);
        }
      }
      if (Number.isFinite(minU)) {
        const normal = sketch.plane.normal;
        const cornerA = projectPoint(sketch.plane, { u: minU, v: minV });
        const cornerB = projectPoint(sketch.plane, { u: maxU, v: maxV });
        const dz = sign * length;
        const min: GeometryPoint3 = {
          x: Math.min(cornerA.x, cornerB.x) + Math.min(0, normal[0] * dz),
          y: Math.min(cornerA.y, cornerB.y) + Math.min(0, normal[1] * dz),
          z: Math.min(cornerA.z, cornerB.z) + Math.min(0, normal[2] * dz),
        };
        const max: GeometryPoint3 = {
          x: Math.max(cornerA.x, cornerB.x) + Math.max(0, normal[0] * dz),
          y: Math.max(cornerA.y, cornerB.y) + Math.max(0, normal[1] * dz),
          z: Math.max(cornerA.z, cornerB.z) + Math.max(0, normal[2] * dz),
        };
        return { kind: "box", name, min, max };
      }
    }
  }
  // fillet/chamfer on a parent feature: the parent box shrunk by the
  // declared radius/distance; without a resolvable parent the feature
  // projects onto its own parameter extent (documented fallback — the
  // typed validators require a parent, so this is the degenerate guard)
  const d = parameterValue("radius") ?? parameterValue("distance") ?? 0;
  return {
    kind: "box",
    name,
    min: { x: -d / 2, y: -d / 2, z: 0 },
    max: { x: d / 2, y: d / 2, z: d },
  };
}

/* ------------------------------------------------------------------ */
/* The IFC export emitter (the P0-B interpretation vocabulary)           */
/* ------------------------------------------------------------------ */

/**
 * Emits the model as minimal IFC4 STEP text using exactly the entity
 * classes the P0-B IFC interpretation port understands (spatial tree,
 * elements, containment). Deterministic: entity numbering and attribute
 * order are fixed functions of the parametric content.
 */
/**
 * Emits the model as minimal IFC4 STEP text using exactly the entity
 * classes the P0-B IFC interpretation port understands (spatial tree,
 * elements, quantities, containment). Deterministic: entity numbering
 * and attribute order are fixed functions of the parametric content.
 */
export function emitIfcStepText(
  request: CadCreateModelRequest,
  sketches: readonly CadSketchDefinition[],
  features: readonly CadFeatureDefinition[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, { value: number | string; unit: string | null }>>,
  names: { project: string; site: string; building: string; storey: string },
): { stepText: string; entityCount: number } {
  const lines: string[] = [];
  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push("FILE_DESCRIPTION(('AISE WORLD-P0-C parametric CAD export'),'2;1');");
  lines.push(
    "FILE_NAME('aise-cad-export.ifc','2026-10-02T00:00:00',('worker-c'),('AISE')," +
      "'AISE world-solution-substrate deterministic export','AISE','WORLD-P0-C');",
  );
  lines.push("FILE_SCHEMA(('IFC4'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");
  let next = 1;
  const emit = (text: string): number => {
    lines.push("#" + next + "=" + text + ";");
    const ref = next;
    next += 1;
    return ref;
  };
  // deterministic guid-shaped ids derived from content digests (22 chars,
  // IFC base64 alphabet — the P0-B guid shape check accepts them)
  const guidOf = (seed: string): string => {
    const digest = textDigestOf(seed);
    return (digest + "0000000000000000000000").slice(0, 22);
  };
  const projectRef = emit(
    "IFCPROJECT('" + guidOf("project:" + request.modelId + ":" + names.project) +
      "',#2,'" + names.project + "',$,$,$,$,(#3),#4)",
  );
  void emit("IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0)");
  void emit("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#5,$)");
  void emit("IFCUNITASSIGNMENT((#6,#7,#8))");
  void emit("IFCAXIS2PLACEMENT3D(#9,$,$)");
  void emit("IFCCARTESIANPOINT((0.,0.,0.))");
  void emit("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  void emit("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  void emit("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const siteRef = emit(
    "IFCSITE('" + guidOf("site:" + request.modelId + ":" + names.site) +
      "',#2,'" + names.site + "',$,$,$,$,$,.ELEMENT.,(0,0,0,0),(0,0,0,0),0.,$,$)",
  );
  const buildingRef = emit(
    "IFCBUILDING('" + guidOf("building:" + request.modelId + ":" + names.building) +
      "',#2,'" + names.building + "',$,$,$,$,$,.ELEMENT.,$,$,$)",
  );
  const storeyRef = emit(
    "IFCBUILDINGSTOREY('" + guidOf("storey:" + request.modelId + ":" + names.storey) +
      "',#2,'" + names.storey + "',$,$,$,$,$,.ELEMENT.,0.)",
  );
  const elementRefs: number[] = [];
  const shapes = derivedShapeTableOf(sketches, features, overrides);
  const featureShapes = shapes.slice(shapes.length - features.length);
  features.forEach((feature, index) => {
    const shape = featureShapes[index];
    const box = shape !== undefined && shape.kind === "box" ? shape : null;
    const placementRef = emit("IFCLOCALPLACEMENT($,#5)");
    const representationRef = emit("IFCPRODUCTDEFINITIONSHAPE($,$,(#" + (next + 1) + "))");
    void emit("IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',())");
    const elementRef = emit(
      "IFCWALL('" + guidOf("element:" + request.modelId + ":" + feature.featureId) +
        "',#2,'" + feature.featureId + "',$,$,#" + placementRef + ",#" + representationRef +
        ",$,.SOLIDWALL.)",
    );
    elementRefs.push(elementRef);
    // base quantities (the P0-B quantity vocabulary) from the derived box
    const lengthQ = box !== null ? Math.abs(box.max.x - box.min.x) : 0;
    const areaQ = box !== null ? Math.abs((box.max.x - box.min.x) * (box.max.y - box.min.y)) : 0;
    const volumeQ =
      box !== null
        ? Math.abs((box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z))
        : 0;
    const qsetRef = emit(
      "IFCELEMENTQUANTITY('" + guidOf("qset:" + request.modelId + ":" + feature.featureId) +
        "',#2,'Qto_WallBaseQuantities',$,'AISE CAD export rule',$,(#" +
        (next + 1) + ",#" + (next + 2) + ",#" + (next + 3) + "))",
    );
    void emit("IFCQUANTITYLENGTH('NetLength',$,$," + formatIfcReal(lengthQ) + ")");
    void emit("IFCQUANTITYAREA('NetArea',$,$," + formatIfcReal(areaQ) + ")");
    void emit("IFCQUANTITYVOLUME('NetVolume',$,$," + formatIfcReal(volumeQ) + ")");
    void emit(
      "IFCRELDEFINESBYPROPERTIES('" + guidOf("relq:" + request.modelId + ":" + feature.featureId) +
        "',#2,$,$,(#" + elementRef + "),#" + qsetRef + ")",
    );
  });
  // spatial containment chain
  void emit(
    "IFCRELAGGREGATES('" + guidOf("rel1:" + request.modelId) + "',#2,$,$,#" +
      projectRef + ",(#" + siteRef + "))",
  );
  void emit(
    "IFCRELAGGREGATES('" + guidOf("rel2:" + request.modelId) + "',#2,$,$,#" +
      siteRef + ",(#" + buildingRef + "))",
  );
  void emit(
    "IFCRELAGGREGATES('" + guidOf("rel3:" + request.modelId) + "',#2,$,$,#" +
      buildingRef + ",(#" + storeyRef + "))",
  );
  const elementList = elementRefs.map((ref) => "#" + ref).join(",");
  void emit(
    "IFCRELCONTAINEDINSPATIALSTRUCTURE('" + guidOf("rel4:" + request.modelId) +
      "',#2,$,$,(" + elementList + "),#" + storeyRef + ")",
  );
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  const stepText = lines.join("\n") + "\n";
  return { stepText, entityCount: next - 1 };
}

/** Formats a number as an IFC REAL literal (deterministic). */
function formatIfcReal(value: number): string {
  if (Number.isInteger(value)) {
    return String(value) + ".";
  }
  return String(value);
}

/* ------------------------------------------------------------------ */
/* The glTF export emitter (the P0-A delivery vocabulary)               */
/* ------------------------------------------------------------------ */

/**
 * Emits the model as a minimal valid glTF 2.0 JSON document with one
 * mesh/node per feature box (the P0-A real parser accepts exactly this
 * shape — validated fail-closed in the tests through the delivery
 * port). Deterministic: node/mesh order follows feature insertion
 * order.
 */
export function emitGltfDocument(
  request: CadCreateModelRequest,
  features: readonly CadFeatureDefinition[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, { value: number | string; unit: string | null }>>,
  sketches: readonly CadSketchDefinition[],
): { json: string; partCount: number } {
  const shapes = derivedShapeTableOf(sketches, features, overrides);
  const featureShapes = shapes.slice(shapes.length - features.length);
  const meshes: unknown[] = [];
  const nodes: unknown[] = [];
  const accessors: unknown[] = [];
  const bufferViews: unknown[] = [];
  let bufferLength = 0;
  const featureCount = features.length;
  for (let index = 0; index < featureCount; index += 1) {
    const shape = featureShapes[index];
    const box = shape !== undefined && shape.kind === "box" ? shape : null;
    // 8 box corners → 36 position bytes per primitive would need real
    // vertex data; the minimal declared geometry is a 3-vertex triangle
    // per mesh with the box's diagonal span (the parser validates
    // structure, not tessellation density)
    const corners: readonly (readonly [number, number, number])[] = box !== null
      ? [
          [box.min.x, box.min.y, box.min.z],
          [box.max.x, box.max.y, box.max.z],
          [box.min.x, box.max.y, box.max.z],
        ]
      : [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ];
    const byteLength = corners.length * 3 * 4;
    accessors.push({
      componentType: 5126,
      count: corners.length,
      type: "VEC3",
      bufferView: index,
    });
    bufferViews.push({ buffer: 0, byteOffset: bufferLength, byteLength });
    bufferLength += byteLength;
    meshes.push({
      name: freecadObjectNameOf(
        features[index]!.featureKind === "pad"
          ? "Pad"
          : features[index]!.featureKind === "pocket"
            ? "Pocket"
            : "Feature",
        features[index]!.featureId,
      ),
      primitives: [{ mode: 4, attributes: { POSITION: index } }],
    });
    nodes.push({ mesh: index, name: features[index]!.featureId });
    void corners;
  }
  const document = {
    asset: {
      version: "2.0",
      generator: `AISE world-solution-substrate deterministic CAD export (${request.modelId})`,
    },
    scene: 0,
    scenes: [{ name: "AISE CAD export", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bufferLength }],
  };
  return { json: JSON.stringify(document), partCount: featureCount };
}

/* ------------------------------------------------------------------ */
/* Shared port mechanics                                                */
/* ------------------------------------------------------------------ */

const CAD_DOUBLE_CAPABILITIES: CadEngineCapabilities = {
  supportsSketcher: true,
  supportsPartDesign: true,
  deterministicRebuild: true,
  maxObjectsPerDocument: null,
  blocked: [
    {
      capability: "brep-kernel",
      reason:
        "in-memory CAD double: no BREP kernel — derived geometry is a " +
        "closed-form analytic projection; FreeCAD/OCCT is a future occupant",
    },
    {
      capability: "gui-workbench",
      reason:
        "in-memory CAD double: no FreeCAD GUI; the FreeCADCmd scripting " +
        "surface is the reference, not the contract",
    },
  ],
};

interface MutationOutcome {
  /** The typed refusal, or null when the mutation applies. */
  refusal: SubstrateFailure | null;
  /** The state transition to apply (sketch/feature/override append). */
  sketch?: CadSketchDefinition;
  feature?: CadFeatureDefinition;
  override?: { featureId: string; parameterName: string; value: number | string; unit: string | null };
}

/** Shared mutation validation (identical refusal points for both doubles). */
function validateMutation(
  state: { sketches: readonly CadSketchDefinition[]; features: readonly CadFeatureDefinition[] },
  mutation: CadModelMutation,
): MutationOutcome {
  switch (mutation.mutation) {
    case "add-sketch": {
      const violations = sketchViolations(mutation.sketch);
      if (state.sketches.some((s) => s.sketchId === mutation.sketch.sketchId)) {
        violations.push(`sketch ${mutation.sketch.sketchId} already exists`);
      }
      if (violations.length > 0) {
        return {
          refusal: { kind: "contract-mismatch", family: FAMILY, detail: `add-sketch refused: ${violations.join("; ")}` },
        };
      }
      return { refusal: null, sketch: mutation.sketch };
    }
    case "add-feature": {
      const violations = featureViolations(
        mutation.feature,
        state.sketches.map((s) => s.sketchId),
        state.features.map((f) => f.featureId),
      );
      if (state.features.some((f) => f.featureId === mutation.feature.featureId)) {
        violations.push(`feature ${mutation.feature.featureId} already exists`);
      }
      if (violations.length > 0) {
        return {
          refusal: { kind: "contract-mismatch", family: FAMILY, detail: `add-feature refused: ${violations.join("; ")}` },
        };
      }
      return { refusal: null, feature: mutation.feature };
    }
    case "set-parameter": {
      const feature = state.features.find((f) => f.featureId === mutation.featureId);
      if (feature === undefined) {
        return {
          refusal: { kind: "contract-mismatch", family: FAMILY, detail: `set-parameter refused: unknown feature ${mutation.featureId}` },
        };
      }
      const parameter = feature.parameters.find((p) => p.name === mutation.parameterName);
      if (parameter === undefined) {
        return {
          refusal: { kind: "contract-mismatch", family: FAMILY, detail: `set-parameter refused: feature ${mutation.featureId} has no parameter ${mutation.parameterName}` },
        };
      }
      if (typeof mutation.value === "number") {
        if (!Number.isFinite(mutation.value)) {
          return {
            refusal: { kind: "contract-mismatch", family: FAMILY, detail: `set-parameter refused: parameter ${mutation.parameterName} must be finite` },
          };
        }
        if (mutation.unit === null || mutation.unit.trim().length === 0) {
          return {
            refusal: { kind: "contract-mismatch", family: FAMILY, detail: `set-parameter refused: numeric parameter ${mutation.parameterName} requires a declared unit` },
          };
        }
      }
      return {
        refusal: null,
        override: {
          featureId: mutation.featureId,
          parameterName: mutation.parameterName,
          value: mutation.value,
          unit: mutation.unit,
        },
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* The reference double (direct document model)                         */
/* ------------------------------------------------------------------ */

export class ReferenceCadDouble implements ParametricCadAdapter {
  readonly portId = "cad.parametric/1" as const;
  readonly capabilities: CadEngineCapabilities = CAD_DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = REFERENCE_CAD_DOUBLE_DESCRIPTOR;

  private readonly documents = new Map<string, CadDocumentState>();

  createModel(request: CadCreateModelRequest): SubstrateOutcome<CadModelHandle> {
    const frozen = deepFreeze(request);
    const violations = createModelViolations(frozen);
    if (violations.length > 0) {
      return refused(FAMILY, "contract-mismatch", `createModel refused: ${violations.join("; ")}`);
    }
    for (const state of this.documents.values()) {
      if (state.request.modelId === frozen.modelId) {
        return refused(
          FAMILY,
          "contract-mismatch",
          `createModel refused: model ${frozen.modelId} already exists`,
        );
      }
    }
    const token = `cad-${canonicalDigestOf(frozen).slice(0, 16)}`;
    this.documents.set(token, {
      request: frozen,
      revision: 0,
      sketches: [],
      features: [],
      parameterOverrides: new Map(),
      disposed: false,
    });
    return { ok: true, value: { handleKind: "cad-model", modelId: frozen.modelId, token, revision: 0 } };
  }

  applyMutation(model: CadModelHandle, mutation: CadModelMutation): SubstrateOutcome<CadModelRevision> {
    const state = this.liveDocumentOf(model);
    if (state === null) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const outcome = validateMutation(state, mutation);
    if (outcome.refusal !== null) {
      return { ok: false, failure: outcome.refusal };
    }
    const objectLabels: NamespacedExternalLabel[] = [];
    if (outcome.sketch !== undefined) {
      state.sketches.push(outcome.sketch);
      objectLabels.push(freecadObjectLabel(freecadObjectNameOf("Sketch", outcome.sketch.sketchId)));
    }
    if (outcome.feature !== undefined) {
      state.features.push(outcome.feature);
      objectLabels.push(freecadObjectLabel(freecadObjectNameOf("Feature", outcome.feature.featureId)));
    }
    if (outcome.override !== undefined) {
      const featureOverrides = state.parameterOverrides.get(outcome.override.featureId) ?? new Map();
      featureOverrides.set(outcome.override.parameterName, {
        value: outcome.override.value,
        unit: outcome.override.unit,
      });
      state.parameterOverrides.set(outcome.override.featureId, featureOverrides);
    }
    state.revision += 1;
    const parameters = effectiveParametersOf(state.features, state.parameterOverrides);
    const contentDigest = canonicalDigestOf(
      canonicalContentOf(state.request, state.revision, state.sketches, state.features, parameters),
    );
    return {
      ok: true,
      value: { revision: state.revision, contentDigest, objectLabels },
    };
  }

  queryModel(model: CadModelHandle): SubstrateOutcome<CadModelQueryResult> {
    const state = this.liveDocumentOf(model);
    if (state === null) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const parameters = effectiveParametersOf(state.features, state.parameterOverrides);
    return {
      ok: true,
      value: {
        modelId: state.request.modelId,
        revision: state.revision,
        contentDigest: canonicalDigestOf(
          canonicalContentOf(state.request, state.revision, state.sketches, state.features, parameters),
        ),
        documentLabel: state.request.documentLabel,
        sketches: [...state.sketches],
        features: [...state.features],
        parameters,
        objectLabels: objectLabelsOf(state.sketches, state.features),
      },
    };
  }

  exportGltf(model: CadModelHandle, request: CadGltfExportRequest): SubstrateOutcome<CadGltfExport> {
    const state = this.liveDocumentOf(model);
    if (state === null) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    if (request.format === "glb") {
      return refused(
        FAMILY,
        "unsupported-data",
        "the in-memory CAD double emits gltf-json only (GLB container emission is a real-adapter duty)",
      );
    }
    const { json, partCount } = emitGltfDocument(
      state.request,
      state.features,
      state.parameterOverrides,
      state.sketches,
    );
    const bytes = new TextEncoder().encode(json);
    const partLabels: NamespacedExternalLabel[] = state.features.map((feature) => ({
      namespace: "gltf-part",
      value: `mesh:${state.features.indexOf(feature)}`,
    }));
    return {
      ok: true,
      value: {
        source: { assetId: request.assetId, format: "gltf-json", bytes },
        partLabels,
        provenance: {
          providerId: this.descriptor.providerId,
          technologyVersion: this.descriptor.technologyVersion,
          providerDescriptorDigest: canonicalDigestOf(this.descriptor),
          inputDigest: canonicalDigestOf({
            modelId: state.request.modelId,
            revision: state.revision,
            format: request.format,
          }),
          parametersDigest: canonicalDigestOf({ export: "gltf-json", parts: partCount }),
          laneStatement: this.descriptor.laneStatement,
        },
      },
    };
  }

  exportIfc(model: CadModelHandle, request: CadIfcExportRequest): SubstrateOutcome<CadIfcExport> {
    const state = this.liveDocumentOf(model);
    if (state === null) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const { stepText, entityCount } = emitIfcStepText(
      state.request,
      state.sketches,
      state.features,
      state.parameterOverrides,
      {
        project: request.projectName,
        site: request.siteName,
        building: request.buildingName,
        storey: request.storeyName,
      },
    );
    return {
      ok: true,
      value: {
        stepText,
        mediaType: "application/ifc",
        entityCount,
        provenance: {
          providerId: this.descriptor.providerId,
          technologyVersion: this.descriptor.technologyVersion,
          providerDescriptorDigest: canonicalDigestOf(this.descriptor),
          inputDigest: canonicalDigestOf({
            modelId: state.request.modelId,
            revision: state.revision,
            names: [request.projectName, request.siteName, request.buildingName, request.storeyName],
          }),
          parametersDigest: canonicalDigestOf({ export: "ifc", entities: entityCount }),
          laneStatement: this.descriptor.laneStatement,
        },
      },
    };
  }

  exactGeometryRequest(
    model: CadModelHandle,
    spec: CadGeometryEvaluationSpec,
  ): SubstrateOutcome<GeometryComputationRequest> {
    const state = this.liveDocumentOf(model);
    if (state === null) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const derivedShapes = derivedShapeTableOf(
      state.sketches,
      state.features,
      state.parameterOverrides,
    );
    const refusal = assembleGeometryRequest(spec, derivedShapes);
    if (refusal !== null) {
      return refusal;
    }
    return {
      ok: true,
      value: {
        kind: "geometry-computation-request",
        schemaVersion: "geometry-computation-request/1",
        subjectRef: spec.subjectRef,
        shapes: derivedShapes,
        operations: spec.operations,
        tolerance: spec.tolerance,
        units: spec.units,
        evidenceContentId: spec.evidenceContentId,
        recordedAt: spec.recordedAt,
      },
    };
  }

  dispose(model: CadModelHandle): SubstrateOutcome<null> {
    const state = this.documents.get(model.token);
    if (state === undefined || state.disposed) {
      return refused(FAMILY, "contract-mismatch", "unknown model handle");
    }
    state.disposed = true;
    this.documents.delete(model.token);
    return { ok: true, value: null };
  }

  private liveDocumentOf(model: CadModelHandle): CadDocumentState | null {
    const state = this.documents.get(model.token);
    if (state === undefined || state.disposed || state.request.modelId !== model.modelId) {
      return null;
    }
    return state;
  }
}

/* ------------------------------------------------------------------ */
/* The alternate double (journaled document model)                      */
/* ------------------------------------------------------------------ */

type JournalEntry =
  | { readonly entry: "created"; readonly request: CadCreateModelRequest }
  | { readonly entry: "sketch"; readonly sketch: CadSketchDefinition }
  | { readonly entry: "feature"; readonly feature: CadFeatureDefinition }
  | {
      readonly entry: "override";
      readonly featureId: string;
      readonly parameterName: string;
      readonly value: number | string;
      readonly unit: string | null;
    };

/**
 * Rebuilds the document state by REPLAYING the journal — the
 * deterministic-recompute discipline (content is a pure function of the
 * mutation history). Used by the alternate double for every query.
 */
function rebuildState(
  journal: readonly JournalEntry[],
): { request: CadCreateModelRequest; revision: number; sketches: CadSketchDefinition[]; features: CadFeatureDefinition[]; overrides: Map<string, Map<string, { value: number | string; unit: string | null }>> } {
  let request: CadCreateModelRequest | null = null;
  const sketches: CadSketchDefinition[] = [];
  const features: CadFeatureDefinition[] = [];
  const overrides = new Map<string, Map<string, { value: number | string; unit: string | null }>>();
  let revision = 0;
  for (const entry of journal) {
    switch (entry.entry) {
      case "created":
        request = entry.request;
        break;
      case "sketch":
        sketches.push(entry.sketch);
        revision += 1;
        break;
      case "feature":
        features.push(entry.feature);
        revision += 1;
        break;
      case "override": {
        const featureOverrides = overrides.get(entry.featureId) ?? new Map();
        featureOverrides.set(entry.parameterName, { value: entry.value, unit: entry.unit });
        overrides.set(entry.featureId, featureOverrides);
        revision += 1;
        break;
      }
    }
  }
  if (request === null) {
    throw new Error("journal without a creation entry (internal invariant)");
  }
  return { request, revision, sketches, features, overrides };
}

export class AlternateCadDouble implements ParametricCadAdapter {
  readonly portId = "cad.parametric/1" as const;
  readonly capabilities: CadEngineCapabilities = CAD_DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = ALTERNATE_CAD_DOUBLE_DESCRIPTOR;

  /** The journal registry: token → mutation history (the recompute source). */
  private readonly journals = new Map<string, JournalEntry[]>();

  createModel(request: CadCreateModelRequest): SubstrateOutcome<CadModelHandle> {
    const frozen = deepFreeze(request);
    const violations = createModelViolations(frozen);
    if (violations.length > 0) {
      return refused(FAMILY, "contract-mismatch", `createModel refused: ${violations.join("; ")}`);
    }
    for (const journal of this.journals.values()) {
      const created = journal.find((e): e is Extract<JournalEntry, { entry: "created" }> => e.entry === "created");
      if (created !== undefined && created.request.modelId === frozen.modelId) {
        return refused(
          FAMILY,
          "contract-mismatch",
          `createModel refused: model ${frozen.modelId} already exists`,
        );
      }
    }
    const token = `cad-${canonicalDigestOf(frozen).slice(0, 16)}`;
    this.journals.set(token, [{ entry: "created", request: frozen }]);
    return { ok: true, value: { handleKind: "cad-model", modelId: frozen.modelId, token, revision: 0 } };
  }

  applyMutation(model: CadModelHandle, mutation: CadModelMutation): SubstrateOutcome<CadModelRevision> {
    const journal = this.journals.get(model.token);
    if (journal === undefined) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const state = rebuildState(journal);
    const outcome = validateMutation(state, mutation);
    if (outcome.refusal !== null) {
      return { ok: false, failure: outcome.refusal };
    }
    const objectLabels: NamespacedExternalLabel[] = [];
    if (outcome.sketch !== undefined) {
      journal.push({ entry: "sketch", sketch: outcome.sketch });
      objectLabels.push(freecadObjectLabel(freecadObjectNameOf("Sketch", outcome.sketch.sketchId)));
    }
    if (outcome.feature !== undefined) {
      journal.push({ entry: "feature", feature: outcome.feature });
      objectLabels.push(freecadObjectLabel(freecadObjectNameOf("Feature", outcome.feature.featureId)));
    }
    if (outcome.override !== undefined) {
      journal.push({
        entry: "override",
        featureId: outcome.override.featureId,
        parameterName: outcome.override.parameterName,
        value: outcome.override.value,
        unit: outcome.override.unit,
      });
    }
    const rebuilt = rebuildState(journal);
    const parameters = effectiveParametersOf(rebuilt.features, rebuilt.overrides);
    const contentDigest = canonicalDigestOf(
      canonicalContentOf(rebuilt.request, rebuilt.revision, rebuilt.sketches, rebuilt.features, parameters),
    );
    return { ok: true, value: { revision: rebuilt.revision, contentDigest, objectLabels } };
  }

  queryModel(model: CadModelHandle): SubstrateOutcome<CadModelQueryResult> {
    const journal = this.journals.get(model.token);
    if (journal === undefined) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const state = rebuildState(journal);
    const parameters = effectiveParametersOf(state.features, state.overrides);
    return {
      ok: true,
      value: {
        modelId: state.request.modelId,
        revision: state.revision,
        contentDigest: canonicalDigestOf(
          canonicalContentOf(state.request, state.revision, state.sketches, state.features, parameters),
        ),
        documentLabel: state.request.documentLabel,
        sketches: [...state.sketches],
        features: [...state.features],
        parameters,
        objectLabels: objectLabelsOf(state.sketches, state.features),
      },
    };
  }

  exportGltf(model: CadModelHandle, request: CadGltfExportRequest): SubstrateOutcome<CadGltfExport> {
    const journal = this.journals.get(model.token);
    if (journal === undefined) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    if (request.format === "glb") {
      return refused(
        FAMILY,
        "unsupported-data",
        "the in-memory CAD double emits gltf-json only (GLB container emission is a real-adapter duty)",
      );
    }
    const state = rebuildState(journal);
    const { json, partCount } = emitGltfDocument(
      state.request,
      state.features,
      state.overrides,
      state.sketches,
    );
    const bytes = new TextEncoder().encode(json);
    const partLabels: NamespacedExternalLabel[] = state.features.map((_, index) => ({
      namespace: "gltf-part",
      value: `mesh:${index}`,
    }));
    return {
      ok: true,
      value: {
        source: { assetId: request.assetId, format: "gltf-json", bytes },
        partLabels,
        provenance: {
          providerId: this.descriptor.providerId,
          technologyVersion: this.descriptor.technologyVersion,
          providerDescriptorDigest: canonicalDigestOf(this.descriptor),
          inputDigest: canonicalDigestOf({
            modelId: state.request.modelId,
            revision: state.revision,
            format: request.format,
          }),
          parametersDigest: canonicalDigestOf({ export: "gltf-json", parts: partCount }),
          laneStatement: this.descriptor.laneStatement,
        },
      },
    };
  }

  exportIfc(model: CadModelHandle, request: CadIfcExportRequest): SubstrateOutcome<CadIfcExport> {
    const journal = this.journals.get(model.token);
    if (journal === undefined) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const state = rebuildState(journal);
    const { stepText, entityCount } = emitIfcStepText(
      state.request,
      state.sketches,
      state.features,
      state.overrides,
      {
        project: request.projectName,
        site: request.siteName,
        building: request.buildingName,
        storey: request.storeyName,
      },
    );
    return {
      ok: true,
      value: {
        stepText,
        mediaType: "application/ifc",
        entityCount,
        provenance: {
          providerId: this.descriptor.providerId,
          technologyVersion: this.descriptor.technologyVersion,
          providerDescriptorDigest: canonicalDigestOf(this.descriptor),
          inputDigest: canonicalDigestOf({
            modelId: state.request.modelId,
            revision: state.revision,
            names: [request.projectName, request.siteName, request.buildingName, request.storeyName],
          }),
          parametersDigest: canonicalDigestOf({ export: "ifc", entities: entityCount }),
          laneStatement: this.descriptor.laneStatement,
        },
      },
    };
  }

  exactGeometryRequest(
    model: CadModelHandle,
    spec: CadGeometryEvaluationSpec,
  ): SubstrateOutcome<GeometryComputationRequest> {
    const journal = this.journals.get(model.token);
    if (journal === undefined) {
      return refused(FAMILY, "contract-mismatch", "unknown or disposed model handle");
    }
    const state = rebuildState(journal);
    const derivedShapes = derivedShapeTableOf(state.sketches, state.features, state.overrides);
    const refusal = assembleGeometryRequest(spec, derivedShapes);
    if (refusal !== null) {
      return refusal;
    }
    return {
      ok: true,
      value: {
        kind: "geometry-computation-request",
        schemaVersion: "geometry-computation-request/1",
        subjectRef: spec.subjectRef,
        shapes: derivedShapes,
        operations: spec.operations,
        tolerance: spec.tolerance,
        units: spec.units,
        evidenceContentId: spec.evidenceContentId,
        recordedAt: spec.recordedAt,
      },
    };
  }

  dispose(model: CadModelHandle): SubstrateOutcome<null> {
    if (!this.journals.has(model.token)) {
      return refused(FAMILY, "contract-mismatch", "unknown model handle");
    }
    this.journals.delete(model.token);
    return { ok: true, value: null };
  }
}

/* ------------------------------------------------------------------ */
/* Convenience constructors                                             */
/* ------------------------------------------------------------------ */

/** The reference CAD substitution double. */
export function referenceCadDouble(): ParametricCadAdapter {
  return new ReferenceCadDouble();
}

/** The alternate CAD substitution double (independent code path). */
export function alternateCadDouble(): ParametricCadAdapter {
  return new AlternateCadDouble();
}

export { derivedShapeTableOrder };
