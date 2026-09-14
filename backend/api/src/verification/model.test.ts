/**
 * AISE-023 registry integrity tests — the frozen finding-code registry and
 * the documented severity table ARE the stable-code contract; these tests
 * pin them verbatim (any change is a governed, versioned change).
 */

import { describe, expect, test } from "bun:test";
import { runVerification } from "./index";
import {
  FINDING_CODES,
  LABEL_PROPERTY_KEY,
  SEVERITY_BY_CODE,
  SEMANTIC_KIND_PROPERTY_KEY,
  SEMANTIC_KIND_TO_NODE_KIND,
  type VerificationInput,
} from "./model";

describe("finding-code registry (the CRITICAL stable contract)", () => {
  test("is exactly the 13 documented codes in family order", () => {
    expect([...FINDING_CODES]).toEqual([
      // model discipline
      "MISSING_UNIT",
      "UNCERTAIN_NUMERIC_WITHOUT_SIGMA",
      "EPISTEMIC_DOWNGRADE_SUSPECT",
      "UNPROVENANCED_PROPERTY",
      // topology
      "DANGLING_RELATIONSHIP",
      "ORPHAN_NODE",
      "DUPLICATE_NODE_KIND_IN_SPACE",
      // semantic
      "SEMANTIC_KIND_MISMATCH",
      "OPENING_WITHOUT_HOST",
      // evidence
      "INVALIDATED_EVIDENCE_LINKED",
      "MISSING_EVIDENCE_RECORD",
      // readiness
      "READINESS_NOT_READY",
      "CRITICAL_DIMENSION_UNKNOWN",
    ]);
  });

  test("codes are unique non-empty strings", () => {
    expect(new Set(FINDING_CODES).size).toBe(FINDING_CODES.length);
    for (const code of FINDING_CODES) {
      expect(code.length).toBeGreaterThan(0);
      expect((code as string).toUpperCase()).toBe(code);
    }
  });

  test("registry is frozen (append throws in strict mode)", () => {
    expect(Object.isFrozen(FINDING_CODES)).toBe(true);
    expect(() => {
      (FINDING_CODES as unknown as string[]).push("SOME_NEW_CODE");
    }).toThrow();
  });
});

describe("severity registry (documented mapping, tested verbatim)", () => {
  test("maps every code exactly as documented", () => {
    expect({ ...SEVERITY_BY_CODE }).toEqual({
      MISSING_UNIT: "error",
      UNCERTAIN_NUMERIC_WITHOUT_SIGMA: "warning",
      EPISTEMIC_DOWNGRADE_SUSPECT: "warning",
      UNPROVENANCED_PROPERTY: "error",
      DANGLING_RELATIONSHIP: "error",
      ORPHAN_NODE: "error",
      DUPLICATE_NODE_KIND_IN_SPACE: "warning",
      SEMANTIC_KIND_MISMATCH: "warning",
      OPENING_WITHOUT_HOST: "error",
      INVALIDATED_EVIDENCE_LINKED: "error",
      MISSING_EVIDENCE_RECORD: "error",
      READINESS_NOT_READY: "error",
      CRITICAL_DIMENSION_UNKNOWN: "error",
    });
  });

  test("covers every registry code exactly once", () => {
    expect(Object.keys(SEVERITY_BY_CODE).sort()).toEqual([...FINDING_CODES].sort());
  });

  test("is frozen and no current code maps to info (reserved level)", () => {
    expect(Object.isFrozen(SEVERITY_BY_CODE)).toBe(true);
    for (const code of FINDING_CODES) {
      const severity = SEVERITY_BY_CODE[code];
      expect(severity === "error" || severity === "warning").toBe(true);
    }
  });
});

describe("documented registries used by the semantic checks", () => {
  test("semantic.kind → node kind mapping is exact and frozen", () => {
    expect({ ...SEMANTIC_KIND_TO_NODE_KIND }).toEqual({
      wall: "element",
      floor: "element",
      ceiling: "element",
      opening: "opening",
      door: "opening",
      window: "opening",
    });
    expect(Object.isFrozen(SEMANTIC_KIND_TO_NODE_KIND)).toBe(true);
    // honest UNKNOWN imposes no constraint: absent from the table by design
    expect(SEMANTIC_KIND_TO_NODE_KIND["unclassified"]).toBeUndefined();
    expect(SEMANTIC_KIND_TO_NODE_KIND["beam"]).toBeUndefined();
  });

  test("property-key conventions are pinned", () => {
    expect(LABEL_PROPERTY_KEY).toBe("label");
    expect(SEMANTIC_KIND_PROPERTY_KEY).toBe("semantic.kind");
  });
});

describe("input shape compatibility", () => {
  test("a plain RealityNode projection (no uncertainty key) verifies cleanly", () => {
    // A raw AISE-016 GraphVersion projection is structurally valid input:
    // the σ extension on VerificationProperty is optional.
    const input: VerificationInput = {
      graphSnapshot: {
        nodes: [
          {
            nodeId: "node-project-1",
            kind: "project",
            epistemicStatus: "CONFIRMED",
            properties: [
              {
                key: "name",
                value: "Minimal project",
                epistemicStatus: "CONFIRMED",
                provenance: [{ role: "DERIVED_FROM", derivationNote: "fixture", recordedAt: "2026-01-01T00:00:00Z" }],
              },
            ],
            provenance: [{ role: "DERIVED_FROM", derivationNote: "fixture", recordedAt: "2026-01-01T00:00:00Z" }],
          },
        ],
        relationships: [],
      },
      evidenceFacts: [],
    };
    const report = runVerification(input);
    expect(report.findings.length).toBe(0);
    expect(report.summary.errors).toBe(0);
  });
});
