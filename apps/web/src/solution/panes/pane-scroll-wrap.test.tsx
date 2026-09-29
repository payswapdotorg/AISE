/**
 * POST-011 (2026-09-29): the solution surfaces' wide tables must scroll
 * inside a focusable wrap — never stretch the page.
 *
 * The mobile real-user walk on production found the Interactive Solution
 * surface at 427px on a 390px viewport: the BOQ/quantities tables (the
 * solution mount's own panes) and the composition surface's line-trace
 * table have intrinsic widths wider than the viewport and had NO scroll
 * wrapper — the POST-009 `.table-wrap` pattern only covered the shell's
 * `.data` tables. These tests pin the three wraps (failing-first: each
 * assertion fails on the pre-fix markup).
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  deriveSolutionBoqLineTraceId,
  type SolutionBoqTraceSet,
} from "../../../../../packages/solution-contract/src/index";
import { openWorkspace } from "../operations";
import type { SolutionBoqSyncInput } from "../boq";
import { DEMO_SOLUTION_WORLD } from "../fixtures";
import type { QuantityRow } from "../model";
import { BoqPane } from "./BoqPane";
import { QuantitiesPane } from "./QuantitiesPane";
import { SolutionBoqTracePanel } from "../../app/solution-composition";
import type { JourneyBoqEcho } from "../../app/solution-journey";
import { SOLUTION_WORKSPACE_CSS } from "../styles";

function demoState() {
  return openWorkspace({
    projectId: DEMO_SOLUTION_WORLD.projectId,
    caseId: DEMO_SOLUTION_WORLD.caseId,
    solutionId: DEMO_SOLUTION_WORLD.solutionId,
    title: DEMO_SOLUTION_WORLD.title,
    problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
    baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    createdAt: "2026-09-16T08:00:00.000Z",
    materializedAt: "2026-09-16T10:00:00.000Z",
  });
}

/** A guarded BOQ input pinned to a DIFFERENT version → the honest pinned
 * history state (the table still renders, with the pin notice above). */
function pinnedElsewhereBoqInput(): SolutionBoqSyncInput {
  const solutionId = DEMO_SOLUTION_WORLD.solutionId;
  const line = (boqLineId: string, index: number) => ({
    contractVersion: "1.0.0",
    boqLineId,
    traceId: deriveSolutionBoqLineTraceId({ solutionId, versionNumber: 2, boqLineId }),
    solutionId,
    versionNumber: 2,
    validationSnapshotRef:
      "9b2f4a3a2b6a6cb4035db3e7a4b64229fe84b56c5fffb65a60947847adb3e2f3",
    itemDescription: `Plaster application to affected surfaces — cement-plaster, measured by volume [m3] (line ${index})`,
    contributingOperations: [
      {
        operationId: "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea",
        operationIndex: index,
        contributionKind: "created" as const,
      },
    ],
    quantity: {
      dimension: "volume" as const,
      value: 0.375,
      unit: "m3",
      calculationRef: "aise-solution-engine/quantity/test-fixture",
    },
    geometryRefs: [{ kind: "polygon" as const, ref: "geo-wall-faces-002" }],
  });
  const traceSet: SolutionBoqTraceSet = {
    contractVersion: "1.0.0",
    solutionId,
    versionNumber: 2,
    validationSnapshotRef: "9b2f4a3a2b6a6cb4035db3e7a4b64229fe84b56c5fffb65a60947847adb3e2f3",
    lineTraces: [line("boq-line-demo-0001", 1), line("boq-line-demo-0002", 2)],
  };
  return { kind: "trace-set", traceSet };
}

const QUANTITY_ROWS: readonly QuantityRow[] = [
  {
    step: 1,
    operationId: "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea",
    operationType: "plaster-application",
    direction: "added",
    value: 0.375,
    unit: "m3",
    calculationRef: "aise-solution-engine/quantity/test-fixture",
  },
];

describe("POST-011 pane table scroll wraps (the 2026-09-29 mobile-overflow finding)", () => {
  test("BoqPane renders the BOQ table inside a focusable .pane-table-wrap", () => {
    const markup = renderToStaticMarkup(
      <BoqPane state={demoState()} boq={pinnedElsewhereBoqInput()} onSelectLine={() => {}} />,
    );
    // The wrap precedes the table and carries the POST-010 keyboard-scroll
    // affordance (scrollable regions must be focusable).
    const wrapIndex = markup.indexOf('class="pane-table-wrap" tabindex="0"');
    const tableIndex = markup.indexOf('class="boq-table"');
    expect(wrapIndex).toBeGreaterThanOrEqual(0);
    expect(tableIndex).toBeGreaterThan(wrapIndex);
  });

  test("QuantitiesPane renders the quantities table inside a focusable .pane-table-wrap", () => {
    const markup = renderToStaticMarkup(<QuantitiesPane rows={QUANTITY_ROWS} inventory={undefined} />);
    const wrapIndex = markup.indexOf('class="pane-table-wrap" tabindex="0"');
    const tableIndex = markup.indexOf('class="quantities-table"');
    expect(wrapIndex).toBeGreaterThanOrEqual(0);
    expect(tableIndex).toBeGreaterThan(wrapIndex);
  });

  test("SolutionBoqTracePanel renders the line-trace table inside the shell's focusable .table-wrap", () => {
    const line = (boqLineId: string, index: number) => ({
      boqLineId,
      traceId: `trace-${boqLineId}`,
      itemDescription: `Block wall construction — concrete-block, measured by area [m2] (line ${index})`,
      sectionId: "section-2",
      buildingElement: "wall",
      quantity: { dimension: "area", value: 5, unit: "m2", calculationRef: "ref" },
      direction: "added",
      contributingSteps: [
        {
          operationId: "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea",
          operationIndex: 1,
          contributionKind: "created",
          resultingStateRef: "state-post011",
        },
      ],
      geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
      assumptionRefs: [],
    });
    const boq: JourneyBoqEcho = {
      boqId: "boq-post011",
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      versionNumber: 1,
      validationSnapshotRef:
        "9b2f4a3a2b6a6cb4035db3e7a4b64229fe84b56c5fffb65a60947847adb3e2f3",
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
      lineCount: 1,
      lines: [line("boq-line-post011-0001", 1)],
      totals: [],
      assumptions: [],
      verification: { ok: true, summary: "7 checks passed" },
    };
    const markup = renderToStaticMarkup(
      <SolutionBoqTracePanel
        projectId={DEMO_SOLUTION_WORLD.projectId}
        boq={boq}
        selectedLineId={undefined}
        addressedStep={undefined}
      />,
    );
    const wrapIndex = markup.indexOf('class="table-wrap" tabindex="0"');
    const tableIndex = markup.indexOf('data-boq-id="boq-post011"');
    expect(wrapIndex).toBeGreaterThanOrEqual(0);
    expect(tableIndex).toBeGreaterThan(wrapIndex);
  });

  test("the solution styles allow panes to shrink and wide tables to scroll", () => {
    // The 2026-09-29 root cause: .solution-pane is a grid item of
    // .solution-columns with default min-width:auto — the tables' intrinsic
    // width forced the whole page wide (427px on a 390px viewport).
    expect(SOLUTION_WORKSPACE_CSS).toContain(".solution-pane{");
    const paneRule =
      SOLUTION_WORKSPACE_CSS.split("}").find((rule) => rule.includes(".solution-pane{")) ?? "";
    expect(paneRule).toContain("min-width:0");
    expect(SOLUTION_WORKSPACE_CSS).toContain(".pane-table-wrap{overflow-x:auto}");
  });
});
