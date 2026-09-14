/**
 * AISE-019 — benchmark metrics (deterministic, geometry-library math).
 *
 * Per fixture per engine (definitions fixed; all values pure):
 *
 *   scale_error         |measured − truth| / truth, per ground-truth
 *                       dimension (room height, wall width, room depth).
 *   dimension_error     measured − truth, SIGNED, per ground-truth dimension
 *                       (diagnosis; gates evaluate its absolute value).
 *   plane_fit_rms       RMS residual of the fixture's OBSERVED (noised)
 *                       points about the ENGINE's reconstructed plane, per
 *                       surface. For a least-squares fit this is identical
 *                       to the geometry library's fitPlane rmsResidual
 *                       (pinned by a test); for the ideal (exact) plane it
 *                       is the device noise envelope sqrt(σ² + bias²).
 *   registration_error  mean point-to-plane distance (distancePointPlane)
 *                       of the ground-truth EXACT surface points to the
 *                       engine's reconstructed plane, per surface — i.e. how
 *                       far the reconstruction is mis-registered from truth.
 *                       Exactly 0 for the ideal engine.
 *   object_volume_error |measured − truth| / truth, per box object.
 *
 * failure_behavior is not a metric: engine exceptions/invalid/missing
 * reconstructions are explicit BenchmarkFailureEntry records produced by
 * the runner (never a crash).
 *
 * Aggregates (means) are informational ONLY — gates evaluate per-instance
 * values (R17: aggregate metrics may not hide critical-class regressions).
 */

import { distancePointPlane, vecDot } from "../geometry";
import { observeFixture } from "./fixtures";
import type {
  FixtureMetrics,
  GoldenFixture,
  MetricInstance,
  MetricName,
  ReconstructedScene,
} from "./model";

function fmtMeters(value: number): string {
  return `${value.toFixed(6)}m`;
}

function meanOf(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function meanByMetric(
  metrics: readonly MetricInstance[],
): Readonly<Record<MetricName, number>> {
  const buckets = new Map<MetricName, number[]>();
  for (const instance of metrics) {
    const bucket = buckets.get(instance.metric) ?? [];
    bucket.push(instance.value);
    buckets.set(instance.metric, bucket);
  }
  const aggregates = {} as Record<MetricName, number>;
  for (const [metric, values] of buckets) {
    aggregates[metric] = meanOf(values);
  }
  return aggregates;
}

/**
 * Compute all metric instances for one fixture evaluation.
 *
 * Preconditions (enforced by the runner BEFORE this call — violations are
 * failure entries, not metric math): the scene covers every ground-truth
 * surface/dimension/object, and all values are finite with unit normals.
 */
export function computeFixtureMetrics(
  fixture: GoldenFixture,
  scene: ReconstructedScene,
): FixtureMetrics {
  const observations = observeFixture(fixture);
  const planeOf = (surfaceId: string) => {
    const found = scene.planes.find((entry) => entry.surfaceId === surfaceId);
    if (!found) {
      throw new Error(`metrics: engine scene missing plane for surface ${surfaceId}`);
    }
    return found.plane;
  };
  const metrics: MetricInstance[] = [];

  // Surface metrics: plane_fit_rms (observations vs engine plane) and
  // registration_error (exact truth points vs engine plane).
  for (const surface of fixture.groundTruth.surfaces) {
    const plane = planeOf(surface.surfaceId);
    const observed = observations.find((entry) => entry.surfaceId === surface.surfaceId);
    if (!observed) {
      throw new Error(`metrics: no observation for surface ${surface.surfaceId}`);
    }
    let squaredResidualSum = 0;
    for (const point of observed.points) {
      const residual = vecDot(plane.normal, point) + plane.d;
      squaredResidualSum += residual * residual;
    }
    metrics.push({
      metric: "plane_fit_rms",
      subjectId: surface.surfaceId,
      subjectLabel: `${surface.role} ${surface.surfaceId}`,
      value: Math.sqrt(squaredResidualSum / observed.points.length),
      unit: "m",
      signed: false,
      detail: `rms residual of ${observed.points.length} observed points about the reconstructed plane`,
    });

    let signedDistanceSum = 0;
    for (const point of surface.points) {
      signedDistanceSum += distancePointPlane(point, null, plane).absolute;
    }
    metrics.push({
      metric: "registration_error",
      subjectId: surface.surfaceId,
      subjectLabel: `${surface.role} ${surface.surfaceId}`,
      value: signedDistanceSum / surface.points.length,
      unit: "m",
      signed: false,
      detail: "mean point-to-plane distance of ground-truth points to the reconstructed plane",
    });
  }

  // Dimension metrics: scale_error (relative) + dimension_error (signed).
  for (const dimension of fixture.groundTruth.dimensions) {
    const measured = scene.dimensions.find(
      (entry) => entry.dimensionId === dimension.dimensionId,
    );
    if (!measured) {
      throw new Error(`metrics: engine scene missing dimension ${dimension.dimensionId}`);
    }
    const scaleError = Math.abs(measured.measuredM - dimension.valueM) / dimension.valueM;
    metrics.push({
      metric: "scale_error",
      subjectId: dimension.dimensionId,
      subjectLabel: dimension.label,
      value: scaleError,
      unit: "ratio",
      signed: false,
      detail: `measured ${fmtMeters(measured.measuredM)} vs truth ${fmtMeters(dimension.valueM)}`,
    });
    metrics.push({
      metric: "dimension_error",
      subjectId: dimension.dimensionId,
      subjectLabel: dimension.label,
      value: measured.measuredM - dimension.valueM,
      unit: "m",
      signed: true,
      detail: `signed error measured(${fmtMeters(measured.measuredM)}) − truth(${fmtMeters(dimension.valueM)})`,
    });
  }

  // Object volume metrics.
  for (const truth of fixture.groundTruth.objectVolumes) {
    const measured = scene.objectVolumes.find((entry) => entry.objectId === truth.objectId);
    if (!measured) {
      throw new Error(`metrics: engine scene missing volume for object ${truth.objectId}`);
    }
    metrics.push({
      metric: "object_volume_error",
      subjectId: truth.objectId,
      subjectLabel: `object ${truth.objectId}`,
      value: Math.abs(measured.measuredVolumeM3 - truth.volumeM3) / truth.volumeM3,
      unit: "ratio",
      signed: false,
      detail: `measured volume ${measured.measuredVolumeM3.toFixed(9)}m³ vs truth ${truth.volumeM3.toFixed(9)}m³`,
    });
  }

  return {
    fixtureId: fixture.fixtureId,
    deviceClass: fixture.deviceClass,
    metrics,
    aggregates: meanByMetric(metrics),
  };
}
