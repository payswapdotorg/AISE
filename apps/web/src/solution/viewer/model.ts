/**
 * PROD-024 — the workspace VIEWER MODEL: the observed scene + the proposed
 * overlays projected from ENGINE-RECORDED operations.
 *
 * OBSERVED (authoritative) side: `ObservedScene` is READ-ONLY display data
 * received via the workspace props (the case context's current-building
 * reality, pinned to the solution's `baselineRealityVersionId`). The
 * workspace NEVER computes, derives or mutates it — every mutation flows
 * through the engine service into PROPOSED states (§4.3 of the work
 * order: proposed reality can never overwrite authoritative reality).
 *
 * PROPOSED side: `proposedOverlaysOf` projects the ENGINE-RECORDED
 * operations of the viewed state layers into wireframe overlay shapes —
 * boxes/quads anchored to the observed scene's anchor frames, dimensioned
 * by the operation's own typed parameters (resolved through the ENGINE's
 * `resolveNumericParameter` — never a second unit semantics) and colored
 * by the ENGINE-RECORDED effect directions (added/removed). This is
 * PRESENTATION GEOMETRY ONLY: the quantities, deltas and identities shown
 * alongside always come verbatim from the engine's operation records and
 * effects — the overlay never computes an engineering number.
 */

import type {
  EngineeringOperation,
  OperationTarget,
  SolutionVersion,
  TargetGeometryRef,
} from "../../../../../packages/solution-contract/src/index";
// PROD-031 (the browser-safe cut): `resolveNumericParameter` is imported
// from the engine's OWN units module (the module that defines it) rather
// than the engine barrel — the barrel re-exports the crypto-dependent
// state/identity derivations (node:crypto at module scope), which a
// plain-browser bundle externalizes, while `units.ts` is pure typed-unit
// arithmetic. SAME function, SAME module it is defined in — never a
// second unit semantics.
import { resolveNumericParameter } from "../../../../../packages/solution-engine/src/units";

/** A 3D world point in metres (x east, y north, z up). */
export type Vec3 = readonly [number, number, number];

/* ------------------------------------------------------------------ */
/* The observed scene (read-only authoritative display data)            */
/* ------------------------------------------------------------------ */

/** One observed fact rendered in the selection inspector. */
export interface SceneFact {
  readonly label: string;
  readonly value: string;
}

/**
 * An anchoring frame on the observed scene: where operation overlays
 * attach (origin + length axis + up axis + the anchor's own extents).
 */
export interface SceneAnchor {
  readonly origin: Vec3;
  /** Unit vector along the element's length (e.g. a wall's run). */
  readonly lengthAxis: readonly [number, number, number];
  /** Unit vector "outward" (perpendicular to length, in the ground plane). */
  readonly outAxis: readonly [number, number, number];
  /** The anchor's observed length along `lengthAxis` (m). */
  readonly anchorLength: number;
  /** The anchor's observed height along z (m). */
  readonly anchorHeight: number;
}

/** One element of the observed building (walls, floors, site regions…). */
export interface SceneElement {
  /** Stable id (the Reality-Graph node id — the cross-pane anchor). */
  readonly elementId: string;
  /** Real-world wording (no AISE-internal jargon). */
  readonly label: string;
  readonly kind: "wall" | "floor" | "site" | "roof" | "opening";
  /** How operations anchor here (the contract's selector vocabulary). */
  readonly selectorKind: OperationTarget["selectorKind"];
  /** Read-only Reality-Graph node references. */
  readonly nodeRefs: readonly string[];
  /** Read-only deterministic geometry references. */
  readonly geometryRefs: readonly TargetGeometryRef[];
  /** Boundary polygons in world metres (rendered verbatim). */
  readonly polygons: readonly (readonly Vec3[])[];
  /** The anchoring frame for operation overlays. */
  readonly anchor: SceneAnchor;
  /** Observed facts (displayed verbatim; never recomputed). */
  readonly facts: readonly SceneFact[];
}

/** The observed current-building reality (props; strictly read-only). */
export interface ObservedScene {
  /** The pinned Reality-Graph version this scene is a view of. */
  readonly realityVersionId: string;
  readonly elements: readonly SceneElement[];
}

/* ------------------------------------------------------------------ */
/* Proposed overlay shapes (projections of engine-recorded operations)  */
/* ------------------------------------------------------------------ */

/** Whether an overlay adds or removes visible material. */
export type OverlayDirection = "added" | "removed" | "changed";

/** One wireframe overlay shape projected from one engine-recorded operation. */
export interface ProposedOverlay {
  /** The engine-recorded operation this shape projects (join key). */
  readonly operationId: string;
  /** The operation's 1-based index in its version (join key). */
  readonly operationIndex: number;
  readonly operationType: string;
  /** The layer from which this overlay is visible (its state index). */
  readonly visibleFromStateIndex: number;
  readonly label: string;
  readonly direction: OverlayDirection;
  /** Wireframe polygons in world metres. */
  readonly polygons: readonly (readonly Vec3[])[];
  /** The observed element ids this overlay anchors to (isolation join key). */
  readonly anchoredElementIds: readonly string[];
  /** The observed node refs the operation targets (isolation join key). */
  readonly affectedNodeRefs: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Overlay projection (pure, deterministic)                             */
/* ------------------------------------------------------------------ */

/** Resolves one numeric parameter to canonical metres through the ENGINE. */
function metresOf(
  operation: EngineeringOperation,
  name: string,
): number | undefined {
  const parameter = operation.parameters.find((entry) => entry.name === name);
  if (parameter === undefined) {
    return undefined;
  }
  const resolved = resolveNumericParameter(parameter, "linear");
  return resolved.ok ? resolved.resolved.canonicalValue : undefined;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: readonly [number, number, number], k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** A quad on the ground plane at height z (origin + axes + extents). */
function groundQuad(
  origin: Vec3,
  lengthAxis: readonly [number, number, number],
  outAxis: readonly [number, number, number],
  length: number,
  width: number,
  z: number,
): readonly Vec3[] {
  const base: Vec3 = [origin[0], origin[1], origin[2] + z];
  return [
    base,
    add(base, scale(lengthAxis, length)),
    add(add(base, scale(lengthAxis, length)), scale(outAxis, width)),
    add(base, scale(outAxis, width)),
  ];
}

/**
 * Projects one ENGINE-RECORDED operation into wireframe overlay polygons,
 * anchored to the observed element its target references. Operations whose
 * parameters cannot be resolved to metres answer NO overlay shape (the
 * quantities pane still renders the engine's effects — the viewer never
 * invents geometry).
 */
export function overlayOfOperation(
  operation: EngineeringOperation,
  scene: ObservedScene,
): ProposedOverlay | undefined {
  const element = scene.elements.find((candidate) =>
    candidate.geometryRefs.some((ref) =>
      operation.target.geometryRefs.some((targetRef) => targetRef.ref === ref.ref),
    ) || candidate.nodeRefs.some((ref) => operation.target.nodeRefs.includes(ref)),
  );
  if (element === undefined) {
    return undefined;
  }
  const anchor = element.anchor;
  const direction = overlayDirectionOf(operation);
  const polygons = overlayPolygonsOf(operation, anchor);
  if (polygons === undefined) {
    return undefined;
  }
  return {
    operationId: operation.operationId,
    operationIndex: operation.operationIndex,
    operationType: operation.operationType,
    visibleFromStateIndex: operation.operationIndex,
    label: overlayLabelOf(operation, element),
    direction,
    polygons,
    anchoredElementIds: [element.elementId],
    affectedNodeRefs: [...operation.target.nodeRefs],
  };
}

/** The overlay direction from the ENGINE-RECORDED quantity effects. */
function overlayDirectionOf(operation: EngineeringOperation): OverlayDirection {
  for (const effect of operation.effects) {
    if (effect.effectKind === "quantity-impact" && effect.direction !== undefined) {
      return effect.direction;
    }
  }
  return "changed";
}

function overlayPolygonsOf(
  operation: EngineeringOperation,
  anchor: SceneAnchor,
): readonly (readonly Vec3[])[] | undefined {
  const origin = anchor.origin;
  const lengthAxis = anchor.lengthAxis;
  const outAxis = anchor.outAxis;
  switch (operation.operationType) {
    case "excavation":
    case "backfill": {
      const width = metresOf(operation, "width") ?? anchor.anchorLength;
      const length = metresOf(operation, "length") ?? width;
      const depth = metresOf(operation, "depth") ?? 0;
      if (depth <= 0) {
        return undefined;
      }
      const top = groundQuad(origin, lengthAxis, outAxis, length, width, 0);
      const bottom = groundQuad(origin, lengthAxis, outAxis, length, width, -depth);
      return [top, bottom];
    }
    case "demolition-removal": {
      const length = metresOf(operation, "length") ?? anchor.anchorLength;
      const height = metresOf(operation, "height") ?? anchor.anchorHeight;
      const face: Vec3[] = [
        origin,
        add(origin, scale(lengthAxis, length)),
        add(origin, [lengthAxis[0] * length, lengthAxis[1] * length, height]),
        [origin[0], origin[1], origin[2] + height],
      ];
      return [face];
    }
    case "block-wall-placement":
    case "foundation-placement":
    case "slab-placement": {
      const length = metresOf(operation, "length") ?? anchor.anchorLength;
      const height = metresOf(operation, "height") ?? metresOf(operation, "depth") ?? metresOf(operation, "thickness") ?? 0.2;
      const thickness = metresOf(operation, "thickness") ?? metresOf(operation, "width") ?? 0.2;
      if (length <= 0 || height <= 0 || thickness <= 0) {
        return undefined;
      }
      const outer = groundQuad(origin, lengthAxis, outAxis, length, thickness, 0);
      const top = groundQuad(origin, lengthAxis, outAxis, length, thickness, height);
      return [outer, top];
    }
    case "plaster-application":
    case "finish-application": {
      const thickness = metresOf(operation, "thickness") ?? 0.02;
      const length = anchor.anchorLength;
      const height = anchor.anchorHeight;
      const offset = scale(outAxis, thickness);
      const face: Vec3[] = [
        add(origin, offset),
        add(add(origin, scale(lengthAxis, length)), offset),
        add(add(origin, scale(lengthAxis, length)), [offset[0], offset[1], offset[2] + height]),
        add(origin, [offset[0], offset[1], offset[2] + height]),
      ];
      return [face];
    }
    case "opening-creation": {
      const width = metresOf(operation, "width") ?? 0.9;
      const height = metresOf(operation, "height") ?? 2.1;
      const inset = scale(lengthAxis, Math.max(0, (anchor.anchorLength - width) / 2));
      const base = add(origin, inset);
      return [
        [
          base,
          add(base, scale(lengthAxis, width)),
          add(base, [lengthAxis[0] * width, lengthAxis[1] * width, height]),
          [base[0], base[1], base[2] + height],
        ],
      ];
    }
    case "building-service-installation": {
      const length = metresOf(operation, "length") ?? anchor.anchorLength;
      const base = add(origin, [0, 0, 0.1]);
      return [
        [
          base,
          add(base, scale(lengthAxis, length)),
          add(add(base, scale(lengthAxis, length)), [0, 0, 0.1]),
          add(base, [0, 0, 0.1]),
        ],
      ];
    }
    default:
      return undefined;
  }
}

/** Real-world wording of one overlay (no internal jargon). */
function overlayLabelOf(operation: EngineeringOperation, element: SceneElement): string {
  const material = operation.parameters.find((parameter) => parameter.name === "material");
  const materialText =
    material !== undefined && typeof material.value === "string" ? ` (${material.value})` : "";
  const names: Record<string, string> = {
    excavation: "Excavated pit",
    backfill: "Backfilled volume",
    "demolition-removal": "Removed section",
    "block-wall-placement": "New block wall",
    "foundation-placement": "New footing",
    "slab-placement": "New slab",
    "opening-creation": "New opening",
    "plaster-application": "Plaster coat",
    "finish-application": "Finish coat",
    "building-service-installation": "Service run",
  };
  const name = names[operation.operationType] ?? operation.operationType;
  return `${name}${materialText} — ${element.label}`;
}

/**
 * The proposed overlays visible at one timeline position: the projections
 * of the operations applied in layers 1..stateIndex of the version (each
 * overlay appears from the layer its engine operation produced).
 */
export function proposedOverlaysOf(
  version: SolutionVersion,
  scene: ObservedScene,
  stateIndex: number,
): readonly ProposedOverlay[] {
  const overlays: ProposedOverlay[] = [];
  const applied = new Set(version.states[stateIndex]?.appliedOperationIds ?? []);
  for (const operation of version.operations) {
    if (!applied.has(operation.operationId)) {
      continue;
    }
    const overlay = overlayOfOperation(operation, scene);
    if (overlay !== undefined) {
      overlays.push(overlay);
    }
  }
  return overlays;
}
