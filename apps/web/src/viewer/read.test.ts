/**
 * AISE-027 viewer tests — the READ-ONLY data-access seam: always-GET
 * request builders over the AISE-026 route surface, loadViewerInput's
 * two-read alignment cross-check, and the no-mutation discriminations
 * (the recording reader proves only read members are ever touched).
 */

import { describe, expect, test } from "bun:test";
import * as viewer from "./index";
import {
  canonicalScenario,
  deepFreeze,
  makeReader,
  makeRecordingReader,
  nullScenarioReader,
  nullStateReader,
  noteScenario,
  STATE0_ID,
  STATE2_ID,
  STATE3_ID,
  STATE4_ID,
  STEP1_ID,
  STEP2_ID,
  tamperingStateReader,
  viewerGeometries,
} from "./fixtures";
import type { InterventionReader, LoadViewerOptions, ViewerInterventionState } from "./index";

async function expectCodeAsync(
  fn: () => Promise<unknown>,
  code: viewer.ViewerErrorCode,
): Promise<void> {
  try {
    await fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(viewer.ViewerError);
    expect((error as viewer.ViewerError).code).toBe(code);
  }
}

/** Rebuild a value with every object's keys in REVERSED insertion order. */
function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseKeyOrder);
  }
  if (typeof value === "object" && value !== null) {
    const rebuilt: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).reverse()) {
      rebuilt[key] = reverseKeyOrder((value as Record<string, unknown>)[key]);
    }
    return rebuilt;
  }
  return value;
}

const LOAD_OPTIONS: LoadViewerOptions = {
  scenarioId: "scenario-office-refit",
  stateSelector: 2,
  geometries: viewerGeometries(),
};

/* ------------------------------------------------------------------ */
/* Request builders (the AISE-026 route surface; ALWAYS GET)           */
/* ------------------------------------------------------------------ */

describe("request builders — the read-only HTTP surface", () => {
  test("scenarioReadRequest mirrors GET /v1/interventions/:id", () => {
    const request = viewer.scenarioReadRequest("scenario-office-refit");
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/v1/interventions/scenario-office-refit");
  });

  test("stateReadRequest mirrors GET /v1/interventions/:id/states/:index|latest", () => {
    expect(viewer.stateReadRequest("scenario-office-refit", 2)).toEqual({
      method: "GET",
      url: "/v1/interventions/scenario-office-refit/states/2",
    });
    expect(viewer.stateReadRequest("scenario-office-refit", "latest")).toEqual({
      method: "GET",
      url: "/v1/interventions/scenario-office-refit/states/latest",
    });
  });

  test("scenario ids are URL-encoded; an optional base URL is prefixed", () => {
    const request = viewer.scenarioReadRequest("scenario /refit", "https://aise.example");
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://aise.example/v1/interventions/scenario%20%2Frefit");
    const stateRequest = viewer.stateReadRequest("scenario /refit", 0, "https://aise.example");
    expect(stateRequest.url).toBe(
      "https://aise.example/v1/interventions/scenario%20%2Frefit/states/0",
    );
  });

  test("every request the viewer can build is GET — the POST discrimination", () => {
    const requests = [
      viewer.scenarioReadRequest("a"),
      viewer.scenarioReadRequest("b", "https://x"),
      viewer.stateReadRequest("a", 0),
      viewer.stateReadRequest("a", 1, "https://x"),
      viewer.stateReadRequest("a", "latest"),
    ];
    for (const request of requests) {
      expect(request.method).toBe("GET");
    }
  });
});

/* ------------------------------------------------------------------ */
/* loadViewerInput — assembly + the two-read alignment cross-check     */
/* ------------------------------------------------------------------ */

describe("loadViewerInput — read-only assembly with alignment verification", () => {
  test("assembles the input from the two reads with the resolved layer", async () => {
    const loaded = await viewer.loadViewerInput(makeReader(canonicalScenario()), LOAD_OPTIONS);
    expect(loaded.input.scenario.scenarioId).toBe("scenario-office-refit");
    expect(loaded.input.stateIndex).toBe(2);
    expect(loaded.input.geometries).toHaveLength(viewerGeometries().length);
    expect(loaded.state.stateId).toBe(STATE2_ID);
  });

  test("the assembled input renders the SAME state the reads resolved", async () => {
    const loaded = await viewer.loadViewerInput(makeReader(canonicalScenario()), LOAD_OPTIONS);
    const html = viewer.renderInterventionViewer(loaded.input);
    expect(html).toContain(`data-state-id="${STATE2_ID}"`);
    expect(html).toContain(`data-applied-step-ids="${STEP1_ID},${STEP2_ID}"`);
  });

  test("the default selector is layer 0; \"latest\" resolves the last layer", async () => {
    const reader = makeReader(canonicalScenario());
    const first = await viewer.loadViewerInput(reader, {
      scenarioId: "scenario-office-refit",
      geometries: [],
    });
    expect(first.input.stateIndex).toBe(0);
    expect(first.state.stateId).toBe(STATE0_ID);
    const latest = await viewer.loadViewerInput(reader, {
      scenarioId: "scenario-office-refit",
      stateSelector: "latest",
      geometries: [],
    });
    expect(latest.input.stateIndex).toBe(3);
    expect(latest.state.stateId).toBe(STATE3_ID);
  });

  test("\"latest\" resolves the note scenario's layer 4 (a 5-layer record)", async () => {
    const loaded = await viewer.loadViewerInput(makeReader(noteScenario()), {
      scenarioId: "scenario-office-refit",
      stateSelector: "latest",
      geometries: [],
    });
    expect(loaded.input.stateIndex).toBe(4);
    expect(loaded.state.stateId).toBe(STATE4_ID);
    const html = viewer.renderInterventionViewer(loaded.input);
    expect(html).toContain(`data-state-id="${STATE4_ID}"`);
    expect(html).toContain(`data-state-count="5"`);
  });

  test("an unresolved scenario is a typed scenario_not_found", async () => {
    await expectCodeAsync(
      () => viewer.loadViewerInput(nullScenarioReader(), LOAD_OPTIONS),
      "scenario_not_found",
    );
  });

  test("an unresolved state is a typed state_not_found", async () => {
    await expectCodeAsync(
      () => viewer.loadViewerInput(nullStateReader(canonicalScenario()), LOAD_OPTIONS),
      "state_not_found",
    );
  });

  test("an out-of-range selector is a typed state_index_out_of_range", async () => {
    await expectCodeAsync(
      () =>
        viewer.loadViewerInput(makeReader(canonicalScenario()), {
          ...LOAD_OPTIONS,
          stateSelector: 4,
        }),
      "state_index_out_of_range",
    );
  });

  test("malformed options are typed invalid_input", async () => {
    const reader = makeReader(canonicalScenario());
    await expectCodeAsync(
      () =>
        viewer.loadViewerInput(reader, {
          scenarioId: "",
          geometries: [],
        }),
      "invalid_input",
    );
    await expectCodeAsync(
      () =>
        viewer.loadViewerInput(reader, {
          scenarioId: "scenario-office-refit",
          stateSelector: -1,
          geometries: [],
        }),
      "invalid_input",
    );
    await expectCodeAsync(
      () =>
        viewer.loadViewerInput(reader, {
          scenarioId: "scenario-office-refit",
          stateSelector: 1.5,
          geometries: [],
        }),
      "invalid_input",
    );
  });

  test("a read-back state from a foreign scenario is a typed state_scenario_mismatch", async () => {
    const reader = tamperingStateReader(canonicalScenario(), (state) => ({
      ...state,
      scenarioId: "scenario-foreign",
    }));
    await expectCodeAsync(
      () => viewer.loadViewerInput(reader, LOAD_OPTIONS),
      "state_scenario_mismatch",
    );
  });

  test("a read-back state with a drifting id is a typed state_sequence_mismatch", async () => {
    const reader = tamperingStateReader(canonicalScenario(), (state) => ({
      ...state,
      stateId: STATE0_ID,
    }));
    await expectCodeAsync(
      () => viewer.loadViewerInput(reader, LOAD_OPTIONS),
      "state_sequence_mismatch",
    );
  });

  test("a read-back state with drifted CONTENT is a typed state_sequence_mismatch", async () => {
    const reader = tamperingStateReader(canonicalScenario(), (state) => ({
      ...state,
      nodes: state.nodes.map((stateNode) =>
        stateNode.nodeId === "wall-north"
          ? {
              ...stateNode,
              node: {
                ...stateNode.node,
                properties: stateNode.node.properties.map((property) =>
                  property.key === "fireRating"
                    ? { ...property, value: "REI120" }
                    : property,
                ),
              },
            }
          : stateNode,
      ),
    }));
    await expectCodeAsync(
      () => viewer.loadViewerInput(reader, LOAD_OPTIONS),
      "state_sequence_mismatch",
    );
  });

  test("OBJECT key-order differences are NOT drift (order-insensitive check)", async () => {
    // Rebuilding every object with reversed key insertion order changes
    // nothing semantically — the agreement check is key-order-insensitive.
    const reader = tamperingStateReader(
      canonicalScenario(),
      (state) => reverseKeyOrder(state) as ViewerInterventionState,
    );
    const loaded = await viewer.loadViewerInput(reader, LOAD_OPTIONS);
    expect(loaded.state.stateId).toBe(STATE2_ID);
  });

  test("ARRAY-order drift IS drift (026 canonicalizes node order into the state id)", async () => {
    const reader = tamperingStateReader(canonicalScenario(), (state) => ({
      ...state,
      nodes: [...state.nodes].reverse(),
    }));
    await expectCodeAsync(
      () => viewer.loadViewerInput(reader, LOAD_OPTIONS),
      "state_sequence_mismatch",
    );
  });

  test("deterministic: two loads over fresh readers assemble identical input", async () => {
    const a = await viewer.loadViewerInput(makeReader(canonicalScenario()), LOAD_OPTIONS);
    const b = await viewer.loadViewerInput(makeReader(canonicalScenario()), LOAD_OPTIONS);
    expect(JSON.stringify(a.input)).toBe(JSON.stringify(b.input));
  });

  test("purity: a deep-frozen scenario record survives loading untouched", async () => {
    const frozen = deepFreeze(canonicalScenario());
    const reader: InterventionReader = {
      readScenario: async (scenarioId) => (scenarioId === frozen.scenarioId ? frozen : null),
      readState: async (scenarioId, stateIndex) =>
        scenarioId === frozen.scenarioId ? (frozen.states[stateIndex] ?? null) : null,
    };
    const before = JSON.stringify(frozen);
    const loaded = await viewer.loadViewerInput(reader, LOAD_OPTIONS);
    expect(loaded.state.stateId).toBe(STATE2_ID);
    expect(JSON.stringify(frozen)).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* The no-mutation discriminations (the recording reader)              */
/* ------------------------------------------------------------------ */

describe("the viewer never issues writes (data-access seam discriminations)", () => {
  test("a full viewer session touches EXACTLY the two read members", async () => {
    const reader = makeRecordingReader(canonicalScenario());
    const loaded = await viewer.loadViewerInput(reader, LOAD_OPTIONS);
    viewer.renderInterventionViewer(loaded.input);
    // Drive the full navigation surface too.
    for (let index = 0; index < 4; index += 1) {
      viewer.navigate(canonicalScenario(), index, "next");
      viewer.navigate(canonicalScenario(), index, "previous");
    }
    const accesses = reader.memberAccesses();
    const unique = new Set(accesses);
    expect([...unique].sort()).toEqual([...viewer.READER_MEMBERS].sort());
    // No banned (write-shaped) member was ever touched on the seam.
    const banned = [...unique].filter((name) =>
      /set|update|mutate|assign|approve|reject|save|write|fetch|delete|patch|push|post|create|add|remove|transition|record|append|materialize/i.test(
        name,
      ),
    );
    expect(banned).toEqual([]);
  });

  test("every seam call was a read with the correct arguments", async () => {
    const reader = makeRecordingReader(noteScenario());
    await viewer.loadViewerInput(reader, {
      scenarioId: "scenario-office-refit",
      stateSelector: 4,
      geometries: [],
    });
    const calls = reader.calls();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe("readScenario");
    expect(calls[0]?.args).toEqual(["scenario-office-refit"]);
    expect(calls[1]?.method).toBe("readState");
    expect(calls[1]?.args).toEqual(["scenario-office-refit", 4]);
  });

  test("loading every layer uses only reads (a full sweep stays read-only)", async () => {
    const reader = makeRecordingReader(canonicalScenario());
    for (let index = 0; index < 4; index += 1) {
      const loaded = await viewer.loadViewerInput(reader, {
        scenarioId: "scenario-office-refit",
        stateSelector: index,
        geometries: viewerGeometries(),
      });
      viewer.renderInterventionViewer(loaded.input);
    }
    const members: readonly string[] = [...viewer.READER_MEMBERS];
    for (const call of reader.calls()) {
      expect(members).toContain(call.method);
    }
    const rendered = reader
      .calls()
      .filter((call) => call.method === "readState")
      .map((call) => call.args[1]);
    expect(rendered).toEqual([0, 1, 2, 3]);
  });

  test("READER_MEMBERS is frozen and pins the seam vocabulary exactly", () => {
    expect(Object.isFrozen(viewer.READER_MEMBERS)).toBe(true);
    expect([...viewer.READER_MEMBERS]).toEqual(["readScenario", "readState"]);
  });

  test("the seam type has no write member (self-verifying type-level tripwire)", () => {
    const reader: InterventionReader = makeReader(canonicalScenario());
    // @ts-expect-error — the seam exposes no step-recording member
    void reader.addStep;
    // @ts-expect-error — the seam exposes no approval-recording member
    void reader.recordApprovalReference;
    // @ts-expect-error — the seam exposes no status-transition member
    void reader.transitionStatus;
    expect(typeof reader.readScenario).toBe("function");
    expect(typeof reader.readState).toBe("function");
  });
});
