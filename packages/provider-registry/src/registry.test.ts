/**
 * HFX-000 — the append-only registry + promotion state machine tests.
 *
 * Proves: the lawful-transition table is ENFORCED (unlawful events are
 * typed refusals), re-registration is idempotent, a conflicting profile
 * under the same key is refused, a new technologyVersion is a new entry
 * with NO implicit retirement, retirement is explicit only, replay
 * re-derives deterministically AND re-evaluates the license gate (a
 * crafted log cannot smuggle an evaluation-only provider into production),
 * and the promotion gate's typed refusal reasons.
 */

import { describe, expect, test } from "bun:test";
import {
  applyRegistryEvent,
  createProviderRegistry,
  evaluatePromotionGate,
  replayRegistry,
  requestPromotion,
} from "./registry";
import type { ProviderRegistry, ProviderRegistryEvent, RegistryEntry } from "./registry";
import {
  deriveBenchmarkRecordId,
  sealProvenanceManifest,
  verifyProvenanceManifest,
  inputDigestOf,
  normalizeResult,
  providerResultDigestOf,
  validateBenchmarkRecord,
} from "./index";
import {
  REFERENCE_CAPABILITY,
  REFERENCE_PROVIDER_ID,
  REFERENCE_TECHNOLOGY_VERSION_V1,
  REFERENCE_TECHNOLOGY_VERSION_V2,
  executeReferenceProvider,
  referenceEnvironment,
  referenceInput,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  runReferenceBenchmark,
} from "./testkit";

/* A deterministic helper world ---------------------------------------- */

interface World {
  registry: ProviderRegistry;
}

function newWorld(): World {
  return { registry: createProviderRegistry() };
}

function apply(world: World, event: ProviderRegistryEvent): void {
  const result = applyRegistryEvent(world.registry, event);
  if (!result.ok) {
    throw new Error(`apply failed: ${result.failure.kind}: ${result.failure.detail}`);
  }
  world.registry = result.registry;
}

function refuse(world: World, event: ProviderRegistryEvent): { kind: string; detail: string } {
  const result = applyRegistryEvent(world.registry, event);
  if (result.ok) {
    world.registry = result.registry;
    throw new Error("event was unexpectedly accepted");
  }
  return { kind: result.failure.kind, detail: result.failure.detail };
}

function benchmarkedV1World(): World {
  const world = newWorld();
  const profile = referenceProviderProfileV1();
  apply(world, { kind: "provider-registered", profile });
  apply(world, {
    kind: "evaluation-started",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
  });
  const inputDigest = inputDigestOf(referenceInput());
  const normalized = normalizeResult(
    executeReferenceProvider(profile, referenceInput()),
    profile,
    { inputDigest },
  );
  if (!normalized.ok) {
    throw new Error("normalization failed");
  }
  apply(world, {
    kind: "execution-normalized",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    execution: {
      capability: REFERENCE_CAPABILITY,
      inputDigest,
      normalizedResultDigest: providerResultDigestOf(normalized.result),
    },
  });
  const body = runReferenceBenchmark(profile);
  apply(world, { kind: "benchmark-recorded", record: { ...body, recordId: deriveBenchmarkRecordId(body) } });
  return world;
}

describe("registration", () => {
  test("a valid profile registers into the registered state with its digest", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    const entry = world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1);
    expect(entry?.state).toBe("registered");
    expect(entry?.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(world.registry.entries).toHaveLength(1);
    expect(world.registry.events).toHaveLength(1);
  });

  test("an invalid profile is a typed invalid-profile refusal carrying the underlying failures", () => {
    const world = newWorld();
    const result = applyRegistryEvent(world.registry, {
      kind: "provider-registered",
      profile: { nonsense: true } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid-profile");
      expect(result.failure.underlying?.length).toBeGreaterThan(5);
    }
  });

  test("re-registering the IDENTICAL profile is idempotent — the log stays canonical", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    expect(world.registry.events).toHaveLength(1); // never duplicated
    expect(world.registry.entries).toHaveLength(1);
  });

  test("re-registering a DIFFERENT profile under the same key is a typed registration-conflict", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    const changed = {
      ...referenceProviderProfileV1(),
      capabilities: [...referenceProviderProfileV1().capabilities, "another-capability"],
    };
    const refusal = refuse(world, { kind: "provider-registered", profile: changed });
    expect(refusal.kind).toBe("registration-conflict");
    expect(refusal.detail).toContain("NEW technologyVersion");
    expect(world.registry.entries).toHaveLength(1);
  });

  test("a NEW technologyVersion is a NEW entry — the old one is NOT implicitly retired", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV2() });
    expect(world.registry.entries).toHaveLength(2);
    expect(
      world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1)?.state,
    ).toBe("registered"); // untouched
    expect(
      world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V2)?.state,
    ).toBe("registered");
  });
});

describe("the lawful-transition table (unlawful events are typed refusals)", () => {
  test("evaluation-started requires the registered state", () => {
    const world = benchmarkedV1World();
    const refusal = refuse(world, {
      kind: "evaluation-started",
      providerId: REFERENCE_PROVIDER_ID,
      technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
    });
    expect(refusal.kind).toBe("unlawful-transition");
    expect(refusal.detail).toContain("benchmarked");
  });

  test("execution-normalized requires the evaluation state", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    const refusal = refuse(world, {
      kind: "execution-normalized",
      providerId: REFERENCE_PROVIDER_ID,
      technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
      execution: {
        capability: REFERENCE_CAPABILITY,
        inputDigest: "a".repeat(64),
        normalizedResultDigest: "b".repeat(64),
      },
    });
    expect(refusal.kind).toBe("unlawful-transition");
  });

  test("benchmark-recorded requires ≥1 normalized execution (the lifecycle order is enforced)", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV1();
    apply(world, { kind: "provider-registered", profile });
    apply(world, {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    const body = runReferenceBenchmark(profile);
    const refusal = refuse(world, {
      kind: "benchmark-recorded",
      record: { ...body, recordId: deriveBenchmarkRecordId(body) },
    });
    expect(refusal.kind).toBe("unlawful-transition");
    expect(refusal.detail).toContain("NORMALIZED EXECUTION");
  });

  test("benchmark-recorded requires the evaluation state (no benchmark from registered)", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV1();
    apply(world, { kind: "provider-registered", profile });
    const body = runReferenceBenchmark(profile);
    const refusal = refuse(world, {
      kind: "benchmark-recorded",
      record: { ...body, recordId: deriveBenchmarkRecordId(body) },
    });
    expect(refusal.kind).toBe("unlawful-transition");
  });

  test("a record referencing an unregistered provider is a typed unknown-provider refusal", () => {
    const world = newWorld();
    const body = runReferenceBenchmark(referenceProviderProfileV1());
    const refusal = refuse(world, {
      kind: "benchmark-recorded",
      record: { ...body, recordId: deriveBenchmarkRecordId(body) },
    });
    expect(refusal.kind).toBe("unknown-provider");
  });

  test("a record whose capability the profile does not declare is a typed record-provider-mismatch", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV1();
    apply(world, { kind: "provider-registered", profile });
    apply(world, {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    apply(world, {
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: REFERENCE_CAPABILITY,
        inputDigest: "a".repeat(64),
        normalizedResultDigest: "b".repeat(64),
      },
    });
    const body = runReferenceBenchmark(profile);
    const tampered = { ...body, capability: "undeclared-capability" };
    const record = { ...tampered, recordId: deriveBenchmarkRecordId(tampered) };
    const refusal = refuse(world, { kind: "benchmark-recorded", record });
    expect(refusal.kind).toBe("record-provider-mismatch");
  });

  test("promotion-decided requires the benchmarked state", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV1();
    apply(world, { kind: "provider-registered", profile });
    const result = requestPromotion(world.registry, profile.providerId, profile.technologyVersion);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unlawful-transition");
    }
  });

  test("an unknown provider is a typed unknown-provider refusal", () => {
    const world = newWorld();
    const refusal = refuse(world, {
      kind: "evaluation-started",
      providerId: "ghost-provider",
      technologyVersion: "9.9.9",
    });
    expect(refusal.kind).toBe("unknown-provider");
  });
});

describe("retirement (explicit only)", () => {
  test("retirement is explicit and lawful from the registered state", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    apply(world, {
      kind: "provider-retired",
      providerId: REFERENCE_PROVIDER_ID,
      technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
      reason: "superseded by an explicitly-governed replacement",
    });
    expect(
      world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1)?.state,
    ).toBe("retired");
  });

  test("retiring a retired entry is unlawful", () => {
    const world = newWorld();
    apply(world, { kind: "provider-registered", profile: referenceProviderProfileV1() });
    apply(world, {
      kind: "provider-retired",
      providerId: REFERENCE_PROVIDER_ID,
      technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
      reason: "first retirement",
    });
    const refusal = refuse(world, {
      kind: "provider-retired",
      providerId: REFERENCE_PROVIDER_ID,
      technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
      reason: "double retirement",
    });
    expect(refusal.kind).toBe("unlawful-transition");
  });

  test("a retired entry's history stays interpretable (records remain in the derived entry)", () => {
    const world = benchmarkedV1World();
    const entryBefore = world.registry.entryOf(
      REFERENCE_PROVIDER_ID,
      REFERENCE_TECHNOLOGY_VERSION_V1,
    );
    expect(entryBefore?.benchmarkRecords).toHaveLength(1);
    apply(world, {
      kind: "provider-retired",
      providerId: REFERENCE_PROVIDER_ID,
      technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
      reason: "historical interpretability check",
    });
    const entry = world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1);
    expect(entry?.state).toBe("retired");
    expect(entry?.benchmarkRecords).toHaveLength(1);
    expect(entry?.normalizedExecutions).toHaveLength(1);
    expect(entry?.profile.providerId).toBe(REFERENCE_PROVIDER_ID);
  });
});

describe("the promotion gate", () => {
  function gateOf(entry: RegistryEntry | undefined) {
    if (entry === undefined) {
      throw new Error("entry missing");
    }
    return evaluatePromotionGate(entry);
  }

  test("a benchmarked entry WITHOUT a manifest fails the provenance-continuity gate", () => {
    const world = benchmarkedV1World();
    const gate = gateOf(
      world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1),
    );
    expect(gate.admitted).toBe(false);
    expect(gate.refusals.map((refusal) => refusal.kind)).toEqual(["missing-provenance-manifest"]);
    expect(gate.checks.find((check) => check.gate === "license-use-clearance")?.passed).toBe(true);
    expect(gate.checks.find((check) => check.gate === "benchmark-evidence")?.passed).toBe(true);
  });

  test("an evaluationOnly provider fails the license-use-clearance gate with license-blocked", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV2();
    apply(world, { kind: "provider-registered", profile });
    const entry = world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V2);
    const gate = gateOf(entry);
    expect(gate.admitted).toBe(false);
    expect(gate.refusals.map((refusal) => refusal.kind)).toContain("license-blocked");
    expect(gate.checks.find((check) => check.gate === "license-use-clearance")?.passed).toBe(false);
  });

  test("requestPromotion on the fully-evidenced v1 entry PROMOTES it", () => {
    const world = benchmarkedV1World();
    const profile = referenceProviderProfileV1();
    const entry = world.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1)!;
    const inputDigest = entry.normalizedExecutions[0]!.inputDigest;
    const manifest = sealProvenanceManifest({
      profile,
      inputDigests: [inputDigest],
      normalizedResultDigest: entry.normalizedExecutions[0]!.normalizedResultDigest,
      benchmarkRecords: entry.benchmarkRecords,
      environment: referenceEnvironment(),
      reproducibilityStatement: "test world",
    });
    apply(world, { kind: "provenance-sealed", manifest });
    const decision = requestPromotion(world.registry, profile.providerId, profile.technologyVersion);
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(
        decision.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1)?.state,
      ).toBe("promoted");
      expect(
        decision.registry.entryOf(REFERENCE_PROVIDER_ID, REFERENCE_TECHNOLOGY_VERSION_V1)
          ?.promotionDecision?.decision,
      ).toBe("promoted");
    }
  });

  test("a promoted decision event that fails a gate is REFUSED — and the refusal is re-evaluated on replay", () => {
    // Build the fully-evidenced v2 (evaluation-only) world up to benchmarked.
    const world = newWorld();
    const profile = referenceProviderProfileV2();
    apply(world, { kind: "provider-registered", profile });
    apply(world, {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    const inputDigest = inputDigestOf(referenceInput());
    const normalized = normalizeResult(executeReferenceProvider(profile, referenceInput()), profile, {
      inputDigest,
    });
    if (!normalized.ok) {
      throw new Error("normalization failed");
    }
    apply(world, {
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: REFERENCE_CAPABILITY,
        inputDigest,
        normalizedResultDigest: providerResultDigestOf(normalized.result),
      },
    });
    const body = runReferenceBenchmark(profile);
    apply(world, { kind: "benchmark-recorded", record: { ...body, recordId: deriveBenchmarkRecordId(body) } });

    // A CRAFTED promoted event for the evaluation-only provider is refused.
    const crafted: ProviderRegistryEvent = {
      kind: "promotion-decided",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      decision: "promoted",
      checks: [],
      refusals: [],
    };
    const refusal = refuse(world, crafted);
    expect(refusal.kind).toBe("promotion-gate-refused");

    // And a crafted LOG cannot smuggle it through replay either.
    const replay = replayRegistry([...world.registry.events, crafted]);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.failure.kind).toBe("promotion-gate-refused");
      // no manifest was sealed in this world: the license gate AND the
      // provenance gate both refuse (license first — the refusal order is
      // the gate order)
      expect(replay.failure.refusals?.map((refusal) => refusal.kind)).toEqual([
        "license-blocked",
        "missing-provenance-manifest",
      ]);
      expect(replay.eventIndex).toBe(world.registry.events.length);
    }
  });

  test("requestPromotion on the fully-evidenced v2 entry records a REJECTION with the license-blocked refusal", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV2();
    apply(world, { kind: "provider-registered", profile });
    apply(world, {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    const inputDigest = inputDigestOf(referenceInput());
    const normalized = normalizeResult(executeReferenceProvider(profile, referenceInput()), profile, {
      inputDigest,
    });
    if (!normalized.ok) {
      throw new Error("normalization failed");
    }
    apply(world, {
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: REFERENCE_CAPABILITY,
        inputDigest,
        normalizedResultDigest: providerResultDigestOf(normalized.result),
      },
    });
    const body = runReferenceBenchmark(profile);
    apply(world, { kind: "benchmark-recorded", record: { ...body, recordId: deriveBenchmarkRecordId(body) } });
    const entry = world.registry.entryOf(profile.providerId, profile.technologyVersion)!;
    const manifest = sealProvenanceManifest({
      profile,
      inputDigests: [entry.normalizedExecutions[0]!.inputDigest],
      normalizedResultDigest: entry.normalizedExecutions[0]!.normalizedResultDigest,
      benchmarkRecords: entry.benchmarkRecords,
      environment: referenceEnvironment(),
      reproducibilityStatement: "v2 test world",
    });
    apply(world, { kind: "provenance-sealed", manifest });

    const decision = requestPromotion(world.registry, profile.providerId, profile.technologyVersion);
    expect(decision.ok).toBe(true); // the REQUEST succeeded — the DECISION is rejected
    if (decision.ok) {
      const entryAfter = decision.registry.entryOf(profile.providerId, profile.technologyVersion);
      expect(entryAfter?.state).toBe("rejected");
      expect(entryAfter?.promotionDecision?.decision).toBe("rejected");
      expect(
        entryAfter?.promotionDecision?.refusals.map((refusal) => refusal.kind),
      ).toEqual(["license-blocked"]);
    }
  });
});

describe("append-only replay (deterministic derivation)", () => {
  test("replayRegistry re-derives the identical state from the log", () => {
    const world = benchmarkedV1World();
    const replay = replayRegistry(world.registry.events);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.registry.entries).toEqual(world.registry.entries);
      expect(replay.registry.events).toEqual(world.registry.events);
    }
  });

  test("the empty log replays to the empty registry", () => {
    const replay = replayRegistry([]);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.registry.entries).toHaveLength(0);
    }
  });

  test("an invalid event inside a log fails the replay at its index", () => {
    const replay = replayRegistry([
      { kind: "evaluation-started", providerId: "ghost", technologyVersion: "1" },
    ]);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.eventIndex).toBe(0);
      expect(replay.failure.kind).toBe("unknown-provider");
    }
  });

  test("applyRegistryEvent never mutates the source registry (pure value semantics)", () => {
    const world = benchmarkedV1World();
    const before = world.registry;
    const result = applyRegistryEvent(before, {
      kind: "provider-registered",
      profile: referenceProviderProfileV2(),
    });
    expect(result.ok).toBe(true);
    expect(before.entries).toHaveLength(1); // untouched
    expect(before.events).toHaveLength(4);
    if (result.ok) {
      expect(result.registry.entries).toHaveLength(2);
    }
  });
});

describe("intake helpers exercised through the registry", () => {
  test("a raw record body (no recordId) is validated and content-addressed at intake", () => {
    const world = newWorld();
    const profile = referenceProviderProfileV1();
    apply(world, { kind: "provider-registered", profile });
    apply(world, {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    apply(world, {
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: REFERENCE_CAPABILITY,
        inputDigest: "a".repeat(64),
        normalizedResultDigest: "b".repeat(64),
      },
    });
    const body = runReferenceBenchmark(profile);
    const validation = validateBenchmarkRecord(body); // no recordId
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      apply(world, { kind: "benchmark-recorded", record: validation.record });
      const entry = world.registry.entryOf(profile.providerId, profile.technologyVersion);
      expect(entry?.state).toBe("benchmarked");
      expect(entry?.benchmarkRecords[0]?.recordId).toBe(validation.record.recordId);
    }
  });

  test("an invalid manifest is a typed invalid-provenance-manifest refusal", () => {
    const world = benchmarkedV1World();
    const refusal = refuse(world, {
      kind: "provenance-sealed",
      manifest: { nonsense: true } as never,
    });
    expect(refusal.kind).toBe("invalid-provenance-manifest");
  });

  test("a manifest for a different profile digest is a typed manifest-provider-mismatch refusal", () => {
    const world = benchmarkedV1World();
    const profile = referenceProviderProfileV1();
    const entry = world.registry.entryOf(profile.providerId, profile.technologyVersion)!;
    // a MODIFIED profile (same providerId+technologyVersion, different
    // content → different digest) seals a structurally valid manifest that
    // no longer matches the REGISTERED profile
    const modifiedProfile = {
      ...profile,
      capabilities: [...profile.capabilities, "fixture-modified-capability"],
    };
    const manifest = sealProvenanceManifest({
      profile: modifiedProfile,
      inputDigests: [entry.normalizedExecutions[0]!.inputDigest],
      normalizedResultDigest: entry.normalizedExecutions[0]!.normalizedResultDigest,
      benchmarkRecords: [],
      environment: referenceEnvironment(),
      reproducibilityStatement: "mismatch test",
    });
    const refusal = refuse(world, { kind: "provenance-sealed", manifest });
    expect(refusal.kind).toBe("manifest-provider-mismatch");
    expect(refusal.detail).toContain("profile digest");
  });

  test("a structurally valid but hand-forged manifestId fails verification at intake", () => {
    const world = benchmarkedV1World();
    const profile = referenceProviderProfileV1();
    const entry = world.registry.entryOf(profile.providerId, profile.technologyVersion)!;
    const manifest = sealProvenanceManifest({
      profile,
      inputDigests: [entry.normalizedExecutions[0]!.inputDigest],
      normalizedResultDigest: entry.normalizedExecutions[0]!.normalizedResultDigest,
      benchmarkRecords: entry.benchmarkRecords,
      environment: referenceEnvironment(),
      reproducibilityStatement: "sealed honestly",
    });
    const forged = { ...manifest, manifestId: "0".repeat(64) };
    expect(verifyProvenanceManifest(forged).ok).toBe(false);
    const refusal = refuse(world, { kind: "provenance-sealed", manifest: forged });
    expect(refusal.kind).toBe("invalid-provenance-manifest");
  });
});
