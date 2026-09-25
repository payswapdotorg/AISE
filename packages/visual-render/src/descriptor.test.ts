/**
 * HFX-303 tests — the visual-provider descriptor: validity, digests,
 * closed vocabularies, presentation-field exclusion, the lane-statement
 * seal and the negative cases.
 */

import { describe, expect, test } from "bun:test";
import {
  DESCRIPTOR_VALIDATION_FAILURE_KINDS,
  NUMERIC_CLAIM_POLICIES,
  VISUAL_CLASSES,
  VISUAL_LANE_STATEMENT,
  descriptorDigestOf,
  isVisualClass,
  isVisualDigest,
  validateVisualProviderDescriptor,
} from "./descriptor";
import { referenceVisualDescriptor } from "./providers/reference";
import { alternateVisualDescriptor } from "./providers/alternate";
import { failingVisualDescriptor } from "./providers/failing";

const ALL_DESCRIPTORS = [
  ["reference", referenceVisualDescriptor()],
  ["alternate", alternateVisualDescriptor()],
  ["failing", failingVisualDescriptor()],
] as const;

describe("visual-provider descriptor validity", () => {
  test("all three lane providers carry VALID descriptors (typed seal + closed vocabularies)", () => {
    for (const [name, descriptor] of ALL_DESCRIPTORS) {
      const validation = validateVisualProviderDescriptor(descriptor);
      expect(validation.ok).toBe(true);
      if (!validation.ok) continue;
      expect(validation.descriptor.providerId).toBe(descriptor.providerId);
      expect(isVisualDigest(validation.descriptorDigest)).toBe(true);
      expect(validation.descriptorDigest).toBe(descriptorDigestOf(descriptor));
      expect(descriptor.laneStatement).toBe(VISUAL_LANE_STATEMENT);
      expect(descriptor.capabilities.length).toBeGreaterThan(0);
      expect(descriptor.declaredLimitations.length).toBeGreaterThan(0);
      expect(descriptor.failureModes.length).toBeGreaterThan(0);
      expect(descriptor.numericClaimPolicy).toBe("illustrative-only");
      void name;
    }
  });

  test("the visual-class and numeric-claim vocabularies are the frozen closed lists", () => {
    expect([...VISUAL_CLASSES]).toEqual([
      "elevation-hypothesis",
      "material-study",
      "context-sketch",
    ]);
    expect([...NUMERIC_CLAIM_POLICIES]).toEqual(["illustrative-only"]);
    for (const kind of VISUAL_CLASSES) {
      expect(isVisualClass(kind)).toBe(true);
    }
    expect(isVisualClass("photorealistic-render")).toBe(false);
    expect(isVisualClass("")).toBe(false);
    expect(isVisualClass(42)).toBe(false);
  });

  test("the descriptor digest is DETERMINISTIC and excludes presentation-only fields", () => {
    const base = referenceVisualDescriptor();
    const renamed = {
      ...base,
      displayName: "A completely different display name",
      description: "A completely different description",
    };
    expect(descriptorDigestOf(renamed)).toBe(descriptorDigestOf(base));
    // Any semantic field changes the digest.
    const withOtherStyle = {
      ...base,
      presentationStyle: { name: "other", statement: "other" },
    };
    expect(descriptorDigestOf(withOtherStyle)).not.toBe(descriptorDigestOf(base));
    const withExtraLimitation = {
      ...base,
      declaredLimitations: [...base.declaredLimitations, "one more honest limit"],
    };
    expect(descriptorDigestOf(withExtraLimitation)).not.toBe(descriptorDigestOf(base));
  });

  test("the three providers have DISTINCT identities and digests", () => {
    const digests = ALL_DESCRIPTORS.map(([, descriptor]) => descriptorDigestOf(descriptor));
    expect(new Set(digests).size).toBe(3);
    const ids = ALL_DESCRIPTORS.map(([, descriptor]) => descriptor.providerId);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("visual-provider descriptor validation (negative cases)", () => {
  test("a non-object payload is refused with not-an-object", () => {
    for (const payload of [null, 42, "descriptor", [], true]) {
      const validation = validateVisualProviderDescriptor(payload);
      expect(validation.ok).toBe(false);
      if (validation.ok) continue;
      expect(validation.failures[0]?.kind).toBe("not-an-object");
    }
  });

  test("an invented visual class is a vocabulary-violation", () => {
    const validation = validateVisualProviderDescriptor({
      ...referenceVisualDescriptor(),
      capabilities: ["elevation-hypothesis", "photorealistic-walkthrough"],
    });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    const kinds = validation.failures.map((failure) => failure.kind);
    expect(kinds).toContain("vocabulary-violation");
  });

  test("an invented failure kind is a vocabulary-violation (closed vocabulary)", () => {
    const validation = validateVisualProviderDescriptor({
      ...referenceVisualDescriptor(),
      failureModes: [
        { kind: "made-up-failure", condition: "c", behavior: "b" },
      ],
    });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(
      validation.failures.some(
        (failure) =>
          failure.kind === "vocabulary-violation" && failure.path === "failureModes[0].kind",
      ),
    ).toBe(true);
  });

  test("an empty capability or limitation list is refused (empty-list)", () => {
    const noCapabilities = validateVisualProviderDescriptor({
      ...referenceVisualDescriptor(),
      capabilities: [],
    });
    expect(noCapabilities.ok).toBe(false);
    const noLimitations = validateVisualProviderDescriptor({
      ...referenceVisualDescriptor(),
      declaredLimitations: [],
    });
    expect(noLimitations.ok).toBe(false);
    if (noLimitations.ok || noCapabilities.ok) return;
    expect(noCapabilities.failures.some((f) => f.kind === "empty-list")).toBe(true);
    expect(noLimitations.failures.some((f) => f.kind === "empty-list")).toBe(true);
  });

  test("a weakened lane statement is refused (the descriptor cannot weaken the lane law)", () => {
    const validation = validateVisualProviderDescriptor({
      ...referenceVisualDescriptor(),
      laneStatement: "a helpful visual aid",
    });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(
      validation.failures.some((failure) => failure.path === "laneStatement"),
    ).toBe(true);
  });

  test("a non-illustrative-only numeric-claim policy is refused", () => {
    const validation = validateVisualProviderDescriptor({
      ...referenceVisualDescriptor(),
      numericClaimPolicy: "engineering-authoritative",
    });
    expect(validation.ok).toBe(false);
  });

  test("the failure-kind vocabulary of the kinds list matches the frozen set", () => {
    expect([...DESCRIPTOR_VALIDATION_FAILURE_KINDS]).toEqual([
      "not-an-object",
      "type-mismatch",
      "value-out-of-range",
      "empty-list",
      "vocabulary-violation",
    ]);
  });
});
