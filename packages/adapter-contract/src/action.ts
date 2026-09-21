/**
 * NextBestAction contract (PROD-016) — family `action`.
 *
 * The server-computed "next best action" of the task-first interaction
 * model (spec/client-adapter-contract.md): what the user should do next,
 * or the explicit reason the task is blocked. AUTHORITATIVE and read-only
 * for adapters — PROD-017's acceptance ("every primary screen exposes the
 * next useful action or an explicit blocked reason") renders THIS object.
 *
 * A blocked NextBestAction still carries a prompt (the explanation) and at
 * least one typed blocker; an actionable one carries an empty blocker list.
 * Blockers are honest statements of why no useful action is currently
 * possible — never a client-side verdict about readiness or sufficiency.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createAdapterWireCodec } from "./codec";

export const ACTION_STATUSES = ["actionable", "blocked"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/**
 * Advisory well-known action kinds (open vocabulary, lower-kebab-case) seeded
 * from the client conformance suite of spec/client-adapter-contract.md
 * (project open/create, task selection, evidence inspection/submission,
 * BOQ inspection, case inspection, intervention inspection, outcome
 * comparison, authorization denial, escalation…).
 */
export const NEXT_BEST_ACTION_KINDS = [
  "open-project",
  "select-task",
  "inspect-evidence",
  "capture-evidence",
  "submit-evidence",
  "inspect-boq-item",
  "inspect-case",
  "inspect-intervention",
  "compare-outcome",
  "measure-reference",
  "answer-question",
  "escalate",
  "await-authorization",
  "retry-sync",
] as const;

/** One typed blocker: a stable reason code + human detail. */
const ActionBlockerSchema = z
  .object({
    reasonCode: shortTextSchema.describe(
      "Stable machine-readable blocker code (open vocabulary; e.g. " +
        "`authorization-denied`, `evidence-gap`, `capability-blocked`, " +
        "`provider-unavailable`, `offline-queued`).",
    ),
    detail: textSchema.describe("Human-readable blocker explanation."),
  })
  .passthrough();
export type ActionBlocker = z.infer<typeof ActionBlockerSchema>;

export const NextBestActionSchema = z
  .object({
    contractVersion: contractVersionSchema,
    actionId: stableIdSchema,
    taskRef: stableIdSchema.describe("The task this action serves."),
    kind: shortTextSchema.describe(
      "Action kind (open vocabulary; advisory well-known values: open-project, " +
        "select-task, inspect-evidence, capture-evidence, submit-evidence, " +
        "inspect-boq-item, inspect-case, inspect-intervention, compare-outcome, " +
        "measure-reference, answer-question, escalate, await-authorization, " +
        "retry-sync).",
    ),
    status: z.enum(ACTION_STATUSES).describe(
      "actionable (the prompt is a usable next action) | blocked (the " +
        "blockers explain why no useful action is currently possible).",
    ),
    prompt: textSchema.describe(
      "The next-action prompt — for blocked actions, the explanation the " +
        "user must see.",
    ),
    blockers: z
      .array(ActionBlockerSchema)
      .describe("Typed blockers; empty iff status is actionable."),
  })
  .passthrough();
export type NextBestAction = z.infer<typeof NextBestActionSchema>;

/* Codecs ------------------------------------------------------------------ */

export const NextBestActionCodec = createAdapterWireCodec<NextBestAction>({
  name: "NextBestAction",
  family: "action",
  schema: NextBestActionSchema,
});
export const decodeNextBestAction = NextBestActionCodec.decode;
export const decodeNextBestActionStrict = NextBestActionCodec.decodeStrict;
export const encodeNextBestAction = NextBestActionCodec.encode;
