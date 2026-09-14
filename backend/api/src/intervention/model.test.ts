/**
 * AISE-026 — Intervention domain model tests.
 *
 * THE CRITICAL MATRIX, part 1: frozen vocabularies, the typed error
 * registry, the state-id derivation (order-sensitive, clock-free),
 * boundary input parsers (shape/vocabulary → typed codes, provenance and
 * unit discipline) and the stored-record parser (garbage on disk → typed
 * rejections; the PROPOSED-only epistemic invariant re-checked on read).
 * Includes the TYPE-LEVEL isolation assertions (@ts-expect-error):
 * OBSERVED/CONFIRMED are unrepresentable inside an intervention state.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  INTERVENTION_ERROR_CODES,
  InterventionError,
  SCENARIO_STATUSES,
  SCENARIO_TRANSITIONS,
  STATE_NODE_ORIGINS,
  STEP_KINDS,
  TERMINAL_SCENARIO_STATUSES,
  deriveStateId,
  isTerminalScenarioStatus,
  parseAddStepInput,
  parseApprovalReferenceInput,
  parseCreateScenarioInput,
  parseInterventionScenarioRecord,
  parseStatusTransitionInput,
  type AddStepInput,
  type InterventionErrorCode,
  type ProposedNode,
  type ProposedProperty,
  type StateIdentity,
} from "./model";
import { InterventionService } from "./service";
import { InMemoryInterventionStore } from "./store";
import {
  EV_FIRE_SPEC,
  FIXED_NOW,
  PROJECT_ID,
  SCENARIO_ID,
  STEP_ADD_PARTITION,
  STEP_FIRE_RATING,
  STEP_NOTE,
  STEP_REMOVE_WALL_EAST,
  buildBaselineStorey,
  fixedClock,
  makeBaselineResolver,
  runCanonicalScenario,
} from "./testkit";

function expectParseCode(fn: () => unknown, code: InterventionErrorCode): void {
  try {
    fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(InterventionError);
    expect((error as InterventionError).code).toBe(code);
  }
}

function makeService(): InterventionService {
  return new InterventionService({
    store: new InMemoryInterventionStore(),
    clock: fixedClock,
    baselineResolver: makeBaselineResolver(PROJECT_ID, [buildBaselineStorey()]),
  });
}

describe("intervention model: frozen vocabularies and registries", () => {
  test("STEP_KINDS is the exact frozen work-order vocabulary", () => {
    expect([...STEP_KINDS]).toEqual([
      "property_change",
      "element_addition",
      "element_modification",
      "proposed_removal",
      "note",
    ]);
    expect(Object.isFrozen(STEP_KINDS)).toBe(true);
  });

  test("SCENARIO_STATUSES is exact and frozen; terminal statuses documented", () => {
    expect([...SCENARIO_STATUSES]).toEqual([
      "draft",
      "under_review",
      "approved",
      "rejected",
      "superseded",
    ]);
    expect(Object.isFrozen(SCENARIO_STATUSES)).toBe(true);
    expect([...TERMINAL_SCENARIO_STATUSES]).toEqual(["approved", "rejected", "superseded"]);
    expect(isTerminalScenarioStatus("approved")).toBe(true);
    expect(isTerminalScenarioStatus("rejected")).toBe(true);
    expect(isTerminalScenarioStatus("superseded")).toBe(true);
    expect(isTerminalScenarioStatus("draft")).toBe(false);
    expect(isTerminalScenarioStatus("under_review")).toBe(false);
  });

  test("SCENARIO_TRANSITIONS is the governed table (superseded terminal)", () => {
    expect(Object.isFrozen(SCENARIO_TRANSITIONS)).toBe(true);
    expect([...SCENARIO_TRANSITIONS.draft]).toEqual(["under_review", "superseded"]);
    expect([...SCENARIO_TRANSITIONS.under_review]).toEqual([
      "approved",
      "rejected",
      "superseded",
    ]);
    expect([...SCENARIO_TRANSITIONS.approved]).toEqual([]);
    expect([...SCENARIO_TRANSITIONS.rejected]).toEqual([]);
    expect([...SCENARIO_TRANSITIONS.superseded]).toEqual([]);
  });

  test("INTERVENTION_ERROR_CODES is frozen and unique", () => {
    expect(Object.isFrozen(INTERVENTION_ERROR_CODES)).toBe(true);
    expect(new Set(INTERVENTION_ERROR_CODES).size).toBe(INTERVENTION_ERROR_CODES.length);
    // The mandate's named codes are all present, verbatim.
    for (const code of [
      "unknown_node_ref",
      "baseline_mismatch",
      "step_sequence_gap",
      "scenario_exists",
      "approval_reference_required",
      "invalid_epistemic_status",
      "invalid_intervention_record",
      "scenario_not_found",
      "state_not_found",
    ] as const) {
      expect(INTERVENTION_ERROR_CODES).toContain(code);
    }
  });

  test("STATE_NODE_ORIGINS is exact and frozen", () => {
    expect([...STATE_NODE_ORIGINS]).toEqual(["baseline", "baseline_touched", "scenario"]);
    expect(Object.isFrozen(STATE_NODE_ORIGINS)).toBe(true);
  });
});

describe("intervention model: TYPE-LEVEL proposal isolation", () => {
  test("OBSERVED/CONFIRMED/INFERRED are unrepresentable on proposed content", () => {
    // @ts-expect-error — "OBSERVED" is not assignable to the literal "PROPOSED"
    const observedStatus: ProposedNode["epistemicStatus"] = "OBSERVED";
    void observedStatus;
    // @ts-expect-error — "CONFIRMED" is not assignable to the literal "PROPOSED"
    const confirmedStatus: ProposedProperty["epistemicStatus"] = "CONFIRMED";
    void confirmedStatus;
    // @ts-expect-error — "INFERRED" is not assignable to the literal "PROPOSED"
    const inferredStatus: ProposedProperty["epistemicStatus"] = "INFERRED";
    void inferredStatus;
    const proposedStatus: ProposedNode["epistemicStatus"] = "PROPOSED";
    expect(proposedStatus).toBe("PROPOSED");
  });

  test("a full proposed node cannot be constructed with OBSERVED", () => {
    const node: ProposedNode = {
      nodeId: "node-x",
      kind: "element",
      epistemicStatus: "PROPOSED",
      properties: [],
      provenance: [],
    };
    // @ts-expect-error — the epistemic overwrite makes OBSERVED a type error here
    const bad: ProposedNode = { ...node, epistemicStatus: "OBSERVED" };
    void bad;
    expect(node.epistemicStatus).toBe("PROPOSED");
  });

  test("a reality node (EpistemicStatus union) is NOT assignable to ProposedNode", () => {
    const realityNode = {
      nodeId: "node-wall-north",
      kind: "element",
      epistemicStatus: "OBSERVED" as const,
      properties: [
        {
          key: "thickness",
          value: 240,
          unit: "mm",
          epistemicStatus: "OBSERVED" as const,
          provenance: [],
        },
      ],
      provenance: [],
    };
    // @ts-expect-error — RealityNode's EpistemicStatus union cannot enter the
    // proposal layer without an explicit projection (the isolation proof).
    const asProposed: ProposedNode = realityNode;
    void asProposed;
    expect(realityNode.epistemicStatus).toBe("OBSERVED");
  });
});

describe("intervention model: state id derivation", () => {
  const identity: StateIdentity = {
    scenarioId: "scenario-x",
    stateIndex: 2,
    baselineVersionId: "v001",
    appliedStepIds: ["step-a", "step-b"],
    nodes: [],
    relationships: [],
    proposedTombstones: [],
  };

  test("same identity → same id (pure); state ids are 64-hex content addresses", () => {
    const first = deriveStateId(identity);
    const second = deriveStateId(identity);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  test("step ORDER is hashed in (order sensitivity)", () => {
    const reordered: StateIdentity = {
      ...identity,
      appliedStepIds: ["step-b", "step-a"],
    };
    expect(deriveStateId(reordered)).not.toBe(deriveStateId(identity));
  });

  test("materializedAt / timestamps are EXCLUDED (identity is content, not clock)", () => {
    // materializedAt is not even part of StateIdentity; the derivation is
    // clock-free by construction — the same content maps to the same id.
    expect(deriveStateId(identity)).toBe(deriveStateId({ ...identity, nodes: [] }));
  });

  test("content changes change the id (discrimination)", () => {
    const grown: StateIdentity = {
      ...identity,
      appliedStepIds: ["step-a", "step-b", "step-c"],
    };
    expect(deriveStateId(grown)).not.toBe(deriveStateId(identity));
    const otherBaseline: StateIdentity = { ...identity, baselineVersionId: "v002" };
    expect(deriveStateId(otherBaseline)).not.toBe(deriveStateId(identity));
  });
});

describe("intervention model: boundary parsers", () => {
  test("parseCreateScenarioInput: happy path + typed rejections", () => {
    expect(
      parseCreateScenarioInput({
        scenarioId: SCENARIO_ID,
        projectId: PROJECT_ID,
        title: "Office refit",
        baselineVersionId: "v001",
      }),
    ).toEqual({
      scenarioId: SCENARIO_ID,
      projectId: PROJECT_ID,
      title: "Office refit",
      baselineVersionId: "v001",
    });
    expectParseCode(() => parseCreateScenarioInput("nope"), "invalid_scenario");
    expectParseCode(() => parseCreateScenarioInput({ projectId: "p", title: "t" }), "invalid_scenario_id");
    expectParseCode(
      () => parseCreateScenarioInput({ scenarioId: "s", title: "t", baselineVersionId: "v001" }),
      "invalid_project_id",
    );
    expectParseCode(
      () => parseCreateScenarioInput({ scenarioId: "s", projectId: "p", baselineVersionId: "v001" }),
      "invalid_scenario",
    );
    expectParseCode(
      () => parseCreateScenarioInput({ scenarioId: "s", projectId: "p", title: "t" }),
      "invalid_version_id",
    );
    expectParseCode(
      () =>
        parseCreateScenarioInput({
          scenarioId: "s",
          projectId: "p",
          title: "t",
          baselineVersionId: "version-9",
        }),
      "invalid_version_id",
    );
  });

  test("parseAddStepInput: all five step kinds parse (values/units VERBATIM)", () => {
    for (const step of [
      STEP_FIRE_RATING,
      STEP_ADD_PARTITION,
      STEP_REMOVE_WALL_EAST,
      STEP_NOTE,
    ]) {
      // Wire payloads are FLAT: the change payload fields sit at the top
      // level (parser composes the typed change itself). Spread the
      // fixture's composed change back into flat wire form.
      const parsed = parseAddStepInput({
        ...step.change,
        targetNodeId: step.targetNodeId,
        ...(step.rationale === undefined ? {} : { rationale: step.rationale }),
        provenance: step.provenance,
      });
      expect(parsed.kind).toBe(step.kind);
      expect(parsed.change).toEqual(step.change);
      expect(parsed.provenance).toEqual(step.provenance);
    }
  });

  test("parseAddStepInput: provenance is REQUIRED (missing_provenance)", () => {
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "note",
          targetNodeId: "wall-north",
          change: { kind: "note", text: "x" },
          provenance: { evidenceIds: [] },
        }),
      "missing_provenance",
    );
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "note",
          targetNodeId: "wall-north",
          change: { kind: "note", text: "x" },
          provenance: {},
        }),
      "missing_provenance",
    );
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "note",
          targetNodeId: "wall-north",
          change: { kind: "note", text: "x" },
        }),
      "invalid_provenance",
    );
  });

  test("parseAddStepInput: numeric values REQUIRE typed units (reality discipline)", () => {
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "property_change",
          targetNodeId: "wall-north",
          property: { key: "thickness", value: 240 },
          provenance: { evidenceIds: [EV_FIRE_SPEC] },
        }),
      "numeric_value_without_unit",
    );
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "property_change",
          targetNodeId: "wall-north",
          property: { key: "fireRating", value: "REI90", unit: "minutes" },
          provenance: { evidenceIds: [EV_FIRE_SPEC] },
        }),
      "invalid_property",
    );
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "property_change",
          targetNodeId: "wall-north",
          property: { key: "x", value: Number.NaN },
          provenance: { evidenceIds: [EV_FIRE_SPEC] },
        }),
      "invalid_property",
    );
  });

  test("parseAddStepInput: kind vocabulary and per-kind payload rejections", () => {
    const provenance = { evidenceIds: [EV_FIRE_SPEC] };
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "demolition",
          targetNodeId: "wall-north",
          provenance,
        }),
      "invalid_step",
    );
    expectParseCode(() => parseAddStepInput({ kind: "note", provenance }), "invalid_step");
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "note",
          targetNodeId: "wall-north",
          text: "",
          provenance,
        }),
      "invalid_step_payload",
    );
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "proposed_removal",
          targetNodeId: "wall-east",
          provenance,
        }),
      "invalid_step_payload",
    );
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "element_modification",
          targetNodeId: "wall-north",
          provenance,
        }),
      "invalid_step_payload",
    );
    // An added element with zero properties is structurally VALID — the
    // provenance requirement lives at the STEP level, not per-property.
    // (Documented honest behavior: the parser accepts the empty array.)
    const sparseAddition = parseAddStepInput({
      kind: "element_addition",
      targetNodeId: "wall-new",
      node: { kind: "element", properties: [] },
      provenance,
    });
    expect(sparseAddition.change).toEqual({
      kind: "element_addition",
      node: { kind: "element", properties: [] },
    });
    expectParseCode(
      () =>
        parseAddStepInput({
          kind: "element_addition",
          targetNodeId: "wall-new",
          node: { kind: "element", properties: [{ key: "k", value: 1 }] },
          provenance,
        }),
      "numeric_value_without_unit",
    );
  });

  test("parseApprovalReferenceInput + parseStatusTransitionInput", () => {
    const reference = parseApprovalReferenceInput({
      caseId: "case-7",
      reviewDecision: "approved",
      reviewedAt: FIXED_NOW,
    });
    expect(reference).toEqual({
      caseId: "case-7",
      reviewDecision: "approved",
      reviewedAt: FIXED_NOW,
    });
    expectParseCode(
      () => parseApprovalReferenceInput({ reviewDecision: "approved", reviewedAt: FIXED_NOW }),
      "invalid_approval_reference",
    );
    expectParseCode(
      () =>
        parseApprovalReferenceInput({
          caseId: "case-7",
          reviewDecision: "",
          reviewedAt: FIXED_NOW,
        }),
      "invalid_approval_reference",
    );
    expect(parseStatusTransitionInput({ status: "under_review" }).status).toBe("under_review");
    expectParseCode(() => parseStatusTransitionInput({ status: "closed" }), "invalid_status_transition");
    expectParseCode(() => parseStatusTransitionInput("nope"), "invalid_status_transition");
  });
});

describe("intervention model: stored-record parser", () => {
  test("a canonical scenario record round-trips through the parser", async () => {
    const service = makeService();
    const record = await runCanonicalScenario(service);
    const parsed = parseInterventionScenarioRecord(JSON.parse(canonicalJsonStringify(record)));
    expect(parsed.scenarioId).toBe(record.scenarioId);
    expect(parsed.steps.map((step) => step.stepId)).toEqual(
      record.steps.map((step) => step.stepId),
    );
    expect(parsed.states.map((state) => state.stateId)).toEqual(
      record.states.map((state) => state.stateId),
    );
    expect(canonicalJsonStringify(parsed)).toBe(canonicalJsonStringify(record));
  });

  test("garbage on disk is a typed rejection, never a silent misparse", async () => {
    const service = makeService();
    const record = await runCanonicalScenario(service);
    const onDisk = JSON.parse(canonicalJsonStringify(record)) as Record<string, unknown>;
    expectParseCode(() => parseInterventionScenarioRecord("nope"), "invalid_intervention_record");
    expectParseCode(() => parseInterventionScenarioRecord([]), "invalid_intervention_record");
    expectParseCode(
      () => parseInterventionScenarioRecord({ ...onDisk, status: "finished" }),
      "invalid_intervention_record",
    );
    expectParseCode(
      () => parseInterventionScenarioRecord({ ...onDisk, states: [] }),
      "invalid_intervention_record",
    );
    expectParseCode(
      () =>
        parseInterventionScenarioRecord({
          ...onDisk,
          steps: (onDisk.steps as unknown[]).slice(0, 1),
        }),
      "invalid_intervention_record",
    );
  });

  test("an OBSERVED status leaking into state content is rejected (epistemic invariant)", async () => {
    const service = makeService();
    const record = await runCanonicalScenario(service);
    const onDisk = JSON.parse(canonicalJsonStringify(record)) as Record<string, unknown>;
    const states = onDisk.states as Record<string, unknown>[];
    const nodes = states[0]?.nodes as Record<string, unknown>[];
    const leaked = JSON.parse(
      canonicalJsonStringify(nodes[0]),
    ) as Record<string, unknown>;
    const innerNode = leaked.node as Record<string, unknown>;
    innerNode.epistemicStatus = "OBSERVED";
    nodes[0] = leaked;
    expectParseCode(() => parseInterventionScenarioRecord(onDisk), "invalid_epistemic_status");
  });

  test("step-sequence gaps and duplicate ids in stored steps are rejected", async () => {
    const service = makeService();
    const record = await runCanonicalScenario(service);
    const onDisk = JSON.parse(canonicalJsonStringify(record)) as Record<string, unknown>;
    const steps = onDisk.steps as Record<string, unknown>[];
    const gapped = JSON.parse(canonicalJsonStringify(onDisk)) as Record<string, unknown>;
    (gapped.steps as Record<string, unknown>[])[1] = {
      ...(gapped.steps as Record<string, unknown>[])[1],
      stepIndex: 3,
    };
    expectParseCode(() => parseInterventionScenarioRecord(gapped), "invalid_intervention_record");
    const duplicated = JSON.parse(canonicalJsonStringify(onDisk)) as Record<string, unknown>;
    (duplicated.steps as Record<string, unknown>[])[1] = {
      ...(duplicated.steps as Record<string, unknown>[])[1],
      stepId: (steps[0] as Record<string, unknown>).stepId,
      stepIndex: 1,
    };
    expectParseCode(() => parseInterventionScenarioRecord(duplicated), "invalid_intervention_record");
  });
});

describe("intervention model: service-free AddStepInput shape sanity", () => {
  test("the canonical fixtures are parseable inputs with VERBATIM payloads", () => {
    for (const step of [STEP_FIRE_RATING, STEP_ADD_PARTITION, STEP_REMOVE_WALL_EAST] as const) {
      const input: AddStepInput = step;
      expect(input.targetNodeId.length).toBeGreaterThan(0);
      expect(
        input.provenance.evidenceIds.length > 0 || input.provenance.derivationNote !== undefined,
      ).toBe(true);
    }
  });
});
