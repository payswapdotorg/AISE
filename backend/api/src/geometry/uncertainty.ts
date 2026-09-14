/**
 * First-order (linear) uncertainty propagation core (AISE-013).
 *
 *   σ_y = sqrt( Σ (∂y/∂xᵢ)² · σᵢ² )
 *
 * FROZEN DISCIPLINE (architecture-lock "Truth and uncertainty"): this
 * module deals ONLY in physical 1σ (standard-uncertainty) values. A
 * CONFIDENCE (probability of a belief — see `Confidence` vs `Uncertainty`
 * in @aise/shared-contracts) is NEVER accepted here and NEVER substituted
 * for an uncertainty; there is no confidence parameter anywhere in this
 * module's API (asserted by type-level absence tests).
 *
 * Nullability discipline: `null` means "σ unknown" and propagates to a null
 * result — it is NEVER coerced to 0, and 0 is reserved for an explicit
 * "measured exactly" assertion by the caller. Every measurement in
 * measure.ts routes its σ through this helper so the discipline has one
 * auditable implementation point.
 */

import { GeometryError } from "./errors";

/** A measurement value together with its propagated 1σ uncertainty. */
export interface Measurement {
  readonly value: number;
  /** Propagated 1σ; null = unknown (never a silent 0). */
  readonly uncertainty: number | null;
}

/**
 * First-order propagation: given the value y and, for each independent
 * input xᵢ, the partial derivative ∂y/∂xᵢ and the input's 1σ σᵢ, returns
 * { value: y, uncertainty: σ_y } with σ_y = sqrt(Σ (∂y/∂xᵢ)² σᵢ²).
 *
 * - Any null σᵢ → uncertainty null (unknown dominates; never 0).
 * - Negative σᵢ → INVALID_INPUT naming the index (σ is a non-negative
 *   physical quantity).
 * - Length mismatch or an empty term list → INVALID_INPUT.
 * - Partials may be any finite number (a zero partial legitimately drops a
 *   term: that input does not influence y).
 *
 * Inputs are assumed INDEPENDENT — correlation terms are not modeled; the
 * measurements in measure.ts document their independence assumptions.
 */
export function propagateUncertainty(
  value: number,
  partials: readonly number[],
  inputUncertainties: readonly (number | null)[],
): Measurement {
  if (partials.length !== inputUncertainties.length) {
    throw new GeometryError(
      "INVALID_INPUT",
      `propagateUncertainty: ${partials.length} partials but ${inputUncertainties.length} input uncertainties`,
    );
  }
  if (partials.length === 0) {
    throw new GeometryError(
      "INVALID_INPUT",
      "propagateUncertainty: at least one input term is required",
    );
  }
  let variance = 0;
  for (let index = 0; index < inputUncertainties.length; index += 1) {
    const sigma = inputUncertainties[index];
    const partial = partials[index];
    if (sigma === undefined || partial === undefined) {
      // Sparse/holey arrays are malformed input, not unknown sigma.
      throw new GeometryError(
        "INVALID_INPUT",
        `propagateUncertainty: undefined entry at index ${index} (sparse array?)`,
      );
    }
    if (sigma === null) {
      return { value, uncertainty: null };
    }
    if (sigma < 0) {
      throw new GeometryError(
        "INVALID_INPUT",
        `propagateUncertainty: input uncertainty at index ${index} is negative (${sigma}); σ is non-negative`,
      );
    }
    variance += partial * partial * sigma * sigma;
  }
  return { value, uncertainty: Math.sqrt(variance) };
}

