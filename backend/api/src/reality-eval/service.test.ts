/**
 * PROD-027 — the Layer-1 evaluation SERVICE tests (the deterministic
 * in-memory event-sourced evaluation registry + the harness orchestration).
 *
 * Proves:
 *  - the full evaluation lifecycle through the service: register →
 *    evaluation/start → scenario/evaluate (record + manifest returned as
 *    data; the lawful lifecycle events appended);
 *  - the typed error surface: unknown providers, invalid scenarios, the
 *    honest lane refusals, input/normalization boundary refusals — every
 *    refusal a typed `RealityEvalServiceError`, never a silent pass;
 *  - determinism: identical request sequences produce identical states and
 *    response bytes.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { RealityEvalService, RealityEvalServiceError } from "./service";
import {
  DEPTH_PROVIDER_ID,
  RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
  executeFixtureProvider,
  fixtureDepthProfileV1,
  fixtureReconstructionProfileV1,
  fixtureReconstructionProfileV2,
  realityEvalScenarioSet,
} from "./testkit";
import { completeScenario } from "./model";
import type { RealityEvalScenario } from "./model";

const SET = realityEvalScenarioSet();

function freshServiceWithFixtureProviders(): RealityEvalService {
  const service = new RealityEvalService();
  for (const profile of [
    fixtureReconstructionProfileV1(),
    fixtureReconstructionProfileV2(),
    fixtureDepthProfileV1(),
  ]) {
    service.register({ profile });
    service.startEvaluation({
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }
  return service;
}

function completedScenario(scenarioId: string): RealityEvalScenario {
  const descriptor = SET.scenarios.find((entry) => entry.scenarioId === scenarioId)!;
  const profile =
    descriptor.providerReference.providerId === DEPTH_PROVIDER_ID
      ? fixtureDepthProfileV1()
      : descriptor.providerReference.technologyVersion === RECONSTRUCTION_TECHNOLOGY_VERSION_V2
        ? fixtureReconstructionProfileV2()
        : fixtureReconstructionProfileV1();
  return completeScenario(descriptor, executeFixtureProvider(profile, descriptor.input));
}

describe("PROD-027 service: the evaluation lifecycle", () => {
  test("register + evaluation/start drive the control-plane states", () => {
    const service = new RealityEvalService();
    const registered = service.register({ profile: fixtureReconstructionProfileV1() });
    expect(registered.entry.state).toBe("registered");
    expect(registered.entry.capabilities).toEqual(["reconstruction"]);
    const started = service.startEvaluation({
      providerId: "fixture-reconstruction-provider",
      technologyVersion: "1.0.0-fixture-v1",
    });
    expect(started.entry.state).toBe("evaluation");
    expect(started.entry.normalizedExecutionCount).toBe(0);
  });

  test("registration is idempotent for the identical profile (the log stays canonical)", () => {
    const service = new RealityEvalService();
    service.register({ profile: fixtureReconstructionProfileV1() });
    const again = service.register({ profile: fixtureReconstructionProfileV1() });
    expect(again.entry.state).toBe("registered");
    expect(service.events().length).toBe(1);
  });

  test("scenario/evaluate answers the verdict + the record + the manifest and records the lifecycle events", () => {
    const service = freshServiceWithFixtureProviders();
    const response = service.evaluateScenarioRequest({
      scenario: completedScenario("recon-flagship-positive-001"),
    });
    expect(response.verdict).toBe("pass");
    expect(response.record.recordId).toMatch(/^[0-9a-f]{64}$/);
    expect(response.manifest.manifestId).toMatch(/^[0-9a-f]{64}$/);
    expect(response.manifest.benchmarkRecordReferences).toEqual([response.record.recordId]);
    expect(response.failureObservations).toEqual([]);
    // the lawful lifecycle events were appended
    expect(service.events().length).toBe(6 + 2);
    expect(service.events().slice(-2).map((event) => event.kind)).toEqual([
      "execution-normalized",
      "provenance-sealed",
    ]);
  });

  test("a discrimination evaluation through the service is CAUGHT (fail + recorded observations)", () => {
    const service = freshServiceWithFixtureProviders();
    const response = service.evaluateScenarioRequest({
      scenario: completedScenario("recon-flagship-discrimination-003"),
    });
    expect(response.verdict).toBe("fail");
    expect(response.discriminationCaught).toBe(true);
    expect(response.failureObservations.length).toBeGreaterThan(0);
    expect(response.criterionViolations.length).toBeGreaterThan(0);
  });

  test("queryRegistry answers the derived entry (normalized executions counted)", () => {
    const service = freshServiceWithFixtureProviders();
    service.evaluateScenarioRequest({ scenario: completedScenario("depth-wall-positive-005") });
    const query = service.queryRegistry({
      providerId: DEPTH_PROVIDER_ID,
      technologyVersion: "1.0.0-fixture-v1",
    });
    expect(query.entries[0]!.state).toBe("evaluation");
    expect(query.entries[0]!.normalizedExecutionCount).toBe(1);
    expect(query.entries[0]!.provenanceManifestCount).toBe(1);
  });

  test("identical request sequences produce identical response bytes (determinism)", () => {
    const first = freshServiceWithFixtureProviders();
    const second = freshServiceWithFixtureProviders();
    const scenario = completedScenario("recon-midrange-positive-002");
    const responseA = first.evaluateScenarioRequest({ scenario });
    const responseB = second.evaluateScenarioRequest({ scenario });
    expect(canonicalJsonStringify(responseB)).toBe(canonicalJsonStringify(responseA));
    expect(canonicalJsonStringify(second.events())).toBe(canonicalJsonStringify(first.events()));
  });
});

describe("PROD-027 service: the typed error surface", () => {
  test("evaluation before registration answers unknown_provider", () => {
    const service = new RealityEvalService();
    try {
      service.evaluateScenarioRequest({ scenario: completedScenario("recon-flagship-positive-001") });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(RealityEvalServiceError);
      expect((error as RealityEvalServiceError).code).toBe("unknown_provider");
    }
  });

  test("evaluation before evaluation-start answers provider_not_in_evaluated_state", () => {
    const service = new RealityEvalService();
    service.register({ profile: fixtureReconstructionProfileV1() });
    try {
      service.evaluateScenarioRequest({ scenario: completedScenario("recon-flagship-positive-001") });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect((error as RealityEvalServiceError).code).toBe("provider_not_in_evaluated_state");
    }
  });

  test("a malformed scenario answers invalid_scenario with the typed issues", () => {
    const service = freshServiceWithFixtureProviders();
    try {
      service.evaluateScenarioRequest({ scenario: { scenarioId: "broken" } });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect((error as RealityEvalServiceError).code).toBe("invalid_scenario");
      expect((error as RealityEvalServiceError).detail).toContain("typed validation");
    }
  });

  test("a capture-readiness scenario answers capability_lane_unavailable (the honest gap)", () => {
    const service = freshServiceWithFixtureProviders();
    const scenario = completedScenario("recon-flagship-positive-001");
    try {
      service.evaluateScenarioRequest({
        scenario: {
          ...scenario,
          scenarioId: "gap-001",
          capability: "capture-readiness",
          benchmarkId: "reality-eval-capture-readiness/1",
          input: { ...scenario.input, capability: "capture-readiness" },
          expected: { kind: "explicit-refusal" },
          criteria: { thresholds: [], expectedFailureKinds: ["timeout"] },
        },
      });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect((error as RealityEvalServiceError).code).toBe("capability_lane_unavailable");
    }
  });

  test("a provider-specific output type answers normalization_refused (the boundary guard)", () => {
    const service = freshServiceWithFixtureProviders();
    const scenario = completedScenario("recon-flagship-positive-001");
    const outputs = scenario.declaredExecution.outputs as Record<string, unknown>;
    try {
      service.evaluateScenarioRequest({
        scenario: {
          ...scenario,
          declaredExecution: {
            ...scenario.declaredExecution,
            outputs: { ...outputs, nativeMeshFormat: { vertices: 123 } },
          },
        },
      });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect((error as RealityEvalServiceError).code).toBe("normalization_refused");
      expect((error as RealityEvalServiceError).detail).toContain("contract-mismatch");
    }
  });

  test("an invalid profile answers invalid_profile", () => {
    const service = new RealityEvalService();
    const broken = fixtureReconstructionProfileV1() as unknown as Record<string, unknown>;
    delete broken["capabilities"];
    try {
      service.register({ profile: broken });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect((error as RealityEvalServiceError).code).toBe("invalid_profile");
    }
  });

  test("a semantically different profile under the same key answers registration_conflict", () => {
    const service = new RealityEvalService();
    service.register({ profile: fixtureReconstructionProfileV1() });
    // a presentation-only rename is idempotent (the digest excludes displayName)
    const renamed = {
      ...(fixtureReconstructionProfileV1() as unknown as Record<string, unknown>),
      displayName: "Renamed Fixture Provider",
    };
    service.register({ profile: renamed });
    // a semantic change under the same providerId+technologyVersion conflicts
    const conflicting = {
      ...(fixtureReconstructionProfileV1() as unknown as Record<string, unknown>),
      costProfile: {
        model: "per-invocation",
        unitCost: 1,
        currency: "EUR",
        quotaPolicy: "changed",
      },
    };
    try {
      service.register({ profile: conflicting });
      throw new Error("expected a typed refusal");
    } catch (error) {
      expect((error as RealityEvalServiceError).code).toBe("registration_conflict");
    }
  });
});
