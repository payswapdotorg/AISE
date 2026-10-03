/**
 * WORLD-P0-A — seeded deterministic pseudo-randomness for the substitution
 * doubles.
 *
 * The doubles must be DETERMINISTIC (identical inputs → byte-identical
 * artifacts, spec/world-program.md §Gates item 4) while some lanes need
 * pseudo-random-looking distributions (stress scenes, jittered
 * coordinates, mutation corpora). `Math.random()` is forbidden (it is
 * exactly the unseeded, unrepeatable randomness the determinism law
 * rejects). This module provides mulberry32 — a small, well-characterized
 * 32-bit PRNG — seeded explicitly by the caller: the same seed produces
 * the identical sequence on every host, forever.
 *
 * This is NOT a cryptographic primitive and declares no security claim;
 * it exists so doubles can be deterministic AND varied.
 */

/** The seeded sequence contract. */
export interface SeededRandom {
  /** Next float in [0, 1). */
  next(): number;
  /** Next 32-bit unsigned integer. */
  nextUint32(): number;
  /** The seed (exposed for provenance — a double records what it used). */
  readonly seed: number;
  /** The current internal state (debug/provenance only). */
  state(): number;
}

/**
 * Mulberry32: 32-bit state, period 2^32, good statistical behavior for
 * double-side fixtures. Reference implementation public domain.
 */
export function seededRandom(seed: number): SeededRandom {
  let a = seed >>> 0;
  return {
    seed,
    state: () => a >>> 0,
    nextUint32(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    },
    next(): number {
      return this.nextUint32() / 4294967296;
    },
  };
}

/** Draw `count` floats in [0, 1) from one seed — pure and repeatable. */
export function seededFloats(seed: number, count: number): number[] {
  const random = seededRandom(seed);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(random.next());
  }
  return values;
}

/** Draw `count` integers in [minInclusive, maxInclusive] from one seed. */
export function seededIntegers(
  seed: number,
  count: number,
  minInclusive: number,
  maxInclusive: number,
): number[] {
  const random = seededRandom(seed);
  const span = maxInclusive - minInclusive + 1;
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(minInclusive + Math.floor(random.next() * span));
  }
  return values;
}
