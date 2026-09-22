/**
 * HFX-101 — the derived RECONSTRUCTION VERSION discipline.
 *
 * The work order's versioning rule: "Reprocessing creates a new derived
 * reconstruction version; original field evidence remains unchanged." This
 * module is the lane's deterministic implementation of that rule:
 *
 *  - every evaluation of a run addresses a DERIVED RECONSTRUCTION VERSION —
 *    a content-addressed version id derived from (run id, provider
 *    identity, the executed input's digest, the ORDINAL of the execution).
 *    The first evaluation is ordinal 1; a reprocess is ordinal 2 — a NEW
 *    derived version, never a mutation of the first;
 *  - the version binds to the run's field-evidence REVISIONS (the capture
 *    set's frame revisions). Reprocessing re-executes over the SAME
 *    evidence bytes — the new version's binding is identical to the
 *    original's, and the original version's record, manifest and outcome
 *    are NEVER mutated (pure functions return new values);
 *  - the committed corpus itself is a frozen value: reprocessing reads it
 *    and leaves it byte-identical (the corpus digest is stable — asserted
 *    by the co-located tests).
 *
 * DETERMINISM: pure functions — no clock, no randomness, no I/O. Identical
 * inputs address identical versions.
 */

import { providerResultDigestOf } from "@aise/provider-registry";
import type { ProviderRegistryEvent } from "@aise/provider-registry";
import { evaluateMapAnythingRun } from "./harness";
import type { MapAnythingEvalOutcome } from "./harness";
import type { MapAnythingEvalRun } from "./model";
import {
  DERIVED_VERSION_PREFIX,
  derivedReconstructionVersionIdOf,
} from "./model";
import type { DerivedVersionAddressInput } from "./model";

export { DERIVED_VERSION_PREFIX, derivedReconstructionVersionIdOf };
export type { DerivedVersionAddressInput };

/* ------------------------------------------------------------------ */
/* The derived version                                                  */
/* ------------------------------------------------------------------ */

/** The derived-reconstruction version record (a ledger entry, never mutated). */
export interface DerivedReconstructionVersion {
  readonly versionId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly inputDigest: string;
  readonly ordinal: number;
  /** The immutable field-evidence revisions the version binds to. */
  readonly evidenceRevisions: readonly string[];
  /** The content-addressed Layer-1 benchmark record of this version's evaluation. */
  readonly recordId: string;
  /** The digest-verifiable provenance manifest of this version's evaluation. */
  readonly manifestId: string;
  /** The state of the derived answer: content, or an explicit non-ready refusal. */
  readonly status: "content" | "non-ready";
}

/**
 * Addresses the derived-reconstruction version of ONE evaluation outcome at
 * the given execution ordinal (pure; the outcome is read, never mutated).
 */
export function derivedReconstructionVersionOf(
  input: DerivedVersionAddressInput & {
    readonly outcome: MapAnythingEvalOutcome;
  },
): DerivedReconstructionVersion {
  return {
    versionId: derivedReconstructionVersionIdOf(input),
    runId: input.runId,
    providerId: input.providerId,
    technologyVersion: input.technologyVersion,
    inputDigest: input.inputDigest,
    ordinal: input.ordinal,
    evidenceRevisions: [...input.outcome.evidenceRevisions],
    recordId: input.outcome.layer1.record.recordId,
    manifestId: input.outcome.layer1.manifest.manifestId,
    status: input.outcome.layer1.normalizedResult.status === "ok" ? "content" : "non-ready",
  };
}

/** Addresses the FIRST derived version of an outcome (the evaluation's own version). */
export function firstDerivedVersionOf(
  outcome: MapAnythingEvalOutcome,
): DerivedReconstructionVersion {
  return derivedReconstructionVersionOf({
    runId: outcome.runId,
    providerId: outcome.layer1.record.providerId,
    technologyVersion: outcome.layer1.record.technologyVersion,
    inputDigest: outcome.layer1.record.reproduction.inputsDigest,
    ordinal: 1,
    outcome,
  });
}

/* ------------------------------------------------------------------ */
/* Reprocessing                                                         */
/* ------------------------------------------------------------------ */

/** The result of one reprocess: the NEW version + the proof the original was untouched. */
export interface MapAnythingReprocessResult {
  /** The reprocessed evaluation (a NEW outcome value; the original object is untouched). */
  readonly reprocessed: MapAnythingEvalOutcome;
  /** The NEW derived reconstruction version (ordinal = prior ordinal + 1). */
  readonly newVersion: DerivedReconstructionVersion;
  /** The ORIGINAL derived reconstruction version (unchanged, still addressable). */
  readonly originalVersion: DerivedReconstructionVersion;
  /** The original outcome, deep-equal to what it was before the reprocess. */
  readonly originalOutcome: MapAnythingEvalOutcome;
  /** True iff the new version binds to the SAME field-evidence revisions as the original. */
  readonly evidenceBindingUnchanged: boolean;
  /** True iff the new version id differs from the original's (a NEW version, never a mutation). */
  readonly newVersionCreated: boolean;
  /** True iff the original version's record + manifest are untouched by the reprocess. */
  readonly originalArtifactsUnchanged: boolean;
  /** The registry event the caller appends for the reprocessed execution (the log order IS the time). */
  readonly appendedEvent: ProviderRegistryEvent;
}

/**
 * REPROCESSES one benchmark run (deterministic): re-executes the double and
 * re-evaluates the Layer-1 outcome over the SAME registry log, then
 * addresses the result as a NEW derived reconstruction version (the prior
 * ordinal + 1). The original outcome, the original version's record and
 * manifest, and the committed corpus are NEVER mutated (pure function —
 * every output is a new value; the proofs are carried on the result).
 */
export function reprocessMapAnythingRun(
  run: MapAnythingEvalRun,
  registryLog: readonly ProviderRegistryEvent[],
  priorOutcome: MapAnythingEvalOutcome,
  priorOrdinal: number = 1,
): MapAnythingReprocessResult {
  const reprocessed = evaluateMapAnythingRun(run, registryLog);
  const originalVersion = derivedReconstructionVersionOf({
    runId: priorOutcome.runId,
    providerId: priorOutcome.layer1.record.providerId,
    technologyVersion: priorOutcome.layer1.record.technologyVersion,
    inputDigest: priorOutcome.layer1.record.reproduction.inputsDigest,
    ordinal: priorOrdinal,
    outcome: priorOutcome,
  });
  const newVersion = derivedReconstructionVersionOf({
    runId: reprocessed.runId,
    providerId: reprocessed.layer1.record.providerId,
    technologyVersion: reprocessed.layer1.record.technologyVersion,
    inputDigest: reprocessed.layer1.record.reproduction.inputsDigest,
    ordinal: priorOrdinal + 1,
    outcome: reprocessed,
  });
  const evidenceBindingUnchanged =
    newVersion.evidenceRevisions.length === originalVersion.evidenceRevisions.length &&
    newVersion.evidenceRevisions.every(
      (revision, index) => revision === originalVersion.evidenceRevisions[index],
    );
  return {
    reprocessed,
    newVersion,
    originalVersion,
    originalOutcome: priorOutcome,
    evidenceBindingUnchanged,
    newVersionCreated: newVersion.versionId !== originalVersion.versionId,
    originalArtifactsUnchanged:
      reprocessed.layer1.record.recordId === originalVersion.recordId &&
      reprocessed.layer1.manifest.manifestId === originalVersion.manifestId,
    appendedEvent: {
      kind: "execution-normalized",
      providerId: reprocessed.layer1.record.providerId,
      technologyVersion: reprocessed.layer1.record.technologyVersion,
      execution: {
        capability: reprocessed.layer1.record.capability,
        inputDigest: reprocessed.layer1.record.reproduction.inputsDigest,
        normalizedResultDigest: providerResultDigestOf(reprocessed.layer1.normalizedResult),
      },
    },
  };
}
