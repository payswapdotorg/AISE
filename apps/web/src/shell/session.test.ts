/**
 * AISE-040 shell tests — THE END-TO-END AISE-CENTERED SESSION WALK (the
 * §040 acceptance core): project context → reality inspect → BOQ inspect
 * → evidence inspect → case inspect → authorized connector action →
 * return path, as ONE breadcrumb-preserving session that never leaves the
 * shell, with the external systems retaining their authority (system-of-
 * record labels, verbatim external ids) throughout.
 *
 * The walk navigates EXCLUSIVELY through data discovered in panes (the
 * context pane's deep-link entries, the reality nodes' evidence ids, the
 * evidence record's related cases) — every address parses back through
 * the typed codec, and every step renders through the same read-only
 * seam.
 */

import { describe, expect, test } from "bun:test";
import * as shell from "./index";
import {
  BOQ_IMPORT_ID,
  BINDING_BIM,
  CASE_ID,
  EV_WALL_NORTH,
  PROJECT_ID,
  PRINCIPAL_ALICE,
  PRINCIPAL_BOB,
  REALITY_VERSION,
  makeRecordingPorts,
  makeShellPorts,
} from "./fixtures";
import type { ConnectorActionOffer, ShellInput, ShellPorts } from "./index";

/**
 * ONE full step of the walk: extend the session to `next`, load the shell
 * input through fresh RECORDING ports, render the document, and return
 * everything the assertions need.
 */
async function walkStep(
  session: shell.ShellSession,
  next: shell.ShellAddress,
  ports: ShellPorts,
  principalId = PRINCIPAL_ALICE,
): Promise<{
  session: shell.ShellSession;
  input: ShellInput;
  html: string;
  calls: ReturnType<ReturnType<typeof makeRecordingPorts>["calls"]>;
}> {
  const extended = shell.extendShellSession(session, next);
  const recording = makeRecordingPorts(ports);
  const input = await shell.loadShellInput(recording, {
    session: extended,
    principalId,
  });
  const html = shell.renderAdoptionShell(input);
  return { session: extended, input, html, calls: recording.calls() };
}

/* ------------------------------------------------------------------ */
/* The full walk (the §040 acceptance scenario)                        */
/* ------------------------------------------------------------------ */

describe("the end-to-end AISE-centered session walk", () => {
  test("context → reality → BOQ → evidence → case → authorized action → return path", async () => {
    const ports = makeShellPorts();

    // STEP 1 — discover the project context (R19 acceptance: discovery).
    const contextAddress = shell.contextAddress(PROJECT_ID);
    let session = shell.beginShellSession(contextAddress);
    let step = await walkStep(session, contextAddress, ports);
    session = step.session;
    const context = step.input.context;
    expect(context).not.toBeNull();
    expect(step.html).toContain("Project context");

    // STEP 2 — inspect REALITY via the context pane's discovered entry.
    expect(context?.latestRealityVersionId?.value).toBe(REALITY_VERSION);
    const realityAddress = shell.realityAddress(
      PROJECT_ID,
      context!.latestRealityVersionId!.value,
    );
    step = await walkStep(session, realityAddress, ports);
    session = step.session;
    expect(step.input.pane?.module).toBe("reality");
    expect(step.html).toContain("Reality — version <code>v003</code>");
    // the walk stays AISE-centered: the context crumb is still carried.
    expect(shell.sessionContainsAddress(session, contextAddress)).toBe(true);

    // STEP 3 — inspect the BOQ (import id discovered from context).
    const boqAddress = shell.boqAddress(PROJECT_ID, context!.boqImportIds[0]!.value);
    step = await walkStep(session, boqAddress, ports);
    session = step.session;
    expect(step.input.pane?.module).toBe("boq");
    expect(step.html).toContain(`<code>${BOQ_IMPORT_ID}</code>`);

    // STEP 4 — inspect EVIDENCE (content id discovered from the reality node).
    const reality = await ports.reality!.readReality(PROJECT_ID, REALITY_VERSION);
    const wallNorth = reality?.nodes.find((node) => node.nodeId === "wall-north");
    expect(wallNorth?.evidenceIds[0]?.value).toBe(EV_WALL_NORTH);
    const evidenceAddress = shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH);
    step = await walkStep(session, evidenceAddress, ports);
    session = step.session;
    expect(step.input.pane?.module).toBe("evidence");
    expect(step.html).toContain("VISUAL_RECONSTRUCTION");

    // STEP 5 — inspect the CASE (case id discovered from the evidence record).
    const evidence = await ports.evidence!.readEvidence(PROJECT_ID, EV_WALL_NORTH);
    expect(evidence?.relatedCaseIds[0]?.value).toBe(CASE_ID);
    const caseAddress = shell.caseAddress(PROJECT_ID, CASE_ID);
    step = await walkStep(session, caseAddress, ports);
    session = step.session;
    expect(step.input.pane?.module).toBe("case");
    expect(step.html).toContain("Fire rating discrepancy — storey 2 north wall");

    // STEP 6 — initiate the AUTHORIZED CONNECTOR ACTION from the case pane.
    const caseInput = step.input;
    const bimSurface = caseInput.connectors.find(
      (surface) => surface.binding.bindingId === BINDING_BIM,
    );
    expect(bimSurface).toBeDefined();
    const allowed = bimSurface!.offers.filter(
      (offer) => offer.state.kind === "allowed",
    ) as readonly ConnectorActionOffer[];
    expect(allowed).toHaveLength(1);
    const offer = allowed[0]!;
    expect(offer.action.descriptor.actionId).toBe("act-bim-export");
    // the action's return path is the AISE context the user returns to.
    expect(offer.action.returnTo).toEqual(caseAddress);
    expect(step.html).toContain(`data-action-id="act-bim-export"`);
    expect(step.html).toContain(`data-offer-state="allowed" data-enabled="true"`);
    // the external record the action touches is named verbatim + system of record.
    expect(step.html).toContain("<code>IFC-MODEL-0042</code>");
    expect(step.html).toContain("System of record");

    // STEP 7 — follow the RETURN PATH: come back to the case context.
    session = shell.extendShellSession(session, offer.action.returnTo);
    const returned = await shell.loadShellInput(ports, {
      session,
      principalId: PRINCIPAL_ALICE,
    });
    const returnHtml = shell.renderAdoptionShell(returned);
    expect(returned.pane?.module).toBe("case");

    // THE ACCEPTANCE ASSERTIONS — one session, the whole walk preserved:
    const addresses = session.breadcrumbs.map((crumb) => crumb.address);
    expect(addresses).toEqual([
      contextAddress,
      realityAddress,
      boqAddress,
      evidenceAddress,
      caseAddress,
    ]);
    // every address in the chain is a valid typed shell address (the walk
    // never left the shell — nothing external is in the breadcrumb chain).
    for (const address of addresses) {
      expect(shell.parseShellAddress(shell.formatShellAddress(address))).toEqual(address);
    }
    // the context is carried through the entire walk + return.
    expect(shell.currentShellAddress(session)).toEqual(caseAddress);
    expect(shell.sessionContainsAddress(session, contextAddress)).toBe(true);
    // the rendered return document shows the whole breadcrumb walk.
    expect(returnHtml).toContain(`data-crumb-count="5"`);
  });

  test("every step of the walk renders the breadcrumbs of every prior step", async () => {
    const ports = makeShellPorts();
    const context = shell.contextAddress(PROJECT_ID);
    let session = shell.beginShellSession(context);
    const visited: shell.ShellAddress[] = [context];
    const nexts: shell.ShellAddress[] = [
      shell.realityAddress(PROJECT_ID, REALITY_VERSION),
      shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID),
      shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH),
      shell.caseAddress(PROJECT_ID, CASE_ID),
    ];
    for (const next of nexts) {
      const step = await walkStep(session, next, ports);
      session = step.session;
      visited.push(next);
      // every prior address is a rendered deep link in the breadcrumb bar
      // (hrefs are HTML-escaped — the & of the query is &amp; in the doc)
      for (const prior of visited) {
        const href = shell.formatShellAddress(prior).replace(/&/g, "&amp;");
        expect(step.html).toContain(`href="${href}"`);
      }
      expect(step.html).toContain(`data-crumb-count="${String(visited.length)}"`);
    }
  });

  test("no second id scheme: pane ids equal the addressed ids VERBATIM at every step", async () => {
    const ports = makeShellPorts();
    const realityAddress = shell.realityAddress(PROJECT_ID, REALITY_VERSION);
    const input = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(realityAddress),
      principalId: PRINCIPAL_ALICE,
    });
    expect(input.pane?.module === "reality" ? input.pane.view.versionId : null).toBe(
      REALITY_VERSION,
    );
    const boqInput = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID)),
      principalId: PRINCIPAL_ALICE,
    });
    expect(boqInput.pane?.module === "boq" ? input.pane : null).not.toBeNull();
    const caseInput = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(shell.caseAddress(PROJECT_ID, CASE_ID)),
      principalId: PRINCIPAL_ALICE,
    });
    expect(caseInput.pane?.module === "case" ? caseInput.pane.view.caseId : null).toBe(CASE_ID);
    const evidenceInput = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH)),
      principalId: PRINCIPAL_ALICE,
    });
    expect(
      evidenceInput.pane?.module === "evidence" ? evidenceInput.pane.view.evidenceId : null,
    ).toBe(EV_WALL_NORTH);
  });

  test("the walk uses ONLY the declared read members at every step", async () => {
    const ports = makeShellPorts();
    const walk = [
      shell.contextAddress(PROJECT_ID),
      shell.realityAddress(PROJECT_ID, REALITY_VERSION),
      shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID),
      shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH),
      shell.caseAddress(PROJECT_ID, CASE_ID),
    ];
    let session = shell.beginShellSession(walk[0]!);
    for (const next of walk) {
      const step = await walkStep(session, next, ports);
      session = step.session;
      for (const call of step.calls) {
        expect((shell.SHELL_PORT_MEMBERS[call.port] as readonly string[])).toContain(
          call.member,
        );
      }
    }
  });

  test("the whole walk is deterministic: re-walking reproduces byte-identical documents", async () => {
    const ports = makeShellPorts();
    const runDocs = (): Promise<string[]> => {
      const walk = [
        shell.contextAddress(PROJECT_ID),
        shell.realityAddress(PROJECT_ID, REALITY_VERSION),
        shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID),
        shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH),
        shell.caseAddress(PROJECT_ID, CASE_ID),
      ];
      const documents: string[] = [];
      let session = shell.beginShellSession(walk[0]!);
      return (async () => {
        for (const next of walk) {
          const step = await walkStep(session, next, ports);
          session = step.session;
          documents.push(step.html);
        }
        return documents;
      })();
    };
    expect(await runDocs()).toEqual(await runDocs());
  });
});

/* ------------------------------------------------------------------ */
/* The honest variants of the walk                                      */
/* ------------------------------------------------------------------ */

describe("the honest variants of the walk", () => {
  test("an unauthorized principal completes the same AISE-centered walk with the action DISABLED + named", async () => {
    const ports = makeShellPorts();
    const caseAddress = shell.caseAddress(PROJECT_ID, CASE_ID);
    const input = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(caseAddress),
      principalId: PRINCIPAL_BOB,
    });
    const html = shell.renderAdoptionShell(input);
    // the inspection surface works identically (AISE-centered)
    expect(input.pane?.module).toBe("case");
    expect(html).toContain("Fire rating discrepancy — storey 2 north wall");
    // ...but every connector action is DISABLED with its refusal named
    expect(html).not.toContain(`data-offer-state="allowed"`);
    expect(html).toContain("DISABLED — authorization refused: <code>missing_permission</code>");
    expect(html).toContain("DISABLED — authorization refused: <code>membership_revoked</code>");
    // and the return paths are still rendered for the disabled offers
    expect(html).toContain(
      `returns to AISE at <code>aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}</code>`,
    );
  });

  test("a deployment without an authorization port walks the same route with honest unknowns", async () => {
    const ports: ShellPorts = { ...makeShellPorts(), authorization: undefined };
    const caseAddress = shell.caseAddress(PROJECT_ID, CASE_ID);
    const input = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(caseAddress),
      principalId: PRINCIPAL_ALICE,
    });
    const html = shell.renderAdoptionShell(input);
    expect(input.pane?.module).toBe("case");
    expect(html).toContain(`data-offer-state="unavailable" data-disabled="true"`);
    expect(html).toContain("<code>authorization-port-absent</code>");
    expect(html).not.toContain(`data-offer-state="allowed"`);
    expect(html).not.toContain('data-enabled="true"');
  });

  test("a deployment with no data ports at all still renders the honest shell", async () => {
    const input = await shell.loadShellInput(
      {},
      {
        session: shell.beginShellSession(shell.contextAddress(PROJECT_ID)),
        principalId: PRINCIPAL_ALICE,
      },
    );
    const html = shell.renderAdoptionShell(input);
    expect(html).toContain("honestly omitted");
    expect(html).toContain("Project context not available");
    expect(html).toContain("data-omission-pane=\"context\"");
    expect(html).toContain("data-omission-pane=\"connectors\"");
  });

  test("the external round trip never claims incumbent authority: the footer + labels persist", async () => {
    const ports = makeShellPorts();
    const html = shell.renderAdoptionShell(
      await shell.loadShellInput(ports, {
        session: shell.beginShellSession(shell.caseAddress(PROJECT_ID, CASE_ID)),
        principalId: PRINCIPAL_ALICE,
      }),
    );
    expect(html).toContain("Read-only adoption shell");
    expect(html).toContain("incumbent systems remain connected systems of record");
    expect(html).toContain("external record identities are verbatim references");
  });
});
