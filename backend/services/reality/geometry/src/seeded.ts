/**
 * Deterministic pseudo-random number generation (AISE-009).
 *
 * The geometry primitives are deterministic functions of their
 * inputs: ambient randomness, wall-clock reads, and similar
 * nondeterministic platform calls are
 * forbidden on every computation path. Two places still need
 * pseudo-randomness:
 *
 * - robust fitting samples a *subset* of candidate hypotheses when
 *   the full combinatorial set is too large;
 * - the test suite synthesizes bounded noise for regression
 *   fixtures.
 *
 * Both use this xorshift32 generator: integer-only operations and a
 * fixed, explicit seed recorded in the provenance parameters, so
 * the same inputs and the same seed reproduce the same output
 * bit-for-bit. The generator is deliberately NOT cryptographically
 * strong — it only needs to be reproducible.
 */

/** Deterministic xorshift32 stream with an explicit seed. */
export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) {
      throw new Error(`deterministic RNG seed must be an integer in [1, 0xffffffff]: ${String(seed)}`);
    }
    this.state = seed | 0;
  }

  /** Next raw uint32. */
  nextUint32(): number {
    let x = this.state;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.state = x >>> 0;
    return this.state;
  }

  /** Next value in [0, 1). */
  nextUnit(): number {
    return this.nextUint32() / 0x100000000;
  }

  /**
   * Next value in [-1, 1) — used for symmetric noise synthesis
   * (zero-mean by construction over long streams).
   */
  nextSignedUnit(): number {
    return this.nextUnit() * 2 - 1;
  }

  /**
   * Deterministic permutation of indices [0, n) — Fisher-Yates
   * driven by this generator. Used to prove permutation invariance
   * of every accumulation path: the same point set in any order
   * must yield bit-identical results.
   */
  permutation(n: number): number[] {
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i -= 1) {
      const j = this.nextUint32() % (i + 1);
      const tmp = indices[i] as number;
      indices[i] = indices[j] as number;
      indices[j] = tmp;
    }
    return indices;
  }
}

/** The fixed default seed used by robust fitting candidate sampling. */
export const ROBUST_SAMPLING_SEED = 0x9e3779b9;

/** The fixed default seed used by the deterministic noise fixtures. */
export const NOISE_FIXTURE_SEED = 0x1234abcd;
