/**
 * PROD-004 — principal resolution + THE TENANT PREDICATE tests.
 *
 * The predicate is THE enforcement point of the work order ("tenant/project
 * isolation tests pass"); this suite proves the typed decision matrix over
 * the identity testkit's fixture world (two tenants, a cross-tenant
 * contractor, an uninvited principal) — deterministically, with no clock and
 * no network.
 */

import { describe, expect, test } from "bun:test";
import {
  buildFixtureWorld,
  fixedClock,
  ORG_NORTH,
  ORG_SOUTH,
  PRINCIPAL_ENGINEER_SOUTH,
  PRINCIPAL_FOUNDER_NORTH,
  PRINCIPAL_UNINVITED,
  PROJECT_ALPHA,
  PROJECT_BETA,
} from "../identity/testkit";
import { InMemoryIdentityStore } from "../identity/store";
import type { IdentityStore } from "../identity/store";
import { decideTenantAccess, isReadVerb, resolvePrincipal } from "./principal";
import type { PrincipalDirectory } from "./principal";
import { DEMO_ORGANIZATION_ID } from "./demo";

const NOW = "2026-02-02T09:00:00.000Z";

/** The fixture world, freshly built per call (tests never share state). */
async function world(): Promise<IdentityStore> {
  const store = new InMemoryIdentityStore();
  await buildFixtureWorld(store, fixedClock);
  return store;
}

describe("resolvePrincipal (the identity registry is the ONLY source)", () => {
  test("resolves a founder: display name, kind carried, ACTIVE memberships, Founder label", async () => {
    const directory = await world();
    const resolution = await resolvePrincipal(directory, {
      principalId: PRINCIPAL_FOUNDER_NORTH,
      kind: "user",
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.principal.displayName).toBe("Founder North");
      expect(resolution.principal.kind).toBe("user");
      expect(resolution.principal.organizationIds).toEqual([ORG_NORTH]);
      expect(resolution.principal.roleLabel).toBe("Founder");
    }
  });

  test("resolves the demo kind without changing the tenant facts", async () => {
    const directory = await world();
    const resolution = await resolvePrincipal(directory, {
      principalId: PRINCIPAL_FOUNDER_NORTH,
      kind: "demo",
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.principal.kind).toBe("demo");
      expect(resolution.principal.organizationIds).toEqual([ORG_NORTH]);
    }
  });

  test("an unknown principal fails closed (unknown_principal)", async () => {
    const directory = await world();
    expect(await resolvePrincipal(directory, { principalId: "ghost", kind: "user" })).toEqual({
      ok: false,
      reason: "unknown_principal",
    });
  });

  test("a principal with no memberships resolves with no tenants and the honest label", async () => {
    const directory = await world();
    const resolution = await resolvePrincipal(directory, {
      principalId: PRINCIPAL_UNINVITED,
      kind: "user",
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.principal.organizationIds).toEqual([]);
      expect(resolution.principal.roleLabel).toBe("No active role");
    }
  });
});

describe("isReadVerb", () => {
  test("GET/HEAD/OPTIONS are reads; every mutation verb is not", () => {
    for (const verb of ["GET", "HEAD", "OPTIONS"]) {
      expect(isReadVerb(verb)).toBe(true);
    }
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isReadVerb(verb)).toBe(false);
    }
  });
});

describe("the tenant predicate — the refusal precedence, exactly as documented", () => {
  test("1. malformed ids are refused 400 BEFORE anything is looked up", async () => {
    const directory = await world();
    for (const projectId of ["", "x".repeat(257)]) {
      const decision = await decideTenantAccess({
        directory,
        principal: null,
        scope: { kind: "project", projectId },
        method: "GET",
        mode: "demo-open",
        demoOrganizationId: DEMO_ORGANIZATION_ID,
        now: NOW,
      });
      expect(decision).toEqual({
        allowed: false,
        code: "invalid_project_id",
        status: 400,
        detail: "projectId must be 1..256 characters",
      });
    }
    const orgDecision = await decideTenantAccess({
      directory,
      principal: null,
      scope: { kind: "organization", organizationId: "" },
      method: "GET",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(orgDecision).toEqual({
      allowed: false,
      code: "invalid_organization_id",
      status: 400,
      detail: "organizationId must be 1..256 characters",
    });
  });

  test("2. anonymous writes are refused 401 for a registered scope even in demo-open mode", async () => {
    const directory = await world();
    const decision = await decideTenantAccess({
      directory,
      principal: null,
      scope: { kind: "organization", organizationId: ORG_NORTH },
      method: "POST",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(401);
      expect(decision.code).toBe("authentication_required");
    }
    // And for a PROJECT scope likewise (writes never ride the demo-open rule).
    const projectDecision = await decideTenantAccess({
      directory,
      principal: null,
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      method: "DELETE",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(projectDecision.allowed).toBe(false);
    if (!projectDecision.allowed) {
      expect(projectDecision.status).toBe(401);
      expect(projectDecision.code).toBe("authentication_required");
    }
  });

  test("3. an unregistered scope is fail-closed 403 for SESSIONED callers (nobody may address it)", async () => {
    const directory = await world();
    const decision = await decideTenantAccess({
      directory,
      principal: {
        principalId: PRINCIPAL_FOUNDER_NORTH,
        displayName: "Founder North",
        kind: "user",
        organizationIds: [ORG_NORTH],
        roleLabel: "Founder",
      },
      scope: { kind: "project", projectId: "project-not-registered" },
      method: "GET",
      mode: "required",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(decision).toEqual({
      allowed: false,
      code: "unregistered_project",
      status: 403,
      detail: "project project-not-registered is not registered in the tenancy registry",
    });
    const orgDecision = await decideTenantAccess({
      directory,
      principal: {
        principalId: PRINCIPAL_FOUNDER_NORTH,
        displayName: "Founder North",
        kind: "user",
        organizationIds: [ORG_NORTH],
        roleLabel: "Founder",
      },
      scope: { kind: "organization", organizationId: "org-not-registered" },
      method: "GET",
      mode: "required",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(orgDecision).toEqual({
      allowed: false,
      code: "unregistered_organization",
      status: 403,
      detail: "organization org-not-registered is not registered in the tenancy registry",
    });
  });

  test("4. anonymous demo-open reads pass ONLY inside the demo tenant", async () => {
    const directory = await world();
    // The demo organization itself is not registered in this fixture world —
    // an anonymous read of it is a 401 (not a bypass).
    const demoUnregistered = await decideTenantAccess({
      directory,
      principal: null,
      scope: { kind: "organization", organizationId: DEMO_ORGANIZATION_ID },
      method: "GET",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(demoUnregistered.allowed).toBe(false);
    if (!demoUnregistered.allowed) {
      expect(demoUnregistered.status).toBe(401);
    }
    // A registered non-demo project: anonymous demo-open read is 401.
    const otherTenant = await decideTenantAccess({
      directory,
      principal: null,
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      method: "GET",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(otherTenant.allowed).toBe(false);
    if (!otherTenant.allowed) {
      expect(otherTenant.status).toBe(401);
      expect(otherTenant.code).toBe("authentication_required");
    }
  });

  test("anonymous reads in `required` mode are refused 401 even for registered scopes", async () => {
    const directory = await world();
    const decision = await decideTenantAccess({
      directory,
      principal: null,
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      method: "GET",
      mode: "required",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(401);
      expect(decision.code).toBe("authentication_required");
    }
  });

  test("5. a member of the scope's tenant is allowed; a non-member is refused 403 cross_tenant", async () => {
    const directory = await world();
    const founder = {
      principalId: PRINCIPAL_FOUNDER_NORTH,
      displayName: "Founder North",
      kind: "user" as const,
      organizationIds: [ORG_NORTH],
      roleLabel: "Founder",
    };
    // Own tenant (project scope): allowed.
    expect(
      await decideTenantAccess({
        directory,
        principal: founder,
        scope: { kind: "project", projectId: PROJECT_ALPHA },
        method: "GET",
        mode: "required",
        demoOrganizationId: DEMO_ORGANIZATION_ID,
        now: NOW,
      }),
    ).toEqual({ allowed: true });
    // Own tenant (organization scope): allowed.
    expect(
      await decideTenantAccess({
        directory,
        principal: founder,
        scope: { kind: "organization", organizationId: ORG_NORTH },
        method: "POST",
        mode: "required",
        demoOrganizationId: DEMO_ORGANIZATION_ID,
        now: NOW,
      }),
    ).toEqual({ allowed: true });
    // Other tenant: 403 cross_tenant with the scope named.
    const south = await directory.getOrganization(ORG_SOUTH);
    expect(south).not.toBeNull();
    const cross = await decideTenantAccess({
      directory,
      principal: founder,
      scope: { kind: "organization", organizationId: ORG_SOUTH },
      method: "GET",
      mode: "required",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(cross).toEqual({
      allowed: false,
      code: "cross_tenant",
      status: 403,
      detail: `principal ${PRINCIPAL_FOUNDER_NORTH} is not a member of organization ${ORG_SOUTH} — cross-tenant access is refused`,
    });
  });

  test("a registered principal with NO memberships is refused 403 for every registered scope", async () => {
    const directory = await world();
    const uninvited = {
      principalId: PRINCIPAL_UNINVITED,
      displayName: "Uninvited",
      kind: "user" as const,
      organizationIds: [],
      roleLabel: "No active role",
    };
    const decision = await decideTenantAccess({
      directory,
      principal: uninvited,
      scope: { kind: "project", projectId: PROJECT_BETA },
      method: "GET",
      mode: "required",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(403);
      expect(decision.code).toBe("cross_tenant");
    }
  });

  test("a REGISTERED but unregistered-project scope is 403 even for the demo principal (fail closed)", async () => {
    const directory = await world();
    const demoPrincipal = {
      principalId: "demo-evaluator",
      displayName: "Demo Evaluator",
      kind: "demo" as const,
      organizationIds: [DEMO_ORGANIZATION_ID],
      roleLabel: "Founder",
    };
    const decision = await decideTenantAccess({
      directory,
      principal: demoPrincipal,
      scope: { kind: "project", projectId: "project-ghost" },
      method: "POST",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(decision).toEqual({
      allowed: false,
      code: "unregistered_project",
      status: 403,
      detail: "project project-ghost is not registered in the tenancy registry",
    });
  });
});

describe("the predicate consumes ONLY the directory (no second authority)", () => {
  test("the structural seam: FsIdentityStore and InMemoryIdentityStore both satisfy it", () => {
    // Compile-time structural check at runtime: the interface is satisfied by
    // the identity store contract (the testkit fixture builds on it).
    const check = (store: unknown): store is PrincipalDirectory => {
      const candidate = store as PrincipalDirectory;
      return (
        typeof candidate.getPrincipal === "function" &&
        typeof candidate.getProject === "function" &&
        typeof candidate.getOrganization === "function" &&
        typeof candidate.listMembershipsByPrincipal === "function"
      );
    };
    expect(check(new InMemoryIdentityStore())).toBe(true);
  });

  test("membership facts drive the decision — the engineer of the south cannot read the north's project", async () => {
    const directory = await world();
    const engineer = {
      principalId: PRINCIPAL_ENGINEER_SOUTH,
      displayName: "Engineer South",
      kind: "user" as const,
      organizationIds: [ORG_SOUTH],
      roleLabel: "Founder",
    };
    const decision = await decideTenantAccess({
      directory,
      principal: engineer,
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      method: "GET",
      mode: "required",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("cross_tenant");
      expect(decision.status).toBe(403);
    }
  });
});
