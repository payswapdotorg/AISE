/**
 * AISE-027 viewer tests — the structural input model: AISE-026 mirror
 * acceptance, the PROPOSED epistemic seal (type-level), frozen presentation
 * vocabularies and the record invariants the synchronization depends on.
 */

import { describe, expect, test } from "bun:test";
import * as viewer from "./index";
import {
  canonicalScenario,
  noteScenario,
  singleStateScenario,
  STATE0_ID,
  STATE1_ID,
  STATE2_ID,
  STATE3_ID,
  STATE4_ID,
  STEP1_ID,
} from "./fixtures";
import type {
  InterventionReader,
  ViewerGetRequest,
  ViewerProposedNode,
  ViewerProposedProperty,
  ViewerScenario,
} from "./index";

/* ------------------------------------------------------------------ */
/* Structural acceptance of the AISE-026 mirror                        */
/* ------------------------------------------------------------------ */

describe("viewer model — AISE-026 structural mirror", () => {
  test("a full hand-mirrored scenario record satisfies the viewer scenario type", () => {
    const scenario: ViewerScenario = canonicalScenario();
    expect(scenario.scenarioId).toBe("scenario-office-refit");
    expect(scenario.baselineVersionId).toBe("v001");
    expect(scenario.steps).toHaveLength(3);
    expect(scenario.states).toHaveLength(4);
  });

  test("every node and property of every state is PROPOSED (the epistemic seal)", () => {
    for (const scenario of [canonicalScenario(), noteScenario(), singleStateScenario()]) {
      for (const state of scenario.states) {
        for (const stateNode of state.nodes) {
          expect(stateNode.node.epistemicStatus).toBe("PROPOSED");
          for (const property of stateNode.node.properties) {
            expect(property.epistemicStatus).toBe("PROPOSED");
          }
        }
      }
    }
  });

  test("OBSERVED/CONFIRMED are UNREPRESENTABLE inside a proposal layer (type-level)", () => {
    // The @ts-expect-error directives below are SELF-VERIFYING: if the
    // literal seal were ever widened, the directives become unused and the
    // typecheck fails (the AISE-025/026 test convention). Single-line
    // assignments keep the reported error on the directive's own line.
    // @ts-expect-error — OBSERVED is not assignable to the PROPOSED literal
    const observedStatus: ViewerProposedProperty["epistemicStatus"] = "OBSERVED";
    void observedStatus;
    // @ts-expect-error — CONFIRMED is not assignable to the PROPOSED literal
    const confirmedStatus: ViewerProposedNode["epistemicStatus"] = "CONFIRMED";
    void confirmedStatus;
    const good: ViewerProposedProperty = {
      key: "thickness",
      value: 240,
      unit: "mm",
      epistemicStatus: "PROPOSED",
      provenance: [],
    };
    // @ts-expect-error — the epistemic overwrite makes OBSERVED a type error here
    const observed: ViewerProposedProperty = { ...good, epistemicStatus: "OBSERVED" };
    void observed;
    // @ts-expect-error — the epistemic overwrite makes CONFIRMED a type error here
    const confirmed: ViewerProposedProperty = { ...good, epistemicStatus: "CONFIRMED" };
    void confirmed;
    expect(good.epistemicStatus).toBe("PROPOSED"); // the trap is compile-time only
  });

  test("numeric property values carry units and non-numeric carry none (026 discipline kept)", () => {
    for (const state of canonicalScenario().states) {
      for (const stateNode of state.nodes) {
        for (const property of stateNode.node.properties) {
          if (typeof property.value === "number") {
            expect(property.unit).toBeDefined();
          } else {
            expect(property.unit).toBeUndefined();
          }
        }
      }
    }
  });

  test("states.length === steps.length + 1 for every fixture (the 026 invariant)", () => {
    expect(canonicalScenario().states).toHaveLength(canonicalScenario().steps.length + 1);
    expect(noteScenario().states).toHaveLength(noteScenario().steps.length + 1);
    expect(singleStateScenario().states).toHaveLength(singleStateScenario().steps.length + 1);
  });

  test("state ids are stable 64-hex constants carried verbatim (never re-derived here)", () => {
    const ids = canonicalScenario().states.map((state) => state.stateId);
    expect(ids).toEqual([STATE0_ID, STATE1_ID, STATE2_ID, STATE3_ID]);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(noteScenario().states[4]?.stateId).toBe(STATE4_ID);
  });

  test("layer identity: stateIndex position, pinned baseline and applied step prefix", () => {
    const scenario = canonicalScenario();
    scenario.states.forEach((state, index) => {
      expect(state.stateIndex).toBe(index);
      expect(state.baselineVersionId).toBe(scenario.baselineVersionId);
      expect(state.appliedStepIds).toEqual(scenario.steps.slice(0, index).map((s) => s.stepId));
    });
    expect(scenario.states[1]?.appliedStepIds).toEqual([STEP1_ID]);
  });
});

/* ------------------------------------------------------------------ */
/* Frozen presentation vocabularies                                    */
/* ------------------------------------------------------------------ */

describe("viewer model — frozen vocabularies", () => {
  test("PROJECTION_OMISSION_REASONS is frozen, unique and mirrors AISE-021's codes", () => {
    expect(Object.isFrozen(viewer.PROJECTION_OMISSION_REASONS)).toBe(true);
    expect(new Set(viewer.PROJECTION_OMISSION_REASONS).size).toBe(
      viewer.PROJECTION_OMISSION_REASONS.length,
    );
    expect([...viewer.PROJECTION_OMISSION_REASONS]).toEqual([
      "geometry-ref-absent",
      "geometry-kind-not-projectable",
      "geometry-unresolved",
      "boundary-absent",
      "degenerate-projection",
    ]);
  });

  test("NAVIGATION_DIRECTIONS is frozen and exactly next|previous", () => {
    expect(Object.isFrozen(viewer.NAVIGATION_DIRECTIONS)).toBe(true);
    expect([...viewer.NAVIGATION_DIRECTIONS]).toEqual(["next", "previous"]);
  });

  test("READER_MEMBERS is frozen and pins the exhaustive read-only seam vocabulary", () => {
    expect(Object.isFrozen(viewer.READER_MEMBERS)).toBe(true);
    expect([...viewer.READER_MEMBERS]).toEqual(["readScenario", "readState"]);
  });

  test("the read-only seam has NO write-shaped member (type-level tripwire)", () => {
    const reader: InterventionReader = {
      readScenario: async () => null,
      readState: async () => null,
    };
    // Self-verifying @ts-expect-error: if a write member ever appeared on
    // the seam, these directives become unused and the typecheck fails.
    // @ts-expect-error — the seam exposes no step-recording member
    void reader.addStep;
    // @ts-expect-error — the seam exposes no scenario-creation member
    void reader.createScenario;
    // @ts-expect-error — the seam exposes no status-transition member
    void reader.transitionStatus;
    expect(typeof reader.readScenario).toBe("function");
    expect(typeof reader.readState).toBe("function");
  });

  test("the HTTP request method is the LITERAL GET (type-level tripwire)", () => {
    const request: ViewerGetRequest = { method: "GET", url: "/v1/interventions/x" };
    expect(request.method).toBe("GET");
    // @ts-expect-error — POST is unrepresentable on the viewer request type
    const post: ViewerGetRequest = { method: "POST", url: "/v1/interventions/x" };
    // The compile-time trap keeps POST off the type; the (runtime) object is
    // still referenced so the declaration is not dead code.
    expect(post.url).toBe("/v1/interventions/x");
  });
});
