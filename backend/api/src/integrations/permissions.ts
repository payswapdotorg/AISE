/**
 * AISE-037 — Least-privilege permission model for incumbent connectors.
 *
 * Contract (spec/requirements.md R15 "permissions … connector-based
 * integration"; spec/work-orders.md §037 "least privilege"):
 *
 *  - DENY-BY-DEFAULT: every adapter operation requires an explicitly granted
 *    scope. The sync engine pre-checks the required scope and refuses with a
 *    typed SCOPE_DENIED (PERMANENT) BEFORE the adapter runs — the adapter's
 *    call counter proves the pre-check (tested).
 *  - THE SUBSET MODEL: a deployment REQUESTS N scopes from the incumbent
 *    system's authorization handshake and ACTUALLY RECEIVES ≤ N. Only the
 *    received set is usable; anything not granted is denied. Receiving MORE
 *    than was requested (scope escalation) is a typed refusal of the whole
 *    grant — never silently kept, never silently dropped.
 *  - NO AMBIENT AUTHORITY: scopes are explicit arguments (they ride on the
 *    sync context and are journaled verbatim in every ledger entry). There is
 *    no module-level scope state anywhere in this package.
 *  - Scope vocabularies are FROZEN per system class; a scope that is not in
 *    the class's list cannot be granted for that class (typed issue naming
 *    it) — least privilege starts at the vocabulary.
 *  - This module never authenticates anyone: granted scopes are caller
 *    assertions about what a connector handshake returned. Tenant boundaries
 *    remain server-authoritative (the wiring layer's job).
 *
 * The frozen pairing (consistency is tested):
 *
 *   capability           required scope            class ceiling (CLASS_SCOPES)
 *   -------------        -----------------------   ---------------------------
 *   import-entities   →  read:entities            classes that exchange entities
 *   import-documents  →  read:documents           classes that exchange documents
 *   export-derived    →  write:derived-export     every class
 *   query-status      →  query:status             every class
 *
 * and, per class, `CLASS_IMPORT_SCOPE` names the single scope an IMPORT
 * through that class requires (entity classes → read:entities, document
 * classes → read:documents; project-management imports entities — its
 * document exchange would be a separate adapter declaring import-documents).
 */

import type { AdapterCapability, SystemClass, SyncDirection } from "./model";
import { SYSTEM_CLASSES } from "./model";

/* ------------------------------------------------------------------ */
/* Frozen scope vocabulary                                              */
/* ------------------------------------------------------------------ */

/** The complete least-privilege scope vocabulary. */
export const PERMISSION_SCOPES = [
  "read:entities",
  "read:documents",
  "write:derived-export",
  "query:status",
] as const;
Object.freeze(PERMISSION_SCOPES);

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/**
 * The scopes that are even REQUESTABLE per system class (the class ceiling —
 * least privilege starts at the vocabulary: a boq-document connector can
 * never be granted read:entities).
 */
export const CLASS_SCOPES: Readonly<Record<SystemClass, readonly PermissionScope[]>> =
  Object.freeze({
    "bim-ifc": ["read:entities", "write:derived-export", "query:status"],
    "cad-dxf": ["read:entities", "write:derived-export", "query:status"],
    "boq-document": ["read:documents", "write:derived-export", "query:status"],
    "project-management": [
      "read:entities",
      "read:documents",
      "write:derived-export",
      "query:status",
    ],
    "erp-procurement": ["read:entities", "write:derived-export", "query:status"],
    "storage-document": ["read:documents", "write:derived-export", "query:status"],
  });

/**
 * The single scope an IMPORT through each class requires (frozen policy; see
 * module header). Pairing with `CLASS_CAPABILITIES` is asserted in tests.
 */
export const CLASS_IMPORT_SCOPE: Readonly<Record<SystemClass, PermissionScope>> = Object.freeze({
  "bim-ifc": "read:entities",
  "cad-dxf": "read:entities",
  "boq-document": "read:documents",
  "project-management": "read:entities",
  "erp-procurement": "read:entities",
  "storage-document": "read:documents",
});

/** The scope each declared capability requires when exercised. */
export function scopeForCapability(capability: AdapterCapability): PermissionScope {
  switch (capability) {
    case "import-entities":
      return "read:entities";
    case "import-documents":
      return "read:documents";
    case "export-derived":
      return "write:derived-export";
    case "query-status":
      return "query:status";
  }
}

/** The capability that exercises a scope (the inverse pairing). */
export function capabilityForScope(scope: PermissionScope): AdapterCapability {
  switch (scope) {
    case "read:entities":
      return "import-entities";
    case "read:documents":
      return "import-documents";
    case "write:derived-export":
      return "export-derived";
    case "query:status":
      return "query-status";
  }
}

/** The scope a sync direction through a system class requires. */
export function requiredScopeForDirection(
  systemClass: SystemClass,
  direction: SyncDirection,
): PermissionScope {
  return direction === "import" ? CLASS_IMPORT_SCOPE[systemClass] : "write:derived-export";
}

/* ------------------------------------------------------------------ */
/* Granted scopes (the subset model)                                    */
/* ------------------------------------------------------------------ */

/**
 * What the connector ACTUALLY received: a sorted, deduplicated subset of the
 * class's scope vocabulary. Immutable value object — the only scope state a
 * sync ever sees, passed explicitly on the sync context.
 */
export interface GrantedScopes {
  readonly systemClass: SystemClass;
  readonly scopes: readonly PermissionScope[];
}

export type GrantedScopesResult =
  | { readonly ok: true; readonly granted: GrantedScopes }
  | { readonly ok: false; readonly code: "invalid_scope_grant"; readonly issues: string[] };

/**
 * Build a grant under the subset model: `requested` is what the deployment
 * asked the incumbent authorization for; `received` is what the handshake
 * actually returned. Rules (all violations are typed issues, deterministic
 * order): the class must be known; every requested scope must be in the
 * class's vocabulary; every received scope must have been requested (scope
 * escalation is refused, never silently kept); the grant is the RECEIVED set
 * (request N, get ≤N — deny-by-default for anything not granted).
 */
export function createGrantedScopes(
  systemClass: string,
  requested: readonly string[],
  received: readonly string[],
): GrantedScopesResult {
  const issues: string[] = [];
  if (!(SYSTEM_CLASSES as readonly string[]).includes(systemClass)) {
    return {
      ok: false,
      code: "invalid_scope_grant",
      issues: [`unknown system class '${systemClass}'`],
    };
  }
  const typedClass = systemClass as SystemClass;
  const classScopes = CLASS_SCOPES[typedClass];

  const requestedSet = new Set<string>();
  for (const scope of requested) {
    if (!(PERMISSION_SCOPES as readonly string[]).includes(scope)) {
      issues.push(`requested scope '${scope}' is not in the permission scope vocabulary`);
    } else if (!(classScopes as readonly string[]).includes(scope)) {
      issues.push(`requested scope '${scope}' is not applicable to system class '${typedClass}'`);
    }
    requestedSet.add(scope);
  }

  const receivedSet = new Set<string>();
  for (const scope of received) {
    if (!(PERMISSION_SCOPES as readonly string[]).includes(scope)) {
      issues.push(`received scope '${scope}' is not in the permission scope vocabulary`);
    } else if (!(classScopes as readonly string[]).includes(scope)) {
      issues.push(`received scope '${scope}' is not applicable to system class '${typedClass}'`);
    } else if (!requestedSet.has(scope)) {
      issues.push(
        `received scope '${scope}' was not requested (scope escalation is refused, not kept)`,
      );
    }
    receivedSet.add(scope);
  }

  if (issues.length > 0) {
    return { ok: false, code: "invalid_scope_grant", issues };
  }

  const granted = [...receivedSet].sort() as PermissionScope[];
  return {
    ok: true,
    granted: { systemClass: typedClass, scopes: granted },
  };
}

/** Membership test — deny-by-default is simply "not in the granted set". */
export function grantedScopesHas(granted: GrantedScopes, scope: PermissionScope): boolean {
  return granted.scopes.includes(scope);
}

export type ScopeCheck =
  | { readonly ok: true; readonly granted: true }
  | {
      readonly ok: false;
      readonly code: "SCOPE_DENIED";
      readonly requiredScope: PermissionScope;
      readonly grantedScopes: readonly PermissionScope[];
      readonly detail: string;
    };

/**
 * Pre-check ONE required scope against a grant. The refusal is the typed
 * SCOPE_DENIED failure input (PERMANENT — retrying cannot grant a scope);
 * the sync engine converts it into the journaled failure.
 */
export function checkScope(granted: GrantedScopes, required: PermissionScope): ScopeCheck {
  if (granted.scopes.includes(required)) {
    return { ok: true, granted: true };
  }
  return {
    ok: false,
    code: "SCOPE_DENIED",
    requiredScope: required,
    grantedScopes: [...granted.scopes],
    detail:
      `scope '${required}' is required but not granted ` +
      `(granted: [${granted.scopes.join(", ")}] for system class '${granted.systemClass}']; ` +
      "deny-by-default)",
  };
}
