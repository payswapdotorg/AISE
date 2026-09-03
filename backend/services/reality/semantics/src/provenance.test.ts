/**
 * Extraction provenance tests (AISE-010).
 *
 * The fail-closed lineage gate: an object without complete
 * provenance is a bare shape, not an engineering record. Content
 * pinning: a provenance record identifies the exact input content.
 */
import { describe, expect, it } from "vitest";
import {
  SEMANTICS_SERVICE_ID,
  SEMANTICS_METHOD_VERSION,
  extractionProvenance,
  pointSetInputRef,
  provenanceContentHash,
  validateExtractionProvenance,
  type ExtractionProvenance,
} from "./provenance.js";
import { toSemanticsError } from "./errors.js";

const POINTS = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
];

const GOOD_INPUTS = [pointSetInputRef(POINTS, "INFERRED")];

describe("extractionProvenance (happy path)", () => {
  it("builds and returns a validated record", () => {
    const provenance = extractionProvenance("scene/assembly-v1", { a: 1, b: "x" }, GOOD_INPUTS);
    expect(provenance.serviceId).toBe(SEMANTICS_SERVICE_ID);
    expect(provenance.serviceId).toBe("aise.semantics");
    expect(provenance.method).toBe("scene/assembly-v1");
    expect(provenance.methodVersion).toBe(SEMANTICS_METHOD_VERSION);
    expect(provenance.parameters).toEqual({ a: 1, b: "x" });
    expect(provenance.inputs).toEqual(GOOD_INPUTS);
  });

  it("the happy-path record passes validateExtractionProvenance", () => {
    const provenance = extractionProvenance("segment/plane-ransac-seq-v1", { n: 1 }, GOOD_INPUTS);
    expect(() => validateExtractionProvenance(provenance)).not.toThrow();
  });
});

describe("validateExtractionProvenance (fail-closed gates)", () => {
  const base = (): ExtractionProvenance => ({
    serviceId: SEMANTICS_SERVICE_ID,
    method: "structure/wall-rectangle-v1",
    methodVersion: "1.0.0",
    parameters: { width: 2.5, tilt: 10 },
    inputs: [pointSetInputRef(POINTS, "INFERRED")],
  });

  it("rejects a foreign serviceId", () => {
    const error = capture(() =>
      validateExtractionProvenance({ ...base(), serviceId: "aise.other" }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
    expect(error?.details.field).toBe("serviceId");
  });

  it("rejects malformed method labels", () => {
    for (const method of ["", "UPPER", "has space", "no/slash then space", 7]) {
      const error = capture(() => validateExtractionProvenance({ ...base(), method: method as string }));
      expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
      expect(error?.details.field).toBe("method");
    }
  });

  it("accepts the method label vocabulary used across the package", () => {
    for (const method of [
      "segment/plane-ransac-seq-v1",
      "classify/horizontal-elevation-v1",
      "classify/wall-tilt-v1",
      "structure/wall-rectangle-v1",
      "opening/grid-gap-v1",
      "scene/assembly-v1",
    ]) {
      expect(() => validateExtractionProvenance({ ...base(), method })).not.toThrow();
    }
  });

  it("rejects non-semver method versions", () => {
    for (const version of ["1.0", "v1.0.0", "1.0.0.0", "", 2]) {
      const error = capture(() =>
        validateExtractionProvenance({ ...base(), methodVersion: version as string }),
      );
      expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
    }
  });

  it("rejects non-object parameters", () => {
    for (const parameters of [null, "x", 7, [1, 2]]) {
      const error = capture(() =>
        validateExtractionProvenance({ ...base(), parameters: parameters as unknown as Record<string, unknown> }),
      );
      expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
    }
  });

  it("rejects parameters that are not canonically serializable (non-finite numbers)", () => {
    const error = capture(() =>
      validateExtractionProvenance({ ...base(), parameters: { value: Number.NaN } }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
    expect(error?.details.field).toBe("parameters");
  });

  it("rejects empty input lineage", () => {
    const error = capture(() => validateExtractionProvenance({ ...base(), inputs: [] }));
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
    expect(error?.details.field).toBe("inputs");
  });

  it("rejects inputs without a 64-hex content hash", () => {
    const inputs = [{ kind: "point-set", pointCount: 3, contentHash: "abc", epistemic: "INFERRED" }];
    const error = capture(() =>
      validateExtractionProvenance({ ...base(), inputs: inputs as never }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });

  it("rejects inputs with an invalid epistemic tag", () => {
    const inputs = [pointSetInputRef(POINTS, "INFERRED" as never)];
    const error = capture(() =>
      validateExtractionProvenance({
        ...base(),
        inputs: [{ ...inputs[0], epistemic: "GUESSED" }] as never,
      }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });

  it("rejects point-set inputs with non-positive point counts", () => {
    const input = pointSetInputRef(POINTS, "INFERRED");
    const error = capture(() =>
      validateExtractionProvenance({ ...base(), inputs: [{ ...input, pointCount: 0 }] as never }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });

  it("rejects object inputs with malformed object ids", () => {
    const objectInput = {
      kind: "object",
      method: "classify/wall-tilt-v1",
      objectId: "roof-0123456789abcdef",
      contentHash: "0".repeat(64),
      epistemic: "INFERRED",
    };
    const error = capture(() =>
      validateExtractionProvenance({ ...base(), inputs: [objectInput] as never }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });

  it("accepts object inputs for every architectural kind prefix", () => {
    for (const objectId of [
      "wall-0123456789abcdef",
      "floor-0123456789abcdef",
      "ceiling-0123456789abcdef",
      "door-0123456789abcdef",
      "window-0123456789abcdef",
    ]) {
      const objectInput = {
        kind: "object",
        method: "classify/wall-tilt-v1",
        objectId,
        contentHash: "0".repeat(64),
        epistemic: "INFERRED",
      };
      expect(() =>
        validateExtractionProvenance({ ...base(), inputs: [objectInput] as never }),
      ).not.toThrow();
    }
  });

  it("rejects unknown input kinds", () => {
    const error = capture(() =>
      validateExtractionProvenance({
        ...base(),
        inputs: [{ kind: "mystery" }] as never,
      }),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });
});

describe("pointSetInputRef", () => {
  it("content-pins the exact ordered point content (identical array → identical hash)", () => {
    const a = pointSetInputRef(POINTS, "INFERRED");
    const b = pointSetInputRef(POINTS.map((p) => ({ ...p })), "INFERRED");
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.kind).toBe("point-set");
    expect(a.pointCount).toBe(3);
    expect(a.epistemic).toBe("INFERRED");
  });

  it("different content → different hash (content addressing)", () => {
    const a = pointSetInputRef(POINTS, "INFERRED");
    const c = pointSetInputRef([...POINTS, { x: 9, y: 9, z: 9 }], "INFERRED");
    expect(a.contentHash).not.toBe(c.contentHash);
    expect(c.pointCount).toBe(4);
  });

  it("the hash pins the exact ordered content (callers pass canonical order; stage-level order-independence is covered by the segmentation and scene suites)", () => {
    // The contract (module doc): point sets are hashed in their
    // canonical order as supplied by the producing stage. The same
    // SET in a different order is a different ordered content —
    // order-independence of the EXTRACTION is guaranteed by
    // canonicalization upstream (segmentPointCloud), pinned by the
    // permutation-invariance tests there and in the scene suite.
    const a = pointSetInputRef(POINTS, "OBSERVED");
    const reordered: Array<{ x: number; y: number; z: number }> = [
      { ...POINTS[2]! },
      { ...POINTS[0]! },
      { ...POINTS[1]! },
    ];
    const b = pointSetInputRef(reordered, "OBSERVED");
    expect(a.contentHash).not.toBe(b.contentHash);
  });
});

describe("provenanceContentHash", () => {
  it("hashes the full lineage record deterministically", () => {
    const provenance = extractionProvenance("opening/grid-gap-v1", { res: 0.05 }, GOOD_INPUTS);
    expect(provenanceContentHash(provenance)).toBe(provenanceContentHash(provenance));
    const other = extractionProvenance("opening/grid-gap-v1", { res: 0.06 }, GOOD_INPUTS);
    expect(provenanceContentHash(provenance)).not.toBe(provenanceContentHash(other));
  });
});

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    fn();
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, "expected a SemanticsError").not.toBeNull();
    return semantics;
  }
  throw new Error("expected the call to throw");
}
