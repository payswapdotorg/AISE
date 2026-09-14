/**
 * Depth/LiDAR fusion adapter tests (AISE-012): deterministic depth-map →
 * point-cloud conversion with per-point provenance, explicit invalid-payload
 * failures naming the evidence id, descriptor honesty (READY local
 * computation, no third-party constraints) and byte determinism.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { contentIdOf, makeRequest } from "../../testkit";
import { DepthLidarFusionAdapter } from "./adapter";
import { DeterministicDepthFusionBackend, parseDepthMapPoints } from "./backend";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const DEPTH_ID = contentIdOf("depth-frame-1");
const DEPTH_ID_2 = contentIdOf("depth-frame-2");

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function depthRequest(evidenceContentIds: readonly string[]): ReturnType<typeof makeRequest> {
  return makeRequest({
    evidenceContentIds: [...evidenceContentIds],
    requestedRepresentations: ["point_cloud"],
    declaredInputModalities: ["depth_map"],
  });
}

function readerOver(
  entries: Record<string, Uint8Array | null>,
): { read: (contentId: string) => Promise<Uint8Array | null> } {
  return {
    read: async (contentId) => entries[contentId] ?? null,
  };
}

const THREE_POINT_PAYLOAD = "0 0 0\n1 2 3\n# one comment\n\n-1.5 0.25 2\r\n";

/* ------------------------------------------------------------------ */
/* Depth-map exchange format                                            */
/* ------------------------------------------------------------------ */

describe("depth-map exchange format v1 parsing", () => {
  test("rows of 'x y z' with comments, blank lines and CRLF tolerance", () => {
    expect(parseDepthMapPoints(encode(THREE_POINT_PAYLOAD))).toEqual([
      [0, 0, 0],
      [1, 2, 3],
      [-1.5, 0.25, 2],
    ]);
  });

  test("malformed payloads are rejected (null)", () => {
    expect(parseDepthMapPoints(encode("0 0 x"))).toBeNull();
    expect(parseDepthMapPoints(encode("1 2"))).toBeNull();
    expect(parseDepthMapPoints(encode("1 2 3 4"))).toBeNull();
    expect(parseDepthMapPoints(encode("nan 0 0"))).toBeNull();
  });

  test("an empty (comment-only) payload is valid and yields zero points", () => {
    expect(parseDepthMapPoints(encode("# nothing\n\n"))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Adapter                                                              */
/* ------------------------------------------------------------------ */

describe("DepthLidarFusionAdapter: point-cloud fusion with per-point provenance", () => {
  test("a 3-point depth-map evidence payload → one point-cloud artifact with per-point source ids", async () => {
    const adapter = new DepthLidarFusionAdapter({
      evidenceReader: readerOver({ [DEPTH_ID]: encode(THREE_POINT_PAYLOAD) }),
    });
    const outcome = await adapter.execute(depthRequest([DEPTH_ID]));
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    expect(outcome.artifacts.length).toBe(1);
    const artifact = outcome.artifacts[0]!;
    expect(artifact.representationType).toBe("point_cloud");
    expect(artifact.sourceEvidenceIds).toEqual([DEPTH_ID]);
    expect(artifact.parameters).toEqual({
      points: [
        [0, 0, 0, DEPTH_ID],
        [1, 2, 3, DEPTH_ID],
        [-1.5, 0.25, 2, DEPTH_ID],
      ],
    });
    expect(artifact.regions?.[0]?.epistemicLabel).toBe("RECONSTRUCTED_FROM_OBSERVED_EVIDENCE");
    expect(artifact.regions?.[0]?.epistemicLabel).not.toBe("DIRECTLY_OBSERVED");
    expect(artifact.coordinateFrame).toBe("y-up-metric");
    expect(artifact.scaleDeclaration).toBe("metric-meters");
    expect(artifact.modelIdentity).toBe("aise-depth-lidar-fusion@1.0.0");
    expect(artifact.parameterDigest).toMatch(/^[0-9a-f]{64}$/);
    const diagnostics = artifact.qualityDiagnostics as {
      execution: { backend: string };
      perFramePointCounts: { evidenceContentId: string; pointCount: number }[];
      totalPointCount: number;
    };
    expect(diagnostics.execution.backend).toBe("deterministic-depth-fusion");
    expect(diagnostics.perFramePointCounts).toEqual([
      { evidenceContentId: DEPTH_ID, pointCount: 3 },
    ]);
    expect(diagnostics.totalPointCount).toBe(3);
  });

  test("multi-frame fusion: per-point provenance and exactly-consumed source evidence ids", async () => {
    const adapter = new DepthLidarFusionAdapter({
      evidenceReader: readerOver({
        [DEPTH_ID]: encode("0 0 0\n1 1 1"),
        [DEPTH_ID_2]: encode("# empty payload — zero points"),
      }),
    });
    const outcome = await adapter.execute(depthRequest([DEPTH_ID, DEPTH_ID_2]));
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const artifact = outcome.artifacts[0]!;
    expect(artifact.parameters).toEqual({
      points: [
        [0, 0, 0, DEPTH_ID],
        [1, 1, 1, DEPTH_ID],
      ],
    });
    // The zero-point frame was NOT consumed: lineage is exact.
    expect(artifact.sourceEvidenceIds).toEqual([DEPTH_ID]);
  });

  test("camera poses are converted and recorded verbatim as transforms", async () => {
    const adapter = new DepthLidarFusionAdapter({
      evidenceReader: readerOver({ [DEPTH_ID]: encode("0 0 0") }),
      cameraPoses: [
        {
          position: [1000, -2000, 3000],
          rotation: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          unit: "millimeter",
        },
      ],
    });
    const outcome = await adapter.execute(depthRequest([DEPTH_ID]));
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const transform = outcome.artifacts[0]?.transforms?.[0];
    expect(transform?.kind).toBe("camera-pose-y-up-metric");
    expect(transform?.parameters.position).toEqual([1, -2, 3]);
    expect(transform?.parameters.rotation).toEqual([
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ]);
  });
});

describe("DepthLidarFusionAdapter: failure semantics", () => {
  test("an invalid depth-map payload → INPUT_INCOMPATIBLE naming the evidence id", async () => {
    const adapter = new DepthLidarFusionAdapter({
      evidenceReader: readerOver({
        [DEPTH_ID]: encode("0 0 0"),
        [DEPTH_ID_2]: encode("not a depth map"),
      }),
    });
    const outcome = await adapter.execute(depthRequest([DEPTH_ID, DEPTH_ID_2]));
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
      expect(outcome.detail).toContain(DEPTH_ID_2);
      expect(outcome.missingEvidenceIds).toEqual([DEPTH_ID_2]);
    }
  });

  test("evidence bytes that cannot be read → INPUT_INCOMPATIBLE naming the id", async () => {
    const adapter = new DepthLidarFusionAdapter({
      evidenceReader: readerOver({ [DEPTH_ID]: encode("0 0 0"), [DEPTH_ID_2]: null }),
    });
    const outcome = await adapter.execute(depthRequest([DEPTH_ID, DEPTH_ID_2]));
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
      expect(outcome.detail).toContain(DEPTH_ID_2);
    }
  });

  test("no evidence bytes reader wired → INPUT_INCOMPATIBLE naming all evidence ids", async () => {
    const adapter = new DepthLidarFusionAdapter();
    const outcome = await adapter.execute(depthRequest([DEPTH_ID]));
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
      expect(outcome.detail).toContain(DEPTH_ID);
      expect(outcome.missingEvidenceIds).toEqual([DEPTH_ID]);
    }
  });
});

describe("DepthLidarFusionAdapter: descriptor honesty", () => {
  test("READY local deterministic computation with no third-party constraints", () => {
    const adapter = new DepthLidarFusionAdapter();
    expect(adapter.descriptor.providerId).toBe("depth-lidar-fusion");
    expect(adapter.descriptor.availability).toBe("READY");
    expect(adapter.descriptor.supportedInputModalities).toEqual(["depth_map", "camera_poses"]);
    expect(adapter.descriptor.supportedOutputModalities).toEqual(["point_cloud"]);
    expect(adapter.descriptor.executionRequirements?.gpu).toBe("false");
    expect(adapter.descriptor.licenseTerms?.gatedWeights).toBe("false");
    expect(adapter.descriptor.licenseTerms?.name).toBe("AISE-internal");
  });

  test("a custom backend can be swapped in (seam swappability)", async () => {
    const custom = {
      backendId: "custom-fusion",
      invoke: async () => ({
        ok: true as const,
        points: [
          { x: 7, y: 8, z: 9, sourceEvidenceId: DEPTH_ID },
        ],
        perFramePointCounts: [{ evidenceContentId: DEPTH_ID, pointCount: 1 }],
        executionEnvironment: {
          backend: "custom-fusion",
          engineId: "custom",
          engineVersion: "1.2.3",
          hardware: null,
        },
      }),
    };
    const adapter = new DepthLidarFusionAdapter({
      backend: custom,
      evidenceReader: readerOver({ [DEPTH_ID]: encode("0 0 0") }),
    });
    const outcome = await adapter.execute(depthRequest([DEPTH_ID]));
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const artifact = outcome.artifacts[0]!;
    expect((artifact.qualityDiagnostics as { execution: { backend: string } }).execution.backend).toBe(
      "custom-fusion",
    );
  });
});

describe("DepthLidarFusionAdapter: determinism", () => {
  test("identical evidence bytes → byte-identical outcomes", async () => {
    const run = async (): Promise<string> => {
      const adapter = new DepthLidarFusionAdapter({
        evidenceReader: readerOver({ [DEPTH_ID]: encode(THREE_POINT_PAYLOAD) }),
      });
      return canonicalJsonStringify(await adapter.execute(depthRequest([DEPTH_ID])));
    };
    expect(await run()).toBe(await run());
  });
});

describe("DeterministicDepthFusionBackend (direct seam)", () => {
  test("bytes missing for a frame → INPUT_INCOMPATIBLE naming the evidence id", async () => {
    const backend = new DeterministicDepthFusionBackend();
    const outcome = await backend.invoke({
      frames: [{ evidenceContentId: DEPTH_ID, bytes: null }],
      cameraPoses: [],
      coordinateFrame: "y-up-metric",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
      expect(outcome.detail).toContain(DEPTH_ID);
      expect(outcome.invalidEvidenceIds).toEqual([DEPTH_ID]);
    }
  });
});
