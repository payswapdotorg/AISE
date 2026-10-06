/**
 * WORLD-P5 — the DESKTOP WORLD JOURNEY MODEL (Task 7): the first-class
 * desktop world journey (mount + HUD + authoring-review interactions),
 * packaged with the shell's existing policy/adapter surfaces — a PURE,
 * bun-testable model in the desktop-journey.test.ts step style (no
 * Electron, no display, no network; the shell launch stays the
 * integration-station lane per PROD-020).
 *
 * THE SIX TYPED STEPS:
 *   1. SHELL-BOOT        — the shell's OWN pure policy (parseShellArguments
 *                          from ../shell/policy) resolves the deep-link
 *                          startup `aise://project/<projectId>` and the
 *                          load target (the default dev URL);
 *   2. WORLD-OPEN        — the deep link maps to the web app's world route
 *                          hash (`#/world`) — the route the shell loads;
 *   3. STATION-MOUNT     — the census over the ONE committed record
 *                          (station identity, ALL panels POPULATED, the
 *                          element/viewport-box counts, the ghost present);
 *   4. TYPED-INTERACTIONS— the SAME browser-safe reducer the web route
 *                          runs (apps/web/src/app/world/browser-station.ts,
 *                          an apps→apps import) through select the
 *                          proposed-removed element → select the ghost →
 *                          camera orbit-to → toggle capture-reality off →
 *                          the unknown-element refusal drill (state
 *                          unchanged);
 *   5. GPU-PARITY        — the REAL Babylon adapter
 *                          (@aise/world-scene-runtime — the same package
 *                          the web GPU mount occupies the port with) over
 *                          the record's viewport scene under NullEngine:
 *                          loadScene (revision matches), the record's
 *                          initial camera round-trips byte-equal, the
 *                          ghost set applies, the frameStats census holds,
 *                          rendererInfo is honestly null;
 *   6. FEATURE-EQUIVALENCE — the parity facts: the SAME stationId the web
 *                          route renders, the SAME panel id order (the
 *                          canonical 7), the refusal SUBSTRING the web
 *                          headless tests pin, and the equivalence note.
 *
 * NON-AUTHORITY (the thin-adapter law): the journey READS and ASSERTS —
 * it hosts no engineering authority of its own; the reducer and the
 * adapter are the SHARED surfaces, the record is the ONE truth.
 *
 * FAIL-CLOSED: any sub-step failure returns ok:false with the step named
 * (never a partial journey presented as complete).
 *
 * Determinism: pure inputs + the committed record + NullEngine (no GPU
 * device, no clock, no randomness, no network) — two runs produce
 * canonical-JSON-identical results (pinned by the test).
 */

declare global {
  /**
   * TYPE-LEVEL declaration only (never a runtime value): the shared
   * `@aise/world-scene-runtime` adapter declares its WebGL engine mode
   * over the browser's `HTMLCanvasElement` (the package compiles under
   * the web workspace's DOM lib). The desktop workspace compiles
   * WITHOUT the DOM lib, so the shared declaration is satisfied here
   * by this type-level declaration. Nothing in this package constructs
   * a canvas: the journey exercises ONLY the adapter's NullEngine mode
   * (the real scene graph + CPU ray picking, honestly GPU-blocked);
   * the WebGL/canvas mode stays the browser mount's lane.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the type-level canvas declaration above (satisfies the shared adapter's WebGL-mode declaration desktop-side; never a runtime value)
  interface HTMLCanvasElement {}
}

import { parseShellArguments } from "../shell/policy";
import { createBabylonSceneRuntime } from "@aise/world-scene-runtime";
import type {
  CameraState,
  GeometryReference,
  GhostSetSummary,
} from "@aise/world-reality-substrate";
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
  WEB_STATION_RECORD_PATH,
} from "./station-corpus";
import {
  initialStationViewState,
  isRecordElementVisible,
  reduceStationCommand,
  type StationCommand,
} from "../../../web/src/app/world/browser-station";
import type { StationRecord } from "../../../web/src/app/world/record";

/* ------------------------------------------------------------------ */
/* The journey types                                                    */
/* ------------------------------------------------------------------ */

/** The pure journey input: the shell startup + the environment seam. */
export interface DesktopWorldJourneyInput {
  /** The shell's process arguments (the deep link rides here). */
  readonly shellArguments: readonly string[];
  /** The shell's environment (the AISE_DESKTOP_TARGET_* policy seam). */
  readonly env: Readonly<Record<string, string>>;
  /** The directory-exists predicate (the --dir policy's IO seam). */
  readonly directoryExists: (path: string) => boolean;
}

/** One recorded journey step (named + a deterministic detail line). */
export interface DesktopWorldJourneyStep {
  readonly step: string;
  readonly detail: string;
}

/** One typed interaction of the STEP 4 ledger (the shared reducer's answer). */
export interface DesktopWorldInteraction {
  /** The typed command, canonical JSON (deterministic serialization). */
  readonly command: string;
  readonly ok: boolean;
  readonly refusal: string | null;
}

/** The feature-equivalence facts (STEP 6 — asserted, then presented). */
export interface DesktopWorldParityFacts {
  /** The SAME stationId the web route renders (the ONE record). */
  readonly stationId: string;
  /** The SAME panel id order the web route renders (the canonical 7). */
  readonly panelIdOrder: readonly string[];
  /** The refusal substring the web headless tests pin (LAW 2). */
  readonly refusalSubstring: string;
  /** The equivalence note (cited verbatim in evidence). */
  readonly note: string;
}

/** The journey result (fail-closed: ok:false names the failing step). */
export interface DesktopWorldJourneyResult {
  readonly ok: boolean;
  /** The steps that ran, in order — the last entry names a failure when ok:false. */
  readonly steps: readonly DesktopWorldJourneyStep[];
  /** The STEP 4 typed-interaction ledger ({command, ok, refusal} each). */
  readonly interactions: readonly DesktopWorldInteraction[];
  /** The parity facts — present ONLY when the whole journey completed. */
  readonly parityFacts: DesktopWorldParityFacts | null;
  /** The named failing step (null on success). */
  readonly failure: DesktopWorldJourneyStep | null;
}

/* ------------------------------------------------------------------ */
/* Canonical JSON (the determinism law's serializer — same law as the   */
/* world-ux canonicalJsonStringify: sorted object keys, array order     */
/* preserved, undefined dropped; local so the desktop adds no new       */
/* package dependency)                                                  */
/* ------------------------------------------------------------------ */

/** Serialize a pure-data value canonically (sorted keys, stable output). */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") {
    return typeof value === "undefined" ? "null" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

/* ------------------------------------------------------------------ */
/* The committed census the journey demands (fail-closed if it drifts)  */
/* ------------------------------------------------------------------ */

/** The committed station identity (the web headless LAW 1 pins the same literal). */
const EXPECTED_STATION_ID = "794d5f8ca8e59d66";
/** The HUD panel id order the web route renders. */
const EXPECTED_PANEL_ORDER: readonly string[] = [
  "objective",
  "evidence",
  "constraints",
  "agent",
  "validation",
  "cost-boq",
  "timeline",
];
/** The element census (the P5 viewport projection's committed counts). */
const EXPECTED_ELEMENT_COUNT = 7;
/** The viewport box census (the declared-geometry projection's box table). */
const EXPECTED_VIEWPORT_BOX_COUNT = 7;
/** The record's kind tag. */
const EXPECTED_RECORD_KIND = "aise.world-station-record/1";
/** The proposed-removed element the authoring-review interaction selects. */
const PROPOSED_REMOVED_ELEMENT_ID = "plan-wall-001";
/** The capture layer the journey toggles off (the AND-semantics leg). */
const CAPTURE_LAYER_ID = "capture-reality";
/** The unknown element the refusal drill selects (the web LAW 2 pin). */
const UNKNOWN_ELEMENT_ID = "element-unknown-42";
/** The web law text the unknown-element refusal must carry. */
const UNKNOWN_ELEMENT_REFUSAL_LAW = "not part of this station scene";
/** The web app's world route hash (the route the shell loads). */
const WORLD_ROUTE_HASH = "#/world";
/** The equivalence note (the parity fact's citation). */
const PARITY_NOTE = "feature-equivalent to web over the ONE committed station record";

/** The STEP 4 camera command (the orbit leg over the site frame, metres). */
const JOURNEY_CAMERA_COMMAND: StationCommand = {
  kind: "camera-operation",
  operation: "orbit-to",
  position: [2, -8, 3],
  target: [2, -2, 1.5],
};

/* ------------------------------------------------------------------ */
/* STEP 5 — the GPU parity leg (the REAL adapter, NullEngine, always    */
/* torn down before returning — the P0-C shutdown discipline)           */
/* ------------------------------------------------------------------ */

interface GpuLegOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

function runGpuParityLeg(
  record: StationRecord,
  camera: CameraState,
  ghost: GhostSetSummary | null,
): GpuLegOutcome {
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
  if (!runtimeOutcome.ok) {
    return { ok: false, detail: `the runtime refused: ${runtimeOutcome.failure.detail}` };
  }
  const runtime = runtimeOutcome.value;
  const load = runtime.loadScene(record.viewport.scene);
  if (!load.ok) {
    runtime.shutdown();
    return { ok: false, detail: `loadScene refused: ${load.failure.detail}` };
  }
  const handle = load.value;
  const failLeg = (detail: string): GpuLegOutcome => {
    runtime.dispose(handle);
    runtime.shutdown();
    return { ok: false, detail };
  };

  // The revision the adapter ingested is the record's revision.
  if (handle.sceneRevision !== record.viewport.scene.revision) {
    return failLeg(
      `scene revision mismatch: adapter ingested ${String(handle.sceneRevision)}, ` +
        `the record declares ${String(record.viewport.scene.revision)}`,
    );
  }
  // The record's initial camera round-trips byte-equal through the port.
  const cameraSet = runtime.setCamera(handle, camera);
  if (!cameraSet.ok) {
    return failLeg(`setCamera refused: ${cameraSet.failure.detail}`);
  }
  const cameraBack = runtime.getCamera(handle);
  if (!cameraBack.ok) {
    return failLeg(`getCamera refused: ${cameraBack.failure.detail}`);
  }
  if (JSON.stringify(cameraBack.value) !== JSON.stringify(camera)) {
    return failLeg("the camera round-trip is not byte-equal (JSON.stringify comparison)");
  }
  // The record's ghost set applies (proposed + removed, the P3 law).
  if (ghost === null) {
    return failLeg("the record's viewport scene carries no ghost summary");
  }
  const ghostSet = runtime.setGhostSet(
    handle,
    ghost.operationId,
    ghost.proposedElementIds,
    ghost.removedElementIds,
  );
  if (!ghostSet.ok) {
    return failLeg(`setGhostSet refused: ${ghostSet.failure.detail}`);
  }
  // The census: one real render pass, active meshes present, and the
  // renderer identity HONESTLY null on NullEngine (no GL device).
  const rendered = runtime.renderOnce(handle);
  if (!rendered.ok) {
    return failLeg(`renderOnce refused: ${rendered.failure.detail}`);
  }
  const stats = runtime.frameStats(handle);
  if (!stats.ok) {
    return failLeg(`frameStats refused: ${stats.failure.detail}`);
  }
  if (stats.value.activeMeshes < 1) {
    return failLeg(
      `the frameStats census failed: activeMeshes ${String(stats.value.activeMeshes)} < 1`,
    );
  }
  const renderer = runtime.rendererInfo();
  if (renderer !== null) {
    return failLeg(
      `NullEngine must report no renderer identity (got ${JSON.stringify(renderer)})`,
    );
  }
  const detail =
    `NullEngine over the record's viewport scene: loadScene ok (revision ${String(handle.sceneRevision)}), ` +
    "setCamera(record initialCamera) round-trips byte-equal, " +
    `setGhostSet ok (${String(ghost.proposedElementIds.length)} proposed, ` +
    `${String(ghost.removedElementIds.length)} removed), ` +
    `frameStats ${String(stats.value.activeMeshes)} active meshes >= 1, ` +
    "rendererInfo null (NullEngine honest)";
  runtime.dispose(handle);
  runtime.shutdown();
  return { ok: true, detail };
}

/* ------------------------------------------------------------------ */
/* The journey                                                          */
/* ------------------------------------------------------------------ */

/**
 * Run the desktop world journey. PURE + fail-closed: the same inputs
 * produce the canonical-identical result; any sub-step failure returns
 * ok:false with the step named (never a partial journey as complete).
 */
export function runDesktopWorldJourney(
  input: DesktopWorldJourneyInput,
): DesktopWorldJourneyResult {
  const record = DESKTOP_STATION_RECORD;
  const steps: DesktopWorldJourneyStep[] = [];
  const interactions: DesktopWorldInteraction[] = [];

  const fail = (step: string, detail: string): DesktopWorldJourneyResult => ({
    ok: false,
    steps: [...steps, { step, detail }],
    interactions,
    parityFacts: null,
    failure: { step, detail },
  });

  /* STEP 1 — SHELL-BOOT: the shell's own policy resolves the startup. */
  const parsed = parseShellArguments(input.shellArguments, input.env, {
    directoryExists: input.directoryExists,
  });
  if (parsed.kind === "invalid") {
    return fail("shell-boot", `the shell policy refused the startup: ${parsed.reason}`);
  }
  if (parsed.kind !== "deep-link") {
    return fail(
      "shell-boot",
      `expected the deep-link startup (aise://project/<projectId>), got kind ${parsed.kind}`,
    );
  }
  if (parsed.projectRef !== record.scopeLabel) {
    return fail(
      "shell-boot",
      `the deep link project ${parsed.projectRef} is not the station record's scope ${record.scopeLabel}`,
    );
  }
  const target = parsed.target;
  // The shell's load URL (the main entry's loadUrlOf composition,
  // mirrored pure): the dev/preview URL, or the directory's index.html.
  const loadUrl =
    target.kind === "url" ? target.url : `file://${target.path}/index.html`;
  steps.push({
    step: "shell-boot",
    detail:
      `aise://project/${parsed.projectRef} booted the shell policy: target.kind=${target.kind} ` +
      `(load url ${loadUrl})`,
  });

  /* STEP 2 — WORLD-OPEN: the deep link maps to the web app's world route. */
  const worldUrl = `${loadUrl}${WORLD_ROUTE_HASH}`;
  steps.push({
    step: "world-open",
    detail: `the deep link maps to the web app's world route hash: ${worldUrl}`,
  });

  /* STEP 3 — STATION-MOUNT: the census over the ONE committed record. */
  if (record.recordKind !== EXPECTED_RECORD_KIND) {
    return fail("station-mount", `unexpected record kind: ${record.recordKind}`);
  }
  if (stationId() !== EXPECTED_STATION_ID) {
    return fail(
      "station-mount",
      `the station identity drifted from the committed record: ${stationId()}`,
    );
  }
  const panelOrder = panelIds();
  if (
    panelOrder.length !== EXPECTED_PANEL_ORDER.length ||
    panelOrder.some((id, index) => id !== EXPECTED_PANEL_ORDER[index])
  ) {
    return fail(
      "station-mount",
      `the panel id order drifted from the web record: [${panelOrder.join(", ")}]`,
    );
  }
  const notPopulated = record.hud.panels.find(
    (panel) => panel.contentState !== "POPULATED",
  );
  if (notPopulated !== undefined) {
    return fail(
      "station-mount",
      `panel ${notPopulated.panelId} is ${notPopulated.contentState}, expected POPULATED`,
    );
  }
  if (elementCount() !== EXPECTED_ELEMENT_COUNT) {
    return fail(
      "station-mount",
      `the element census is ${String(elementCount())}, expected ${String(EXPECTED_ELEMENT_COUNT)}`,
    );
  }
  if (viewportBoxCount() !== EXPECTED_VIEWPORT_BOX_COUNT) {
    return fail(
      "station-mount",
      `the viewport box census is ${String(viewportBoxCount())}, expected ${String(EXPECTED_VIEWPORT_BOX_COUNT)}`,
    );
  }
  const ghostId = ghostElementId();
  if (ghostId === null) {
    return fail(
      "station-mount",
      "the viewport box table declares no ghost asset (station-box:ghost-*)",
    );
  }
  const ghostElement = record.elements.find((element) => element.elementId === ghostId);
  if (ghostElement === undefined) {
    return fail(
      "station-mount",
      `the ghost element ${ghostId} is not in the record's element index`,
    );
  }
  if (ghostElement.status !== "proposed-ghost" || !ghostElement.isGhost) {
    return fail(
      "station-mount",
      `the ghost element ${ghostId} is ${ghostElement.status}/isGhost=${String(ghostElement.isGhost)}, expected proposed-ghost`,
    );
  }
  const removedElement = record.elements.find(
    (element) => element.elementId === PROPOSED_REMOVED_ELEMENT_ID,
  );
  if (removedElement === undefined || removedElement.status !== "proposed-removed") {
    return fail(
      "station-mount",
      `the proposed-removed element ${PROPOSED_REMOVED_ELEMENT_ID} is missing or not proposed-removed`,
    );
  }
  const ghostFacts = ghostSummary();
  if (ghostFacts === null) {
    return fail("station-mount", "the record's viewport scene carries no ghost summary");
  }
  if (!ghostFacts.proposedElementIds.includes(ghostId)) {
    return fail(
      "station-mount",
      `the ghost summary does not propose the ghost element ${ghostId}`,
    );
  }
  if (!ghostFacts.removedElementIds.includes(PROPOSED_REMOVED_ELEMENT_ID)) {
    return fail(
      "station-mount",
      `the ghost summary does not remove the proposed-removed element ${PROPOSED_REMOVED_ELEMENT_ID}`,
    );
  }
  steps.push({
    step: "station-mount",
    detail:
      `station ${stationId()} (scope ${scopeLabel()}, committed ${committedAt()}) mounted from the ONE record (${WEB_STATION_RECORD_PATH}): ` +
      `${String(record.hud.panels.length)} panels all POPULATED, ` +
      `${String(elementCount())} elements, ${String(viewportBoxCount())} viewport boxes, ` +
      `ghost ${ghostId} present (proposed; the ghost set removes ${PROPOSED_REMOVED_ELEMENT_ID})`,
  });

  /* STEP 4 — TYPED-INTERACTIONS: the SAME browser-safe reducer the web
   * route runs (apps→apps), through the authoring-review sequence. */
  let state = initialStationViewState(record);
  const dispatch = (command: StationCommand): { ok: boolean; refusal: string | null } => {
    const reduced = reduceStationCommand(record, state, command);
    state = reduced.state;
    interactions.push({
      command: canonicalJson(command),
      ok: reduced.ok,
      refusal: reduced.refusal,
    });
    return { ok: reduced.ok, refusal: reduced.refusal };
  };

  // 4a — select the proposed-removed element.
  const selectRemoved = dispatch({
    kind: "select-element",
    elementId: PROPOSED_REMOVED_ELEMENT_ID,
  });
  if (!selectRemoved.ok) {
    return fail(
      "typed-interactions",
      `selecting the proposed-removed element refused: ${selectRemoved.refusal ?? "null"}`,
    );
  }
  if (!state.selectedElementIds.includes(PROPOSED_REMOVED_ELEMENT_ID)) {
    return fail(
      "typed-interactions",
      `the selection did not land on ${PROPOSED_REMOVED_ELEMENT_ID}`,
    );
  }
  // 4b — select the ghost element.
  const selectGhost = dispatch({ kind: "select-element", elementId: ghostId });
  if (!selectGhost.ok) {
    return fail(
      "typed-interactions",
      `selecting the ghost element refused: ${selectGhost.refusal ?? "null"}`,
    );
  }
  if (!state.selectedElementIds.includes(ghostId)) {
    return fail("typed-interactions", `the selection did not land on the ghost ${ghostId}`);
  }
  // 4c — the camera orbit-to leg.
  const cameraResult = dispatch(JOURNEY_CAMERA_COMMAND);
  if (!cameraResult.ok) {
    return fail(
      "typed-interactions",
      `the camera orbit-to refused: ${cameraResult.refusal ?? "null"}`,
    );
  }
  const expectedCamera = {
    position: [2, -8, 3],
    target: [2, -2, 1.5],
    up: record.initialCamera.up,
    fovRadians: record.initialCamera.fovRadians,
    mode: "orbit",
  };
  if (canonicalJson(state.camera) !== canonicalJson(expectedCamera)) {
    return fail(
      "typed-interactions",
      `the camera state after orbit-to drifted: ${canonicalJson(state.camera)}`,
    );
  }
  // 4d — toggle the capture layer off (the AND-semantics leg).
  const toggle = dispatch({ kind: "toggle-layer", layerId: CAPTURE_LAYER_ID, visible: false });
  if (!toggle.ok) {
    return fail(
      "typed-interactions",
      `toggling ${CAPTURE_LAYER_ID} off refused: ${toggle.refusal ?? "null"}`,
    );
  }
  const captureLayer = state.layerVisibility.find(
    (entry) => entry.layerId === CAPTURE_LAYER_ID,
  );
  if (captureLayer?.visible !== false) {
    return fail("typed-interactions", `the ${CAPTURE_LAYER_ID} layer did not turn off`);
  }
  const captureElement = record.elements.find((element) =>
    element.layerIds.includes(CAPTURE_LAYER_ID),
  );
  if (captureElement === undefined) {
    return fail(
      "typed-interactions",
      `no ${CAPTURE_LAYER_ID} element in the record's index (the AND-semantics leg has nothing to hide)`,
    );
  }
  if (isRecordElementVisible(record, state, captureElement)) {
    return fail(
      "typed-interactions",
      `the layer AND-semantics did not hide ${captureElement.elementId} after the toggle`,
    );
  }
  // 4e — the refusal drill (fail-closed; the state must NOT change).
  const stateBeforeDrill = canonicalJson(state);
  const drill = dispatch({ kind: "select-element", elementId: UNKNOWN_ELEMENT_ID });
  if (drill.ok) {
    return fail(
      "typed-interactions",
      `selecting the unknown element ${UNKNOWN_ELEMENT_ID} was NOT refused (fail-closed violation)`,
    );
  }
  if (drill.refusal === null || !drill.refusal.includes(UNKNOWN_ELEMENT_REFUSAL_LAW)) {
    return fail(
      "typed-interactions",
      `the refusal text drifted from the web law: ${drill.refusal ?? "null"}`,
    );
  }
  if (canonicalJson(state) !== stateBeforeDrill) {
    return fail(
      "typed-interactions",
      "the refusal drill changed the state (it must leave it unchanged)",
    );
  }
  steps.push({
    step: "typed-interactions",
    detail:
      "5 typed commands through the SAME browser-safe reducer the web route runs: " +
      `select ${PROPOSED_REMOVED_ELEMENT_ID} ok, select ghost ${ghostId} ok, ` +
      "camera orbit-to (2,-8,3)->(2,-2,1.5) ok, toggle capture-reality off ok " +
      `(the AND-semantics hides ${captureElement.elementId}), ` +
      `refusal drill ${UNKNOWN_ELEMENT_ID} refused ("${drill.refusal}") leaving the state unchanged`,
  });

  /* STEP 5 — GPU-PARITY: the REAL adapter over the record's viewport
   * scene, NullEngine (no GPU device in this lane — honestly recorded). */
  const gpu = runGpuParityLeg(record, initialCamera(), ghostFacts);
  if (!gpu.ok) {
    return fail("gpu-parity", gpu.detail);
  }
  steps.push({ step: "gpu-parity", detail: gpu.detail });

  /* STEP 6 — FEATURE-EQUIVALENCE: assemble + assert the parity facts. */
  if (stationId() !== EXPECTED_STATION_ID || scopeLabel() !== record.scopeLabel) {
    return fail("feature-equivalence", "the station identity/scope drifted mid-journey");
  }
  // The drill's refusal, read back from the interaction ledger (the
  // single recorded source — the typed-interactions step must have run).
  const drillEntry = interactions.find((entry) => entry.command.includes(UNKNOWN_ELEMENT_ID));
  if (drillEntry === undefined || drillEntry.refusal === null) {
    return fail(
      "feature-equivalence",
      "the unknown-element refusal was not recorded (the typed-interactions step must have run)",
    );
  }
  if (!drillEntry.refusal.includes(UNKNOWN_ELEMENT_REFUSAL_LAW)) {
    return fail(
      "feature-equivalence",
      `the recorded refusal lost the web law text: ${drillEntry.refusal}`,
    );
  }
  const parityFacts: DesktopWorldParityFacts = {
    stationId: stationId(),
    panelIdOrder: panelIds(),
    refusalSubstring: UNKNOWN_ELEMENT_REFUSAL_LAW,
    note: PARITY_NOTE,
  };
  steps.push({
    step: "feature-equivalence",
    detail:
      `parityFacts: station ${parityFacts.stationId} (the SAME id the web route renders), ` +
      `panel order [${parityFacts.panelIdOrder.join(", ")}] (the canonical 7), ` +
      `the drill refusal carries "${parityFacts.refusalSubstring}" (the web headless LAW 2 pin), ` +
      PARITY_NOTE,
  });

  return { ok: true, steps, interactions, parityFacts, failure: null };
}
