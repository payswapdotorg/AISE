/**
 * AISE-027 viewer tests — the synchronized document: pane alignment over
 * the SAME state identity (§027 core), Next/Previous navigation rendering
 * with stable ids and boundary behavior, step traceability, PROPOSED
 * honesty, selection synchronization, byte determinism, purity, validation.
 */

import { describe, expect, test } from "bun:test";
import * as viewer from "./index";
import {
  approvedScenario,
  canonicalScenario,
  deepFreeze,
  noteScenario,
  shuffledGeometries,
  shuffledScenario,
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
  viewerInput,
  viewerInputAt,
} from "./fixtures";
import type { ViewerInput } from "./index";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function render(input: ViewerInput): string {
  return viewer.renderInterventionViewer(input);
}

/** Extract one pane's markup (panes contain no nested <section>). */
function paneOf(html: string, paneId: string): string {
  const start = html.indexOf(`<section class="pane" id="${paneId}"`);
  if (start === -1) {
    throw new Error(`pane not found: ${paneId}`);
  }
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

function bodyOf(html: string): string {
  const start = html.indexOf("<body ");
  const end = html.indexOf(">", start);
  return html.slice(start, end + 1);
}

function firstAttr(fragment: string, attr: string): string {
  const match = fragment.match(new RegExp(`${attr}="([^"]*)"`));
  return match?.[1] ?? "";
}

function allAttrs(fragment: string, attr: string): string[] {
  return [...fragment.matchAll(new RegExp(`${attr}="([^"]*)"`,"g"))].map((match) => match[1] ?? "");
}

const PANE_IDS = ["pane-3d", "pane-2d", "pane-boq"] as const;

/* ------------------------------------------------------------------ */
/* Document structure                                                  */
/* ------------------------------------------------------------------ */

describe("viewer document rendering", () => {
  test("renders a complete HTML document with the three synchronized panes", () => {
    const html = render(viewerInput());
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">\n")).toBe(true);
    expect(html.endsWith("</body>\n</html>\n")).toBe(true);
    for (const paneId of PANE_IDS) {
      expect(html).toContain(`<section class="pane" id="${paneId}"`);
    }
    expect(html).toContain(`data-generator="${viewer.VIEWER_GENERATOR_VERSION}"`);
  });

  test("the body pins the full layer identity (scenario, baseline, state, steps)", () => {
    const body = bodyOf(render(viewerInputAt(2)));
    expect(firstAttr(body, "data-scenario-id")).toBe("scenario-office-refit");
    expect(firstAttr(body, "data-baseline-version-id")).toBe("v001");
    expect(firstAttr(body, "data-state-id")).toBe(STATE2_ID);
    expect(firstAttr(body, "data-state-index")).toBe("2");
    expect(firstAttr(body, "data-state-count")).toBe("4");
    expect(firstAttr(body, "data-applied-step-ids")).toBe(`${STEP1_ID},${STEP2_ID}`);
    expect(firstAttr(body, "data-scenario-status")).toBe("draft");
  });

  test("the header states the scenario, its pinned baseline and the layer", () => {
    const html = render(viewerInputAt(1));
    expect(html).toContain("Scenario <code>scenario-office-refit</code>");
    expect(html).toContain("Office refit — fire upgrade, partition and demolition");
    expect(html).toContain("pinned to baseline <code>v001</code>");
    expect(html).toContain("layer 1 of 3");
    expect(html).toContain("All panes are PROPOSED content.");
  });

  test("the footer states the read-only, no-authority discipline", () => {
    const html = render(viewerInput());
    expect(html).toContain("the 3D, 2D and BOQ panes are driven by the same state id");
    expect(html).toContain("never mutates the Reality Graph or the scenario record");
    expect(html).toContain("States are PROPOSED until execution evidence is recorded");
  });
});

/* ------------------------------------------------------------------ */
/* THE §027 CORE — pane alignment over one state identity              */
/* ------------------------------------------------------------------ */

describe("synchronized panes — the same stateId drives 3D, 2D and BOQ", () => {
  test("every pane of every layer carries the SAME state/scenario/step identity", () => {
    const scenario = canonicalScenario();
    scenario.states.forEach((state) => {
      const html = render(viewerInputAt(state.stateIndex));
      const panes = PANE_IDS.map((paneId) => paneOf(html, paneId));
      const stateIds = panes.map((pane) => firstAttr(pane, "data-state-id"));
      expect(new Set(stateIds).size).toBe(1);
      expect(stateIds[0]).toBe(state.stateId);
      for (const attr of [
        "data-scenario-id",
        "data-baseline-version-id",
        "data-state-index",
        "data-applied-step-ids",
      ]) {
        const values = panes.map((pane) => firstAttr(pane, attr));
        expect(new Set(values).size).toBe(1);
      }
      // The body and the step strip carry the SAME identity as the panes.
      expect(firstAttr(bodyOf(html), "data-state-id")).toBe(state.stateId);
      const stepStrip = html.slice(
        html.indexOf('id="step-strip"'),
        html.indexOf("</section>", html.indexOf('id="step-strip"')),
      );
      expect(firstAttr(stepStrip, "data-state-id")).toBe(state.stateId);
      expect(firstAttr(stepStrip, "data-applied-step-ids")).toBe(
        state.appliedStepIds.join(","),
      );
    });
  });

  test("a navigation session renders layers whose panes stay aligned at every step", () => {
    // Walk 0 → 3 with navigate() (the Next/Previous core) and render each
    // frame: the three panes must resolve to the frame's state id — never
    // a neighbor's, never a mixture.
    const scenario = canonicalScenario();
    let index = 0;
    const visited: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      const frame = viewer.navigate(scenario, index, "next");
      index = frame.stateIndex;
      const html = render(viewerInputAt(index));
      const panes = PANE_IDS.map((paneId) => firstAttr(paneOf(html, paneId), "data-state-id"));
      expect(new Set(panes).size).toBe(1);
      const paneStateId = panes[0] ?? "«pane state id missing»";
      expect(paneStateId).toBe(frame.stateId);
      visited.push(paneStateId);
    }
    expect(visited).toEqual([STATE1_ID, STATE2_ID, STATE3_ID, STATE3_ID]);
  });

  test("the 3D, 2D and BOQ panes draw the SAME stable node ids", () => {
    const html = render(viewerInputAt(2));
    const ids3d = allAttrs(paneOf(html, "pane-3d"), "data-node-id");
    const ids2d = allAttrs(paneOf(html, "pane-2d"), "data-node-id");
    const idsBoq = allAttrs(paneOf(html, "pane-boq"), "data-node-id");
    expect(ids2d).toEqual(ids3d); // both geometric panes: same drawn set
    expect(idsBoq).toContain("wall-north");
    expect(idsBoq).toContain("wall-partition-new");
    // every geometrically drawn node also has a BOQ row (superset relation)
    for (const nodeId of ids3d) {
      expect(idsBoq).toContain(nodeId);
    }
  });

  test("the 3D and 2D panes list identical honest omissions", () => {
    const html = render(viewerInputAt(2));
    const omissions3d = allAttrs(paneOf(html, "pane-3d"), "data-omitted-node-id");
    const omissions2d = allAttrs(paneOf(html, "pane-2d"), "data-omitted-node-id");
    expect(omissions2d).toEqual(omissions3d);
    expect(omissions3d).toContain("railing-1");
  });
});

/* ------------------------------------------------------------------ */
/* Layer navigation rendering                                          */
/* ------------------------------------------------------------------ */

describe("layer navigation rendering (stable ids; boundary behavior)", () => {
  test("Previous/Next carry the TARGET layer's stable state id and index", () => {
    const html = render(viewerInputAt(2));
    const nav = html.slice(html.indexOf('<nav class="layer-nav"'), html.indexOf("</nav>"));
    expect(nav).toContain(
      `data-nav-direction="previous" data-target-state-index="1" data-target-state-id="${STATE1_ID}"`,
    );
    expect(nav).toContain(
      `data-nav-direction="next" data-target-state-index="3" data-target-state-id="${STATE3_ID}"`,
    );
    expect(nav).toContain(`href="?state=1"`);
    expect(nav).toContain(`href="?state=3"`);
  });

  test("the layer strip lists EVERY state id with the current layer marked", () => {
    const html = render(viewerInputAt(2));
    const strip = html.slice(html.indexOf('<ol class="layer-strip">'), html.indexOf("</ol>"));
    const ids = allAttrs(strip, "data-state-id");
    expect(ids).toEqual([STATE0_ID, STATE1_ID, STATE2_ID, STATE3_ID]);
    const current = strip.match(/data-state-id="[^"]+" data-current="true"/);
    expect(current?.[0]).toContain(STATE2_ID);
    expect(strip.split(`data-current="true"`).length - 1).toBe(1);
  });

  test("at the FIRST layer Previous renders disabled; Next points at layer 1", () => {
    const html = render(viewerInputAt(0));
    const nav = html.slice(html.indexOf('<nav class="layer-nav"'), html.indexOf("</nav>"));
    expect(nav).toContain(
      `<span class="nav-link" data-nav-direction="previous" data-disabled="true" aria-disabled="true">← Previous — at first layer</span>`,
    );
    expect(nav).toContain(
      `data-nav-direction="next" data-target-state-index="1" data-target-state-id="${STATE1_ID}"`,
    );
  });

  test("at the LAST layer Next renders disabled; Previous points at layer 2", () => {
    const html = render(viewerInputAt(3));
    const nav = html.slice(html.indexOf('<nav class="layer-nav"'), html.indexOf("</nav>"));
    expect(nav).toContain(
      `<span class="nav-link" data-nav-direction="next" data-disabled="true" aria-disabled="true">Next — at last layer →</span>`,
    );
    expect(nav).toContain(
      `data-nav-direction="previous" data-target-state-index="2" data-target-state-id="${STATE2_ID}"`,
    );
  });

  test("a single-layer scenario renders BOTH controls disabled (boundary both sides)", () => {
    const html = render(
      viewerInput({ scenario: singleStateScenario(), stateIndex: 0 }),
    );
    const nav = html.slice(html.indexOf('<nav class="layer-nav"'), html.indexOf("</nav>"));
    expect(nav).toContain(`data-nav-direction="previous" data-disabled="true"`);
    expect(nav).toContain(`data-nav-direction="next" data-disabled="true"`);
    expect(nav).not.toContain(`data-target-state-id`);
  });

  test("the note scenario's LAST layer (4 of 4) renders Next disabled with 5 strip entries", () => {
    const html = render(viewerInputAt(4, { scenario: noteScenario() }));
    const nav = html.slice(html.indexOf('<nav class="layer-nav"'), html.indexOf("</nav>"));
    expect(nav).toContain(`Next — at last layer →`);
    expect(nav).toContain(
      `data-nav-direction="previous" data-target-state-index="3" data-target-state-id="${STATE3_ID}"`,
    );
    const strip = html.slice(html.indexOf('<ol class="layer-strip">'), html.indexOf("</ol>"));
    expect(allAttrs(strip, "data-state-id")).toEqual([
      STATE0_ID,
      STATE1_ID,
      STATE2_ID,
      STATE3_ID,
      STATE4_ID,
    ]);
    expect(firstAttr(bodyOf(html), "data-state-count")).toBe("5");
    expect(firstAttr(bodyOf(html), "data-state-id")).toBe(STATE4_ID);
  });

  test("navigation links NEVER carry write semantics — only state addresses", () => {
    const html = render(viewerInputAt(2));
    const nav = html.slice(html.indexOf('<nav class="layer-nav"'), html.indexOf("</nav>"));
    for (const banned of ["POST", "PUT", "DELETE", "PATCH", "method=", "write"]) {
      expect(nav).not.toContain(banned);
    }
    expect(nav).toContain(`data-state-count="4"`);
    expect(nav).toContain(`data-current-state-index="2"`);
    expect(nav).toContain(`data-current-state-id="${STATE2_ID}"`);
  });
});

/* ------------------------------------------------------------------ */
/* Step strip + governance display                                     */
/* ------------------------------------------------------------------ */

describe("step strip and governance display", () => {
  test("the step strip lists the applied steps VERBATIM (id, kind, target, rationale)", () => {
    const html = render(viewerInputAt(3));
    const strip = html.slice(html.indexOf('id="step-strip"'), html.indexOf("</section>", html.indexOf('id="step-strip"')));
    expect(strip).toContain(
      `<li data-step-id="${STEP1_ID}" data-step-kind="property_change" data-step-target="wall-north">${STEP1_ID} · property_change · wall-north — Upgrading the compartment line to REI90 per the fire strategy.</li>`,
    );
    expect(strip).toContain(`data-step-id="${STEP2_ID}" data-step-kind="element_addition" data-step-target="wall-partition-new"`);
    expect(strip).toContain(`data-step-id="${STEP3_ID}" data-step-kind="proposed_removal" data-step-target="wall-east"`);
    expect(strip).toContain("Layout change per option B.");
  });

  test("layer 0 renders the honest no-steps placeholder (pure baseline overlay)", () => {
    const html = render(viewerInputAt(0));
    const strip = html.slice(html.indexOf('id="step-strip"'), html.indexOf("</section>", html.indexOf('id="step-strip"')));
    expect(strip).toContain("No steps applied — layer 0 is the pure baseline overlay");
  });

  test("an approval reference renders VERBATIM and is never interpreted", () => {
    const html = render(viewerInput({ scenario: approvedScenario(), stateIndex: 3 }));
    expect(html).toContain('<section class="approval-banner" data-approval-case-id="case-fire-strategy"');
    expect(html).toContain("case <code>case-fire-strategy</code>");
    expect(html).toContain("decision <code>approved</code>");
    expect(html).toContain("reviewed at <code>2026-02-02T11:00:00.000Z</code>");
    expect(html).toContain("interpreted by the Engineering Case domain, not here");
    expect(firstAttr(bodyOf(html), "data-scenario-status")).toBe("approved");
  });

  test("a scenario without an approval reference renders no banner", () => {
    const html = render(viewerInput());
    expect(html).not.toContain('<section class="approval-banner"');
  });

  test("the note scenario's layer 4 keeps layer 3's CONTENT with a new identity", () => {
    const note = noteScenario();
    const html3 = render(viewerInputAt(3, { scenario: note }));
    const html4 = render(viewerInputAt(4, { scenario: note }));
    // Different identities…
    expect(firstAttr(bodyOf(html3), "data-state-id")).toBe(STATE3_ID);
    expect(firstAttr(bodyOf(html4), "data-state-id")).toBe(STATE4_ID);
    expect(firstAttr(paneOf(html4, "pane-boq"), "data-applied-step-ids")).toBe(
      `${STEP1_ID},${STEP2_ID},${STEP3_ID},${STEP4_ID}`,
    );
    // …but the note step changes NO model content (BOQ table identical).
    const table3 = paneOf(html3, "pane-boq").slice(paneOf(html3, "pane-boq").indexOf("<table"));
    const table4 = paneOf(html4, "pane-boq").slice(paneOf(html4, "pane-boq").indexOf("<table"));
    expect(table4).toBe(table3);
    const strip4 = html4.slice(html4.indexOf('id="step-strip"'), html4.indexOf("</section>", html4.indexOf('id="step-strip"')));
    expect(strip4).toContain(`data-step-id="${STEP4_ID}" data-step-kind="note" data-step-target="wall-north"`);
  });
});

/* ------------------------------------------------------------------ */
/* BOQ pane honesty                                                    */
/* ------------------------------------------------------------------ */

describe("BOQ pane honesty", () => {
  test("every quantity renders as PROPOSED; values verbatim with units", () => {
    const pane = paneOf(render(viewerInputAt(1)), "pane-boq");
    expect(pane).toContain("thickness = 240 mm (PROPOSED)");
    expect(pane).toContain("fireRating = REI90 (PROPOSED)");
    expect(pane).not.toContain("OBSERVED");
    expect(pane).not.toContain("CONFIRMED");
    expect(pane).not.toContain("INFERRED");
  });

  test("the pane documents that quantity/cost impacts are out of scope (AISE-028)", () => {
    const pane = paneOf(render(viewerInput()), "pane-boq");
    expect(pane).toContain("Quantity and cost impact computation is out of scope here (AISE-028)");
    expect(pane).toContain("no number is derived, converted or summed by this viewer");
  });

  test("the proposed removal renders as a PROPOSED REMOVAL row, never a fact", () => {
    const pane = paneOf(render(viewerInputAt(3)), "pane-boq");
    expect(pane).toContain(
      `wall-east — PROPOSED REMOVAL — Obsolete partition demolished to open the floor plan. (step ${STEP3_ID})`,
    );
    // wall-east has no live row in layer 3 (it left the live node set).
    expect(pane).not.toContain(`<tr data-node-id="wall-east"`);
  });

  test("a node with no properties renders an honest empty cell — never a zero", () => {
    const pane = paneOf(render(viewerInputAt(0)), "pane-boq");
    expect(pane).toContain("no proposed quantities");
  });
});

/* ------------------------------------------------------------------ */
/* Selection (node-level synchronization — presentation only)         */
/* ------------------------------------------------------------------ */

describe("selection across the three panes", () => {
  test("the selected node is highlighted in EXACTLY the three panes", () => {
    const html = render(viewerInput({ selectedNodeId: "wall-north" }));
    expect(paneOf(html, "pane-3d")).toContain(
      `<polygon data-node-id="wall-north" data-origin="baseline_touched" data-selected="true"`,
    );
    expect(paneOf(html, "pane-2d")).toContain(
      `<polygon data-node-id="wall-north" data-origin="baseline_touched" data-selected="true"`,
    );
    expect(paneOf(html, "pane-boq")).toContain(
      `<tr data-node-id="wall-north" data-origin="baseline_touched" data-selected="true"`,
    );
    for (const paneId of PANE_IDS) {
      expect(paneOf(html, paneId).split(`data-selected="true"`).length - 1).toBe(1);
    }
  });

  test("changing the selection changes ONLY presentation — ids stay stable", () => {
    const htmlNorth = render(viewerInput({ selectedNodeId: "wall-north" }));
    const htmlPartition = render(viewerInput({ selectedNodeId: "wall-partition-new" }));
    expect(htmlNorth).not.toBe(htmlPartition);
    for (const paneId of PANE_IDS) {
      expect(allAttrs(paneOf(htmlNorth, paneId), "data-node-id").sort()).toEqual(
        allAttrs(paneOf(htmlPartition, paneId), "data-node-id").sort(),
      );
    }
    // The layer identity is untouched by selection.
    const northStateId = firstAttr(bodyOf(htmlNorth), "data-state-id");
    const partitionStateId = firstAttr(bodyOf(htmlPartition), "data-state-id");
    expect(partitionStateId).toBe(northStateId);
    expect(northStateId).toBe(STATE2_ID);
  });

  test("a node id resolving in no pane highlights nothing and never throws", () => {
    const html = render(viewerInput({ selectedNodeId: "ghost-node" }));
    expect(html).not.toContain(`data-selected="true"`);
  });
});

/* ------------------------------------------------------------------ */
/* Determinism, shuffle invariance, purity                             */
/* ------------------------------------------------------------------ */

describe("determinism and purity", () => {
  test("two renders of the same input are byte-identical", () => {
    const input = viewerInput({ selectedNodeId: "wall-north" });
    expect(render(input)).toBe(render(input));
    const clone = JSON.parse(JSON.stringify(input)) as ViewerInput;
    expect(render(clone)).toBe(render(input));
  });

  test("shuffled state/geometry arrays render byte-identically (order-insensitivity)", () => {
    expect(render(viewerInputAt(2, { scenario: shuffledScenario(), geometries: shuffledGeometries() }))).toBe(
      render(viewerInputAt(2)),
    );
  });

  test("a deep-frozen input renders without throwing and without mutation", () => {
    const frozen = deepFreeze(viewerInput({ selectedNodeId: "wall-north" }));
    const before = JSON.stringify(frozen);
    expect(() => render(frozen)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });

  test("the viewer module exports NO mutation/fetch API (authority tripwire)", () => {
    const banned = Object.keys(viewer).filter((name) =>
      /set|update|mutate|assign|approve|reject|save|write|fetch|delete|patch|push|post|create|add|remove|transition|record|append|materialize|apply/i.test(
        name,
      ),
    );
    expect(banned).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe("validation (typed rejections)", () => {
  test("malformed inputs are typed invalid_input rejections", () => {
    const base = viewerInput();
    const bad = [
      { ...base, scenario: undefined },
      { ...base, scenario: { ...base.scenario, scenarioId: "" } },
      { ...base, scenario: { ...base.scenario, baselineVersionId: "" } },
      { ...base, scenario: { ...base.scenario, steps: "not-an-array" } },
      { ...base, scenario: { ...base.scenario, states: [] } },
      { ...base, geometries: "not-an-array" },
      { ...base, stateIndex: -1 },
      { ...base, stateIndex: 1.5 },
      { ...base, selectedNodeId: "" },
      { ...base, view: { azimuthRad: Number.NaN, elevationRad: 0 } },
    ] as unknown as readonly ViewerInput[];
    for (const input of bad) {
      let code = "";
      try {
        render(input);
      } catch (error) {
        code = (error as viewer.ViewerError).code;
      }
      expect(code).toBe("invalid_input");
    }
  });

  test("an out-of-range layer index is a typed state_index_out_of_range", () => {
    let code = "";
    try {
      render(viewerInputAt(4));
    } catch (error) {
      code = (error as viewer.ViewerError).code;
    }
    expect(code).toBe("state_index_out_of_range");
  });

  test("a misaligned record is rejected, never silently re-synchronized", () => {
    const scenario = canonicalScenario();
    const misaligned = {
      ...scenario,
      states: scenario.states.map((state) =>
        state.stateIndex === 2 ? { ...state, scenarioId: "scenario-foreign" } : state,
      ),
    };
    let code = "";
    try {
      render(viewerInputAt(2, { scenario: misaligned }));
    } catch (error) {
      code = (error as viewer.ViewerError).code;
    }
    expect(code).toBe("state_scenario_mismatch");
  });

  test("stateIndex defaults to layer 0 (the baseline overlay) when absent", () => {
    const html = render({ scenario: canonicalScenario(), geometries: [] });
    expect(firstAttr(bodyOf(html), "data-state-id")).toBe(STATE0_ID);
    expect(firstAttr(bodyOf(html), "data-state-index")).toBe("0");
  });

  test("an empty geometry table renders honest unresolved omissions, not guesses", () => {
    const html = render({ scenario: canonicalScenario(), geometries: [] });
    const pane = paneOf(html, "pane-3d");
    expect(pane).not.toContain("<polygon");
    expect(pane).toContain('data-omitted-node-id="wall-north" data-reason="geometry-unresolved"');
  });
});
