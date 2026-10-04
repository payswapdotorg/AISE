/**
 * WORLD-P0-B — the SEAM test suite (colocated with `src/seam.ts`).
 *
 * Drills the shared law layer every family contract sits on: the lane
 * identity, the closed vocabularies (families, method identities, label
 * namespaces), the IFC-guid and canonical-digest shape guards, the
 * digest determinism discipline (the content-addressing heart), the
 * typed refusal helper, the provider descriptor digest, deep freeze
 * (the non-interference guard) and the AISE mapping-block validator
 * with its five mapping laws.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import {
  UNDERSTANDING_SUBSTRATE_LANE_ID,
  UNDERSTANDING_LANE_STATEMENT,
  SUBSTRATE_FAMILIES,
  SUBSTRATE_METHOD_IDENTITIES,
  SUBSTRATE_EXTRACTION_EPISTEMIC_STATUS,
  EXTERNAL_LABEL_NAMESPACES,
  IFC_GUID_PATTERN,
  CANONICAL_DIGEST_PATTERN,
  MAPPING_VALIDATION_FAILURE_KINDS,
  isSubstrateFamily,
  isExternalLabelNamespace,
  isIfcGuidShaped,
  externalLabelValuesOf,
  isCanonicalDigest,
  canonicalDigestOf,
  textDigestOf,
  refused,
  providerDescriptorDigestOf,
  validateAiseMappingBlock,
  deepFreeze,
  type SubstrateProviderDescriptor,
} from "./seam";

/** A lawful hand-built mapping block (the happy-path fixture). */
function lawfulMappingBlock(): Record<string, unknown> {
  const evidenceContentId = textDigestOf("seam-test-evidence-binding");
  const subjectRef = textDigestOf("seam-test-subject");
  return {
    derivation: {
      contractVersion: CONTRACT_VERSION,
      derivationId: canonicalDigestOf({ candidate: "derivation", fixture: "seam-test" }),
      outputContentId: canonicalDigestOf({ candidate: "output", fixture: "seam-test" }),
      inputEvidenceContentIds: [evidenceContentId],
      method: "field.scientific",
      methodVersion: "seam-test-double/1.0.0",
      parameters: { "seam.test": "deterministic" },
      createdAt: "2026-10-02T00:00:00.000Z",
    },
    realityObjects: [],
    propertyAssertions: [
      {
        contractVersion: CONTRACT_VERSION,
        assertionId: canonicalDigestOf({ candidate: "property-assertion", fixture: "seam-test" }),
        subjectRef,
        property: "seam-test-property",
        value: true,
        unit: null,
        status: "INFERRED",
        method: "field.scientific",
        source_evidence: [evidenceContentId],
        verified_by: null,
        verified_at: null,
      },
    ],
    measurements: [],
  };
}

describe("seam — lane identity and closed vocabularies", () => {
  test("the lane id is the understanding-substrate lane and the statement carries the law", () => {
    expect(UNDERSTANDING_SUBSTRATE_LANE_ID).toBe("understanding-substrate");
    expect(UNDERSTANDING_LANE_STATEMENT).toContain("REPLACEABLE implementation technologies");
    expect(UNDERSTANDING_LANE_STATEMENT).toContain("never become engineering authorities");
    expect(UNDERSTANDING_LANE_STATEMENT).toContain("INFERRED");
  });

  test("the substrate family vocabulary is closed and guarded", () => {
    expect([...SUBSTRATE_FAMILIES]).toEqual(["ifc", "geometry", "field"]);
    for (const family of SUBSTRATE_FAMILIES) {
      expect(isSubstrateFamily(family)).toBe(true);
    }
    expect(isSubstrateFamily("seam")).toBe(false);
    expect(isSubstrateFamily("world")).toBe(false);
    expect(isSubstrateFamily("")).toBe(false);
    expect(isSubstrateFamily(42)).toBe(false);
  });

  test("the method identities and the extraction epistemic status are closed", () => {
    expect([...SUBSTRATE_METHOD_IDENTITIES]).toEqual([
      "interpretation.ifc",
      "geometry.exact",
      "field.scientific",
    ]);
    expect(SUBSTRATE_EXTRACTION_EPISTEMIC_STATUS).toBe("INFERRED");
  });

  test("the external-label namespace vocabulary is closed and guarded", () => {
    expect([...EXTERNAL_LABEL_NAMESPACES]).toEqual([
      "ifc-guid",
      "ifc-step-ref",
      "ifc-class",
      "occt-topology",
      "vtk-dataobject",
    ]);
    for (const namespace of EXTERNAL_LABEL_NAMESPACES) {
      expect(isExternalLabelNamespace(namespace)).toBe(true);
    }
    expect(isExternalLabelNamespace("ifc-globalid")).toBe(false);
    expect(isExternalLabelNamespace("vtk")).toBe(false);
    expect(isExternalLabelNamespace(null)).toBe(false);
  });
});

describe("seam — shape guards (IFC GUIDs, canonical digests)", () => {
  test("an IFC GUID label is exactly 22 IFC-base64 characters", () => {
    expect(isIfcGuidShaped("0xScRe4drECQ4DMSqUjd6d")).toBe(true);
    expect(isIfcGuidShaped("2YBbeV$z5DZAMc0nC4rd6d")).toBe(true);
    expect(isIfcGuidShaped("0xScRe4drECQ4DMSqUjd6")).toBe(false); // 21 chars
    expect(isIfcGuidShaped("0xScRe4drECQ4DMSqUjd6dd")).toBe(false); // 23 chars
    expect(isIfcGuidShaped("0xScRe4drECQ4DMSqUjd-6d")).toBe(false); // '-' not in the alphabet
    expect(IFC_GUID_PATTERN.test("0xScRe4drECQ4DMSqUjd6d")).toBe(true);
    expect(isIfcGuidShaped(42)).toBe(false);
  });

  test("a canonical digest is exactly 64 lowercase hex characters", () => {
    expect(isCanonicalDigest("a".repeat(64))).toBe(true);
    expect(isCanonicalDigest("0123456789abcdef".repeat(4))).toBe(true);
    expect(isCanonicalDigest("A".repeat(64))).toBe(false); // uppercase rejected
    expect(isCanonicalDigest("g".repeat(64))).toBe(false); // not hex
    expect(isCanonicalDigest("a".repeat(63))).toBe(false); // too short
    expect(isCanonicalDigest("a".repeat(65))).toBe(false); // too long
    expect(isCanonicalDigest(null)).toBe(false);
    expect(CANONICAL_DIGEST_PATTERN.test(canonicalDigestOf({ a: 1 }))).toBe(true);
  });
});

describe("seam — the digest discipline (content addressing)", () => {
  test("canonicalDigestOf is deterministic and key-order independent", () => {
    const first = canonicalDigestOf({ b: 2, a: 1, nested: { y: [1, 2], x: "z" } });
    const second = canonicalDigestOf({ a: 1, b: 2, nested: { x: "z", y: [1, 2] } });
    expect(first).toBe(second);
    expect(canonicalDigestOf({ a: 1 })).not.toBe(canonicalDigestOf({ a: 2 }));
    expect(isCanonicalDigest(first)).toBe(true);
  });

  test("canonicalDigestOf is sha-256 over the canonical JSON wire bytes", () => {
    const value = { b: 2, a: 1 };
    const canonicalJson = `${JSON.stringify({ a: 1, b: 2 }, null, 2)}\n`;
    const expected = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
    expect(canonicalDigestOf(value)).toBe(expected);
  });

  test("textDigestOf matches the published sha-256 vectors", () => {
    expect(textDigestOf("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(textDigestOf("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(textDigestOf("AISE-WORLD-P0-B")).toBe(
      createHash("sha256").update("AISE-WORLD-P0-B", "utf8").digest("hex"),
    );
  });
});

describe("seam — typed refusals and the provider descriptor", () => {
  test("refused() answers a discriminated typed failure, never a throw", () => {
    const outcome = refused<string>("geometry", "contract-mismatch", "tolerance-must-be-declared");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.family).toBe("geometry");
      expect(outcome.failure.detail).toBe("tolerance-must-be-declared");
    }
  });

  test("providerDescriptorDigestOf is the 64-hex content digest of the descriptor", () => {
    const descriptor: SubstrateProviderDescriptor = {
      providerId: "seam-test.double",
      family: "field",
      technologyVersion: "seam-test/1.0.0",
      engineNote: "test descriptor",
      laneStatement: UNDERSTANDING_LANE_STATEMENT,
    };
    const digest = providerDescriptorDigestOf(descriptor);
    expect(digest).toBe(canonicalDigestOf(descriptor));
    expect(isCanonicalDigest(digest)).toBe(true);
  });

  test("externalLabelValuesOf carries every label value in order (the identity-law scan set)", () => {
    const values = externalLabelValuesOf([
      { namespace: "ifc-guid", value: "0xScRe4drECQ4DMSqUjd6d" },
      { namespace: "occt-topology", value: "vertex-0" },
      { namespace: "vtk-dataobject", value: "vtk-structured-grid-0" },
    ]);
    expect(values).toEqual(["0xScRe4drECQ4DMSqUjd6d", "vertex-0", "vtk-structured-grid-0"]);
  });
});

describe("seam — the non-interference guard", () => {
  test("deepFreeze structurally freezes arrays and objects at every depth", () => {
    const value = deepFreeze({
      list: [{ x: 1 }],
      map: { nested: { y: 2 } },
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.list)).toBe(true);
    expect(Object.isFrozen(value.list[0])).toBe(true);
    expect(Object.isFrozen(value.map)).toBe(true);
    expect(Object.isFrozen(value.map.nested)).toBe(true);
    expect(() => {
      (value as { mutable?: number }).mutable = 1;
    }).toThrow();
    expect(() => {
      (value.list[0] as { x: number }).x = 99;
    }).toThrow();
  });
});

describe("seam — the AISE mapping-block validator (the five mapping laws)", () => {
  const evidenceContentId = textDigestOf("seam-test-evidence-binding");

  test("a lawful mapping block validates and round-trips the block", () => {
    const validation = validateAiseMappingBlock(lawfulMappingBlock(), {
      externalLabelValues: [],
      evidenceContentId,
    });
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.block.derivation.method).toBe("field.scientific");
      expect(validation.block.propertyAssertions).toHaveLength(1);
      expect(validation.block.realityObjects).toHaveLength(0);
    }
  });

  test("a substrate label in an id or subjectRef field is rejected as identity (law #1)", () => {
    const guid = "0xScRe4drECQ4DMSqUjd6d";
    const block = lawfulMappingBlock();
    (block.derivation as Record<string, unknown>)["derivationId"] = guid;
    const tamperedSubject = lawfulMappingBlock();
    const assertion = (tamperedSubject.propertyAssertions as Record<string, unknown>[])[0]!;
    assertion["subjectRef"] = "vertex-0";
    for (const payload of [block, tamperedSubject]) {
      const validation = validateAiseMappingBlock(payload, {
        externalLabelValues: [guid, "vertex-0"],
        evidenceContentId,
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(
          validation.failures.some((failure) => failure.kind === "external-label-as-canonical-identity"),
        ).toBe(true);
      }
    }
  });

  test("epistemic-status, method, evidence-binding and version violations are typed failures", () => {
    const observed = lawfulMappingBlock();
    ((observed.propertyAssertions as Record<string, unknown>[])[0]!)["status"] = "OBSERVED";
    const badMethod = lawfulMappingBlock();
    (badMethod.derivation as Record<string, unknown>)["method"] = "universe.magic";
    const badEvidence = lawfulMappingBlock();
    (badEvidence.derivation as Record<string, unknown>)["inputEvidenceContentIds"] = [
      textDigestOf("not-the-declared-evidence"),
    ];
    const badVersion = lawfulMappingBlock();
    (badVersion.derivation as Record<string, unknown>)["contractVersion"] = "2.0.0";
    const badId = lawfulMappingBlock();
    (badId.derivation as Record<string, unknown>)["derivationId"] = "not-a-digest";

    const cases: readonly [unknown, string][] = [
      [observed, "epistemic-status-violation"],
      [badMethod, "method-identity-violation"],
      [badEvidence, "evidence-binding-violation"],
      [badVersion, "contract-version-mismatch"],
      [badId, "digest-format"],
    ];
    for (const [payload, expectedKind] of cases) {
      const validation = validateAiseMappingBlock(payload, {
        externalLabelValues: [],
        evidenceContentId,
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.failures.some((failure) => failure.kind === expectedKind)).toBe(true);
      }
    }
    expect(validateAiseMappingBlock("not an object", {
      externalLabelValues: [],
      evidenceContentId,
    }).ok).toBe(false);
  });

  test("the mapping validation failure vocabulary is closed", () => {
    expect([...MAPPING_VALIDATION_FAILURE_KINDS]).toEqual([
      "not-an-object",
      "missing-field",
      "type-mismatch",
      "contract-version-mismatch",
      "digest-format",
      "external-label-as-canonical-identity",
      "epistemic-status-violation",
      "method-identity-violation",
      "evidence-binding-violation",
    ]);
  });
});
