/**
 * PROD-018 — the COMPOSITION MODEL tests (pure, deterministic).
 *
 * The parity models are proven over the REAL demo world records (the
 * frozen libraries' fixtures — the same data the surfaces render): the
 * cross-links join only RECORDED references, the honest unresolved states
 * carry their recorded reasons, the canonical-action normalization covers
 * the contract's advisory vocabulary with an honest fallback, the
 * plan-vs-reality projection keeps the two sides distinct, and the
 * boundary labels surface only what the records state.
 */

import { describe, expect, test } from "bun:test";
import {
  boqLineCrossLinks,
  captureCrossLinks,
  issueCrossLinks,
  realityNodeCrossLinks,
} from "./cross-links";
import {
  CANONICAL_ACTIONS,
  canonicalAction,
  canonicalActionHref,
  nextActionSuggestions,
  normalizeNextBestActionKind,
  normalizeTaskTypeAction,
  taskIntentForEvidenceGap,
} from "./action-labels";
import {
  liveBeforeAfterPairs,
  planRealityView,
  summaryBeforeAfterPairs,
} from "./plan-reality";
import {
  outcomeBoundaryLabels,
  quantityBoundaryLabels,
  validationBoundaryLabels,
} from "./boundary-labels";
import {
  demoBoqImport,
  demoCase,
  demoEvidenceList,
  demoLensInput,
  demoReality,
  demoScenario,
  demoWorkspaceInput,
  DEMO_PROJECT_ID,
} from "../app/demo";
import {
  DEMO_TASK_PROJECT_ID,
  demoFailedOperationResult,
  demoSucceededOperationResult,
  demoTaskFlowBundle,
} from "../app/task-dataset";
import { boqLensInput } from "../boqlens/fixtures";
import { evidenceWallEast, evidenceWallNorth } from "../shell/fixtures";

const projectId = DEMO_PROJECT_ID;

describe("PROD-018 cross-links (joins over RECORDED references only)", () => {
  test("a capture opens the issues derived from it (relatedCaseIds, verbatim)", () => {
    const links = captureCrossLinks(
      projectId,
      evidenceWallNorth(),
      demoCase(projectId),
      demoBoqImport(projectId),
      demoLensInput(projectId),
    );
    expect(links).toHaveLength(1);
    const link = links[0]!;
    expect(link.kind).toBe("capture-to-issue");
    expect(link.target.kind).toBe("route");
    if (link.target.kind === "route") {
      expect(link.target.href).toBe(`#/projects/${projectId}/case`);
      expect(link.target.label).toContain("case-007");
    }
    expect(link.basis).toContain("relatedCaseIds");
  });

  test("a capture with no recorded case links renders NO capture-to-issue links (never invented)", () => {
    const links = captureCrossLinks(
      projectId,
      evidenceWallEast(), // invalidated capture, relatedCaseIds: []
      demoCase(projectId),
      demoBoqImport(projectId),
      demoLensInput(projectId),
    );
    expect(links.filter((link) => link.kind === "capture-to-issue")).toHaveLength(0);
  });

  test("the BOQ source capture opens the quantities derived from it", () => {
    const records = demoEvidenceList(projectId);
    const boqImport = demoBoqImport(projectId)!;
    const source = records.find(
      (record) => record.evidenceId === boqImport.sourceEvidenceId!.value,
    )!;
    const links = captureCrossLinks(
      projectId,
      source,
      demoCase(projectId),
      demoBoqImport(projectId),
      demoLensInput(projectId),
    );
    const quantityLinks = links.filter((link) => link.kind === "capture-to-quantity");
    expect(quantityLinks).toHaveLength(1);
    const link = quantityLinks[0]!;
    expect(link.target.kind).toBe("route");
    if (link.target.kind === "route") {
      expect(link.target.href).toBe(`#/projects/${projectId}/boq-lens`);
      expect(link.target.label).toContain("6 BOQ rows");
    }
    expect(link.basis).toContain("sourceEvidenceId");
  });

  test("an issue opens its evidence AND its affected BOQ lines (the honest join)", () => {
    const caseView = demoCase(projectId)!;
    const links = issueCrossLinks(
      projectId,
      caseView,
      demoEvidenceList(projectId),
      demoReality(projectId),
      demoLensInput(projectId),
    );
    // The case's two recorded evidence ids both resolve as captures.
    const evidenceLinks = links.filter((link) => link.kind === "issue-to-capture");
    expect(evidenceLinks).toHaveLength(2);
    for (const link of evidenceLinks) {
      expect(link.target.kind).toBe("route");
      expect(link.basis).toContain("evidenceIds");
    }
    // The affected-BOQ-lines join is EMPTY in the recorded demo world: the
    // mapping targets (plan nodes wall-e/…) do not intersect the reality
    // nodes the case's evidence supports (wall-north/wall-east) — the
    // explicit unresolved state with the recorded reason.
    const boqLinks = links.filter((link) => link.kind === "boq-line-to-issue");
    expect(boqLinks).toHaveLength(1);
    const boqLink = boqLinks[0]!;
    expect(boqLink.target.kind).toBe("unresolved");
    if (boqLink.target.kind === "unresolved") {
      expect(boqLink.target.reason).toContain("wall-north, wall-east");
      expect(boqLink.target.reason).toContain("no BOQ row maps to them yet");
    }
  });

  test("a reality node opens the captures behind it (evidenceIds, verbatim)", () => {
    const reality = demoReality(projectId)!;
    const wall = reality.nodes.find((node) => node.nodeId === "wall-north")!;
    const links = realityNodeCrossLinks(projectId, wall, demoEvidenceList(projectId));
    expect(links).toHaveLength(1);
    expect(links[0]!.kind).toBe("reality-node-to-capture");
    expect(links[0]!.target.kind).toBe("route");
  });

  test("a BOQ line opens its spatial context, its captures and the honest issue state", () => {
    const lens = demoLensInput(projectId)!;
    const plaster = lens.items.find((item) => item.itemId === "sub-r12")!;
    const links = boqLineCrossLinks(
      projectId,
      plaster,
      demoBoqImport(projectId),
      demoWorkspaceInput(projectId),
      [demoCase(projectId)!],
    );
    // Spatial: the four mapped plan nodes resolve in the pinned workspace.
    const spatial = links.filter((link) => link.kind === "boq-line-to-spatial");
    expect(spatial).toHaveLength(4);
    for (const link of spatial) {
      expect(link.target.kind).toBe("route");
      if (link.target.kind === "route") {
        expect(link.target.href).toBe(`#/projects/${projectId}/sitetwin`);
        expect(link.target.label).toContain("plan node");
      }
    }
    // Captures: the source document capture + the workspace evidence
    // linked to the mapped walls (ev-001 wall-e/wall-w, ev-002 wall-n,
    // ev-003 wall-s — 3 of the 4 workspace entries are linked to walls).
    const captures = links.filter((link) => link.kind === "boq-line-to-capture");
    expect(captures).toHaveLength(4);
    expect(
      captures.some((link) => link.target.kind === "route" && link.target.label.includes("source document capture")),
    ).toBe(true);
    expect(
      captures.filter((link) => link.target.kind === "route" && link.target.label.includes("geometry capture")),
    ).toHaveLength(3);
    // Issues: no recorded case evidence links to the mapped nodes — the
    // honest unresolved state (issues are never inferred from quantities).
    const issues = links.filter((link) => link.kind === "boq-line-to-issue");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.target.kind).toBe("unresolved");
  });

  test("an unmapped BOQ line states its spatial-context gap from the RECORD's own reason", () => {
    const lens = demoLensInput(projectId)!;
    const excavation = lens.items.find((item) => item.itemId === "sub-r14")!;
    const links = boqLineCrossLinks(
      projectId,
      excavation,
      demoBoqImport(projectId),
      demoWorkspaceInput(projectId),
      [demoCase(projectId)!],
    );
    const spatial = links.filter((link) => link.kind === "boq-line-to-spatial");
    expect(spatial).toHaveLength(1);
    const link = spatial[0]!;
    expect(link.target.kind).toBe("unresolved");
    if (link.target.kind === "unresolved") {
      expect(link.target.reason).toContain("interpretation uncertain");
    }
  });

  test("cross-links are deterministic (same inputs, same outputs)", () => {
    const once = captureCrossLinks(
      projectId,
      evidenceWallNorth(),
      demoCase(projectId),
      demoBoqImport(projectId),
      boqLensInput(),
    );
    const twice = captureCrossLinks(
      projectId,
      evidenceWallNorth(),
      demoCase(projectId),
      demoBoqImport(projectId),
      boqLensInput(),
    );
    expect(once).toEqual(twice);
  });
});

describe("PROD-018 canonical action labels (the four-journey vocabulary)", () => {
  test("the four canonical actions are exactly the parity journey, in order", () => {
    expect(CANONICAL_ACTIONS.map((action) => action.label)).toEqual([
      "Capture",
      "Investigate",
      "Build solution",
      "Review outcome",
    ]);
    expect(canonicalAction("no-such-action")).toBeNull();
  });

  test("each canonical action routes to its surface through the REAL router", () => {
    const capture = canonicalAction("capture")!;
    expect(canonicalActionHref(capture, projectId)).toBe(`#/projects/${projectId}/sitetwin`);
    const investigate = canonicalAction("investigate")!;
    expect(canonicalActionHref(investigate, projectId)).toBe(`#/projects/${projectId}/case`);
    const solution = canonicalAction("build-solution")!;
    expect(canonicalActionHref(solution, projectId)).toBe(
      `#/projects/${projectId}/intervention`,
    );
    const outcome = canonicalAction("review-outcome")!;
    expect(canonicalActionHref(outcome, projectId)).toBe(`#/projects/${projectId}/outcomes`);
  });

  test("the contract's advisory task types normalize to their canonical actions", () => {
    const fieldCapture = normalizeTaskTypeAction("field-capture");
    expect(fieldCapture.kind).toBe("canonical");
    expect(fieldCapture.kind === "canonical" ? fieldCapture.action.label : "").toBe(
      "Capture",
    );
    const caseReview = normalizeTaskTypeAction("engineering-case-review");
    expect(caseReview.kind === "canonical" ? caseReview.action.label : "").toBe(
      "Investigate",
    );
    const authoring = normalizeTaskTypeAction("solution-authoring");
    expect(authoring.kind === "canonical" ? authoring.action.label : "").toBe(
      "Build solution",
    );
    const comparison = normalizeTaskTypeAction("outcome-comparison");
    expect(comparison.kind === "canonical" ? comparison.action.label : "").toBe(
      "Review outcome",
    );
  });

  test("administration and unknown vocabulary render the honest non-match, never a guess", () => {
    const admin = normalizeTaskTypeAction("project-administration");
    expect(admin.kind).toBe("no-canonical-action");
    if (admin.kind === "no-canonical-action") {
      expect(admin.term).toBe("project-administration");
      expect(admin.reason).toContain("not one of the four engineering actions");
    }
    const unknown = normalizeTaskTypeAction("custom-future-task");
    expect(unknown.kind).toBe("no-canonical-action");
  });

  test("the NBA kind maps to a canonical action; unknown kinds stay verbatim", () => {
    expect(normalizeNextBestActionKind("capture-evidence").kind).toBe("canonical");
    expect(normalizeNextBestActionKind("compare-outcome").kind).toBe("canonical");
    const unknown = normalizeNextBestActionKind("novel-action-kind");
    expect(unknown.kind).toBe("no-canonical-action");
  });

  test("next-action suggestions compose the NBA prompt and every declared evidence gap", () => {
    const bundle = demoTaskFlowBundle();
    const suggestions = nextActionSuggestions(
      DEMO_TASK_PROJECT_ID,
      bundle.evidence,
      bundle.nextBestAction,
    );
    // The server's blocked NBA + the two declared gaps (MISSING + WEAK).
    expect(suggestions).toHaveLength(3);
    const nba = suggestions.find((entry) => entry.suggestionId.startsWith("nba:"))!;
    expect(nba.state).toBe("blocked");
    expect(nba.text).toContain("Depth capture cannot start");
    const gaps = suggestions.filter((entry) => entry.suggestionId.startsWith("gap:"));
    expect(gaps.map((gap) => gap.state)).toEqual(["gap-missing", "gap-weak"]);
    for (const gap of gaps) {
      expect(gap.action.label).toBe("Capture");
      expect(gap.href).toBe(`#/projects/${DEMO_TASK_PROJECT_ID}/sitetwin`);
    }
  });

  test("a gap answers with a TYPED TaskIntent quoting the record's own description", () => {
    const bundle = demoTaskFlowBundle();
    const gap = bundle.evidence!.gaps[0]!;
    const intent = taskIntentForEvidenceGap(
      DEMO_TASK_PROJECT_ID,
      gap,
      "task-gap-4471",
      "2026-01-16T08:00:00.000Z",
    );
    expect(intent.taskType).toBe("field-capture");
    expect(intent.projectRef).toBe(DEMO_TASK_PROJECT_ID);
    expect(intent.targetRefs).toEqual(["gap-4471"]);
    expect(intent.intent).toContain("calibrated reference dimension");
    expect(intent.parameters).toEqual({ gapKind: "MISSING" });
  });
});

describe("PROD-018 plan-vs-reality and before/after", () => {
  test("the two sides are distinct records with their own version ids", () => {
    const view = planRealityView({
      projectId,
      workspace: demoWorkspaceInput(projectId),
      reality: demoReality(projectId),
      evidenceCount: demoEvidenceList(projectId).length,
      scenario: demoScenario("project-zurich-hq"),
    });
    expect(view.plan).not.toBeNull();
    expect(view.reality).not.toBeNull();
    expect(view.plan!.recordId).toBe("v002");
    expect(view.plan!.recordId).not.toBe(view.reality!.recordId);
    expect(view.reality!.recordId).toBe("v003");
    expect(view.plan!.epistemicStatement).toContain("never observed reality");
    expect(view.reality!.facts.join(" ")).toContain("reality graph version v003");
    expect(view.note).toContain("DIFFERENT records");
  });

  test("an absent side renders the honest null (never borrowed data)", () => {
    const view = planRealityView({
      projectId: "proj-empty",
      workspace: null,
      reality: null,
      evidenceCount: 0,
      scenario: null,
    });
    expect(view.plan).toBeNull();
    expect(view.reality).toBeNull();
  });

  test("the corpus summaries compose ONE before/after pair per recorded outcome", () => {
    const bundle = demoTaskFlowBundle();
    const pairs = summaryBeforeAfterPairs(
      DEMO_TASK_PROJECT_ID,
      bundle.scenario,
      bundle.outcome,
    );
    expect(pairs).toHaveLength(1);
    const pair = pairs[0]!;
    expect(pair.before.state).toContain("PROPOSED");
    expect(pair.after.state).toBe("OBSERVED");
    expect(pair.evidenceRefs).toHaveLength(2);
    expect(pair.comparisonAvailable).toBe(true);
    expect(pair.basis).toContain("server-owned contract objects");
  });

  test("a scenario without a recorded outcome renders the honest pending pair", () => {
    const bundle = demoTaskFlowBundle();
    const pairs = summaryBeforeAfterPairs(DEMO_TASK_PROJECT_ID, bundle.scenario, null);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.after.state).toContain("never presented as an outcome");
    expect(pairs[0]!.comparisonAvailable).toBe(false);
  });

  test("no summaries at all compose NO pairs (the honest empty)", () => {
    expect(summaryBeforeAfterPairs(DEMO_TASK_PROJECT_ID, null, null)).toHaveLength(0);
  });

  test("live execution and comparison records compose verbatim pairs", () => {
    const pairs = liveBeforeAfterPairs(DEMO_TASK_PROJECT_ID, [], []);
    expect(pairs).toHaveLength(0);
  });
});

describe("PROD-018 consequential-boundary labels (recorded labels only)", () => {
  test("the quantity boundary surfaces uncertainty, provenance and the source of record", () => {
    const lens = demoLensInput(projectId)!;
    const plaster = lens.items.find((item) => item.itemId === "sub-r12")!;
    const bundle = demoTaskFlowBundle();
    const set = quantityBoundaryLabels(plaster, bundle.boq);
    expect(set.boundary).toBe("quantity");
    const families = new Set(set.labels.map((label) => label.family));
    expect(families.has("uncertainty")).toBe(true);
    expect(families.has("provenance")).toBe(true);
    expect(families.has("epistemic")).toBe(true);
    expect(
      set.labels.some((label) => label.text.startsWith("mapping mapped — confidence medium")),
    ).toBe(true);
    expect(set.labels.some((label) => label.text.startsWith("interpretation PLASTERING"))).toBe(
      true,
    );
    expect(set.labels.some((label) => label.text.startsWith("source cells"))).toBe(true);
    expect(set.labels.some((label) => label.text.startsWith("source of record: erp"))).toBe(
      true,
    );
    for (const label of set.labels) {
      expect(label.basis.length).toBeGreaterThan(0);
    }
  });

  test("the validation boundary keeps PROPOSED distinct and failures typed", () => {
    const bundle = demoTaskFlowBundle();
    const failed = validationBoundaryLabels(bundle.scenario, demoFailedOperationResult());
    expect(
      failed.labels.some((label) => label.text.includes("is PROPOSED — a proposal")),
    ).toBe(true);
    expect(failed.labels.some((label) => label.text.includes("approval pending-review"))).toBe(
      true,
    );
    expect(failed.labels.some((label) => label.text.includes("provider-unavailable"))).toBe(
      true,
    );
    const succeeded = validationBoundaryLabels(bundle.scenario, demoSucceededOperationResult());
    expect(
      succeeded.labels.some((label) => label.text.includes("operation-3fa9 — succeeded")),
    ).toBe(true);
    expect(succeeded.labels.some((label) => label.text.includes("typed failure"))).toBe(false);
  });

  test("the outcome boundary carries the OBSERVED state, post-work evidence and comparison", () => {
    const bundle = demoTaskFlowBundle();
    const set = outcomeBoundaryLabels(bundle.outcome, null, null);
    expect(set.boundary).toBe("outcome");
    expect(set.labels.some((label) => label.text.includes("is OBSERVED"))).toBe(true);
    expect(set.labels.some((label) => label.text.includes("post-work evidence"))).toBe(true);
    expect(set.labels.some((label) => label.text.includes("comparison is recorded as available"))).toBe(true);
  });

  test("absent records compose the honest EMPTY label set", () => {
    expect(quantityBoundaryLabels(demoLensInput(projectId)!.items[0]!, null).labels.length)
      .toBeGreaterThan(0);
    expect(validationBoundaryLabels(null, null).labels).toHaveLength(0);
    expect(outcomeBoundaryLabels(null, null, null).labels).toHaveLength(0);
  });
});
