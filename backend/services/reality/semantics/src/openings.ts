/**
 * Wall opening detection: doors and windows (AISE-010, stage 4).
 *
 * An opening is a coverage GAP: wall points exist around it and on
 * the wall above/below/beside it, but not inside it — exactly how
 * reconstructed point clouds represent doors and windows (the
 * glass or the open doorway returns no points).
 *
 * Method (`opening/grid-gap-v1`), fully deterministic:
 *
 * 1. **Grid** — the wall rectangle is discretized into cells of
 *    `gridResolution` (bounded: `nu·nw ≤ maxGridCells`, else
 *    `BOUNDS_EXCEEDED`). Each cluster point claims the cell whose
 *    CENTER is nearest (round-to-nearest quantization; clamped to
 *    the grid). Round-to-nearest (not floor) is required for
 *    boundary-exact point lattices, where floor marking collides
 *    two adjacent lattice points into one cell and skips the next —
 *    a web of phantom empty cells that connects real gaps across
 *    the whole wall.
 * 2. **Closing** — the occupied mask is dilated by one cell
 *    (morphological closing of the empty set): single-cell holes
 *    (noise-driven drift of sparse one-point-per-cell coverage)
 *    cannot connect real gaps across the wall. Erosion removes a
 *    gap cell only when an OCCUPIED 4-neighbor exists, so gap
 *    cells at the grid boundary survive: floor-contact rows,
 *    side-boundary columns, and top-contact rows are preserved.
 *    Empty features narrower than two cells are below the method's
 *    resolution and are closed (documented, deterministic; such
 *    slivers are far below any opening size criterion).
 * 3. **Gaps** — unoccupied cells of the closed mask are grouped
 *    into 4-connected components (deterministic row-major scan; the
 *    component SET, its bounding box, and its contact flags are
 *    order-independent).
 * 4. **Rect + shape metrics** — each component's bounding rectangle
 *    (cell boundaries, clamped to the wall rectangle), cell area,
 *    and rectangularity (component area / bounding-rectangle area).
 * 5. **Classification** — see `classifyGap`. The DISCRIMINATOR
 *    between a door and a window is bottom contact: a door reaches
 *    the floor (within `doorFloorTolerance`), a window does not
 *    (sill ≥ `windowMinSill`). Gaps that touch the wall's side
 *    boundaries are reported unclassified (likely segmentation
 *    edges, not openings); gaps that touch the top without the
 *    bottom are reported unclassified (window vs. incomplete wall
 *    capture is indistinguishable — honesty over guessing).
 *
 * Uncertainty (first-order, documented, never silently dropped):
 * opening edges are grid-quantized — per-edge σ = res/√12
 * (rectangular distribution over one cell; the closing erosion of
 * one cell at interior edges is inside that budget); a dimension
 * (difference of two edges) carries σ = √2·res/√12 = res/√6. When
 * the caller states per-point σ, the point-extreme contribution is
 * combined by RSS (single edge: σ_pt; dimension: √2·σ_pt).
 *
 * Unclassified gaps are REPORTED with reasons, never silently
 * dropped (lack of classification is not absence of an opening).
 */
import { SemanticsError } from "./errors.js";
import {
  assertNonNegativeNumber,
  assertPositiveInteger,
  assertPositiveNumber,
} from "./validate.js";
import type { PlaneFrame, PlaneRectangle } from "./structure.js";
import type { GeomPoint, LengthUnit, Measurement } from "@aise/backend-geometry";

/** Method label for wall opening detection. */
export const OPENING_METHOD = "opening/grid-gap-v1";

/** Default grid cell size, in the input unit. */
export const DEFAULT_GRID_RESOLUTION = 0.05;

/** Default minimum opening width (input unit). */
export const DEFAULT_MIN_OPENING_WIDTH = 0.4;

/** Default minimum opening height (input unit). */
export const DEFAULT_MIN_OPENING_HEIGHT = 0.35;

/** Default minimum opening area (unit²). */
export const DEFAULT_MIN_OPENING_AREA = 0.15;

/** Default minimum rectangularity (component area / bounding-rect area). */
export const DEFAULT_RECTANGULARITY_THRESHOLD = 0.6;

/** Default floor-contact tolerance for doors (input unit). */
export const DEFAULT_DOOR_FLOOR_TOLERANCE = 0.15;

/** Default minimum door height (input unit). */
export const DEFAULT_DOOR_MIN_HEIGHT = 1.5;

/** Default maximum door height (input unit) — above this a floor-contacting gap is an open slot, not a door. */
export const DEFAULT_DOOR_MAX_HEIGHT = 2.4;

/** Default minimum window sill height above the wall bottom (input unit). */
export const DEFAULT_WINDOW_MIN_SILL = 0.25;

/** Default cap on grid cells per wall (bounded compute). */
export const DEFAULT_MAX_GRID_CELLS = 40000;

/** Options for opening detection (all validated, all recorded). */
export interface OpeningOptions {
  readonly gridResolution?: number;
  readonly minOpeningWidth?: number;
  readonly minOpeningHeight?: number;
  readonly minOpeningArea?: number;
  readonly rectangularityThreshold?: number;
  readonly doorFloorTolerance?: number;
  readonly doorMinHeight?: number;
  readonly doorMaxHeight?: number;
  readonly windowMinSill?: number;
  readonly maxGridCells?: number;
}

/** Fully materialized opening options (provenance record). */
export type OpeningSettings = Required<OpeningOptions>;

/** The wall context opening detection operates on. */
export interface WallContext {
  /** Wall cluster points (inliers of the wall plane fit). */
  readonly points: readonly GeomPoint[];
  readonly frame: PlaneFrame;
  readonly rectangle: PlaneRectangle;
  readonly unit: LengthUnit;
  /** Isotropic per-axis 1σ of point positions, in `unit` (optional). */
  readonly perPointStandardUncertainty?: number;
}

/** A gap rectangle in wall-frame coordinates (relative to the rectangle origin). */
export interface GapRectangle {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

/** Deterministic shape metrics of one gap. */
export interface GapMetrics {
  readonly cellCount: number;
  readonly area: number;
  readonly rectangularity: number;
  readonly bottomContact: boolean;
  readonly topContact: boolean;
  readonly sideContact: boolean;
}

/** A classified door/window opening. */
export interface OpeningRecord {
  readonly kind: "DOOR" | "WINDOW";
  /** Gap rectangle in wall-frame coordinates (relative to wall rectangle origin). */
  readonly rect: GapRectangle;
  /** Absolute 3D corners (canonical order, on the wall plane). */
  readonly corners: readonly GeomPoint[];
  /** Absolute 3D center (on the wall plane). */
  readonly center: GeomPoint;
  readonly metrics: GapMetrics;
  readonly measurements: {
    readonly width: Measurement;
    readonly height: Measurement;
    /** Window only: sill height above the wall bottom. */
    readonly sillHeight?: Measurement;
    /** Door/window: head height above the wall bottom. */
    readonly headHeight?: Measurement;
  };
}

/** A gap that was detected but not classified (reported, never dropped). */
export interface UnclassifiedGap {
  readonly rect: GapRectangle;
  readonly width: number;
  readonly height: number;
  readonly reason: string;
}

/** Opening detection result for one wall. */
export interface WallOpenings {
  readonly doors: readonly OpeningRecord[];
  readonly windows: readonly OpeningRecord[];
  readonly unclassified: readonly UnclassifiedGap[];
}

/** Validates and materializes opening options with defaults. */
export function openingSettings(options: OpeningOptions = {}): OpeningSettings {
  const gridResolution = assertPositiveNumber(options.gridResolution ?? DEFAULT_GRID_RESOLUTION, "gridResolution");
  const minOpeningWidth = assertPositiveNumber(options.minOpeningWidth ?? DEFAULT_MIN_OPENING_WIDTH, "minOpeningWidth");
  const minOpeningHeight = assertPositiveNumber(options.minOpeningHeight ?? DEFAULT_MIN_OPENING_HEIGHT, "minOpeningHeight");
  const minOpeningArea = assertPositiveNumber(options.minOpeningArea ?? DEFAULT_MIN_OPENING_AREA, "minOpeningArea");
  const rectangularityThreshold = assertPositiveNumber(
    options.rectangularityThreshold ?? DEFAULT_RECTANGULARITY_THRESHOLD,
    "rectangularityThreshold",
  );
  if (rectangularityThreshold > 1) {
    throw new SemanticsError("VALIDATION_FAILED", "rectangularityThreshold must be ≤ 1", {
      details: { rectangularityThreshold },
    });
  }
  const doorFloorTolerance = assertNonNegativeNumber(
    options.doorFloorTolerance ?? DEFAULT_DOOR_FLOOR_TOLERANCE,
    "doorFloorTolerance",
  );
  const doorMinHeight = assertPositiveNumber(options.doorMinHeight ?? DEFAULT_DOOR_MIN_HEIGHT, "doorMinHeight");
  const doorMaxHeight = assertPositiveNumber(options.doorMaxHeight ?? DEFAULT_DOOR_MAX_HEIGHT, "doorMaxHeight");
  if (doorMaxHeight < doorMinHeight) {
    throw new SemanticsError("VALIDATION_FAILED", "doorMaxHeight must be ≥ doorMinHeight", {
      details: { doorMinHeight, doorMaxHeight },
    });
  }
  const windowMinSill = assertNonNegativeNumber(options.windowMinSill ?? DEFAULT_WINDOW_MIN_SILL, "windowMinSill");
  const maxGridCells = assertPositiveInteger(options.maxGridCells ?? DEFAULT_MAX_GRID_CELLS, "maxGridCells");
  return {
    gridResolution,
    minOpeningWidth,
    minOpeningHeight,
    minOpeningArea,
    rectangularityThreshold,
    doorFloorTolerance,
    doorMinHeight,
    doorMaxHeight,
    windowMinSill,
    maxGridCells,
  };
}

/** One connected empty region, internally. */
interface GapComponent {
  readonly iuMin: number;
  readonly iuMax: number;
  readonly iwMin: number;
  readonly iwMax: number;
  readonly cellCount: number;
}

/**
 * Dilates the occupied mask by one cell (4-neighborhood, no wrap
 * at the grid boundary): the morphological closing of the empty
 * set. Seals single-cell holes so sparse coverage noise cannot
 * connect real gaps across the wall. Deterministic pure function
 * of the mask. Gap cells at the grid boundary survive (erosion
 * only removes cells with an OCCUPIED 4-neighbor), preserving
 * floor/side/top contact detection.
 */
function dilateOccupied(occupied: Uint8Array, nu: number, nw: number): Uint8Array {
  const dilated = new Uint8Array(occupied.length);
  for (let iw = 0; iw < nw; iw += 1) {
    for (let iu = 0; iu < nu; iu += 1) {
      const cell = iw * nu + iu;
      if (occupied[cell] !== 1) {
        continue;
      }
      dilated[cell] = 1;
      if (iu > 0) {
        dilated[cell - 1] = 1;
      }
      if (iu < nu - 1) {
        dilated[cell + 1] = 1;
      }
      if (iw > 0) {
        dilated[cell - nu] = 1;
      }
      if (iw < nw - 1) {
        dilated[cell + nu] = 1;
      }
    }
  }
  return dilated;
}

/** Scans the occupancy grid and returns gap components (row-major deterministic scan). */
function findGapComponents(
  occupied: Uint8Array,
  nu: number,
  nw: number,
): GapComponent[] {
  const visited = new Uint8Array(nu * nw);
  const components: GapComponent[] = [];
  const stack: number[] = [];
  for (let iw = 0; iw < nw; iw += 1) {
    for (let iu = 0; iu < nu; iu += 1) {
      const start = iw * nu + iu;
      if (occupied[start] === 1 || visited[start] === 1) {
        continue;
      }
      // New component: deterministic BFS over 4-connectivity.
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      let iuMin = iu;
      let iuMax = iu;
      let iwMin = iw;
      let iwMax = iw;
      let cellCount = 0;
      while (stack.length > 0) {
        const cell = stack.pop() as number;
        cellCount += 1;
        const cw = Math.floor(cell / nu);
        const cu = cell - cw * nu;
        if (cu < iuMin) iuMin = cu;
        if (cu > iuMax) iuMax = cu;
        if (cw < iwMin) iwMin = cw;
        if (cw > iwMax) iwMax = cw;
        // Fixed neighbor order: left, right, down, up.
        const neighbors = [cell - 1, cell + 1, cell - nu, cell + nu];
        for (const nb of neighbors) {
          if (nb < 0 || nb >= nu * nw) {
            continue;
          }
          const nwRow = Math.floor(nb / nu);
          const nbRowOk =
            (nb === cell - 1 || nb === cell + 1) ? nwRow === cw : true;
          if (!nbRowOk || occupied[nb] === 1 || visited[nb] === 1) {
            continue;
          }
          visited[nb] = 1;
          stack.push(nb);
        }
      }
      components.push({ iuMin, iuMax, iwMin, iwMax, cellCount });
    }
  }
  return components;
}

/** Absolute 3D point for wall-frame coordinates (u, v) relative to the rectangle origin. */
function framePoint(wall: WallContext, u: number, v: number): GeomPoint {
  const f = wall.frame;
  const pu = wall.rectangle.uMin + u;
  const pv = wall.rectangle.vMin + v;
  return {
    x: f.planePoint.x + f.axisU.x * pu + f.axisV.x * pv,
    y: f.planePoint.y + f.axisU.y * pu + f.axisV.y * pv,
    z: f.planePoint.z + f.axisU.z * pu + f.axisV.z * pv,
  };
}

/** Builds a measurement with the documented grid uncertainty model. */
function gridMeasurement(
  value: number,
  unit: LengthUnit,
  sigmaGrid: number,
  sigmaPointContribution: number | undefined,
): Measurement {
  const u =
    sigmaPointContribution !== undefined
      ? Math.sqrt(sigmaGrid * sigmaGrid + sigmaPointContribution * sigmaPointContribution)
      : sigmaGrid;
  return { value, unit, uncertainty: { kind: "standard", u } };
}

/**
 * Detects and classifies openings in one wall. Deterministic; gaps
 * that fail classification are reported with reasons (never
 * dropped). Fail-closed on invalid options, oversized grids, and
 * impossible derived geometry (`GEOMETRY_CONTRADICTION`).
 */
export function findWallOpenings(wall: WallContext, options: OpeningOptions = {}): WallOpenings {
  const settings = openingSettings(options);
  const res = settings.gridResolution;
  const width = wall.rectangle.uMax - wall.rectangle.uMin;
  const height = wall.rectangle.vMax - wall.rectangle.vMin;
  if (width <= 0 || height <= 0) {
    throw new SemanticsError("GEOMETRY_CONTRADICTION", "wall rectangle extents must be positive", {
      details: { width: String(width), height: String(height) },
    });
  }
  const nu = Math.max(1, Math.ceil(width / res));
  const nw = Math.max(1, Math.ceil(height / res));
  if (nu * nw > settings.maxGridCells) {
    throw new SemanticsError(
      "BOUNDS_EXCEEDED",
      `opening grid exceeds the bounded-compute cap of ${settings.maxGridCells} cells (${nu}×${nw} at resolution ${res}) — increase gridResolution or downsample`,
      { details: { cap: settings.maxGridCells, nu, nw, gridResolution: res } },
    );
  }

  // Occupancy: each point claims the cell whose CENTER is nearest
  // (round-to-nearest quantization). Boundary-exact point lattices
  // (reconstruction grids) make `floor` marking collide two adjacent
  // points into one cell and skip the next — a web of phantom empty
  // cells that connects real gaps across the wall. Round-to-nearest
  // maps a lattice of spacing ≥ res to consecutive cells regardless
  // of sub-cell offset, and bounds the worst-case edge error at
  // ±0.5·res (the res/√12 rectangular per-edge uncertainty model).
  const occupied = new Uint8Array(nu * nw);
  const f = wall.frame;
  for (const p of wall.points) {
    const du = (p.x - f.planePoint.x) * f.axisU.x + (p.y - f.planePoint.y) * f.axisU.y + (p.z - f.planePoint.z) * f.axisU.z;
    const dv = (p.x - f.planePoint.x) * f.axisV.x + (p.y - f.planePoint.y) * f.axisV.y + (p.z - f.planePoint.z) * f.axisV.z;
    let iu = Math.floor((du - wall.rectangle.uMin) / res + 0.5);
    let iw = Math.floor((dv - wall.rectangle.vMin) / res + 0.5);
    if (iu < 0) iu = 0;
    if (iu > nu - 1) iu = nu - 1;
    if (iw < 0) iw = 0;
    if (iw > nw - 1) iw = nw - 1;
    occupied[iw * nu + iu] = 1;
  }

  const sigmaEdgeGrid = res / Math.sqrt(12);
  const sigmaDimGrid = Math.SQRT2 * sigmaEdgeGrid;
  const sigmaPoint = wall.perPointStandardUncertainty;
  const sigmaPointEdge = sigmaPoint !== undefined && sigmaPoint > 0 ? sigmaPoint : undefined;
  const sigmaPointDim =
    sigmaPoint !== undefined && sigmaPoint > 0 ? Math.SQRT2 * sigmaPoint : undefined;

  const doors: OpeningRecord[] = [];
  const windows: OpeningRecord[] = [];
  const unclassified: UnclassifiedGap[] = [];

  const components = findGapComponents(dilateOccupied(occupied, nu, nw), nu, nw);
  for (const component of components) {
    // Cell-boundary rectangle (relative to the wall rectangle origin), clamped.
    const uMin = component.iuMin * res;
    const uMax = Math.min((component.iuMax + 1) * res, width);
    const vMin = component.iwMin * res;
    const vMax = Math.min((component.iwMax + 1) * res, height);
    const gapWidth = uMax - uMin;
    const gapHeight = vMax - vMin;
    const area = component.cellCount * res * res;
    const rectArea = gapWidth * gapHeight;
    const rectangularity = rectArea > 0 ? area / rectArea : 0;

    const bottomContact = vMin <= settings.doorFloorTolerance;
    const topContact = height - vMax <= settings.doorFloorTolerance;
    const sideContact = component.iuMin === 0 || component.iuMax === nu - 1;

    const fail = (reason: string): void => {
      unclassified.push({ rect: { uMin, uMax, vMin, vMax }, width: gapWidth, height: gapHeight, reason });
    };

    if (
      gapWidth < settings.minOpeningWidth ||
      gapHeight < settings.minOpeningHeight ||
      area < settings.minOpeningArea ||
      rectangularity < settings.rectangularityThreshold
    ) {
      fail("gap does not meet opening size/shape criteria");
      continue;
    }
    if (sideContact) {
      fail("gap reaches the wall side boundary — likely a segmentation edge or partial wall, not an opening");
      continue;
    }
    if (bottomContact) {
      if (gapHeight >= settings.doorMinHeight && gapHeight <= settings.doorMaxHeight) {
        doors.push(
          buildOpening("DOOR", wall, { uMin, uMax, vMin, vMax }, {
            cellCount: component.cellCount,
            area,
            rectangularity,
            bottomContact,
            topContact,
            sideContact,
          }, {
            sigmaDimGrid,
            sigmaEdgeGrid,
            sigmaPointDim,
            sigmaPointEdge,
          }),
        );
        continue;
      }
      if (gapHeight > settings.doorMaxHeight) {
        fail("floor-to-ceiling gap — open partition or missing wall, not a door");
        continue;
      }
      fail("gap contacts the floor but its height is below the door minimum");
      continue;
    }
    if (topContact) {
      fail("gap reaches the wall top without floor contact — window vs. incomplete capture is indistinguishable");
      continue;
    }
    const sill = vMin;
    if (sill < settings.windowMinSill) {
      fail("gap is near the floor without floor contact — below the minimum window sill");
      continue;
    }
    windows.push(
      buildOpening("WINDOW", wall, { uMin, uMax, vMin, vMax }, {
        cellCount: component.cellCount,
        area,
        rectangularity,
        bottomContact,
        topContact,
        sideContact,
      }, {
        sigmaDimGrid,
        sigmaEdgeGrid,
        sigmaPointDim,
        sigmaPointEdge,
      }),
    );
  }

  return { doors, windows, unclassified };
}

/** Assembles one classified opening record (guards included). */
function buildOpening(
  kind: "DOOR" | "WINDOW",
  wall: WallContext,
  rect: GapRectangle,
  metrics: GapMetrics,
  sigmas: {
    sigmaDimGrid: number;
    sigmaEdgeGrid: number;
    sigmaPointDim: number | undefined;
    sigmaPointEdge: number | undefined;
  },
): OpeningRecord {
  const width = rect.uMax - rect.uMin;
  const height = rect.vMax - rect.vMin;
  const sill = rect.vMin;
  if (width <= 0 || height <= 0 || sill < 0) {
    throw new SemanticsError(
      "GEOMETRY_CONTRADICTION",
      "opening rectangle must be positive and inside the wall — impossible derived geometry",
      { details: { width: String(width), height: String(height), sill: String(sill) } },
    );
  }
  const wallHeight = wall.rectangle.vMax - wall.rectangle.vMin;
  if (height > wallHeight) {
    throw new SemanticsError(
      "GEOMETRY_CONTRADICTION",
      "opening height exceeds its wall height — impossible derived geometry",
      { details: { openingHeight: String(height), wallHeight: String(wallHeight) } },
    );
  }
  const corners = [
    framePoint(wall, rect.uMin, rect.vMin),
    framePoint(wall, rect.uMax, rect.vMin),
    framePoint(wall, rect.uMax, rect.vMax),
    framePoint(wall, rect.uMin, rect.vMax),
  ];
  const center = framePoint(wall, (rect.uMin + rect.uMax) / 2, (rect.vMin + rect.vMax) / 2);
  const measurements: OpeningRecord["measurements"] = {
    width: gridMeasurement(width, wall.unit, sigmas.sigmaDimGrid, sigmas.sigmaPointDim),
    height: gridMeasurement(height, wall.unit, sigmas.sigmaDimGrid, sigmas.sigmaPointDim),
    ...(kind === "WINDOW"
      ? { sillHeight: gridMeasurement(sill, wall.unit, sigmas.sigmaEdgeGrid, sigmas.sigmaPointEdge) }
      : {}),
    headHeight: gridMeasurement(rect.vMax, wall.unit, sigmas.sigmaEdgeGrid, sigmas.sigmaPointEdge),
  };
  return { kind, rect, corners, center, metrics, measurements };
}
