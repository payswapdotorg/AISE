/**
 * AISE-026 — Intervention service tests. THE POLICY ENGINE.
 *
 * THE CRITICAL MATRIX, part 3: baseline pinning (states always materialize
 * from the PINNED version even when newer versions exist), append-only
 * steps/states with byte-identical incremental-vs-replayed determinism,
 * the governed status machine (approval reference REQUIRED before
 * approved — the mutation test; superseded terminal; terminal scenarios
 * immutable), verbatim approval references (never interpreted) and the
 * read/list/getState surfaces with typed not-found codes.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { InterventionError, type InterventionErrorCode } from "./model";
import { materializeState } from "./projection";
import { InterventionService } from "./service";
import { FsInterventionStore, InMemoryInterventionStore } from "./store";
import {
  EV_FIRE_SPEC,
  FIXED_APPROVAL,
  FIXED_NOW,
  PROJECT_ID,
  SCENARIO_ID,
  STEP_FIRE_RATING,
  STEP_NOTE,
  buildBaselineStorey,
  buildLaterBaseline,
  emptyBaselineResolver,
  fixedClock,
  makeBaselineResolver,
  runCanonicalScenario,
  withTempDir,
} from "./testkit";

async function expectCode(fn: () => Promise<unknown>, code: InterventionErrorCode): Promise<void> {
  try {
    await fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(InterventionError);
    expect((error as InterventionError).code).toBe(code);
  }
}

/** Service over the resolver serving BOTH v001 and v002 (v002 latest). */
function pinnedService(): InterventionService {
  return new InterventionService({
    store: new InMemoryInterventionStore(),
    clock: fixedClock,
    baselineResolver: makeBaselineResolver(PROJECT_ID, [
      buildBaselineStorey(),
      buildLaterBaseline(),
    ]),
  });
}

const CREATE_INPUT = {
  scenarioId: SCENARIO_ID,
  projectId: PROJECT_ID,
  title: "Office refit — fire upgrade, partition and demolition",
  baselineVersionId: "v001",
} as const;

describe("intervention service: scenario creation and baseline pinning", () => {
  test("createScenario pins the baseline and materializes layer 0", async () => {
    const service = pinnedService();
    const record = await service.createScenario({ ...CREATE_INPUT });
    expect(record.scenarioId).toBe(SCENARIO_ID);
    expect(record.status).toBe("draft");
    expect(record.steps).toEqual([]);
    expect(record.states).toHaveLength(1);
    expect(record.states[0]?.stateIndex).toBe(0);
    expect(record.states[0]?.baselineVersionId).toBe("v001");
    expect(record.states[0]?.nodes).toHaveLength(8);
    expect(record.transitions).toEqual([{ status: "draft", at: FIXED_NOW }]);
    expect(record.createdAt).toBe(FIXED_NOW);
  });

  test("duplicate scenario ids refuse (scenario_exists)", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await expectCode(() => service.createScenario({ ...CREATE_INPUT }), "scenario_exists");
  });

  test("an unresolvable baseline refuses (baseline_not_found) — no silent empty state", async () => {
    const service = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
      baselineResolver: emptyBaselineResolver(),
    });
    await expectCode(() => service.createScenario({ ...CREATE_INPUT }), "baseline_not_found");
    const noResolver = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
    });
    await expectCode(() => noResolver.createScenario({ ...CREATE_INPUT }), "baseline_not_found");
  });

  test("a resolver returning a different version refuses (baseline_mismatch)", async () => {
    const service = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
      // Resolver answers ANY version request with v002 — the pin check
      // must refuse rather than silently materializing the wrong baseline.
      baselineResolver: {
        resolveBaseline: async () => buildLaterBaseline(),
      },
    });
    await expectCode(() => service.createScenario({ ...CREATE_INPUT }), "baseline_mismatch");
  });

  test("states materialize from the PINED version even when newer versions exist", async () => {
    const service = pinnedService();
    const record = await runCanonicalScenario(service);
    // v002 exists (and is "latest"): wall-north thickness 300, wall-west added.
    const later = buildLaterBaseline();
    expect(later.nodes.find((node) => node.nodeId === "wall-west")).toBeDefined();
    // Every state of the scenario is pinned to v001 content.
    for (const state of record.states) {
      expect(state.baselineVersionId).toBe("v001");
      expect(state.nodes.find((entry) => entry.nodeId === "wall-west")).toBeUndefined();
      const thickness = state.nodes
        .find((entry) => entry.nodeId === "wall-north")
        ?.node.properties.find((p) => p.key === "thickness");
      expect(thickness?.value).toBe(240);
    }
    // Layer 0 IS the v001 baseline overlay (never v002).
    expect(record.states[0]?.nodes.map((entry) => entry.nodeId)).toContain("wall-east");
  });

  test("an inline caller-supplied baseline snapshot is accepted (in-process path)", async () => {
    const service = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
      baselineResolver: emptyBaselineResolver(),
    });
    const record = await service.createScenario({
      ...CREATE_INPUT,
      baseline: buildBaselineStorey(),
    });
    expect(record.states[0]?.nodes).toHaveLength(8);
    await expectCode(
      () =>
        service.createScenario({
          ...CREATE_INPUT,
          scenarioId: "scenario-bad-pin",
          baseline: buildLaterBaseline(),
        }),
      "baseline_mismatch",
    );
  });
});

describe("intervention service: addStep and determinism", () => {
  test("addStep appends the step and materializes the NEXT state immutably", async () => {
    const service = pinnedService();
    const record = await runCanonicalScenario(service);
    expect(record.steps).toHaveLength(3);
    expect(record.steps.map((step) => step.stepIndex)).toEqual([1, 2, 3]);
    expect(record.states).toHaveLength(4);
    // Prior states are unchanged snapshots (append-only): reading twice
    // yields identical bytes.
    const first = await service.getState(SCENARIO_ID, 2);
    const again = await service.getState(SCENARIO_ID, 2);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(again));
    // The step ids are content-derived (sha-prefix) and clock-free.
    for (const step of record.steps) {
      expect(step.stepId).toMatch(/^step-[0-9a-f]{16}$/);
      expect(step.recordedAt).toBe(FIXED_NOW);
    }
  });

  test("incremental materialization ≡ from-scratch replay (byte-identical)", async () => {
    const service = pinnedService();
    const record = await runCanonicalScenario(service);
    const replayed = materializeState({
      scenarioId: SCENARIO_ID,
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
      steps: record.steps,
      materializedAt: FIXED_NOW,
    });
    expect(canonicalJsonStringify(replayed)).toBe(
      canonicalJsonStringify(record.states[record.states.length - 1]),
    );
  });

  test("byte-identical determinism across two fresh stores (same ops + clock)", async () => {
    await withTempDir(async (rootA) => {
      await withTempDir(async (rootB) => {
        const serviceA = new InterventionService({
          store: new FsInterventionStore(join(rootA, "data")),
          clock: fixedClock,
          baselineResolver: makeBaselineResolver(PROJECT_ID, [buildBaselineStorey()]),
        });
        const serviceB = new InterventionService({
          store: new FsInterventionStore(join(rootB, "data")),
          clock: fixedClock,
          baselineResolver: makeBaselineResolver(PROJECT_ID, [buildBaselineStorey()]),
        });
        const recordA = await runCanonicalScenario(serviceA);
        await runCanonicalScenario(serviceB);
        const pathA = new FsInterventionStore(join(rootA, "data")).pathOf(SCENARIO_ID);
        const pathB = new FsInterventionStore(join(rootB, "data")).pathOf(SCENARIO_ID);
        expect(readFileSync(pathA, "utf8")).toBe(readFileSync(pathB, "utf8"));
        expect(recordA.states[3]?.stateId).toMatch(/^[0-9a-f]{64}$/);
      });
    });
  });

  test("re-adding identical step content creates a NEW layer (ids differ by position)", async () => {
    const service = pinnedService();
    await runCanonicalScenario(service);
    const before = (await service.getScenario(SCENARIO_ID))?.states.length;
    const { step } = await service.addStep(SCENARIO_ID, STEP_FIRE_RATING);
    expect(step.stepIndex).toBe(4);
    expect((await service.getScenario(SCENARIO_ID))?.states.length).toBe((before ?? 0) + 1);
  });

  test("unknown node refs refuse through the service, naming the id", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await expectCode(
      () =>
        service.addStep(SCENARIO_ID, {
          ...STEP_FIRE_RATING,
          targetNodeId: "wall-ghost-42",
        }),
      "unknown_node_ref",
    );
    // The scenario is unchanged after the refusal (no partial writes).
    const record = await service.getScenario(SCENARIO_ID);
    expect(record?.steps).toHaveLength(0);
    expect(record?.states).toHaveLength(1);
  });

  test("steps are validated by the service boundary too (parser-equivalent discipline)", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await expectCode(
      () =>
        service.addStep(SCENARIO_ID, {
          ...STEP_NOTE,
          provenance: { evidenceIds: [] },
        }),
      "missing_provenance",
    );
    await expectCode(
      () =>
        service.addStep(SCENARIO_ID, {
          kind: "property_change",
          targetNodeId: "wall-north",
          change: {
            kind: "property_change",
            property: { key: "thickness", value: 999 },
          },
          provenance: { evidenceIds: [EV_FIRE_SPEC] },
        }),
      "numeric_value_without_unit",
    );
  });

  test("steps still append while under_review; terminal scenarios refuse (scenario_terminal)", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await service.transitionStatus(SCENARIO_ID, "under_review");
    const { step } = await service.addStep(SCENARIO_ID, STEP_NOTE);
    expect(step.stepIndex).toBe(1);
    await service.recordApprovalReference(SCENARIO_ID, {
      caseId: "case-7",
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    });
    await service.transitionStatus(SCENARIO_ID, "approved");
    await expectCode(() => service.addStep(SCENARIO_ID, STEP_NOTE), "scenario_terminal");
    await expectCode(
      () =>
        service.recordApprovalReference(SCENARIO_ID, {
          caseId: "case-8",
          reviewDecision: "approved",
          reviewedAt: FIXED_APPROVAL,
        }),
      "scenario_terminal",
    );
  });
});

describe("intervention service: governed status machine (R12 approval gate)", () => {
  test("draft → under_review → approved requires an approval reference (MUTATION test)", async () => {
    const service = pinnedService();
    await runCanonicalScenario(service);
    // draft → approved is illegal (must pass the review gate first).
    await expectCode(() => service.transitionStatus(SCENARIO_ID, "approved"), "invalid_status_transition");
    await service.transitionStatus(SCENARIO_ID, "under_review");
    // under_review → approved WITHOUT a reference: typed refusal.
    await expectCode(() => service.transitionStatus(SCENARIO_ID, "approved"), "approval_reference_required");
    // THE MUTATION: record the reference → the same call now succeeds.
    await service.recordApprovalReference(SCENARIO_ID, {
      caseId: "case-review-9",
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    });
    const approved = await service.transitionStatus(SCENARIO_ID, "approved");
    expect(approved.status).toBe("approved");
    expect(approved.approvalReference).toEqual({
      caseId: "case-review-9",
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    });
    expect(approved.transitions.map((entry) => entry.status)).toEqual([
      "draft",
      "under_review",
      "approved",
    ]);
  });

  test("the approval reference is recorded VERBATIM and never interpreted", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await service.transitionStatus(SCENARIO_ID, "under_review");
    // A foreign-decision string is stored verbatim — this module does not
    // know (and must not re-derive) the Case domain's decision vocabulary.
    const record = await service.recordApprovalReference(SCENARIO_ID, {
      caseId: "case-review-11",
      reviewDecision: "needs_more_evidence",
      reviewedAt: "2026-03-01T08:00:00.000Z",
    });
    expect(record.approvalReference).toEqual({
      caseId: "case-review-11",
      reviewDecision: "needs_more_evidence",
      reviewedAt: "2026-03-01T08:00:00.000Z",
    });
    // Presence alone gates approval — interpretation is the Case domain's.
    const approved = await service.transitionStatus(SCENARIO_ID, "approved");
    expect(approved.approvalReference?.reviewDecision).toBe("needs_more_evidence");
  });

  test("exactly one reference: re-recording refuses (approval_reference_exists)", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await service.recordApprovalReference(SCENARIO_ID, {
      caseId: "case-1",
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    });
    await expectCode(
      () =>
        service.recordApprovalReference(SCENARIO_ID, {
          caseId: "case-2",
          reviewDecision: "approved",
          reviewedAt: FIXED_APPROVAL,
        }),
      "approval_reference_exists",
    );
  });

  test("rejected and superseded paths; terminal statuses admit no transitions", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await service.transitionStatus(SCENARIO_ID, "under_review");
    const rejected = await service.transitionStatus(SCENARIO_ID, "rejected");
    expect(rejected.status).toBe("rejected");
    await expectCode(() => service.transitionStatus(SCENARIO_ID, "draft"), "invalid_status_transition");
    await expectCode(() => service.transitionStatus(SCENARIO_ID, "superseded"), "invalid_status_transition");

    const other = pinnedService();
    await other.createScenario({ ...CREATE_INPUT, scenarioId: "scenario-superseded-1" });
    const superseded = await other.transitionStatus("scenario-superseded-1", "superseded");
    expect(superseded.status).toBe("superseded");
    await expectCode(
      () => other.transitionStatus("scenario-superseded-1", "under_review"),
      "invalid_status_transition",
    );
    await expectCode(
      () => other.addStep("scenario-superseded-1", STEP_NOTE),
      "scenario_terminal",
    );

    const third = pinnedService();
    await third.createScenario({ ...CREATE_INPUT, scenarioId: "scenario-review-then-super" });
    await third.transitionStatus("scenario-review-then-super", "under_review");
    expect((await third.transitionStatus("scenario-review-then-super", "superseded")).status).toBe(
      "superseded",
    );
  });

  test("unknown status values refuse (invalid_status_transition)", async () => {
    const service = pinnedService();
    await service.createScenario({ ...CREATE_INPUT });
    await expectCode(
      () => service.transitionStatus(SCENARIO_ID, "finished" as never),
      "invalid_status_transition",
    );
  });
});

describe("intervention service: reads and list projections", () => {
  test("getScenario returns null for unknown ids; getState throws typed codes", async () => {
    const service = pinnedService();
    expect(await service.getScenario("scenario-none")).toBeNull();
    await expectCode(() => service.getState("scenario-none", 0), "scenario_not_found");
    await runCanonicalScenario(service);
    expect((await service.getState(SCENARIO_ID, "latest")).stateIndex).toBe(3);
    expect((await service.getState(SCENARIO_ID, 0)).stateIndex).toBe(0);
    expect((await service.getState(SCENARIO_ID, 3)).stateIndex).toBe(3);
    await expectCode(() => service.getState(SCENARIO_ID, 4), "state_not_found");
    await expectCode(() => service.getState(SCENARIO_ID, -1), "invalid_state_index");
    await expectCode(() => service.getState(SCENARIO_ID, 1.5), "invalid_state_index");
  });

  test("listScenarios returns sorted summaries with counts", async () => {
    const service = pinnedService();
    await runCanonicalScenario(service, "scenario-b-second");
    await runCanonicalScenario(service, "scenario-a-first");
    const summaries = await service.listScenarios();
    expect(summaries.map((summary) => summary.scenarioId)).toEqual([
      "scenario-a-first",
      "scenario-b-second",
    ]);
    expect(summaries[0]?.stepCount).toBe(3);
    expect(summaries[0]?.stateCount).toBe(4);
    expect(summaries[0]?.status).toBe("draft");
    expect(summaries[0]?.baselineVersionId).toBe("v001");
    expect(summaries[0]?.latestStateId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("invalid scenario ids refuse before any store access", async () => {
    const service = pinnedService();
    await expectCode(() => service.getScenario(""), "invalid_scenario_id");
    await expectCode(() => service.getState("x".repeat(257), 0), "invalid_scenario_id");
  });

  test("createScenario validates ids and version pins (typed 400-family codes)", async () => {
    const service = pinnedService();
    await expectCode(
      () =>
        service.createScenario({
          scenarioId: "",
          projectId: PROJECT_ID,
          title: "t",
          baselineVersionId: "v001",
        }),
      "invalid_scenario_id",
    );
    await expectCode(
      () =>
        service.createScenario({
          scenarioId: "s",
          projectId: "",
          title: "t",
          baselineVersionId: "v001",
        }),
      "invalid_project_id",
    );
    await expectCode(
      () =>
        service.createScenario({
          scenarioId: "s",
          projectId: PROJECT_ID,
          title: "t",
          baselineVersionId: "9",
        }),
      "invalid_version_id",
    );
  });
});
