/**
 * HFX-000 — provider control-plane service tests.
 *
 * Proves the exit gate THROUGH THE SERVICE (the HTTP surface's own
 * lifecycle): registration → evaluation → execution/normalization →
 * benchmark intake → provenance sealing → promotion decision, with v1
 * promoted and v2 license-blocked; idempotent registration; the typed
 * error table; determinism of the driven lifecycle.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { verifyProvenanceManifest } from "@aise/provider-registry";
import { ProviderService } from "./service";
import { ProviderServiceError } from "./model";
import {
  PROVIDER_WORLD,
  benchmarkBody,
  driveReferenceLifecycle,
  evaluationStartBody,
  normalizeBody,
  registerBodyV1,
  registerBodyV2,
} from "./testkit";

function expectErrorCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ProviderServiceError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("action unexpectedly succeeded");
}

describe("profile validation and registration", () => {
  test("validateProfile answers the digest + evaluation-only flag for a valid profile", () => {
    const service = new ProviderService();
    const response = service.validateProfile(registerBodyV1());
    expect(response.valid).toBe(true);
    expect(response.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(response.evaluationOnly).toBe(false);
    const v2 = service.validateProfile(registerBodyV2());
    expect(v2.evaluationOnly).toBe(true);
  });

  test("validateProfile refuses an invalid profile with the typed inventory", () => {
    const service = new ProviderService();
    const code = expectErrorCode(() => service.validateProfile({ profile: { nonsense: true } }));
    expect(code).toBe("invalid_profile");
    try {
      service.validateProfile({ profile: { nonsense: true } });
    } catch (error) {
      if (error instanceof ProviderServiceError) {
        expect(error.detail).toContain("typed validation");
        expect(error.detail).toContain("failure(s)");
      }
    }
  });

  test("register lands in the registered state and is idempotent", () => {
    const service = new ProviderService();
    const first = service.register(registerBodyV1());
    expect(first.entry.state).toBe("registered");
    const second = service.register(registerBodyV1()); // identical profile: idempotent
    expect(second.entry).toEqual(first.entry);
    expect(service.queryRegistry({}).entries).toHaveLength(1);
  });

  test("registering a different profile under the same key is a typed registration_conflict", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    const changed = {
      ...registerBodyV1(),
      profile: {
        ...registerBodyV1().profile,
        capabilities: [...registerBodyV1().profile.capabilities, "another-capability"],
      },
    };
    expect(expectErrorCode(() => service.register(changed))).toBe("registration_conflict");
  });

  test("registering a NEW technologyVersion is a new entry (the old one untouched)", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.register(registerBodyV2());
    const listing = service.queryRegistry({});
    expect(listing.entries).toHaveLength(2);
    expect(listing.entries.map((entry) => entry.state)).toEqual(["registered", "registered"]);
  });
});

describe("the state machine over the service (typed errors)", () => {
  test("evaluation/start on an unknown provider is unknown_provider", () => {
    const service = new ProviderService();
    expect(
      expectErrorCode(() => service.startEvaluation({ providerId: "ghost", technologyVersion: "1" })),
    ).toBe("unknown_provider");
  });

  test("execution/normalize before evaluation is unlawful_transition", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    expect(
      expectErrorCode(() => service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1))),
    ).toBe("unlawful_transition");
  });

  test("execution/normalize validates BOTH boundary directions", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));

    // an input violating the declared INPUT contract: typed invalid_input
    const goodBody = normalizeBody(PROVIDER_WORLD.technologyVersionV1);
    const badInput = {
      ...goodBody,
      input: {
        ...(goodBody.input as Record<string, unknown>),
        payload: { samples: [2] },
      },
    };
    expect(expectErrorCode(() => service.normalizeExecution(badInput))).toBe("invalid_input");

    // a raw execution violating the OUTPUT contract: typed normalization_refused
    const badExecution = {
      ...normalizeBody(PROVIDER_WORLD.technologyVersionV1),
      execution: { outputs: { depthMap: [99], unit: "m" } },
    };
    expect(expectErrorCode(() => service.normalizeExecution(badExecution))).toBe("normalization_refused");

    // the happy path records the normalized execution
    const response = service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1));
    expect(response.result.status).toBe("ok");
    expect(response.result.outputDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(response.entry.normalizedExecutionCount).toBe(1);
    expect(response.entry.state).toBe("evaluation");
  });

  test("benchmark intake before a normalized execution is unlawful_transition", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    expect(
      expectErrorCode(() => service.intakeBenchmark(benchmarkBody(PROVIDER_WORLD.technologyVersionV1))),
    ).toBe("unlawful_transition");
  });

  test("benchmark intake of an invalid record is a typed invalid_benchmark_record", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1));
    expect(expectErrorCode(() => service.intakeBenchmark({ record: { nonsense: true } }))).toBe(
      "invalid_benchmark_record",
    );
  });

  test("provenance/seal before any execution is unlawful_transition", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    expect(
      expectErrorCode(() => service.sealProvenance(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1))),
    ).toBe("unlawful_transition");
  });

  test("promotion/decide before benchmarking is unlawful_transition", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1));
    expect(
      expectErrorCode(() => service.decidePromotion(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1))),
    ).toBe("unlawful_transition");
  });

  test("a promotion decision before provenance sealing is refused by the gate", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1));
    service.intakeBenchmark(benchmarkBody(PROVIDER_WORLD.technologyVersionV1));
    const decision = service.decidePromotion(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    // the REQUEST is lawful (benchmarked) — the DECISION is rejected with
    // the typed missing-provenance-manifest refusal
    expect(decision.decision).toBe("rejected");
    expect(decision.refusals.map((refusal) => refusal.kind)).toEqual(["missing-provenance-manifest"]);
    expect(decision.entry.state).toBe("rejected");
  });
});

describe("the exit gate through the service", () => {
  test("the driven reference lifecycle: v1 promoted, v2 license-blocked", () => {
    const service = new ProviderService();
    const driven = driveReferenceLifecycle(service);
    expect(driven.v1FinalState).toBe("promoted");
    expect(driven.v2FinalState).toBe("rejected");
    expect(driven.v2RefusalKinds).toEqual(["license-blocked"]);
    expect(driven.v1ManifestId).toMatch(/^[0-9a-f]{64}$/);
    expect(driven.v2ManifestId).toMatch(/^[0-9a-f]{64}$/);
    expect(driven.v1RecordId).not.toBe(driven.v2RecordId);
  });

  test("the sealed manifests verify by digest (portable provenance through the service)", () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1));
    service.intakeBenchmark(benchmarkBody(PROVIDER_WORLD.technologyVersionV1));
    const sealed = service.sealProvenance(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    const verification = verifyProvenanceManifest(sealed.manifest);
    expect(verification.ok).toBe(true);
    const retrieval = service.provenanceManifests(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    expect(retrieval.manifests).toHaveLength(1);
    expect(retrieval.manifests[0]?.manifestId).toBe(sealed.manifest.manifestId);
    const byId = service.provenanceManifests({
      ...evaluationStartBody(PROVIDER_WORLD.technologyVersionV1),
      manifestId: sealed.manifest.manifestId,
    });
    expect(byId.manifests).toHaveLength(1);
    expect(expectErrorCode(() =>
      service.provenanceManifests({
        ...evaluationStartBody(PROVIDER_WORLD.technologyVersionV1),
        manifestId: "0".repeat(64),
      }),
    )).toBe("unknown_manifest");
  });

  test("the driven lifecycle is deterministic (identical sequences → identical states)", () => {
    const first = new ProviderService();
    const second = new ProviderService();
    const drivenFirst = driveReferenceLifecycle(first);
    const drivenSecond = driveReferenceLifecycle(second);
    expect(drivenFirst).toEqual(drivenSecond);
    expect(
      canonicalJsonStringify(first.queryRegistry({}).entries),
    ).toBe(canonicalJsonStringify(second.queryRegistry({}).entries));
  });

  test("a refused promotion is re-decidable-proof: the decided entry refuses further decisions", () => {
    const service = new ProviderService();
    driveReferenceLifecycle(service);
    expect(
      expectErrorCode(() => service.decidePromotion(evaluationStartBody(PROVIDER_WORLD.technologyVersionV2))),
    ).toBe("unlawful_transition");
  });

  test("registry query answers the full listing and single entries", () => {
    const service = new ProviderService();
    driveReferenceLifecycle(service);
    const listing = service.queryRegistry({});
    expect(listing.entries).toHaveLength(2);
    expect(listing.entries.map((entry) => entry.state)).toEqual(["promoted", "rejected"]);
    const one = service.queryRegistry(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    expect(one.entries).toHaveLength(1);
    expect(one.entries[0]?.state).toBe("promoted");
    expect(one.entries[0]?.promotionDecision?.decision).toBe("promoted");
    expect(one.entries[0]?.promotionDecision?.refusals).toEqual([]);
    const rejected = service.queryRegistry(evaluationStartBody(PROVIDER_WORLD.technologyVersionV2));
    expect(rejected.entries[0]?.promotionDecision?.refusals.map((r) => r.kind)).toEqual(["license-blocked"]);
  });
});
