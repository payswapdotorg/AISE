/**
 * AISE-038 — Developer API/SDK: the CONTRACT MODEL.
 *
 * Contract (spec/work-orders.md §038: "Owner ZAI. Expose stable APIs for
 * capture, reality, BOQ, case, intervention and rendering projections.
 * Verify versioning, scopes, idempotency and provider-neutral semantics.";
 * spec/requirements.md R21 — "AISE shall expose stable provider-neutral
 * APIs... AISE capabilities can be invoked... authorization, assurance
 * failures and source provenance remain explicit."):
 *
 * AUTHORITY DISCIPLINE (the loud parts first):
 *
 *  - THIS MODULE IS A CONTRACT, NOT AN AUTHORITY. It REGISTERS and
 *    DESCRIBES the stable public surface of the six work-order domains —
 *    capture (AISE-004), reality (AISE-016), BOQ (AISE-011/014/017),
 *    case (AISE-025), intervention (AISE-026) and the rendering
 *    projections library (AISE-020) — as typed operation contracts (route
 *    metadata, permission scopes, idempotency classes, error-code
 *    registries). It never re-implements domain logic, never creates a
 *    second canonical model, and never bypasses a domain authority: the
 *    described routes keep answering through their owning routers.
 *  - THE ROUTER IS THE FACT, THE REGISTRY IS THE CONTRACT. The drift
 *    check (`checkRouteDrift`) compares the registered HTTP operations
 *    against the route shapes the real server actually dispatches (facts
 *    gathered behaviorally by probing the full handler — see
 *    contract.test.ts). A registered-but-absent route and an
 *    unregistered-but-present route are BOTH typed drift errors; a
 *    mismatch is never silently ignored.
 *  - SCOPES COME FROM THE AISE-036 IDENTITY REGISTRY VERBATIM. Every
 *    operation's scope is a `surface:granularity` permission from the
 *    FROZEN identity permission registry. The compile-time guarantee is
 *    the type-only `Permission` import from `identity/model`; the runtime
 *    guarantee is the JSON fixture (`identity-permissions.fixture.json`)
 *    pinned VERBATIM against the live registry by contract.test.ts, so
 *    the fixture can never drift into a second vocabulary. A fabricated
 *    scope is a typed `unknown_scope` refusal naming it.
 *  - VERSIONING IS EXPLICIT AND ADDITIONS-ONLY. The contract surface is
 *    versioned through a version registry whose builder REFUSES
 *    removals and renames (breaking changes) with a typed error naming
 *    the conflict; additions are allowed and become a new version. The
 *    API version is stated in the discovery document and stamped on
 *    every /v1/sdk response.
 *  - IDEMPOTENCY IS DOCUMENTED PER OPERATION AND ENFORCED BY THE
 *    DOMAINS. The house discipline: POST operations whose ids are
 *    caller-supplied and stable are refused as typed duplicates on
 *    replay (`project_exists`, `case_exists`, `scenario_exists` — never
 *    double-applied); content-addressed and duplicate-acknowledged
 *    uploads answer DUPLICATE on replay; derived-write-once projections
 *    return the stored bytes; plain appends are documented as NOT
 *    replay-safe (the contract says so explicitly — no silent at-most-
 *    once claim is ever made). The client builders expose the
 *    id-stability convention (a missing stable id is a typed refusal).
 *  - PROVIDER-NEUTRAL SEMANTICS. The contracts describe AISE-native
 *    semantics only: no provider-specific fields, no engine names, no
 *    vendor vocabulary. Reconstruction-provider variance stays behind
 *    the reconstruction authority's own contract (AISE-010/012) and is
 *    deliberately NOT part of this surface.
 *  - THE PROJECTIONS DOMAIN HAS NO HTTP ROUTES — AND THE CONTRACT SAYS
 *    SO. The rendering-projections capability (AISE-020) is exposed as
 *    a deterministic IN-PROCESS library (consumed by the web workspace,
 *    AISE-021/024/027). Its six stable operations are registered with
 *    transport "in-process" (scope `reality:read` — projections are
 *    read-only derived views of a pinned Reality Graph version), and
 *    the `/v1/projections` namespace is claimed as RESERVED-EMPTY by
 *    this contract: any HTTP route appearing there is drift.
 *
 * DETERMINISM: no wall clock, no randomness, no I/O. The registry is a
 * frozen literal validated at module load (a bad contract fails loudly
 * at import, never at request time), and every derived artifact (the
 * discovery document, the drift check) is a pure function of it.
 */

import type { Permission } from "../identity/model";
import permissionsFixture from "./identity-permissions.fixture.json" with { type: "json" };

/* ------------------------------------------------------------------ */
/* Scope discipline (the AISE-036 registry, read by fixture)            */
/* ------------------------------------------------------------------ */

/**
 * The frozen permission list the SDK validates scopes against — a VERBATIM
 * snapshot of identity/model.ts `PERMISSIONS` (see the fixture header).
 * contract.test.ts asserts this equals the live registry member-for-member
 * and order-for-order, so the SDK never maintains a second vocabulary.
 */
export const IDENTITY_PERMISSIONS_FIXTURE: readonly string[] = Object.freeze(
  permissionsFixture.permissions,
);

/** Typed refusal for every contract-construction violation (never a bare throw). */
export const SDK_CONTRACT_ERROR_CODES = Object.freeze([
  "unknown_scope",
  "unknown_idempotency_class",
  "unknown_domain",
  "duplicate_domain",
  "duplicate_namespace",
  "duplicate_operation_id",
  "duplicate_route",
  "invalid_path_template",
  "operation_outside_namespace",
  "method_class_mismatch",
  "stable_id_field_required",
  "invalid_error_codes",
  "empty_version_history",
  "duplicate_version",
  "breaking_change_refused",
  "unknown_version",
  "operation_not_in_versions",
  "operation_not_in_current_version",
  "invalid_contract_input",
] as const);
export type SdkContractErrorCode = (typeof SDK_CONTRACT_ERROR_CODES)[number];

export class SdkContractError extends Error {
  readonly code: SdkContractErrorCode;
  readonly detail: string;

  constructor(code: SdkContractErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SdkContractError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Validate one scope string against the frozen permission registry.
 * Accepts exactly the `surface:granularity` permissions the AISE-036
 * identity module froze; anything else is a typed `unknown_scope`
 * refusal naming the fabricated value (never a silent acceptance and
 * never a fuzzy match).
 */
export function parseSdkScope(value: unknown): Permission {
  if (typeof value === "string" && IDENTITY_PERMISSIONS_FIXTURE.includes(value)) {
    return value as Permission;
  }
  throw new SdkContractError(
    "unknown_scope",
    `'${String(value)}' is not in the frozen identity permission registry ` +
      `(surface:granularity, e.g. 'reality:read') — scopes are drawn VERBATIM ` +
      `from backend/api/src/identity/model.ts PERMISSIONS`,
  );
}

/* ------------------------------------------------------------------ */
/* Idempotency classes (the documented house discipline)                */
/* ------------------------------------------------------------------ */

export const SDK_IDEMPOTENCY_CLASSES = Object.freeze([
  "read",
  "caller-stable-id",
  "content-addressed",
  "duplicate-acknowledged",
  "derived-write-once",
  "append",
  "pure",
] as const);
export type SdkIdempotencyClass = (typeof SDK_IDEMPOTENCY_CLASSES)[number];

/** Human-readable discipline statement per class (published in discovery). */
export const SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS: Readonly<
  Record<SdkIdempotencyClass, string>
> = Object.freeze({
  read:
    "HTTP GET read; side-effect-free; safe to retry (GET-literal: no request body).",
  "caller-stable-id":
    "HTTP POST whose identity is a CALLER-SUPPLIED STABLE ID (the documented " +
    "id field). Replaying the same id is REFUSED by the owning append-only " +
    "domain with a typed duplicate error (project_exists, case_exists, " +
    "scenario_exists) — the operation is never double-applied.",
  "content-addressed":
    "HTTP POST whose identity is the sha-256 content address of the body " +
    "bytes. Replaying identical bytes is acknowledged as a DUPLICATE (200), " +
    "never stored twice; different bytes are a different object.",
  "duplicate-acknowledged":
    "HTTP POST carrying a caller-stable batch id and idempotency key. A " +
    "replayed batch is acknowledged with a DUPLICATE SyncAck (200) and is " +
    "never re-applied to the session.",
  "derived-write-once":
    "HTTP POST computing a DERIVED view idempotently: the first call " +
    "persists the view, later calls return the same stored bytes. The " +
    "source record is never mutated.",
  append:
    "HTTP POST appending a new record or version with server-assigned " +
    "identity. There is NO replay-refusal: blindly retrying appends twice. " +
    "Callers must treat these as at-least-once operations and reconcile by " +
    "content or id — never by blind retry.",
  pure:
    "In-process deterministic function of its inputs (no HTTP route, no " +
    "side effects); identical inputs produce byte-identical outputs.",
});

/* ------------------------------------------------------------------ */
/* Operation contracts                                                  */
/* ------------------------------------------------------------------ */

export type SdkHttpMethod = "GET" | "POST";
export type SdkTransport = "http" | "in-process";

/** Stable operation identifier — the unit of the version registry. */
export type SdkOperationId = string;

interface SdkOperationBase {
  /** Stable, namespaced identifier (e.g. "cases.create"). */
  readonly id: SdkOperationId;
  /** One-line semantics summary (AISE-native, provider-neutral). */
  readonly summary: string;
  /** REQUIRED permission scope, VERBATIM from the identity registry. */
  readonly scope: Permission;
  /** Documented replay/idempotency discipline (see class descriptions). */
  readonly idempotencyClass: SdkIdempotencyClass;
  /**
   * Stable refusal codes this operation can answer with (drawn from the
   * owning domain's frozen registries plus the transport-level codes the
   * domain router documents, e.g. malformed_json).
   */
  readonly errorCodes: readonly string[];
  /**
   * For `caller-stable-id` operations: the request body field carrying the
   * caller-supplied stable id. Absent for every other class.
   */
  readonly idField?: string;
}

/** An HTTP route contract (one method + one path template). */
export interface SdkHttpOperation extends SdkOperationBase {
  readonly transport: "http";
  readonly method: SdkHttpMethod;
  /** Path template with `:param` placeholders, e.g. "/v1/cases/:caseId". */
  readonly path: string;
}

/** An in-process library operation contract (no HTTP route). */
export interface SdkInProcessOperation extends SdkOperationBase {
  readonly transport: "in-process";
  /** Exported entry point, e.g. "projections/floorplan.ts generateFloorPlan". */
  readonly entryPoint: string;
}

export type SdkOperation = SdkHttpOperation | SdkInProcessOperation;

/** One work-order domain's public surface as this contract describes it. */
export interface SdkDomainContract {
  /** One of the six work-order domains. */
  readonly id: string;
  /** Human-readable domain title. */
  readonly title: string;
  /** The owning authority module (the SDK describes; the authority rules). */
  readonly authority: string;
  /**
   * The HTTP namespace this contract claims (all registered HTTP operations
   * live under it, and any router route appearing under it unregistered is
   * drift). The projections domain claims a RESERVED-EMPTY namespace.
   */
  readonly namespace: string;
  /** Honest surface notes (e.g. why projections is in-process). */
  readonly notes: readonly string[];
  readonly operations: readonly SdkOperation[];
}

/* ------------------------------------------------------------------ */
/* Version registry (explicit, additions-only)                          */
/* ------------------------------------------------------------------ */

/** One version step: the FULL operation-id set as of that version. */
export interface SdkVersionStep {
  readonly version: string;
  readonly operations: readonly SdkOperationId[];
}

export interface SdkVersionRegistry {
  /** Ordered version history (oldest first). */
  readonly versions: readonly string[];
  /** The current (latest) version — stamped on every /v1/sdk response. */
  readonly currentVersion: string;
  /** Operation ids present at a given version (typed refusal when unknown). */
  operationIdsAt(version: string): readonly SdkOperationId[];
}

/**
 * Build a version registry under the compatibility discipline: versions
 * are ordered and unique, and each version must be a SUPERSET of its
 * predecessor — additions are allowed; removals and renames are BREAKING
 * and REFUSED with a typed error naming the conflicted operation id.
 */
export function buildSdkVersionRegistry(
  steps: readonly SdkVersionStep[],
): SdkVersionRegistry {
  if (steps.length === 0) {
    throw new SdkContractError(
      "empty_version_history",
      "a version registry requires at least one version step",
    );
  }
  const seen = new Set<string>();
  let previous: SdkVersionStep | null = null;
  for (const step of steps) {
    if (typeof step.version !== "string" || step.version.length === 0) {
      throw new SdkContractError(
        "invalid_contract_input",
        "a version step requires a non-empty version string",
      );
    }
    if (seen.has(step.version)) {
      throw new SdkContractError(
        "duplicate_version",
        `version '${step.version}' appears more than once in the version history`,
      );
    }
    if (
      !Array.isArray(step.operations) ||
      step.operations.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new SdkContractError(
        "invalid_contract_input",
        `version '${step.version}' requires a non-empty-string operation id list`,
      );
    }
    if (previous !== null) {
      const next = new Set<string>(step.operations);
      const removed = previous.operations.filter((id) => !next.has(id));
      if (removed.length > 0) {
        // A rename is a removal plus an addition — it lands here too, and
        // the refusal names every removed id so the conflict is explicit.
        throw new SdkContractError(
          "breaking_change_refused",
          `version '${step.version}' drops operation(s) present in version ` +
            `'${previous.version}': ${removed.join(", ")} — removals and ` +
            `renames are breaking changes; the registry refuses to build them ` +
            `(additions only)`,
        );
      }
    }
    seen.add(step.version);
    previous = step;
  }
  const byVersion = new Map<string, readonly SdkOperationId[]>(
    steps.map((step) => [step.version, step.operations]),
  );
  const current = steps[steps.length - 1] as SdkVersionStep;
  return {
    versions: Object.freeze(steps.map((step) => step.version)),
    currentVersion: current.version,
    operationIdsAt(version: string): readonly SdkOperationId[] {
      const operations = byVersion.get(version);
      if (operations === undefined) {
        throw new SdkContractError(
          "unknown_version",
          `version '${version}' is not in the version history ` +
            `(${[...byVersion.keys()].join(", ")})`,
        );
      }
      return operations;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Contract construction (validates every discipline at build time)     */
/* ------------------------------------------------------------------ */

export interface SdkDomainContractInput {
  readonly id: string;
  readonly title: string;
  readonly authority: string;
  readonly namespace: string;
  readonly notes?: readonly string[];
  readonly operations: readonly SdkOperation[];
}

export interface SdkContractInput {
  readonly domains: readonly SdkDomainContractInput[];
  /** Version history for the whole contract (additions-only ladder). */
  readonly versions: readonly SdkVersionStep[];
}

export interface SdkContract {
  readonly domains: readonly SdkDomainContract[];
  readonly versionRegistry: SdkVersionRegistry;
  /** Every operation, in registry order (domains then declaration order). */
  readonly operations: readonly SdkOperation[];
  /** Operation lookup by stable id (undefined when unknown). */
  operationById(id: SdkOperationId): SdkOperation | undefined;
  /** The HTTP namespaces this contract governs for drift checking. */
  readonly governedNamespaces: readonly string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Split a path template into segments; typed refusal when malformed. */
function pathSegmentsOf(template: string, what: string): string[] {
  if (!template.startsWith("/") || template.includes("//") || template.endsWith("/")) {
    throw new SdkContractError(
      "invalid_path_template",
      `${what}: path template '${template}' must start with '/', contain no empty ` +
        `segments and not end with '/'`,
    );
  }
  return template.slice(1).split("/");
}

/**
 * Route SHAPE of a path template: literal segments stay, `:param`
 * segments collapse to a placeholder marker. Drift matching is
 * shape-level (a path parameter's NAME is documentation, not identity).
 */
export function sdkRouteShape(template: string): string {
  return `/${pathSegmentsOf(template, "path")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/")}`;
}

function validateErrorCodes(operationId: string, errorCodes: readonly string[]): void {
  if (!Array.isArray(errorCodes)) {
    throw new SdkContractError(
      "invalid_error_codes",
      `operation '${operationId}' requires an errorCodes array`,
    );
  }
  const seen = new Set<string>();
  for (const code of errorCodes) {
    if (!isNonEmptyString(code)) {
      throw new SdkContractError(
        "invalid_error_codes",
        `operation '${operationId}' lists a non-string error code`,
      );
    }
    if (seen.has(code)) {
      throw new SdkContractError(
        "invalid_error_codes",
        `operation '${operationId}' lists error code '${code}' more than once`,
      );
    }
    seen.add(code);
  }
}

/**
 * Build and VALIDATE a contract: every scope is checked against the frozen
 * identity permission registry (fabricated scopes are typed refusals),
 * operation ids and (method, route-shape) pairs are unique, idempotency
 * classes are vocabulary members matched to the transport (GET is always
 * `read`; in-process is always `pure`; `caller-stable-id` operations must
 * name their id field), HTTP paths stay inside their domain namespace, and
 * the version registry obeys the additions-only discipline with the
 * current version covering every registered operation.
 */
export function buildSdkContract(input: SdkContractInput): SdkContract {
  if (!Array.isArray(input.domains) || input.domains.length === 0) {
    throw new SdkContractError(
      "invalid_contract_input",
      "a contract requires at least one domain",
    );
  }
  const domainIds = new Set<string>();
  const namespaces = new Map<string, string>();
  const operationIds = new Set<string>();
  const routeShapes = new Map<string, string>(); // "METHOD shape" -> operation id
  const domains: SdkDomainContract[] = [];
  const operations: SdkOperation[] = [];

  for (const domain of input.domains) {
    if (!isNonEmptyString(domain.id)) {
      throw new SdkContractError(
        "invalid_contract_input",
        "a domain requires a non-empty id",
      );
    }
    if (domainIds.has(domain.id)) {
      throw new SdkContractError(
        "duplicate_domain",
        `domain '${domain.id}' is registered more than once`,
      );
    }
    if (!isNonEmptyString(domain.title) || !isNonEmptyString(domain.authority)) {
      throw new SdkContractError(
        "invalid_contract_input",
        `domain '${domain.id}' requires a non-empty title and authority`,
      );
    }
    const namespaceOwner = namespaces.get(domain.namespace);
    if (namespaceOwner !== undefined) {
      throw new SdkContractError(
        "duplicate_namespace",
        `namespace '${domain.namespace}' is claimed by both domain ` +
          `'${namespaceOwner}' and domain '${domain.id}'`,
      );
    }
    pathSegmentsOf(domain.namespace, `domain '${domain.id}' namespace`);
    if (!Array.isArray(domain.operations) || domain.operations.length === 0) {
      throw new SdkContractError(
        "invalid_contract_input",
        `domain '${domain.id}' registers no operations`,
      );
    }
    domainIds.add(domain.id);
    namespaces.set(domain.namespace, domain.id);

    for (const operation of domain.operations) {
      if (!isNonEmptyString(operation.id)) {
        throw new SdkContractError(
          "invalid_contract_input",
          `domain '${domain.id}' registers an operation without an id`,
        );
      }
      if (operationIds.has(operation.id)) {
        throw new SdkContractError(
          "duplicate_operation_id",
          `operation '${operation.id}' is registered more than once`,
        );
      }
      if (!isNonEmptyString(operation.summary)) {
        throw new SdkContractError(
          "invalid_contract_input",
          `operation '${operation.id}' requires a non-empty summary`,
        );
      }
      // Scope discipline: verbatim membership in the frozen identity
      // permission registry (fixture pinned to the live authority).
      parseSdkScope(operation.scope);
      if (!(SDK_IDEMPOTENCY_CLASSES as readonly string[]).includes(operation.idempotencyClass)) {
        throw new SdkContractError(
          "unknown_idempotency_class",
          `operation '${operation.id}' declares unknown idempotency class ` +
            `'${String(operation.idempotencyClass)}'`,
        );
      }
      validateErrorCodes(operation.id, operation.errorCodes);

      if (operation.transport === "http") {
        const segments = pathSegmentsOf(operation.path, `operation '${operation.id}'`);
        const paramNames = new Set<string>();
        for (const segment of segments) {
          if (segment.startsWith(":")) {
            const name = segment.slice(1);
            if (name.length === 0) {
              throw new SdkContractError(
                "invalid_path_template",
                `operation '${operation.id}': empty path parameter name`,
              );
            }
            if (paramNames.has(name)) {
              throw new SdkContractError(
                "invalid_path_template",
                `operation '${operation.id}': path parameter ':${name}' appears twice`,
              );
            }
            paramNames.add(name);
          }
        }
        if (
          operation.path !== domain.namespace &&
          !operation.path.startsWith(`${domain.namespace}/`)
        ) {
          throw new SdkContractError(
            "operation_outside_namespace",
            `operation '${operation.id}' registers path '${operation.path}' outside ` +
              `its domain namespace '${domain.namespace}'`,
          );
        }
        const shape = sdkRouteShape(operation.path);
        const routeKey = `${operation.method} ${shape}`;
        const owner = routeShapes.get(routeKey);
        if (owner !== undefined) {
          throw new SdkContractError(
            "duplicate_route",
            `route '${routeKey}' is registered by both '${owner}' and '${operation.id}'`,
          );
        }
        routeShapes.set(routeKey, operation.id);
        // Transport/class coherence: GET is side-effect-free by contract;
        // only POSTs carry write semantics; the stable-id convention is
        // documented exactly where it applies.
        if (operation.method === "GET" && operation.idempotencyClass !== "read") {
          throw new SdkContractError(
            "method_class_mismatch",
            `operation '${operation.id}' is GET but declares idempotency class ` +
              `'${operation.idempotencyClass}' — GET operations are always 'read'`,
          );
        }
        if (operation.method === "POST" && operation.idempotencyClass === "read") {
          throw new SdkContractError(
            "method_class_mismatch",
            `operation '${operation.id}' is POST but declares idempotency class ` +
              `'read' — reads are GET-literal`,
          );
        }
        if (operation.idempotencyClass === "caller-stable-id") {
          if (!isNonEmptyString(operation.idField)) {
            throw new SdkContractError(
              "stable_id_field_required",
              `operation '${operation.id}' declares class 'caller-stable-id' without ` +
                `naming the request-body id field`,
            );
          }
        } else if (operation.idField !== undefined) {
          throw new SdkContractError(
            "stable_id_field_required",
            `operation '${operation.id}' names id field '${operation.idField}' but is ` +
              `not class 'caller-stable-id'`,
          );
        }
      } else if (operation.transport === "in-process") {
        if (!isNonEmptyString(operation.entryPoint)) {
          throw new SdkContractError(
            "invalid_contract_input",
            `in-process operation '${operation.id}' requires an entry point`,
          );
        }
        if (operation.idempotencyClass !== "pure") {
          throw new SdkContractError(
            "method_class_mismatch",
            `in-process operation '${operation.id}' declares idempotency class ` +
              `'${operation.idempotencyClass}' — in-process operations are 'pure'`,
          );
        }
      } else {
        throw new SdkContractError(
          "invalid_contract_input",
          `operation '${operation.id}' declares unknown transport ` +
            `'${String((operation as { transport?: unknown }).transport)}'`,
        );
      }
      operationIds.add(operation.id);
      operations.push(operation);
    }

    domains.push({
      id: domain.id,
      title: domain.title,
      authority: domain.authority,
      namespace: domain.namespace,
      notes: Object.freeze([...(domain.notes ?? [])]),
      operations: Object.freeze([...domain.operations]),
    });
  }

  const versionRegistry = buildSdkVersionRegistry(input.versions);
  for (const version of versionRegistry.versions) {
    for (const id of versionRegistry.operationIdsAt(version)) {
      if (!operationIds.has(id)) {
        throw new SdkContractError(
          "operation_not_in_versions",
          `version '${version}' references operation '${id}' which no domain registers`,
        );
      }
    }
  }
  const currentIds = new Set<string>(
    versionRegistry.operationIdsAt(versionRegistry.currentVersion),
  );
  for (const id of operationIds) {
    if (!currentIds.has(id)) {
      throw new SdkContractError(
        "operation_not_in_current_version",
        `operation '${id}' is registered but absent from the current version ` +
          `'${versionRegistry.currentVersion}' — every registered operation must ` +
          `ship in the current contract version`,
      );
    }
  }

  const byId = new Map<string, SdkOperation>(operations.map((op) => [op.id, op]));
  return {
    domains: Object.freeze(domains),
    versionRegistry,
    operations: Object.freeze(operations),
    governedNamespaces: Object.freeze(domains.map((domain) => domain.namespace)),
    operationById(id: SdkOperationId): SdkOperation | undefined {
      return byId.get(id);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Route drift check (registry = CONTRACT, router = FACT)               */
/* ------------------------------------------------------------------ */

/** One route shape the real server dispatches, with its allowed methods. */
export interface RouterFact {
  /** Path template with `:param` placeholders (param names are informal). */
  readonly path: string;
  readonly methods: readonly SdkHttpMethod[];
}

export const SDK_DRIFT_CODES = Object.freeze([
  "registered_route_absent",
  "unregistered_route_present",
] as const);
export type SdkDriftCode = (typeof SDK_DRIFT_CODES)[number];

/** A typed contract-drift finding — never silently ignored. */
export interface SdkRouteDrift {
  readonly code: SdkDriftCode;
  readonly method: SdkHttpMethod;
  readonly path: string;
  readonly operationId?: SdkOperationId;
  readonly detail: string;
}

function pathInNamespace(path: string, namespace: string): boolean {
  return path === namespace || path.startsWith(`${namespace}/`);
}

/**
 * Compare the registered HTTP operations (the CONTRACT) against the route
 * shapes the server actually dispatches (the FACTS, gathered behaviorally
 * by probing the full request handler — see contract.test.ts):
 *
 *  - registered_route_absent: a registered operation's (method, path) is
 *    not served by the router — the contract promises a route that does
 *    not exist;
 *  - unregistered_route_present: the router serves a (method, path) inside
 *    a namespace this contract governs but no operation registers it —
 *    an unregistered route is reported, never silently ignored.
 *
 * Facts outside the governed namespaces are out of contract scope (other
 * work items' surfaces) and deliberately ignored. Matching is SHAPE-level:
 * `:param` names are documentation, not route identity.
 */
export function checkRouteDrift(
  contract: SdkContract,
  facts: readonly RouterFact[],
): SdkRouteDrift[] {
  const drift: SdkRouteDrift[] = [];
  const registered = new Map<string, SdkOperation>();
  for (const operation of contract.operations) {
    if (operation.transport === "http") {
      registered.set(`${operation.method} ${sdkRouteShape(operation.path)}`, operation);
    }
  }

  // Registered-but-absent: every registered route must be a served fact.
  for (const operation of contract.operations) {
    if (operation.transport !== "http") {
      continue;
    }
    const fact = facts.find(
      (candidate) => sdkRouteShape(candidate.path) === sdkRouteShape(operation.path),
    );
    if (fact === undefined || !fact.methods.includes(operation.method)) {
      drift.push({
        code: "registered_route_absent",
        method: operation.method,
        path: operation.path,
        operationId: operation.id,
        detail:
          `registered operation '${operation.id}' (${operation.method} ` +
          `${operation.path}) is ${fact === undefined ? "not served by the router" : `served without the ${operation.method} method`} — ` +
          `the registry is the CONTRACT and the router is the FACT; a ` +
          `registered-but-absent route is contract drift`,
      });
    }
  }

  // Unregistered-but-present: every served fact inside a governed
  // namespace must map to a registered operation.
  for (const fact of facts) {
    const governed = contract.governedNamespaces.some((namespace) =>
      pathInNamespace(fact.path, namespace),
    );
    if (!governed) {
      continue;
    }
    for (const method of fact.methods) {
      const key = `${method} ${sdkRouteShape(fact.path)}`;
      if (!registered.has(key)) {
        drift.push({
          code: "unregistered_route_present",
          method,
          path: fact.path,
          detail:
            `the router serves ${method} ${fact.path} inside a contract-governed ` +
            `namespace but no operation registers it — an unregistered route is ` +
            `reported, never silently ignored`,
        });
      }
    }
  }

  return drift;
}

/* ------------------------------------------------------------------ */
/* The shipped contract (frozen registry data)                          */
/* ------------------------------------------------------------------ */

/** The current public API version (see the version registry below). */
export const SDK_API_VERSION = "1";

const REALITY_ENGINE_POLICY_CODES: readonly string[] = [
  "invalid_change",
  "invalid_node",
  "invalid_relationship",
  "invalid_observation",
  "invalid_kind",
  "invalid_epistemic_status",
  "invalid_id",
  "invalid_timestamp",
  "invalid_evidence_id",
  "invalid_provenance",
  "missing_provenance",
  "invalid_property",
  "numeric_property_without_unit",
  "dangling_reference",
  "epistemic_downgrade",
  "observation_property_not_observed",
  "duplicate_observation",
  "delete_unknown_node",
  "delete_unknown_relationship",
  "empty_graph",
];

const CAPTURE_SYNC_REJECTION_CODES: readonly string[] = [
  "CONTENT_ID_MISMATCH",
  "CONTENT_COLLISION",
  "MANIFEST_MISMATCH",
  "CONTRACT_VERSION_UNSUPPORTED",
  "SEQUENCE_GAP",
  "IDEMPOTENCY_CONFLICT",
  "SESSION_CONFLICT",
];

const PROJECTION_LIBRARY_CODES: readonly string[] = [
  "invalid_input",
  "unknown_storey",
  "unknown_building",
];

/**
 * THE registry: the six work-order domains' stable public surface, as the
 * existing route authorities implement it. Route paths, methods, error
 * codes and duplicate semantics are transcribed from the owning routers
 * and models (read-only reference); checkRouteDrift + contract.test.ts
 * keep this honest against the live router.
 */
const SDK_CONTRACT_INPUT: SdkContractInput = {
  domains: [
    {
      id: "capture",
      title: "Capture ingestion",
      authority: "backend/api/src/capture (AISE-004 gateway + router)",
      namespace: "/v1/capture",
      notes: [
        "Sync batches and assets are preserved verbatim; nothing here judges engineering truth.",
      ],
      operations: [
        {
          id: "capture.sync.upload",
          transport: "http",
          method: "POST",
          path: "/v1/capture/sync",
          summary:
            "Ingest one offline SyncBatch (idempotency-keyed); the reply is a SyncAck " +
            "(ACCEPTED | DUPLICATE | REJECTED with a stable reason code).",
          scope: "capture:write",
          idempotencyClass: "duplicate-acknowledged",
          errorCodes: [
            ...CAPTURE_SYNC_REJECTION_CODES,
            "malformed_json",
            "schema_invalid",
            "version_unsupported",
          ],
        },
        {
          id: "capture.assets.upload",
          transport: "http",
          method: "POST",
          path: "/v1/capture/assets/:contentId",
          summary:
            "Upload ONE raw content-addressed asset; the server verifies the sha-256 " +
            "content id over the bytes.",
          scope: "capture:write",
          idempotencyClass: "content-addressed",
          errorCodes: [
            "invalid_content_id",
            "invalid_media_type",
            "CONTENT_ID_MISMATCH",
            "CONTENT_COLLISION",
          ],
        },
        {
          id: "capture.sessions.get",
          transport: "http",
          method: "GET",
          path: "/v1/capture/sessions/:sessionId",
          summary:
            "Read the stored session projection (verbatim envelope, assets, append-only " +
            "batch history, sync state).",
          scope: "capture:read",
          idempotencyClass: "read",
          errorCodes: ["invalid_session_id", "session_not_found"],
        },
      ],
    },
    {
      id: "reality",
      title: "Reality Graph",
      authority:
        "backend/api/src/reality (AISE-016 versioning engine + router) — the ONLY canonical engineering-model authority",
      namespace: "/v1/reality",
      notes: [
        "Append-only versioned graphs; prior versions are never rewritten.",
      ],
      operations: [
        {
          id: "reality.projects.create",
          transport: "http",
          method: "POST",
          path: "/v1/reality/projects",
          summary:
            "Create a project graph (empty v1). The projectId is CALLER-SUPPLIED and " +
            "stable; a replayed create is refused as a duplicate.",
          scope: "reality:write",
          idempotencyClass: "caller-stable-id",
          idField: "projectId",
          errorCodes: [
            "malformed_json",
            "invalid_body",
            "invalid_project_id",
            "project_exists",
          ],
        },
        {
          id: "reality.projects.get",
          transport: "http",
          method: "GET",
          path: "/v1/reality/projects/:projectId",
          summary: "Read the project header plus the ordered version list.",
          scope: "reality:read",
          idempotencyClass: "read",
          errorCodes: ["invalid_project_id", "project_not_found"],
        },
        {
          id: "reality.projects.changes.apply",
          transport: "http",
          method: "POST",
          path: "/v1/reality/projects/:projectId/changes",
          summary:
            "Apply ONE change set through the deterministic versioning engine, " +
            "materializing the next immutable version. NOT replay-safe: each accepted " +
            "call appends a new version.",
          scope: "reality:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_body",
            "invalid_project_id",
            "project_not_found",
            ...REALITY_ENGINE_POLICY_CODES,
          ],
        },
        {
          id: "reality.projects.versions.get",
          transport: "http",
          method: "GET",
          path: "/v1/reality/projects/:projectId/versions/:versionId",
          summary:
            "Read the FULL materialized version snapshot (nodes, relationships, " +
            "observations, tombstones, exact changeLog); ':versionId' may be 'latest'.",
          scope: "reality:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_project_id",
            "invalid_version_id",
            "project_not_found",
            "version_not_found",
          ],
        },
        {
          id: "reality.projects.nodes.get",
          transport: "http",
          method: "GET",
          path: "/v1/reality/projects/:projectId/nodes/:nodeId",
          summary:
            "Read one node's latest state plus its full per-version history " +
            "(tombstones visible).",
          scope: "reality:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_project_id",
            "invalid_id",
            "project_not_found",
            "node_not_found",
          ],
        },
      ],
    },
    {
      id: "boq",
      title: "BOQ ingestion, normalization and mapping",
      authority:
        "backend/api/src/boq (AISE-011 ingestion + AISE-014 normalization + AISE-017 mapping routers)",
      namespace: "/v1/boq",
      notes: [
        "Source bytes are preserved unconditionally; derived views never touch the source.",
      ],
      operations: [
        {
          id: "boq.imports.upload",
          transport: "http",
          method: "POST",
          path: "/v1/boq/imports",
          summary:
            "Upload ONE BOQ source (raw body; format from Content-Type or the " +
            "?format= override). Identical bytes map to the same content-derived importId.",
          scope: "boq:write",
          idempotencyClass: "content-addressed",
          errorCodes: [
            "invalid_format",
            "unsupported_media_type",
            "boq_parse_failed",
            "boq_store_error",
          ],
        },
        {
          id: "boq.imports.list",
          transport: "http",
          method: "GET",
          path: "/v1/boq/imports",
          summary: "List all imports ordered by importId.",
          scope: "boq:read",
          idempotencyClass: "read",
          errorCodes: [],
        },
        {
          id: "boq.imports.get",
          transport: "http",
          method: "GET",
          path: "/v1/boq/imports/:importId",
          summary: "Read one import plus its parsed document.",
          scope: "boq:read",
          idempotencyClass: "read",
          errorCodes: ["invalid_import_id", "import_not_found"],
        },
        {
          id: "boq.imports.source.get",
          transport: "http",
          method: "GET",
          path: "/v1/boq/imports/:importId/source",
          summary:
            "Read the RAW preserved source bytes with the ORIGINAL media type (the " +
            "source of any derived claim is retrievable).",
          scope: "boq:read",
          idempotencyClass: "read",
          errorCodes: ["invalid_import_id", "import_not_found"],
        },
        {
          id: "boq.imports.normalization.run",
          transport: "http",
          method: "POST",
          path: "/v1/boq/imports/:importId/normalization",
          summary:
            "Run the DERIVED normalization (idempotent, write-once) and return the " +
            "explicit-interpretation view. The source BOQ is never changed.",
          scope: "boq:write",
          idempotencyClass: "derived-write-once",
          errorCodes: [
            "invalid_import_id",
            "import_not_found",
            "normalization_unavailable",
            "boq_store_error",
          ],
        },
        {
          id: "boq.imports.normalization.get",
          transport: "http",
          method: "GET",
          path: "/v1/boq/imports/:importId/normalization",
          summary: "Read the STORED derived normalization view.",
          scope: "boq:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_import_id",
            "import_not_found",
            "normalization_not_found",
          ],
        },
        {
          id: "boq.imports.mappings.run",
          transport: "http",
          method: "POST",
          path: "/v1/boq/imports/:importId/mappings",
          summary:
            "Run the DERIVED deterministic BOQ-to-reality matcher over the STORED " +
            "normalized view and a caller-supplied reality graph snapshot, persisting " +
            "the next append-only mapping version. NOT replay-safe.",
          scope: "boq:write",
          idempotencyClass: "append",
          errorCodes: [
            "invalid_import_id",
            "import_not_found",
            "malformed_json",
            "invalid_graph_snapshot",
            "normalization_required",
            "mapping_not_found",
            "boq_store_error",
          ],
        },
        {
          id: "boq.imports.mappings.latest",
          transport: "http",
          method: "GET",
          path: "/v1/boq/imports/:importId/mappings",
          summary: "Read the LATEST stored mapping version plus stats.",
          scope: "boq:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_import_id",
            "import_not_found",
            "mapping_not_found",
          ],
        },
        {
          id: "boq.imports.mappings.manual",
          transport: "http",
          method: "POST",
          path: "/v1/boq/imports/:importId/mappings/manual",
          summary:
            "Apply ONE manual mapping decision onto the latest version, producing a " +
            "NEW append-only version (earlier versions' bytes stay). NOT replay-safe.",
          scope: "boq:write",
          idempotencyClass: "append",
          errorCodes: [
            "invalid_import_id",
            "import_not_found",
            "malformed_json",
            "invalid_manual_input",
            "entry_not_found",
            "mapping_not_found",
            "boq_store_error",
          ],
        },
        {
          id: "boq.imports.mappings.version",
          transport: "http",
          method: "GET",
          path: "/v1/boq/imports/:importId/mappings/:version",
          summary:
            "Read ONE explicit mapping version ('v1' | '1' | 'v001' accepted).",
          scope: "boq:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_import_id",
            "invalid_mapping_version",
            "import_not_found",
            "mapping_version_not_found",
          ],
        },
      ],
    },
    {
      id: "case",
      title: "Engineering Case",
      authority: "backend/api/src/cases (AISE-025 service + router)",
      namespace: "/v1/cases",
      notes: [
        "Facts (observations) and inferences (hypotheses) are epistemically separated; " +
          "a resolved case is immutable.",
      ],
      operations: [
        {
          id: "cases.create",
          transport: "http",
          method: "POST",
          path: "/v1/cases",
          summary:
            "Create an engineering case. The caseId is CALLER-SUPPLIED and stable; a " +
            "replayed create is refused as a duplicate.",
          scope: "case:write",
          idempotencyClass: "caller-stable-id",
          idField: "caseId",
          errorCodes: [
            "malformed_json",
            "invalid_case",
            "invalid_case_id",
            "case_exists",
          ],
        },
        {
          id: "cases.list",
          transport: "http",
          method: "GET",
          path: "/v1/cases",
          summary: "List case summaries.",
          scope: "case:read",
          idempotencyClass: "read",
          errorCodes: [],
        },
        {
          id: "cases.get",
          transport: "http",
          method: "GET",
          path: "/v1/cases/:caseId",
          summary:
            "Read the full case record (observations and hypotheses in SEPARATE arrays).",
          scope: "case:read",
          idempotencyClass: "read",
          errorCodes: ["invalid_case_id", "case_not_found"],
        },
        {
          id: "cases.observations.add",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/observations",
          summary:
            "Add an OBSERVED fact. evidenceIds is REQUIRED non-empty; claiming a " +
            "non-OBSERVED epistemic status is a typed refusal.",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_case_id",
            "case_not_found",
            "invalid_observation",
            "invalid_statement",
            "invalid_evidence_ref",
            "observation_without_evidence",
            "invalid_epistemic_status",
            "already_resolved",
          ],
        },
        {
          id: "cases.hypotheses.add",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/hypotheses",
          summary:
            "Add an interpretation (INFERRED or PROPOSED) with observation references " +
            "and a confidence level.",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_case_id",
            "case_not_found",
            "invalid_hypothesis",
            "invalid_statement",
            "invalid_epistemic_status",
            "invalid_confidence",
            "unknown_observation_ref",
            "already_resolved",
          ],
        },
        {
          id: "cases.missingEvidence.add",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/missing-evidence",
          summary: "Declare an evidence gap (kind, wouldResolve, requestedMethod?).",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_case_id",
            "case_not_found",
            "invalid_missing_evidence",
            "unknown_hypothesis_ref",
            "already_resolved",
          ],
        },
        {
          id: "cases.missingEvidence.collect",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/missing-evidence/:missingId/collect",
          summary:
            "Mark a missing-evidence record collected — does NOT auto-create an " +
            "observation (the human/agent must still record what was observed, with " +
            "evidence).",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "invalid_case_id",
            "invalid_body",
            "case_not_found",
            "missing_evidence_not_found",
            "missing_evidence_not_open",
            "already_resolved",
          ],
        },
        {
          id: "cases.missingEvidence.waive",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/missing-evidence/:missingId/waive",
          summary:
            "Waive a missing-evidence record. A waiver note is REQUIRED — a waiver is " +
            "never silent.",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "invalid_case_id",
            "invalid_body",
            "malformed_json",
            "case_not_found",
            "missing_evidence_not_found",
            "missing_evidence_not_open",
            "waiver_note_required",
            "already_resolved",
          ],
        },
        {
          id: "cases.review.submit",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/review",
          summary:
            "Submit a human review (reviewer, decision, note); the service pins the " +
            "evidence state digest at review time.",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_case_id",
            "case_not_found",
            "invalid_review",
            "already_resolved",
          ],
        },
        {
          id: "cases.resolve",
          transport: "http",
          method: "POST",
          path: "/v1/cases/:caseId/resolve",
          summary:
            "Resolve the case — requires an APPROVED review; resolved cases refuse " +
            "further mutations.",
          scope: "case:write",
          idempotencyClass: "append",
          errorCodes: [
            "invalid_case_id",
            "case_not_found",
            "review_required_for_resolution",
            "review_not_approved",
            "already_resolved",
          ],
        },
      ],
    },
    {
      id: "intervention",
      title: "Intervention Studio",
      authority:
        "backend/api/src/intervention (AISE-026 service + router) — proposed scenario states, never observed reality",
      namespace: "/v1/interventions",
      notes: [
        "Scenario states are materialized deterministically from a PINNED reality " +
          "baseline version; proposals never overwrite observed reality.",
      ],
      operations: [
        {
          id: "interventions.create",
          transport: "http",
          method: "POST",
          path: "/v1/interventions",
          summary:
            "Create a scenario pinned to a reality baseline version. The scenarioId is " +
            "CALLER-SUPPLIED and stable; a replayed create is refused as a duplicate.",
          scope: "intervention:write",
          idempotencyClass: "caller-stable-id",
          idField: "scenarioId",
          errorCodes: [
            "malformed_json",
            "invalid_scenario",
            "invalid_scenario_id",
            "invalid_project_id",
            "invalid_version_id",
            "scenario_exists",
            "baseline_not_found",
          ],
        },
        {
          id: "interventions.list",
          transport: "http",
          method: "GET",
          path: "/v1/interventions",
          summary: "List scenario summaries.",
          scope: "intervention:read",
          idempotencyClass: "read",
          errorCodes: [],
        },
        {
          id: "interventions.get",
          transport: "http",
          method: "GET",
          path: "/v1/interventions/:scenarioId",
          summary: "Read the full scenario record (steps + immutable states).",
          scope: "intervention:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_scenario_id",
            "scenario_not_found",
            "invalid_intervention_record",
          ],
        },
        {
          id: "interventions.steps.add",
          transport: "http",
          method: "POST",
          path: "/v1/interventions/:scenarioId/steps",
          summary:
            "Append one step (kind, target, payload, provenance) and materialize the " +
            "NEXT immutable state layer. NOT replay-safe.",
          scope: "intervention:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_scenario_id",
            "scenario_not_found",
            "invalid_step",
            "invalid_step_payload",
            "invalid_property",
            "numeric_value_without_unit",
            "invalid_epistemic_status",
            "invalid_provenance",
            "invalid_evidence_id",
            "invalid_id",
            "invalid_timestamp",
            "missing_provenance",
            "unknown_node_ref",
            "duplicate_node_ref",
            "baseline_mismatch",
            "step_sequence_gap",
            "duplicate_step_id",
            "scenario_terminal",
            "invalid_intervention_record",
          ],
        },
        {
          id: "interventions.states.get",
          transport: "http",
          method: "GET",
          path: "/v1/interventions/:scenarioId/states/:index",
          summary:
            "Read one materialized state layer; ':index' is a non-negative integer or 'latest'.",
          scope: "intervention:read",
          idempotencyClass: "read",
          errorCodes: [
            "invalid_scenario_id",
            "invalid_state_index",
            "scenario_not_found",
            "state_not_found",
          ],
        },
        {
          id: "interventions.approvalReference.record",
          transport: "http",
          method: "POST",
          path: "/v1/interventions/:scenarioId/approval-reference",
          summary:
            "Record a Case-domain review reference VERBATIM (caseId, reviewDecision, " +
            "reviewedAt) — never interpreted here.",
          scope: "intervention:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_scenario_id",
            "scenario_not_found",
            "invalid_approval_reference",
            "approval_reference_exists",
            "scenario_terminal",
            "invalid_intervention_record",
          ],
        },
        {
          id: "interventions.status.transition",
          transport: "http",
          method: "POST",
          path: "/v1/interventions/:scenarioId/status",
          summary:
            "Request a governed status transition; 'approved' without a recorded " +
            "approval reference is refused.",
          scope: "intervention:write",
          idempotencyClass: "append",
          errorCodes: [
            "malformed_json",
            "invalid_scenario_id",
            "scenario_not_found",
            "invalid_status_transition",
            "approval_reference_required",
            "scenario_terminal",
            "invalid_intervention_record",
          ],
        },
      ],
    },
    {
      id: "projections",
      title: "Rendering projections (2D floor plans / elevations / sections)",
      authority:
        "backend/api/src/projections (AISE-020 deterministic library) — a projection, not an authority",
      namespace: "/v1/projections",
      notes: [
        "The rendering-projections capability is exposed as a deterministic IN-PROCESS " +
          "library (consumed by the web workspace, AISE-021/024/027); it has NO HTTP " +
          "routes today, and this contract registers none.",
        "The /v1/projections namespace is RESERVED-EMPTY: any HTTP route appearing " +
          "there is contract drift and is reported by the drift check.",
        "Every operation is a pure function of a PINNED Reality Graph version " +
          "(never 'latest' implicitly) and carries propagated uncertainty.",
      ],
      operations: [
        {
          id: "projections.floorplan.generate",
          transport: "in-process",
          entryPoint: "projections/floorplan.ts generateFloorPlan",
          summary:
            "Generate the deterministic vector floor plan (storey plan + wall-pair " +
            "dimensions with propagated sigma) for a pinned graph version.",
          scope: "reality:read",
          idempotencyClass: "pure",
          errorCodes: [...PROJECTION_LIBRARY_CODES],
        },
        {
          id: "projections.elevation.generate",
          transport: "in-process",
          entryPoint: "projections/elevation.ts generateElevation",
          summary:
            "Generate the deterministic direction-view elevation for a pinned graph " +
            "version (documented visibility behavior, cut/faint stroke weights).",
          scope: "reality:read",
          idempotencyClass: "pure",
          errorCodes: [...PROJECTION_LIBRARY_CODES],
        },
        {
          id: "projections.section.generate",
          transport: "in-process",
          entryPoint: "projections/section.ts generateSection",
          summary:
            "Generate the deterministic cut-plane section (cut marks vs faint beyond) " +
            "for a pinned graph version.",
          scope: "reality:read",
          idempotencyClass: "pure",
          errorCodes: [...PROJECTION_LIBRARY_CODES],
        },
        {
          id: "projections.lookup.resolveElement",
          transport: "in-process",
          entryPoint: "projections/lookup.ts resolveElement",
          summary:
            "Resolve a picked 2D point to stable graph element ids (R5 bidirectional " +
            "lookup, point to ids).",
          scope: "reality:read",
          idempotencyClass: "pure",
          errorCodes: [...PROJECTION_LIBRARY_CODES],
        },
        {
          id: "projections.lookup.locateNode",
          transport: "in-process",
          entryPoint: "projections/lookup.ts locateNode",
          summary:
            "Locate a stable graph node id in the generated drawings (R5 " +
            "bidirectional lookup, ids to drawings).",
          scope: "reality:read",
          idempotencyClass: "pure",
          errorCodes: [...PROJECTION_LIBRARY_CODES],
        },
        {
          id: "projections.svg.serialize",
          transport: "in-process",
          entryPoint: "projections/svg.ts toSvg",
          summary:
            "Serialize a Drawing2D to byte-deterministic minimal SVG for the workspace.",
          scope: "reality:read",
          idempotencyClass: "pure",
          errorCodes: [...PROJECTION_LIBRARY_CODES],
        },
      ],
    },
  ],
  versions: [
    {
      version: SDK_API_VERSION,
      operations: [
        "capture.sync.upload",
        "capture.assets.upload",
        "capture.sessions.get",
        "reality.projects.create",
        "reality.projects.get",
        "reality.projects.changes.apply",
        "reality.projects.versions.get",
        "reality.projects.nodes.get",
        "boq.imports.upload",
        "boq.imports.list",
        "boq.imports.get",
        "boq.imports.source.get",
        "boq.imports.normalization.run",
        "boq.imports.normalization.get",
        "boq.imports.mappings.run",
        "boq.imports.mappings.latest",
        "boq.imports.mappings.manual",
        "boq.imports.mappings.version",
        "cases.create",
        "cases.list",
        "cases.get",
        "cases.observations.add",
        "cases.hypotheses.add",
        "cases.missingEvidence.add",
        "cases.missingEvidence.collect",
        "cases.missingEvidence.waive",
        "cases.review.submit",
        "cases.resolve",
        "interventions.create",
        "interventions.list",
        "interventions.get",
        "interventions.steps.add",
        "interventions.states.get",
        "interventions.approvalReference.record",
        "interventions.status.transition",
        "projections.floorplan.generate",
        "projections.elevation.generate",
        "projections.section.generate",
        "projections.lookup.resolveElement",
        "projections.lookup.locateNode",
        "projections.svg.serialize",
      ],
    },
  ],
};

/**
 * THE shipped contract — built (and fully validated) at module load. A
 * violation of any discipline above is a construction-time typed refusal,
 * so a broken contract can never reach a request handler.
 */
export const SDK_CONTRACT: SdkContract = buildSdkContract(SDK_CONTRACT_INPUT);
