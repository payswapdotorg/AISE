/**
 * AISE-023 runner tests — the clean synthetic storey, byte-identical
 * determinism under shuffled inputs, the stable total finding order,
 * summary/count integrity and runner purity.
 */

import { describe, expect, test } from "bun:test";
import { runVerification } from "./index";
import { FINDING_CODES, type FindingCode, type VerificationInput } from "./model";
import { deepFreeze, report, shuffled, syntheticStorey, vnode, vprop, vrel } from "./testkit";

/**
 * A deterministic findings-bearing input: the synthetic storey with one
 * defect per family (missing unit, missing σ, orphan, dangling reference,
 * invalidated support under a CONFIRMED property, and a NOT_READY readiness
 * report with a critical unknown dimension) — 7 findings across 7 codes.
 */
function messyStorey(): VerificationInput {
  const base = syntheticStorey();
  const nodes = base.graphSnapshot.nodes.map((node) => {
    if (node.nodeId === "node-wall-north") {
      return {
        ...node,
        properties: [
          ...node.properties.filter((property) => property.key !== "width"),
          vprop("width", 4.2, { sigma: 0.01, evidenceId: "ev-wall-north" }), // unit dropped
        ],
      };
    }
    if (node.nodeId === "node-wall-east") {
      return {
        ...node,
        properties: node.properties.map((property) =>
          property.key === "height"
            ? vprop("height", 2.7, { unit: "m", evidenceId: "ev-wall-east" }) // σ dropped
            : property,
        ),
      };
    }
    return node;
  });
  const relationships = [
    ...base.graphSnapshot.relationships.filter(
      (relationship) => relationship.relationshipId !== "rel-contains-floor",
    ),
    vrel("rel-references-ghost", "references", "node-wall-north", "node-ghost"),
  ];
  const evidenceFacts = base.evidenceFacts.map((fact) =>
    fact.evidenceId === "ev-floor" ? { ...fact, invalidated: true } : fact,
  );
  return {
    ...base,
    graphSnapshot: { nodes, relationships },
    evidenceFacts,
    assuranceReport: report("NOT_READY", "satisfied", "insufficient_data"),
  };
}

describe("the clean synthetic storey", () => {
  test("verifies to ZERO findings (not just zero errors)", () => {
    const result = runVerification(syntheticStorey());
    expect(result.findings).toEqual([]);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.summary.infos).toBe(0);
    for (const code of FINDING_CODES) {
      expect(result.summary.byCode[code]).toBe(0);
    }
  });

  test("with a READY readiness report also yields zero findings", () => {
    const input = { ...syntheticStorey(), assuranceReport: report("READY", "satisfied", "satisfied") };
    expect(runVerification(input).findings.length).toBe(0);
  });

  test("empty input verifies to an empty report (the runner is total)", () => {
    const result = runVerification({ graphSnapshot: { nodes: [], relationships: [] }, evidenceFacts: [] });
    expect(result.findings.length).toBe(0);
    const zeroByCode = {} as Record<FindingCode, number>;
    for (const code of FINDING_CODES) {
      zeroByCode[code] = 0;
    }
    expect({ ...result.summary.byCode }).toEqual(zeroByCode);
  });
});

describe("determinism (byte-identical findings)", () => {
  test("two runs over the same findings-bearing input are byte-identical", () => {
    const first = JSON.stringify(runVerification(messyStorey()));
    const second = JSON.stringify(runVerification(messyStorey()));
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  test("shuffled input arrays yield byte-identical findings", () => {
    const canonical = JSON.stringify(runVerification(messyStorey()));
    const input = messyStorey();
    const shuffledInput: VerificationInput = {
      ...input,
      graphSnapshot: {
        nodes: shuffled(input.graphSnapshot.nodes, 7),
        relationships: shuffled(input.graphSnapshot.relationships, 11),
      },
      evidenceFacts: shuffled(input.evidenceFacts, 13),
    };
    expect(JSON.stringify(runVerification(shuffledInput))).toBe(canonical);
  });

  test("a different shuffle seed still yields byte-identical findings", () => {
    const canonical = JSON.stringify(runVerification(messyStorey()));
    const input = messyStorey();
    const shuffledInput: VerificationInput = {
      ...input,
      graphSnapshot: {
        nodes: shuffled(input.graphSnapshot.nodes, 42),
        relationships: shuffled(input.graphSnapshot.relationships, 99),
      },
      evidenceFacts: shuffled(input.evidenceFacts, 2024),
    };
    expect(JSON.stringify(runVerification(shuffledInput))).toBe(canonical);
  });
});

describe("stable total order (code, then subject ids, then message)", () => {
  test("findings are sorted by code and subject across families", () => {
    const result = runVerification(messyStorey());
    expect(result.findings.map((finding) => [finding.code, finding.subjectNodeIds])).toEqual([
      ["CRITICAL_DIMENSION_UNKNOWN", []],
      ["DANGLING_RELATIONSHIP", ["node-wall-north"]],
      ["EPISTEMIC_DOWNGRADE_SUSPECT", ["node-floor-1"]],
      ["MISSING_UNIT", ["node-wall-north"]],
      ["ORPHAN_NODE", ["node-floor-1"]],
      ["READINESS_NOT_READY", []],
      ["UNCERTAIN_NUMERIC_WITHOUT_SIGMA", ["node-wall-east"]],
    ]);
  });

  test("within one code+subject, findings sort by message; within one code, by subject", () => {
    const input: VerificationInput = {
      graphSnapshot: {
        nodes: [
          vnode("node-z-root", "project", "CONFIRMED", [vprop("name", "Root")]),
          vnode("node-b", "element", "OBSERVED", [
            vprop("width", 1, { sigma: 0.1 }), // unitless numeric → MISSING_UNIT
          ]),
          vnode("node-a", "element", "OBSERVED", [
            vprop("width", 2, { sigma: 0.1 }), // unitless numeric → MISSING_UNIT
            vprop("depth", 3, { sigma: 0.1 }), // unitless numeric → MISSING_UNIT
          ]),
        ],
        relationships: [vrel("rel-1", "references", "node-z-root", "node-ghost")],
      },
      evidenceFacts: [],
    };
    const result = runVerification(input);
    expect(result.findings.map((finding) => `${finding.code}|${finding.subjectNodeIds.join(",")}`)).toEqual([
      "DANGLING_RELATIONSHIP|node-z-root",
      "MISSING_UNIT|node-a",
      "MISSING_UNIT|node-a",
      "MISSING_UNIT|node-b",
      "ORPHAN_NODE|node-a",
      "ORPHAN_NODE|node-b",
    ]);
    const missingUnitMessages = result.findings
      .filter((finding) => finding.code === "MISSING_UNIT" && finding.subjectNodeIds[0] === "node-a")
      .map((finding) => finding.message);
    expect(missingUnitMessages.length).toBe(2);
    expect(missingUnitMessages[0]).toContain('"depth"');
    expect(missingUnitMessages[1]).toContain('"width"');
  });
});

describe("summary integrity", () => {
  test("counts and byCode always match the findings exactly", () => {
    const result = runVerification(messyStorey());
    const errors = result.findings.filter((finding) => finding.severity === "error").length;
    const warnings = result.findings.filter((finding) => finding.severity === "warning").length;
    expect(result.summary.errors).toBe(errors);
    expect(result.summary.warnings).toBe(warnings);
    expect(result.summary.infos).toBe(0);
    expect(errors + warnings).toBe(result.findings.length);
    for (const code of FINDING_CODES) {
      expect(result.summary.byCode[code]).toBe(
        result.findings.filter((finding) => finding.code === code).length,
      );
    }
  });

  test("byCode carries exactly the frozen registry keys", () => {
    const result = runVerification(messyStorey());
    expect(Object.keys(result.summary.byCode).sort()).toEqual([...FINDING_CODES].sort());
  });

  test("the messy storey yields one finding per each of its 7 defect codes", () => {
    const result = runVerification(messyStorey());
    const expectedCodes: FindingCode[] = [
      "CRITICAL_DIMENSION_UNKNOWN",
      "DANGLING_RELATIONSHIP",
      "EPISTEMIC_DOWNGRADE_SUSPECT",
      "MISSING_UNIT",
      "ORPHAN_NODE",
      "READINESS_NOT_READY",
      "UNCERTAIN_NUMERIC_WITHOUT_SIGMA",
    ];
    const present = (Object.keys(result.summary.byCode) as FindingCode[]).filter(
      (code) => result.summary.byCode[code] > 0,
    );
    expect(present.sort()).toEqual(expectedCodes.sort());
    expect(result.summary.errors).toBe(5);
    expect(result.summary.warnings).toBe(2);
  });
});

describe("runner purity (finding, never fixing)", () => {
  test("a deep-frozen findings-bearing input survives unchanged", () => {
    const input = deepFreeze(messyStorey());
    const before = JSON.stringify(input);
    expect(() => runVerification(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  test("a deep-frozen clean input survives unchanged", () => {
    const input = deepFreeze(syntheticStorey());
    const before = JSON.stringify(input);
    const result = runVerification(input);
    expect(result.findings.length).toBe(0);
    expect(JSON.stringify(input)).toBe(before);
  });
});
