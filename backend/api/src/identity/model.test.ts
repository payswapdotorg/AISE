/**
 * AISE-036 — identity model tests: the frozen vocabularies, permission
 * algebra, audit-chain determinism, boundary parsers and typed errors.
 */

import { describe, expect, test } from "bun:test";
import {
  AUDIT_ACTIONS,
  AUDIT_GENESIS_DIGEST,
  AUTHORIZATION_REFUSAL_CODES,
  DOMAIN_SURFACES,
  GRANULARITY_RANK,
  IDENTITY_ERROR_CODES,
  PERMISSIONS,
  PERMISSION_GRANULARITIES,
  IdentityError,
  auditSeedDigest,
  describeScope,
  describeTarget,
  isPermission,
  isAuditEventExpired,
  parseAuthorizeInput,
  parseCreateOrganizationInput,
  parseCreateProjectInput,
  parseCreateRoleInput,
  parseGrantMembershipInput,
  parsePermissionSet,
  parseScope,
  parseSetRetentionPolicyInput,
  parseTarget,
  parseAuditEvent,
  parseMembershipRecord,
  permissionGranularity,
  permissionImplies,
  permissionSurface,
  retentionCutoff,
  scopeCoversTarget,
  scopeEquals,
  sealAuditEvent,
  sealAuditEvents,
  validateOrganizationId,
  type AuditEventSeed,
  type IdentityErrorCode,
} from "./model";

function expectCode(fn: () => unknown, code: IdentityErrorCode): void {
  try {
    fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityError);
    expect((error as IdentityError).code).toBe(code);
  }
}

describe("identity model: frozen permission vocabulary", () => {
  test("registry is exactly read/write/admin per domain surface (13 × 3)", () => {
    expect(PERMISSIONS).toHaveLength(DOMAIN_SURFACES.length * PERMISSION_GRANULARITIES.length);
    for (const surface of DOMAIN_SURFACES) {
      for (const granularity of PERMISSION_GRANULARITIES) {
        expect(isPermission(`${surface}:${granularity}`)).toBe(true);
      }
    }
    // surfaces named after the requirements doc's domain areas
    expect([...DOMAIN_SURFACES]).toEqual([
      "mission",
      "capture",
      "evidence",
      "reconstruction",
      "reality",
      "boq",
      "case",
      "intervention",
      "verification",
      "assurance",
      "reasoning",
      "identity",
      "audit",
    ]);
  });

  test("isPermission rejects unknown strings, non-strings and shape drift", () => {
    expect(isPermission("reality:read")).toBe(true);
    expect(isPermission("reality:delete")).toBe(false);
    expect(isPermission("reality")).toBe(false);
    expect(isPermission("Reality:Read")).toBe(false);
    expect(isPermission(42)).toBe(false);
    expect(isPermission(null)).toBe(false);
    expect(isPermission("unknown:read")).toBe(false);
  });

  test("permissionSurface / permissionGranularity split and the ladder rank", () => {
    expect(permissionSurface("reality:admin")).toBe("reality");
    expect(permissionGranularity("reality:admin")).toBe("admin");
    expect(GRANULARITY_RANK.read).toBeLessThan(GRANULARITY_RANK.write);
    expect(GRANULARITY_RANK.write).toBeLessThan(GRANULARITY_RANK.admin);
  });

  test("permissionImplies: same-surface ladder only, never cross-surface", () => {
    expect(permissionImplies("reality:read", "reality:read")).toBe(true);
    expect(permissionImplies("reality:write", "reality:read")).toBe(true);
    expect(permissionImplies("reality:admin", "reality:write")).toBe(true);
    expect(permissionImplies("reality:admin", "reality:read")).toBe(true);
    // finer never satisfies coarser
    expect(permissionImplies("reality:read", "reality:write")).toBe(false);
    expect(permissionImplies("reality:write", "reality:admin")).toBe(false);
    // never cross-surface, even at admin
    expect(permissionImplies("reality:admin", "boq:read")).toBe(false);
    expect(permissionImplies("identity:admin", "audit:read")).toBe(false);
  });
});

describe("identity model: scopes and targets", () => {
  test("org scope covers the org and every project; project scope only its project", () => {
    const org = { kind: "organization" } as const;
    const alpha = { kind: "project", organizationId: "org-1", projectId: "alpha" } as const;
    expect(scopeCoversTarget(org, { kind: "organization", organizationId: "org-1" })).toBe(true);
    expect(scopeCoversTarget(org, alpha)).toBe(true);
    expect(scopeCoversTarget({ kind: "project", projectId: "alpha" }, alpha)).toBe(true);
    expect(scopeCoversTarget({ kind: "project", projectId: "beta" }, alpha)).toBe(false);
    // a project scope NEVER authorizes an org-level target
    expect(
      scopeCoversTarget(
        { kind: "project", projectId: "alpha" },
        { kind: "organization", organizationId: "org-1" },
      ),
    ).toBe(false);
  });

  test("scopeEquals discriminates kind and project id", () => {
    expect(scopeEquals({ kind: "organization" }, { kind: "organization" })).toBe(true);
    expect(scopeEquals({ kind: "project", projectId: "a" }, { kind: "project", projectId: "a" })).toBe(true);
    expect(scopeEquals({ kind: "project", projectId: "a" }, { kind: "project", projectId: "b" })).toBe(false);
    expect(scopeEquals({ kind: "organization" }, { kind: "project", projectId: "a" })).toBe(false);
  });

  test("describeScope/describeTarget name org and project deterministically", () => {
    expect(describeScope({ kind: "organization" })).toBe("organization scope");
    expect(describeScope({ kind: "project", projectId: "alpha" })).toBe("project alpha scope");
    expect(describeTarget({ kind: "organization", organizationId: "org-1" })).toBe(
      "organization org-1",
    );
    expect(
      describeTarget({ kind: "project", organizationId: "org-1", projectId: "alpha" }),
    ).toBe("project alpha of organization org-1");
  });
});

describe("identity model: registries and typed errors", () => {
  test("every authorization refusal code is an identity error code (typed, never ad hoc)", () => {
    for (const code of AUTHORIZATION_REFUSAL_CODES) {
      expect(IDENTITY_ERROR_CODES).toContain(code);
    }
    // the discrimination matrix is distinct: no duplicates in the registry
    expect(new Set(IDENTITY_ERROR_CODES).size).toBe(IDENTITY_ERROR_CODES.length);
  });

  test("IdentityError carries code + detail and a stable message shape", () => {
    const error = new IdentityError("cross_tenant", "names principal and target");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IdentityError");
    expect(error.code).toBe("cross_tenant");
    expect(error.detail).toBe("names principal and target");
    expect(error.message).toBe("cross_tenant: names principal and target");
  });

  test("id validators enforce the 1..256 bound with typed codes", () => {
    expectCode(() => validateOrganizationId(""), "invalid_organization_id");
    expectCode(() => validateOrganizationId("x".repeat(257)), "invalid_organization_id");
    validateOrganizationId("org-1");
  });
});

describe("identity model: boundary parsers", () => {
  test("parsePermissionSet: frozen subset only, no duplicates, non-empty", () => {
    expect(parsePermissionSet(["reality:read", "evidence:read"])).toEqual([
      "reality:read",
      "evidence:read",
    ]);
    expectCode(() => parsePermissionSet([]), "empty_permission_set");
    expectCode(() => parsePermissionSet("reality:read"), "empty_permission_set");
    expectCode(() => parsePermissionSet(["reality:read", "reality:read"]), "duplicate_permission");
    expectCode(() => parsePermissionSet(["reality:read", "omni:read"]), "unknown_permission");
    expectCode(() => parsePermissionSet(["reality:read", 7]), "unknown_permission");
  });

  test("parseScope and parseTarget shape discipline", () => {
    expect(parseScope({ kind: "organization" })).toEqual({ kind: "organization" });
    expect(parseScope({ kind: "project", projectId: "alpha" })).toEqual({
      kind: "project",
      projectId: "alpha",
    });
    expectCode(() => parseScope({ kind: "site" }), "invalid_scope");
    expectCode(() => parseScope({ kind: "project" }), "invalid_scope");
    expectCode(() => parseScope("project"), "invalid_scope");
    expect(
      parseTarget({ kind: "project", organizationId: "org-1", projectId: "alpha" }),
    ).toEqual({ kind: "project", organizationId: "org-1", projectId: "alpha" });
    expect(parseTarget({ kind: "organization", organizationId: "org-1" })).toEqual({
      kind: "organization",
      organizationId: "org-1",
    });
    expectCode(() => parseTarget({ kind: "organization" }), "invalid_target");
    expectCode(() => parseTarget({ kind: "project", organizationId: "org-1" }), "invalid_target");
    expectCode(() => parseTarget({ kind: "space", organizationId: "org-1" }), "invalid_target");
  });

  test("parseCreateOrganizationInput: founder parsing + typed rejections", () => {
    expect(parseCreateOrganizationInput({ organizationId: "org-1", name: "North" })).toEqual({
      organizationId: "org-1",
      name: "North",
    });
    expect(
      parseCreateOrganizationInput({
        organizationId: "org-1",
        name: "North",
        founder: { principalId: "p-1", permissions: ["reality:read"] },
      }),
    ).toEqual({
      organizationId: "org-1",
      name: "North",
      founder: { principalId: "p-1", permissions: ["reality:read"] },
    });
    expectCode(() => parseCreateOrganizationInput({ name: "North" }), "invalid_organization_id");
    expectCode(() => parseCreateOrganizationInput({ organizationId: "org-1" }), "invalid_organization");
    expectCode(
      () =>
        parseCreateOrganizationInput({
          organizationId: "org-1",
          name: "North",
          founder: { principalId: "p-1", permissions: [] },
        }),
      "empty_permission_set",
    );
    expectCode(
      () =>
        parseCreateOrganizationInput({
          organizationId: "org-1",
          name: "North",
          founder: { principalId: "p-1", permissions: ["nope:read"] },
        }),
      "unknown_permission",
    );
  });

  test("mutation parsers require an actor (the explicit authn boundary)", () => {
    expect(parseCreateProjectInput({ projectId: "p", name: "N", actor: "a" }, "org-1")).toEqual({
      organizationId: "org-1",
      projectId: "p",
      name: "N",
      actor: "a",
    });
    expectCode(
      () => parseCreateProjectInput({ projectId: "p", name: "N" }, "org-1"),
      "invalid_actor",
    );
    expectCode(() => parseCreateProjectInput({ name: "N", actor: "a" }, "org-1"), "invalid_project_id");
    expect(
      parseCreateRoleInput(
        { roleId: "r", name: "R", permissions: ["audit:read"], actor: "a" },
        "org-1",
      ),
    ).toEqual({
      organizationId: "org-1",
      roleId: "r",
      name: "R",
      permissions: ["audit:read"],
      actor: "a",
    });
    expectCode(
      () => parseCreateRoleInput({ roleId: "r", name: "R", permissions: [], actor: "a" }, "org-1"),
      "empty_permission_set",
    );
    expect(
      parseGrantMembershipInput(
        { principalId: "p", roleId: "r", scope: { kind: "project", projectId: "x" }, actor: "a" },
        "org-1",
      ),
    ).toEqual({
      organizationId: "org-1",
      principalId: "p",
      roleId: "r",
      scope: { kind: "project", projectId: "x" },
      actor: "a",
    });
    expectCode(
      () => parseGrantMembershipInput({ principalId: "p", roleId: "r", scope: {}, actor: "a" }, "org-1"),
      "invalid_scope",
    );
  });

  test("retention and authorize parsers", () => {
    expect(
      parseSetRetentionPolicyInput({ auditRetentionDays: 30, onExpiry: "prune", actor: "a" }, "org-1"),
    ).toEqual({ organizationId: "org-1", auditRetentionDays: 30, onExpiry: "prune", actor: "a" });
    expectCode(
      () => parseSetRetentionPolicyInput({ auditRetentionDays: -1, onExpiry: "prune", actor: "a" }, "org-1"),
      "invalid_retention_policy",
    );
    expectCode(
      () => parseSetRetentionPolicyInput({ auditRetentionDays: 1.5, onExpiry: "prune", actor: "a" }, "org-1"),
      "invalid_retention_policy",
    );
    expectCode(
      () => parseSetRetentionPolicyInput({ auditRetentionDays: 30, onExpiry: "shred", actor: "a" }, "org-1"),
      "invalid_retention_policy",
    );
    expect(
      parseAuthorizeInput({
        principalId: "p",
        permission: "reality:read",
        target: { kind: "organization", organizationId: "org-1" },
      }),
    ).toEqual({
      principalId: "p",
      permission: "reality:read",
      target: { kind: "organization", organizationId: "org-1" },
    });
    expectCode(
      () =>
        parseAuthorizeInput({
          principalId: "p",
          permission: "reality:delete",
          target: { kind: "organization", organizationId: "org-1" },
        }),
      "unknown_permission",
    );
  });
});

describe("identity model: audit chain determinism", () => {
  const seed = (occurredAt: string): AuditEventSeed => ({
    organizationId: "org-1",
    actor: "principal-1",
    action: "membership.granted",
    targetKind: "membership",
    targetId: "org-1:mem-1",
    outcome: "allowed",
    occurredAt,
  });

  test("event ids are content-derived (evt-<16 hex>) and chain-bound", () => {
    const event = sealAuditEvent(seed("2026-01-01T00:00:00Z"), AUDIT_GENESIS_DIGEST);
    expect(event.eventId).toMatch(/^evt-[0-9a-f]{16}$/);
    expect(event.eventDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(event.previousEventDigest).toBe(AUDIT_GENESIS_DIGEST);
    // deterministic: same seed + same predecessor => byte-identical event
    expect(sealAuditEvent(seed("2026-01-01T00:00:00Z"), AUDIT_GENESIS_DIGEST)).toEqual(event);
    // a different predecessor flips id AND digest (chain position matters)
    const other = sealAuditEvent(seed("2026-01-01T00:00:00Z"), "0".repeat(64));
    expect(other.eventId).not.toBe(event.eventId);
    expect(other.eventDigest).not.toBe(event.eventDigest);
    // the digest is recomputable from the content + chain link
    expect(auditSeedDigest(seed("2026-01-01T00:00:00Z"), AUDIT_GENESIS_DIGEST)).toBe(
      event.eventDigest,
    );
  });

  test("sealAuditEvents chains a batch sequentially", () => {
    const events = sealAuditEvents(
      [seed("2026-01-01T00:00:00Z"), seed("2026-01-02T00:00:00Z")],
      AUDIT_GENESIS_DIGEST,
    );
    expect(events).toHaveLength(2);
    expect(events[1]?.previousEventDigest).toBe(events[0]?.eventDigest);
    expect(events[0]?.previousEventDigest).toBe(AUDIT_GENESIS_DIGEST);
    // identical content twice still yields distinct events (chain advances)
    const twins = sealAuditEvents([seed("t"), seed("t")], AUDIT_GENESIS_DIGEST);
    expect(twins[0]?.eventId).not.toBe(twins[1]?.eventId);
  });

  test("retention cutoff arithmetic and strict-before expiry", () => {
    expect(retentionCutoff("2026-02-02T09:00:00.000Z", 30)).toBe("2026-01-03T09:00:00.000Z");
    expect(retentionCutoff("2026-02-02T09:00:00.000Z", 0)).toBe("2026-02-02T09:00:00.000Z");
    const event = { ...sealAuditEvent(seed("2026-01-01T00:00:00Z"), AUDIT_GENESIS_DIGEST) };
    expect(isAuditEventExpired(event, "2026-01-02T00:00:00Z")).toBe(true);
    expect(isAuditEventExpired(event, "2026-01-01T00:00:00Z")).toBe(false); // strict before only
    expect(isAuditEventExpired(event, "2025-12-31T00:00:00Z")).toBe(false);
  });
});

describe("identity model: persisted-record parsers", () => {
  test("a sealed audit event round-trips through parseAuditEvent", () => {
    const event = sealAuditEvent(
      {
        organizationId: "org-1",
        projectId: "alpha",
        actor: "principal-1",
        action: "retention.enforced",
        targetKind: "audit_log",
        targetId: "org-1",
        outcome: "allowed",
        detail: "prune run",
        retention: { mode: "prune", cutoff: "2026-01-01T00:00:00Z", prunedEventIds: ["evt-1"], flaggedEventIds: [] },
        occurredAt: "2026-01-01T00:00:00Z",
      },
      AUDIT_GENESIS_DIGEST,
    );
    expect(parseAuditEvent(JSON.parse(JSON.stringify(event)) as unknown)).toEqual(event);
  });

  test("garbage records are typed invalid_identity_record, never silent", () => {
    expectCode(() => parseAuditEvent({ nope: true }), "invalid_identity_record");
    expectCode(() => parseAuditEvent("evt-1"), "invalid_identity_record");
    expectCode(
      () =>
        parseMembershipRecord({
          membershipId: "mem-1",
          organizationId: "org-1",
          principalId: "p",
          roleId: "r",
          scope: { kind: "organization" },
          state: "suspended",
          grantedAt: "t",
          grantedBy: "a",
        }),
      "invalid_identity_record",
    );
    expectCode(
      () =>
        parseMembershipRecord({
          membershipId: "mem-1",
          organizationId: "org-1",
          principalId: "p",
          roleId: "r",
          scope: { kind: "organization" },
          state: "revoked",
          grantedAt: "t",
          grantedBy: "a",
          // revokedAt/revokedBy missing — an incomplete revocation is garbage
        }),
      "invalid_identity_record",
    );
  });

  test("the audit action registry covers the governed acts (no dead entries)", () => {
    expect([...AUDIT_ACTIONS]).toEqual([
      "organization.created",
      "project.created",
      "role.created",
      "membership.granted",
      "membership.revoked",
      "retention.policy_updated",
      "retention.enforced",
      "authorization.allowed",
      "authorization.refused",
    ]);
  });
});
