/**
 * WORLD-P0-B — the FIELD family test suite (colocated with `src/field/`).
 *
 * Drills the scientific-field port: the sealed kinds and closed
 * vocabularies, the request-validator laws (tolerance-must-be-declared,
 * sample-count-matches-grid, closed operation vocabulary, interior-node
 * divergence, digest formats), the result validator, the exact hand-
 * computed fixture facts through BOTH substitution doubles, the
 * substitution-contract equivalence (two independent code paths,
 * byte-identical computations), the determinism/content-addressing seal,
 * and the seam laws through the governed port (no reality identity,
 * INFERRED epistemics, digest ids never raw VTK names, deep-freeze).
 */

import { describe, expect, test } from "bun:test";
import {
  canonicalDigestOf,
  externalLabelValuesOf,
  isCanonicalDigest,
  validateAiseMappingBlock,
  type AiseMappingBlock,
} from "../seam";
import {
  FIELD_OPERATION_KINDS,
  FIELD_QUANTITY_KINDS,
  FIELD_REFERENCE_IMPLEMENTATION_NOTE,
  FIELD_REQUEST_KIND,
  FIELD_REQUEST_SCHEMA_VERSION,
  FIELD_RESULT_KIND,
  FIELD_RESULT_SCHEMA_VERSION,
  FIELD_VALIDATION_FAILURE_KINDS,
  computeThroughFieldPort,
  fieldRefused,
  validateFieldComputationRequest,
  validateFieldComputationResult,
  type FieldComputationProvider,
  type FieldComputationResult,
} from "./contract";
import {
  EXPECTED_ABOVE_SIGNED_MARGIN,
  EXPECTED_ABOVE_VERDICT,
  EXPECTED_BELOW_SIGNED_MARGIN,
  EXPECTED_BELOW_VERDICT,
  EXPECTED_FIELD_DIVERGENCE,
  EXPECTED_FIELD_EXTENT,
  EXPECTED_FIELD_INTEGRAL,
  EXPECTED_FIELD_MEAN,
  EXPECTED_FIELD_NORM_L1,
  EXPECTED_FIELD_TOLERANCE_BAND,
  EXPECTED_FIELD_VECTOR_MAGNITUDE,
  EXPECTED_NEAR_THRESHOLD_VERDICT,
  FIELD_FIXTURE_EVIDENCE_CONTENT_ID,
  FIELD_FIXTURE_GRID,
  FIELD_FIXTURE_MAGNITUDE_NODE,
  FIELD_FIXTURE_RECORDED_AT,
  FIELD_FIXTURE_SCALAR_FIELD,
  FIELD_FIXTURE_SUBJECT_REF,
  FIELD_FIXTURE_TOLERANCE,
  FIELD_FIXTURE_UNITS,
  FIELD_FIXTURE_VECTOR_FIELD,
  FULL_FIELD_REQUEST,
  MEASUREMENTS_ONLY_FIELD_REQUEST,
  NO_FIELD_OPERATIONS_REQUEST,
  PREDICATES_ONLY_FIELD_REQUEST,
} from "./corpus";
import {
  alternateFieldDouble,
  fieldQuantityUnitOf,
  referenceFieldDouble,
} from "./doubles";
import { CONTRACT_VERSION } from "@aise/shared-contracts";

/** Both substitution doubles (every fact test runs over BOTH code paths). */
const DOUBLES: readonly { readonly name: string; readonly provider: FieldComputationProvider }[] = [
  { name: "reference", provider: referenceFieldDouble },
  { name: "alternate", provider: alternateFieldDouble },
];

/** Runs the full-operations request through one double (asserts ok). */
function computeFixture(provider: FieldComputationProvider): FieldComputationResult {
  const outcome = computeThroughFieldPort(provider, FULL_FIELD_REQUEST);
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    return outcome.value;
  }
  throw new Error("unreachable");
}

/** A mutable shallow copy of the committed request (tampering base). */
function requestCopy(): Record<string, unknown> {
  return { ...FULL_FIELD_REQUEST };
}

describe("field — sealed kinds and closed vocabularies", () => {
  test("the sealed kinds and schema versions are exact", () => {
    expect(FIELD_REQUEST_KIND).toBe("field-computation-request");
    expect(FIELD_REQUEST_SCHEMA_VERSION).toBe("field-computation-request/1");
    expect(FIELD_RESULT_KIND).toBe("field-computation-result");
    expect(FIELD_RESULT_SCHEMA_VERSION).toBe("field-computation-result/1");
  });

  test("the operation and quantity vocabularies are closed", () => {
    expect([...FIELD_OPERATION_KINDS]).toEqual([
      "field-extent",
      "field-mean",
      "field-norm-l1",
      "field-vector-magnitude",
      "field-divergence",
      "field-integral",
      "field-above-threshold",
    ]);
    expect([...FIELD_QUANTITY_KINDS]).toEqual(["extent", "mean", "norm", "magnitude", "divergence", "integral"]);
  });

  test("the failure vocabulary is closed and the reference note names the future occupants", () => {
    expect([...FIELD_VALIDATION_FAILURE_KINDS]).toEqual([
      "not-an-object",
      "missing-field",
      "type-mismatch",
      "value-out-of-range",
      "vocabulary-violation",
      "digest-format",
      "tolerance-must-be-declared",
      "operand-index-out-of-range",
      "sample-count-mismatch",
      "label-namespace-violation",
    ]);
    expect(FIELD_REFERENCE_IMPLEMENTATION_NOTE).toContain("ParaView/VTK");
    expect(FIELD_REFERENCE_IMPLEMENTATION_NOTE).toContain("future occupants");
  });
});

describe("field — the request validator laws", () => {
  test("the committed full-intents request validates", () => {
    const validation = validateFieldComputationRequest(FULL_FIELD_REQUEST);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.request.subjectRef).toBe(FIELD_FIXTURE_SUBJECT_REF);
      expect(validation.request.tolerance).toEqual(FIELD_FIXTURE_TOLERANCE);
    }
  });

  test("a non-object is a typed not-an-object failure", () => {
    const validation = validateFieldComputationRequest("not an object");
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("not-an-object");
    }
  });

  test("tolerances are declared, never implicit (law #2)", () => {
    const missing = requestCopy();
    delete missing["tolerance"];
    const nonPositive = requestCopy();
    nonPositive["tolerance"] = { value: 0 };
    for (const payload of [missing, nonPositive]) {
      const validation = validateFieldComputationRequest(payload);
      expect(validation.ok).toBe(false);
    }
    const missingValidation = validateFieldComputationRequest(missing);
    if (!missingValidation.ok) {
      expect(
        missingValidation.failures.some((failure) => failure.kind === "tolerance-must-be-declared"),
      ).toBe(true);
    }
    const nonPositiveValidation = validateFieldComputationRequest(nonPositive);
    if (!nonPositiveValidation.ok) {
      expect(
        nonPositiveValidation.failures.some((failure) => failure.kind === "value-out-of-range"),
      ).toBe(true);
    }
  });

  test("a scalar sample-table length mismatch is sample-count-mismatch (law #4)", () => {
    const payload = requestCopy();
    payload["scalarField"] = { ...FIELD_FIXTURE_SCALAR_FIELD, values: [0, 3, 6, 4, 7, 10, 8, 11] };
    const validation = validateFieldComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "sample-count-mismatch"),
      ).toBe(true);
    }
  });

  test("a vector sample-table length mismatch is sample-count-mismatch (law #4)", () => {
    const payload = requestCopy();
    payload["vectorField"] = {
      ...FIELD_FIXTURE_VECTOR_FIELD,
      samples: FIELD_FIXTURE_VECTOR_FIELD.samples.slice(0, 8),
    };
    const validation = validateFieldComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "sample-count-mismatch"),
      ).toBe(true);
    }
  });

  test("an off-vocabulary operation is vocabulary-violation (law #3)", () => {
    const payload = requestCopy();
    payload["operations"] = [{ operation: "field-gradient" }];
    const validation = validateFieldComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "vocabulary-violation"),
      ).toBe(true);
    }
  });

  test("a boundary divergence node and an out-of-range node are typed failures (law #5)", () => {
    const boundary = requestCopy();
    boundary["operations"] = [{ operation: "field-divergence", node: 0 }];
    const boundaryValidation = validateFieldComputationRequest(boundary);
    expect(boundaryValidation.ok).toBe(false);
    if (!boundaryValidation.ok) {
      expect(boundaryValidation.failures.some((failure) => failure.kind === "value-out-of-range")).toBe(true);
    }
    const outOfRange = requestCopy();
    outOfRange["operations"] = [{ operation: "field-vector-magnitude", node: 9 }];
    const outOfRangeValidation = validateFieldComputationRequest(outOfRange);
    expect(outOfRangeValidation.ok).toBe(false);
    if (!outOfRangeValidation.ok) {
      expect(
        outOfRangeValidation.failures.some((failure) => failure.kind === "operand-index-out-of-range"),
      ).toBe(true);
    }
  });

  test("a non-digest subjectRef is digest-format", () => {
    const payload = requestCopy();
    payload["subjectRef"] = "vtk-structured-grid-0";
    const validation = validateFieldComputationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "digest-format")).toBe(true);
    }
  });
});

describe("field — the result validator", () => {
  test("the reference double's result validates", () => {
    const result = computeFixture(referenceFieldDouble);
    const validation = validateFieldComputationResult(result);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.result.measurements).toHaveLength(6);
      expect(validation.result.predicates).toHaveLength(3);
    }
  });

  test("tampering the result is a typed failure", () => {
    const result = computeFixture(referenceFieldDouble) as unknown as Record<string, unknown>;
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
      const validation = validateFieldComputationResult(payload);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.failures.some((failure) => failure.kind === expectedKind)).toBe(true);
      }
    }
  });
});

describe("field — the exact fixture facts (both doubles)", () => {
  test("extent, mean and norm-l1 measure 14, 7 and 63 (law #4 exactness)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.value]));
      expect(byOperation.get("field-extent")).toBe(EXPECTED_FIELD_EXTENT);
      expect(byOperation.get("field-mean")).toBe(EXPECTED_FIELD_MEAN);
      expect(byOperation.get("field-norm-l1")).toBe(EXPECTED_FIELD_NORM_L1);
    }
  });

  test("magnitude, divergence and integral measure 5, 5 and 28", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.value]));
      expect(byOperation.get("field-vector-magnitude")).toBe(EXPECTED_FIELD_VECTOR_MAGNITUDE);
      expect(byOperation.get("field-divergence")).toBe(EXPECTED_FIELD_DIVERGENCE);
      expect(byOperation.get("field-integral")).toBe(EXPECTED_FIELD_INTEGRAL);
    }
  });

  test("the threshold verdicts are true, within-tolerance and false with signed margins", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.predicates.map((p) => p.verdict)).toEqual([
        EXPECTED_ABOVE_VERDICT,
        EXPECTED_NEAR_THRESHOLD_VERDICT,
        EXPECTED_BELOW_VERDICT,
      ]);
      expect(result.predicates[0]!.signedMargin).toBe(EXPECTED_ABOVE_SIGNED_MARGIN);
      expect(result.predicates[2]!.signedMargin).toBe(EXPECTED_BELOW_SIGNED_MARGIN);
      expect(EXPECTED_FIELD_TOLERANCE_BAND).toBe(FIELD_FIXTURE_TOLERANCE.value);
    }
  });

  test("measurement operands are vtk-dataobject labels naming the consumed arrays (law #1)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      for (const measurement of result.measurements) {
        expect(measurement.operands).toHaveLength(1);
        expect(measurement.operands[0]!.namespace).toBe("vtk-dataobject");
      }
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.operands[0]!.value]));
      expect(byOperation.get("field-extent")).toBe(FIELD_FIXTURE_SCALAR_FIELD.name!);
      expect(byOperation.get("field-vector-magnitude")).toBe(FIELD_FIXTURE_VECTOR_FIELD.name!);
      expect(byOperation.get("field-divergence")).toBe(FIELD_FIXTURE_VECTOR_FIELD.name!);
      expect(byOperation.get("field-integral")).toBe(FIELD_FIXTURE_SCALAR_FIELD.name!);
    }
  });

  test("predicate node and field labels are vtk-dataobject external labels", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const expectedNodes = [4, 2, 3].map((node) => `${FIELD_FIXTURE_GRID.name}/node-${node}`);
      expect(result.predicates.map((predicate) => predicate.node!.value)).toEqual(expectedNodes);
      for (const predicate of result.predicates) {
        expect(predicate.node!.namespace).toBe("vtk-dataobject");
        expect(predicate.field!.namespace).toBe("vtk-dataobject");
        expect(predicate.field!.value).toBe(FIELD_FIXTURE_SCALAR_FIELD.name!);
        expect(predicate.predicate).toBe("field-above-threshold");
      }
    }
  });

  test("derived units compose from the DECLARED units (never sensed)", () => {
    expect(fieldQuantityUnitOf("extent", FIELD_FIXTURE_UNITS)).toBe("K");
    expect(fieldQuantityUnitOf("magnitude", FIELD_FIXTURE_UNITS)).toBe("K/m");
    expect(fieldQuantityUnitOf("divergence", FIELD_FIXTURE_UNITS)).toBe("K/m2");
    expect(fieldQuantityUnitOf("integral", FIELD_FIXTURE_UNITS)).toBe("K.m2");
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const byOperation = new Map(result.measurements.map((m) => [m.operation, m.unit]));
      expect(byOperation.get("field-mean")).toBe("K");
      expect(byOperation.get("field-vector-magnitude")).toBe("K/m");
      expect(byOperation.get("field-divergence")).toBe("K/m2");
      expect(byOperation.get("field-integral")).toBe("K.m2");
    }
  });
});

describe("field — the substitution equivalence (two independent code paths)", () => {
  test("the doubles produce byte-identical computations over every request shape", () => {
    for (const request of [
      FULL_FIELD_REQUEST,
      MEASUREMENTS_ONLY_FIELD_REQUEST,
      PREDICATES_ONLY_FIELD_REQUEST,
      NO_FIELD_OPERATIONS_REQUEST,
    ]) {
      const reference = computeThroughFieldPort(referenceFieldDouble, request);
      const alternate = computeThroughFieldPort(alternateFieldDouble, request);
      expect(reference.ok).toBe(true);
      expect(alternate.ok).toBe(true);
      if (reference.ok && alternate.ok) {
        expect(reference.value.measurements).toEqual(alternate.value.measurements);
        expect(reference.value.predicates).toEqual(alternate.value.predicates);
      }
    }
  });

  test("everything but the provider identity matches — and the result ids differ", () => {
    const reference = computeFixture(referenceFieldDouble);
    const alternate = computeFixture(alternateFieldDouble);
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

describe("field — the seam laws through the governed port", () => {
  test("realityObjects is empty — field fabricates no reality identity (law #6)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.aise.realityObjects).toEqual([]);
    }
  });

  test("the mapping block validates through the seam's own validator", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      const externalLabels = [
        ...result.measurements.flatMap((m) => m.operands),
        ...result.predicates.flatMap((p) =>
          p.node === null || p.field === null ? [] : [p.node, p.field],
        ),
      ];
      const validation = validateAiseMappingBlock(result.aise, {
        externalLabelValues: externalLabelValuesOf(externalLabels),
        evidenceContentId: FIELD_FIXTURE_EVIDENCE_CONTENT_ID,
      });
      expect(validation.ok).toBe(true);
    }
  });

  test("every id is a content digest — no VTK name ever leaks into identity (law #1)", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(isCanonicalDigest(result.resultId)).toBe(true);
      expect(isCanonicalDigest(result.modelDigest)).toBe(true);
      const aise = result.aise as AiseMappingBlock;
      expect(isCanonicalDigest(aise.derivation.derivationId)).toBe(true);
      expect(isCanonicalDigest(aise.derivation.outputContentId)).toBe(true);
      for (const measurement of aise.measurements) {
        expect(isCanonicalDigest(measurement.measurementId)).toBe(true);
      }
      for (const assertion of aise.propertyAssertions) {
        expect(isCanonicalDigest(assertion.assertionId)).toBe(true);
      }
      const rawNames = [
        FIELD_FIXTURE_GRID.name,
        FIELD_FIXTURE_SCALAR_FIELD.name,
        FIELD_FIXTURE_VECTOR_FIELD.name,
        `${FIELD_FIXTURE_GRID.name}/node-${FIELD_FIXTURE_MAGNITUDE_NODE}`,
      ].filter((name): name is string => name !== null);
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

  test("every seed enters INFERRED under field.scientific at the declared instant", () => {
    for (const double of DOUBLES) {
      const result = computeFixture(double.provider);
      expect(result.aise.derivation.method).toBe("field.scientific");
      expect(result.aise.derivation.createdAt).toBe(FIELD_FIXTURE_RECORDED_AT);
      for (const measurement of result.aise.measurements) {
        expect(measurement.status).toBe("INFERRED");
        expect(measurement.method).toBe("field.scientific");
        expect(measurement.measuredAt).toBe(FIELD_FIXTURE_RECORDED_AT);
        expect(measurement.subjectRef).toBe(FIELD_FIXTURE_SUBJECT_REF);
        expect(measurement.evidenceContentIds).toEqual([FIELD_FIXTURE_EVIDENCE_CONTENT_ID]);
      }
      for (const assertion of result.aise.propertyAssertions) {
        expect(assertion.status).toBe("INFERRED");
        expect(assertion.method).toBe("field.scientific");
        expect(assertion.subjectRef).toBe(FIELD_FIXTURE_SUBJECT_REF);
        expect(assertion.source_evidence).toEqual([FIELD_FIXTURE_EVIDENCE_CONTENT_ID]);
      }
      expect(result.aise.derivation.inputEvidenceContentIds).toEqual([FIELD_FIXTURE_EVIDENCE_CONTENT_ID]);
      expect(result.aise.derivation.contractVersion).toBe(CONTRACT_VERSION);
    }
  });

  test("the governed port deep-freezes the request (non-interference)", () => {
    const request = { ...FULL_FIELD_REQUEST, operations: [...FULL_FIELD_REQUEST.operations] };
    const outcome = computeThroughFieldPort(referenceFieldDouble, request);
    expect(outcome.ok).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(() => {
      (request as unknown as Record<string, unknown>)["tolerance"] = { value: 1 };
    }).toThrow();
  });

  test("empty and partial operation tables answer empty result arrays", () => {
    const none = computeThroughFieldPort(referenceFieldDouble, NO_FIELD_OPERATIONS_REQUEST);
    expect(none.ok).toBe(true);
    if (none.ok) {
      expect(none.value.measurements).toEqual([]);
      expect(none.value.predicates).toEqual([]);
    }
    const measurementsOnly = computeThroughFieldPort(referenceFieldDouble, MEASUREMENTS_ONLY_FIELD_REQUEST);
    expect(measurementsOnly.ok).toBe(true);
    if (measurementsOnly.ok) {
      expect(measurementsOnly.value.measurements).toHaveLength(6);
      expect(measurementsOnly.value.predicates).toEqual([]);
    }
    const predicatesOnly = computeThroughFieldPort(referenceFieldDouble, PREDICATES_ONLY_FIELD_REQUEST);
    expect(predicatesOnly.ok).toBe(true);
    if (predicatesOnly.ok) {
      expect(predicatesOnly.value.measurements).toEqual([]);
      expect(predicatesOnly.value.predicates).toHaveLength(3);
    }
  });

  test("fieldRefused answers the family-bound typed refusal", () => {
    const outcome = fieldRefused<FieldComputationResult>("contract-mismatch", "tolerance-must-be-declared");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.family).toBe("field");
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toBe("tolerance-must-be-declared");
    }
  });
});
