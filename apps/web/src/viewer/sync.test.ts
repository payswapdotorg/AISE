/**
 * AISE-027 viewer tests — the synchronized layer-navigation core (§027):
 * stable-ID resolution, Next/Previous navigation with clamped boundary
 * behavior, and the alignment guard's discriminations.
 */

import { describe, expect, test } from "bun:test";
import * as viewer from "./index";
import {
  canonicalScenario,
  deepFreeze,
  noteScenario,
  singleStateScenario,
  STATE0_ID,
  STATE1_ID,
  STATE2_ID,
  STATE3_ID,
  STATE4_ID,
  STEP1_ID,
  STEP2_ID,
  STEP3_ID,
  STEP4_ID,
} from "./fixtures";
import type { ViewerFrame, ViewerInterventionState, ViewerScenario } from "./index";

const scenario = canonicalScenario();

function expectCode(fn: () => unknown, code: viewer.ViewerErrorCode): void {
  try {
    fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(viewer.ViewerError);
    expect((error as viewer.ViewerError).code).toBe(code);
  }
}

/* ------------------------------------------------------------------ */
/* Layer resolution (stable ids)                                       */
/* ------------------------------------------------------------------ */

describe("stateAt — stable layer resolution", () => {
  test("resolves every layer 0..3 with its stable state id", () => {
    expect(viewer.stateAt(scenario, 0).stateId).toBe(STATE0_ID);
    expect(viewer.stateAt(scenario, 1).stateId).toBe(STATE1_ID);
    expect(viewer.stateAt(scenario, 2).stateId).toBe(STATE2_ID);
    expect(viewer.stateAt(scenario, 3).stateId).toBe(STATE3_ID);
    expect(viewer.stateAt(scenario, 2).stateIndex).toBe(2);
    expect(viewer.stateAt(scenario, 2).scenarioId).toBe(scenario.scenarioId);
  });

  test("stateIdsOf lists the stable ids in layer order", () => {
    expect(viewer.stateIdsOf(scenario)).toEqual([STATE0_ID, STATE1_ID, STATE2_ID, STATE3_ID]);
    expect(viewer.stateIdsOf(singleStateScenario())).toEqual([STATE0_ID]);
  });

  test("stateCountOf and latestStateIndex", () => {
    expect(viewer.stateCountOf(scenario)).toBe(4);
    expect(viewer.latestStateIndex(scenario)).toBe(3);
    expect(viewer.stateCountOf(singleStateScenario())).toBe(1);
    expect(viewer.latestStateIndex(singleStateScenario())).toBe(0);
  });

  test("an out-of-range index is a typed state_index_out_of_range (never a clamp)", () => {
    expectCode(() => viewer.stateAt(scenario, 4), "state_index_out_of_range");
    expectCode(() => viewer.stateAt(scenario, -1), "state_index_out_of_range");
    expectCode(() => viewer.stateAt(scenario, Number.NaN), "state_index_out_of_range");
    expectCode(() => viewer.stateAt(scenario, 1.5), "state_index_out_of_range");
  });
});

/* ------------------------------------------------------------------ */
/* The synchronized frame                                              */
/* ------------------------------------------------------------------ */

describe("frameOf — the synchronized identity frame", () => {
  test("layer 2's frame carries the full identity all panes share", () => {
    const frame: ViewerFrame = viewer.frameOf(scenario, 2);
    expect(frame.scenarioId).toBe("scenario-office-refit");
    expect(frame.projectId).toBe("project-zurich-hq");
    expect(frame.baselineVersionId).toBe("v001");
    expect(frame.stateIndex).toBe(2);
    expect(frame.stateId).toBe(STATE2_ID);
    expect([...frame.appliedStepIds]).toEqual([STEP1_ID, STEP2_ID]);
    expect(frame.stateCount).toBe(4);
    expect(frame.atFirst).toBe(false);
    expect(frame.atLast).toBe(false);
  });

  test("boundary flags at the first and last layers", () => {
    expect(viewer.frameOf(scenario, 0).atFirst).toBe(true);
    expect(viewer.frameOf(scenario, 0).atLast).toBe(false);
    expect(viewer.frameOf(scenario, 3).atFirst).toBe(false);
    expect(viewer.frameOf(scenario, 3).atLast).toBe(true);
  });

  test("an out-of-range frame request is the same typed error as stateAt", () => {
    expectCode(() => viewer.frameOf(scenario, 7), "state_index_out_of_range");
  });
});

/* ------------------------------------------------------------------ */
/* Next/Previous navigation (clamped boundaries; stable ids)           */
/* ------------------------------------------------------------------ */

describe("navigate — Next/Previous with synchronized stable ids", () => {
  test("next and previous resolve the NEIGHBOR layer's stable id", () => {
    expect(viewer.navigate(scenario, 2, "next").stateId).toBe(STATE3_ID);
    expect(viewer.navigate(scenario, 2, "previous").stateId).toBe(STATE1_ID);
    expect(viewer.navigate(scenario, 1, "next").stateId).toBe(STATE2_ID);
    expect(viewer.navigate(scenario, 1, "previous").stateId).toBe(STATE0_ID);
  });

  test("next at the LAST layer clamps to the last layer (boundary behavior)", () => {
    const frame = viewer.navigate(scenario, 3, "next");
    expect(frame.stateIndex).toBe(3);
    expect(frame.stateId).toBe(STATE3_ID);
    expect(frame.atLast).toBe(true);
  });

  test("previous at the FIRST layer clamps to the first layer (boundary behavior)", () => {
    const frame = viewer.navigate(scenario, 0, "previous");
    expect(frame.stateIndex).toBe(0);
    expect(frame.stateId).toBe(STATE0_ID);
    expect(frame.atFirst).toBe(true);
  });

  test("a full forward walk 0→3 then backward walk 3→0 visits every stable id in order", () => {
    const forward: string[] = [];
    let index = 0;
    for (let step = 0; step < 5; step += 1) {
      index = viewer.navigate(scenario, index, "next").stateIndex;
      forward.push(viewer.stateAt(scenario, index).stateId);
    }
    expect(forward).toEqual([STATE1_ID, STATE2_ID, STATE3_ID, STATE3_ID, STATE3_ID]);
    const backward: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      index = viewer.navigate(scenario, index, "previous").stateIndex;
      backward.push(viewer.stateAt(scenario, index).stateId);
    }
    expect(backward).toEqual([STATE2_ID, STATE1_ID, STATE0_ID, STATE0_ID, STATE0_ID]);
  });

  test("navigation on a single-layer scenario never leaves layer 0", () => {
    const single = singleStateScenario();
    expect(viewer.navigate(single, 0, "next").stateId).toBe(STATE0_ID);
    expect(viewer.navigate(single, 0, "previous").stateId).toBe(STATE0_ID);
  });

  test("navigating FROM an out-of-range index is still a typed error (not a clamp)", () => {
    expectCode(() => viewer.navigate(scenario, 9, "next"), "state_index_out_of_range");
    expectCode(() => viewer.navigate(scenario, -1, "previous"), "state_index_out_of_range");
  });

  test("navigationTargets exposes the previous/next/current frames for rendering", () => {
    const targets = viewer.navigationTargets(scenario, 2);
    expect(targets.current.stateId).toBe(STATE2_ID);
    expect(targets.previous.stateId).toBe(STATE1_ID);
    expect(targets.next.stateId).toBe(STATE3_ID);
    const atFirst = viewer.navigationTargets(scenario, 0);
    expect(atFirst.previous.stateId).toBe(STATE0_ID); // clamped to itself
    expect(atFirst.next.stateId).toBe(STATE1_ID);
    const atLast = viewer.navigationTargets(scenario, 3);
    expect(atLast.previous.stateId).toBe(STATE2_ID);
    expect(atLast.next.stateId).toBe(STATE3_ID); // clamped to itself
  });
});

/* ------------------------------------------------------------------ */
/* Alignment guard (defense in depth; typed discriminations)           */
/* ------------------------------------------------------------------ */

describe("verifyStateAlignment — the alignment invariants", () => {
  /** The canonical layer-2 fixture state (guarded — must exist). */
  function layer2(): ViewerInterventionState {
    const state = scenario.states[2];
    if (state === undefined) {
      throw new Error("fixture must carry layer 2");
    }
    return state;
  }

  test("accepts every layer of every fixture", () => {
    for (const record of [canonicalScenario(), noteScenario(), singleStateScenario()]) {
      record.states.forEach((state) => {
        expect(() => viewer.verifyStateAlignment(record, state)).not.toThrow();
      });
    }
  });

  test("rejects a state belonging to another scenario (state_scenario_mismatch)", () => {
    const state = { ...layer2(), scenarioId: "scenario-foreign" };
    expectCode(() => viewer.verifyStateAlignment(scenario, state), "state_scenario_mismatch");
  });

  test("rejects a baseline-pin disagreement (state_sequence_mismatch)", () => {
    const state = { ...layer2(), baselineVersionId: "v002" };
    expectCode(() => viewer.verifyStateAlignment(scenario, state), "state_sequence_mismatch");
  });

  test("rejects a state claiming the wrong layer position (state_sequence_mismatch)", () => {
    const state: ViewerInterventionState = { ...layer2(), stateIndex: 3 };
    expectCode(() => viewer.verifyStateAlignment(scenario, state), "state_sequence_mismatch");
  });

  test("rejects appliedStepIds drift: extra, missing and reordered (state_sequence_mismatch)", () => {
    const extra = {
      ...layer2(),
      appliedStepIds: [STEP1_ID, STEP2_ID, STEP3_ID],
    };
    expectCode(() => viewer.verifyStateAlignment(scenario, extra), "state_sequence_mismatch");
    const missing = { ...layer2(), appliedStepIds: [STEP1_ID] };
    expectCode(() => viewer.verifyStateAlignment(scenario, missing), "state_sequence_mismatch");
    const reordered = {
      ...layer2(),
      appliedStepIds: [STEP2_ID, STEP1_ID],
    };
    expectCode(() => viewer.verifyStateAlignment(scenario, reordered), "state_sequence_mismatch");
  });

  test("rejects a states/steps count invariant violation (state_sequence_mismatch)", () => {
    const record: ViewerScenario = { ...scenario, states: scenario.states.slice(0, 3) };
    expectCode(
      () => viewer.verifyStateAlignment(record, layer2()),
      "state_sequence_mismatch",
    );
  });

  test("rejects a state whose id disagrees with the record's layer entry", () => {
    const state = { ...layer2(), stateId: STATE4_ID };
    expectCode(() => viewer.verifyStateAlignment(scenario, state), "state_sequence_mismatch");
  });

  test("the note scenario's layer 4 aligns (same content, one more applied step)", () => {
    const note = noteScenario();
    const layer4 = note.states[4];
    if (layer4 === undefined) {
      throw new Error("note scenario must carry layer 4");
    }
    expect(layer4.stateId).toBe(STATE4_ID);
    expect([...layer4.appliedStepIds]).toEqual([STEP1_ID, STEP2_ID, STEP3_ID, STEP4_ID]);
    expect(() => viewer.verifyStateAlignment(note, layer4)).not.toThrow();
  });

  test("the note scenario's boundaries: previous from layer 4, next clamps at layer 4", () => {
    const note = noteScenario();
    expect(viewer.navigate(note, 4, "next").stateId).toBe(STATE4_ID);
    expect(viewer.navigate(note, 4, "next").atLast).toBe(true);
    expect(viewer.navigate(note, 4, "previous").stateId).toBe(STATE3_ID);
    expect(viewer.navigate(note, 3, "next").stateId).toBe(STATE4_ID);
    const targets = viewer.navigationTargets(note, 4);
    expect(targets.current.stateId).toBe(STATE4_ID);
    expect(targets.next.stateId).toBe(STATE4_ID); // clamped to itself
    expect(targets.previous.stateId).toBe(STATE3_ID);
  });
});

/* ------------------------------------------------------------------ */
/* Purity                                                              */
/* ------------------------------------------------------------------ */

describe("sync purity", () => {
  test("navigation and alignment never mutate a deep-frozen scenario record", () => {
    const frozen = deepFreeze(canonicalScenario());
    const frozenLayer2 = frozen.states[2];
    if (frozenLayer2 === undefined) {
      throw new Error("fixture must carry layer 2");
    }
    const before = JSON.stringify(frozen);
    expect(() => viewer.navigate(frozen, 2, "next")).not.toThrow();
    expect(() => viewer.navigate(frozen, 0, "previous")).not.toThrow();
    expect(() => viewer.frameOf(frozen, 3)).not.toThrow();
    expect(() => viewer.verifyStateAlignment(frozen, frozenLayer2)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });
});
