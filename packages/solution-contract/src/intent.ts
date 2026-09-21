/**
 * Engineering operation intent (PROD-021) — family `operation`.
 *
 * THE TYPED INTENT OBJECT with explicit units, spatial target, parameters
 * and provenance. `createOperationIntent` is the ONE constructor surface for
 * BOTH authoring modes of ACR-005/006:
 *
 *  - DIRECT MANIPULATION: `provenance.origin: "direct-manipulation"` with an
 *    optional `interactionDetail` (what the operator did in the interactive
 *    environment);
 *  - AGENT COMMAND: `provenance.origin: "agent"` with the EXACT normalized
 *    `commandText` ("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.").
 *
 * The SEMANTIC fields (operationType, domain, parameters, target, dependsOn)
 * are IDENTICAL regardless of origin; only the provenance differs. Because
 * identity derivations EXCLUDE provenance (identity.ts), the same semantics
 * authored by direct manipulation or an agent IS THE SAME OPERATION — the
 * acceptance criterion "same operation intent can be produced by direct
 * manipulation or an agent" is structural, and proven by the committed
 * fixture pair
 * `fixtures/operation/EngineeringOperationIntent.valid-excavation-direct.json`
 * vs `...valid-excavation-agent.json` (asserted by identity.test.ts and
 * fixtures.test.ts).
 *
 * AUTHORING AN INTENT IS NOT AUTHORITY: an intent expresses what the author
 * wants done. The server solution engine (PROD-022) validates, negotiates
 * capability (negotiation.ts), compiles and executes it; the agent (PROD-023)
 * may only translate, clarify and propose. The intent deliberately CANNOT
 * express validation outcomes, readiness, approval or any epistemic claim
 * over observed reality (asserted by authority.test.ts).
 */

import { z } from "zod";
import {
  contractVersionSchema,
  positiveIntSchema,
  shortTextSchema,
  stableIdSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import { SOLUTION_CONTRACT_VERSION } from "./solution-contracts.version";
import { SolutionDomainDescriptorSchema } from "./domain";
import {
  OperationDependencySchema,
  OperationProvenanceSchema,
  OperationTargetSchema,
  TypedOperationParameterSchema,
} from "./operation";
import type {
  OperationDependency,
  OperationProvenance,
  OperationTarget,
  TypedOperationParameter,
} from "./operation";
import type { SolutionDomainDescriptor } from "./domain";
import { SolutionContractEncodeError } from "./errors";
import type { SolutionContractIssue } from "./errors";
import { checkEngineeringOperationIntent } from "./invariants";

/* ------------------------------------------------------------------ */
/* EngineeringOperationIntent                                           */
/* ------------------------------------------------------------------ */

/**
 * Where the intent proposes to land: the solution and version it targets.
 * Absent while an intent floats unattached (an agent may propose before a
 * solution exists).
 */
export const IntentProposalContextSchema = z
  .object({
    solutionId: stableIdSchema,
    versionNumber: positiveIntSchema,
  })
  .passthrough();
export type IntentProposalContext = z.infer<typeof IntentProposalContextSchema>;

export const EngineeringOperationIntentSchema = z
  .object({
    contractVersion: contractVersionSchema,
    intentId: stableIdSchema.describe(
      "Stable id of this authoring intent EVENT (client-session or server " +
        "assigned). Distinguishes authoring events, NOT operations: two " +
        "intents with the same semantics and different origins/provenance " +
        "compile to the SAME operation identity (see identity.ts).",
    ),
    operationType: shortTextSchema.describe(
      "The operation type (OPEN vocabulary; Phase 1 building advisory " +
        "values: BUILDING_OPERATION_TYPES of the domain module). The " +
        "closed catalogue is engine-owned — the wire type stays open so " +
        "future verticals never require a contract change.",
    ),
    domain: SolutionDomainDescriptorSchema.describe(
      "The vertical context — building specifics as data, never client " +
        "authority. A future vertical is representable here; capability " +
        "negotiation answers honestly whether the engine supports it.",
    ),
    parameters: z
      .array(TypedOperationParameterSchema)
      .min(1)
      .describe("Explicit typed parameters with units (at least one)."),
    target: OperationTargetSchema.describe(
      "The stable spatial target with explicit units, anchored to observed " +
        "reality through read-only references.",
    ),
    dependsOn: z
      .array(OperationDependencySchema)
      .describe("Precedence/dependency edges the authoring mode asserts."),
    provenance: OperationProvenanceSchema.describe(
      "The authoring attribution: origin (direct-manipulation | agent | " +
        "imported-template), author, instant, evidence and — for agent " +
        "origin — the exact normalized command text.",
    ),
    proposedTo: IntentProposalContextSchema.optional().describe(
      "The solution/version this intent proposes into (absent while " +
        "unattached).",
    ),
  })
  .passthrough();
export type EngineeringOperationIntent = z.infer<typeof EngineeringOperationIntentSchema>;

export const EngineeringOperationIntentCodec =
  createSolutionWireCodec<EngineeringOperationIntent>({
    name: "EngineeringOperationIntent",
    family: "operation",
    schema: EngineeringOperationIntentSchema,
  });
export const decodeEngineeringOperationIntent = EngineeringOperationIntentCodec.decode;
export const decodeEngineeringOperationIntentStrict =
  EngineeringOperationIntentCodec.decodeStrict;
export const encodeEngineeringOperationIntent = EngineeringOperationIntentCodec.encode;

/* ------------------------------------------------------------------ */
/* The single constructor surface (both provenance origins)             */
/* ------------------------------------------------------------------ */

/** The authoring input of `createOperationIntent` — semantics + provenance. */
export interface CreateOperationIntentInput {
  readonly intentId: string;
  readonly operationType: string;
  readonly domain: SolutionDomainDescriptor;
  readonly parameters: readonly TypedOperationParameter[];
  readonly target: OperationTarget;
  readonly dependsOn?: readonly OperationDependency[];
  readonly provenance: OperationProvenance;
  readonly proposedTo?: IntentProposalContext;
}

function toIssues(error: z.ZodError): SolutionContractIssue[] {
  return error.issues.map((issue) => ({
    path: [...issue.path],
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * THE single constructor surface for operation intents (PROD-021 §4.2:
 * "one constructor surface, two provenance origins"). Pure and
 * deterministic:
 *
 *  - stamps the current contract version on the intent and its embedded
 *    wire objects (domain, target, dependencies) — the constructor is the
 *    authoring surface, wire values with foreign versions must be DECODED,
 *    not reconstructed;
 *  - validates the full wire schema (typed `SolutionContractEncodeError`
 *    on any violation) AND the cross-field invariants of
 *    `checkEngineeringOperationIntent` (units, anchoring, provenance) — the
 *    constructor can only emit contract-valid intents;
 *  - accepts either provenance origin verbatim: the same semantic input
 *    with `origin: "direct-manipulation"` or `origin: "agent"` yields
 *    intents whose semantic fields are deep-equal and whose derived
 *    operation identity is IDENTICAL.
 */
export function createOperationIntent(
  input: CreateOperationIntentInput,
): EngineeringOperationIntent {
  const context = { family: "operation" as const, objectName: "EngineeringOperationIntent" };
  const candidate = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    intentId: input.intentId,
    operationType: input.operationType,
    domain: { ...input.domain, contractVersion: SOLUTION_CONTRACT_VERSION },
    parameters: input.parameters,
    target: { ...input.target, contractVersion: SOLUTION_CONTRACT_VERSION },
    dependsOn: (input.dependsOn ?? []).map((dependency) => ({
      ...dependency,
      contractVersion: SOLUTION_CONTRACT_VERSION,
    })),
    provenance: input.provenance,
    proposedTo: input.proposedTo,
  };
  const parsed = EngineeringOperationIntentSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SolutionContractEncodeError(context, toIssues(parsed.error));
  }
  // The constructor is the authoring boundary: run the invariant checks
  // (numeric-without-unit, unanchored target, missing provenance) so only
  // contract-valid intents can be constructed.
  const findings = checkEngineeringOperationIntent(parsed.data);
  if (findings.length > 0) {
    throw new SolutionContractEncodeError(
      context,
      findings.map((finding) => ({
        path: [...finding.path],
        message: `${finding.code}: ${finding.detail}`,
        code: finding.code,
      })),
    );
  }
  return parsed.data;
}
