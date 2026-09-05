/**
 * Quantity comparison with strict uncertainty separation (AISE-031).
 *
 * Rules (the acceptance core):
 * - both sides' quantities pass through VERBATIM (value, unit,
 *   uncertainty) — never recomputed, converted or dropped;
 * - a value delta is derived only for same-unit comparisons;
 * - a combined uncertainty is derived only when BOTH sides state
 *   STANDARD uncertainties (RSS); expanded/tolerance or absent
 *   uncertainties stay uncombined (absent — "not stated", never
 *   zero, never guessed);
 * - confidence (a model probability) NEVER enters this module —
 *   it is a separate axis reported by its own change kind.
 */
import { HistoryError } from "./errors.js";
import type { QuantityDelta, QuantitySnapshot } from "./records.js";

/** Structural equality of uncertainty records (kind + all numbers). */
export function uncertaintyEquals(
  a: QuantitySnapshot["uncertainty"],
  b: QuantitySnapshot["uncertainty"],
): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Structural quantity equality (value, unit, uncertainty). */
export function quantityEquals(a: QuantitySnapshot, b: QuantitySnapshot): boolean {
  return (
    a.value === b.value &&
    a.unit === b.unit &&
    uncertaintyEquals(a.uncertainty, b.uncertainty)
  );
}

/** Renders a quantity deterministically (locale-independent). */
export function formatQuantity(quantity: QuantitySnapshot): string {
  const uncertainty =
    quantity.uncertainty === undefined
      ? " uncertainty=unstated"
      : ` uncertainty=${JSON.stringify(quantity.uncertainty)}`;
  return `${JSON.stringify(quantity.value)} ${quantity.unit}${uncertainty}`;
}

/**
 * Derives the delta of a quantity change (uncertainty-separated).
 * Returns `undefined` for the delta value when units differ (no
 * cross-unit arithmetic — reported verbatim instead).
 */
export function deriveQuantityDelta(
  previous: QuantitySnapshot,
  current: QuantitySnapshot,
): QuantityDelta | undefined {
  if (previous.unit !== current.unit) {
    return undefined;
  }
  const delta: QuantityDelta = {
    value: current.value - previous.value,
    unit: current.unit,
  };
  if (
    previous.uncertainty?.kind === "standard" &&
    current.uncertainty?.kind === "standard"
  ) {
    const combined = Math.hypot(previous.uncertainty.u, current.uncertainty.u);
    return Object.freeze({
      ...delta,
      combinedUncertainty: { kind: "standard" as const, u: combined },
    });
  }
  return Object.freeze(delta);
}

/** Fail-closed snapshot check (finite value, valid shape). */
export function checkQuantitySnapshot(quantity: QuantitySnapshot, field: string): void {
  if (quantity === null || typeof quantity !== "object") {
    throw new HistoryError("INPUT_INVALID", `${field} must be a quantity record`, {
      details: { field },
    });
  }
  if (typeof quantity.value !== "number" || !Number.isFinite(quantity.value)) {
    throw new HistoryError("INPUT_INVALID", `${field}.value must be finite`, {
      details: { field: `${field}.value` },
    });
  }
  if (typeof quantity.unit !== "string" || quantity.unit.length === 0) {
    throw new HistoryError("INPUT_INVALID", `${field}.unit must be a non-empty string`, {
      details: { field: `${field}.unit` },
    });
  }
}
