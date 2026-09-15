/**
 * AISE-040 shell tests — the structural model: the source-reference
 * discipline (unsourced display values are typed boundary rejections),
 * the view validators' shape rejections, the frozen vocabularies and the
 * AISE-036 authorization-decision mirror.
 */

import { describe, expect, test } from "bun:test";
import * as shell from "./index";
import {
  boqImportView,
  bimBinding,
  caseView,
  contextView,
  evidenceWallEast,
  realityV003,
} from "./fixtures";
import type {
  CasePaneView,
  ConnectorBindingView,
  ContextPaneView,
  EvidencePaneView,
  RealityPaneView,
  ShellAuthorizationDecision,
  ShellOmission,
} from "./index";

function expectCode(fn: () => unknown, code: shell.ShellErrorCode): void {
  try {
    fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(shell.ShellError);
    expect((error as shell.ShellError).code).toBe(code);
  }
}

/** A sourced text with its source REMOVED (the discipline tripwire). */
const UNSOURCED_TEXT = { value: "sneaky unsourced value" } as shell.SourcedValue<string>;

/* ------------------------------------------------------------------ */
/* The source-reference discipline                                     */
/* ------------------------------------------------------------------ */

describe("source-reference discipline (unsourced values are rejected)", () => {
  test("a valid source passes; a value without a source is a typed rejection", () => {
    const good: shell.SourcedValue<string> = {
      value: "v",
      source: { module: "reality", recordId: "v003" },
    };
    expect(shell.validateSourcedText(good)).toBe(good);
    expectCode(() => shell.validateSourcedText(UNSOURCED_TEXT), "source_reference_required");
  });

  test("the source module must be a known module family", () => {
    expectCode(
      () =>
        shell.validateSourceRef({
          module: "spreadsheets",
          recordId: "x",
        } as unknown as shell.SourceRef),
      "source_reference_required",
    );
    expectCode(
      () => shell.validateSourceRef({ module: "reality", recordId: "" }),
      "source_reference_required",
    );
    expectCode(
      () => shell.validateSourceRef(null as unknown as shell.SourceRef),
      "source_reference_required",
    );
  });

  test("sourced numbers must be finite with a source", () => {
    const good: shell.SourcedValue<number> = {
      value: 42,
      source: { module: "boq", recordId: "boq-0042" },
    };
    expect(shell.validateSourcedNumber(good)).toBe(good);
    expectCode(
      () =>
        shell.validateSourcedNumber({ value: Number.NaN, source: good.source }),
      "source_reference_required",
    );
    expectCode(
      () => shell.validateSourcedNumber({ value: 42 } as shell.SourcedValue<number>),
      "source_reference_required",
    );
  });

  test("every pane view rejects an unsourced display value", () => {
    expectCode(
      () =>
        shell.validateContextPaneView({
          ...contextView(),
          projectName: UNSOURCED_TEXT,
        } as ContextPaneView),
      "source_reference_required",
    );
    const reality = realityV003();
    expectCode(
      () =>
        shell.validateRealityPaneView({
          ...reality,
          nodes: [{ ...reality.nodes[0]!, summary: UNSOURCED_TEXT }],
        } as RealityPaneView),
      "source_reference_required",
    );
    expectCode(
      () =>
        shell.validateBoqPaneView({
          ...boqImportView(),
          format: UNSOURCED_TEXT,
        }),
      "source_reference_required",
    );
    expectCode(
      () =>
        shell.validateEvidencePaneView({
          ...evidenceWallEast(),
          capturedAt: UNSOURCED_TEXT,
        } as EvidencePaneView),
      "source_reference_required",
    );
    expectCode(
      () =>
        shell.validateCasePaneView({
          ...caseView(),
          title: UNSOURCED_TEXT,
        } as CasePaneView),
      "source_reference_required",
    );
  });

  test("connector bindings and action labels are sourced too", () => {
    expectCode(
      () =>
        shell.validateConnectorBindingView({
          ...bimBinding(),
          displayName: UNSOURCED_TEXT,
        } as ConnectorBindingView),
      "source_reference_required",
    );
    const binding = bimBinding();
    expectCode(
      () =>
        shell.validateConnectorBindingView({
          ...binding,
          actions: [{ ...binding.actions[0]!, label: UNSOURCED_TEXT }],
        } as ConnectorBindingView),
      "source_reference_required",
    );
  });

  test("a view whose record source is missing is a typed rejection", () => {
    const context = contextView();
    expectCode(
      () =>
        shell.validateContextPaneView({ ...context, source: null } as unknown as ContextPaneView),
      "source_reference_required",
    );
  });
});

/* ------------------------------------------------------------------ */
/* View shape rejections (typed invalid_input)                          */
/* ------------------------------------------------------------------ */

describe("view shape rejections", () => {
  test("context views require org + project ids", () => {
    expectCode(
      () => shell.validateContextPaneView({ ...contextView(), projectId: "" }),
      "invalid_input",
    );
  });

  test("reality views require a nodes array and valid node fields", () => {
    expectCode(
      () => shell.validateRealityPaneView({ ...realityV003(), nodes: 7 } as unknown as RealityPaneView),
      "invalid_input",
    );
    expectCode(
      () =>
        shell.validateRealityPaneView({ ...realityV003(), versionId: "" }),
      "invalid_input",
    );
    const reality = realityV003();
    expectCode(
      () =>
        shell.validateRealityPaneView({
          ...reality,
          nodes: [{ ...reality.nodes[0]!, kind: "" }],
        } as RealityPaneView),
      "invalid_input",
    );
  });

  test("boq views require sheets, formats and non-negative counts", () => {
    expectCode(
      () => shell.validateBoqPaneView({ ...boqImportView(), sheets: "none" } as unknown as ReturnType<typeof boqImportView>),
      "invalid_input",
    );
    const boq = boqImportView();
    expectCode(
      () =>
        shell.validateBoqPaneView({
          ...boq,
          sheets: [{ ...boq.sheets[0]!, rowCount: -1 }],
        } as ReturnType<typeof boqImportView>),
      "invalid_input",
    );
  });

  test("evidence and case views reject bad shapes", () => {
    expectCode(
      () => shell.validateEvidencePaneView({ ...evidenceWallEast(), evidenceId: "" }),
      "invalid_input",
    );
    expectCode(
      () => shell.validateCasePaneView({ ...caseView(), observationCount: -1 } as CasePaneView),
      "invalid_input",
    );
  });

  test("connector bindings reject bad statuses, ids and action kinds", () => {
    expectCode(
      () =>
        shell.validateConnectorBindingView({ ...bimBinding(), status: "connected-ish" } as unknown as ConnectorBindingView),
      "invalid_input",
    );
    expectCode(
      () => shell.validateConnectorBindingView({ ...bimBinding(), bindingId: "" } as ConnectorBindingView),
      "invalid_input",
    );
    const binding = bimBinding();
    expectCode(
      () =>
        shell.validateConnectorBindingView({
          ...binding,
          actions: [{ ...binding.actions[0]!, kind: "delete-everything" as shell.ConnectorActionKind }],
        } as ConnectorBindingView),
      "invalid_input",
    );
  });

  test("omissions must name a known pane and reason", () => {
    const good: ShellOmission = {
      pane: "reality",
      reason: "port_absent",
      detail: "not wired",
    };
    expect(shell.validateShellOmission(good)).toBe(good);
    expectCode(
      () => shell.validateShellOmission({ ...good, pane: "finance" } as unknown as ShellOmission),
      "invalid_input",
    );
    expectCode(
      () => shell.validateShellOmission({ ...good, reason: "lazy" } as unknown as ShellOmission),
      "invalid_input",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The AISE-036 authorization-decision mirror                           */
/* ------------------------------------------------------------------ */

describe("the authorization-decision mirror (AISE-036 shapes, verbatim)", () => {
  const allowed: ShellAuthorizationDecision = {
    allowed: true,
    grant: {
      membershipId: "mbr-011",
      roleId: "role-engineer",
      permission: "reality:write",
      scope: { kind: "project", projectId: "proj-riverside-refit" },
    },
  };
  const refused: ShellAuthorizationDecision = {
    allowed: false,
    refusal: {
      code: "cross_tenant",
      detail: "principal user-carol is a member of another organization",
      principalId: "user-carol",
      target: {
        kind: "project",
        organizationId: "org-northwind",
        projectId: "proj-riverside-refit",
      },
    },
  };

  test("allowed and refused decisions pass shape validation verbatim", () => {
    expect(shell.validateAuthorizationDecision(allowed)).toBe(allowed);
    expect(shell.validateAuthorizationDecision(refused)).toBe(refused);
  });

  test("malformed decisions are typed rejections", () => {
    expectCode(
      () => shell.validateAuthorizationDecision({ allowed: true } as unknown as ShellAuthorizationDecision),
      "invalid_input",
    );
    expectCode(
      () =>
        shell.validateAuthorizationDecision({
          allowed: true,
          grant: { membershipId: "m", roleId: "r", permission: "p", scope: { kind: "banana" } },
        } as unknown as ShellAuthorizationDecision),
      "invalid_input",
    );
    expectCode(
      () =>
        shell.validateAuthorizationDecision({
          allowed: false,
          refusal: { code: "x", detail: "d" },
        } as unknown as ShellAuthorizationDecision),
      "invalid_input",
    );
    expectCode(
      () => shell.validateAuthorizationDecision({ allowed: "yes" } as unknown as ShellAuthorizationDecision),
      "invalid_input",
    );
  });

  test("permission targets must be org- or project-shaped", () => {
    expect(shell.validatePermissionTarget(refused.refusal.target)).toBe(refused.refusal.target);
    expectCode(
      () =>
        shell.validatePermissionTarget({ kind: "organization", organizationId: "" }),
      "invalid_input",
    );
    expectCode(
      () =>
        shell.validatePermissionTarget({
          kind: "project",
          organizationId: "o",
        } as shell.ShellPermissionTarget),
      "invalid_input",
    );
    expectCode(
      () => shell.validatePermissionTarget({ kind: "tenant" } as never),
      "invalid_input",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The frozen vocabularies                                             */
/* ------------------------------------------------------------------ */

describe("frozen vocabularies (the shell's OWN presentation registries)", () => {
  test("every registry is frozen with the expected members", () => {
    expect(Object.isFrozen(shell.SHELL_MODULES)).toBe(true);
    expect([...shell.SHELL_MODULES]).toEqual(["context", "reality", "boq", "evidence", "case"]);
    expect(Object.isFrozen(shell.SHELL_OMISSION_PANES)).toBe(true);
    expect([...shell.SHELL_OMISSION_PANES]).toEqual([
      "context",
      "reality",
      "boq",
      "evidence",
      "case",
      "connectors",
    ]);
    expect(Object.isFrozen(shell.SHELL_OMISSION_REASONS)).toBe(true);
    expect([...shell.SHELL_OMISSION_REASONS]).toEqual(["port_absent", "record_unresolved"]);
    expect(Object.isFrozen(shell.BINDING_STATUSES)).toBe(true);
    expect([...shell.BINDING_STATUSES]).toEqual([
      "connected",
      "unavailable",
      "unknown-last-sync",
    ]);
    expect(Object.isFrozen(shell.CONNECTOR_ACTION_KINDS)).toBe(true);
    expect([...shell.CONNECTOR_ACTION_KINDS]).toEqual([
      "export-derived",
      "import-entities",
      "import-documents",
      "open-record",
    ]);
    expect(Object.isFrozen(shell.SOURCE_MODULES)).toBe(true);
    expect(Object.isFrozen(shell.SHELL_ERROR_CODES)).toBe(true);
    expect([...shell.SHELL_ERROR_CODES]).toEqual([
      "invalid_input",
      "invalid_address",
      "source_reference_required",
      "session_invalid",
    ]);
  });

  test("the connector action kinds mirror AISE-037 capability names verbatim", () => {
    // documented attribution: the first three ARE the 037 capability strings
    expect(shell.CONNECTOR_ACTION_KINDS).toContain("export-derived");
    expect(shell.CONNECTOR_ACTION_KINDS).toContain("import-entities");
    expect(shell.CONNECTOR_ACTION_KINDS).toContain("import-documents");
  });

  test("the error class carries its stable code and detail", () => {
    const error = new shell.ShellError("invalid_address", "detail text");
    expect(error.message).toBe("invalid_address: detail text");
    expect(error.code).toBe("invalid_address");
    expect(error.detail).toBe("detail text");
  });
});
