/**
 * AISE-019 — versioned golden fixtures (code-defined, deterministic).
 *
 * HONESTY: every fixture below is SYNTHETIC (`fixtureProvenance:
 * "synthetic-v1"`): exact scenes (rooms/boxes/openings with exact
 * coordinates) + deterministic injected noise. NOT physical captures — the
 * physical fixture program is AISE-035.
 *
 * Determinism:
 *   - `buildFixture` is pure: sampling grids + cutout exclusion are exact;
 *     ground-truth points lie EXACTLY on their planes in IEEE 754 (each
 *     surface parametrization fixes the on-plane coordinate to the plane
 *     constant, never an arithmetic sum).
 *   - `observeFixture` applies the device-class noise profile via a single
 *     LCG stream seeded from sha256(fixtureId) (SEED_POLICY in model.ts) —
 *     no Math.random, no clock, no I/O. Identical fixture bits + identical
 *     call → byte-identical observations.
 *   - Noise displaces points ONLY along the surface outward normal (the
 *     tangential coordinates are preserved bit-exactly), so plane_fit_rms
 *     for a plane fitted to the observations equals the noise scatter.
 */

import { sha256Hex } from "../lib/hash";
import { vec, vecDot, vecNorm, type Vec3 } from "../geometry";
import {
  DEVICE_NOISE_PROFILES,
  FIXTURE_PROVENANCE,
  FIXTURE_VERSION,
  type DeviceClass,
  type EngineCaptureView,
  type GoldenFixture,
  type GroundTruth,
  type GroundTruthDimension,
  type GroundTruthSurface,

  type SurfaceObservation,
  type SyntheticBoxObject,
  type SyntheticScene,
} from "./model";

/* ------------------------------------------------------------------ */
/* Deterministic LCG + gaussian draws                                  */
/* ------------------------------------------------------------------ */

/** Deterministic linear congruential generator (Numerical Recipes). */
export class Lcg {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** Next raw uint32. */
  nextUint32(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state;
  }
  /** Uniform in (0, 1) — never 0 or 1, so Box-Muller is safe. */
  uniform(): number {
    return (this.nextUint32() + 0.5) / 4294967296;
  }
  /** Standard normal draw (Box-Muller), deterministic. */
  gaussian(): number {
    const u1 = this.uniform();
    const u2 = this.uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/** Seed of a fixture: uint32 of sha256(fixtureId)[0..8] (SEED_POLICY). */
export function seedOf(fixtureId: string): number {
  return Number.parseInt(sha256Hex(fixtureId).slice(0, 8), 16) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Device capture profiles (sampling density per class)                */
/* ------------------------------------------------------------------ */

export interface CaptureProfile {
  /** Grid side for room surfaces (points = side² minus cutouts). */
  readonly surfaceGridSide: number;
  /** Grid side for box-object faces. */
  readonly objectFaceGridSide: number;
}

const CAPTURE_PROFILES: Readonly<Record<DeviceClass, CaptureProfile>> = {
  flagship_lidar: { surfaceGridSide: 24, objectFaceGridSide: 6 },
  midrange_no_depth: { surfaceGridSide: 20, objectFaceGridSide: 5 },
  lowend_minimal: { surfaceGridSide: 12, objectFaceGridSide: 4 },
  emulator_like: { surfaceGridSide: 16, objectFaceGridSide: 5 },
};

/* ------------------------------------------------------------------ */
/* Fixture construction                                                */
/* ------------------------------------------------------------------ */

interface SurfaceTemplate {
  readonly surfaceId: string;
  readonly role: GroundTruthSurface["role"];
  readonly normal: Vec3;
  readonly d: number;
  readonly origin: Vec3;
  readonly uAxis: Vec3;
  readonly vAxis: Vec3;
}

function roomSurfaces(room: SyntheticScene["room"]): SurfaceTemplate[] {
  const { widthM: w, depthM: d, heightM: h } = room;
  return [
    { surfaceId: "floor", role: "floor", normal: vec(0, 0, -1), d: 0, origin: vec(0, 0, 0), uAxis: vec(w, 0, 0), vAxis: vec(0, d, 0) },
    { surfaceId: "ceiling", role: "ceiling", normal: vec(0, 0, 1), d: -h, origin: vec(0, 0, h), uAxis: vec(w, 0, 0), vAxis: vec(0, d, 0) },
    { surfaceId: "wall_west", role: "wall", normal: vec(-1, 0, 0), d: 0, origin: vec(0, 0, 0), uAxis: vec(0, d, 0), vAxis: vec(0, 0, h) },
    { surfaceId: "wall_east", role: "wall", normal: vec(1, 0, 0), d: -w, origin: vec(w, 0, 0), uAxis: vec(0, d, 0), vAxis: vec(0, 0, h) },
    { surfaceId: "wall_north", role: "wall", normal: vec(0, -1, 0), d: 0, origin: vec(0, 0, 0), uAxis: vec(w, 0, 0), vAxis: vec(0, 0, h) },
    { surfaceId: "wall_south", role: "wall", normal: vec(0, 1, 0), d: -d, origin: vec(0, d, 0), uAxis: vec(w, 0, 0), vAxis: vec(0, 0, h) },
  ];
}

/** Fixed face order: xmin, xmax, ymin, ymax, zmin, zmax. */
export const BOX_FACE_KEYS = ["xmin", "xmax", "ymin", "ymax", "zmin", "zmax"] as const;
export type BoxFaceKey = (typeof BOX_FACE_KEYS)[number];

/** Face surface ids of a box object in fixed order (xmin..zmax). */
export function boxFaceSurfaceIds(objectId: string): readonly string[] {
  return BOX_FACE_KEYS.map((face) => `${objectId}::${face}`);
}

function objectFaceTemplates(object: SyntheticBoxObject): SurfaceTemplate[] {
  const [x0, y0, z0] = object.minCorner;
  const [x1, y1, z1] = object.maxCorner;
  const faces: readonly [BoxFaceKey, Vec3, number, Vec3, Vec3, Vec3][] = [
    ["xmin", vec(-1, 0, 0), x0, vec(x0, y0, z0), vec(0, y1 - y0, 0), vec(0, 0, z1 - z0)],
    ["xmax", vec(1, 0, 0), -x1, vec(x1, y0, z0), vec(0, y1 - y0, 0), vec(0, 0, z1 - z0)],
    ["ymin", vec(0, -1, 0), y0, vec(x0, y0, z0), vec(x1 - x0, 0, 0), vec(0, 0, z1 - z0)],
    ["ymax", vec(0, 1, 0), -y1, vec(x0, y1, z0), vec(x1 - x0, 0, 0), vec(0, 0, z1 - z0)],
    ["zmin", vec(0, 0, -1), z0, vec(x0, y0, z0), vec(x1 - x0, 0, 0), vec(0, y1 - y0, 0)],
    ["zmax", vec(0, 0, 1), -z1, vec(x0, y0, z1), vec(x1 - x0, 0, 0), vec(0, y1 - y0, 0)],
  ];
  return faces.map(([face, normal, d, origin, uAxis, vAxis]) => ({
    surfaceId: `${object.objectId}::${face}`,
    role: "object_face",
    normal,
    d,
    origin,
    uAxis,
    vAxis,
  }));
}

/** Opening rectangle in a wall's (u, v) parametrization (strict interior). */
interface CutoutRect {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

function openingCutouts(
  template: SurfaceTemplate,
  scene: SyntheticScene,
): CutoutRect[] {
  const cutouts: CutoutRect[] = [];
  for (const opening of scene.openings) {
    if (opening.onSurfaceId !== template.surfaceId) {
      continue;
    }
    // Project the opening center into wall (u, v) via the exact axis vectors
    // (axis-aligned templates: the projection is exact rational arithmetic).
    const [ox, oy, oz] = opening.center;
    const [rx, ry, rz] = template.origin;
    const rel = vec(ox - rx, oy - ry, oz - rz);
    const u = vecDot(rel, template.uAxis) / vecDot(template.uAxis, template.uAxis);
    const v = vecDot(rel, template.vAxis) / vecDot(template.vAxis, template.vAxis);
    // Half-extents in PARAMETRIC units (axis vectors are full-length).
    const uHalf = opening.widthM / 2 / vecNorm(template.uAxis);
    const vHalf = opening.heightM / 2 / vecNorm(template.vAxis);
    cutouts.push({
      u0: u - uHalf,
      u1: u + uHalf,
      v0: v - vHalf,
      v1: v + vHalf,
    });
  }
  return cutouts;
}

function sampleGridPoints(
  template: SurfaceTemplate,
  gridSide: number,
  cutouts: readonly CutoutRect[],
): Vec3[] {
  const points: Vec3[] = [];
  const [ox, oy, oz] = template.origin;
  const [ux, uy, uz] = template.uAxis;
  const [vx, vy, vz] = template.vAxis;
  for (let j = 0; j < gridSide; j += 1) {
    const u = (j + 0.5) / gridSide;
    for (let k = 0; k < gridSide; k += 1) {
      const v = (k + 0.5) / gridSide;
      // Strict interior: points exactly on an opening boundary are retained
      // (measure-zero ambiguity, resolved deterministically).
      const inside = cutouts.some((c) => u > c.u0 && u < c.u1 && v > c.v0 && v < c.v1);
      if (!inside) {
        // Full bilinear parametrization p = origin + u·uAxis + v·vAxis. The
        // on-plane coordinate is set to the plane constant exactly (each
        // template zeroes the matching axis in BOTH uAxis and vAxis), so
        // ground-truth points satisfy dot(normal, p) + d === 0 in IEEE 754.
        points.push(vec(ox + u * ux + v * vx, oy + u * uy + v * vy, oz + u * uz + v * vz));
      }
    }
  }
  return points;
}

export interface FixtureSpec {
  readonly fixtureId: string;
  readonly deviceClass: DeviceClass;
  readonly scene: SyntheticScene;
}

/** Build a golden fixture from an exact scene spec (pure, deterministic). */
export function buildFixture(spec: FixtureSpec): GoldenFixture {
  const profile = CAPTURE_PROFILES[spec.deviceClass];
  const surfaces: GroundTruthSurface[] = [];
  const templates: SurfaceTemplate[] = [
    ...roomSurfaces(spec.scene.room),
    ...spec.scene.objects.flatMap(objectFaceTemplates),
  ];
  for (const template of templates) {
    const gridSide =
      template.role === "object_face" ? profile.objectFaceGridSide : profile.surfaceGridSide;
    const cutouts =
      template.role === "wall" ? openingCutouts(template, spec.scene) : [];
    surfaces.push({
      surfaceId: template.surfaceId,
      role: template.role,
      plane: { normal: template.normal, d: template.d },
      points: sampleGridPoints(template, gridSide, cutouts),
    });
  }
  const dimensions: GroundTruthDimension[] = [
    { dimensionId: "room_width", label: "room width (west↔east walls)", valueM: spec.scene.room.widthM, surfaceA: "wall_west", surfaceB: "wall_east" },
    { dimensionId: "room_depth", label: "room depth (north↔south walls)", valueM: spec.scene.room.depthM, surfaceA: "wall_north", surfaceB: "wall_south" },
    { dimensionId: "room_height", label: "room height (floor↔ceiling)", valueM: spec.scene.room.heightM, surfaceA: "floor", surfaceB: "ceiling" },
  ];
  const groundTruth: GroundTruth = {
    surfaces,
    dimensions,
    objectVolumes: spec.scene.objects.map((object) => ({
      objectId: object.objectId,
      volumeM3:
        (object.maxCorner[0] - object.minCorner[0]) *
        (object.maxCorner[1] - object.minCorner[1]) *
        (object.maxCorner[2] - object.minCorner[2]),
    })),
  };
  return {
    fixtureId: spec.fixtureId,
    fixtureVersion: FIXTURE_VERSION,
    fixtureProvenance: FIXTURE_PROVENANCE,
    deviceClass: spec.deviceClass,
    scene: spec.scene,
    groundTruth,
    noise: DEVICE_NOISE_PROFILES[spec.deviceClass],
  };
}

/* ------------------------------------------------------------------ */
/* Observation (the synthetic "capture")                               */
/* ------------------------------------------------------------------ */

/**
 * Apply the fixture's noise profile to its exact surface points: pure,
 * deterministic (single LCG stream seeded by seedOf(fixtureId), consumed in
 * fixed surface then point order). Displacement is along the surface normal
 * only: p' = p + n̂·(bias + σ·gaussian).
 */
export function observeFixture(fixture: GoldenFixture): readonly SurfaceObservation[] {
  const rng = new Lcg(seedOf(fixture.fixtureId));
  const { sigmaM, biasM } = fixture.noise;
  return fixture.groundTruth.surfaces.map((surface) => {
    const [nx, ny, nz] = surface.plane.normal;
    const points = surface.points.map((p) => {
      const eps = biasM + sigmaM * rng.gaussian();
      return vec(p[0] + nx * eps, p[1] + ny * eps, p[2] + nz * eps);
    });
    return { surfaceId: surface.surfaceId, points };
  });
}

/**
 * Ground-truth-blind engine input: observations + measurement requests
 * (identifiers/pairing only) + object face structure. No exact values.
 */
export function captureViewOf(fixture: GoldenFixture): EngineCaptureView {
  return {
    fixtureId: fixture.fixtureId,
    deviceClass: fixture.deviceClass,
    noise: fixture.noise,
    observations: observeFixture(fixture),
    measurementRequests: fixture.groundTruth.dimensions.map((dimension) => ({
      dimensionId: dimension.dimensionId,
      label: dimension.label,
      surfaceA: dimension.surfaceA,
      surfaceB: dimension.surfaceB,
    })),
    objects: fixture.scene.objects.map((object) => ({
      objectId: object.objectId,
      label: object.label,
      faceSurfaceIds: boxFaceSurfaceIds(object.objectId),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The golden fixture set (≥4: one per device class, distinct rooms)    */
/* ------------------------------------------------------------------ */

const FIXTURE_SPECS: readonly FixtureSpec[] = [
  {
    fixtureId: "fixture-flagship-livingroom-001",
    deviceClass: "flagship_lidar",
    scene: {
      sceneId: "scene-livingroom",
      description: "living room, one door + one window, one storage box",
      room: { widthM: 4.2, depthM: 3.6, heightM: 2.7 },
      objects: [
        { objectId: "box_storage", label: "storage unit", minCorner: vec(0.4, 0.3, 0), maxCorner: vec(1.6, 0.9, 0.8) },
      ],
      openings: [
        { openingId: "door_north", kind: "door", onSurfaceId: "wall_north", center: vec(1.2, 0, 1.025), widthM: 0.9, heightM: 2.05 },
        { openingId: "window_west", kind: "window", onSurfaceId: "wall_west", center: vec(0, 1.8, 1.5), widthM: 1.2, heightM: 1.2 },
      ],
    },
  },
  {
    fixtureId: "fixture-midrange-bedroom-001",
    deviceClass: "midrange_no_depth",
    scene: {
      sceneId: "scene-bedroom",
      description: "bedroom, one door + one window, one cabinet box",
      room: { widthM: 3.5, depthM: 3.0, heightM: 2.55 },
      objects: [
        { objectId: "box_cabinet", label: "bedside cabinet", minCorner: vec(2.6, 0.2, 0), maxCorner: vec(3.1, 0.7, 0.5) },
      ],
      openings: [
        { openingId: "door_south", kind: "door", onSurfaceId: "wall_south", center: vec(0.6, 3.0, 1.0), widthM: 0.85, heightM: 2.0 },
        { openingId: "window_east", kind: "window", onSurfaceId: "wall_east", center: vec(3.5, 1.5, 1.35), widthM: 1.0, heightM: 1.1 },
      ],
    },
  },
  {
    fixtureId: "fixture-lowend-corridor-001",
    deviceClass: "lowend_minimal",
    scene: {
      sceneId: "scene-corridor",
      description: "narrow corridor, one door, one tall locker box",
      room: { widthM: 5.0, depthM: 1.8, heightM: 2.4 },
      objects: [
        { objectId: "box_locker", label: "tall locker", minCorner: vec(3.8, 0.1, 0), maxCorner: vec(4.2, 0.5, 1.0) },
      ],
      openings: [
        { openingId: "door_east", kind: "door", onSurfaceId: "wall_east", center: vec(5.0, 0.9, 1.0), widthM: 0.8, heightM: 2.0 },
      ],
    },
  },
  {
    fixtureId: "fixture-emulator-office-001",
    deviceClass: "emulator_like",
    scene: {
      sceneId: "scene-office",
      description: "small office, one door + one window, one desk-side box",
      room: { widthM: 3.0, depthM: 2.4, heightM: 2.6 },
      objects: [
        { objectId: "box_deskside", label: "desk-side drawer unit", minCorner: vec(0.3, 0.2, 0), maxCorner: vec(0.9, 0.7, 0.45) },
      ],
      openings: [
        { openingId: "door_west", kind: "door", onSurfaceId: "wall_west", center: vec(0, 1.2, 1.0), widthM: 0.85, heightM: 2.0 },
        { openingId: "window_south", kind: "window", onSurfaceId: "wall_south", center: vec(1.5, 2.4, 1.4), widthM: 1.0, heightM: 1.0 },
      ],
    },
  },
];

/** The golden fixture set: one fixture per device class (synthetic-v1). */
export const GOLDEN_FIXTURES: readonly GoldenFixture[] = FIXTURE_SPECS.map(buildFixture);

/** Look up a shipped fixture by id. */
export function fixtureById(fixtureId: string): GoldenFixture | undefined {
  return GOLDEN_FIXTURES.find((fixture) => fixture.fixtureId === fixtureId);
}
