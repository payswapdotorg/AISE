/**
 * HFX-204 — the bim-eval SERVICE tests: the fail-closed request parsers,
 * the corpus index, the fixture-run dispatch and the deterministic suite
 * aggregation (per-lane/per-kind counts + the summary record).
 */

import { describe, expect, test } from "bun:test";
import { BimEvalError } from "./model";
import {
  BimEvalService,
  parseCatalogRequest,
  parseFixtureRunRequest,
} from "./service";
import { BIM_EVAL_EDIT_FIXTURES, BIM_EVAL_QUESTION_FIXTURES } from "./testkit";

/* ------------------------------------------------------------------ */

describe("HFX-204 service: the fail-closed request parsers", () => {
  test("parseCatalogRequest accepts a lane filter or nothing", () => {
    expect(parseCatalogRequest({})).toEqual({});
    expect(parseCatalogRequest({ lane: "ifc-bench-questions" })).toEqual({
      lane: "ifc-bench-questions",
    });
    expect(parseCatalogRequest({ lane: "bim-edit-operations" })).toEqual({
      lane: "bim-edit-operations",
    });
  });

  test("parseCatalogRequest fails closed on garbage", () => {
    expect(() => parseCatalogRequest("nope")).toThrow(BimEvalError);
    expect(() => parseCatalogRequest({ lane: "vlm" })).toThrow(/lane/);
  });

  test("parseFixtureRunRequest fails closed on garbage", () => {
    expect(parseFixtureRunRequest({ fixtureId: "ifc-property-lookup-correct" })).toEqual({
      fixtureId: "ifc-property-lookup-correct",
    });
    expect(() => parseFixtureRunRequest({})).toThrow(/fixtureId/);
    expect(() => parseFixtureRunRequest({ fixtureId: "  " })).toThrow(/fixtureId/);
    expect(() => parseFixtureRunRequest([])).toThrow(BimEvalError);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 service: the corpus index", () => {
  const service = new BimEvalService();

  test("lists the whole corpus sorted by fixture id (29 fixtures)", () => {
    const listed = service.listFixtures();
    expect(listed.length).toBe(29);
    expect(listed[0]?.fixtureId).toBe("bim-edit-create-correct");
    for (let index = 1; index < listed.length; index += 1) {
      expect(
        (listed[index - 1]?.fixtureId ?? "").localeCompare(listed[index]?.fixtureId ?? ""),
      ).toBeLessThanOrEqual(0);
    }
  });

  test("filters by lane", () => {
    const questions = service.listFixtures({ lane: "ifc-bench-questions" });
    const edits = service.listFixtures({ lane: "bim-edit-operations" });
    expect(questions.length).toBe(15);
    expect(edits.length).toBe(14);
    expect(questions.every((entry) => entry.lane === "ifc-bench-questions")).toBe(true);
    expect(edits.every((entry) => entry.lane === "bim-edit-operations")).toBe(true);
    expect(edits.every((entry) => typeof entry.commandForm === "string")).toBe(true);
  });

  test("the negative-case fixtures are tagged in the listing", () => {
    const listed = service.listFixtures();
    const negatives = listed.filter((entry) => entry.negativeCase !== undefined);
    expect(negatives.length).toBe(9);
    expect(new Set(negatives.map((entry) => entry.negativeCase)).size).toBe(4);
  });

  test("a duplicate fixture id is refused (identity is unique)", () => {
    expect(
      () =>
        new BimEvalService(
          BIM_EVAL_QUESTION_FIXTURES,
          [...BIM_EVAL_EDIT_FIXTURES, BIM_EVAL_QUESTION_FIXTURES[0] as unknown as (typeof BIM_EVAL_EDIT_FIXTURES)[number]],
        ),
    ).toThrow(/duplicate fixture id/);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 service: the fixture run + the suite run", () => {
  const service = new BimEvalService();

  test("runFixture dispatches by lane and reproduces the harness outcomes", () => {
    const question = service.runFixture("ifc-conflicting-evidence");
    if (question.lane !== "ifc-bench-questions") {
      throw new Error("expected a question outcome");
    }
    expect(question.layer2.envelope.resultStatus).toBe("conflicted");
    expect(question.layer2.classification).toBe("none");

    const edit = service.runFixture("bim-edit-invalid-constraint");
    if (edit.lane !== "bim-edit-operations") {
      throw new Error("expected an edit outcome");
    }
    expect(edit.classification).toBe("operation-semantic-failure");
  });

  test("runFixture fails closed on an unknown fixture id", () => {
    expect(() => service.runFixture("no-such-fixture")).toThrow(BimEvalError);
    expect(() => service.runFixture("no-such-fixture")).toThrow(/unknown_fixture/);
  });

  test("runSuite aggregates per-lane/per-kind counts and the manifest digest", () => {
    const run = service.runSuite();
    expect(run.questionOutcomes.length).toBe(15);
    expect(run.editOutcomes.length).toBe(14);
    expect(run.summary.total).toBe(29);
    expect(run.summary.expectedMatches).toBe(29);
    expect(run.summary.byClassification["unsupported-data"]).toBe(6);
    expect(run.summary.byClassification["operation-semantic-failure"]).toBe(3);
    expect(run.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
    // deterministic: a second run reproduces the identical digest
    expect(service.runSuite().summary.provenanceManifestDigest).toBe(
      run.summary.provenanceManifestDigest,
    );
  });
});
