/**
 * AISE-034 fixture tests — the controlled-fixture verification the work
 * order demands: every fixture's validation report is asserted against
 * HAND-COMPUTED expectations (see the fixture doc comments for the worked
 * arithmetic a reviewer can redo on paper), plus fixture determinism,
 * deep-freeze purity and byte-identical serialization round-trips.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  cleanDuctNetwork,
  cleanPipeNetwork,
  cleanTrayNetwork,
  mepSystemContentId,
  mismatchedNetwork,
  parseMepSystem,
  validateTopology,
} from "./index";
import { jsonEquals } from "./testkit";

/** Recursively assert that fixture records are deep-frozen. */
function assertDeeplyFrozen(value: unknown): void {
  if (Array.isArray(value)) {
    expect(Object.isFrozen(value)).toBe(true);
    for (const item of value) {
      assertDeeplyFrozen(item);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const key of Object.getOwnPropertyNames(value)) {
      assertDeeplyFrozen((value as Record<string, unknown>)[key]);
    }
  }
}

function summaryOf(
  findings: readonly { connectionId: string; code: string }[],
): { connectionId: string; code: string }[] {
  return findings.map((f) => ({ connectionId: f.connectionId, code: f.code }));
}

/* ------------------------------------------------------------------ */
/* Clean fixture: domestic-water pipe network                          */
/* ------------------------------------------------------------------ */

describe("clean pipe network fixture (worked example)", () => {
  test("validates with zero violations, zero indeterminates, one component", () => {
    const { system, expected } = cleanPipeNetwork();
    const report = validateTopology(system);
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates).toHaveLength(0);
    expect(report.components.map((c) => ({ members: c.primitiveIds, connections: c.connectionIds }))).toEqual(
      expected.components.map((c) => ({ members: [...c.members], connections: [...c.connections] })),
    );
    expect(report.stats).toEqual(expected.stats);
  });

  test("carries the assertion discipline: OBSERVED length with separate confidence AND uncertainty; OCCLUDED geometry", () => {
    const { system } = cleanPipeNetwork();
    const pipe1 = system.primitives.find((p) => p.primitiveId === "pipe-1");
    expect(pipe1?.epistemicStatus).toBe("OBSERVED");
    const length = pipe1?.properties.find((p) => p.key === "measured_length");
    expect(length?.value).toBe(3.42);
    expect(length?.unit).toBe("m");
    expect(length?.method).toBe("laser distance meter, two-point measurement");
    // Confidence (belief support) and uncertainty (measurement property)
    // coexist as SEPARATE fields, never merged:
    expect(length?.confidence).toEqual({ kind: "PROBABILISTIC", value: 0.9 });
    expect(length?.uncertainty).toEqual({ kind: "DIMENSIONAL", plusMinus: 0.05 });
    expect(length?.provenance).toHaveLength(1);
    const pipe2 = system.primitives.find((p) => p.primitiveId === "pipe-2");
    expect(pipe2?.geometry).toEqual({
      link: "omitted",
      omission: "OCCLUDED",
      detail: "run above finished ceiling, not visible to capture",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Clean fixture: supply-air duct network                              */
/* ------------------------------------------------------------------ */

describe("clean duct network fixture (worked example)", () => {
  test("validates clean; the VAV reducer's differing terminal diameters are not mismatches", () => {
    const { system, expected } = cleanDuctNetwork();
    const report = validateTopology(system);
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates).toHaveLength(0);
    expect(report.components.map((c) => ({ members: c.primitiveIds, connections: c.connectionIds }))).toEqual(
      expected.components.map((c) => ({ members: [...c.members], connections: [...c.connections] })),
    );
    expect(report.stats).toEqual(expected.stats);
    const vav = system.primitives.find((p) => p.primitiveId === "eq-vav-1");
    expect(vav?.family).toBe("equipment");
    if (vav?.family === "equipment") {
      expect(vav.terminals.map((t) => t.nominalSize)).toEqual([
        { presence: "PRESENT", value: 400, unit: "mm" },
        { presence: "PRESENT", value: 250, unit: "mm" },
      ]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Clean fixture: power cable-tray network (one honest indeterminate)  */
/* ------------------------------------------------------------------ */

describe("clean tray network fixture (worked example)", () => {
  test("zero violations; exactly one honest diameter_indeterminate on the DB connection", () => {
    const { system, expected } = cleanTrayNetwork();
    const report = validateTopology(system);
    expect(report.violations).toHaveLength(0);
    expect(summaryOf(report.indeterminates)).toEqual(
      expected.indeterminates.map((f) => ({ connectionId: f.connectionId, code: f.code })),
    );
    expect(report.indeterminates[0]?.detail.includes("NOT_OBSERVED")).toBe(true);
    expect(report.components.map((c) => ({ members: c.primitiveIds, connections: c.connectionIds }))).toEqual(
      expected.components.map((c) => ({ members: [...c.members], connections: [...c.connections] })),
    );
    expect(report.stats).toEqual(expected.stats);
  });
});

/* ------------------------------------------------------------------ */
/* Corrupted mixed network — the full hand-computed worked example     */
/* ------------------------------------------------------------------ */

describe("mismatched network fixture (hand-computed worked example)", () => {
  const { system, expected } = mismatchedNetwork();
  const report = validateTopology(system);

  test("violation summary matches the hand computation exactly (codes, connections, order)", () => {
    expect(summaryOf(report.violations)).toEqual(
      expected.violations.map((f) => ({ connectionId: f.connectionId, code: f.code })),
    );
  });

  test("indeterminate summary matches the hand computation exactly", () => {
    expect(summaryOf(report.indeterminates)).toEqual(
      expected.indeterminates.map((f) => ({ connectionId: f.connectionId, code: f.code })),
    );
  });

  test("component shape matches the hand computation exactly", () => {
    expect(report.components.map((c) => ({ members: c.primitiveIds, connections: c.connectionIds }))).toEqual(
      expected.components.map((c) => ({ members: [...c.members], connections: [...c.connections] })),
    );
  });

  test("stats match the hand computation", () => {
    expect(report.stats).toEqual(expected.stats);
  });

  test("details name both endpoints and values (spot checks)", () => {
    const classMismatch = report.violations.find((v) => v.code === "port_class_mismatch");
    expect(classMismatch?.detail.includes("pipe-g-1")).toBe(true);
    expect(classMismatch?.detail.includes("eq-pump-x")).toBe(true);
    const diameterMismatch = report.violations.find(
      (v) => v.code === "diameter_mismatch" && v.connectionId === "x-diameter",
    );
    expect(diameterMismatch?.detail.includes("25")).toBe(true);
    expect(diameterMismatch?.detail.includes("32")).toBe(true);
    const double = report.violations.find((v) => v.code === "endpoint_double_connected");
    expect(double?.detail.includes("x-class")).toBe(true);
    expect(double?.detail.includes("x-double-1")).toBe(true);
    const dangling = report.violations.find((v) => v.code === "dangling_endpoint");
    expect(dangling?.detail.includes("pipe-missing")).toBe(true);
    const withinUncertainty = report.indeterminates.find(
      (v) => v.code === "diameter_within_uncertainty",
    );
    expect(withinUncertainty?.detail.includes("[106, 110]")).toBe(true);
    expect(withinUncertainty?.detail.includes("[109, 111]")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Fixture determinism, purity and round-trips                         */
/* ------------------------------------------------------------------ */

describe("fixture determinism, purity and round-trips", () => {
  const fixtures = [cleanPipeNetwork, cleanDuctNetwork, cleanTrayNetwork, mismatchedNetwork];

  test("every fixture construction is deterministic (byte-identical, stable content ids)", () => {
    for (const build of fixtures) {
      const first = build();
      const second = build();
      expect(canonicalJsonStringify(second.system)).toBe(canonicalJsonStringify(first.system));
      expect(mepSystemContentId(second.system)).toBe(mepSystemContentId(first.system));
      expect(jsonEquals(validateTopology(second.system), validateTopology(first.system))).toBe(
        true,
      );
    }
  });

  test("every fixture system is deep-frozen", () => {
    for (const build of fixtures) {
      assertDeeplyFrozen(build().system);
    }
  });

  test("every fixture system round-trips byte-identically through parse", () => {
    for (const build of fixtures) {
      const { system } = build();
      const canonical = canonicalJsonStringify(system);
      const reparsed = parseMepSystem(JSON.parse(canonical));
      expect(canonicalJsonStringify(reparsed)).toBe(canonical);
    }
  });
});
