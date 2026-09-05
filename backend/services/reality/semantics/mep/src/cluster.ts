/**
 * Deterministic proximity clustering (AISE-026).
 *
 * Grid-hash clustering with union-find over the CANONICALIZED
 * (sorted) input points: two points join a cluster when their
 * grid cells touch (3×3×3 neighborhood) with a cell size of
 * `clusterRadius`. Representatives are the first point in
 * canonical order — deterministic for any input permutation.
 *
 * Contract: points STRICTLY within `clusterRadius` (per-axis
 * distance < R) always join. Points at exactly the radius may
 * land two cells apart (float-exact boundary) and legitimately
 * fragment — sampling density must exceed the radius (the
 * golden fixtures sample at half the radius; the limitation is
 * documented in the README).
 *
 * This mirrors the AISE-010 segmentation discipline: the input's
 * emission order never matters (the caller canonicalizes before
 * clustering); cluster emission order is canonical (first-member
 * order).
 */
import type { GeomPoint } from "@aise/backend-geometry";

/** One point cluster in canonical member order. */
export interface PointCluster {
  /** Index of the first member in the canonicalized input (diagnostics). */
  readonly firstIndex: number;
  readonly points: readonly GeomPoint[];
}

/**
 * Clusters canonically-sorted points by grid proximity.
 *
 * Fail-closed: non-finite coordinates throw (validated upstream,
 * re-checked here defensively).
 */
export function clusterPoints(
  canonical: readonly GeomPoint[],
  clusterRadius: number,
): PointCluster[] {
  if (!Number.isFinite(clusterRadius) || clusterRadius <= 0) {
    throw new Error(`clusterRadius must be positive: ${String(clusterRadius)}`);
  }
  const cell = clusterRadius;
  const keyOf = (point: GeomPoint): string =>
    `${Math.floor(point.x / cell)},${Math.floor(point.y / cell)},${Math.floor(point.z / cell)}`;
  const grid = new Map<string, number[]>();
  for (let index = 0; index < canonical.length; index += 1) {
    const point = canonical[index]!;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      throw new Error(`non-finite point at canonical index ${index}`);
    }
    const key = keyOf(point);
    const bucket = grid.get(key);
    if (bucket === undefined) {
      grid.set(key, [index]);
    } else {
      bucket.push(index);
    }
  }
  // Union-find with deterministic representatives (smallest index).
  const parent: number[] = [];
  for (let index = 0; index < canonical.length; index += 1) {
    parent.push(index);
  }
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root] as number;
    }
    // Path compression (order-safe).
    let current = index;
    while (parent[current] !== root) {
      const next = parent[current] as number;
      parent[current] = root;
      current = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      return;
    }
    // Deterministic: the smaller index becomes the representative.
    if (ra < rb) {
      parent[rb] = ra;
    } else {
      parent[ra] = rb;
    }
  };
  for (let index = 0; index < canonical.length; index += 1) {
    const point = canonical[index]!;
    const bx = Math.floor(point.x / cell);
    const by = Math.floor(point.y / cell);
    const bz = Math.floor(point.z / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = grid.get(`${bx + dx},${by + dy},${bz + dz}`);
          if (bucket === undefined) {
            continue;
          }
          for (const other of bucket) {
            union(index, other);
          }
        }
      }
    }
  }
  // Collect clusters in canonical (first-member) order.
  const members = new Map<number, number[]>();
  for (let index = 0; index < canonical.length; index += 1) {
    const root = find(index);
    const bucket = members.get(root);
    if (bucket === undefined) {
      members.set(root, [index]);
    } else {
      bucket.push(index);
    }
  }
  const clusters: PointCluster[] = [];
  for (const [root, indices] of [...members.entries()].sort((a, b) => a[0] - b[0])) {
    clusters.push({
      firstIndex: root,
      points: indices.map((index) => canonical[index]!),
    });
  }
  return clusters;
}
