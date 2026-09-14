/**
 * Deterministic symmetric 3×3 eigen decomposition (AISE-013).
 *
 * Method (closed form, NO iteration, NO randomness):
 *   1. EIGENVALUES by Smith's analytic solution of the characteristic
 *      cubic (B. T. Smith, Commun. ACM 1961; the formulation popularized by
 *      Kopp 2008 / the "Eigenvalue algorithm" survey):
 *        q = tr(A)/3;  p1 = a01²+a02²+a12²;
 *        p = sqrt(((a00−q)²+(a11−q)²+(a22−q)²+2p1)/6);  B = (A−qI)/p;
 *        r = det(B)/2 clamped to [−1,1];  φ = acos(r)/3;
 *        λ_max = q + 2p·cos φ;  λ_min = q + 2p·cos(φ+2π/3);
 *        λ_mid = 3q − λ_max − λ_min (trace identity).
 *      The clamp guards acos's domain against float roundoff ONLY at the
 *      degenerate |r| ≈ 1 ends (repeated eigenvalues); it never moves a
 *      well-separated eigenvalue.
 *   2. EIGENVECTORS by the row cross-product method: for eigenvalue λ the
 *      null space of M = A − λI is spanned by cross products of row pairs;
 *      the pair with the largest parallelism |ri×rj|/(|ri||rj|) (ties → the
 *      earliest pair in the fixed order (r0,r1),(r0,r2),(r1,r2)) is
 *      normalized. When no pair exceeds EIGENVECTOR_PARALLELISM_EPS (rank
 *      ≤ 1 — a repeated eigenvalue with a ≥2-dimensional eigenspace) the
 *      deterministic fallback crosses the largest-norm row with the
 *      standard-basis axis least aligned with it; a numerically zero M
 *      (triple eigenvalue) returns the canonical basis.
 *   3. Signs canonicalized via canonicalAxisSign (largest-magnitude
 *      component positive, ties → lowest index) so results are reproducible.
 *
 * Determinism: fixed operation order everywhere; the only platform functions
 * are sqrt/cos/acos, each evaluated once per call in a fixed sequence. Same
 * input bits on the same platform → same output bits. Point ORDER inside
 * fitted covariances is the caller's summation order — see fitting.ts for
 * the documented order-independence tolerance.
 *
 * Accuracy: eigenvalues accurate to ~1e-15·|A| relative; eigenvector error
 * ~ eps·|A|/(eigenvalue gap) — repeated eigenvalues yield a deterministic
 * but individually arbitrary member of the eigenspace (documented, callers
 * detect degeneracy BEFORE trusting orientation).
 */

import {
  canonicalAxisSign,
  type Mat3,
  type Vec3,
  vecCross,
  vecNorm,
} from "./vector";

/** Result of `symmetricEigen3`: eigenvalues ascending with unit eigenvectors. */
export interface SymmetricEigen {
  /** λ1 ≤ λ2 ≤ λ3 (ascending, as required by rank/degeneracy checks). */
  readonly eigenvalues: readonly [number, number, number];
  /** eigenvectors[i] is a unit eigenvector for eigenvalues[i]. */
  readonly eigenvectors: readonly [Vec3, Vec3, Vec3];
}

/**
 * Relative parallelism threshold below which a row-cross candidate is
 * considered numerically unusable: |ri×rj| / (|ri||rj|) below 1e-14 means
 * the rows are parallel to within ~46 bits — under double resolution.
 * Named constant so the degenerate-eigenspace fallback is auditable.
 */
export const EIGENVECTOR_PARALLELISM_EPS = 1e-14;

/** Unit standard basis vector e_index (index ∈ {0,1,2}). */
function axis(index: number): Vec3 {
  return [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0];
}

/** |ri×rj| / (|ri||rj|) — sin of the inter-row angle; 0 if either row is 0. */
function parallelism(cross: Vec3, ni: number, nj: number): number {
  const denom = ni * nj;
  if (denom === 0) {
    return 0;
  }
  return vecNorm(cross) / denom;
}

/** Non-throwing normalize: zero vectors map to [0,0,0] (callers guard). */
function softNormalize(v: Vec3): Vec3 {
  const norm = vecNorm(v);
  if (norm === 0) {
    return [0, 0, 0];
  }
  return [v[0] / norm, v[1] / norm, v[2] / norm];
}

/**
 * Eigenvector of the symmetric matrix (a00,a01,a02,a11,a12,a22) for the
 * already-computed eigenvalue `lambda`; `slot` is the computation slot used
 * only by the triple-eigenvalue basis fallback. See header step 2.
 */
function eigenvectorFor(
  entries: readonly [number, number, number, number, number, number],
  lambda: number,
  slot: number,
): Vec3 {
  const [a00, a01, a02, a11, a12, a22] = entries;
  // Rows of M = A − λI (symmetric ⇒ rows ≡ columns).
  const r0: Vec3 = [a00 - lambda, a01, a02];
  const r1: Vec3 = [a01, a11 - lambda, a12];
  const r2: Vec3 = [a02, a12, a22 - lambda];
  const n0 = vecNorm(r0);
  const n1 = vecNorm(r1);
  const n2 = vecNorm(r2);

  // Candidate null-space directions, fixed pair order (0,1),(0,2),(1,2).
  const c01 = vecCross(r0, r1);
  const c02 = vecCross(r0, r2);
  const c12 = vecCross(r1, r2);
  const p01 = parallelism(c01, n0, n1);
  const p02 = parallelism(c02, n0, n2);
  const p12 = parallelism(c12, n1, n2);

  let best = c01;
  let bestParallelism = p01;
  if (p02 > bestParallelism) {
    best = c02;
    bestParallelism = p02;
  }
  if (p12 > bestParallelism) {
    best = c12;
    bestParallelism = p12;
  }

  if (bestParallelism > EIGENVECTOR_PARALLELISM_EPS) {
    return softNormalize(best);
  }

  // Rank ≤ 1 fallback: all rows are (numerically) parallel to one direction
  // u (or zero). The eigenspace is u⊥; build a deterministic member of u⊥
  // from the largest row and the axis least aligned with it.
  let maxRow = r0;
  let maxRowNorm = n0;
  if (n1 > maxRowNorm) {
    maxRow = r1;
    maxRowNorm = n1;
  }
  if (n2 > maxRowNorm) {
    maxRow = r2;
    maxRowNorm = n2;
  }
  if (maxRowNorm > 0) {
    // Argmin |maxRow[k]| with ties → lowest index; the winning axis is the
    // one least aligned with maxRow, maximizing |maxRow × e_k|.
    let leastAligned = 0;
    const m0 = Math.abs(maxRow[0]);
    const m1 = Math.abs(maxRow[1]);
    const m2 = Math.abs(maxRow[2]);
    if (m1 < m0 && m1 <= m2) {
      leastAligned = 1;
    } else if (m2 < m0 && m2 < m1) {
      leastAligned = 2;
    }
    // maxRow ∥ e_leastAligned is impossible here (the least-aligned axis
    // has the SMALLEST |component|), so the cross is nonzero for r ≠ 0.
    const candidate = softNormalize(vecCross(maxRow, axis(leastAligned)));
    if (vecNorm(candidate) > 0) {
      return candidate;
    }
  }
  // Triple eigenvalue: A ≈ λI. Canonical basis, deterministic by slot.
  return axis(slot);
}

/**
 * Closed-form eigen decomposition of a symmetric 3×3 matrix (upper triangle
 * of `m` is used; symmetry is assumed — fitting.ts constructs symmetric
 * covariances). Returns eigenvalues ASCENDING with unit, sign-canonicalized
 * eigenvectors. Deterministic; never throws for finite input.
 */
export function symmetricEigen3(m: Mat3): SymmetricEigen {
  const a00 = m[0][0];
  const a01 = m[0][1];
  const a02 = m[0][2];
  const a11 = m[1][1];
  const a12 = m[1][2];
  const a22 = m[2][2];
  const entries = [a00, a01, a02, a11, a12, a22] as const;

  const p1 = a01 * a01 + a02 * a02 + a12 * a12;

  let values: [number, number, number];
  if (p1 === 0) {
    // Exactly diagonal (off-diagonals exactly zero): exact eigenpairs.
    values = [a00, a11, a22];
  } else {
    const q = (a00 + a11 + a22) / 3;
    const p2 =
      (a00 - q) * (a00 - q) +
      (a11 - q) * (a11 - q) +
      (a22 - q) * (a22 - q) +
      2 * p1;
    const p = Math.sqrt(p2 / 6);
    const b00 = (a00 - q) / p;
    const b01 = a01 / p;
    const b02 = a02 / p;
    const b11 = (a11 - q) / p;
    const b12 = a12 / p;
    const b22 = (a22 - q) / p;
    const detB =
      b00 * (b11 * b22 - b12 * b12) -
      b01 * (b01 * b22 - b12 * b02) +
      b02 * (b01 * b12 - b11 * b02);
    const r = Math.min(1, Math.max(-1, detB / 2));
    const phi = Math.acos(r) / 3;
    const lambdaMax = q + 2 * p * Math.cos(phi);
    const lambdaMin = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
    const lambdaMid = 3 * q - lambdaMax - lambdaMin;
    values = [lambdaMin, lambdaMid, lambdaMax];
  }

  // Sort ascending; ties broken by original computation slot (deterministic
  // even on unstable sort implementations). The slot also carries the axis
  // identity for the exactly-diagonal branch.
  const pairs: Array<readonly [number, number]> = [
    [values[0], 0],
    [values[1], 1],
    [values[2], 2],
  ];
  const sorted = pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const eigenvalues = sorted.map(
    ([value]) => value,
  ) as [number, number, number];
  const eigenvectors = sorted.map(([value, slot]) =>
    canonicalAxisSign(
      p1 === 0 ? axis(slot) : eigenvectorFor(entries, value, slot),
    ),
  ) as [Vec3, Vec3, Vec3];

  return { eigenvalues, eigenvectors };
}
