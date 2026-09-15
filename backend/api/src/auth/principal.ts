/**
 * PROD-004 — principal resolution and THE TENANT PREDICATE.
 *
 * NO SECOND AUTHORITY (restated where it matters most): every fact this
 * module resolves comes from the identity library's registry through the
 * narrow `PrincipalDirectory` interface (a structural subset of the
 * identity store). The auth layer authenticates requests and enforces
 * project/tenant scoping; it never re-models organizations, projects,
 * roles or permissions.
 *
 * THE TENANT PREDICATE (the enforcement point at the runtime seam):
 * a typed decision over a request's tenant scope (its route's project /
 * organization id parameter, or the top-level projectId/organizationId of
 * a JSON mutation body), with the documented refusal precedence:
 *
 *   1. malformed scope id      → 400 invalid_project_id / invalid_organization_id
 *   2. anonymous + write       → 401 authentication_required
 *      anonymous + GET + required mode          → 401 authentication_required
 *      anonymous + GET + demo-open, non-demo tenant scope → 401 authentication_required
 *   3. scope not in the tenancy registry       → 403 unregistered_project /
 *      unregistered_organization (fail closed — an unregistered project
 *      belongs to NO tenant, so nobody may address it through the seam)
 *   4. demo-open anonymous GET of a DEMO-tenant scope → allowed (evaluators
 *      see the demo content; writes still require a session by rule 2)
 *   5. principal without an active membership in the scope's tenant →
 *      403 cross_tenant (the R15 refusal; same code as the identity
 *      library's refusal for the same concept)
 *   6. principal with an active membership in the scope's tenant → allowed
 *
 * Determinism: pure async functions of the directory contents and the
 * injected inputs — no clock, no randomness, stable sort orders.
 */

import {
  FOUNDER_ROLE_ID,
  type MembershipRecord,
  type PrincipalRecord,
  type ProjectRecord,
} from "../identity";
import type {
  AuthMode,
} from "./config";
import type {
  AuthErrorCode,
  ResolvedPrincipal,
  TenantDecision,
  TenantScope,
} from "./model";
import { isValidIdShape } from "./model";

/* ------------------------------------------------------------------ */
/* The identity registry seam (a structural subset of the identity store) */
/* ------------------------------------------------------------------ */

/**
 * What the auth layer needs from the identity library's registry. The
 * FsIdentityStore (and the in-memory twin) satisfy this structurally; the
 * narrowness is deliberate — the auth layer cannot grow identity powers it
 * does not declare here.
 */
export interface PrincipalDirectory {
  getPrincipal(principalId: string): Promise<PrincipalRecord | null>;
  getProject(projectId: string): Promise<ProjectRecord | null>;
  getOrganization(organizationId: string): Promise<{ organizationId: string } | null>;
  listMembershipsByPrincipal(principalId: string): Promise<MembershipRecord[]>;
}

/* ------------------------------------------------------------------ */
/* Principal resolution                                                 */
/* ------------------------------------------------------------------ */

/** Why a session's principal could not be resolved. */
export type PrincipalResolutionFailure = "unknown_principal";

export type PrincipalResolution =
  | { readonly ok: true; readonly principal: ResolvedPrincipal }
  | { readonly ok: false; readonly reason: PrincipalResolutionFailure };

/** The display-only role label (founder when the principal holds the bootstrap role, else member). */
function roleLabelOf(memberships: readonly MembershipRecord[]): string {
  const active = memberships.filter((membership) => membership.state === "active");
  return active.some((membership) => membership.roleId === FOUNDER_ROLE_ID)
    ? "Founder"
    : active.length > 0
      ? "Member"
      : "No active role";
}

/**
 * Resolve the principal a session belongs to: the identity directory entry
 * plus the ACTIVE tenant memberships (revoked memberships grant nothing —
 * the identity library's own semantics, consumed verbatim). A session for a
 * principal that no longer exists fails closed (`unknown_principal`).
 */
export async function resolvePrincipal(
  directory: PrincipalDirectory,
  input: { readonly principalId: string; readonly kind: "user" | "demo" },
): Promise<PrincipalResolution> {
  const record = await directory.getPrincipal(input.principalId);
  if (record === null) {
    return { ok: false, reason: "unknown_principal" };
  }
  const memberships = await directory.listMembershipsByPrincipal(input.principalId);
  const organizationIds = [
    ...new Set(
      memberships
        .filter((membership) => membership.state === "active")
        .map((membership) => membership.organizationId),
    ),
  ].sort();
  return {
    ok: true,
    principal: {
      principalId: record.principalId,
      displayName: record.displayName,
      kind: input.kind,
      organizationIds,
      roleLabel: roleLabelOf(memberships),
    },
  };
}

/* ------------------------------------------------------------------ */
/* The tenant predicate                                                 */
/* ------------------------------------------------------------------ */

/** True for GET/HEAD/OPTIONS — the read-like verbs (writes always need a session). */
export function isReadVerb(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function refused(
  code: AuthErrorCode,
  status: 400 | 401 | 403,
  detail: string,
): TenantDecision {
  return { allowed: false, code, status, detail };
}

/**
 * The typed tenant predicate. `principal` is null for anonymous requests;
 * `scope` is null for routes that address no tenant parameter (discovery /
 * list routes) — those get authentication-only enforcement by the caller.
 * `demoOrganizationId` is the fixed demo tenant (demo.ts).
 */
export async function decideTenantAccess(input: {
  readonly directory: PrincipalDirectory;
  readonly principal: ResolvedPrincipal | null;
  readonly scope: TenantScope;
  readonly method: string;
  readonly mode: AuthMode;
  readonly demoOrganizationId: string;
  readonly now: string;
}): Promise<TenantDecision> {
  const { directory, principal, scope, method, mode, demoOrganizationId } = input;

  // 1. Malformed scope id (the identity library's id discipline, mirrored).
  if (scope.kind === "project" && !isValidIdShape(scope.projectId)) {
    return refused(
      "invalid_project_id",
      400,
      "projectId must be 1..256 characters",
    );
  }
  if (scope.kind === "organization" && !isValidIdShape(scope.organizationId)) {
    return refused(
      "invalid_organization_id",
      400,
      "organizationId must be 1..256 characters",
    );
  }

  // 2. Authentication for anonymous callers (writes always; reads unless
  //    demo-open can serve them, decided after the scope resolves below).
  const anonymousReadCandidate =
    principal === null && isReadVerb(method) && mode === "demo-open";

  // 3. Resolve the scope's tenant in the identity registry (fail closed).
  let tenantOrganizationId: string;
  if (scope.kind === "project") {
    const project = await directory.getProject(scope.projectId);
    if (project === null) {
      if (anonymousReadCandidate) {
        return refused(
          "authentication_required",
          401,
          "authentication required: the addressed project is not part of the demo tenant",
        );
      }
      return refused(
        "unregistered_project",
        403,
        `project ${scope.projectId} is not registered in the tenancy registry`,
      );
    }
    tenantOrganizationId = project.organizationId;
  } else {
    // Organization scope: the organization IS the tenant; its existence in
    // the registry is the tenancy fact.
    const organization = await directory.getOrganization(scope.organizationId);
    if (organization === null) {
      if (anonymousReadCandidate) {
        return refused(
          "authentication_required",
          401,
          "authentication required: the addressed organization is not the demo tenant",
        );
      }
      return refused(
        "unregistered_organization",
        403,
        `organization ${scope.organizationId} is not registered in the tenancy registry`,
      );
    }
    tenantOrganizationId = scope.organizationId;
  }

  // Anonymous callers: only demo-open reads INSIDE the demo tenant pass.
  if (principal === null) {
    if (anonymousReadCandidate && tenantOrganizationId === demoOrganizationId) {
      return { allowed: true };
    }
    return refused(
      "authentication_required",
      401,
      mode === "demo-open"
        ? "authentication required: anonymous access covers demo-tenant reads only — start a session (POST /v1/auth/sessions or POST /v1/auth/demo)"
        : "authentication required: start a session (POST /v1/auth/sessions or POST /v1/auth/demo)",
    );
  }

  // 4/5/6. Sessioned callers: an active membership in the scope's tenant.
  if (principal.organizationIds.includes(tenantOrganizationId)) {
    return { allowed: true };
  }
  const scopeText =
    scope.kind === "project"
      ? `project ${scope.projectId} of organization ${tenantOrganizationId}`
      : `organization ${tenantOrganizationId}`;
  return refused(
    "cross_tenant",
    403,
    `principal ${principal.principalId} is not a member of ${scopeText} — cross-tenant access is refused`,
  );
}
