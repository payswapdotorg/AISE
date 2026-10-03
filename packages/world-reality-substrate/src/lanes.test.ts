/**
 * WORLD-P0-A tests — the five lane DOUBLES' boundary behavior: closed
 * request envelopes (unknown fields refused with the field named),
 * per-lane determinism (byte-identical artifacts), opaque-handle
 * quarantine on every artifact, and the closed five-kind failure
 * vocabulary exercised across the lane family (each kind at least once,
 * with the refusal naming the offender).
 */

import { describe, expect, test } from "bun:test";
import type { AssimpArtifact } from "./lanes";
import {
  assimpLaneSubject,
  babylonLaneSubject,
  canonicalPlyAscii,
  canonicalStlAscii,
  cesiumLaneSubject,
  gltfLaneSubject,
  REALITY_LANE_SUBJECTS,
  sniffFormatFamily,
  usdLaneSubject,
} from "./lanes";
import { isSubstrateHandle } from "./identity";
import { isSubstrateFailureKind } from "./outcome";
import { buildCanonicalGlb, encodeGlb } from "./glb";

describe("closed request envelopes (the canonical-projection guard)", () => {
  test("babylon: an unknown request field is refused contract-mismatch with the field named", () => {
    const request = babylonLaneSubject.canonicalRequest() as Record<string, unknown>;
    const poisoned = { ...request, bogusField: 1 };
    const outcome = babylonLaneSubject.submit(poisoned);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.path).toBe("babylon.request.bogusField");
    expect(outcome.failure.detail).toContain("bogusField");
  });

  test("cesium: an unknown operation field is refused with the field named", () => {
    const outcome = cesiumLaneSubject.submit({
      kind: "geospatial-ops",
      operations: [{ kind: "to-ecef", lat: 0, lon: 0, height: 0, bogus: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.path).toContain("bogus");
  });

  test("usd: an unknown request field is refused with the field named", () => {
    const outcome = usdLaneSubject.submit({
      kind: "compose",
      stack: [],
      spec: { path: "/A" },
      loadPayloads: false,
      bogus: true,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.path).toBe("usd.request.bogus");
  });

  test("gltf: an unknown request field is refused with the field named", () => {
    const outcome = gltfLaneSubject.submit({
      kind: "deliver",
      format: "glb",
      bytes: [1, 2, 3],
      bogus: true,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.path).toBe("gltf.request.bogus");
  });

  test("gltf: a non-glb delivery format is refused unsupported-format", () => {
    const outcome = gltfLaneSubject.submit({ kind: "deliver", format: "gltf-json", bytes: [] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("unsupported-format");
    expect(outcome.failure.detail).toContain("not delivered by this lane");
  });

  test("assimp: an unknown request field is refused with the field named", () => {
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "stl-ascii",
      text: canonicalStlAscii(),
      sourceFrame: { handedness: "right", up: "z", unit: "millimeter" },
      bogus: 1,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.path).toBe("assimp.request.bogus");
  });

  test("assimp: a family outside the declared ingest set is refused unsupported-format", () => {
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "fbx-binary",
      text: "x",
      sourceFrame: { handedness: "right", up: "z", unit: "millimeter" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("unsupported-format");
    expect(outcome.failure.detail).toContain("declared ingest set");
  });
});

describe("per-lane determinism and artifact shape", () => {
  for (const subject of REALITY_LANE_SUBJECTS) {
    test(`${subject.contract.lane}: two submissions of the canonical request produce identical artifacts`, () => {
      const first = subject.submit(subject.canonicalRequest());
      const second = subject.submit(subject.canonicalRequest());
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(JSON.stringify(first.value)).toBe(JSON.stringify(second.value));
    });

    test(`${subject.contract.lane}: the artifact is addressed by an opaque lane handle with provenance`, () => {
      const outcome = subject.submit(subject.canonicalRequest());
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        return;
      }
      const artifact = outcome.value;
      expect(isSubstrateHandle(artifact.handle)).toBe(true);
      expect(artifact.handle.startsWith(`substrate:${subject.contract.lane}:`)).toBe(true);
      expect(artifact.provenance.lane).toBe(subject.contract.lane);
      expect(artifact.provenance.substrateName).toBe(subject.contract.substrateName);
      expect(artifact.provenance.inputDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.provenance.contractDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(artifact).includes("aise:")).toBe(false);
    });
  }
});

describe("the closed five-kind vocabulary across the lane family", () => {
  const observedKinds = new Set<string>();

  function record(outcome: { ok: boolean; failure?: { kind: string } }): void {
    if (!outcome.ok && outcome.failure !== undefined) {
      expect(isSubstrateFailureKind(outcome.failure.kind)).toBe(true);
      observedKinds.add(outcome.failure.kind);
    }
  }

  test("each kind is exercised by at least one lane refusal", () => {
    // malformed-input: a cyclic babylon scene graph.
    record(
      babylonLaneSubject.submit({
        kind: "instantiate",
        nodes: [
          { id: "a", parentId: "b" },
          { id: "b", parentId: "a" },
        ],
      }),
    );
    // contract-mismatch: an unknown field.
    record(
      babylonLaneSubject.submit({
        kind: "instantiate",
        nodes: [{ id: "a" }],
        bogus: 1,
      }),
    );
    // unsupported-format: a non-glb format.
    record(gltfLaneSubject.submit({ kind: "deliver", format: "obj", bytes: [] }));
    // capability-unavailable: a required glTF extension this build lacks.
    record(
      gltfLaneSubject.submit({
        kind: "deliver",
        format: "glb",
        bytes: Array.from(
          encodeGlb(
            {
              asset: { version: "2.0" },
              extensionsRequired: ["KHR_draco_mesh_compression"],
              meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
              accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3" }],
              bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }],
              buffers: [{ byteLength: 12 }],
            },
            new Uint8Array(12),
          ),
        ),
        extract: true,
      }),
    );
    // resource-limit-exceeded: over the declared GLB byte ceiling.
    record(
      gltfLaneSubject.submit({
        kind: "deliver",
        format: "glb",
        bytes: new Array<number>(67_108_865).fill(0),
        extract: false,
      }),
    );

    expect([...observedKinds].sort()).toEqual([
      "capability-unavailable",
      "contract-mismatch",
      "malformed-input",
      "resource-limit-exceeded",
      "unsupported-format",
    ]);
  });
});

describe("the assimp ingest parsers and magic sniffing", () => {
  test("the canonical STL tetrahedron ingests to 4 facets / 12 vertex slots", () => {
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "stl-ascii",
      text: canonicalStlAscii(),
      sourceFrame: { handedness: "right", up: "z", unit: "millimeter" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const artifact = outcome.value as AssimpArtifact;
    expect(artifact.triangleCount).toBe(4);
    expect(artifact.vertexCount).toBe(12);
    expect(artifact.canonicalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.sourceFrame).toEqual({
      handedness: "right",
      up: "z",
      unit: "millimeter",
    });
  });

  test("the canonical PLY quad ingests to 4 vertices / 2 triangles", () => {
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "ply-ascii",
      text: canonicalPlyAscii(),
      sourceFrame: { handedness: "right", up: "y", unit: "meter" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const artifact = outcome.value as AssimpArtifact;
    expect(artifact.triangleCount).toBe(2);
    expect(artifact.vertexCount).toBe(4);
  });

  test("STL with a broken facet structure is refused malformed-input", () => {
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "stl-ascii",
      text: "solid broken\nfacet normal 0 0 0\n  oops\nendsolid broken\n",
      sourceFrame: { handedness: "right", up: "z", unit: "millimeter" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("malformed-input");
    expect(outcome.failure.path).toContain("stl.line");
  });

  test("PLY with a quad face is refused (triangles-only declared subset, no silent triangulation)", () => {
    const ply = canonicalPlyAscii().replace("3 0 2 3", "4 0 1 2 3");
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "ply-ascii",
      text: ply,
      sourceFrame: { handedness: "right", up: "y", unit: "meter" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("malformed-input");
    expect(outcome.failure.detail).toContain("TRIANGLES");
  });

  test("a PLY face index addressing a nonexistent vertex is refused", () => {
    const ply = canonicalPlyAscii().replace("3 0 1 2", "3 0 1 9");
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "ply-ascii",
      text: ply,
      sourceFrame: { handedness: "right", up: "y", unit: "meter" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.detail).toContain("addresses vertex");
  });

  test("magic sniffing: GLB, PLY, STL ambiguity, FBX, XML ambiguity, unknown", () => {
    expect(sniffFormatFamily(buildCanonicalGlb()).family).toBe("glb");
    expect(sniffFormatFamily(new TextEncoder().encode("ply\nformat ascii 1.0")).family).toBe("ply");
    const stl = sniffFormatFamily(new TextEncoder().encode(canonicalStlAscii()));
    expect(stl.family).toBe("stl-ascii-or-binary-header");
    expect(stl.basis).toContain("AMBIGUOUS");
    expect(sniffFormatFamily(new TextEncoder().encode("Kaydara FBX Binary  \u0000\u001a\u0000")).family).toBe("fbx-binary");
    expect(sniffFormatFamily(new TextEncoder().encode("<?xml version='1.0'?>")).family).toBe("xml-family");
    expect(sniffFormatFamily(new Uint8Array([1, 2, 3, 4])).family).toBe("unknown");
  });

  test("the frame policy records passthrough (no silent unit conversion)", () => {
    const outcome = assimpLaneSubject.submit({
      kind: "ingest",
      family: "stl-ascii",
      text: canonicalStlAscii(),
      sourceFrame: { handedness: "left", up: "z", unit: "centimeter" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const artifact = outcome.value as AssimpArtifact;
    expect(artifact.framePolicy).toContain("no silent conversion");
    expect(artifact.sourceFrame.unit).toBe("centimeter");
  });
});

describe("the cesium lane's geodesic convergence refusal", () => {
  test("a near-antipodal geodesic op refuses the WHOLE request capability-unavailable (NOT-DERIVABLE)", () => {
    const outcome = cesiumLaneSubject.submit({
      kind: "geospatial-ops",
      operations: [
        { kind: "to-ecef", lat: 0, lon: 0, height: 0 },
        { kind: "geodesic", from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 179.999 } },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("capability-unavailable");
    expect(outcome.failure.detail).toContain("NOT-DERIVABLE");
    expect(outcome.failure.detail).toContain("iteration budget");
  });

  test("an out-of-range latitude is refused malformed-input", () => {
    const outcome = cesiumLaneSubject.submit({
      kind: "geospatial-ops",
      operations: [{ kind: "to-ecef", lat: 91, lon: 0, height: 0 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("malformed-input");
    expect(outcome.failure.path).toContain("lat");
  });
});
