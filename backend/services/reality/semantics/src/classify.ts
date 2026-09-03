/**
 * Scene-level cluster classification (AISE-010, stage 2).
 *
 * Classifies segmented planar clusters into architectural roles
 * using ONLY deterministic geometric evidence — the declared up
 * axis and plane geometry — with scene-level reasoning where local
 * evidence is insufficient:
 *
 * - **Orientation** per cluster: |normal·up| ≥ cos(tiltTolerance)
 *   → HORIZONTAL; ≤ sin(tiltTolerance) → VERTICAL; otherwise
 *   SLANTED (unclassified — a tilted plane is not a floor, ceiling,
 *   or wall).
 * - **Floor/ceiling** are distinguished SCENE-LEVEL by elevation:
 *   among horizontals, the LOWEST is the floor candidate and the
 *   HIGHEST is the ceiling candidate. Intermediate horizontals
 *   (tables, countertops) are reported unclassified with a reason —
 *   never silently dropped, never misclassified as architecture.
 *   A SINGLE horizontal plane is unclassified: floor vs. ceiling
 *   is indistinguishable from one plane alone, and guessing would
 *   fabricate semantics (honesty over coverage).
 * - **Impossible architecture fails closed**: floor–ceiling
 *   separation below the architectural minimum
 *   (`minFloorCeilingSeparation`) throws `GEOMETRY_CONTRADICTION` —
 *   contradictory geometry is rejected, never coerced.
 * - **Walls**: vertical clusters (extents enforced downstream in
 *   structure/openings stages).
 *
 * Determinism: sorting by (elevation, contentHash) — a pure
 * function of the cluster content.
 */
import { SemanticsError } from "./errors.js";
import { assertNonNegativeNumber, assertPositiveNumber } from "./validate.js";
import type { PlanarCluster } from "./segmentation.js";
import { vec3Dot, type Vec3 } from "@aise/backend-geometry";

/** Method label for horizontal floor/ceiling classification. */
export const HORIZONTAL_CLASSIFY_METHOD = "classify/horizontal-elevation-v1";

/** Method label for wall (vertical) classification. */
export const WALL_CLASSIFY_METHOD = "classify/wall-tilt-v1";

/** Default tilt tolerance (degrees) around horizontal/vertical. */
export const DEFAULT_TILT_TOLERANCE_DEG = 10;

/** Default minimum floor–ceiling separation (input unit). */
export const DEFAULT_MIN_FLOOR_CEILING_SEPARATION = 1.5;

/** Default minimum wall extent in BOTH frame directions (input unit). */
export const DEFAULT_MIN_WALL_EXTENT = 0.25;

/** Default minimum horizontal (floor/ceiling) side length (input unit). */
export const DEFAULT_MIN_HORIZONTAL_EXTENT = 0.5;

/** Options for classification (all validated, all recorded). */
export interface ClassificationOptions {
  /** Tilt tolerance in degrees around horizontal/vertical orientation. */
  readonly tiltToleranceDeg?: number;
  /** Minimum architecturally possible floor–ceiling separation. */
  readonly minFloorCeilingSeparation?: number;
  /** Minimum wall extent (width AND height). */
  readonly minWallExtent?: number;
  /** Minimum floor/ceiling side length. */
  readonly minHorizontalExtent?: number;
}

/** Fully materialized classification options (provenance record). */
export type ClassificationSettings = Required<ClassificationOptions>;

/** Orientation of a cluster relative to the up axis. */
export type ClusterOrientation = "HORIZONTAL" | "VERTICAL" | "SLANTED";

/** Architectural role assigned to a cluster. */
export type ClusterRole = "FLOOR" | "CEILING" | "WALL" | "UNCLASSIFIED";

/** One classified cluster with orientation, role, and elevation. */
export interface ClassifiedCluster {
  readonly cluster: PlanarCluster;
  readonly orientation: ClusterOrientation;
  readonly role: ClusterRole;
  /** Elevation of the plane point along the up axis (context; finite). */
  readonly elevation: number;
  /** Present iff UNCLASSIFIED — the honest reason recognition failed. */
  readonly reason?: string;
}

/**
 * Working classification record (mutated during scene-level
 * reasoning, frozen into `ClassifiedCluster` before return).
 */
interface MutableClassified {
  cluster: PlanarCluster;
  orientation: ClusterOrientation;
  role: ClusterRole;
  elevation: number;
  reason?: string;
}

/** Validates and materializes classification options with defaults. */
export function classificationSettings(options: ClassificationOptions = {}): ClassificationSettings {
  const tiltToleranceDeg = assertPositiveNumber(
    options.tiltToleranceDeg ?? DEFAULT_TILT_TOLERANCE_DEG,
    "tiltToleranceDeg",
  );
  if (tiltToleranceDeg >= 45) {
    throw new SemanticsError("VALIDATION_FAILED", "tiltToleranceDeg must be < 45", {
      details: { tiltToleranceDeg },
    });
  }
  const minFloorCeilingSeparation = assertPositiveNumber(
    options.minFloorCeilingSeparation ?? DEFAULT_MIN_FLOOR_CEILING_SEPARATION,
    "minFloorCeilingSeparation",
  );
  const minWallExtent = assertPositiveNumber(options.minWallExtent ?? DEFAULT_MIN_WALL_EXTENT, "minWallExtent");
  const minHorizontalExtent = assertPositiveNumber(
    options.minHorizontalExtent ?? DEFAULT_MIN_HORIZONTAL_EXTENT,
    "minHorizontalExtent",
  );
  assertNonNegativeNumber(options.minFloorCeilingSeparation ?? 0, "minFloorCeilingSeparation");
  return { tiltToleranceDeg, minFloorCeilingSeparation, minWallExtent, minHorizontalExtent };
}

/**
 * Classifies all clusters of one scene. Deterministic; fail-closed
 * on impossible floor–ceiling separation; honest about
 * unclassifiable clusters (reported with reasons).
 */
export function classifyClusters(
  clusters: readonly PlanarCluster[],
  up: Vec3,
  options: ClassificationOptions = {},
): ClassifiedCluster[] {
  const settings = classificationSettings(options);
  const cosTilt = Math.cos((settings.tiltToleranceDeg * Math.PI) / 180);
  const sinTilt = Math.sin((settings.tiltToleranceDeg * Math.PI) / 180);

  const classified: MutableClassified[] = clusters.map((cluster) => {
    const alignment = Math.abs(vec3Dot(cluster.planeFit.plane.normal, up));
    const elevation = vec3Dot(cluster.planeFit.plane.point, up);
    const orientation: ClusterOrientation =
      alignment >= cosTilt ? "HORIZONTAL" : alignment <= sinTilt ? "VERTICAL" : "SLANTED";
    return { cluster, orientation, role: "UNCLASSIFIED", elevation };
  });

  // Horizontals: scene-level floor/ceiling by elevation ordering.
  const horizontals = classified
    .filter((entry) => entry.orientation === "HORIZONTAL")
    .sort((a, b) =>
      a.elevation !== b.elevation
        ? a.elevation - b.elevation
        : a.cluster.contentHash < b.cluster.contentHash
          ? -1
          : 1,
    );
  if (horizontals.length === 1) {
    const only = horizontals[0] as MutableClassified;
    only.role = "UNCLASSIFIED";
    only.reason =
      "single horizontal plane — floor vs. ceiling is indistinguishable without additional evidence; guessing would fabricate semantics";
  } else if (horizontals.length >= 2) {
    const lowest = horizontals[0] as MutableClassified;
    const highest = horizontals[horizontals.length - 1] as MutableClassified;
    const separation = highest.elevation - lowest.elevation;
    if (separation < settings.minFloorCeilingSeparation) {
      throw new SemanticsError(
        "GEOMETRY_CONTRADICTION",
        `floor–ceiling separation ${separation} is below the architectural minimum ${settings.minFloorCeilingSeparation} — impossible room geometry`,
        { details: { separation: String(separation), minimum: String(settings.minFloorCeilingSeparation) } },
      );
    }
    lowest.role = "FLOOR";
    highest.role = "CEILING";
    for (let i = 1; i < horizontals.length - 1; i += 1) {
      const middle = horizontals[i] as MutableClassified;
      middle.role = "UNCLASSIFIED";
      middle.reason = "intermediate-elevation horizontal (e.g. furniture or fixture) — not floor or ceiling";
    }
  }

  // Verticals are wall candidates (extent checks run downstream).
  for (const entry of classified) {
    if (entry.orientation === "VERTICAL" && entry.role === "UNCLASSIFIED") {
      entry.role = "WALL";
    } else if (entry.orientation === "SLANTED" && entry.role === "UNCLASSIFIED") {
      entry.reason = `plane tilt exceeds the ${settings.tiltToleranceDeg}° tolerance around horizontal/vertical`;
    }
  }

  // Freeze the working records into the readonly public shape.
  return classified.map((entry): ClassifiedCluster => {
    if (entry.reason !== undefined) {
      return {
        cluster: entry.cluster,
        orientation: entry.orientation,
        role: entry.role,
        elevation: entry.elevation,
        reason: entry.reason,
      };
    }
    return {
      cluster: entry.cluster,
      orientation: entry.orientation,
      role: entry.role,
      elevation: entry.elevation,
    };
  });
}
