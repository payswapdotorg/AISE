/**
 * Architectural scene extraction (AISE-010, orchestration).
 *
 * `extractArchitecturalScene` runs the full deterministic pipeline
 * over a reconstructed point cloud:
 *
 * ```text
 * cloud (canonical order)
 *   → segmentation        (segment/plane-ransac-seq-v1, AISE-009 fits)
 *   → classification      (classify/horizontal-elevation-v1, classify/wall-tilt-v1)
 *   → structured geometry (structure/wall-rectangle-v1, structure/horizontal-rectangle-v1)
 *   → openings            (opening/grid-gap-v1: doors and windows)
 *   → scene assembly      (scene/assembly-v1: guards, ordering, identity)
 * ```
 *
 * Every stage is deterministic and fail-closed (see the module
 * docs of the respective stages). The result carries complete
 * provenance (every object cites method, parameters, and
 * content-pinned inputs — cluster for surfaces, cluster + parent
 * wall for openings), epistemic honesty (extraction never
 * outranks INFERRED; the scene is the weakest of its inputs), and
 * honest accounting (unclassified clusters and residual points
 * are reported, never silently dropped).
 *
 * This pipeline is where measurements are BORN in the semantics
 * domain: recognized objects carry value + unit + uncertainty
 * where available; a confidence score cannot substitute for
 * measurement uncertainty and is structurally absent (constructor
 * scan + test scan).
 */
import { SemanticsError } from "./errors.js";
import {
  classifyClusters,
  classificationSettings,
  HORIZONTAL_CLASSIFY_METHOD,
  WALL_CLASSIFY_METHOD,
  type ClassifiedCluster,
  type ClassificationOptions,
  type ClassificationSettings,
} from "./classify.js";
import {
  findWallOpenings,
  openingSettings,
  OPENING_METHOD,
  type OpeningOptions,
  type OpeningRecord,
  type OpeningSettings,
} from "./openings.js";
import {
  assembleScene,
  makeOpeningObject,
  makeSurfaceObject,
  type ArchitecturalObject,
  type ArchitecturalScene,
  type ObjectQualityMetrics,
  type UnclassifiedSegment,
} from "./objects.js";
import {
  extractionProvenance,
  pointSetInputRef,
  type ObjectInputRef,
  type PointSetInputRef,
} from "./provenance.js";
import {
  segmentationSettings,
  segmentPointCloud,
  type SegmentationOptions,
  type SegmentationSettings,
} from "./segmentation.js";
import {
  buildHorizontalFrame,
  buildWallFrame,
  rectangleInFrame,
  squareUnitOf,
  type StructuredRectangle,
} from "./structure.js";
import { assertLengthUnit, normalizeUpAxis } from "./validate.js";
import { assertSourceEpistemicState, deriveExtractionState } from "./epistemic.js";
import {
  vec3Dot,
  type GeomPoint,
  type LengthUnit,
  type Measurement,
  type Vec3,
} from "@aise/backend-geometry";
import type { EpistemicState } from "@aise/shared-contracts";

/** Method label for scene assembly. */
export const SCENE_METHOD = "scene/assembly-v1";

/** Default up axis (gravity-negative) when the caller does not declare one. */
export const DEFAULT_UP: Vec3 = { x: 0, y: 0, z: 1 };

/** Input for full architectural scene extraction. */
export interface SceneInput {
  readonly points: readonly GeomPoint[];
  /** Unit of the point coordinates (explicit — never implicit). */
  readonly unit: LengthUnit;
  /**
   * Declared up axis (gravity-negative direction) of the scene
   * frame. Default +Z. Any non-zero finite vector is accepted and
   * normalized; the declaration is recorded in provenance. The up
   * axis is an INPUT declaration (like source epistemic state),
   * never inferred here.
   */
  readonly up?: Vec3;
  /** Epistemic state of the point source (reconstruction clouds are INFERRED). */
  readonly sourceEpistemic?: EpistemicState;
  /** Isotropic per-axis 1σ of point positions, in `unit` (optional). */
  readonly perPointStandardUncertainty?: number;
}

/** All extraction options (segmentation + classification + openings). */
export interface ExtractionOptions extends SegmentationOptions, ClassificationOptions, OpeningOptions {}

/** Quality metrics from the plane fit (deterministic, no confidence). */
function clusterQuality(cluster: {
  points: readonly GeomPoint[];
  planeFit: {
    residualStats: { min: number; max: number; rms: number };
  };
}): ObjectQualityMetrics {
  const stats = cluster.planeFit.residualStats;
  return {
    pointCount: cluster.points.length,
    residualRms: stats.rms,
    residualMaxAbs: Math.max(Math.abs(stats.min), Math.abs(stats.max)),
  };
}

/** Elevation measurement for a horizontal plane (σ from the fit when stated). */
function elevationMeasurement(
  planePoint: GeomPoint,
  up: Vec3,
  unit: LengthUnit,
  offsetStandard: number | undefined,
): Measurement {
  const value = vec3Dot(planePoint, up);
  return {
    value,
    unit,
    ...(offsetStandard !== undefined
      ? { uncertainty: { kind: "standard" as const, u: offsetStandard } }
      : {}),
  };
}

/** Extracts one full architectural scene from a point cloud. */
export function extractArchitecturalScene(
  input: SceneInput,
  options: ExtractionOptions = {},
): ArchitecturalScene {
  const segSettings: SegmentationSettings = segmentationSettings(options);
  const clsSettings: ClassificationSettings = classificationSettings(options);
  const opSettings: OpeningSettings = openingSettings(options);
  const unit = assertLengthUnit(input.unit);
  const up = normalizeUpAxis(input.up ?? DEFAULT_UP);
  const sourceEpistemic = assertSourceEpistemicState(input.sourceEpistemic ?? "INFERRED");
  if (
    input.perPointStandardUncertainty !== undefined &&
    (!Number.isFinite(input.perPointStandardUncertainty) || input.perPointStandardUncertainty <= 0)
  ) {
    throw new SemanticsError(
      "VALIDATION_FAILED",
      `perPointStandardUncertainty must be a finite number > 0: ${String(input.perPointStandardUncertainty)}`,
      { details: { value: String(input.perPointStandardUncertainty) } },
    );
  }
  const sigma = input.perPointStandardUncertainty;

  // Stage 1: segmentation.
  const segmentation = segmentPointCloud(
    {
      points: input.points,
      unit,
      ...(input.sourceEpistemic !== undefined ? { sourceEpistemic: input.sourceEpistemic } : {}),
      ...(sigma !== undefined ? { perPointStandardUncertainty: sigma } : {}),
    },
    options,
  );
  const cloudRef = segmentation.provenance.inputs[0] as PointSetInputRef;

  // Stage 2: classification.
  const classified = classifyClusters(segmentation.clusters, up, clsSettings);

  // Stage 3+4: structured geometry, openings, objects.
  const objectEpistemic = deriveExtractionState([sourceEpistemic]);
  const objects: ArchitecturalObject[] = [];
  const unclassified: UnclassifiedSegment[] = [];

  for (const entry of classified) {
    const cluster = entry.cluster;
    const clusterRef = pointSetInputRef(cluster.points, sourceEpistemic);
    const quality = clusterQuality(cluster);

    if (entry.role === "FLOOR" || entry.role === "CEILING") {
      const reoriented: Vec3 =
        entry.role === "FLOOR"
          ? { x: up.x, y: up.y, z: up.z }
          : { x: -up.x, y: -up.y, z: -up.z };
      const frame = buildHorizontalFrame(cluster.planeFit.plane.point, reoriented);
      const geometry = rectangleInFrame(cluster.points, frame, unit, sigma);
      if (
        geometry.width.value < clsSettings.minHorizontalExtent ||
        geometry.height.value < clsSettings.minHorizontalExtent
      ) {
        unclassified.push({
          clusterId: cluster.clusterId,
          pointCount: cluster.points.length,
          contentHash: cluster.contentHash,
          reason: `horizontal plane below the architectural minimum side length ${clsSettings.minHorizontalExtent} — not a floor/ceiling`,
        });
        continue;
      }
      const elevation = elevationMeasurement(
        cluster.planeFit.plane.point,
        up,
        unit,
        cluster.planeFit.uncertainty?.offsetStandard,
      );
      objects.push(
        makeSurfaceObject({
          kind: entry.role,
          geometry,
          quality,
          elevation,
          provenance: extractionProvenance(
            HORIZONTAL_CLASSIFY_METHOD,
            {
              role: entry.role,
              normalOrientation: entry.role === "FLOOR" ? "up" : "down",
              tiltToleranceDeg: clsSettings.tiltToleranceDeg,
              minHorizontalExtent: clsSettings.minHorizontalExtent,
              elevation: entry.elevation,
              width: geometry.width.value,
              height: geometry.height.value,
              residualRms: quality.residualRms,
              pointCount: quality.pointCount,
              planeFitMethod: cluster.planeFit.provenance.method,
              planeFitMethodVersion: cluster.planeFit.provenance.methodVersion,
            },
            [clusterRef],
          ),
          epistemicState: objectEpistemic,
        }),
      );
      continue;
    }

    if (entry.role === "WALL") {
      const frame = buildWallFrame(cluster.planeFit.plane.point, cluster.planeFit.plane.normal, up);
      const geometry = rectangleInFrame(cluster.points, frame, unit, sigma);
      if (
        geometry.width.value < clsSettings.minWallExtent ||
        geometry.height.value < clsSettings.minWallExtent
      ) {
        unclassified.push({
          clusterId: cluster.clusterId,
          pointCount: cluster.points.length,
          contentHash: cluster.contentHash,
          reason: `vertical plane below the architectural minimum extent ${clsSettings.minWallExtent} in a frame direction — not a wall`,
        });
        continue;
      }

      // Openings (doors/windows) for this wall.
      const wallOpenings = findWallOpenings(
        {
          points: cluster.points,
          frame,
          rectangle: geometry.rectangle,
          unit,
          ...(sigma !== undefined ? { perPointStandardUncertainty: sigma } : {}),
        },
        options,
      );

      const wallObject = makeSurfaceObject({
        kind: "WALL",
        geometry,
        quality,
        openings: {
          doorCount: wallOpenings.doors.length,
          windowCount: wallOpenings.windows.length,
          unclassified: wallOpenings.unclassified,
        },
        provenance: extractionProvenance(
          WALL_CLASSIFY_METHOD,
          {
            tiltToleranceDeg: clsSettings.tiltToleranceDeg,
            minWallExtent: clsSettings.minWallExtent,
            width: geometry.width.value,
            height: geometry.height.value,
            residualRms: quality.residualRms,
            pointCount: quality.pointCount,
            planeFitMethod: cluster.planeFit.provenance.method,
            planeFitMethodVersion: cluster.planeFit.provenance.methodVersion,
            detectedDoors: wallOpenings.doors.length,
            detectedWindows: wallOpenings.windows.length,
            unclassifiedGaps: wallOpenings.unclassified.length,
          },
          [clusterRef],
        ),
        epistemicState: objectEpistemic,
      });
      objects.push(wallObject);

      // Door/window objects (child → parent lineage).
      const parentRef = (method: string): ObjectInputRef => ({
        kind: "object",
        method,
        objectId: wallObject.objectId,
        contentHash: wallObject.contentHash,
        epistemic: wallObject.epistemicState,
      });
      for (const door of wallOpenings.doors) {
        objects.push(
          makeOpeningObject({
            kind: "DOOR",
            geometry: openingGeometry(door, geometry, unit),
            quality,
            headHeight: door.measurements.headHeight,
            parentObjectId: wallObject.objectId,
            provenance: extractionProvenance(
              OPENING_METHOD,
              {
                openingKind: "DOOR",
                parentObjectId: wallObject.objectId,
                wallWidth: geometry.width.value,
                wallHeight: geometry.height.value,
                gridResolution: opSettings.gridResolution,
                doorFloorTolerance: opSettings.doorFloorTolerance,
                doorMinHeight: opSettings.doorMinHeight,
                doorMaxHeight: opSettings.doorMaxHeight,
                rectangularity: door.metrics.rectangularity,
                cellCount: door.metrics.cellCount,
              },
              [clusterRef, parentRef(WALL_CLASSIFY_METHOD)],
            ),
            epistemicState: objectEpistemic,
          }),
        );
      }
      for (const window of wallOpenings.windows) {
        objects.push(
          makeOpeningObject({
            kind: "WINDOW",
            geometry: openingGeometry(window, geometry, unit),
            quality,
            sillHeight: window.measurements.sillHeight,
            headHeight: window.measurements.headHeight,
            parentObjectId: wallObject.objectId,
            provenance: extractionProvenance(
              OPENING_METHOD,
              {
                openingKind: "WINDOW",
                parentObjectId: wallObject.objectId,
                wallWidth: geometry.width.value,
                wallHeight: geometry.height.value,
                gridResolution: opSettings.gridResolution,
                windowMinSill: opSettings.windowMinSill,
                rectangularity: window.metrics.rectangularity,
                cellCount: window.metrics.cellCount,
              },
              [clusterRef, parentRef(WALL_CLASSIFY_METHOD)],
            ),
            epistemicState: objectEpistemic,
          }),
        );
      }
      continue;
    }

    // UNCLASSIFIED (slanted, single horizontal, intermediate, …).
    unclassified.push({
      clusterId: cluster.clusterId,
      pointCount: cluster.points.length,
      contentHash: cluster.contentHash,
      reason:
        entry.reason ??
        "cluster did not meet architectural classification criteria (no role assigned)",
    });
  }

  // Room summary (present iff floor and ceiling objects exist).
  const floorObject = objects.find((object) => object.kind === "FLOOR");
  const ceilingObject = objects.find((object) => object.kind === "CEILING");
  let room: ArchitecturalScene["room"] = null;
  if (floorObject !== undefined && ceilingObject !== undefined && floorObject.elevation !== undefined && ceilingObject.elevation !== undefined) {
    const floorElevation = floorObject.elevation;
    const ceilingElevation = ceilingObject.elevation;
    const floorSigma = floorElevation.uncertainty?.kind === "standard" ? floorElevation.uncertainty.u : undefined;
    const ceilingSigma =
      ceilingElevation.uncertainty?.kind === "standard" ? ceilingElevation.uncertainty.u : undefined;
    const heightSigma =
      floorSigma !== undefined && ceilingSigma !== undefined
        ? Math.sqrt(floorSigma * floorSigma + ceilingSigma * ceilingSigma)
        : undefined;
    room = {
      floorElevation,
      ceilingElevation,
      roomHeight: {
        value: ceilingElevation.value - floorElevation.value,
        unit,
        ...(heightSigma !== undefined ? { uncertainty: { kind: "standard" as const, u: heightSigma } } : {}),
      },
    };
  }

  const sceneProvenance = extractionProvenance(
    SCENE_METHOD,
    {
      unit,
      up: { x: up.x, y: up.y, z: up.z },
      sourceEpistemic,
      segmentation: {
        inlierDistance: segSettings.inlierDistance,
        minClusterPoints: segSettings.minClusterPoints,
        maxSegments: segSettings.maxSegments,
        maxPlaneCandidates: segSettings.maxPlaneCandidates,
        neighborhoodSize: segSettings.neighborhoodSize,
        refinementRounds: segSettings.refinementRounds,
      },
      classification: {
        tiltToleranceDeg: clsSettings.tiltToleranceDeg,
        minFloorCeilingSeparation: clsSettings.minFloorCeilingSeparation,
        minWallExtent: clsSettings.minWallExtent,
        minHorizontalExtent: clsSettings.minHorizontalExtent,
      },
      openings: {
        gridResolution: opSettings.gridResolution,
        minOpeningWidth: opSettings.minOpeningWidth,
        minOpeningHeight: opSettings.minOpeningHeight,
        minOpeningArea: opSettings.minOpeningArea,
        rectangularityThreshold: opSettings.rectangularityThreshold,
        doorFloorTolerance: opSettings.doorFloorTolerance,
        doorMinHeight: opSettings.doorMinHeight,
        doorMaxHeight: opSettings.doorMaxHeight,
        windowMinSill: opSettings.windowMinSill,
      },
      inputPointCount: input.points.length,
      clusterCount: segmentation.clusters.length,
      objectCount: objects.length,
      unclassifiedCount: unclassified.length,
      residualPointCount: segmentation.residualPointCount,
    },
    [cloudRef],
  );

  return assembleScene({
    frame: { up, unit },
    objects,
    unclassified,
    residualPointCount: segmentation.residualPointCount,
    residualPointsContentHash: segmentation.residualPointsContentHash,
    room,
    sourceEpistemic,
    minFloorCeilingSeparation: clsSettings.minFloorCeilingSeparation,
    provenance: sceneProvenance,
  });
}

/** Builds the structured rectangle of an opening in wall-frame coordinates. */
function openingGeometry(
  record: OpeningRecord,
  wallGeometry: StructuredRectangle,
  unit: LengthUnit,
): StructuredRectangle {
  const wallRect = wallGeometry.rectangle;
  const uMin = wallRect.uMin + record.rect.uMin;
  const uMax = wallRect.uMin + record.rect.uMax;
  const vMin = wallRect.vMin + record.rect.vMin;
  const vMax = wallRect.vMin + record.rect.vMax;
  const width = record.measurements.width;
  const height = record.measurements.height;
  const areaValue = width.value * height.value;
  const sigmaWidth = width.uncertainty?.kind === "standard" ? width.uncertainty.u : undefined;
  const sigmaHeight = height.uncertainty?.kind === "standard" ? height.uncertainty.u : undefined;
  const areaSigma =
    sigmaWidth !== undefined && sigmaHeight !== undefined
      ? areaValue * Math.sqrt((sigmaWidth / width.value) ** 2 + (sigmaHeight / height.value) ** 2)
      : undefined;
  return {
    frame: wallGeometry.frame,
    rectangle: {
      uMin,
      uMax,
      vMin,
      vMax,
      center: record.center,
      corners: record.corners,
    },
    width,
    height,
    area: {
      value: areaValue,
      unit: squareUnitOf(unit),
      ...(areaSigma !== undefined ? { uncertainty: { kind: "standard" as const, u: areaSigma } } : {}),
    },
  };
}

/** Type re-export for the public surface. */
export type { ClassifiedCluster };
