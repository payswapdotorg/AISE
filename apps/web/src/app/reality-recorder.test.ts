/**
 * PROD-016 — the reality RECORDER's pure-logic tests (deterministic: no
 * network, no clock — `recordedAt` is injected; every defect is asserted
 * BY NAME, the create-forms discipline).
 *
 * What is pinned here:
 *  - the closed vocabularies mirror the backend's lists EXACTLY (a backend
 *    vocabulary change fails this suite until the mirror is updated — no
 *    silent second-enum drift);
 *  - the client-side defect checks name every engine refusal the draft can
 *    predict (missing provenance, closed-vocabulary kinds/statuses,
 *    duplicate node ids, unitless numerics, dangling relationship
 *    endpoints, duplicate derived relationship ids);
 *  - the wire mapping is EXACT: node upserts first, relationship upserts
 *    after; properties carry the node's epistemic status + provenance +
 *    typed units verbatim; provenance records are one SUPPORTS per
 *    evidence id plus one DERIVED_FROM note.
 */

import { describe, expect, test } from "bun:test";
import {
  REALITY_EPISTEMIC_STATUSES,
  REALITY_NODE_KINDS,
  REALITY_RELATIONSHIP_KINDS,
  derivedRelationshipId,
  realitySnapshotRequestBody,
  validateRealitySnapshotDraft,
  type RealityRelationDraft,
  type RealitySnapshotDraft,
} from "./reality-recorder";
import { EPISTEMIC_STATUSES } from "../../../../packages/shared-contracts/src/index";

const EV_A = "34867d9a0db6be51a7cbc73d62d424c61b5563c7549e914fc42881c283abe157";
const EV_B = "61fd32e8a71c9013d4a5b6c7d8e9f00112233445566778899aabbccddeeff001";
const AT = "2026-09-29T13:00:00.000Z";

/** A minimal VALID draft (two nodes + one relationship, evidence-backed). */
function validDraft(): RealitySnapshotDraft {
  return {
    projectId: "proj-riverside-refit",
    nodes: [
      {
        nodeId: "site-riverside-01",
        kind: "site",
        epistemicStatus: "OBSERVED",
        propertyLines: "name = Riverside site\nlength = 24 m",
        provenanceEvidenceIds: [EV_A],
        provenanceDerivationNote: "",
      },
      {
        nodeId: "slab-l2",
        kind: "element",
        epistemicStatus: "CONFIRMED",
        propertyLines: "thickness = 240 mm",
        provenanceEvidenceIds: [],
        provenanceDerivationNote: "field survey 2026-09-28",
      },
    ],
    relations: [
      {
        fromNodeId: "site-riverside-01",
        toNodeId: "slab-l2",
        kind: "contains",
        provenanceEvidenceIds: [EV_B],
        provenanceDerivationNote: "",
      },
    ],
  };
}

describe("PROD-016 vocabulary mirrors (pinned, no second-enum drift)", () => {
  test("REALITY_NODE_KINDS mirrors the backend's closed NodeKind list exactly", () => {
    expect([...REALITY_NODE_KINDS]).toEqual([
      "project",
      "site",
      "building",
      "storey",
      "space",
      "element",
      "opening",
      "system",
      "issue",
      "annotation",
    ]);
  });

  test("REALITY_RELATIONSHIP_KINDS mirrors the backend's closed relationship list exactly", () => {
    expect([...REALITY_RELATIONSHIP_KINDS]).toEqual([
      "contains",
      "bounded-by",
      "adjacent-to",
      "supports",
      "part-of",
      "opens-into",
      "references",
    ]);
  });

  test("REALITY_EPISTEMIC_STATUSES reuses the shared contract's list verbatim", () => {
    expect(REALITY_EPISTEMIC_STATUSES).toBe(EPISTEMIC_STATUSES);
  });
});

describe("PROD-016 validateRealitySnapshotDraft (every defect NAMED)", () => {
  test("the minimal valid draft produces zero defects", () => {
    expect(validateRealitySnapshotDraft(validDraft())).toEqual([]);
  });

  test("a snapshot with no nodes is refused by name", () => {
    const defects = validateRealitySnapshotDraft({
      projectId: "p1",
      nodes: [],
      relations: [],
    });
    expect(defects.some((defect) => defect.includes("at least one node is required"))).toBe(true);
  });

  test("an out-of-vocabulary node kind is refused with the closed list", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[0] = { ...nodes[0]!, kind: "spaceship" };
    const defects = validateRealitySnapshotDraft({ ...draft, nodes });
    expect(
      defects.some(
        (defect) =>
          defect.includes('kind "spaceship" is not in the closed NodeKind vocabulary') &&
          defect.includes("annotation"),
      ),
    ).toBe(true);
  });

  test("an out-of-vocabulary epistemic status is refused with the shared list", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[0] = { ...nodes[0]!, epistemicStatus: "GUESSED" };
    const defects = validateRealitySnapshotDraft({ ...draft, nodes });
    expect(
      defects.some((defect) => defect.includes('epistemic status "GUESSED" is not one of')),
    ).toBe(true);
  });

  test("a duplicate node id is refused by name (unique within a version)", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[1] = { ...nodes[1]!, nodeId: "site-riverside-01" };
    const defects = validateRealitySnapshotDraft({ ...draft, nodes });
    expect(
      defects.some(
        (defect) =>
          defect.includes('duplicate node id "site-riverside-01"') &&
          defect.includes("unique within a version"),
      ),
    ).toBe(true);
  });

  test("a source-less node is refused (missing_provenance pre-check)", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[0] = { ...nodes[0]!, provenanceEvidenceIds: [], provenanceDerivationNote: "   " };
    const defects = validateRealitySnapshotDraft({ ...draft, nodes });
    expect(defects.some((defect) => defect.includes("missing provenance"))).toBe(true);
  });

  test("a unitless numeric property line is refused through the shared parser", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[0] = { ...nodes[0]!, propertyLines: "length = 24" };
    const defects = validateRealitySnapshotDraft({ ...draft, nodes });
    expect(
      defects.some(
        (defect) =>
          defect.includes("node 1 properties —") &&
          defect.includes("numeric value 24 requires a typed unit"),
      ),
    ).toBe(true);
  });

  test("a relationship to a node not composed in the snapshot is refused as dangling", () => {
    const draft = validDraft();
    const relations: RealityRelationDraft[] = [
      { ...draft.relations[0]!, toNodeId: "ghost-node" },
    ];
    const defects = validateRealitySnapshotDraft({ ...draft, relations });
    expect(
      defects.some(
        (defect) =>
          defect.includes('"to" node "ghost-node" is not composed in this snapshot') &&
          defect.includes("dangling endpoints are refused"),
      ),
    ).toBe(true);
  });

  test("an out-of-vocabulary relationship kind is refused with the closed list", () => {
    const draft = validDraft();
    const relations: RealityRelationDraft[] = [{ ...draft.relations[0]!, kind: "sits-on" }];
    const defects = validateRealitySnapshotDraft({ ...draft, relations });
    expect(
      defects.some(
        (defect) => defect.includes('kind "sits-on" is not in the closed relationship vocabulary'),
      ),
    ).toBe(true);
  });

  test("the same directed edge asserted twice is refused (duplicate relationship id)", () => {
    const draft = validDraft();
    const relation = draft.relations[0]!;
    const defects = validateRealitySnapshotDraft({
      ...draft,
      relations: [relation, { ...relation, provenanceEvidenceIds: [EV_A] }],
    });
    expect(
      defects.some((defect) => defect.includes("duplicate relationship")),
    ).toBe(true);
  });

  test("a non-64-hex provenance evidence id is refused by name", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[0] = { ...nodes[0]!, provenanceEvidenceIds: ["NOT-HEX"] };
    const defects = validateRealitySnapshotDraft({ ...draft, nodes });
    expect(
      defects.some((defect) => defect.includes("is not a 64-hex content address")),
    ).toBe(true);
  });

  test("an invalid project id is refused by name", () => {
    const defects = validateRealitySnapshotDraft({ ...validDraft(), projectId: "" });
    expect(defects.some((defect) => defect.includes("project id must be 1..256 characters"))).toBe(
      true,
    );
  });
});

describe("PROD-016 realitySnapshotRequestBody (the EXACT wire mapping)", () => {
  test("maps the valid draft to node upserts FIRST, relationship upserts AFTER", () => {
    const result = realitySnapshotRequestBody(validDraft(), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const changes = result.body.changes;
    expect(changes.length).toBe(3);
    expect(changes[0]!.op).toBe("upsert-node");
    expect(changes[1]!.op).toBe("upsert-node");
    expect(changes[2]!.op).toBe("upsert-relationship");
  });

  test("the node carries kind/epistemicStatus verbatim; properties carry the typed unit, the node's epistemic status and the stamped provenance", () => {
    const result = realitySnapshotRequestBody(validDraft(), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const first = result.body.changes[0]!;
    if (first.op !== "upsert-node") {
      throw new Error("expected an upsert-node first");
    }
    expect(first.node.nodeId).toBe("site-riverside-01");
    expect(first.node.kind).toBe("site");
    expect(first.node.epistemicStatus).toBe("OBSERVED");
    expect(first.node.properties.length).toBe(2);
    const length = first.node.properties.find((property) => property.key === "length")!;
    expect(length.value).toBe(24);
    expect(length.unit).toBe("m");
    expect(length.epistemicStatus).toBe("OBSERVED");
    expect(length.provenance).toEqual([
      { role: "SUPPORTS", evidenceId: EV_A, recordedAt: AT },
    ]);
    expect(first.node.provenance).toEqual([
      { role: "SUPPORTS", evidenceId: EV_A, recordedAt: AT },
    ]);
  });

  test("a derivation-note node maps to one DERIVED_FROM provenance record (no evidence records)", () => {
    const result = realitySnapshotRequestBody(validDraft(), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const second = result.body.changes[1]!;
    if (second.op !== "upsert-node") {
      throw new Error("expected an upsert-node second");
    }
    expect(second.node.provenance).toEqual([
      { role: "DERIVED_FROM", derivationNote: "field survey 2026-09-28", recordedAt: AT },
    ]);
  });

  test("the relationship carries the derived id and both endpoints verbatim", () => {
    const result = realitySnapshotRequestBody(validDraft(), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const third = result.body.changes[2]!;
    if (third.op !== "upsert-relationship") {
      throw new Error("expected an upsert-relationship third");
    }
    expect(third.relationship.relationshipId).toBe("site-riverside-01--contains-->slab-l2");
    expect(third.relationship.fromNodeId).toBe("site-riverside-01");
    expect(third.relationship.toNodeId).toBe("slab-l2");
    expect(third.relationship.kind).toBe("contains");
    expect(third.relationship.provenance).toEqual([
      { role: "SUPPORTS", evidenceId: EV_B, recordedAt: AT },
    ]);
  });

  test("a draft with defects refuses the mapping (ok:false with the SAME named defects)", () => {
    const draft = validDraft();
    const nodes = [...draft.nodes];
    nodes[0] = { ...nodes[0]!, provenanceEvidenceIds: [], provenanceDerivationNote: "" };
    const result = realitySnapshotRequestBody({ ...draft, nodes }, AT);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.defects.some((defect) => defect.includes("missing provenance"))).toBe(true);
  });

  test("derivedRelationshipId is the readable stable form", () => {
    expect(
      derivedRelationshipId({
        fromNodeId: "a",
        toNodeId: "b",
        kind: "supports",
        provenanceEvidenceIds: [],
        provenanceDerivationNote: "",
      }),
    ).toBe("a--supports-->b");
  });
});
