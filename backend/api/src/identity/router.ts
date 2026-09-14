/**
 * AISE-036 — Enterprise identity/permissions/audit HTTP surface
 * (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §036; R15; the module model header):
 *
 *   POST /v1/identity/principals                    register a principal
 *       Body `{ principalId, displayName }` — bootstrap directory act.
 *   POST /v1/identity/organizations                 create an organization
 *       Body `{ organizationId, name, founder? }` — with
 *       `founder: { principalId, permissions }` the creation act also
 *       grants the founder the bootstrap role `org-founder` (org scope).
 *   POST /v1/identity/authorize                     typed authorization decision
 *       Body `{ principalId, permission, target }` — the decision (allowed
 *       with the least-privilege grant, or a DISTINCT typed refusal) is
 *       200 DATA, not an error; every decision is audit-logged.
 *   GET  /v1/identity/organizations/:id             org record (identity:read)
 *   POST /v1/identity/organizations/:id/projects    create project (identity:write)
 *   GET  /v1/identity/organizations/:id/projects    list org projects (identity:read)
 *   POST /v1/identity/organizations/:id/roles       create role (identity:admin)
 *   GET  /v1/identity/organizations/:id/roles       list org roles (identity:read)
 *   POST /v1/identity/organizations/:id/memberships grant membership
 *       (identity:admin covering the grant's own scope)
 *   GET  /v1/identity/organizations/:id/memberships list org memberships (identity:read)
 *   POST /v1/identity/organizations/:id/memberships/:membershipId/revoke
 *                                                    revoke (identity:admin)
 *   POST /v1/identity/organizations/:id/retention   set retention policy (audit:admin)
 *   GET  /v1/identity/organizations/:id/retention   read policy (audit:read;
 *       `policy: null` = no policy = infinite retention, an honest state)
 *   POST /v1/identity/organizations/:id/retention/enforce
 *                                                    run enforcement (audit:admin)
 *   GET  /v1/identity/organizations/:id/audit       query the audit log
 *       (audit:read; filters `projectId` and `actor`; events annotated
 *       with `retentionExpired` per the current policy)
 *
 * AUTHN BOUNDARY (deliberate, documented): this surface is the policy/
 * permissions AUTHORITY, not an HTTP authentication middleware. The
 * acting principal is supplied EXPLICITLY (`actor` in mutation bodies,
 * `requester` in read queries) and every decision/mutation records it in
 * the audit log. Verifying that the caller actually IS that principal
 * (tokens, mTLS, SSO…) belongs to deployment surfaces wrapping this API.
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the case router discipline; do not duplicate
 * elsewhere):
 *
 *   malformed_json | invalid_*_id (path/body id shape) -> 400
 *   not-found codes  -> 404 (organization_not_found | project_not_found |
 *                          role_not_found | membership_not_found |
 *                          principal_not_found)
 *   everything else  -> 422 (typed validation/semantic codes, including
 *                          every authorization-refusal code — cross_tenant,
 *                          wrong_scope, insufficient_granularity, … — so a
 *                          refusal is a TYPED 422, never a blanket 500)
 *
 * Every response carries the `x-request-id` correlation header; wrong
 * methods get 405 with an explicit `allow`; paths that match no identity
 * route return null so the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  IdentityError,
  parseAuthorizeInput,
  parseCreateOrganizationInput,
  parseCreateProjectInput,
  parseCreateRoleInput,
  parseEnforceRetentionInput,
  parseGrantMembershipInput,
  parseRegisterPrincipalInput,
  parseRevokeMembershipInput,
  parseSetRetentionPolicyInput,
  validateMembershipId,
  validateOrganizationId,
} from "./model";
import type { IdentityService } from "./service";

export interface IdentityRouteOptions {
  /** The identity policy engine over an injected store + clock. */
  readonly service: IdentityService;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  const text = await request.text();
  try {
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** The requester query parameter for guarded reads (authn boundary note). */
function requireRequester(url: URL): string {
  const requester = url.searchParams.get("requester");
  if (requester === null || requester.trim().length === 0) {
    throw new IdentityError(
      "requester_required",
      "guarded reads require a `requester` query parameter naming the requesting principal (request-level authentication is a deployment concern — see the module header)",
    );
  }
  return requester;
}

/** 404 vs 400 vs 422 — the single authoritative status table (header). */
function identityErrorResponse(error: IdentityError, requestId: string): Response {
  // (malformed_json → 400 is handled by the malformedJson helper above.)
  const status =
    error.code === "invalid_organization_id" ||
    error.code === "invalid_project_id" ||
    error.code === "invalid_role_id" ||
    error.code === "invalid_principal_id" ||
    error.code === "invalid_membership_id"
      ? 400
      : error.code === "organization_not_found" ||
          error.code === "project_not_found" ||
          error.code === "role_not_found" ||
          error.code === "membership_not_found" ||
          error.code === "principal_not_found"
        ? 404
        : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

function malformedJson(requestId: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
    requestId,
  );
}

function invalidPathId(requestId: string, code: string, what: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: code, detail: `${what} is not decodable` },
    requestId,
  );
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the identity surface. Returns
 * null when the path is not an identity route (the server then answers
 * 404). Error mapping happens HERE only (see module header).
 */
export async function handleIdentityRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: IdentityRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "identity") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST /v1/identity/principals -------------------------------------- */

    if (segments.length === 3 && segments[2] === "principals") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const principal = await service.registerPrincipal(
        parseRegisterPrincipalInput(body.payload),
      );
      logger.info("identity_principal_registered", {
        requestId,
        principalId: principal.principalId,
      });
      return jsonResponse(200, { ok: true, principal }, requestId);
    }

    /* POST /v1/identity/organizations ----------------------------------- */

    if (segments.length === 3 && segments[2] === "organizations") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const organization = await service.createOrganization(
        parseCreateOrganizationInput(body.payload),
      );
      logger.info("identity_organization_created", {
        requestId,
        organizationId: organization.organizationId,
      });
      return jsonResponse(200, { ok: true, organization }, requestId);
    }

    /* POST /v1/identity/authorize --------------------------------------- */

    if (segments.length === 3 && segments[2] === "authorize") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const input = parseAuthorizeInput(body.payload);
      // The decision (allowed OR refused) is 200 data — a typed refusal is
      // the ANSWER to an authorization question, not a transport error.
      const decision = await service.authorizeAndAudit(
        input.principalId,
        input.permission,
        input.target,
      );
      logger.info("identity_authorization_decision", {
        requestId,
        principalId: input.principalId,
        permission: input.permission,
        allowed: decision.allowed,
      });
      return jsonResponse(200, { ok: true, decision }, requestId);
    }

    /* /v1/identity/organizations/:organizationId/... -------------------- */

    const organizationId = decodeSegment(segments[3] ?? "");
    if (
      segments.length >= 4 &&
      segments[2] === "organizations" &&
      organizationId !== null &&
      organizationId.length > 0
    ) {
      validateOrganizationId(organizationId);

      /* GET /v1/identity/organizations/:id ------------------------------ */

      if (segments.length === 4) {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const organization = await service.getOrganization(
          organizationId,
          requireRequester(url),
        );
        return jsonResponse(200, { ok: true, organization }, requestId);
      }

      const collection = segments[4] ?? "";

      /* POST|GET /v1/identity/organizations/:id/projects ---------------- */

      if (segments.length === 5 && collection === "projects") {
        if (request.method === "POST") {
          const body = await readJsonBody(request);
          if (!body.ok) {
            return malformedJson(requestId);
          }
          const project = await service.createProject(
            parseCreateProjectInput(body.payload, organizationId),
          );
          logger.info("identity_project_created", {
            requestId,
            organizationId,
            projectId: project.projectId,
          });
          return jsonResponse(200, { ok: true, project }, requestId);
        }
        if (request.method === "GET") {
          const projects = await service.listProjects(
            organizationId,
            requireRequester(url),
          );
          return jsonResponse(200, { ok: true, projects }, requestId);
        }
        return methodNotAllowed(requestId, "GET, POST");
      }

      /* POST|GET /v1/identity/organizations/:id/roles ------------------- */

      if (segments.length === 5 && collection === "roles") {
        if (request.method === "POST") {
          const body = await readJsonBody(request);
          if (!body.ok) {
            return malformedJson(requestId);
          }
          const role = await service.createRole(
            parseCreateRoleInput(body.payload, organizationId),
          );
          logger.info("identity_role_created", { requestId, organizationId, roleId: role.roleId });
          return jsonResponse(200, { ok: true, role }, requestId);
        }
        if (request.method === "GET") {
          const roles = await service.listRoles(organizationId, requireRequester(url));
          return jsonResponse(200, { ok: true, roles }, requestId);
        }
        return methodNotAllowed(requestId, "GET, POST");
      }

      /* POST|GET /v1/identity/organizations/:id/memberships ------------- */

      if (segments.length === 5 && collection === "memberships") {
        if (request.method === "POST") {
          const body = await readJsonBody(request);
          if (!body.ok) {
            return malformedJson(requestId);
          }
          const membership = await service.grantMembership(
            parseGrantMembershipInput(body.payload, organizationId),
          );
          logger.info("identity_membership_granted", {
            requestId,
            organizationId,
            membershipId: membership.membershipId,
            principalId: membership.principalId,
          });
          return jsonResponse(200, { ok: true, membership }, requestId);
        }
        if (request.method === "GET") {
          const memberships = await service.listMemberships(
            organizationId,
            requireRequester(url),
          );
          return jsonResponse(200, { ok: true, memberships }, requestId);
        }
        return methodNotAllowed(requestId, "GET, POST");
      }

      /* POST /v1/identity/organizations/:id/memberships/:membershipId/revoke */

      if (segments.length === 7 && collection === "memberships" && segments[6] === "revoke") {
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const membershipId = decodeSegment(segments[5] ?? "");
        if (membershipId === null || membershipId.length === 0) {
          return invalidPathId(requestId, "invalid_membership_id", "membership id");
        }
        validateMembershipId(membershipId);
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const membership = await service.revokeMembership(
          parseRevokeMembershipInput(body.payload, organizationId, membershipId),
        );
        logger.info("identity_membership_revoked", {
          requestId,
          organizationId,
          membershipId,
        });
        return jsonResponse(200, { ok: true, membership }, requestId);
      }

      /* POST|GET /v1/identity/organizations/:id/retention ---------------- */

      if (segments.length === 5 && collection === "retention") {
        if (request.method === "POST") {
          const body = await readJsonBody(request);
          if (!body.ok) {
            return malformedJson(requestId);
          }
          const policy = await service.setRetentionPolicy(
            parseSetRetentionPolicyInput(body.payload, organizationId),
          );
          logger.info("identity_retention_policy_updated", {
            requestId,
            organizationId,
            auditRetentionDays: policy.auditRetentionDays,
            onExpiry: policy.onExpiry,
          });
          return jsonResponse(200, { ok: true, policy }, requestId);
        }
        if (request.method === "GET") {
          const policy = await service.getRetentionPolicy(
            organizationId,
            requireRequester(url),
          );
          // policy: null is the honest no-policy (infinite retention) state.
          return jsonResponse(200, { ok: true, policy }, requestId);
        }
        return methodNotAllowed(requestId, "GET, POST");
      }

      /* POST /v1/identity/organizations/:id/retention/enforce ------------- */

      if (segments.length === 6 && collection === "retention" && segments[5] === "enforce") {
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const report = await service.enforceRetention(
          parseEnforceRetentionInput(body.payload, organizationId),
        );
        logger.info("identity_retention_enforced", {
          requestId,
          organizationId,
          mode: report.mode,
          pruned: report.prunedEventIds.length,
          flagged: report.flaggedEventIds.length,
        });
        return jsonResponse(200, { ok: true, report }, requestId);
      }

      /* GET /v1/identity/organizations/:id/audit -------------------------- */

      if (segments.length === 5 && collection === "audit") {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const requester = requireRequester(url);
        const projectId = url.searchParams.get("projectId") ?? undefined;
        const actor = url.searchParams.get("actor") ?? undefined;
        const events = await service.listAuditEvents({
          organizationId,
          requester,
          ...(projectId !== undefined ? { projectId } : {}),
          ...(actor !== undefined ? { actor } : {}),
        });
        return jsonResponse(200, { ok: true, events }, requestId);
      }
    }

    // A /v1/identity/... path with no matching route shape falls through
    // to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof IdentityError) {
      logger.warn("identity_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return identityErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
