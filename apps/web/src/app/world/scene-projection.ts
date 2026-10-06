/**
 * WORLD-P5 Mount 1 — the station VIEWPORT PROJECTION (the declared-
 * geometry projection the real Babylon mount renders).
 *
 * THE LAW THIS MODULE HOLDS: every box below is DECLARED data, never
 * invented —
 *   - plan elements render their DECLARED comparable shapes (the P0-B
 *     box vocabulary the plan model carries);
 *   - capture elements render the device-DECLARED capture volumes (the
 *     same `layer1.volume.*` acquisition-metadata keys the lane's
 *     spatializer parses, same parsing law: absent → no box, malformed
 *     → no box — never a guessed bound);
 *   - the coverage annotation renders the UNION of the declared
 *     volumes (the same fold the lane's coverage derivation performs);
 *   - a ghost node renders its REMOVED TARGET's box translated by the
 *     node's declared ghost transform (the composeGhostScene
 *     caller-declared translation — the P3 law: the move delta reaches
 *     the presentation through the ghost transform).
 * An element with no derivable declared box gets NO mesh (the element
 * stays in the roster and every typed interaction stays available —
 * the viewport renders what is declared, nothing more).
 *
 * The output is a DERIVED PRESENTATION composition (a ComposedScene
 * whose nodes carry `ingested-mesh` geometry references + the box
 * table that resolves them). It is a projection of the same governed
 * state — building it never mutates the Reality Graph (the P0-A
 * authority law). The record's element status index and camera state
 * (the mount's authority) are unchanged by this projection; the
 * station IDENTITY excludes it (presentation geometry is not station
 * identity — recorded in WORLD-P5 evidence).
 */

import type {
  ComposedScene,
  SceneNode,
} from "@aise/world-reality-substrate";
import {
  FIXTURE_CAPTURE_SESSION,
  FIXTURE_PLAN_MODEL,
  LANE_ACQUISITION_METADATA_KEYS,
} from "@aise/world-layer1-experience";
import type { WorldStationModel } from "@aise/world-ux";

/* ------------------------------------------------------------------ */
/* The projection types (committed into the station record)             */
/* ------------------------------------------------------------------ */

/** One declared presentation box (the ingested-mesh asset payload). */
export interface StationViewportBox {
  readonly assetId: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** The viewport projection committed with the station record. */
export interface StationViewportProjection {
  readonly projectionKind: "aise.world-station-viewport/1";
  /**
   * The derived presentation composition: the ghost-scene nodes with
   * `ingested-mesh` geometry references where a declared box exists.
   */
  readonly scene: ComposedScene;
  /** The declared boxes, sorted by assetId (deterministic). */
  readonly boxes: readonly StationViewportBox[];
  /** The honest derivation statement (carried into the record). */
  readonly derivationNote: string;
}

export const VIEWPORT_ASSET_PREFIX = "station-box:";

/** The deterministic asset id for one element's declared box. */
export function stationViewportAssetIdOf(elementId: string): string {
  return `${VIEWPORT_ASSET_PREFIX}${elementId}`;
}

export const STATION_VIEWPORT_DERIVATION_NOTE =
  "declared plan shapes + device-declared capture volumes + the coverage union " +
  "+ the ghost's removed-target box translated by the declared ghost transform — " +
  "no invented geometry; elements without a declared box render no mesh";

/* ------------------------------------------------------------------ */
/* The declared-data tables                                             */
/* ------------------------------------------------------------------ */

interface Box {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Declared plan shapes (the P0-B box vocabulary, site-frame absolute). */
function declaredPlanBoxes(): Map<string, Box> {
  const table = new Map<string, Box>();
  for (const element of FIXTURE_PLAN_MODEL.elements) {
    if (element.shape.kind !== "box") continue;
    table.set(element.elementId, {
      min: [element.shape.min.x, element.shape.min.y, element.shape.min.z],
      max: [element.shape.max.x, element.shape.max.y, element.shape.max.z],
    });
  }
  return table;
}

/** Device-declared capture volumes (the layer1.volume.* metadata keys). */
function declaredCaptureVolumes(): Map<string, Box> {
  const K = LANE_ACQUISITION_METADATA_KEYS;
  const table = new Map<string, Box>();
  for (const asset of FIXTURE_CAPTURE_SESSION.assets) {
    const m = asset.acquisitionMetadata;
    const raw = [
      m[K.volumeMinX], m[K.volumeMinY], m[K.volumeMinZ],
      m[K.volumeMaxX], m[K.volumeMaxY], m[K.volumeMaxZ],
    ];
    if (raw.some((v) => v === undefined)) continue; // absent → no box (never guessed)
    const nums = raw.map((v) => Number(v));
    if (nums.some((n) => !Number.isFinite(n))) continue; // malformed → no box
    const [minX, minY, minZ, maxX, maxY, maxZ] = nums as [
      number, number, number, number, number, number,
    ];
    if (minX > maxX || minY > maxY || minZ > maxZ) continue; // inverted → no box
    table.set(asset.contentId, { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
  }
  return table;
}

/** The union of the declared volumes (the lane's coverage fold). */
function coverageUnionOf(volumes: Iterable<Box>): Box | null {
  let union: Box | null = null;
  for (const v of volumes) {
    union = union === null
      ? { min: [...v.min], max: [...v.max] }
      : {
          min: [
            Math.min(union.min[0], v.min[0]),
            Math.min(union.min[1], v.min[1]),
            Math.min(union.min[2], v.min[2]),
          ],
          max: [
            Math.max(union.max[0], v.max[0]),
            Math.max(union.max[1], v.max[1]),
            Math.max(union.max[2], v.max[2]),
          ],
        };
  }
  return union;
}

/* ------------------------------------------------------------------ */
/* The projection builder                                               */
/* ------------------------------------------------------------------ */

/**
 * Build the station viewport projection from the bound station model.
 * PURE + DETERMINISTIC: the same model produces the byte-identical
 * projection (no clock, no randomness, no I/O).
 */
export function buildStationViewportProjection(
  model: WorldStationModel,
): StationViewportProjection {
  const planBoxes = declaredPlanBoxes();
  const captureVolumes = declaredCaptureVolumes();
  const coverage = coverageUnionOf(captureVolumes.values());

  /** Resolve one node's DECLARED box (never invented). */
  const boxOf = (node: SceneNode): Box | null => {
    // 1. a plan element renders its declared comparable shape
    const plan = planBoxes.get(node.elementId);
    if (plan !== undefined) return plan;
    // 2. a capture element renders its device-declared volume (linked
    //    by the node's evidence content id — the placed-asset law)
    const evidenceId = node.evidenceContentIds[0];
    if (evidenceId !== undefined) {
      const volume = captureVolumes.get(evidenceId);
      if (volume !== undefined) return volume;
    }
    // 3. the coverage annotation renders the declared-volume union
    if (node.kind === "annotation" && node.label === "Capture coverage (declared)") {
      return coverage;
    }
    // 4. a ghost node renders its removed target's box translated by
    //    the DECLARED ghost transform (the P3 composeGhostScene delta)
    if (node.isGhost && model.scene.ghostSummary !== null) {
      const removed = model.scene.ghostSummary.removedElementIds;
      if (removed.length === 1) {
        const target = planBoxes.get(removed[0] ?? "");
        if (target !== undefined) {
          const m = node.transform.matrix;
          const dx = m[3] ?? 0, dy = m[7] ?? 0, dz = m[11] ?? 0;
          return {
            min: [
              target.min[0] + dx,
              target.min[1] + dy,
              target.min[2] + dz,
            ],
            max: [
              target.max[0] + dx,
              target.max[1] + dy,
              target.max[2] + dz,
            ],
          };
        }
      }
    }
    // no declared box → no mesh (the element stays fully interactive)
    return null;
  };

  const boxes = new Map<string, StationViewportBox>();
  const nodes: SceneNode[] = [];
  for (const node of model.scene.ghostScene.nodes) {
    const box = boxOf(node);
    if (box === null) {
      nodes.push({ ...node, geometry: null });
      continue;
    }
    const assetId = stationViewportAssetIdOf(node.elementId);
    boxes.set(assetId, { assetId, min: box.min, max: box.max });
    nodes.push({
      ...node,
      geometry: { assetId, partId: "part-001", format: "ingested-mesh" },
    });
  }

  const derivedScene: ComposedScene = {
    revision: model.scene.ghostScene.revision,
    nodes,
    layers: model.scene.ghostScene.layers,
    siteFrame: model.scene.ghostScene.siteFrame,
    ghostSummary: model.scene.ghostSummary,
  };

  return {
    projectionKind: "aise.world-station-viewport/1",
    scene: derivedScene,
    boxes: [...boxes.values()].sort((a, b) =>
      a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0,
    ),
    derivationNote: STATION_VIEWPORT_DERIVATION_NOTE,
  };
}
