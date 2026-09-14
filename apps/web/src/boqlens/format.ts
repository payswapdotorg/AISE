/**
 * AISE-024 — deterministic text/number formatting primitives (internal).
 *
 * Mirrors the AISE-021 workspace/format.ts discipline so the same input
 * always produces BYTE-IDENTICAL output: no clock, no randomness, no
 * locale-dependent formatting anywhere.
 *
 *  - `fmt`       canonical shortest number text (−0 → 0, 1e-6 float-dust kill);
 *  - `moneyFmt`  deterministic money text with own 3-digit grouping and
 *                exactly 2 decimals (toLocaleString is FORBIDDEN — locale);
 *  - `pct`       deterministic percentage text (2-decimal rounding);
 *  - `escapeHtml` XML text/attribute escaping (five significant characters).
 */

/** Deterministic number text: canonical 0, 1e-6 rounding, shortest form. */
export function fmt(value: number): string {
  const canonical = value === 0 ? 0 : value;
  const rounded = Math.round(canonical * 1e6) / 1e6;
  return String(rounded);
}

/** Deterministic money text: "2,750.00" / "-12.05" — never locale-dependent. */
export function moneyFmt(value: number): string {
  const sign = value < 0 ? "-" : "";
  const cents = Math.round(Math.abs(value) * 100);
  const units = Math.floor(cents / 100);
  const remainder = cents % 100;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${String(remainder).padStart(2, "0")}`;
}

/** Deterministic percentage of a part over a total ("50" or "16.67"). */
export function pct(part: number, total: number): string {
  if (total <= 0) {
    return "0";
  }
  return fmt(Math.round((part / total) * 10000) / 100);
}

/** XML text/attribute escaping (the five significant characters). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
