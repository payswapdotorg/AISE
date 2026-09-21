/**
 * Operation capability negotiation (PROD-021) — family `capability`, result
 * object `OperationCapabilityNegotiation`.
 *
 * `negotiateOperationCapability(intent, profile)` is a PURE, deterministic
 * function from a typed operation intent and the engine's declared
 * `OperationCapabilityProfile` to an explicit negotiation:
 *
 *  - outcome `executable | blocked | unsupported | unknown`:
 *      - `executable` — the engine declares capability for the intent's
 *        vertical and operation type, and every required parameter is
 *        present;
 *      - `blocked` — the intent is UNDER-SPECIFIED: required parameter
 *        names are missing (`missingParameters` lists them in the profile's
 *        declaration order). The agent must ASK for them — never invent
 *        dimensions, materials or locations (ACR-005);
 *      - `unsupported` — the engine DEFINITIVELY does not support the
 *        vertical or operation type (a future vertical, an undeclared
 *        operation type, an unavailable entry);
 *      - `unknown` — the capability is UNDETERMINED (an `unknown` domain or
 *        operation entry). The frozen honesty discipline of the adapter
 *        contract: `unknown` is NEVER conflated with `unsupported`.
 *  - `reasons` is NEVER empty (an executable negotiation carries
 *    `capability-satisfied`, a degraded one additionally carries
 *    `capability-degraded` with the declared limitations surfaced);
 *  - `missingParameters` is non-empty exactly when the outcome is `blocked`
 *    (the clarification-question driver).
 *
 * UNSUPPORTED-OPERATION STATES ARE EXPLICIT, NEVER SILENT: there is no code
 * path that silently drops, best-efforts or reinterprets an intent the
 * engine cannot execute — every refusal names the vertical, operation type
 * or parameter and the profile that produced it.
 *
 * NO AUTHORITY INVARIANT: negotiation is capability math over the engine's
 * declared profile. It changes execution strategy and operator/agent
 * burden — it can never decide validation success, readiness, approval or
 * sufficiency, and the negotiation object deliberately carries no such
 * semantics (asserted by authority.test.ts). Negotiation is also
 * ORIGIN-BLIND: the intent's provenance origin (direct manipulation vs
 * agent) never influences the outcome — no input modality receives
 * different engineering capability (ACR-006).
 */

import { z } from "zod";
import { contractVersionSchema, shortTextSchema, stableIdSchema, textSchema } from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import { SOLUTION_CONTRACT_VERSION } from "./solution-contracts.version";
import type { OperationCapabilityProfile } from "./capability";
import type { EngineeringOperationIntent } from "./intent";

/* ------------------------------------------------------------------ */
/* Outcomes and reasons                                                 */
/* ------------------------------------------------------------------ */

/**
 * The negotiation outcomes. `unknown` completes the packet's
 * executable/unsupported/blocked vocabulary with the frozen honesty rule of
 * the adapter contract (an undetermined capability must not be reported as
 * a definitive refusal) — see the package README.
 */
export const OPERATION_NEGOTIATION_OUTCOMES = [
  "executable",
  "blocked",
  "unsupported",
  "unknown",
] as const;
export type OperationNegotiationOutcome = (typeof OPERATION_NEGOTIATION_OUTCOMES)[number];

/** The honest, deterministic reason codes. */
export const OPERATION_NEGOTIATION_REASON_CODES = [
  "capability-satisfied",
  "capability-degraded",
  "domain-not-declared",
  "domain-unavailable",
  "domain-unknown",
  "operation-type-not-declared",
  "operation-type-unavailable",
  "operation-type-unknown",
  "missing-required-parameter",
] as const;
export type OperationNegotiationReasonCode =
  (typeof OPERATION_NEGOTIATION_REASON_CODES)[number];

/** One honest reason. */
export const NegotiationReasonSchema = z
  .object({
    code: z.enum(OPERATION_NEGOTIATION_REASON_CODES),
    detail: textSchema.describe(
      "Honest deterministic reason text — names the vertical, operation " +
        "type or parameter and the declaring profile.",
    ),
  })
  .passthrough();
export type NegotiationReason = z.infer<typeof NegotiationReasonSchema>;

/* ------------------------------------------------------------------ */
/* OperationCapabilityNegotiation (the result object)                   */
/* ------------------------------------------------------------------ */

export const OperationCapabilityNegotiationSchema = z
  .object({
    contractVersion: contractVersionSchema,
    intentRef: stableIdSchema.describe(
      "The intent event this negotiation answered (echo of intentId).",
    ),
    profileRef: stableIdSchema.describe(
      "The engine capability profile this negotiation used (echo of profileId).",
    ),
    outcome: z
      .enum(OPERATION_NEGOTIATION_OUTCOMES)
      .describe(
        "executable (capability declared and parameters present) | " +
          "blocked (required parameters missing — ask, never invent) | " +
          "unsupported (definitively not supported) | unknown " +
          "(capability undetermined; never conflated with unsupported).",
      ),
    reasons: z
      .array(NegotiationReasonSchema)
      .min(1)
      .describe(
        "NEVER empty: executable carries capability-satisfied (plus " +
          "capability-degraded with the surfaced limitations when the " +
          "declared status is degraded); every refusal carries its honest " +
          "reason.",
      ),
    missingParameters: z
      .array(shortTextSchema)
      .describe(
        "blocked outcome: the required parameter names missing from the " +
          "intent, in the profile's declaration order (the agent's " +
          "clarification-question driver). Empty otherwise.",
      ),
  })
  .passthrough();
export type OperationCapabilityNegotiation = z.infer<
  typeof OperationCapabilityNegotiationSchema
>;

export const OperationCapabilityNegotiationCodec =
  createSolutionWireCodec<OperationCapabilityNegotiation>({
    name: "OperationCapabilityNegotiation",
    family: "capability",
    schema: OperationCapabilityNegotiationSchema,
  });
export const decodeOperationCapabilityNegotiation =
  OperationCapabilityNegotiationCodec.decode;
export const decodeOperationCapabilityNegotiationStrict =
  OperationCapabilityNegotiationCodec.decodeStrict;
export const encodeOperationCapabilityNegotiation =
  OperationCapabilityNegotiationCodec.encode;

/* ------------------------------------------------------------------ */
/* The negotiation function                                             */
/* ------------------------------------------------------------------ */

/**
 * Negotiates what the solution engine may honestly do with an operation
 * intent. PURE and DETERMINISTIC: the same intent + profile always produce
 * the byte-identical negotiation (asserted by tests against committed
 * fixtures). No I/O, no clock, no randomness, no authority semantics, and
 * the inputs are consumed read-only (never mutated — asserted by tests).
 */
export function negotiateOperationCapability(
  intent: EngineeringOperationIntent,
  profile: OperationCapabilityProfile,
): OperationCapabilityNegotiation {
  const intentRef = intent.intentId;
  const profileRef = profile.profileId;

  const finish = (
    outcome: OperationNegotiationOutcome,
    reasons: readonly NegotiationReason[],
    missingParameters: readonly string[] = [],
  ): OperationCapabilityNegotiation => ({
    contractVersion: SOLUTION_CONTRACT_VERSION,
    intentRef,
    profileRef,
    outcome,
    reasons: [...reasons],
    missingParameters: [...missingParameters],
  });

  /* 1. The intent's vertical must be declared by the profile. */
  const vertical = intent.domain.vertical;
  const domainEntry = profile.domains.find(
    (entry) => entry.domain.vertical === vertical,
  );
  if (domainEntry === undefined) {
    return finish("unsupported", [
      {
        code: "domain-not-declared",
        detail:
          `operation domain vertical '${vertical}' is not declared by ` +
          `engine profile '${profileRef}' (${profile.engineKind} ` +
          `${profile.engineVersion}); declared verticals: ` +
          `${renderList(profile.domains.map((entry) => entry.domain.vertical))}`,
      },
    ]);
  }

  /* 2. Domain-level status. */
  if (domainEntry.status === "unavailable") {
    return finish("unsupported", [
      {
        code: "domain-unavailable",
        detail:
          `operation domain vertical '${vertical}' is declared unavailable ` +
          `by engine profile '${profileRef}'`,
      },
    ]);
  }
  if (domainEntry.status === "unknown") {
    return finish("unknown", [
      {
        code: "domain-unknown",
        detail:
          `operation domain vertical '${vertical}' capability is ` +
          `undetermined (profile status unknown; probing required) — ` +
          `never reported as unsupported`,
      },
    ]);
  }

  /* 3. The operation type must be declared within the vertical. */
  const operationType = intent.operationType;
  const operationEntry = domainEntry.operations.find(
    (entry) => entry.operationType === operationType,
  );
  if (operationEntry === undefined) {
    return finish("unsupported", [
      {
        code: "operation-type-not-declared",
        detail:
          `operation type '${operationType}' is not declared by engine ` +
          `profile '${profileRef}' for vertical '${vertical}'; declared ` +
          `types: ${renderList(domainEntry.operations.map((entry) => entry.operationType))}`,
      },
    ]);
  }

  /* 4. Operation-type status. */
  if (operationEntry.status === "unavailable") {
    return finish("unsupported", [
      {
        code: "operation-type-unavailable",
        detail:
          `operation type '${operationType}' is declared unavailable for ` +
          `vertical '${vertical}' by engine profile '${profileRef}'` +
          renderLimitations(operationEntry.limitations),
      },
    ]);
  }
  if (operationEntry.status === "unknown") {
    return finish("unknown", [
      {
        code: "operation-type-unknown",
        detail:
          `operation type '${operationType}' capability for vertical ` +
          `'${vertical}' is undetermined (profile status unknown; probing ` +
          `required) — never reported as unsupported`,
      },
    ]);
  }

  /* 5. Required parameters must be present (else BLOCKED — ask, never invent). */
  const present = new Set(intent.parameters.map((parameter) => parameter.name));
  const missing = operationEntry.requiredParameters.filter(
    (name) => !present.has(name),
  );
  if (missing.length > 0) {
    return finish(
      "blocked",
      missing.map((name) => ({
        code: "missing-required-parameter" as const,
        detail:
          `intent is missing required parameter '${name}' (with an ` +
          `explicit unit) for operation type '${operationType}' in ` +
          `vertical '${vertical}'; the engine requires ` +
          `${renderList(operationEntry.requiredParameters)} — ask for the ` +
          `missing value, never invent it`,
      })),
      missing,
    );
  }

  /* 6. Executable (possibly degraded — limitations surfaced, never hidden). */
  const reasons: NegotiationReason[] = [
    {
      code: "capability-satisfied",
      detail:
        `engine profile '${profileRef}' declares ` +
        `'${operationEntry.status}' capability for operation type ` +
        `'${operationType}' in vertical '${vertical}' and all required ` +
        `parameters (${renderList(operationEntry.requiredParameters)}) are ` +
        `present with explicit units`,
    },
  ];
  if (operationEntry.status === "degraded") {
    reasons.push({
      code: "capability-degraded",
      detail:
        `operation type '${operationType}' executes with declared ` +
        `limitations${renderLimitations(operationEntry.limitations)}`,
    });
  }
  return finish("executable", reasons);
}

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

function renderList(values: readonly string[]): string {
  return `[${values.join(", ")}]`;
}

function renderLimitations(limitations: readonly string[]): string {
  if (limitations.length === 0) {
    return "";
  }
  return `; declared limitations: ${limitations.join("; ")}`;
}
