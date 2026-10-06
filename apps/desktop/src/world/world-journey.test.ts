/**
 * WORLD-P5 — the DESKTOP WORLD JOURNEY TEST TRACE (Task 7): the
 * first-class desktop world journey over the ONE committed station
 * record — the full mount + HUD + authoring-review sequence, packaged
 * with the shell's existing policy surface, feature-equivalent to web
 * (the journey-parity evidence WORLD-P5 records).
 *
 * The trace drives the REAL surfaces end-to-end (no test doubles of
 * journey code):
 *
 *   1. the FULL JOURNEY passes over the fixture deep-link startup —
 *      all six typed steps, the shell policy's own resolution, the
 *      world route hash composition, the ledger of 4 accepted + 1
 *      refused typed command;
 *   2. the CENSUS matches the committed web record exactly (identity,
 *      scope, panel order, all POPULATED, 7 elements / 7 viewport
 *      boxes, the ghost, the ghost summary, the initial camera, the
 *      commit instant);
 *   3. the PARITY FACTS are exact — the web record's identity, panel
 *      order (the canonical 7), the refusal substring the web headless
 *      tests pin, and the equivalence note;
 *   4. the REFUSAL DRILL refuses and leaves the state unchanged —
 *      re-derived independently through the SAME shared reducer;
 *   5. the GPU PARITY LEG round-trips the record's initial camera
 *      through the REAL Babylon adapter (NullEngine);
 *   6. a POISONED STARTUP fails closed naming the step (never a
 *      partial journey presented as complete);
 *   7. DETERMINISM — two runs produce canonical-JSON-identical results.
 *
 * Determinism: the committed record is the only seed; no clock, no
 * randomness, no network (NullEngine — the real scene graph, CPU-side).
 */

import { describe, expect, test } from "bun:test";
import { DEFAULT_DEV_URL, parseShellArguments } from "../shell/policy";
import { createBabylonSceneRuntime } from "@aise/world-scene-runtime";
import type { GeometryReference } from "@aise/world-reality-substrate";
import {
  committedAt,
  DESKTOP_STATION_RECORD,
  elementCount,
  ghostElementId,
  ghostSummary,
  initialCamera,
  panelIds,
  scopeLabel,
  stationId,
  viewportBoxCount,
} from "./station-corpus";
import {
  canonicalJson,
  runDesktopWorldJourney,
  type DesktopWorldJourneyResult,
} from "./world-journey";
import {
  initialStationViewState,
  reduceStationCommand,
} from "../../../web/src/app/world/browser-station";

/* ------------------------------------------------------------------ */
/* The fixture startup (the journey's committed inputs)                  */
/* ------------------------------------------------------------------ */

/** The deep link that opens the station's project (the record's scope). */
const FIXTURE_ARGUMENTS: readonly string[] = ["aise://project/proj-demo-001"];
/** A clean environment: no explicit target — the default dev URL wins. */
const FIXTURE_ENV: Readonly<Record<string, string>> = {};
/** The --dir policy's IO seam: no local built-assets directory here. */
const NO_LOCAL_DIRECTORY = (): boolean => false;

function fixtureJourney(): DesktopWorldJourneyResult {
  return runDesktopWorldJourney({
    shellArguments: FIXTURE_ARGUMENTS,
    env: FIXTURE_ENV,
    directoryExists: NO_LOCAL_DIRECTORY,
  });
}

describe("WORLD-P5 the desktop world journey (mount + HUD + authoring parity over the ONE committed record)", () => {
  test("step 1 — the full journey passes over the fixture deep-link startup", () => {
    const result = fixtureJourney();
    expect(result.ok).toBe(true);
    expect(result.failure).toBeNull();

    // All six typed steps ran, in order.
    expect(result.steps.map((step) => step.step)).toEqual([
      "shell-boot",
      "world-open",
      "station-mount",
      "typed-interactions",
      "gpu-parity",
      "feature-equivalence",
    ]);

    // The shell policy resolved the default dev target (the task's STEP 1).
    const boot = result.steps[0];
    expect(boot?.detail).toContain("target.kind=url");
    expect(boot?.detail).toContain(DEFAULT_DEV_URL);

    // The deep link mapped to the web app's world route hash (STEP 2).
    const worldOpen = result.steps[1];
    expect(worldOpen?.detail).toContain(`${DEFAULT_DEV_URL}#/world`);

    // The typed ledger: 4 accepted commands + 1 refused drill.
    expect(result.interactions).toHaveLength(5);
    expect(result.interactions.map((entry) => entry.ok)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  test("step 2 — the census matches the committed web record exactly", () => {
    // The ONE record, read through the corpus's typed accessors.
    expect(stationId()).toBe("794d5f8ca8e59d66");
    expect(scopeLabel()).toBe("proj-demo-001");
    expect(committedAt()).toBe("2026-09-16T12:00:00.000Z");
    expect(panelIds()).toEqual([
      "objective",
      "evidence",
      "constraints",
      "agent",
      "validation",
      "cost-boq",
      "timeline",
    ]);
    expect(elementCount()).toBe(7);
    expect(viewportBoxCount()).toBe(7);
    expect(ghostElementId()).toBe("ghost-reparameterize-2814f7cd97b18960");
    expect(ghostSummary()).toEqual({
      operationId:
        "ec097a4bfa7ef76bb0777985a79ba5f835bed9a254513c7c452985197f2522d2",
      proposedElementIds: ["ghost-reparameterize-2814f7cd97b18960"],
      removedElementIds: ["plan-wall-001"],
    });
    expect(initialCamera()).toEqual({
      position: [8, -8, 6],
      target: [0, 0, 1],
      up: [0, 0, 1],
      fovRadians: 0.9,
      mode: "orbit",
    });

    // ALL seven panels are POPULATED; the ghost is in the element index.
    expect(DESKTOP_STATION_RECORD.hud.panels).toHaveLength(7);
    expect(
      DESKTOP_STATION_RECORD.hud.panels.every(
        (panel) => panel.contentState === "POPULATED",
      ),
    ).toBe(true);
    const ghost = DESKTOP_STATION_RECORD.elements.find(
      (element) => element.elementId === ghostElementId(),
    );
    expect(ghost?.isGhost).toBe(true);
    expect(ghost?.status).toBe("proposed-ghost");
  });

  test("step 3 — parityFacts are exact (the feature-equivalence facts)", () => {
    const result = fixtureJourney();
    expect(result.ok).toBe(true);
    const facts = result.parityFacts;
    expect(facts).not.toBeNull();
    if (facts === null) return;

    // EXACT: the four parity facts, nothing more.
    expect(facts).toEqual({
      stationId: "794d5f8ca8e59d66",
      panelIdOrder: [
        "objective",
        "evidence",
        "constraints",
        "agent",
        "validation",
        "cost-boq",
        "timeline",
      ],
      refusalSubstring: "not part of this station scene",
      note: "feature-equivalent to web over the ONE committed station record",
    });

    // The substring is not decorative: the drill's recorded refusal
    // (the shared reducer's own text) carries it verbatim.
    const drill = result.interactions[4];
    expect(drill?.ok).toBe(false);
    expect(drill?.refusal).toContain(facts.refusalSubstring);
  });

  test("step 4 — the refusal drill refuses and leaves the state unchanged (the shared reducer, re-derived)", () => {
    const result = fixtureJourney();
    expect(result.ok).toBe(true);

    // The journey's ledger recorded the drill as refused, with the web law text.
    const drill = result.interactions[4];
    expect(drill?.ok).toBe(false);
    expect(drill?.command).toContain("element-unknown-42");
    expect(drill?.refusal).toContain("not part of this station scene");

    // Independent re-derivation through the SAME shared reducer the web
    // route runs: the four accepted commands, then the drill.
    const record = DESKTOP_STATION_RECORD;
    const ghostId = ghostElementId();
    expect(ghostId).not.toBeNull();
    if (ghostId === null) return;
    let state = initialStationViewState(record);
    state = reduceStationCommand(record, state, {
      kind: "select-element",
      elementId: "plan-wall-001",
    }).state;
    state = reduceStationCommand(record, state, {
      kind: "select-element",
      elementId: ghostId,
    }).state;
    state = reduceStationCommand(record, state, {
      kind: "camera-operation",
      operation: "orbit-to",
      position: [2, -8, 3],
      target: [2, -2, 1.5],
    }).state;
    state = reduceStationCommand(record, state, {
      kind: "toggle-layer",
      layerId: "capture-reality",
      visible: false,
    }).state;
    const before = canonicalJson(state);
    const refused = reduceStationCommand(record, state, {
      kind: "select-element",
      elementId: "element-unknown-42",
    });
    expect(refused.ok).toBe(false);
    expect(refused.refusal).toContain("not part of this station scene");
    // The refusal left the state UNCHANGED — byte-identical, prior
    // selections still in place.
    expect(canonicalJson(refused.state)).toBe(before);
    expect(refused.state.selectedElementIds).toContain("plan-wall-001");
    expect(refused.state.selectedElementIds).toContain(ghostId);
  });

  test("step 5 — the GPU parity leg round-trips the record's initial camera through the real adapter", () => {
    const record = DESKTOP_STATION_RECORD;
    const runtimeOutcome = createBabylonSceneRuntime({
      engine: { mode: "null" },
      geometry: (reference: GeometryReference) => {
        const box = record.viewport.boxes.find(
          (candidate) => candidate.assetId === reference.assetId,
        );
        return box === undefined
          ? null
          : { kind: "box" as const, min: box.min, max: box.max };
      },
    });
    expect(runtimeOutcome.ok).toBe(true);
    if (!runtimeOutcome.ok) return;
    const runtime = runtimeOutcome.value;

    const load = runtime.loadScene(record.viewport.scene);
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    const handle = load.value;
    expect(handle.sceneRevision).toBe(record.viewport.scene.revision);

    const camera = initialCamera();
    expect(runtime.setCamera(handle, camera).ok).toBe(true);
    const back = runtime.getCamera(handle);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(JSON.stringify(back.value)).toBe(JSON.stringify(camera));
    }
    // NullEngine is honest about having no renderer identity.
    expect(runtime.rendererInfo()).toBeNull();
    runtime.dispose(handle);
    runtime.shutdown();

    // And the journey's gpu-parity step recorded the same leg.
    const result = fixtureJourney();
    expect(result.ok).toBe(true);
    const gpuStep = result.steps[4];
    expect(gpuStep?.step).toBe("gpu-parity");
    expect(gpuStep?.detail).toContain("round-trips byte-equal");
    expect(gpuStep?.detail).toContain("rendererInfo null");
  });

  test("step 6 — a poisoned startup fails closed naming the step (never a partial journey)", () => {
    // The drill: SHELL ARGUMENTS the policy itself refuses — a bare
    // `--url` pair (the policy's argument vocabulary is `--url=<url>`)
    // with a non-http(s) scheme behind it.
    const poisonedArguments: readonly string[] = ["--url", "ftp://bad"];
    const parsed = parseShellArguments(poisonedArguments, {});
    expect(parsed.kind).toBe("invalid");

    const poisoned = runDesktopWorldJourney({
      shellArguments: poisonedArguments,
      env: FIXTURE_ENV,
      directoryExists: NO_LOCAL_DIRECTORY,
    });
    expect(poisoned.ok).toBe(false);
    expect(poisoned.failure?.step).toBe("shell-boot");
    // Fail-closed: the failing step is the ONLY step; no parity facts
    // are presented; no interactions ran.
    expect(poisoned.steps).toHaveLength(1);
    expect(poisoned.steps[0]?.step).toBe("shell-boot");
    expect(poisoned.parityFacts).toBeNull();
    expect(poisoned.interactions).toHaveLength(0);

    // The scheme-law leg: `--url=ftp://bad` (the http/https acceptance
    // law) fails closed at the SAME named step.
    const schemeLaw = runDesktopWorldJourney({
      shellArguments: ["--url=ftp://bad"],
      env: FIXTURE_ENV,
      directoryExists: NO_LOCAL_DIRECTORY,
    });
    expect(schemeLaw.ok).toBe(false);
    expect(schemeLaw.failure?.step).toBe("shell-boot");
    expect(schemeLaw.failure?.detail).toContain("--url rejected");
    expect(schemeLaw.parityFacts).toBeNull();
    expect(schemeLaw.interactions).toHaveLength(0);
  });

  test("step 7 — determinism: two runs are canonical-JSON-identical", () => {
    const first = fixtureJourney();
    const second = fixtureJourney();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });
});
