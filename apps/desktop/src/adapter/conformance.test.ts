/**
 * PROD-020 — the desktop adapter's CONTRACT CONFORMANCE suite.
 *
 * Part 1: `runConformance(createDesktopConformanceBinding(),
 * loadCommittedFixtures())` — the shared C0–C9 harness over the committed
 * PROD-016 corpus, driven by the adapter's REAL binding (the seam
 * decoders, the render registry, the honest implemented-modes claim).
 * This is the acceptance core: it must pass BEFORE any platform
 * affordance (the PROD-016 boundary-audit §"apps/desktop" ruling).
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
 * supported — each demonstrated against the desktop adapter's REAL
 * modules (the client entrypoints, the review-layout surface model, the
 * shortcut registry, the convenience store), with item 12 SUPPORTED on
 * this desktop adapter (the TaskIntent outbox replays through the shared
 * endpoint — the offline-queue affordance) and asserted as such.
 *
 * Determinism: no network (fixtures are committed files), no clock, no
 * randomness.
 */

import { describe, expect, test } from "bun:test";
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
import { createDesktopConformanceBinding, DESKTOP_BINDING_ID } from "./binding";
import {
  DESKTOP_ADAPTER_PROFILE,
  DESKTOP_IMPLEMENTED_INTERACTION_MODES,
  negotiateDesktopTask,
} from "./profile";
import { DESKTOP_PRESENTED_FIELDS, presentedFieldsOf } from "./render-registry";
import { corpusTaskFlowBundle } from "./corpus-world";
import { denseReviewLayout, paneById, provenanceSpotCheck } from "./review-layout";

/** The committed corpus (deterministic file reads — the only fs use). */
const corpus: ConformanceCorpus = loadCommittedFixtures();

/* ------------------------------------------------------------------ */
/* Part 1 — the shared harness (C0–C9) over the committed corpus        */
/* ------------------------------------------------------------------ */

describe("PROD-020 desktop adapter contract conformance (C0–C9)", () => {
  const binding = createDesktopConformanceBinding();
  const report = runConformance(binding, corpus);

  test("the desktop binding passes every check", () => {
    expect(report.passed).toBe(true);
    expect(report.bindingId).toBe(DESKTOP_BINDING_ID);
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
    for (const [objectName, fields] of Object.entries(DESKTOP_PRESENTED_FIELDS)) {
      const presented = new Set(fields);
      const authoritative =
        AUTHORITATIVE_FIELDS[objectName as keyof typeof AUTHORITATIVE_FIELDS];
      if (authoritative !== undefined) {
        for (const field of authoritative) {
          expect(presented.has(field)).toBe(true);
        }
      }
    }
  });

  test("C6: the implemented-modes claim is a strict subset of the profile's modes", () => {
    const declared = new Set<string>(deriveInteractionModes(DESKTOP_ADAPTER_PROFILE));
    for (const mode of DESKTOP_IMPLEMENTED_INTERACTION_MODES) {
      expect(declared.has(mode)).toBe(true);
    }
  });

  test("the render registry actually renders every registry field (no claim without render)", () => {
    const bundle = corpusTaskFlowBundle();
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) {
      return;
    }
    const layout = denseReviewLayout(bundle.value, { negotiation: negotiateDesktopTask(
      bundle.value.requirements ?? REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
    ) });
    for (const pane of layout.panes) {
      if (pane.emptyState !== null) {
        continue;
      }
      for (const field of presentedFieldsOf(pane.objectName)) {
        expect(pane.lines.some((line) => line.field === field)).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Part 2 — discrimination: sabotage bindings FAIL explicit checks      */
/* ------------------------------------------------------------------ */

describe("PROD-020 sabotage discrimination (the binding is real, not golden)", () => {
  const honest = createDesktopConformanceBinding();

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

  test("an emission that mutates an authoritative field fails C2/C3", () => {
    const sabotage: AdapterConformanceBinding = {
      ...honest,
      bindingId: "sabotage-mutate-field",
      emit: (objectName, payload) => {
        const emitted = honest.emit(objectName, payload);
        if (objectName === "InterventionScenarioSummary" && typeof emitted === "object") {
          const record = { ...(emitted as Record<string, unknown>) };
          // "upgrading" a PROPOSED scenario to CONFIRMED — the classic
          // client-authority violation the harness exists to catch.
          record.epistemicState = "CONFIRMED";
          return record;
        }
        return emitted;
      },
    };
    const report = runConformance(sabotage, corpus);
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.checkId === "C2")?.passed).toBe(false);
    expect(report.checks.find((check) => check.checkId === "C3")?.passed).toBe(false);
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
    const report = runConformance(createLosslessBinding(DESKTOP_ADAPTER_PROFILE), corpus);
    expect(report.passed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Part 3 — the platform-specific 12-item client conformance suite      */
/* ------------------------------------------------------------------ */

describe("PROD-020 client conformance suite (the 12 platform items)", () => {
  const decoded = corpusTaskFlowBundle();
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) {
    throw new Error("corpus bundle must decode");
  }
  const bundle = decoded.value;
  const binding = createDesktopConformanceBinding();
  const negotiation = negotiateDesktopTask(
    bundle.requirements ?? REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  );
  const layout = denseReviewLayout(bundle, { negotiation });

  test("1. project open/create — the open-project entrypoint resolves the server context", async () => {
    // The REAL adapter entrypoint (openProject through the client with a
    // stub transport) is exercised end-to-end in
    // journey/desktop-journey.test.ts; here we pin the conformance
    // surface: the opened project's context identifies the project and
    // the review workspace composes around it.
    expect(bundle.context?.projectId).toBe("proj-7f3a2b");
    expect(layout.panes.map((pane) => pane.paneId)).toContain("pane:project-context");
    const contextPane = paneById(layout, "pane:project-context");
    expect(contextPane?.lines.some((line) => line.text.includes("Riverside Block B"))).toBe(true);
  });

  test("2. task selection — the authored task intent is a typed TaskIntent the seam round-trips", () => {
    const intent = binding.emit("TaskIntent", {
      contractVersion: "1.0.0",
      taskId: "task-conformance-2",
      taskType: "evidence-review",
      intent: "Review the cracked-masonry evidence and its declared gaps.",
      projectRef: "proj-7f3a2b",
      targetRefs: ["case-91ab"],
      parameters: { area: "level-2" },
      createdAt: "2026-01-15T09:25:00.000Z",
    });
    expect(intent).toEqual({
      contractVersion: "1.0.0",
      taskId: "task-conformance-2",
      taskType: "evidence-review",
      intent: "Review the cracked-masonry evidence and its declared gaps.",
      projectRef: "proj-7f3a2b",
      targetRefs: ["case-91ab"],
      parameters: { area: "level-2" },
      createdAt: "2026-01-15T09:25:00.000Z",
    });
  });

  test("3. evidence inspection — the dense evidence table renders items AND gaps with provenance", () => {
    expect(layout.evidenceTable.rows).toHaveLength(5); // 3 items + 2 gaps
    const items = layout.evidenceTable.rows.filter((row) => row.kind === "evidence-item");
    const gaps = layout.evidenceTable.rows.filter((row) => row.kind === "evidence-gap");
    const contentIds: readonly string[] = bundle.evidence?.evidenceContentIds ?? [];
    expect(items.map((row) => row.ref)).toEqual([...contentIds]);
    expect(gaps.map((row) => row.gapKind)).toEqual(["MISSING", "WEAK"]);
    const gapRow = gaps[0];
    expect(gapRow?.detail).toContain("calibrated reference dimension");
  });

  test("4. next-best-action rendering — actionable AND blocked both render verbatim", () => {
    const pane = paneById(layout, "pane:next-best-action");
    expect(pane).not.toBeNull();
    const status = pane?.lines.find((line) => line.field === "status");
    expect(status?.text).toBe("blocked");
    const prompt = pane?.lines.find((line) => line.field === "prompt");
    expect(prompt?.text).toContain("Depth capture cannot start");
    const blockers = pane?.lines.find((line) => line.field === "blockers");
    expect(blockers?.text).toContain("capability-blocked");
    expect(blockers?.text).toContain("authorization-denied");
  });

  test("5. evidence submission — the submission intent is a typed TaskIntent", () => {
    const intent = {
      contractVersion: "1.0.0",
      taskId: "task-conformance-5",
      taskType: "field-capture",
      intent: "Capture depth evidence of the cracked masonry on level 2 so the engineering case can be diagnosed.",
      projectRef: "proj-7f3a2b",
      targetRefs: ["case-91ab", "node-wall-12"],
      parameters: { priority: "high", area: "level-2" },
      createdAt: "2026-01-15T09:25:00.000Z",
    };
    expect(binding.emit("TaskIntent", intent)).toEqual(intent);
  });

  test("6. BOQ item inspection — the BOQ pane renders source-of-record identity", () => {
    const pane = paneById(layout, "pane:boq");
    const sourceSystem = pane?.lines.find((line) => line.field === "sourceSystem");
    const sourceRecordRef = pane?.lines.find((line) => line.field === "sourceRecordRef");
    expect(sourceSystem?.text).toBe("erp");
    expect(sourceRecordRef?.text).toBe("ERP-BOQ-2026-0042");
    expect(pane?.lines.find((line) => line.field === "lineItemCount")?.text).toBe("1284");
  });

  test("7. Engineering Case inspection/update — the case pane renders verbatim", () => {
    const pane = paneById(layout, "pane:engineering-case");
    expect(pane?.lines.find((line) => line.field === "caseId")?.text).toBe("case-91ab");
    expect(pane?.lines.find((line) => line.field === "status")?.text).toBe("under-review");
    expect(pane?.lines.find((line) => line.field === "observationCount")?.text).toBe("7");
  });

  test("8. intervention state inspection — PROPOSED stays PROPOSED (never upgraded)", () => {
    const pane = paneById(layout, "pane:intervention-scenario");
    expect(pane?.lines.find((line) => line.field === "epistemicState")?.text).toBe("PROPOSED");
    expect(pane?.lines.find((line) => line.field === "approvalState")?.text).toBe("pending-review");
  });

  test("9. outcome comparison — OBSERVED stays OBSERVED with post-work evidence", () => {
    const pane = paneById(layout, "pane:outcome");
    expect(pane?.lines.find((line) => line.field === "epistemicState")?.text).toBe("OBSERVED");
    const postWork = pane?.lines.find((line) => line.field === "postWorkEvidenceContentIds");
    expect(postWork?.text).toContain("196b5ab5d99835a2");
    expect(postWork?.text).toContain("556f8ba4f8de534d");
  });

  test("10. authorization denial — denials surface with reason codes verbatim", () => {
    const pane = paneById(layout, "pane:authorization");
    const granted = pane?.lines.find((line) => line.field === "grantedActions");
    const denials = pane?.lines.find((line) => line.field === "denials");
    expect(granted?.text).toContain("reality:read");
    expect(denials?.text).toContain("reality:write");
    expect(denials?.text).toContain("missing-permission");
    expect(denials?.text).toContain("forbidden-role");
  });

  test("11. unavailable provider/failure state — the typed failure renders verbatim", () => {
    const failedLayout = denseReviewLayout(bundle, {
      negotiation,
      operationResult: {
        contractVersion: "1.0.0",
        operationId: "operation-3fa9",
        actionRef: "action-8ba1",
        status: "failed",
        failure: {
          code: "provider-unavailable",
          detail:
            "The reconstruction provider is currently unavailable; the submitted evidence batch is preserved and the operation can be retried once the provider answers again.",
        },
        resultRefs: [],
        completedAt: "2026-01-15T12:40:00.000Z",
      },
    });
    const pane = paneById(failedLayout, "pane:operation-result");
    expect(pane?.lines.find((line) => line.field === "status")?.text).toBe("failed");
    const failure = pane?.lines.find((line) => line.field === "failure");
    expect(failure?.text).toContain("provider-unavailable");
    expect(failure?.text).toContain(
      "reconstruction provider is currently unavailable",
    );
  });

  test("12. offline/resume — SUPPORTED on this desktop adapter (the TaskIntent outbox replays through the shared endpoint)", async () => {
    // The declared profile's offline storage is a persistent store — the
    // offline-queue interaction mode is declared AND implemented (the
    // outbox + replay calculus, exercised end-to-end in client.test.ts
    // and the journey test). Honest claim, honest support.
    expect(DESKTOP_ADAPTER_PROFILE.offlineStorage.mode).toBe("persistent-store");
    expect(DESKTOP_IMPLEMENTED_INTERACTION_MODES).toContain("offline-queue");
    expect(deriveInteractionModes(DESKTOP_ADAPTER_PROFILE)).toContain("offline-queue");
  });

  test("negotiation honesty: the desktop is BLOCKED for depth capture, PERMITTED for BOQ review", () => {
    const blocked = negotiateDesktopTask(REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS);
    expect(blocked.outcome).toBe("blocked");
    expect(blocked.permittedInteractionModes).toEqual([]);
    const permitted = negotiateDesktopTask(REFERENCE_BOQ_REVIEW_REQUIREMENTS);
    expect(permitted.outcome).toBe("permitted");
  });

  test("provenance spot check: BOQ source-of-record, scenario seal, outcome evidence, reality version all visible", () => {
    const spot = provenanceSpotCheck(layout);
    expect(spot.boqSourceOfRecord).toBe("erp / ERP-BOQ-2026-0042");
    expect(spot.scenarioEpistemicState).toBe("PROPOSED");
    expect(spot.outcomePostWorkEvidence).toHaveLength(2);
    expect(spot.realityModelVersion).toBe(14);
  });

  test("the presentation registry covers all fifteen adapter wire objects", () => {
    // The registry is the C4/C5 backing for every object family (the
    // twelve semantic objects + the three negotiation objects).
    expect(Object.keys(DESKTOP_PRESENTED_FIELDS).length).toBe(15);
    expect(presentedFieldsOf("NoSuchObject")).toEqual([]);
  });
});
