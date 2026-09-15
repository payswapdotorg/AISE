/**
 * AISE-040 shell tests — the deep-link codec and the breadcrumb session
 * model: round-trips (typed structures ↔ canonical text), the strict
 * malformed-address rejections (typed errors, never silent fallbacks) and
 * the append-only session walk.
 */

import { describe, expect, test } from "bun:test";
import * as shell from "./index";
import {
  BOQ_IMPORT_ID,
  CASE_ID,
  EV_WALL_NORTH,
  PROJECT_ID,
  REALITY_VERSION,
} from "./fixtures";

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
/* Round-trips (typed structure → canonical text → typed structure)    */
/* ------------------------------------------------------------------ */

describe("address round-trips", () => {
  test("every module's address survives format → parse unchanged", () => {
    const addresses: readonly shell.ShellAddress[] = [
      shell.contextAddress(PROJECT_ID),
      shell.realityAddress(PROJECT_ID),
      shell.realityAddress(PROJECT_ID, REALITY_VERSION),
      shell.realityAddress(PROJECT_ID, REALITY_VERSION, "wall-north"),
      shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID),
      shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH),
      shell.caseAddress(PROJECT_ID, CASE_ID),
    ];
    for (const address of addresses) {
      expect(shell.parseShellAddress(shell.formatShellAddress(address))).toEqual(address);
    }
  });

  test("the canonical text form is stable (format → parse → format)", () => {
    const texts = [
      `aise-shell://context?p=${PROJECT_ID}`,
      `aise-shell://reality?p=${PROJECT_ID}&v=${REALITY_VERSION}&n=wall-north`,
      `aise-shell://boq?p=${PROJECT_ID}&i=${BOQ_IMPORT_ID}`,
      `aise-shell://evidence?p=${PROJECT_ID}&e=${EV_WALL_NORTH}`,
      `aise-shell://case?p=${PROJECT_ID}&c=${CASE_ID}`,
    ];
    for (const text of texts) {
      expect(shell.formatShellAddress(shell.parseShellAddress(text))).toBe(text);
    }
  });

  test("entity ids with URI-significant characters round-trip verbatim", () => {
    const address = shell.boqAddress("proj /α 1", "import #42&x");
    const text = shell.formatShellAddress(address);
    expect(text).toContain(encodeURIComponent("proj /α 1"));
    const parsed = shell.parseShellAddress(text);
    expect(parsed).toEqual(address);
    if (parsed.module === "boq") {
      expect(parsed.importId).toBe("import #42&x");
    } else {
      expect.unreachable();
    }
  });

  test("addressKey is the canonical identity (absent vs omitted optionals equal)", () => {
    expect(shell.addressKey(shell.realityAddress(PROJECT_ID))).toBe(
      shell.addressKey(shell.realityAddress(PROJECT_ID)),
    );
    expect(shell.addressKey(shell.realityAddress(PROJECT_ID))).not.toBe(
      shell.addressKey(shell.realityAddress(PROJECT_ID, REALITY_VERSION)),
    );
    expect(shell.addressKey(shell.contextAddress(PROJECT_ID))).toBe(
      shell.formatShellAddress(shell.contextAddress(PROJECT_ID)),
    );
  });

  test("the optional reality params are independently addressable", () => {
    const versionOnly = shell.parseShellAddress(
      `aise-shell://reality?p=${PROJECT_ID}&v=${REALITY_VERSION}`,
    );
    expect(versionOnly).toEqual({ module: "reality", projectId: PROJECT_ID, versionId: REALITY_VERSION });
    const nodeOnly = shell.parseShellAddress(
      `aise-shell://reality?p=${PROJECT_ID}&n=wall-north`,
    );
    expect(nodeOnly).toEqual({ module: "reality", projectId: PROJECT_ID, nodeId: "wall-north" });
  });
});

/* ------------------------------------------------------------------ */
/* Malformed addresses (typed rejections — never silent fallbacks)    */
/* ------------------------------------------------------------------ */

describe("malformed address rejections", () => {
  test("wrong or missing scheme", () => {
    expectCode(() => shell.parseShellAddress("aise://context?p=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress("https://aise/context?p=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress("context?p=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress(""), "invalid_address");
  });

  test("unknown module", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://finance?p=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://Context?p=x"), "invalid_address");
  });

  test("module path with a slash is malformed", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://context/x?p=y"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell:///context?p=x"), "invalid_address");
  });

  test("missing query", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://context"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://reality"), "invalid_address");
  });

  test("missing required module parameter", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://context"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://boq?p=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://boq?i=1"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://evidence?p=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://case?p=x"), "invalid_address");
  });

  test("unknown parameter for the module", () => {
    expectCode(
      () => shell.parseShellAddress("aise-shell://context?p=x&v=v003"),
      "invalid_address",
    );
    expectCode(
      () => shell.parseShellAddress("aise-shell://boq?p=x&i=1&e=2"),
      "invalid_address",
    );
    expectCode(
      () => shell.parseShellAddress("aise-shell://case?p=x&c=1&n=2"),
      "invalid_address",
    );
  });

  test("duplicate parameter", () => {
    expectCode(
      () => shell.parseShellAddress(`aise-shell://context?p=a&p=b`),
      "invalid_address",
    );
    expectCode(
      () => shell.parseShellAddress(`aise-shell://reality?p=a&v=1&v=2`),
      "invalid_address",
    );
  });

  test("empty or whitespace parameter values", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://context?p="), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://context?p=%20"), "invalid_address");
    expectCode(
      () => shell.parseShellAddress(`aise-shell://boq?p=${PROJECT_ID}&i=`),
      "invalid_address",
    );
  });

  test("keyless or valueless pairs", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://context?=x"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://context?p"), "invalid_address");
  });

  test("invalid percent-encoding", () => {
    expectCode(() => shell.parseShellAddress("aise-shell://context?p=%zz"), "invalid_address");
    expectCode(() => shell.parseShellAddress("aise-shell://context?p=%E2%98"), "invalid_address");
  });

  test("non-string input", () => {
    expectCode(
      () => shell.parseShellAddress(42 as unknown as string),
      "invalid_address",
    );
  });

  test("STRUCT validation is strict (unknown fields rejected, builders reject garbage)", () => {
    expectCode(
      () =>
        shell.validateShellAddress({
          module: "context",
          projectId: PROJECT_ID,
          caseId: CASE_ID,
        } as unknown as shell.ShellAddress),
      "invalid_address",
    );
    expectCode(
      () => shell.validateShellAddress({ module: "context", projectId: "" }),
      "invalid_address",
    );
    expectCode(
      () => shell.validateShellAddress({ module: "finance", projectId: "x" } as unknown as shell.ShellAddress),
      "invalid_address",
    );
    expectCode(() => shell.contextAddress("  "), "invalid_address");
    expectCode(
      () => shell.boqAddress(PROJECT_ID, ""),
      "invalid_address",
    );
    expectCode(
      () => shell.realityAddress(PROJECT_ID, "v003", ""),
      "invalid_address",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The breadcrumb session model                                        */
/* ------------------------------------------------------------------ */

describe("the breadcrumb session", () => {
  test("begin starts one crumb; current is the entry", () => {
    const session = shell.beginShellSession(shell.contextAddress(PROJECT_ID));
    expect(shell.sessionBreadcrumbs(session)).toHaveLength(1);
    expect(shell.currentShellAddress(session)).toEqual(shell.contextAddress(PROJECT_ID));
  });

  test("extend appends and preserves the whole prior chain (append-only)", () => {
    const context = shell.contextAddress(PROJECT_ID);
    const reality = shell.realityAddress(PROJECT_ID, REALITY_VERSION);
    const boq = shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID);
    const evidence = shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH);
    const kase = shell.caseAddress(PROJECT_ID, CASE_ID);
    let session = shell.beginShellSession(context);
    for (const next of [reality, boq, evidence, kase]) {
      session = shell.extendShellSession(session, next);
    }
    expect(session.breadcrumbs.map((crumb) => crumb.address)).toEqual([
      context,
      reality,
      boq,
      evidence,
      kase,
    ]);
    expect(shell.currentShellAddress(session)).toEqual(kase);
  });

  test("a CONSECUTIVE repeat is a no-op (not a new crumb)", () => {
    const context = shell.contextAddress(PROJECT_ID);
    const session = shell.extendShellSession(
      shell.beginShellSession(context),
      context,
    );
    expect(shell.sessionBreadcrumbs(session)).toHaveLength(1);
  });

  test("a non-consecutive repeat is preserved (going back is navigation too)", () => {
    const context = shell.contextAddress(PROJECT_ID);
    const reality = shell.realityAddress(PROJECT_ID, REALITY_VERSION);
    let session = shell.beginShellSession(context);
    session = shell.extendShellSession(session, reality);
    session = shell.extendShellSession(session, context);
    expect(shell.sessionBreadcrumbs(session)).toHaveLength(3);
    expect(shell.sessionContainsAddress(session, reality)).toBe(true);
    expect(shell.sessionContainsAddress(session, context)).toBe(true);
  });

  test("sessionContainsAddress matches exactly (not by prefix)", () => {
    const session = shell.beginShellSession(shell.realityAddress(PROJECT_ID, REALITY_VERSION));
    expect(shell.sessionContainsAddress(session, shell.realityAddress(PROJECT_ID))).toBe(false);
    expect(
      shell.sessionContainsAddress(session, shell.realityAddress(PROJECT_ID, REALITY_VERSION)),
    ).toBe(true);
  });

  test("malformed sessions are typed rejections", () => {
    expectCode(
      () => shell.validateShellSession({ breadcrumbs: [] }),
      "session_invalid",
    );
    expectCode(
      () => shell.validateShellSession({ breadcrumbs: [{ address: 7 }] } as unknown as shell.ShellSession),
      "session_invalid",
    );
    expectCode(
      () => shell.validateShellSession(null as unknown as shell.ShellSession),
      "session_invalid",
    );
    expectCode(
      () => shell.extendShellSession({ breadcrumbs: [] }, shell.contextAddress("x")),
      "session_invalid",
    );
    // a crumb carrying a malformed address is rejected with the ADDRESS
    // code (the precise diagnosis — the session surfaces it, never hides it)
    expectCode(
      () =>
        shell.validateShellSession({
          breadcrumbs: [{ address: { module: "finance", projectId: "x" } }],
        } as unknown as shell.ShellSession),
      "invalid_address",
    );
  });

  test("crumbLabel names the module and the verbatim ids", () => {
    expect(shell.crumbLabel(shell.contextAddress(PROJECT_ID))).toBe(`context ${PROJECT_ID}`);
    expect(
      shell.crumbLabel(shell.realityAddress(PROJECT_ID, REALITY_VERSION, "wall-north")),
    ).toBe(`reality ${PROJECT_ID} ${REALITY_VERSION} wall-north`);
    expect(shell.crumbLabel(shell.boqAddress(PROJECT_ID, BOQ_IMPORT_ID))).toBe(
      `boq ${BOQ_IMPORT_ID}`,
    );
    expect(shell.crumbLabel(shell.evidenceAddress(PROJECT_ID, EV_WALL_NORTH))).toBe(
      `evidence ${EV_WALL_NORTH}`,
    );
    expect(shell.crumbLabel(shell.caseAddress(PROJECT_ID, CASE_ID))).toBe(`case ${CASE_ID}`);
  });
});
