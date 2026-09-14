/**
 * AISE-021 workspace tests — rendering, synchronized selection (R5),
 * review display, measurement strip, purity and the no-authority
 * discipline. Fixtures are the hand-built structural storey (fixtures.ts —
 * apps/web cannot import backend sources; see the boundary note there).
 */

import { describe, expect, test } from "bun:test";
import * as workspace from "./index";
import {
  FIXTURE_VERSION_ID,
  deepFreeze,
  floorPlanDrawing,
  reviewState,
  reviewedWorkspaceInput,
  workspaceEvidence,
  workspaceInput,
} from "./fixtures";
import type { EvidenceEntry, WorkspaceInput } from "./model";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function render(input: WorkspaceInput): string {
  return workspace.renderWorkspace(input);
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

function selectionPanelOf(html: string): string {
  const start = html.indexOf(`<section class="selection-panel" id="selection-panel"`);
  if (start === -1) {
    throw new Error("selection panel not found");
  }
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

function countMatches(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function nodeIdsIn(fragment: string): string[] {
  return [...fragment.matchAll(/data-node-id="([^"]+)"/g)].map((match) => match[1] ?? "");
}

function evidenceIdsIn(fragment: string): string[] {
  return [...fragment.matchAll(/data-evidence-id="([^"]+)"/g)].map((match) => match[1] ?? "");
}

/* ------------------------------------------------------------------ */
/* Document rendering                                                  */
/* ------------------------------------------------------------------ */

describe("workspace document rendering", () => {
  test("renders a complete HTML document with the four synchronized panes", () => {
    const html = render(workspaceInput());
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">\n")).toBe(true);
    expect(html.endsWith("</body>\n</html>\n")).toBe(true);
    expect(html).toContain('<section class="pane" id="pane-2d"');
    expect(html).toContain('<section class="pane" id="pane-3d"');
    expect(html).toContain('<section class="pane" id="pane-evidence"');
    expect(html).toContain('<section class="pane" id="pane-measurements"');
    expect(html).toContain(`data-graph-version="${FIXTURE_VERSION_ID}"`);
  });

  test("two renders of the same input are byte-identical", () => {
    const input = reviewedWorkspaceInput();
    expect(render(input)).toBe(render(input));
    // A structurally-equal clone (fresh object identities) renders the same bytes.
    const clone: WorkspaceInput = JSON.parse(JSON.stringify(input)) as WorkspaceInput;
    expect(render(clone)).toBe(render(input));
  });

  test("2D pane contains the drawing SVG with data-node-id for every drawn element", () => {
    const pane = paneOf(render(workspaceInput()), "pane-2d");
    expect(pane).toContain("<svg");
    for (const nodeId of ["wall-e", "wall-n", "wall-s", "wall-w", "floor-1", "door-1", "window-1"]) {
      expect(pane).toContain(`data-node-id="${nodeId}"`);
    }
    expect(nodeIdsIn(pane).sort()).toEqual(
      ["door-1", "floor-1", "wall-e", "wall-n", "wall-s", "wall-w", "window-1"].sort(),
    );
  });

  test("3D pane wireframe carries the SAME stable node ids as the 2D pane", () => {
    const html = render(workspaceInput());
    const ids2d = nodeIdsIn(paneOf(html, "pane-2d")).sort();
    const ids3d = nodeIdsIn(paneOf(html, "pane-3d")).sort();
    expect(ids3d).toEqual(ids2d);
    expect(ids3d).toContain("wall-e");
    expect(paneOf(html, "pane-3d")).toContain("<polyline");
  });

  test("2D pane lists the drawing's omitted nodes with their stable reason codes", () => {
    const pane = paneOf(render(workspaceInput()), "pane-2d");
    expect(pane).toContain('data-omitted-node-id="ceiling-1"');
    expect(pane).toContain("overhead-not-projected-in-plan");
    expect(pane).toContain('data-omitted-node-id="column-1"');
    expect(pane).toContain("geometry-kind-not-projectable");
    expect(pane).toContain('data-omitted-node-id="railing-1"');
    expect(pane).toContain("geometry-unresolved");
    expect(pane).toContain('data-omitted-node-id="paint-1"');
    expect(pane).toContain("geometry-ref-absent");
  });

  test("3D pane lists the wireframe's own honest omissions (computed, stable codes)", () => {
    const pane = paneOf(render(workspaceInput()), "pane-3d");
    expect(pane).toContain('data-omitted-node-id="ceiling-1"');
    expect(pane).toContain("boundary-absent");
    expect(pane).toContain('data-omitted-node-id="column-1"');
    expect(pane).toContain("geometry-kind-not-projectable");
    expect(pane).toContain('data-omitted-node-id="paint-1"');
    expect(pane).toContain("geometry-ref-absent");
    expect(pane).toContain('data-omitted-node-id="railing-1"');
    expect(pane).toContain("geometry-unresolved");
  });

  test("3D pane documents that full 3D rendering is out of scope", () => {
    const pane = paneOf(render(workspaceInput()), "pane-3d");
    expect(pane).toContain("engineering wireframe");
    expect(pane).toContain("Full 3D rendering is out of scope");
  });

  test("evidence pane lists one row per entry×node link, each carrying data-node-id", () => {
    const pane = paneOf(render(workspaceInput()), "pane-evidence");
    expect(pane).toContain('data-evidence-id="ev-001" data-node-id="wall-e"');
    expect(pane).toContain('data-evidence-id="ev-001" data-node-id="wall-w"');
    expect(pane).toContain('data-evidence-id="ev-002" data-node-id="wall-n"');
    expect(pane).toContain('data-evidence-id="ev-003" data-node-id="wall-s"');
    expect(pane).toContain('data-evidence-id="ev-004" data-node-id="window-1"');
    expect(pane).toContain("plane-fit/lidar");
    expect(pane).toContain("manual-tape");
  });

  test("invalidated evidence renders an explicit INVALID marker", () => {
    const pane = paneOf(render(workspaceInput()), "pane-evidence");
    expect(pane).toContain('<li data-invalid="true" data-evidence-id="ev-003" data-node-id="wall-s"');
    expect(pane).toContain("INVALIDATED");
    expect(pane).toContain("superseded by lidar pass 2");
    // Valid evidence never carries the marker.
    expect(pane).not.toContain('data-invalid="true" data-evidence-id="ev-001"');
  });

  test("empty evidence renders an honest placeholder (never a guess)", () => {
    const pane = paneOf(render(workspaceInput({ evidence: [] as readonly EvidenceEntry[] })), "pane-evidence");
    expect(pane).toContain("No evidence records linked in this workspace input.");
  });

  test("measurement strip renders value + unit + propagated σ", () => {
    const pane = paneOf(render(workspaceInput()), "pane-measurements");
    expect(pane).toContain('data-dimension-id="dim:wall-e:wall-w"');
    expect(pane).toContain("4.2 m ±0.01 m");
  });

  test("null σ renders as σ unknown — never a fabricated ±0", () => {
    const html = render(workspaceInput());
    const pane = paneOf(html, "pane-measurements");
    expect(pane).toContain('data-dimension-id="dim:wall-n:wall-s"');
    expect(pane).toContain("3 m — σ unknown");
    // An unknown σ never renders with a ± at all, and no σ is ever fabricated as 0.
    expect(pane).not.toContain("3 m ±");
    expect(html).not.toContain("±0 m");
  });

  test("measurementText formats known and unknown σ deterministically", () => {
    const dimensions = floorPlanDrawing().dimensions;
    const known = dimensions.find((dimension) => dimension.uncertainty !== null);
    const unknownSigma = dimensions.find((dimension) => dimension.uncertainty === null);
    if (known === undefined || unknownSigma === undefined) {
      throw new Error("fixture must carry one known-σ and one unknown-σ dimension");
    }
    expect(workspace.measurementText(known)).toBe("4.2 m ±0.01 m");
    expect(workspace.measurementText(unknownSigma)).toBe("3 m — σ unknown");
  });
});

/* ------------------------------------------------------------------ */
/* Review banner (non-authoritative display)                          */
/* ------------------------------------------------------------------ */

describe("review banner (no browser-side authority)", () => {
  test("renders the server-provided review state VERBATIM", () => {
    const html = render(workspaceInput({ review: reviewState("approved") }));
    expect(html).toContain('<section class="review-banner" data-review-status="approved"');
    expect(html).toContain("eng-reviewer@example.org");
    expect(html).toContain("Geometry matches the field walk on 2026-01-18.");
    expect(html).toContain("2026-01-20T10:00:00.000Z");
    expect(html).toContain("Review — approved");
  });

  test("rejected status renders verbatim (the workspace never re-interprets it)", () => {
    const html = render(workspaceInput({ review: reviewState("rejected") }));
    expect(html).toContain('data-review-status="rejected"');
    expect(html).toContain("Review — rejected");
  });

  test("absent review state renders no banner at all", () => {
    const html = render(workspaceInput());
    // (The stylesheet mentions review-banner classes; only the banner ELEMENT is authority display.)
    expect(html).not.toContain('<section class="review-banner"');
    expect(html).not.toContain('data-review-status="');
    expect(html).not.toContain("Review — ");
  });

  test("the workspace module exports NO mutation/approval API (authority tripwire)", () => {
    const banned = Object.keys(workspace).filter((name) =>
      /set|update|mutate|assign|approve|reject|save|write|fetch|delete|patch|push|post/i.test(name),
    );
    expect(banned).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Selection (R5 synchronization, presentation-only)                   */
/* ------------------------------------------------------------------ */

describe("selection (R5 synchronization)", () => {
  test("without a selection, no pane element is highlighted", () => {
    const html = render(workspaceInput());
    expect(paneOf(html, "pane-2d")).not.toContain('data-selected="true"');
    expect(paneOf(html, "pane-3d")).not.toContain('data-selected="true"');
    expect(html).not.toContain('id="selection-panel"');
  });

  test("selected node is highlighted in EXACTLY both panes; other nodes unaffected", () => {
    const html = render(workspaceInput({ selectedNodeId: "wall-n" }));
    const pane2d = paneOf(html, "pane-2d");
    const pane3d = paneOf(html, "pane-3d");
    expect(countMatches(pane2d, 'data-selected="true"')).toBe(1);
    expect(countMatches(pane3d, 'data-selected="true"')).toBe(1);
    expect(pane2d).toContain('<polygon data-node-id="wall-n" data-selected="true"');
    expect(pane3d).toContain('<polyline data-node-id="wall-n" data-selected="true"');
    // Non-selected walls keep their plain attributes.
    expect(pane2d).toContain('<polygon data-node-id="wall-e" fill="none"');
    expect(pane3d).toContain('<polyline data-node-id="wall-e" fill="none"');
    // Evidence rows linked to the selection are highlighted too (synced view).
    expect(paneOf(html, "pane-evidence")).toContain('data-selected="true" data-evidence-id="ev-002"');
  });

  test("selection panel resolves the id across every view with properties + σs", () => {
    const panel = selectionPanelOf(render(reviewedWorkspaceInput("wall-n")));
    expect(panel).toContain('data-selected-node-id="wall-n"');
    expect(panel).toContain('data-resolved-views="2d,3d,evidence"');
    expect(panel).toContain("Resolved in views: 2d, 3d, evidence");
    expect(panel).toContain("Node kind: element");
    expect(panel).toContain("semantic.kind = wall (INFERRED)");
    expect(panel).toContain("height = 2.7 m (OBSERVED)");
    expect(panel).toContain("geometry geo-wall-n — σ 0.02 m");
    expect(panel).toContain("element wall-n — σ 0.02 m");
    expect(panel).toContain("dimension dim:wall-n:wall-s — σ unknown");
    expect(panel).toContain("floor_plan · element · wall-n");
    expect(panel).toContain("floor_plan · dimension · dim:wall-n:wall-s");
    expect(panel).toContain("wireframe · geo-wall-n · 6 points · closed");
    expect(panel).toContain("ev-002 · manual-tape");
  });

  test("changing the selection changes ONLY presentation — ids, measurements, evidence stay stable", () => {
    const htmlN = render(workspaceInput({ selectedNodeId: "wall-n" }));
    const htmlE = render(workspaceInput({ selectedNodeId: "wall-e" }));
    expect(htmlN).not.toBe(htmlE);
    // Stable node identities in both panes.
    expect(nodeIdsIn(paneOf(htmlN, "pane-2d")).sort()).toEqual(nodeIdsIn(paneOf(htmlE, "pane-2d")).sort());
    expect(nodeIdsIn(paneOf(htmlN, "pane-3d")).sort()).toEqual(nodeIdsIn(paneOf(htmlE, "pane-3d")).sort());
    // Measurement strip and evidence rows are untouched by selection.
    expect(paneOf(htmlN, "pane-measurements")).toBe(paneOf(htmlE, "pane-measurements"));
    expect(evidenceIdsIn(paneOf(htmlN, "pane-evidence")).sort()).toEqual(
      evidenceIdsIn(paneOf(htmlE, "pane-evidence")).sort(),
    );
    expect(nodeIdsIn(paneOf(htmlN, "pane-evidence")).sort()).toEqual(
      nodeIdsIn(paneOf(htmlE, "pane-evidence")).sort(),
    );
    // The selection itself moved.
    expect(selectionPanelOf(htmlN)).toContain('data-selected-node-id="wall-n"');
    expect(selectionPanelOf(htmlE)).toContain('data-selected-node-id="wall-e"');
  });

  test("selecting a node that resolves in no view is honest, not an error", () => {
    const html = render(workspaceInput({ selectedNodeId: "ghost-node" }));
    const panel = selectionPanelOf(html);
    expect(panel).toContain('data-selected-node-id="ghost-node"');
    expect(panel).toContain('data-resolved-views=""');
    expect(panel).toContain("Resolved in views: none");
    expect(panel).toContain("Node is not present in the graph snapshot of this version.");
  });
});

/* ------------------------------------------------------------------ */
/* Cross-view identity (the R5 acceptance test)                        */
/* ------------------------------------------------------------------ */

describe("cross-view identity (R5 acceptance)", () => {
  const input = workspaceInput();

  test("every wall id resolves EXACT 2D + 3D + evidence entries", () => {
    const expected: Record<string, { drawing: string[]; evidence: string[] }> = {
      "wall-e": { drawing: ["wall-e", "dim:wall-e:wall-w"], evidence: ["ev-001"] },
      "wall-w": { drawing: ["wall-w", "dim:wall-e:wall-w"], evidence: ["ev-001"] },
      "wall-n": { drawing: ["wall-n", "dim:wall-n:wall-s"], evidence: ["ev-002"] },
      "wall-s": { drawing: ["wall-s", "dim:wall-n:wall-s"], evidence: ["ev-003"] },
    };
    for (const [nodeId, expectation] of Object.entries(expected)) {
      const bundle = workspace.resolveSelection(nodeId, input);
      expect(bundle.drawingEntries.map((entry) => entry.elementId)).toEqual(expectation.drawing);
      expect(bundle.wireframeEntries.map((entry) => entry.nodeId)).toEqual([nodeId]);
      expect(bundle.evidenceEntries.map((entry) => entry.evidenceId)).toEqual(expectation.evidence);
      expect(bundle.resolvedIn).toEqual(["2d", "3d", "evidence"]);
    }
  });

  test("floor-1 resolves 2D + 3D with NO evidence — absence is data, not an error", () => {
    const bundle = workspace.resolveSelection("floor-1", input);
    expect(bundle.drawingEntries.map((entry) => entry.elementId)).toEqual(["floor-1"]);
    expect(bundle.wireframeEntries.map((entry) => entry.geometryId)).toEqual(["geo-floor-1"]);
    expect(bundle.evidenceEntries).toEqual([]);
    expect(bundle.resolvedIn).toEqual(["2d", "3d"]);
    expect(bundle.sigmas).toEqual([
      { source: "geometry", id: "geo-floor-1", sigma: 0.005 },
      { source: "element", id: "floor-1", sigma: 0.005 },
    ]);
  });

  test("openings resolve through their 2D point symbol AND their 3D polygon", () => {
    for (const nodeId of ["door-1", "window-1"]) {
      const bundle = workspace.resolveSelection(nodeId, input);
      expect(bundle.drawingEntries).toHaveLength(1);
      expect(bundle.drawingEntries[0]?.entryKind).toBe("element");
      expect(bundle.wireframeEntries).toHaveLength(1);
      expect(bundle.wireframeEntries[0]?.closed).toBe(true);
    }
    expect(workspace.resolveSelection("window-1", input).evidenceEntries.map((e) => e.evidenceId)).toEqual([
      "ev-004",
    ]);
    expect(workspace.resolveSelection("door-1", input).evidenceEntries).toEqual([]);
  });

  test("wall-s carries σ unknown at every source — null is never 0", () => {
    const bundle = workspace.resolveSelection("wall-s", input);
    expect(bundle.sigmas).toEqual([
      { source: "geometry", id: "geo-wall-s", sigma: null },
      { source: "element", id: "wall-s", sigma: null },
      { source: "dimension", id: "dim:wall-n:wall-s", sigma: null },
    ]);
    expect(JSON.stringify(bundle)).not.toContain('"sigma":0');
  });

  test("an unknown id resolves to empty lists everywhere (never throws)", () => {
    const bundle = workspace.resolveSelection("does-not-exist", input);
    expect(bundle.node).toBeUndefined();
    expect(bundle.drawingEntries).toEqual([]);
    expect(bundle.wireframeEntries).toEqual([]);
    expect(bundle.evidenceEntries).toEqual([]);
    expect(bundle.properties).toEqual([]);
    expect(bundle.sigmas).toEqual([]);
    expect(bundle.resolvedIn).toEqual([]);
  });

  test("an empty node id is a typed invalid_input rejection", () => {
    expect(() => workspace.resolveSelection("", input)).toThrow(workspace.WorkspaceError);
    try {
      workspace.resolveSelection("", input);
      expect.unreachable();
    } catch (error) {
      expect((error as workspace.WorkspaceError).code).toBe("invalid_input");
    }
  });

  test("locateNodeInDrawing mirrors the 2D lookup semantics (elements + dimensions)", () => {
    const drawing = floorPlanDrawing();
    expect(workspace.locateNodeInDrawing(drawing, "wall-e").map((e) => e.elementId)).toEqual([
      "wall-e",
      "dim:wall-e:wall-w",
    ]);
    expect(workspace.locateNodeInDrawing(drawing, "ceiling-1")).toEqual([]);
    const entry = workspace.locateNodeInDrawing(drawing, "wall-e")[0];
    expect(entry?.bounds2d).toEqual({ minX: 4.2, minY: -0.3, maxX: 4.5, maxY: 3.3 });
  });
});

/* ------------------------------------------------------------------ */
/* Purity, validation, version pinning                                 */
/* ------------------------------------------------------------------ */

describe("purity, validation and version pinning", () => {
  test("a deep-frozen input renders without throwing and without mutation", () => {
    const frozen = deepFreeze(reviewedWorkspaceInput());
    const before = JSON.stringify(frozen);
    expect(() => render(frozen)).not.toThrow();
    expect(() => workspace.resolveSelection("wall-n", frozen)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });

  test("malformed input is a typed invalid_input rejection", () => {
    const base = workspaceInput();
    const bad = [
      { ...base, drawing: undefined },
      { ...base, graphSnapshot: { ...base.graphSnapshot, versionId: "" } },
      { ...base, evidence: "not-an-array" },
      { ...base, drawing: { ...base.drawing, elements: "not-an-array" } },
    ] as unknown as readonly WorkspaceInput[];
    for (const input of bad) {
      let code = "";
      try {
        render(input);
      } catch (error) {
        code = (error as workspace.WorkspaceError).code;
      }
      expect(code).toBe("invalid_input");
    }
  });

  test("a drawing/snapshot version disagreement is surfaced, not silently synchronized", () => {
    const html = render(workspaceInput({ drawing: floorPlanDrawing("v001") }));
    expect(html).toContain('data-version-mismatch="true"');
    expect(html).toContain("Version mismatch");
    expect(html).toContain("<code>v001</code>");
    expect(html).toContain(`<code>${FIXTURE_VERSION_ID}</code>`);
  });

  test("matching versions render no mismatch warning", () => {
    expect(render(workspaceInput())).not.toContain("data-version-mismatch");
  });

  test("the evidence array is never reordered or filtered by rendering", () => {
    const evidence = workspaceEvidence();
    const pane = paneOf(render(workspaceInput({ evidence })), "pane-evidence");
    expect(evidenceIdsIn(pane)).toEqual(
      evidence.flatMap((entry) => entry.linkedNodeIds.map(() => entry.evidenceId)),
    );
  });
});
