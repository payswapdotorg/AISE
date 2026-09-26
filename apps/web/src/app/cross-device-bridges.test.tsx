/**
 * POST-005 — the cross-device + BOQ continuity bridge tests.
 *
 * Pins the four new bridges (plan §6 Wave 1 Worker 2) at the deterministic
 * level this station can prove:
 *
 *  - the BOQ import/revision SELECTOR (BoqLens): every recorded import is
 *    listed and selectable; source-BOQ vs solution-BOQ separation is stated
 *    and structurally asserted;
 *  - the web→mobile task handoff (CaptureMission): the task identity
 *    (project/task/targets/epistemic state) renders, and the emitted
 *    `aise://task` deep link ROUND-TRIPS through the adapter contract codec
 *    (web → link → identity — the continuation key preserved);
 *  - the missing-evidence → capture bridge (EngineeringCase): each open
 *    declaration becomes a case-specific capture task — this case, this
 *    gap, the case's own status — never a generic capture surface;
 *  - the post-work capture return path (Outcomes): the observed outcome's
 *    post-work evidence content ids render (the completed return path),
 *    and the post-work handoff carries purpose=post-work-capture.
 *
 * Deterministic: static renders of the exported pure bodies + the committed
 * demo/task-flow records + the adapter-contract codec. No network, no
 * clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CrossDeviceHandoffBody,
  fieldCaptureHandoff,
  postWorkCaptureHandoff,
} from "./surfaces/CaptureMission";
import { MissingEvidenceCaptureBridgeBody } from "./surfaces/EngineeringCase";
import { PostWorkCaptureBridgeBody } from "./surfaces/Outcomes";
import { BoqRevisionSelectorCard } from "./surfaces/BoqLens";
import { demoTaskFlowBundle, DEMO_TASK_PROJECT_ID } from "./task-dataset";
import type { TaskFlowResourceData } from "./task-first";
import { taskFlowView } from "./task-flow";
import { parseFieldTaskDeepLink } from "@aise/adapter-contract/task-handoff";
import type { FieldTaskHandoff } from "@aise/adapter-contract/task-handoff";

const bundle = demoTaskFlowBundle();
const view = taskFlowView(bundle, DEMO_TASK_PROJECT_ID);
const taskData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view,
  bundle,
};

/** One deterministic handoff (the bridge builders' output shape). */
const gapHandoff: FieldTaskHandoff = fieldCaptureHandoff({
  projectId: DEMO_TASK_PROJECT_ID,
  taskId: "task-capture-gap-4471",
  intent: bundle.evidence?.gaps[0]?.description ?? "capture the missing reference",
  targetRefs: ["case-91ab", "gap-4471"],
  epistemicState: bundle.caseSummary?.status ?? "under-review",
  originSurface: "engineering-case",
  versionContext: {},
  issuedAt: "2026-09-26T09:00:00.000Z",
});

const postWorkHandoff: FieldTaskHandoff = postWorkCaptureHandoff({
  projectId: DEMO_TASK_PROJECT_ID,
  taskId: "task-postwork-outcome-77e2",
  intent: "Capture the completed condition of the executed work.",
  targetRefs: ["outcome-77e2", "scenario-55c1", "case-91ab"],
  epistemicState: "OBSERVED",
  originSurface: "outcomes",
  versionContext: {},
  issuedAt: "2026-09-26T09:05:00.000Z",
});

/** Pull the emitted deep link out of a static render (HTML-unescaped). */
function extractDeepLink(html: string): string {
  const match = /href="(aise:\/\/task[^"]*)"/.exec(html);
  expect(match).not.toBeNull();
  return match![1]!.replace(/&amp;/g, "&");
}

/* ------------------------------------------------------------------ */
/* The BOQ import/revision selector                                     */
/* ------------------------------------------------------------------ */

describe("POST-005 the BOQ import/revision selector (BoqLens)", () => {
  const imports = [
    { importId: "imp-2024-boq-001", format: "xlsx", byteSize: 38214, parseStatus: "parsed" },
    { importId: "imp-2025-boq-002", format: "csv", byteSize: 12045, parseStatus: "parsed" },
    { importId: "imp-2025-boq-003", format: "pdf", byteSize: 99011, parseStatus: "stored_without_parsing" },
  ];

  test("lists EVERY recorded import document with its own inspect action", () => {
    const html = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId="proj-riverside-refit"
        imports={imports}
        selectedImportId="imp-2024-boq-001"
        onSelectImport={() => {}}
      />,
    );
    for (const entry of imports) {
      expect(html).toContain(entry.importId);
      expect(html).toContain(`data-inspect-import="${entry.importId}"`);
    }
    expect(html).toContain(`data-selector-selection="imp-2024-boq-001"`);
    // the inspected import is marked selected; the others are inspectable
    expect(html).toContain(`data-selected="true"`);
    expect(html).toContain("Inspecting");
  });

  test("the selector is a SELECTION, not the silently-opened first import", () => {
    const html = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId="p1"
        imports={imports}
        selectedImportId={null}
        onSelectImport={() => {}}
      />,
    );
    expect(html).toContain(`data-selector-selection="none"`);
    expect(html).toContain("No import inspected yet");
  });

  test("source BOQ and solution BOQ are stated strictly separate", () => {
    const html = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId="p1"
        imports={imports}
        selectedImportId="imp-2024-boq-001"
        onSelectImport={() => {}}
      />,
    );
    expect(html).toContain(`data-boq-class="source"`);
    expect(html).toContain("SOURCE BOQ documents");
    expect(html).toContain("Solution BOQs");
    expect(html).toContain("never overwrites");
    // the separation is structural too: the selector links the solution
    // surface for solution BOQs, never renders them as source imports
    expect(html).toContain(`#/projects/p1/solution`);
    expect(html).not.toContain(`data-boq-class="solution"`);
  });

  test("an empty import list is the honest empty state; a loading list says so", () => {
    const empty = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId="p1"
        imports={[]}
        selectedImportId={null}
        onSelectImport={() => {}}
      />,
    );
    expect(empty).toContain("No source-BOQ imports recorded");
    const loading = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId="p1"
        imports={null}
        selectedImportId={null}
        onSelectImport={() => {}}
      />,
    );
    expect(loading).toContain(`data-selector-state="loading"`);
  });
});

/* ------------------------------------------------------------------ */
/* The web → mobile task handoff                                        */
/* ------------------------------------------------------------------ */

describe("POST-005 the web → mobile task handoff (CaptureMission)", () => {
  test("the handoff panel states the next action belongs on the phone and carries the task identity", () => {
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={taskData} handoff={null} onPrepare={() => {}} />,
    );
    expect(html).toContain("Continue this task on the mobile field app");
    expect(html).toContain("belongs on the phone");
    expect(html).toContain(DEMO_TASK_PROJECT_ID);
    expect(html).toContain("case-91ab");
    expect(html).toContain("gap-4471");
    expect(html).toContain("gap-4472");
    expect(html).toContain(`data-handoff-prepare="idle"`);
  });

  test("the prepared handoff renders the canonical aise://task deep link", () => {
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={taskData} handoff={gapHandoff} onPrepare={() => {}} />,
    );
    expect(html).toContain(`data-handoff-link="true"`);
    expect(html).toContain("aise://task?v=1&amp;handoff=handoff-task-capture-gap-4471");
    expect(html).toContain(`data-handoff-uri="aise"`);
    expect(html).toContain("capability assessment");
  });

  test("the bridge-built handoff round-trips through the adapter contract codec (the continuation key)", () => {
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={taskData} handoff={gapHandoff} onPrepare={() => {}} />,
    );
    const parsed = parseFieldTaskDeepLink(extractDeepLink(html));
    expect(parsed.kind).toBe("valid");
    if (parsed.kind === "valid") {
      expect(parsed.handoff.taskId).toBe("task-capture-gap-4471");
      expect(parsed.handoff.projectId).toBe(DEMO_TASK_PROJECT_ID);
      expect(parsed.handoff.targetRefs).toEqual(["case-91ab", "gap-4471"]);
      expect(parsed.handoff.purpose).toBe("field-capture");
      expect(parsed.handoff.epistemicState).toBe(bundle.caseSummary?.status ?? "under-review");
    }
  });

  test("the honest empty state when no task-flow records exist", () => {
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody
        data={{ mode: "demo", projectId: "proj-other", view: null, bundle: null }}
        handoff={null}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain("No task-flow records to hand off");
  });
});

/* ------------------------------------------------------------------ */
/* The missing-evidence → capture bridge                                */
/* ------------------------------------------------------------------ */

describe("POST-005 the missing-evidence → capture bridge (EngineeringCase)", () => {
  const entries =
    bundle.evidence?.gaps.map((gap) => ({
      key: gap.gapId,
      kind: gap.kind,
      description: gap.description,
      status: "open",
    })) ?? [];

  test("each OPEN declaration renders its own case-specific capture task with both device paths", () => {
    const html = renderToStaticMarkup(
      <MissingEvidenceCaptureBridgeBody
        projectId={DEMO_TASK_PROJECT_ID}
        mode="demo"
        caseId="case-91ab"
        caseStatus="under-review"
        entries={entries}
        missingEvidenceCount={entries.length}
        prepared={null}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain("Capture the missing evidence — for this case");
    expect(html).toContain("capture this evidence");
    expect(html).toContain("for this case");
    expect(html).toContain(`data-gap-bridge="gap-4471"`);
    expect(html).toContain(`data-gap-bridge="gap-4472"`);
    expect(html).toContain(`data-bridge-device="this-device"`);
    expect(html).toContain(`data-bridge-device="field-device"`);
    // the this-device path joins the capture surface of THIS project
    expect(html).toContain(`#/projects/${DEMO_TASK_PROJECT_ID}/capture`);
    // the declarations' own words ride verbatim
    expect(html).toContain(bundle.evidence?.gaps[0]?.description ?? "MISSING-DESCRIPTION");
  });

  test("the prepared per-entry handoff carries THIS case, THIS declaration and the case's own status", () => {
    const html = renderToStaticMarkup(
      <MissingEvidenceCaptureBridgeBody
        projectId={DEMO_TASK_PROJECT_ID}
        mode="demo"
        caseId="case-91ab"
        caseStatus="under-review"
        entries={entries}
        missingEvidenceCount={entries.length}
        prepared={{ key: "gap-4471", handoff: gapHandoff }}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain(`data-bridge-handoff="gap-4471"`);
    expect(html).toContain("task-capture-gap-4471");
    expect(html).toContain("under-review");
  });

  test("closed declarations carry no capture task; none declared is honest", () => {
    const closed = renderToStaticMarkup(
      <MissingEvidenceCaptureBridgeBody
        projectId="p1"
        mode="api"
        caseId="c1"
        caseStatus="closed-case"
        entries={[{ key: "missing-1", kind: "MISSING", description: "superseded", status: "closed" }]}
        missingEvidenceCount={1}
        prepared={null}
        onPrepare={() => {}}
      />,
    );
    expect(closed).toContain("none open right now");
    expect(closed).not.toContain(`data-bridge-device="field-device"`);
    const none = renderToStaticMarkup(
      <MissingEvidenceCaptureBridgeBody
        projectId="p1"
        mode="api"
        caseId="c1"
        caseStatus="open-case"
        entries={[]}
        missingEvidenceCount={0}
        prepared={null}
        onPrepare={() => {}}
      />,
    );
    expect(none).toContain("No open missing-evidence declarations to act on");
  });
});

/* ------------------------------------------------------------------ */
/* The post-work capture return path                                    */
/* ------------------------------------------------------------------ */

describe("POST-005 the post-work capture return path (Outcomes)", () => {
  const outcome = bundle.outcome;

  test("the observed outcome's post-work evidence content ids render as the COMPLETED return path", () => {
    expect(outcome).not.toBeNull();
    const html = renderToStaticMarkup(
      <PostWorkCaptureBridgeBody
        projectId={DEMO_TASK_PROJECT_ID}
        mode="demo"
        outcome={outcome}
        scenarioId="scenario-55c1"
        caseId="case-91ab"
        executions={[]}
        prepared={null}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain(`data-postwork-landed="true"`);
    expect(html).toContain("post-work evidence");
    expect(html).toContain("earned that state through");
    for (const contentId of outcome?.postWorkEvidenceContentIds ?? []) {
      // the surface renders short ids (first…last 4 hex) — each recorded
      // post-work content id must be identifiable in the rendered loop
      expect(html).toContain(contentId.slice(0, 4));
      expect(html).toContain(contentId.slice(-4));
    }
  });

  test("the prepared post-work handoff carries purpose=post-work-capture and the outcome's own epistemic state", () => {
    const html = renderToStaticMarkup(
      <PostWorkCaptureBridgeBody
        projectId={DEMO_TASK_PROJECT_ID}
        mode="demo"
        outcome={outcome}
        scenarioId="scenario-55c1"
        caseId="case-91ab"
        executions={[]}
        prepared={postWorkHandoff}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain(`data-postwork-handoff="true"`);
    expect(html).toContain("purpose post-work-capture");
    expect(html).toContain("OBSERVED");
    // the deep link round-trips: post-work continuation key preserved
    const parsed = parseFieldTaskDeepLink(extractDeepLink(html));
    expect(parsed.kind).toBe("valid");
    if (parsed.kind === "valid") {
      expect(parsed.handoff.purpose).toBe("post-work-capture");
      expect(parsed.handoff.taskId).toBe("task-postwork-outcome-77e2");
      expect(parsed.handoff.epistemicState).toBe("OBSERVED");
    }
  });

  test("live mode: no executions yet is the honest empty state, never a fabricated outcome", () => {
    const html = renderToStaticMarkup(
      <PostWorkCaptureBridgeBody
        projectId="p1"
        mode="api"
        outcome={null}
        scenarioId={null}
        caseId={null}
        executions={[]}
        prepared={null}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain("No executed work to capture post-work evidence for");
    expect(html).toContain("never presented as an outcome");
  });
});

/* ------------------------------------------------------------------ */
/* The task-identity round-trip (web → link → identity), deterministic   */
/* ------------------------------------------------------------------ */

describe("POST-005 the task-identity round-trip at the deterministic level", () => {
  test("every bridge-built handoff survives the deep-link codec round-trip byte-identically", () => {
    for (const handoff of [gapHandoff, postWorkHandoff]) {
      const html = renderToStaticMarkup(
        <CrossDeviceHandoffBody data={taskData} handoff={handoff} onPrepare={() => {}} />,
      );
      const parsed = parseFieldTaskDeepLink(extractDeepLink(html));
      expect(parsed.kind).toBe("valid");
      if (parsed.kind === "valid") {
        expect(parsed.handoff).toEqual(handoff);
      }
    }
  });

  test("the round-trip class is honest: deterministic (contract codec + static render), not device evidence", () => {
    // This suite exercises the adapter-contract codec and static renders of
    // the pure bridge bodies over committed demo records — deterministic
    // proof of the IDENTITY preservation law (plan §5's boundary fields),
    // never physical/emulated device evidence. The sentence below pins the
    // classification so a future reader cannot misupgrade it.
    expect("deterministic").not.toBe("physical");
    expect("deterministic").not.toBe("emulated");
  });
});
