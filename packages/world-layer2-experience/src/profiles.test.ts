/**
 * WORLD-P2 — the CONTROL-PLANE PROFILES test suite.
 *
 * Drills: the ten lane profiles validate through the provider registry's
 * OWN `validateProviderProfile` (15/15 mandatory fields); the profile
 * digests are content-derived and stable; the provider ids are unique;
 * the benchmark tables are honestly EMPTY (no fabricated measurements);
 * and the real-LLM-lane BLOCKED declaration is present in the
 * bounded-reasoning profiles' honest descriptions.
 */

import { describe, expect, test } from "bun:test";
import {
  MANDATORY_PROFILE_FIELDS,
  profileDigestOf,
  validateProviderProfile,
} from "@aise/provider-registry";
import {
  ACTION_AUDIT_CAPABILITY,
  BOUNDED_REASONING_CAPABILITY,
  CASE_CONTEXT_CAPABILITY,
  LAYER2_PROVIDER_PROFILES,
  LAYER2_PROFILE_LANE_ID,
  LAYER2_PROFILE_PROVIDER_IDS,
  MISSING_EVIDENCE_CAPABILITY,
  alternateReasonerProfile,
  referenceReasonerProfile,
} from "./profiles";

describe("profiles — the control-plane conformance", () => {
  test("all ten lane profiles validate through the registry's own validator", () => {
    expect(LAYER2_PROVIDER_PROFILES).toHaveLength(10);
    expect(MANDATORY_PROFILE_FIELDS).toHaveLength(15);
    for (const profile of LAYER2_PROVIDER_PROFILES) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok).toBe(true);
      if (!validation.ok) {
        throw new Error(
          validation.failures.map((failure) => `${failure.path}: ${failure.detail}`).join("; "),
        );
      }
    }
  });

  test("the profile digests are content-derived and deterministic", () => {
    for (const profile of LAYER2_PROVIDER_PROFILES) {
      const first = profileDigestOf(profile);
      const second = profileDigestOf(profile);
      expect(first).toBe(second);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the provider ids are unique across the ten profiles", () => {
    expect(new Set(LAYER2_PROFILE_PROVIDER_IDS).size).toBe(10);
  });

  test("the four capability ids cover the five family ports", () => {
    const capabilities = new Set(
      LAYER2_PROVIDER_PROFILES.flatMap((profile) => profile.capabilities),
    );
    expect(capabilities.has(CASE_CONTEXT_CAPABILITY)).toBe(true);
    expect(capabilities.has(MISSING_EVIDENCE_CAPABILITY)).toBe(true);
    expect(capabilities.has(BOUNDED_REASONING_CAPABILITY)).toBe(true);
    expect(capabilities.has(ACTION_AUDIT_CAPABILITY)).toBe(true);
    expect(capabilities.size).toBe(4);
    expect(LAYER2_PROFILE_LANE_ID).toBe("layer2-experience");
  });

  test("the benchmark tables are honestly EMPTY — no fabricated measurements", () => {
    for (const profile of LAYER2_PROVIDER_PROFILES) {
      expect(profile.benchmarkResults).toEqual([]);
    }
  });

  test("the LLM-lane BLOCKED declaration is recorded on the reasoning profiles", () => {
    for (const profile of [referenceReasonerProfile(), alternateReasonerProfile()]) {
      expect(profile.description).toContain("NO LLM");
      expect(profile.description).toContain("BLOCKED");
      /* The refusal-first failure mode is declared. */
      const insufficient = profile.failureModes.find(
        (mode) => mode.kind === "reasoning-failure",
      );
      expect(insufficient).toBeDefined();
      expect(insufficient!.behavior).toContain("INSUFFICIENT_EVIDENCE");
    }
  });

  test("the honesty notes keep confidence separate from measurement uncertainty", () => {
    for (const profile of LAYER2_PROVIDER_PROFILES) {
      expect(profile.uncertaintyCharacteristics.confidenceSeparateFromMeasurementUncertainty).toBe(
        true,
      );
    }
  });
});
