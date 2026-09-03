/**
 * Reality-model store tests: the versioned, append-only,
 * boundary-validating persistence — the AISE-008 lesson applied to
 * the canonical model (the store does not trust the caller).
 */
import { describe, expect, it } from "vitest";
import {
  modelProvenance,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { RealityModelError } from "./errors.js";
import { ingestArchitecturalScene } from "./ingest.js";
import { createInMemoryRealityModelStore } from "./store.js";

const MODEL = "model-store";
const PROJECT = "project-store";
const SPACE = "room-store";

const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };

const FIRST_TICK = "2026-01-01T00:00:01Z";
let clock = 0;
function makeStore() {
  clock = 0;
  return createInMemoryRealityModelStore({
    now: () => {
      clock += 1;
      return `2026-01-01T00:00:${String(clock).padStart(2, "0")}Z`;
    },
  });
}

const producer = () =>
  modelProvenance("model/version-commit-v1", { sceneId: scene.sceneId }, [
    { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState },
  ]);

function committedGraph(): RealityModelGraph {
  return ingestArchitecturalScene(scene, target).graph;
}

describe("createModel", () => {
  it("creates a model and reports identical re-registration", () => {
    const store = makeStore();
    expect(store.createModel({ modelId: MODEL, projectId: PROJECT })).toEqual({ status: "created" });
    expect(store.createModel({ modelId: MODEL, projectId: PROJECT })).toEqual({
      status: "exists_identical",
    });
  });

  it("reports a conflict when the model id is bound to another project", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    expect(store.createModel({ modelId: MODEL, projectId: "project-other" })).toEqual({
      status: "exists_conflict",
    });
  });

  it("rejects invalid identities (fail closed)", () => {
    const store = makeStore();
    expect(() => store.createModel({ modelId: "", projectId: PROJECT })).toThrow(RealityModelError);
    expect(() => store.createModel({ modelId: MODEL, projectId: "" })).toThrow(RealityModelError);
  });
});

describe("commitModelVersion", () => {
  it("commits version 1 with parent absent and store-assigned metadata", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const result = store.commitModelVersion(MODEL, committedGraph(), producer());
    expect(result.status).toBe("committed");
    expect(result.version).toBe(1);
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);

    const current = store.getCurrentVersion(MODEL)!;
    expect(current.record.parentVersion).toBeUndefined();
    expect(current.record.objectCount).toBe(scene.objects.length);
    expect(current.record.spaceCount).toBe(1);
    expect(current.record.relationshipCount).toBe(scene.objects.length + 2);
    expect(current.record.committedAt).toBe("2026-01-01T00:00:01Z");
  });

  it("appends a new version with the previous head as parent (linear history)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    store.commitModelVersion(MODEL, committedGraph(), producer());

    // Different content: ingest into a different target space.
    const changed = ingestArchitecturalScene(scene, { ...target, spaceId: "room-other" }).graph;
    const result = store.commitModelVersion(MODEL, changed, producer());
    expect(result.status).toBe("committed");
    expect(result.version).toBe(2);

    const current = store.getCurrentVersion(MODEL)!;
    expect(current.record.parentVersion).toBe(1);
  });

  it("treats identical content as already_present (digest idempotency)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const first = store.commitModelVersion(MODEL, committedGraph(), producer());
    const second = store.commitModelVersion(MODEL, committedGraph(), producer());
    expect(second.status).toBe("already_present");
    expect(second.version).toBe(first.version);
    expect(store.listVersions(MODEL)).toHaveLength(1);
  });

  it("keeps prior versions discoverable and immutable (append-only history)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const graphV1 = committedGraph();
    store.commitModelVersion(MODEL, graphV1, producer());
    const changed = ingestArchitecturalScene(scene, { ...target, spaceId: "room-other" }).graph;
    store.commitModelVersion(MODEL, changed, producer());

    const versions = store.listVersions(MODEL);
    expect(versions.map((record) => record.version)).toEqual([1, 2]);

    const v1 = store.getVersion(MODEL, 1)!;
    expect(v1.graph.digest).toBe(graphV1.digest);
    // The prior version's graph content survives re-commit untouched.
    expect(store.getCurrentVersion(MODEL)!.graph.digest).not.toBe(v1.graph.digest);
  });

  it("never mutates a committed graph (frozen by construction)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const graph = committedGraph();
    store.commitModelVersion(MODEL, graph, producer());
    expect(() => {
      (graph.objects as unknown as unknown[]).pop();
    }).toThrow(TypeError);
  });

  it("rejects graphs of unregistered models", () => {
    const store = makeStore();
    expect(() => store.commitModelVersion("model-missing", committedGraph(), producer())).toThrow(
      RealityModelError,
    );
  });

  it("rejects a graph bound to a different model (MODEL_MISMATCH)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    store.createModel({ modelId: "model-other", projectId: PROJECT });
    const foreignGraph = ingestArchitecturalScene(scene, {
      ...target,
      modelId: "model-other",
    }).graph;
    expect(() => store.commitModelVersion(MODEL, foreignGraph, producer())).toThrow(RealityModelError);
  });

  it("rejects invalid producer provenance", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    // Corrupt a VALID producer after construction: the store must
    // re-validate at the boundary, not trust a well-typed caller.
    const valid = producer();
    const badProducer = {
      ...valid,
      inputs: [{ ...(valid.inputs[0] as object), contentHash: "not-a-hash" }],
    } as unknown as typeof valid;
    expect(() => store.commitModelVersion(MODEL, committedGraph(), badProducer)).toThrow(
      RealityModelError,
    );
    expect(store.listVersions(MODEL)).toHaveLength(0);
  });
});

describe("the persistence boundary does not trust the caller", () => {
  it("rejects a tampered digest AND stores nothing", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const graph = committedGraph();
    const tampered = {
      ...graph,
      digest: "0".repeat(64),
    } as RealityModelGraph;
    expect(() => store.commitModelVersion(MODEL, tampered, producer())).toThrow(RealityModelError);
    expect(store.listVersions(MODEL)).toHaveLength(0);
    expect(store.getCurrentVersion(MODEL)).toBeUndefined();
  });

  it("rejects a graph with content mutated after assembly (digest drift)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const graph = committedGraph();
    const mutated = {
      ...graph,
      objects: [
        ...graph.objects.slice(0, -1),
        { ...graph.objects[graph.objects.length - 1]!, contentHash: "e".repeat(64) },
      ],
    } as unknown as RealityModelGraph;
    expect(() => store.commitModelVersion(MODEL, mutated, producer())).toThrow(RealityModelError);
    expect(store.listVersions(MODEL)).toHaveLength(0);
  });

  it("rejects a hand-forged graph with dangling references", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const graph = committedGraph();
    const forged = {
      ...graph,
      relationships: [
        ...graph.relationships,
        { relationId: "rel-forged", type: "CONTAINS", fromId: SPACE, toId: "ro-ghost" },
      ],
    } as unknown as RealityModelGraph;
    expect(() => store.commitModelVersion(MODEL, forged, producer())).toThrow(RealityModelError);
    expect(store.listVersions(MODEL)).toHaveLength(0);
  });

  it("rejects a thawed (non-frozen) graph claiming to be assembled", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const graph = committedGraph();
    const thawed = {
      ...graph,
      spaces: graph.spaces.map((space) => ({ ...space })),
      objects: graph.objects.map((object) => ({ ...object })),
    } as RealityModelGraph;
    expect(() => store.commitModelVersion(MODEL, thawed, producer())).toThrow(RealityModelError);
    expect(store.listVersions(MODEL)).toHaveLength(0);
  });

  it("boundary failure leaves prior versions untouched", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    const good = store.commitModelVersion(MODEL, committedGraph(), producer());
    const tampered = { ...committedGraph(), digest: "0".repeat(64) } as RealityModelGraph;
    expect(() => store.commitModelVersion(MODEL, tampered, producer())).toThrow(RealityModelError);
    expect(store.listVersions(MODEL)).toHaveLength(1);
    expect(store.getCurrentVersion(MODEL)!.record.version).toBe(good.version);
  });
});

describe("read operations", () => {
  it("returns undefined for unknown models and versions", () => {
    const store = makeStore();
    expect(store.getCurrentVersion("model-missing")).toBeUndefined();
    expect(store.getVersion("model-missing", 1)).toBeUndefined();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    expect(store.getCurrentVersion(MODEL)).toBeUndefined();
    expect(store.getVersion(MODEL, 42)).toBeUndefined();
  });

  it("rejects invalid version numbers (fail closed)", () => {
    const store = makeStore();
    store.createModel({ modelId: MODEL, projectId: PROJECT });
    expect(() => store.getVersion(MODEL, 0)).toThrow(RealityModelError);
    expect(() => store.getVersion(MODEL, 1.5)).toThrow(RealityModelError);
  });

  it("now() is injectable (deterministic tests)", () => {
    const store = makeStore();
    expect(store.now()).toBe(FIRST_TICK);
  });
});
