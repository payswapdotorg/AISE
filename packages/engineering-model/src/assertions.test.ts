/**
 * Property-assertion tests: the architecture §6 representation with
 * every rule enforced at construction — value/presence
 * exclusivity, estimate↔measurement binding, CONFIRMED requiring
 * provenance, CONFIRMED_ABSENT requiring affirmative evidence, and
 * confidence never substituting uncertainty.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import { propertyAssertion } from "./assertions.js";
import { estimateAssertion } from "./testing.js";

const CONFIRMED_ASSERTION = {
  key: "fireRating",
  quantity: { value: 60, unit: "meter" as const },
  status: "CONFIRMED" as const,
  kind: "measurement" as const,
  evidenceRefs: ["evidence-1"],
  verifiedBy: "engineer@site",
  verifiedAt: "2026-01-15T10:30:00Z",
};

describe("value/presence exclusivity", () => {
  it("accepts a quantity assertion", () => {
    expect(() => propertyAssertion(estimateAssertion("width", 4.1))).not.toThrow();
  });

  it("accepts a valueless presence assertion", () => {
    expect(() =>
      propertyAssertion({ key: "basement", presence: "NOT_OBSERVED", status: "INFERRED" }),
    ).not.toThrow();
    expect(() =>
      propertyAssertion({ key: "basement", presence: "OCCLUDED", status: "INFERRED" }),
    ).not.toThrow();
  });

  it("rejects quantity AND presence together (contradictory)", () => {
    expect(() =>
      propertyAssertion({
        key: "width",
        quantity: { value: 4, unit: "meter" },
        presence: "NOT_OBSERVED",
        status: "INFERRED",
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects neither quantity nor presence (asserts nothing)", () => {
    expect(() => propertyAssertion({ key: "width", status: "INFERRED" })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects UNKNOWN presence (asserts nothing, fail closed)", () => {
    expect(() =>
      propertyAssertion({ key: "width", presence: "UNKNOWN", status: "INFERRED" }),
    ).toThrow(EngineeringModelError);
  });
});

describe("estimate/measurement binding (AC-072, no silent upgrades)", () => {
  it("accepts an estimate in INFERRED or PROPOSED states", () => {
    expect(() => propertyAssertion(estimateAssertion("width", 4))).not.toThrow();
    expect(() =>
      propertyAssertion(estimateAssertion("designWidth", 4, { status: "PROPOSED" })),
    ).not.toThrow();
  });

  it("accepts a measurement only when directly supported (OBSERVED/CONFIRMED)", () => {
    expect(() =>
      propertyAssertion({
        key: "tapeLength",
        quantity: { value: 4.02, unit: "meter" },
        status: "OBSERVED",
        kind: "measurement",
        method: "manual/tape-v1",
      }),
    ).not.toThrow();
    expect(() => propertyAssertion(CONFIRMED_ASSERTION)).not.toThrow();
  });

  it("rejects kind measurement with INFERRED status (the silent-upgrade path)", () => {
    expect(() =>
      propertyAssertion({
        key: "width",
        quantity: { value: 4, unit: "meter" },
        status: "INFERRED",
        kind: "measurement",
      }),
    ).toThrow(EngineeringModelError);
    let thrown: EngineeringModelError | undefined;
    try {
      propertyAssertion({
        key: "width",
        quantity: { value: 4, unit: "meter" },
        status: "INFERRED",
        kind: "measurement",
      });
    } catch (caught) {
      thrown = caught as EngineeringModelError;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.code).toBe("MEASUREMENT_KIND_INVALID");
  });

  it("rejects kind measurement with PROPOSED status", () => {
    expect(() =>
      propertyAssertion({
        key: "designWidth",
        quantity: { value: 4, unit: "meter" },
        status: "PROPOSED",
        kind: "measurement",
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects kind on a valueless assertion", () => {
    expect(() =>
      propertyAssertion({ key: "basement", presence: "NOT_OBSERVED", status: "INFERRED", kind: "estimate" }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects unknown kind values (runtime guard)", () => {
    expect(() =>
      propertyAssertion({
        key: "width",
        quantity: { value: 4, unit: "meter" },
        status: "INFERRED",
        kind: "guess" as never,
      }),
    ).toThrow(EngineeringModelError);
  });
});

describe("CONFIRMED requires provenance (AC-062)", () => {
  it("accepts CONFIRMED with evidence, verifier, and timestamp", () => {
    expect(() => propertyAssertion(CONFIRMED_ASSERTION)).not.toThrow();
  });

  it("rejects CONFIRMED without evidence references", () => {
    const { evidenceRefs: _removed, ...withoutEvidence } = CONFIRMED_ASSERTION;
    expect(() => propertyAssertion(withoutEvidence)).toThrow(EngineeringModelError);
    try {
      propertyAssertion(withoutEvidence);
    } catch (error) {
      expect((error as EngineeringModelError).code).toBe("PROVENANCE_INCOMPLETE");
    }
  });

  it("rejects CONFIRMED with empty evidence references", () => {
    expect(() => propertyAssertion({ ...CONFIRMED_ASSERTION, evidenceRefs: [] })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects CONFIRMED without verifiedBy", () => {
    const { verifiedBy: _removed, ...withoutVerifier } = CONFIRMED_ASSERTION;
    expect(() => propertyAssertion(withoutVerifier)).toThrow(EngineeringModelError);
  });

  it("rejects CONFIRMED without a valid RFC 3339 UTC verifiedAt", () => {
    expect(() =>
      propertyAssertion({ ...CONFIRMED_ASSERTION, verifiedAt: "2026-01-15" }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      propertyAssertion({ ...CONFIRMED_ASSERTION, verifiedAt: "2026-01-15T10:30:00+02:00" }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      propertyAssertion({ ...CONFIRMED_ASSERTION, verifiedAt: "not-a-timestamp" }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects verification fields on non-CONFIRMED assertions", () => {
    expect(() =>
      propertyAssertion({
        ...estimateAssertion("width", 4),
        verifiedBy: "engineer@site",
      }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      propertyAssertion({ ...estimateAssertion("width", 4), verifiedAt: "2026-01-15T10:30:00Z" }),
    ).toThrow(EngineeringModelError);
  });
});

describe("CONFIRMED_ABSENT requires affirmative evidence (lock §2)", () => {
  it("accepts CONFIRMED_ABSENT with CONFIRMED status and evidence", () => {
    expect(() =>
      propertyAssertion({
        key: "basement",
        presence: "CONFIRMED_ABSENT",
        status: "CONFIRMED",
        evidenceRefs: ["evidence-slab-survey"],
        verifiedBy: "surveyor@site",
        verifiedAt: "2026-01-15T10:30:00Z",
      }),
    ).not.toThrow();
  });

  it("rejects NOT_OBSERVED → CONFIRMED_ABSENT without affirmative evidence", () => {
    expect(() =>
      propertyAssertion({ key: "basement", presence: "CONFIRMED_ABSENT", status: "NOT_OBSERVED" as never }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects CONFIRMED_ABSENT with CONFIRMED status but no evidence", () => {
    expect(() =>
      propertyAssertion({
        key: "basement",
        presence: "CONFIRMED_ABSENT",
        status: "CONFIRMED",
        verifiedBy: "surveyor@site",
        verifiedAt: "2026-01-15T10:30:00Z",
      }),
    ).toThrow(EngineeringModelError);
    try {
      propertyAssertion({
        key: "basement",
        presence: "CONFIRMED_ABSENT",
        status: "CONFIRMED",
        verifiedBy: "surveyor@site",
        verifiedAt: "2026-01-15T10:30:00Z",
      });
    } catch (error) {
      expect((error as EngineeringModelError).code).toBe("PRESENCE_INVALID");
    }
  });
});

describe("confidence is a separate axis from uncertainty (AC-070/071)", () => {
  it("accepts confidence on [0, 1] alongside uncertainty (distinct fields)", () => {
    expect(() =>
      propertyAssertion({
        ...estimateAssertion("width", 4),
        confidence: 0.87,
      }),
    ).not.toThrow();
  });

  it("accepts confidence without uncertainty and vice versa (never substitutes)", () => {
    expect(() =>
      propertyAssertion({
        key: "material",
        quantity: { value: 1, unit: "meter" },
        status: "INFERRED",
        kind: "estimate",
        confidence: 0.5,
      }),
    ).not.toThrow();
    expect(() => propertyAssertion(estimateAssertion("width", 4))).not.toThrow();
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(() => propertyAssertion({ ...estimateAssertion("width", 4), confidence: 1.5 })).toThrow(
      EngineeringModelError,
    );
    expect(() => propertyAssertion({ ...estimateAssertion("width", 4), confidence: -0.1 })).toThrow(
      EngineeringModelError,
    );
    expect(() =>
      propertyAssertion({ ...estimateAssertion("width", 4), confidence: Number.NaN }),
    ).toThrow(EngineeringModelError);
  });
});

describe("field validation", () => {
  it("validates property keys", () => {
    expect(() => propertyAssertion({ ...estimateAssertion("1bad", 4) })).toThrow(EngineeringModelError);
    expect(() => propertyAssertion({ ...estimateAssertion("bad key", 4) })).toThrow(EngineeringModelError);
    expect(() => propertyAssertion({ ...estimateAssertion("room.height", 4) })).not.toThrow();
  });

  it("validates quantity content through the quantity rules", () => {
    expect(() =>
      propertyAssertion(estimateAssertion("width", Number.POSITIVE_INFINITY)),
    ).toThrow(EngineeringModelError);
    expect(() =>
      propertyAssertion({ ...estimateAssertion("width", 4), quantity: { value: 4, unit: "cubit" as never } }),
    ).toThrow(EngineeringModelError);
  });

  it("validates evidence reference identities (pattern, duplicates)", () => {
    expect(() =>
      propertyAssertion({ ...CONFIRMED_ASSERTION, evidenceRefs: ["has space"] }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      propertyAssertion({ ...CONFIRMED_ASSERTION, evidenceRefs: ["ev-1", "ev-1"] }),
    ).toThrow(EngineeringModelError);
  });

  it("validates the epistemic state itself", () => {
    expect(() =>
      propertyAssertion({ ...estimateAssertion("width", 4), status: "GUESSED" as never }),
    ).toThrow(EngineeringModelError);
  });

  it("validates method labels", () => {
    expect(() => propertyAssertion({ ...estimateAssertion("width", 4), method: "" })).toThrow(
      EngineeringModelError,
    );
  });
});
