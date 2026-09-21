/**
 * PROD-017 — the task-first adapter's CONTRACT DECODE SEAM (W-R1/W-R2).
 *
 * The single place `apps/web` decodes the shared semantic objects of
 * `@aise/adapter-contract` (PROD-016): the ten server-owned object
 * families the work order names — `ProjectContext`, `RealitySummary`,
 * `BOQContext`, `EvidenceSummary`, `EngineeringCaseSummary`,
 * `InterventionScenarioSummary`, `OutcomeSummary`, `NextBestAction`,
 * `AuthorizationContext`, `OperationResult` — plus the one client-authored
 * object, `TaskIntent` (W-R3). The hand-maintained structural-mirror
 * VALIDATORS for these semantics are REPLACED here by the contract's own
 * canonical decoders: a genuine contract payload passes as-is; anything
 * else is a typed {@link ContractDecodeFailure} naming the object, the
 * failure class and the structured issue paths — never coerced, never
 * silently accepted, never a second local mirror.
 *
 * DISCIPLINE (spec/client-adapter-contract.md + the PROD-016 compatibility
 * window):
 *
 *  - the decoders are the CONTRACT package's (this module imports them; it
 *    never re-implements validation and never modifies the contract);
 *  - default decode is OPEN (unknown fields preserved) — the documented
 *    same-major wire behavior; `decodeXStrict` variants are exposed for
 *    canonical checks (fixtures, round-trips);
 *  - a cross-major `contractVersion` fails fast as a typed
 *    version-mismatch failure (rendered as its own explicit state, never
 *    downgraded to a generic error);
 *  - decoded authoritative fields are READ-ONLY presentation inputs: this
 *    module exposes no mutation path (the contract package itself has
 *    none — `AUTHORITATIVE_FIELDS` are carried opaque);
 *  - `encodeTaskIntentWire` is SERIALIZATION of the ONE client-authored
 *    object (the user's task intent), never authority: the server
 *    validates, plans and answers it.
 *
 * Determinism: pure functions; no clock, no randomness, no IO (the fetch
 * transport stays in api.ts; this module only decodes what it is handed).
 */

import {
  AdapterContractError,
  decodeAuthorizationContext,
  decodeAuthorizationContextStrict,
  decodeBOQContext,
  decodeBOQContextStrict,
  decodeCapabilityDescriptor,
  decodeCapabilityDescriptorStrict,
  decodeCapabilityNegotiation,
  decodeCapabilityNegotiationStrict,
  decodeClientCapabilityProfile,
  decodeClientCapabilityProfileStrict,
  decodeEngineeringCaseSummary,
  decodeEngineeringCaseSummaryStrict,
  decodeEvidenceSummary,
  decodeEvidenceSummaryStrict,
  decodeInterventionScenarioSummary,
  decodeInterventionScenarioSummaryStrict,
  decodeNextBestAction,
  decodeNextBestActionStrict,
  decodeOperationResult,
  decodeOperationResultStrict,
  decodeOutcomeSummary,
  decodeOutcomeSummaryStrict,
  decodeProjectContext,
  decodeProjectContextStrict,
  decodeRealitySummary,
  decodeRealitySummaryStrict,
  decodeTaskCapabilityRequirements,
  decodeTaskCapabilityRequirementsStrict,
  decodeTaskIntent,
  decodeTaskIntentStrict,
  encodeTaskIntent,
  type AuthorizationContext,
  type BOQContext,
  type CapabilityDescriptor,
  type CapabilityNegotiation,
  type ClientCapabilityProfile,
  type EngineeringCaseSummary,
  type EvidenceSummary,
  type InterventionScenarioSummary,
  type NextBestAction,
  type OperationResult,
  type OutcomeSummary,
  type ProjectContext,
  type TaskCapabilityRequirements,
  type TaskIntent,
} from "@aise/adapter-contract";

import type {
  RealitySummary,
  EvidenceSummary as EvidenceSummaryContractAlias,
  OutcomeSummary as OutcomeSummaryContractAlias,
} from "@aise/adapter-contract";

/* Re-exports (the contract types flow through the seam; the app never
 * re-declares them — no second model). */
export type {
  AuthorizationContext,
  BOQContext,
  CapabilityDescriptor,
  CapabilityNegotiation,
  ClientCapabilityProfile,
  EngineeringCaseSummary,
  EvidenceSummary,
  InterventionScenarioSummary,
  NextBestAction,
  OperationResult,
  OutcomeSummary,
  ProjectContext,
  RealitySummary,
  TaskCapabilityRequirements,
  TaskIntent,
};

/* ------------------------------------------------------------------ */
/* The typed decode failure (never throws, never silent)                */
/* ------------------------------------------------------------------ */

/** Which contract operation failed (rendered verbatim in error states). */
export type ContractDecodeFailureKind =
  | "decode-error"
  | "version-mismatch"
  | "encode-error";

/** One typed contract decode/encode failure (deterministic detail). */
export interface ContractDecodeFailure {
  readonly objectName: string;
  readonly kind: ContractDecodeFailureKind;
  readonly detail: string;
}

/** The never-throwing decode result of one contract object. */
export type ContractDecode<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ContractDecodeFailure };

/** Human text for a contract failure (rendered verbatim in error states). */
export function describeContractFailure(failure: ContractDecodeFailure): string {
  switch (failure.kind) {
    case "version-mismatch":
      return `adapter contract version mismatch on ${failure.objectName}: ${failure.detail}`;
    case "encode-error":
      return `failed to encode ${failure.objectName}: ${failure.detail}`;
    case "decode-error":
      return `failed to decode ${failure.objectName}: ${failure.detail}`;
  }
}

/**
 * Run one contract decode with the app's never-throw discipline: the
 * contract's typed errors (version mismatch, decode issues) become typed
 * {@link ContractDecodeFailure} values carrying the deterministic contract
 * error message — the object is named, the reason is structured, nothing is
 * coerced.
 */
function runDecode<T>(
  objectName: string,
  decode: (payload: unknown) => T,
  payload: unknown,
): ContractDecode<T> {
  try {
    return { ok: true, value: decode(payload) };
  } catch (error) {
    if (error instanceof AdapterContractError) {
      const kind: ContractDecodeFailureKind =
        error.code === "ADAPTER_CONTRACT_VERSION_MISMATCH"
          ? "version-mismatch"
          : error.code === "ADAPTER_CONTRACT_ENCODE_ERROR"
            ? "encode-error"
            : "decode-error";
      return {
        ok: false,
        failure: { objectName, kind, detail: error.message },
      };
    }
    return {
      ok: false,
      failure: {
        objectName,
        kind: "decode-error",
        detail: error instanceof Error ? error.message : "unexpected decode failure",
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* The per-object seam decoders (W-R2)                                  */
/* ------------------------------------------------------------------ */

export function decodeProjectContextAtSeam(
  payload: unknown,
): ContractDecode<ProjectContext> {
  return runDecode("ProjectContext", decodeProjectContext, payload);
}
export function decodeProjectContextStrictAtSeam(
  payload: unknown,
): ContractDecode<ProjectContext> {
  return runDecode("ProjectContext", decodeProjectContextStrict, payload);
}

export function decodeRealitySummaryAtSeam(
  payload: unknown,
): ContractDecode<RealitySummary> {
  return runDecode("RealitySummary", decodeRealitySummary, payload);
}
export function decodeRealitySummaryStrictAtSeam(
  payload: unknown,
): ContractDecode<RealitySummary> {
  return runDecode("RealitySummary", decodeRealitySummaryStrict, payload);
}

export function decodeBOQContextAtSeam(payload: unknown): ContractDecode<BOQContext> {
  return runDecode("BOQContext", decodeBOQContext, payload);
}
export function decodeBOQContextStrictAtSeam(
  payload: unknown,
): ContractDecode<BOQContext> {
  return runDecode("BOQContext", decodeBOQContextStrict, payload);
}

export function decodeEvidenceSummaryAtSeam(
  payload: unknown,
): ContractDecode<EvidenceSummaryContractAlias> {
  return runDecode("EvidenceSummary", decodeEvidenceSummary, payload);
}
export function decodeEvidenceSummaryStrictAtSeam(
  payload: unknown,
): ContractDecode<EvidenceSummaryContractAlias> {
  return runDecode("EvidenceSummary", decodeEvidenceSummaryStrict, payload);
}

export function decodeEngineeringCaseSummaryAtSeam(
  payload: unknown,
): ContractDecode<EngineeringCaseSummary> {
  return runDecode("EngineeringCaseSummary", decodeEngineeringCaseSummary, payload);
}
export function decodeEngineeringCaseSummaryStrictAtSeam(
  payload: unknown,
): ContractDecode<EngineeringCaseSummary> {
  return runDecode("EngineeringCaseSummary", decodeEngineeringCaseSummaryStrict, payload);
}

export function decodeInterventionScenarioSummaryAtSeam(
  payload: unknown,
): ContractDecode<InterventionScenarioSummary> {
  return runDecode("InterventionScenarioSummary", decodeInterventionScenarioSummary, payload);
}
export function decodeInterventionScenarioSummaryStrictAtSeam(
  payload: unknown,
): ContractDecode<InterventionScenarioSummary> {
  return runDecode(
    "InterventionScenarioSummary",
    decodeInterventionScenarioSummaryStrict,
    payload,
  );
}

export function decodeOutcomeSummaryAtSeam(
  payload: unknown,
): ContractDecode<OutcomeSummaryContractAlias> {
  return runDecode("OutcomeSummary", decodeOutcomeSummary, payload);
}
export function decodeOutcomeSummaryStrictAtSeam(
  payload: unknown,
): ContractDecode<OutcomeSummaryContractAlias> {
  return runDecode("OutcomeSummary", decodeOutcomeSummaryStrict, payload);
}

export function decodeNextBestActionAtSeam(
  payload: unknown,
): ContractDecode<NextBestAction> {
  return runDecode("NextBestAction", decodeNextBestAction, payload);
}
export function decodeNextBestActionStrictAtSeam(
  payload: unknown,
): ContractDecode<NextBestAction> {
  return runDecode("NextBestAction", decodeNextBestActionStrict, payload);
}

/** W-R1: the authorization seam decode — grants + typed denials, verbatim. */
export function decodeAuthorizationContextAtSeam(
  payload: unknown,
): ContractDecode<AuthorizationContext> {
  return runDecode("AuthorizationContext", decodeAuthorizationContext, payload);
}
export function decodeAuthorizationContextStrictAtSeam(
  payload: unknown,
): ContractDecode<AuthorizationContext> {
  return runDecode("AuthorizationContext", decodeAuthorizationContextStrict, payload);
}

export function decodeOperationResultAtSeam(
  payload: unknown,
): ContractDecode<OperationResult> {
  return runDecode("OperationResult", decodeOperationResult, payload);
}
export function decodeOperationResultStrictAtSeam(
  payload: unknown,
): ContractDecode<OperationResult> {
  return runDecode("OperationResult", decodeOperationResultStrict, payload);
}

export function decodeTaskIntentAtSeam(payload: unknown): ContractDecode<TaskIntent> {
  return runDecode("TaskIntent", decodeTaskIntent, payload);
}
export function decodeTaskIntentStrictAtSeam(payload: unknown): ContractDecode<TaskIntent> {
  return runDecode("TaskIntent", decodeTaskIntentStrict, payload);
}

/* The capability-negotiation family (the adapter's own declarations and
 * the shared pure function's outputs — data the app consumes verbatim). */
export function decodeCapabilityDescriptorAtSeam(
  payload: unknown,
): ContractDecode<CapabilityDescriptor> {
  return runDecode("CapabilityDescriptor", decodeCapabilityDescriptor, payload);
}
export function decodeCapabilityDescriptorStrictAtSeam(
  payload: unknown,
): ContractDecode<CapabilityDescriptor> {
  return runDecode("CapabilityDescriptor", decodeCapabilityDescriptorStrict, payload);
}

export function decodeClientCapabilityProfileAtSeam(
  payload: unknown,
): ContractDecode<ClientCapabilityProfile> {
  return runDecode("ClientCapabilityProfile", decodeClientCapabilityProfile, payload);
}
export function decodeClientCapabilityProfileStrictAtSeam(
  payload: unknown,
): ContractDecode<ClientCapabilityProfile> {
  return runDecode("ClientCapabilityProfile", decodeClientCapabilityProfileStrict, payload);
}

export function decodeCapabilityNegotiationAtSeam(
  payload: unknown,
): ContractDecode<CapabilityNegotiation> {
  return runDecode("CapabilityNegotiation", decodeCapabilityNegotiation, payload);
}
export function decodeCapabilityNegotiationStrictAtSeam(
  payload: unknown,
): ContractDecode<CapabilityNegotiation> {
  return runDecode("CapabilityNegotiation", decodeCapabilityNegotiationStrict, payload);
}

/* ------------------------------------------------------------------ */
/* TaskIntent wire encoding (W-R3 — serialization, never authority)      */
/* ------------------------------------------------------------------ */

/** Encode a TaskIntent into canonical wire JSON (stamps the family version). */
export function encodeTaskIntentWire(
  intent: TaskIntent,
): ContractDecode<string> {
  return runDecode("TaskIntent", (payload: unknown) => encodeTaskIntent(payload as TaskIntent), intent);
}

/* ------------------------------------------------------------------ */
/* The joined task-flow bundle (the PROD-010 joined-endpoint convention) */
/* ------------------------------------------------------------------ */

/**
 * The joined task-flow answer the adapter seam consumes — one same-origin
 * GET assembling the task-first view of one project's current task:
 * server-owned contract objects only (decoded field-by-field so a defect
 * NAMES its object), plus the task's capability requirements (the
 * server-owned negotiation input) and — after a task-intent submission —
 * the server-authoritative operation result.
 *
 * Every field except `requirements` may be absent (null) on the wire when
 * the deployment holds no record for it: the ADAPTER renders the honest
 * empty state, never a guess.
 */
export interface TaskFlowBundle {
  readonly context: ProjectContext | null;
  readonly reality: RealitySummary | null;
  readonly evidence: EvidenceSummaryContractAlias | null;
  readonly boq: BOQContext | null;
  readonly caseSummary: EngineeringCaseSummary | null;
  readonly scenario: InterventionScenarioSummary | null;
  readonly outcome: OutcomeSummaryContractAlias | null;
  readonly nextBestAction: NextBestAction | null;
  readonly authorization: AuthorizationContext | null;
  readonly requirements: TaskCapabilityRequirements | null;
}

/** The answer of a task-intent submission (server-authoritative). */
export interface TaskIntentAnswer {
  readonly result: OperationResult;
  readonly action: NextBestAction | null;
}

/* ------------------------------------------------------------------ */
/* Bundle decoding (field-by-field: a defect names its object)           */
/* ------------------------------------------------------------------ */

function optionalAt<T>(decode: (payload: unknown) => ContractDecode<T>): (
  payload: unknown,
) => ContractDecode<T | null> {
  return (payload: unknown): ContractDecode<T | null> => {
    if (payload === null || payload === undefined) {
      return { ok: true, value: null };
    }
    const result = decode(payload);
    if (result.ok) {
      return { ok: true, value: result.value };
    }
    return { ok: false, failure: result.failure };
  };
}

/**
 * Decode the joined task-flow bundle object-by-object. A failure names the
 * FIRST defective object (deterministic field order) and carries the
 * contract error verbatim — the caller renders the explicit error state.
 */
export function decodeTaskFlowBundleAtSeam(
  payload: unknown,
): ContractDecode<TaskFlowBundle> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      failure: {
        objectName: "TaskFlowBundle",
        kind: "decode-error",
        detail: "the task-flow payload must be a JSON object",
      },
    };
  }
  const record = payload as Record<string, unknown>;

  const decoders: readonly {
    readonly field: keyof TaskFlowBundle;
    readonly decode: (payload: unknown) => ContractDecode<unknown>;
  }[] = [
    { field: "context", decode: optionalAt(decodeProjectContextAtSeam) },
    { field: "reality", decode: optionalAt(decodeRealitySummaryAtSeam) },
    { field: "evidence", decode: optionalAt(decodeEvidenceSummaryAtSeam) },
    { field: "boq", decode: optionalAt(decodeBOQContextAtSeam) },
    { field: "caseSummary", decode: optionalAt(decodeEngineeringCaseSummaryAtSeam) },
    { field: "scenario", decode: optionalAt(decodeInterventionScenarioSummaryAtSeam) },
    { field: "outcome", decode: optionalAt(decodeOutcomeSummaryAtSeam) },
    { field: "nextBestAction", decode: optionalAt(decodeNextBestActionAtSeam) },
    { field: "authorization", decode: optionalAt(decodeAuthorizationContextAtSeam) },
    { field: "requirements", decode: optionalAt(decodeTaskRequirementsAtSeam) },
  ];

  const bundle: Record<string, unknown> = {};
  for (const entry of decoders) {
    const result = entry.decode(record[entry.field]);
    if (!result.ok) {
      return { ok: false, failure: result.failure };
    }
    bundle[entry.field] = result.value;
  }
  return { ok: true, value: bundle as unknown as TaskFlowBundle };
}

function decodeTaskRequirementsAtSeam(
  payload: unknown,
): ContractDecode<TaskCapabilityRequirements> {
  // The requirements are a server-owned contract object too; decoded with
  // the package's own decoder (never a local mirror).
  return runDecode("TaskCapabilityRequirements", decodeTaskCapabilityRequirements, payload);
}

function decodeTaskRequirementsStrictAtSeam(
  payload: unknown,
): ContractDecode<TaskCapabilityRequirements> {
  return runDecode(
    "TaskCapabilityRequirements",
    decodeTaskCapabilityRequirementsStrict,
    payload,
  );
}

export { decodeTaskRequirementsAtSeam, decodeTaskRequirementsStrictAtSeam };

/**
 * Decode a task-intent submission answer: the server-authoritative
 * operation result (required) plus the follow-up next-best-action (may be
 * absent — null renders the honest empty state).
 */
export function decodeTaskIntentAnswerAtSeam(
  payload: unknown,
): ContractDecode<TaskIntentAnswer> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      failure: {
        objectName: "TaskIntentAnswer",
        kind: "decode-error",
        detail: "the task-intent answer must be a JSON object",
      },
    };
  }
  const record = payload as Record<string, unknown>;
  const result = decodeOperationResultAtSeam(record.result);
  if (!result.ok) {
    return { ok: false, failure: result.failure };
  }
  const action = optionalAt(decodeNextBestActionAtSeam)(record.action);
  if (!action.ok) {
    return { ok: false, failure: action.failure };
  }
  return { ok: true, value: { result: result.value, action: action.value } };
}
