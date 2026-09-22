/**
 * HFX-000 — THE EXIT-GATE LIFECYCLE TEST.
 *
 * docs/huggingface-hardening-execution-plan.md §HF-0, exit gate: "a
 * reference provider can complete registration → execution → normalized
 * result → benchmark → provenance → promotion decision without changing
 * canonical AISE semantics."
 *
 * This suite replays the committed golden lifecycle fixtures through the
 * registry and BYTE-COMPARES every artifact:
 *
 *   - the full event log reproduces the committed reference-lifecycle.json;
 *   - the sealed provenance manifests reproduce the committed manifest
 *     fixtures byte-for-byte;
 *   - the profiles and benchmark records reproduce their committed
 *     fixtures;
 *   - v1 ends PROMOTED; v2 ends REJECTED with the typed license-blocked
 *     refusal (the license-gate refusal path);
 *   - running the lifecycle from scratch twice yields the identical log
 *     (determinism);
 *   - the registry re-derives the same state from the golden log by replay.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { replayRegistry, requestPromotion } from "./registry";
import type { RegistryEntry } from "./registry";
import { verifyProvenanceManifest } from "./provenance";
import type { ProvenanceManifest } from "./provenance";
import { validateBenchmarkRecord, validateProviderProfile, deriveBenchmarkRecordId } from "./index";
import type { BenchmarkRecord, ProviderRegistryEvent } from "./index";
import {
  providerFixture,
  runReferenceLifecycle,
  runReferenceBenchmark,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
} from "./testkit";

interface LifecycleGolden {
  readonly summary: {
    readonly exitGate: string;
    readonly v1FinalState: string;
    readonly v2FinalState: string;
    readonly v2RefusalKinds: readonly string[];
    readonly eventCount: number;
  };
  readonly events: readonly ProviderRegistryEvent[];
  readonly finalEntries: readonly RegistryEntry[];
}

const golden = providerFixture<LifecycleGolden>("reference-lifecycle.json");
const lifecycle = runReferenceLifecycle();

describe("the exit-gate lifecycle (registration → … → promotion decision)", () => {
  test("the golden summary states the exit gate and both final states", () => {
    expect(golden.summary.exitGate).toContain("registration → evaluation → execution");
    expect(golden.summary.v1FinalState).toBe("promoted");
    expect(golden.summary.v2FinalState).toBe("rejected");
    expect(golden.summary.v2RefusalKinds).toEqual(["license-blocked"]);
  });

  test("the run reproduces the golden summary", () => {
    expect(lifecycle.v1Entry.state).toBe("promoted");
    expect(lifecycle.v2Entry.state).toBe("rejected");
    expect(
      lifecycle.v2Entry.promotionDecision?.refusals.map((refusal) => refusal.kind),
    ).toEqual(["license-blocked"]);
    expect(lifecycle.events).toHaveLength(golden.summary.eventCount);
  });

  test("the event order is the mandated lifecycle order per version", () => {
    expect(lifecycle.events.map((event) => event.kind)).toEqual(golden.events.map((event) => event.kind));
    expect(lifecycle.events.map((event) => event.kind)).toEqual([
      "provider-registered", // v1
      "provider-registered", // v2 (a NEW entry; v1 is NOT implicitly retired)
      "evaluation-started",
      "execution-normalized",
      "benchmark-recorded",
      "evaluation-started",
      "execution-normalized",
      "benchmark-recorded",
      "provenance-sealed",
      "provenance-sealed",
      "promotion-decided", // v1 → promoted
      "promotion-decided", // v2 → rejected (license-blocked)
    ]);
  });

  test("the full event log reproduces the committed golden BYTE-IDENTICALLY", () => {
    expect(canonicalJsonStringify(lifecycle.events)).toBe(canonicalJsonStringify(golden.events));
  });

  test("the final derived entries reproduce the committed golden BYTE-IDENTICALLY", () => {
    expect(canonicalJsonStringify(lifecycle.v1Entry)).toBe(
      canonicalJsonStringify(golden.finalEntries[0]),
    );
    expect(canonicalJsonStringify(lifecycle.v2Entry)).toBe(
      canonicalJsonStringify(golden.finalEntries[1]),
    );
  });

  test("replaying the golden log re-derives the identical registry (append-only derivation)", () => {
    const replay = replayRegistry(golden.events);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.registry.entries).toEqual(lifecycle.registry.entries);
      expect(replay.registry.events).toEqual(lifecycle.events);
    }
  });
});

describe("the license-gate refusal path (the v2 golden fixture)", () => {
  test("v2's benchmark metrics are recordable — the refusal is LICENSE-driven, not metric-driven", () => {
    const record = lifecycle.v2Entry.benchmarkRecords[0] as BenchmarkRecord;
    const metrics = Object.fromEntries(record.metrics.map((metric) => [metric.metric, metric.value]));
    expect(metrics["depth_mae_m"]).toBe(0.125);
    expect(record.providerId).toBe(lifecycle.v2Entry.providerId);
  });

  test("the typed refusal cites the dataset/model-use rule", () => {
    const refusal = lifecycle.v2Entry.promotionDecision?.refusals[0];
    expect(refusal?.kind).toBe("license-blocked");
    expect(refusal?.detail).toContain("evaluation-only");
    expect(refusal?.detail).toContain("training and evaluation are separate decisions");
  });

  test("the v2 gate check records license-use-clearance as failed while evidence gates passed", () => {
    const checks = lifecycle.v2Entry.promotionDecision?.checks ?? [];
    expect(checks.find((check) => check.gate === "license-use-clearance")?.passed).toBe(false);
    expect(checks.find((check) => check.gate === "benchmark-evidence")?.passed).toBe(true);
    expect(checks.find((check) => check.gate === "provenance-continuity")?.passed).toBe(true);
  });

  test("v1's decision carries every gate passed and no refusals", () => {
    expect(lifecycle.v1Entry.promotionDecision?.decision).toBe("promoted");
    expect(lifecycle.v1Entry.promotionDecision?.refusals).toEqual([]);
    for (const check of lifecycle.v1Entry.promotionDecision?.checks ?? []) {
      expect(check.passed).toBe(true);
    }
  });
});

describe("the committed golden artifacts", () => {
  test("the two committed profiles reproduce byte-identically and validate", () => {
    for (const [name, profile] of [
      ["reference-provider-v1.profile.json", referenceProviderProfileV1()],
      ["reference-provider-v2.profile.json", referenceProviderProfileV2()],
    ] as const) {
      const fixture = providerFixture<Record<string, unknown>>(name);
      expect(canonicalJsonStringify(profile)).toBe(canonicalJsonStringify(fixture));
      expect(validateProviderProfile(fixture).ok).toBe(true);
    }
  });

  test("the two committed benchmark records reproduce byte-identically and validate", () => {
    const v1Body = runReferenceBenchmark(referenceProviderProfileV1());
    const v2Body = runReferenceBenchmark(referenceProviderProfileV2());
    for (const [name, record] of [
      ["reference-provider-v1.benchmark-record.json", { ...v1Body, recordId: deriveBenchmarkRecordId(v1Body) }],
      ["reference-provider-v2.benchmark-record.json", { ...v2Body, recordId: deriveBenchmarkRecordId(v2Body) }],
    ] as const) {
      const fixture = providerFixture<Record<string, unknown>>(name);
      expect(canonicalJsonStringify(record)).toBe(canonicalJsonStringify(fixture));
      expect(validateBenchmarkRecord(fixture).ok).toBe(true);
    }
  });

  test("the two committed provenance manifests reproduce byte-identically and verify", () => {
    for (const [name, manifest] of [
      ["reference-provider-v1.provenance-manifest.json", lifecycle.v1Manifest],
      ["reference-provider-v2.provenance-manifest.json", lifecycle.v2Manifest],
    ] as const) {
      const fixture = providerFixture<Record<string, unknown>>(name);
      expect(canonicalJsonStringify(manifest)).toBe(canonicalJsonStringify(fixture));
      const verification = verifyProvenanceManifest(fixture);
      expect(verification.ok).toBe(true);
      if (verification.ok) {
        expect(verification.manifest).toEqual(manifest as ProvenanceManifest);
      }
    }
  });

  test("the sealed manifests pin the exact executed artifacts (digest chain)", () => {
    for (const manifest of [lifecycle.v1Manifest, lifecycle.v2Manifest]) {
      const entry = lifecycle.registry.entryOf(
        manifest.profileReference.providerId,
        manifest.profileReference.technologyVersion,
      );
      expect(entry).toBeDefined();
      if (entry === undefined) {
        continue;
      }
      expect(manifest.inputDigests).toEqual(
        entry.normalizedExecutions.map((execution) => execution.inputDigest),
      );
      expect(manifest.benchmarkRecordReferences).toEqual(
        entry.benchmarkRecords.map((record) => record.recordId),
      );
    }
  });
});

describe("determinism of the exit gate", () => {
  test("running the lifecycle from scratch twice yields the identical log and manifests", () => {
    const second = runReferenceLifecycle();
    expect(canonicalJsonStringify(second.events)).toBe(canonicalJsonStringify(lifecycle.events));
    expect(second.v1Manifest).toEqual(lifecycle.v1Manifest);
    expect(second.v2Manifest).toEqual(lifecycle.v2Manifest);
  });

  test("a second promotion request on the decided entry is refused (decisions are final for the version)", () => {
    const result = requestPromotion(
      lifecycle.registry,
      lifecycle.v2Entry.providerId,
      lifecycle.v2Entry.technologyVersion,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unlawful-transition");
    }
  });
});
