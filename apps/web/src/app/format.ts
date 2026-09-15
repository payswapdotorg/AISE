/**
 * PROD-002 — deterministic display formatting (no clock, no locale).
 *
 * Timestamps are rendered by SLICING the records' own ISO-8601 UTC strings
 * (they are `Z`-suffixed by contract) — no `Date` object, no timezone
 * machinery, no locale: the same record always renders the same text.
 * Numbers reuse the frozen boqlens library's canonical formatters.
 */

import { fmt, moneyFmt } from "../boqlens";

/** "2025-06-02T14:20:00Z" → "2025-06-02 14:20 UTC" (pure string slice). */
export function formatInstant(iso: string): string {
  if (typeof iso !== "string" || iso.length < 16) {
    return iso;
  }
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${date} ${time} UTC`;
}

/** Deterministic byte sizes: "38,214 B" / "4.21 MB" (SI, 2 decimals). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown size";
  }
  if (bytes < 1024) {
    return `${fmt(bytes)} B`;
  }
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  const text = value >= 100 ? fmt(Math.round(value)) : fmt(Math.round(value * 100) / 100);
  return `${text} ${units[unitIndex] ?? "B"}`;
}

/** Money via the library's canonical formatter, with its currency code. */
export function formatMoney(value: number, currency: string): string {
  return `${currency} ${moneyFmt(value)}`;
}

/** "1 item" / "3 items" (deterministic English pluralization). */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? `1 ${singular}` : `${String(count)} ${pluralForm}`;
}

/** A short id chip: "a1b2c3d4…c3d4" (first/last 4 hex of a content id). */
export function shortId(id: string): string {
  if (id.length <= 12) {
    return id;
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
