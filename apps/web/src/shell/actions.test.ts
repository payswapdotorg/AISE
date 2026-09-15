/**
 * AISE-040 shell tests — the authorized-connector-action broker: the
 * tri-state matrix (allowed → enabled; refused → disabled + the refusal
 * reason named; unavailable → disabled + the honest unknown reason), the
 * verbatim relay of the required permission and the return-path
 * preservation in every state.
 */

import { describe, expect, test } from "bun:test";
import * as shell from "./index";
import {
  authorizationTable,
  bimBinding,
  CASE_ID,
  makeAuthorizationPort,
  PRINCIPAL_ALICE,
  PRINCIPAL_BOB,
  PRINCIPAL_CAROL,
  PRINCIPAL_DAVE,
  PRINCIPAL_ERIN,
  PROJECT_ID,
  projectTarget,
} from "./fixtures";
import type { ShellAuthorizationRequest } from "./index";

const RETURN_TO = shell.caseAddress(PROJECT_ID, CASE_ID);

/** A paired action for the bim export (reality:write). */
function bimExportAction(): shell.ShellConnectorAction {
  return shell.pairConnectorAction(bimBinding().actions[0]!, bimBinding().bindingId, RETURN_TO);
}

describe("the tri-state broker matrix", () => {
  test("ALLOWED → the offer is enabled with the satisfying grant relayed verbatim", async () => {
    const offer = await shell.resolveConnectorActionOffer(
      makeAuthorizationPort(authorizationTable()),
      bimExportAction(),
      PRINCIPAL_ALICE,
      projectTarget(),
    );
    expect(offer.state.kind).toBe("allowed");
    if (offer.state.kind === "allowed") {
      expect(offer.state.grant.membershipId).toBe("mbr-011");
      expect(offer.state.grant.permission).toBe("reality:write");
      expect(offer.state.grant.scope).toEqual({
        kind: "project",
        projectId: "proj-riverside-refit",
      });
    }
  });

  test("REFUSED → the offer is disabled with the refusal reason NAMED (code + detail)", async () => {
    const offer = await shell.resolveConnectorActionOffer(
      makeAuthorizationPort(authorizationTable()),
      bimExportAction(),
      PRINCIPAL_BOB,
      projectTarget(),
    );
    expect(offer.state.kind).toBe("refused");
    if (offer.state.kind === "refused") {
      expect(offer.state.refusal.code).toBe("missing_permission");
      expect(offer.state.refusal.detail).toContain("user-bob");
      expect(offer.state.refusal.principalId).toBe(PRINCIPAL_BOB);
      expect(offer.state.refusal.target).toEqual(projectTarget());
    }
  });

  test("every distinct identity refusal code surfaces verbatim (the discrimination)", async () => {
    const port = makeAuthorizationPort(authorizationTable());
    const expected: readonly [string, string][] = [
      [PRINCIPAL_BOB, "missing_permission"],
      [PRINCIPAL_CAROL, "cross_tenant"],
      [PRINCIPAL_DAVE, "wrong_scope"],
      [PRINCIPAL_ERIN, "insufficient_granularity"],
    ];
    for (const [principalId, code] of expected) {
      const offer = await shell.resolveConnectorActionOffer(
        port,
        bimExportAction(),
        principalId,
        projectTarget(),
      );
      expect(offer.state.kind).toBe("refused");
      if (offer.state.kind === "refused") {
        expect(offer.state.refusal.code).toBe(code);
      }
    }
  });

  test("PORT ABSENT → the offer is disabled with the honest unknown reason", async () => {
    const offer = await shell.resolveConnectorActionOffer(
      undefined,
      bimExportAction(),
      PRINCIPAL_ALICE,
      projectTarget(),
    );
    expect(offer.state.kind).toBe("unavailable");
    if (offer.state.kind === "unavailable") {
      expect(offer.state.reason).toBe("authorization-port-absent");
    }
  });

  test("TARGET UNKNOWN (no project context) → disabled with the honest reason", async () => {
    const offer = await shell.resolveConnectorActionOffer(
      makeAuthorizationPort(authorizationTable()),
      bimExportAction(),
      PRINCIPAL_ALICE,
      null,
    );
    expect(offer.state.kind).toBe("unavailable");
    if (offer.state.kind === "unavailable") {
      expect(offer.state.reason).toBe("authorization-target-unknown");
    }
  });

  test("the return path is carried by the offer in ALL THREE states", async () => {
    const port = makeAuthorizationPort(authorizationTable());
    const allowed = await shell.resolveConnectorActionOffer(port, bimExportAction(), PRINCIPAL_ALICE, projectTarget());
    const refused = await shell.resolveConnectorActionOffer(port, bimExportAction(), PRINCIPAL_BOB, projectTarget());
    const unavailable = await shell.resolveConnectorActionOffer(undefined, bimExportAction(), PRINCIPAL_ALICE, projectTarget());
    for (const offer of [allowed, refused, unavailable]) {
      expect(offer.action.returnTo).toEqual(RETURN_TO);
      expect(offer.action.bindingId).toBe("bim-prod-01");
      expect(offer.action.descriptor.actionId).toBe("act-bim-export");
    }
  });
});

describe("the broker's relay discipline (never decides, never invents)", () => {
  test("the port is asked EXACTLY once with principal/permission/target verbatim", async () => {
    const seen: ShellAuthorizationRequest[] = [];
    const port = {
      decide: async (request: ShellAuthorizationRequest): Promise<shell.ShellAuthorizationDecision> => {
        seen.push(request);
        return {
          allowed: false,
          refusal: {
            code: "missing_permission",
            detail: "d",
            principalId: request.principalId,
            target: request.target,
          },
        };
      },
    };
    await shell.resolveConnectorActionOffer(port, bimExportAction(), PRINCIPAL_ALICE, projectTarget());
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      principalId: PRINCIPAL_ALICE,
      permission: "reality:write",
      target: projectTarget(),
    });
  });

  test("the broker re-checks the port's decision shape (no fake decisions)", async () => {
    const port = {
      decide: async () => ({ allowed: "yes" }) as unknown as shell.ShellAuthorizationDecision,
    };
    try {
      await shell.resolveConnectorActionOffer(port, bimExportAction(), PRINCIPAL_ALICE, projectTarget());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(shell.ShellError);
      expect((error as shell.ShellError).code).toBe("invalid_input");
    }
  });

  test("deterministic: the same inputs resolve to deep-equal offers", async () => {
    const port = makeAuthorizationPort(authorizationTable());
    const a = await shell.resolveConnectorActionOffer(port, bimExportAction(), PRINCIPAL_ALICE, projectTarget());
    const b = await shell.resolveConnectorActionOffer(port, bimExportAction(), PRINCIPAL_ALICE, projectTarget());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("an empty principalId is a typed rejection (the broker never asks anonymously)", async () => {
    try {
      await shell.resolveConnectorActionOffer(
        makeAuthorizationPort(authorizationTable()),
        bimExportAction(),
        "  ",
        projectTarget(),
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("principalId");
    }
  });
});

describe("pairConnectorAction (the session pairing)", () => {
  test("pairs the descriptor with the binding and the return address", () => {
    const action = bimExportAction();
    expect(action.descriptor.kind).toBe("export-derived");
    expect(action.descriptor.requiredPermission).toBe("reality:write");
    expect(action.returnTo).toEqual(RETURN_TO);
  });

  test("rejects an empty binding id and a malformed return address", () => {
    expect(() => shell.pairConnectorAction(bimBinding().actions[0]!, "", RETURN_TO)).toThrow();
    expect(() =>
      shell.pairConnectorAction(
        bimBinding().actions[0]!,
        "bim-prod-01",
        { module: "finance", projectId: "x" } as unknown as shell.ShellAddress,
      ),
    ).toThrow(shell.ShellError);
  });

  test("rejects a malformed descriptor (the boundary discipline)", () => {
    const bad = { ...bimBinding().actions[0]!, actionId: "" };
    expect(() => shell.pairConnectorAction(bad, "bim-prod-01", RETURN_TO)).toThrow(
      shell.ShellError,
    );
  });
});

describe("describeGrant (the enabled note)", () => {
  test("names membership, role, permission and scope deterministically", () => {
    expect(
      shell.describeGrant({
        membershipId: "mbr-011",
        roleId: "role-engineer",
        permission: "reality:write",
        scope: { kind: "project", projectId: "proj-riverside-refit" },
      }),
    ).toBe(
      "authorized via grant mbr-011 (role role-engineer, reality:write, project proj-riverside-refit scope)",
    );
    expect(
      shell.describeGrant({
        membershipId: "m",
        roleId: "r",
        permission: "case:read",
        scope: { kind: "organization" },
      }),
    ).toBe("authorized via grant m (role r, case:read, organization scope)");
  });
});
