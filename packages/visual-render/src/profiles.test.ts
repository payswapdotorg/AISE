/**
 * HFX-303 tests — the control-plane profiles: the three lane providers
 * are representable by HFX-000's ProviderProfile (15/15 mandatory
 * fields), validate through the control plane's own validator, and
 * register lawfully in the append-only registry.
 */

import { describe, expect, test } from "bun:test";
import {
  MANDATORY_PROFILE_FIELDS,
  applyRegistryEvent,
  createProviderRegistry,
  profileDigestOf,
  validateProviderProfile,
} from "@aise/provider-registry";
import {
  VISUAL_LANE_CAPABILITY,
  alternateVisualProfile,
  failingVisualProfile,
  referenceVisualProfile,
} from "./profiles";
import { createReferenceVisualProvider } from "./providers/reference";
import { createAlternateVisualProvider } from "./providers/alternate";
import { createFailingVisualProvider } from "./providers/failing";

const PROFILES = [
  ["reference", referenceVisualProfile()],
  ["alternate", alternateVisualProfile()],
  ["failing", failingVisualProfile()],
] as const;

describe("the control-plane profiles of the visual lane providers", () => {
  test("all three profiles are VALID ProviderProfiles through the control plane's own validator", () => {
    for (const [name, profile] of PROFILES) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok).toBe(true);
      if (!validation.ok) {
        // eslint-disable-next-line no-console
        console.error(`${name}: ${JSON.stringify(validation.failures)}`);
        continue;
      }
      // 15/15 mandatory fields present.
      for (const field of MANDATORY_PROFILE_FIELDS) {
        expect((profile as unknown as Record<string, unknown>)[field]).not.toBeUndefined();
      }
      expect(profile.capabilities).toContain(VISUAL_LANE_CAPABILITY);
      expect(profile.license.evaluationOnly).toBe(false);
      void name;
    }
  });

  test("the profile digests are deterministic and distinct", () => {
    const digests = PROFILES.map(([, profile]) => profileDigestOf(profile));
    expect(new Set(digests).size).toBe(3);
    expect(profileDigestOf(referenceVisualProfile())).toBe(digests[0] ?? "missing-digest");
  });

  test("the declared input/output contracts carry the lane's shapes (closed field vocabulary)", () => {
    for (const [, profile] of PROFILES) {
      const inputNames = profile.inputContract.fields.map((field) => field.name);
      expect(inputNames).toContain("visualClass");
      expect(inputNames).toContain("stateId");
      expect(inputNames).toContain("stateIndex");
      expect(profile.inputContract.modality).toBe("text");
      expect(profile.outputContract.modality).toBe("image");
      const outputNames = profile.outputContract.fields.map((field) => field.name);
      expect(outputNames).toEqual(["artifactId", "svg", "excessRegionCount"]);
      expect(profile.provenanceContract.nativePayloadPolicy).toBe("none");
    }
  });

  test("the descriptors and the control-plane profiles agree on identity (id + version)", () => {
    const pairs = [
      [referenceVisualProfile(), createReferenceVisualProvider().descriptor],
      [alternateVisualProfile(), createAlternateVisualProvider().descriptor],
      [failingVisualProfile(), createFailingVisualProvider().descriptor],
    ] as const;
    for (const [profile, descriptor] of pairs) {
      expect(profile.providerId).toBe(descriptor.providerId);
      expect(profile.technologyVersion).toBe(descriptor.technologyVersion);
    }
  });

  test("the three providers REGISTER lawfully in the append-only control-plane registry", () => {
    let registry = createProviderRegistry();
    for (const [, profile] of PROFILES) {
      const result = applyRegistryEvent(registry, {
        kind: "provider-registered",
        profile,
      });
      if (!result.ok) {
        throw new Error(`registration refused: ${JSON.stringify(result.failure)}`);
      }
      registry = result.registry;
    }
    expect(registry.entries.length).toBe(3);
    for (const [, profile] of PROFILES) {
      const entry = registry.entryOf(profile.providerId, profile.technologyVersion);
      expect(entry === undefined ? "missing" : entry.state).toBe("registered");
    }
    // Re-registering the identical profile is a no-op (canonical log).
    const reRegister = applyRegistryEvent(registry, {
      kind: "provider-registered",
      profile: referenceVisualProfile(),
    });
    expect(reRegister.ok).toBe(true);
    if (reRegister.ok) {
      expect(reRegister.registry.entries.length).toBe(3);
    }
  });
});
