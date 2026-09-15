/**
 * AISE-040 shell tests — the READ-ONLY data-access seam: `loadShellInput`
 * assembly, the honest omissions for absent ports and unresolved records,
 * the alignment cross-checks (no second id scheme), the recording-proxy
 * discriminations (only read members ever touched) and input purity.
 */

import { describe, expect, test } from "bun:test";
import * as shell from "./index";
import {
  BOQ_IMPORT_ID,
  CASE_ID,
  EV_WALL_NORTH,
  PROJECT_ID,
  PRINCIPAL_ALICE,
  PRINCIPAL_BOB,
  REALITY_VERSION,
  allBindings,
  authorizationTable,
  boqImportView,
  caseView,
  contextView,
  deepFreeze,
  emptyShellPorts,
  makeAuthorizationPort,
  makeBoqPort,
  makeContextPort,
  makeRealityPort,
  makeRecordingPorts,
  makeShellPorts,
  realityV003,
} from "./fixtures";
import type {
  BoqPaneView,
  ContextPaneView,
  LoadShellOptions,
  RealityPaneView,
  ShellPorts,
} from "./index";

function optionsAt(address: shell.ShellAddress, principalId = PRINCIPAL_ALICE): LoadShellOptions {
  return { session: shell.beginShellSession(address), principalId };
}

async function expectCodeAsync(
  fn: () => Promise<unknown>,
  code: shell.ShellErrorCode,
): Promise<void> {
  try {
    await fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(shell.ShellError);
    expect((error as shell.ShellError).code).toBe(code);
  }
}

/* ------------------------------------------------------------------ */
/* Assembly                                                             */
/* ------------------------------------------------------------------ */

describe("loadShellInput — assembly over the read-only seam", () => {
  test("assembles the addressed pane + context + connectors (alice, all allowed)", async () => {
    const input = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.caseAddress(PROJECT_ID, CASE_ID)),
    );
    expect(input.context?.projectId).toBe(PROJECT_ID);
    expect(input.pane?.module).toBe("case");
    if (input.pane?.module === "case") {
      expect(input.pane.view.caseId).toBe(CASE_ID);
    }
    expect(input.connectors).toHaveLength(3);
    expect(input.omissions).toEqual([]);
    for (const surface of input.connectors) {
      for (const offer of surface.offers) {
        expect(offer.state.kind).toBe("allowed");
      }
    }
  });

  test("a context address reuses ONE context read for the header AND the pane", async () => {
    const ports = makeRecordingPorts(makeShellPorts());
    const input = await shell.loadShellInput(
      ports,
      optionsAt(shell.contextAddress(PROJECT_ID)),
    );
    expect(input.pane?.module).toBe("context");
    expect(input.pane?.module === "context" ? input.pane.view : null).toBe(input.context);
    const contextReads = ports.calls().filter((call) => call.member === "readContext");
    expect(contextReads).toHaveLength(1);
  });

  test("each module's pane assembles via its own port", async () => {
    const ports = makeShellPorts();
    const reality = await shell.loadShellInput(
      ports,
      optionsAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION)),
    );
    expect(reality.pane?.module).toBe("reality");
    const boq = await shell.loadShellInput(
      ports,
      optionsAt(shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID)),
    );
    expect(boq.pane?.module).toBe("boq");
    const evidence = await shell.loadShellInput(
      ports,
      optionsAt(shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH)),
    );
    expect(evidence.pane?.module).toBe("evidence");
  });

  test("the reality pane highlights nothing (presentation) but resolves the version verbatim", async () => {
    const input = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION, "wall-north")),
    );
    if (input.pane?.module !== "reality") {
      expect.unreachable();
      return;
    }
    expect(input.pane.view.versionId).toBe(REALITY_VERSION);
    expect(input.pane.view.nodes.map((node) => node.nodeId)).toContain("wall-north");
  });

  test("deterministic: two loads over fresh ports assemble identical inputs", async () => {
    const a = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.caseAddress(PROJECT_ID, CASE_ID)),
    );
    const b = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.caseAddress(PROJECT_ID, CASE_ID)),
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("invalid options are typed rejections", async () => {
    await expectCodeAsync(
      () => shell.loadShellInput(makeShellPorts(), { session: shell.beginShellSession(shell.contextAddress(PROJECT_ID)), principalId: "" }),
      "invalid_input",
    );
    await expectCodeAsync(
      () =>
        shell.loadShellInput(makeShellPorts(), {
          session: { breadcrumbs: [] },
          principalId: PRINCIPAL_ALICE,
        }),
      "session_invalid",
    );
  });

  test("a malformed port bundle is a typed rejection", async () => {
    await expectCodeAsync(
      () =>
        shell.loadShellInput(
          { context: {} } as unknown as ShellPorts,
          optionsAt(shell.contextAddress(PROJECT_ID)),
        ),
      "invalid_input",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Honest omissions (absent ports / unresolved records)                */
/* ------------------------------------------------------------------ */

describe("honest omissions", () => {
  test("a pane whose data port is ABSENT renders a typed omission (per module)", async () => {
    const full = makeShellPorts();
    const cases: readonly [string, shell.ShellAddress][] = [
      ["context", shell.contextAddress(PROJECT_ID)],
      ["reality", shell.realityAddress(PROJECT_ID, REALITY_VERSION)],
      ["boq", shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID)],
      ["evidence", shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH)],
      ["case", shell.caseAddress(PROJECT_ID, CASE_ID)],
    ];
    for (const [pane, address] of cases) {
      const removed: ShellPorts =
        pane === "context"
          ? { ...full, context: undefined }
          : pane === "reality"
            ? { ...full, reality: undefined }
            : pane === "boq"
              ? { ...full, boq: undefined }
              : pane === "evidence"
                ? { ...full, evidence: undefined }
                : { ...full, case: undefined };
      const input = await shell.loadShellInput(removed, optionsAt(address));
      const omission = input.omissions.find((entry) => entry.pane === pane);
      expect(omission).toBeDefined();
      expect(omission?.reason).toBe("port_absent");
      expect(input.pane).toBeNull();
    }
  });

  test("an unresolved record is a typed record_unresolved omission", async () => {
    const ports: ShellPorts = {
      ...makeShellPorts(),
      context: makeContextPort(null),
      boq: makeBoqPort([]),
    };
    const contextMissing = await shell.loadShellInput(
      ports,
      optionsAt(shell.contextAddress(PROJECT_ID)),
    );
    expect(
      contextMissing.omissions.find((entry) => entry.pane === "context")?.reason,
    ).toBe("record_unresolved");
    expect(contextMissing.context).toBeNull();
    const boqMissing = await shell.loadShellInput(
      ports,
      optionsAt(shell.boqAddress(PROJECT_ID, "boq-does-not-exist")),
    );
    expect(boqMissing.omissions.find((entry) => entry.pane === "boq")?.reason).toBe(
      "record_unresolved",
    );
    expect(boqMissing.pane).toBeNull();
  });

  test("an absent connector-status port omits the whole connector panel", async () => {
    const ports: ShellPorts = { ...makeShellPorts(), connectorStatus: undefined };
    const input = await shell.loadShellInput(
      ports,
      optionsAt(shell.contextAddress(PROJECT_ID)),
    );
    expect(input.connectors).toEqual([]);
    expect(
      input.omissions.find((entry) => entry.pane === "connectors")?.reason,
    ).toBe("port_absent");
  });

  test("an absent authorization port disables every offer with the honest reason", async () => {
    const ports: ShellPorts = { ...makeShellPorts(), authorization: undefined };
    const input = await shell.loadShellInput(
      ports,
      optionsAt(shell.contextAddress(PROJECT_ID)),
    );
    expect(input.connectors).toHaveLength(3);
    for (const surface of input.connectors) {
      for (const offer of surface.offers) {
        expect(offer.state.kind).toBe("unavailable");
        if (offer.state.kind === "unavailable") {
          expect(offer.state.reason).toBe("authorization-port-absent");
        }
      }
    }
  });

  test("an absent context port makes the authorization target unknown (never guessed)", async () => {
    const ports: ShellPorts = { ...makeShellPorts(), context: undefined };
    const input = await shell.loadShellInput(
      ports,
      optionsAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION)),
    );
    expect(
      input.omissions.find((entry) => entry.pane === "context")?.reason,
    ).toBe("port_absent");
    for (const surface of input.connectors) {
      for (const offer of surface.offers) {
        expect(offer.state.kind).toBe("unavailable");
        if (offer.state.kind === "unavailable") {
          expect(offer.state.reason).toBe("authorization-target-unknown");
        }
      }
    }
  });

  test("the all-absent deployment renders every pane honestly omitted", async () => {
    const input = await shell.loadShellInput(
      emptyShellPorts(),
      optionsAt(shell.contextAddress(PROJECT_ID)),
    );
    expect(input.omissions.map((entry) => entry.pane).sort()).toEqual([
      "connectors",
      "context",
    ]);
    expect(input.context).toBeNull();
    expect(input.pane).toBeNull();
    expect(input.connectors).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The authorization relay through the seam                            */
/* ------------------------------------------------------------------ */

describe("authorization relay through the seam", () => {
  test("alice's offers resolve allowed; bob's are refused with named reasons", async () => {
    const forBob = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.contextAddress(PROJECT_ID), PRINCIPAL_BOB),
    );
    const states = forBob.connectors.flatMap((surface) =>
      surface.offers.map((offer) => offer.state),
    );
    expect(states).toHaveLength(4);
    const codes = states
      .filter((state): state is Extract<typeof state, { kind: "refused" }> => state.kind === "refused")
      .map((state) => state.refusal.code)
      .sort();
    expect(codes).toEqual(["membership_revoked", "missing_permission", "missing_permission", "missing_permission"]);
  });

  test("every offer's return path is the CURRENT address (the §040 return path)", async () => {
    const address = shell.caseAddress(PROJECT_ID, CASE_ID);
    const input = await shell.loadShellInput(makeShellPorts(), optionsAt(address));
    for (const surface of input.connectors) {
      for (const offer of surface.offers) {
        expect(offer.action.returnTo).toEqual(address);
      }
    }
  });

  test("the authorization port is asked once per action descriptor with the target", async () => {
    const ports = makeRecordingPorts(makeShellPorts());
    await shell.loadShellInput(ports, optionsAt(shell.contextAddress(PROJECT_ID)));
    const decisions = ports.calls().filter((call) => call.member === "decide");
    expect(decisions).toHaveLength(4);
    for (const call of decisions) {
      const request = call.args[0] as { principalId: string; target: unknown };
      expect(request.principalId).toBe(PRINCIPAL_ALICE);
      expect(request.target).toEqual({
        kind: "project",
        organizationId: "org-northwind",
        projectId: PROJECT_ID,
      });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Alignment cross-checks (no second id scheme, never silent re-keying) */
/* ------------------------------------------------------------------ */

describe("alignment cross-checks", () => {
  test("a reality view disagreeing with the addressed version is a typed rejection", async () => {
    const tampered: ShellPorts = {
      ...makeShellPorts(),
      reality: {
        readReality: async () => ({ ...realityV003(), versionId: "v002" }) as RealityPaneView,
      },
    };
    await expectCodeAsync(
      () =>
        shell.loadShellInput(
          tampered,
          optionsAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION)),
        ),
      "invalid_input",
    );
  });

  test("a pane view from a foreign project is a typed rejection", async () => {
    const tampered: ShellPorts = {
      ...makeShellPorts(),
      boq: {
        readBoqImport: async () => ({ ...boqImportView(), projectId: "proj-other" }) as BoqPaneView,
      },
    };
    await expectCodeAsync(
      () =>
        shell.loadShellInput(tampered, optionsAt(shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID))),
      "invalid_input",
    );
    const caseTampered: ShellPorts = {
      ...makeShellPorts(),
      case: {
        readCase: async () => ({ ...caseView(), caseId: "case-999" }),
      },
    };
    await expectCodeAsync(
      () => shell.loadShellInput(caseTampered, optionsAt(shell.caseAddress(PROJECT_ID, CASE_ID))),
      "invalid_input",
    );
  });

  test("an unsourced view over the seam is a typed boundary rejection", async () => {
    const unsourced: ShellPorts = {
      ...makeShellPorts(),
      context: {
        readContext: async () =>
          ({ ...contextView(), projectName: { value: "ghost" } }) as ContextPaneView,
      },
    };
    await expectCodeAsync(
      () => shell.loadShellInput(unsourced, optionsAt(shell.contextAddress(PROJECT_ID))),
      "source_reference_required",
    );
  });

  test("validateShellInput re-checks the assembled input at the render boundary", async () => {
    const input = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.caseAddress(PROJECT_ID, CASE_ID)),
    );
    expect(shell.validateShellInput(input)).toBe(input);
    const casePane = input.pane;
    if (casePane === null || casePane.module !== "case") {
      expect.unreachable();
      return;
    }
    // a pane whose ids disagree with the session's current address is a
    // typed rejection (no silent re-keying)
    await expectCodeAsync(
      async () =>
        shell.validateShellInput({
          ...input,
          pane: {
            module: "case",
            view: { ...casePane.view, caseId: "case-999" },
          },
        }),
      "invalid_input",
    );
    // a surface whose offer belongs to another binding is a typed rejection
    await expectCodeAsync(
      async () =>
        shell.validateShellInput({
          ...input,
          connectors: input.connectors.map((surface, index) =>
            index === 0
              ? {
                  ...surface,
                  offers: surface.offers.map((offer) => ({
                    ...offer,
                    action: { ...offer.action, bindingId: "binding-other" },
                  })),
                }
              : surface,
          ),
        }),
      "invalid_input",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The no-write discriminations (recording proxies)                    */
/* ------------------------------------------------------------------ */

describe("the shell never issues writes (the recording-port discriminations)", () => {
  test("a full session step touches EXACTLY the declared read members", async () => {
    const ports = makeRecordingPorts(makeShellPorts());
    await shell.loadShellInput(ports, optionsAt(shell.caseAddress(PROJECT_ID, CASE_ID)));
    const touched = ports.membersTouched();
    for (const { port, member } of touched) {
      expect((shell.SHELL_PORT_MEMBERS[port] as readonly string[])).toContain(member);
    }
    const banned = touched.filter(({ member }) =>
      /set|update|mutate|assign|approve|reject|save|write|fetch|delete|patch|push|post|create|add|remove|transition|record|append|materialize/i.test(
        member,
      ),
    );
    expect(banned).toEqual([]);
  });

  test("accessing a write-shaped member on the seam THROWS (the tripwire)", () => {
    const ports = makeRecordingPorts(makeShellPorts());
    expect(() => (ports.context as unknown as Record<string, unknown>).saveContext).toThrow(
      /write-shaped member/,
    );
    expect(() => (ports.authorization as unknown as Record<string, unknown>).approveAction).toThrow(
      /write-shaped member/,
    );
  });

  test("the read order is fixed: context → pane → bindings → decisions", async () => {
    const ports = makeRecordingPorts(makeShellPorts());
    await shell.loadShellInput(ports, optionsAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION)));
    const members = ports.calls().map((call) => call.member);
    expect(members).toEqual([
      "readContext",
      "readReality",
      "readBindings",
      "decide",
      "decide",
      "decide",
      "decide",
    ]);
  });

  test("the seam TYPES have no write member (type-level tripwires)", () => {
    const ports = makeShellPorts();
    // @ts-expect-error — the context port exposes no writer
    void ports.context?.writeContext;
    // @ts-expect-error — the reality port exposes no transition member
    void ports.reality?.mutateReality;
    // @ts-expect-error — the evidence port exposes no registration member
    void ports.evidence?.registerEvidence;
    // @ts-expect-error — the authorization port exposes no grant member
    void ports.authorization?.grantPermission;
    // @ts-expect-error — the status port exposes no binding writer
    void ports.connectorStatus?.upsertBinding;
    expect(typeof ports.context?.readContext).toBe("function");
    expect(typeof ports.authorization?.decide).toBe("function");
  });

  test("SHELL_PORT_MEMBERS is frozen and pins the seam vocabulary", () => {
    expect(Object.isFrozen(shell.SHELL_PORT_MEMBERS)).toBe(true);
    expect([...shell.SHELL_PORT_NAMES]).toEqual([
      "context",
      "reality",
      "boq",
      "evidence",
      "case",
      "authorization",
      "connectorStatus",
    ]);
    for (const name of shell.SHELL_PORT_NAMES) {
      expect(shell.SHELL_PORT_MEMBERS[name]).toHaveLength(1);
    }
  });

  test("purity: deep-frozen fixture views survive a full load untouched", async () => {
    const frozen = deepFreeze({
      context: contextView(),
      reality: realityV003(),
      bindings: allBindings(),
    });
    const before = JSON.stringify(frozen);
    const ports: ShellPorts = {
      context: makeContextPort(frozen.context),
      reality: makeRealityPort([frozen.reality]),
      connectorStatus: {
        readBindings: async () => frozen.bindings,
      },
      authorization: makeAuthorizationPort(authorizationTable()),
    };
    const input = await shell.loadShellInput(
      ports,
      optionsAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION)),
    );
    expect(input.pane?.module).toBe("reality");
    expect(JSON.stringify(frozen)).toBe(before);
  });

  test("an evidence record is addressable by its content address (verbatim)", async () => {
    const input = await shell.loadShellInput(
      makeShellPorts(),
      optionsAt(shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH)),
    );
    if (input.pane?.module !== "evidence") {
      expect.unreachable();
      return;
    }
    expect(input.pane.view.evidenceId).toBe(EV_WALL_NORTH);
    expect(input.pane.view.relatedCaseIds.map((entry) => entry.value)).toEqual([CASE_ID]);
  });
});
