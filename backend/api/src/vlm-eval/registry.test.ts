/**
 * HFX-201 — the REGISTRY tests: both Qwen3-VL profiles registered as
 * separate entries through the control plane, every benchmark result a
 * valid content-addressed `BenchmarkRecord` with the comparability join,
 * the provenance manifests sealed + verified, the lifecycle replayable,
 * and the promotion gate REFUSING the evaluation-only candidates with the
 * typed license-blocked refusal.
 */

import { describe, expect, test } from "bun:test";
import {
  applyRegistryEvent,
  benchmarkComparabilityKey,
  createProviderRegistry,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import { canonicalJsonText } from "../reasoning-eval/model";
import { runVlmBenchmarkLifecycle, consolidatedVariantRecord, VLM_EVAL_ENVIRONMENT, VLM_EVAL_CONSUMER } from "./registry";
import { qwen3Vl8bProfile, qwen3Vl30bA3bProfile } from "./model";
import { evaluateVlmRunCorpus } from "./harness";

describe("HFX-201 registry: the registration of both candidate profiles", () => {
  test("both profiles register as SEPARATE entries (distinct keys, same family)", () => {
    let registry = createProviderRegistry();
    const first = applyRegistryEvent(registry, { kind: "provider-registered", profile: qwen3Vl8bProfile() });
    expect(first.ok).toBe(true);
    registry = first.ok ? first.registry : registry;
    const second = applyRegistryEvent(registry, {
      kind: "provider-registered",
      profile: qwen3Vl30bA3bProfile(),
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.registry.entries.length).toBe(2);
      expect(second.registry.entries.map((entry) => entry.providerId).sort()).toEqual([
        "qwen3-vl-30b-a3b",
        "qwen3-vl-8b",
      ]);
    }
  });

  test("re-registering the identical profile is idempotent; a different profile under the same key is refused", () => {
    let registry = createProviderRegistry();
    const first = applyRegistryEvent(registry, { kind: "provider-registered", profile: qwen3Vl8bProfile() });
    expect(first.ok).toBe(true);
    registry = first.ok ? first.registry : registry;
    const idempotent = applyRegistryEvent(registry, {
      kind: "provider-registered",
      profile: qwen3Vl8bProfile(),
    });
    expect(idempotent.ok && idempotent.registry.events.length).toBe(1);
    const mutated = qwen3Vl8bProfile();
    const conflict = applyRegistryEvent(registry, {
      kind: "provider-registered",
      profile: {
        ...mutated,
        latencyProfile: { ...mutated.latencyProfile, expectedMsP50: 999 },
      },
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.failure.kind).toBe("registration-conflict");
    }
  });
});

describe("HFX-201 registry: the consolidated benchmark records", () => {
  const outcomes = evaluateVlmRunCorpus();

  test("every variant's consolidated record is a VALID content-addressed BenchmarkRecord", () => {
    for (const variant of ["qwen3-vl-8b", "qwen3-vl-30b-a3b"] as const) {
      const record = consolidatedVariantRecord(variant, outcomes);
      const validation = validateBenchmarkRecord(record);
      expect(validation.ok).toBe(true);
      expect(record.providerId).toBe(variant);
      expect(record.technologyVersion).toBe(
        variant === "qwen3-vl-8b" ? "8b-eval-doubles-1" : "30b-a3b-eval-doubles-1",
      );
      expect(record.recordId).toMatch(/^[0-9a-f]{64}$/);
      expect(record.metrics.length).toBe(6);
      expect(record.reproduction.inputsDigest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the records are COMPARABLE: same benchmark id + capability (the future real-model join)", () => {
    const record8 = consolidatedVariantRecord("qwen3-vl-8b", outcomes);
    const record30 = consolidatedVariantRecord("qwen3-vl-30b-a3b", outcomes);
    expect(benchmarkComparabilityKey(record8)).toBe(benchmarkComparabilityKey(record30));
    expect(benchmarkComparabilityKey(record8)).toBe(
      "qwen3-vl-multimodal-benchmark/1|multimodal-reasoning",
    );
    expect(record8.recordId).not.toBe(record30.recordId);
  });

  test("the records carry the declared resource profile and the closed-vocabulary failure observations", () => {
    const record8 = consolidatedVariantRecord("qwen3-vl-8b", outcomes);
    expect(record8.resourceObservations.compute).toContain("declared-profile");
    expect(record8.resourceObservations.memoryMiB).toBe(32768);
    expect(record8.resourceObservations.latencyMsP50).toBe(800);
    const record30 = consolidatedVariantRecord("qwen3-vl-30b-a3b", outcomes);
    expect(record30.resourceObservations.memoryMiB).toBe(98304);
    expect(record30.resourceObservations.latencyMsP95).toBe(4000);
    const observationKinds = new Set(record8.failureObservations.map((observation) => observation.kind));
    expect([...observationKidsSafe(observationKinds)].sort()).toEqual([
      "perception-failure",
      "reasoning-failure",
      "retrieval-failure",
      "unsupported-data",
    ]);
  });

  test("the uncertainty + matrix metrics are recorded (the §HF-1 exit-gate dimensions)", () => {
    const record8 = consolidatedVariantRecord("qwen3-vl-8b", outcomes);
    const metric = (name: string): number =>
      record8.metrics.find((entry) => entry.metric === name)?.value ?? -1;
    expect(metric("scenario_count")).toBe(12);
    expect(metric("classification_match")).toBe(1);
    expect(metric("expected_outcome_match")).toBe(1);
    expect(metric("grounded_check_failure_observations")).toBe(6);
    expect(metric("measurement_uncertainty_propagated")).toBe(2);
    expect(metric("behavior_matrix_cells_passed")).toBe(4);
  });
});

describe("HFX-201 registry: the full lifecycle (registration → evaluation → records → manifests → promotion refusal)", () => {
  const lifecycle = runVlmBenchmarkLifecycle();

  test("the event log carries both registrations, 24 normalized executions, 2 records, 2 manifests, 2 promotion decisions", () => {
    const count = (kind: string): number =>
      lifecycle.events.filter((event) => event.kind === kind).length;
    expect(count("provider-registered")).toBe(2);
    expect(count("evaluation-started")).toBe(2);
    expect(count("execution-normalized")).toBe(24);
    expect(count("benchmark-recorded")).toBe(2);
    expect(count("provenance-sealed")).toBe(2);
    expect(count("promotion-decided")).toBe(2);
  });

  test("the provenance manifests verify and pin the profile digests + input digests", () => {
    for (const variant of lifecycle.variants) {
      const verification = verifyProvenanceManifest(variant.provenanceManifest);
      expect(verification.ok).toBe(true);
      expect(variant.provenanceManifest.profileReference.providerId).toBe(variant.providerId);
      expect(variant.provenanceManifest.profileReference.profileDigest).toBe(variant.profileDigest);
      expect(variant.provenanceManifest.inputDigests.length).toBe(12);
      expect(variant.provenanceManifest.benchmarkRecordReferences).toEqual([
        variant.consolidatedRecord.recordId,
      ]);
      expect(variant.provenanceManifest.consumerIdentity).toEqual(VLM_EVAL_CONSUMER);
      expect(variant.provenanceManifest.environmentFingerprint).toEqual(VLM_EVAL_ENVIRONMENT);
    }
  });

  test("the license/use gate REFUSES both evaluation-only candidates (recorded, never silent)", () => {
    for (const variant of lifecycle.variants) {
      expect(variant.registryState).toBe("rejected");
      expect(variant.promotionRefusals.map((refusal) => refusal.kind)).toEqual(["license-blocked"]);
      expect(variant.promotionRefusals[0]?.detail).toContain("evaluation-only");
    }
    const decisions = lifecycle.events.filter((event) => event.kind === "promotion-decided");
    for (const decision of decisions) {
      if (decision.kind === "promotion-decided") {
        expect(decision.decision).toBe("rejected");
        expect(decision.refusals.map((refusal) => refusal.kind)).toEqual(["license-blocked"]);
      }
    }
  });

  test("the lifecycle is REPLAYABLE: the identical event log re-derives the identical registry", () => {
    expect(lifecycle.replayEqual).toBe(true);
  });

  test("the lifecycle is deterministic (two runs are byte-identical)", () => {
    const second = runVlmBenchmarkLifecycle();
    expect(canonicalJsonText(second.variants.map((variant) => ({
      variant: variant.variant,
      recordId: variant.consolidatedRecord.recordId,
      manifestId: variant.provenanceManifest.manifestId,
      refusals: variant.promotionRefusals,
    })))).toBe(
      canonicalJsonText(lifecycle.variants.map((variant) => ({
        variant: variant.variant,
        recordId: variant.consolidatedRecord.recordId,
        manifestId: variant.provenanceManifest.manifestId,
        refusals: variant.promotionRefusals,
      }))),
    );
    expect(second.comparison).toEqual(lifecycle.comparison);
  });

  test("the registry entries end in the rejected state with the records + manifests attached", () => {
    for (const entry of lifecycle.registry.entries) {
      expect(entry.state).toBe("rejected");
      expect(entry.benchmarkRecords.length).toBe(1);
      expect(entry.provenanceManifests.length).toBe(1);
      expect(entry.normalizedExecutions.length).toBe(12);
    }
  });
});

function observationKidsSafe(kinds: Set<string>): Set<string> {
  return kinds;
}
