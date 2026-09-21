/**
 * Solution-to-BOQ trace contracts (PROD-021) — family `trace`.
 *
 * THE BIDIRECTIONAL SOLUTION-STEP ↔ GENERATED-BOQ-LINE identity objects
 * (work-order scope; ACR-005 "BOQ derivation and bidirectional navigation";
 * architecture-lock "Generated BOQ lines retain bidirectional links to
 * contributing solution operation(s), geometry/state references and
 * calculation provenance"):
 *
 *  - `SolutionBoqLineTrace` — one generated BOQ line's full trace: the
 *    version-pinned contributing operations (`created | modified | removed`
 *    contributions — a generated line traces to AT LEAST one operation, a
 *    schema-level minimum), the typed quantity with explicit unit and
 *    calculation reference, and the geometry references the quantity
 *    derives from.
 *  - `SolutionBoqTraceSet` — the version-pinned set of a solution version's
 *    line traces, generated from ONE declared validation snapshot. Every
 *    line trace must pin the SAME solutionId/versionNumber/snapshot
 *    (invariant `trace_set_version_pin_mismatch` / snapshot pin).
 *
 * BIDIRECTIONAL RESOLUTION: `resolveOperationsForLine` (BOQ line → its
 * contributing operations) and `resolveLinesForOperation` (operation → the
 * BOQ lines it creates or changes) resolve in BOTH directions over a trace
 * set, and the round trip closes: for every line, resolving its
 * contributions and resolving those operations back must include the
 * original line (asserted by trace.test.ts over the committed fixture).
 * Unknown ids answer explicitly (`undefined` / empty array) — never a
 * silent guess.
 *
 * A generated solution BOQ is a DERIVED PROJECTION: it never overwrites a
 * source BOQ (the source remains a separate source/revision — ACR-005) and
 * it exists only tied to a declared validation snapshot of a validated
 * solution version. `traceId` is the deterministic trace identity
 * (identity.ts `deriveSolutionBoqLineTraceId`) — pinned to the solution
 * VERSION that produced the line: the same boqLineId under a different
 * version derives a different trace id.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  positiveIntSchema,
  stableIdSchema,
  shortTextSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import {
  TargetGeometryRefSchema,
  TypedQuantitySchema,
} from "./operation";
import type { TargetGeometryRef, TypedQuantity } from "./operation";

/* ------------------------------------------------------------------ */
/* Contribution kinds                                                   */
/* ------------------------------------------------------------------ */

/**
 * How one operation contributes to a generated BOQ line: it CREATED the
 * line, MODIFIED its quantity, or REMOVED quantity from it. The README's
 * navigation promise — "selecting a step should reveal the BOQ lines it
 * creates or changes" — resolves through these.
 */
export const BOQ_LINE_CONTRIBUTION_KINDS = ["created", "modified", "removed"] as const;
export type BoqLineContributionKind = (typeof BOQ_LINE_CONTRIBUTION_KINDS)[number];

/** One contributing solution step of a generated BOQ line. */
export const OperationContributionSchema = z
  .object({
    operationId: stableIdSchema.describe(
      "The contributing operation's deterministic identity.",
    ),
    operationIndex: positiveIntSchema.describe(
      "The contributing operation's 1-based position in the solution " +
        "version's sequence.",
    ),
    contributionKind: z.enum(BOQ_LINE_CONTRIBUTION_KINDS),
  })
  .passthrough();
export type OperationContribution = z.infer<typeof OperationContributionSchema>;

/* ------------------------------------------------------------------ */
/* SolutionBoqLineTrace                                                 */
/* ------------------------------------------------------------------ */

export const SolutionBoqLineTraceSchema = z
  .object({
    contractVersion: contractVersionSchema,
    boqLineId: stableIdSchema.describe(
      "Identity of the GENERATED solution-BOQ line (a derived projection " +
        "— the source BOQ, if any, remains a separate source/revision " +
        "that is never silently overwritten).",
    ),
    traceId: stableIdSchema.describe(
      "Deterministic trace identity (deriveSolutionBoqLineTraceId): " +
        "sha-256 over {solutionId, versionNumber, boqLineId} — pinned to " +
        "the solution VERSION that produced the line.",
    ),
    solutionId: stableIdSchema.describe(
      "The solution whose version produced this line (version pin).",
    ),
    versionNumber: positiveIntSchema.describe(
      "The solution VERSION that produced this line (version pin — the " +
        "trace never floats across versions).",
    ),
    validationSnapshotRef: stableIdSchema.describe(
      "The DECLARED validation snapshot the BOQ generation used (never " +
        "absent — a solution BOQ exists only tied to a snapshot).",
    ),
    itemDescription: shortTextSchema.describe(
      "The generated line's item description (derived wording; source BOQ " +
        "wording rules apply to source BOQs, which stay separate).",
    ),
    contributingOperations: z
      .array(OperationContributionSchema)
      .min(1)
      .describe(
        "The solution steps that produced/changed/removed this line — " +
          "NEVER empty: every generated BOQ line traces to at least one " +
          "operation (schema-level minimum).",
      ),
    quantity: TypedQuantitySchema.describe(
      "The line's typed quantity with explicit unit and calculation " +
        "provenance (calculationRef) — the deterministic quantity " +
        "derivation of PROD-025.",
    ),
    geometryRefs: z
      .array(TargetGeometryRefSchema)
      .describe(
        "Geometry references the line's quantity derives from " +
          "(geometry provenance).",
      ),
  })
  .passthrough();
export type SolutionBoqLineTrace = z.infer<typeof SolutionBoqLineTraceSchema>;

export const SolutionBoqLineTraceCodec =
  createSolutionWireCodec<SolutionBoqLineTrace>({
    name: "SolutionBoqLineTrace",
    family: "trace",
    schema: SolutionBoqLineTraceSchema,
  });
export const decodeSolutionBoqLineTrace = SolutionBoqLineTraceCodec.decode;
export const decodeSolutionBoqLineTraceStrict = SolutionBoqLineTraceCodec.decodeStrict;
export const encodeSolutionBoqLineTrace = SolutionBoqLineTraceCodec.encode;

/* ------------------------------------------------------------------ */
/* SolutionBoqTraceSet                                                  */
/* ------------------------------------------------------------------ */

export const SolutionBoqTraceSetSchema = z
  .object({
    contractVersion: contractVersionSchema,
    solutionId: stableIdSchema.describe(
      "The solution whose version this trace set pins.",
    ),
    versionNumber: positiveIntSchema.describe(
      "The solution VERSION this trace set pins (version pin).",
    ),
    validationSnapshotRef: stableIdSchema.describe(
      "The ONE declared validation snapshot the set was generated from " +
        "(echoed by every line trace — invariant trace_set_snapshot_pin).",
    ),
    lineTraces: z
      .array(SolutionBoqLineTraceSchema)
      .min(1)
      .describe(
        "The generated line traces of this solution version. Every entry " +
          "must pin the set's solutionId/versionNumber/snapshot " +
          "(invariant trace_set_version_pin_mismatch).",
      ),
  })
  .passthrough();
export type SolutionBoqTraceSet = z.infer<typeof SolutionBoqTraceSetSchema>;

export const SolutionBoqTraceSetCodec =
  createSolutionWireCodec<SolutionBoqTraceSet>({
    name: "SolutionBoqTraceSet",
    family: "trace",
    schema: SolutionBoqTraceSetSchema,
  });
export const decodeSolutionBoqTraceSet = SolutionBoqTraceSetCodec.decode;
export const decodeSolutionBoqTraceSetStrict = SolutionBoqTraceSetCodec.decodeStrict;
export const encodeSolutionBoqTraceSet = SolutionBoqTraceSetCodec.encode;

/* ------------------------------------------------------------------ */
/* Bidirectional resolution (pure)                                      */
/* ------------------------------------------------------------------ */

/**
 * BOQ LINE → its contributing solution steps: resolves a generated BOQ
 * line's contributions inside a trace set. `undefined` for an unknown line
 * id — explicit, never a silent empty contribution list.
 */
export function resolveOperationsForLine(
  traceSet: SolutionBoqTraceSet,
  boqLineId: string,
): readonly OperationContribution[] | undefined {
  const line = traceSet.lineTraces.find((trace) => trace.boqLineId === boqLineId);
  if (line === undefined) {
    return undefined;
  }
  return line.contributingOperations;
}

/**
 * OPERATION → the generated BOQ lines it creates or changes: resolves every
 * line trace whose contributions include the operation id. Empty array for
 * an operation that contributes to no line (an explicit, honest answer —
 * e.g. a purely ordering/dependency step), in the trace set's line order.
 */
export function resolveLinesForOperation(
  traceSet: SolutionBoqTraceSet,
  operationId: string,
): readonly SolutionBoqLineTrace[] {
  return traceSet.lineTraces.filter((trace) =>
    trace.contributingOperations.some(
      (contribution) => contribution.operationId === operationId,
    ),
  );
}

/**
 * The contribution of one operation inside one line trace (helper for the
 * step→line navigation detail). `undefined` when the operation does not
 * contribute to the line.
 */
export function findContribution(
  trace: SolutionBoqLineTrace,
  operationId: string,
): OperationContribution | undefined {
  return trace.contributingOperations.find(
    (contribution) => contribution.operationId === operationId,
  );
}

/** Re-exports for consumers building traces from operation-module parts. */
export type { TargetGeometryRef, TypedQuantity };
