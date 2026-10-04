/**
 * WORLD-P0-B — the GEOMETRY family test suite (colocated with
 * `src/geometry/`).
 *
 * Drills the exact-geometry port: the sealed kinds and closed
 * vocabularies (shape kinds, operation kinds, quantity kinds, failure
 * kinds), the request-validator laws (tolerance-must-be-declared,
 * operand-index range, operand shape-kind match, digest formats), the
 * result validator, the exact hand-computed fixture facts through BOTH
 * substitution doubles, the substitution-contract equivalence (two
 * independent code paths, byte-identical computations), the determinism
 * and content-addressing seal, and the seam laws through the governed
 * port (no reality identity, INFERRED epistemics, digest ids never raw
 * OCCT TopoDS names, deep-freeze).
 */

import { describe, expect, test } from "bun:test";
import {
  canonicalDigestOf,
  externalLabelValuesOf,
  isCanonicalDigest,
  validateAiseMappingBlock,
} from "../seam";
import {
  GEOMETRY_OPERATION_KINDS,
  GEOMETRY_QUANTITY_KINDS,
  GEOMETRY_REFERENCE_IMPLEMENTATION_NOTE,
  GEOMETRY_REQUEST_KIND,
  GEOMETRY_REQUEST_SCHEMA_VERSION,
  GEOMETRY_RESULT_KIND,
  GEOMETRY_RESULT_SCHEMA_VERSION,
  GEOMETRY_SHAPE_KINDS,
  GEOMETRY_VALIDATION_FAILURE_KINDS,
  computeThroughGeometryPort,
  validateGeometryComputationRequest,
  validateGeometryComputationResult,
  type GeometryComputationProvider,
  type GeometryComputationResult,
} from "./contract";
import {
  EXPECTED_BOX_VOLUME,
  EXPECTED_DISTANCE_POINT_POINT,
  EXPECTED_DISTANCE_POINT_SEGMENT,
  EXPECTED_INSIDE_SIGNED_DISTANCE,
  EXPECTED_INSIDE_VERDICT,
  EXPECTED_NEAR_BOUNDARY_VERDICT,
  EXPECTED_OUTSIDE_VERDICT,
  EXPECTED_POLYGON_AREA,
  EXPECTED_SEGMENT_LENGTH,
  EXPECTED_TOLERANCE_BAND,
  FULL_GEOMETRY_REQUEST,
  GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID,
  GEOMETRY_FIXTURE_RECORDED_AT,
  GEOMETRY_FIXTURE_SHAPES,
  GEOMETRY_FIXTURE_SUBJECT_REF,
  GEOMETRY_FIXTURE_TOLERANCE,
  GEOMETRY_FIXTURE_UNITS,
  MEASUREMENTS_ONLY_REQUEST,
  NO_OPERATIONS_REQUEST,
  PREDICATES_ONLY_REQUEST,
} from "./corpus";
import {
  alternateGeometryDouble,
  geometryQuantityUnitOf,
  referenceGeometryDouble,
} from "./doubles";
import { CONTRACT_VERSION } from "@aise/shared-contracts";

/** Both substitution doubles (every fact test runs over BOTH code paths). */
const DOUBLES: readonly { readonly name: string; readonly provider: GeometryComputationProvider }[] = [
  { name: "reference", provider: referenceGeometryDouble },
  { name: "alternate", provider: alternateGeometryDouble },
];

/** Runs the full-operations request through one double (asserts ok). */
function computeFixture(provider: GeometryComputationProvider): GeometryComputationResult {
  const outcome = computeThroughGeometryPort(provider, FULL_GEOMETRY_REQUEST);
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    return outcome.value;
  }
  throw new Error("unreachable");
}

/** A mutable shallow copy of the committed request (tampering base). */
function requestCopy(): Record<string, unknown> {
  return { ...FULL_GEOMETRY_REQUEST };
}

describe("geometry — sealed kinds and closed vocabularies", () => {
  test("the sealed kinds and schema versions are exact", () => {
    expect(GEOMETRY_REQUEST_KIND).toBe("geometry-computation-request");
    expect(GEOMETRY_REQUEST_SCHEMA_VERSION).toBe("geometry-computation-request/1");
    expect(GEOMETRY_RESULT_KIND).toBe("geometry-computation-result");
    expect(GEOMETRY_RESULT_SCHEMA_VERSION).toBe("geometry-computation-result/1");
  });

  test("the shape and operation vocabularies are closed", () => {
    expect([...GEOMETRY_SHAPE_KINDS]).toEqual(["point", "segment", "polygon", "box"]);
    expect([...GEOMETRY_OPERATION_KINDS]).toEqual([
      "distance-point-point",
      "distance-point-segment",
      "segment-length",
      "polygon-area",
      "box-volume",
      "point-in-polygon",
    ]);
  });

  test("the quantity and failure vocabularies are closed and the note names the future occupants", () => {
    expect([...GEOMETRY_QUANTITY_KINDS]).toEqual(["distance", "length", "area", "volume"]);
    expect([...GEOMETRY_VALIDATION_FAILURE_KINDS]).toEqual([
      "not-an-object",
      "missing-field",
      "type-mismatch",
      "value-out-of-range",
      "vocabulary-violation",
      "digest-format",
      "tolerance-must-be-declared",
      "operand-index-out-of-range",
      "label-namespace-violation",
    ]);
    expect(GEOMETRY_REFERENCE_IMPLEMENTATION_NOTE).toContain("OCCT via OCP/CadQuery");
    expect(GEOMETRY_REFERENCE_IMPLEMENTATION_NOTE).toContain("future occupants");
  });
});

describe("geometry — the request validator laws", () => {
  test("the committed full-operations request validates", () => {
    const validation = validateGeometryComputationRequest(FULL_GEOMETRY_REQUEST);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.request.subjectRef).toBe(GEOMETRY_FIXTURE_SUBJECT_REF);
      expect(validation.request.tolerance).toEqual(GEOMETRY_FIXTURE_TOLERANCE);
      expect(validation.request.shapes).toHaveLength(10);
    }
  });

  test("a non-object is a typed not-an-object failure", () => {
    const validation = validateGeometryComputationRequest(42);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("not-an-object");
    }
  });

  test("a missing tolerance is refused as tolerance-must-be-declared (law #2)", () => {
    const payload = requestCopy();
    delete payload["tolerance"];
    const validation = validateGeometryComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "tolerance-must-be-declared"),
      ).toBe(true);
    }
  });

  test("a non-positive tolerance band is value-out-of-range (law #2)", () => {
    const payload = requestCopy();
    payload["tolerance"] = { ...GEOMETRY_FIXTURE_TOLERANCE, linear: 0 };
    const validation = validateGeometryComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "value-out-of-range")).toBe(true);
    }
  });

  test("an out-of-range operand index is operand-index-out-of-range (law #3)", () => {
    const payload = requestCopy();
    payload["operations"] = [{ operation: "segment-length", segment: 42 }];
    const validation = validateGeometryComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "operand-index-out-of-range"),
      ).toBe(true);
    }
  });

  test("an operand shape-kind mismatch is vocabulary-violation (law #3)", () => {
    const payload = requestCopy();
    payload["operations"] = [{ operation: "polygon-area", polygon: 0 }];
    const validation = validateGeometryComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some(
          (failure) => failure.kind === "vocabulary-violation" && failure.path === "operations[0].polygon",
        ),
      ).toBe(true);
    }
  });

  test("a non-digest subjectRef is digest-format (law #4)", () => {
    const payload = requestCopy();
    payload["subjectRef"] = "vertex-1";
    const validation = validateGeometryComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "digest-format")).toBe(true);
    }
  });
});

describe("geometry — the result validator", () => {
  test("the reference double's result validates", () => {
    const result = computeFixture(referenceGeometryDouble);
    const validation = validateGeometryComputationResult(result);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.result.measurements).toHaveLength(5);
      expect(validation.result.predicates).toHaveLength(3);
    }
  });

  test("tampering the result is a typed failure", () => {
    const result = computeFixture(referenceGeometryDouble) as unknown as Record<string, unknown>;
    const badId = { ...result, resultId: "not-a-digest" };
    const badVerdict = { ...result };
    const predicates = [...(badVerdict["predicates"] as Record<string, unknown>[])];
    predicates[0] = { ...predicates[0]!, verdict: "maybe" };
    badVerdict["predicates"] = predicates;
    const noProvenance = { ...result };
    delete noProvenance["provenance"];
    const cases: readonly [unknown, string][] = [
      [badId, "digest-format"],
      [badVerdict, "vocabulary-violation"],
      [noProvenance, "missing-field"],
    ];
    for (const [payload, expectedKind] of cases) {
      const validation = validateGeometryComputationResult(payload);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.failures.some((failure) => failure.kind === expectedKind)).toBe(true);
      }
    }
  });
});

describe("geometry — the exact fixture facts (both doubles)", () => {
  test("the point-point and point-segment distances measure 5 and 4", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.value]));
      expect(byOperation.get("distance-point-point")).toBe(EXPECTED_DISTANCE_POINT_POINT);
      expect(byOperation.get("distance-point-segment")).toBe(EXPECTED_DISTANCE_POINT_SEGMENT);
    }
  });

  test("the segment length, polygon area and box volume measure 13, 16 and 30", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.value]));
      expect(byOperation.get("segment-length")).toBe(EXPECTED_SEGMENT_LENGTH);
      expect(byOperation.get("polygon-area")).toBe(EXPECTED_POLYGON_AREA);
      expect(byOperation.get("box-volume")).toBe(EXPECTED_BOX_VOLUME);
    }
  });

  test("the containment verdicts are true, within-tolerance and false (law #2)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.predicates.map((predicate) => predicate.verdict)).toEqual([
        EXPECTED_INSIDE_VERDICT,
        EXPECTED_NEAR_BOUNDARY_VERDICT,
        EXPECTED_OUTSIDE_VERDICT,
      ]);
      expect(result.predicates[0]!.signedDistance).toBe(EXPECTED_INSIDE_SIGNED_DISTANCE);
      expect(EXPECTED_TOLERANCE_BAND).toBe(GEOMETRY_FIXTURE_TOLERANCE.linear);
    }
  });

  test("measurement operands are occt-topology labels of the involved shapes (law #1)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.operands]));
      expect(byOperation.get("distance-point-point")).toEqual([
        { namespace: "occt-topology", value: "vertex-0" },
        { namespace: "occt-topology", value: "vertex-1" },
      ]);
      expect(byOperation.get("segment-length")).toEqual([{ namespace: "occt-topology", value: "edge-1" }]);
      expect(byOperation.get("polygon-area")).toEqual([{ namespace: "occt-topology", value: "face-0" }]);
      expect(byOperation.get("box-volume")).toEqual([{ namespace: "occt-topology", value: "solid-0" }]);
    }
  });

  test("predicate point and polygon labels are occt-topology external labels", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.predicates.map((predicate) => predicate.point!.value)).toEqual([
        "vertex-3",
        "vertex-4",
        "vertex-5",
      ]);
      for (const predicate of result.predicates) {
        expect(predicate.point!.namespace).toBe("occt-topology");
        expect(predicate.polygon!.namespace).toBe("occt-topology");
        expect(predicate.polygon!.value).toBe("face-0");
        expect(predicate.predicate).toBe("point-in-polygon");
      }
    }
  });

  test("derived units compose from the DECLARED linear unit (never sensed)", () => {
    expect(geometryQuantityUnitOf("distance", GEOMETRY_FIXTURE_UNITS.linear)).toBe("m");
    expect(geometryQuantityUnitOf("length", GEOMETRY_FIXTURE_UNITS.linear)).toBe("m");
    expect(geometryQuantityUnitOf("area", GEOMETRY_FIXTURE_UNITS.linear)).toBe("m2");
    expect(geometryQuantityUnitOf("volume", GEOMETRY_FIXTURE_UNITS.linear)).toBe("m3");
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.unit]));
      expect(byOperation.get("distance-point-point")).toBe("m");
      expect(byOperation.get("polygon-area")).toBe("m2");
      expect(byOperation.get("box-volume")).toBe("m3");
    }
  });
});

describe("geometry — the substitution equivalence (two independent code paths)", () => {
  test("the doubles produce byte-identical computations over every request shape", () => {
    for (const request of [
      FULL_GEOMETRY_REQUEST,
      MEASUREMENTS_ONLY_REQUEST,
      PREDICATES_ONLY_REQUEST,
      NO_OPERATIONS_REQUEST,
    ]) {
      const reference = computeThroughGeometryPort(referenceGeometryDouble, request);
      const alternate = computeThroughGeometryPort(alternateGeometryDouble, request);
      expect(reference.ok).toBe(true);
      expect(alternate.ok).toBe(true);
      if (reference.ok && alternate.ok) {
        expect(reference.value.measurements).toEqual(alternate.value.measurements);
        expect(reference.value.predicates).toEqual(alternate.value.predicates);
      }
    }
  });

  test("everything but the provider identity matches — and the result ids differ", () => {
    const reference = computeFixture(referenceGeometryDouble);
    const alternate = computeFixture(alternateGeometryDouble);
    expect(reference.modelDigest).toBe(alternate.modelDigest);
    expect(reference.appliedTolerance).toEqual(alternate.appliedTolerance);
    expect(reference.provenance.inputDigest).toBe(alternate.provenance.inputDigest);
    expect(reference.provenance.parametersDigest).toBe(alternate.provenance.parametersDigest);
    expect(reference.resultId).not.toBe(alternate.resultId);
    expect(reference.provenance.providerId).not.toBe(alternate.provenance.providerId);
  });

  test("determinism: the sealed id is the content digest of the result minus its own id", () => {
    for (const double of DOUBLES) {
      const first = computeFixture(double.provider);
      const second = computeFixture(double.provider);
      expect(first.resultId).toBe(second.resultId);
      const { resultId, ...body } = first;
      expect(resultId).toBe(canonicalDigestOf(body));
    }
  });
});

describe("geometry — the seam laws through the governed port", () => {
  test("realityObjects is empty — geometry fabricates no reality identity (law #4)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.aise.realityObjects).toEqual([]);
    }
  });

  test("the mapping block validates through the seam's own validator", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const externalLabels = [
        ...result.measurements.flatMap((measurement) => measurement.operands),
        ...result.predicates.flatMap((predicate) =>
          predicate.point === null || predicate.polygon === null ? [] : [predicate.point, predicate.polygon],
        ),
      ];
      const validation = validateAiseMappingBlock(result.aise, {
        externalLabelValues: externalLabelValuesOf(externalLabels),
        evidenceContentId: GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID,
      });
      expect(validation.ok).toBe(true);
    }
  });

  test("every id is a content digest — no OCCT TopoDS name ever leaks into identity (law #1)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(isCanonicalDigest(result.resultId)).toBe(true);
      expect(isCanonicalDigest(result.modelDigest)).toBe(true);
      const aise = result.aise;
      expect(isCanonicalDigest(aise.derivation.derivationId)).toBe(true);
      expect(isCanonicalDigest(aise.derivation.outputContentId)).toBe(true);
      for (const measurement of aise.measurements) {
        expect(isCanonicalDigest(measurement.measurementId)).toBe(true);
      }
      for (const assertion of aise.propertyAssertions) {
        expect(isCanonicalDigest(assertion.assertionId)).toBe(true);
      }
      const rawNames = GEOMETRY_FIXTURE_SHAPES.map((shape) => shape.name).filter(
        (name): name is string => name !== null,
      );
      const everyId = [
        result.resultId,
        aise.derivation.derivationId,
        aise.derivation.outputContentId,
        ...aise.measurements.map((m) => m.measurementId),
        ...aise.propertyAssertions.map((a) => a.assertionId),
      ];
      for (const id of everyId) {
        expect(rawNames.includes(id)).toBe(false);
      }
    }
  });

  test("every seed enters INFERRED under geometry.exact at the declared instant (law #5)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.aise.derivation.method).toBe("geometry.exact");
      expect(result.aise.derivation.createdAt).toBe(GEOMETRY_FIXTURE_RECORDED_AT);
      for (const measurement of result.aise.measurements) {
        expect(measurement.status).toBe("INFERRED");
        expect(measurement.method).toBe("geometry.exact");
        expect(measurement.measuredAt).toBe(GEOMETRY_FIXTURE_RECORDED_AT);
        expect(measurement.subjectRef).toBe(GEOMETRY_FIXTURE_SUBJECT_REF);
        expect(measurement.evidenceContentIds).toEqual([GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID]);
      }
      for (const assertion of result.aise.propertyAssertions) {
        expect(assertion.status).toBe("INFERRED");
        expect(assertion.method).toBe("geometry.exact");
        expect(assertion.subjectRef).toBe(GEOMETRY_FIXTURE_SUBJECT_REF);
        expect(assertion.source_evidence).toEqual([GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID]);
      }
      expect(result.aise.derivation.inputEvidenceContentIds).toEqual([GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID]);
      expect(result.aise.derivation.contractVersion).toBe(CONTRACT_VERSION);
    }
  });

  test("the governed port deep-freezes the request (non-interference)", () => {
    const request = { ...FULL_GEOMETRY_REQUEST, operations: [...FULL_GEOMETRY_REQUEST.operations] };
    const outcome = computeThroughGeometryPort(referenceGeometryDouble, request);
    expect(outcome.ok).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(() => {
      (request as unknown as Record<string, unknown>)["tolerance"] = { linear: 1, angular: 1 };
    }).toThrow();
  });

  test("empty and partial operation tables answer empty result arrays", () => {
    const none = computeThroughGeometryPort(referenceGeometryDouble, NO_OPERATIONS_REQUEST);
    expect(none.ok).toBe(true);
    if (none.ok) {
      expect(none.value.measurements).toEqual([]);
      expect(none.value.predicates).toEqual([]);
    }
    const measurementsOnly = computeThroughGeometryPort(referenceGeometryDouble, MEASUREMENTS_ONLY_REQUEST);
    expect(measurementsOnly.ok).toBe(true);
    if (measurementsOnly.ok) {
      expect(measurementsOnly.value.measurements).toHaveLength(5);
      expect(measurementsOnly.value.predicates).toEqual([]);
    }
    const predicatesOnly = computeThroughGeometryPort(referenceGeometryDouble, PREDICATES_ONLY_REQUEST);
    expect(predicatesOnly.ok).toBe(true);
    if (predicatesOnly.ok) {
      expect(predicatesOnly.value.measurements).toEqual([]);
      expect(predicatesOnly.value.predicates).toHaveLength(3);
    }
  });
});
