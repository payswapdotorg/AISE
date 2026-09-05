/**
 * The AISE-017 2D plan read view: the serializable projection the
 * plan/elevation workspace displays.
 *
 * The server composes the authoritative model store read (the
 * integrity-checked committed graph) with the deterministic
 * AISE-017 projection (`@aise/backend-export-2d`) and hands the
 * browser ONLY the derived, read-only document. The browser
 * renders vector primitives; it never computes geometry, never
 * holds canonical state, and there is no write affordance
 * anywhere on this surface (the review workspace owns the
 * governed decision path).
 *
 * View enumeration is deterministic and derived from the graph:
 * the plan (viewer above) plus one elevation per DISTINCT wall
 * normal direction (walls facing the viewer project as full
 * polygons; the label states the look direction honestly — the
 * model declares no compass north, so none is invented).
 */
import {
  project2d,
  type Plan2dDocument,
  type Projection2dRequest,
} from "@aise/backend-export-2d";
import type { RealityModelGraph, Vec3 } from "@aise/engineering-model";
import { getVersion, listModels, listVersions } from "@/server/model-store";

/** One selectable view (plan or elevation), derived from the graph. */
export interface Plan2dViewOption {
  /** URL-safe key: "plan" | "elev+x" | "elev-x" | "elev+y" | … */
  readonly key: string;
  /** Honest label — the direction the viewer looks along. */
  readonly label: string;
  readonly request: Projection2dRequest;
}

/** The full read-only 2D workspace view (one model, one version, one view). */
export interface Plan2dWorkspaceView {
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  /** The committed versions the workspace can display. */
  readonly versions: readonly number[];
  readonly graphDigest: string;
  readonly viewKey: string;
  readonly viewLabel: string;
  /** Every selectable view for this model version (deterministic order). */
  readonly availableViews: readonly { readonly key: string; readonly label: string }[];
  /** The derived, read-only plan document (the projection output, verbatim). */
  readonly document: Plan2dDocument;
  /** The drawing bounding box (display convenience, derived — never canonical). */
  readonly drawing: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

/** Typed view-resolution failure (maps to 404 in the page). */
export class Plan2dViewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Plan2dViewError";
  }
}

/** The canonical signed-axis order for elevation enumeration. */
const AXIS_ORDER: readonly { axis: "x" | "y" | "z"; sign: 1 | -1 }[] = [
  { axis: "x", sign: 1 },
  { axis: "x", sign: -1 },
  { axis: "y", sign: 1 },
  { axis: "y", sign: -1 },
  { axis: "z", sign: 1 },
  { axis: "z", sign: -1 },
];

/** Horizontality tolerance — the mirrored upstream ±10° tilt tolerance. */
const HORIZONTAL_TOLERANCE = Math.sin((10 * Math.PI) / 180);

/**
 * Enumerates the deterministic view options for one graph:
 * the plan, then one elevation per distinct horizontal wall-normal
 * direction in canonical signed-axis order.
 */
export function plan2dViews(graph: RealityModelGraph): readonly Plan2dViewOption[] {
  const up = declaredUp(graph);
  const present = new Set<string>();
  for (const object of graph.objects) {
    const structured = object.geometry?.structured;
    if (structured === undefined || object.objectClass !== "WALL") {
      continue;
    }
    const normal = structured.frame.normal;
    if (Math.abs(dot(normal, up)) > HORIZONTAL_TOLERANCE) {
      continue; // not a horizontal-normal wall — no facing elevation
    }
    present.add(signedAxisKey(normal));
  }

  const options: Plan2dViewOption[] = [
    { key: "plan", label: "Plan — viewed from above", request: { kind: "plan" } },
  ];
  for (const { axis, sign } of AXIS_ORDER) {
    const key = `elev${sign > 0 ? "+" : "-"}${axis}`;
    if (present.has(key)) {
      const direction = unitAxis(axis, sign);
      options.push({
        key,
        label: `Elevation — looking ${sign > 0 ? "+" : "−"}${axis.toUpperCase()}`,
        request: { kind: "elevation", viewDirection: direction },
      });
    }
  }
  return Object.freeze(options);
}

/**
 * Composes the full 2D workspace view: authoritative version read →
 * deterministic projection → serializable read-only view.
 * Throws `Plan2dViewError` for unknown models/versions/views.
 */
export function projectPlan2dWorkspace(modelId: string, version: number, viewKey: string): Plan2dWorkspaceView {
  if (!listModels().some((model) => model.modelId === modelId)) {
    throw new Plan2dViewError(`unknown model: ${modelId}`);
  }
  const stored = getVersion(modelId, version);
  if (stored === undefined) {
    throw new Plan2dViewError(`unknown version: ${modelId} v${version}`);
  }
  const graph = stored.graph;
  const options = plan2dViews(graph);
  const selected = options.find((option) => option.key === viewKey);
  if (selected === undefined) {
    throw new Plan2dViewError(`unknown view: ${viewKey}`);
  }

  const document = project2d(graph, selected.request);
  const versions = listVersions(modelId).map((record) => record.version);
  const drawing = drawingBounds(document);

  return {
    modelId,
    projectId: graph.projectId,
    version,
    versions,
    graphDigest: graph.digest,
    viewKey: selected.key,
    viewLabel: selected.label,
    availableViews: Object.freeze(
      options.map((option) => Object.freeze({ key: option.key, label: option.label })),
    ),
    document,
    drawing,
  };
}

/** The declared up axis of the graph's first space (fail closed). */
function declaredUp(graph: RealityModelGraph): Vec3 {
  const frame = graph.spaces[0]?.frame;
  if (frame === undefined) {
    throw new Plan2dViewError("the graph's first space has no declared coordinate frame");
  }
  return frame.up;
}

/** The signed dominant axis key of a (near-)horizontal unit vector. */
function signedAxisKey(vector: Vec3): string {
  const magnitudes: { axis: "x" | "y" | "z"; magnitude: number; sign: 1 | -1 }[] = [
    { axis: "x", magnitude: Math.abs(vector.x), sign: vector.x >= 0 ? 1 : -1 },
    { axis: "y", magnitude: Math.abs(vector.y), sign: vector.y >= 0 ? 1 : -1 },
    { axis: "z", magnitude: Math.abs(vector.z), sign: vector.z >= 0 ? 1 : -1 },
  ];
  magnitudes.sort((a, b) => b.magnitude - a.magnitude || a.axis.localeCompare(b.axis));
  const dominant = magnitudes[0]!;
  return `elev${dominant.sign > 0 ? "+" : "-"}${dominant.axis}`;
}

/** A unit world axis vector. */
function unitAxis(axis: "x" | "y" | "z", sign: 1 | -1): Vec3 {
  const magnitude = sign;
  return { x: axis === "x" ? magnitude : 0, y: axis === "y" ? magnitude : 0, z: axis === "z" ? magnitude : 0 };
}

/**
 * The drawing bounding box over all primitives (display
 * convenience): the plan document coordinates are in the model's
 * declared unit; the shell scales them into its viewBox.
 */
function drawingBounds(document: Plan2dDocument): Plan2dWorkspaceView["drawing"] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const include = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const primitive of document.primitives) {
    if (primitive.kind === "polygon") {
      for (const [x, y] of primitive.points) {
        include(x, y);
      }
    } else {
      include(primitive.start[0], primitive.start[1]);
      include(primitive.end[0], primitive.end[1]);
    }
  }
  if (!Number.isFinite(minX)) {
    // Empty drawings still render: a degenerate unit box (the honest
    // unprojected-everything case).
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
