/**
 * Deterministic MEP test support (AISE-034) — TEST SUPPORT ONLY, never
 * imported by production modules (model.ts / topology.ts / fixtures.ts /
 * index.ts must not import this file; the fixtures carry their own
 * internal deterministic helpers).
 *
 * All ids are fixed seed strings (evidence ids derived via sha-256), all
 * timestamps are fixed constants. No wall-clock, no randomness, no
 * network — the verify gate stays deterministic.
 */

import { sha256Hex } from "../lib/hash";
import type { ProvenanceRecord } from "../reality/model";
import type { MepQuantity } from "./model";

export const FIXED_NOW = "2026-01-21T09:00:00.000Z";
export const FIXED_LATER = "2026-01-21T09:30:00.000Z";

/** Deterministic valid evidence content id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-mep-test:${seed}`);
}

/** A valid provenance record for tests (overridable). */
export function makeProvenance(overrides: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  return {
    role: "SUPPORTS",
    evidenceId: evidenceIdOf("default"),
    recordedAt: FIXED_NOW,
    ...overrides,
  };
}

/** A known nominal size in mm for tests. */
export function knownSize(value: number, unit = "mm"): MepQuantity {
  return { presence: "PRESENT", value, unit };
}

/** An honestly-absent nominal size for tests. */
export function absentQuantity(presence: "UNKNOWN" | "NOT_OBSERVED" | "OCCLUDED", detail?: string): MepQuantity {
  return { presence, ...(detail === undefined ? {} : { detail }) };
}

/**
 * Recursively freeze plain fixture data (purity tests: validators and the
 * validation walk must not mutate their inputs).
 */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    Object.freeze(value);
    for (const item of value) {
      deepFreeze(item);
    }
    return value;
  }
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return value;
  }
  return value;
}

/** Structural (deep) equality for plain JSON data (test assertions). */
export function jsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortKeys(record[key]);
    }
    return out;
  }
  return value;
}
