/**
 * PROD-020 — the high-density review surface model tests: the dense
 * three-column composition over the semantic objects, the evidence
 * table's provenance rows, the keyboard focus order, density
 * discipline (density never changes WHAT is presented) and the
 * verbatim-value discipline (pane lines deep-equal the decoded bundle).
 */

import { describe, expect, test } from "bun:test";
import type { OperationResult } from "@aise/adapter-contract";
import { REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS } from "@aise/adapter-contract";
import { corpusTaskFlowBundle } from "./corpus-world";
import { negotiateDesktopTask } from "./profile";
import {
  DENSITY_PROFILES,
  denseReviewLayout,
  evidenceTableOf,
  nextFocusedPane,
  paneById,
  provenanceSpotCheck,
  type ReviewLayout,
} from "./review-layout";

function corpusLayout(options?: {
  readonly operationResult?: OperationResult;
  readonly density?: ReviewLayout["density"];
}): ReviewLayout {
  const decoded = corpusTaskFlowBundle();
  if (!decoded.ok) {
    throw new Error("corpus bundle must decode");
  }
  const negotiation = negotiateDesktopTask(
    decoded.value.requirements ?? REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  );
  return denseReviewLayout(decoded.value, {
    negotiation,
    operationResult: options?.operationResult,
    density: options?.density,
  });
}

describe("PROD-020 the high-density review workspace composition", () => {
  const layout = corpusLayout();

  test("the workspace composes the three-column dense arrangement in task-first reading order", () => {
    expect(layout.columns.map((column) => column.columnId)).toEqual([
      "column:context",
      "column:review",
      "column:action",
    ]);
    expect(layout.columns[0]?.paneIds).toEqual([
      "pane:project-context",
      "pane:reality",
      "pane:evidence",
    ]);
    expect(layout.columns[1]?.paneIds).toEqual([
      "pane:boq",
      "pane:engineering-case",
      "pane:intervention-scenario",
      "pane:outcome",
    ]);
    expect(layout.columns[2]?.paneIds).toEqual([
      "pane:next-best-action",
      "pane:authorization",
      "pane:negotiation",
      "pane:operation-result",
    ]);
  });

  test("every pane's lines render the decoded contract values VERBATIM", () => {
    const decoded = corpusTaskFlowBundle();
    if (!decoded.ok) {
      throw new Error("corpus bundle must decode");
    }
    const realityPane = paneById(layout, "pane:reality");
    expect(realityPane?.lines.find((line) => line.field === "readinessStatus")?.text).toBe(
      decoded.value.reality?.readinessStatus,
    );
    expect(realityPane?.lines.find((line) => line.field === "readinessDetail")?.text).toBe(
      decoded.value.reality?.readinessDetail,
    );
    const casePane = paneById(layout, "pane:engineering-case");
    expect(casePane?.lines.find((line) => line.field === "title")?.text).toBe(
      decoded.value.caseSummary?.title,
    );
  });

  test("absent records render honest empty states (never guesses)", () => {
    const empty = denseReviewLayout({
      context: null,
      reality: null,
      evidence: null,
      boq: null,
      caseSummary: null,
      scenario: null,
      outcome: null,
      nextBestAction: null,
      authorization: null,
      requirements: null,
    });
    expect(empty.emptyPanes).toEqual(empty.panes.map((pane) => pane.paneId));
    expect(empty.panes.every((pane) => pane.lines.length === 0)).toBe(true);
    expect(empty.panes.every((pane) => pane.emptyState !== null)).toBe(true);
    expect(empty.evidenceTable.rows).toEqual([]);
  });

  test("the operation-result pane renders the server-authoritative result when one is answered", () => {
    const withResult = corpusLayout({
      operationResult: {
        contractVersion: "1.0.0",
        operationId: "operation-3fa9",
        actionRef: "action-8ba1",
        status: "succeeded",
        resultRefs: ["mission-batch-9917", "evidence-f08d256a", "mission-step-42"],
        completedAt: "2026-01-15T12:40:00.000Z",
      },
    });
    const pane = paneById(withResult, "pane:operation-result");
    expect(pane?.emptyState).toBeNull();
    expect(pane?.lines.find((line) => line.field === "status")?.text).toBe("succeeded");
    expect(pane?.lines.find((line) => line.field === "resultRefs")?.text).toContain(
      "mission-batch-9917",
    );
    // Without an answered result, the pane is an honest empty state.
    expect(paneById(layout, "pane:operation-result")?.emptyState).toBe(
      "No operation result has been answered yet.",
    );
  });
});

describe("PROD-020 the dense evidence table (provenance surface)", () => {
  const layout = corpusLayout();

  test("one row per evidence content id — the provenance anchors", () => {
    const rows = layout.evidenceTable.rows.filter((row) => row.kind === "evidence-item");
    expect(rows.map((row) => row.ref)).toEqual([
      "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
      "60dbb33388e68f526c58a7b6595a72a33475bcb95f9706f0ceafe94e7488680b",
      "234de3783bf00bd0e2a1b21d1f16d6cafb10b629ed027e57c526712ec68e46cd",
    ]);
  });

  test("one row per DECLARED gap — MISSING and WEAK stay first-class rows", () => {
    const gaps = layout.evidenceTable.rows.filter((row) => row.kind === "evidence-gap");
    expect(gaps.map((row) => row.ref)).toEqual(["gap-4471", "gap-4472"]);
    expect(gaps.map((row) => row.gapKind)).toEqual(["MISSING", "WEAK"]);
    expect(gaps[0]?.detail).toContain("calibrated reference dimension");
    expect(gaps[1]?.detail).toContain("too low-angle");
  });

  test("evidenceTableOf(null) is the honest empty table", () => {
    expect(evidenceTableOf(null)).toEqual({ rows: [] });
  });
});

describe("PROD-020 keyboard focus order (the shortcut registry's target path)", () => {
  const layout = corpusLayout();

  test("the focus order is the pane order (deterministic tab path)", () => {
    expect(layout.focusOrder).toEqual(layout.panes.map((pane) => pane.paneId));
    expect(layout.focusOrder[0]).toBe("pane:project-context");
  });

  test("focus cycles from the last pane back to the first", () => {
    const last = layout.focusOrder[layout.focusOrder.length - 1];
    expect(last).toBeDefined();
    expect(nextFocusedPane(layout, last ?? null)).toBe("pane:project-context");
  });

  test("focus starts at the first pane from null and recovers from unknown panes", () => {
    expect(nextFocusedPane(layout, null)).toBe("pane:project-context");
    expect(nextFocusedPane(layout, "pane:not-a-pane" as never)).toBe("pane:project-context");
    expect(nextFocusedPane(layout, "pane:evidence")).toBe("pane:boq");
  });
});

describe("PROD-020 density discipline (density never changes WHAT is presented)", () => {
  const byDensity = new Map<ReviewLayout["density"], ReviewLayout>(
    DENSITY_PROFILES.map((density) => [density, corpusLayout({ density })]),
  );

  test("every density presents the same panes with the same lines (sizing hints only)", () => {
    const dense = byDensity.get("dense");
    const comfortable = byDensity.get("comfortable");
    const compact = byDensity.get("compact");
    expect(dense).toBeDefined();
    expect(comfortable).toBeDefined();
    expect(compact).toBeDefined();
    if (dense === undefined || comfortable === undefined || compact === undefined) {
      return;
    }
    expect(dense.panes).toEqual(comfortable.panes);
    expect(dense.panes).toEqual(compact.panes);
    expect(dense.evidenceTable).toEqual(comfortable.evidenceTable);
    expect(dense.focusOrder).toEqual(compact.focusOrder);
  });

  test("the layout records its density (the viewport hint)", () => {
    expect(byDensity.get("compact")?.density).toBe("compact");
    expect(byDensity.get("dense")?.density).toBe("dense");
  });
});

describe("PROD-020 provenance spot checks (visible at every density)", () => {
  test("BOQ source-of-record, scenario seal, outcome evidence and reality version are extractable", () => {
    for (const density of DENSITY_PROFILES) {
      const spot = provenanceSpotCheck(corpusLayout({ density }));
      expect(spot.boqSourceOfRecord).toBe("erp / ERP-BOQ-2026-0042");
      expect(spot.scenarioEpistemicState).toBe("PROPOSED");
      expect(spot.outcomePostWorkEvidence).toHaveLength(2);
      expect(spot.realityModelVersion).toBe(14);
    }
  });

  test("absent records yield honest nulls in the spot check", () => {
    const empty = denseReviewLayout({
      context: null,
      reality: null,
      evidence: null,
      boq: null,
      caseSummary: null,
      scenario: null,
      outcome: null,
      nextBestAction: null,
      authorization: null,
      requirements: null,
    });
    const spot = provenanceSpotCheck(empty);
    expect(spot.boqSourceOfRecord).toBeNull();
    expect(spot.scenarioEpistemicState).toBeNull();
    expect(spot.outcomePostWorkEvidence).toEqual([]);
    expect(spot.realityModelVersion).toBeNull();
  });
});
