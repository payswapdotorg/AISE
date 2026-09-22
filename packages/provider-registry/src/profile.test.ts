/**
 * HFX-000 — the ProviderProfile schema + validator tests.
 *
 * Proves: the fifteen mandatory fields are all first-class (the work-order
 * coverage table), the license derivation invariant is enforced, the closed
 * vocabularities (modalities, failure kinds, cost models...) are enforced,
 * benchmarkResults are references only, and every refusal is a TYPED
 * failure — never a throw, never a silent coercion.
 */

import { describe, expect, test } from "bun:test";
import {
  MANDATORY_PROFILE_FIELDS,
  deriveEvaluationOnly,
  isProviderProfile,
  profileDigestOf,
  toLicenseDeclaration,
  validateProviderProfile,
} from "./profile";
import type { ProviderProfile } from "./profile";
import { referenceProviderProfileV1, referenceProviderProfileV2 } from "./testkit";

describe("mandatory field coverage (the work-order list)", () => {
  test("all fifteen mandatory provider-evaluation fields are first-class on the profile", () => {
    const profile: ProviderProfile = referenceProviderProfileV1();
    for (const field of MANDATORY_PROFILE_FIELDS) {
      expect(Object.hasOwn(profile, field), `${field} present`).toBe(true);
    }
    expect(MANDATORY_PROFILE_FIELDS).toHaveLength(15);
  });

  test("the reference profiles validate cleanly with stable digests", () => {
    for (const profile of [referenceProviderProfileV1(), referenceProviderProfileV2()]) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok).toBe(true);
      if (validation.ok) {
        expect(validation.profileDigest).toBe(profileDigestOf(profile));
        expect(validation.profileDigest).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(profileDigestOf(referenceProviderProfileV1())).not.toBe(
      profileDigestOf(referenceProviderProfileV2()),
    );
  });
});

describe("the license/use gate input (dataset/model-use rule)", () => {
  test("evaluationOnly derives as NOT(commercialUse AND intendedUseCleared)", () => {
    expect(
      deriveEvaluationOnly({ commercialUse: true, intendedUseCleared: true }),
    ).toBe(false);
    expect(
      deriveEvaluationOnly({ commercialUse: true, intendedUseCleared: false }),
    ).toBe(true);
    expect(
      deriveEvaluationOnly({ commercialUse: false, intendedUseCleared: true }),
    ).toBe(true);
    expect(
      deriveEvaluationOnly({ commercialUse: false, intendedUseCleared: false }),
    ).toBe(true);
  });

  test("toLicenseDeclaration derives the flag onto the declaration", () => {
    const declaration = toLicenseDeclaration({
      identifier: "x",
      commercialUse: false,
      intendedUse: "research",
      intendedUseCleared: false,
    });
    expect(declaration.evaluationOnly).toBe(true);
  });

  test("an inconsistent derived flag is a typed license-flag-inconsistent failure", () => {
    const profile = referenceProviderProfileV1();
    const tampered = {
      ...profile,
      license: { ...profile.license, evaluationOnly: true }, // derived says false
    };
    const validation = validateProviderProfile(tampered);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failure = validation.failures.find((f) => f.kind === "license-flag-inconsistent");
      expect(failure?.path).toBe("license.evaluationOnly");
      expect(failure?.detail).toContain("derived evaluationOnly flag is false");
    }
  });
});

describe("typed negative paths (no throws, closed vocabularies)", () => {
  test("a non-object payload answers not-an-object", () => {
    for (const payload of [null, 42, "profile", [], true]) {
      const validation = validateProviderProfile(payload);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.failures[0]?.kind).toBe("not-an-object");
      }
    }
  });

  test("a wrong typed seal is refused", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({ ...profile, kind: "vendor-profile" });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((f) => f.path === "kind")).toBe(true);
    }
  });

  test("an invented failure kind is a typed vocabulary-violation (profiles cannot invent failure kinds)", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({
      ...profile,
      failureModes: [
        ...profile.failureModes,
        { kind: "vibes-failure", condition: "c", behavior: "b" },
      ],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failure = validation.failures.find((f) => f.kind === "vocabulary-violation");
      expect(failure?.path).toBe("failureModes[2].kind");
      expect(failure?.detail).toContain("CLOSED failure vocabulary");
    }
  });

  test("an unknown modality is a typed vocabulary-violation", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({
      ...profile,
      supportedModalities: ["smell"],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((f) => f.path === "supportedModalities[0]"),
      ).toBe(true);
    }
  });

  test("inlined benchmark scores are refused — benchmarkResults are references only", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({
      ...profile,
      benchmarkResults: [{ metric: "depth_mae_m", value: 0 }],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failure = validation.failures.find((f) => f.path === "benchmarkResults[0]");
      expect(failure?.detail).toContain("RECORD REFERENCE");
    }
  });

  test("a none cost model with a nonzero unit cost is a typed cost-model-inconsistent failure", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({
      ...profile,
      costProfile: { ...profile.costProfile, unitCost: 0.01 },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((f) => f.kind === "cost-model-inconsistent"),
      ).toBe(true);
    }
  });

  test("a duplicate contract field name is a typed duplicate-contract-field failure", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({
      ...profile,
      outputContract: {
        ...profile.outputContract,
        fields: [...profile.outputContract.fields, { ...profile.outputContract.fields[0]! }],
      },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((f) => f.kind === "duplicate-contract-field"),
      ).toBe(true);
    }
  });

  test("empty mandatory lists are typed empty-list failures", () => {
    for (const field of ["capabilities", "supportedModalities", "failureModes"] as const) {
      const profile = referenceProviderProfileV1();
      const validation = validateProviderProfile({ ...profile, [field]: [] });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(
          validation.failures.some((f) => f.kind === "empty-list" && f.path === field),
        ).toBe(true);
      }
    }
  });

  test("out-of-range numeric profile fields are typed value-out-of-range failures", () => {
    const profile = referenceProviderProfileV1();
    const validation = validateProviderProfile({
      ...profile,
      latencyProfile: { ...profile.latencyProfile, expectedMsP95: -1 },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some(
          (f) => f.kind === "value-out-of-range" && f.path === "latencyProfile.expectedMsP95",
        ),
      ).toBe(true);
    }
  });

  test("multiple failures are collected at once (never early-exit)", () => {
    const validation = validateProviderProfile({ nonsense: true });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.length).toBeGreaterThan(5);
    }
  });
});

describe("identity (the content-address discipline)", () => {
  test("presentation fields are excluded from the digest — renaming is not a semantic change", () => {
    const profile = referenceProviderProfileV1();
    const renamed = {
      ...profile,
      displayName: "A Completely Different Name",
      description: "Different wording, same evaluation semantics.",
    };
    expect(profileDigestOf(renamed)).toBe(profileDigestOf(profile));
  });

  test("a semantic change re-addresses the profile", () => {
    const profile = referenceProviderProfileV1();
    const changed = {
      ...profile,
      capabilities: [...profile.capabilities, "fixture-additional-capability"],
    };
    expect(profileDigestOf(changed)).not.toBe(profileDigestOf(profile));
  });

  test("isProviderProfile is the fast structural seal guard", () => {
    expect(isProviderProfile(referenceProviderProfileV1())).toBe(true);
    expect(isProviderProfile({})).toBe(false);
    expect(isProviderProfile(null)).toBe(false);
  });
});
