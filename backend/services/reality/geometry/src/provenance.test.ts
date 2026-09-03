/**
 * Provenance + epistemic tests (AISE-009): the fail-closed lineage
 * gate and the no-upgrade epistemic guards.
 */
import { describe, expect, it } from "vitest";
import {
  GEOMETRY_METHOD_VERSION,
  GEOMETRY_SERVICE_ID,
  measurementProvenance,
  provenanceContentHash,
  validateMeasurementProvenance,
  type MeasurementProvenance,
} from "./provenance.js";
import {
  FIT_EPISTEMIC_STATE,
  assertFitEpistemicState,
  assertNoEpistemicUpgrade,
  assertValidEpistemicState,
  deriveQueryState,
  epistemicRank,
} from "./epistemic.js";
import { GeometryError } from "./errors.js";

const VALID_INPUT = {
  kind: "point-set" as const,
  pointCount: 10,
  contentHash: "a".repeat(64),
  epistemic: "INFERRED" as const,
};

function validProvenance(): MeasurementProvenance {
  return measurementProvenance("plane-fit/tls-pca", { pointCount: 10 }, [VALID_INPUT]);
}

describe("provenance construction", () => {
  it("builds a validated provenance record", () => {
    const provenance = validProvenance();
    expect(provenance.serviceId).toBe(GEOMETRY_SERVICE_ID);
    expect(provenance.methodVersion).toBe(GEOMETRY_METHOD_VERSION);
    expect(provenance.inputs).toHaveLength(1);
  });

  it("is content-addressed and reproducible", () => {
    const a = validProvenance();
    const b = validProvenance();
    expect(provenanceContentHash(a)).toBe(provenanceContentHash(b));
  });
});

describe("provenance validation (fail closed)", () => {
  it("rejects a wrong serviceId", () => {
    const provenance = { ...validProvenance(), serviceId: "some.other.service" };
    expect(() => validateMeasurementProvenance(provenance)).toThrow(GeometryError);
  });

  it("rejects malformed method labels", () => {
    expect(() => validateMeasurementProvenance({ ...validProvenance(), method: "Not A Method!" })).toThrow(
      GeometryError,
    );
  });

  it("rejects a wrong method version", () => {
    expect(() => validateMeasurementProvenance({ ...validProvenance(), methodVersion: "0.9.0" })).toThrow(
      GeometryError,
    );
  });

  it("rejects non-serializable parameters (non-finite numbers)", () => {
    expect(() =>
      measurementProvenance("plane-fit/tls-pca", { sigma: Number.NaN }, [VALID_INPUT]),
    ).toThrow(GeometryError);
  });

  it("rejects empty input lineage", () => {
    expect(() => validateMeasurementProvenance({ ...validProvenance(), inputs: [] })).toThrow(GeometryError);
  });

  it("rejects malformed content hashes", () => {
    const bad = { ...validProvenance(), inputs: [{ ...VALID_INPUT, contentHash: "xyz" }] };
    expect(() => validateMeasurementProvenance(bad)).toThrow(GeometryError);
  });

  it("rejects invalid input epistemic states", () => {
    const bad = { ...validProvenance(), inputs: [{ ...VALID_INPUT, epistemic: "GUESSED" as never }] };
    expect(() => validateMeasurementProvenance(bad)).toThrow(GeometryError);
  });

  it("rejects non-positive point-set counts", () => {
    const bad = { ...validProvenance(), inputs: [{ ...VALID_INPUT, pointCount: 0 }] };
    expect(() => validateMeasurementProvenance(bad)).toThrow(GeometryError);
  });

  it("reports PROVENANCE_INCOMPLETE for every failure above", () => {
    const cases: MeasurementProvenance[] = [
      { ...validProvenance(), serviceId: "x" },
      { ...validProvenance(), method: "bad method" },
      { ...validProvenance(), methodVersion: "0" },
      { ...validProvenance(), inputs: [] },
    ];
    for (const bad of cases) {
      try {
        validateMeasurementProvenance(bad);
        expect.unreachable("validation must fail closed");
      } catch (error) {
        expect((error as GeometryError).code).toBe("PROVENANCE_INCOMPLETE");
      }
    }
  });
});

describe("epistemic state guards", () => {
  it("validates the vocabulary at runtime", () => {
    expect(assertValidEpistemicState("OBSERVED")).toBe("OBSERVED");
    expect(assertValidEpistemicState("PROPOSED")).toBe("PROPOSED");
    expect(() => assertValidEpistemicState("maybe")).toThrow(GeometryError);
  });

  it("ranks the strength lattice", () => {
    expect(epistemicRank("OBSERVED")).toBeGreaterThan(epistemicRank("CONFIRMED"));
    expect(epistemicRank("CONFIRMED")).toBeGreaterThan(epistemicRank("INFERRED"));
    expect(epistemicRank("INFERRED")).toBeGreaterThan(epistemicRank("PROPOSED"));
  });

  it("fits are INFERRED and nothing else (the architect's rule)", () => {
    expect(FIT_EPISTEMIC_STATE).toBe("INFERRED");
    expect(() => assertFitEpistemicState("INFERRED")).not.toThrow();
    for (const state of ["OBSERVED", "CONFIRMED", "PROPOSED"] as const) {
      try {
        assertFitEpistemicState(state);
        expect.unreachable(`fit epistemic ${state} must be rejected`);
      } catch (error) {
        const geometryError = error as GeometryError;
        expect(geometryError.code).toBe("EPISTEMIC_STATE_INVALID");
        expect(geometryError.details).toMatchObject({ claimed: state, allowed: "INFERRED" });
      }
    }
  });

  it("derived state is the weakest input (never an upgrade)", () => {
    expect(deriveQueryState(["OBSERVED", "OBSERVED"])).toBe("OBSERVED");
    expect(deriveQueryState(["OBSERVED", "INFERRED"])).toBe("INFERRED");
    expect(deriveQueryState(["CONFIRMED", "INFERRED", "PROPOSED"])).toBe("PROPOSED");
    expect(() => deriveQueryState([])).toThrow(GeometryError);
  });

  it("assertNoEpistemicUpgrade rejects claims above any input", () => {
    expect(() => assertNoEpistemicUpgrade("OBSERVED", ["INFERRED"])).toThrow(GeometryError);
    expect(() => assertNoEpistemicUpgrade("CONFIRMED", ["OBSERVED", "INFERRED"])).toThrow(GeometryError);
    expect(() => assertNoEpistemicUpgrade("INFERRED", ["INFERRED", "OBSERVED"])).not.toThrow();
    expect(() => assertNoEpistemicUpgrade("PROPOSED", ["OBSERVED"])).not.toThrow();
  });
});
