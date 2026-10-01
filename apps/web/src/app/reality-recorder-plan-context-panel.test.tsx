/**
 * ANCHOR-003a — the plan-context seam's panel-level assertions (the
 * app's established static-render convention: renderToStaticMarkup
 * projections with hand-constructed fixtures — no network, no clock;
 * effects do not run in static renders, so the honest INITIAL states
 * are what these projections assert).
 *
 * Asserted here:
 *  1. `PlanContextPanel` (api mode, select-only — the Studio's mount)
 *     renders the readable surface: the active-plan-context read-back
 *     slot, the register list's loading state, the declaration fields,
 *     the HANDEDNESS LAW note naming the closed literals and the
 *     contract id, the select-first named defect, and the disabled
 *     submit (never a fake ready);
 *  2. `PlanContextPanel` (api mode, WITH the import lane — the recorder
 *     surface's mount) renders the import card: the image-only file
 *     input (accept="image/*"), the named pre-upload gate note, and the
 *     upload control's honest waiting state;
 *  3. `PlanContextPanel` (demo mode) shows the demo notice and a
 *     disabled submit (the shell never fabricates writes or evidence);
 *  4. `RealityRecorderPanel` composes the plan-context surface FIRST,
 *     then the snapshot recorder (one surface, one discipline);
 *  5. `StudioBody` mounts the plan-context panel (list/select only —
 *     importing stays the reality recorder surface's lane).
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanContextPanel, RealityRecorderPanel } from "./surfaces/RealityRecorder";
import { StudioBody, type InterventionData } from "./surfaces/InterventionStudio";

const PROJECT = "proj-riverside-refit";

const noopFetch: (input: string, init?: RequestInit) => Promise<Response> = async () =>
  new Response("{}", { status: 200 });

function renderPanel(mode: "demo" | "api", withImport: boolean): string {
  return renderToStaticMarkup(
    <PlanContextPanel
      projectId={PROJECT}
      mode={mode}
      principalId="user-alice"
      fetchImpl={noopFetch}
      onRecorded={() => undefined}
      withImport={withImport}
    />,
  );
}

describe("ANCHOR-003a PlanContextPanel — the readable surface (api mode, select-only mount)", () => {
  test("renders the card, the active read-back slot and the register list's loading state", () => {
    const html = renderPanel("api", false);
    expect(html).toContain("Plan context — list &amp; activate");
    expect(html).toContain("The active plan context (read back from the reality graph)");
    expect(html).toContain("Reading the project&#x27;s latest version…");
    expect(html).toContain("Loading the evidence register…");
  });

  test("names the HANDEDNESS LAW with the closed literals and the contract id", () => {
    const html = renderPanel("api", false);
    expect(html).toContain("rasterToScene HANDEDNESS LAW");
    expect(html).toContain("east-right");
    expect(html).toContain("north-up");
    expect(html).toContain("anchor002-anchoring-contract/1");
  });

  test("renders the declaration fields (plan id, org, scale, world origin pair)", () => {
    const html = renderPanel("api", false);
    expect(html).toContain("Plan id");
    expect(html).toContain("Organization id");
    expect(html).toContain("Raster scale — pixels per meter");
    expect(html).toContain("World origin x (pixels)");
    expect(html).toContain("World origin y (pixels)");
  });

  test("names the select-first defect and keeps the submit disabled before the broker answers", () => {
    const html = renderPanel("api", false);
    expect(html).toContain("The draft does not satisfy the recorded contract yet");
    expect(html).toContain("select an imported plan raster first");
    expect(html).toContain('data-submit-state="not-allowed"');
    expect(html).not.toContain('data-submit-state="ready"');
  });

  test("the select-only mount carries NO import lane (importing stays the recorder surface's lane)", () => {
    const html = renderPanel("api", false);
    expect(html).not.toContain("Import a plan image");
    expect(html).not.toContain('id="plan-image-file"');
  });

  test("the active slot renders its honest loading state first (the read-back is never fabricated)", () => {
    const html = renderPanel("api", false);
    expect(html).toContain('data-plan-active-state="loading"');
    // The none/ready projections are the effect-resolved states — the pure
    // module's activePlanContextOfVersion tests pin their semantics
    // (null version and node-less version → the honest empty active).
    expect(html).not.toContain('data-plan-active-state="ready"');
    expect(html).not.toContain('data-plan-active-state="none"');
  });
});

describe("ANCHOR-003a PlanContextPanel — the import lane (api mode, the recorder surface's mount)", () => {
  test("renders the import card with the image-only file input and the named pre-upload gate", () => {
    const html = renderPanel("api", true);
    expect(html).toContain("Import a plan image");
    expect(html).toContain('id="plan-image-file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain("The gate refuses non-image content BY NAME before any upload happens");
    expect(html).toContain("zero side effects on refusal");
  });

  test("the upload control renders its honest waiting state (no file selected — never a fake ready)", () => {
    const html = renderPanel("api", true);
    expect(html).toContain('data-plan-upload-state="waiting"');
    expect(html).toContain("Upload to the content-addressed store");
  });

  test("names the EXISTING path (never a new storage seam) and the DOCUMENT_REGION registration", () => {
    const html = renderPanel("api", true);
    expect(html).toContain("the PROD-016/016b path, reused");
    expect(html).toContain("never a new storage seam");
    expect(html).toContain("DOCUMENT_REGION");
  });

  test("the list/select card renders below the import card (the flow ends at the declared record)", () => {
    const html = renderPanel("api", true);
    expect(html.indexOf("Import a plan image")).toBeLessThan(
      html.indexOf("Plan context — list &amp; activate"),
    );
  });
});

describe("ANCHOR-003a PlanContextPanel — demo mode (the shell never fabricates)", () => {
  test("shows the demo notice and a disabled submit", () => {
    const html = renderPanel("demo", false);
    expect(html).toContain("Creation requires the live API");
    expect(html).toContain('data-submit-state="demo"');
  });

  test("the import lane's demo notice states the never-fabricate discipline", () => {
    const html = renderPanel("demo", true);
    expect(html).toContain("Importing requires the live API");
    expect(html).toContain("never fabricates writes or evidence");
  });
});

describe("ANCHOR-003a RealityRecorderPanel — the composed recorder surface", () => {
  test("the plan-context surface renders FIRST, then the snapshot recorder (one surface, one discipline)", () => {
    const html = renderToStaticMarkup(
      <RealityRecorderPanel
        projectId={PROJECT}
        mode="api"
        principalId="user-alice"
        fetchImpl={noopFetch}
        onRecorded={() => undefined}
      />,
    );
    expect(html).toContain("Import a plan image");
    expect(html).toContain("Plan context — list &amp; activate");
    expect(html).toContain("Record a reality snapshot");
    expect(html.indexOf("Import a plan image")).toBeLessThan(html.indexOf("Record a reality snapshot"));
  });
});

describe("ANCHOR-003a StudioBody — the Studio's list/select mount", () => {
  function demoStudioData(): InterventionData {
    return {
      mode: "demo",
      projectId: PROJECT,
      scenario: null,
      scenarioSummaries: [],
      unknownScenario: null,
      geometries: [],
      executions: [],
      comparisons: [],
    };
  }

  test("mounts the plan-context panel (list/select only — no import lane)", () => {
    const html = renderToStaticMarkup(
      <StudioBody
        data={demoStudioData()}
        layer={0}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        onReload={() => undefined}
      />,
    );
    expect(html).toContain("Plan context — list &amp; activate");
    expect(html).not.toContain("Import a plan image");
  });
});
