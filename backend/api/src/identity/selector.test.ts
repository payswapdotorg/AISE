/**
 * AISE-036 — least-privilege AI context selection tests. THE DISCRIMINATION
 * CONTRACT: a principal without read on X never sees X in the selected
 * context — and every exclusion is recorded honestly (kind, id, missing
 * permission, refusal reason), never silently dropped.
 *
 * Also pins: the reasoning-gate precedence (no reasoning:read ⇒ the WHOLE
 * selection is a typed refusal, never an empty context), the fixed resolver
 * call order, purity over frozen candidate contexts, byte-determinism, and
 * the binding to the real IdentityService decision procedure.
 */

import { describe, expect, test } from "bun:test";
import type { AuthorizationDecision, Permission } from "./model";
import { selectLeastPrivilegeContext, SELECTION_REFUSAL_CODES } from "./selector";
import { InMemoryIdentityStore } from "./store";
import {
  ORG_NORTH,
  ORG_SOUTH,
  PRINCIPAL_CONTRACTOR,
  PRINCIPAL_ENGINEER_SOUTH,
  PRINCIPAL_FOUNDER_NORTH,
  PRINCIPAL_UNINVITED,
  PROJECT_ALPHA,
  PROJECT_BETA,
  ROLE_READER,
  buildFixtureWorld,
  candidateContext,
  deepFreeze,
  fixedClock,
} from "./testkit";
import type { GroundedContext } from "../reasoning/model";

const ALPHA_TARGET = {
  kind: "project",
  organizationId: ORG_NORTH,
  projectId: PROJECT_ALPHA,
} as const;

/** A resolver that allows exactly the given permissions, refuses the rest. */
function allowing(
  allowed: readonly Permission[],
  refusalCode = "missing_permission",
): { resolve: Parameters<typeof selectLeastPrivilegeContext>[3]; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolve: (principalId: string, permission: Permission) => {
      calls.push(`${principalId}:${permission}`);
      if (allowed.includes(permission)) {
        return Promise.resolve({ allowed: true } as AuthorizationDecision);
      }
      return Promise.resolve({
        allowed: false,
        refusal: {
          code: refusalCode,
          detail: `principal ${principalId} holds no ${permission}`,
          principalId,
          target: ALPHA_TARGET,
        },
      } as AuthorizationDecision);
    },
  };
}

describe("selector: the reasoning gate (precedence over filtering)", () => {
  test("no reasoning:read ⇒ the WHOLE selection is a typed refusal, never an empty context", async () => {
    const resolver = allowing(["reality:read", "evidence:read", "verification:read", "case:read"]);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_UNINVITED,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("refused");
    if (selection.kind !== "refused") {
      expect.unreachable("narrowing");
    }
    expect(selection.code).toBe("REASONING_PERMISSION_REQUIRED");
    expect([...SELECTION_REFUSAL_CODES]).toEqual(["REASONING_PERMISSION_REQUIRED"]);
    // the underlying authorization refusal is carried VERBATIM
    expect(selection.authorization.code).toBe("missing_permission");
    expect(selection.authorization.detail).toContain("reasoning:read");
    expect(selection.authorization.principalId).toBe(PRINCIPAL_UNINVITED);
    // and the resolver short-circuits: exactly ONE call happened
    expect(resolver.calls).toEqual([`${PRINCIPAL_UNINVITED}:reasoning:read`]);
  });

  test("the refusal carries the underlying cross-tenant refusal verbatim (real codes flow through)", async () => {
    const resolver = allowing([], "cross_tenant");
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_ENGINEER_SOUTH,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("refused");
    if (selection.kind === "selected") {
      expect.unreachable("refused expected");
    }
    expect(selection.authorization.code).toBe("cross_tenant");
    expect(selection.authorization.principalId).toBe(PRINCIPAL_ENGINEER_SOUTH);
  });
});

describe("selector: per-surface least-privilege discrimination", () => {
  test("full read permissions ⇒ everything is selected VERBATIM (same references, no exclusions)", async () => {
    const context = candidateContext();
    const resolver = allowing([
      "reasoning:read",
      "reality:read",
      "evidence:read",
      "verification:read",
      "case:read",
    ]);
    const selection = await selectLeastPrivilegeContext(
      context,
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    // same object references — nothing is copied, mutated or re-derived
    expect(selection.context.graphSnapshot.nodes).toBe(context.graphSnapshot.nodes);
    expect(selection.context.graphSnapshot.relationships).toBe(
      context.graphSnapshot.relationships,
    );
    expect(selection.context.evidenceRecords).toBe(context.evidenceRecords);
    expect(selection.context.verificationFindings).toBe(context.verificationFindings);
    expect(selection.context.cases).toBe(context.cases);
    expect(selection.context.rules).toBe(context.rules);
    expect(selection.exclusions).toEqual([]);
  });

  test("no reality:read ⇒ NO node and NO relationship enters the context; each is excluded honestly", async () => {
    const resolver = allowing(["reasoning:read", "evidence:read", "verification:read", "case:read"]);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.graphSnapshot.nodes).toEqual([]);
    expect(selection.context.graphSnapshot.relationships).toEqual([]);
    const nodeExclusions = selection.exclusions.filter((entry) => entry.kind === "graph_node");
    const relationshipExclusions = selection.exclusions.filter(
      (entry) => entry.kind === "relationship",
    );
    expect(nodeExclusions.map((entry) => entry.id)).toEqual([
      "node-wall-north",
      "node-wall-south",
    ]);
    expect(relationshipExclusions.map((entry) => entry.id)).toEqual(["rel-contains-wall-north"]);
    for (const exclusion of [...nodeExclusions, ...relationshipExclusions]) {
      expect(exclusion.requiredPermission).toBe("reality:read");
      expect(exclusion.reason).toContain("missing_permission");
      expect(exclusion.reason).toContain("reality:read");
    }
  });

  test("no evidence:read ⇒ evidence records never enter; excluded by contentId", async () => {
    const resolver = allowing(["reasoning:read", "reality:read", "verification:read", "case:read"]);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.evidenceRecords).toEqual([]);
    const evidenceExclusions = selection.exclusions.filter(
      (entry) => entry.kind === "evidence_record",
    );
    expect(evidenceExclusions.map((entry) => entry.id)).toEqual([
      "ev-wall-north-depth",
      "ev-wall-south-manual",
    ]);
    for (const exclusion of evidenceExclusions) {
      expect(exclusion.requiredPermission).toBe("evidence:read");
    }
    // graph content still flows (per-surface gating, not blanket)
    expect(selection.context.graphSnapshot.nodes).toHaveLength(2);
  });

  test("no verification:read ⇒ findings never enter; deterministic finding identity", async () => {
    const resolver = allowing(["reasoning:read", "reality:read", "evidence:read", "case:read"]);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.verificationFindings).toEqual([]);
    const findingExclusions = selection.exclusions.filter(
      (entry) => entry.kind === "verification_finding",
    );
    // findings have no id: code + subject node ids is the deterministic identity
    expect(findingExclusions.map((entry) => entry.id)).toEqual(["MISSING_UNIT:node-wall-south"]);
    expect(findingExclusions[0]?.requiredPermission).toBe("verification:read");
  });

  test("no case:read ⇒ cases never enter; excluded by caseId", async () => {
    const resolver = allowing(["reasoning:read", "reality:read", "evidence:read", "verification:read"]);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.cases).toEqual([]);
    const caseExclusions = selection.exclusions.filter((entry) => entry.kind === "case");
    expect(caseExclusions.map((entry) => entry.id)).toEqual(["case-crack-1"]);
    expect(caseExclusions[0]?.requiredPermission).toBe("case:read");
  });

  test("only reasoning:read ⇒ EVERYTHING else is excluded, in the fixed order", async () => {
    const resolver = allowing(["reasoning:read"]);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.graphSnapshot.nodes).toEqual([]);
    expect(selection.context.graphSnapshot.relationships).toEqual([]);
    expect(selection.context.evidenceRecords).toEqual([]);
    expect(selection.context.verificationFindings).toEqual([]);
    expect(selection.context.cases).toEqual([]);
    // rules travel WITH the reasoning permission (policy statements, not tenant data)
    expect(selection.context.rules).toEqual([
      "Structural safety conclusions require chartered-engineer review.",
    ]);
    // the complete, honest exclusion record in the fixed order:
    // nodes, relationships, evidence, findings, cases
    expect(selection.exclusions.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "graph_node:node-wall-north",
      "graph_node:node-wall-south",
      "relationship:rel-contains-wall-north",
      "evidence_record:ev-wall-north-depth",
      "evidence_record:ev-wall-south-manual",
      "verification_finding:MISSING_UNIT:node-wall-south",
      "case:case-crack-1",
    ]);
  });
});

describe("selector: discipline, purity and determinism", () => {
  test("the resolver is called exactly once per surface, in the FIXED order", async () => {
    const resolver = allowing([
      "reasoning:read",
      "reality:read",
      "evidence:read",
      "verification:read",
      "case:read",
    ]);
    await selectLeastPrivilegeContext(candidateContext(), "p-1", ALPHA_TARGET, resolver.resolve);
    expect(resolver.calls).toEqual([
      "p-1:reasoning:read",
      "p-1:reality:read",
      "p-1:evidence:read",
      "p-1:verification:read",
      "p-1:case:read",
    ]);
  });

  test("the candidate context is never mutated (deep-frozen input survives)", async () => {
    const context = deepFreeze(candidateContext());
    const before = JSON.stringify(context);
    const resolver = allowing(["reasoning:read", "reality:read"]);
    const selection = await selectLeastPrivilegeContext(
      context,
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    expect(JSON.stringify(context)).toBe(before);
  });

  test("byte-determinism: identical inputs ⇒ byte-identical selections", async () => {
    const resolver = allowing(["reasoning:read", "reality:read", "case:read"]);
    const first = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    const second = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("a candidate context without rules stays without rules", async () => {
    const context: GroundedContext = { ...candidateContext(), rules: undefined };
    const resolver = allowing([
      "reasoning:read",
      "reality:read",
      "evidence:read",
      "verification:read",
      "case:read",
    ]);
    const selection = await selectLeastPrivilegeContext(
      context,
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.rules).toBeUndefined();
    expect("rules" in selection.context).toBe(false);
  });

  test("an empty candidate context selects empty with zero exclusions (honest emptiness)", async () => {
    const context: GroundedContext = {
      graphSnapshot: { nodes: [], relationships: [] },
      evidenceRecords: [],
      verificationFindings: [],
      cases: [],
    };
    const resolver = allowing([
      "reasoning:read",
      "reality:read",
      "evidence:read",
      "verification:read",
      "case:read",
    ]);
    const selection = await selectLeastPrivilegeContext(
      context,
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      resolver.resolve,
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.exclusions).toEqual([]);
    expect(selection.context.graphSnapshot.nodes).toEqual([]);
  });
});

describe("selector: bound to the real IdentityService decision procedure", () => {
  test("contractor (surveyor @ project alpha) gets the full context at alpha — allowed", async () => {
    const service = await buildFixtureWorld(new InMemoryIdentityStore(), fixedClock);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      ALPHA_TARGET,
      service.authorize.bind(service),
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    expect(selection.context.graphSnapshot.nodes).toHaveLength(2);
    expect(selection.context.evidenceRecords).toHaveLength(2);
    expect(selection.context.verificationFindings).toHaveLength(1);
    expect(selection.context.cases).toHaveLength(1);
    expect(selection.exclusions).toEqual([]);
  });

  test("the same contractor at project BETA: wrong_scope refusal — nothing is selected", async () => {
    const service = await buildFixtureWorld(new InMemoryIdentityStore(), fixedClock);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_CONTRACTOR,
      { kind: "project", organizationId: ORG_NORTH, projectId: PROJECT_BETA },
      service.authorize.bind(service),
    );
    expect(selection.kind).toBe("refused");
    if (selection.kind === "selected") {
      expect.unreachable("refused expected");
    }
    expect(selection.code).toBe("REASONING_PERMISSION_REQUIRED");
    expect(selection.authorization.code).toBe("wrong_scope");
    expect(selection.authorization.principalId).toBe(PRINCIPAL_CONTRACTOR);
  });

  test("a principal of ANOTHER tenant (engineer-south): cross_tenant — nothing is selected", async () => {
    const service = await buildFixtureWorld(new InMemoryIdentityStore(), fixedClock);
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_ENGINEER_SOUTH,
      ALPHA_TARGET,
      service.authorize.bind(service),
    );
    expect(selection.kind).toBe("refused");
    if (selection.kind === "selected") {
      expect.unreachable("refused expected");
    }
    expect(selection.authorization.code).toBe("cross_tenant");
    expect(selection.authorization.detail).toContain(ORG_SOUTH);
    expect(selection.authorization.principalId).toBe(PRINCIPAL_ENGINEER_SOUTH);
  });

  test("a reality-only reader (no reasoning:read): refused at the gate even though reality:read is held", async () => {
    const service = await buildFixtureWorld(new InMemoryIdentityStore(), fixedClock);
    await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: ROLE_READER,
      scope: { kind: "organization" },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_UNINVITED,
      ALPHA_TARGET,
      service.authorize.bind(service),
    );
    expect(selection.kind).toBe("refused");
    if (selection.kind === "selected") {
      expect.unreachable("refused expected");
    }
    expect(selection.code).toBe("REASONING_PERMISSION_REQUIRED");
    expect(selection.authorization.code).toBe("missing_permission");
  });

  test("reasoning+reality holder without evidence/case reads: graph flows, evidence/cases never enter", async () => {
    const service = await buildFixtureWorld(new InMemoryIdentityStore(), fixedClock);
    await service.createRole({
      organizationId: ORG_NORTH,
      roleId: "role-graph-viewer",
      name: "Graph viewer",
      permissions: ["reasoning:read", "reality:read"],
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    await service.grantMembership({
      organizationId: ORG_NORTH,
      principalId: PRINCIPAL_UNINVITED,
      roleId: "role-graph-viewer",
      scope: { kind: "project", projectId: PROJECT_ALPHA },
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
    const selection = await selectLeastPrivilegeContext(
      candidateContext(),
      PRINCIPAL_UNINVITED,
      ALPHA_TARGET,
      service.authorize.bind(service),
    );
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      expect.unreachable("narrowing");
    }
    // what the permissions allow:
    expect(selection.context.graphSnapshot.nodes).toHaveLength(2);
    expect(selection.context.graphSnapshot.relationships).toHaveLength(1);
    expect(selection.context.rules).toHaveLength(1);
    // what they do not — excluded honestly, never silently:
    expect(selection.context.evidenceRecords).toEqual([]);
    expect(selection.context.verificationFindings).toEqual([]);
    expect(selection.context.cases).toEqual([]);
    const kinds = selection.exclusions.map((entry) => entry.kind);
    expect(kinds).toContain("evidence_record");
    expect(kinds).toContain("verification_finding");
    expect(kinds).toContain("case");
    expect(kinds).not.toContain("graph_node");
  });
});
