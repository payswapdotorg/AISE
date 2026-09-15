/**
 * AISE-040 shell tests — the deterministic HTML render: document
 * structure, byte-identical determinism, the source attributes on every
 * displayed value, breadcrumb deep links, pane contents, external-system
 * status honesty (unknown never rendered as connected; system-of-record
 * labels), the tri-state offer rendering with named refusal reasons and
 * return paths, and the typed omission notices.
 */

import { describe, expect, test } from "bun:test";
import * as shell from "./index";
import {
  BOQ_IMPORT_ID,
  BINDING_BIM,
  BINDING_ERP,
  BINDING_PM,
  CASE_ID,
  EV_BOQ_SOURCE,
  EV_WALL_EAST,
  EV_WALL_NORTH,
  PROJECT_ID,
  PRINCIPAL_ALICE,
  PRINCIPAL_BOB,
  REALITY_VERSION,
  contextView,
  deepFreeze,
  emptyShellPorts,
  makeShellPorts,
} from "./fixtures";
import type { LoadShellOptions, ShellInput, ShellPorts } from "./index";

async function loadAt(
  address: shell.ShellAddress,
  ports: ShellPorts = makeShellPorts(),
  principalId = PRINCIPAL_ALICE,
): Promise<ShellInput> {
  const options: LoadShellOptions = {
    session: shell.beginShellSession(address),
    principalId,
  };
  return shell.loadShellInput(ports, options);
}

function expectCode(fn: () => unknown, code: shell.ShellErrorCode): void {
  try {
    fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(shell.ShellError);
    expect((error as shell.ShellError).code).toBe(code);
  }
}

/* ------------------------------------------------------------------ */
/* Document structure + determinism                                    */
/* ------------------------------------------------------------------ */

describe("document structure and determinism", () => {
  test("renders a complete HTML document with the shell identity attributes", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID)),
    );
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">\n")).toBe(true);
    expect(html).toContain(`data-generator="${shell.SHELL_GENERATOR_VERSION}"`);
    expect(html).toContain(`data-project-id="${PROJECT_ID}"`);
    expect(html).toContain(`data-current-module="case"`);
    expect(html).toContain(
      `data-current-address="aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}"`,
    );
    expect(html).toContain("</html>\n");
  });

  test("BYTE-IDENTICAL: two renders of the same input produce the same document", async () => {
    const input = await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID));
    expect(shell.renderAdoptionShell(input)).toBe(shell.renderAdoptionShell(input));
  });

  test("BYTE-IDENTICAL across fresh loads (end-to-end determinism)", async () => {
    const a = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    const b = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    expect(a).toBe(b);
  });

  test("purity: a deep-frozen input survives rendering untouched", async () => {
    const frozen = deepFreeze(await loadAt(shell.contextAddress(PROJECT_ID)));
    const before = JSON.stringify(frozen);
    shell.renderAdoptionShell(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  test("HTML escaping: hostile text never reaches the document raw", async () => {
    const ports: ShellPorts = {
      ...makeShellPorts(),
      context: {
        readContext: async () => ({
          ...contextView(),
          projectName: {
            value: "R&D <team> \"quotes\" & 'apostrophes'",
            source: { module: "context" as const, recordId: PROJECT_ID },
          },
        }),
      },
    };
    const input = await shell.loadShellInput(ports, {
      session: shell.beginShellSession(shell.contextAddress(PROJECT_ID)),
      principalId: PRINCIPAL_ALICE,
    });
    const html = shell.renderAdoptionShell(input);
    expect(html).toContain(
      "R&amp;D &lt;team&gt; &quot;quotes&quot; &amp; &apos;apostrophes&apos;",
    );
    expect(html).not.toContain("R&D <team>");
  });

  test("an invalid input is a typed rejection at the render boundary", async () => {
    expectCode(
      () => shell.renderAdoptionShell(null as unknown as ShellInput),
      "invalid_input",
    );
    expectCode(
      () =>
        shell.renderAdoptionShell({
          session: { breadcrumbs: [] },
        } as unknown as ShellInput),
      "session_invalid",
    );
  });

  test("an unsourced value inside a rendered input is rejected, never rendered", async () => {
    const input = await loadAt(shell.contextAddress(PROJECT_ID));
    const unsourced = {
      ...input,
      context: { ...input.context!, projectName: { value: "ghost" } },
    } as unknown as ShellInput;
    expectCode(() => shell.renderAdoptionShell(unsourced), "source_reference_required");
  });
});

/* ------------------------------------------------------------------ */
/* Context header + breadcrumbs                                        */
/* ------------------------------------------------------------------ */

describe("context header and breadcrumbs", () => {
  test("the header shows the discovered context, every value with its source", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    expect(html).toContain(`data-organization-id="org-northwind"`);
    expect(html).toContain(`<code>${PROJECT_ID}</code>`);
    expect(html).toContain("Riverside office refit");
    expect(html).toContain(`data-source-module="context" data-source-record="${PROJECT_ID}"`);
    expect(html).toContain("systems of record where required");
  });

  test("the breadcrumb bar renders the whole walk as deep links, current marked", async () => {
    const context = shell.contextAddress(PROJECT_ID);
    const reality = shell.realityAddress(PROJECT_ID, REALITY_VERSION);
    const kase = shell.caseAddress(PROJECT_ID, CASE_ID);
    let session = shell.beginShellSession(context);
    session = shell.extendShellSession(session, reality);
    session = shell.extendShellSession(session, kase);
    const input = await shell.loadShellInput(makeShellPorts(), {
      session,
      principalId: PRINCIPAL_ALICE,
    });
    const html = shell.renderAdoptionShell(input);
    expect(html).toContain(`data-crumb-count="3"`);
    expect(html).toContain(`data-crumb-index="2" data-current="true"`);
    expect(html).toContain(`href="aise-shell://context?p=${PROJECT_ID}"`);
    expect(html).toContain(
      `href="aise-shell://reality?p=${PROJECT_ID}&amp;v=${REALITY_VERSION}"`,
    );
    expect(html).toContain(`href="aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}"`);
  });

  test("a missing context renders the honest header omission, not fake data", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.contextAddress(PROJECT_ID), emptyShellPorts()),
    );
    expect(html).toContain("Project context not available");
    expect(html).not.toContain("Riverside office refit");
  });
});

/* ------------------------------------------------------------------ */
/* Panes                                                               */
/* ------------------------------------------------------------------ */

describe("the addressed panes", () => {
  test("the context pane lists deep-link entries (reality/BOQ/cases)", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    expect(html).toContain(`href="aise-shell://reality?p=${PROJECT_ID}&amp;v=${REALITY_VERSION}"`);
    expect(html).toContain(`href="aise-shell://boq?p=${PROJECT_ID}&amp;i=${BOQ_IMPORT_ID}"`);
    expect(html).toContain(`href="aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}"`);
    expect(html).toContain(`id="pane-context"`);
  });

  test("the reality pane renders nodes with kinds, epistemics and evidence links", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.realityAddress(PROJECT_ID, REALITY_VERSION, "wall-north")),
    );
    expect(html).toContain(`id="pane-reality"`);
    expect(html).toContain(`data-node-id="wall-north" data-current-node="true"`);
    expect(html).toContain("<code>CONFIRMED</code>");
    expect(html).toContain("<code>OBSERVED</code>");
    expect(html).toContain("<code>INFERRED</code>");
    expect(html).toContain(
      `href="aise-shell://evidence?p=${PROJECT_ID}&amp;e=${EV_WALL_NORTH}"`,
    );
  });

  test("the boq pane renders the verbatim import identity and sheets", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID)),
    );
    expect(html).toContain(`id="pane-boq"`);
    expect(html).toContain(`<code>${BOQ_IMPORT_ID}</code>`);
    expect(html).toContain("Measurable");
    expect(html).toContain(
      `href="aise-shell://evidence?p=${PROJECT_ID}&amp;e=${EV_BOQ_SOURCE}"`,
    );
    expect(html).toContain("system of record for its content");
  });

  test("the evidence pane renders the record and its honest invalidation state", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.evidenceAddress(PROJECT_ID, EV_WALL_EAST)),
    );
    expect(html).toContain(`id="pane-evidence"`);
    expect(html).toContain("STILL_IMAGERY");
    expect(html).toContain(`data-invalidated="true"`);
    expect(html).toContain("superseded by re-capture");
    const valid = shell.renderAdoptionShell(
      await loadAt(shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH)),
    );
    expect(valid).toContain(`data-invalidated="false"`);
    expect(valid).toContain(
      `href="aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}"`,
    );
  });

  test("the case pane renders counts and evidence links", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID)),
    );
    expect(html).toContain(`id="pane-case"`);
    expect(html).toContain("Fire rating discrepancy — storey 2 north wall");
    expect(html).toContain("in-review");
    expect(html).toContain(
      `href="aise-shell://evidence?p=${PROJECT_ID}&amp;e=${EV_WALL_NORTH}"`,
    );
  });

  test("an omitted pane renders its typed omission notice (not blank, not fake)", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID), emptyShellPorts()),
    );
    expect(html).toContain(`id="pane-boq"`);
    expect(html).toContain(`data-omission-code="port_absent"`);
    expect(html).toContain("honestly omitted");
  });
});

/* ------------------------------------------------------------------ */
/* The connector panel (status honesty + offers + return paths)        */
/* ------------------------------------------------------------------ */

describe("the connector panel — explicit external-system status", () => {
  test("every surface renders its binding status honestly and distinctly", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    expect(html).toContain(`data-binding-id="${BINDING_BIM}" data-binding-status="connected"`);
    expect(html).toContain(`data-binding-id="${BINDING_ERP}" data-binding-status="unavailable"`);
    expect(
      html.includes(`data-binding-id="${BINDING_PM}" data-binding-status="unknown-last-sync"`),
    ).toBe(true);
  });

  test("UNKNOWN is first-class: the unknown-last-sync surface never says connected", async () => {
    const input = await loadAt(shell.contextAddress(PROJECT_ID));
    const pmSurface = input.connectors.find(
      (surface) => surface.binding.bindingId === BINDING_PM,
    );
    expect(pmSurface).toBeDefined();
    expect(pmSurface?.binding.status).toBe("unknown-last-sync");
    expect(pmSurface?.binding.lastSyncAt).toBeNull();
    const html = shell.renderAdoptionShell(input);
    const pmBlock = html.slice(
      html.indexOf(`data-binding-id="${BINDING_PM}"`),
      html.indexOf("System of record", html.indexOf(`data-binding-id="${BINDING_PM}"`)),
    );
    expect(pmBlock).toContain("unknown-last-sync");
    expect(pmBlock).toContain("Status: unknown");
    expect(pmBlock).not.toContain("Status: connected");
    expect(pmBlock).not.toContain(`data-binding-status="connected"`);
  });

  test("every surface carries the SYSTEM OF RECORD label (the incumbent stays authoritative)", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    for (const bindingId of [BINDING_BIM, BINDING_ERP, BINDING_PM]) {
      const block = html.slice(
        html.indexOf(`data-binding-id="${bindingId}"`),
        html.indexOf("</article>", html.indexOf(`data-binding-id="${bindingId}"`)),
      );
      expect(block).toContain("System of record");
      expect(block).toContain("remains authoritative for its own data");
    }
  });

  test("external record refs render verbatim ids with their return paths", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID)));
    expect(html).toContain(`data-external-record-id="IFC-MODEL-0042"`);
    expect(html).toContain("<code>C3</code>");
    expect(html).toContain("open in incumbent system");
    expect(html).toContain(
      `returns to AISE at <code>aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}</code>`,
    );
    // the ERP ref has no URL — rendered honestly as not provided, never faked
    expect(html).toContain("incumbent link not provided");
    expect(html).toContain("<code>PO-2025-1187</code>");
  });
});

describe("the connector panel — the tri-state offers", () => {
  test("ALLOWED offers render ENABLED controls with the grant and the return path", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID)));
    expect(html).toContain(`data-action-id="act-bim-export"`);
    expect(html).toContain(`data-offer-state="allowed" data-enabled="true"`);
    expect(html).toContain(
      `href="https://bim.example.org/exports/derive?from=v003"`,
    );
    expect(html).toContain(
      "authorized via grant mbr-011 (role role-engineer, reality:write, project proj-riverside-refit scope)",
    );
    expect(html).toContain(`data-return-to="aise-shell://case?p=${PROJECT_ID}&amp;c=${CASE_ID}"`);
  });

  test("an allowed offer without an initiateUrl renders an enabled control with no href", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID)));
    // act-erp-import is ENABLED for alice (evidence:write) and has no URL
    const block = html.slice(
      html.indexOf('data-action-id="act-erp-import"'),
      html.indexOf("</div>", html.indexOf('data-action-id="act-erp-import"')),
    );
    expect(block).toContain(`data-offer-state="allowed" data-enabled="true"`);
    expect(block).toContain("data-initiate=\"act-erp-import\"");
    expect(block).not.toContain("href=");
  });

  test("REFUSED offers render DISABLED with the refusal reason NAMED", async () => {
    const html = shell.renderAdoptionShell(
      await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID), makeShellPorts(), PRINCIPAL_BOB),
    );
    expect(html).toContain(`data-offer-state="refused" data-disabled="true"`);
    expect(html).toContain("DISABLED — authorization refused: <code>missing_permission</code>");
    expect(html).toContain("DISABLED — authorization refused: <code>membership_revoked</code>");
    expect(html).not.toContain(`data-offer-state="allowed"`);
    expect(html).not.toContain('data-enabled="true"');
  });

  test("UNAVAILABLE offers render DISABLED with the honest unknown reason", async () => {
    const ports: ShellPorts = { ...makeShellPorts(), authorization: undefined };
    const html = shell.renderAdoptionShell(
      await loadAt(shell.caseAddress(PROJECT_ID, CASE_ID), ports),
    );
    expect(html).toContain(`data-offer-state="unavailable" data-disabled="true"`);
    expect(html).toContain("authorization unavailable");
    expect(html).toContain("<code>authorization-port-absent</code>");
    expect(html).not.toContain(`data-offer-state="allowed"`);
  });

  test("the offer panel is omitted honestly when the status port is absent", async () => {
    const ports: ShellPorts = { ...makeShellPorts(), connectorStatus: undefined };
    const html = shell.renderAdoptionShell(
      await loadAt(shell.contextAddress(PROJECT_ID), ports),
    );
    expect(html).toContain("Connector surfaces honestly omitted");
    expect(html).not.toContain("data-binding-id=");
  });
});

/* ------------------------------------------------------------------ */
/* The typed omission list + the authority footer                      */
/* ------------------------------------------------------------------ */

describe("the omission list and the footer", () => {
  test("every omission renders as a typed, machine-checkable notice", async () => {
    const input = await loadAt(shell.contextAddress(PROJECT_ID), emptyShellPorts());
    const html = shell.renderAdoptionShell(input);
    expect(html).toContain(`data-omission-count="2"`);
    expect(html).toContain(`data-omission-pane="connectors" data-omission-reason="port_absent"`);
    expect(html).toContain(`data-omission-pane="context" data-omission-reason="port_absent"`);
    expect(html).toContain("no data is shown rather than guessed");
  });

  test("a fully-resolved input renders the no-omissions note", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    expect(html).toContain("No omissions — every surface's data port is available and resolved.");
  });

  test("the footer states the authority contract (presentation, never authority)", async () => {
    const html = shell.renderAdoptionShell(await loadAt(shell.contextAddress(PROJECT_ID)));
    expect(html).toContain("Read-only adoption shell");
    expect(html).toContain("never fetches, never mutates and holds no authority");
    expect(html).toContain("AISE-036 identity semantics");
    expect(html).toContain(shell.SHELL_GENERATOR_VERSION);
  });
});
