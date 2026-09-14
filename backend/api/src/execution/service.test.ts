/**
 * AISE-031 — Execution/outcome service tests (the policy engine).
 *
 * Depth mandated by the work order: the governed path (approved
 * intervention only), reference resolution (unknown case/scenario/state/
 * step/evidence ids are typed refusals NAMING the id), state alignment,
 * the append-only discipline (events pin content digests; history is never
 * rewritten), the PROPOSED→EXECUTED projection, determinism (byte-identical
 * replay, content-derived ids), store twin parity, and the read-only
 * adapters over REAL sibling services.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { CaseService } from "../cases/service";
import { InMemoryCaseStore } from "../cases/store";
import { InterventionService } from "../intervention/service";
import { InMemoryInterventionStore } from "../intervention/store";
import {
  FIXED_APPROVAL as SCENARIO_APPROVAL,
  buildBaselineStorey,
  runCanonicalScenario,
} from "../intervention/testkit";
import { executionContentDigest } from "./model";
import {
  ExecutionService,
  readOnlyCaseContextResolver,
  readOnlyEvidenceMembershipResolver,
  readOnlyInterventionContextResolver,
} from "./service";
import { FsExecutionStore, InMemoryExecutionStore, type ExecutionStore } from "./store";
import {
  CANONICAL_EXECUTION,
  CASE_ID,
  EV_FIRE_CERT,
  EV_POSTWORK_PHOTO,
  EV_POSTWORK_SCAN,
  EV_THERMAL_CHECK,
  EV_WORK_PHOTOS,
  EXECUTION_ID,
  FIXED_EVEN_LATER,
  FIXED_EXECUTED,
  FIXED_LATER,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  SCENARIO_ID,
  SESSION_POSTWORK_1,
  SESSION_WORK_1,
  STATE_1_ID,
  STATE_2_ID,
  STATE_3_ID,
  STEP_FIRE_ID,
  STEP_PARTITION_ID,
  STEP_REMOVE_ID,
  buildCaseContext,
  buildScenarioContextWithStatus,
  canonicalResolvers,
  deepFreeze,
  evidenceIdOf,
  fixedClock,
  makeCaseContextResolver,
  makeEvidenceMembershipResolver,
  makeInterventionContextResolver,
  makeSequenceClock,
  runExecutionLifecycle,
  withTempDir,
} from "./testkit";

/** A service over the canonical read-only resolvers + a given store/clock. */
function makeService(store: ExecutionStore, clock: () => string = fixedClock): ExecutionService {
  return new ExecutionService({ store, clock, ...canonicalResolvers() });
}

async function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await expect(action()).rejects.toMatchObject({ code });
}

/** A 64-hex id that is NOT any canonical fixture id. */
const GHOST_STATE_ID = sha256Hex("execution-test-ghost-state");
const GHOST_STEP_ID = `step-${"f".repeat(16)}`;

/* ------------------------------------------------------------------ */
/* The governed path + reference resolution                             */
/* ------------------------------------------------------------------ */

describe("execution service: recordExecution (governed path)", () => {
  test("happy path: approved scenario + aligned state + evidence → record with embedded transition", async () => {
    const service = makeService(new InMemoryExecutionStore());
    const record = await service.recordExecution(CANONICAL_EXECUTION);
    expect(record.executionRecordId).toBe(EXECUTION_ID);
    expect(record.caseId).toBe(CASE_ID);
    expect(record.scenarioId).toBe(SCENARIO_ID);
    expect(record.stateId).toBe(STATE_3_ID);
    expect(record.executedStepIds).toEqual([STEP_FIRE_ID, STEP_PARTITION_ID, STEP_REMOVE_ID]);
    expect(record.evidenceIds).toEqual([EV_WORK_PHOTOS, EV_FIRE_CERT]);
    expect(record.captureSessionIds).toEqual([SESSION_WORK_1]);
    expect(record.outcomes).toEqual([]);
    // THE STATE TRANSITION RECORD (projection discipline):
    expect(record.stateTransition).toEqual({
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      fromStatus: "PROPOSED",
      toStatus: "EXECUTED",
      executionRecordId: EXECUTION_ID,
      evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
      recordedAt: FIXED_NOW,
    });
    // Append-only audit: exactly one event pinning the content digest.
    expect(record.history).toHaveLength(1);
    expect(record.history[0]?.eventType).toBe("execution_recorded");
    expect(record.history[0]?.eventId).toBe("evt-000001");
    expect(record.history[0]?.recordDigest).toBe(executionContentDigest(record));
  });

  test("non-approved scenarios refuse with scenario_not_approved naming the scenario", async () => {
    for (const status of ["draft", "under_review", "rejected", "superseded"]) {
      const service = new ExecutionService({
        store: new InMemoryExecutionStore(),
        clock: fixedClock,
        interventionContextResolver: makeInterventionContextResolver([
          buildScenarioContextWithStatus(status),
        ]),
        caseContextResolver: makeCaseContextResolver([buildCaseContext()]),
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      });
      const error = await service
        .recordExecution(CANONICAL_EXECUTION)
        .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
      expect(error?.code).toBe("scenario_not_approved");
      expect(error?.detail).toContain(SCENARIO_ID);
      expect(error?.detail).toContain(status);
    }
  });

  test("unknown case/scenario references refuse naming the id (case checked first)", async () => {
    const empty = new ExecutionService({
      store: new InMemoryExecutionStore(),
      clock: fixedClock,
      interventionContextResolver: makeInterventionContextResolver([]),
      caseContextResolver: makeCaseContextResolver([]),
      evidenceMembershipResolver: makeEvidenceMembershipResolver([]),
    });
    await expectCode(() => empty.recordExecution(CANONICAL_EXECUTION), "unknown_case_ref");
    const onlyCase = new ExecutionService({
      store: new InMemoryExecutionStore(),
      clock: fixedClock,
      interventionContextResolver: makeInterventionContextResolver([]),
      caseContextResolver: makeCaseContextResolver([buildCaseContext()]),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const error = await onlyCase
      .recordExecution(CANONICAL_EXECUTION)
      .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
    expect(error?.code).toBe("unknown_scenario_ref");
    expect(error?.detail).toContain(SCENARIO_ID);
  });

  test("unknown state and step references refuse naming the ids", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await expectCode(
      () => service.recordExecution({ ...CANONICAL_EXECUTION, stateId: GHOST_STATE_ID }),
      "unknown_state_ref",
    );
    const unknownStep = {
      ...CANONICAL_EXECUTION,
      executedStepIds: [STEP_FIRE_ID, GHOST_STEP_ID],
    };
    const error = await service
      .recordExecution(unknownStep)
      .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
    expect(error?.code).toBe("unknown_step_ref");
    expect(error?.detail).toContain(GHOST_STEP_ID);
  });

  test("step_not_in_state: a scenario step outside the referenced layer refuses", async () => {
    const service = makeService(new InMemoryExecutionStore());
    // Layer 1 applied only the fire step; executing the partition step "at"
    // layer 1 is a misalignment.
    const misaligned = {
      ...CANONICAL_EXECUTION,
      stateId: STATE_1_ID,
      executedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID],
    };
    const error = await service
      .recordExecution(misaligned)
      .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
    expect(error?.code).toBe("step_not_in_state");
    expect(error?.detail).toContain(STEP_PARTITION_ID);
  });

  test("unknown evidence refs refuse naming the ids", async () => {
    const ghost = evidenceIdOf("never-registered");
    const service = makeService(new InMemoryExecutionStore());
    const error = await service
      .recordExecution({ ...CANONICAL_EXECUTION, evidenceIds: [EV_WORK_PHOTOS, ghost] })
      .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
    expect(error?.code).toBe("unknown_evidence_ref");
    expect(error?.detail).toContain(ghost);
  });

  test("execution_exists: duplicate ids refuse and never overwrite history", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await service.recordExecution(CANONICAL_EXECUTION);
    await expectCode(() => service.recordExecution(CANONICAL_EXECUTION), "execution_exists");
    const record = await service.getExecution(EXECUTION_ID);
    expect(record?.history).toHaveLength(1);
    expect(record?.recordedAt).toBe(FIXED_NOW);
  });

  test("defense in depth: evidence-less and step-less inputs refuse at the service too", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await expectCode(
      () => service.recordExecution({ ...CANONICAL_EXECUTION, executedStepIds: [] }),
      "execution_without_steps",
    );
    await expectCode(
      () => service.recordExecution({ ...CANONICAL_EXECUTION, evidenceIds: [] }),
      "execution_without_evidence",
    );
  });

  test("partial executions: a subset of a layer's steps records cleanly (phased work)", async () => {
    const service = makeService(new InMemoryExecutionStore());
    const record = await service.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-phase-1",
      stateId: STATE_2_ID,
      executedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID],
    });
    expect(record.stateId).toBe(STATE_2_ID);
    expect(record.executedStepIds).toEqual([STEP_FIRE_ID, STEP_PARTITION_ID]);
  });

  test("purity: deep-frozen inputs are never mutated", async () => {
    const service = makeService(new InMemoryExecutionStore());
    const input = deepFreeze({ ...CANONICAL_EXECUTION });
    await service.recordExecution(input);
    expect(input).toEqual(CANONICAL_EXECUTION);
  });
});

/* ------------------------------------------------------------------ */
/* Outcomes                                                             */
/* ------------------------------------------------------------------ */

describe("execution service: recordOutcome", () => {
  test("happy path: OBSERVED outcome with new evidence + post-work capture", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await service.recordExecution(CANONICAL_EXECUTION);
    const outcome = await service.recordOutcome(EXECUTION_ID, {
      caseId: CASE_ID,
      statement: "Post-work scan confirms the REI90 compartment line.",
      evidenceIds: [EV_POSTWORK_SCAN, EV_POSTWORK_PHOTO],
      captureSessionIds: [SESSION_POSTWORK_1],
      measurementRefs: ["meas-postwork-1"],
    });
    expect(outcome.epistemicStatus).toBe("OBSERVED");
    expect(outcome.executionRecordId).toBe(EXECUTION_ID);
    expect(outcome.caseId).toBe(CASE_ID);
    expect(outcome.outcomeId).toMatch(/^out-[0-9a-f]{16}$/);
    expect(outcome.captureSessionIds).toEqual([SESSION_POSTWORK_1]);
    expect(outcome.measurementRefs).toEqual(["meas-postwork-1"]);
    const record = await service.getExecution(EXECUTION_ID);
    expect(record?.outcomes).toHaveLength(1);
    expect(record?.history.map((event) => event.eventType)).toEqual([
      "execution_recorded",
      "outcome_recorded",
    ]);
  });

  test("outcome_case_mismatch: an outcome for another case refuses naming both", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await service.recordExecution(CANONICAL_EXECUTION);
    const error = await service
      .recordOutcome(EXECUTION_ID, {
        caseId: "case-somewhere-else",
        statement: "x",
        evidenceIds: [EV_POSTWORK_SCAN],
      })
      .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
    expect(error?.code).toBe("outcome_case_mismatch");
    expect(error?.detail).toContain("case-somewhere-else");
    expect(error?.detail).toContain(CASE_ID);
  });

  test("execution_not_found + unknown evidence + evidence-less outcomes refuse", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await expectCode(
      () =>
        service.recordOutcome("execution-ghost", {
          caseId: CASE_ID,
          statement: "x",
          evidenceIds: [EV_POSTWORK_SCAN],
        }),
      "execution_not_found",
    );
    await service.recordExecution(CANONICAL_EXECUTION);
    await expectCode(
      () => service.recordOutcome(EXECUTION_ID, { caseId: CASE_ID, statement: "x", evidenceIds: [] }),
      "outcome_without_evidence",
    );
    const ghost = evidenceIdOf("unregistered-outcome-evidence");
    const error = await service
      .recordOutcome(EXECUTION_ID, { caseId: CASE_ID, statement: "x", evidenceIds: [ghost] })
      .then(() => null, (failure: unknown) => failure as { code: string; detail: string });
    expect(error?.code).toBe("unknown_evidence_ref");
    expect(error?.detail).toContain(ghost);
  });

  test("append-only: a SECOND outcome appends; prior events/digests never change; corrections are new outcomes", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordOutcome(EXECUTION_ID, {
      caseId: CASE_ID,
      statement: "Scan confirms the REI90 line.",
      evidenceIds: [EV_POSTWORK_SCAN],
      captureSessionIds: [SESSION_POSTWORK_1],
    });
    const before = await service.getExecution(EXECUTION_ID);
    const historyBefore = [...(before?.history ?? [])];
    const outcomesBefore = [...(before?.outcomes ?? [])];
    // A contradicting observation is a NEW outcome, never a rewrite.
    await service.recordOutcome(EXECUTION_ID, {
      caseId: CASE_ID,
      statement: "Thermal check contradicts the scan: the head joint remains REI60.",
      evidenceIds: [EV_THERMAL_CHECK],
      captureSessionIds: [SESSION_POSTWORK_1],
    });
    const after = await service.getExecution(EXECUTION_ID);
    expect(after?.history.slice(0, historyBefore.length)).toEqual(historyBefore);
    expect(after?.history).toHaveLength(historyBefore.length + 1);
    expect(after?.outcomes.slice(0, outcomesBefore.length)).toEqual(outcomesBefore);
    expect(after?.outcomes).toHaveLength(2);
    expect(after?.outcomes[0]?.outcomeId).not.toBe(after?.outcomes[1]?.outcomeId);
  });

  test("outcome ids are content-derived and replay-stable", async () => {
    const a = makeService(new InMemoryExecutionStore());
    const b = makeService(new InMemoryExecutionStore());
    const idsA = await runExecutionLifecycle(a);
    const idsB = await runExecutionLifecycle(b);
    expect(idsA.outcomeId).toBe(idsB.outcomeId);
    const record = await a.getExecution(EXECUTION_ID);
    const outcome = record?.outcomes[0];
    const expected = `out-${sha256Hex(
      `${EXECUTION_ID}:0:${canonicalJsonStringify({
        caseId: outcome?.caseId,
        statement: outcome?.statement,
        evidenceIds: outcome?.evidenceIds,
        captureSessionIds: outcome?.captureSessionIds,
        measurementRefs: outcome?.measurementRefs ?? null,
        recordedAt: outcome?.recordedAt,
      })}`,
    ).slice(0, 16)}`;
    expect(outcome?.outcomeId).toBe(expected);
  });
});

/* ------------------------------------------------------------------ */
/* The PROPOSED → EXECUTED projection                                   */
/* ------------------------------------------------------------------ */

describe("execution service: getStateExecution (the state transition projection)", () => {
  test("PROPOSED before execution evidence; EXECUTED after; sibling layers untouched", async () => {
    const service = makeService(new InMemoryExecutionStore());
    const before = await service.getStateExecution(SCENARIO_ID, STATE_3_ID);
    expect(before).toEqual({
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      stateIndex: 3,
      epistemicStatus: "PROPOSED",
    });
    await service.recordExecution(CANONICAL_EXECUTION);
    const after = await service.getStateExecution(SCENARIO_ID, STATE_3_ID);
    expect(after).toEqual({
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      stateIndex: 3,
      epistemicStatus: "EXECUTED",
      executionRecordId: EXECUTION_ID,
      evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
      recordedAt: FIXED_NOW,
    });
    // Other layers of the same scenario remain PROPOSED.
    const untouched = await service.getStateExecution(SCENARIO_ID, STATE_2_ID);
    expect(untouched.epistemicStatus).toBe("PROPOSED");
  });

  test("earliest recorded evidence wins (ties by executionRecordId — deterministic)", async () => {
    const clock = makeSequenceClock([FIXED_NOW, FIXED_LATER, FIXED_EVEN_LATER]);
    const service = new ExecutionService({
      store: new InMemoryExecutionStore(),
      clock,
      ...canonicalResolvers(),
    });
    await service.recordExecution(CANONICAL_EXECUTION);
    // Later clock stamp, lexicographically SMALLER id: time wins.
    await service.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-aaa-later",
    });
    const view = await service.getStateExecution(SCENARIO_ID, STATE_3_ID);
    expect(view.executionRecordId).toBe(EXECUTION_ID);
    // Same clock stamp → id tiebreak, deterministically.
    const tied = new ExecutionService({
      store: new InMemoryExecutionStore(),
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    await tied.recordExecution(CANONICAL_EXECUTION);
    await tied.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-0000-tie",
    });
    const tiedView = await tied.getStateExecution(SCENARIO_ID, STATE_3_ID);
    expect(tiedView.executionRecordId).toBe("execution-0000-tie");
  });

  test("unknown scenario/state refuse with typed codes", async () => {
    const service = makeService(new InMemoryExecutionStore());
    await expectCode(
      () => service.getStateExecution("scenario-ghost", STATE_3_ID),
      "unknown_scenario_ref",
    );
    await expectCode(
      () => service.getStateExecution(SCENARIO_ID, GHOST_STATE_ID),
      "unknown_state_ref",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Reads, determinism and store twin parity                             */
/* ------------------------------------------------------------------ */

describe("execution service: reads, determinism, twin parity", () => {
  test("getExecution unknown id → null; listExecutions summarizes sorted", async () => {
    const service = makeService(new InMemoryExecutionStore());
    expect(await service.getExecution("execution-ghost")).toBeNull();
    await service.recordExecution(CANONICAL_EXECUTION);
    await service.recordExecution({
      ...CANONICAL_EXECUTION,
      executionRecordId: "execution-aaa-2",
      stateId: STATE_2_ID,
      executedStepIds: [STEP_FIRE_ID],
    });
    const list = await service.listExecutions();
    expect(list.map((entry) => entry.executionRecordId)).toEqual([
      "execution-aaa-2",
      EXECUTION_ID,
    ]);
    expect(list[1]).toEqual({
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepCount: 3,
      evidenceCount: 2,
      captureSessionCount: 1,
      outcomeCount: 0,
      executedAt: FIXED_EXECUTED,
      recordedAt: FIXED_NOW,
    });
  });

  test("byte-identical replay: the same sequence + clock → identical files in fresh stores", async () => {
    await withTempDir(async (root) => {
      const paths: string[] = [];
      for (const dir of ["a", "b"]) {
        const service = makeService(new FsExecutionStore(join(root, dir)));
        await runExecutionLifecycle(service);
        await service.recordOutcome(EXECUTION_ID, {
          caseId: CASE_ID,
          statement: "Thermal check remains acceptable.",
          evidenceIds: [EV_THERMAL_CHECK],
          captureSessionIds: [SESSION_POSTWORK_1],
        });
        paths.push(join(root, dir, "executions", `${sha256Hex(EXECUTION_ID)}.json`));
      }
      expect(readFileSync(paths[1]!, "utf8")).toBe(readFileSync(paths[0]!, "utf8"));
    });
  });

  test("the injected clock is the only time source (sequence clock pins each event)", async () => {
    const clock = makeSequenceClock([FIXED_NOW, FIXED_LATER, FIXED_EVEN_LATER]);
    const service = new ExecutionService({
      store: new InMemoryExecutionStore(),
      clock,
      ...canonicalResolvers(),
    });
    const record = await service.recordExecution(CANONICAL_EXECUTION);
    expect(record.recordedAt).toBe(FIXED_NOW);
    expect(record.stateTransition.recordedAt).toBe(FIXED_NOW);
    expect(record.history[0]?.occurredAt).toBe(FIXED_NOW);
    const outcome = await service.recordOutcome(EXECUTION_ID, {
      caseId: CASE_ID,
      statement: "x",
      evidenceIds: [EV_POSTWORK_SCAN],
    });
    expect(outcome.recordedAt).toBe(FIXED_LATER);
  });

  test("store twin parity: InMemory and Fs produce identical records for the same sequence", async () => {
    await withTempDir(async (root) => {
      const fsService = makeService(new FsExecutionStore(join(root, "data")));
      const memService = makeService(new InMemoryExecutionStore());
      const fsIds = await runExecutionLifecycle(fsService);
      const memIds = await runExecutionLifecycle(memService);
      expect(memIds).toEqual(fsIds);
      const fsRecord = await fsService.getExecution(EXECUTION_ID);
      const memRecord = await memService.getExecution(EXECUTION_ID);
      expect(memRecord).toEqual(fsRecord);
      expect(canonicalJsonStringify(memRecord)).toBe(
        readFileSync(join(root, "data", "executions", `${sha256Hex(EXECUTION_ID)}.json`), "utf8"),
      );
    });
  });
});

/* ------------------------------------------------------------------ */
/* The read-only adapters over REAL sibling authorities                 */
/* ------------------------------------------------------------------ */

describe("execution service: read-only adapters over real authorities", () => {
  test("readOnlyInterventionContextResolver projects a REAL approved scenario end-to-end (execution records against it; the intervention record is NEVER mutated)", async () => {
    const intervention = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
    });
    await runCanonicalScenario(intervention);
    await intervention.recordApprovalReference(SCENARIO_ID, {
      caseId: CASE_ID,
      reviewDecision: "approved",
      reviewedAt: SCENARIO_APPROVAL,
    });
    await intervention.transitionStatus(SCENARIO_ID, "under_review");
    const scenario = await intervention.transitionStatus(SCENARIO_ID, "approved");
    const scenarioBefore = JSON.parse(JSON.stringify(scenario)) as typeof scenario;

    const cases = new CaseService({
      store: new InMemoryCaseStore(),
      clock: fixedClock,
    });
    await cases.createCase({
      caseId: CASE_ID,
      title: "Fire compartment non-compliance",
      links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
    });
    await cases.addObservation(CASE_ID, {
      statement: "Measured rating REI60.",
      evidenceIds: [EV_WORK_PHOTOS],
    });

    const service = new ExecutionService({
      store: new InMemoryExecutionStore(),
      clock: fixedClock,
      interventionContextResolver: readOnlyInterventionContextResolver(intervention),
      caseContextResolver: readOnlyCaseContextResolver(cases),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const latest = scenario.states[scenario.states.length - 1]!;
    const record = await service.recordExecution({
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: latest.stateId,
      executedStepIds: [...latest.appliedStepIds],
      evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
      executedAt: FIXED_EXECUTED,
    });
    expect(record.stateTransition.fromStatus).toBe("PROPOSED");
    expect(record.stateTransition.toStatus).toBe("EXECUTED");
    // The REAL intervention record was never mutated by the execution write.
    const after = await intervention.getScenario(SCENARIO_ID);
    expect(after).toEqual(scenarioBefore);
    // And the projection view answers EXECUTED for the real state id.
    const view = await service.getStateExecution(SCENARIO_ID, latest.stateId);
    expect(view.epistemicStatus).toBe("EXECUTED");
    // A REAL unknown state id on the REAL scenario refuses.
    await expectCode(
      () => service.getStateExecution(SCENARIO_ID, GHOST_STATE_ID),
      "unknown_state_ref",
    );
    // Draft scenarios (the real status machine) refuse execution.
    await intervention.createScenario({
      scenarioId: "scenario-draft-real",
      projectId: "project-zurich-hq",
      title: "Still a draft",
      baselineVersionId: "v001",
      baseline: buildBaselineStorey(),
    });
    await expectCode(
      () =>
        service.recordExecution({
          ...CANONICAL_EXECUTION,
          executionRecordId: "execution-draft-refusal",
          scenarioId: "scenario-draft-real",
          stateId: latest.stateId,
        }),
      "scenario_not_approved",
    );
  });

  test("readOnly adapters resolve null (not throw) for unknown ids", async () => {
    const intervention = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
    });
    const cases = new CaseService({ store: new InMemoryCaseStore(), clock: fixedClock });
    const interventionResolver = readOnlyInterventionContextResolver(intervention);
    const caseResolver = readOnlyCaseContextResolver(cases);
    const evidenceResolver = readOnlyEvidenceMembershipResolver({
      getEvidenceRecord: async (contentId: string) =>
        contentId === EV_WORK_PHOTOS ? { contentId } : null,
    });
    expect(await interventionResolver.resolveInterventionContext("scenario-none")).toBeNull();
    expect(await caseResolver.resolveCaseContext("case-none")).toBeNull();
    expect(await evidenceResolver.evidenceExists(EV_WORK_PHOTOS)).toBe(true);
    expect(await evidenceResolver.evidenceExists(evidenceIdOf("missing"))).toBe(false);
  });
});
