/**
 * Provider-neutral execution gateway types (PROD-009) — the TYPE SURFACE ONLY.
 *
 * Contract (work order §PROD-009; spec/reconstruction-engine-contract.md —
 * the frozen AISE-012 provider contract this gateway serves):
 *
 *  - NEUTRALITY: this module contains ONLY provider-neutral execution
 *    vocabulary. The gateway sits between the reconstruction-engine registry
 *    and hosted execution boundaries; provider identity is an OPAQUE string
 *    carried VERBATIM, never interpreted. No engine-specific field, name or
 *    semantic may appear here (asserted by gateway/neutrality.test.ts).
 *  - STATUS MACHINE: `submitted → running → succeeded | failed | unavailable`.
 *    `unavailable` is an EXPLICIT terminal state (provider not usable); it is
 *    non-destructive — the gateway owns transient execution state only and
 *    never writes canonical job/artifact state.
 *  - FAILURE IS DATA: a provider failure is a TYPED `failed` outcome, never
 *    an exception. By construction it cannot lower assurance — the caller
 *    keeps every assurance fact it already held; the gateway exposes no field
 *    that mutates caller state, and failed executions carry FULL provenance.
 *  - PROVENANCE: `ExecutionProvenance` preserves provider identity, version,
 *    adapter version, model checkpoint reference, execution configuration and
 *    evidence references VERBATIM on every terminal outcome, so downstream
 *    assurance can always attribute output (or the absence of output).
 *  - GENERATED_COMPLETION: demo-provider output is labeled with the frozen
 *    epistemic label `GENERATED_COMPLETION` so downstream assurance can
 *    distinguish generated completions from real captures. The label type is
 *    re-exported here as the gateway's provenance-label vocabulary entry.
 *  - DETERMINISM: request decoding is total and order-stable (issues reported
 *    in deterministic order); no wall clock, no randomness — the service
 *    injects both.
 */

import { decodeReconstructionRequest } from "../contract";
import type {
  ProviderArtifactOutput,
  ProviderAvailability,
  ReconstructionFailureCode,
  ReconstructionRequest,
} from "../contract";

/* ------------------------------------------------------------------ */
/* Status machine                                                      */
/* ------------------------------------------------------------------ */

export const EXECUTION_STATUSES = [
  "submitted",
  "running",
  "succeeded",
  "failed",
  "unavailable",
] as const;

/** Gateway execution status: submitted → running → succeeded | failed | unavailable. */
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  "succeeded",
  "failed",
  "unavailable",
];

export function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);
}

/* ------------------------------------------------------------------ */
/* GENERATED_COMPLETION provenance label                               */
/* ------------------------------------------------------------------ */

/**
 * The frozen epistemic label (spec/reconstruction-engine-contract.md
 * §Imagination and generated completion) that marks output a provider
 * GENERATED rather than observed or reconstructed from observed evidence.
 * Demo-provider output carries this label on every region; downstream
 * assurance must never treat a generated completion as a real capture.
 */
export const GENERATED_COMPLETION_LABEL = "GENERATED_COMPLETION" as const;

export type GeneratedCompletionLabel = typeof GENERATED_COMPLETION_LABEL;

export function isGeneratedCompletionLabel(value: string): value is GeneratedCompletionLabel {
  return value === GENERATED_COMPLETION_LABEL;
}

/* ------------------------------------------------------------------ */
/* Execution request (provider-neutral)                                */
/* ------------------------------------------------------------------ */

/**
 * A gateway execution request. The provider id is carried VERBATIM (the
 * gateway never interprets it); `checkpointRef` and `executionConfig` are
 * opaque provider execution parameters passed through and preserved verbatim
 * in provenance; `request` is the frozen AISE-010 provider-contract request
 * forwarded to the provider unmodified.
 */
export interface ExecutionRequest {
  /** Idempotency key: one request key maps to at most one execution. */
  readonly requestKey: string;
  /** Target provider id — opaque, carried VERBATIM. */
  readonly providerId: string;
  /** Provider model checkpoint reference, or null. Opaque passthrough. */
  readonly checkpointRef: string | null;
  /** Provider execution configuration. Opaque passthrough, preserved verbatim. */
  readonly executionConfig: Readonly<Record<string, unknown>>;
  /** The frozen provider-contract request forwarded to the provider. */
  readonly request: ReconstructionRequest;
}

/**
 * Provenance preserved VERBATIM for every execution (terminal outcomes carry
 * it regardless of success, failure or unavailability): provider identity and
 * versions captured from the provider descriptor at submit time, plus the
 * checkpoint/config/evidence references exactly as the caller declared them.
 */
export interface ExecutionProvenance {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly adapterVersion: string;
  readonly checkpointRef: string | null;
  readonly executionConfig: Readonly<Record<string, unknown>>;
  readonly evidenceContentIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Results and outcomes (typed — never raw throws)                     */
/* ------------------------------------------------------------------ */

/**
 * Terminal execution result stored on the record. Provider `partial`
 * outcomes map to `succeeded` with `partialDetail` (nothing is hidden);
 * provider-reported `UNAVAILABLE`/`ACCESS_REQUIRED` failures map to the
 * explicit `unavailable` state.
 */
export type ExecutionResult =
  | {
      readonly kind: "succeeded";
      readonly artifacts: readonly ProviderArtifactOutput[];
      readonly partialDetail: string | null;
    }
  | {
      readonly kind: "failed";
      readonly code: ReconstructionFailureCode;
      readonly detail: string;
    }
  | {
      readonly kind: "unavailable";
      readonly availability: ProviderAvailability;
      readonly detail: string;
    };

/**
 * The gateway's typed outcome family (collect()). Failures and
 * unavailability are DATA with full provenance — never exceptions — so a
 * provider failure cannot lower assurance: the caller keeps the assurance it
 * had and learns the failure honestly.
 */
export type ExecutionGatewayOutcome =
  | {
      readonly kind: "pending";
      readonly executionId: string;
      readonly status: "submitted" | "running";
    }
  | {
      readonly kind: "succeeded";
      readonly executionId: string;
      readonly artifacts: readonly ProviderArtifactOutput[];
      readonly partialDetail: string | null;
      readonly provenance: ExecutionProvenance;
    }
  | {
      readonly kind: "failed";
      readonly executionId: string;
      readonly code: ReconstructionFailureCode;
      readonly detail: string;
      readonly provenance: ExecutionProvenance;
    }
  | {
      readonly kind: "unavailable";
      readonly executionId: string;
      readonly availability: ProviderAvailability;
      readonly detail: string;
      readonly provenance: ExecutionProvenance;
    };

/* ------------------------------------------------------------------ */
/* Execution record                                                    */
/* ------------------------------------------------------------------ */

/** Append-only lifecycle journal entry. `at` comes from the injected clock. */
export type ExecutionEvent =
  | {
      readonly type: "submitted";
      readonly at: string;
      readonly requestKey: string;
      readonly providerId: string;
      readonly evidenceCount: number;
    }
  | {
      readonly type: "dispatch_started";
      readonly at: string;
      readonly providerId: string;
      readonly providerVersion: string;
      readonly adapterVersion: string;
    }
  | {
      readonly type: "succeeded";
      readonly at: string;
      readonly artifactCount: number;
      readonly partialDetail: string | null;
    }
  | {
      readonly type: "failed";
      readonly at: string;
      readonly code: ReconstructionFailureCode;
      readonly detail: string;
    }
  | {
      readonly type: "unavailable";
      readonly at: string;
      readonly availability: ProviderAvailability;
      readonly detail: string;
    };

/**
 * The persisted execution record. The gateway owns TRANSIENT EXECUTION STATE
 * ONLY — this record is the whole of what a gateway execution writes; no
 * canonical job/artifact state is ever touched (unavailability and failure
 * are therefore non-destructive by construction).
 */
export interface ExecutionRecord {
  readonly executionId: string;
  readonly requestKey: string;
  readonly status: ExecutionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly provenance: ExecutionProvenance;
  /** Terminal result data; null while pending. */
  readonly result: ExecutionResult | null;
  /** Append-only lifecycle journal (the store refuses truncation). */
  readonly events: readonly ExecutionEvent[];
}

/* ------------------------------------------------------------------ */
/* Request validation (total, deterministic)                           */
/* ------------------------------------------------------------------ */

export type ExecutionRequestDecode =
  | { readonly ok: true; readonly request: ExecutionRequest }
  | { readonly ok: false; readonly issues: string[] };

const EXECUTION_REQUEST_FIELDS = [
  "requestKey",
  "providerId",
  "checkpointRef",
  "executionConfig",
  "request",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural validation of a full `ExecutionRequest` (including the inner
 * frozen provider-contract request). Issues are deterministic: unknown
 * fields are reported sorted; every other issue is reported in field order.
 */
export function decodeExecutionRequest(value: unknown): ExecutionRequestDecode {
  const issues: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, issues: ["execution request must be a JSON object"] };
  }
  const unknownFields = Object.keys(value)
    .filter((key) => !(EXECUTION_REQUEST_FIELDS as readonly string[]).includes(key))
    .sort();
  for (const key of unknownFields) {
    issues.push(`unknown field '${key}'`);
  }

  const requestKey = value.requestKey;
  if (typeof requestKey !== "string" || requestKey.length === 0) {
    issues.push("requestKey must be a non-empty string");
  }

  const providerId = value.providerId;
  if (typeof providerId !== "string" || providerId.length === 0) {
    issues.push("providerId must be a non-empty string");
  }

  const checkpointRef = value.checkpointRef ?? null;
  if (checkpointRef !== null && (typeof checkpointRef !== "string" || checkpointRef.length === 0)) {
    issues.push("checkpointRef must be a non-empty string when present");
  }

  const executionConfig = value.executionConfig;
  if (!isPlainObject(executionConfig)) {
    issues.push("executionConfig must be a JSON object (opaque provider configuration passthrough)");
  }

  const inner = decodeReconstructionRequest(value.request);
  let providerRequest: ReconstructionRequest | null = null;
  if (inner.ok) {
    providerRequest = inner.request;
  } else {
    issues.push(...inner.issues.map((issue) => `provider request: ${issue}`));
  }

  if (issues.length > 0 || providerRequest === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    request: {
      requestKey: requestKey as string,
      providerId: providerId as string,
      checkpointRef: checkpointRef as string | null,
      executionConfig: { ...(executionConfig as Record<string, unknown>) },
      request: providerRequest,
    },
  };
}
