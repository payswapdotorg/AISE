/**
 * AISE-037 — Sync lineage engine: the append-only ledger + the retrying sync
 * runner.
 *
 * Contract (spec/work-orders.md §037 "sync lineage … explicit failure states
 * … connector retries"; spec/requirements.md R15 auditability):
 *
 *  - The `SyncLedger` is an append-only journal PER TENANT/PROJECT: entries
 *    record {syncId, adapterId, direction, startedAt/finishedAt, attempts,
 *    grantedScopes, perRecordOutcomes, overall, failure}. Entries are never
 *    rewritten or removed — history is an immutable prefix (tested). The
 *    ledger is an INJECTED persistence port; this module's in-memory
 *    implementation is deterministic and byte-serializable.
 *  - `runSync` executes ONE adapter call under the retry policy:
 *      * TRANSIENT failures are retried up to the policy bound — the EXACT
 *        attempt count is journaled (every attempt, with outcome + code);
 *      * PERMANENT failures fail fast — ZERO retries, single journaled
 *        attempt;
 *      * a raw adapter throw is converted to CONTRACT_VIOLATION (permanent);
 *      * scope is pre-checked BEFORE the adapter runs (SCOPE_DENIED refusal
 *        journaled with ZERO attempts — the adapter call count proves the
 *        pre-check; tested);
 *      * capability honesty is pre-checked the same way.
 *  - NO TIMERS, NO SLEEPING: the deterministic core never delays between
 *    retries (attempt pacing is a deployment/wiring concern); attempt
 *    timestamps come from the injected clock only.
 *  - DETERMINISM: syncId is content-derived (see model.deriveSyncId) from the
 *    sync identity + its journal sequence; identical adapter behavior +
 *    identical clock + fresh ledger ⇒ byte-identical journals (tested).
 *  - The engine performs NO I/O of its own: the adapter call and the ledger
 *    are the only effects, both injected.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { Logger } from "../lib/log";
import { capabilityForScope, checkScope, requiredScopeForDirection } from "./permissions";
import { dispatchExport, dispatchImport } from "./adapter";
import type {
  AnyExportRequest,
  AnyImportRequest,
  IncumbentAdapter,
  SyncContext,
  SyncExecution,
} from "./adapter";
import type {
  CanonicalSnapshotRef,
  ExportOutcome,
  ImportOutcome,
  SyncAttempt,
  SyncDirection,
  SyncOverallStatus,
  SyncRecord,
  SyncRecordOutcome,
  SystemClass,
} from "./model";
import { deriveSyncId, failureFamily } from "./model";

/* ------------------------------------------------------------------ */
/* Sync request envelope                                                */
/* ------------------------------------------------------------------ */

export interface ImportSyncRequest {
  readonly direction: "import";
  readonly request: AnyImportRequest;
}

export interface ExportSyncRequest {
  readonly direction: "export";
  readonly snapshot: CanonicalSnapshotRef;
  readonly request: AnyExportRequest;
}

export type SyncRequest = ImportSyncRequest | ExportSyncRequest;

/* ------------------------------------------------------------------ */
/* Retry policy + dependencies                                          */
/* ------------------------------------------------------------------ */

/**
 * Bounded retry policy: `maxAttempts` is the TOTAL attempt budget (≥1;
 * 1 = single attempt, zero retries). There is deliberately no delay/backoff
 * here — the deterministic core never sleeps (nothing is retried forever,
 * nothing is delayed nondeterministically).
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
}

export interface SyncDeps {
  /** UTC instant supplier (ISO 8601) — the ONLY clock in a sync. */
  readonly clock: () => string;
  readonly ledger: SyncLedger;
  readonly retryPolicy: RetryPolicy;
  /** Optional structured logger; the LEDGER is the durable audit trail. */
  readonly logger?: Logger;
}

/* ------------------------------------------------------------------ */
/* The append-only ledger                                               */
/* ------------------------------------------------------------------ */

export type SyncLedgerAppendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "duplicate_sync_id"; readonly detail: string };

/**
 * Persistence port for sync lineage. Implementations MUST be append-only:
 * `append` adds one immutable entry; `entries` returns the journal in append
 * order; `serialize` returns the canonical JSON text of the journal (the
 * byte-determinism contract).
 */
export interface SyncLedger {
  append(entry: SyncRecord): Promise<SyncLedgerAppendResult>;
  entries(tenantId: string, projectId: string): Promise<readonly SyncRecord[]>;
  serialize(tenantId: string, projectId: string): Promise<string>;
  /** Total entries across all tenant/project journals (introspection). */
  size(): Promise<number>;
}

/** Collision-safe journal key: canonical JSON of [tenantId, projectId]. */
function journalKey(tenantId: string, projectId: string): string {
  return canonicalJsonStringify([tenantId, projectId]);
}

/**
 * Deterministic in-memory ledger. Entries are frozen on append; re-appending
 * a syncId that already exists in the SAME journal is a typed refusal (an
 * append-only journal must never hold two entries for one sync id).
 */
export class InMemorySyncLedger implements SyncLedger {
  private readonly journals = new Map<string, SyncRecord[]>();

  async append(entry: SyncRecord): Promise<SyncLedgerAppendResult> {
    const key = journalKey(entry.tenantId, entry.projectId);
    const journal = this.journals.get(key) ?? [];
    for (const existing of journal) {
      if (existing.syncId === entry.syncId) {
        return {
          ok: false,
          code: "duplicate_sync_id",
          detail:
            `sync id '${entry.syncId}' is already journaled for tenant ` +
            `'${entry.tenantId}' project '${entry.projectId}' (append-only)`,
        };
      }
    }
    journal.push(Object.freeze({ ...entry }));
    this.journals.set(key, journal);
    return { ok: true };
  }

  async entries(tenantId: string, projectId: string): Promise<readonly SyncRecord[]> {
    return this.journals.get(journalKey(tenantId, projectId)) ?? [];
  }

  async serialize(tenantId: string, projectId: string): Promise<string> {
    return canonicalJsonStringify(await this.entries(tenantId, projectId));
  }

  async size(): Promise<number> {
    let total = 0;
    for (const journal of this.journals.values()) {
      total += journal.length;
    }
    return total;
  }
}

/* ------------------------------------------------------------------ */
/* Outcome projection + overall status (pure)                           */
/* ------------------------------------------------------------------ */

/** Project an adapter's import records into the JSON-safe ledger outcomes. */
export function projectImportRecords(outcome: ImportOutcome): readonly SyncRecordOutcome[] {
  if (outcome.kind === "failure") {
    return [];
  }
  return outcome.records.map((record): SyncRecordOutcome => {
    if (record.status === "failed") {
      return {
        status: "failed",
        sourceRecordId: record.sourceRecordId,
        failureCode: record.failure.code,
        failureDetail: record.failure.detail,
      };
    }
    return {
      status: record.status,
      sourceRecordId: record.sourceOfRecord.sourceRecordId,
      contentId: record.sourceOfRecord.contentId,
    };
  });
}

/**
 * The overall status of a sync (deterministic):
 *  - any top-level failure → "failed";
 *  - exports produce one projection → "completed" on success;
 *  - imports: zero failed records → "completed"; ALL records failed →
 *    "failed"; a mix (some progress, some failures) → "partial".
 *    skipped-duplicate is NOT a failure (idempotent re-syncs complete).
 */
export function computeOverallStatus(
  direction: SyncDirection,
  outcome: ImportOutcome | ExportOutcome,
): SyncOverallStatus {
  if (outcome.kind === "failure") {
    return "failed";
  }
  if (direction === "export") {
    return "completed";
  }
  const records = "records" in outcome ? outcome.records : [];
  const failed = records.filter((record) => record.status === "failed").length;
  if (failed === 0) {
    return "completed";
  }
  if (records.length > 0 && failed === records.length) {
    return "failed";
  }
  return "partial";
}

/* ------------------------------------------------------------------ */
/* runSync                                                              */
/* ------------------------------------------------------------------ */

export type SyncRunResult =
  | {
      readonly ok: true;
      readonly syncId: string;
      readonly record: SyncRecord;
      readonly outcome: ImportOutcome | ExportOutcome;
    }
  | {
      readonly ok: false;
      readonly code: "invalid_sync_request" | "invalid_sync_deps" | "ledger_append_refused";
      readonly issues?: readonly string[];
      readonly detail?: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Minimal structural validation of the request envelope (typed, total). */
function validateRequest(envelope: SyncRequest): string[] {
  const issues: string[] = [];
  const request = envelope.request as unknown;
  if (!isPlainObject(request)) {
    return ["request must be an object"];
  }
  const port = request.port;
  if (typeof port !== "string" || port.length === 0) {
    issues.push("request.port must be a non-empty string");
  }
  if (envelope.direction === "export" && !isPlainObject(envelope.snapshot)) {
    issues.push("export sync requires a snapshot object");
  }
  const context = request.context;
  if (!isPlainObject(context)) {
    issues.push("request.context must be an object");
    return issues;
  }
  for (const field of ["tenantId", "projectId"] as const) {
    const value = context[field];
    if (typeof value !== "string" || value.length === 0) {
      issues.push(`request.context.${field} must be a non-empty string`);
    }
  }
  const sourceSystem = context.sourceSystem;
  if (!isPlainObject(sourceSystem)) {
    issues.push("request.context.sourceSystem must be an object");
  } else {
    if (
      typeof sourceSystem.systemInstanceId !== "string" ||
      sourceSystem.systemInstanceId.length === 0
    ) {
      issues.push("request.context.sourceSystem.systemInstanceId must be a non-empty string");
    }
    if (sourceSystem.systemClass !== port) {
      issues.push(
        `request.context.sourceSystem.systemClass '${String(sourceSystem.systemClass)}' must equal request.port '${String(port)}'`,
      );
    }
  }
  const granted = context.grantedScopes;
  if (!isPlainObject(granted) || !Array.isArray(granted.scopes)) {
    issues.push("request.context.grantedScopes must be a GrantedScopes object");
  }
  return issues;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/** Content-derived sync id at the current journal sequence position. */
async function nextSyncId(
  ledger: SyncLedger,
  context: SyncContext,
  adapterId: string,
  systemClass: SystemClass,
  direction: SyncDirection,
  startedAt: string,
): Promise<string> {
  const sequence = (await ledger.entries(context.tenantId, context.projectId)).length;
  return deriveSyncId({
    tenantId: context.tenantId,
    projectId: context.projectId,
    adapterId,
    systemClass,
    direction,
    startedAt,
    sequence,
  });
}

/** The retry loop: attempts + final outcome, every attempt journaled. */
async function executeWithRetries(
  adapter: IncumbentAdapter,
  envelope: SyncRequest,
  syncId: string,
  clock: () => string,
  maxAttempts: number,
): Promise<{ readonly attempts: readonly SyncAttempt[]; readonly outcome: ImportOutcome | ExportOutcome }> {
  const attempts: SyncAttempt[] = [];
  let outcome: ImportOutcome | ExportOutcome = {
    kind: "failure",
    failure: {
      code: "CONTRACT_VIOLATION",
      detail: "retry loop did not execute (maxAttempts must be ≥ 1)",
    },
  };
  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const attemptStartedAt = clock();
    const execution: SyncExecution = { syncId, attempt: attemptNumber, clock };
    let attemptOutcome: ImportOutcome | ExportOutcome;
    try {
      attemptOutcome =
        envelope.direction === "import"
          ? await dispatchImport(adapter, envelope.request as AnyImportRequest, execution)
          : await dispatchExport(
              adapter,
              (envelope as ExportSyncRequest).snapshot,
              envelope.request as AnyExportRequest,
              execution,
            );
    } catch (error) {
      // A raw exception crossing the port is a contract violation —
      // PERMANENT, journaled, never propagated untyped.
      attemptOutcome = {
        kind: "failure",
        failure: {
          code: "CONTRACT_VIOLATION",
          detail: `adapter '${adapter.descriptor.adapterId}' threw across the port boundary: ${errorMessage(error)}`,
        },
      };
    }
    const attemptFinishedAt = clock();
    const family =
      attemptOutcome.kind === "success" ? null : failureFamily(attemptOutcome.failure.code);
    attempts.push({
      attemptNumber,
      startedAt: attemptStartedAt,
      finishedAt: attemptFinishedAt,
      outcome:
        attemptOutcome.kind === "success"
          ? "success"
          : family === "transient"
            ? "failure-transient"
            : "failure-permanent",
      failureCode: attemptOutcome.kind === "success" ? null : attemptOutcome.failure.code,
      failureDetail: attemptOutcome.kind === "success" ? null : attemptOutcome.failure.detail,
    });
    outcome = attemptOutcome;
    if (attemptOutcome.kind === "success") {
      break;
    }
    if (family === "permanent") {
      break;
    }
  }
  return { attempts, outcome };
}

/** Journal projection of a successful outcome (single cast point). */
function projectSyncOutcomes(
  direction: SyncDirection,
  outcome: ImportOutcome | ExportOutcome,
  envelope: SyncRequest,
): readonly SyncRecordOutcome[] {
  if (outcome.kind === "failure") {
    return [];
  }
  if (direction === "export") {
    const projection = (outcome as { projection: { readonly contentId: string } }).projection;
    return [
      {
        status: "exported",
        sourceVersionId: (envelope as ExportSyncRequest).snapshot.sourceVersionId,
        contentId: projection.contentId,
      },
    ];
  }
  return projectImportRecords(outcome as ImportOutcome);
}

/**
 * Execute one sync through the retry policy and journal it. Refusals (scope,
 * capability) are journaled as failed syncs with ZERO attempts — the adapter
 * never runs. See the module header for the full contract.
 */
export async function runSync(
  adapter: IncumbentAdapter,
  envelope: SyncRequest,
  deps: SyncDeps,
): Promise<SyncRunResult> {
  const depIssues: string[] = [];
  if (typeof deps.clock !== "function") {
    depIssues.push("deps.clock must be a function");
  }
  const maxAttempts = (deps.retryPolicy as { maxAttempts?: unknown } | undefined)?.maxAttempts;
  if (
    typeof maxAttempts !== "number" ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 1000
  ) {
    depIssues.push("deps.retryPolicy.maxAttempts must be an integer between 1 and 1000");
  }
  if (deps.ledger === undefined || typeof deps.ledger.append !== "function") {
    depIssues.push("deps.ledger must be a SyncLedger");
  }
  if (depIssues.length > 0) {
    return { ok: false, code: "invalid_sync_deps", issues: depIssues };
  }
  const maxAttemptsTotal = maxAttempts as number;

  const requestIssues = validateRequest(envelope);
  if (requestIssues.length > 0) {
    return { ok: false, code: "invalid_sync_request", issues: requestIssues };
  }

  const request = envelope.request;
  const context: SyncContext = request.context;
  const systemClass = request.port;
  const direction = envelope.direction;
  const adapterId = adapter.descriptor.adapterId;

  // Pre-check 1 — least privilege: the required scope must be granted BEFORE
  // the adapter is ever called (SCOPE_DENIED is PERMANENT: zero retries).
  const requiredScope = requiredScopeForDirection(systemClass, direction);
  const scopeCheck = checkScope(context.grantedScopes, requiredScope);
  // Pre-check 2 — honest capability declaration for this operation.
  const requiredCapability = capabilityForScope(requiredScope);

  const startedAt = deps.clock();
  const syncId = await nextSyncId(
    deps.ledger,
    context,
    adapterId,
    systemClass,
    direction,
    startedAt,
  );

  const attempts: SyncAttempt[] = [];
  let outcome: ImportOutcome | ExportOutcome;

  if (!scopeCheck.ok) {
    outcome = {
      kind: "failure",
      failure: { code: "SCOPE_DENIED", detail: scopeCheck.detail },
    };
  } else if (!(adapter.descriptor.capabilities as readonly string[]).includes(requiredCapability)) {
    outcome = {
      kind: "failure",
      failure: {
        code: "CONTRACT_VIOLATION",
        detail:
          `adapter '${adapterId}' does not declare the required capability ` +
          `'${requiredCapability}' for ${direction} on system class '${systemClass}' ` +
          "(honest capability declaration is enforced before execution)",
      },
    };
  } else {
    // The retry loop: transient failures retry up to the bound; permanent
    // failures break immediately; every attempt is journaled.
    const executed = await executeWithRetries(
      adapter,
      envelope,
      syncId,
      deps.clock,
      maxAttemptsTotal,
    );
    attempts.push(...executed.attempts);
    outcome = executed.outcome;
  }

  const finishedAt = deps.clock();
  const perRecordOutcomes = projectSyncOutcomes(direction, outcome, envelope);

  const record: SyncRecord = Object.freeze({
    syncId,
    tenantId: context.tenantId,
    projectId: context.projectId,
    adapterId,
    systemClass,
    direction,
    startedAt,
    finishedAt,
    attempts: Object.freeze([...attempts]),
    grantedScopes: [...context.grantedScopes.scopes],
    perRecordOutcomes: Object.freeze([...perRecordOutcomes]),
    overall: computeOverallStatus(direction, outcome),
    failure: outcome.kind === "failure" ? outcome.failure : null,
  });

  const appended = await deps.ledger.append(record);
  if (!appended.ok) {
    return { ok: false, code: "ledger_append_refused", detail: appended.detail };
  }

  if (attempts.length === 0) {
    deps.logger?.warn("integration sync refused before adapter execution", {
      syncId,
      adapterId,
      systemClass,
      direction,
      failureCode: record.failure?.code,
    });
  } else {
    deps.logger?.info("integration sync finished", {
      syncId,
      adapterId,
      systemClass,
      direction,
      overall: record.overall,
      attempts: attempts.length,
    });
  }
  return { ok: true, syncId, record, outcome };
}
