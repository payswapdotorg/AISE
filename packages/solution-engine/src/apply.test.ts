/**
 * Operation application tests (PROD-022) — the core + the negative and
 * discrimination suite.
 *
 * Proves the work order's acceptance criteria at the application level:
 *  - identical inputs reproduce identical states/quantities (determinism);
 *  - invalid/ambiguous operations fail closed with the RIGHT reason code
 *    (the full reason-code inventory: every fail-closed path is exercised);
 *  - effects/quantities are traceable to their parameters and source state;
 *  - the contract's negotiation gates execution (all four outcomes map to
 *    the documented engine outcomes);
 *  - inputs are consumed read-only (deep structural equality snapshots).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import {
  REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE,
  checkEngineeringOperation,
  decodeEngineeringOperation,
  encodeEngineeringOperation,
  encodeProposedState,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
  type OperationEffect,
  type ProposedState,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  applyOperation,
  type OperationApplicationResult,
  type RefusedOperation,
} from "./apply";
import {
  SOLUTION_ENGINE_KIND,
  SOLUTION_ENGINE_VERSION,
} from "./engine-version";
import { ENGINE_REASON_CODES, type EngineReasonCode } from "./errors";
import {
  REFERENCE_PROFILE,
  agentProvenance,
  contractIntent,
  deepClone,
  demoBaselineGeometry,
  directProvenance,
  faceSetTarget,
  intent,
  volumeTarget,
  wallUpgradeIntents,
} from "./testkit";

function baselineState(): ProposedState {
  return {
    contractVersion: "1.0.0",
    stateId: "state-engine-test-baseline-0000000000000000000",
    solutionId: "solution-demo-001",
    versionNumber: 1,
    stateIndex: 0,
    baselineRealityVersionId: "rgv-demo-0007",
    epistemicStatus: "PROPOSED",
    appliedOperationIds: [],
    materializedAt: "2026-09-16T10:00:00.000Z",
  };
}

const MATERIALIZE_AT = "2026-09-16T10:01:00.000Z";

function apply(
  intentInput: EngineeringOperationIntent,
  options?: {
    baseline?: ProposedState;
    profile?: OperationCapabilityProfile;
    geometry?: boolean;
  },
): OperationApplicationResult {
  const geometry = options?.geometry === false ? undefined : demoBaselineGeometry();
  return applyOperation({
    baseline: options?.baseline ?? baselineState(),
    intent: intentInput,
    capabilityProfile: options?.profile ?? REFERENCE_PROFILE,
    materializedAt: MATERIALIZE_AT,
    ...(geometry === undefined ? {} : { baselineGeometry: geometry }),
  });
}

function excavationIntent(parameters?: { name: string; value: number; unit?: string }[]) {
  return intent({
    intentId: "intent-test-excavation-0001",
    operationType: "excavation",
    parameters: parameters ?? [
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ],
    target: volumeTarget(),
    provenance: directProvenance(),
  });
}

describe("application happy path (the core acceptance)", () => {
  test("an excavation intent applies and produces a complete applied result", () => {
    const result = apply(excavationIntent());
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    expect(result.operation.operationType).toBe("excavation");
    expect(result.operation.operationIndex).toBe(1);
    expect(result.operation.provenance.intentRef).toBe("intent-test-excavation-0001");
    expect(result.resultingState.stateIndex).toBe(1);
    expect(result.resultingState.appliedOperationIds).toEqual([result.operation.operationId]);
    expect(result.resultingState.epistemicStatus).toBe("PROPOSED");
    expect(result.quantities).toHaveLength(2);
    expect(result.lineage.parentStateId).toBe(baselineState().stateId);
    expect(result.lineage.intentId).toBe("intent-test-excavation-0001");
    expect(result.lineage.resultingStateId).toBe(result.resultingState.stateId);
    expect(result.lineage.transitionId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("identical inputs produce identical applied results (determinism)", () => {
    const first = apply(excavationIntent());
    const second = apply(excavationIntent());
    expect(encodeResult(first)).toBe(encodeResult(second));
  });

  test("a different parameter derives a different operation id (discrimination)", () => {
    const first = apply(excavationIntent());
    const deeper = apply(
      excavationIntent([
        { name: "depth", value: 2, unit: "m" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ]),
    );
    expect(first.outcome).toBe("applied");
    expect(deeper.outcome).toBe("applied");
    if (first.outcome === "applied" && deeper.outcome === "applied") {
      expect(deeper.operation.operationId).not.toBe(first.operation.operationId);
      expect(deeper.quantities[0]?.value).toBe(12);
    }
  });

  test("the emitted operation record satisfies the contract's own invariants and codecs", () => {
    const result = apply(excavationIntent());
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    expect(checkEngineeringOperation(result.operation)).toEqual([]);
    // canonical encode + decode round-trip (the wire form is contract-shaped)
    const encoded = encodeEngineeringOperation(result.operation);
    const decoded = decodeEngineeringOperation(JSON.parse(encoded));
    expect(decoded.operationId).toBe(result.operation.operationId);
    expect(encodeProposedState(result.resultingState)).toContain("PROPOSED");
  });

  test("effects are OperationEffect-shaped: one state transition + one per quantity", () => {
    const result = apply(excavationIntent());
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    const effects = result.effects as readonly OperationEffect[];
    expect(effects[0]?.effectKind).toBe("state-transition");
    expect(effects[0]?.resultingStateRef).toBe(result.resultingState.stateId);
    expect(effects.slice(1).every((effect) => effect.effectKind === "quantity-impact")).toBe(true);
    expect(effects.slice(1).every((effect) => effect.quantity !== undefined)).toBe(true);
  });

  test("quantities carry parameter traceability (values + units verbatim) and calculation refs", () => {
    const result = apply(excavationIntent());
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    for (const quantity of result.quantities) {
      expect(quantity.calculationRef).toBe(
        `${SOLUTION_ENGINE_KIND}/quantity/excavation/v1`,
      );
      expect(quantity.unit.length).toBeGreaterThan(0);
      for (const parameter of quantity.parameterTrace) {
        expect(parameter.originalUnit).toBe("m");
        expect(parameter.originalValue).toBeGreaterThan(0);
      }
    }
    const volume = result.quantities.find((q) => q.label === "excavated-soil-volume");
    expect(volume?.value).toBe(9);
    expect(volume?.parameterTrace.map((p) => p.name)).toEqual(["depth", "width", "length"]);
  });

  test("the contract's committed demolition intent derives the SAME operation id as the contract's committed demo operation record", () => {
    // Cross-validation: the contract fixture SolutionVersion.valid.json
    // records operation id 78be4786… for the demolition intent in the same
    // version context — the engine's derivation must agree byte-for-byte.
    const result = apply(contractIntent("valid-demolition-removal"));
    expect(result.outcome).toBe("applied");
    if (result.outcome === "applied") {
      expect(result.operation.operationId).toBe(
        "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9",
      );
    }
  });

  test("applying onto a SolutionVersion baseline uses its LAST state as the baseline", () => {
    const intents = wallUpgradeIntents();
    const first = intents[0];
    const second = intents[1];
    if (first === undefined || second === undefined) {
      throw new Error("wall-upgrade corpus is incomplete");
    }
    const firstResult = apply(first);
    expect(firstResult.outcome).toBe("applied");
    if (firstResult.outcome !== "applied") {
      return;
    }
    const lastState = firstResult.resultingState;
    const secondResult = apply(second, { baseline: lastState });
    expect(secondResult.outcome).toBe("applied");
    if (secondResult.outcome === "applied") {
      expect(secondResult.operation.operationIndex).toBe(2);
      expect(secondResult.resultingState.appliedOperationIds).toHaveLength(2);
    }
  });

  test("inputs are consumed READ-ONLY (deep structural equality after application)", () => {
    const input = excavationIntent();
    const baseline = baselineState();
    const snapshot = { intent: deepClone(input), baseline: deepClone(baseline) };
    apply(input, { baseline });
    expect(input).toEqual(snapshot.intent);
    expect(baseline).toEqual(snapshot.baseline);
  });
});

describe("negotiation gating (the contract's single negotiation semantics)", () => {
  test("negotiation executable → the engine proceeds and echoes the negotiation", () => {
    const result = apply(excavationIntent());
    expect(result.outcome).toBe("applied");
    if (result.outcome === "applied") {
      expect(result.negotiation.outcome).toBe("executable");
      expect(result.negotiation.reasons[0]?.code).toBe("capability-satisfied");
    }
  });

  test("negotiation blocked (missing parameter) → needs-input with missing_required_parameter", () => {
    const result = apply(
      intent({
        intentId: "intent-test-blocked-0001",
        operationType: "excavation",
        parameters: [
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ],
        target: volumeTarget(),
        provenance: directProvenance(),
      }),
    );
    expect(result.outcome).toBe("needs-input");
    if (result.outcome === "applied") {
      return;
    }
    expect(result.reasons.map((reason) => reason.code)).toEqual(["missing_required_parameter"]);
    expect(result.negotiation.outcome).toBe("blocked");
    expect(result.negotiation.missingParameters).toEqual(["depth"]);
  });

  test("negotiation unsupported (undeclared operation type) → unsupported with capability_unsupported", () => {
    const result = apply(contractIntent("valid-undeclared-operation-trench-shoring"));
    expect(result.outcome).toBe("unsupported");
    if (result.outcome === "applied") {
      return;
    }
    expect(result.reasons.map((reason) => reason.code)).toEqual(["capability_unsupported"]);
    expect(result.negotiation.outcome).toBe("unsupported");
    expect(result.negotiation.reasons[0]?.code).toBe("operation-type-not-declared");
  });

  test("negotiation unsupported (future vertical) → unsupported, honest reason names the vertical", () => {
    const result = apply(contractIntent("valid-future-vertical-mep"));
    expect(result.outcome).toBe("unsupported");
    if (result.outcome === "applied") {
      return;
    }
    expect(result.negotiation.reasons[0]?.code).toBe("domain-not-declared");
    expect(result.reasons[0]?.detail).toContain("mep");
  });

  test("negotiation unknown (undetermined capability) → needs-input with capability_undetermined — NEVER unsupported", () => {
    // the partial reference profile declares excavation capability unknown
    const result = apply(excavationIntent(), {
      profile: REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE,
    });
    expect(result.outcome).toBe("needs-input");
    if (result.outcome === "applied") {
      return;
    }
    expect(result.reasons.map((reason) => reason.code)).toEqual(["capability_undetermined"]);
    expect(result.negotiation.outcome).toBe("unknown");
  });

  test("degraded capability still executes and the limitations are surfaced in the echo", () => {
    // the partial reference profile declares plaster-application degraded
    const result = apply(contractIntent("valid-plaster-application"), {
      profile: REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE,
    });
    expect(result.outcome).toBe("applied");
    if (result.outcome === "applied") {
      expect(result.negotiation.outcome).toBe("executable");
      expect(
        result.negotiation.reasons.some((reason) => reason.code === "capability-degraded"),
      ).toBe(true);
    }
  });
});

describe("fail-closed reason codes (the negative suite inventory)", () => {
  const exercised: EngineReasonCode[] = [];

  function record(result: OperationApplicationResult): RefusedOperation {
    expect(result.outcome).not.toBe("applied");
    expect((result as RefusedOperation).reasons.length).toBeGreaterThan(0);
    for (const reason of (result as RefusedOperation).reasons) {
      expect(ENGINE_REASON_CODES).toContain(reason.code);
      expect(reason.detail.length).toBeGreaterThan(0);
      exercised.push(reason.code);
    }
    return result as RefusedOperation;
  }

  test("intent_invariant_violation — a hand-built intent missing provenance substance is refused", () => {
    const broken = {
      ...excavationIntent(),
      provenance: {
        origin: "direct-manipulation" as const,
        authoredBy: "user-demo-engineer",
        authoredAt: "2026-09-16T09:00:00.000Z",
        evidenceIds: [],
      },
    } as unknown as EngineeringOperationIntent;
    const result = record(apply(broken));
    expect(result.reasons.map((reason) => reason.code)).toContain("intent_invariant_violation");
  });

  test("unknown_unit — a parameter with a unit outside the vocabulary is refused, never guessed", () => {
    const result = record(
      apply(
        excavationIntent([
          { name: "depth", value: 1.5, unit: "furlong" },
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ]),
      ),
    );
    expect(result.reasons.map((reason) => reason.code)).toContain("unknown_unit");
    expect(result.reasons[0]?.detail).toContain("furlong");
  });

  test("unit_dimension_mismatch — a length in kg is refused (dimensional inconsistency)", () => {
    const result = record(
      apply(
        excavationIntent([
          { name: "depth", value: 1.5, unit: "kg" },
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ]),
      ),
    );
    expect(result.reasons.map((reason) => reason.code)).toContain("unit_dimension_mismatch");
  });

  test("parameter_not_positive — a zero/negative dimension is refused", () => {
    const result = record(
      apply(
        excavationIntent([
          { name: "depth", value: 0, unit: "m" },
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ]),
      ),
    );
    expect(result.reasons.map((reason) => reason.code)).toContain("parameter_not_positive");
  });

  test("baseline_mismatch — an intent proposing into another solution is never re-targeted", () => {
    const mismatched = intent({
      intentId: "intent-test-mismatch-0001",
      operationType: "excavation",
      parameters: [
        { name: "depth", value: 1.5, unit: "m" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ],
      target: volumeTarget(),
      provenance: directProvenance(),
      proposedTo: { solutionId: "solution-OTHER", versionNumber: 1 },
    });
    const result = record(apply(mismatched));
    expect(result.reasons.map((reason) => reason.code)).toEqual(["baseline_mismatch"]);
  });

  test("dependency_not_applied — a dependency on an unapplied operation fails closed", () => {
    const result = record(
      apply(
        intent({
          intentId: "intent-test-dep-0001",
          operationType: "backfill",
          parameters: [
            { name: "depth", value: 1.5, unit: "m" },
            { name: "width", value: 2, unit: "m" },
            { name: "length", value: 3, unit: "m" },
          ],
          target: volumeTarget(),
          provenance: directProvenance(),
          dependsOn: [{ operationRef: "op-does-not-exist-yet", dependencyKind: "completion-before" }],
        }),
      ),
    );
    expect(result.reasons.map((reason) => reason.code)).toEqual(["dependency_not_applied"]);
  });

  test("surface_area_unresolved — a coated operation over an unresolvable target asks, never invents", () => {
    const plasterOverUnknown = intent({
      intentId: "intent-test-plaster-0001",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "face-set",
        nodeRefs: ["node-unknown-wall"],
        geometryRefs: [{ kind: "polygon", ref: "geo-unknown-faces", contractVersion: "1.0.0" }],
        units: { linear: "m", angular: "rad" },
        description: "an unresolvable face set",
      },
      provenance: agentProvenance("Apply plaster over there."),
    });
    const result = record(apply(plasterOverUnknown));
    expect(result.reasons.map((reason) => reason.code)).toEqual(["surface_area_unresolved"]);
    expect(result.reasons[0]?.detail).toContain("never invents");
  });

  test("surface_area_unresolved — a coated operation with NO resolver injected asks, never invents", () => {
    const plaster = intent({
      intentId: "intent-test-plaster-0002",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      target: faceSetTarget(),
      provenance: agentProvenance("Apply 30 mm plaster to the affected wall faces."),
    });
    const result = record(apply(plaster, { geometry: false }));
    expect(result.reasons.map((reason) => reason.code)).toEqual(["surface_area_unresolved"]);
  });

  test("every application reason code is exercised (the self-contained inventory)", () => {
    // Re-runs every refusal scenario and collects the reason codes, so the
    // inventory claim is proven in ONE place, independent of test order.
    const codes = new Set<EngineReasonCode>();
    const collect = (result: OperationApplicationResult): void => {
      expect(result.outcome).not.toBe("applied");
      for (const reason of (result as RefusedOperation).reasons) {
        expect(ENGINE_REASON_CODES).toContain(reason.code);
        expect(reason.detail.length).toBeGreaterThan(0);
        codes.add(reason.code);
      }
    };

    // invariant violation
    collect(
      apply({
        ...excavationIntent(),
        provenance: {
          origin: "direct-manipulation" as const,
          authoredBy: "user-demo-engineer",
          authoredAt: "2026-09-16T09:00:00.000Z",
          evidenceIds: [],
        },
      } as unknown as EngineeringOperationIntent),
    );
    // unknown unit
    collect(
      apply(
        excavationIntent([
          { name: "depth", value: 1.5, unit: "furlong" },
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ]),
      ),
    );
    // dimension mismatch
    collect(
      apply(
        excavationIntent([
          { name: "depth", value: 1.5, unit: "kg" },
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ]),
      ),
    );
    // not numeric (a string value in a numeric slot — contract-schema-legal)
    collect(
      apply(
        intent({
          intentId: "intent-test-nonnumeric-0001",
          operationType: "excavation",
          parameters: [
            { name: "depth", value: "very deep" },
            { name: "width", value: 2, unit: "m" },
            { name: "length", value: 3, unit: "m" },
          ],
          target: volumeTarget(),
          provenance: directProvenance(),
        }),
      ),
    );
    // not positive
    collect(
      apply(
        excavationIntent([
          { name: "depth", value: -1.5, unit: "m" },
          { name: "width", value: 2, unit: "m" },
          { name: "length", value: 3, unit: "m" },
        ]),
      ),
    );
    // baseline mismatch
    collect(
      apply(
        intent({
          intentId: "intent-test-mismatch-0001",
          operationType: "excavation",
          parameters: [
            { name: "depth", value: 1.5, unit: "m" },
            { name: "width", value: 2, unit: "m" },
            { name: "length", value: 3, unit: "m" },
          ],
          target: volumeTarget(),
          provenance: directProvenance(),
          proposedTo: { solutionId: "solution-OTHER", versionNumber: 1 },
        }),
      ),
    );
    // dependency not applied
    collect(
      apply(
        intent({
          intentId: "intent-test-dep-0001",
          operationType: "backfill",
          parameters: [
            { name: "depth", value: 1.5, unit: "m" },
            { name: "width", value: 2, unit: "m" },
            { name: "length", value: 3, unit: "m" },
          ],
          target: volumeTarget(),
          provenance: directProvenance(),
          dependsOn: [
            { operationRef: "op-does-not-exist-yet", dependencyKind: "completion-before" },
          ],
        }),
      ),
    );
    // surface area unresolved (no resolver)
    collect(
      apply(
        intent({
          intentId: "intent-test-plaster-0002",
          operationType: "plaster-application",
          parameters: [
            { name: "thickness", value: 30, unit: "mm" },
            { name: "material", value: "cement-plaster" },
          ],
          target: faceSetTarget(),
          provenance: agentProvenance("Apply 30 mm plaster to the affected wall faces."),
        }),
        { geometry: false },
      ),
    );
    // negotiation-driven: blocked / unsupported / unknown
    collect(
      apply(
        intent({
          intentId: "intent-test-blocked-0002",
          operationType: "excavation",
          parameters: [
            { name: "width", value: 2, unit: "m" },
            { name: "length", value: 3, unit: "m" },
          ],
          target: volumeTarget(),
          provenance: directProvenance(),
        }),
      ),
    );
    collect(apply(contractIntent("valid-undeclared-operation-trench-shoring")));
    collect(
      apply(excavationIntent(), { profile: REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE }),
    );
    // missing parameter for the model: a LAXER profile (requires only depth)
    // passes negotiation, but the reference model needs width+length too.
    collect(
      apply(excavationIntent([
        { name: "depth", value: 1.5, unit: "m" },
        { name: "width", value: 2, unit: "m" },
      ]), { profile: laxProfile() }),
    );
    // duplicate operation in state: a hostile baseline whose applied list
    // already contains the id this apply would derive (structural guard)
    const duplicateIntent = excavationIntent();
    const hostileBase: ProposedState = {
      ...baselineState(),
      stateIndex: 1,
      appliedOperationIds: ["precomputed-duplicate-operation-id"],
    };
    // derive the id the engine will compute for index 2 semantics
    const derivedFirst = applyOperation({
      baseline: hostileBase,
      intent: duplicateIntent,
      capabilityProfile: REFERENCE_PROFILE,
      materializedAt: MATERIALIZE_AT,
    });
    if (derivedFirst.outcome === "applied") {
      const duplicateBase: ProposedState = {
        ...hostileBase,
        appliedOperationIds: [derivedFirst.operation.operationId],
      };
      collect(apply(duplicateIntent, { baseline: duplicateBase }));
    }

    const applicationCodes: EngineReasonCode[] = [
      "intent_invariant_violation",
      "unknown_unit",
      "unit_dimension_mismatch",
      "parameter_not_numeric",
      "parameter_not_positive",
      "missing_parameter_for_model",
      "dependency_not_applied",
      "baseline_mismatch",
      "duplicate_operation_in_state",
      "capability_unsupported",
      "missing_required_parameter",
      "capability_undetermined",
      "surface_area_unresolved",
    ];
    for (const code of applicationCodes) {
      expect(codes.has(code)).toBe(true);
    }
  });
});

/** A laxer engine profile (requires only depth for excavation) — used to
 *  prove profile/model independence: negotiation passes, the model refuses. */
function laxProfile(): OperationCapabilityProfile {
  return {
    ...REFERENCE_PROFILE,
    profileId: "profile-lax-test",
    domains: REFERENCE_PROFILE.domains.map((domain) => ({
      ...domain,
      operations: domain.operations.map((entry) =>
        entry.operationType === "excavation"
          ? { ...entry, requiredParameters: ["depth"] }
          : entry,
      ),
    })),
  };
}

describe("unit handling (explicit, converted, never silent)", () => {
  test("a thickness in mm converts exactly into the m3 volume (30 mm → 0.03 m)", () => {
    const plaster = intent({
      intentId: "intent-test-plaster-mm-0001",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      target: faceSetTarget(),
      provenance: agentProvenance("Apply 30 mm plaster to the affected wall faces."),
    });
    const result = apply(plaster);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    const volume = result.quantities.find((q) => q.label === "plaster-volume");
    expect(volume?.value).toBe(0.375); // 12.5 m2 × 0.03 m
    const area = result.quantities.find((q) => q.label === "plaster-area");
    expect(area?.value).toBe(12.5);
  });

  test("cm parameters compute the same quantities as m parameters (exact conversion)", () => {
    const inCm = apply(
      excavationIntent([
        { name: "depth", value: 150, unit: "cm" },
        { name: "width", value: 200, unit: "cm" },
        { name: "length", value: 300, unit: "cm" },
      ]),
    );
    const inM = apply(excavationIntent());
    expect(inCm.outcome).toBe("applied");
    expect(inM.outcome).toBe("applied");
    if (inCm.outcome === "applied" && inM.outcome === "applied") {
      expect(inCm.quantities.find((q) => q.label === "excavated-soil-volume")?.value).toBe(
        inM.quantities.find((q) => q.label === "excavated-soil-volume")?.value,
      );
      // ...but the identities DIFFER (the wire parameters differ — traceability)
      expect(inCm.operation.operationId).not.toBe(inM.operation.operationId);
    }
  });

  test("the parameter trace preserves the ORIGINAL unit (no silent rewrite)", () => {
    const inCm = apply(
      excavationIntent([
        { name: "depth", value: 150, unit: "cm" },
        { name: "width", value: 200, unit: "cm" },
        { name: "length", value: 300, unit: "cm" },
      ]),
    );
    expect(inCm.outcome).toBe("applied");
    if (inCm.outcome === "applied") {
      expect(inCm.quantities[0]?.parameterTrace[0]?.originalUnit).toBe("cm");
      expect(inCm.quantities[0]?.parameterTrace[0]?.originalValue).toBe(150);
    }
  });
});

describe("quantitative Phase 1 limits (deterministic findings on the applied result)", () => {
  test("an excavation deeper than 6 m applies but carries the limit finding (validation gates it)", () => {
    const result = apply(
      excavationIntent([
        { name: "depth", value: 8, unit: "m" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ]),
    );
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    expect(result.limitsExceeded.map((limit) => limit.limitId)).toEqual(["excavation-max-depth"]);
  });

  test("a plaster coat thicker than 50 mm carries the limit finding", () => {
    const plaster = intent({
      intentId: "intent-test-plaster-thick-0001",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 60, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      target: faceSetTarget(),
      provenance: agentProvenance("Apply 60 mm plaster to the affected wall faces."),
    });
    const result = apply(plaster);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    expect(result.limitsExceeded.map((limit) => limit.limitId)).toEqual([
      "plaster-max-thickness-per-coat",
    ]);
  });

  test("within-limit operations carry no limit findings", () => {
    const result = apply(excavationIntent());
    expect(result.outcome).toBe("applied");
    if (result.outcome === "applied") {
      expect(result.limitsExceeded).toEqual([]);
    }
  });
});

describe("provenance handling", () => {
  test("the applied result preserves the intent's provenance verbatim + the intentRef link", () => {
    const source = contractIntent("valid-plaster-application");
    const result = apply(source);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    expect(result.operation.provenance.origin).toBe("agent");
    expect(result.operation.provenance.commandText).toBe(
      "Apply 30 mm plaster to the affected wall faces.",
    );
    expect(result.operation.provenance.intentRef).toBe(source.intentId);
  });

  test("engine identity constants are stable (snapshot identity inputs)", () => {
    expect(SOLUTION_ENGINE_KIND).toBe("aise-solution-engine");
    expect(SOLUTION_ENGINE_VERSION).toBe("1.0.0");
  });
});

/** Deterministic canonical serialization of a result (for equality checks). */
function encodeResult(result: OperationApplicationResult): string {
  return canonicalJsonStringify(result);
}
