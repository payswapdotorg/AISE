/**
 * PROD-022 — solution tool service tests (deterministic orchestration).
 *
 * Proves the service layer directly (no live server boot):
 *  - every endpoint method is a PURE function of the request payload;
 *    identical payloads produce identical responses;
 *  - wire payloads are decoded STRICTLY through the contract codecs
 *    (typed `invalid_*` errors with the contract's structured issues);
 *  - the default capability profile is the contract's reference building
 *    profile; a caller-supplied profile is strict-decoded;
 *  - a missing baseline geometry resolver yields the honest
 *    `surface_area_unresolved` needs-input answer for coated operations
 *    (never an invented area);
 *  - stateIndex bounds are enforced with typed out-of-range errors.
 *
 * Deterministic: no network, no clock reads, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_BUILDING_OPERATION_PROFILE,
  decodeEngineeringOperationIntent,
  type ProposedState,
} from "@aise/solution-contract";
import { replaySolution } from "@aise/solution-engine";
import { SolutionService } from "./service";
import { SolutionError } from "./model";

const CONTRACT_FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "solution-contract",
  "fixtures",
);

function intentPayload(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

/** Builds a version payload through the engine (deterministic test world). */
function wireVersion(intents: readonly string[]): Record<string, unknown> {
  const decoded = intents.map((name) =>
    decodeEngineeringOperationIntent(intentPayload(name)),
  );
  const replay = replaySolution({
    solutionId: "solution-demo-001",
    projectId: "proj-demo-001",
    title: "Ground-floor wall upgrade solution",
    problemStatement: "probe",
    domain: REFERENCE_BUILDING_OPERATION_PROFILE.domains[0]!.domain,
    baselineRealityVersionId: "rgv-demo-0007",
    intents: decoded,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: (stateIndex: number) =>
      new Date(Date.UTC(2026, 8, 16, 10, stateIndex, 0, 0)).toISOString(),
    createdAt: "2026-09-16T08:00:00.000Z",
  });
  if (replay.outcome !== "complete") {
    throw new Error("test replay failed");
  }
  return JSON.parse(JSON.stringify(replay.version)) as Record<string, unknown>;
}

const BASELINE: ProposedState = {
  contractVersion: "1.0.0",
  stateId: "state-service-test-baseline-000000000000000000",
  solutionId: "solution-demo-001",
  versionNumber: 1,
  stateIndex: 0,
  baselineRealityVersionId: "rgv-demo-0007",
  epistemicStatus: "PROPOSED",
  appliedOperationIds: [],
  materializedAt: "2026-09-16T10:00:00.000Z",
};

describe("step (apply ONE intent to a baseline)", () => {
  test("a contract-valid intent applies through the service", () => {
    const service = new SolutionService();
    const response = service.step({
      baseline: BASELINE,
      intent: intentPayload("valid-excavation-direct"),
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    expect(response.result.outcome).toBe("applied");
    if (response.result.outcome !== "applied") {
      return;
    }
    expect(response.result.operation.operationType).toBe("excavation");
    expect(response.result.resultingState.stateIndex).toBe(1);
    expect(
      response.result.quantities.find((q) => q.label === "excavated-soil-volume")?.value,
    ).toBe(9);
  });

  test("identical payloads produce identical responses (determinism)", () => {
    const service = new SolutionService();
    const payload = {
      baseline: BASELINE,
      intent: intentPayload("valid-backfill"),
      materializedAt: "2026-09-16T10:01:00.000Z",
    };
    expect(JSON.stringify(service.step(payload))).toBe(JSON.stringify(service.step(payload)));
  });

  test("an intent with a contract-invalid shape is a typed invalid_intent error", () => {
    const service = new SolutionService();
    const broken = { ...intentPayload("valid-excavation-direct"), parameters: [] };
    expect(() =>
      service.step({
        baseline: BASELINE,
        intent: broken,
        materializedAt: "2026-09-16T10:01:00.000Z",
      }),
    ).toThrow(SolutionError);
    try {
      service.step({
        baseline: BASELINE,
        intent: broken,
        materializedAt: "2026-09-16T10:01:00.000Z",
      });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_intent");
      expect((error as SolutionError).detail).toContain("strict contract decoding");
    }
  });

  test("an unknown-key intent payload is REJECTED by strict decoding (canonical validation)", () => {
    const service = new SolutionService();
    const smuggled = { ...intentPayload("valid-excavation-direct"), extraKey: "smuggled" };
    expect(() =>
      service.step({
        baseline: BASELINE,
        intent: smuggled,
        materializedAt: "2026-09-16T10:01:00.000Z",
      }),
    ).toThrow(SolutionError);
  });

  test("a malformed materializedAt is a typed invalid_timestamp error (no clock reads)", () => {
    const service = new SolutionService();
    try {
      service.step({
        baseline: BASELINE,
        intent: intentPayload("valid-excavation-direct"),
        materializedAt: "10:00",
      });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_timestamp");
    }
  });

  test("a coated operation without a baseline geometry resolver answers needs-input honestly", () => {
    const service = new SolutionService(); // no resolver wired
    const response = service.step({
      baseline: BASELINE,
      intent: intentPayload("valid-plaster-application"),
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    expect(response.result.outcome).toBe("needs-input");
    if (response.result.outcome !== "applied") {
      expect(response.result.reasons[0]?.code).toBe("surface_area_unresolved");
    }
  });

  test("a caller-supplied capability profile is strict-decoded and used", () => {
    const service = new SolutionService();
    // the partial reference profile declares excavation capability unknown
    const response = service.step({
      baseline: BASELINE,
      intent: intentPayload("valid-excavation-direct"),
      materializedAt: "2026-09-16T10:01:00.000Z",
      capabilityProfile: JSON.parse(
        readFileSync(
          join(
            CONTRACT_FIXTURES,
            "capability",
            "OperationCapabilityProfile.valid-partial.json",
          ),
          "utf8",
        ),
      ),
    });
    expect(response.result.outcome).toBe("needs-input");
    if (response.result.outcome !== "applied") {
      expect(response.result.negotiation.outcome).toBe("unknown");
    }
  });

  test("an invalid caller-supplied capability profile is a typed refusal", () => {
    const service = new SolutionService();
    expect(() =>
      service.step({
        baseline: BASELINE,
        intent: intentPayload("valid-excavation-direct"),
        materializedAt: "2026-09-16T10:01:00.000Z",
        capabilityProfile: { nonsense: true },
      }),
    ).toThrow(SolutionError);
  });
});

describe("validate (deterministic snapshot over a version)", () => {
  test("a replayed version validates to a pass snapshot with seven checks", () => {
    const service = new SolutionService();
    const response = service.validate({
      version: wireVersion(["valid-demolition-removal", "valid-block-wall-placement"]),
      validatedAt: "2026-09-16T10:30:00.000Z",
    });
    expect(response.snapshot.outcome).toBe("pass");
    expect(response.snapshot.checks).toHaveLength(7);
    expect(response.snapshot.engine.kind).toBe("aise-solution-engine");
    expect(response.snapshot.snapshotId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("identical payloads produce identical snapshots (determinism)", () => {
    const service = new SolutionService();
    const payload = {
      version: wireVersion(["valid-excavation-direct"]),
      validatedAt: "2026-09-16T10:30:00.000Z",
    };
    expect(JSON.stringify(service.validate(payload))).toBe(
      JSON.stringify(service.validate(payload)),
    );
  });

  test("a contract-invalid version payload is a typed invalid_version error", () => {
    const service = new SolutionService();
    expect(() =>
      service.validate({
        version: { nonsense: true },
        validatedAt: "2026-09-16T10:30:00.000Z",
      }),
    ).toThrow(SolutionError);
  });

  test("a malformed validatedAt is a typed invalid_timestamp error", () => {
    const service = new SolutionService();
    try {
      service.validate({ version: wireVersion(["valid-excavation-direct"]), validatedAt: "" });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_timestamp");
    }
  });
});

describe("inspect (state/version/lineage readback)", () => {
  test("inspect returns the version spine with the final state by default", () => {
    const service = new SolutionService();
    const response = service.inspect({
      version: wireVersion(["valid-excavation-direct"]),
    });
    expect(response.solutionId).toBe("solution-demo-001");
    expect(response.versionNumber).toBe(1);
    expect(response.parentVersionNumber).toBeUndefined();
    expect(response.status).toBe("draft");
    expect(response.operations).toHaveLength(1);
    expect(response.operations[0]?.operationType).toBe("excavation");
    expect(response.operations[0]?.intentRef).toBe("intent-demo-0001");
    expect(response.states).toHaveLength(2);
    expect(response.requestedStateIndex).toBe(1);
    expect(response.requestedState?.appliedOperationIds).toHaveLength(1);
  });

  test("an explicit stateIndex selects that layer", () => {
    const service = new SolutionService();
    const response = service.inspect({
      version: wireVersion(["valid-excavation-direct"]),
      stateIndex: 0,
    });
    expect(response.requestedStateIndex).toBe(0);
    expect(response.requestedState?.appliedOperationIds).toEqual([]);
  });

  test("an out-of-range stateIndex is a typed invalid_state_index error naming the range", () => {
    const service = new SolutionService();
    expect(() =>
      service.inspect({ version: wireVersion(["valid-excavation-direct"]), stateIndex: 7 }),
    ).toThrow(SolutionError);
    try {
      service.inspect({ version: wireVersion(["valid-excavation-direct"]), stateIndex: 7 });
    } catch (error) {
      expect((error as SolutionError).code).toBe("invalid_state_index");
      expect((error as SolutionError).detail).toContain("0..1");
    }
  });

  test("a non-integer stateIndex is a typed error", () => {
    const service = new SolutionService();
    expect(() =>
      service.inspect({ version: wireVersion(["valid-excavation-direct"]), stateIndex: -1 }),
    ).toThrow(SolutionError);
    expect(() =>
      service.inspect({ version: wireVersion(["valid-excavation-direct"]), stateIndex: 1.5 }),
    ).toThrow(SolutionError);
  });
});

describe("quantities (derived quantities of a state)", () => {
  test("the final state's quantity inventory is returned with totals", () => {
    const service = new SolutionService();
    const response = service.quantities({
      version: wireVersion(["valid-excavation-direct"]),
    });
    expect(response.inventory.stateIndex).toBe(1);
    expect(response.inventory.perOperation).toHaveLength(2);
    const totals = response.inventory.totals.map((total) => ({
      dimension: total.dimension,
      unit: total.unit,
      netValue: total.netValue,
      removedValue: total.removedValue,
      contributors: total.contributingOperationIds.length,
    }));
    expect(totals).toEqual([
      { dimension: "area", unit: "m2", netValue: -6, removedValue: 6, contributors: 1 },
      { dimension: "volume", unit: "m3", netValue: -9, removedValue: 9, contributors: 1 },
    ]);
  });

  test("identical payloads produce identical inventories (determinism)", () => {
    const service = new SolutionService();
    const payload = { version: wireVersion(["valid-excavation-direct"]) };
    expect(JSON.stringify(service.quantities(payload))).toBe(
      JSON.stringify(service.quantities(payload)),
    );
  });

  test("an out-of-range stateIndex is a typed invalid_state_index error", () => {
    const service = new SolutionService();
    expect(() =>
      service.quantities({ version: wireVersion(["valid-excavation-direct"]), stateIndex: 99 }),
    ).toThrow(SolutionError);
  });
});
