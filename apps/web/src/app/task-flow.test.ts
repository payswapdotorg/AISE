/**
 * PROD-017 — the task-first JOURNEY MODEL tests: the golden journey's
 * steps, record summaries, NBA/authorization/negotiation projections and
 * the platform-blocked state — over the committed demo task dataset (the
 * PROD-016 corpus world). Pure functions; deterministic.
 */

import { describe, expect, test } from "bun:test";
import {
  GOLDEN_JOURNEY_STEPS,
  journeyStepHref,
  journeyStepRoute,
  negotiationView,
  nextBestActionView,
  operationResultView,
  taskFlowView,
} from "./task-flow";
import { DEMO_TASK_PROJECT_ID, demoFailedOperationResult, demoTaskFlowBundle, demoActionableNextBestAction, demoSucceededOperationResult } from "./task-dataset";
import { parseHash } from "./router";
import { negotiateBrowserTask } from "./adapter-profile";
import { REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS } from "@aise/adapter-contract";

const bundle = demoTaskFlowBundle();
const view = taskFlowView(bundle, DEMO_TASK_PROJECT_ID);

describe("PROD-017 the golden journey steps", () => {
  test("the journey is task-first ordered and frozen", () => {
    expect(GOLDEN_JOURNEY_STEPS.map((step) => step.step)).toEqual([
      "open-project",
      "inspect-evidence",
      "diagnose-case",
      "inspect-boq",
      "review-intervention",
      "observe-outcome",
    ]);
  });

  test("every step routes through the REAL router (no second navigation model)", () => {
    for (const step of GOLDEN_JOURNEY_STEPS) {
      const route = journeyStepRoute(step, "proj-x");
      const parsed = parseHash(journeyStepHref(step, "proj-x"));
      expect(parsed).toEqual(route);
    }
    expect(journeyStepHref(GOLDEN_JOURNEY_STEPS[0]!, "proj-x")).toBe("#/projects");
    expect(journeyStepHref(GOLDEN_JOURNEY_STEPS[1]!, "proj-x")).toBe("#/projects/proj-x/sitetwin");
    expect(journeyStepHref(GOLDEN_JOURNEY_STEPS[2]!, "proj-x")).toBe("#/projects/proj-x/case");
    expect(journeyStepHref(GOLDEN_JOURNEY_STEPS[3]!, "proj-x")).toBe("#/projects/proj-x/boq-lens");
    expect(journeyStepHref(GOLDEN_JOURNEY_STEPS[4]!, "proj-x")).toBe(
      "#/projects/proj-x/intervention",
    );
  });

  test("each step's record summary is an honest join of verbatim fields", () => {
    const byStep = new Map(view.steps.map((step) => [step.step, step]));
    expect(byStep.get("inspect-evidence")?.record).toEqual({
      kind: "present",
      summary: "3 evidence items · 2 declared gaps",
    });
    expect(byStep.get("diagnose-case")?.record.summary).toBe("under-review · 7 observations");
    expect(byStep.get("inspect-boq")?.record.summary).toBe(
      "revision 2 · 1284 line items · source of record: erp ERP-BOQ-2026-0042",
    );
    expect(byStep.get("review-intervention")?.record.summary).toBe(
      "v3 · PROPOSED · approval pending-review",
    );
    expect(byStep.get("observe-outcome")?.record.summary).toBe(
      "OBSERVED · 2 post-work evidence items",
    );
  });

  test("absent records render the honest empty state (never a guess)", () => {
    const empty = taskFlowView(
      { ...bundle, boq: null, outcome: null },
      DEMO_TASK_PROJECT_ID,
    );
    const byStep = new Map(empty.steps.map((step) => [step.step, step]));
    expect(byStep.get("inspect-boq")?.record.kind).toBe("absent");
    expect(byStep.get("inspect-boq")?.record.summary).toBe("no record for this project yet");
    expect(byStep.get("observe-outcome")?.record.kind).toBe("absent");
  });
});

describe("PROD-017 the next-best-action projection (verbatim)", () => {
  test("the blocked NBA carries its prompt and BOTH typed blockers verbatim", () => {
    const action = view.nextBestAction;
    expect(action).not.toBeNull();
    expect(action?.status).toBe("blocked");
    expect(action?.prompt).toContain("Depth capture cannot start");
    expect(action?.blockers.map((blocker) => blocker.reasonCode)).toEqual([
      "capability-blocked",
      "authorization-denied",
    ]);
    expect(action?.blockers[0]?.detail).toContain("required any of [depth]");
    expect(action?.blockers[1]?.detail).toContain("missing-permission");
  });

  test("the actionable exemplar carries an empty blocker list", () => {
    const actionable = nextBestActionView(demoActionableNextBestAction());
    expect(actionable.status).toBe("actionable");
    expect(actionable.blockers).toEqual([]);
    expect(actionable.prompt).toContain("reference scale bar");
  });
});

describe("PROD-017 the authorization projection (W-R1 — denials verbatim)", () => {
  test("grants and every typed denial surface", () => {
    const authorization = view.authorization;
    expect(authorization?.subjectRef).toBe("principal-field-12");
    expect(authorization?.grantedActions).toHaveLength(5);
    expect(authorization?.denials.map((denial) => denial.action)).toEqual([
      "reality:write",
      "settings:tenant-admin",
    ]);
    expect(authorization?.denials[0]?.reasonCode).toBe("missing-permission");
    expect(authorization?.denials[0]?.reasonDetail).toContain("project engineer");
  });
});

describe("PROD-017 the negotiation projection (platform honesty)", () => {
  test("the browser is BLOCKED for the depth-capture task and the reason is verbatim", () => {
    const negotiation = negotiateBrowserTask(REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS);
    expect(negotiation.outcome).toBe("blocked");
    expect(negotiation.permittedInteractionModes).toEqual([]);
    const projected = negotiationView(negotiation, "field-capture");
    expect(projected.outcome).toBe("blocked");
    const camera = projected.domainOutcomes.find((domain) => domain.domain === "camera");
    expect(camera?.outcome).toBe("unsupported");
    expect(camera?.blocking).toBe(true);
    expect(camera?.reason).toContain("camera requirement unmet");
    expect(view.taskBlockedOnThisPlatform).toBe(true);
  });

  test("the view exposes the negotiation OBJECT for the verbatim audit card", () => {
    expect(view.negotiationObject?.outcome).toBe("blocked");
    expect(view.negotiationObject?.adapterKind).toBe("browser");
  });
});

describe("PROD-017 the operation-result projection (the terminal step)", () => {
  test("the failed result carries its typed failure verbatim", () => {
    const failed = operationResultView(demoFailedOperationResult());
    expect(failed.status).toBe("failed");
    expect(failed.failure?.code).toBe("provider-unavailable");
    expect(failed.failure?.detail).toContain("preserved");
    expect(failed.resultRefs).toEqual([]);
  });

  test("the succeeded result carries its result refs verbatim", () => {
    const succeeded = operationResultView(demoSucceededOperationResult());
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.failure).toBe(null);
    expect(succeeded.resultRefs).toEqual([
      "mission-batch-9917",
      "evidence-f08d256a",
      "mission-step-42",
    ]);
  });
});

describe("PROD-017 the context projection", () => {
  test("the context line joins verbatim fields (name, role, source system)", () => {
    expect(view.contextLine).toBe(
      "Riverside Block B Refurbishment — your role: field-operator · synchronized from aise-internal",
    );
    expect(view.context?.projectId).toBe(DEMO_TASK_PROJECT_ID);
  });

  test("an absent context renders the honest null", () => {
    const noContext = taskFlowView({ ...bundle, context: null }, "proj-x");
    expect(noContext.context).toBe(null);
    expect(noContext.contextLine).toBe(null);
  });
});

describe("PROD-017 W-R5 — boqlens derivations stay presentation-only (regression guard)", () => {
  test("the journey model never derives BOQ quantities: it joins the context's verbatim fields only", () => {
    // The BOQ step's summary is a field join of the decoded BOQContext —
    // the source BOQ (erp ERP-BOQ-2026-0042, revision 2, 1284 items) stays
    // the authority; the boqlens library's derive/health rollups remain
    // presentation-only aggregations over already-parsed input (unchanged
    // by this work item — the standing constraint of the PROD-016 audit).
    const boq = bundle.boq;
    expect(boq?.lineItemCount).toBe(1284);
    expect(boq?.sourceSystem).toBe("erp");
    const summary = view.steps.find((step) => step.step === "inspect-boq")?.record.summary;
    expect(summary).toBe("revision 2 · 1284 line items · source of record: erp ERP-BOQ-2026-0042");
  });
});
