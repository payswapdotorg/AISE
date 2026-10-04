/**
 * WORLD-P2 — the ACTION family test suite (stages 7–8: ACTION + AUDIT
 * TRAIL).
 *
 * Drills: the ownership law (unowned/actor-less actions refused); the
 * governed lifecycle transition table (legal edges pass, illegal edges
 * refuse, completed is terminal); the gate law (an ungated
 * propose_solution_operation refused, a non-passing gate verdict blocks,
 * an unresolvable gate citation refuses); the review law (resolution
 * requires an approved decision); the observation-evidence law; the two
 * recorder doubles' byte-identical actions; the audit ledger's append-
 * only laws (monotonic sequences, chained digests, content-derived event
 * ids, deterministic replay byte-identical); the tamper drill (mutating a
 * past event fails replay with the typed failure); the alternate ledger's
 * wire-stability proof; and the audit fuzz (random valid appends always
 * replay clean, random tampering always fails).
 */

import { describe, expect, test } from "bun:test";
import {
  ACTION_TRANSITIONS,
  alternateActionRecorderDouble,
  alternateAuditLedgerDouble,
  auditRecordContentDigest,
  auditRecordDigest,
  buildAuditRecord,
  referenceActionRecorderDouble,
  referenceAuditLedgerDouble,
  recordProblemAction,
  recordThroughActionPort,
  transitionActionStatus,
  verifyAuditReplay,
  type ActionStatus,
  type AuditAppendInput,
  type AuditLedger,
  type AuditTrail,
  type ProblemAction,
  type RecordActionInput,
} from "./index";
import {
  FIXTURE_RESOLVE_ACTION,
  REJECTED_REVIEW_RESOLVE_ACTION,
  SCENARIO_A_REQUEST_EVIDENCE_ACTION,
  SCENARIO_B_ASSIGN_OWNER_ACTION,
  SCENARIO_B_PROPOSE_OPERATION_ACTION,
  UNEVIDENCED_OBSERVATION_ACTION,
  UNGATED_PROPOSAL_ACTION,
} from "./corpus";
import { textDigestOf } from "../seam";
import {
  FIXTURE_ACTOR_ENGINEER,
  FIXTURE_PROBLEM_ID,
  PROBLEM_FIXTURE_RECORDED_AT,
} from "../problem/corpus";
import { gateDeterministicChecks, type DeterministicCheckGateVerdict } from "../reasoning";
import { FIXTURE_ENGINE_SNAPSHOT_DIGEST } from "../reasoning/corpus";

/** Both recorder substitution doubles. */
const RECORDERS = [
  { name: "reference", recorder: referenceActionRecorderDouble },
  { name: "alternate", recorder: alternateActionRecorderDouble },
] as const;

/** Both ledger substitution doubles. */
const LEDGERS: readonly { readonly name: string; readonly ledger: AuditLedger }[] = [
  { name: "reference", ledger: referenceAuditLedgerDouble },
  { name: "alternate", ledger: alternateAuditLedgerDouble },
];

/** A passing gate verdict fixture for the gated proposal tests. */
function passingGate(): DeterministicCheckGateVerdict {
  const outcome = gateDeterministicChecks(
    {
      problemId: FIXTURE_PROBLEM_ID,
      attachedChecks: [
        {
          checkId: "solution.geometry.dimensions-positive",
          ownership: "engine-owned",
          outcome: "pass",
          detail: "fixture engine check",
          sourceKind: "deterministic-engine",
          sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
        },
      ],
      reasoningResults: [],
    },
    PROBLEM_FIXTURE_RECORDED_AT,
  );
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error(outcome.failure.detail);
  }
  return outcome.value;
}

/** A failing gate verdict fixture. */
function failingGate(): DeterministicCheckGateVerdict {
  const outcome = gateDeterministicChecks(
    {
      problemId: FIXTURE_PROBLEM_ID,
      attachedChecks: [
        {
          checkId: "solution.geometry.dimensions-positive",
          ownership: "engine-owned",
          outcome: "fail",
          detail: "fixture engine check failing",
          sourceKind: "deterministic-engine",
          sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
        },
      ],
      reasoningResults: [],
    },
    PROBLEM_FIXTURE_RECORDED_AT,
  );
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error(outcome.failure.detail);
  }
  return outcome.value;
}

/** Records the fixture gated proposal through one recorder (asserts ok). */
function recordProposal(recorder: typeof referenceActionRecorderDouble): ProblemAction {
  const gate = passingGate();
  const input = {
    ...SCENARIO_B_PROPOSE_OPERATION_ACTION,
    payload: {
      ...SCENARIO_B_PROPOSE_OPERATION_ACTION.payload,
      gateVerdictId: gate.gateId,
    },
  };
  const outcome = recordThroughActionPort(recorder, input, gate);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error(outcome.failure.detail);
  }
  return outcome.value;
}

describe("action — the ownership + payload laws (stage 7)", () => {
  for (const double of RECORDERS) {
    test(`the ${double.name} recorder seals the assign-owner action with a content-derived id`, () => {
      const outcome = recordThroughActionPort(double.recorder, SCENARIO_B_ASSIGN_OWNER_ACTION, null);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.value.actionId).toMatch(/^[0-9a-f]{64}$/);
        expect(outcome.value.actionKind).toBe("assign_owner");
        expect(outcome.value.status).toBe("open");
        expect(outcome.value.ownership.owner.actorId).toBe(FIXTURE_ACTOR_ENGINEER.actorId);
      }
    });
  }

  test("the two recorders produce BYTE-IDENTICAL actions (the substitution pair)", () => {
    const reference = recordProposal(referenceActionRecorderDouble);
    const alternate = recordProposal(alternateActionRecorderDouble);
    expect(reference).toEqual(alternate);
    expect(reference.actionId).toBe(alternate.actionId);
  });

  test("an action without an ownership block is refused (law #1)", () => {
    const input = {
      ...SCENARIO_B_ASSIGN_OWNER_ACTION,
      ownership: undefined,
    } as unknown as RecordActionInput;
    const outcome = recordProblemAction(input, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("ownership");
    }
  });

  test("an ungated propose_solution_operation is refused (law #3)", () => {
    const outcome = recordProblemAction(UNGATED_PROPOSAL_ACTION, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("REQUIRES a deterministic-check gate verdict");
    }
  });

  test("a non-passing gate verdict blocks the consequential action (law #3)", () => {
    const gate = failingGate();
    const input = {
      ...SCENARIO_B_PROPOSE_OPERATION_ACTION,
      payload: {
        ...SCENARIO_B_PROPOSE_OPERATION_ACTION.payload,
        gateVerdictId: gate.gateId,
      },
    };
    const outcome = recordProblemAction(input, gate);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("blocked until the engine-owned checks pass");
    }
  });

  test("a gate citation that does not resolve is refused (law #3)", () => {
    const gate = passingGate();
    const input = {
      ...SCENARIO_B_PROPOSE_OPERATION_ACTION,
      payload: {
        ...SCENARIO_B_PROPOSE_OPERATION_ACTION.payload,
        gateVerdictId: textDigestOf("AISE-WORLD-P2-gate-verdict-not-this-one"),
      },
    };
    const outcome = recordProblemAction(input, gate);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("citation must resolve");
    }
  });

  test("a resolution on a rejected review is refused (law #4)", () => {
    const outcome = recordProblemAction(REJECTED_REVIEW_RESOLVE_ACTION, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("approved review");
    }
  });

  test("the approved-resolution fixture records cleanly (law #4 positive path)", () => {
    const outcome = recordThroughActionPort(referenceActionRecorderDouble, FIXTURE_RESOLVE_ACTION, null);
    expect(outcome.ok).toBe(true);
  });

  test("an observation action without evidence is refused (law #5)", () => {
    const outcome = recordProblemAction(UNEVIDENCED_OBSERVATION_ACTION, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("observations without evidence are refused");
    }
  });

  test("the request-evidence action carries the dispatched task id (scenario A)", () => {
    const input = {
      ...SCENARIO_A_REQUEST_EVIDENCE_ACTION,
      payload: {
        ...SCENARIO_A_REQUEST_EVIDENCE_ACTION.payload,
        taskId: textDigestOf("AISE-WORLD-P2-dispatched-task"),
      },
    };
    const outcome = recordThroughActionPort(referenceActionRecorderDouble, input, null);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.actionKind).toBe("request_evidence");
    }
  });
});

describe("action — the governed lifecycle (law #2)", () => {
  test("the closed transition table is the committed one", () => {
    expect(ACTION_TRANSITIONS.open).toEqual(["in_progress", "blocked"]);
    expect(ACTION_TRANSITIONS.in_progress).toEqual(["completed", "blocked"]);
    expect(ACTION_TRANSITIONS.blocked).toEqual(["in_progress"]);
    expect(ACTION_TRANSITIONS.completed).toEqual([]);
  });

  test("legal edges transition; illegal edges refuse; completed is terminal", () => {
    const action = recordProposal(referenceActionRecorderDouble);
    const toInProgress = transitionActionStatus(action, "in_progress");
    expect(toInProgress.ok).toBe(true);
    if (toInProgress.ok) {
      expect(toInProgress.value.status).toBe("in_progress");
      const toCompleted = transitionActionStatus(toInProgress.value, "completed");
      expect(toCompleted.ok).toBe(true);
      if (toCompleted.ok) {
        expect(toCompleted.value.status).toBe("completed");
        /* Terminal: every further edge refuses. */
        for (const target of ["open", "in_progress", "blocked", "completed"] as const) {
          const refusal = transitionActionStatus(toCompleted.value, target);
          expect(refusal.ok).toBe(false);
        }
      }
    }
    /* Illegal direct edge: open → completed. */
    const direct = transitionActionStatus(action, "completed");
    expect(direct.ok).toBe(false);
    if (!direct.ok) {
      expect(direct.failure.detail).toContain("closed transition table");
    }
  });

  test("fuzz: every non-table edge refuses (the full 4×4 matrix minus the legal 5)", () => {
    const action = recordProposal(referenceActionRecorderDouble);
    const statuses: readonly ActionStatus[] = ["open", "in_progress", "completed", "blocked"];
    for (const from of statuses) {
      const current = { ...action, status: from };
      for (const to of statuses) {
        const outcome = transitionActionStatus(current, to);
        const legal = ACTION_TRANSITIONS[from].includes(to);
        expect(outcome.ok).toBe(legal);
      }
    }
  });
});

describe("action — the audit ledger (stage 8)", () => {
  /** A canonical audit append input. */
  function entry(overrides?: Partial<AuditAppendInput>): AuditAppendInput {
    return {
      problemId: FIXTURE_PROBLEM_ID,
      laneStage: "PROBLEM",
      eventKind: "problem_defined",
      actor: FIXTURE_ACTOR_ENGINEER,
      subjectDigest: textDigestOf("AISE-WORLD-P2-audit-subject"),
      subjectKind: "engineering_problem",
      occurredAt: PROBLEM_FIXTURE_RECORDED_AT,
      reason: "The problem was defined and bound to the scene.",
      reasonKind: "problem_statement",
      evidenceContentIds: [],
      ...overrides,
    };
  }

  for (const double of LEDGERS) {
    test(`the ${double.name} ledger appends sequentially chained, content-derived events`, () => {
      let trail: AuditTrail | null = null;
      let appendedCount = 0;
      for (let index = 0; index < 5; index += 1) {
        const outcome = double.ledger.append(
          trail,
          entry({ subjectDigest: textDigestOf(`AISE-WORLD-P2-audit-subject-${index}`) }),
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          throw new Error(outcome.failure.detail);
        }
        trail = outcome.value;
        appendedCount += 1;
      }
      expect(appendedCount).toBe(5);
      expect(trail).not.toBe(null);
      if (trail !== null) {
        expect(trail.records).toHaveLength(5);
        expect(trail.records.map((record) => record.sequence)).toEqual([1, 2, 3, 4, 5]);
        for (const record of trail.records) {
          expect(record.eventId).toBe(
            auditRecordContentDigest({
              kind: "layer2-audit-record",
              sequence: record.sequence,
              problemId: record.problemId,
              laneStage: record.laneStage,
              eventKind: record.eventKind,
              actor: record.actor,
              subjectDigest: record.subjectDigest,
              subjectKind: record.subjectKind,
              occurredAt: record.occurredAt,
              reason: record.reason,
              reasonKind: record.reasonKind,
              evidenceContentIds: record.evidenceContentIds,
              priorEventId: record.priorEventId,
              priorEventDigest: record.priorEventDigest,
            }),
          );
        }
        /* The chain: each event pins the prior event's id + digest. */
        for (let index = 1; index < trail.records.length; index += 1) {
          const prior = trail.records[index - 1]!;
          const current = trail.records[index]!;
          expect(current.priorEventId).toBe(prior.eventId);
          expect(current.priorEventDigest).toBe(auditRecordDigest(prior));
        }
        /* Deterministic replay over the whole trail. */
        const replay = double.ledger.verifyReplay(trail);
        expect(replay.ok).toBe(true);
        expect(replay.checkedEvents).toBe(5);
      }
    });
  }

  test("the two ledgers produce BYTE-IDENTICAL trails (the substitution pair)", () => {
    let referenceTrail: AuditTrail | null = null;
    let alternateTrail: AuditTrail | null = null;
    for (let index = 0; index < 4; index += 1) {
      const refOutcome = referenceAuditLedgerDouble.append(
        referenceTrail,
        entry({ subjectDigest: textDigestOf(`AISE-WORLD-P2-chain-subject-${index}`) }),
      );
      const altOutcome = alternateAuditLedgerDouble.append(
        alternateTrail,
        entry({ subjectDigest: textDigestOf(`AISE-WORLD-P2-chain-subject-${index}`) }),
      );
      expect(refOutcome.ok).toBe(true);
      expect(altOutcome.ok).toBe(true);
      if (refOutcome.ok && altOutcome.ok) {
        referenceTrail = refOutcome.value;
        alternateTrail = altOutcome.value;
      }
    }
    expect(referenceTrail).toEqual(alternateTrail);
  });

  test("an append with a missing WHY is refused (the unexplained-transition law)", () => {
    const outcome = referenceAuditLedgerDouble.append(null, entry({ reason: "" }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("WHY is mandatory");
    }
  });

  test("an append for a different problem than the trail is refused", () => {
    const first = referenceAuditLedgerDouble.append(null, entry());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.failure.detail);
    }
    const second = referenceAuditLedgerDouble.append(
      first.value,
      entry({ problemId: textDigestOf("AISE-WORLD-P2-other-problem") }),
    );
    expect(second.ok).toBe(false);
  });

  test("the tamper drill: mutating a past event fails replay with the typed failure", () => {
    let trail: AuditTrail | null = null;
    for (let index = 0; index < 3; index += 1) {
      const outcome = referenceAuditLedgerDouble.append(
        trail,
        entry({ subjectDigest: textDigestOf(`AISE-WORLD-P2-tamper-subject-${index}`) }),
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        throw new Error(outcome.failure.detail);
      }
      trail = outcome.value;
    }
    if (trail === null) {
      throw new Error("the trail is unexpectedly absent");
    }
    /* Tamper with the SECOND event's reason. */
    const tampered = {
      ...trail,
      records: trail.records.map((record, index) =>
        index === 1 ? { ...record, reason: "SMUGGLED: a reason that was never committed" } : record,
      ),
    };
    const replay = verifyAuditReplay(tampered);
    expect(replay.ok).toBe(false);
    expect(
      replay.failures.some((failure) => failure.kind === "event-id-not-content-derived"),
    ).toBe(true);
    /* The honest trail still replays clean. */
    expect(verifyAuditReplay(trail).ok).toBe(true);
  });

  test("fuzz: randomized valid appends always replay clean; any tampered event always fails", () => {
    let seed = 0x2302;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const ledger = LEDGERS[next() % LEDGERS.length]!.ledger;
      let trail: AuditTrail | null = null;
      const count = 1 + (next() % 6);
      for (let index = 0; index < count; index += 1) {
        const outcome = ledger.append(
          trail,
          entry({
            subjectDigest: textDigestOf(`AISE-WORLD-P2-fuzz-${iteration}-${index}`),
            eventKind: "action_recorded",
            reasonKind: "explicit_request",
          }),
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          throw new Error(outcome.failure.detail);
        }
        trail = outcome.value;
      }
      if (trail === null) {
        throw new Error("the trail is unexpectedly absent");
      }
      expect(ledger.verifyReplay(trail).ok).toBe(true);
      /* Tamper one random event field; replay must fail. */
      const tamperIndex = next() % trail.records.length;
      const field = next() % 2;
      const tampered = {
        ...trail,
        records: trail.records.map((record, index) =>
          index === tamperIndex
            ? field === 0
              ? { ...record, reason: `${record.reason} (tampered)` }
              : { ...record, subjectDigest: textDigestOf("AISE-WORLD-P2-smuggled-subject") }
            : record,
        ),
      };
      const replay = ledger.verifyReplay(tampered);
      expect(replay.ok).toBe(false);
    }
  });

  test("buildAuditRecord refuses a bad append input without touching the trail", () => {
    const outcome = buildAuditRecord(null, entry({ subjectDigest: "not-a-digest" }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.family).toBe("action");
    }
  });
});
