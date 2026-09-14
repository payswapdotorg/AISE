/**
 * AISE-036 — identity service tests. THE CRITICAL MATRICES.
 *
 * Tenant-isolation discrimination (cross-org/cross-project access ⇒ typed
 * refusal naming principal + target; authorized-within-tenant ⇒ allowed),
 * the unauthorized-access matrix (every failure mode a DISTINCT typed
 * refusal — never blanket, never undefined), the membership lifecycle
 * (append-only: a re-grant after revocation is a NEW record), retention
 * honesty (pruning is recorded policy execution, never silent; append-only
 * preserved), the audit chain (content-derived ids/digests, queryable by
 * org/project/actor) and byte-determinism over injected clocks.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { AUDIT_GENESIS_DIGEST, IdentityError, type IdentityErrorCode } from "./model";
import { IdentityService, FOUNDER_ROLE_ID } from "./service";
import { InMemoryIdentityStore } from "./store";
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
  buildFixtureWorld,
  fixedClock,
} from "./testkit";

const ORG_TARGET = { kind: "organization", organizationId: ORG_NORTH } as const;
const ALPHA_TARGET = {
  kind: "project",
  organizationId: ORG_NORTH,
  projectId: PROJECT_ALPHA,
} as const;
const BETA_TARGET = {
  kind: "project",
  organizationId: ORG_NORTH,
  projectId: PROJECT_BETA,
} as const;

async function world(): Promise<{ service: IdentityService; store: InMemoryIdentityStore }> {
  const store = new InMemoryIdentityStore();
  const service = await buildFixtureWorld(store, fixedClock);
  return { service, store };
}

async function expectCode(fn: () => Promise<unknown>, code: IdentityErrorCode): Promise<void> {
  try {
    await fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityError);
    expect((error as IdentityError).code).toBe(code);
  }
}

/** A second service over the SAME store with a different clock. */
function serviceAt(store: InMemoryIdentityStore, clock: () => string): IdentityService {
  return new IdentityService({ store, clock });
}

describe("identity service: bootstrap directory acts", () => {
  test("registerPrincipal is deterministic (injected clock) and rejects duplicates", async () => {
    const { service } = await world();
    const principal = await service.registerPrincipal({
      principalId: "principal-new",
      displayName: "New Principal",
    });
    expect(principal).toEqual({
      principalId: "principal-new",
      displayName: "New Principal",
      createdAt: FIXED_NOW,
    });
    await expectCode(
      () => service.registerPrincipal({ principalId: "principal-new", displayName: "Again" }),
      "principal_exists",
    );
  });

  test("createOrganization without founder records a system-actor event", async () => {
    const store = new InMemoryIdentityStore();
    const service = new IdentityService({ store, clock: fixedClock });
    const organization = await service.createOrganization({
      organizationId: "org-bare",
      name: "Bare Org",
    });
    expect(organization).toEqual({
      organizationId: "org-bare",
      name: "Bare Org",
      createdAt: FIXED_NOW,
    });
    const log = await store.listAuditEvents("org-bare");
    expect(log).toHaveLength(1);
    expect(log[0]?.actor).toBe("system");
    expect(log[0]?.action).toBe("organization.created");
    expect(log[0]?.previousEventDigest).toBe(AUDIT_GENESIS_DIGEST);
  });

  test("createOrganization WITH founder: one audited act creates role + org-scoped membership", async () => {
    const { service, store } = await world();
    await service.createOrganization({
      organizationId: "org-third",
      name: "Third Org",
      founder: {
        principalId: PRINCIPAL_UNINVITED,
        permissions: ["identity:admin", "reality:read"],
      },
    });
    const role = await store.getRole("org-third", FOUNDER_ROLE_ID);
    expect(role?.permissions).toEqual(["identity:admin", "reality:read"]);
    const memberships = await store.listMemberships("org-third");
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.principalId).toBe(PRINCIPAL_UNINVITED);
    expect(memberships[0]?.scope).toEqual({ kind: "organization" });
    expect(memberships[0]?.state).toBe("active");
    expect(memberships[0]?.grantedBy).toBe(PRINCIPAL_UNINVITED);
    const log = await store.listAuditEvents("org-third");
    expect(log.map((event) => event.action)).toEqual([
      "organization.created",
      "role.created",
      "membership.granted",
    ]);
  });

  test("createOrganization validates the founder BEFORE any persistence (no half-created org)", async () => {
    const { service, store } = await world();
    await expectCode(
      () =>
        service.createOrganization({
          organizationId: "org-doomed",
          name: "Doomed",
          founder: { principalId: "principal-ghost", permissions: ["reality:read"] },
        }),
      "unknown_principal",
    );
    expect(await store.getOrganization("org-doomed")).toBeNull();
    expect(await store.listAuditEvents("org-doomed")).toEqual([]);
  });

  test("createOrganization rejects duplicates with a typed code", async () => {
    const { service } = await world();
    await expectCode(
      () => service.createOrganization({ organizationId: ORG_NORTH, name: "North Again" }),
      "organization_exists",
    );
  });
});

describe("identity service: guarded mutations", () => {
  test("createProject requires identity:write and records the project event", async () => {
    const { service, store } = await world();
    const project = await service.createProject({
      organizationId: ORG_NORTH,
      projectId: "project-gamma",
      name: "Gamma",
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(project.organizationId).toBe(ORG_NORTH);
    const log = await store.listAuditEvents(ORG_NORTH);
    expect(log[log.length - 1]?.action).toBe("project.created");
    expect(log[log.length - 1]?.projectId).toBe("project-gamma");
    expect(log[log.length - 1]?.actor).toBe(PRINCIPAL_FOUNDER_NORTH);
    await expectCode(
      () =>
        service.createProject({
          organizationId: ORG_NORTH,
          projectId: "project-gamma",
          name: "Gamma again",
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "project_exists",
    );
  });

  test("createProject by a member of ANOTHER tenant is a typed cross_tenant rejection", async () => {
    const { service } = await world();
    await expectCode(
      () =>
        service.createProject({
          organizationId: ORG_NORTH,
          projectId: "project-south-spam",
          name: "South spam",
          actor: PRINCIPAL_ENGINEER_SOUTH,
        }),
      "cross_tenant",
    );
  });

  test("createProject by a member WITHOUT the identity surface is a typed missing_permission", async () => {
    const { service } = await world();
    await expectCode(
      () =>
        service.createProject({
          organizationId: ORG_NORTH,
          projectId: "project-contractor-spam",
          name: "Spam",
          actor: PRINCIPAL_CONTRACTOR,
        }),
      "missing_permission",
    );
  });

  test("createRole requires identity:admin; roles are org-scoped (same id in two orgs)", async () => {
    const { service, store } = await world();
    const role = await service.createRole({
      organizationId: ORG_NORTH,
      roleId: "role-planner",
      name: "Planner",
      permissions: ["mission:read", "mission:write"],
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(role.permissions).toEqual(["mission:read", "mission:write"]);
    await expectCode(
      () =>
        service.createRole({
          organizationId: ORG_NORTH,
          roleId: "role-planner",
          name: "Planner",
          permissions: ["mission:read"],
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "role_exists",
    );
    // the same roleId in ANOTHER org is a different record (no global clash)
    await service.createRole({
      organizationId: ORG_SOUTH,
      roleId: "role-planner",
      name: "South planner",
      permissions: ["boq:read"],
      actor: PRINCIPAL_ENGINEER_SOUTH,
    });
    expect((await store.listRoles(ORG_SOUTH)).map((r) => r.roleId)).toEqual([
      "org-founder",
      "role-planner",
    ]);
    await expectCode(
      () =>
        service.createRole({
          organizationId: ORG_NORTH,
          roleId: "role-spam",
          name: "Spam",
          permissions: ["boq:read"],
          actor: PRINCIPAL_CONTRACTOR,
        }),
      "missing_permission",
    );
  });

  test("grantMembership happy paths (org scope + project scope) audit the grant", async () => {
    const { service, store } = await world();
    const membership = await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: ROLE_SURVEYOR,
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(membership.state).toBe("active");
    expect(membership.grantedBy).toBe(PRINCIPAL_FOUNDER_NORTH);
    expect(membership.grantedAt).toBe(FIXED_NOW);
    const log = await store.listAuditEvents(ORG_NORTH);
    expect(log[log.length - 1]?.action).toBe("membership.granted");
    expect(log[log.length - 1]?.targetId).toBe(`${ORG_NORTH}:${membership.membershipId}`);
  });

  test("grantMembership typed rejections: principal/role/project existence and duplicates", async () => {
    const { service } = await world();
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: "principal-ghost",
          roleId: ROLE_SURVEYOR,
          scope: { kind: "organization" },
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "principal_not_found",
    );
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: PRINCIPAL_UNINVITED,
          roleId: "role-nonexistent",
          scope: { kind: "organization" },
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "role_not_found",
    );
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: PRINCIPAL_UNINVITED,
          roleId: ROLE_SURVEYOR,
          scope: { kind: "project", projectId: "project-nowhere" },
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "project_not_found",
    );
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_SOUTH,
          principalId: PRINCIPAL_ENGINEER_SOUTH,
          roleId: "org-founder",
          scope: { kind: "project", projectId: PROJECT_ALPHA },
          actor: PRINCIPAL_ENGINEER_SOUTH,
        }),
      "project_not_in_organization",
    );
    // duplicate ACTIVE grant (same principal+role+scope)
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: PRINCIPAL_CONTRACTOR,
          roleId: ROLE_SURVEYOR,
          scope: { kind: "project", projectId: PROJECT_ALPHA },
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "membership_exists",
    );
  });

  test("grantMembership names the foreign organization when the role belongs to another org", async () => {
    const { service } = await world();
    await service.createRole({
      organizationId: ORG_SOUTH,
      roleId: "role-south-only",
      name: "South only",
      permissions: ["boq:read"],
      actor: PRINCIPAL_ENGINEER_SOUTH,
    });
    try {
      await service.grantMembership({
        organizationId: ORG_NORTH,
        principalId: PRINCIPAL_UNINVITED,
        roleId: "role-south-only",
        scope: { kind: "organization" },
        actor: PRINCIPAL_FOUNDER_NORTH,
      });
      expect.unreachable("expected role_not_in_organization");
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityError);
      expect((error as IdentityError).code).toBe("role_not_in_organization");
      expect((error as IdentityError).detail).toContain(ORG_SOUTH);
    }
  });

  test("GATE ORDER: a caller without identity:admin gets THEIR OWN refusal, not enumeration signal", async () => {
    const { service } = await world();
    // contractor (surveyor @ alpha, no identity surface) probes org-north with
    // an unregistered principal AND an unknown role: the authorization
    // refusal comes FIRST — no principal_not_found / role_not_found leak.
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: "principal-ghost",
          roleId: "role-nonexistent",
          scope: { kind: "organization" },
          actor: PRINCIPAL_CONTRACTOR,
        }),
      "missing_permission",
    );
  });

  test("a PROJECT-scoped identity:admin can mint members for exactly that project — never org-wide", async () => {
    const { service } = await world();
    await service.createRole({
      organizationId: ORG_NORTH,
      roleId: "role-alpha-admin",
      name: "Alpha admin",
      permissions: ["identity:admin"],
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: "role-alpha-admin",
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    // within reach: a project-scoped grant for the SAME project
    const membership = await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_ENGINEER_SOUTH,
      roleId: ROLE_READER,
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      actor: PRINCIPAL_UNINVITED,
    });
    expect(membership.state).toBe("active");
    // out of reach: an ORG-scoped grant (alpha scope does not cover the org)
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: PRINCIPAL_ENGINEER_SOUTH,
          roleId: ROLE_READER,
          scope: { kind: "organization" },
          actor: PRINCIPAL_UNINVITED,
        }),
      "wrong_scope",
    );
    // out of reach: a project-scoped grant for a DIFFERENT project
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: ORG_NORTH,
          principalId: PRINCIPAL_ENGINEER_SOUTH,
          roleId: ROLE_READER,
          scope: { kind: "project", projectId: PROJECT_BETA },
          actor: PRINCIPAL_UNINVITED,
        }),
      "wrong_scope",
    );
  });

  test("revokeMembership: state flip with stamps, audit event, typed rejections", async () => {
    const { service, store } = await world();
    const memberships = await store.listMemberships(ORG_NORTH);
    const contractorMembership = memberships.find(
      (membership) => membership.principalId === PRINCIPAL_CONTRACTOR,
    );
    expect(contractorMembership).toBeDefined();
    const membershipId = contractorMembership?.membershipId ?? "";
    const revoked = await service.revokeMembership({
      organizationId: ORG_NORTH,
      membershipId,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(revoked.state).toBe("revoked");
    expect(revoked.revokedAt).toBe(FIXED_NOW);
    expect(revoked.revokedBy).toBe(PRINCIPAL_FOUNDER_NORTH);
    const log = await store.listAuditEvents(ORG_NORTH);
    expect(log[log.length - 1]?.action).toBe("membership.revoked");
    expect(log[log.length - 1]?.targetId).toBe(`${ORG_NORTH}:${membershipId}`);
    // double revoke
    await expectCode(
      () =>
        service.revokeMembership({
          organizationId: ORG_NORTH,
          membershipId,
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "membership_not_active",
    );
    // unknown id
    await expectCode(
      () =>
        service.revokeMembership({
          organizationId: ORG_NORTH,
          membershipId: "mem-nonexistent",
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "membership_not_found",
    );
    // revocation itself requires identity:admin (actor without it: typed refusal)
    const second = await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: ROLE_READER,
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    await expectCode(
      () =>
        service.revokeMembership({
          organizationId: ORG_NORTH,
          membershipId: second.membershipId,
          actor: PRINCIPAL_UNINVITED, // holds reality:read only — no identity surface
        }),
      "missing_permission",
    );
  });

  test("a re-grant after revocation is a NEW record (append-only membership history)", async () => {
    const { service, store } = await world();
    const first = await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: ROLE_READER,
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    await service.revokeMembership({
      organizationId: ORG_NORTH,
      membershipId: first.membershipId,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const second = await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: ROLE_READER,
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(second.membershipId).not.toBe(first.membershipId);
    // the revoked record is still there — the SAME id with the state flipped
    // and the revocation stamps (history preserved, never erased)
    const revokedRecord = await store.getMembership(ORG_NORTH, first.membershipId);
    expect(revokedRecord).toEqual({
      ...first,
      state: "revoked",
      revokedAt: FIXED_NOW,
      revokedBy: PRINCIPAL_FOUNDER_NORTH,
    });
    // and the active membership is the new one
    const active = (await store.listMemberships(ORG_NORTH)).filter(
      (membership) =>
        membership.principalId === PRINCIPAL_UNINVITED && membership.state === "active",
    );
    expect(active.map((membership) => membership.membershipId)).toEqual([second.membershipId]);
  });

  test("an organization that revokes ALL its members is honestly locked (no empty-org takeover)", async () => {
    const store = new InMemoryIdentityStore();
    const service = new IdentityService({ store, clock: fixedClock });
    await service.registerPrincipal({ principalId: "p-solo", displayName: "Solo" });
    await service.createOrganization({
      organizationId: "org-solo",
      name: "Solo Org",
      founder: { principalId: "p-solo", permissions: ["identity:admin", "identity:read"] },
    });
    const membership = (await store.listMemberships("org-solo"))[0];
    expect(membership).toBeDefined();
    await service.revokeMembership({
      organizationId: "org-solo",
      membershipId: membership?.membershipId ?? "",
      actor: "p-solo",
    });
    // the solo member can no longer authorize…
    const decision = await service.authorize("p-solo", "identity:read", {
      kind: "organization",
      organizationId: "org-solo",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("membership_revoked");
    }
    // …and nobody can grant a new membership into the locked org
    await expectCode(
      () =>
        service.grantMembership({
          organizationId: "org-solo",
          principalId: "p-solo",
          roleId: "org-founder",
          scope: { kind: "organization" },
          actor: "p-solo",
        }),
      "membership_revoked",
    );
  });
});

describe("identity service: TENANT ISOLATION + unauthorized-access discrimination matrix", () => {
  test("unknown principal ⇒ unknown_principal (distinct from every other code)", async () => {
    const { service } = await world();
    const decision = await service.authorize("principal-ghost", "reality:read", ALPHA_TARGET);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("unknown_principal");
      expect(decision.refusal.principalId).toBe("principal-ghost");
      expect(decision.refusal.detail).toContain("principal-ghost");
    }
  });

  test("unknown target org ⇒ organization_not_found; unknown project ⇒ project_not_found", async () => {
    const { service } = await world();
    const orgDecision = await service.authorize(PRINCIPAL_FOUNDER_NORTH, "reality:read", {
      kind: "organization",
      organizationId: "org-nowhere",
    });
    expect(orgDecision.allowed).toBe(false);
    if (!orgDecision.allowed) {
      expect(orgDecision.refusal.code).toBe("organization_not_found");
    }
    const projectDecision = await service.authorize(PRINCIPAL_FOUNDER_NORTH, "reality:read", {
      kind: "project",
      organizationId: ORG_NORTH,
      projectId: "project-nowhere",
    });
    expect(projectDecision.allowed).toBe(false);
    if (!projectDecision.allowed) {
      expect(projectDecision.refusal.code).toBe("project_not_found");
      expect(projectDecision.refusal.target.projectId).toBe("project-nowhere");
    }
  });

  test("a project of ANOTHER org claimed under this org ⇒ project_not_in_organization", async () => {
    const { service } = await world();
    const decision = await service.authorize(PRINCIPAL_ENGINEER_SOUTH, "reality:read", {
      kind: "project",
      organizationId: ORG_SOUTH,
      projectId: PROJECT_ALPHA, // alpha belongs to org-north
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("project_not_in_organization");
      expect(decision.refusal.detail).toContain(ORG_NORTH);
    }
  });

  test("CROSS-TENANT: a south member asking north ⇒ cross_tenant naming principal, home orgs and target", async () => {
    const { service } = await world();
    const decision = await service.authorize(PRINCIPAL_ENGINEER_SOUTH, "reality:read", ORG_TARGET);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("cross_tenant");
      expect(decision.refusal.principalId).toBe(PRINCIPAL_ENGINEER_SOUTH);
      expect(decision.refusal.detail).toContain(PRINCIPAL_ENGINEER_SOUTH);
      expect(decision.refusal.detail).toContain(ORG_SOUTH);
      expect(decision.refusal.detail).toContain(ORG_NORTH);
      expect(decision.refusal.target).toEqual(ORG_TARGET);
    }
  });

  test("NO MEMBERSHIP: a registered principal belonging to nothing ⇒ no_membership", async () => {
    const { service } = await world();
    const decision = await service.authorize(PRINCIPAL_UNINVITED, "reality:read", ORG_TARGET);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("no_membership");
    }
  });

  test("REVOKED MEMBERSHIP ⇒ membership_revoked (distinct from never-having-one)", async () => {
    const { service } = await world();
    // allowed BEFORE the revocation
    const before = await service.authorize(PRINCIPAL_CONTRACTOR, "reasoning:read", ALPHA_TARGET);
    expect(before.allowed).toBe(true);
    const { membershipId } = await membershipOf(service, PRINCIPAL_CONTRACTOR);
    await service.revokeMembership({
      organizationId: ORG_NORTH,
      membershipId,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const decision = await service.authorize(PRINCIPAL_CONTRACTOR, "reasoning:read", ALPHA_TARGET);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("membership_revoked");
      expect(decision.refusal.principalId).toBe(PRINCIPAL_CONTRACTOR);
      expect(decision.refusal.detail).toContain(PRINCIPAL_CONTRACTOR);
    }
  });

  test("WRONG SCOPE: the exact permission held at a non-covering scope ⇒ wrong_scope", async () => {
    const { service } = await world();
    // contractor holds reasoning:read at PROJECT ALPHA scope only
    const betaDecision = await service.authorize(PRINCIPAL_CONTRACTOR, "reasoning:read", BETA_TARGET);
    expect(betaDecision.allowed).toBe(false);
    if (!betaDecision.allowed) {
      expect(betaDecision.refusal.code).toBe("wrong_scope");
      expect(betaDecision.refusal.detail).toContain("project project-alpha scope");
      expect(betaDecision.refusal.detail).toContain(PROJECT_BETA);
    }
    // and at the org-level target
    const orgDecision = await service.authorize(PRINCIPAL_CONTRACTOR, "reasoning:read", ORG_TARGET);
    expect(orgDecision.allowed).toBe(false);
    if (!orgDecision.allowed) {
      expect(orgDecision.refusal.code).toBe("wrong_scope");
    }
  });

  test("INSUFFICIENT GRANULARITY: covering scope, finer permission held ⇒ insufficient_granularity", async () => {
    const { service } = await world();
    await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: ROLE_READER, // reality:read only
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const decision = await service.authorize(PRINCIPAL_UNINVITED, "reality:write", ORG_TARGET);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("insufficient_granularity");
      expect(decision.refusal.detail).toContain("reality:write");
    }
  });

  test("MISSING PERMISSION: active membership, nothing on the surface ⇒ missing_permission", async () => {
    const { service } = await world();
    const decision = await service.authorize(PRINCIPAL_CONTRACTOR, "boq:read", ALPHA_TARGET);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("missing_permission");
      expect(decision.refusal.detail).toContain("boq");
    }
  });

  test("AUTHORIZED WITHIN TENANT: the same contractor at alpha ⇒ allowed with the full grant", async () => {
    const { service, store } = await world();
    const decision = await service.authorize(PRINCIPAL_CONTRACTOR, "reasoning:read", ALPHA_TARGET);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      const membership = (await store.listMemberships(ORG_NORTH)).find(
        (entry) => entry.principalId === PRINCIPAL_CONTRACTOR,
      );
      expect(decision.grant.membershipId).toBe(membership?.membershipId);
      expect(decision.grant.roleId).toBe(ROLE_SURVEYOR);
      expect(decision.grant.permission).toBe("reasoning:read");
      expect(decision.grant.scope).toEqual({ kind: "project", projectId: PROJECT_ALPHA });
    }
  });

  test("authorized-within-tenant BOTH WAYS: allowed inside, refused across (the discrimination pair)", async () => {
    const { service } = await world();
    // engineer-south inside org-south: allowed
    const inside = await service.authorize(PRINCIPAL_ENGINEER_SOUTH, "identity:read", {
      kind: "organization",
      organizationId: ORG_SOUTH,
    });
    expect(inside.allowed).toBe(true);
    // the same principal against org-north: cross-tenant refusal
    const outside = await service.authorize(PRINCIPAL_ENGINEER_SOUTH, "identity:read", ORG_TARGET);
    expect(outside.allowed).toBe(false);
    if (!outside.allowed) {
      expect(outside.refusal.code).toBe("cross_tenant");
    }
  });

  test("LEAST-PRIVILEGE grant selection: the finest held granularity wins, deterministically", async () => {
    const { service } = await world();
    // the founder role literally carries identity:admin+write+read
    const decision = await service.authorize(
      PRINCIPAL_FOUNDER_NORTH,
      "identity:read",
      ORG_TARGET,
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.grant.permission).toBe("identity:read"); // NOT admin/write
      expect(decision.grant.roleId).toBe(FOUNDER_ROLE_ID);
    }
    // org-scope membership covers project targets (alpha via the org grant)
    const projectDecision = await service.authorize(
      PRINCIPAL_FOUNDER_NORTH,
      "identity:read",
      ALPHA_TARGET,
    );
    expect(projectDecision.allowed).toBe(true);
    if (projectDecision.allowed) {
      expect(projectDecision.grant.scope).toEqual({ kind: "organization" });
    }
  });

  test("tie-break determinism: two satisfying grants ⇒ the smaller membershipId wins", async () => {
    const { service, store } = await world();
    // contractor already holds surveyor@alpha; add surveyor@org
    await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_CONTRACTOR,
      roleId: ROLE_SURVEYOR,
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const ids = (await store.listMemberships(ORG_NORTH))
      .filter((entry) => entry.principalId === PRINCIPAL_CONTRACTOR)
      .map((entry) => entry.membershipId)
      .sort();
    const decision = await service.authorize(PRINCIPAL_CONTRACTOR, "reasoning:read", ALPHA_TARGET);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.grant.membershipId).toBe(ids[0]);
    }
  });
});

describe("identity service: audit append-only discipline", () => {
  test("the fixture world's audit log is a verifiable chain from the genesis digest", async () => {
    const { service, store } = await world();
    const log = await store.listAuditEvents(ORG_NORTH);
    expect(log).toHaveLength(9);
    expect(log[0]?.previousEventDigest).toBe(AUDIT_GENESIS_DIGEST);
    const ids = new Set<string>();
    for (let index = 0; index < log.length; index += 1) {
      const event = log[index];
      expect(event).toBeDefined();
      if (event === undefined) {
        continue;
      }
      expect(event.eventId).toMatch(/^evt-[0-9a-f]{16}$/);
      ids.add(event.eventId);
      if (index > 0) {
        expect(event.previousEventDigest).toBe(log[index - 1]?.eventDigest);
      }
    }
    expect(ids.size).toBe(9); // content ids are unique per chain position
    expect(log.map((event) => event.action)).toEqual([
      "organization.created",
      "role.created",
      "membership.granted",
      "project.created",
      "project.created",
      "role.created",
      "role.created",
      "role.created",
      "membership.granted",
    ]);
  });

  test("authorizeAndAudit records BOTH outcomes as events; prior events are never rewritten", async () => {
    const { service, store } = await world();
    const before = await store.listAuditEvents(ORG_NORTH);
    const allowed = await service.authorizeAndAudit(
      PRINCIPAL_CONTRACTOR,
      "reasoning:read",
      ALPHA_TARGET,
    );
    expect(allowed.allowed).toBe(true);
    const refused = await service.authorizeAndAudit(
      PRINCIPAL_ENGINEER_SOUTH,
      "reality:read",
      ORG_TARGET,
    );
    expect(refused.allowed).toBe(false);
    const after = await store.listAuditEvents(ORG_NORTH);
    expect(after).toHaveLength(before.length + 2);
    // append-only: the ENTIRE prior log is the unchanged prefix
    expect(after.slice(0, before.length)).toEqual(before);
    const allowedEvent = after[before.length];
    expect(allowedEvent?.action).toBe("authorization.allowed");
    expect(allowedEvent?.outcome).toBe("allowed");
    expect(allowedEvent?.actor).toBe(PRINCIPAL_CONTRACTOR);
    expect(allowedEvent?.projectId).toBe(PROJECT_ALPHA);
    expect(allowedEvent?.targetKind).toBe("permission");
    expect(allowedEvent?.targetId).toBe(`reasoning:read@${ORG_NORTH}/${PROJECT_ALPHA}`);
    const refusedEvent = after[before.length + 1];
    expect(refusedEvent?.action).toBe("authorization.refused");
    expect(refusedEvent?.outcome).toBe("refused");
    expect(refusedEvent?.actor).toBe(PRINCIPAL_ENGINEER_SOUTH);
    expect(refusedEvent?.detail).toContain("cross_tenant");
  });

  test("authorizeAndAudit against a NONEXISTENT org returns the decision un-audited (documented)", async () => {
    const { service, store } = await world();
    const decision = await service.authorizeAndAudit(PRINCIPAL_FOUNDER_NORTH, "reality:read", {
      kind: "organization",
      organizationId: "org-nowhere",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal.code).toBe("organization_not_found");
    }
    expect(await store.listAuditEvents("org-nowhere")).toEqual([]);
  });

  test("the audit log is queryable by project and by actor", async () => {
    const { service } = await world();
    await service.authorizeAndAudit(PRINCIPAL_CONTRACTOR, "reasoning:read", ALPHA_TARGET);
    const byProject = await service.listAuditEvents({
      organizationId: ORG_NORTH,
      requester: PRINCIPAL_FOUNDER_NORTH,
      projectId: PROJECT_ALPHA,
    });
    expect(byProject.map((event) => event.action)).toEqual([
      "project.created",
      "membership.granted",
      "authorization.allowed",
    ]);
    expect(byProject.every((event) => event.projectId === PROJECT_ALPHA)).toBe(true);
    const byActor = await service.listAuditEvents({
      organizationId: ORG_NORTH,
      requester: PRINCIPAL_FOUNDER_NORTH,
      actor: PRINCIPAL_CONTRACTOR,
    });
    expect(byActor).toHaveLength(1); // the contractor's authorization.allowed
    expect(byActor[0]?.actor).toBe(PRINCIPAL_CONTRACTOR);
  });

  test("guarded reads discriminate too: missing permission, cross-tenant, unknown requester", async () => {
    const { service } = await world();
    // the founder CAN read the org record
    expect(await service.getOrganization(ORG_NORTH, PRINCIPAL_FOUNDER_NORTH)).toEqual({
      organizationId: ORG_NORTH,
      name: "North Construction",
      createdAt: FIXED_NOW,
    });
    // the contractor (no identity surface) CANNOT
    await expectCode(() => service.getOrganization(ORG_NORTH, PRINCIPAL_CONTRACTOR), "missing_permission");
    // a south member CANNOT read north
    await expectCode(() => service.getOrganization(ORG_NORTH, PRINCIPAL_ENGINEER_SOUTH), "cross_tenant");
    // an unregistered requester CANNOT
    await expectCode(() => service.getOrganization(ORG_NORTH, "principal-ghost"), "unknown_principal");
    // the audit log itself needs audit:read
    await expectCode(
      () =>
        service.listAuditEvents({
          organizationId: ORG_NORTH,
          requester: PRINCIPAL_CONTRACTOR,
        }),
      "missing_permission",
    );
    // a north project list is visible to the founder, empty of foreign projects
    const projects = await service.listProjects(ORG_NORTH, PRINCIPAL_FOUNDER_NORTH);
    expect(projects.map((project) => project.projectId)).toEqual([PROJECT_ALPHA, PROJECT_BETA]);
  });
});

describe("identity service: retention policy honesty", () => {
  test("setRetentionPolicy requires audit:admin and audits the update", async () => {
    const { service, store } = await world();
    await expectCode(
      () =>
        service.setRetentionPolicy({
          organizationId: ORG_NORTH,
          auditRetentionDays: 90,
          onExpiry: "prune",
          actor: PRINCIPAL_CONTRACTOR,
        }),
      "missing_permission",
    );
    const policy = await service.setRetentionPolicy({
      organizationId: ORG_NORTH,
      auditRetentionDays: 90,
      onExpiry: "prune",
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(policy).toEqual({
      organizationId: ORG_NORTH,
      auditRetentionDays: 90,
      onExpiry: "prune",
      updatedAt: FIXED_NOW,
      updatedBy: PRINCIPAL_FOUNDER_NORTH,
    });
    const log = await store.listAuditEvents(ORG_NORTH);
    expect(log[log.length - 1]?.action).toBe("retention.policy_updated");
    expect(await service.getRetentionPolicy(ORG_NORTH, PRINCIPAL_FOUNDER_NORTH)).toEqual(policy);
  });

  test("enforcement without an installed policy is a typed refusal, never a silent no-op", async () => {
    const { service } = await world();
    await expectCode(
      () =>
        service.enforceRetention({
          organizationId: ORG_NORTH,
          actor: PRINCIPAL_FOUNDER_NORTH,
        }),
      "retention_policy_required",
    );
  });

  test("PRUNE mode: expired events are removed AND recorded verbatim — never silent", async () => {
    const { service, store } = await world();
    const before = await store.listAuditEvents(ORG_NORTH);
    expect(before).toHaveLength(9);
    // policy + enforcement happen MONTHS later than the events
    const later = serviceAt(store, () => FIXED_MONTHS_LATER);
    await later.setRetentionPolicy({
      organizationId: ORG_NORTH,
      auditRetentionDays: 90,
      onExpiry: "prune",
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const report = await later.enforceRetention({
      organizationId: ORG_NORTH,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(report.mode).toBe("prune");
    expect(report.prunedEventIds).toEqual(before.map((event) => event.eventId));
    expect(report.flaggedEventIds).toEqual([]);
    expect(report.auditEventId).not.toBeNull();
    // the log now holds exactly the policy event + the prune event…
    const after = await store.listAuditEvents(ORG_NORTH);
    expect(after.map((event) => event.action)).toEqual([
      "retention.policy_updated",
      "retention.enforced",
    ]);
    // …and the prune event records EVERY removed id verbatim
    const pruneEvent = after[1];
    expect(pruneEvent?.retention).toEqual({
      mode: "prune",
      cutoff: report.cutoff,
      prunedEventIds: before.map((event) => event.eventId),
      flaggedEventIds: [],
    });
    // the surviving events chain onto each other; the FIRST survivor's own
    // previousEventDigest still names the last PRUNED event (recorded verbatim
    // in prunedEventIds — the removal stays verifiable, never silently re-sealed)
    expect(after[0]?.previousEventDigest).toBe(before[8]?.eventDigest);
    expect(after[1]?.previousEventDigest).toBe(after[0]?.eventDigest);
    // a second run at the same instant is an honest no-op: nothing appended
    const noop = await later.enforceRetention({
      organizationId: ORG_NORTH,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(noop.auditEventId).toBeNull();
    expect(await store.listAuditEvents(ORG_NORTH)).toHaveLength(2);
  });

  test("PRUNE mode with survivors: retained events keep their bytes; the prune event chains onto the last survivor", async () => {
    const { service, store } = await world();
    // an authorization decision MONTHS LATER survives a 90-day window
    const later = serviceAt(store, () => FIXED_MONTHS_LATER);
    await later.setRetentionPolicy({
      organizationId: ORG_NORTH,
      auditRetentionDays: 90,
      onExpiry: "prune",
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    await later.authorizeAndAudit(PRINCIPAL_FOUNDER_NORTH, "identity:read", ORG_TARGET);
    const before = await store.listAuditEvents(ORG_NORTH);
    const report = await later.enforceRetention({
      organizationId: ORG_NORTH,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const after = await store.listAuditEvents(ORG_NORTH);
    // the 9 fixture events (FIXED_NOW) were pruned; the policy + decision
    // events (FIXED_MONTHS_LATER) survived
    expect(report.prunedEventIds).toHaveLength(9);
    expect(after.length).toBe(before.length - 9 + 1);
    expect(after[0]?.action).toBe("retention.policy_updated");
    expect(after[1]?.action).toBe("authorization.allowed");
    // append-only for survivors: the retained events are byte-identical
    expect(after[0]).toEqual(before[9]);
    expect(after[1]).toEqual(before[10]);
    // the prune event chains onto the LAST RETAINED event
    const pruneEvent = after[after.length - 1];
    expect(pruneEvent?.action).toBe("retention.enforced");
    expect(pruneEvent?.previousEventDigest).toBe(after[after.length - 2]?.eventDigest);
  });

  test("FLAG mode: nothing is removed; flagged ids are recorded and reads mark them", async () => {
    const { service, store } = await world();
    const later = serviceAt(store, () => FIXED_MONTHS_LATER);
    await later.setRetentionPolicy({
      organizationId: ORG_NORTH,
      auditRetentionDays: 90,
      onExpiry: "flag",
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const before = await store.listAuditEvents(ORG_NORTH);
    const report = await later.enforceRetention({
      organizationId: ORG_NORTH,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(report.mode).toBe("flag");
    expect(report.prunedEventIds).toEqual([]);
    expect(report.flaggedEventIds).toEqual(
      before.slice(0, 9).map((event) => event.eventId),
    );
    // NOTHING was removed: the entire prior log is the unchanged prefix
    const after = await store.listAuditEvents(ORG_NORTH);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1]?.action).toBe("retention.enforced");
    expect(after[after.length - 1]?.retention?.mode).toBe("flag");
    // reads annotate past-window events honestly
    const views = await later.listAuditEvents({
      organizationId: ORG_NORTH,
      requester: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(views.slice(0, 9).every((view) => view.retentionExpired)).toBe(true);
    expect(views[9]?.retentionExpired).toBe(false); // policy event (later instant)
    expect(views[10]?.retentionExpired).toBe(false); // the flag event itself
  });

  test("a no-op enforcement run appends NOTHING (a no-op is not a state change)", async () => {
    const { service, store } = await world();
    await service.setRetentionPolicy({
      organizationId: ORG_NORTH,
      auditRetentionDays: 3650,
      onExpiry: "prune",
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const before = await store.listAuditEvents(ORG_NORTH);
    const report = await service.enforceRetention({
      organizationId: ORG_NORTH,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(report.prunedEventIds).toEqual([]);
    expect(report.flaggedEventIds).toEqual([]);
    expect(report.auditEventId).toBeNull();
    expect(await store.listAuditEvents(ORG_NORTH)).toEqual(before);
  });

  test("no policy ⇒ infinite retention: reads annotate nothing, events never expire", async () => {
    const { service } = await world();
    const views = await service.listAuditEvents({
      organizationId: ORG_NORTH,
      requester: PRINCIPAL_FOUNDER_NORTH,
    });
    expect(views.every((view) => view.retentionExpired === false)).toBe(true);
    expect(await service.getRetentionPolicy(ORG_NORTH, PRINCIPAL_FOUNDER_NORTH)).toBeNull();
  });
});

describe("identity service: byte-determinism", () => {
  test("two fresh stores fed the same sequence produce byte-identical audit logs", async () => {
    const first = new InMemoryIdentityStore();
    const second = new InMemoryIdentityStore();
    for (const store of [first, second]) {
      const service = await buildFixtureWorld(store, fixedClock);
      await service.authorizeAndAudit(PRINCIPAL_CONTRACTOR, "reasoning:read", ALPHA_TARGET);
      await service.authorizeAndAudit(PRINCIPAL_ENGINEER_SOUTH, "reality:read", ORG_TARGET);
      await service.grantMembership({
        organizationId: ORG_NORTH,
        principalId: PRINCIPAL_UNINVITED,
        roleId: ROLE_PROJECT_ENGINEER,
        scope: { kind: "project", projectId: PROJECT_BETA },
        actor: PRINCIPAL_FOUNDER_NORTH,
      });
    }
    expect(canonicalJsonStringify(await second.listAuditEvents(ORG_NORTH))).toBe(
      canonicalJsonStringify(await first.listAuditEvents(ORG_NORTH)),
    );
    expect(canonicalJsonStringify(await second.listMemberships(ORG_NORTH))).toBe(
      canonicalJsonStringify(await first.listMemberships(ORG_NORTH)),
    );
  });

  test("the surveyor role carries exactly the AI-context read set (fixture pin)", async () => {
    const { service } = await world();
    const roles = await service.listRoles(ORG_NORTH, PRINCIPAL_FOUNDER_NORTH);
    const surveyor = roles.find((role) => role.roleId === ROLE_SURVEYOR);
    expect(surveyor?.permissions).toEqual([...SURVEYOR_PERMISSIONS]);
  });
});

/** The contractor's membership id (helper for the revocation test). */
async function membershipOf(
  service: IdentityService,
  principalId: string,
): Promise<{ membershipId: string }> {
  const memberships = await service.listMemberships(ORG_NORTH, PRINCIPAL_FOUNDER_NORTH);
  const membership = memberships.find((entry) => entry.principalId === principalId);
  expect(membership).toBeDefined();
  return { membershipId: membership?.membershipId ?? "" };
}
