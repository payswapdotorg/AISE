/**
 * WORLD-P0-B — the IFC family test suite (colocated with `src/ifc/`).
 *
 * Drills the IFC-interpretation port: the sealed kinds and closed
 * vocabularies (schema intents, spatial roles, relationship kinds,
 * quantity kinds, omission kinds), the request-validator laws (STEP
 * header shape, closed intent vocabulary, declared digests), the exact
 * hand-derived semantic facts the committed minimal IFC4 fixture carries
 * (the 4-node spatial tree, the 4 elements, the OmniClass classification
 * code, Pset_WallCommon, Qto_WallBaseQuantities, the relationship edges,
 * the honest omissions — including the IFCCLASSIFICATIONREFERENCE
 * attribute-out-of-scope record), the substitution-contract equivalence
 * (statement scanner vs character tokenizer, byte-identical extractions),
 * the intent-gating discipline, the typed refusal paths (schema-intent
 * mismatch, malformed STEP, request-gate contract mismatch), and the
 * seam laws through the governed port (guid labels never identity,
 * content-digested reality seeds, INFERRED epistemics, deep-freeze).
 */

import { describe, expect, test } from "bun:test";
import {
  canonicalDigestOf,
  externalLabelValuesOf,
  isCanonicalDigest,
  textDigestOf,
  validateAiseMappingBlock,
} from "../seam";
import {
  IFC_OMISSION_KINDS,
  IFC_QUANTITY_KINDS,
  IFC_REFERENCE_IMPLEMENTATION_NOTE,
  IFC_RELATIONSHIP_KINDS,
  IFC_REQUEST_KIND,
  IFC_REQUEST_SCHEMA_VERSION,
  IFC_RESULT_KIND,
  IFC_RESULT_SCHEMA_VERSION,
  IFC_SCHEMA_INTENTS,
  IFC_SOURCE_MEDIA_TYPE,
  IFC_SPATIAL_ROLES,
  IFC_VALIDATION_FAILURE_KINDS,
  interpretThroughIfcPort,
  validateIfcExtractionResult,
  validateIfcInterpretationRequest,
  type IfcExtractionResult,
  type IfcInterpretationProvider,
  type IfcInterpretationRequest,
} from "./contract";
import {
  EXPECTED_ELEMENTS,
  EXPECTED_OMITTED_CLASSES,
  EXPECTED_RELATIONSHIP_COUNTS,
  EXPECTED_SCHEMA_IDENTIFIER,
  EXPECTED_SKIPPED_REPRESENTATION_COUNT,
  EXPECTED_SPATIAL_TREE,
  EXPECTED_WALL_CLASSIFICATION,
  EXPECTED_WALL_PROPERTIES,
  EXPECTED_WALL_QUANTITIES,
  FULL_INTENTS_REQUEST,
  INTENT_MISMATCH_REQUEST,
  MINIMAL_IFC4_EVIDENCE_CONTENT_ID,
  MINIMAL_IFC4_MODEL_UNITS,
  MINIMAL_IFC4_RECORDED_AT,
  MINIMAL_IFC4_STEP_TEXT,
  NO_INTENTS_REQUEST,
  NOT_STEP_REQUEST,
  SPATIAL_ONLY_REQUEST,
} from "./corpus";
import {
  alternateIfcDouble,
  quantityUnitOf,
  referenceIfcDouble,
} from "./doubles";
import { CONTRACT_VERSION } from "@aise/shared-contracts";

/** Both substitution doubles (every fact test runs over BOTH code paths). */
const DOUBLES: readonly { readonly name: string; readonly provider: IfcInterpretationProvider }[] = [
  { name: "reference", provider: referenceIfcDouble },
  { name: "alternate", provider: alternateIfcDouble },
];

/** Runs the full-intents request through one double (asserts ok). */
function interpretFixture(provider: IfcInterpretationProvider): IfcExtractionResult {
  const outcome = interpretThroughIfcPort(provider, FULL_INTENTS_REQUEST);
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    return outcome.value;
  }
  throw new Error("unreachable");
}

describe("ifc — sealed kinds and closed vocabularies", () => {
  test("the sealed kinds, schema versions and media type are exact", () => {
    expect(IFC_REQUEST_KIND).toBe("ifc-interpretation-request");
    expect(IFC_REQUEST_SCHEMA_VERSION).toBe("ifc-interpretation-request/1");
    expect(IFC_RESULT_KIND).toBe("ifc-interpretation-result");
    expect(IFC_RESULT_SCHEMA_VERSION).toBe("ifc-interpretation-result/1");
    expect(IFC_SOURCE_MEDIA_TYPE).toBe("application/ifc");
  });

  test("the schema-intent, spatial-role, relationship and quantity vocabularies are closed", () => {
    expect([...IFC_SCHEMA_INTENTS]).toEqual(["IFC4", "IFC2X3"]);
    expect([...IFC_SPATIAL_ROLES]).toEqual(["project", "site", "building", "storey", "space"]);
    expect([...IFC_RELATIONSHIP_KINDS]).toEqual([
      "aggregation",
      "containment",
      "voiding",
      "property-definition",
      "classification",
    ]);
    expect([...IFC_QUANTITY_KINDS]).toEqual(["length", "area", "volume", "count", "weight"]);
  });

  test("the omission and failure vocabularies are closed and the note names the future occupants", () => {
    expect([...IFC_OMISSION_KINDS]).toEqual([
      "unsupported-entity-class",
      "geometry-representation-skipped",
      "attribute-out-of-scope",
    ]);
    expect([...IFC_VALIDATION_FAILURE_KINDS]).toEqual([
      "not-an-object",
      "missing-field",
      "type-mismatch",
      "value-out-of-range",
      "vocabulary-violation",
      "digest-format",
      "guid-format",
      "label-namespace-violation",
    ]);
    expect(IFC_REFERENCE_IMPLEMENTATION_NOTE).toContain("IfcOpenShell");
    expect(IFC_REFERENCE_IMPLEMENTATION_NOTE).toContain("web-ifc");
    expect(IFC_REFERENCE_IMPLEMENTATION_NOTE).toContain("future occupants");
  });
});

describe("ifc — the request validator laws", () => {
  test("the committed full-intents request validates", () => {
    const validation = validateIfcInterpretationRequest(FULL_INTENTS_REQUEST);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.request.schemaIntent).toBe("IFC4");
      expect(validation.request.model.stepText).toBe(MINIMAL_IFC4_STEP_TEXT);
      expect(validation.request.intents.classification).toBe(true);
    }
  });

  test("a non-object is a typed not-an-object failure", () => {
    const validation = validateIfcInterpretationRequest(null);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("not-an-object");
    }
  });

  test("text that is not a STEP physical file is value-out-of-range", () => {
    const validation = validateIfcInterpretationRequest(NOT_STEP_REQUEST);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "value-out-of-range"),
      ).toBe(true);
    }
  });

  test("an off-vocabulary schema intent is vocabulary-violation", () => {
    const payload = { ...FULL_INTENTS_REQUEST, schemaIntent: "IFC8" } as Record<string, unknown>;
    const validation = validateIfcInterpretationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "vocabulary-violation"),
      ).toBe(true);
    }
  });

  test("a non-digest evidence binding is digest-format", () => {
    const payload = { ...FULL_INTENTS_REQUEST, evidenceContentId: "0xScRe4drECQ4DMSqUjd6d" } as Record<
      string,
      unknown
    >;
    const validation = validateIfcInterpretationRequest(payload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "digest-format")).toBe(true);
    }
  });
});

describe("ifc — the exact semantic facts (both doubles)", () => {
  test("the spatial containment tree is the project-site-building-storey chain", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const observed = result.spatialNodes.map((node) => ({
        role: node.role,
        guid: node.label.value,
        name: node.name,
        containedBy: node.containedBy === null ? null : node.containedBy.value,
      }));
      expect(observed).toEqual([...EXPECTED_SPATIAL_TREE]);
      for (const node of result.spatialNodes) {
        expect(node.label.namespace).toBe("ifc-guid");
      }
    }
  });

  test("the four elements parse with their classes, names, storey containment and the wall's classification", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const observed = result.elements.map((element) => ({
        ifcClass: element.ifcClass,
        guid: element.label.value,
        name: element.name,
        containedBy: element.containedBy === null ? null : element.containedBy.value,
      }));
      expect(observed).toEqual([...EXPECTED_ELEMENTS]);
      const wall = result.elements.find((element) => element.ifcClass === "IFCWALL")!;
      expect(wall.classification).toBe(EXPECTED_WALL_CLASSIFICATION);
      for (const element of result.elements) {
        expect(element.label.namespace).toBe("ifc-guid");
      }
    }
  });

  test("Pset_WallCommon parses with its three typed values", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      expect(result.propertySets).toHaveLength(1);
      const pset = result.propertySets[0]!;
      expect(pset.name).toBe("Pset_WallCommon");
      expect(pset.relates.value).toBe(EXPECTED_ELEMENTS[0]!.guid);
      const observed = pset.properties.map((property) => ({
        name: property.name,
        nominal: property.nominal,
      }));
      expect(observed).toEqual([...EXPECTED_WALL_PROPERTIES]);
    }
  });

  test("Qto_WallBaseQuantities parses with its three declared-unit quantities", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      expect(result.quantitySets).toHaveLength(1);
      const qset = result.quantitySets[0]!;
      expect(qset.name).toBe("Qto_WallBaseQuantities");
      expect(qset.relates.value).toBe(EXPECTED_ELEMENTS[0]!.guid);
      const observed = qset.quantities.map((quantity) => ({
        name: quantity.name,
        quantityKind: quantity.quantityKind,
        value: quantity.value,
        unit: quantity.unit,
      }));
      expect(observed).toEqual([...EXPECTED_WALL_QUANTITIES]);
    }
  });

  test("the relationship edges parse with the expected per-kind counts and one edge fully shaped", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const counts = new Map<string, number>();
      for (const relationship of result.relationships) {
        counts.set(relationship.kind, (counts.get(relationship.kind) ?? 0) + 1);
      }
      expect(
        [...IFC_RELATIONSHIP_KINDS].map((kind) => ({ kind, count: counts.get(kind) ?? 0 })),
      ).toEqual([...EXPECTED_RELATIONSHIP_COUNTS]);
      const containment = result.relationships.find((r) => r.kind === "containment")!;
      expect(containment.label!.namespace).toBe("ifc-guid");
      expect(containment.label!.value).toBe("1xScRe4drECQ4DMSqUjdB1");
      expect(containment.relating.value).toBe("0vSTM8sWbCCwxCMX1XCK2l");
      expect(containment.related.map((label) => label.value)).toEqual(
        EXPECTED_ELEMENTS.map((element) => element.guid),
      );
    }
  });

  test("the honest omissions record every uninterpreted entity (visible losses)", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      expect(result.omissions).toHaveLength(13);
      const classesInOrder: string[] = [];
      for (const omission of result.omissions) {
        expect(omission.stepRef.namespace).toBe("ifc-step-ref");
        if (!classesInOrder.includes(omission.entityClass)) {
          classesInOrder.push(omission.entityClass);
        }
      }
      expect(classesInOrder).toEqual([...EXPECTED_OMITTED_CLASSES]);
      const skipped = result.omissions.filter(
        (omission) => omission.kind === "geometry-representation-skipped",
      );
      expect(skipped).toHaveLength(EXPECTED_SKIPPED_REPRESENTATION_COUNT);
      expect(skipped[0]!.entityClass).toBe("IFCPRODUCTDEFINITIONSHAPE");
      expect(skipped[0]!.stepRef.value).toBe("#18");
      const classificationReference = result.omissions.find(
        (omission) => omission.entityClass === "IFCCLASSIFICATIONREFERENCE",
      )!;
      expect(classificationReference.kind).toBe("attribute-out-of-scope");
      expect(classificationReference.stepRef.value).toBe("#41");
    }
  });

  test("the schema identifier and the model digest are read from the declared file", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      expect(result.schemaIdentifier).toBe(EXPECTED_SCHEMA_IDENTIFIER);
      expect(result.modelDigest).toBe(textDigestOf(MINIMAL_IFC4_STEP_TEXT));
    }
  });

  test("quantity units derive from the DECLARED model units (never the IFCSIUNIT table)", () => {
    expect(quantityUnitOf("length", MINIMAL_IFC4_MODEL_UNITS.linear)).toBe("m");
    expect(quantityUnitOf("area", MINIMAL_IFC4_MODEL_UNITS.linear)).toBe("m2");
    expect(quantityUnitOf("volume", MINIMAL_IFC4_MODEL_UNITS.linear)).toBe("m3");
    expect(quantityUnitOf("count", MINIMAL_IFC4_MODEL_UNITS.linear)).toBe(null);
    expect(quantityUnitOf("weight", MINIMAL_IFC4_MODEL_UNITS.linear)).toBe(null);
  });
});

describe("ifc — the substitution equivalence (two independent code paths)", () => {
  test("the statement scanner and the character tokenizer extract byte-identical semantics", () => {
    const reference = interpretThroughIfcPort(referenceIfcDouble, FULL_INTENTS_REQUEST);
    const alternate = interpretThroughIfcPort(alternateIfcDouble, FULL_INTENTS_REQUEST);
    expect(reference.ok).toBe(true);
    expect(alternate.ok).toBe(true);
    if (reference.ok && alternate.ok) {
      expect(reference.value.spatialNodes).toEqual(alternate.value.spatialNodes);
      expect(reference.value.elements).toEqual(alternate.value.elements);
      expect(reference.value.propertySets).toEqual(alternate.value.propertySets);
      expect(reference.value.quantitySets).toEqual(alternate.value.quantitySets);
      expect(reference.value.relationships).toEqual(alternate.value.relationships);
      expect(reference.value.omissions).toEqual(alternate.value.omissions);
      expect(reference.value.schemaIdentifier).toBe(alternate.value.schemaIdentifier);
    }
  });

  test("everything but the provider identity matches — and the result ids differ", () => {
    const reference = interpretFixture(referenceIfcDouble);
    const alternate = interpretFixture(alternateIfcDouble);
    expect(reference.modelDigest).toBe(alternate.modelDigest);
    expect(reference.provenance.inputDigest).toBe(alternate.provenance.inputDigest);
    expect(reference.provenance.parametersDigest).toBe(alternate.provenance.parametersDigest);
    expect(reference.provenance.providerDescriptorDigest).not.toBe(
      alternate.provenance.providerDescriptorDigest,
    );
    expect(reference.resultId).not.toBe(alternate.resultId);
  });

  test("determinism: the sealed id is the content digest of the result minus its own id", () => {
    for (const double of DOUBLES) {
      const first = interpretFixture(double.provider);
      const second = interpretFixture(double.provider);
      expect(first.resultId).toBe(second.resultId);
      const { resultId, ...body } = first;
      expect(resultId).toBe(canonicalDigestOf(body));
    }
  });
});

describe("ifc — intent gating and the typed refusal paths", () => {
  test("intent gating: a spatial-only request keeps the containment story, a no-intents request answers empty", () => {
    for (const double of DOUBLES) {
      const spatialOnly = interpretThroughIfcPort(double.provider, SPATIAL_ONLY_REQUEST);
      expect(spatialOnly.ok).toBe(true);
      if (spatialOnly.ok) {
        expect(spatialOnly.value.spatialNodes).toHaveLength(4);
        expect(spatialOnly.value.spatialNodes[3]!.containedBy!.value).toBe(
          EXPECTED_SPATIAL_TREE[2]!.guid,
        );
        /* Elements ride the spatial-containment intent: the
         * contained-in-spatial-structure edges ARE their containment. */
        expect(spatialOnly.value.elements).toHaveLength(4);
        expect(spatialOnly.value.elements.every((element) => element.classification === null)).toBe(
          true,
        );
        expect(spatialOnly.value.propertySets).toEqual([]);
        expect(spatialOnly.value.quantitySets).toEqual([]);
        expect(spatialOnly.value.relationships).toEqual([]);
        expect(spatialOnly.value.omissions).toHaveLength(13);
      }
      const noIntents = interpretThroughIfcPort(double.provider, NO_INTENTS_REQUEST);
      expect(noIntents.ok).toBe(true);
      if (noIntents.ok) {
        expect(noIntents.value.spatialNodes).toEqual([]);
        expect(noIntents.value.elements).toEqual([]);
        expect(noIntents.value.propertySets).toEqual([]);
        expect(noIntents.value.quantitySets).toEqual([]);
        expect(noIntents.value.relationships).toEqual([]);
        expect(noIntents.value.omissions).toHaveLength(13);
      }
    }
  });

  test("a schema-intent mismatch is a typed unsupported-data refusal naming both identifiers", () => {
    for (const double of DOUBLES) {
      const outcome = interpretThroughIfcPort(double.provider, INTENT_MISMATCH_REQUEST);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.failure.kind).toBe("unsupported-data");
        expect(outcome.failure.detail).toContain("schema-intent-mismatch");
        expect(outcome.failure.detail).toContain("IFC4");
        expect(outcome.failure.detail).toContain("IFC2X3");
        expect(outcome.failure.family).toBe("ifc");
      }
    }
  });

  test("malformed STEP and request-gate violations are distinct typed refusals", () => {
    const malformed: Record<string, unknown> = {
      ...FULL_INTENTS_REQUEST,
      model: {
        ...FULL_INTENTS_REQUEST.model,
        stepText: "ISO-10303-21;\nDATA;\n#1=IFCWALL('unterminated'\nENDSEC;\nEND-ISO-10303-21;",
      },
    };
    const malformedOutcome = interpretThroughIfcPort(
      referenceIfcDouble,
      malformed as unknown as IfcInterpretationRequest,
    );
    expect(malformedOutcome.ok).toBe(false);
    if (!malformedOutcome.ok) {
      expect(malformedOutcome.failure.kind).toBe("unsupported-data");
      expect(malformedOutcome.failure.detail).toContain("malformed-step");
    }
    const gateOutcome = interpretThroughIfcPort(referenceIfcDouble, NOT_STEP_REQUEST);
    expect(gateOutcome.ok).toBe(false);
    if (!gateOutcome.ok) {
      expect(gateOutcome.failure.kind).toBe("contract-mismatch");
      expect(gateOutcome.failure.detail).toContain("ISO-10303-21");
    }
  });
});

describe("ifc — the seam laws through the governed port", () => {
  test("reality seeds are content digests over (family, label, kind) — guids are never the identity", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      expect(result.aise.realityObjects).toHaveLength(8);
      const observed = result.aise.realityObjects.map((object) => object.kind);
      expect(observed).toEqual([
        "project",
        "site",
        "building",
        "storey",
        "wall",
        "slab",
        "opening_element",
        "door",
      ]);
      const guids = [
        ...EXPECTED_SPATIAL_TREE.map((node) => node.guid),
        ...EXPECTED_ELEMENTS.map((element) => element.guid),
      ];
      for (const object of result.aise.realityObjects) {
        expect(isCanonicalDigest(object.objectId)).toBe(true);
        expect(guids.includes(object.objectId)).toBe(false);
        expect(object.units).toEqual({ linear: "m", angular: "rad" });
        expect(object.contractVersion).toBe(CONTRACT_VERSION);
      }
    }
  });

  test("the wall's properties map to INFERRED assertions about the wall's digest id", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const wallObjectId = result.aise.realityObjects.find((object) => object.kind === "wall")!
        .objectId;
      expect(result.aise.propertyAssertions).toHaveLength(3);
      for (const assertion of result.aise.propertyAssertions) {
        expect(assertion.subjectRef).toBe(wallObjectId);
        expect(assertion.status).toBe("INFERRED");
        expect(assertion.method).toBe("interpretation.ifc");
        expect(assertion.source_evidence).toEqual([MINIMAL_IFC4_EVIDENCE_CONTENT_ID]);
        expect(isCanonicalDigest(assertion.assertionId)).toBe(true);
      }
      expect(result.aise.propertyAssertions.map((a) => a.property)).toEqual([
        "IsExternal",
        "LoadBearing",
        "ThermalTransmittance",
      ]);
      expect(result.aise.propertyAssertions.map((a) => a.value)).toEqual([true, false, 0.35]);
    }
  });

  test("the wall's quantities map to INFERRED measurements at the declared instant", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const wallObjectId = result.aise.realityObjects.find((object) => object.kind === "wall")!
        .objectId;
      expect(result.aise.measurements).toHaveLength(3);
      for (const measurement of result.aise.measurements) {
        expect(measurement.subjectRef).toBe(wallObjectId);
        expect(measurement.status).toBe("INFERRED");
        expect(measurement.method).toBe("interpretation.ifc");
        expect(measurement.measuredAt).toBe(MINIMAL_IFC4_RECORDED_AT);
        expect(measurement.evidenceContentIds).toEqual([MINIMAL_IFC4_EVIDENCE_CONTENT_ID]);
        expect(isCanonicalDigest(measurement.measurementId)).toBe(true);
      }
      expect(result.aise.measurements.map((m) => m.quantity)).toEqual(["length", "area", "volume"]);
      expect(result.aise.measurements.map((m) => m.value)).toEqual([6, 12.5, 2.875]);
      expect(result.aise.measurements.map((m) => m.unit)).toEqual(["m", "m2", "m3"]);
    }
  });

  test("the mapping block validates through the seam's own validator", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const externalLabels = [
        ...result.spatialNodes.flatMap((node) =>
          node.containedBy === null ? [node.label] : [node.label, node.containedBy],
        ),
        ...result.elements.flatMap((element) =>
          element.containedBy === null ? [element.label] : [element.label, element.containedBy],
        ),
        ...result.propertySets.map((pset) => pset.relates),
        ...result.quantitySets.map((qset) => qset.relates),
        ...result.relationships.flatMap((relationship) => [
          ...(relationship.label === null ? [] : [relationship.label]),
          relationship.relating,
          ...relationship.related,
        ]),
        ...result.omissions.map((omission) => omission.stepRef),
      ];
      const validation = validateAiseMappingBlock(result.aise, {
        externalLabelValues: externalLabelValuesOf(externalLabels),
        evidenceContentId: MINIMAL_IFC4_EVIDENCE_CONTENT_ID,
      });
      expect(validation.ok).toBe(true);
    }
  });

  test("the result validates through the family result validator", () => {
    for (const double of DOUBLES) {
      const result = interpretFixture(double.provider);
      const validation = validateIfcExtractionResult(result);
      expect(validation.ok).toBe(true);
    }
  });

  test("the governed port deep-freezes the request (non-interference)", () => {
    const request = {
      ...FULL_INTENTS_REQUEST,
      model: { ...FULL_INTENTS_REQUEST.model },
      intents: { ...FULL_INTENTS_REQUEST.intents },
    };
    const outcome = interpretThroughIfcPort(referenceIfcDouble, request);
    expect(outcome.ok).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(() => {
      (request as unknown as Record<string, unknown>)["schemaIntent"] = "IFC2X3";
    }).toThrow();
  });
});
