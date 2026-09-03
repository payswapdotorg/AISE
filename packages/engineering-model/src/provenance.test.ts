/**
 * Provenance validation tests: the lineage record contract for
 * every derived model entity.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import {
  MODEL_METHOD_VERSION,
  MODEL_SERVICE_ID,
  modelProvenance,
  parametersHash,
  validateModelProvenance,
} from "./provenance.js";
import { HASH_A, objectRef, sceneRef } from "./testing.js";

describe("modelProvenance (constructor)", () => {
  it("builds and validates a complete lineage record", () => {
    const provenance = modelProvenance("ingest/architectural-scene-v1", { sceneId: "s" }, [
      objectRef(),
      sceneRef(),
    ]);
    expect(provenance.serviceId).toBe(MODEL_SERVICE_ID);
    expect(provenance.methodVersion).toBe(MODEL_METHOD_VERSION);
    expect(provenance.inputs).toHaveLength(2);
  });

  it("returns the record only after validation (fail closed on the producing path)", () => {
    expect(() =>
      modelProvenance("BAD METHOD", {}, [objectRef()]),
    ).toThrow(EngineeringModelError);
  });
});

describe("validateModelProvenance", () => {
  const valid = () => modelProvenance("ingest/architectural-scene-v1", { a: 1 }, [objectRef()]);

  it("accepts a valid record", () => {
    expect(() => validateModelProvenance(valid())).not.toThrow();
  });

  it("validates the service identity pattern", () => {
    const provenance = { ...valid(), serviceId: "AISE.MODEL" };
    expect(() => validateModelProvenance(provenance)).toThrow(EngineeringModelError);
  });

  it("validates the method label pattern", () => {
    expect(() => validateModelProvenance({ ...valid(), method: "not a method!" })).toThrow(
      EngineeringModelError,
    );
  });

  it("validates the semver method lineage version", () => {
    expect(() => validateModelProvenance({ ...valid(), methodVersion: "1.0" })).toThrow(
      EngineeringModelError,
    );
    expect(() => validateModelProvenance({ ...valid(), methodVersion: "v1.0.0" })).toThrow(
      EngineeringModelError,
    );
  });

  it("requires a JSON-shaped parameters record", () => {
    expect(() => validateModelProvenance({ ...valid(), parameters: null as never })).toThrow(
      EngineeringModelError,
    );
    expect(() => validateModelProvenance({ ...valid(), parameters: [1] as never })).toThrow(
      EngineeringModelError,
    );
  });

  it("requires canonically serializable (finite) parameters", () => {
    expect(() =>
      validateModelProvenance({ ...valid(), parameters: { bad: Number.NaN } }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateModelProvenance({ ...valid(), parameters: { bad: Number.POSITIVE_INFINITY } }),
    ).toThrow(EngineeringModelError);
  });

  it("requires non-empty inputs", () => {
    expect(() => validateModelProvenance({ ...valid(), inputs: [] })).toThrow(
      EngineeringModelError,
    );
  });

  it("validates every input reference kind", () => {
    expect(() =>
      validateModelProvenance({ ...valid(), inputs: [{ kind: "mystery" } as never] }),
    ).toThrow(EngineeringModelError);
  });

  it("validates object input references", () => {
    expect(() =>
      validateModelProvenance({
        ...valid(),
        inputs: [objectRef({ contentHash: "nothex" })],
      }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateModelProvenance({ ...valid(), inputs: [objectRef({ objectId: "" })] }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateModelProvenance({ ...valid(), inputs: [objectRef({ epistemic: "GUESSED" as never })] }),
    ).toThrow(EngineeringModelError);
  });

  it("validates scene input references", () => {
    expect(() =>
      validateModelProvenance({
        ...valid(),
        inputs: [sceneRef({ sceneId: "" }), objectRef()],
      }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateModelProvenance({ ...valid(), inputs: [sceneRef({ contentHash: "z".repeat(64) })] }),
    ).toThrow(EngineeringModelError);
  });

  it("validates point-set input references", () => {
    expect(() =>
      validateModelProvenance({
        ...valid(),
        inputs: [{ kind: "point-set", pointCount: -1, contentHash: HASH_A, epistemic: "INFERRED" }],
      }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateModelProvenance({
        ...valid(),
        inputs: [{ kind: "point-set", pointCount: 2.5, contentHash: HASH_A, epistemic: "INFERRED" }],
      }),
    ).toThrow(EngineeringModelError);
  });
});

describe("parametersHash", () => {
  it("hashes the materialized parameters canonically", () => {
    expect(parametersHash({ b: 2, a: 1 })).toBe(parametersHash({ a: 1, b: 2 }));
    expect(parametersHash({ a: 1 })).not.toBe(parametersHash({ a: 2 }));
  });
});
