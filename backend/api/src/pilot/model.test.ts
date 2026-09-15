/**
 * AISE-039 — pilot MODEL tests: frozen vocabularies, the real-vs-synthetic
 * evidence distinction, NOT_OBSERVED propagation typing, and the single
 * boundary parser's typed refusals (every failure mode DISTINCT).
 */

import { describe, expect, test } from "bun:test";
import { AUDIT_ACTIONS, PERMISSIONS } from "../identity/model";
import { MIGRATION_STATES } from "../adoption/model";
import {
  dimensionObserved,
  isPilotError,
  parsePilotSessionRecord,
  pilotDigestOf,
  PILOT_ADOPTION_METRIC_IDS,
  PILOT_BROKER_DECISIONS,
  PILOT_BROKER_UNAVAILABLE_REASONS,
  PILOT_CONNECTOR_ACTION_KINDS,
  PILOT_DIMENSIONS,
  PILOT_ERROR_CODES,
  PILOT_EVIDENCE_KINDS,
  PILOT_GATE_IDS,
  PILOT_ICP_CLASSES,
  PILOT_WALK_HOPS,
  sessionEvidenceClass,
  sessionNotObservedOf,
  validateGateId,
  validateIcpProfile,
  validateMetricId,
  validateMigrationState,
  type PilotEnvironmentSpec,
  type PilotIcpProfile,
  type PilotSessionRecord,
} from "./model";
import { runShippedPilotCampaign } from "./testkit";

/** A well-formed session harvested from the shipped recorder (once). */
let shippedSession: PilotSessionRecord | null = null;
async function sessionFixture(): Promise<PilotSessionRecord> {
  if (shippedSession === null) {
    const campaign = await runShippedPilotCampaign();
    const project = campaign.projects[0]!;
    shippedSession = project.sessions[0]!;
  }
  return shippedSession;
}

describe("pilot vocabularies (frozen, complete, distinct)", () => {
  test("ICP classes, walk hops, dimensions, evidence kinds, gates and metrics are frozen", () => {
    expect(Object.isFrozen(PILOT_ICP_CLASSES)).toBe(true);
    expect(Object.isFrozen(PILOT_WALK_HOPS)).toBe(true);
    expect(Object.isFrozen(PILOT_DIMENSIONS)).toBe(true);
    expect(Object.isFrozen(PILOT_EVIDENCE_KINDS)).toBe(true);
    expect(Object.isFrozen(PILOT_GATE_IDS)).toBe(true);
    expect(Object.isFrozen(PILOT_ADOPTION_METRIC_IDS)).toBe(true);
    expect(Object.isFrozen(PILOT_ERROR_CODES)).toBe(true);
    expect([...PILOT_ICP_CLASSES]).toEqual(["large", "small"]);
    expect(PILOT_WALK_HOPS.length).toBe(6);
    expect(PILOT_GATE_IDS.length).toBe(8);
    expect(PILOT_ADOPTION_METRIC_IDS.length).toBe(6);
  });

  test("every refusal code is distinct (no blanket errors)", () => {
    const codes = [...PILOT_ERROR_CODES];
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("evidence_binding_mismatch");
    expect(codes).toContain("self_approval_refused");
    expect(codes).toContain("unknown_metric_id");
  });

  test("shell-broker vocabulary mirrors the AISE-040 tri-state verbatim", () => {
    expect([...PILOT_BROKER_DECISIONS]).toEqual(["allowed", "refused", "unavailable"]);
    expect([...PILOT_BROKER_UNAVAILABLE_REASONS]).toEqual([
      "authorization-port-absent",
      "authorization-target-unknown",
    ]);
    expect([...PILOT_CONNECTOR_ACTION_KINDS]).toEqual([
      "export-derived",
      "import-entities",
      "import-documents",
      "open-record",
    ]);
  });

  test("validators reject unknown vocabularies with typed refusals", () => {
    expect(() => validateGateId("not.a.gate")).toThrow();
    try {
      validateGateId("not.a.gate");
    } catch (error) {
      expect(isPilotError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("unknown_gate_id");
    }
    expect(() => validateMetricId("not_a_metric")).toThrow();
    try {
      validateMetricId("not_a_metric");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_metric_id");
    }
    expect(() => validateMigrationState("half-adopted")).toThrow();
    try {
      validateMigrationState("half-adopted");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_migration_state");
    }
    expect(validateMigrationState("piloted")).toBe("piloted");
    expect([...MIGRATION_STATES]).toContain("piloted");
  });
});

describe("ICP profile validation", () => {
  const validLarge: PilotIcpProfile = {
    icpClass: "large",
    label: "large",
    spaces: 120,
    storeys: 4,
    evidenceVolume: 4500,
    userRoleCount: 12,
    incumbentIntegrations: 6,
  };

  test("a well-formed profile validates unchanged", () => {
    expect(validateIcpProfile(validLarge)).toEqual(validLarge);
  });

  test("unknown ICP class and non-positive axes are typed refusals", () => {
    expect(() =>
      validateIcpProfile({ ...validLarge, icpClass: "medium" as PilotIcpProfile["icpClass"] }),
    ).toThrow();
    try {
      validateIcpProfile({ ...validLarge, icpClass: "medium" as PilotIcpProfile["icpClass"] });
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_icp_class");
    }
    for (const axis of ["spaces", "storeys", "evidenceVolume", "userRoleCount", "incumbentIntegrations"] as const) {
      try {
        validateIcpProfile({ ...validLarge, [axis]: 0 });
        throw new Error(`axis ${axis} accepted 0`);
      } catch (error) {
        expect((error as { code: string }).code).toBe("invalid_icp_profile");
      }
    }
  });
});

describe("session evidence classification (the real-vs-synthetic split)", () => {
  test("the four real evidence kinds classify real; only projections classify synthetic", () => {
    expect(
      sessionEvidenceClass({ kind: "executed_run", runDigest: "a".repeat(64), hopRecordIds: {} }),
    ).toBe("real");
    expect(sessionEvidenceClass({ kind: "adoption_state", candidateIds: [] })).toBe("real");
    expect(sessionEvidenceClass({ kind: "broker_outcome", actionIds: [] })).toBe("real");
    expect(sessionEvidenceClass({ kind: "deep_link_traversal", traversalIds: [] })).toBe("real");
    expect(
      sessionEvidenceClass({
        kind: "synthetic_projection",
        generator: "g",
        projectedUsers: 10,
        note: "n",
      }),
    ).toBe("synthetic");
  });
});

describe("NOT_OBSERVED propagation typing", () => {
  const environment: PilotEnvironmentSpec = {
    environmentId: "env-1",
    label: "env",
    icp: {
      icpClass: "small",
      label: "s",
      spaces: 1,
      storeys: 1,
      evidenceVolume: 1,
      userRoleCount: 1,
      incumbentIntegrations: 1,
    },
    notObservedDimensions: ["return-path"],
    projects: [],
  };

  test("environment dims union session dims (sorted, deduplicated)", async () => {
    const session = await sessionFixture();
    const merged = sessionNotObservedOf(environment, { ...session, notObserved: ["audit-events", "return-path"] });
    expect(merged).toEqual(["audit-events", "return-path"]);
    expect(dimensionObserved(environment, { ...session, notObserved: [] }, "return-path")).toBe(false);
    expect(dimensionObserved(environment, { ...session, notObserved: [] }, "walk-latency")).toBe(true);
  });
});

describe("the single boundary parser (typed refusals, no silent defaults)", () => {
  test("a shipped recorder session round-trips through the parser", async () => {
    const session = await sessionFixture();
    const parsed = parsePilotSessionRecord(session);
    expect(parsed.sessionId).toBe(session.sessionId);
    expect(parsed.walk.length).toBe(6);
    expect(parsed.evidence.some((entry) => entry.kind === "executed_run")).toBe(true);
  });

  test("unknown walk hop is a typed refusal", async () => {
    const session = await sessionFixture();
    const mutated = {
      ...session,
      walk: [{ ...session.walk[0]!, hopId: "teleport" as never }, ...session.walk.slice(1)],
    };
    try {
      parsePilotSessionRecord(mutated);
      throw new Error("accepted unknown walk hop");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_walk_hop");
    }
  });

  test("a permission outside the identity registry is a typed refusal", async () => {
    const session = await sessionFixture();
    const action = session.authorizedActions[0]!;
    const mutated = {
      ...session,
      authorizedActions: [
        { ...action, requiredPermission: "quantum:admin" as never },
        ...session.authorizedActions.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(mutated);
      throw new Error("accepted fabricated permission");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_permission");
    }
    // The registry itself is the identity module's frozen list.
    expect(PERMISSIONS.includes("reality:read")).toBe(true);
  });

  test("an allowed action without a grant, and a refused action with one, are refusals", async () => {
    const session = await sessionFixture();
    const allowed = session.authorizedActions.find((a) => a.decision === "allowed")!;
    const noGrant = {
      ...session,
      authorizedActions: [
        { ...allowed, heldPermission: null },
        ...session.authorizedActions.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(noGrant);
      throw new Error("accepted allowed without grant");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_session_record");
    }
    const refusedShape = {
      ...session,
      authorizedActions: [
        { ...allowed, decision: "refused" as const, heldPermission: allowed.heldPermission },
        ...session.authorizedActions.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(refusedShape);
      throw new Error("accepted refused with grant");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_session_record");
    }
  });

  test("unavailable decisions require a shell unavailable reason", async () => {
    const session = await sessionFixture();
    const action = session.authorizedActions[0]!;
    const missingReason = {
      ...session,
      authorizedActions: [
        { ...action, decision: "unavailable" as const, heldPermission: null },
        ...session.authorizedActions.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(missingReason);
      throw new Error("accepted unavailable without reason");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_broker_unavailable_reason");
    }
    const badReason = {
      ...session,
      authorizedActions: [
        {
          ...action,
          decision: "unavailable" as const,
          heldPermission: null,
          unavailableReason: "port-flaky" as never,
        },
        ...session.authorizedActions.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(badReason);
      throw new Error("accepted fabricated unavailable reason");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_broker_unavailable_reason");
    }
  });

  test("external trips must record the return-path flag; internal ones must not", async () => {
    const session = await sessionFixture();
    const external = session.traversals.find(
      (t) => t.fromModule === "aise" && t.toModule === "incumbent",
    )!;
    const noFlag = {
      ...session,
      traversals: [
        { ...external, returnedViaReturnPath: null },
        ...session.traversals.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(noFlag);
      throw new Error("accepted external trip without return flag");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_traversal_record");
    }
    const internal = session.traversals.find(
      (t) => t.fromModule === "aise" && t.toModule === "aise",
    )!;
    const flagged = {
      ...session,
      traversals: [
        { ...internal, returnedViaReturnPath: true },
        ...session.traversals.slice(1),
      ],
    };
    try {
      parsePilotSessionRecord(flagged);
      throw new Error("accepted internal traversal with return flag");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_traversal_record");
    }
  });

  test("audit actions/outcomes come from the identity vocabulary", async () => {
    const session = await sessionFixture();
    const mutated = {
      ...session,
      auditEvents: [{ action: "user.promoted" as never, outcome: "allowed", occurredAt: "2026-05-04T09:00:00.000Z" }],
    };
    try {
      parsePilotSessionRecord(mutated);
      throw new Error("accepted fabricated audit action");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_audit_action");
    }
    expect([...AUDIT_ACTIONS]).toContain("authorization.refused");
  });

  test("synthetic evidence is exclusive — mixing real and synthetic is a refusal", async () => {
    const session = await sessionFixture();
    const mixed = {
      ...session,
      evidence: [
        ...session.evidence,
        { kind: "synthetic_projection" as const, generator: "g", projectedUsers: 5, note: "n" },
      ],
    };
    try {
      parsePilotSessionRecord(mixed);
      throw new Error("accepted mixed evidence");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_session_record");
    }
  });

  test("a walk hop claiming records outside its executed evidence is a binding mismatch", async () => {
    const session = await sessionFixture();
    const mutated = {
      ...session,
      walk: session.walk.map((hop) =>
        hop.sourceHopId === null ? hop : { ...hop, recordIds: ["forged-record-id"] },
      ),
    };
    try {
      parsePilotSessionRecord(mutated);
      throw new Error("accepted forged record ids");
    } catch (error) {
      expect((error as { code: string }).code).toBe("evidence_binding_mismatch");
    }
  });

  test("invalid latency samples are typed refusals", async () => {
    const session = await sessionFixture();
    for (const bad of [0, -5, Number.NaN]) {
      const mutated = {
        ...session,
        walk: session.walk.map((hop) =>
          hop.latencyMs === null ? hop : { ...hop, latencyMs: bad },
        ),
      };
      try {
        parsePilotSessionRecord(mutated);
        throw new Error(`accepted latency ${String(bad)}`);
      } catch (error) {
        expect((error as { code: string }).code).toBe("invalid_latency_sample");
      }
    }
  });

  test("executed evidence requires a 64-hex run digest", async () => {
    const session = await sessionFixture();
    const mutated = {
      ...session,
      evidence: session.evidence.map((entry) =>
        entry.kind === "executed_run" ? { ...entry, runDigest: "not-a-digest" } : entry,
      ),
    };
    try {
      parsePilotSessionRecord(mutated);
      throw new Error("accepted malformed run digest");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_session_record");
    }
  });
});

describe("content digests", () => {
  test("pilotDigestOf is deterministic and content-sensitive", () => {
    const value = { b: 2, a: [1, { c: 3 }] };
    expect(pilotDigestOf(value)).toBe(pilotDigestOf({ a: [1, { c: 3 }], b: 2 }));
    expect(pilotDigestOf(value)).not.toBe(pilotDigestOf({ b: 2, a: [1, { c: 4 }] }));
    expect(pilotDigestOf(value)).toMatch(/^[0-9a-f]{64}$/);
  });
});
