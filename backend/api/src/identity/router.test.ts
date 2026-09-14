/**
 * AISE-036 — Enterprise identity HTTP surface tests (through the FULL
 * server handler, exercising the one AISE-036 routing delegation block).
 *
 * Depth mandated by the CRITICAL work order: every endpoint's happy path
 * and error path; the typed governed-path matrix over HTTP (every refusal
 * code class at its documented status — actor-side, target-side and
 * lifecycle refusals, all DISTINCT, never a blanket error); the SINGLE
 * status table (404 not-found; 400 malformed_json + invalid ids; 422
 * typed validation/semantic codes including every authorization-refusal
 * code); 405 with explicit allow; unknown subpaths falling through to the
 * server 404; and the LAZY DEFAULT WIRING (identity NOT injected: the
 * default IdentityService constructs over the handler's own env data dir
 * on the FIRST /v1/identity request and serves later requests memoized).
 *
 * The fixture world is assembled OVER HTTP (the same calls as the
 * testkit's buildFixtureWorld, over the same fixed clock), so the wire
 * surface — not just the service — is pinned end to end.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import pkg from "../../package.json" with { type: "json" };
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { sha256Hex } from "../lib/hash";
import { IdentityService } from "./service";
import { FsIdentityStore } from "./store";
import {
  FIXED_MONTHS_LATER,
  FIXED_NOW,
  ORG_NORTH,
  ORG_SOUTH,
  PRINCIPAL_CONTRACTOR,
  PRINCIPAL_ENGINEER_SOUTH,
  PRINCIPAL_FOUNDER_NORTH,
  PRINCIPAL_UNINVITED,
  PROJECT_ALPHA,
  PROJECT_BETA,
  ROLE_PROJECT_ENGINEER,
  ROLE_READER,
  ROLE_SURVEYOR,
  SURVEYOR_PERMISSIONS,
  fixedClock,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

const FOUNDER_NORTH_PERMISSIONS = [
  "identity:admin",
  "identity:write",
  "identity:read",
  "audit:admin",
  "audit:read",
];
const FOUNDER_SOUTH_PERMISSIONS = ["identity:admin", "identity:write", "identity:read"];

/** Handler with the AISE-036 routing block backed by an injected FS store + clock. */
function handlerWith(
  root: string,
  clock: () => string = fixedClock,
): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    identity: {
      service: new IdentityService({ store: new FsIdentityStore(join(root, "data")), clock }),
      logger: quietLogger,
    },
  });
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

/** A request with an arbitrary method (405 / fall-through probes). */
function requestWithMethod(method: string, path: string): Request {
  return new Request(`http://localhost${path}`, { method });
}

interface ErrorBody {
  readonly ok: boolean;
  readonly error: string;
  readonly detail?: string;
}

/** Fail loudly on a broken setup call, then hand the response through. */
async function expectOk(pending: Promise<Response>): Promise<Response> {
  const response = await pending;
  expect(response.status).toBe(200);
  return response;
}

/** The fixture world assembled OVER HTTP (mirrors testkit.buildFixtureWorld). */
async function httpWorld(handler: (request: Request) => Promise<Response>): Promise<void> {
  for (const principal of [
    { principalId: PRINCIPAL_FOUNDER_NORTH, displayName: "Founder North" },
    { principalId: PRINCIPAL_ENGINEER_SOUTH, displayName: "Engineer South" },
    { principalId: PRINCIPAL_CONTRACTOR, displayName: "Contractor" },
    { principalId: PRINCIPAL_UNINVITED, displayName: "Uninvited" },
  ] as const) {
    await expectOk(handler(postJson("/v1/identity/principals", JSON.stringify(principal))));
  }
  await expectOk(
    handler(
      postJson(
        "/v1/identity/organizations",
        JSON.stringify({
          organizationId: ORG_NORTH,
          name: "North Construction",
          founder: {
            principalId: PRINCIPAL_FOUNDER_NORTH,
            permissions: FOUNDER_NORTH_PERMISSIONS,
          },
        }),
      ),
    ),
  );
  await expectOk(
    handler(
      postJson(
        "/v1/identity/organizations",
        JSON.stringify({
          organizationId: ORG_SOUTH,
          name: "South Engineering",
          founder: {
            principalId: PRINCIPAL_ENGINEER_SOUTH,
            permissions: FOUNDER_SOUTH_PERMISSIONS,
          },
        }),
      ),
    ),
  );
  for (const project of [
    { projectId: PROJECT_ALPHA, name: "Alpha retrofit" },
    { projectId: PROJECT_BETA, name: "Beta extension" },
  ] as const) {
    await expectOk(
      handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/projects`,
          JSON.stringify({ ...project, actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      ),
    );
  }
  for (const role of [
    { roleId: ROLE_SURVEYOR, name: "Surveyor", permissions: [...SURVEYOR_PERMISSIONS] },
    { roleId: ROLE_READER, name: "Reality reader", permissions: ["reality:read"] },
    { roleId: ROLE_PROJECT_ENGINEER, name: "Project engineer", permissions: ["reality:write"] },
  ] as const) {
    await expectOk(
      handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({ ...role, actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      ),
    );
  }
  await expectOk(
    handler(
      postJson(
        `/v1/identity/organizations/${ORG_NORTH}/memberships`,
        JSON.stringify({
          principalId: PRINCIPAL_CONTRACTOR,
          roleId: ROLE_SURVEYOR,
          scope: { kind: "project", projectId: PROJECT_ALPHA },
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      ),
    ),
  );
}

/** A handler over a temp dir with the fixture world already assembled. */
async function prepared(root: string): Promise<(request: Request) => Promise<Response>> {
  const handler = handlerWith(root);
  await httpWorld(handler);
  return handler;
}

describe("identity HTTP surface: bootstrap directory acts", () => {
  test("POST /v1/identity/principals registers; x-request-id echoes; canonical file at the hashed path", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "principal-http-1", displayName: "HTTP One" }),
          { "x-request-id": "corr-identity-1" },
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-identity-1");
      const body = (await response.json()) as {
        ok: boolean;
        principal: { principalId: string; displayName: string; createdAt: string };
      };
      expect(body.ok).toBe(true);
      expect(body.principal.principalId).toBe("principal-http-1");
      expect(body.principal.displayName).toBe("HTTP One");
      expect(body.principal.createdAt).toBe(FIXED_NOW);
      const path = join(
        root,
        "data",
        "identity",
        "principals",
        `${sha256Hex("principal-http-1")}.json`,
      );
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(
        canonicalJsonStringify({
          principalId: "principal-http-1",
          displayName: "HTTP One",
          createdAt: FIXED_NOW,
        }),
      );
    });
  });

  test("principal rejections: duplicate 422 principal_exists; shape 422 invalid_principal; oversize id 400; malformed 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "principal-http-1", displayName: "HTTP One" }),
        ),
      );
      const duplicate = await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "principal-http-1", displayName: "Again" }),
        ),
      );
      expect(duplicate.status).toBe(422);
      expect(((await duplicate.json()) as ErrorBody).error).toBe("principal_exists");
      const badShape = await handler(
        postJson("/v1/identity/principals", JSON.stringify({ principalId: "x" })),
      );
      expect(badShape.status).toBe(422);
      expect(((await badShape.json()) as ErrorBody).error).toBe("invalid_principal");
      const oversize = await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "x".repeat(257), displayName: "Oversize" }),
        ),
      );
      expect(oversize.status).toBe(400);
      expect(((await oversize.json()) as ErrorBody).error).toBe("invalid_principal_id");
      const malformed = await handler(postJson("/v1/identity/principals", "{nope"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });

  test("POST /v1/identity/organizations with founder: ONE audited act creates org + role + membership", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "principal-founder-http", displayName: "Founder HTTP" }),
        ),
      );
      const response = await handler(
        postJson(
          "/v1/identity/organizations",
          JSON.stringify({
            organizationId: "org-http",
            name: "HTTP Org",
            founder: {
              principalId: "principal-founder-http",
              permissions: ["identity:read", "identity:write", "audit:read"],
            },
          }),
          { "x-request-id": "corr-identity-2" },
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-identity-2");
      const body = (await response.json()) as {
        ok: boolean;
        organization: { organizationId: string; name: string };
      };
      expect(body.organization.organizationId).toBe("org-http");
      expect(
        existsSync(join(root, "data", "identity", "organizations", `${sha256Hex("org-http")}.json`)),
      ).toBe(true);
      // the bootstrap founder role lands at its documented hashed path
      expect(
        existsSync(
          join(root, "data", "identity", "roles", `${sha256Hex("org-http:org-founder")}.json`),
        ),
      ).toBe(true);
      // the act is audited as three chained events in the new org's log
      const audit = await handler(
        get("/v1/identity/organizations/org-http/audit?requester=principal-founder-http"),
      );
      expect(audit.status).toBe(200);
      const auditBody = (await audit.json()) as { events: Array<{ action: string }> };
      expect(auditBody.events.map((event) => event.action)).toEqual([
        "organization.created",
        "role.created",
        "membership.granted",
      ]);
    });
  });

  test("organization rejections: duplicate 422 organization_exists; unknown founder 422 unknown_principal; malformed 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(
        postJson(
          "/v1/identity/organizations",
          JSON.stringify({ organizationId: "org-http", name: "HTTP Org" }),
        ),
      );
      const duplicate = await handler(
        postJson("/v1/identity/organizations", JSON.stringify({ organizationId: "org-http", name: "Dup" })),
      );
      expect(duplicate.status).toBe(422);
      expect(((await duplicate.json()) as ErrorBody).error).toBe("organization_exists");
      const ghostFounder = await handler(
        postJson(
          "/v1/identity/organizations",
          JSON.stringify({
            organizationId: "org-http-2",
            name: "Ghost Founder",
            founder: { principalId: "principal-ghost", permissions: ["identity:read"] },
          }),
        ),
      );
      expect(ghostFounder.status).toBe(422);
      expect(((await ghostFounder.json()) as ErrorBody).error).toBe("unknown_principal");
      // a bad founder leaves NO half-created organization behind
      expect(existsSync(join(root, "data", "identity", "organizations", `${sha256Hex("org-http-2")}.json`))).toBe(
        false,
      );
      const malformed = await handler(postJson("/v1/identity/organizations", "{nope"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });
});

describe("identity HTTP surface: authorize — the typed decision endpoint", () => {
  test("an ALLOWED decision is 200 DATA with the least-privilege grant, and it is audit-logged", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(
        postJson(
          "/v1/identity/authorize",
          JSON.stringify({
            principalId: PRINCIPAL_CONTRACTOR,
            permission: "reasoning:read",
            target: { kind: "project", organizationId: ORG_NORTH, projectId: PROJECT_ALPHA },
          }),
          { "x-request-id": "corr-identity-3" },
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-identity-3");
      const body = (await response.json()) as {
        ok: boolean;
        decision: {
          allowed: boolean;
          grant?: { roleId: string; permission: string; scope: { kind: string; projectId?: string } };
        };
      };
      expect(body.ok).toBe(true);
      expect(body.decision.allowed).toBe(true);
      expect(body.decision.grant?.roleId).toBe(ROLE_SURVEYOR);
      expect(body.decision.grant?.permission).toBe("reasoning:read");
      expect(body.decision.grant?.scope).toEqual({ kind: "project", projectId: PROJECT_ALPHA });
      const audit = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      const auditBody = (await audit.json()) as {
        events: Array<{ action: string; outcome: string; actor: string; projectId?: string }>;
      };
      const last = auditBody.events[auditBody.events.length - 1];
      expect(last?.action).toBe("authorization.allowed");
      expect(last?.outcome).toBe("allowed");
      expect(last?.actor).toBe(PRINCIPAL_CONTRACTOR);
      expect(last?.projectId).toBe(PROJECT_ALPHA);
    });
  });

  test("a REFUSED decision is ALSO 200 DATA (a typed refusal is an ANSWER, not a transport error)", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(
        postJson(
          "/v1/identity/authorize",
          JSON.stringify({
            principalId: PRINCIPAL_ENGINEER_SOUTH,
            permission: "reality:read",
            target: { kind: "organization", organizationId: ORG_NORTH },
          }),
        ),
      );
      expect(response.status).toBe(200);
      // generated x-request-id when the caller sends none
      expect(response.headers.get("x-request-id")).toBeTruthy();
      const body = (await response.json()) as {
        ok: boolean;
        decision: { allowed: boolean; refusal?: { code: string; detail: string; principalId: string } };
      };
      expect(body.decision.allowed).toBe(false);
      expect(body.decision.refusal?.code).toBe("cross_tenant");
      expect(body.decision.refusal?.principalId).toBe(PRINCIPAL_ENGINEER_SOUTH);
      expect(body.decision.refusal?.detail).toContain(ORG_SOUTH);
      expect(body.decision.refusal?.detail).toContain(ORG_NORTH);
      // the refusal is audit-logged in the TARGET org as authorization.refused
      const audit = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      const auditBody = (await audit.json()) as {
        events: Array<{ action: string; outcome: string; actor: string }>;
      };
      const last = auditBody.events[auditBody.events.length - 1];
      expect(last?.action).toBe("authorization.refused");
      expect(last?.outcome).toBe("refused");
      expect(last?.actor).toBe(PRINCIPAL_ENGINEER_SOUTH);
    });
  });

  test("authorize input validation: unknown permission 422; bad target 422 invalid_target; malformed 400", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const unknownPermission = await handler(
        postJson(
          "/v1/identity/authorize",
          JSON.stringify({
            principalId: PRINCIPAL_FOUNDER_NORTH,
            permission: "reality:fly",
            target: { kind: "organization", organizationId: ORG_NORTH },
          }),
        ),
      );
      expect(unknownPermission.status).toBe(422);
      expect(((await unknownPermission.json()) as ErrorBody).error).toBe("unknown_permission");
      const badTarget = await handler(
        postJson(
          "/v1/identity/authorize",
          JSON.stringify({
            principalId: PRINCIPAL_FOUNDER_NORTH,
            permission: "reality:read",
            target: { kind: "galaxy" },
          }),
        ),
      );
      expect(badTarget.status).toBe(422);
      expect(((await badTarget.json()) as ErrorBody).error).toBe("invalid_target");
      const malformed = await handler(postJson("/v1/identity/authorize", "{nope"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });
});

describe("identity HTTP surface: guarded reads", () => {
  test("GET org / projects / roles / memberships happy paths (requester with identity:read); requester_required 422", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const org = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}?requester=${PRINCIPAL_FOUNDER_NORTH}`, {
          "x-request-id": "corr-identity-4",
        }),
      );
      expect(org.status).toBe(200);
      expect(org.headers.get("x-request-id")).toBe("corr-identity-4");
      const orgBody = (await org.json()) as {
        ok: boolean;
        organization: { organizationId: string; name: string };
      };
      expect(orgBody.organization.organizationId).toBe(ORG_NORTH);
      expect(orgBody.organization.name).toBe("North Construction");
      const projects = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/projects?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      expect(projects.status).toBe(200);
      const projectsBody = (await projects.json()) as { projects: Array<{ projectId: string }> };
      expect(projectsBody.projects.map((project) => project.projectId)).toEqual([
        PROJECT_ALPHA,
        PROJECT_BETA,
      ]);
      const roles = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/roles?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      expect(roles.status).toBe(200);
      const rolesBody = (await roles.json()) as { roles: Array<{ roleId: string }> };
      expect(rolesBody.roles.map((role) => role.roleId)).toEqual([
        "org-founder",
        ROLE_PROJECT_ENGINEER,
        ROLE_READER,
        ROLE_SURVEYOR,
      ]);
      const memberships = await handler(
        get(
          `/v1/identity/organizations/${ORG_NORTH}/memberships?requester=${PRINCIPAL_FOUNDER_NORTH}`,
        ),
      );
      expect(memberships.status).toBe(200);
      const membershipsBody = (await memberships.json()) as {
        memberships: Array<{ principalId: string; state: string }>;
      };
      expect(membershipsBody.memberships).toHaveLength(2); // founder bootstrap + contractor
      expect(membershipsBody.memberships.every((entry) => entry.state === "active")).toBe(true);
      const noRequester = await handler(get(`/v1/identity/organizations/${ORG_NORTH}`));
      expect(noRequester.status).toBe(422);
      expect(((await noRequester.json()) as ErrorBody).error).toBe("requester_required");
    });
  });
});

describe("identity HTTP surface: the typed governed-path matrix (every refusal at its documented status)", () => {
  test("actor-side refusals are TYPED 422s: unknown_principal, no_membership, cross_tenant, missing_permission, insufficient_granularity", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const createProjectAs = (actor: string, projectId: string): Request =>
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/projects`,
          JSON.stringify({ projectId, name: `Project of ${actor}`, actor }),
        );

      const unknownPrincipal = await handler(createProjectAs("principal-ghost", "project-ghost"));
      expect(unknownPrincipal.status).toBe(422);
      expect(((await unknownPrincipal.json()) as ErrorBody).error).toBe("unknown_principal");

      const noMembership = await handler(createProjectAs(PRINCIPAL_UNINVITED, "project-uninvited"));
      expect(noMembership.status).toBe(422);
      expect(((await noMembership.json()) as ErrorBody).error).toBe("no_membership");

      const crossTenant = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}?requester=${PRINCIPAL_ENGINEER_SOUTH}`),
      );
      expect(crossTenant.status).toBe(422);
      expect(((await crossTenant.json()) as ErrorBody).error).toBe("cross_tenant");

      const missingPermission = await handler(
        createProjectAs(PRINCIPAL_CONTRACTOR, "project-contractor"),
      );
      expect(missingPermission.status).toBe(422);
      expect(((await missingPermission.json()) as ErrorBody).error).toBe("missing_permission");

      // identity:read at a covering ORG scope, identity:write required
      const role = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({
            roleId: "role-identity-reader",
            name: "Identity reader",
            permissions: ["identity:read"],
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(role.status).toBe(200);
      const grant = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: "role-identity-reader",
            scope: { kind: "organization" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(grant.status).toBe(200);
      const insufficient = await handler(
        createProjectAs(PRINCIPAL_UNINVITED, "project-uninvited"),
      );
      expect(insufficient.status).toBe(422);
      expect(((await insufficient.json()) as ErrorBody).error).toBe("insufficient_granularity");
    });
  });

  test("wrong_scope is a TYPED 422: a project-scoped identity:admin cannot mint org-wide members", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const role = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({
            roleId: "role-alpha-admin",
            name: "Alpha admin",
            permissions: ["identity:admin"],
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(role.status).toBe(200);
      const grant = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_CONTRACTOR,
            roleId: "role-alpha-admin",
            scope: { kind: "project", projectId: PROJECT_ALPHA },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(grant.status).toBe(200);
      // the alpha-scoped admin attempts an ORG-wide grant: refused wrong_scope
      const orgWide = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_READER,
            scope: { kind: "organization" },
            actor: PRINCIPAL_CONTRACTOR,
          }),
        ),
      );
      expect(orgWide.status).toBe(422);
      expect(((await orgWide.json()) as ErrorBody).error).toBe("wrong_scope");
      // positive control: the SAME project-scoped admin CAN grant inside their own project
      const withinProject = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_READER,
            scope: { kind: "project", projectId: PROJECT_ALPHA },
            actor: PRINCIPAL_CONTRACTOR,
          }),
        ),
      );
      expect(withinProject.status).toBe(200);
    });
  });

  test("membership_revoked is a TYPED 422, distinct from missing_permission before the revocation", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      // before: an active member WITHOUT identity permissions
      const before = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}?requester=${PRINCIPAL_CONTRACTOR}`),
      );
      expect(before.status).toBe(422);
      expect(((await before.json()) as ErrorBody).error).toBe("missing_permission");
      const memberships = await handler(
        get(
          `/v1/identity/organizations/${ORG_NORTH}/memberships?requester=${PRINCIPAL_FOUNDER_NORTH}`,
        ),
      );
      const membershipsBody = (await memberships.json()) as {
        memberships: Array<{ membershipId: string; principalId: string }>;
      };
      const contractorMembership = membershipsBody.memberships.find(
        (entry) => entry.principalId === PRINCIPAL_CONTRACTOR,
      );
      expect(contractorMembership).toBeDefined();
      if (contractorMembership === undefined) {
        expect.unreachable("contractor membership expected");
      }
      const revoke = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships/${contractorMembership.membershipId}/revoke`,
          JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(revoke.status).toBe(200);
      // after: the SAME request changes its typed refusal code
      const after = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}?requester=${PRINCIPAL_CONTRACTOR}`),
      );
      expect(after.status).toBe(422);
      expect(((await after.json()) as ErrorBody).error).toBe("membership_revoked");
    });
  });

  test("target-side tenancy violation: project_not_in_organization at 422 (grant) and as authorize DATA", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      // a south admin grants a membership scoped to NORTH's project inside org-south
      const grant = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_SOUTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: "org-founder",
            scope: { kind: "project", projectId: PROJECT_ALPHA },
            actor: PRINCIPAL_ENGINEER_SOUTH,
          }),
        ),
      );
      expect(grant.status).toBe(422);
      expect(((await grant.json()) as ErrorBody).error).toBe("project_not_in_organization");
      // the same claim via the authorize endpoint is refused as 200 decision DATA
      const decision = await handler(
        postJson(
          "/v1/identity/authorize",
          JSON.stringify({
            principalId: PRINCIPAL_ENGINEER_SOUTH,
            permission: "reality:read",
            target: { kind: "project", organizationId: ORG_SOUTH, projectId: PROJECT_ALPHA },
          }),
        ),
      );
      expect(decision.status).toBe(200);
      const body = (await decision.json()) as {
        decision: { allowed: boolean; refusal?: { code: string } };
      };
      expect(body.decision.allowed).toBe(false);
      expect(body.decision.refusal?.code).toBe("project_not_in_organization");
    });
  });
});

describe("identity HTTP surface: the single status table", () => {
  test("404 not-found: organization, principal, role, membership, project", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const ghostOrg = await handler(
        get(`/v1/identity/organizations/org-ghost?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      expect(ghostOrg.status).toBe(404);
      expect(((await ghostOrg.json()) as ErrorBody).error).toBe("organization_not_found");
      const ghostPrincipal = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: "principal-ghost",
            roleId: ROLE_READER,
            scope: { kind: "organization" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(ghostPrincipal.status).toBe(404);
      expect(((await ghostPrincipal.json()) as ErrorBody).error).toBe("principal_not_found");
      const ghostRole = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: "role-ghost",
            scope: { kind: "organization" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(ghostRole.status).toBe(404);
      expect(((await ghostRole.json()) as ErrorBody).error).toBe("role_not_found");
      const ghostMembership = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships/mem-ghost/revoke`,
          JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(ghostMembership.status).toBe(404);
      expect(((await ghostMembership.json()) as ErrorBody).error).toBe("membership_not_found");
      const ghostProject = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_READER,
            scope: { kind: "project", projectId: "project-ghost" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(ghostProject.status).toBe(404);
      expect(((await ghostProject.json()) as ErrorBody).error).toBe("project_not_found");
    });
  });

  test("400: malformed_json and invalid ids (path and body shapes)", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const malformed = await handler(postJson("/v1/identity/organizations", "{nope"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
      const malformedSub = await handler(
        postJson(`/v1/identity/organizations/${ORG_NORTH}/roles`, "{nope"),
      );
      expect(malformedSub.status).toBe(400);
      expect(((await malformedSub.json()) as ErrorBody).error).toBe("malformed_json");
      const oversizeOrgId = await handler(
        get(`/v1/identity/organizations/${"x".repeat(257)}?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      expect(oversizeOrgId.status).toBe(400);
      expect(((await oversizeOrgId.json()) as ErrorBody).error).toBe("invalid_organization_id");
      const undecodableMembershipId = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships/%zz/revoke`,
          JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(undecodableMembershipId.status).toBe(400);
      expect(((await undecodableMembershipId.json()) as ErrorBody).error).toBe(
        "invalid_membership_id",
      );
      const oversizeBodyPrincipal = await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "x".repeat(257), displayName: "Oversize" }),
        ),
      );
      expect(oversizeBodyPrincipal.status).toBe(400);
      expect(((await oversizeBodyPrincipal.json()) as ErrorBody).error).toBe(
        "invalid_principal_id",
      );
    });
  });

  test("422 typed semantic codes: duplicates, lifecycle, vocabulary, scope, foreign role, retention", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const duplicateProject = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/projects`,
          JSON.stringify({ projectId: PROJECT_ALPHA, name: "Dup", actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(duplicateProject.status).toBe(422);
      expect(((await duplicateProject.json()) as ErrorBody).error).toBe("project_exists");
      const duplicateRole = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({
            roleId: ROLE_SURVEYOR,
            name: "Dup",
            permissions: ["reality:read"],
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(duplicateRole.status).toBe(422);
      expect(((await duplicateRole.json()) as ErrorBody).error).toBe("role_exists");
      const duplicateMembership = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_CONTRACTOR,
            roleId: ROLE_SURVEYOR,
            scope: { kind: "project", projectId: PROJECT_ALPHA },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(duplicateMembership.status).toBe(422);
      expect(((await duplicateMembership.json()) as ErrorBody).error).toBe("membership_exists");
      const unknownPermission = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({
            roleId: "role-flyer",
            name: "Flyer",
            permissions: ["reality:fly"],
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(unknownPermission.status).toBe(422);
      expect(((await unknownPermission.json()) as ErrorBody).error).toBe("unknown_permission");
      const emptyPermissions = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({
            roleId: "role-empty",
            name: "Empty",
            permissions: [],
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(emptyPermissions.status).toBe(422);
      expect(((await emptyPermissions.json()) as ErrorBody).error).toBe("empty_permission_set");
      const duplicatePermissions = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/roles`,
          JSON.stringify({
            roleId: "role-dup",
            name: "Dup",
            permissions: ["reality:read", "reality:read"],
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(duplicatePermissions.status).toBe(422);
      expect(((await duplicatePermissions.json()) as ErrorBody).error).toBe("duplicate_permission");
      const badScope = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_READER,
            scope: { kind: "galaxy" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(badScope.status).toBe(422);
      expect(((await badScope.json()) as ErrorBody).error).toBe("invalid_scope");
      const foreignRole = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_SOUTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_SURVEYOR,
            scope: { kind: "organization" },
            actor: PRINCIPAL_ENGINEER_SOUTH,
          }),
        ),
      );
      expect(foreignRole.status).toBe(422);
      expect(((await foreignRole.json()) as ErrorBody).error).toBe("role_not_in_organization");
      const badRetention = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/retention`,
          JSON.stringify({ auditRetentionDays: -1, onExpiry: "prune", actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(badRetention.status).toBe(422);
      expect(((await badRetention.json()) as ErrorBody).error).toBe("invalid_retention_policy");
      const enforceWithoutPolicy = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/retention/enforce`,
          JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(enforceWithoutPolicy.status).toBe(422);
      expect(((await enforceWithoutPolicy.json()) as ErrorBody).error).toBe(
        "retention_policy_required",
      );
    });
  });
});

describe("identity HTTP surface: membership lifecycle over HTTP", () => {
  test("grant -> revoke -> re-grant is a NEW record (append-only); double revoke 422 membership_not_active", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const grant = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_READER,
            scope: { kind: "organization" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(grant.status).toBe(200);
      const grantBody = (await grant.json()) as {
        membership: { membershipId: string; state: string; grantedBy: string };
      };
      expect(grantBody.membership.state).toBe("active");
      expect(grantBody.membership.grantedBy).toBe(PRINCIPAL_FOUNDER_NORTH);
      const revokePath = `/v1/identity/organizations/${ORG_NORTH}/memberships/${grantBody.membership.membershipId}/revoke`;
      const revoke = await handler(
        postJson(revokePath, JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH })),
      );
      expect(revoke.status).toBe(200);
      const revokeBody = (await revoke.json()) as {
        membership: { membershipId: string; state: string; revokedBy: string };
      };
      expect(revokeBody.membership.membershipId).toBe(grantBody.membership.membershipId);
      expect(revokeBody.membership.state).toBe("revoked");
      expect(revokeBody.membership.revokedBy).toBe(PRINCIPAL_FOUNDER_NORTH);
      const doubleRevoke = await handler(
        postJson(revokePath, JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH })),
      );
      expect(doubleRevoke.status).toBe(422);
      expect(((await doubleRevoke.json()) as ErrorBody).error).toBe("membership_not_active");
      // the re-grant after revocation is a NEW membership record
      const regrant = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          JSON.stringify({
            principalId: PRINCIPAL_UNINVITED,
            roleId: ROLE_READER,
            scope: { kind: "organization" },
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(regrant.status).toBe(200);
      const regrantBody = (await regrant.json()) as { membership: { membershipId: string } };
      expect(regrantBody.membership.membershipId).not.toBe(grantBody.membership.membershipId);
    });
  });
});

describe("identity HTTP surface: retention and audit over HTTP", () => {
  test("GET retention with no policy is 200 policy:null (infinite retention, the honest default)", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const read = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/retention?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      expect(read.status).toBe(200);
      const body = (await read.json()) as { ok: boolean; policy: unknown };
      expect(body.policy).toBeNull();
    });
  });

  test("set policy requires audit:admin (422 missing_permission otherwise); the update is audited and read back", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const denied = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/retention`,
          JSON.stringify({ auditRetentionDays: 90, onExpiry: "prune", actor: PRINCIPAL_CONTRACTOR }),
        ),
      );
      expect(denied.status).toBe(422);
      expect(((await denied.json()) as ErrorBody).error).toBe("missing_permission");
      const set = await handler(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/retention`,
          JSON.stringify({
            auditRetentionDays: 90,
            onExpiry: "prune",
            actor: PRINCIPAL_FOUNDER_NORTH,
          }),
        ),
      );
      expect(set.status).toBe(200);
      const policy = (await set.json()) as {
        policy: { auditRetentionDays: number; onExpiry: string };
      };
      expect(policy.policy.auditRetentionDays).toBe(90);
      expect(policy.policy.onExpiry).toBe("prune");
      const readBack = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/retention?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      const readBody = (await readBack.json()) as { policy: { auditRetentionDays: number } };
      expect(readBody.policy.auditRetentionDays).toBe(90);
      const audit = await handler(
        get(`/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      const auditBody = (await audit.json()) as { events: Array<{ action: string }> };
      expect(auditBody.events[auditBody.events.length - 1]?.action).toBe("retention.policy_updated");
    });
  });

  test("PRUNE over HTTP (months later, same data dir): the removal is RECORDED verbatim, never silent", async () => {
    await withTempDir(async (root) => {
      await prepared(root); // fixedClock: the 9 fixture events in org-north
      // policy + enforcement happen MONTHS later over the SAME store
      const later = handlerWith(root, () => FIXED_MONTHS_LATER);
      await expectOk(
        later(
          postJson(
            `/v1/identity/organizations/${ORG_NORTH}/retention`,
            JSON.stringify({
              auditRetentionDays: 90,
              onExpiry: "prune",
              actor: PRINCIPAL_FOUNDER_NORTH,
            }),
          ),
        ),
      );
      const report = await later(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/retention/enforce`,
          JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(report.status).toBe(200);
      const reportBody = (await report.json()) as {
        report: {
          mode: string;
          prunedEventIds: string[];
          flaggedEventIds: string[];
          auditEventId: string | null;
        };
      };
      expect(reportBody.report.mode).toBe("prune");
      expect(reportBody.report.prunedEventIds).toHaveLength(9);
      expect(reportBody.report.flaggedEventIds).toEqual([]);
      expect(reportBody.report.auditEventId).not.toBeNull();
      // the surviving log is exactly policy + prune events; the prune event
      // names every removed id verbatim
      const audit = await later(
        get(`/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      const auditBody = (await audit.json()) as {
        events: Array<{ action: string; retention?: { prunedEventIds: string[] } }>;
      };
      expect(auditBody.events.map((event) => event.action)).toEqual([
        "retention.policy_updated",
        "retention.enforced",
      ]);
      expect(auditBody.events[1]?.retention?.prunedEventIds).toHaveLength(9);
      // the audit read itself needs audit:read (the contractor lacks it)
      const denied = await later(
        get(`/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_CONTRACTOR}`),
      );
      expect(denied.status).toBe(422);
      expect(((await denied.json()) as ErrorBody).error).toBe("missing_permission");
    });
  });

  test("FLAG over HTTP: nothing is removed; reads annotate past-window events (retentionExpired)", async () => {
    await withTempDir(async (root) => {
      await prepared(root);
      const later = handlerWith(root, () => FIXED_MONTHS_LATER);
      await expectOk(
        later(
          postJson(
            `/v1/identity/organizations/${ORG_NORTH}/retention`,
            JSON.stringify({
              auditRetentionDays: 90,
              onExpiry: "flag",
              actor: PRINCIPAL_FOUNDER_NORTH,
            }),
          ),
        ),
      );
      const report = await later(
        postJson(
          `/v1/identity/organizations/${ORG_NORTH}/retention/enforce`,
          JSON.stringify({ actor: PRINCIPAL_FOUNDER_NORTH }),
        ),
      );
      expect(report.status).toBe(200);
      const reportBody = (await report.json()) as {
        report: { mode: string; prunedEventIds: string[]; flaggedEventIds: string[] };
      };
      expect(reportBody.report.mode).toBe("flag");
      expect(reportBody.report.prunedEventIds).toEqual([]);
      expect(reportBody.report.flaggedEventIds).toHaveLength(9);
      // NOTHING was removed: 9 fixture events + policy + flag events remain
      const audit = await later(
        get(`/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}`),
      );
      const auditBody = (await audit.json()) as {
        events: Array<{ action: string; retentionExpired: boolean }>;
      };
      expect(auditBody.events).toHaveLength(11);
      expect(auditBody.events.slice(0, 9).every((event) => event.retentionExpired)).toBe(true);
      expect(auditBody.events[9]?.retentionExpired).toBe(false); // the policy event
      expect(auditBody.events[10]?.retentionExpired).toBe(false); // the flag event itself
    });
  });

  test("audit query filters: projectId and actor", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      // the contractor's allowed decision adds one alpha-scoped event
      await expectOk(
        handler(
          postJson(
            "/v1/identity/authorize",
            JSON.stringify({
              principalId: PRINCIPAL_CONTRACTOR,
              permission: "reasoning:read",
              target: { kind: "project", organizationId: ORG_NORTH, projectId: PROJECT_ALPHA },
            }),
          ),
        ),
      );
      const byProject = await handler(
        get(
          `/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}&projectId=${PROJECT_ALPHA}`,
        ),
      );
      const byProjectBody = (await byProject.json()) as {
        events: Array<{ action: string; projectId?: string }>;
      };
      expect(byProjectBody.events.map((event) => event.action)).toEqual([
        "project.created",
        "membership.granted",
        "authorization.allowed",
      ]);
      expect(byProjectBody.events.every((event) => event.projectId === PROJECT_ALPHA)).toBe(true);
      const byActor = await handler(
        get(
          `/v1/identity/organizations/${ORG_NORTH}/audit?requester=${PRINCIPAL_FOUNDER_NORTH}&actor=${PRINCIPAL_CONTRACTOR}`,
        ),
      );
      const byActorBody = (await byActor.json()) as {
        events: Array<{ action: string; actor: string }>;
      };
      expect(byActorBody.events).toHaveLength(1);
      expect(byActorBody.events[0]?.actor).toBe(PRINCIPAL_CONTRACTOR);
    });
  });
});

describe("identity HTTP surface: 405 with explicit allow", () => {
  test("wrong methods on every route shape get 405 with the documented allow header", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const probes: Array<{ request: Request; allow: string }> = [
        { request: requestWithMethod("GET", "/v1/identity/principals"), allow: "POST" },
        { request: requestWithMethod("GET", "/v1/identity/organizations"), allow: "POST" },
        { request: requestWithMethod("GET", "/v1/identity/authorize"), allow: "POST" },
        { request: requestWithMethod("PUT", `/v1/identity/organizations/${ORG_NORTH}`), allow: "GET" },
        {
          request: requestWithMethod("DELETE", `/v1/identity/organizations/${ORG_NORTH}/projects`),
          allow: "GET, POST",
        },
        {
          request: requestWithMethod("PUT", `/v1/identity/organizations/${ORG_NORTH}/roles`),
          allow: "GET, POST",
        },
        {
          request: requestWithMethod(
            "DELETE",
            `/v1/identity/organizations/${ORG_NORTH}/memberships`,
          ),
          allow: "GET, POST",
        },
        {
          request: requestWithMethod("PUT", `/v1/identity/organizations/${ORG_NORTH}/retention`),
          allow: "GET, POST",
        },
        {
          request: requestWithMethod(
            "GET",
            `/v1/identity/organizations/${ORG_NORTH}/retention/enforce`,
          ),
          allow: "POST",
        },
        {
          request: requestWithMethod("PUT", `/v1/identity/organizations/${ORG_NORTH}/audit`),
          allow: "GET",
        },
      ];
      for (const { request, allow } of probes) {
        const response = await handler(request);
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe(allow);
        expect(((await response.json()) as ErrorBody).error).toBe("method_not_allowed");
      }
    });
  });
});

describe("identity HTTP surface: unknown subpaths fall through to the server 404", () => {
  test("/v1/identity paths with no matching route shape get the SERVER's 404 (not the router's)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const probes = [
        requestWithMethod("GET", "/v1/identity"),
        requestWithMethod("POST", "/v1/identity/nonsense"),
        requestWithMethod("POST", `/v1/identity/organizations/${ORG_NORTH}/nonsense`),
        requestWithMethod("GET", `/v1/identity/organizations/${ORG_NORTH}/projects/extra`),
        requestWithMethod("POST", `/v1/identity/organizations/${ORG_NORTH}/memberships/mem-1/nonsense`),
        requestWithMethod("GET", `/v1/identity/organizations/${ORG_NORTH}/retention/nonsense`),
      ];
      for (const probe of probes) {
        const response = await handler(probe);
        expect(response.status).toBe(404);
        expect(((await response.json()) as ErrorBody).error).toBe("not_found");
      }
    });
  });
});

describe("identity HTTP surface: the lazy default wiring", () => {
  test("identity NOT injected: the default service constructs over the handler's env data dir on the FIRST request", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      // nothing under data/identity before the first identity request
      expect(existsSync(join(root, "data", "identity"))).toBe(false);
      const register = await handler(
        postJson(
          "/v1/identity/principals",
          JSON.stringify({ principalId: "principal-default-1", displayName: "Default Wiring" }),
        ),
      );
      expect(register.status).toBe(200);
      expect(
        existsSync(
          join(root, "data", "identity", "principals", `${sha256Hex("principal-default-1")}.json`),
        ),
      ).toBe(true);
      // the default wiring produces the documented file shape (wall clock in
      // production wiring — the path and id marker are the deterministic pins)
      const text = readFileSync(
        join(root, "data", "identity", "principals", `${sha256Hex("principal-default-1")}.json`),
        "utf8",
      );
      expect(text).toContain('"principalId": "principal-default-1"');
      // the same memoized default service serves subsequent requests (state persists)
      const create = await handler(
        postJson(
          "/v1/identity/organizations",
          JSON.stringify({
            organizationId: "org-default",
            name: "Default Org",
            founder: { principalId: "principal-default-1", permissions: ["identity:read"] },
          }),
        ),
      );
      expect(create.status).toBe(200);
      expect(
        existsSync(
          join(root, "data", "identity", "organizations", `${sha256Hex("org-default")}.json`),
        ),
      ).toBe(true);
      expect(
        existsSync(join(root, "data", "identity", "audit", `${sha256Hex("org-default")}.json`)),
      ).toBe(true);
      const read = await handler(
        get("/v1/identity/organizations/org-default?requester=principal-default-1"),
      );
      expect(read.status).toBe(200);
      const readBody = (await read.json()) as { organization: { organizationId: string } };
      expect(readBody.organization.organizationId).toBe("org-default");
    });
  });
});
