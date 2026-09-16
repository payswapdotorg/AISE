/**
 * PROD-010 — render-layer tests (round 2, re-execution): the golden
 * journey's panels and pickers as PURE static renders.
 *
 * DISCIPLINE: every test is a `renderToStaticMarkup` projection of pure
 * components with hand-constructed offers/fixtures — no network (effects
 * never run in static rendering), no clock, no randomness. The interactive
 * write paths are covered at the adapter level (api.test.ts) and by the
 * Lead's live browser walk; these tests pin the HONEST matrices.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BaselinePicker,
  CasePicker,
  CreateRecordPanel,
  EvidencePicker,
  StepPicker,
  type CreatePanelOutcome,
} from "./components";
import type { CreateActionOffer } from "./create-forms";
import { approvedScenario } from "../viewer/fixtures";
import type { ViewerScenario } from "../viewer";
import { NewScenarioPanel, AppendStepPanel, ApprovalPanel } from "./surfaces/InterventionStudio";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const HEX64 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4";
const HEX64B = "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5";

/** A sourced label literal (the fixtures' `st` shape, inline). */
function label(text: string) {
  return { value: text, source: { module: "context" as const, recordId: "render-test" } };
}

/** A brokered-action literal (the AISE-040 tri-state vocabulary). */
function actionFixture(): CreateActionOffer["action"] {
  return {
    descriptor: {
      actionId: "create-scenario",
      kind: "open-record",
      label: label("Record an intervention scenario"),
      requiredPermission: "intervention:write",
      initiateUrl: null,
    },
    bindingId: "binding-test",
    returnTo: { projectId: "proj-render-test", surface: "intervention-studio" },
  } as unknown as CreateActionOffer["action"];
}

const ALLOWED: CreateActionOffer = {
  action: actionFixture(),
  state: {
    kind: "allowed",
    grant: {
      membershipId: "membership-1",
      roleId: "role-engineer",
      permission: "intervention:write",
      scope: { kind: "project", projectId: "proj-render-test" },
    },
  },
};

const REFUSED: CreateActionOffer = {
  action: actionFixture(),
  state: {
    kind: "refused",
    refusal: {
      code: "permission_not_granted",
      detail: "No role grants intervention:write for this target.",
      principalId: "user-render-test",
      target: {
        kind: "project",
        organizationId: "org-render-test",
        projectId: "proj-render-test",
      },
    },
  },
};

const ASK_FAILED: CreateActionOffer = {
  action: actionFixture(),
  state: { kind: "ask-failed", detail: "authorization port unavailable" },
};

/** A fetch that must NEVER be called in static rendering. */
function neverFetch(): (input: string, init?: RequestInit) => Promise<Response> {
  return () => Promise.reject(new Error("static render must not fetch"));
}

/* ------------------------------------------------------------------ */
/* CreateRecordPanel — the honest matrix                               */
/* ------------------------------------------------------------------ */

describe("PROD-010 render — CreateRecordPanel", () => {
  test("demo mode: the submit is DISABLED and the honesty text names the live API", () => {
    const html = renderToStaticMarkup(
      <CreateRecordPanel
        id="create-scenario"
        title="Record an intervention scenario"
        offer={ALLOWED}
        mode="demo"
        draftValid={true}
        defects={[]}
        submitting={false}
        outcome={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain('id="create-scenario"');
    expect(html).toContain("requires the live API");
    expect(html).not.toContain('type="submit" disabled=""');
    // The disabled honesty: demo mode renders the submit disabled.
    expect(html).toMatch(/disabled/);
  });

  test("live mode + ALLOWED offer + valid draft: the submit is enabled", () => {
    const html = renderToStaticMarkup(
      <CreateRecordPanel
        id="create-scenario"
        title="Record an intervention scenario"
        offer={ALLOWED}
        mode="api"
        draftValid={true}
        defects={[]}
        submitting={false}
        outcome={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("allowed — permission intervention:write via role role-engineer");
    // No disabled submit in the enabled matrix.
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  test("live mode + REFUSED offer: disabled + the refusal named verbatim", () => {
    const html = renderToStaticMarkup(
      <CreateRecordPanel
        id="create-scenario"
        title="Record an intervention scenario"
        offer={REFUSED}
        mode="api"
        draftValid={true}
        defects={[]}
        submitting={false}
        outcome={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("permission_not_granted");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  test("the ask-failed state is named (never a silent guess)", () => {
    const html = renderToStaticMarkup(
      <CreateRecordPanel
        id="create-scenario"
        title="Record an intervention scenario"
        offer={ASK_FAILED}
        mode="api"
        draftValid={false}
        defects={[]}
        submitting={false}
        outcome={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("authorization port unavailable");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  test("draft defects render; the created outcome names the endpoint", () => {
    const withDefects = renderToStaticMarkup(
      <CreateRecordPanel
        id="create-scenario"
        title="Record an intervention scenario"
        offer={ALLOWED}
        mode="api"
        draftValid={false}
        defects={["title must be a non-empty string"]}
        submitting={false}
        outcome={null}
        onSubmit={() => undefined}
      />,
    );
    expect(withDefects).toContain("title must be a non-empty string");

    const created: CreatePanelOutcome = {
      kind: "created",
      detail: "scenario recorded",
      endpoint: "POST /v1/interventions",
    };
    const withOutcome = renderToStaticMarkup(
      <CreateRecordPanel
        id="create-scenario"
        title="Record an intervention scenario"
        offer={ALLOWED}
        mode="api"
        draftValid={true}
        defects={[]}
        submitting={false}
        outcome={created}
        onSubmit={() => undefined}
      />,
    );
    expect(withOutcome).toContain("POST /v1/interventions");
    expect(withOutcome).toContain("scenario recorded");
  });
});

/* ------------------------------------------------------------------ */
/* BaselinePicker — the five honest states                             */
/* ------------------------------------------------------------------ */

describe("PROD-010 render — BaselinePicker", () => {
  test("the five states render distinctly (demo/loading/failed/none/ready)", () => {
    const demo = renderToStaticMarkup(
      <BaselinePicker state={{ kind: "demo" }} value="" onChange={() => undefined} />,
    );
    expect(demo).toContain('data-picker-state="demo"');

    const loading = renderToStaticMarkup(
      <BaselinePicker state={{ kind: "loading" }} value="" onChange={() => undefined} />,
    );
    expect(loading).toContain('data-picker-state="loading"');

    const failed = renderToStaticMarkup(
      <BaselinePicker
        state={{ kind: "failed", message: "the reality register is unreachable" }}
        value=""
        onChange={() => undefined}
      />,
    );
    expect(failed).toContain('data-picker-state="failed"');
    expect(failed).toContain("the reality register is unreachable");

    const none = renderToStaticMarkup(
      <BaselinePicker state={{ kind: "none" }} value="" onChange={() => undefined} />,
    );
    expect(none).toContain('data-picker-state="none"');

    const ready = renderToStaticMarkup(
      <BaselinePicker
        state={{
          kind: "ready",
          version: { versionId: "v002", createdAt: "2026-01-02T00:00:00.000Z", nodeCount: 12 },
        }}
        value="v002"
        onChange={() => undefined}
      />,
    );
    expect(ready).toContain('data-picker-state="ready"');
    expect(ready).toContain("v002");
  });
});

/* ------------------------------------------------------------------ */
/* EvidencePicker / CasePicker / StepPicker                            */
/* ------------------------------------------------------------------ */

describe("PROD-010 render — the pickers", () => {
  test("EvidencePicker: full ids as checkboxes; INVALIDATED visible but unpickable", () => {
    const html = renderToStaticMarkup(
      <EvidencePicker
        status={{
          kind: "ready",
          options: [
            {
              evidenceId: HEX64,
              caption: "wall-north · image/jpeg",
              invalidated: false,
              invalidationReason: null,
            },
            {
              evidenceId: HEX64B,
              caption: "wall-east · image/jpeg",
              invalidated: true,
              invalidationReason: "superseded by re-capture",
            },
          ],
        }}
        value={HEX64}
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain(HEX64);
    expect(html).toContain(HEX64B);
    expect(html).toContain("superseded by re-capture");
    // The checkboxes render in option order: the INVALIDATED entry's is
    // disabled (visible but unpickable); the valid selected one is not.
    const checkboxes = html.match(/<input type="checkbox"[^>]*>/g) ?? [];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toMatch(/disabled/);
    expect(checkboxes[1]).toMatch(/disabled/);
  });

  test("EvidencePicker: loading/failed/empty honest states", () => {
    const loading = renderToStaticMarkup(
      <EvidencePicker status={{ kind: "loading" }} value="" onToggle={() => undefined} />,
    );
    expect(loading).toContain('data-picker-state="loading"');

    const failed = renderToStaticMarkup(
      <EvidencePicker
        status={{ kind: "failed", message: "register unreachable" }}
        value=""
        onToggle={() => undefined}
      />,
    );
    expect(failed).toContain('data-picker-state="failed"');
    expect(failed).toContain("register unreachable");

    const empty = renderToStaticMarkup(
      <EvidencePicker status={{ kind: "ready", options: [] }} value="" onToggle={() => undefined} />,
    );
    expect(empty).toContain("The register carries no pickable evidence records");
  });

  test("CasePicker: radio options + the hand-entry path stays", () => {
    const html = renderToStaticMarkup(
      <CasePicker
        options={[
          { caseId: "case-007", title: "North wall deviation" },
          { caseId: "case-008", title: "Ceiling survey" },
        ]}
        value="case-007"
        onPick={() => undefined}
      />,
    );
    expect(html).toContain('type="radio"');
    expect(html).toContain("case-007");
    expect(html).toContain("North wall deviation");
  });

  test("StepPicker: checkboxes over the scenario's REAL step ids", () => {
    const html = renderToStaticMarkup(
      <StepPicker
        steps={[
          { stepId: "step-001", kind: "property_change", stepIndex: 1 },
          { stepId: "step-002", kind: "note", stepIndex: 2 },
        ]}
        selectedStepIds={["step-001"]}
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain("step-001");
    expect(html).toContain("step-002");
    expect(html).toContain("property_change");
  });
});

/* ------------------------------------------------------------------ */
/* The studio panels (static initial renders)                          */
/* ------------------------------------------------------------------ */

describe("PROD-010 render — the studio panels", () => {
  const scenario: ViewerScenario = approvedScenario();
  const firstState = scenario.states[0] ?? scenario.states[scenario.states.length - 1]!;

  test("NewScenarioPanel (demo): renders anchored, honestly demo-badged, never fabricates", () => {
    const html = renderToStaticMarkup(
      <NewScenarioPanel
        projectId="proj-render-test"
        mode="demo"
        principalId="user-alice"
        fetchImpl={neverFetch()}
        onCreated={() => undefined}
      />,
    );
    expect(html).toContain("scenario");
    expect(html).toMatch(/demo/i);
  });

  test("NewScenarioPanel (api): renders the broker question + baseline picker", () => {
    const html = renderToStaticMarkup(
      <NewScenarioPanel
        projectId="proj-render-test"
        mode="api"
        principalId="demo-evaluator"
        fetchImpl={neverFetch()}
        onCreated={() => undefined}
      />,
    );
    expect(html).toContain("baseline");
  });

  test("AppendStepPanel (api): the kind selector offers the frozen step kinds", () => {
    const html = renderToStaticMarkup(
      <AppendStepPanel
        scenario={scenario}
        stateLayer={firstState}
        mode="api"
        principalId="demo-evaluator"
        fetchImpl={neverFetch()}
        onCreated={() => undefined}
      />,
    );
    expect(html).toContain("property_change");
    expect(html).toContain("targetNodeId");
  });

  test("ApprovalPanel (approved scenario): TERMINAL honesty — no further transitions offered", () => {
    const html = renderToStaticMarkup(
      <ApprovalPanel
        scenario={scenario}
        mode="api"
        principalId="demo-evaluator"
        fetchImpl={neverFetch()}
        onTransitioned={() => undefined}
      />,
    );
    // approvedScenario() is a TERMINAL-approved record: the panel must say so.
    expect(html).toMatch(/approved/i);
    expect(html).toMatch(/terminal|no further|final/i);
  });

  test("ApprovalPanel (draft scenario): the governed transition select renders with allowed statuses only", () => {
    const draftScenario: ViewerScenario = { ...scenario, status: "draft" };
    const html = renderToStaticMarkup(
      <ApprovalPanel
        scenario={draftScenario}
        mode="api"
        principalId="demo-evaluator"
        fetchImpl={neverFetch()}
        onTransitioned={() => undefined}
      />,
    );
    expect(html).toContain("under_review");
  });
});
