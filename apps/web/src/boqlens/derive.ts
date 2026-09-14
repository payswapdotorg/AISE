/**
 * AISE-024 — deterministic derivations shared by the renderer and the trace
 * resolver: section grouping, location grouping (contractor view) and the
 * amount rollups (cost hierarchy).
 *
 * These are AGGREGATIONS over already-parsed input values, never parsing:
 * rollups are computed ONLY from the numeric cells that arrive in the input,
 * and every rollup records its contributing items/cell refs so the renderer
 * and `traceClaim` agree BY CONSTRUCTION (one derivation, two consumers).
 *
 * Money discipline: currencies are NEVER converted. A rollup is anchored to
 * the currency of its first amount-bearing item; amounts stated in a
 * different currency are EXCLUDED and counted explicitly (honest exclusion,
 * never a silent conversion). Items without a stated amount are likewise
 * excluded and counted — never assumed zero.
 */

import type { BoqLensItem } from "./model";

/* ------------------------------------------------------------------ */
/* Section grouping (cost hierarchy: sections → items)                 */
/* ------------------------------------------------------------------ */

export interface SectionGroup {
  /** Ordinal in deterministic first-appearance (document) order. */
  readonly index: number;
  readonly title: string | null;
  readonly items: readonly BoqLensItem[];
}

export function sectionGroups(items: readonly BoqLensItem[]): SectionGroup[] {
  const groups: { index: number; title: string | null; items: BoqLensItem[] }[] = [];
  const byTitle = new Map<string, { index: number; title: string | null; items: BoqLensItem[] }>();
  for (const item of items) {
    const key = item.sectionTitle ?? "";
    let group = byTitle.get(key);
    if (group === undefined) {
      group = { index: groups.length, title: item.sectionTitle, items: [] };
      byTitle.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* Amount rollups (pure aggregation over parsed cells)                 */
/* ------------------------------------------------------------------ */

export interface RollupContributor {
  readonly item: BoqLensItem;
  readonly cellRef: string;
  readonly value: number;
}

export interface MoneyRollup {
  /** Currency of the first amount-bearing item; null when none has an amount. */
  readonly currency: string | null;
  readonly total: number;
  readonly contributors: readonly RollupContributor[];
  readonly excludedNoAmount: readonly BoqLensItem[];
  readonly excludedCurrency: readonly BoqLensItem[];
}

/**
 * Deterministic rollup over a set of items: sum of stated amounts in the
 * anchor currency, with honest exclusion lists (never assumed zero, never
 * converted). Contributor order = input order.
 */
export function rollupAmounts(items: readonly BoqLensItem[]): MoneyRollup {
  const amountBearers = items.filter((item) => item.amount !== null);
  const currency = amountBearers.length === 0 ? null : (amountBearers[0]?.currency ?? null);
  const contributors: RollupContributor[] = [];
  const excludedCurrency: BoqLensItem[] = [];
  let total = 0;
  for (const item of items) {
    if (item.amount === null) {
      continue;
    }
    if (currency !== null && item.currency !== currency) {
      excludedCurrency.push(item);
      continue;
    }
    contributors.push({ item, cellRef: item.amount.cellRef ?? "", value: item.amount.value });
    total += item.amount.value;
  }
  const excludedNoAmount = items.filter((item) => item.amount === null);
  return { currency, total, contributors, excludedNoAmount, excludedCurrency };
}

/* ------------------------------------------------------------------ */
/* Location grouping (contractor view)                                 */
/* ------------------------------------------------------------------ */

export interface LocationGroup {
  /** Ordinal in deterministic first-appearance order; unconfirmed is last. */
  readonly index: number;
  /** Joined space path of the group (the display label). */
  readonly label: string;
  /** False only for the "location unconfirmed" group (honest unknown). */
  readonly confirmed: boolean;
  readonly items: readonly BoqLensItem[];
}

/** Join a space path into a display label ("Site A / Building 1"). */
export function locationLabel(spacePath: readonly string[]): string {
  return spacePath.join(" / ");
}

/**
 * Distinct confirmed locations of one item's mapping targets (mapped items
 * only): the item appears in EVERY distinct target location — a contractor
 * working in any of those locations needs the task. Empty when the location
 * is unconfirmed (unmapped/ambiguous/mapped-without-path/no record).
 */
export function confirmedLocationsOf(item: BoqLensItem): string[] {
  const mapping = item.mapping;
  if (mapping === undefined || mapping.status !== "mapped" || mapping.targets.length === 0) {
    return [];
  }
  const labels = new Set<string>();
  for (const target of mapping.targets) {
    if (target.spacePath !== undefined && target.spacePath.length > 0) {
      labels.add(locationLabel(target.spacePath));
    }
  }
  return [...labels];
}

/**
 * Honest reason one item sits in the "location unconfirmed" group — the
 * reason is stated, never guessed away.
 */
export function unconfirmedReason(item: BoqLensItem): string {
  const mapping = item.mapping;
  if (mapping === undefined) {
    return "no mapping record for this row";
  }
  if (mapping.status === "unmapped") {
    return `mapping unmapped${mapping.reason === undefined ? "" : ` (${mapping.reason})`}`;
  }
  if (mapping.status === "ambiguous") {
    const count = mapping.alternatives?.length ?? 0;
    return `mapping ambiguous (${count} competing candidate${count === 1 ? "" : "s"} recorded, no target committed)`;
  }
  return "mapped without a recorded location";
}

/** Deterministic location groups: confirmed in first-appearance order, unconfirmed last. */
export function locationGroups(items: readonly BoqLensItem[]): LocationGroup[] {
  const confirmed = new Map<string, BoqLensItem[]>();
  const unconfirmed: BoqLensItem[] = [];
  for (const item of items) {
    const labels = confirmedLocationsOf(item);
    if (labels.length === 0) {
      unconfirmed.push(item);
      continue;
    }
    for (const label of labels) {
      const bucket = confirmed.get(label);
      if (bucket === undefined) {
        confirmed.set(label, [item]);
      } else {
        bucket.push(item);
      }
    }
  }
  const groups: LocationGroup[] = [...confirmed.entries()].map(([label, groupItems], index) => ({
    index,
    label,
    confirmed: true,
    items: groupItems,
  }));
  if (unconfirmed.length > 0) {
    groups.push({
      index: groups.length,
      label: "location unconfirmed",
      confirmed: false,
      items: unconfirmed,
    });
  }
  return groups;
}
