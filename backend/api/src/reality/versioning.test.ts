/**
 * AISE-016 — Reality Graph version-transition engine tests (pure, no I/O).
 *
 * Depth mandated by the CRITICAL work order: version chain materialization,
 * identity stability, tombstones, typed units, provenance requirements,
 * epistemic discipline (no silent downgrade, proposals stay proposals,
 * observations never mutate node state), dangling references, hierarchy
 * smoke and byte-level determinism.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { EpistemicStatus } from "@aise/shared-contracts";
import {
  applyChanges,
  createInitialVersion,
  type ChangeMeta,
} from "./versioning";
import {
  RealityGraphError,
  type ChangeRecord,
  type GraphVersion,
  type RealityGraph,
} from "./model";
import {
  evidenceIdOf,
  FIXED_EVEN_LATER,
  FIXED_LATER,
  FIXED_NOW,
  hierarchyChangeSet,
  makeNode,
  makeObservation,
  makeProperty,
  makeProvenance,
  makeRelationship,
} from "./testkit";

/** Capture a typed rejection (fails the test when nothing is thrown). */
function captureError(fn: () => unknown): RealityGraphError {
  try {
    fn();
  } catch (error) {
    if (error instanceof RealityGraphError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a RealityGraphError");
}

function newGraph(projectId = "proj-alpha"): RealityGraph {
  return {
    projectId,
    createdAt: FIXED_NOW,
    versions: [createInitialVersion(projectId, FIXED_NOW)],
  };
}

const meta = (createdAt: string = FIXED_LATER): ChangeMeta => ({ createdAt });

function extend(
  graph: RealityGraph,
  changes: readonly ChangeRecord[],
  createdAt: string = FIXED_LATER,
): RealityGraph {
  const version = applyChanges(graph, changes, meta(createdAt));
  return { ...graph, versions: [...graph.versions, version] };
}

const wallNode = (status: EpistemicStatus = "INFERRED"): ChangeRecord => ({
  op: "upsert-node",
  node: makeNode("wall-1", {
    kind: "element",
    epistemicStatus: status,
    properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "INFERRED" })],
  }),
});

describe("reality versioning: version chain", () => {
  test("initial version is empty v001 with a null parent", () => {
    const version = createInitialVersion("proj-alpha", FIXED_NOW);
    expect(version.versionId).toBe("v001");
    expect(version.parentVersionId).toBeNull();
    expect(version.nodes).toHaveLength(0);
    expect(version.changeLog).toHaveLength(0);
  });

  test("applyChanges on a graph with no versions is a typed rejection", () => {
    const error = captureError(() =>
      applyChanges({ projectId: "p", createdAt: FIXED_NOW, versions: [] }, [], meta()),
    );
    expect(error.code).toBe("empty_graph");
  });

  test("create → 3 change sets → 4 versions with monotonic ids and parent links", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("space-1", { kind: "space" }) }]);
    graph = extend(graph, [
      { op: "observe", observation: makeObservation("obs-1", "wall-1") },
    ]);
    expect(graph.versions.map((v) => v.versionId)).toEqual(["v001", "v002", "v003", "v004"]);
    expect(graph.versions[1]?.parentVersionId).toBe("v001");
    expect(graph.versions[2]?.parentVersionId).toBe("v002");
    expect(graph.versions[3]?.parentVersionId).toBe("v003");
  });

  test("each snapshot materializes parent state + changes", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("space-1", { kind: "space" }) }]);
    const v3 = graph.versions[2];
    expect(v3?.nodes.map((n) => n.nodeId).sort()).toEqual(["space-1", "wall-1"]);
    // v2 keeps ONLY its own change set's node.
    expect(graph.versions[1]?.nodes.map((n) => n.nodeId)).toEqual(["wall-1"]);
  });

  test("earlier versions are byte-unchanged after later applies (in memory)", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    const v2Bytes = canonicalJsonStringify(graph.versions[1]);
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("space-1", { kind: "space" }) }]);
    graph = extend(graph, [
      { op: "delete", nodeId: "space-1", reason: "mis-detected duplicate" },
    ]);
    expect(canonicalJsonStringify(graph.versions[1])).toBe(v2Bytes);
  });

  test("upsert replaces the node in the new version; prior versions keep the old record", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    graph = extend(graph, [
      {
        op: "upsert-node",
        node: makeNode("wall-1", {
          properties: [makeProperty("height", 2.75, { unit: "m", epistemicStatus: "INFERRED" })],
        }),
      },
    ]);
    const v2Node = graph.versions[1]?.nodes[0];
    const v3Node = graph.versions[2]?.nodes[0];
    expect(v2Node?.properties[0]?.value).toBe(2.7);
    expect(v3Node?.properties[0]?.value).toBe(2.75);
  });

  test("changeLog preserves the exact caller records verbatim", () => {
    const changes = hierarchyChangeSet();
    const graph = extend(newGraph(), changes);
    const version = graph.versions[1];
    expect(version?.changeLog).toHaveLength(changes.length);
    expect(version?.changeLog).toEqual(changes);
  });

  test("materialized nodes and relationships are sorted by stable id", () => {
    const graph = extend(newGraph(), hierarchyChangeSet());
    const version = graph.versions[1];
    expect(version?.nodes.map((n) => n.nodeId)).toEqual([
      "bldg-1",
      "proj-1",
      "site-1",
      "space-1",
      "storey-1",
      "wall-1",
    ]);
    expect(version?.relationships.map((r) => r.relationshipId)).toEqual([
      "rel-bldg-storey",
      "rel-proj-site",
      "rel-site-bldg",
      "rel-space-wall",
      "rel-storey-space",
    ]);
  });

  test("identical change sequence → byte-identical version snapshots", () => {
    const run = (): GraphVersion =>
      extend(extend(newGraph(), hierarchyChangeSet()), [
        { op: "observe", observation: makeObservation("obs-1", "wall-1") },
      ]).versions[2] as GraphVersion;
    expect(canonicalJsonStringify(run())).toBe(canonicalJsonStringify(run()));
  });
});

describe("reality versioning: tombstones and identity", () => {
  test("deleted nodes are tombstoned, never removed from history", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode(), { op: "upsert-node", node: makeNode("space-1", { kind: "space" }) }]);
    graph = extend(graph, [{ op: "delete", nodeId: "space-1", reason: "duplicate space" }]);
    const v3 = graph.versions[2];
    expect(v3?.nodes.map((n) => n.nodeId)).toEqual(["wall-1"]);
    expect(v3?.tombstones).toEqual([{ nodeId: "space-1", reason: "duplicate space" }]);
    // v2 keeps the node verbatim.
    expect(graph.versions[1]?.nodes.map((n) => n.nodeId).sort()).toEqual(["space-1", "wall-1"]);
    expect(graph.versions[1]?.tombstones).toHaveLength(0);
  });

  test("re-upserting a tombstoned node revives it and clears the tombstone", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    graph = extend(graph, [{ op: "delete", nodeId: "wall-1", reason: "demolished" }]);
    graph = extend(graph, [wallNode("OBSERVED")]);
    const v4 = graph.versions[3];
    expect(v4?.nodes.map((n) => n.nodeId)).toEqual(["wall-1"]);
    expect(v4?.tombstones).toHaveLength(0);
  });

  test("deleting an unknown node is a typed rejection naming the id", () => {
    const error = captureError(() =>
      applyChanges(newGraph(), [{ op: "delete", nodeId: "ghost", reason: "x" }], meta()),
    );
    expect(error.code).toBe("delete_unknown_node");
    expect(error.detail).toContain("ghost");
  });

  test("double deletion within one change set is a typed rejection", () => {
    const error = captureError(() =>
      applyChanges(
        newGraph(),
        [
          wallNode(),
          { op: "delete", nodeId: "wall-1", reason: "a" },
          { op: "delete", nodeId: "wall-1", reason: "b" },
        ],
        meta(),
      ),
    );
    expect(error.code).toBe("delete_unknown_node");
  });
});

describe("reality versioning: typed units", () => {
  test("numeric property without a unit is a typed rejection naming node and property", () => {
    const bad: ChangeRecord = {
      op: "upsert-node",
      node: makeNode("wall-9", {
        properties: [{ key: "height", value: 2.7, epistemicStatus: "INFERRED", provenance: [makeProvenance()] }],
      }),
    };
    const error = captureError(() => applyChanges(newGraph(), [bad], meta()));
    expect(error.code).toBe("numeric_property_without_unit");
    expect(error.detail).toContain("wall-9");
    expect(error.detail).toContain("height");
  });

  test("mutation: adding the unit fixes the rejection (unit persists verbatim)", () => {
    const graph = extend(newGraph(), [
      {
        op: "upsert-node",
        node: makeNode("wall-9", {
          properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "INFERRED" })],
        }),
      },
    ]);
    const property = graph.versions[1]?.nodes[0]?.properties[0];
    expect(property?.value).toBe(2.7);
    expect(property?.unit).toBe("m");
  });

  test("a unit on a non-numeric value is a typed rejection", () => {
    const error = captureError(() =>
      applyChanges(
        newGraph(),
        [
          {
            op: "upsert-node",
            node: makeNode("wall-9", {
              properties: [
                { key: "material", value: "concrete", unit: "m", epistemicStatus: "INFERRED", provenance: [makeProvenance()] },
              ],
            }),
          },
        ],
        meta(),
      ),
    );
    expect(error.code).toBe("invalid_property");
  });
});

describe("reality versioning: provenance requirements", () => {
  test("node, property and relationship without provenance are typed rejections", () => {
    const noProv = captureError(() =>
      applyChanges(newGraph(), [{ op: "upsert-node", node: { ...makeNode("a"), provenance: [] } }], meta()),
    );
    expect(noProv.code).toBe("missing_provenance");

    const noPropProv = captureError(() =>
      applyChanges(
        newGraph(),
        [{
          op: "upsert-node",
          node: makeNode("b", {
            properties: [{ key: "height", value: 2.7, unit: "m", epistemicStatus: "INFERRED", provenance: [] }],
          }),
        }],
        meta(),
      ),
    );
    expect(noPropProv.code).toBe("missing_provenance");

    const noRelProv = captureError(() =>
      applyChanges(
        newGraph(),
        [{ op: "upsert-relationship", relationship: { ...makeRelationship("r", "a", "b"), provenance: [] } }],
        meta(),
      ),
    );
    expect(noRelProv.code).toBe("missing_provenance");
  });

  test("a provenance record naming no source is a typed rejection", () => {
    const error = captureError(() =>
      applyChanges(
        newGraph(),
        [{
          op: "upsert-node",
          node: makeNode("a", { provenance: [{ role: "SUPPORTS", recordedAt: FIXED_NOW }] }),
        }],
        meta(),
      ),
    );
    expect(error.code).toBe("invalid_provenance");
  });

  test("non-hex evidence ids are typed rejections (node provenance + observation)", () => {
    const nodeError = captureError(() =>
      applyChanges(
        newGraph(),
        [{
          op: "upsert-node",
          node: makeNode("a", { provenance: [makeProvenance({ evidenceId: "not-hex" })] }),
        }],
        meta(),
      ),
    );
    expect(nodeError.code).toBe("invalid_evidence_id");

    const obsError = captureError(() =>
      applyChanges(
        newGraph(),
        [{ op: "observe", observation: makeObservation("o", "a", { evidenceIds: ["short"] }) }],
        meta(),
      ),
    );
    expect(obsError.code).toBe("invalid_evidence_id");
  });

  test("provenance records persist verbatim with their evidence ids", () => {
    const provenance = [
      makeProvenance({ role: "DERIVED_FROM", evidenceId: evidenceIdOf("wall-fit") }),
      makeProvenance({ role: "CONTEXT", sourceArtifactId: "artifact-042", derivationNote: "session context" }),
    ];
    const graph = extend(newGraph(), [{
      op: "upsert-node",
      node: makeNode("wall-1", { provenance, properties: [makeProperty("height", 2.7, { provenance })] }),
    }]);
    const node = graph.versions[1]?.nodes[0];
    expect(node?.provenance).toEqual(provenance);
    expect(node?.properties[0]?.provenance).toEqual(provenance);
  });
});

describe("reality versioning: epistemic discipline", () => {
  test("CONFIRMED property downgraded to INFERRED in a later upsert is a typed rejection naming both", () => {
    let graph = newGraph();
    graph = extend(graph, [{
      op: "upsert-node",
      node: makeNode("wall-1", {
        properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "CONFIRMED" })],
      }),
    }]);
    const error = captureError(() =>
      applyChanges(
        graph,
        [{
          op: "upsert-node",
          node: makeNode("wall-1", {
            properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "INFERRED" })],
          }),
        }],
        meta(FIXED_EVEN_LATER),
      ),
    );
    expect(error.code).toBe("epistemic_downgrade");
    expect(error.detail).toContain("wall-1");
    expect(error.detail).toContain("height");
    expect(error.detail).toContain("CONFIRMED");
    expect(error.detail).toContain("INFERRED");
  });

  test("node-level CONFIRMED→INFERRED downgrade is a typed rejection", () => {
    let graph = newGraph();
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("space-1", { kind: "space", epistemicStatus: "CONFIRMED" }) }]);
    const error = captureError(() =>
      applyChanges(graph, [{ op: "upsert-node", node: makeNode("space-1", { kind: "space", epistemicStatus: "INFERRED" }) }], meta()),
    );
    expect(error.code).toBe("epistemic_downgrade");
    expect(error.detail).toContain("space-1");
  });

  test("OBSERVED→PROPOSED is a downgrade; INFERRED→CONFIRMED and equal-status upserts are allowed", () => {
    let graph = newGraph();
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("n", { epistemicStatus: "OBSERVED" }) }]);
    const rejected = captureError(() =>
      applyChanges(graph, [{ op: "upsert-node", node: makeNode("n", { epistemicStatus: "PROPOSED" }) }], meta()),
    );
    expect(rejected.code).toBe("epistemic_downgrade");
    // Upgrades and equal-rank upserts pass.
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("n", { epistemicStatus: "OBSERVED" }) }]);
    graph = extend(graph, [{ op: "upsert-node", node: makeNode("n", { epistemicStatus: "CONFIRMED" }) }]);
    expect(graph.versions[3]?.nodes[0]?.epistemicStatus).toBe("CONFIRMED");
  });

  test("downgrade within one change-set upsert chain is a typed rejection", () => {
    const error = captureError(() =>
      applyChanges(
        newGraph(),
        [
          { op: "upsert-node", node: makeNode("n", { epistemicStatus: "CONFIRMED" }) },
          { op: "upsert-node", node: makeNode("n", { epistemicStatus: "INFERRED" }) },
        ],
        meta(),
      ),
    );
    expect(error.code).toBe("epistemic_downgrade");
  });

  test("PROPOSED node with interventionRef is accepted and STAYS PROPOSED", () => {
    const graph = extend(newGraph(), [{
      op: "upsert-node",
      node: makeNode("wall-proposed", {
        epistemicStatus: "PROPOSED",
        interventionRef: { scenarioId: "scenario-7", stateId: "state-2" },
        properties: [makeProperty("height", 3.0, { unit: "m", epistemicStatus: "PROPOSED" })],
      }),
    }]);
    const node = graph.versions[1]?.nodes[0];
    expect(node?.epistemicStatus).toBe("PROPOSED");
    expect(node?.interventionRef).toEqual({ scenarioId: "scenario-7", stateId: "state-2" });
    expect(node?.properties[0]?.epistemicStatus).toBe("PROPOSED");
  });

  test("acquisitionRef persists verbatim on the node", () => {
    const graph = extend(newGraph(), [{
      op: "upsert-node",
      node: makeNode("wall-1", {
        epistemicStatus: "OBSERVED",
        acquisitionRef: { captureSessionId: "session-9", missionId: "mission-4" },
      }),
    }]);
    expect(graph.versions[1]?.nodes[0]?.acquisitionRef).toEqual({
      captureSessionId: "session-9",
      missionId: "mission-4",
    });
  });
});

describe("reality versioning: observations", () => {
  test("observations append and NEVER alter node state", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode("OBSERVED")]);
    const nodeBefore = canonicalJsonStringify(graph.versions[1]?.nodes[0]);
    graph = extend(graph, [{
      op: "observe",
      observation: makeObservation("obs-1", "wall-1", {
        properties: [makeProperty("height", 2.72, { unit: "m", epistemicStatus: "OBSERVED" })],
      }),
    }]);
    const v3 = graph.versions[2];
    expect(v3?.observations).toHaveLength(1);
    expect(v3?.observations[0]?.observationId).toBe("obs-1");
    // Node record in the new version is byte-identical: the observation is
    // only an INPUT to (potential) future version transitions.
    expect(canonicalJsonStringify(v3?.nodes[0])).toBe(nodeBefore);
  });

  test("observations accumulate across versions in append order", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    graph = extend(graph, [{ op: "observe", observation: makeObservation("obs-1", "wall-1") }]);
    graph = extend(graph, [{ op: "observe", observation: makeObservation("obs-2", "wall-1") }]);
    const v4 = graph.versions[3];
    expect(v4?.observations.map((o) => o.observationId)).toEqual(["obs-1", "obs-2"]);
  });

  test("observation properties not marked OBSERVED are typed rejections", () => {
    const error = captureError(() =>
      applyChanges(
        newGraph(),
        [{
          op: "observe",
          observation: makeObservation("obs-1", "wall-1", {
            properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "INFERRED" })],
          }),
        }],
        meta(),
      ),
    );
    expect(error.code).toBe("observation_property_not_observed");
  });

  test("duplicate observationId across versions is a typed rejection", () => {
    let graph = newGraph();
    graph = extend(graph, [wallNode()]);
    graph = extend(graph, [{ op: "observe", observation: makeObservation("obs-1", "wall-1") }]);
    const error = captureError(() =>
      applyChanges(graph, [{ op: "observe", observation: makeObservation("obs-1", "wall-1") }], meta()),
    );
    expect(error.code).toBe("duplicate_observation");
    expect(error.detail).toContain("obs-1");
  });
});

describe("reality versioning: referential integrity", () => {
  test("relationship to a missing node is a typed rejection naming the id", () => {
    const error = captureError(() =>
      applyChanges(
        newGraph(),
        [
          wallNode(),
          { op: "upsert-relationship", relationship: makeRelationship("rel-1", "wall-1", "space-ghost") },
        ],
        meta(),
      ),
    );
    expect(error.code).toBe("dangling_reference");
    expect(error.detail).toContain("space-ghost");
    expect(error.detail).toContain("rel-1");
  });

  test("relationship listed before its node in the SAME change set is accepted (final-state check)", () => {
    const graph = extend(newGraph(), [
      { op: "upsert-relationship", relationship: makeRelationship("rel-1", "space-1", "wall-1") },
      wallNode(),
      { op: "upsert-node", node: makeNode("space-1", { kind: "space" }) },
    ]);
    expect(graph.versions[1]?.relationships).toHaveLength(1);
  });

  test("deleting a node without deleting its relationships is a typed rejection", () => {
    let graph = newGraph();
    graph = extend(graph, [
      wallNode(),
      { op: "upsert-node", node: makeNode("space-1", { kind: "space" }) },
      { op: "upsert-relationship", relationship: makeRelationship("rel-1", "space-1", "wall-1") },
    ]);
    const error = captureError(() =>
      applyChanges(graph, [{ op: "delete", nodeId: "space-1", reason: "x" }], meta()),
    );
    expect(error.code).toBe("dangling_reference");
    expect(error.detail).toContain("space-1");
  });

  test("deleting a relationship explicitly is required and is itself guarded", () => {
    let graph = newGraph();
    graph = extend(graph, [
      wallNode(),
      { op: "upsert-node", node: makeNode("space-1", { kind: "space" }) },
      { op: "upsert-relationship", relationship: makeRelationship("rel-1", "space-1", "wall-1") },
    ]);
    graph = extend(graph, [
      { op: "delete", nodeId: "space-1", reason: "x" },
      { op: "delete-relationship", relationshipId: "rel-1", reason: "endpoint deleted" },
    ]);
    expect(graph.versions[2]?.relationships).toHaveLength(0);
    const error = captureError(() =>
      applyChanges(graph, [{ op: "delete-relationship", relationshipId: "rel-1", reason: "x" }], meta()),
    );
    expect(error.code).toBe("delete_unknown_relationship");
  });
});

describe("reality versioning: hierarchy smoke (R6)", () => {
  test("project → site → building → storey → space → element persists and reads back fully", () => {
    const graph = extend(newGraph(), hierarchyChangeSet());
    const version = graph.versions[1];
    expect(version?.nodes).toHaveLength(6);
    expect(version?.relationships).toHaveLength(5);
    const byId = new Map((version?.nodes ?? []).map((n) => [n.nodeId, n]));
    expect(byId.get("proj-1")?.kind).toBe("project");
    expect(byId.get("site-1")?.kind).toBe("site");
    expect(byId.get("bldg-1")?.kind).toBe("building");
    expect(byId.get("storey-1")?.kind).toBe("storey");
    expect(byId.get("space-1")?.kind).toBe("space");
    expect(byId.get("wall-1")?.kind).toBe("element");
    const contains = (version?.relationships ?? []).filter((r) => r.kind === "contains");
    expect(contains.map((r) => `${r.fromNodeId}>${r.toNodeId}`).sort()).toEqual([
      "bldg-1>storey-1",
      "proj-1>site-1",
      "site-1>bldg-1",
      "space-1>wall-1",
      "storey-1>space-1",
    ]);
    // Every relationship carries provenance (lock invariant).
    for (const relationship of version?.relationships ?? []) {
      expect(relationship.provenance.length).toBeGreaterThan(0);
    }
  });
});
