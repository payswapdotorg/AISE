/**
 * AISE-029 — retrieval tests: the deterministic TOOL layer over the
 * caller-supplied context. Honesty is the contract: absence is null/empty
 * (never a placeholder), invalidated evidence is distinct from absent, and
 * every list is ID-SORTED regardless of input order (order-insensitive
 * determinism via the seeded shuffle). Also covers citation resolution
 * (resolved/absent/invalidated discrimination), σ-source enumeration (the
 * fabrication gate's basis) and the shared word-boundary matcher.
 */

import { describe, expect, test } from "bun:test";
import { GroundedRetrieval, createGroundedRetrieval, labelOfNode, questionMentionsPhrase } from "./retrieval";
import type { GroundedContext, GroundedEvidenceRecord } from "./model";
import {
  EV_EAST_MANUAL,
  EV_NORTH_DEPTH,
  groundedStoreyContext,
  shuffled,
} from "./testkit";

describe("reasoning retrieval: node and case lookups (honest absence)", () => {
  const context = groundedStoreyContext();

  test("nodes() is id-sorted; node() resolves by id or honestly null", () => {
    const nodes = GroundedRetrieval.nodes(context);
    expect(nodes.map((n) => n.nodeId)).toEqual([...nodes.map((n) => n.nodeId)].sort());
    expect(GroundedRetrieval.node(context, "node-wall-north")?.nodeId).toBe("node-wall-north");
    expect(GroundedRetrieval.node(context, "node-ghost")).toBeNull();
  });

  test("cases() is id-sorted; caseById() resolves or null", () => {
    expect(GroundedRetrieval.cases(context).map((c) => c.caseId)).toEqual(["case-crack-1"]);
    expect(GroundedRetrieval.caseById(context, "case-crack-1")?.caseId).toBe("case-crack-1");
    expect(GroundedRetrieval.caseById(context, "case-none")).toBeNull();
  });

  test("observationsForCase is observationId-sorted; unknown case is empty", () => {
    const observations = GroundedRetrieval.observationsForCase(context, "case-crack-1");
    expect(observations.map((o) => o.observationId)).toEqual(["obs-crack-1"]);
    expect(GroundedRetrieval.observationsForCase(context, "case-none")).toEqual([]);
  });

  test("labelOfNode reads the label property or falls back to null", () => {
    expect(labelOfNode(GroundedRetrieval.node(context, "node-wall-north")!)).toBe("Wall North");
    expect(labelOfNode(GroundedRetrieval.node(context, "node-storey-1")!)).toBe("Ground floor");
  });
});

describe("reasoning retrieval: evidence and findings tools", () => {
  const context = groundedStoreyContext();

  test("findEvidenceForNode returns invalidated evidence WITH its state visible", () => {
    const east = GroundedRetrieval.findEvidenceForNode(context, "node-wall-east");
    expect(east.map((e) => e.contentId)).toEqual([EV_EAST_MANUAL]);
    expect(east[0]?.invalidated).toBe(true);
    expect(east[0]?.invalidationReason).toBe("superseded by re-measurement");
  });

  test("validEvidenceForNode EXCLUDES invalidated evidence (claim-support tool)", () => {
    expect(GroundedRetrieval.validEvidenceForNode(context, "node-wall-east")).toEqual([]);
    const north = GroundedRetrieval.validEvidenceForNode(context, "node-wall-north");
    expect(north.map((e) => e.contentId)).toEqual([EV_NORTH_DEPTH]);
  });

  test("evidenceByContentId resolves both states; absent is null", () => {
    expect(GroundedRetrieval.evidenceByContentId(context, EV_NORTH_DEPTH)?.contentId).toBe(
      EV_NORTH_DEPTH,
    );
    expect(GroundedRetrieval.evidenceByContentId(context, EV_EAST_MANUAL)?.invalidated).toBe(true);
    expect(GroundedRetrieval.evidenceByContentId(context, "ev-none")).toBeNull();
  });

  test("findFindingsForNode returns the subject's findings, code-then-subject sorted", () => {
    const findings = GroundedRetrieval.findFindingsForNode(context, "node-wall-east");
    expect(findings.map((f) => f.code).sort()).toEqual([
      "INVALIDATED_EVIDENCE_LINKED",
      "UNCERTAIN_NUMERIC_WITHOUT_SIGMA",
    ]);
    expect(GroundedRetrieval.findFindingsForNode(context, "node-wall-north")).toEqual([]);
  });
});

describe("reasoning retrieval: citation resolution (absent ≠ invalidated)", () => {
  const context = groundedStoreyContext();

  test("valid evidence, live node, present finding, present observation all resolve", () => {
    expect(GroundedRetrieval.resolveCitation(context, { kind: "evidence", contentId: EV_NORTH_DEPTH })).toBe(
      "resolved",
    );
    expect(
      GroundedRetrieval.resolveCitation(context, { kind: "graph_node", nodeId: "node-wall-north" }),
    ).toBe("resolved");
    expect(
      GroundedRetrieval.resolveCitation(context, {
        kind: "finding",
        findingCode: "INVALIDATED_EVIDENCE_LINKED",
        subjectNodeId: "node-wall-east",
      }),
    ).toBe("resolved");
    expect(
      GroundedRetrieval.resolveCitation(context, {
        kind: "case_observation",
        caseId: "case-crack-1",
        observationId: "obs-crack-1",
      }),
    ).toBe("resolved");
  });

  test("unknown references are ABSENT (distinct from invalidated)", () => {
    expect(GroundedRetrieval.resolveCitation(context, { kind: "evidence", contentId: "ev-none" })).toBe(
      "absent",
    );
    expect(
      GroundedRetrieval.resolveCitation(context, { kind: "graph_node", nodeId: "node-ghost" }),
    ).toBe("absent");
    expect(
      GroundedRetrieval.resolveCitation(context, {
        kind: "finding",
        findingCode: "NO_SUCH_CODE",
        subjectNodeId: "node-wall-east",
      }),
    ).toBe("absent");
  });

  test("INVALIDATED evidence is its own resolution state", () => {
    expect(GroundedRetrieval.resolveCitation(context, { kind: "evidence", contentId: EV_EAST_MANUAL })).toBe(
      "invalidated",
    );
  });
});

describe("reasoning retrieval: σ-source enumeration (the fabrication gate basis)", () => {
  const context = groundedStoreyContext();

  test("evidence citations expose their measurement σ", () => {
    expect(
      GroundedRetrieval.uncertaintySourcesAt(context, { kind: "evidence", contentId: EV_NORTH_DEPTH }),
    ).toEqual([{ sigma: 0.01, unit: "m" }]);
    // The invalidated record still ENUMERATES (visibility ≠ usability).
    expect(
      GroundedRetrieval.uncertaintySourcesAt(context, { kind: "evidence", contentId: EV_EAST_MANUAL }),
    ).toEqual([{ sigma: 0.02, unit: "m" }]);
  });

  test("node citations expose the σ behind measured properties; absent nodes expose nothing", () => {
    const sources = GroundedRetrieval.uncertaintySourcesAt(context, {
      kind: "graph_node",
      nodeId: "node-wall-north",
    });
    expect(sources).toContainEqual({ sigma: 0.01, unit: "m" });
    expect(GroundedRetrieval.uncertaintySourcesAt(context, { kind: "graph_node", nodeId: "node-ghost" })).toEqual(
      [],
    );
  });
});

describe("reasoning retrieval: determinism (order-insensitive)", () => {
  test("createGroundedRetrieval() yields the default pure toolset (factory form)", () => {
    const adapter = createGroundedRetrieval();
    const context = groundedStoreyContext();
    expect(adapter.node(context, "node-wall-north")?.nodeId).toBe("node-wall-north");
    expect(adapter.resolveCitation(context, { kind: "evidence", contentId: EV_NORTH_DEPTH })).toBe(
      "resolved",
    );
    expect(adapter.uncertaintySourcesAt(context, {
      kind: "graph_node",
      nodeId: "node-wall-north",
    })).toContainEqual({ sigma: 0.01, unit: "m" });
  });

  function shuffledContext(seed: number): GroundedContext {
    const base = groundedStoreyContext();
    const record = (id: string, method: GroundedEvidenceRecord["method"]): GroundedEvidenceRecord => ({
      contentId: id,
      method,
      capturedAt: "2026-01-01T00:00:00Z",
      invalidated: false,
      linkedNodeIds: ["node-wall-north"],
      measurement: { value: 1, unit: "m", sigma: 0.1 },
    });
    return {
      graphSnapshot: {
        nodes: shuffled(base.graphSnapshot.nodes, seed),
        relationships: shuffled(base.graphSnapshot.relationships, seed + 1),
      },
      evidenceRecords: shuffled(
        [...base.evidenceRecords, record("ev-extra-a", "MANUAL_MEASUREMENT"), record("ev-extra-b", "DEPTH_SENSING")],
        seed + 2,
      ),
      verificationFindings: base.verificationFindings,
      cases: shuffled(base.cases, seed + 3),
      rules: base.rules,
    };
  }

  test("shuffled inputs yield identical, id-sorted outputs (five seeds)", () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const context = shuffledContext(seed);
      const nodes = GroundedRetrieval.nodes(context);
      expect(nodes.map((n) => n.nodeId)).toEqual([...nodes.map((n) => n.nodeId)].sort());
      const evidence = GroundedRetrieval.findEvidenceForNode(context, "node-wall-north");
      expect(evidence.map((e) => e.contentId)).toEqual(
        [...evidence.map((e) => e.contentId)].sort(),
      );
    }
    const a = GroundedRetrieval.nodes(shuffledContext(1)).map((n) => n.nodeId);
    const b = GroundedRetrieval.nodes(shuffledContext(42)).map((n) => n.nodeId);
    expect(a).toEqual(b);
  });
});

describe("reasoning retrieval: the shared word-boundary matcher", () => {
  test("word boundaries, case-insensitivity, no substring bleed", () => {
    expect(questionMentionsPhrase("Assess the waterproofing.", "roof")).toBe(false);
    expect(questionMentionsPhrase("Describe the roof.", "roof")).toBe(true);
    expect(questionMentionsPhrase("THE ROOF LINE", "roof")).toBe(true);
    expect(questionMentionsPhrase("node-wall-north width", "node-wall-north")).toBe(true);
    // Alphanumeric SUBSTRING bleed is impossible: "crack" never fires inside
    // "cracks" (the trailing 's' is an alphanumeric follower).
    expect(questionMentionsPhrase("hairline cracks noted", "crack")).toBe(false);
    // Hyphens DELIMIT tokens (the AISE-017 house convention — the same
    // `(^|[^a-z0-9])phrase([^a-z0-9]|$)` pattern), so "crack" IS a token of
    // the hyphenated id "class-crack-1". The interrupted-WIP draft expected
    // false here, contradicting the documented boundary semantics.
    expect(questionMentionsPhrase("class-crack-1", "crack")).toBe(true);
    expect(questionMentionsPhrase("", "x")).toBe(false);
    expect(questionMentionsPhrase("any question", "  ")).toBe(false);
  });
});
