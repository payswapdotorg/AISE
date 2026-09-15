/**
 * Artifact access predicate port — PROD-006.
 *
 * THE PORT (and nothing more): the single seam through which every
 * /v1/artifacts list/get/delete/upload is authorized. It is deliberately
 * auth-agnostic — PROD-004 owns `backend/api/src/auth/**` on a parallel
 * branch and AGENTS.md forbids depending on unfinished branches, so this
 * module DEFINES the port and PROD-010 wires the real predicate to the
 * authenticated principal/tenant context later. Until then:
 *
 *  - the DEFAULT predicate (`allowAllArtifactAccess`) permits everything —
 *    the same open local-dev posture as every other pre-auth /v1 surface
 *    in this repository (capture, evidence, BOQ, ... all answer without a
 *    principal today). It is a DEVELOPMENT DEFAULT, never a claim that
 *    artifacts are access-controlled in a public deployment.
 *  - the MATRIX TESTS inject strict test predicates proving the port
 *    enforces: own-project → allow, cross-project → 403 `forbidden`,
 *    anonymous → 401 `unauthorized` (when the predicate requires auth).
 *
 * The router resolves the acting subject from the request context IF
 * PRESENT (injected `accessContextFromRequest`; anonymous by default),
 * then asks the predicate BEFORE any byte or metadata read is served for
 * another scope. The predicate is the ONLY access authority on this
 * surface — the service and stores never re-implement it.
 */

/** The actions the predicate is asked about (one per route class). */
export type ArtifactAction = "upload" | "list" | "read" | "delete";

/**
 * The acting subject, extracted from the request context by the injected
 * reader. `kind: "principal"` carries the principal and tenant ids PROD-010
 * will derive from the authenticated request; `kind: "anonymous"` is the
 * honest "no principal present" state (never a fabricated one).
 */
export interface ArtifactAccessContext {
  readonly kind: "anonymous" | "principal";
  readonly principalId: string | null;
  readonly tenantId: string | null;
}

/** The anonymous context (the default when no reader is injected). */
export const ANONYMOUS_ARTIFACT_CONTEXT: ArtifactAccessContext = {
  kind: "anonymous",
  principalId: null,
  tenantId: null,
} as const;

/**
 * A predicate decision. Denials carry a stable reason:
 *  - `anonymous_required` → the router answers 401 `unauthorized`;
 *  - `forbidden`          → the router answers 403 `forbidden`.
 */
export type ArtifactAccessDecision =
  | { readonly outcome: "allow" }
  | { readonly outcome: "deny"; readonly reason: "anonymous_required" | "forbidden" };

/**
 * The port. Pure decision function: (subject, action, project scope) →
 * allow/deny. Implementations MUST be deterministic for identical inputs
 * (no clock, no randomness, no network).
 */
export type ArtifactAccessPredicate = (
  context: ArtifactAccessContext,
  action: ArtifactAction,
  projectId: string,
) => Promise<ArtifactAccessDecision>;

/**
 * The development default: permit every action (see the module header for
 * why this is honest — the port is the enforcement seam, the default is a
 * local-dev posture, and PROD-010 replaces it with the real predicate).
 */
export const allowAllArtifactAccess: ArtifactAccessPredicate = async () => ({
  outcome: "allow",
});

/**
 * A strict reference predicate for tests and as the PROD-010 wiring sketch:
 * requires an authenticated principal whose tenant owns the project. This
 * is a LIBRARY helper, never wired by default.
 */
export function principalTenantPredicate(projectTenant: {
  readonly resolveTenant: (projectId: string) => string | null;
}): ArtifactAccessPredicate {
  return async (context, _action, projectId) => {
    if (context.kind === "anonymous") {
      return { outcome: "deny", reason: "anonymous_required" };
    }
    const tenant = projectTenant.resolveTenant(projectId);
    if (tenant === null || tenant !== context.tenantId) {
      return { outcome: "deny", reason: "forbidden" };
    }
    return { outcome: "allow" };
  };
}
