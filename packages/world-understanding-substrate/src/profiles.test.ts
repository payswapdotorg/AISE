/**
 * WORLD-P0-B — the CONTROL-PLANE PROFILES test suite (colocated with
 * `src/profiles.ts`).
 *
 * Drills the six substitution-double profiles against the HFX-000
 * control plane's OWN machinery: every profile validates through
 * `validateProviderProfile` (all fifteen mandatory fields), the profile
 * identities cross-check against the seam descriptors of the six
 * in-repo doubles, the capability/modality/contract declarations match
 * the family ports, the license declarations are the fixture-permissive
 * bound, the failure modes come from the closed vocabulary, the
 * benchmark tables are honestly empty (no real measurements exist in
 * P0), and the profile digests are deterministic and
 * presentation-independent.
 */

import { describe, expect, test } from "bun:test";
import {
  EXACT_GEOMETRY_CAPABILITY,
  IFC_INTERPRETATION_CAPABILITY,
  SCIENTIFIC_FIELD_CAPABILITY,
  SUBSTRATE_LANE_ID,
  SUBSTRATE_PROFILE_PROVIDER_IDS,
  SUBSTRATE_PROVIDER_PROFILES,
  alternateFieldProfile,
  alternateGeometryProfile,
  alternateIfcProfile,
  referenceFieldProfile,
  referenceGeometryProfile,
  referenceIfcProfile,
} from "./profiles";
import {
  ALTERNATE_FIELD_DOUBLE_DESCRIPTOR,
  REFERENCE_FIELD_DOUBLE_DESCRIPTOR,
} from "./field";
import {
  ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR,
  REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR,
} from "./geometry";
import { ALTERNATE_IFC_DOUBLE_DESCRIPTOR, REFERENCE_IFC_DOUBLE_DESCRIPTOR } from "./ifc";
import { isCanonicalDigest } from "./seam";
import {
  FAILURE_KINDS,
  profileDigestOf,
  validateProviderProfile,
  type ProviderProfile,
} from "@aise/provider-registry";

/** The six profile constructors in (family, role) table order. */
const PROFILE_CONSTRUCTORS: readonly (() => ProviderProfile)[] = [
  referenceIfcProfile,
  alternateIfcProfile,
  referenceGeometryProfile,
  alternateGeometryProfile,
  referenceFieldProfile,
  alternateFieldProfile,
];

/** The six seam descriptors in the same order. */
const DESCRIPTORS = [
  REFERENCE_IFC_DOUBLE_DESCRIPTOR,
  ALTERNATE_IFC_DOUBLE_DESCRIPTOR,
  REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR,
  ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR,
  REFERENCE_FIELD_DOUBLE_DESCRIPTOR,
  ALTERNATE_FIELD_DOUBLE_DESCRIPTOR,
] as const;

describe("profiles — the lane table", () => {
  test("the lane id and the three capability ids are the control-plane strings", () => {
    expect(SUBSTRATE_LANE_ID).toBe("understanding-substrate");
    expect(IFC_INTERPRETATION_CAPABILITY).toBe("world-ifc-interpretation");
    expect(EXACT_GEOMETRY_CAPABILITY).toBe("world-exact-geometry");
    expect(SCIENTIFIC_FIELD_CAPABILITY).toBe("world-scientific-field");
  });

  test("the profile table carries six profiles in (family, role) order", () => {
    expect(SUBSTRATE_PROVIDER_PROFILES).toHaveLength(6);
    expect(SUBSTRATE_PROFILE_PROVIDER_IDS).toEqual([
      "understanding-substrate.ifc.reference-double",
      "understanding-substrate.ifc.alternate-double",
      "understanding-substrate.geometry.reference-double",
      "understanding-substrate.geometry.alternate-double",
      "understanding-substrate.field.reference-double",
      "understanding-substrate.field.alternate-double",
    ]);
    expect(SUBSTRATE_PROVIDER_PROFILES.map((profile) => profile.providerId)).toEqual([
      ...SUBSTRATE_PROFILE_PROVIDER_IDS,
    ]);
  });

  test("every profile validates through the control plane's own validator", () => {
    for (const construct of PROFILE_CONSTRUCTORS) {
      const validation = validateProviderProfile(construct());
      expect(validation.ok).toBe(true);
      if (validation.ok) {
        expect(isCanonicalDigest(validation.profileDigest)).toBe(true);
      }
    }
  });

  test("every profile's identity matches its double's seam descriptor", () => {
    for (let index = 0; index < PROFILE_CONSTRUCTORS.length; index += 1) {
      const profile = PROFILE_CONSTRUCTORS[index]!();
      const descriptor = DESCRIPTORS[index]!;
      expect(profile.providerId).toBe(descriptor.providerId);
      expect(profile.technologyVersion).toBe(descriptor.technologyVersion);
    }
  });

  test("each family's profiles claim exactly the family capability with the family modalities", () => {
    for (const construct of [referenceIfcProfile, alternateIfcProfile]) {
      const profile = construct();
      expect(profile.capabilities).toEqual([IFC_INTERPRETATION_CAPABILITY]);
      expect(profile.supportedModalities).toEqual(["document", "table"]);
    }
    for (const construct of [referenceGeometryProfile, alternateGeometryProfile]) {
      const profile = construct();
      expect(profile.capabilities).toEqual([EXACT_GEOMETRY_CAPABILITY]);
      expect(profile.supportedModalities).toEqual(["table"]);
    }
    for (const construct of [referenceFieldProfile, alternateFieldProfile]) {
      const profile = construct();
      expect(profile.capabilities).toEqual([SCIENTIFIC_FIELD_CAPABILITY]);
      expect(profile.supportedModalities).toEqual(["table"]);
    }
  });

  test("the input and output contracts mirror the family ports' shapes", () => {
    const ifc = referenceIfcProfile();
    expect(ifc.inputContract.contractId).toBe("ifc-interpretation-request/1");
    expect(ifc.inputContract.modality).toBe("document");
    expect(ifc.inputContract.fields.map((field) => field.name)).toEqual([
      "stepText",
      "schemaIntent",
      "evidenceContentId",
    ]);
    expect(ifc.outputContract.contractId).toBe("ifc-interpretation-result/1");
    const geometry = referenceGeometryProfile();
    expect(geometry.inputContract.contractId).toBe("geometry-computation-request/1");
    expect(geometry.inputContract.modality).toBe("table");
    expect(geometry.inputContract.fields.map((field) => field.name)).toContain("linearTolerance");
    expect(geometry.outputContract.contractId).toBe("geometry-computation-result/1");
    const field = referenceFieldProfile();
    expect(field.inputContract.contractId).toBe("field-computation-request/1");
    expect(field.inputContract.modality).toBe("table");
    expect(field.inputContract.fields.map((f) => f.name)).toEqual([
      "nodeCount",
      "valueTolerance",
      "evidenceContentId",
    ]);
    expect(field.outputContract.contractId).toBe("field-computation-result/1");
  });

  test("the license declarations are the fixture-permissive bound with cleared intended use", () => {
    for (const construct of PROFILE_CONSTRUCTORS) {
      const profile = construct();
      expect(profile.license.identifier).toBe("fixture-permissive-1.0");
      expect(profile.license.commercialUse).toBe(true);
      expect(profile.license.intendedUseCleared).toBe(true);
      expect(profile.license.intendedUse).toContain("no substrate integrated");
    }
  });

  test("the failure modes come from the closed HFX-000 vocabulary", () => {
    for (const construct of PROFILE_CONSTRUCTORS) {
      const profile = construct();
      expect(profile.failureModes.length).toBeGreaterThan(0);
      for (const failureMode of profile.failureModes) {
        expect((FAILURE_KINDS as readonly string[]).includes(failureMode.kind)).toBe(true);
      }
    }
  });

  test("the benchmark tables are honestly empty — no real measurements exist in P0", () => {
    for (const construct of PROFILE_CONSTRUCTORS) {
      expect(construct().benchmarkResults).toEqual([]);
    }
  });

  test("the descriptions carry the no-substrate honesty bound", () => {
    expect(referenceIfcProfile().description).toContain("no IfcOpenShell, no web-ifc");
    expect(alternateIfcProfile().description).toContain("independent code");
    expect(referenceGeometryProfile().description).toContain("no OCCT");
    expect(alternateGeometryProfile().description).toContain("independent");
    expect(referenceFieldProfile().description).toContain("no ParaView");
    expect(alternateFieldProfile().description).toContain("independent");
  });

  test("profile construction is deterministic and the digests are stable", () => {
    for (let index = 0; index < PROFILE_CONSTRUCTORS.length; index += 1) {
      const first = PROFILE_CONSTRUCTORS[index]!();
      const second = PROFILE_CONSTRUCTORS[index]!();
      expect(first).toEqual(second);
      expect(profileDigestOf(first)).toBe(profileDigestOf(second));
      expect(first).toEqual(SUBSTRATE_PROVIDER_PROFILES[index]!);
    }
  });

  test("profileDigestOf excludes the presentation fields (displayName and description)", () => {
    const profile = referenceGeometryProfile();
    const renamed: ProviderProfile = {
      ...profile,
      displayName: "A purely presentational rename",
      description: "A purely presentational rewrite of the description.",
    };
    expect(profileDigestOf(renamed)).toBe(profileDigestOf(profile));
  });
});
