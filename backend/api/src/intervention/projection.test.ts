/**
 * AISE-026 — Intervention projection tests. THE DETERMINISTIC ENGINE.
 *
 * THE CRITICAL MATRIX, part 2: layer-N determinism (byte-identical
 * replays, order-insensitive baseline input, order-SENSITIVE steps),
 * baseline pinning at the engine level, the epistemic overwrite (every
 * materialized node/property PROPOSED; OBSERVED/CONFIRMED/INFERRED never
 * leak into a proposal), proposed-removal tombstones (baseline node
 * verbatim in earlier states), step validation (unknown node refs NAMING
 * the id, sequence gaps, duplicate ids, payload discipline) and purity
 * (deep-frozen inputs survive).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  InterventionError,
  type AddStepInput,
  type InterventionErrorCode,
  type InterventionStep,
} from "./model";
import {
  applyStep,
  canonicalStateText,
  materializeState,
  overlayBaseline,
} from "./projection";
import {
  EV_FIRE_SPEC,
  FIXED_LATER,
  FIXED_NOW,
  PROJECT_ID,
  SCENARIO_ID,
  STEP_ADD_PARTITION,
  STEP_FIRE_RATING,
  STEP_MODIFY_WALL_NORTH,
  STEP_NOTE,
  STEP_REMOVE_WALL_EAST,
  buildBaselineStorey,
  deepFreeze,
} from "./testkit";

function expectCode(fn: () => unknown, code: InterventionErrorCode): void {
  try {
    fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(InterventionError);
    expect((error as InterventionError).code).toBe(code);
  }
}

/** Deterministically stamp an input as a recorded step (service duty). */
function asStep(
  input: AddStepInput,
  stepIndex: number,
  stepId = `step-${String(stepIndex).padStart(3, "0")}`,
): InterventionStep {
  return {
    stepId,
    stepIndex,
    kind: input.kind,
    targetNodeId: input.targetNodeId,
    change: input.change,
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    provenance: input.provenance,
    recordedAt: FIXED_NOW,
  };
}

function canonicalSteps(): InterventionStep[] {
  return [
    asStep(STEP_FIRE_RATING, 1, "step-fire"),
    asStep(STEP_ADD_PARTITION, 2, "step-partition"),
    asStep(STEP_REMOVE_WALL_EAST, 3, "step-remove"),
  ];
}

/** Walk a state and collect every epistemic status found anywhere. */
function allStatuses(state: {
  nodes: readonly {
    node: {
      epistemicStatus: string;
      properties: readonly { epistemicStatus: string }[];
    };
  }[];
}): Set<string> {
  const statuses = new Set<string>();
  for (const entry of state.nodes) {
    statuses.add(entry.node.epistemicStatus);
    for (const property of entry.node.properties) {
      statuses.add(property.epistemicStatus);
    }
  }
  return statuses;
}

describe("projection: baseline overlay (layer 0)", () => {
  test("every carried node/property is PROPOSED — original statuses never leak in", () => {
    const baseline = buildBaselineStorey();
    // The baseline deliberately mixes CONFIRMED/OBSERVED/INFERRED…
    const baselineStatuses = new Set(
      baseline.nodes.flatMap((node) => [
        node.epistemicStatus,
        ...node.properties.map((property) => property.epistemicStatus),
      ]),
    );
    expect(baselineStatuses.has("OBSERVED")).toBe(true);
    expect(baselineStatuses.has("CONFIRMED")).toBe(true);
    expect(baselineStatuses.has("INFERRED")).toBe(true);
    // …and the overlay flattens ALL of them to PROPOSED.
    const state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline,
      materializedAt: FIXED_NOW,
    });
    expect([...allStatuses(state)]).toEqual(["PROPOSED"]);
    expect(state.stateIndex).toBe(0);
    expect(state.appliedStepIds).toEqual([]);
    expect(state.nodes.every((entry) => entry.origin === "baseline")).toBe(true);
    expect(state.nodes.every((entry) => entry.appliedStepIds.length === 0)).toBe(true);
    expect(state.proposedTombstones).toEqual([]);
  });

  test("carried content keeps values, units and provenance VERBATIM; nodes sorted by id", () => {
    const baseline = buildBaselineStorey();
    const state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline,
      materializedAt: FIXED_NOW,
    });
    const byId = new Map(state.nodes.map((entry) => [entry.nodeId, entry.node]));
    const wallNorth = byId.get("wall-north");
    expect(wallNorth).toBeDefined();
    // Carried content: value/unit/provenance VERBATIM from the baseline, but
    // epistemicStatus is OVERWRITTEN to PROPOSED — the whole overlay is a
    // proposal; an observation can never leak into it.
    const carried = wallNorth?.properties.find((p) => p.key === "thickness");
    const baselineThickness = baseline.nodes
      .find((node) => node.nodeId === "wall-north")
      ?.properties.find((p) => p.key === "thickness");
    expect(baselineThickness).toBeDefined();
    expect(carried).toBeDefined();
    expect(carried?.key).toBe(baselineThickness?.key);
    expect(carried?.value).toEqual(baselineThickness?.value);
    expect(carried?.unit).toBe(baselineThickness?.unit);
    expect(carried?.provenance).toEqual(baselineThickness?.provenance);
    expect(carried?.epistemicStatus).toBe("PROPOSED");
    expect(wallNorth?.geometry).toEqual({ kind: "plane", ref: "plane-wall-north-001" });
    expect(wallNorth?.provenance).toEqual(
      baseline.nodes.find((node) => node.nodeId === "wall-north")?.provenance,
    );
    expect(state.nodes.map((entry) => entry.nodeId)).toEqual(
      [...state.nodes.map((entry) => entry.nodeId)].sort(),
    );
    expect(state.relationships.map((entry) => entry.relationshipId)).toEqual(
      [...state.relationships.map((entry) => entry.relationshipId)].sort(),
    );
    expect(state.relationships.every((entry) => entry.origin === "baseline")).toBe(true);
  });

  test("overlay/materialization refuse a snapshot that is not the pinned version", () => {
    expectCode(
      () =>
        overlayBaseline({
          scenarioId: SCENARIO_ID,
          baselineVersionId: "v002",
          baseline: buildBaselineStorey("v001"),
          materializedAt: FIXED_NOW,
        }),
      "baseline_mismatch",
    );
    expectCode(
      () =>
        materializeState({
          scenarioId: SCENARIO_ID,
          baselineVersionId: "v009",
          baseline: buildBaselineStorey(),
          steps: [],
          materializedAt: FIXED_NOW,
        }),
      "baseline_mismatch",
    );
  });
});

describe("projection: determinism (THE reproducibility contract)", () => {
  test("same baseline + same steps → byte-identical states (twice)", () => {
    const first = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: canonicalSteps(),
      materializedAt: FIXED_NOW,
    });
    const second = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: canonicalSteps(),
      materializedAt: FIXED_NOW,
    });
    expect(canonicalStateText(first)).toBe(canonicalStateText(second));
    expect(first.stateId).toBe(second.stateId);
  });

  test("the stateId is clock-free: different materializedAt, same identity", () => {
    const first = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: canonicalSteps(),
      materializedAt: FIXED_NOW,
    });
    const later = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: canonicalSteps(),
      materializedAt: FIXED_LATER,
    });
    expect(later.stateId).toBe(first.stateId);
    expect(later.materializedAt).toBe(FIXED_LATER);
    expect(canonicalStateText(later)).not.toBe(canonicalStateText(first));
  });

  test("baseline input ORDER never leaks (nodes/relationships re-sorted)", () => {
    const baseline = buildBaselineStorey();
    const shuffled = {
      ...baseline,
      nodes: [...baseline.nodes].reverse(),
      relationships: [...baseline.relationships].reverse(),
    };
    const first = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline,
      steps: canonicalSteps(),
      materializedAt: FIXED_NOW,
    });
    const second = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: shuffled,
      steps: canonicalSteps(),
      materializedAt: FIXED_NOW,
    });
    expect(canonicalStateText(first)).toBe(canonicalStateText(second));
  });

  test("reordered STEPS yield different (order-sensitive) states, correctly sequenced", () => {
    const forward = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_FIRE_RATING, 1, "step-a"), asStep(STEP_REMOVE_WALL_EAST, 2, "step-b")],
      materializedAt: FIXED_NOW,
    });
    const backward = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_REMOVE_WALL_EAST, 1, "step-b"), asStep(STEP_FIRE_RATING, 2, "step-a")],
      materializedAt: FIXED_NOW,
    });
    expect(forward.stateId).not.toBe(backward.stateId);
    expect(forward.appliedStepIds).toEqual(["step-a", "step-b"]);
    expect(backward.appliedStepIds).toEqual(["step-b", "step-a"]);
    // Both orders are semantically valid here (independent targets) and
    // both end states agree on the final node set (commuting changes).
    expect(forward.nodes.map((n) => n.nodeId).sort()).toEqual(
      backward.nodes.map((n) => n.nodeId).sort(),
    );
  });

  test("order matters semantically: modify-then-add fails, add-then-modify succeeds", () => {
    const baseline = buildBaselineStorey();
    const addThenModify = [
      asStep(STEP_ADD_PARTITION, 1, "step-add"),
      asStep(
        {
          kind: "element_modification",
          targetNodeId: "wall-partition-new",
          change: {
            kind: "element_modification",
            properties: [{ key: "thickness", value: 140, unit: "mm" }],
          },
          provenance: { evidenceIds: [], derivationNote: "Thicken after acoustic review." },
        },
        2,
        "step-modify",
      ),
    ];
    const state = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline,
      steps: addThenModify,
      materializedAt: FIXED_NOW,
    });
    const partition = state.nodes.find((entry) => entry.nodeId === "wall-partition-new");
    expect(partition?.node.properties.find((p) => p.key === "thickness")?.value).toBe(140);
    // Reversed: the modification targets a node that does not exist yet.
    expectCode(
      () =>
        materializeState({
          scenarioId: SCENARIO_ID,
          baselineVersionId: "v001",
          baseline,
          steps: [...addThenModify].reverse().map((step, index) => ({ ...step, stepIndex: index + 1 })),
          materializedAt: FIXED_NOW,
        }),
      "unknown_node_ref",
    );
  });

  test("purity: deep-frozen baseline and steps survive materialization", () => {
    const baseline = deepFreeze(buildBaselineStorey());
    const steps = deepFreeze(canonicalSteps());
    const before = canonicalJsonStringify(baseline);
    const state = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline,
      steps,
      materializedAt: FIXED_NOW,
    });
    expect(state.stateIndex).toBe(3);
    expect(canonicalJsonStringify(baseline)).toBe(before);
    expect(Object.isFrozen(baseline.nodes)).toBe(true);
  });
});

describe("projection: step validation matrix", () => {
  test("unknown target node → unknown_node_ref NAMING the id", () => {
    const state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      materializedAt: FIXED_NOW,
    });
    try {
      applyStep(
        state,
        asStep(
          {
            ...STEP_FIRE_RATING,
            targetNodeId: "wall-ghost-42",
          },
          1,
          "step-x",
        ),
        FIXED_NOW,
      );
      expect.unreachable("expected unknown_node_ref");
    } catch (error) {
      expect(error).toBeInstanceOf(InterventionError);
      expect((error as InterventionError).code).toBe("unknown_node_ref");
      expect((error as InterventionError).detail).toContain("wall-ghost-42");
    }
  });

  test("a step targeting an already-proposed-tombstoned node refuses (naming it)", () => {
    let state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      materializedAt: FIXED_NOW,
    });
    state = applyStep(state, asStep(STEP_REMOVE_WALL_EAST, 1, "step-rm"), FIXED_NOW);
    try {
      applyStep(
        state,
        asStep(
          {
            ...STEP_FIRE_RATING,
            targetNodeId: "wall-east",
          },
          2,
          "step-after",
        ),
        FIXED_NOW,
      );
      expect.unreachable("expected unknown_node_ref");
    } catch (error) {
      expect(error).toBeInstanceOf(InterventionError);
      const interventionError = error as InterventionError;
      expect(interventionError.code).toBe("unknown_node_ref");
      expect(interventionError.detail).toContain("wall-east");
      expect(interventionError.detail).toContain("tombstone");
    }
  });

  test("element_addition onto a live or tombstoned id → duplicate_node_ref", () => {
    let state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      materializedAt: FIXED_NOW,
    });
    expectCode(
      () =>
        applyStep(
          state,
          asStep({ ...STEP_ADD_PARTITION, targetNodeId: "wall-north" }, 1, "step-dup"),
          FIXED_NOW,
        ),
      "duplicate_node_ref",
    );
    state = applyStep(state, asStep(STEP_REMOVE_WALL_EAST, 1, "step-rm"), FIXED_NOW);
    expectCode(
      () =>
        applyStep(
          state,
          asStep({ ...STEP_ADD_PARTITION, targetNodeId: "wall-east" }, 2, "step-readd"),
          FIXED_NOW,
        ),
      "duplicate_node_ref",
    );
  });

  test("step-sequence gaps and duplicate step ids are typed rejections", () => {
    const baseline = buildBaselineStorey();
    expectCode(
      () =>
        materializeState({
          scenarioId: SCENARIO_ID,
          baselineVersionId: "v001",
          baseline,
          steps: [
            asStep(STEP_FIRE_RATING, 1, "step-a"),
            asStep(STEP_REMOVE_WALL_EAST, 3, "step-b"),
          ],
          materializedAt: FIXED_NOW,
        }),
      "step_sequence_gap",
    );
    expectCode(
      () =>
        materializeState({
          scenarioId: SCENARIO_ID,
          baselineVersionId: "v001",
          baseline,
          steps: [
            asStep(STEP_FIRE_RATING, 1, "step-a"),
            asStep(STEP_REMOVE_WALL_EAST, 2, "step-a"),
          ],
          materializedAt: FIXED_NOW,
        }),
      "duplicate_step_id",
    );
  });

  test("engine defense in depth: missing provenance + numeric-without-unit", () => {
    const state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      materializedAt: FIXED_NOW,
    });
    expectCode(
      () =>
        applyStep(
          state,
          {
            ...asStep(STEP_FIRE_RATING, 1, "step-p"),
            provenance: { evidenceIds: [] },
          },
          FIXED_NOW,
        ),
      "missing_provenance",
    );
    expectCode(
      () =>
        applyStep(
          state,
          asStep(
            {
              kind: "property_change",
              targetNodeId: "wall-north",
              change: {
                kind: "property_change",
                property: { key: "thickness", value: 999 },
              },
              provenance: { evidenceIds: [EV_FIRE_SPEC] },
            },
            1,
            "step-u",
          ),
          FIXED_NOW,
        ),
      "numeric_value_without_unit",
    );
  });

  test("element_modification with an empty payload refuses at the engine", () => {
    const state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      materializedAt: FIXED_NOW,
    });
    expectCode(
      () =>
        applyStep(
          state,
          asStep(
            {
              kind: "element_modification",
              targetNodeId: "wall-north",
              change: { kind: "element_modification", properties: [] },
              provenance: { evidenceIds: [EV_FIRE_SPEC] },
            },
            1,
            "step-empty",
          ),
          FIXED_NOW,
        ),
      "invalid_step_payload",
    );
  });
});

describe("projection: step semantics (traceability hooks for AISE-028)", () => {
  test("property_change: value VERBATIM, PROPOSED, step provenance; siblings untouched", () => {
    const state = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_FIRE_RATING, 1, "step-fire")],
      materializedAt: FIXED_NOW,
    });
    const wallNorth = state.nodes.find((entry) => entry.nodeId === "wall-north");
    expect(wallNorth?.origin).toBe("baseline_touched");
    expect(wallNorth?.appliedStepIds).toEqual(["step-fire"]);
    const rating = wallNorth?.node.properties.find((p) => p.key === "fireRating");
    expect(rating?.value).toBe("REI90");
    expect(rating?.epistemicStatus).toBe("PROPOSED");
    expect(rating?.provenance).toEqual([
      { role: "SUPPORTS", evidenceId: EV_FIRE_SPEC, recordedAt: FIXED_NOW },
    ]);
    // The untouched sibling keeps its value/unit VERBATIM (PROPOSED overlay).
    const thickness = wallNorth?.node.properties.find((p) => p.key === "thickness");
    expect(thickness?.value).toBe(240);
    expect(thickness?.unit).toBe("mm");
    expect(thickness?.epistemicStatus).toBe("PROPOSED");
    // New keys append.
    const appended = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [
        asStep(
          {
            kind: "property_change",
            targetNodeId: "wall-north",
            change: {
              kind: "property_change",
              property: { key: "acousticRating", value: 54, unit: "dB" },
            },
            provenance: { evidenceIds: [EV_FIRE_SPEC] },
          },
          1,
          "step-new",
        ),
      ],
      materializedAt: FIXED_NOW,
    });
    const appendedNorth = appended.nodes.find((entry) => entry.nodeId === "wall-north");
    expect(appendedNorth?.node.properties.map((p) => p.key)).toEqual([
      "thickness",
      "fireRating",
      "acousticRating",
    ]);
  });

  test("element_addition: authored node PROPOSED with step provenance + contains edge", () => {
    const state = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_ADD_PARTITION, 1, "step-add")],
      materializedAt: FIXED_NOW,
    });
    const partition = state.nodes.find((entry) => entry.nodeId === "wall-partition-new");
    expect(partition?.origin).toBe("scenario");
    expect(partition?.appliedStepIds).toEqual(["step-add"]);
    expect(partition?.node.epistemicStatus).toBe("PROPOSED");
    expect(partition?.node.kind).toBe("element");
    expect(partition?.node.provenance).toEqual([
      {
        role: "DERIVED_FROM",
        derivationNote:
          "Partition per drawing A-101 rev C; geometry to be surveyed after erection.",
        recordedAt: FIXED_NOW,
      },
    ]);
    expect(partition?.node.properties.find((p) => p.key === "thickness")?.value).toBe(120);
    expect(partition?.node.properties.find((p) => p.key === "thickness")?.unit).toBe("mm");
    const edge = state.relationships.find((rel) => rel.relationship.toNodeId === "wall-partition-new");
    expect(edge?.origin).toBe("scenario");
    expect(edge?.relationship.kind).toBe("contains");
    expect(edge?.relationship.fromNodeId).toBe("space-office-101");
    expect(edge?.relationship.relationshipId).toMatch(/^rel-[0-9a-f]{16}$/);
    expect(edge?.relationship.provenance).toEqual(partition?.node.provenance);
    // Deterministic relationship id: same scenario+step → same id.
    const replay = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_ADD_PARTITION, 1, "step-add")],
      materializedAt: FIXED_LATER,
    });
    expect(
      replay.relationships.find((rel) => rel.relationship.toNodeId === "wall-partition-new")
        ?.relationship.relationshipId,
    ).toBe(edge?.relationship.relationshipId);
  });

  test("element_addition with an unknown parent → unknown_node_ref naming the parent", () => {
    try {
      materializeState({
        scenarioId: SCENARIO_ID,
        baselineVersionId: "v001",
        baseline: buildBaselineStorey(),
        steps: [
          asStep(
            {
              kind: "element_addition",
              targetNodeId: "wall-partition-new",
              change: {
                kind: "element_addition",
                node: {
                  kind: "element",
                  properties: [{ key: "thickness", value: 120, unit: "mm" }],
                },
                parentNodeId: "space-ghost",
              },
              provenance: { evidenceIds: [], derivationNote: "x" },
            },
            1,
            "step-add",
          ),
        ],
        materializedAt: FIXED_NOW,
      });
      expect.unreachable("expected unknown_node_ref");
    } catch (error) {
      expect((error as InterventionError).code).toBe("unknown_node_ref");
      expect((error as InterventionError).detail).toContain("space-ghost");
    }
  });

  test("element_modification: geometry/units swapped, provenance APPENDED, originals kept", () => {
    const state = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_MODIFY_WALL_NORTH, 1, "step-mod")],
      materializedAt: FIXED_NOW,
    });
    const wallNorth = state.nodes.find((entry) => entry.nodeId === "wall-north");
    expect(wallNorth?.node.geometry?.ref).toBe("plane-wall-north-relocated-001");
    expect(wallNorth?.node.properties.find((p) => p.key === "thickness")?.value).toBe(300);
    // The geometry swap APPENDS the step provenance (audit chain grows).
    expect(wallNorth?.node.provenance.length).toBe(
      buildBaselineStorey().nodes.find((node) => node.nodeId === "wall-north")!.provenance
        .length + 1,
    );
    expect(wallNorth?.node.provenance.at(-1)?.role).toBe("DERIVED_FROM");
    expect(wallNorth?.origin).toBe("baseline_touched");
  });

  test("proposed_removal: PROPOSED tombstone; node verbatim in earlier states; edges severed", () => {
    const state3 = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_FIRE_RATING, 1, "step-fire"), asStep(STEP_REMOVE_WALL_EAST, 2, "step-rm")],
      materializedAt: FIXED_NOW,
    });
    // Gone from the live set; tombstoned with the reason VERBATIM.
    expect(state3.nodes.find((entry) => entry.nodeId === "wall-east")).toBeUndefined();
    expect(state3.proposedTombstones).toHaveLength(1);
    const tombstone = state3.proposedTombstones[0]!;
    expect(tombstone.nodeId).toBe("wall-east");
    expect(tombstone.reason).toBe("Obsolete partition demolished to open the floor plan.");
    expect(tombstone.proposedByStepId).toBe("step-rm");
    expect(tombstone.severedRelationshipIds).toEqual(["rel-contains-wall-east"]);
    // The contains edge is gone from the live relationship set.
    expect(
      state3.relationships.find((rel) => rel.relationshipId === "rel-contains-wall-east"),
    ).toBeUndefined();
    // Earlier states keep the node VERBATIM (immutability).
    const state1 = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: [asStep(STEP_FIRE_RATING, 1, "step-fire")],
      materializedAt: FIXED_NOW,
    });
    const earlyEast = state1.nodes.find((entry) => entry.nodeId === "wall-east");
    const baselineEast = buildBaselineStorey().nodes.find((node) => node.nodeId === "wall-east");
    expect(earlyEast?.node.properties).toEqual(
      baselineEast?.properties.map((property) => ({
        ...property,
        epistemicStatus: "PROPOSED",
      })),
    );
    expect(earlyEast?.node.provenance).toEqual(baselineEast?.provenance);
  });

  test("note steps change NO model content — the layer is re-identified only", () => {
    let state = overlayBaseline({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      materializedAt: FIXED_NOW,
    });
    state = applyStep(state, asStep(STEP_FIRE_RATING, 1, "step-fire"), FIXED_NOW);
    const beforeNote = state;
    const afterNote = applyStep(state, asStep(STEP_NOTE, 2, "step-note"), FIXED_NOW);
    expect(afterNote.nodes).toEqual(beforeNote.nodes);
    expect(afterNote.relationships).toEqual(beforeNote.relationships);
    expect(afterNote.proposedTombstones).toEqual(beforeNote.proposedTombstones);
    expect(afterNote.stateIndex).toBe(beforeNote.stateIndex + 1);
    expect(afterNote.appliedStepIds).toEqual([...beforeNote.appliedStepIds, "step-note"]);
    expect(afterNote.stateId).not.toBe(beforeNote.stateId);
    // A note on an unknown node still refuses (it annotates a live element).
    expectCode(
      () =>
        applyStep(
          state,
          asStep({ ...STEP_NOTE, targetNodeId: "ghost" }, 3, "step-n2"),
          FIXED_NOW,
        ),
      "unknown_node_ref",
    );
  });

  test("the full 3-step scenario: every materialized node/property is PROPOSED", () => {
    const state = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: canonicalSteps(),
      materializedAt: FIXED_NOW,
    });
    expect([...allStatuses(state)]).toEqual(["PROPOSED"]);
    expect(state.nodes.map((entry) => entry.nodeId)).toEqual([
      "building-a",
      "floor-slab-101",
      "project-zurich-hq",
      "site-north",
      "space-office-101",
      "storey-01",
      "wall-north",
      "wall-partition-new",
    ]);
    expect(state.stateIndex).toBe(3);
    expect(state.baselineVersionId).toBe("v001");
    expect(state.scenarioId).toBe(SCENARIO_ID);
    expect(PROJECT_ID.length).toBeGreaterThan(0);
  });
});
