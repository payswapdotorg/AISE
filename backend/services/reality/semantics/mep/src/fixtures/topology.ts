/**
 * Golden MEP asset/topology fixture set (AISE-027, CRITICAL
 * controlled-fixture benchmark) — the AISE-026 golden-room
 * discipline extended with assets.
 *
 * **Exact topology** — the AISE-026 4-pipe discipline extended to
 * a 5-pipe run/branch layout with two gap-connected compact
 * assets, shell-sampled on the same fixed grid (axis step 0.05,
 * 16-point rings), no noise:
 *
 * - pipe A1: along +X at (y=0, z=1), x ∈ [0, 1.55], radius 0.05;
 * - asset V (VALVE): a squat cylinder along +X, x ∈ [1.8, 2.2],
 *   radius 0.075 — 0.25 m gap-connected INLINE between A1's end
 *   and A2's start (the run continues THROUGH it; slenderness
 *   0.4/0.15 = 2.67 < 3 — honestly squat, never a pipe);
 * - pipe A2: along +X at (y=0, z=1), x ∈ [2.45, 4], radius 0.05;
 * - pipe B: along +X at (y=1.2, z=1), x ∈ [0, 4], radius 0.05;
 * - pipe C (branch, thinner): along +Y at (x=3, z=1),
 *   y ∈ [0.25, 0.95], radius 0.0325 (diameter mismatch at both
 *   branches);
 * - pipe D (continuation): along +X at (y=0, z=1), x ∈ [4.25, 5],
 *   radius 0.05 (end-to-end coupling with A2);
 * - asset E (EQUIPMENT): a squat cylinder along +Y centered
 *   (5.5, 0, 1), radius 0.22, y ∈ [−0.2, 0.2] — TERMINAL: pipe
 *   D's end stops 0.28 m short of its scanned surface
 *   (slenderness 0.4/0.44 < 1 — honestly squat; the 0.28 m gap
 *   follows the ≥ 0.25 m fixture separation discipline so the
 *   cell-adjacency clustering never merges D with E).
 *
 * Ground truth: 5 pipes + 2 assets; 3 pipe junctions (C→A2 branch
 * mismatch, C→B branch mismatch, A2↔D coupled compatible); 3 asset
 * connections (V↔A1, V↔A2 — colinear continuation through the
 * valve; E↔D — terminal); one connected component; node degrees
 * {A1:1, V:2, A2:3, C:2, B:1, D:2, E:1}.
 *
 * **Noisy topology** — the same layout with seeded Gaussian noise
 * (σ = 0.01, the golden-room precedent) via the AISE-009
 * deterministic RNG: reproducible, recorded.
 *
 * Generation is a pure function of the parameters — no ambient
 * randomness, no clock, no order dependence.
 */
import { DeterministicRng, type GeomPoint } from "@aise/backend-geometry";

/** The seed for fixture noise synthesis (recorded, reproducible). */
export const TOPOLOGY_NOISE_SEED = 0x27272;

/** The junction tolerance the topology golden benchmark reconstructs with (meters). */
export const TOPOLOGY_JOIN_TOLERANCE = 0.3;

/** The asset connection tolerance the topology golden benchmark reconstructs with (meters). */
export const TOPOLOGY_ASSET_TOLERANCE = 0.35;

/** The ground-truth valve surface gaps (the 0.25 m inline end gaps at radius 0.075). */
export const TOPOLOGY_VALVE_GAP = Math.sqrt(0.25 * 0.25 + 0.075 * 0.075);

/** The ground-truth equipment surface gap (pipe D's end to E's scanned surface). */
export const TOPOLOGY_EQUIPMENT_GAP = 0.28;

/** One shell-sampled cylinder in the layout (pipes and squat assets alike). */
interface ShellEntry {
  readonly name: string;
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly radius: number;
}

/** The five pipes of the topology fixture. */
const PIPES: readonly ShellEntry[] = [
  { name: "A1", start: [0, 0, 1], end: [1.55, 0, 1], radius: 0.05 },
  { name: "A2", start: [2.45, 0, 1], end: [4, 0, 1], radius: 0.05 },
  { name: "B", start: [0, 1.2, 1], end: [4, 1.2, 1], radius: 0.05 },
  { name: "C", start: [3, 0.25, 1], end: [3, 0.95, 1], radius: 0.0325 },
  { name: "D", start: [4.25, 0, 1], end: [5, 0, 1], radius: 0.05 },
];

/** The two compact assets of the topology fixture (squat cylinders). */
const ASSETS: readonly ShellEntry[] = [
  // The VALVE: gap-connected inline in the A-run (A1 — 0.25 m — V — 0.25 m — A2).
  { name: "V", start: [1.8, 0, 1], end: [2.2, 0, 1], radius: 0.075 },
  // The EQUIPMENT: terminal — pipe D ends 0.28 m from its scanned surface
  // (≥ 0.25 m separation: the cell-adjacency clustering never merges D/E).
  { name: "E", start: [5.5, -0.2, 1], end: [5.5, 0.2, 1], radius: 0.22 },
];

/** Axial sampling step (meters — the AISE-026 golden grid). */
const AXIS_STEP = 0.05;
/** Circumferential sampling count per ring (the AISE-026 golden grid). */
const RING_COUNT = 16;

/** Ground truth of the topology fixture (meters). */
export interface TopologyGroundTruth {
  readonly pipes: {
    readonly name: string;
    readonly start: { readonly x: number; readonly y: number; readonly z: number };
    readonly end: { readonly x: number; readonly y: number; readonly z: number };
    readonly diameter: number;
    readonly length: number;
  }[];
  readonly assets: {
    readonly name: string;
    readonly role: "valve" | "equipment";
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly size: number;
  }[];
  readonly junctions: {
    readonly branch: string;
    readonly near: string;
    readonly kind: "branch" | "coupled";
    readonly diameterRelation: "compatible" | "mismatch";
  }[];
  readonly connections: {
    readonly asset: string;
    readonly pipe: string;
    /** The pipe's canonical (lexicographic) endpoint: 0 = start, 1 = end. */
    readonly pipeEndpoint: 0 | 1;
    readonly gap: number;
  }[];
}

/** The axis-midpoint (the exact centroid of a symmetric ring-sampled shell). */
function midpointOf(entry: ShellEntry): { x: number; y: number; z: number } {
  return {
    x: (entry.start[0] + entry.end[0]) / 2,
    y: (entry.start[1] + entry.end[1]) / 2,
    z: (entry.start[2] + entry.end[2]) / 2,
  };
}

/**
 * The exact sphere-equivalent size (2·mean radial from the
 * centroid) of one symmetric ring-sampled squat cylinder: every
 * ring's points share the radial distance sqrt((t−mid)² + R²)
 * from the centroid, so the point mean equals the ring mean.
 */
function meanRadialSize(entry: ShellEntry): number {
  const dx = entry.end[0] - entry.start[0];
  const dy = entry.end[1] - entry.start[1];
  const dz = entry.end[2] - entry.start[2];
  const length = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.round(length / AXIS_STEP));
  let sum = 0;
  let count = 0;
  for (let step = 0; step <= steps; step += 1) {
    const t = (step / steps) * length;
    sum += Math.sqrt((t - length / 2) ** 2 + entry.radius ** 2);
    count += 1;
  }
  return (2 * sum) / count;
}

export function topologyGroundTruth(): TopologyGroundTruth {
  return {
    pipes: PIPES.map((pipe) => ({
      name: pipe.name,
      start: { x: pipe.start[0], y: pipe.start[1], z: pipe.start[2] },
      end: { x: pipe.end[0], y: pipe.end[1], z: pipe.end[2] },
      diameter: 2 * pipe.radius,
      length: Math.hypot(pipe.end[0] - pipe.start[0], pipe.end[1] - pipe.start[1], pipe.end[2] - pipe.start[2]),
    })),
    assets: ASSETS.map((asset) => ({
      name: asset.name,
      role: asset.name === "V" ? "valve" : "equipment",
      position: midpointOf(asset),
      size: meanRadialSize(asset),
    })),
    junctions: [
      { branch: "C", near: "A2", kind: "branch", diameterRelation: "mismatch" },
      { branch: "C", near: "B", kind: "branch", diameterRelation: "mismatch" },
      { branch: "A2", near: "D", kind: "coupled", diameterRelation: "compatible" },
    ],
    connections: [
      { asset: "V", pipe: "A1", pipeEndpoint: 1, gap: TOPOLOGY_VALVE_GAP },
      { asset: "V", pipe: "A2", pipeEndpoint: 0, gap: TOPOLOGY_VALVE_GAP },
      { asset: "E", pipe: "D", pipeEndpoint: 1, gap: TOPOLOGY_EQUIPMENT_GAP },
    ],
  };
}

/** Samples one shell (pipe or squat asset) deterministically (grid rings along the axis). */
function sampleShell(entry: ShellEntry, rng: DeterministicRng | null, noiseSigma: number): GeomPoint[] {
  const [ax, ay, az] = entry.start;
  const [bx, by, bz] = entry.end;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;
  // A deterministic perpendicular pair (Gram-Schmidt against the axis
  // from the world axis LEAST aligned with it — the AISE-017 basis rule,
  // identical to the AISE-026 golden sampler).
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
      let px = ax + ux * t + entry.radius * (cos * ex + sin * fx);
      let py = ay + uy * t + entry.radius * (cos * ey + sin * fy);
      let pz = az + uz * t + entry.radius * (cos * ez + sin * fz);
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

/** The exact golden topology points (no noise). */
export function exactTopologyPoints(): GeomPoint[] {
  return [...PIPES, ...ASSETS].flatMap((entry) => sampleShell(entry, null, 0));
}

/** The noisy golden topology points (seeded Gaussian noise, σ = 0.01 m). */
export function noisyTopologyPoints(): GeomPoint[] {
  const rng = new DeterministicRng(TOPOLOGY_NOISE_SEED);
  return [...PIPES, ...ASSETS].flatMap((entry) => sampleShell(entry, rng, 0.01));
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
