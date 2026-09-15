/**
 * PROD-004 — the demo path tests ("Enter demo").
 *
 * THE CONTAINMENT PROOF: the demo tenant is real identity-library state and
 * the demo principal's ONLY membership is the demo organization — so the
 * tenant predicate refuses every other tenant by the same rule as for
 * everyone else. There is no blocklist and no special-casing to get wrong.
 *
 * Determinism: in-memory identity store, fixed clock, fixed ids.
 */

import { describe, expect, test } from "bun:test";
import { FIXED_NOW } from "../identity/testkit";
import { InMemoryIdentityStore } from "../identity/store";
import { IdentityService } from "../identity/service";
import {
  DEMO_ORGANIZATION_ID,
  DEMO_PRINCIPAL_DISPLAY_NAME,
  DEMO_PROJECT_IDS,
  ensureDemoTenant,
  memoizedDemoBootstrap,
} from "./demo";
import { decideTenantAccess } from "./principal";

const DEMO_PRINCIPAL = "demo-evaluator";

async function demoWorld(): Promise<{ service: IdentityService; store: InMemoryIdentityStore }> {
  const store = new InMemoryIdentityStore();
  const service = new IdentityService({ store, clock: () => FIXED_NOW });
  return { service, store };
}

describe("ensureDemoTenant (the idempotent bootstrap through the library's own acts)", () => {
  test("creates the principal, the demo organization with the demo founder, and exactly the demo projects", async () => {
    const { service, store } = await demoWorld();
    const report = await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    expect(report).toEqual({
      principalId: DEMO_PRINCIPAL,
      organizationId: DEMO_ORGANIZATION_ID,
      projectIds: DEMO_PROJECT_IDS,
      recordedActions: [
        "principal registered",
        "organization created with demo founder",
        `project ${DEMO_PROJECT_IDS[0]} registered`,
        `project ${DEMO_PROJECT_IDS[1]} registered`,
      ],
    });
    // The registry facts (through the identity library's own store):
    expect(await store.getPrincipal(DEMO_PRINCIPAL)).toEqual({
      principalId: DEMO_PRINCIPAL,
      displayName: DEMO_PRINCIPAL_DISPLAY_NAME,
      createdAt: FIXED_NOW,
    });
    expect((await store.getOrganization(DEMO_ORGANIZATION_ID))?.organizationId).toBe(DEMO_ORGANIZATION_ID);
    for (const projectId of DEMO_PROJECT_IDS) {
      expect((await store.getProject(projectId))?.organizationId).toBe(DEMO_ORGANIZATION_ID);
    }
  });

  test("re-running the bootstrap is IDEMPOTENT (typed already-exists answers are success)", async () => {
    const { service, store } = await demoWorld();
    await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    const second = await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    expect(second.recordedActions).toEqual([]);
    // No duplicate acts, no duplicate audit spam: the org's audit log keeps
    // exactly the events of the FIRST bootstrap (5 acts: org.created,
    // membership.granted, role.created, and 2 × project.created).
    const audit = await store.listAuditEvents(DEMO_ORGANIZATION_ID);
    expect(audit.length).toBe(5);
    expect(audit.map((event) => event.action)).toEqual([
      "organization.created",
      "role.created",
      "membership.granted",
      "project.created",
      "project.created",
    ]);
  });

  test("the same clock + store inputs produce byte-identical registry state (determinism)", async () => {
    const build = async (): Promise<string[]> => {
      const { service, store } = await demoWorld();
      await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
      const ids: string[] = [];
      for (const projectId of DEMO_PROJECT_IDS) {
        const project = await store.getProject(projectId);
        ids.push(project !== null ? JSON.stringify(project) : "null");
      }
      return ids;
    };
    expect(await build()).toEqual(await build());
  });
});

describe("memoizedDemoBootstrap", () => {
  test("executes the ensure exactly ONCE per memoization (same report object)", async () => {
    const { service } = await demoWorld();
    let calls = 0;
    const original = service.registerPrincipal.bind(service);
    service.registerPrincipal = async (input) => {
      calls += 1;
      return original(input);
    };
    const bootstrap = memoizedDemoBootstrap({ service, demoPrincipalId: DEMO_PRINCIPAL });
    const [first, second] = await Promise.all([bootstrap(), bootstrap()]);
    expect(second).toEqual(first);
    await bootstrap();
    expect(calls).toBe(1);
  });

  test("a failed run is NOT memoized — the next call retries", async () => {
    const { service } = await demoWorld();
    let attempts = 0;
    const original = service.createOrganization.bind(service);
    service.createOrganization = async (input) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient store failure");
      }
      return original(input);
    };
    const bootstrap = memoizedDemoBootstrap({ service, demoPrincipalId: DEMO_PRINCIPAL });
    await expect(bootstrap()).rejects.toThrow("transient store failure");
    const report = await bootstrap();
    expect(report.organizationId).toBe(DEMO_ORGANIZATION_ID);
    expect(attempts).toBe(2);
  });
});

describe("THE CONTAINMENT PROOF (structural, not a blocklist)", () => {
  test("the demo principal's ONLY membership is the demo organization", async () => {
    const { service, store } = await demoWorld();
    await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    const memberships = await store.listMembershipsByPrincipal(DEMO_PRINCIPAL);
    expect(memberships.length).toBe(1);
    expect(memberships[0]?.organizationId).toBe(DEMO_ORGANIZATION_ID);
    expect(memberships[0]?.state).toBe("active");
  });

  test("the demo tenant predicate ALLOWS the demo org and its projects for the demo principal", async () => {
    const { service, store } = await demoWorld();
    await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    const demoPrincipal = {
      principalId: DEMO_PRINCIPAL,
      displayName: DEMO_PRINCIPAL_DISPLAY_NAME,
      kind: "demo" as const,
      organizationIds: [DEMO_ORGANIZATION_ID],
      roleLabel: "Founder",
    };
    for (const scope of [
      { kind: "organization" as const, organizationId: DEMO_ORGANIZATION_ID },
      ...DEMO_PROJECT_IDS.map((projectId) => ({ kind: "project" as const, projectId })),
    ]) {
      expect(
        await decideTenantAccess({
          directory: store,
          principal: demoPrincipal,
          scope,
          method: "POST",
          mode: "demo-open",
          demoOrganizationId: DEMO_ORGANIZATION_ID,
          now: FIXED_NOW,
        }),
      ).toEqual({ allowed: true });
    }
  });

  test("the demo principal is REFUSED 403 cross_tenant for every other tenant (matrix over 3 foreign scopes)", async () => {
    const { service, store } = await demoWorld();
    await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    // A foreign tenant with its own founder and project, registered through
    // the library's own acts (real state, not a mock).
    await service.registerPrincipal({ principalId: "user-mallory", displayName: "Mallory" });
    await service.createOrganization({
      organizationId: "org-mallory",
      name: "Mallory Industries",
      founder: { principalId: "user-mallory", permissions: ["identity:admin"] },
    });
    await service.createProject({
      organizationId: "org-mallory",
      projectId: "project-mallory-1",
      name: "Mallory's project",
      actor: "user-mallory",
    });
    const demoPrincipal = {
      principalId: DEMO_PRINCIPAL,
      displayName: DEMO_PRINCIPAL_DISPLAY_NAME,
      kind: "demo" as const,
      organizationIds: [DEMO_ORGANIZATION_ID],
      roleLabel: "Founder",
    };
    for (const scope of [
      { kind: "organization" as const, organizationId: "org-mallory" },
      { kind: "project" as const, projectId: "project-mallory-1" },
    ]) {
      const decision = await decideTenantAccess({
        directory: store,
        principal: demoPrincipal,
        scope,
        method: "GET",
        mode: "demo-open",
        demoOrganizationId: DEMO_ORGANIZATION_ID,
        now: FIXED_NOW,
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.status).toBe(403);
        expect(decision.code).toBe("cross_tenant");
      }
    }
    // An UNREGISTERED foreign id is refused fail-closed as unregistered —
    // never a bypass (nobody may address an unknown tenant through the seam).
    const unregistered = await decideTenantAccess({
      directory: store,
      principal: demoPrincipal,
      scope: { kind: "organization", organizationId: "org-anything-else" },
      method: "GET",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: FIXED_NOW,
    });
    expect(unregistered).toEqual({
      allowed: false,
      code: "unregistered_organization",
      status: 403,
      detail: "organization org-anything-else is not registered in the tenancy registry",
    });
  });

  test("anonymous demo-open READS are allowed inside the demo tenant only (evaluators see content)", async () => {
    const { service, store } = await demoWorld();
    await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
    await service.registerPrincipal({ principalId: "user-mallory", displayName: "Mallory" });
    await service.createOrganization({
      organizationId: "org-mallory",
      name: "Mallory Industries",
      founder: { principalId: "user-mallory", permissions: ["identity:admin"] },
    });
    for (const scope of [
      { kind: "organization" as const, organizationId: DEMO_ORGANIZATION_ID },
      ...DEMO_PROJECT_IDS.map((projectId) => ({ kind: "project" as const, projectId })),
    ]) {
      expect(
        await decideTenantAccess({
          directory: store,
          principal: null,
          scope,
          method: "GET",
          mode: "demo-open",
          demoOrganizationId: DEMO_ORGANIZATION_ID,
          now: FIXED_NOW,
        }),
      ).toEqual({ allowed: true });
    }
    // The foreign tenant: 401 for the anonymous evaluator.
    const foreign = await decideTenantAccess({
      directory: store,
      principal: null,
      scope: { kind: "organization", organizationId: "org-mallory" },
      method: "GET",
      mode: "demo-open",
      demoOrganizationId: DEMO_ORGANIZATION_ID,
      now: FIXED_NOW,
    });
    expect(foreign.allowed).toBe(false);
    if (!foreign.allowed) {
      expect(foreign.status).toBe(401);
    }
  });
});
