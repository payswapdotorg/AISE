/**
 * Solution validation snapshot (PROD-021) — family `validation`.
 *
 * THE DECLARED SNAPSHOT a generated solution BOQ is tied to (ACR-005: "a
 * generated solution BOQ must be tied to a declared validation snapshot";
 * architecture-lock: "A solution BOQ may be generated only from a declared
 * validation snapshot of a solution version").
 *
 *  - `Validate` is a SERVER-SIDE DETERMINISTIC operation (PROD-022). This
 *    package carries the snapshot RECORD; it never performs validation and
 *    a client can never author one meaningfully — the snapshot is an
 *    engine-owned authoritative statement.
 *  - Findings are EXPLICIT: every check answers `pass | fail | unknown |
 *    review-needed` (the ACR-005 vocabulary); `outcome` is the worst-of
 *    (fail > review-needed > unknown > pass — invariant
 *    `validation_outcome_not_worst_of_checks`, helper
 *    `validationOutcomeWorstOf`). Checks are never empty — validation is
 *    never silent.
 *  - `inputDigest` pins the sha-256 of the validated solution-version
 *    content: the snapshot certifies EXACTLY those bytes.
 *  - `snapshotId` is the DETERMINISTIC identity (identity.ts
 *    `deriveValidationSnapshotId`) over {solutionId, versionNumber,
 *    inputDigest, engine kind/version, outcome} — `validatedAt` and the
 *    check details are excluded (a snapshot's identity is what it
 *    certifies, not when).
 */

import { z } from "zod";
import {
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  positiveIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";

/** The explicit validation finding vocabulary (ACR-005). */
export const VALIDATION_CHECK_RESULTS = [
  "pass",
  "fail",
  "unknown",
  "review-needed",
] as const;
export type ValidationCheckResult = (typeof VALIDATION_CHECK_RESULTS)[number];

/** Snapshot outcomes — the same vocabulary, used as the worst-of verdict. */
export const VALIDATION_SNAPSHOT_OUTCOMES = [
  "pass",
  "fail",
  "unknown",
  "review-needed",
] as const;
export type ValidationSnapshotOutcome = (typeof VALIDATION_SNAPSHOT_OUTCOMES)[number];

/** Worst-of severity: fail > review-needed > unknown > pass. */
const OUTCOME_SEVERITY: Readonly<Record<ValidationSnapshotOutcome, number>> = {
  fail: 3,
  "review-needed": 2,
  unknown: 1,
  pass: 0,
};

/**
 * The deterministic worst-of rule over check results. PURE: the same check
 * list always yields the same outcome (used by the snapshot invariant and
 * available to the validation engine of PROD-022).
 */
export function validationOutcomeWorstOf(
  results: readonly ValidationCheckResult[],
): ValidationSnapshotOutcome {
  let worst: ValidationSnapshotOutcome = "pass";
  for (const result of results) {
    if (OUTCOME_SEVERITY[result] > OUTCOME_SEVERITY[worst]) {
      worst = result;
    }
  }
  return worst;
}

/** One explicit validation finding. */
export const ValidationCheckSchema = z
  .object({
    checkId: shortTextSchema.describe(
      "Stable check identifier (e.g. geometry.dimensions-positive, " +
        "units.quantity-units-typed, operation.ordering-dependencies).",
    ),
    result: z.enum(VALIDATION_CHECK_RESULTS),
    detail: textSchema.describe(
      "Deterministic finding detail — what passed, failed, is unknown or " +
        "needs review. Never silent, never fabricated.",
    ),
  })
  .passthrough();
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

/** The deterministic engine identity that produced the snapshot. */
export const ValidationEngineRefSchema = z
  .object({
    kind: shortTextSchema.describe(
      "The deterministic validation engine kind (e.g. " +
        "aise-solution-engine) — provider identity belongs in provenance.",
    ),
    version: shortTextSchema.describe("The engine's version."),
  })
  .passthrough();
export type ValidationEngineRef = z.infer<typeof ValidationEngineRefSchema>;

export const SolutionValidationSnapshotSchema = z
  .object({
    contractVersion: contractVersionSchema,
    snapshotId: stableIdSchema.describe(
      "Deterministic snapshot identity (deriveValidationSnapshotId).",
    ),
    solutionId: stableIdSchema.describe("The validated solution."),
    versionNumber: positiveIntSchema.describe(
      "The validated solution version (the snapshot is version-pinned).",
    ),
    outcome: z
      .enum(VALIDATION_SNAPSHOT_OUTCOMES)
      .describe(
        "Worst-of the checks: fail > review-needed > unknown > pass " +
          "(invariant validation_outcome_not_worst_of_checks).",
      ),
    checks: z
      .array(ValidationCheckSchema)
      .min(1)
      .describe(
        "The explicit findings — at least one; validation is never silent.",
      ),
    inputDigest: contentIdSchema.describe(
      "sha-256 digest of the validated solution-version content — the " +
        "snapshot certifies EXACTLY these bytes.",
    ),
    engine: ValidationEngineRefSchema.describe(
      "The deterministic validation engine that produced the snapshot.",
    ),
    validatedAt: isoTimestampSchema.describe(
      "Validation instant; EXCLUDED from the snapshot identity derivation.",
    ),
  })
  .passthrough();
export type SolutionValidationSnapshot = z.infer<
  typeof SolutionValidationSnapshotSchema
>;

export const SolutionValidationSnapshotCodec =
  createSolutionWireCodec<SolutionValidationSnapshot>({
    name: "SolutionValidationSnapshot",
    family: "validation",
    schema: SolutionValidationSnapshotSchema,
  });
export const decodeSolutionValidationSnapshot = SolutionValidationSnapshotCodec.decode;
export const decodeSolutionValidationSnapshotStrict =
  SolutionValidationSnapshotCodec.decodeStrict;
export const encodeSolutionValidationSnapshot = SolutionValidationSnapshotCodec.encode;
