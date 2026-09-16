/**
 * Provider execution gateway (PROD-009) — the deterministic service core.
 *
 * Contract (work order §PROD-009: "Connect the existing reconstruction-engine
 * registry to a hosted execution boundary without moving provider authority
 * into the application"):
 *
 *  - PROVIDER-NEUTRAL: the gateway serves the FROZEN AISE-012 provider
 *    contract. Providers arrive by injection (`deps.providers`); the gateway
 *    never imports a registry or an adapter and never interprets a provider
 *    id — engine authority stays outside the application.
 *  - IDEMPOTENT SUBMIT: one `requestKey` maps to at most one execution.
 *    Re-submitting an existing key returns the STORED record unchanged —
 *    no re-execution, no new events, regardless of current registry state.
 *  - FAILURE IS DATA, NEVER AN EXCEPTION: a provider that fails, reports an
 *    unavailable state, or even THROWS is surfaced as a typed terminal
 *    outcome (`failed` / `unavailable`) carrying FULL provenance. The caller
 *    keeps the assurance it had — a provider failure cannot lower assurance
 *    because the gateway exposes no field that could, and no exception
 *    escapes it.
 *  - UNAVAILABLE IS EXPLICIT AND NON-DESTRUCTIVE: a provider whose descriptor
 *    is not READY is never dispatched; the execution lands in the explicit
 *    `unavailable` terminal state. The gateway owns TRANSIENT EXECUTION STATE
 *    ONLY (its execution store) — no canonical job/artifact state is written
 *    or mutated by any gateway path.
 *  - NO REAL TIMERS: no scheduling; `submit` drives the deterministic
 *    status machine synchronously (submitted → running → terminal) so the
 *    lifecycle is exercisable end-to-end. The injected clock is used for
 *    record timestamps only.
 *  - DETERMINISM: same request + same injected providers/store/clock/id
 *    injections + same call sequence → byte-identical execution records.
 */

import type { Logger } from "../../lib/log";
import type {
  ProviderDescriptor,
  ReconstructionOutcome,
  ReconstructionProvider,
} from "../contract";
import { RECONSTRUCTION_FAILURE_CODES } from "../contract";
import type { ExecutionStore } from "./store";
import {
  decodeExecutionRequest,
  type ExecutionGatewayOutcome,
  type ExecutionProvenance,
  type ExecutionRecord,
  type ExecutionRequest,
  type ExecutionResult,
} from "./model";

/* ------------------------------------------------------------------ */
/* Typed errors                                                        */
/* ------------------------------------------------------------------ */

export type ExecutionGatewayErrorCode =
  | "invalid_request"
  | "provider_not_registered"
  | "execution_not_found"
  | "execution_result_missing";

/** Typed gateway failure; deterministic detail, safe to surface. */
export class ExecutionGatewayError extends Error {
  readonly code: ExecutionGatewayErrorCode;
  readonly issues?: readonly string[];

  constructor(code: ExecutionGatewayErrorCode, detail: string, issues?: readonly string[]) {
    super(`execution gateway: ${code}: ${detail}`);
    this.code = code;
    this.issues = issues;
  }
}

/* ------------------------------------------------------------------ */
/* Public surface                                                      */
/* ------------------------------------------------------------------ */

export interface ExecutionGatewayDeps {
  /**
   * Providers in DECLARED order, injected by the composition root. The
   * gateway looks a provider up by its (opaque, verbatim) descriptor id.
   */
  readonly providers: readonly ReconstructionProvider[];
  readonly store: ExecutionStore;
  /** Injected wall clock — record timestamps ONLY, never scheduling. */
  readonly clock: () => string;
  /** Injected identity factory for execution ids. */
  readonly idFactory: () => string;
  readonly logger?: Logger;
}

export interface ExecutionGateway {
  /**
   * Submit an execution request (idempotent per request key). A READY
   * provider is dispatched synchronously through the deterministic status
   * machine; a not-READY provider lands in the explicit `unavailable`
   * terminal state without ever being called. Re-submitting an existing
   * request key returns the stored record unchanged.
   */
  submit(request: ExecutionRequest): Promise<ExecutionRecord>;
  /** The execution record, or null when the id is unknown. */
  poll(executionId: string): Promise<ExecutionRecord | null>;
  /**
   * The typed outcome. Pending executions answer `pending`; terminal
   * executions answer `succeeded` | `failed` | `unavailable`, each terminal
   * outcome carrying the full execution provenance VERBATIM.
   */
  collect(executionId: string): Promise<ExecutionGatewayOutcome>;
}

/* ------------------------------------------------------------------ */
/* Determinism guards                                                  */
/* ------------------------------------------------------------------ */

const FAILURE_CODE_SET: ReadonlySet<string> = new Set(RECONSTRUCTION_FAILURE_CODES);

/** Defensive shape check: providers report failures explicitly, never garbage. */
function isValidOutcome(outcome: ReconstructionOutcome): boolean {
  if (typeof outcome !== "object" || outcome === null) {
    return false;
  }
  if (outcome.kind === "success" || outcome.kind === "partial") {
    return Array.isArray(outcome.artifacts);
  }
  if (outcome.kind === "failure") {
    return (
      typeof outcome.detail === "string" &&
      (FAILURE_CODE_SET as ReadonlySet<string>).has(outcome.code)
    );
  }
  return false;
}

/** Failure codes that mean "this provider is not usable right now". */
const UNAVAILABILITY_CODES: readonly string[] = ["UNAVAILABLE", "ACCESS_REQUIRED"];

/** Map a typed terminal record to the typed collect() outcome. */
export function outcomeOfExecution(record: ExecutionRecord): ExecutionGatewayOutcome {
  if (record.status === "submitted" || record.status === "running") {
    return { kind: "pending", executionId: record.executionId, status: record.status };
  }
  const result = record.result;
  if (result === null) {
    throw new ExecutionGatewayError(
      "execution_result_missing",
      `terminal execution '${record.executionId}' (status '${record.status}') carries no result`,
    );
  }
  if (result.kind === "succeeded") {
    return {
      kind: "succeeded",
      executionId: record.executionId,
      artifacts: result.artifacts,
      partialDetail: result.partialDetail,
      provenance: record.provenance,
    };
  }
  if (result.kind === "failed") {
    return {
      kind: "failed",
      executionId: record.executionId,
      code: result.code,
      detail: result.detail,
      provenance: record.provenance,
    };
  }
  return {
    kind: "unavailable",
    executionId: record.executionId,
    availability: result.availability,
    detail: result.detail,
    provenance: record.provenance,
  };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export function createExecutionGateway(deps: ExecutionGatewayDeps): ExecutionGateway {
  const { providers, store, clock, idFactory } = deps;
  const logger = deps.logger;

  async function persist(record: ExecutionRecord): Promise<ExecutionRecord> {
    await store.put(record);
    return record;
  }

  function findProvider(providerId: string): ReconstructionProvider {
    const provider = providers.find((candidate) => candidate.descriptor.providerId === providerId);
    if (provider === undefined) {
      throw new ExecutionGatewayError(
        "provider_not_registered",
        `provider '${providerId}' is not registered with this gateway`,
      );
    }
    return provider;
  }

  function provenanceOf(
    descriptor: ProviderDescriptor,
    request: ExecutionRequest,
  ): ExecutionProvenance {
    return {
      providerId: descriptor.providerId,
      providerVersion: descriptor.providerVersion,
      adapterVersion: descriptor.adapterVersion,
      checkpointRef: request.checkpointRef,
      executionConfig: { ...request.executionConfig },
      evidenceContentIds: [...request.request.evidenceContentIds],
    };
  }

  /** Terminal mapping from a provider outcome (already shape-validated). */
  function terminalFromOutcome(
    record: ExecutionRecord,
    outcome: ReconstructionOutcome,
  ): Promise<ExecutionRecord> {
    const at = clock();

    if (outcome.kind === "success" || outcome.kind === "partial") {
      const partialDetail = outcome.kind === "partial" ? outcome.detail : null;
      const result: ExecutionResult = {
        kind: "succeeded",
        artifacts: outcome.artifacts.map((artifact) => ({ ...artifact })),
        partialDetail,
      };
      logger?.info("execution_gateway_succeeded", {
        executionId: record.executionId,
        artifacts: result.artifacts.length,
        partial: partialDetail !== null,
      });
      return persist({
        ...record,
        status: "succeeded",
        result,
        updatedAt: at,
        events: [
          ...record.events,
          { type: "succeeded", at, artifactCount: result.artifacts.length, partialDetail },
        ],
      });
    }

    if ((UNAVAILABILITY_CODES as readonly string[]).includes(outcome.code)) {
      // The provider itself reported it is not usable: explicit unavailable
      // terminal state, honest data, nothing dispatched further.
      const result: ExecutionResult = {
        kind: "unavailable",
        availability: outcome.code,
        detail: outcome.detail,
      };
      logger?.warn("execution_gateway_unavailable", {
        executionId: record.executionId,
        availability: result.availability,
      });
      return persist({
        ...record,
        status: "unavailable",
        result,
        updatedAt: at,
        events: [
          ...record.events,
          { type: "unavailable", at, availability: result.availability, detail: result.detail },
        ],
      });
    }

    // Every other provider failure is honest typed data: the execution
    // failed; the caller's assurance is untouched (failures cannot lower it).
    const result: ExecutionResult = { kind: "failed", code: outcome.code, detail: outcome.detail };
    logger?.warn("execution_gateway_failed", {
      executionId: record.executionId,
      code: result.code,
    });
    return persist({
      ...record,
      status: "failed",
      result,
      updatedAt: at,
      events: [...record.events, { type: "failed", at, code: result.code, detail: result.detail }],
    });
  }

  async function submit(request: ExecutionRequest): Promise<ExecutionRecord> {
    const decoded = decodeExecutionRequest(request);
    if (!decoded.ok) {
      throw new ExecutionGatewayError(
        "invalid_request",
        "execution request is not valid",
        decoded.issues,
      );
    }
    const canonical = decoded.request;

    // Idempotency: an existing request key returns the stored execution
    // UNCHANGED — never re-executed, never re-journaled.
    const existing = await store.getByRequestKey(canonical.requestKey);
    if (existing !== null) {
      return existing;
    }

    // Provider resolution by opaque id (typed error when not registered;
    // nothing has been written yet — non-destructive).
    const provider = findProvider(canonical.providerId);
    const descriptor = provider.descriptor;

    const executionId = idFactory();
    const createdAt = clock();
    let record: ExecutionRecord = {
      executionId,
      requestKey: canonical.requestKey,
      status: "submitted",
      createdAt,
      updatedAt: createdAt,
      provenance: provenanceOf(descriptor, canonical),
      result: null,
      events: [
        {
          type: "submitted",
          at: createdAt,
          requestKey: canonical.requestKey,
          providerId: descriptor.providerId,
          evidenceCount: canonical.request.evidenceContentIds.length,
        },
      ],
    };
    record = await persist(record);

    // Unavailable provider: EXPLICIT, non-destructive. The provider is never
    // called; the record keeps everything captured at submit time.
    if (descriptor.availability !== "READY") {
      const at = clock();
      const detail =
        `provider '${descriptor.providerId}' reports availability '${descriptor.availability}' — ` +
        `the execution was never dispatched and no canonical state was touched`;
      const result: ExecutionResult = {
        kind: "unavailable",
        availability: descriptor.availability,
        detail,
      };
      logger?.warn("execution_gateway_unavailable", {
        executionId: record.executionId,
        availability: descriptor.availability,
      });
      return persist({
        ...record,
        status: "unavailable",
        result,
        updatedAt: at,
        events: [...record.events, { type: "unavailable", at, availability: descriptor.availability, detail }],
      });
    }

    // Dispatch: the frozen provider-contract request is forwarded VERBATIM.
    const dispatchAt = clock();
    record = await persist({
      ...record,
      status: "running",
      updatedAt: dispatchAt,
      events: [
        ...record.events,
        {
          type: "dispatch_started",
          at: dispatchAt,
          providerId: descriptor.providerId,
          providerVersion: descriptor.providerVersion,
          adapterVersion: descriptor.adapterVersion,
        },
      ],
    });

    let outcome: ReconstructionOutcome;
    try {
      outcome = await provider.execute(canonical.request);
    } catch (error) {
      // A provider that throws instead of reporting a typed outcome is
      // honest EXECUTION_FAILED data — the exception never escapes.
      const message = error instanceof Error ? error.message : String(error);
      outcome = {
        kind: "failure",
        code: "EXECUTION_FAILED",
        detail: `provider threw instead of reporting a typed outcome: ${message}`,
      };
    }
    if (!isValidOutcome(outcome)) {
      outcome = { kind: "failure", code: "OUTPUT_INVALID", detail: "provider returned an invalid outcome shape" };
    }

    return terminalFromOutcome(record, outcome);
  }

  async function poll(executionId: string): Promise<ExecutionRecord | null> {
    return store.get(executionId);
  }

  async function collect(executionId: string): Promise<ExecutionGatewayOutcome> {
    const record = await store.get(executionId);
    if (record === null) {
      throw new ExecutionGatewayError(
        "execution_not_found",
        `execution '${executionId}' does not exist`,
      );
    }
    return outcomeOfExecution(record);
  }

  return { submit, poll, collect };
}
