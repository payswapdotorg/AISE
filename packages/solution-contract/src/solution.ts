/**
 * Solution and SolutionVersion (PROD-021) — family `solution`.
 *
 * The versioned proposal containers of the Solution Graph:
 *
 *  - `Solution` — the proposal identity: the engineering problem it
 *    addresses, its vertical (domain descriptor), the PINNED authoritative
 *    reality version it branches from (read-only — proposals never mutate
 *    observed reality), the PROPOSED epistemic seal, the governed lifecycle
 *    status (draft/validated/superseded/abandoned — lifecycle.ts) and the
 *    proposal-branch lineage.
 *  - `SolutionVersion` — one immutable versioned snapshot of the solution
 *    graph: the ORDERED operation sequence and the resulting proposed
 *    states (states[N] = layer N; states[0] is the baseline overlay;
 *    states.length === operations.length + 1 — invariant
 *    `solution_version_state_count_mismatch`), plus the declared validation
 *    snapshot when the version is validated (invariant
 *    `validated_version_without_snapshot`).
 *
 * REVISION IS VERSIONING, NEVER REWRITING: editing a validated version
 * creates a NEW version (with `parentVersionNumber` lineage) or a proposal
 * BRANCH (a new `Solution` with `branch` pointing at its origin) — the
 * operations/states of prior versions are never rewritten, and observed
 * reality is never touched (AISE-026's append-only discipline carried into
 * the solution workflow; "Revisions create new solution versions or
 * proposal branches rather than rewriting reality" — the solution workflow
 * doc's state model).
 */

import { z } from "zod";
import {
  contractVersionSchema,
  isoTimestampSchema,
  positiveIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import { SolutionDomainDescriptorSchema } from "./domain";
import { SOLUTION_LIFECYCLE_STATUSES } from "./lifecycle";
import { EngineeringOperationSchema } from "./operation";
import { ProposedStateSchema } from "./state";

/* ------------------------------------------------------------------ */
/* Branch lineage                                                       */
/* ------------------------------------------------------------------ */

/**
 * Proposal-branch lineage: this solution was branched from another
 * solution's version (an alternative approach). The branch re-pins (or
 * re-declares) its own baseline reality version — it still never mutates
 * the origin's reality.
 */
export const SolutionBranchSchema = z
  .object({
    branchedFromSolutionId: stableIdSchema,
    branchedFromVersionNumber: positiveIntSchema,
    branchedAt: isoTimestampSchema,
  })
  .passthrough();
export type SolutionBranch = z.infer<typeof SolutionBranchSchema>;

/* ------------------------------------------------------------------ */
/* Solution                                                             */
/* ------------------------------------------------------------------ */

export const SolutionSchema = z
  .object({
    contractVersion: contractVersionSchema,
    solutionId: stableIdSchema.describe("Stable id of this solution."),
    projectId: stableIdSchema.describe("The project this solution lives in."),
    title: shortTextSchema.describe("Human-readable solution title."),
    problemStatement: textSchema.describe(
      "The engineering problem/intent this solution addresses (the " +
        "workflow's ENGINEERING PROBLEM / INTENT stage).",
    ),
    domain: SolutionDomainDescriptorSchema.describe(
      "The vertical context (building specifics as data — never client " +
        "authority).",
    ),
    baselineRealityVersionId: stableIdSchema.describe(
      "The PINNED authoritative Reality-Graph version this solution " +
        "branches from. A read-only reference: the Solution Graph is " +
        "canonical only for the proposal's operation/state history, never " +
        "observed reality.",
    ),
    epistemicClass: z
      .literal("PROPOSED")
      .describe(
        "ALWAYS 'PROPOSED' — the schema-level seal: a solution is a " +
          "proposal; it becomes observed reality only through execution, " +
          "post-work evidence and the existing assurance/verification " +
          "process, never by implication.",
      ),
    status: z
      .enum(SOLUTION_LIFECYCLE_STATUSES)
      .describe(
        "The governed lifecycle status (lifecycle.ts transition table): " +
          "draft → validated | superseded | abandoned; validated → " +
          "superseded | abandoned; superseded/abandoned are terminal. " +
          "Carries NO approval semantics (approval is an Engineering Case " +
          "domain act).",
      ),
    currentVersionNumber: positiveIntSchema.describe(
      "The version the solution's `status` refers to.",
    ),
    branch: SolutionBranchSchema
      .optional()
      .describe("Proposal-branch lineage (absent for unbranched solutions)."),
    supersededBy: stableIdSchema
      .optional()
      .describe(
        "When status is superseded: the solution that supersedes this one " +
          "(invariant superseded_solution_without_successor).",
      ),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type Solution = z.infer<typeof SolutionSchema>;

export const SolutionCodec = createSolutionWireCodec<Solution>({
  name: "Solution",
  family: "solution",
  schema: SolutionSchema,
});
export const decodeSolution = SolutionCodec.decode;
export const decodeSolutionStrict = SolutionCodec.decodeStrict;
export const encodeSolution = SolutionCodec.encode;

/* ------------------------------------------------------------------ */
/* SolutionVersion                                                      */
/* ------------------------------------------------------------------ */

export const SolutionVersionSchema = z
  .object({
    contractVersion: contractVersionSchema,
    solutionId: stableIdSchema.describe("The solution this version belongs to."),
    versionNumber: positiveIntSchema.describe(
      "1-based version number (version context — pinned by every " +
        "operation, state, snapshot and BOQ trace of this version).",
    ),
    parentVersionNumber: positiveIntSchema
      .optional()
      .describe(
        "Version lineage: the prior version this one revises. Absent for " +
          "version 1 (invariant version_one_with_parent forbids a parent " +
          "on version 1).",
      ),
    status: z
      .enum(SOLUTION_LIFECYCLE_STATUSES)
      .describe(
        "The version's lifecycle status (the governed table of " +
          "lifecycle.ts).",
      ),
    operations: z
      .array(EngineeringOperationSchema)
      .describe(
        "The ORDERED operation sequence of this version (order is " +
          "semantic — it is hashed into every operation and state " +
          "identity).",
      ),
    states: z
      .array(ProposedStateSchema)
      .min(1)
      .describe(
        "states[N] = layer N: states[0] is the baseline overlay; " +
          "states.length must equal operations.length + 1 (invariant " +
          "solution_version_state_count_mismatch) and every " +
          "states[N].stateIndex must equal N.",
      ),
    validationSnapshotRef: stableIdSchema
      .optional()
      .describe(
        "The declared validation snapshot (invariant " +
          "validated_version_without_snapshot: REQUIRED when status is " +
          "validated — a solution BOQ may be generated only from a " +
          "declared snapshot).",
      ),
    createdAt: isoTimestampSchema,
  })
  .passthrough();
export type SolutionVersion = z.infer<typeof SolutionVersionSchema>;

export const SolutionVersionCodec = createSolutionWireCodec<SolutionVersion>({
  name: "SolutionVersion",
  family: "solution",
  schema: SolutionVersionSchema,
});
export const decodeSolutionVersion = SolutionVersionCodec.decode;
export const decodeSolutionVersionStrict = SolutionVersionCodec.decodeStrict;
export const encodeSolutionVersion = SolutionVersionCodec.encode;
