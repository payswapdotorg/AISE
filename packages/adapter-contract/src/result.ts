/**
 * OperationResult contract (PROD-016) — family `result`.
 *
 * The server-authoritative result of a user action — the terminal step of
 * the task-first interaction model (spec/client-adapter-contract.md:
 * "User action → Server-authoritative result"). AUTHORITATIVE and read-only
 * for adapters: the client submits an action; the SERVER decides the
 * outcome. The adapter renders the status, the typed failure (client
 * conformance suite item 11: unavailable-provider/failure state) and the
 * result references verbatim, and never resubmits silently.
 *
 * Policy (prose, mirroring the shared-contracts cross-field discipline):
 * `failure` is REQUIRED when `status` is `failed` or `rejected` and SHOULD
 * be absent otherwise; `resultRefs` name the authoritative artifacts the
 * operation created or affected (opaque ids the adapter renders verbatim).
 */

import { z } from "zod";
import {
  contractVersionSchema,
  isoTimestampSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createAdapterWireCodec } from "./codec";

export const OPERATION_RESULT_STATUSES = [
  "succeeded",
  "failed",
  "rejected",
  "pending",
] as const;
export type OperationResultStatus = (typeof OPERATION_RESULT_STATUSES)[number];

/**
 * Advisory well-known failure codes (open vocabulary, stable strings
 * rendered verbatim). `provider-unavailable` covers the honest
 * unavailable-provider state; `authorization-denied` pairs with an
 * AuthorizationContext denial.
 */
export const OPERATION_FAILURE_CODES = [
  "provider-unavailable",
  "input-incompatible",
  "authorization-denied",
  "contract-version-unsupported",
  "offline-conflict",
  "server-error",
] as const;

const OperationFailureSchema = z
  .object({
    code: shortTextSchema.describe(
      "Stable failure code (open vocabulary; advisory well-known values: " +
        "provider-unavailable, input-incompatible, authorization-denied, " +
        "contract-version-unsupported, offline-conflict, server-error).",
    ),
    detail: textSchema.optional().describe(
      "Human-readable failure supplement; never replaces the stable code.",
    ),
  })
  .passthrough();
export type OperationFailure = z.infer<typeof OperationFailureSchema>;

export const OperationResultSchema = z
  .object({
    contractVersion: contractVersionSchema,
    operationId: stableIdSchema.describe("Stable id of the completed operation."),
    actionRef: stableIdSchema.describe(
      "The user action / NextBestAction this operation executed.",
    ),
    status: z.enum(OPERATION_RESULT_STATUSES).describe(
      "succeeded | failed (a typed failure is present) | rejected (the " +
        "server refused the action) | pending (accepted, not yet complete).",
    ),
    failure: OperationFailureSchema
      .optional()
      .describe(
        "The typed failure. REQUIRED when status is failed/rejected; SHOULD " +
          "be absent otherwise.",
      ),
    resultRefs: z
      .array(stableIdSchema)
      .describe(
        "Opaque references to the authoritative artifacts the operation " +
          "created or affected; rendered verbatim, never reinterpreted.",
      ),
    completedAt: isoTimestampSchema,
  })
  .passthrough();
export type OperationResult = z.infer<typeof OperationResultSchema>;

/* Codecs ------------------------------------------------------------------ */

export const OperationResultCodec = createAdapterWireCodec<OperationResult>({
  name: "OperationResult",
  family: "result",
  schema: OperationResultSchema,
});
export const decodeOperationResult = OperationResultCodec.decode;
export const decodeOperationResultStrict = OperationResultCodec.decodeStrict;
export const encodeOperationResult = OperationResultCodec.encode;
