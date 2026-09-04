import { describe, expect, it } from "vitest";
import { ModelQaError } from "./errors.js";
import { validateQaInput } from "./boundary.js";
import { handBuiltGraph, smallMapping, smallRoomGraph, confirmedRoomHeight } from "./testing.js";
import { propertyAssertion } from "@aise/engineering-model";
import type { ReadinessContextInput } from "./inputs.js";

const graph = smallRoomGraph();
const PROFILE = "CRITICAL" as const;

describe("the QA boundary (fail closed, never trusts the caller)", () => {
  it("accepts a valid constructor-built graph", () => {
    const verified = validateQaInput({ graph, version: 1, profile: PROFILE });
    expect(verified.hasMapping).toBe(false);
    expect(verified.graph).toBe(graph);
  });

  it("rejects an absent graph", () => {
    expect(() => validateQaInput({ graph: undefined as never, version: 1, profile: PROFILE })).toThrow(ModelQaError);
  });

  it("rejects an unknown assurance profile", () => {
    expect(() => validateQaInput({ graph, version: 1, profile: "ULTRA" as never })).toThrowError(
      expect.objectContaining({ code: "QA_INPUT_INVALID" }),
    );
  });

  it("rejects non-integer or non-positive versions", () => {
    for (const version of [0, -1, 1.5, Number.NaN]) {
      expect(() => validateQaInput({ graph, version, profile: PROFILE })).toThrow(ModelQaError);
    }
  });

  it("rejects a thawed graph (immutability is load-bearing)", () => {
    const thawed = handBuiltGraph(graph, () => {});
    const shallow = { ...thawed };
    expect(() => validateQaInput({ graph: shallow as never, version: 1, profile: PROFILE })).toThrow();
  });

  it("rejects a tampered graph digest (content changed, digest not recomputed)", () => {
    const tampered = handBuiltGraph(
      graph,
      (draft) => {
        const object = draft.objects[0]!;
        object.contentHash = "f".repeat(64); // format-valid, content-wrong
      },
      { recomputeDigest: false },
    );
    expect(() => validateQaInput({ graph: tampered, version: 1, profile: PROFILE })).toThrowError(
      expect.objectContaining({ code: "GRAPH_INVALID" }),
    );
  });

  it("rejects a duplicate relationship (boundary rejects what the model validator rejects)", () => {
    const duplicated = handBuiltGraph(graph, (draft) => {
      const rel = draft.relationships[0]!;
      draft.relationships.push({ ...rel, relationId: `${rel.relationId}x` });
    });
    expect(() => validateQaInput({ graph: duplicated, version: 1, profile: PROFILE })).toThrowError(
      expect.objectContaining({ code: "GRAPH_INVALID" }),
    );
  });

  it("rejects a broken relationship endpoint", () => {
    const broken = handBuiltGraph(graph, (draft) => {
      const rel = draft.relationships[0]!;
      rel.toId = "ro-does-not-exist";
    });
    expect(() => validateQaInput({ graph: broken, version: 1, profile: PROFILE })).toThrowError(
      expect.objectContaining({ code: "GRAPH_INVALID" }),
    );
  });

  it("rejects an orphan object (contained by no space)", () => {
    const orphan = handBuiltGraph(graph, (draft) => {
      draft.relationships = draft.relationships.filter(
        (rel) => rel.type !== "CONTAINS" || rel.toId !== (draft.objects[0]! as { objectId: string }).objectId,
      );
    });
    expect(() => validateQaInput({ graph: orphan, version: 1, profile: PROFILE })).toThrow();
  });

  it("IMPORTANT LAYERING: degenerate (structurally invalid) geometry passes the boundary (it is a FINDING, not an input error)", () => {
    const degenerate = handBuiltGraph(graph, (draft) => {
      const geometry = (draft.objects[0]! as { geometry: { structured: { rectangle: { uMin: number; uMax: number } } } }).geometry;
      geometry.structured.rectangle.uMax = geometry.structured.rectangle.uMin; // empty extents — finite, digest-pinnable
    });
    // digest re-derived; the boundary validates graph structure, not
    // geometry — QA's geometry checks own structural geometry validity.
    const verified = validateQaInput({ graph: degenerate, version: 1, profile: PROFILE });
    expect(verified.graph).toBe(degenerate);
  });

  it("rejects a mapping from a different project", () => {
    expect(() =>
      validateQaInput({ graph, version: 1, profile: PROFILE, mapping: smallMapping() }),
    ).not.toThrow(); // same project — sanity
    const otherProject = handBuiltGraph(graph, () => {});
    const foreignMapping = { ...smallMapping(), projectId: "project-other" } as never;
    expect(() =>
      validateQaInput({ graph: otherProject, version: 1, profile: PROFILE, mapping: foreignMapping }),
    ).toThrowError(expect.objectContaining({ code: "MAPPING_INVALID" }));
  });

  it("rejects a structurally invalid mapping", () => {
    const invalidMapping = { ...smallMapping(), records: "not-an-array" } as never;
    expect(() =>
      validateQaInput({ graph, version: 1, profile: PROFILE, mapping: invalidMapping }),
    ).toThrowError(expect.objectContaining({ code: "MAPPING_INVALID" }));
  });

  it("rejects structurally invalid readiness contexts", () => {
    const good: ReadinessContextInput = {
      taskId: "task-comply",
      verdict: "READY",
      assuranceProfile: "CRITICAL",
      modelId: "model-qa-test",
      version: 1,
      graphDigest: "a".repeat(64),
      mappingDigest: "b".repeat(64),
    };
    expect(validateQaInput({ graph, version: 1, profile: PROFILE, readiness: good }).hasReadiness).toBe(true);
    for (const mutation of [
      { ...good, taskId: "" },
      { ...good, verdict: "MAYBE" },
      { ...good, assuranceProfile: "ULTRA" },
      { ...good, modelId: "" },
      { ...good, version: 0 },
      { ...good, graphDigest: "not-a-hash" },
      { ...good, mappingDigest: "not-a-hash" },
    ]) {
      expect(() => validateQaInput({ graph, version: 1, profile: PROFILE, readiness: mutation as never })).toThrowError(
        expect.objectContaining({ code: "CONTEXT_INVALID" }),
      );
    }
  });

  it("preserves the evidence mapping and readiness references verbatim", () => {
    const mapping = smallMapping();
    const readiness: ReadinessContextInput = {
      taskId: "task-comply",
      verdict: "NOT_READY",
      assuranceProfile: "STANDARD",
      modelId: "model-qa-test",
      version: 1,
      graphDigest: graph.digest,
      mappingDigest: mapping.digest,
    };
    const verified = validateQaInput({ graph, version: 1, profile: PROFILE, mapping, readiness });
    expect(verified.mapping).toBe(mapping);
    expect(verified.readiness).toBe(readiness);
    expect(verified.hasMapping).toBe(true);
    expect(verified.hasReadiness).toBe(true);
  });

  it("hand-built graphs carry correct digests by construction", () => {
    const rebuilt = handBuiltGraph(graph, () => {});
    expect(rebuilt.digest).toBe(graph.digest);
  });
});

describe("boundary vs findings separation of duties (regression-critical)", () => {
  it("duplicate property keys per entity are boundary-rejected, not findings", () => {
    const duplicate = handBuiltGraph(graph, (draft) => {
      const object = draft.objects[0]! as { properties: unknown[] };
      object.properties = [propertyAssertion({ key: "fireRating", presence: "NOT_OBSERVED", status: "INFERRED" })];
    });
    // boundary still accepts single properties; duplicates are rejected:
    const withDuplicate = handBuiltGraph(graph, (draft) => {
      const object = draft.objects[0]! as { properties: unknown[] };
      const assertion = propertyAssertion({ key: "fireRating", presence: "NOT_OBSERVED", status: "INFERRED" });
      object.properties = [assertion, { ...assertion }];
    });
    expect(() => validateQaInput({ graph: duplicate, version: 1, profile: PROFILE })).not.toThrow();
    expect(() => validateQaInput({ graph: withDuplicate, version: 1, profile: PROFILE })).toThrow();
  });

  it("a valid new property survives the boundary", () => {
    const withProperty = smallRoomGraph({
      objectProperties: [confirmedRoomHeight()],
    });
    expect(() => validateQaInput({ graph: withProperty, version: 1, profile: PROFILE })).not.toThrow();
  });
});
