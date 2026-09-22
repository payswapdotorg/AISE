/**
 * PROD-017 — the browser adapter's CONTRACT CONFORMANCE suite (W-R4).
 *
 * Part 1: `runConformance(createBrowserConformanceBinding(),
 * loadCommittedFixtures())` — the shared C0–C9 harness over the committed
 * PROD-016 corpus, driven by the app's REAL binding (the seam decoders,
 * the render registry, the honest implemented-modes claim).
 *
 * Part 2 (discrimination): sabotage variants of the binding — an emission
 * that drops a field, a presentation that hides denials/failures/blockers,
 * a mode claim the profile does not support — each MUST FAIL the explicit
 * checks (a binding that passes everything by construction proves nothing).
 *
 * Part 3 (the platform-specific client conformance suite of
 * spec/client-adapter-contract.md): the 12 items — project open/create,
 * task selection, evidence inspection, next-best-action rendering,
 * evidence submission, BOQ item inspection, case inspection/update,
 * intervention state inspection, outcome comparison, authorization
 * denial, unavailable provider/failure state, offline/resume where
 * supported — each demonstrated against the app's REAL modules (pure
 * functions + static renders), with item 12 honestly NOT SUPPORTED on
 * this browser adapter (session-cache only; no resumable offline queue)
 * and asserted as such.
 *
 * Determinism: no network (fixtures are committed files), no clock, no
 * randomness.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AUTHORITATIVE_FIELDS,
  CONFORMANCE_CHECKS,
  createLosslessBinding,
  runConformance,
  REFERENCE_BOQ_REVIEW_REQUIREMENTS,
  REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  deriveInteractionModes,
  type AdapterConformanceBinding,
  type ConformanceCorpus,
} from "@aise/adapter-contract";
import { loadCommittedFixtures } from "@aise/adapter-contract/fixtures-loader";
import { createBrowserConformanceBinding, BROWSER_BINDING_ID } from "./adapter-binding";
import {
  BROWSER_ADAPTER_PROFILE,
  BROWSER_IMPLEMENTED_INTERACTION_MODES,
  negotiateBrowserTask,
} from "./adapter-profile";
import { CONTRACT_PRESENTED_FIELDS, ContractObjectFields, presentedFieldsOf } from "./contract-objects";
import { demoTaskFlowBundle, demoFailedOperationResult } from "./task-dataset";

/** The committed corpus (deterministic file reads — the only fs use). */
const corpus: ConformanceCorpus = loadCommittedFixtures();

/* ------------------------------------------------------------------ */
/* Part 1 — the shared harness (C0–C9) over the committed corpus        */
/* ------------------------------------------------------------------ */

describe("PROD-017 browser adapter contract conformance (C0–C9)", () => {
  const binding = createBrowserConformanceBinding();
  const report = runConformance(binding, corpus);

  test("the browser binding passes every check", () => {
    expect(report.passed).toBe(true);
    expect(report.bindingId).toBe(BROWSER_BINDING_ID);
    for (const check of report.checks) {
      expect(check.passed).toBe(true);
    }
  });

  test("the check catalogue is exactly C0–C9 (the stable contract)", () => {
    expect(CONFORMANCE_CHECKS.map((check) => check.checkId)).toEqual([
      "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9",
    ]);
    expect(report.checks.map((check) => check.checkId)).toEqual([
      "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9",
    ]);
  });

  test("C4/C5: the presentation registry covers required AND authoritative fields", () => {
    for (const [objectName, fields] of Object.entries(CONTRACT_PRESENTED_FIELDS)) {
      const presented = new Set(fields);
      const authoritative = AUTHORITATIVE_FIELDS[objectName as keyof typeof AUTHORITATIVE_FIELDS];
      if (authoritative !== undefined) {
        for (const field of authoritative) {
          expect(presented.has(field)).toBe(true);
        }
      }
    }
  });

  test("C6: the implemented-modes claim is a strict subset of the profile's modes", () => {
    const declared = new Set<string>(deriveInteractionModes(BROWSER_ADAPTER_PROFILE));
    for (const mode of BROWSER_IMPLEMENTED_INTERACTION_MODES) {
      expect(declared.has(mode)).toBe(true);
    }
  });

  test("the render layer actually renders every registry field (no claim without render)", () => {
    for (const fixture of corpus.fixtures) {
      if (fixture.kind !== "valid" || typeof fixture.payload !== "object") {
        continue;
      }
      const html = renderToStaticMarkup(
        <ContractObjectFields objectName={fixture.objectName} payload={fixture.payload} />,
      );
      for (const field of presentedFieldsOf(fixture.objectName)) {
        expect(html).toContain(`data-field="${field}"`);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Part 2 — discrimination: sabotage bindings FAIL explicit checks      */
/* ------------------------------------------------------------------ */

describe("PROD-017 sabotage discrimination (the binding is real, not golden)", () => {
  const honest = createBrowserConformanceBinding();

  test("an emission that drops an authoritative field fails C2/C3", () => {
    const sabotage: AdapterConformanceBinding = {
      ...honest,
      bindingId: "sabotage-drop-field",
      emit: (objectName, payload) => {
        const emitted = honest.emit(objectName, payload);
        if (objectName === "AuthorizationContext" && typeof emitted === "object") {
          const record = { ...(emitted as Record<string, unknown>) };
          delete record.denials; // dropping a required authoritative field
          return record;
        }
        return emitted;
      },
    };
    const report = runConformance(sabotage, corpus);
    expect(report.passed).toBe(false);
    const c2 = report.checks.find((check) => check.checkId === "C2");
    const c3 = report.checks.find((check) => check.checkId === "C3");
    expect(c2?.passed).toBe(false);
    expect(c3?.passed).toBe(false);
  });

  test("a presentation that hides denials fails C5 and C7", () => {
    const sabotage: AdapterConformanceBinding = {
      ...honest,
      bindingId: "sabotage-hide-denials",
      presentedFields: (objectName, payload) =>
        objectName === "AuthorizationContext"
          ? (Object.keys(payload as object) as readonly string[]).filter(
              (field) => field !== "denials",
            )
          : honest.presentedFields(objectName, payload),
    };
    const report = runConformance(sabotage, corpus);
    expect(report.passed).toBe(false);
    const c5 = report.checks.find((check) => check.checkId === "C5");
    const c7 = report.checks.find((check) => check.checkId === "C7");
    expect(c5?.passed).toBe(false);
    expect(c7?.passed).toBe(false);
  });

  test("a presentation that hides the operation failure fails C8", () => {
    const sabotage: AdapterConformanceBinding = {
      ...honest,
      bindingId: "sabotage-hide-failure",
      presentedFields: (objectName, payload) =>
        objectName === "OperationResult"
          ? (Object.keys(payload as object) as readonly string[]).filter(
              (field) => field !== "failure",
            )
          : honest.presentedFields(objectName, payload),
    };
    const report = runConformance(sabotage, corpus);
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.checkId === "C8")?.passed).toBe(false);
  });

  test("a presentation that hides blocked-action blockers fails C9", () => {
    const sabotage: AdapterConformanceBinding = {
      ...honest,
      bindingId: "sabotage-hide-blockers",
      presentedFields: (objectName, payload) =>
        objectName === "NextBestAction"
          ? (Object.keys(payload as object) as readonly string[]).filter(
              (field) => field !== "blockers",
            )
          : honest.presentedFields(objectName, payload),
    };
    const report = runConformance(sabotage, corpus);
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.checkId === "C9")?.passed).toBe(false);
  });

  test("a mode claim the profile does not support fails C6", () => {
    const sabotage: AdapterConformanceBinding = {
      ...honest,
      bindingId: "sabotage-dishonest-mode",
      supportedInteractionModes: () => ["gesture", "voice-command"],
    };
    const report = runConformance(sabotage, corpus);
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.checkId === "C6")?.passed).toBe(false);
  });

  test("the golden lossless template still passes (the harness baseline)", () => {
    const report = runConformance(createLosslessBinding(BROWSER_ADAPTER_PROFILE), corpus);
    expect(report.passed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Part 3 — the platform-specific 12-item client conformance suite      */
/* ------------------------------------------------------------------ */

describe("PROD-017 client conformance suite (the 12 platform items)", () => {
  const bundle = demoTaskFlowBundle();
  const binding = createBrowserConformanceBinding();

  test("1. project open/create — the open-project journey step + the create path exist", () => {
    // Open: the journey's first step routes to the projects surface; the
    // current task's project context identifies the opened project.
    expect(bundle.context?.projectId).toBe("proj-7f3a2b");
    // Create: the Projects surface's write path (createProjectLive) is
    // exercised end-to-end in golden-journey.test.ts (the real entrypoint);
    // here we pin the task-first framing: the create intent is a typed
    // TaskIntent (W-R3 builder covered in task-intents.test.ts).
    expect(typeof createBrowserConformanceBinding).toBe("function");
  });

  test("2. task selection — the advisory task-type vocabulary is offered and authored", async () => {
    const { taskIntentFromSelection } = await import("./create-forms");
    const intent = taskIntentFromSelection(
      {
        projectRef: "proj-7f3a2b",
        taskType: "evidence-review",
        intent: "Review the cracked-masonry evidence and its gaps.",
        targetRefs: ["case-91ab"],
        parameters: {},
      },
      { taskId: "task-conformance-2", createdAt: "2026-01-15T09:25:00.000Z" },
    );
    const decoded = binding.emit("TaskIntent", intent as unknown as object);
    expect(decoded).toEqual(intent);
  });

  test("3. evidence inspection — the evidence summary's items, ids and gaps render", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="EvidenceSummary" payload={bundle.evidence} />,
    );
    expect(html).toContain("totalItems");
    expect(html).toContain("evidenceContentIds");
    expect(html).toContain("gaps");
    expect(html).toContain("gap-4471");
    expect(html).toContain("MISSING");
  });

  test("4. next-best-action rendering — actionable AND blocked both render verbatim", async () => {
    const { NextBestActionPanel } = await import("./task-first");
    const { taskFlowView } = await import("./task-flow");
    const view = taskFlowView(bundle, "proj-7f3a2b");
    const html = renderToStaticMarkup(<NextBestActionPanel view={view} mode="demo" />);
    expect(html).toContain("blocked");
    expect(html).toContain("capability-blocked");
    expect(html).toContain("authorization-denied");
    // The prompt and blocker details are rendered VERBATIM.
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("missing-permission");
  });

  test("5. evidence submission — the picker's submission intent is a typed TaskIntent", async () => {
    const { taskIntentForEvidenceSubmission } = await import("./evidence-picker");
    const intent = taskIntentForEvidenceSubmission(
      ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
      "proj-7f3a2b",
      "the cracked-masonry case",
      { taskId: "task-conformance-5", createdAt: "2026-01-15T09:30:00.000Z" },
    );
    expect(intent.taskType).toBe("field-capture");
    expect(binding.emit("TaskIntent", intent as unknown as object)).toEqual(intent);
  });

  test("6. BOQ item inspection — the BOQ context renders with source-of-record identity", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="BOQContext" payload={bundle.boq} />,
    );
    expect(html).toContain("boqId");
    expect(html).toContain("sourceSystem");
    expect(html).toContain("ERP-BOQ-2026-0042");
    expect(html).toContain("lineItemCount");
  });

  test("7. Engineering Case inspection/update — the case summary renders verbatim", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="EngineeringCaseSummary" payload={bundle.caseSummary} />,
    );
    expect(html).toContain("case-91ab");
    expect(html).toContain("under-review");
    expect(html).toContain("observationCount");
  });

  test("8. intervention state inspection — PROPOSED stays PROPOSED (never upgraded)", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields
        objectName="InterventionScenarioSummary"
        payload={bundle.scenario}
      />,
    );
    expect(html).toContain("PROPOSED");
    expect(html).toContain("pending-review");
  });

  test("9. outcome comparison — OBSERVED stays OBSERVED with post-work evidence", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="OutcomeSummary" payload={bundle.outcome} />,
    );
    expect(html).toContain("OBSERVED");
    expect(html).toContain("comparisonAvailable");
    expect(html).toContain("postWorkEvidenceContentIds");
  });

  test("10. authorization denial — denials surface with reason codes verbatim", async () => {
    const { AuthorizationPanel } = await import("./task-first");
    const { taskFlowView } = await import("./task-flow");
    const view = taskFlowView(bundle, "proj-7f3a2b");
    const html = renderToStaticMarkup(<AuthorizationPanel view={view} />);
    expect(html).toContain("reality:write");
    expect(html).toContain("missing-permission");
    expect(html).toContain("forbidden-role");
  });

  test("11. unavailable provider/failure state — the typed failure renders verbatim", async () => {
    const { OperationResultNote } = await import("./task-first");
    const { operationResultView } = await import("./task-flow");
    const view = operationResultView(demoFailedOperationResult());
    const html = renderToStaticMarkup(<OperationResultNote operation={view} />);
    expect(html).toContain("failed");
    expect(html).toContain("provider-unavailable");
    expect(html).toContain("reconstruction provider is currently unavailable");
  });

  test("12. offline/resume — honestly NOT SUPPORTED on this browser adapter (no resumable queue)", () => {
    // The declared profile's offline storage is a session cache — no
    // bounded queue, no resumable capture. The conformance discipline:
    // unknown/absent is never conflated with supported; the adapter claims
    // NO offline-queue interaction mode (C6 would fail if it did).
    expect(BROWSER_ADAPTER_PROFILE.offlineStorage.mode).toBe("session-cache");
    expect(BROWSER_IMPLEMENTED_INTERACTION_MODES).not.toContain("offline-queue");
    expect(
      deriveInteractionModes(BROWSER_ADAPTER_PROFILE).includes("offline-queue"),
    ).toBe(false);
  });

  test("negotiation honesty: the browser is BLOCKED for depth capture, PERMITTED for BOQ review", () => {
    const blocked = negotiateBrowserTask(REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS);
    expect(blocked.outcome).toBe("blocked");
    expect(blocked.permittedInteractionModes).toEqual([]);
    const permitted = negotiateBrowserTask(REFERENCE_BOQ_REVIEW_REQUIREMENTS);
    expect(permitted.outcome).toBe("permitted");
  });
});
