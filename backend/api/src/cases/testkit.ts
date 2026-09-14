/**
 * Deterministic Engineering Case test fixtures (AISE-025) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * All ids are fixed seed strings (evidence ids derive via sha-256), all
 * timestamps are fixed constants, clocks are constant or fixed-sequence
 * functions. No wall-clock, no randomness, no network — the verify gate
 * stays deterministic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import { CaseService } from "./service";

export const FIXED_NOW = "2026-01-19T09:00:00.000Z";
export const FIXED_LATER = "2026-01-19T09:30:00.000Z";
export const FIXED_EVEN_LATER = "2026-01-19T10:15:00.000Z";

/** Injected clock: constant, so case bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Deterministic advancing clock: returns steps[i] on the i-th call. */
export function makeSequenceClock(steps: readonly string[]): () => string {
  let calls = 0;
  const last = steps.length - 1;
  return (): string => {
    const value = steps[Math.min(calls, last)];
    calls += 1;
    return value ?? steps[last] ?? FIXED_NOW;
  };
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-cases-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-cases-test:${seed}`);
}

export const EV_WALL_PHOTO = evidenceIdOf("wall-photo");
export const EV_MOISTURE_READING = evidenceIdOf("moisture-reading");
export const EV_ROOF_VIDEO = evidenceIdOf("roof-video");

export interface LifecycleIds {
  readonly caseId: string;
  readonly observationId: string;
  readonly hypothesisId: string;
  readonly missingId: string;
}

/**
 * The full happy-path lifecycle (create → observe → hypothesize →
 * missing-evidence), stopping BEFORE collect/review/resolve so tests can
 * drive those transitions themselves.
 */
export async function runLifecycle(service: CaseService): Promise<LifecycleIds> {
  const caseId = "case-lifecycle-1";
  await service.createCase({
    caseId,
    title: "Damp ingress, north elevation",
    links: { nodeIds: ["node-wall-north"], evidenceIds: [], captureSessionIds: ["session-42"] },
  });
  const observation = await service.addObservation(caseId, {
    statement: "Efflorescence and damp staining on the north wall, 1.2 m above floor level.",
    evidenceIds: [EV_WALL_PHOTO],
    measurementRefs: ["meas-moisture-7"],
  });
  const hypothesis = await service.addHypothesis(caseId, {
    statement: "Rainwater penetrates through failed render on the north elevation.",
    epistemicStatus: "INFERRED",
    supportingObservationIds: [observation.observationId],
    contradictingObservationIds: [],
    confidence: "medium",
  });
  const missing = await service.addMissingEvidence(caseId, {
    description: "Roof drainage condition above the affected wall is unknown.",
    kind: "MISSING",
    wouldResolve: [hypothesis.hypothesisId],
    requestedMethod: "drone photo pass",
  });
  return {
    caseId,
    observationId: observation.observationId,
    hypothesisId: hypothesis.hypothesisId,
    missingId: missing.missingId,
  };
}
