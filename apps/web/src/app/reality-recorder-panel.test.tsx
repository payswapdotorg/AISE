/**
 * PROD-016 — the reality-materialization seam's panel-level assertions
 * (the app's established static-render convention: renderToStaticMarkup
 * projections with hand-constructed fixtures — no network, no clock).
 *
 * Asserted here:
 *  1. `SiteTwinBody` (api mode, no snapshot) renders the recorder
 *     affordance through the new empty-state action slot — and the demo
 *     mode's empty state stays plain (no affordance, unchanged guidance);
 *  2. `SiteTwinBody` (api mode, WITH a snapshot) renders the
 *     "Record another version" affordance under the snapshot table;
 *  3. `RealityRecorderPanel` renders the composed-materialization form:
 *     the project + organization fields, the node row (closed-vocabulary
 *     selects), the evidence picker's loading state, the named-defects
 *     callout for an empty draft, and the disabled submit
 *     (data-submit-state reflects the honest not-allowed/draft-invalid
 *     state — never a fake ready);
 *  4. the panel's demo mode shows the demo notice (creation requires the
 *     live API) and a disabled submit.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteTwinBody } from "./surfaces/SiteTwin";
import { RealityRecorderPanel } from "./surfaces/RealityRecorder";
import type { EvidencePaneView, RealityPaneView } from "../shell";
import type { SiteTwinData } from "./surfaces/SiteTwin";

const PROJECT = "proj-riverside-refit";

function apiData(reality: RealityPaneView | null): SiteTwinData {
  return {
    mode: "api",
    projectId: PROJECT,
    workspace: null,
    reality,
    evidence: [],
  };
}

function realityView(): RealityPaneView {
  const source = { module: "reality" as const, recordId: "v002" };
  return {
    source,
    projectId: PROJECT,
    versionId: "v002",
    versionCreatedAt: { value: "2026-09-29T13:00:00Z", source },
    nodes: [
      {
        source,
        nodeId: "site-1",
        kind: "site",
        epistemicStatus: "OBSERVED",
        summary: { value: "name Riverside site", source },
        evidenceIds: [],
      },
    ],
  };
}

function demoData(): SiteTwinData {
  return {
    mode: "demo",
    projectId: PROJECT,
    workspace: null,
    reality: null,
    evidence: [] as readonly EvidencePaneView[],
  };
}

const RECORDER_ACTION = (
  <button type="button" className="button">
    Record the first snapshot
  </button>
);

describe("PROD-016 SiteTwinBody — the recorder affordance", () => {
  test("api mode with NO snapshot renders the affordance through the empty-state action slot", () => {
    const html = renderToStaticMarkup(
      <SiteTwinBody
        data={apiData(null)}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        recorderAction={RECORDER_ACTION}
      />,
    );
    expect(html).toContain("Record the first snapshot");
    expect(html).toContain("No reality snapshot recorded for this project");
    expect(html).toContain("composed materialization path");
  });

  test("api mode with NO snapshot and NO action keeps the honest empty state (the slot is optional)", () => {
    const html = renderToStaticMarkup(
      <SiteTwinBody
        data={apiData(null)}
        selectedNodeId={null}
        onSelectNode={() => undefined}
      />,
    );
    expect(html).toContain("No reality snapshot recorded for this project");
    // No action passed → no action slot rendered (the guidance text alone
    // names the path; the BUTTON is the affordance and stays absent).
    expect(html).not.toContain("state-action");
    expect(html).not.toContain(">Record the first snapshot</button>");
  });

  test("demo mode's empty state stays the plain recorded guidance (unchanged)", () => {
    const html = renderToStaticMarkup(
      <SiteTwinBody
        data={demoData()}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        recorderAction={null}
      />,
    );
    expect(html).toContain("No reality snapshot recorded for this project");
    expect(html).toContain("materialized from reconstructed evidence");
    expect(html).not.toContain("composed materialization path");
  });

  test("api mode WITH a snapshot renders the affordance under the snapshot table", () => {
    const html = renderToStaticMarkup(
      <SiteTwinBody
        data={apiData(realityView())}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        recorderAction={
          <button type="button" className="button">
            Record another version
          </button>
        }
      />,
    );
    expect(html).toContain("Record another version");
    expect(html).toContain("site-1");
  });
});

describe("PROD-016 RealityRecorderPanel — the composed-materialization form", () => {
  const noopFetch: (input: string, init?: RequestInit) => Promise<Response> = async () =>
    new Response("{}", { status: 200 });

  function renderPanel(mode: "demo" | "api"): string {
    return renderToStaticMarkup(
      <RealityRecorderPanel
        projectId={PROJECT}
        mode={mode}
        principalId="user-alice"
        fetchImpl={noopFetch}
        onRecorded={() => undefined}
      />,
    );
  }

  test("api mode renders the project + organization fields and the first node row", () => {
    const html = renderPanel("api");
    expect(html).toContain("Reality project id");
    expect(html).toContain("Organization id");
    expect(html).toContain("Node 1 id");
    expect(html).toContain("Node 1 kind");
    expect(html).toContain("Node 1 epistemic status");
    expect(html).toContain("Node 1 property lines");
    expect(html).toContain("Node 1 derivation note");
    expect(html).toContain("Add a node");
    expect(html).toContain("Add a relationship");
  });

  test("api mode renders the closed NodeKind vocabulary as select options", () => {
    const html = renderPanel("api");
    for (const kind of [
      "project",
      "site",
      "building",
      "storey",
      "space",
      "element",
      "opening",
      "system",
      "issue",
      "annotation",
    ]) {
      // The default option renders with a selected attribute — match the
      // opening of the option tag only.
      expect(html).toContain(`<option value="${kind}"`);
    }
    expect(html).not.toContain('<option value="spaceship"');
  });

  test("api mode renders the epistemic ladder as select options", () => {
    const html = renderPanel("api");
    for (const status of ["CONFIRMED", "OBSERVED", "INFERRED", "PROPOSED"]) {
      expect(html).toContain(`<option value="${status}"`);
    }
  });

  test("api mode renders the relationship vocabulary once a row is offered", () => {
    const html = renderPanel("api");
    expect(html).toContain("Add a relationship");
    // The relationship rows render on demand; the closed list is asserted
    // through the pure module's vocabulary pin (reality-recorder.test.ts).
  });

  test("the empty first node names its defects (missing id + missing provenance)", () => {
    const html = renderPanel("api");
    expect(html).toContain("The draft does not satisfy the recorded contract yet");
    expect(html).toContain("node id must be 1..256 characters");
    expect(html).toContain("missing provenance");
  });

  test("the submit control is disabled in api mode before the broker answers (never a fake ready)", () => {
    const html = renderPanel("api");
    expect(html).toContain('data-submit-state="not-allowed"');
    expect(html).not.toContain('data-submit-state="ready"');
  });

  test("the evidence register picker renders its loading state (no fabricated options)", () => {
    const html = renderPanel("api");
    expect(html).toContain("Loading the evidence register");
  });

  test("demo mode shows the demo notice and a disabled submit", () => {
    const html = renderPanel("demo");
    expect(html).toContain("Creation requires the live API");
    expect(html).toContain('data-submit-state="demo"');
  });

  test("the panel names the seam's purpose (first-time user crossing without developer tools)", () => {
    const html = renderPanel("api");
    expect(html).toContain("Record a reality snapshot");
    expect(html).toContain("governed change set");
  });
});
