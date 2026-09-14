/**
 * AISE-023 mutation/discrimination tests — THE MANDATED EVIDENCE.
 *
 * Every one of the 13 finding codes has a mutation pair here: the clean
 * synthetic storey passes with ZERO findings, and a single ONE-FIELD
 * mutation flips EXACTLY that finding on — subject ids and measured values
 * in the message, no other code affected (isolation). Scope/edge tests pin
 * the documented check boundaries (role scoping, honest-UNKNOWN hosts,
 * fail-closed orphaning, readiness criticality).
 */

import { describe, expect, test } from "bun:test";
import type { ReadinessReport } from "../assurance";
import type { Relationship } from "../reality/model";
import { runVerification } from "./index";
import {
  SEVERITY_BY_CODE,
  type Finding,
  type FindingCode,
  type VerificationInput,
  type VerificationNode,
  type VerificationProperty,
} from "./model";
import { FIXTURE_RECORDED_AT, report, syntheticStorey, vnode, vprop, vrel } from "./testkit";

/* ------------------------------------------------------------------ */
/* One-field mutation helpers (pure: rebuild the input, change ONE field) */
/* ------------------------------------------------------------------ */

function mutateNode(
  input: VerificationInput,
  nodeId: string,
  mutate: (node: VerificationNode) => VerificationNode,
): VerificationInput {
  return {
    ...input,
    graphSnapshot: {
      ...input.graphSnapshot,
      nodes: input.graphSnapshot.nodes.map((node) => (node.nodeId === nodeId ? mutate(node) : node)),
    },
  };
}

function mutateProperty(
  input: VerificationInput,
  nodeId: string,
  key: string,
  mutate: (property: VerificationProperty) => VerificationProperty,
): VerificationInput {
  return mutateNode(input, nodeId, (node) => ({
    ...node,
    properties: node.properties.map((property) => (property.key === key ? mutate(property) : property)),
  }));
}

function mutateRelationship(
  input: VerificationInput,
  relationshipId: string,
  mutate: (relationship: Relationship) => Relationship,
): VerificationInput {
  return {
    ...input,
    graphSnapshot: {
      ...input.graphSnapshot,
      relationships: input.graphSnapshot.relationships.map((relationship) =>
        relationship.relationshipId === relationshipId ? mutate(relationship) : relationship,
      ),
    },
  };
}

function dropRelationship(input: VerificationInput, relationshipId: string): VerificationInput {
  return {
    ...input,
    graphSnapshot: {
      ...input.graphSnapshot,
      relationships: input.graphSnapshot.relationships.filter(
        (relationship) => relationship.relationshipId !== relationshipId,
      ),
    },
  };
}

function addRelationship(input: VerificationInput, relationship: Relationship): VerificationInput {
  return {
    ...input,
    graphSnapshot: {
      ...input.graphSnapshot,
      relationships: [...input.graphSnapshot.relationships, relationship],
    },
  };
}

function invalidateEvidence(input: VerificationInput, evidenceId: string): VerificationInput {
  return {
    ...input,
    evidenceFacts: input.evidenceFacts.map((fact) =>
      fact.evidenceId === evidenceId ? { ...fact, invalidated: true } : fact,
    ),
  };
}

function withReport(input: VerificationInput, assuranceReport: ReadinessReport | undefined): VerificationInput {
  return { ...input, ...(assuranceReport === undefined ? {} : { assuranceReport }) };
}

/** The discrimination assertion: EXACTLY one finding, of exactly this code. */
function expectSingleFinding(input: VerificationInput, code: FindingCode): Finding {
  const result = runVerification(input);
  expect(result.findings.length).toBe(1);
  const only = result.findings[0];
  if (only === undefined) {
    throw new Error("expected exactly one finding");
  }
  expect(only.code).toBe(code);
  expect(only.severity).toBe(SEVERITY_BY_CODE[code]);
  expect(result.summary.byCode[code]).toBe(1);
  return only;
}

/** The clean side of every mutation pair: the storey passes with zero findings. */
function expectClean(input: VerificationInput): void {
  expect(runVerification(input).findings.length).toBe(0);
}

/* ------------------------------------------------------------------ */
/* Model discipline checks                                              */
/* ------------------------------------------------------------------ */

describe("mutation pairs — model discipline", () => {
  test("MISSING_UNIT: dropping the unit off wall width trips exactly MISSING_UNIT", () => {
    expectClean(syntheticStorey());
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "width", () =>
      // same property, same σ, same evidence — ONLY the unit is gone
      vprop("width", 4.2, { sigma: 0.01, evidenceId: "ev-wall-north" }),
    );
    const finding = expectSingleFinding(mutated, "MISSING_UNIT");
    expect(finding.subjectNodeIds).toEqual(["node-wall-north"]);
    expect(finding.message).toContain('"width"');
    expect(finding.message).toContain("4.2");
    expect(finding.message).toContain("node-wall-north");
    expect(finding.remediationHint).toBeDefined();
  });

  test("UNCERTAIN_NUMERIC_WITHOUT_SIGMA: dropping σ off an OBSERVED numeric trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "width", () =>
      vprop("width", 4.2, { unit: "m", evidenceId: "ev-wall-north" }),
    );
    const finding = expectSingleFinding(mutated, "UNCERTAIN_NUMERIC_WITHOUT_SIGMA");
    expect(finding.subjectNodeIds).toEqual(["node-wall-north"]);
    expect(finding.message).toContain('"width"');
    expect(finding.message).toContain("4.2 m");
    expect(finding.message).toContain("OBSERVED");
    expect(finding.message).toContain("UNKNOWN, never 0");
  });

  test("EPISTEMIC_DOWNGRADE_SUSPECT: invalidating the evidence under a CONFIRMED property trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = invalidateEvidence(syntheticStorey(), "ev-floor");
    const finding = expectSingleFinding(mutated, "EPISTEMIC_DOWNGRADE_SUSPECT");
    expect(finding.subjectNodeIds).toEqual(["node-floor-1"]);
    expect(finding.message).toContain('"area"');
    expect(finding.message).toContain("CONFIRMED");
    expect(finding.message).toContain("ev-floor");
    expect(finding.message).toContain("SUPPORTS");
  });

  test("UNPROVENANCED_PROPERTY: emptying a property's provenance trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = mutateProperty(syntheticStorey(), "node-wall-east", "height", () =>
      vprop("height", 2.7, { unit: "m", sigma: 0.02, provenance: [] }),
    );
    const finding = expectSingleFinding(mutated, "UNPROVENANCED_PROPERTY");
    expect(finding.subjectNodeIds).toEqual(["node-wall-east"]);
    expect(finding.message).toContain('"height"');
    expect(finding.message).toContain("no provenance records");
  });
});

/* ------------------------------------------------------------------ */
/* Topology checks                                                      */
/* ------------------------------------------------------------------ */

describe("mutation pairs — topology", () => {
  test("DANGLING_RELATIONSHIP: one added references relationship to a ghost node trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = addRelationship(
      syntheticStorey(),
      vrel("rel-references-ghost", "references", "node-wall-north", "node-ghost"),
    );
    const finding = expectSingleFinding(mutated, "DANGLING_RELATIONSHIP");
    expect(finding.subjectNodeIds).toEqual(["node-wall-north"]);
    expect(finding.message).toContain("rel-references-ghost");
    expect(finding.message).toContain('toNodeId "node-ghost"');
  });

  test("ORPHAN_NODE: removing the floor's contains relationship trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = dropRelationship(syntheticStorey(), "rel-contains-floor");
    const finding = expectSingleFinding(mutated, "ORPHAN_NODE");
    expect(finding.subjectNodeIds).toEqual(["node-floor-1"]);
    expect(finding.message).toContain("node-floor-1");
    expect(finding.message).toContain("no contains-path");
  });

  test("DUPLICATE_NODE_KIND_IN_SPACE: renaming Wall East to Wall North trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = mutateProperty(syntheticStorey(), "node-wall-east", "label", (property) => ({
      ...property,
      value: "Wall North",
    }));
    const finding = expectSingleFinding(mutated, "DUPLICATE_NODE_KIND_IN_SPACE");
    expect(finding.subjectNodeIds).toEqual(["node-wall-east", "node-wall-north"]);
    expect(finding.message).toContain("2 element nodes");
    expect(finding.message).toContain('label "Wall North"');
    expect(finding.message).toContain("node-space-living");
  });
});

/* ------------------------------------------------------------------ */
/* Semantic checks                                                      */
/* ------------------------------------------------------------------ */

describe("mutation pairs — semantic", () => {
  test("SEMANTIC_KIND_MISMATCH: semantic.kind 'door' on an element node trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = mutateProperty(syntheticStorey(), "node-floor-1", "semantic.kind", (property) => ({
      ...property,
      value: "door",
    }));
    const finding = expectSingleFinding(mutated, "SEMANTIC_KIND_MISMATCH");
    expect(finding.subjectNodeIds).toEqual(["node-floor-1"]);
    expect(finding.message).toContain('"element"');
    expect(finding.message).toContain('"door"');
    expect(finding.message).toContain('expected node kind "opening"');
  });

  test("OPENING_WITHOUT_HOST: retargeting the door's opens-into to the floor trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = mutateRelationship(syntheticStorey(), "rel-opens-door", (relationship) => ({
      ...relationship,
      toNodeId: "node-floor-1",
    }));
    const finding = expectSingleFinding(mutated, "OPENING_WITHOUT_HOST");
    expect(finding.subjectNodeIds).toEqual(["node-door-1"]);
    expect(finding.message).toContain("node-door-1");
    expect(finding.message).toContain("1 opens-into relationship(s) found");
    expect(finding.message).toContain("none resolving to a wall-classified host");
  });
});

/* ------------------------------------------------------------------ */
/* Evidence checks                                                      */
/* ------------------------------------------------------------------ */

describe("mutation pairs — evidence", () => {
  test("INVALIDATED_EVIDENCE_LINKED: invalidating the evidence under an OBSERVED property trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = invalidateEvidence(syntheticStorey(), "ev-wall-east");
    const finding = expectSingleFinding(mutated, "INVALIDATED_EVIDENCE_LINKED");
    expect(finding.subjectNodeIds).toEqual(["node-wall-east"]);
    expect(finding.message).toContain('"height"');
    expect(finding.message).toContain("OBSERVED");
    expect(finding.message).toContain("ev-wall-east");
  });

  test("MISSING_EVIDENCE_RECORD: pointing provenance at an unknown evidence id trips exactly it", () => {
    expectClean(syntheticStorey());
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "width", () =>
      vprop("width", 4.2, {
        unit: "m",
        sigma: 0.01,
        provenance: [{ role: "SUPPORTS", evidenceId: "ev-unknown-42", recordedAt: FIXTURE_RECORDED_AT }],
      }),
    );
    const finding = expectSingleFinding(mutated, "MISSING_EVIDENCE_RECORD");
    expect(finding.subjectNodeIds).toEqual(["node-wall-north"]);
    expect(finding.message).toContain('"width"');
    expect(finding.message).toContain("ev-unknown-42");
    expect(finding.message).toContain("not in the evidence fact set");
  });
});

/* ------------------------------------------------------------------ */
/* Readiness cross-reference                                            */
/* ------------------------------------------------------------------ */

describe("mutation pairs — readiness cross-reference", () => {
  test("READINESS_NOT_READY: flipping the overall level READY→NOT_READY trips exactly it, citing the failing dimension", () => {
    // clean side: same report with overall READY (the verifier trusts the
    // authority's aggregate — it never recomputes it)
    expectClean(withReport(syntheticStorey(), report("READY", "satisfied", "not_satisfied")));
    const mutated = withReport(syntheticStorey(), report("NOT_READY", "satisfied", "not_satisfied"));
    const finding = expectSingleFinding(mutated, "READINESS_NOT_READY");
    expect(finding.subjectNodeIds).toEqual([]);
    expect(finding.message).toContain("NOT_READY");
    expect(finding.message).toContain("dim-geo");
  });

  test("CRITICAL_DIMENSION_UNKNOWN: flipping a critical dimension to insufficient_data trips exactly it (even with overall READY)", () => {
    expectClean(withReport(syntheticStorey(), report("READY", "satisfied", "satisfied")));
    const mutated = withReport(syntheticStorey(), report("READY", "satisfied", "insufficient_data"));
    const finding = expectSingleFinding(mutated, "CRITICAL_DIMENSION_UNKNOWN");
    expect(finding.subjectNodeIds).toEqual([]);
    expect(finding.message).toContain("dim-geo");
    expect(finding.message).toContain("insufficient_data");
    expect(finding.message).toContain("unknown is never ready");
  });
});

/* ------------------------------------------------------------------ */
/* Check scope / edge behavior (documented boundaries)                  */
/* ------------------------------------------------------------------ */

describe("model-discipline scope", () => {
  test("an empty-string unit is treated as missing", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "width", (property) => ({
      ...property,
      unit: "",
    }));
    expectSingleFinding(mutated, "MISSING_UNIT");
  });

  test("INFERRED numeric without σ does NOT trip (estimates are not claimed measurements)", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "width", () =>
      vprop("width", 4.2, { unit: "m", epistemicStatus: "INFERRED", evidenceId: "ev-wall-north" }),
    );
    expectClean(mutated);
  });

  test("PROPOSED numeric without σ does NOT trip", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "width", () =>
      vprop("width", 4.2, { unit: "m", epistemicStatus: "PROPOSED", evidenceId: "ev-wall-north" }),
    );
    expectClean(mutated);
  });

  test("a provenance record naming no source is unprovenanced", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-wall-east", "height", (property) => ({
      ...property,
      provenance: [{ role: "SUPPORTS", recordedAt: FIXTURE_RECORDED_AT }],
    }));
    const finding = expectSingleFinding(mutated, "UNPROVENANCED_PROPERTY");
    expect(finding.message).toContain("names no source");
  });
});

describe("evidence-check role scoping (exactly-once discipline)", () => {
  test("CONFIRMED + CONTEXT-role invalidated evidence stays INVALIDATED_EVIDENCE_LINKED (not a downgrade suspect)", () => {
    const retargeted = mutateProperty(syntheticStorey(), "node-floor-1", "area", (property) => ({
      ...property,
      provenance: [{ role: "CONTEXT", evidenceId: "ev-floor", recordedAt: FIXTURE_RECORDED_AT }],
    }));
    const finding = expectSingleFinding(invalidateEvidence(retargeted, "ev-floor"), "INVALIDATED_EVIDENCE_LINKED");
    expect(finding.message).toContain("CONTEXT");
    expect(finding.message).toContain("ev-floor");
  });

  test("OBSERVED + DERIVED_FROM invalidated evidence stays INVALIDATED_EVIDENCE_LINKED", () => {
    const retargeted = mutateProperty(syntheticStorey(), "node-wall-east", "height", (property) => ({
      ...property,
      provenance: [{ role: "DERIVED_FROM", evidenceId: "ev-wall-east", recordedAt: FIXTURE_RECORDED_AT }],
    }));
    expectSingleFinding(invalidateEvidence(retargeted, "ev-wall-east"), "INVALIDATED_EVIDENCE_LINKED");
  });
});

describe("topology edges", () => {
  test("DANGLING_RELATIONSHIP with BOTH endpoints missing carries an empty subject", () => {
    const mutated = addRelationship(
      syntheticStorey(),
      vrel("rel-ghost-pair", "references", "node-ghost-a", "node-ghost-b"),
    );
    const finding = expectSingleFinding(mutated, "DANGLING_RELATIONSHIP");
    expect(finding.subjectNodeIds).toEqual([]);
    expect(finding.message).toContain('fromNodeId "node-ghost-a"');
    expect(finding.message).toContain('toNodeId "node-ghost-b"');
  });

  test("zero project nodes → every non-project node is an orphan (fail-closed)", () => {
    const input: VerificationInput = {
      graphSnapshot: {
        nodes: [
          vnode("node-site-1", "site", "CONFIRMED", [vprop("name", "Site 7")]),
          vnode("node-building-1", "building", "CONFIRMED", [vprop("name", "Building A")]),
        ],
        relationships: [vrel("rel-1", "contains", "node-site-1", "node-building-1")],
      },
      evidenceFacts: [],
    };
    const result = runVerification(input);
    expect(result.findings.map((finding) => [finding.code, finding.subjectNodeIds])).toEqual([
      ["ORPHAN_NODE", ["node-building-1"]],
      ["ORPHAN_NODE", ["node-site-1"]],
    ]);
  });

  test("a contains cycle that reaches no project root stays orphaned", () => {
    const input: VerificationInput = {
      graphSnapshot: {
        nodes: [
          vnode("node-project-1", "project", "CONFIRMED", [vprop("name", "P")]),
          vnode("node-space-a", "space", "CONFIRMED", [vprop("name", "A")]),
          vnode("node-space-b", "space", "CONFIRMED", [vprop("name", "B")]),
        ],
        relationships: [
          vrel("rel-cycle-a", "contains", "node-space-a", "node-space-b"),
          vrel("rel-cycle-b", "contains", "node-space-b", "node-space-a"),
        ],
      },
      evidenceFacts: [],
    };
    const result = runVerification(input);
    expect(result.findings.map((finding) => finding.subjectNodeIds)).toEqual([
      ["node-space-a"],
      ["node-space-b"],
    ]);
    expect(result.findings.every((finding) => finding.code === "ORPHAN_NODE")).toBe(true);
  });

  test("a group of THREE same-kind+label elements yields ONE finding naming all three", () => {
    const input: VerificationInput = {
      graphSnapshot: {
        nodes: [
          vnode("node-project-1", "project", "CONFIRMED", [vprop("name", "P")]),
          vnode("node-space-1", "space", "CONFIRMED", [vprop("name", "S")]),
          vnode("node-column-1", "element", "OBSERVED", [vprop("label", "Column")]),
          vnode("node-column-2", "element", "OBSERVED", [vprop("label", "Column")]),
          vnode("node-column-3", "element", "OBSERVED", [vprop("label", "Column")]),
        ],
        relationships: [
          vrel("rel-1", "contains", "node-project-1", "node-space-1"),
          vrel("rel-2", "contains", "node-space-1", "node-column-1"),
          vrel("rel-3", "contains", "node-space-1", "node-column-2"),
          vrel("rel-4", "contains", "node-space-1", "node-column-3"),
        ],
      },
      evidenceFacts: [],
    };
    const finding = expectSingleFinding(input, "DUPLICATE_NODE_KIND_IN_SPACE");
    expect(finding.subjectNodeIds).toEqual(["node-column-1", "node-column-2", "node-column-3"]);
    expect(finding.message).toContain("3 element nodes");
  });
});

describe("semantic scope (honest UNKNOWN is never disagreement)", () => {
  test("same label under different kinds is NOT a duplicate (kind is part of the key)", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-door-1", "label", (property) => ({
      ...property,
      value: "Wall North",
    }));
    expectClean(mutated);
  });

  test("semantic.kind 'unclassified' imposes no constraint — and still hosts openings", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-wall-north", "semantic.kind", (property) => ({
      ...property,
      value: "unclassified",
    }));
    expectClean(mutated);
  });

  test("a host with NO semantic.kind property still hosts (UNKNOWN never implies absence)", () => {
    const mutated = mutateNode(syntheticStorey(), "node-wall-north", (node) => ({
      ...node,
      properties: node.properties.filter((property) => property.key !== "semantic.kind"),
    }));
    expectClean(mutated);
  });

  test("an out-of-vocabulary semantic.kind value imposes no constraint", () => {
    const mutated = mutateProperty(syntheticStorey(), "node-floor-1", "semantic.kind", (property) => ({
      ...property,
      value: "beam",
    }));
    expectClean(mutated);
  });
});

describe("readiness scope", () => {
  test("INSUFFICIENT_DATA overall also surfaces as READINESS_NOT_READY", () => {
    const mutated = withReport(syntheticStorey(), report("INSUFFICIENT_DATA", "satisfied", "not_satisfied"));
    const finding = expectSingleFinding(mutated, "READINESS_NOT_READY");
    expect(finding.message).toContain("INSUFFICIENT_DATA");
    expect(finding.message).toContain("dim-geo");
  });

  test("composite: NOT_READY overall + critical insufficient_data yields BOTH readiness findings (documented overlap)", () => {
    const mutated = withReport(syntheticStorey(), report("NOT_READY", "satisfied", "insufficient_data"));
    const result = runVerification(mutated);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "CRITICAL_DIMENSION_UNKNOWN",
      "READINESS_NOT_READY",
    ]);
    expect(result.summary.errors).toBe(2);
  });

  test("non-critical insufficient_data with overall READY is NOT flagged (criticality mirrors AISE-022 fail-closed)", () => {
    const mutated = withReport(syntheticStorey(), report("READY", "insufficient_data", "satisfied"));
    expectClean(mutated);
  });

  test("READY_WITH_NOTES overall is not a not-ready finding", () => {
    const mutated = withReport(syntheticStorey(), report("READY_WITH_NOTES", "satisfied", "satisfied"));
    expectClean(mutated);
  });

  test("absent report → no readiness findings at all", () => {
    const result = runVerification(syntheticStorey());
    expect(result.summary.byCode.READINESS_NOT_READY).toBe(0);
    expect(result.summary.byCode.CRITICAL_DIMENSION_UNKNOWN).toBe(0);
  });
});

describe("isolation on a non-clean base", () => {
  test("a second mutation adds exactly its own finding; every other count is unchanged", () => {
    const base = mutateProperty(syntheticStorey(), "node-wall-north", "width", () =>
      vprop("width", 4.2, { sigma: 0.01, evidenceId: "ev-wall-north" }), // no unit → MISSING_UNIT
    );
    const baseReport = runVerification(base);
    expect(baseReport.findings.length).toBe(1);
    const baseByCode = { ...baseReport.summary.byCode };

    const twiceMutated = mutateProperty(base, "node-wall-east", "height", () =>
      vprop("height", 2.7, { unit: "m", evidenceId: "ev-wall-east" }), // no σ → UNCERTAIN
    );
    const result = runVerification(twiceMutated);
    expect(result.findings.length).toBe(2);
    expect(result.summary.byCode.MISSING_UNIT).toBe(1);
    expect(result.summary.byCode.UNCERTAIN_NUMERIC_WITHOUT_SIGMA).toBe(1);
    expect(result.summary.errors).toBe(1);
    expect(result.summary.warnings).toBe(1);
    for (const code of Object.keys(baseByCode) as FindingCode[]) {
      const expected =
        code === "UNCERTAIN_NUMERIC_WITHOUT_SIGMA" ? (baseByCode[code] ?? 0) + 1 : baseByCode[code];
      expect(result.summary.byCode[code]).toBe(expected);
    }
  });
});
