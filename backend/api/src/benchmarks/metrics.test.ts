/**
 * AISE-019 engine + metric correctness tests. Spot values are hand-computed
 * from the definitions in metrics.ts (all deterministic — LCG noise with
 * documented seeds, pure geometry math).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  GOLDEN_FIXTURES,
  IDEAL_GEOMETRY_ENGINE,
  PLANE_FIT_ENGINE,
  computeFixtureMetrics,
  fixtureById,
  measurePlanePair,
  noiseEnvelopeM,
  observeFixture,
  runBenchmarks,
  type GoldenFixture,
  type MetricInstance,
  type ReconstructionUnderTest,
} from "./index";
import { fitPlane, vec } from "../geometry";

const NOW = (): string => "2025-01-01T00:00:00.000Z";

function metricsOf(
  engine: ReconstructionUnderTest,
  fixture: GoldenFixture,
): readonly MetricInstance[] {
  return computeFixtureMetrics(fixture, engine.reconstruct(fixture)).metrics;
}

function instance(
  metrics: readonly MetricInstance[],
  metric: string,
  subjectId: string,
): MetricInstance {
  const found = metrics.find((m) => m.metric === metric && m.subjectId === subjectId);
  if (!found) {
    throw new Error(`missing metric instance ${metric}/${subjectId}`);
  }
  return found;
}

describe("AISE-019 ideal geometry engine (sanity anchor)", () => {
  test("registration_error is EXACTLY zero on every surface of every fixture", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      for (const metric of metricsOf(IDEAL_GEOMETRY_ENGINE, fixture)) {
        if (metric.metric === "registration_error") {
          expect(metric.value).toBe(0);
        }
      }
    }
  });

  test("scale_error, dimension_error and object_volume_error are exactly zero", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      for (const metric of metricsOf(IDEAL_GEOMETRY_ENGINE, fixture)) {
        if (
          metric.metric === "scale_error" ||
          metric.metric === "dimension_error" ||
          metric.metric === "object_volume_error"
        ) {
          expect(metric.value).toBe(0);
        }
      }
    }
  });

  test("plane_fit_rms equals the class noise envelope within 15%", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const rms = metricsOf(IDEAL_GEOMETRY_ENGINE, fixture)
        .filter((m) => m.metric === "plane_fit_rms")
        .map((m) => m.value);
      const meanRms = rms.reduce((a, b) => a + b, 0) / rms.length;
      const envelope = noiseEnvelopeM(fixture.noise);
      expect(Math.abs(meanRms - envelope) / envelope).toBeLessThan(0.15);
    }
  });

  test("ideal engine notes declare the sanity-anchor role", () => {
    const scene = IDEAL_GEOMETRY_ENGINE.reconstruct(GOLDEN_FIXTURES[0]!);
    expect(scene.notes.join(" ")).toContain("sanity anchor");
  });
});

describe("AISE-019 plane-fit engine (measured baseline)", () => {
  const flagship = fixtureById("fixture-flagship-livingroom-001")!;

  test("flagship plane_fit_rms ≈ the 2mm noise σ (within 25%)", () => {
    // The fitted-plane rms tracks the noise σ but deviates deterministically:
    // the fixed LCG stream's empirical σ on the flagship fixture runs ≈20%
    // high on its surfaces, and the 4-parameter plane fit absorbs a small
    // fraction of the variance. 25% is the calibrated documented bound; a
    // broken noise profile (e.g. 10× σ) trips it by an order of magnitude.
    for (const metric of metricsOf(PLANE_FIT_ENGINE, flagship)) {
      if (metric.metric === "plane_fit_rms") {
        expect(Math.abs(metric.value - 0.002) / 0.002).toBeLessThan(0.25);
      }
    }
  });

  test("plane_fit_rms equals fitPlane(points).rmsResidual to machine precision", () => {
    const scene = PLANE_FIT_ENGINE.reconstruct(flagship);
    for (const observation of observeFixture(flagship)) {
      const fit = fitPlane(observation.points);
      const enginePlane = scene.planes.find(
        (entry) => entry.surfaceId === observation.surfaceId,
      )!.plane;
      // The engine returns fitPlane's plane bit-exactly; the metric is the
      // RMS about that same plane, so both values coincide.
      let squared = 0;
      for (const point of observation.points) {
        const residual =
          enginePlane.normal[0] * point[0] +
          enginePlane.normal[1] * point[1] +
          enginePlane.normal[2] * point[2] +
          enginePlane.d;
        squared += residual * residual;
      }
      const rms = Math.sqrt(squared / observation.points.length);
      expect(Math.abs(rms - fit.rmsResidual)).toBeLessThan(1e-12);
    }
  });

  test("flagship registration_error ≈ σ/√n (well below the 5mm gate)", () => {
    const floor = instance(metricsOf(PLANE_FIT_ENGINE, flagship), "registration_error", "floor");
    expect(floor.value).toBeGreaterThan(0);
    expect(floor.value).toBeLessThan(0.001); // σ/√576 ≈ 0.083mm, gate 5mm
  });

  test("scale_error formula spot-check: |measured − truth| / truth", () => {
    const scene = PLANE_FIT_ENGINE.reconstruct(flagship);
    const measuredHeight = scene.dimensions.find((d) => d.dimensionId === "room_height")!;
    const truth = flagship.groundTruth.dimensions.find((d) => d.dimensionId === "room_height")!;
    const expected = Math.abs(measuredHeight.measuredM - truth.valueM) / truth.valueM;
    const metric = instance(metricsOf(PLANE_FIT_ENGINE, flagship), "scale_error", "room_height");
    expect(metric.value).toBeCloseTo(expected, 15);
    // And the signed counterpart is measured − truth.
    const signed = instance(metricsOf(PLANE_FIT_ENGINE, flagship), "dimension_error", "room_height");
    expect(signed.value).toBeCloseTo(measuredHeight.measuredM - truth.valueM, 15);
    expect(signed.signed).toBe(true);
  });

  test("plane-fit engine is ground-truth-VALUE-blind (scrambled answers → identical output)", () => {
    // The ANSWER SHEET (measured values: dimensions, volumes) must not be
    // an engine input: scrambling the answers leaves the reconstruction
    // bit-identical. The world geometry itself (surface planes — where the
    // observed points live) is NOT an answer and is deliberately left
    // untouched: moving it would legitimately move the points too.
    // (type-level readonly fields are loosened only on the private clone.)
    const scrambled = structuredClone(flagship) as typeof flagship & {
      groundTruth: {
        dimensions: { valueM: number }[];
        objectVolumes: { volumeM3: number }[];
        surfaces: { plane: { normal: [number, number, number]; d: number } }[];
      };
    };
    for (const dimension of scrambled.groundTruth.dimensions) {
      dimension.valueM *= 7.25;
    }
    for (const volume of scrambled.groundTruth.objectVolumes) {
      volume.volumeM3 += 100;
    }
    // NOTE: surface.plane intentionally NOT scrambled — see test comment.
    const honest = PLANE_FIT_ENGINE.reconstruct(flagship);
    const blind = PLANE_FIT_ENGINE.reconstruct(scrambled);
    expect(canonicalJsonStringify(blind)).toBe(canonicalJsonStringify(honest));
  });

  test("dimension measurement notes record the fallback method honestly", () => {
    const scene = PLANE_FIT_ENGINE.reconstruct(flagship);
    const fallbackNotes = scene.notes.filter((note) => note.includes("mean point-to-plane fallback"));
    expect(fallbackNotes.length).toBeGreaterThan(0);
    expect(fallbackNotes.length).toBeLessThanOrEqual(6); // 3 room + 3 box dims
  });

  test("measurePlanePair: exactly parallel planes use the typed geometry path", () => {
    const notes: string[] = [];
    const planes = new Map([
      ["a", { normal: vec(0, 0, 1), d: -1 }],
      ["b", { normal: vec(0, 0, 1), d: -3 }],
    ]);
    const result = measurePlanePair(
      { dimensionId: "test", surfaceA: "a", surfaceB: "b" },
      (surfaceId) => planes.get(surfaceId)!,
      () => [],
      notes,
    );
    expect(result.method).toBe("parallel-planes");
    expect(result.valueM).toBe(2); // z=1 vs z=3 → 2m separation
    expect(notes).toHaveLength(0);
  });

  test("measurePlanePair: tilted planes fall back to mean point-to-plane", () => {
    const notes: string[] = [];
    const points = [vec(0, 0, 3), vec(1, 0, 3), vec(0, 1, 3), vec(1, 1, 3)];
    const planes = new Map([
      ["a", { normal: vec(0, 0, 1), d: -1 }], // exact z=1 plane
      // 0.01 rad tilt ⇒ beyond PARALLEL_ANGLE_TOLERANCE_RAD (1e-4)
      ["b", { normal: vec(0, 0.01, 0.99995), d: -3 }],
    ]);
    const result = measurePlanePair(
      { dimensionId: "test", surfaceA: "a", surfaceB: "b" },
      (surfaceId) => planes.get(surfaceId)!,
      () => points, // points on z=3 → separation from z=1 is 2m
      notes,
    );
    expect(result.method).toBe("mean-point-to-plane");
    expect(result.valueM).toBeCloseTo(2, 12);
    expect(notes.join(" ")).toContain("fallback");
  });

  test("noise-profile sanity: plane_fit_rms ordering across classes (flag < mid < low)", () => {
    const aggregateRms = (fixture: GoldenFixture): number => {
      const metrics = metricsOf(PLANE_FIT_ENGINE, fixture).filter(
        (m) => m.metric === "plane_fit_rms",
      );
      return metrics.reduce((a, b) => a + b.value, 0) / metrics.length;
    };
    const flagshipRms = aggregateRms(fixtureById("fixture-flagship-livingroom-001")!);
    const midrangeRms = aggregateRms(fixtureById("fixture-midrange-bedroom-001")!);
    const lowendRms = aggregateRms(fixtureById("fixture-lowend-corridor-001")!);
    expect(flagshipRms).toBeLessThan(midrangeRms);
    expect(midrangeRms).toBeLessThan(lowendRms);
  });

  test("emulator systematic bias inflates small-box volume (~40%), still under its gate", () => {
    const emulator = fixtureById("fixture-emulator-office-001")!;
    const volumeError = instance(
      metricsOf(PLANE_FIT_ENGINE, emulator),
      "object_volume_error",
      "box_deskside",
    );
    // 2x30mm bias on each ~0.5m box dimension → ~3x2x0.03/0.5 ≈ 36%+noise.
    expect(volumeError.value).toBeGreaterThan(0.3);
    expect(volumeError.value).toBeLessThan(0.5); // emulator gate (non-critical)
    // And the emulator registration error ≈ the 30mm systematic bias.
    const registration = instance(
      metricsOf(PLANE_FIT_ENGINE, emulator),
      "registration_error",
      "floor",
    );
    expect(registration.value).toBeGreaterThan(0.028);
    expect(registration.value).toBeLessThan(0.032);
  });

  test("the harness measures ANY conforming engine (ad-hoc seam object)", () => {
    const adHoc: ReconstructionUnderTest = {
      providerId: "ad-hoc",
      version: "0",
      reconstruct: (fixture) => IDEAL_GEOMETRY_ENGINE.reconstruct(fixture),
    };
    const report = runBenchmarks([adHoc], GOLDEN_FIXTURES.slice(0, 1), { now: NOW });
    expect(report.engines[0]!.providerId).toBe("ad-hoc");
    expect(report.overall).toBe("PASS");
  });
});
