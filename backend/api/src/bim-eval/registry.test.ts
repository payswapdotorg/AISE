/**
 * HFX-204 — the bim-eval REGISTRY-WIRING tests: the two fixture provider
 * profiles (15/15 mandatory fields, closed failure vocabulary, cleared
 * in-repo fixture license) and the pinned suite identities.
 */

import { describe, expect, test } from "bun:test";
import {
  benchmarkComparabilityKey,
  validateProviderProfile,
} from "@aise/provider-registry";
import {
  BIM_EVAL_BENCHMARK_ID,
  BIM_EVAL_CODE_VERSION,
  BIM_EVAL_CONSUMER,
  BIM_EVAL_LANE_FIXTURE_PROVIDERS,
  BIM_EVAL_SUITE_ID,
  BIM_EVAL_SUITE_VERSION,
  bimLaneOfProvider,
  fixtureBimEditProviderProfile,
  fixtureBimQaProviderProfile,
  fixtureProfileForBimLane,
} from "./registry";

/* ------------------------------------------------------------------ */

describe("HFX-204 registry: the fixture provider profiles", () => {
  test("the QA provider profile validates 15/15 against the control plane", () => {
    const profile = fixtureBimQaProviderProfile();
    const validated = validateProviderProfile(JSON.parse(JSON.stringify(profile)));
    expect(validated.ok).toBe(true);
    expect(profile.providerId).toBe("fixture-bim-qa-provider");
    expect(profile.capabilities).toEqual(["fixture-bim-question-answering"]);
    expect(profile.outputContract.fields.map((field) => field.name)).toEqual(["envelopeJson"]);
    expect(profile.license.evaluationOnly).toBe(false);
  });

  test("the edit provider profile validates 15/15 against the control plane", () => {
    const profile = fixtureBimEditProviderProfile();
    const validated = validateProviderProfile(JSON.parse(JSON.stringify(profile)));
    expect(validated.ok).toBe(true);
    expect(profile.providerId).toBe("fixture-bim-edit-provider");
    expect(profile.capabilities).toEqual(["fixture-bim-edit-translation"]);
    expect(profile.outputContract.fields.map((field) => field.name)).toEqual(["intentJson"]);
  });

  test("the declared failure modes use the CLOSED vocabulary only", () => {
    const closedKinds = new Set([
      "perception-failure",
      "retrieval-failure",
      "reasoning-failure",
      "unsupported-data",
      "operation-semantic-failure",
      "resource-exhaustion",
      "timeout",
      "license-blocked",
      "contract-mismatch",
    ]);
    for (const profile of [fixtureBimQaProviderProfile(), fixtureBimEditProviderProfile()]) {
      expect(profile.failureModes.length).toBeGreaterThan(0);
      for (const mode of profile.failureModes) {
        expect(closedKinds.has(mode.kind)).toBe(true);
      }
    }
  });

  test("the profiles are deterministic constructions (byte-identical rebuilds)", () => {
    expect(fixtureBimQaProviderProfile()).toEqual(fixtureBimQaProviderProfile());
    expect(fixtureBimEditProviderProfile()).toEqual(fixtureBimEditProviderProfile());
    expect(fixtureProfileForBimLane("ifc-bench-questions")).toEqual(fixtureBimQaProviderProfile());
    expect(fixtureProfileForBimLane("bim-edit-operations")).toEqual(fixtureBimEditProviderProfile());
  });

  test("the lane assignment and its inverse are coherent", () => {
    expect(BIM_EVAL_LANE_FIXTURE_PROVIDERS["ifc-bench-questions"].providerId).toBe(
      "fixture-bim-qa-provider",
    );
    expect(BIM_EVAL_LANE_FIXTURE_PROVIDERS["bim-edit-operations"].providerId).toBe(
      "fixture-bim-edit-provider",
    );
    expect(bimLaneOfProvider("fixture-bim-qa-provider")).toBe("ifc-bench-questions");
    expect(bimLaneOfProvider("fixture-bim-edit-provider")).toBe("bim-edit-operations");
    expect(bimLaneOfProvider("someone-else")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 registry: the pinned suite identities", () => {
  test("the suite/benchmark identities are pinned", () => {
    expect(BIM_EVAL_SUITE_ID).toBe("bim-eval-suite/1");
    expect(BIM_EVAL_SUITE_VERSION).toBe("1.0.0");
    expect(BIM_EVAL_BENCHMARK_ID).toBe("bim-eval-suite/1");
    expect(BIM_EVAL_CODE_VERSION).toBe("hfx-204/bim-eval/1");
    expect(BIM_EVAL_CONSUMER.consumer).toBe("AISE");
    expect(BIM_EVAL_CONSUMER.surface).toBe("hfx204-bim-eval");
  });

  test("the emitted records are comparable across providers via the control-plane key", () => {
    // the comparability join a future REAL provider run slots into
    const key = benchmarkComparabilityKey({
      kind: "provider-benchmark-record",
      schemaVersion: "provider-benchmark/1",
      recordId: "0".repeat(64),
      providerId: "fixture-bim-qa-provider",
      technologyVersion: "1.0.0-fixture-v1",
      benchmarkId: BIM_EVAL_BENCHMARK_ID,
      capability: "fixture-bim-question-answering",
      metrics: [
        { metric: "classification_match", value: 1, unit: "ratio", detail: "test" },
      ],
      failureObservations: [],
      resourceObservations: {
        compute: "deterministic-fixture-cpu",
        memoryMiB: 16,
        latencyMsP50: 0.5,
        latencyMsP95: 1,
      },
      reproduction: {
        inputsDigest: "0".repeat(64),
        codeVersion: BIM_EVAL_CODE_VERSION,
        statement: "test",
      },
    });
    expect(key).toBe("bim-eval-suite/1|fixture-bim-question-answering");
  });
});
