/**
 * AISE-033 condition tests — the documented condition vocabulary
 * ("condition."-prefixed property keys), CONDITION_CHANGED verbatim records
 * with epistemic statuses, and the exactly-once / prefix-boundary rules.
 */

import { describe, expect, test } from "bun:test";
import { compareVersions } from "./index";
import type { ChangeFinding } from "./model";
import { sslice, snode, sprop } from "./testkit";

/** `CODE:key` label for order assertions (findings without a key label by code alone). */
function codeKey(finding: ChangeFinding): string {
  return `${finding.code}:${"key" in finding ? finding.key : ""}`;
}

function conditionReport(
  fromProperties: readonly ReturnType<typeof sprop>[],
  toProperties: readonly ReturnType<typeof sprop>[],
) {
  return compareVersions(
    sslice("v001", [snode("node-wall", "element", fromProperties)]),
    sslice("v002", [snode("node-wall", "element", toProperties)]),
  );
}

describe("condition changes", () => {
  test('condition.cracking "none" → "hairline" ⇒ CONDITION_CHANGED with old→new verbatim + both epistemic statuses', () => {
    const report = conditionReport(
      [sprop("condition.cracking", "none", { epistemicStatus: "OBSERVED" })],
      [sprop("condition.cracking", "hairline", { epistemicStatus: "CONFIRMED" })],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "CONDITION_CHANGED",
        key: "condition.cracking",
        fromValue: "none",
        fromEpistemicStatus: "OBSERVED",
        toValue: "hairline",
        toEpistemicStatus: "CONFIRMED",
      },
    ]);
    expect(report.stats.conditionChanged).toBe(1);
  });

  test("EXACTLY ONE finding per changed condition key (no duplicate PROPERTY_CHANGED)", () => {
    const report = conditionReport(
      [sprop("condition.cracking", "none")],
      [sprop("condition.cracking", "hairline")],
    );
    expect(report.matches[0]?.changes).toHaveLength(1);
    expect(report.stats.propertyChanged).toBe(0); // CONDITION_CHANGED is counted separately
  });

  test("non-condition property changes do NOT trigger condition findings", () => {
    const report = conditionReport(
      [sprop("label", "Wall A"), sprop("width", 4.2, { unit: "m" })],
      [sprop("label", "Wall B"), sprop("width", 4.5, { unit: "m" })],
    );
    expect(report.matches[0]?.changes.map((finding) => finding.code)).toEqual([
      "PROPERTY_CHANGED",
      "PROPERTY_CHANGED",
    ]);
    expect(report.stats.conditionChanged).toBe(0);
  });

  test("condition property ADDED ⇒ PROPERTY_ADDED, not CONDITION_CHANGED (absence is not 'none')", () => {
    // An unassessed v1 (no condition.damp property) cannot assert a condition
    // CHANGE — UNKNOWN is not absence.
    const report = conditionReport([], [sprop("condition.damp", "present")]);
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_ADDED",
        key: "condition.damp",
        toValue: "present",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("condition property REMOVED ⇒ PROPERTY_REMOVED, not CONDITION_CHANGED", () => {
    const report = conditionReport([sprop("condition.damp", "present")], []);
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "PROPERTY_REMOVED",
        key: "condition.damp",
        fromValue: "present",
        fromEpistemicStatus: "OBSERVED",
      },
    ]);
  });

  test("condition value UNCHANGED with a status change ⇒ PROPERTY_CHANGED (a value change is required)", () => {
    const report = conditionReport(
      [sprop("condition.cracking", "hairline", { epistemicStatus: "OBSERVED" })],
      [sprop("condition.cracking", "hairline", { epistemicStatus: "CONFIRMED" })],
    );
    expect(report.matches[0]?.changes.map((finding) => finding.code)).toEqual(["PROPERTY_CHANGED"]);
    expect(report.stats.conditionChanged).toBe(0);
  });

  test("multiple condition changes, one finding each, sorted by key", () => {
    const report = conditionReport(
      [sprop("condition.damp", "dry"), sprop("condition.cracking", "none")],
      [sprop("condition.damp", "wet"), sprop("condition.cracking", "hairline")],
    );
    expect(report.matches[0]?.changes.map(codeKey)).toEqual([
      "CONDITION_CHANGED:condition.cracking",
      "CONDITION_CHANGED:condition.damp",
    ]);
    expect(report.stats.conditionChanged).toBe(2);
  });

  test("PREFIX BOUNDARY: 'conditions.note' (no dot after 'condition') is NOT condition vocabulary", () => {
    const report = conditionReport(
      [sprop("conditions.note", "old")],
      [sprop("conditions.note", "new")],
    );
    expect(report.matches[0]?.changes.map((finding) => finding.code)).toEqual(["PROPERTY_CHANGED"]);
    expect(report.stats.conditionChanged).toBe(0);
  });

  test("condition value changes carry units verbatim when present", () => {
    const report = conditionReport(
      [sprop("condition.humidity", 55, { unit: "%" })],
      [sprop("condition.humidity", 72, { unit: "%" })],
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "CONDITION_CHANGED",
        key: "condition.humidity",
        fromValue: 55,
        fromUnit: "%",
        fromEpistemicStatus: "OBSERVED",
        toValue: 72,
        toUnit: "%",
        toEpistemicStatus: "OBSERVED",
      },
    ]);
  });
});
