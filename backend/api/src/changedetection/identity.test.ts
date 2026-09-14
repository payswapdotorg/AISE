/**
 * AISE-033 identity-matching tests — deterministic nodeId-first matching,
 * explicit AMBIGUOUS_IDENTITY, added/removed classification, and the
 * ANTI-FUZZY discrimination (similar content, different ids ⇒ never matched).
 */

import { describe, expect, test } from "bun:test";
import { compareVersions } from "./index";
import { geoTable, sslice, snode, sprop } from "./testkit";

describe("identity matching", () => {
  test("same nodeId in both versions ⇒ matched, no findings", () => {
    const node = snode("node-wall", "element", [sprop("label", "Wall")]);
    const report = compareVersions(sslice("v001", [node]), sslice("v002", [node]));
    expect(report.matches).toHaveLength(1);
    expect(report.matches[0]?.nodeId).toBe("node-wall");
    expect(report.matches[0]?.matchKind).toBe("matched");
    expect(report.matches[0]?.changes).toEqual([]);
    expect(report.stats.matched).toBe(1);
    expect(report.stats.ambiguous).toBe(0);
  });

  test("same nodeId with kind changed ⇒ ambiguous + AMBIGUOUS_IDENTITY + KIND_CHANGED verbatim", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-x", "element", [sprop("label", "X")])]),
      sslice("v002", [snode("node-x", "opening", [sprop("label", "X")])]),
    );
    expect(report.matches[0]?.matchKind).toBe("ambiguous");
    expect(report.matches[0]?.changes).toEqual([
      { code: "AMBIGUOUS_IDENTITY", fromKind: "element", toKind: "opening" },
      { code: "KIND_CHANGED", fromKind: "element", toKind: "opening" },
    ]);
    expect(report.stats.ambiguous).toBe(1);
    expect(report.stats.matched).toBe(0);
  });

  test("nodeId only in the to-version ⇒ added with kind verbatim", () => {
    const report = compareVersions(
      sslice("v001", []),
      sslice("v002", [snode("node-door", "opening", [sprop("label", "D1")])]),
    );
    expect(report.added).toEqual([{ nodeId: "node-door", kind: "opening" }]);
    expect(report.removed).toEqual([]);
    expect(report.stats.added).toBe(1);
  });

  test("nodeId only in the from-version ⇒ removed with kind verbatim", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-chimney", "element", [sprop("label", "C")])]),
      sslice("v002", []),
    );
    expect(report.removed).toEqual([{ nodeId: "node-chimney", kind: "element" }]);
    expect(report.added).toEqual([]);
    expect(report.stats.removed).toBe(1);
  });

  test("ANTI-FUZZY: identical content, different nodeIds ⇒ added + removed, never matched", () => {
    // Every field except the nodeId is identical; content-similarity matching
    // is deliberately absent — deterministic identity only.
    const from = sslice("v001", [
      snode("node-wall-a", "element", [sprop("label", "Wall"), sprop("condition.damp", "dry")], {
        kind: "plane",
        ref: "geo:wall",
      }),
    ]);
    const to = sslice("v002", [
      snode("node-wall-b", "element", [sprop("label", "Wall"), sprop("condition.damp", "dry")], {
        kind: "plane",
        ref: "geo:wall",
      }),
    ]);
    const table = geoTable([["geo:wall", { normal: [0, 1, 0], d: 0 }]]);
    const report = compareVersions(from, to, table, table);
    expect(report.matches).toEqual([]);
    expect(report.added).toEqual([{ nodeId: "node-wall-b", kind: "element" }]);
    expect(report.removed).toEqual([{ nodeId: "node-wall-a", kind: "element" }]);
    // And nothing else is reported: no findings exist without a match.
    expect(report.stats).toEqual({
      matched: 0,
      ambiguous: 0,
      added: 1,
      removed: 1,
      geometryMoved: 0,
      conditionChanged: 0,
      propertyChanged: 0,
    });
  });

  test("duplicate nodeId within one snapshot resolves LAST-WINS (upsert reading)", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-x", "element", [sprop("label", "old")])]),
      sslice("v002", [
        snode("node-x", "element", [sprop("label", "wrong")]),
        snode("node-x", "element", [sprop("label", "right")]),
      ]),
    );
    expect(report.matches).toHaveLength(1);
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_CHANGED",
        key: "label",
        fromValue: "old",
        fromEpistemicStatus: "OBSERVED",
        toValue: "right",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("two empty snapshots ⇒ a clean empty report", () => {
    const report = compareVersions(sslice("v001", []), sslice("v002", []));
    expect(report.matches).toEqual([]);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.stats.matched).toBe(0);
  });

  test("a snapshot compared with itself ⇒ all matched, zero findings", () => {
    const nodes = [
      snode("node-a", "element", [sprop("label", "A")]),
      snode("node-b", "opening", [sprop("condition.cracking", "none")]),
    ];
    const report = compareVersions(sslice("v001", nodes), sslice("v001", nodes));
    expect(report.stats.matched).toBe(2);
    expect(report.matches.every((match) => match.changes.length === 0)).toBe(true);
  });

  test("mixed identities produce consistent stats", () => {
    const report = compareVersions(
      sslice("v001", [
        snode("node-keep", "element"),
        snode("node-flip", "element"),
        snode("node-gone", "space"),
      ]),
      sslice("v002", [
        snode("node-keep", "element"),
        snode("node-flip", "annotation"),
        snode("node-new", "issue"),
      ]),
    );
    expect(report.stats.matched).toBe(1);
    expect(report.stats.ambiguous).toBe(1);
    expect(report.stats.added).toBe(1);
    expect(report.stats.removed).toBe(1);
    expect(report.matches.map((match) => match.nodeId)).toEqual(["node-flip", "node-keep"]);
    expect(report.added).toEqual([{ nodeId: "node-new", kind: "issue" }]);
    expect(report.removed).toEqual([{ nodeId: "node-gone", kind: "space" }]);
  });

  test("ambiguous pairs are flagged, not suppressed: their diffs are still computed", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-x", "element", [sprop("label", "old")])]),
      sslice("v002", [snode("node-x", "space", [sprop("label", "new")])]),
    );
    expect(report.matches[0]?.matchKind).toBe("ambiguous");
    const codes = report.matches[0]?.changes.map((finding) => finding.code);
    expect(codes).toEqual(["AMBIGUOUS_IDENTITY", "KIND_CHANGED", "PROPERTY_CHANGED"]);
  });
});
