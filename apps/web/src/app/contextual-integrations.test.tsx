/**
 * PROD-034 — the CONTEXTUAL INTEGRATION tests (issue #9 gap 5).
 *
 * The task-first.test.tsx discipline: static renders of pure projections +
 * pure-model assertions. The discovery model (refs from the task's own
 * records, the recorded-vocabulary binding join), every honest state
 * (reference-only / not-configured / unavailable / unknown-last-sync /
 * not-readable-live) and the wiring at the contextual points are pinned.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ContextualIntegrationsCard,
  ContextualIntegrationsPanelBody,
  bindingsForSourceRef,
  incumbentSourceRefs,
} from "./contextual-integrations";
import { allBindings, bimBinding, erpBinding } from "../shell/fixtures";
import { demoTaskFlowBundle, DEMO_TASK_PROJECT_ID } from "./task-dataset";
import type { TaskFlowResourceData } from "./task-first";

const bundle = demoTaskFlowBundle();
const data: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: null,
  bundle,
};

describe("PROD-034 gap 5 — the discovery model (pure projections of the records)", () => {
  test("the demo task's BOQ context discovers the ERP source-of-record reference", () => {
    const refs = incumbentSourceRefs(bundle);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.system).toBe("erp");
    expect(refs[0]!.recordRef).toBe("ERP-BOQ-2026-0042");
    expect(refs[0]!.basis).toContain("boq-import-33d");
    expect(refs[0]!.basis).toContain("records its source of record");
  });

  test("an internal source is honestly NOT an incumbent system (the exclusion is over the recorded value)", () => {
    const internal = incumbentSourceRefs({
      ...bundle,
      boq: { ...bundle.boq!, sourceSystem: "aise-internal", sourceRecordRef: undefined },
    });
    expect(internal).toHaveLength(0);
  });

  test("a BOQ-less bundle discovers nothing (the honest empty, never a guess)", () => {
    expect(incumbentSourceRefs({ ...bundle, boq: null })).toHaveLength(0);
  });

  test("the binding join matches over the recorded system-class family only", () => {
    const ref = incumbentSourceRefs(bundle)[0]!;
    const matched = bindingsForSourceRef(ref, allBindings());
    // `erp` joins the erp-procurement binding — and ONLY it (bim/pm do not).
    expect(matched.map((binding) => binding.bindingId)).toEqual([erpBinding().bindingId]);
    // A bim-ifc reference joins the bim binding, not the ERP one.
    const bimRef = { system: "bim-ifc", recordRef: "IFC-MODEL-0042", basis: "test" };
    expect(bindingsForSourceRef(bimRef, allBindings()).map((b) => b.bindingId)).toEqual([
      bimBinding().bindingId,
    ]);
    // A system with no binding family joins nothing — not-configured.
    expect(bindingsForSourceRef({ system: "cad-dxf", recordRef: null, basis: "test" }, allBindings())).toHaveLength(0);
  });
});

describe("PROD-034 gap 5 — the contextual card (demo world: the ERP binding is honestly unavailable)", () => {
  const refs = incumbentSourceRefs(bundle);

  test("renders the reference VERBATIM, reference-only, with the never-a-new-authority note", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard refs={refs} bindings={allBindings()} mode="demo" />,
    );
    expect(html).toContain("The incumbent systems behind this scope");
    expect(html).toContain("discovered from the current task");
    expect(html).toContain("reference only");
    expect(html).toContain("ERP-BOQ-2026-0042");
    expect(html).toContain("the incumbent system stays the system of record");
    expect(html).toContain("integration metadata is never a new authority");
  });

  test("renders the matching binding with its UNAVAILABLE status verbatim (the typed failure + the unknown last sync)", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard refs={refs} bindings={allBindings()} mode="demo" />,
    );
    expect(html).toContain("ERP procurement");
    expect(html).toContain("AUTHENTICATION_EXPIRED");
    expect(html).toContain("never recorded — unknown, not assumed");
    expect(html).toContain("PO-2025-1187");
    // The non-matching bindings (bim, pm) do NOT render at this contextual point.
    expect(html).not.toContain("Architect BIM");
    expect(html).not.toContain("Project management system");
  });

  test("authorized actions are pointed at the brokered panel — never decided here", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard refs={refs} bindings={allBindings()} mode="demo" />,
    );
    expect(html).toContain("Authorized actions resolve per principal");
    expect(html).toContain("#/settings");
  });

  test("the not-configured state: a reference with no matching binding stays reference-only", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard
        refs={[{ system: "cad-dxf", recordRef: "DWG-77", basis: "the BOQ context records its source of record" }]}
        bindings={allBindings()}
        mode="demo"
      />,
    );
    expect(html).toContain('data-integration-state="not-configured"');
    expect(html).toContain("No integration is configured on this deployment");
    expect(html).toContain("nothing to sync and nothing was lost");
    expect(html).toContain("DWG-77");
  });

  test("the honest empty state: no incumbent references on the task's records", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard refs={[]} bindings={allBindings()} mode="demo" />,
    );
    expect(html).toContain("No incumbent source-of-record references");
    expect(html).toContain("an internal AISE source is not an incumbent system");
  });

  test("the connected binding renders its external record + the incumbent deep link", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard
        refs={[{ system: "bim-ifc", recordRef: "IFC-MODEL-0042", basis: "test basis" }]}
        bindings={allBindings()}
        mode="demo"
      />,
    );
    expect(html).toContain("Architect BIM (prod)");
    expect(html).toContain("connected");
    expect(html).toContain("IFC-MODEL-0042");
    expect(html).toContain("open in the incumbent system");
  });

  test("the unknown-last-sync binding renders the first-class unknown", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard
        refs={[{ system: "project-management", recordRef: "SCHED-77", basis: "test basis" }]}
        bindings={allBindings()}
        mode="demo"
      />,
    );
    expect(html).toContain("unknown-last-sync");
    expect(html).toContain("no sync result recorded yet");
    expect(html).toContain("SCHED-77");
  });
});

describe("PROD-034 gap 5 — the live-mode honest state + the wiring", () => {
  test("live mode: the bindings section is honestly not-readable while the references still render", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsCard refs={incumbentSourceRefs(bundle)} bindings={null} mode="api" />,
    );
    expect(html).toContain('data-integration-state="not-readable"');
    expect(html).toContain("no readable same-origin endpoint in this build");
    expect(html).toContain("ERP-BOQ-2026-0042");
    expect(html).toContain("stays reference-only either way");
  });

  test("the panel body composes from the task-flow data (demo bindings; live not-readable)", () => {
    const demoHtml = renderToStaticMarkup(
      <ContextualIntegrationsPanelBody data={data} demo={true} />,
    );
    expect(demoHtml).toContain("ERP procurement");
    const liveHtml = renderToStaticMarkup(
      <ContextualIntegrationsPanelBody data={data} demo={false} />,
    );
    expect(liveHtml).toContain("no readable same-origin endpoint");
  });

  test("a bundle-less project renders the honest empty card (never an invented reference)", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsPanelBody
        data={{ mode: "demo", projectId: "other", view: null, bundle: null }}
        demo={true}
      />,
    );
    expect(html).toContain("No incumbent source-of-record references");
  });
});
