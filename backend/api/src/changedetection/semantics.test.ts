/**
 * AISE-033 semantics tests — kind-change records, verbatim property-set
 * diffs (add/remove/change), and the semantic.kind consistency check with
 * its honest-unknown carve-outs.
 */

import { describe, expect, test } from "bun:test";
import { compareVersions } from "./index";
import type { ChangeFinding } from "./model";
import { sslice, snode, sprop } from "./testkit";

/** `CODE:key` label for order assertions (findings without a key label by code alone). */
function codeKey(finding: ChangeFinding): string {
  return `${finding.code}:${"key" in finding ? finding.key : ""}`;
}

function twoVersionReport(
  fromProperties: readonly ReturnType<typeof sprop>[],
  toProperties: readonly ReturnType<typeof sprop>[],
  fromKind = "element",
  toKind = "element",
) {
  return compareVersions(
    sslice("v001", [snode("node-x", fromKind, fromProperties)]),
    sslice("v002", [snode("node-x", toKind, toProperties)]),
  );
}

describe("kind changes", () => {
  test("kind change recorded VERBATIM (old → new) alongside the identity flag", () => {
    const report = twoVersionReport([], [], "element", "opening");
    expect(report.matches[0]?.changes).toEqual([
      { code: "AMBIGUOUS_IDENTITY", fromKind: "element", toKind: "opening" },
      { code: "KIND_CHANGED", fromKind: "element", toKind: "opening" },
    ]);
  });
});

describe("property-set diffs", () => {
  test("property present only in the to-version ⇒ PROPERTY_ADDED with verbatim value/unit/status", () => {
    const report = twoVersionReport(
      [],
      [sprop("height", 2.7, { unit: "m", epistemicStatus: "CONFIRMED" })],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_ADDED",
        key: "height",
        toValue: 2.7,
        toUnit: "m",
        toEpistemicStatus: "CONFIRMED",
      },
    ]);
  });

  test("property present only in the from-version ⇒ PROPERTY_REMOVED with verbatim value/unit/status", () => {
    const report = twoVersionReport(
      [sprop("width", 4.2, { unit: "m", epistemicStatus: "OBSERVED" })],
      [],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_REMOVED",
        key: "width",
        fromValue: 4.2,
        fromUnit: "m",
        fromEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("changed value ⇒ PROPERTY_CHANGED carrying BOTH records verbatim", () => {
    const report = twoVersionReport(
      [sprop("label", "Storey 0", { epistemicStatus: "OBSERVED" })],
      [sprop("label", "Storey 1", { epistemicStatus: "CONFIRMED" })],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_CHANGED",
        key: "label",
        fromValue: "Storey 0",
        fromEpistemicStatus: "OBSERVED",
        toValue: "Storey 1",
        toEpistemicStatus: "CONFIRMED",
      },
    ]);
  });

  test("type-differing values (number vs string) are a change, both verbatim (no coercion)", () => {
    const report = twoVersionReport([sprop("level", 2)], [sprop("level", "2")]);
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_CHANGED",
        key: "level",
        fromValue: 2,
        fromEpistemicStatus: "OBSERVED",
        toValue: "2",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("unit-only change ⇒ PROPERTY_CHANGED (the record changed)", () => {
    const report = twoVersionReport(
      [sprop("width", 4.2, { unit: "m" })],
      [sprop("width", 4.2, { unit: "cm" })],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_CHANGED",
        key: "width",
        fromValue: 4.2,
        fromUnit: "m",
        fromEpistemicStatus: "OBSERVED",
        toValue: 4.2,
        toUnit: "cm",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("epistemic-status-only change ⇒ PROPERTY_CHANGED (value identical)", () => {
    const report = twoVersionReport(
      [sprop("area", 12.5, { unit: "m2", epistemicStatus: "INFERRED" })],
      [sprop("area", 12.5, { unit: "m2", epistemicStatus: "CONFIRMED" })],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_CHANGED",
        key: "area",
        fromValue: 12.5,
        fromUnit: "m2",
        fromEpistemicStatus: "INFERRED",
        toValue: 12.5,
        toUnit: "m2",
        toEpistemicStatus: "CONFIRMED",
      },
    ]);
  });

  test("identical records ⇒ NO property finding (clean discrimination)", () => {
    const report = twoVersionReport(
      [sprop("label", "Wall", { epistemicStatus: "OBSERVED" })],
      [sprop("label", "Wall", { epistemicStatus: "OBSERVED" })],
    );
    expect(report.matches[0]?.changes).toEqual([]);
  });

  test("multiple property diffs are listed sorted by key", () => {
    const report = twoVersionReport(
      [sprop("zzz", "gone"), sprop("label", "old"), sprop("aaa", 1)],
      [sprop("label", "new"), sprop("mmm", "new")],
    );
    expect(report.matches[0]?.changes.map(codeKey)).toEqual([
      "PROPERTY_REMOVED:aaa",
      "PROPERTY_CHANGED:label",
      "PROPERTY_ADDED:mmm",
      "PROPERTY_REMOVED:zzz",
    ]);
  });

  test("duplicate property keys within one node resolve LAST-WINS", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-x", "element", [sprop("label", "a"), sprop("label", "b")])]),
      sslice("v002", [snode("node-x", "element", [sprop("label", "b")])]),
    );
    expect(report.matches[0]?.changes).toEqual([]); // "b" vs "b": the first record never participates
  });
});

describe("semantic.kind consistency (info-level)", () => {
  test("node-kind-vocabulary value disagreeing with node.kind ⇒ SEMANTIC_INCONSISTENCY (info)", () => {
    const report = twoVersionReport(
      [sprop("semantic.kind", "space")],
      [sprop("semantic.kind", "space")],
      "element",
      "element",
    );
    expect(report.matches[0]?.changes).toEqual([
      { code: "SEMANTIC_INCONSISTENCY", side: "from", nodeKind: "element", semanticKind: "space" },
      { code: "SEMANTIC_INCONSISTENCY", side: "to", nodeKind: "element", semanticKind: "space" },
    ]);
  });

  test("disagreement present on ONE side only ⇒ exactly that side's finding (plus the value diff)", () => {
    const report = twoVersionReport(
      [sprop("semantic.kind", "opening")],
      [sprop("semantic.kind", "element")],
      "element",
      "element",
    );
    expect(report.matches[0]?.changes).toEqual([
      { code: "SEMANTIC_INCONSISTENCY", side: "from", nodeKind: "element", semanticKind: "opening" },
      {
        code: "PROPERTY_CHANGED",
        key: "semantic.kind",
        fromValue: "opening",
        fromEpistemicStatus: "OBSERVED",
        toValue: "element",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("agreeing value ⇒ no finding", () => {
    const report = twoVersionReport([sprop("semantic.kind", "element")], [sprop("semantic.kind", "element")]);
    expect(report.matches[0]?.changes).toEqual([]);
  });

  test("'unclassified' and out-of-vocabulary values impose NO constraint (honest unknowns)", () => {
    // "unclassified" is the honest-unknown sentinel; AISE-015 element
    // vocabulary values (wall/floor/door/…) are out of the node-kind
    // vocabulary — their projection is the verification authority's.
    for (const value of ["unclassified", "wall", "door", "not-a-kind"]) {
      const report = twoVersionReport([sprop("semantic.kind", value)], [sprop("semantic.kind", value)]);
      expect(report.matches[0]?.changes).toEqual([]);
    }
  });

  test("non-string semantic.kind value imposes no constraint", () => {
    const report = twoVersionReport([sprop("semantic.kind", 7)], [sprop("semantic.kind", 7)]);
    expect(report.matches[0]?.changes).toEqual([]);
  });

  test("a changed semantic.kind value is ALSO a property diff (both observations are reported)", () => {
    const report = twoVersionReport(
      [sprop("semantic.kind", "space")],
      [sprop("semantic.kind", "element")],
    );
    expect(report.matches[0]?.changes.map((finding) => finding.code)).toEqual([
      "SEMANTIC_INCONSISTENCY",
      "PROPERTY_CHANGED",
    ]);
  });
});
