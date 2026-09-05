/**
 * Golden MEP fixture set (AISE-026, CRITICAL controlled-fixture
 * benchmark) — the AISE-010 golden-room discipline applied to
 * pipes.
 *
 * **Exact network** — a 4-pipe water-pipe layout, shell-sampled
 * on a fixed grid (axis step 0.05, circumference step ~0.02 in
 * radians), no noise:
 *
 * - pipe A: along +X at (y=0, z=1), x ∈ [0,4], radius 0.05;
 * - pipe B: along +X at (y=1.2, z=1), x ∈ [0,4], radius 0.05;
 * - pipe C (branch, thinner): along +Y at (x=2, z=1), y ∈ [0,1.2],
 *   radius 0.0325 (deliberate diameter mismatch at the branches);
 * - pipe D (continuation): along +X at (y=0, z=1), x ∈ [4,6],
 *   radius 0.05 (end-to-end coupling with pipe A).
 *
 * Ground truth: 4 pipes; centerlines/diameters/lengths exact;
 * 3 junctions — C→A (branch, mismatch), C→B (branch, mismatch),
 * A↔D (coupled, compatible).
 *
 * **Noisy network** — the same layout with seeded Gaussian noise
 * (σ = 0.01, the golden-room precedent) via the AISE-009
 * deterministic RNG: reproducible, recorded.
 *
 * Generation is a pure function of the parameters — no ambient
 * randomness, no clock, no order dependence.
 */
import { DeterministicRng, type GeomPoint } from "@aise/backend-geometry";

/** The seed for fixture noise synthesis (recorded, reproducible). */
export const PIPE_NOISE_SEED = 0x26262;

/** Ground truth of the exact fixture (meters). */
export interface PipeNetworkGroundTruth {
  readonly pipes: {
    readonly name: string;
    readonly start: { readonly x: number; readonly y: number; readonly z: number };
    readonly end: { readonly x: number; readonly y: number; readonly z: number };
    readonly diameter: number;
    readonly length: number;
  }[];
  readonly junctions: {
    readonly branch: string;
    readonly near: string;
    readonly kind: "branch" | "coupled";
    readonly diameterRelation: "compatible" | "mismatch";
  }[];
}

/** The pipe layout shared by the exact and noisy fixtures. */
const LAYOUT: {
  readonly name: string;
  readonly start: [number, number, number];
  readonly end: [number, number, number];
  readonly radius: number;
}[] = [
  { name: "A", start: [0, 0, 1], end: [4, 0, 1], radius: 0.05 },
  { name: "B", start: [0, 1.2, 1], end: [4, 1.2, 1], radius: 0.05 },
  // Branch C and continuation D are GAP-CONNECTED (0.25 m end gaps):
  // distinct pipes in point clouds connect through proximity within
  // the junction tolerance — the physical joint itself is not scanned.
  { name: "C", start: [2, 0.25, 1], end: [2, 0.95, 1], radius: 0.0325 },
  { name: "D", start: [4.25, 0, 1], end: [6.25, 0, 1], radius: 0.05 },
];

/** Axial sampling step (meters). */
const AXIS_STEP = 0.05;
/** Circumferential sampling count per ring. */
const RING_COUNT = 16;

/** The exact fixture's ground truth (pinned by the golden tests). */
/** The junction tolerance the golden benchmark reconstructs with (meters). */
export const GOLDEN_JOIN_TOLERANCE = 0.3;

/** The ground-truth junction distances (the 0.25 m end gaps). */
export const GOLDEN_JUNCTION_DISTANCE = 0.25;

export function pipeNetworkGroundTruth(): PipeNetworkGroundTruth {
  return {
    pipes: LAYOUT.map((pipe) => ({
      name: pipe.name,
      start: { x: pipe.start[0], y: pipe.start[1], z: pipe.start[2] },
      end: { x: pipe.end[0], y: pipe.end[1], z: pipe.end[2] },
      diameter: 2 * pipe.radius,
      length: Math.hypot(pipe.end[0] - pipe.start[0], pipe.end[1] - pipe.start[1], pipe.end[2] - pipe.start[2]),
    })),
    junctions: [
      { branch: "C", near: "A", kind: "branch", diameterRelation: "mismatch" },
      { branch: "C", near: "B", kind: "branch", diameterRelation: "mismatch" },
      { branch: "A", near: "D", kind: "coupled", diameterRelation: "compatible" },
    ],
  };
}

/** Samples one pipe's shell deterministically (grid rings along the axis). */
function samplePipe(
  pipe: { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number]; readonly radius: number },
  rng: DeterministicRng | null,
  noiseSigma: number,
): GeomPoint[] {
  const [ax, ay, az] = pipe.start;
  const [bx, by, bz] = pipe.end;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;
  // A deterministic perpendicular pair (Gram-Schmidt against the axis
  // from the world axis LEAST aligned with it — the AISE-017 basis rule).
  const candidates = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  let world = candidates[0]!;
  let bestAlignment = Math.abs(world.x * ux + world.y * uy + world.z * uz);
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const alignment = Math.abs(candidate.x * ux + candidate.y * uy + candidate.z * uz);
    if (alignment < bestAlignment) {
      world = candidate;
      bestAlignment = alignment;
    }
  }
  const dotU = world.x * ux + world.y * uy + world.z * uz;
  let ex = world.x - ux * dotU;
  let ey = world.y - uy * dotU;
  let ez = world.z - uz * dotU;
  const eNorm = Math.hypot(ex, ey, ez);
  ex /= eNorm;
  ey /= eNorm;
  ez /= eNorm;
  const fx = uy * ez - uz * ey;
  const fy = uz * ex - ux * ez;
  const fz = ux * ey - uy * ex;

  const points: GeomPoint[] = [];
  const steps = Math.max(1, Math.round(length / AXIS_STEP));
  for (let step = 0; step <= steps; step += 1) {
    const t = (step / steps) * length;
    for (let ring = 0; ring < RING_COUNT; ring += 1) {
      const theta = (2 * Math.PI * ring) / RING_COUNT;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      let px = ax + ux * t + pipe.radius * (cos * ex + sin * fx);
      let py = ay + uy * t + pipe.radius * (cos * ey + sin * fy);
      let pz = az + uz * t + pipe.radius * (cos * ez + sin * fz);
      if (rng !== null) {
        px += gaussian(rng) * noiseSigma;
        py += gaussian(rng) * noiseSigma;
        pz += gaussian(rng) * noiseSigma;
      }
      points.push({ x: px, y: py, z: pz });
    }
  }
  return points;
}

/** The exact golden pipe network points (no noise). */
export function exactPipeNetworkPoints(): GeomPoint[] {
  return LAYOUT.flatMap((pipe) => samplePipe(pipe, null, 0));
}

/** The noisy golden pipe network points (seeded Gaussian noise, σ = 0.01 m). */
export function noisyPipeNetworkPoints(): GeomPoint[] {
  const rng = new DeterministicRng(PIPE_NOISE_SEED);
  return LAYOUT.flatMap((pipe) => samplePipe(pipe, rng, 0.01));
}

/** Deterministic standard-normal draw (Box–Muller, cached pair). */
let gaussianCache: number | null = null;
function gaussian(rng: DeterministicRng): number {
  if (gaussianCache !== null) {
    const cached = gaussianCache;
    gaussianCache = null;
    return cached;
  }
  const u1 = Math.max(rng.nextUnit(), 1e-12);
  const u2 = rng.nextUnit();
  const magnitude = Math.sqrt(-2 * Math.log(u1));
  const value = magnitude * Math.cos(2 * Math.PI * u2);
  gaussianCache = magnitude * Math.sin(2 * Math.PI * u2);
  return value;
}
