/**
 * AISE-038 — Developer API/SDK: the DISCOVERY DOCUMENT builder.
 *
 * The discovery document is the honest, machine-readable entry point to
 * the AISE public API surface (served at GET /v1/sdk):
 *
 *  - it states the API version (and the full version-registry history);
 *  - it lists the SIX work-order domains' stable operations with, for
 *    each: the required permission scope (verbatim from the AISE-036
 *    identity registry), the idempotency class (with the discipline
 *    statement), the stable error codes, the HTTP route (method + path
 *    template) or the in-process entry point, and the caller-stable id
 *    field where the id-stability convention applies;
 *  - it discloses, EXPLICITLY, the /v1 namespaces that exist in the
 *    server but are OUTSIDE this contract's scope (other work items'
 *    surfaces) — an honest boundary, not a silent omission;
 *  - it documents the /v1/sdk surface itself (where this document and
 *    the machine-readable contract are served).
 *
 * DETERMINISM: the document is a PURE function of the contract — no
 * timestamps, no randomness, no environment, no service version. Two
 * builds over the same contract produce BYTE-IDENTICAL documents (the
 * projection to canonical JSON is sorted-key, via
 * @aise/shared-contracts canonicalJsonStringify — the same canonical
 * serialization discipline the wire codecs use).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS,
  type SdkContract,
  type SdkDomainContract,
  type SdkOperation,
} from "./model";

/** How this contract surfaces itself over HTTP (see sdk/router.ts). */
export const SDK_SURFACE_ROUTES: readonly { method: "GET"; path: string; purpose: string }[] = [
  Object.freeze({
    method: "GET" as const,
    path: "/v1/sdk",
    purpose: "this discovery document",
  }),
  Object.freeze({
    method: "GET" as const,
    path: "/v1/sdk/contract",
    purpose: "the full machine-readable contract (operation + version registries)",
  }),
];

/**
 * /v1 namespaces that exist in the server but are NOT claimed by this
 * contract — each belongs to another work item's surface. Listed for
 * honesty: the SDK describes the six work-order domains and pretends
 * nothing else away.
 */
export const SDK_OUT_OF_SCOPE_NAMESPACES: readonly {
  namespace: string;
  owner: string;
}[] = Object.freeze([
  Object.freeze({ namespace: "/v1/missions", owner: "AISE-007 mission planning" }),
  Object.freeze({ namespace: "/v1/evidence", owner: "AISE-008 evidence/source service" }),
  Object.freeze({
    namespace: "/v1/reconstruction",
    owner: "AISE-010/012 reconstruction orchestration + engine adapters",
  }),
  Object.freeze({ namespace: "/v1/identity", owner: "AISE-036 enterprise identity" }),
  Object.freeze({
    namespace: "/v1/comparisons",
    owner: "AISE-032 reality-vs-design comparison",
  }),
  Object.freeze({ namespace: "/v1/executions", owner: "AISE-031 execution/outcome loop" }),
  Object.freeze({ namespace: "/v1/impacts", owner: "AISE-028 intervention impacts" }),
  Object.freeze({ namespace: "/v1/sdk", owner: "AISE-038 this contract surface" }),
]);

interface SdkOperationDocument {
  readonly id: string;
  readonly transport: "http" | "in-process";
  readonly method?: string;
  readonly path?: string;
  readonly entryPoint?: string;
  readonly scope: string;
  readonly idempotencyClass: string;
  readonly errorCodes: readonly string[];
  readonly stableIdField?: string;
  readonly summary: string;
}

interface SdkDomainDocument {
  readonly id: string;
  readonly title: string;
  readonly authority: string;
  readonly namespace: string;
  readonly notes: readonly string[];
  readonly operations: readonly SdkOperationDocument[];
}

export interface SdkDiscoveryDocument {
  /** The stated public API version (also stamped on every response). */
  readonly apiVersion: string;
  readonly versionRegistry: {
    readonly current: string;
    readonly versions: readonly {
      version: string;
      operationCount: number;
    }[];
  };
  /** The contract's compatibility statement. */
  readonly compatibility: {
    readonly additionsAllowed: boolean;
    readonly removalsAndRenames: string;
  };
  /** AISE-native semantics only; no provider-specific fields. */
  readonly providerNeutral: boolean;
  readonly idempotencyClasses: readonly {
    readonly id: string;
    readonly discipline: string;
  }[];
  readonly scopeRegistry: {
    readonly source: string;
    readonly format: string;
  };
  readonly domains: readonly SdkDomainDocument[];
  readonly outOfScopeNamespaces: readonly {
    readonly namespace: string;
    readonly owner: string;
  }[];
  readonly sdkSurface: readonly {
    readonly method: string;
    readonly path: string;
    readonly purpose: string;
  }[];
}

function operationDocument(operation: SdkOperation): SdkOperationDocument {
  const base: SdkOperationDocument = {
    id: operation.id,
    transport: operation.transport,
    scope: operation.scope,
    idempotencyClass: operation.idempotencyClass,
    errorCodes: operation.errorCodes,
    summary: operation.summary,
  };
  if (operation.transport === "http") {
    return {
      ...base,
      method: operation.method,
      path: operation.path,
      ...(operation.idField === undefined ? {} : { stableIdField: operation.idField }),
    };
  }
  return { ...base, entryPoint: operation.entryPoint };
}

function domainDocument(domain: SdkDomainContract): SdkDomainDocument {
  return {
    id: domain.id,
    title: domain.title,
    authority: domain.authority,
    namespace: domain.namespace,
    notes: domain.notes,
    operations: domain.operations.map(operationDocument),
  };
}

/**
 * Build the discovery document from a contract — PURE and deterministic
 * (no clock, no randomness, no environment): the same contract always
 * produces the same document.
 */
export function buildSdkDiscoveryDocument(contract: SdkContract): SdkDiscoveryDocument {
  return {
    apiVersion: contract.versionRegistry.currentVersion,
    versionRegistry: {
      current: contract.versionRegistry.currentVersion,
      versions: contract.versionRegistry.versions.map((version) => ({
        version,
        operationCount: contract.versionRegistry.operationIdsAt(version).length,
      })),
    },
    compatibility: {
      additionsAllowed: true,
      removalsAndRenames:
        "breaking — REFUSED by the version registry builder (a typed error names " +
        "the conflicted operation); the contract only ever grows within a version " +
        "line",
    },
    providerNeutral: true,
    idempotencyClasses: Object.entries(SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS).map(
      ([id, discipline]) => ({ id, discipline }),
    ),
    scopeRegistry: {
      source:
        "backend/api/src/identity/model.ts PERMISSIONS (AISE-036 frozen registry; " +
        "pinned verbatim by contract tests)",
      format: "surface:granularity (read < write < admin, per domain surface)",
    },
    domains: contract.domains.map(domainDocument),
    outOfScopeNamespaces: SDK_OUT_OF_SCOPE_NAMESPACES,
    sdkSurface: SDK_SURFACE_ROUTES,
  };
}

/**
 * Canonical JSON projection of a discovery document (sorted keys, 2-space
 * indent, trailing newline) — the BYTE-IDENTICAL deterministic form used
 * for equality checks and stability tests.
 */
export function renderSdkDiscoveryDocument(document: SdkDiscoveryDocument): string {
  return canonicalJsonStringify(document);
}
