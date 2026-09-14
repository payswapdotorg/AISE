/**
 * AISE-033 report tests — report shape, stats/finding consistency,
 * byte-determinism (incl. input order insensitivity), A→B vs B→A inversion,
 * purity, canonical ordering, and the full synthetic-storey integration.
 */

import { describe, expect, test } from "bun:test";
import { compareVersions } from "./index";
import type { ChangeFinding, ChangeReport, NodeMatch } from "./model";
import { deepFreeze, geoTable, sslice, snode, sprop, syntheticStoreyChange } from "./testkit";

/** `CODE:key` label for order assertions (findings without a key label by code alone). */
function codeKey(finding: ChangeFinding): string {
  return `${finding.code}:${"key" in finding ? finding.key : ""}`;
}

function matchOf(report: ChangeReport, nodeId: string): NodeMatch | undefined {
  return report.matches.find((match) => match.nodeId === nodeId);
}

/** The rich fixture: one of every change family (kind flip, plane move,
 * property add/remove/change, condition change) plus added/removed nodes. */
function richFixture() {
  const from = sslice("v001", [
    snode("node-a", "element", [sprop("label", "A")]),
    snode("node-b", "element", [], { kind: "plane", ref: "gb1" }),
    snode("node-c", "element", [
      sprop("label", "old"),
      sprop("width", 4.2, { unit: "m" }),
      sprop("condition.damp", "dry"),
    ]),
    snode("node-d", "space", [sprop("label", "D")]),
  ]);
  const to = sslice("v002", [
    snode("node-a", "opening", [sprop("label", "A")]),
    snode("node-b", "element", [], { kind: "plane", ref: "gb2" }),
    snode("node-c", "element", [
      sprop("label", "new"),
      sprop("height", 2.7, { unit: "m" }),
      sprop("condition.damp", "wet"),
    ]),
    snode("node-e", "issue", [sprop("label", "E")]),
  ]);
  return {
    from,
    to,
    fromGeometry: geoTable([["gb1", { normal: [0, 1, 0], d: 0 }]]),
    toGeometry: geoTable([["gb2", { normal: [0, 1, 0], d: 0.05 }]]),
  };
}

describe("report shape and stats", () => {
  test("directional header: from/to version ids verbatim + generator identity", () => {
    const fixture = richFixture();
    const report = compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry);
    expect(report.fromVersionId).toBe("v001");
    expect(report.toVersionId).toBe("v002");
    expect(report.generatedBy).toBe("aise-changedetection/1.0");
  });

  test("stats are ALWAYS consistent with the findings (and hand-counted)", () => {
    const fixture = richFixture();
    const report = compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry);
    const findings = report.matches.flatMap((match) => match.changes);
    expect(report.stats.matched + report.stats.ambiguous).toBe(report.matches.length);
    expect(report.stats.matched).toBe(report.matches.filter((m) => m.matchKind === "matched").length);
    expect(report.stats.ambiguous).toBe(report.matches.filter((m) => m.matchKind === "ambiguous").length);
    expect(report.stats.added).toBe(report.added.length);
    expect(report.stats.removed).toBe(report.removed.length);
    expect(report.stats.geometryMoved).toBe(findings.filter((f) => f.code === "GEOMETRY_MOVED").length);
    expect(report.stats.conditionChanged).toBe(findings.filter((f) => f.code === "CONDITION_CHANGED").length);
    expect(report.stats.propertyChanged).toBe(
      findings.filter(
        (f) =>
          f.code === "PROPERTY_ADDED" || f.code === "PROPERTY_REMOVED" || f.code === "PROPERTY_CHANGED",
      ).length,
    );
    expect(report.stats).toEqual({
      matched: 2,
      ambiguous: 1,
      added: 1,
      removed: 1,
      geometryMoved: 1,
      conditionChanged: 1,
      propertyChanged: 3,
    });
  });

  test("lists are canonically ordered: matches, added and removed sorted by nodeId", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-z", "element"), snode("node-k", "space"), snode("node-m", "issue")]),
      sslice("v002", [snode("node-z", "element"), snode("node-a", "element"), snode("node-b", "element")]),
    );
    expect(report.matches.map((match) => match.nodeId)).toEqual(["node-z"]);
    expect(report.added.map((side) => side.nodeId)).toEqual(["node-a", "node-b"]);
    expect(report.removed.map((side) => side.nodeId)).toEqual(["node-k", "node-m"]);
  });
});

describe("determinism", () => {
  test("two runs (fresh fixture objects) ⇒ BYTE-IDENTICAL reports", () => {
    const first = richFixture();
    const second = richFixture();
    const reportA = JSON.stringify(compareVersions(first.from, first.to, first.fromGeometry, first.toGeometry));
    const reportB = JSON.stringify(compareVersions(second.from, second.to, second.fromGeometry, second.toGeometry));
    expect(reportA).toBe(reportB);
  });

  test("input node/property order never leaks (reversed arrays ⇒ byte-identical)", () => {
    const fixture = richFixture();
    const canonical = JSON.stringify(
      compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry),
    );
    const reversedFrom = sslice("v001", [...fixture.from.nodes].reverse().map((node) => ({
      ...node,
      properties: [...node.properties].reverse(),
    })));
    const reversedTo = sslice("v002", [...fixture.to.nodes].reverse().map((node) => ({
      ...node,
      properties: [...node.properties].reverse(),
    })));
    const reversed = JSON.stringify(
      compareVersions(reversedFrom, reversedTo, fixture.fromGeometry, fixture.toGeometry),
    );
    expect(reversed).toBe(canonical);
  });

  test("purity: deep-frozen inputs survive; geometry tables' entries are untouched", () => {
    const fixture = richFixture();
    deepFreeze(fixture.from);
    deepFreeze(fixture.to);
    const fromEntriesBefore = [...fixture.fromGeometry.entries()];
    const toEntriesBefore = [...fixture.toGeometry.entries()];
    const report = compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry);
    expect(report.stats.matched).toBe(2); // it ran to completion over frozen inputs
    expect([...fixture.fromGeometry.entries()]).toEqual(fromEntriesBefore);
    expect([...fixture.toGeometry.entries()]).toEqual(toEntriesBefore);
  });
});

describe("version-order sensitivity (A→B vs B→A are inverse reports)", () => {
  test("matched node set + match kinds equal; added/removed swapped; stats mirrored", () => {
    const fixture = richFixture();
    const forward = compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry);
    const backward = compareVersions(fixture.to, fixture.from, fixture.toGeometry, fixture.fromGeometry);
    expect(backward.matches.map((match) => match.nodeId)).toEqual(forward.matches.map((match) => match.nodeId));
    expect(backward.matches.map((match) => match.matchKind)).toEqual(forward.matches.map((match) => match.matchKind));
    expect(backward.added).toEqual(forward.removed);
    expect(backward.removed).toEqual(forward.added);
    expect(backward.stats).toEqual({ ...forward.stats, added: forward.stats.removed, removed: forward.stats.added });
  });

  test("GEOMETRY_MOVED: Δd sign flips, angle equal, planes and refs swapped", () => {
    const fixture = richFixture();
    const forward = matchOf(
      compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry),
      "node-b",
    )?.changes[0];
    const backward = matchOf(
      compareVersions(fixture.to, fixture.from, fixture.toGeometry, fixture.fromGeometry),
      "node-b",
    )?.changes[0];
    expect(forward?.code).toBe("GEOMETRY_MOVED");
    expect(backward?.code).toBe("GEOMETRY_MOVED");
    if (forward?.code === "GEOMETRY_MOVED" && backward?.code === "GEOMETRY_MOVED") {
      expect(backward.deltaD).toBe(-forward.deltaD);
      expect(backward.angleRad).toBe(forward.angleRad);
      expect(backward.fromPlane).toEqual(forward.toPlane);
      expect(backward.toPlane).toEqual(forward.fromPlane);
      expect(backward.fromRef).toEqual(forward.toRef);
      expect(backward.toRef).toEqual(forward.fromRef);
    }
  });

  test("property findings invert: added↔removed, old/new values swapped", () => {
    const fixture = richFixture();
    const forward = matchOf(
      compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry),
      "node-c",
    )?.changes ?? [];
    const backward = matchOf(
      compareVersions(fixture.to, fixture.from, fixture.toGeometry, fixture.fromGeometry),
      "node-c",
    )?.changes ?? [];
    const forwardByCode = new Map(forward.map((finding) => [codeKey(finding), finding]));
    const backwardByCode = new Map(backward.map((finding) => [codeKey(finding), finding]));
    expect(forwardByCode.has("PROPERTY_ADDED:height")).toBe(true);
    expect(backwardByCode.has("PROPERTY_REMOVED:height")).toBe(true);
    expect(forwardByCode.has("PROPERTY_REMOVED:width")).toBe(true);
    expect(backwardByCode.has("PROPERTY_ADDED:width")).toBe(true);
    const forwardCondition = forwardByCode.get("CONDITION_CHANGED:condition.damp");
    const backwardCondition = backwardByCode.get("CONDITION_CHANGED:condition.damp");
    expect(forwardCondition).toEqual({
      code: "CONDITION_CHANGED",
      key: "condition.damp",
      fromValue: "dry",
      fromEpistemicStatus: "OBSERVED",
      toValue: "wet",
      toEpistemicStatus: "OBSERVED",
    });
    expect(backwardCondition).toEqual({
      code: "CONDITION_CHANGED",
      key: "condition.damp",
      fromValue: "wet",
      fromEpistemicStatus: "OBSERVED",
      toValue: "dry",
      toEpistemicStatus: "OBSERVED",
    });
    const forwardLabel = forwardByCode.get("PROPERTY_CHANGED:label");
    const backwardLabel = backwardByCode.get("PROPERTY_CHANGED:label");
    if (forwardLabel?.code === "PROPERTY_CHANGED" && backwardLabel?.code === "PROPERTY_CHANGED") {
      expect(backwardLabel.fromValue).toBe(forwardLabel.toValue);
      expect(backwardLabel.toValue).toBe(forwardLabel.fromValue);
    }
  });

  test("kind-change findings invert (fromKind/toKind swapped)", () => {
    const fixture = richFixture();
    const forward = matchOf(
      compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry),
      "node-a",
    )?.changes;
    const backward = matchOf(
      compareVersions(fixture.to, fixture.from, fixture.toGeometry, fixture.fromGeometry),
      "node-a",
    )?.changes;
    expect(forward).toEqual([
      { code: "AMBIGUOUS_IDENTITY", fromKind: "element", toKind: "opening" },
      { code: "KIND_CHANGED", fromKind: "element", toKind: "opening" },
    ]);
    expect(backward).toEqual([
      { code: "AMBIGUOUS_IDENTITY", fromKind: "opening", toKind: "element" },
      { code: "KIND_CHANGED", fromKind: "opening", toKind: "element" },
    ]);
  });
});

describe("the synthetic storey change (full integration fixture)", () => {
  test("v001 → v002 yields EXACTLY the expected finding set", () => {
    const fixture = syntheticStoreyChange();
    const report = compareVersions(fixture.from, fixture.to, fixture.fromGeometry, fixture.toGeometry);

    expect(report.matches.map((match) => match.nodeId)).toEqual([
      "node-building-1",
      "node-project-1",
      "node-site-1",
      "node-space-101",
      "node-storey-1",
      "node-wall-east",
      "node-wall-north",
    ]);
    // Unchanged nodes carry empty change lists.
    for (const nodeId of ["node-building-1", "node-project-1", "node-site-1", "node-space-101", "node-storey-1"]) {
      expect(matchOf(report, nodeId)?.changes).toEqual([]);
    }
    // The moved wall: exactly one GEOMETRY_MOVED with measured values.
    expect(matchOf(report, "node-wall-north")?.changes).toEqual([
      {
        code: "GEOMETRY_MOVED",
        deltaD: 0.05,
        angleRad: 0,
        fromRef: { kind: "plane", ref: "geo:wall-north:v001" },
        toRef: { kind: "plane", ref: "geo:wall-north:v002" },
        fromPlane: { normal: [0, 1, 0], d: 0 },
        toPlane: { normal: [0, 1, 0], d: 0.05 },
      },
    ]);
    // The condition change: exactly one CONDITION_CHANGED.
    expect(matchOf(report, "node-wall-east")?.changes).toEqual([
      {
        code: "CONDITION_CHANGED",
        key: "condition.cracking",
        fromValue: "none",
        fromEpistemicStatus: "OBSERVED",
        toValue: "hairline",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
    expect(report.added).toEqual([{ nodeId: "node-door-101", kind: "opening" }]);
    expect(report.removed).toEqual([]);
    expect(report.stats).toEqual({
      matched: 7,
      ambiguous: 0,
      added: 1,
      removed: 0,
      geometryMoved: 1,
      conditionChanged: 1,
      propertyChanged: 0,
    });
    // EXACTLY the expected finding set: two findings, total.
    expect(report.matches.reduce((total, match) => total + match.changes.length, 0)).toBe(2);
  });

  test("inverted (v002 → v001): door removed, Δd sign flipped, condition old/new swapped", () => {
    const fixture = syntheticStoreyChange();
    const report = compareVersions(fixture.to, fixture.from, fixture.toGeometry, fixture.fromGeometry);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([{ nodeId: "node-door-101", kind: "opening" }]);
    const moved = matchOf(report, "node-wall-north")?.changes[0];
    expect(moved?.code).toBe("GEOMETRY_MOVED");
    if (moved?.code === "GEOMETRY_MOVED") {
      expect(moved.deltaD).toBe(-0.05);
      expect(moved.angleRad).toBe(0);
    }
    const condition = matchOf(report, "node-wall-east")?.changes[0];
    expect(condition).toEqual({
      code: "CONDITION_CHANGED",
      key: "condition.cracking",
      fromValue: "hairline",
      fromEpistemicStatus: "OBSERVED",
      toValue: "none",
      toEpistemicStatus: "OBSERVED",
    });
    expect(report.stats).toEqual({
      matched: 7,
      ambiguous: 0,
      added: 0,
      removed: 1,
      geometryMoved: 1,
      conditionChanged: 1,
      propertyChanged: 0,
    });
  });

  test("byte-determinism on the full fixture", () => {
    const first = syntheticStoreyChange();
    const second = syntheticStoreyChange();
    expect(JSON.stringify(compareVersions(first.from, first.to, first.fromGeometry, first.toGeometry))).toBe(
      JSON.stringify(compareVersions(second.from, second.to, second.fromGeometry, second.toGeometry)),
    );
  });
});

describe("empty-snapshot edges", () => {
  test("empty from ⇒ everything added; empty to ⇒ everything removed", () => {
    const nodes = [snode("node-1", "element"), snode("node-2", "space")];
    const toEverything = compareVersions(sslice("v001", []), sslice("v002", nodes));
    expect(toEverything.added.map((side) => side.nodeId)).toEqual(["node-1", "node-2"]);
    expect(toEverything.matches).toEqual([]);
    const fromEverything = compareVersions(sslice("v001", nodes), sslice("v002", []));
    expect(fromEverything.removed.map((side) => side.nodeId)).toEqual(["node-1", "node-2"]);
    expect(fromEverything.matches).toEqual([]);
  });
});
