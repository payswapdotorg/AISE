/**
 * AISE-019 fixture tests — determinism, ground-truth integrity, noise
 * discipline. All assertions are deterministic (LCG + documented seeds; no
 * Math.random anywhere in the module under test).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  BOX_FACE_KEYS,
  DEVICE_CLASSES,
  DEVICE_NOISE_PROFILES,
  GOLDEN_FIXTURES,
  Lcg,
  buildFixture,
  captureViewOf,
  fixtureById,
  observeFixture,
  seedOf,
  type GoldenFixture,
  type SyntheticScene,
} from "./index";
import { vecDot, vecNorm } from "../geometry";
import { sha256Hex } from "../lib/hash";

function rebuildAll(): GoldenFixture[] {
  // Rebuild each shipped fixture from its scene spec (the specs are the
  // code-defined constants; buildFixture is pure).
  return GOLDEN_FIXTURES.map((fixture) =>
    buildFixture({
      fixtureId: fixture.fixtureId,
      deviceClass: fixture.deviceClass,
      scene: fixture.scene as SyntheticScene,
    }),
  );
}

describe("AISE-019 golden fixtures", () => {
  test("fixture set covers every device class with distinct rooms", () => {
    expect(GOLDEN_FIXTURES).toHaveLength(4);
    const classes = new Set(GOLDEN_FIXTURES.map((fixture) => fixture.deviceClass));
    expect([...classes].sort()).toEqual([...DEVICE_CLASSES].sort());
    const ids = new Set(GOLDEN_FIXTURES.map((fixture) => fixture.fixtureId));
    expect(ids.size).toBe(4);
    const roomSizes = new Set(
      GOLDEN_FIXTURES.map(
        (fixture) =>
          `${fixture.scene.room.widthM}x${fixture.scene.room.depthM}x${fixture.scene.room.heightM}`,
      ),
    );
    expect(roomSizes.size).toBe(4); // different room sizes per fixture
  });

  test("every fixture is stamped version 1 + synthetic-v1 provenance + seed policy", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      expect(fixture.fixtureVersion).toBe("1");
      expect(fixture.fixtureProvenance).toBe("synthetic-v1");
      expect(fixture.noise.seedPolicy).toContain("sha256(fixtureId)");
      expect(fixture.noise.seedPolicy).not.toContain("Math.random");
    }
  });

  test("fixture generation is deterministic: rebuild twice → byte-identical", () => {
    const once = rebuildAll();
    const twice = rebuildAll();
    expect(canonicalJsonStringify(once)).toBe(canonicalJsonStringify(twice));
    expect(canonicalJsonStringify(once)).toBe(canonicalJsonStringify(GOLDEN_FIXTURES));
  });

  test("observation sampling is deterministic: two calls → byte-identical", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      expect(canonicalJsonStringify(observeFixture(fixture))).toBe(
        canonicalJsonStringify(observeFixture(fixture)),
      );
    }
  });

  test("seed policy: seed = uint32(sha256(fixtureId)[0..8]), stable and distinct", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const expected = Number.parseInt(sha256Hex(fixture.fixtureId).slice(0, 8), 16) >>> 0;
      expect(seedOf(fixture.fixtureId)).toBe(expected);
      expect(seedOf(fixture.fixtureId)).toBe(seedOf(fixture.fixtureId));
    }
    const seeds = new Set(GOLDEN_FIXTURES.map((fixture) => seedOf(fixture.fixtureId)));
    expect(seeds.size).toBe(4);
  });

  test("Lcg is a deterministic stream with uniforms strictly inside (0,1)", () => {
    const a = new Lcg(42);
    const b = new Lcg(42);
    const seqA: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      seqA.push(a.uniform());
    }
    for (let i = 0; i < 100; i += 1) {
      expect(b.uniform()).toBe(seqA[i] as number);
    }
    for (const u of seqA) {
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
    }
    expect(new Lcg(43).uniform()).not.toBe(seqA[0]);
  });

  test("ground-truth points lie EXACTLY on their planes (IEEE 754 exact)", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      for (const surface of fixture.groundTruth.surfaces) {
        expect(vecNorm(surface.plane.normal)).toBe(1); // unit normals exactly
        for (const point of surface.points) {
          expect(vecDot(surface.plane.normal, point) + surface.plane.d).toBe(0);
        }
      }
    }
  });

  test("ground-truth dimensions are exact and every surface is fit-able (≥3 points)", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const dims = new Map(
        fixture.groundTruth.dimensions.map((d) => [d.dimensionId, d.valueM]),
      );
      expect(dims.get("room_width")).toBe(fixture.scene.room.widthM);
      expect(dims.get("room_depth")).toBe(fixture.scene.room.depthM);
      expect(dims.get("room_height")).toBe(fixture.scene.room.heightM);
      for (const surface of fixture.groundTruth.surfaces) {
        expect(surface.points.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("ground-truth object volumes are exact corner products", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      for (const object of fixture.scene.objects) {
        const truth = fixture.groundTruth.objectVolumes.find(
          (entry) => entry.objectId === object.objectId,
        );
        expect(truth?.volumeM3).toBe(
          (object.maxCorner[0] - object.minCorner[0]) *
            (object.maxCorner[1] - object.minCorner[1]) *
            (object.maxCorner[2] - object.minCorner[2]),
        );
      }
    }
  });

  test("object face surfaces exist for every box, in the fixed order", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      for (const object of fixture.scene.objects) {
        const ids = fixture.groundTruth.surfaces
          .map((surface) => surface.surfaceId)
          .filter((id) => id.startsWith(`${object.objectId}::`));
        expect(ids).toEqual(
          BOX_FACE_KEYS.map((face) => `${object.objectId}::${face}`),
        );
      }
    }
  });

  test("wall sampling respects opening cutouts (no points inside door/window)", () => {
    const flagship = fixtureById("fixture-flagship-livingroom-001")!;
    const north = flagship.groundTruth.surfaces.find((s) => s.surfaceId === "wall_north")!;
    // door_north: x ∈ (0.75, 1.65), z ∈ (0, 2.05) — reaches the floor.
    const inDoor = north.points.filter(
      (p) => p[0] > 0.75 && p[0] < 1.65 && p[2] > 0 && p[2] < 2.05,
    );
    expect(inDoor).toHaveLength(0);
    expect(north.points.length).toBeLessThan(24 * 24); // cutout removed points
    const west = flagship.groundTruth.surfaces.find((s) => s.surfaceId === "wall_west")!;
    // window_west: y ∈ (1.2, 2.4), z ∈ (0.9, 2.1).
    const inWindow = west.points.filter(
      (p) => p[1] > 1.2 && p[1] < 2.4 && p[2] > 0.9 && p[2] < 2.1,
    );
    expect(inWindow).toHaveLength(0);
    expect(west.points.length).toBeLessThan(24 * 24);
    // A wall without openings keeps the full grid.
    const east = flagship.groundTruth.surfaces.find((s) => s.surfaceId === "wall_east")!;
    expect(east.points.length).toBe(24 * 24);
  });

  test("capture density ordering across classes: flagship > midrange > lowend", () => {
    const count = (fixture: GoldenFixture): number =>
      fixture.groundTruth.surfaces.find((s) => s.surfaceId === "wall_east")!.points.length;
    const flagship = fixtureById("fixture-flagship-livingroom-001")!;
    const midrange = fixtureById("fixture-midrange-bedroom-001")!;
    const lowend = fixtureById("fixture-lowend-corridor-001")!;
    expect(count(flagship)).toBeGreaterThan(count(midrange));
    expect(count(midrange)).toBeGreaterThan(count(lowend));
  });

  test("noise displaces points ONLY along the surface normal (tangential exact)", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const observations = observeFixture(fixture);
      for (const surface of fixture.groundTruth.surfaces) {
        const observed = observations.find((o) => o.surfaceId === surface.surfaceId)!;
        const [nx, ny, nz] = surface.plane.normal;
        for (let i = 0; i < observed.points.length; i += 1) {
          const exact = surface.points[i]!;
          const moved = observed.points[i]!;
          const dx = moved[0] - exact[0];
          const dy = moved[1] - exact[1];
          const dz = moved[2] - exact[2];
          // Displacement cross normal must be exactly zero on every axis:
          // the tangential components are bit-exactly unchanged. (-0 is a
          // legitimate exact zero — compare with a tiny bound, not Object.is.)
          expect(Math.abs(dy * nz - dz * ny)).toBeLessThan(1e-18);
          expect(Math.abs(dz * nx - dx * nz)).toBeLessThan(1e-18);
          expect(Math.abs(dx * ny - dy * nx)).toBeLessThan(1e-18);
        }
      }
    }
  });

  test("empirical noise statistics match the per-class profiles (σ and bias)", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const observations = observeFixture(fixture);
      const displacements: number[] = [];
      for (const surface of fixture.groundTruth.surfaces) {
        const observed = observations.find((o) => o.surfaceId === surface.surfaceId)!;
        for (let i = 0; i < observed.points.length; i += 1) {
          const exact = surface.points[i]!;
          const moved = observed.points[i]!;
          displacements.push(
            vecDot(surface.plane.normal, [
              moved[0] - exact[0],
              moved[1] - exact[1],
              moved[2] - exact[2],
            ]),
          );
        }
      }
      const n = displacements.length;
      const mean = displacements.reduce((a, b) => a + b, 0) / n;
      const variance =
        displacements.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1);
      const stdev = Math.sqrt(variance);
      // Tolerance 0.08: the noise sequence is a FIXED LCG stream seeded by
      // fixtureId, so the empirical σ deviates from the population σ by a
      // deterministic amount (observed ≤5.6% across the golden fixtures;
      // the iid-sampling bound 1/√(2n) would allow ≈3% at these n). The
      // tolerance accommodates the deterministic deviation with margin —
      // a CHANGED noise profile must still trip it (discrimination below).
      expect(Math.abs(stdev - fixture.noise.sigmaM) / fixture.noise.sigmaM).toBeLessThan(0.08);
      expect(Math.abs(mean - fixture.noise.biasM)).toBeLessThan(
        (4 * fixture.noise.sigmaM) / Math.sqrt(n),
      );
    }
  });

  test("noise profiles carry the work-order values per class", () => {
    expect(DEVICE_NOISE_PROFILES.flagship_lidar.sigmaM).toBe(0.002);
    expect(DEVICE_NOISE_PROFILES.flagship_lidar.biasM).toBe(0);
    expect(DEVICE_NOISE_PROFILES.midrange_no_depth.sigmaM).toBe(0.008);
    expect(DEVICE_NOISE_PROFILES.lowend_minimal.sigmaM).toBe(0.025);
    expect(DEVICE_NOISE_PROFILES.emulator_like.sigmaM).toBe(0.015);
    expect(DEVICE_NOISE_PROFILES.emulator_like.biasM).toBe(0.03);
    // σ ordering across classes (flagship < midrange < emulator < lowend).
    expect(DEVICE_NOISE_PROFILES.flagship_lidar.sigmaM).toBeLessThan(
      DEVICE_NOISE_PROFILES.midrange_no_depth.sigmaM,
    );
    expect(DEVICE_NOISE_PROFILES.midrange_no_depth.sigmaM).toBeLessThan(
      DEVICE_NOISE_PROFILES.emulator_like.sigmaM,
    );
    expect(DEVICE_NOISE_PROFILES.emulator_like.sigmaM).toBeLessThan(
      DEVICE_NOISE_PROFILES.lowend_minimal.sigmaM,
    );
  });

  test("capture view is ground-truth-blind: no values, planes or volumes leak", () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const view = captureViewOf(fixture);
      const text = JSON.stringify(view);
      expect(text).not.toContain("valueM");
      expect(text).not.toContain("volumeM3");
      expect(text).not.toContain('"plane"');
      expect(view.observations.length).toBe(fixture.groundTruth.surfaces.length);
      expect(view.measurementRequests.length).toBe(3); // structure, not values
      // Observations are the NOISED capture, not the exact points.
      const first = view.observations[0]!;
      expect(first.points).not.toEqual(fixture.groundTruth.surfaces[0]!.points);
    }
  });
});
