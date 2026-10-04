/**
 * WORLD-P0-C — the PARAMETRIC CAD ADAPTER CONTRACT (`src/cad/`).
 *
 * The substrate-neutral contract for deterministic parametric-model
 * operations: model create/modify/query as TYPED operations, sketch/
 * feature semantics, exact-geometry predicates DELEGATING to the P0-B
 * exact-geometry port vocabulary with tolerance-DECLARED comparisons,
 * and export to glTF/IFC through the sibling delivery/interpretation
 * vocabularies.
 *
 * REFERENCE IMPLEMENTATION (the directive's Layer-3 substrate list):
 * FreeCAD — its Python console / `FreeCADCmd` scripting surface
 * (`App.newDocument`, `doc.addObject("Sketcher::SketchObject", …)`,
 * `PartDesign::Pad/Pocket/…` features, property parameters, the
 * deterministic `doc.recompute()` rebuild, and the Import/Mesh export
 * surfaces). The contract itself is ENGINE-NEUTRAL: a conforming
 * implementation needs NO FreeCAD import to compile against it, which
 * the in-repo substitution doubles prove (../doubles.ts).
 *
 * LAWS (on top of the seam laws, enforced by the doubles + tests):
 *
 *  1. FREECAD DOCUMENT/OBJECT NAMES ARE NAMESPACED EXTERNAL LABELS —
 *     `freecad-document` / `freecad-object` — NEVER canonical AISE
 *     identity. The AISE-side identity is the `modelId` + the AISE-side
 *     sketch/feature ids; the FreeCAD-side names are derived
 *     deterministically (documented pure projection
 *     `freecadObjectNameOf`) so a rebuild reproduces the same external
 *     labels, and they are returned as provenance labels only.
 *  2. DETERMINISTIC REBUILD SEMANTICS — applying the same mutation
 *     sequence to a fresh model produces a BYTE-IDENTICAL content
 *     digest (the parametric model is a pure function of its typed
 *     mutation history). A real FreeCAD adapter honors this by recompute
 *     determinism; the doubles honor it by construction. No clock, no
 *     randomness, no I/O.
 *  3. SKETCH/FEATURE SEMANTICS ARE TYPED — closed vocabularies for
 *     sketch element kinds, constraint kinds and feature kinds; sketch
 *     coordinates are DECLARED on-plane 2D (u, v); numeric parameters
 *     REQUIRE declared units (the shared numeric-value-requires-a-typed-
 *     unit discipline). Violations are typed `contract-mismatch`
 *     refusals naming the field — never a silent coercion.
 *  4. EXACT GEOMETRY DELEGATES TO THE P0-B VOCABULARY — the CAD adapter
 *     NEVER computes authoritative predicates itself: it projects the
 *     model's derived geometry into the P0-B DECLARED shape table
 *     (point/segment/polygon/box) and emits a
 *     `GeometryComputationRequest` (WORLD-P0-B type) whose tolerance is
 *     the request's DECLARATION (refused when absent/out-of-range) and
 *     whose operations come from the P0-B closed vocabulary. The
 *     consumer runs the request through the exact-geometry port; the
 *     near-boundary `within-tolerance` discipline stays with P0-B.
 *  5. EXPORTS FLOW THROUGH THE SIBLING VOCABULARIES — glTF export
 *     produces a P0-A `GltfAssetSource` (validated fail-closed by the
 *     delivery port); IFC export produces STEP text with the P0-B IFC
 *     media type (round-trippable through the interpretation port).
 *     Exported part labels are `gltf-part` external labels — never
 *     canonical identity.
 *  6. UNSUPPORTED IS RECORDED — an operation outside the closed
 *     vocabularies, a numeric parameter without a unit, an unknown
 *     object reference: typed refusals from the HFX-000 vocabulary,
 *     never fabricated output.
 */

import type {
  GeometryComputationRequest,
  GeometryOperation,
  GeometryPoint3,
  GeometryShapeDeclaration,
  GeometryToleranceDeclaration,
  GeometryUnitDeclaration,
} from "@aise/world-understanding-substrate";
import { validateGeometryComputationRequest } from "@aise/world-understanding-substrate";
import type { GltfAssetSource } from "@aise/world-reality-substrate";
import type {
  NamespacedExternalLabel,
  SolutionSubstrateFamily,
  SubstrateOutcome,
  SubstrateResultProvenance,
} from "../seam";
import { isFreecadNameShaped } from "../seam";
import { refused } from "../seam";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const CAD_MODEL_KIND = "parametric-cad-model" as const;
export const CAD_REQUEST_SCHEMA_VERSION = "parametric-cad/1" as const;

/** The closed sketch-element vocabulary (the Sketcher essence). */
export const CAD_SKETCH_ELEMENT_KINDS = [
  "line-segment",
  "circle",
  "arc-of-circle",
  "construction-point",
] as const;
export type CadSketchElementKind = (typeof CAD_SKETCH_ELEMENT_KINDS)[number];

/** The closed sketch-constraint vocabulary. */
export const CAD_SKETCH_CONSTRAINT_KINDS = [
  "coincident",
  "horizontal",
  "vertical",
  "parallel",
  "perpendicular",
  "distance",
  "angle",
  "radius",
  "diameter",
] as const;
export type CadSketchConstraintKind = (typeof CAD_SKETCH_CONSTRAINT_KINDS)[number];

/** The closed feature vocabulary (the PartDesign essence). */
export const CAD_FEATURE_KINDS = [
  "pad",
  "pocket",
  "revolution",
  "fillet",
  "chamfer",
] as const;
export type CadFeatureKind = (typeof CAD_FEATURE_KINDS)[number];

/** Which feature kinds consume a source sketch (the profile carriers). */
export const SKETCH_CONSUMING_FEATURE_KINDS: readonly CadFeatureKind[] = [
  "pad",
  "pocket",
  "revolution",
];

/** Which feature kinds require a parent feature (the edge modifiers). */
export const PARENT_REQUIRING_FEATURE_KINDS: readonly CadFeatureKind[] = [
  "fillet",
  "chamfer",
];

/** The reference-implementation note (the directive's Layer-3 substrate). */
export const CAD_REFERENCE_IMPLEMENTATION_NOTE =
  "2026-10-02 directive Layer-3 substrate list: FreeCAD is the parametric CAD " +
  "reference implementation (its Python console / FreeCADCmd scripting surface), " +
  "adapted BEHIND this engine-neutral contract — never forked, never an " +
  "authority, its document/object names never canonical AISE identity. The " +
  "in-repo doubles prove implementability with zero FreeCAD; a real FreeCAD " +
  "adapter is a future occupant of the port (sidecar-hosted per the desktop " +
  "contract when browser execution is inappropriate).";

/* ------------------------------------------------------------------ */
/* Identity + the FreeCAD name projection (law 1)                       */
/* ------------------------------------------------------------------ */

/** The AISE-side parametric model identity (Solution-lane id space). */
export type CadModelId = string;

/**
 * The documented deterministic projection of an AISE-side object id
 * (sketch/feature id) onto a FreeCAD-compatible object name: the kind
 * prefix + the id with non [A-Za-z0-9_] characters folded to "_". The
 * SAME projection is used by every conforming adapter so external
 * labels are reproducible across hosts. PURE.
 */
export function freecadObjectNameOf(kindPrefix: string, aiseId: string): string {
  const sanitized = aiseId.replace(/[^A-Za-z0-9_]/g, "_");
  return `${kindPrefix}_${sanitized}`;
}

/** Builds a `freecad-object` namespaced external label. */
export function freecadObjectLabel(objectName: string): NamespacedExternalLabel {
  return { namespace: "freecad-object", value: objectName };
}

/** Builds a `freecad-document` namespaced external label. */
export function freecadDocumentLabel(documentName: string): NamespacedExternalLabel {
  return { namespace: "freecad-document", value: documentName };
}

/* ------------------------------------------------------------------ */
/* Sketch semantics (law 3)                                             */
/* ------------------------------------------------------------------ */

/** A declared point in the sketch plane's local 2D coordinates. */
export interface CadPoint2 {
  readonly u: number;
  readonly v: number;
}

/** The sketch plane: an origin + unit normal in model space. */
export interface CadSketchPlane {
  readonly origin: GeometryPoint3;
  readonly normal: readonly [number, number, number];
}

export type CadSketchElement =
  | {
      readonly kind: "line-segment";
      readonly elementId: string;
      readonly from: CadPoint2;
      readonly to: CadPoint2;
    }
  | {
      readonly kind: "circle";
      readonly elementId: string;
      readonly center: CadPoint2;
      readonly radius: number;
    }
  | {
      readonly kind: "arc-of-circle";
      readonly elementId: string;
      readonly center: CadPoint2;
      readonly radius: number;
      readonly startAngleRadians: number;
      readonly endAngleRadians: number;
    }
  | {
      readonly kind: "construction-point";
      readonly elementId: string;
      readonly at: CadPoint2;
    };

export type CadSketchConstraint =
  | {
      readonly kind: "coincident";
      readonly firstElementId: string;
      readonly firstVertex: number;
      readonly secondElementId: string;
      readonly secondVertex: number;
    }
  | { readonly kind: "horizontal" | "vertical"; readonly elementId: string }
  | {
      readonly kind: "parallel" | "perpendicular";
      readonly firstElementId: string;
      readonly secondElementId: string;
    }
  | {
      readonly kind: "distance";
      readonly firstElementId: string;
      readonly value: number;
      readonly unit: string;
    }
  | {
      readonly kind: "angle";
      readonly firstElementId: string;
      readonly secondElementId: string;
      readonly valueRadians: number;
    }
  | {
      readonly kind: "radius" | "diameter";
      readonly elementId: string;
      readonly value: number;
      readonly unit: string;
    };

/** A typed parametric sketch definition (AISE-side identity). */
export interface CadSketchDefinition {
  readonly sketchId: string;
  readonly plane: CadSketchPlane;
  readonly elements: readonly CadSketchElement[];
  readonly constraints: readonly CadSketchConstraint[];
}

/* ------------------------------------------------------------------ */
/* Feature semantics (law 3)                                            */
/* ------------------------------------------------------------------ */

/**
 * One typed feature parameter. `unit` is REQUIRED for numeric values —
 * the numeric-value-requires-a-typed-unit discipline; absent for
 * non-numeric values (material names).
 */
export interface CadFeatureParameter {
  readonly name: string;
  readonly value: number | string;
  readonly unit: string | null;
}

/** A typed PartDesign-style feature definition (AISE-side identity). */
export interface CadFeatureDefinition {
  readonly featureId: string;
  readonly featureKind: CadFeatureKind;
  /** The source sketch (required for pad/pocket/revolution). */
  readonly fromSketchId: string | null;
  /** The parent feature in the feature stack (required for fillet/chamfer). */
  readonly parentFeatureId: string | null;
  readonly parameters: readonly CadFeatureParameter[];
}

/* ------------------------------------------------------------------ */
/* The model + mutations (law 2)                                        */
/* ------------------------------------------------------------------ */

/** The declared model units. */
export interface CadUnitDeclaration {
  readonly linear: string;
  readonly angular: string;
}

/** Opaque handle to a live parametric model held by the adapter. */
export interface CadModelHandle {
  readonly handleKind: "cad-model";
  readonly modelId: CadModelId;
  /** Opaque token — implementations may encode anything; callers treat as opaque. */
  readonly token: string;
  /** The deterministic rebuild revision (0 at creation, +1 per applied mutation). */
  readonly revision: number;
}

/** The create-model request. */
export interface CadCreateModelRequest {
  readonly kind: typeof CAD_MODEL_KIND;
  readonly schemaVersion: typeof CAD_REQUEST_SCHEMA_VERSION;
  /** The AISE-side stable model identity (Solution-lane id space). */
  readonly modelId: CadModelId;
  /** Human label (presentation only). */
  readonly label: string;
  readonly units: CadUnitDeclaration;
  /**
   * The FreeCAD-side document name, carried as a `freecad-document`
   * namespaced external label (never canonical identity).
   */
  readonly documentLabel: NamespacedExternalLabel;
}

export type CadModelMutation =
  | { readonly mutation: "add-sketch"; readonly sketch: CadSketchDefinition }
  | { readonly mutation: "add-feature"; readonly feature: CadFeatureDefinition }
  | {
      readonly mutation: "set-parameter";
      readonly featureId: string;
      readonly parameterName: string;
      readonly value: number | string;
      readonly unit: string | null;
    };

/** The deterministic result of one applied mutation. */
export interface CadModelRevision {
  readonly revision: number;
  /** Canonical digest over the full parametric content (byte-stable). */
  readonly contentDigest: string;
  /** The freecad-object labels of objects this mutation touched/created. */
  readonly objectLabels: readonly NamespacedExternalLabel[];
}

/** The model query result (the typed parametric structure). */
export interface CadModelQueryResult {
  readonly modelId: CadModelId;
  readonly revision: number;
  readonly contentDigest: string;
  readonly documentLabel: NamespacedExternalLabel;
  readonly sketches: readonly CadSketchDefinition[];
  readonly features: readonly CadFeatureDefinition[];
  /** The effective typed parameter bindings (feature params + constraint params). */
  readonly parameters: readonly CadParameterBinding[];
  /** Every freecad-object label in the model (identity stays AISE-side). */
  readonly objectLabels: readonly NamespacedExternalLabel[];
}

export interface CadParameterBinding {
  readonly featureId: string | null;
  readonly parameterName: string;
  readonly value: number | string;
  readonly unit: string | null;
}

/* ------------------------------------------------------------------ */
/* Exact-geometry delegation (law 4 — the P0-B vocabulary)              */
/* ------------------------------------------------------------------ */

/**
 * The DECLARED evaluation spec: everything except the shape table comes
 * from the AISE side; the adapter contributes ONLY the model's derived
 * shape table (a deterministic projection of the parametric content).
 * `tolerance` is the DECLARED comparison tolerance — REQUIRED, strictly
 * positive (the P0-B law 2, delegated verbatim).
 */
export interface CadGeometryEvaluationSpec {
  readonly subjectRef: string;
  readonly evidenceContentId: string;
  readonly recordedAt: string;
  readonly tolerance: GeometryToleranceDeclaration;
  readonly units: GeometryUnitDeclaration;
  /**
   * The P0-B closed-vocabulary operations. Operands are indices into
   * the model's DERIVED shape table (documented order: sketch elements
   * in insertion order, then feature boxes in insertion order) — an
   * out-of-range index or kind mismatch is refused BEFORE any emission.
   */
  readonly operations: readonly GeometryOperation[];
}

/**
 * The derived-shape projection rule (documented, deterministic):
 * sketch elements in insertion order (points → segments), then feature
 * swept regions as axis-aligned boxes in insertion order. Exported so
 * consumers can predict operand indices; the doubles implement it.
 */
export function derivedShapeTableOrder(
  sketches: readonly CadSketchDefinition[],
  features: readonly CadFeatureDefinition[],
): readonly { readonly origin: "sketch" | "feature"; readonly id: string }[] {
  const order: { origin: "sketch" | "feature"; id: string }[] = [];
  for (const sketch of sketches) {
    for (const element of sketch.elements) {
      order.push({ origin: "sketch", id: `${sketch.sketchId}/${element.elementId}` });
    }
  }
  for (const feature of features) {
    order.push({ origin: "feature", id: feature.featureId });
  }
  return order;
}

/* ------------------------------------------------------------------ */
/* Exports (law 5 — the sibling vocabularies)                           */
/* ------------------------------------------------------------------ */

export interface CadGltfExportRequest {
  readonly model: CadModelHandle;
  /** The AISE asset id the export will carry (content-addressed or registered). */
  readonly assetId: string;
  readonly format: "glb" | "gltf-json";
}

/** A glTF export in the P0-A delivery vocabulary (fail-closed on delivery). */
export interface CadGltfExport {
  readonly source: GltfAssetSource;
  /** One part per feature mesh (gltf-part labels — external, asset-scoped). */
  readonly partLabels: readonly NamespacedExternalLabel[];
  readonly provenance: SubstrateResultProvenance;
}

export interface CadIfcExportRequest {
  readonly model: CadModelHandle;
  readonly projectName: string;
  readonly siteName: string;
  readonly buildingName: string;
  readonly storeyName: string;
}

/**
 * An IFC export in the P0-B interpretation vocabulary: STEP text
 * (ISO 10303-21, IFC4) with the `application/ifc` media type —
 * round-trippable through the IFC interpretation port.
 */
export interface CadIfcExport {
  readonly stepText: string;
  readonly mediaType: "application/ifc";
  /** Number of STEP data entities emitted (the deterministic census). */
  readonly entityCount: number;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Capabilities + the port                                              */
/* ------------------------------------------------------------------ */

export interface CadEngineCapabilities {
  readonly supportsSketcher: boolean;
  readonly supportsPartDesign: boolean;
  /** Whether the engine can recompute deterministically (it MUST). */
  readonly deterministicRebuild: true;
  readonly maxObjectsPerDocument: number | null;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The parametric CAD port. FreeCAD (the Python console / FreeCADCmd
 * scripting surface) is the reference occupant; the in-repo substitution
 * doubles (../doubles.ts) prove the contract is implementable with NO
 * FreeCAD at all.
 */
export interface ParametricCadAdapter {
  readonly portId: "cad.parametric/1";
  readonly capabilities: CadEngineCapabilities;

  /** Create a parametric model (a FreeCAD document behind the port). */
  createModel(request: CadCreateModelRequest): SubstrateOutcome<CadModelHandle>;

  /**
   * Apply one typed parametric mutation. Deterministic: the same
   * mutation sequence on a fresh model yields identical content digests.
   * Refuses: unknown references, closed-vocabulary violations, numeric
   * parameters without units, degenerate geometry.
   */
  applyMutation(
    model: CadModelHandle,
    mutation: CadModelMutation,
  ): SubstrateOutcome<CadModelRevision>;

  /** Query the typed parametric structure (identity stays AISE-side). */
  queryModel(model: CadModelHandle): SubstrateOutcome<CadModelQueryResult>;

  /**
   * Export to glTF in the P0-A delivery vocabulary (one part per feature
   * mesh; part labels are asset-scoped external labels).
   */
  exportGltf(model: CadModelHandle, request: CadGltfExportRequest): SubstrateOutcome<CadGltfExport>;

  /**
   * Export to IFC STEP text in the P0-B interpretation vocabulary
   * (round-trippable through the IFC interpretation port).
   */
  exportIfc(model: CadModelHandle, request: CadIfcExportRequest): SubstrateOutcome<CadIfcExport>;

  /**
   * Build an exact-geometry evaluation request in the P0-B vocabulary:
   * the model's DERIVED shape table + the spec's DECLARED tolerance,
   * units, subject, evidence binding and operations. The adapter NEVER
   * computes the predicates — the consumer runs the request through the
   * P0-B exact-geometry port.
   */
  exactGeometryRequest(
    model: CadModelHandle,
    spec: CadGeometryEvaluationSpec,
  ): SubstrateOutcome<GeometryComputationRequest>;

  /** Tear the model down (disposes the substrate-side document). */
  dispose(model: CadModelHandle): SubstrateOutcome<null>;
}

/* ------------------------------------------------------------------ */
/* Shared pure validators (reusable by real adapters)                   */
/* ------------------------------------------------------------------ */

const CAD_FAMILY: SolutionSubstrateFamily = "cad";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Law 3 + law 6 helper — validate a sketch definition structurally.
 * Returns the violation list (empty = valid). PURE.
 */
export function sketchViolations(sketch: CadSketchDefinition): string[] {
  const violations: string[] = [];
  if (sketch.sketchId.trim().length === 0) {
    violations.push("sketchId must be non-empty");
  }
  const { origin, normal } = sketch.plane;
  if (!isFiniteNumber(origin.x) || !isFiniteNumber(origin.y) || !isFiniteNumber(origin.z)) {
    violations.push(`sketch ${sketch.sketchId}: plane origin must be finite`);
  }
  const normalLength = Math.hypot(normal[0] ?? 0, normal[1] ?? 0, normal[2] ?? 0);
  if (!isFiniteNumber(normalLength) || Math.abs(normalLength - 1) > 1e-9) {
    violations.push(`sketch ${sketch.sketchId}: plane normal must be unit length`);
  }
  const elementIds = new Set<string>();
  for (const element of sketch.elements) {
    if (elementIds.has(element.elementId)) {
      violations.push(`sketch ${sketch.sketchId}: duplicate element id ${element.elementId}`);
    }
    elementIds.add(element.elementId);
    switch (element.kind) {
      case "line-segment": {
        if (element.from.u === element.to.u && element.from.v === element.to.v) {
          violations.push(
            `sketch ${sketch.sketchId}: degenerate line-segment ${element.elementId}`,
          );
        }
        break;
      }
      case "circle":
      case "arc-of-circle": {
        if (!(element.radius > 0)) {
          violations.push(`sketch ${sketch.sketchId}: ${element.kind} ${element.elementId} radius must be positive`);
        }
        break;
      }
      case "construction-point":
        break;
    }
  }
  for (const constraint of sketch.constraints) {
    const referenced: string[] = [];
    switch (constraint.kind) {
      case "coincident":
        referenced.push(constraint.firstElementId, constraint.secondElementId);
        break;
      case "parallel":
      case "perpendicular":
      case "angle":
        referenced.push(constraint.firstElementId, constraint.secondElementId);
        break;
      case "horizontal":
      case "vertical":
      case "radius":
      case "diameter":
        referenced.push(constraint.elementId);
        break;
      case "distance":
        referenced.push(constraint.firstElementId);
        break;
    }
    for (const id of referenced) {
      if (!elementIds.has(id)) {
        violations.push(
          `sketch ${sketch.sketchId}: constraint ${constraint.kind} references unknown element ${id}`,
        );
      }
    }
    if (
      (constraint.kind === "distance" || constraint.kind === "radius" || constraint.kind === "diameter") &&
      !(constraint.value > 0)
    ) {
      violations.push(
        `sketch ${sketch.sketchId}: constraint ${constraint.kind} value must be positive`,
      );
    }
    if (
      (constraint.kind === "distance" || constraint.kind === "radius" || constraint.kind === "diameter") &&
      constraint.unit.trim().length === 0
    ) {
      violations.push(
        `sketch ${sketch.sketchId}: constraint ${constraint.kind} requires a declared unit`,
      );
    }
  }
  return violations;
}

/**
 * Law 3 + law 6 helper — validate a feature definition against the
 * model's existing sketches/features. PURE.
 */
export function featureViolations(
  feature: CadFeatureDefinition,
  knownSketchIds: readonly string[],
  knownFeatureIds: readonly string[],
): string[] {
  const violations: string[] = [];
  if (feature.featureId.trim().length === 0) {
    violations.push("featureId must be non-empty");
  }
  if (!(CAD_FEATURE_KINDS as readonly string[]).includes(feature.featureKind)) {
    violations.push(`feature ${feature.featureId}: unknown feature kind ${feature.featureKind}`);
  }
  if (SKETCH_CONSUMING_FEATURE_KINDS.includes(feature.featureKind)) {
    if (feature.fromSketchId === null) {
      violations.push(`feature ${feature.featureId}: ${feature.featureKind} requires a source sketch`);
    } else if (!knownSketchIds.includes(feature.fromSketchId)) {
      violations.push(`feature ${feature.featureId}: unknown source sketch ${feature.fromSketchId}`);
    }
  }
  if (PARENT_REQUIRING_FEATURE_KINDS.includes(feature.featureKind)) {
    if (feature.parentFeatureId === null) {
      violations.push(`feature ${feature.featureId}: ${feature.featureKind} requires a parent feature`);
    } else if (!knownFeatureIds.includes(feature.parentFeatureId)) {
      violations.push(`feature ${feature.featureId}: unknown parent feature ${feature.parentFeatureId}`);
    }
  }
  if (feature.parameters.length === 0) {
    violations.push(`feature ${feature.featureId}: at least one parameter is required`);
  }
  for (const parameter of feature.parameters) {
    if (typeof parameter.value === "number") {
      if (!isFiniteNumber(parameter.value)) {
        violations.push(`feature ${feature.featureId}: parameter ${parameter.name} must be finite`);
      }
      if (parameter.unit === null || parameter.unit.trim().length === 0) {
        violations.push(
          `feature ${feature.featureId}: numeric parameter ${parameter.name} requires a declared unit`,
        );
      }
    }
  }
  return violations;
}

/**
 * Law 1 helper — validate a create-model request (document label shape,
 * units declared, model id present). PURE.
 */
export function createModelViolations(request: CadCreateModelRequest): readonly string[] {
  const violations: string[] = [];
  if (request.modelId.trim().length === 0) {
    violations.push("modelId must be non-empty");
  }
  if (request.label.trim().length === 0) {
    violations.push("label must be non-empty");
  }
  if (request.units.linear.trim().length === 0 || request.units.angular.trim().length === 0) {
    violations.push("units must be declared");
  }
  if (request.documentLabel.namespace !== "freecad-document") {
    violations.push("documentLabel must be a freecad-document namespaced external label");
  }
  if (!isFreecadNameShaped(request.documentLabel.value)) {
    violations.push(`documentLabel value ${request.documentLabel.value} is not FreeCAD-name shaped`);
  }
  return violations;
}

/**
 * Law 4 helper — pre-validate an evaluation spec against a derived
 * shape table (operand indices in range, kinds matching), then validate
 * the assembled P0-B request with the P0-B validator. Returns the
 * violation list (empty = valid). PURE.
 */
export function evaluationSpecViolations(
  spec: CadGeometryEvaluationSpec,
  derivedShapes: readonly GeometryShapeDeclaration[],
): readonly string[] {
  const violations: string[] = [];
  if (spec.tolerance.linear <= 0 || spec.tolerance.angular <= 0) {
    violations.push("tolerance bands must be strictly positive (tolerances are declared, never implicit)");
  }
  for (let index = 0; index < spec.operations.length; index += 1) {
    const operation: GeometryOperation | undefined = spec.operations[index];
    if (operation === undefined) {
      violations.push(`operations[${index}]: missing operation entry`);
      continue;
    }
    const operandFields = operationOperandFields(operation);
    for (const { field, shapeIndex } of operandFields) {
      if (shapeIndex < 0 || shapeIndex >= derivedShapes.length) {
        violations.push(
          `operations[${index}].${field}: shape index ${shapeIndex} is outside the derived shape table (${derivedShapes.length} shapes)`,
        );
        continue;
      }
      const expectedKind = OPERATION_EXPECTED_KIND[operation.operation];
      const shape = derivedShapes[shapeIndex];
      if (shape !== undefined && shape.kind !== expectedKind) {
        violations.push(
          `operations[${index}].${field}: ${operation.operation} needs a ${expectedKind} shape at index ${shapeIndex}, found ${shape.kind}`,
        );
      }
    }
  }
  return violations;
}

/** The shape-kind each P0-B operation consumes (the validation table). */
const OPERATION_EXPECTED_KIND: Readonly<
  Record<GeometryOperation["operation"], "point" | "segment" | "polygon" | "box">
> = {
  "distance-point-point": "point",
  "distance-point-segment": "point",
  "segment-length": "segment",
  "polygon-area": "polygon",
  "box-volume": "box",
  "point-in-polygon": "point",
};

/** The operand fields of a P0-B operation with their shape indices. */
function operationOperandFields(
  operation: GeometryOperation,
): readonly { readonly field: string; readonly shapeIndex: number }[] {
  switch (operation.operation) {
    case "distance-point-point":
      return [
        { field: "a", shapeIndex: operation.a },
        { field: "b", shapeIndex: operation.b },
      ];
    case "distance-point-segment":
      return [
        { field: "point", shapeIndex: operation.point },
        { field: "segment", shapeIndex: operation.segment },
      ];
    case "segment-length":
      return [{ field: "segment", shapeIndex: operation.segment }];
    case "polygon-area":
      return [{ field: "polygon", shapeIndex: operation.polygon }];
    case "box-volume":
      return [{ field: "box", shapeIndex: operation.box }];
    case "point-in-polygon":
      return [
        { field: "point", shapeIndex: operation.point },
        { field: "polygon", shapeIndex: operation.polygon },
      ];
  }
}

/**
 * Law 4 helper — assemble + validate the full P0-B request from a spec
 * and a derived shape table. Returns the typed refusal (already in the
 * lane's outcome shape) or null when the request is well-formed. PURE.
 */
export function assembleGeometryRequest(
  spec: CadGeometryEvaluationSpec,
  derivedShapes: readonly GeometryShapeDeclaration[],
): SubstrateOutcome<GeometryComputationRequest> | null {
  const violations = evaluationSpecViolations(spec, derivedShapes);
  if (violations.length > 0) {
    return refused(
      CAD_FAMILY,
      "contract-mismatch",
      `exact-geometry evaluation spec invalid: ${violations.join("; ")}`,
    );
  }
  const request: GeometryComputationRequest = {
    kind: "geometry-computation-request",
    schemaVersion: "geometry-computation-request/1",
    subjectRef: spec.subjectRef,
    shapes: derivedShapes,
    operations: spec.operations,
    tolerance: spec.tolerance,
    units: spec.units,
    evidenceContentId: spec.evidenceContentId,
    recordedAt: spec.recordedAt,
  };
  const validation = validateGeometryComputationRequest(request);
  if (!validation.ok) {
    return refused(
      CAD_FAMILY,
      "contract-mismatch",
      `the P0-B exact-geometry validator refused the assembled request: ${validation.failures
        .map((f) => `${f.kind}@${f.path}: ${f.detail}`)
        .join("; ")}`,
    );
  }
  return null;
}
