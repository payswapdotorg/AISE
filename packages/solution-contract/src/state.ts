/**
 * Proposed state (PROD-021) — family `state`.
 *
 * THE PROPOSAL-ISOLATION SEAL: every `ProposedState` carries the LITERAL
 * epistemic status `"PROPOSED"`. Representing `OBSERVED`, `INFERRED` or
 * `CONFIRMED` inside a proposed state is a SCHEMA violation — the same
 * structural discipline as the intervention model's `ProposedNode`
 * (AISE-026): a proposal is not an observation, the ENTIRE derived layer is
 * proposed, and no code path in this package can upgrade the seal
 * (asserted by authority.test.ts).
 *
 * Layer model (docs/interactive-engineering-solution-workflow.md):
 *
 * ```text
 * AUTHORITATIVE OBSERVED / CONFIRMED REALITY (pinned baselineVersionId)
 *                 ↓
 * ProposedState 0 (baseline overlay)
 *                 ↓ operation 1
 * ProposedState 1
 *                 ↓ operation 2
 * ...             ↓ operation N
 * ProposedState N (final)
 * ```
 *
 *  - `baselineRealityVersionId` PINS the authoritative Reality-Graph version
 *    the state branches from — a READ-ONLY reference; proposals never mutate
 *    observed reality.
 *  - `stateIndex` is the layer number; `appliedOperationIds` lists
 *    operations 1..stateIndex IN ORDER (length === stateIndex — invariant
 *    `proposed_state_index_mismatch`).
 *  - `stateId` is the DETERMINISTIC identity (identity.ts
 *    `deriveProposedStateId`): sha-256 over the canonical JSON of
 *    {solutionId, versionNumber, stateIndex, baselineRealityVersionId,
 *    appliedOperationIds, contentDigest} — the operation SEQUENCE is hashed
 *    in order (reordering yields different ids), and `materializedAt` is
 *    DELIBERATELY EXCLUDED (identity is content, not the moment of
 *    materialization). The same state id feeds the synchronized 3D/2D/BOQ
 *    views of the proposal step (the AISE-027 stable-id discipline).
 *  - `contentDigest` optionally pins the sha-256 of the engine-materialized
 *    state content (PROD-022 owns materialization; the contract pins the
 *    digest form).
 */

import { z } from "zod";
import {
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  stableIdSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";

export const ProposedStateSchema = z
  .object({
    contractVersion: contractVersionSchema,
    stateId: stableIdSchema.describe(
      "Deterministic proposed-state identity (deriveProposedStateId). The " +
        "SAME identifier feeds the synchronized 3D, 2D and BOQ views of " +
        "this proposal step.",
    ),
    solutionId: stableIdSchema.describe("The solution this state belongs to."),
    versionNumber: positiveIntSchema.describe(
      "The solution version this state belongs to.",
    ),
    stateIndex: nonNegativeIntSchema.describe(
      "Layer number: 0 = the baseline overlay; N = after operation N.",
    ),
    baselineRealityVersionId: stableIdSchema.describe(
      "The PINNED authoritative Reality-Graph version this proposed state " +
        "branches from — a read-only reference; proposals never mutate " +
        "observed reality.",
    ),
    epistemicStatus: z
      .literal("PROPOSED")
      .describe(
        "ALWAYS 'PROPOSED' — the schema-level proposal-isolation seal: " +
          "OBSERVED/INFERRED/CONFIRMED are unrepresentable inside a " +
          "proposed state.",
      ),
    appliedOperationIds: z
      .array(stableIdSchema)
      .describe(
        "Ordered ids of the operations 1..stateIndex (length must equal " +
          "stateIndex — invariant proposed_state_index_mismatch).",
      ),
    contentDigest: contentIdSchema
      .optional()
      .describe(
        "sha-256 digest of the engine-materialized state content " +
          "(PROD-022); the contract pins the digest form, not the " +
          "materialization.",
      ),
    materializedAt: isoTimestampSchema.describe(
      "Engine clock instant of materialization; EXCLUDED from the state " +
        "identity derivation (identity is content).",
    ),
  })
  .passthrough();
export type ProposedState = z.infer<typeof ProposedStateSchema>;

export const ProposedStateCodec = createSolutionWireCodec<ProposedState>({
  name: "ProposedState",
  family: "state",
  schema: ProposedStateSchema,
});
export const decodeProposedState = ProposedStateCodec.decode;
export const decodeProposedStateStrict = ProposedStateCodec.decodeStrict;
export const encodeProposedState = ProposedStateCodec.encode;
