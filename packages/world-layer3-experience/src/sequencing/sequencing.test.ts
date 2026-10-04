/**
 * WORLD-P3 tests — the SEQUENCING family: the plan-declaration laws
 * (durations declared, canonical operations, P0-C validator
 * delegation), the trajectory determinism across the P0-C simulation
 * doubles, the 4D playback phases, the replay chain laws (append-only,
 * tamper refusal, byte-identical re-runs) and the ledger doubles.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  referenceSimulationDouble,
  alternateSimulationDouble,
} from "@aise/world-solution-substrate";
import {
  appendReplayEvent,
  compileExecutionSimulationRequest,
  openReplayLog,
  phaseOfOperationType,
  playbackPhasesOf,
  sequenceExecution,
  verifyReplayLog,
  type SolutionReplayLog,
} from "./contract";
import {
  alternateReplayLedgerDouble,
  referenceReplayLedgerDouble,
} from "./doubles";
import {
  FIXTURE_PLAN_MISSING_DURATION,
  FIXTURE_PLAN_ZERO_DURATION,
  FIXTURE_REPLAY_EVENT_BAD_INSTANT,
  FIXTURE_REPLAY_EVENTS,
  FIXTURE_SEQUENCING_PLAN,
  fixtureSimulationDoubles,
} from "./corpus";
import { FIXTURE_QUANTIFY_WORLD } from "../quantify/corpus";

/* ------------------------------------------------------------------ */
/* SEQUENCE — the plan laws                                             */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 sequencing — the plan declaration laws", () => {
  test("the plan compiles into a P0-C simulation request with the declared inputs carried verbatim", () => {
    const outcome = compileExecutionSimulationRequest(FIXTURE_SEQUENCING_PLAN);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.kind).toBe("execution-simulation-request");
    expect(outcome.value.solutionId).toBe(FIXTURE_SEQUENCING_PLAN.solutionId);
    expect(outcome.value.durations).toEqual(FIXTURE_SEQUENCING_PLAN.durations);
    expect(outcome.value.clock).toEqual(FIXTURE_SEQUENCING_PLAN.clock);
    expect(outcome.value.operations.length).toBe(3);
  });

  test("a plan with a missing duration declaration is refused, surfacing the P0-C violations verbatim", () => {
    const outcome = compileExecutionSimulationRequest(FIXTURE_PLAN_MISSING_DURATION);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("no declared duration for operation");
    expect(outcome.failure.detail).toContain("never invents durations");
  });

  test("a plan with a non-positive duration is refused (durations are strictly positive)", () => {
    const outcome = compileExecutionSimulationRequest(FIXTURE_PLAN_ZERO_DURATION);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("strictly positive");
  });

  test("the phase mapping comes from the CONTRACT's own category table (composed)", () => {
    expect(phaseOfOperationType("excavation")).toBe("site-preparation");
    expect(phaseOfOperationType("demolition-removal")).toBe("site-preparation");
    expect(phaseOfOperationType("block-wall-placement")).toBe("structure");
    expect(phaseOfOperationType("plaster-application")).toBe("enclosure");
    expect(phaseOfOperationType("finish-application")).toBe("finishes");
    expect(phaseOfOperationType("unknown-future-op")).toBeNull();
  });

  test("the sequencing runs through BOTH P0-C simulation doubles with identical trajectories", () => {
    const [reference, alternate] = fixtureSimulationDoubles();
    const a = sequenceExecution(FIXTURE_SEQUENCING_PLAN, reference);
    const b = sequenceExecution(FIXTURE_SEQUENCING_PLAN, alternate);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.trajectory.trajectoryId).toBe(b.value.trajectory.trajectoryId);
    // The trajectories are byte-identical EXCEPT the provenance's provider
    // identity — the P0-C's own law 7 (exactly as two substrate hosts
    // differ). Compare the content, not the provenance.
    const contentA: Record<string, unknown> = { ...a.value.trajectory };
    delete (contentA as { provenance?: unknown }).provenance;
    const contentB: Record<string, unknown> = { ...b.value.trajectory };
    delete (contentB as { provenance?: unknown }).provenance;
    expect(canonicalJsonStringify(contentA)).toBe(canonicalJsonStringify(contentB));
    // The wall-upgrade trajectory: 8h demolition + 24h block wall + 16h
    // plaster = 48h makespan.
    expect(a.value.trajectory.makespanHours).toBe(48);
    expect(a.value.trajectory.activities.length).toBe(3);
    // The world states chain 0..3 (baseline + one per operation).
    expect(a.value.trajectory.worldStates.length).toBe(4);
  });

  test("the 4D playback phases group the world states by the contract's category table", () => {
    const sequenced = sequenceExecution(FIXTURE_SEQUENCING_PLAN, referenceSimulationDouble());
    expect(sequenced.ok).toBe(true);
    if (!sequenced.ok) return;
    const phases = sequenced.value.playbackPhases;
    expect(phases.length).toBeGreaterThan(0);
    // The first segment is demolition (site-preparation) in progress.
    expect(phases[0]?.phase).toBe("site-preparation");
    expect(phases[0]?.activeOperationIds.length).toBe(1);
    // Every state index of the trajectory appears exactly once.
    const covered = phases.flatMap((segment) => segment.stateIndices);
    expect(covered.sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
  });

  test("the trajectory is read-only over the operations (the Solution Graph stays the authority)", () => {
    const before = canonicalJsonStringify(FIXTURE_QUANTIFY_WORLD.operations);
    sequenceExecution(FIXTURE_SEQUENCING_PLAN, referenceSimulationDouble());
    const after = canonicalJsonStringify(FIXTURE_QUANTIFY_WORLD.operations);
    expect(after).toBe(before);
  });

  test("the sequencing of a plan with an operation sequence mismatch is refused", () => {
    const [referenceSimulation] = fixtureSimulationDoubles();
    const reordered = {
      ...FIXTURE_SEQUENCING_PLAN,
      operations: [...FIXTURE_SEQUENCING_PLAN.operations].reverse(),
    };
    const outcome = sequenceExecution(reordered, referenceSimulation);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("operationIndex");
  });
});

/* ------------------------------------------------------------------ */
/* REPLAY — the chain laws                                              */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 sequencing — the replay chain laws", () => {
  test("the fixture session appends into a chained, verified log", () => {
    let log = openReplayLog("solution-demo-001", 1);
    for (const event of FIXTURE_REPLAY_EVENTS) {
      const appended = appendReplayEvent(log, event);
      expect(appended.ok).toBe(true);
      if (!appended.ok) return;
      log = appended.value;
    }
    expect(log.entries.length).toBe(FIXTURE_REPLAY_EVENTS.length);
    // The chain digests link entry N to entry N-1.
    for (let index = 1; index < log.entries.length; index += 1) {
      const prior = log.entries[index - 1]?.chainDigest;
      const current = log.entries[index];
      expect(prior).toBeDefined();
      expect(current?.sequence).toBe(index + 1);
    }
    const lastEntry = log.entries[log.entries.length - 1];
    expect(lastEntry).toBeDefined();
    if (lastEntry !== undefined) {
      expect(log.logId).toBe(lastEntry.chainDigest);
    }
    const verification = verifyReplayLog(log);
    expect(verification.ok).toBe(true);
  });

  test("the replay log is deterministic: the same events re-derive the byte-identical log", () => {
    const build = (): SolutionReplayLog => {
      let log = openReplayLog("solution-demo-001", 1);
      for (const event of FIXTURE_REPLAY_EVENTS) {
        const appended = appendReplayEvent(log, event);
        if (!appended.ok) throw new Error("append failed");
        log = appended.value;
      }
      return log;
    };
    const a = build();
    const b = build();
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  test("a tampered entry is refused, naming the first broken entry", () => {
    let log = openReplayLog("solution-demo-001", 1);
    for (const event of FIXTURE_REPLAY_EVENTS) {
      const appended = appendReplayEvent(log, event);
      if (!appended.ok) throw new Error("append failed");
      log = appended.value;
    }
    const tampered: SolutionReplayLog = {
      ...log,
      entries: log.entries.map((entry, index) =>
        index === 3
          ? {
              ...entry,
              event: { ...entry.event, declaredAt: "2020-01-01T00:00:00.000Z" } as typeof entry.event,
            }
          : entry,
      ),
    };
    const verification = verifyReplayLog(tampered);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.failure.kind).toBe("contract-mismatch");
    expect(verification.failure.detail).toContain("entry 4");
    expect(verification.failure.detail).toContain("tampered");
  });

  test("a truncated log (logId mismatch) is refused", () => {
    let log = openReplayLog("solution-demo-001", 1);
    for (const event of FIXTURE_REPLAY_EVENTS) {
      const appended = appendReplayEvent(log, event);
      if (!appended.ok) throw new Error("append failed");
      log = appended.value;
    }
    const truncated: SolutionReplayLog = {
      ...log,
      entries: log.entries.slice(0, 3),
    };
    const verification = verifyReplayLog(truncated);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.failure.detail).toContain("final chain digest");
  });

  test("a replay event with a malformed instant is refused (declared instants only)", () => {
    const log = openReplayLog("solution-demo-001", 1);
    const outcome = appendReplayEvent(log, FIXTURE_REPLAY_EVENT_BAD_INSTANT);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("never a clock read");
  });

  test("an out-of-vocabulary event kind is refused", () => {
    const log = openReplayLog("solution-demo-001", 1);
    const outcome = appendReplayEvent(log, {
      event: "quantum-collapse",
    } as unknown as import("./contract").SolutionReplayEvent);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("must be one of");
  });

  test("the two ledger doubles produce byte-identical logs (the store seam)", () => {
    const reference = referenceReplayLedgerDouble("solution-demo-001", 1);
    const alternate = alternateReplayLedgerDouble("solution-demo-001", 1);
    for (const event of FIXTURE_REPLAY_EVENTS) {
      const a = reference.append(event);
      const b = alternate.append(event);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
    }
    const a = reference.currentLog();
    const b = alternate.currentLog();
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
  });

  test("fuzz: randomized append/tamper sequences keep the chain law (seeded)", () => {
    let seed = 0xfeedface;
    const next = (min: number, max: number): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return min + Math.floor((seed / 0x100000000) * (max - min));
    };
    for (let iteration = 0; iteration < 30; iteration += 1) {
      const ledger = referenceReplayLedgerDouble("solution-demo-001", 1);
      const eventCount = next(1, 8);
      for (let event = 0; event < eventCount; event += 1) {
        const chosen = FIXTURE_REPLAY_EVENTS[next(0, FIXTURE_REPLAY_EVENTS.length)] ?? FIXTURE_REPLAY_EVENTS[0]!;
        const appended = ledger.append(chosen);
        expect(appended.ok).toBe(true);
        if (!appended.ok) return;
      }
      const served = ledger.currentLog();
      expect(served.ok).toBe(true);
      if (!served.ok) return;
      expect(served.value.entries.length).toBe(eventCount);
      const verification = verifyReplayLog(served.value);
      expect(verification.ok).toBe(true);
      // Tamper a random entry → the chain verification must fail.
      const tamperIndex = next(0, eventCount);
      const tampered: SolutionReplayLog = {
        ...served.value,
        entries: served.value.entries.map((entry, index) =>
          index === tamperIndex
            ? {
                ...entry,
                event: {
                  ...entry.event,
                  decidedAt: "1999-01-01T00:00:00.000Z",
                } as typeof entry.event,
              }
            : entry,
        ),
      };
      const tamperVerification = verifyReplayLog(tampered);
      expect(tamperVerification.ok).toBe(false);
    }
  });

  test("the alternate simulation double drives the sequencing identically (the substrate seam)", () => {
    const a = sequenceExecution(FIXTURE_SEQUENCING_PLAN, referenceSimulationDouble());
    const b = sequenceExecution(FIXTURE_SEQUENCING_PLAN, alternateSimulationDouble());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(canonicalJsonStringify(a.value.playbackPhases)).toBe(
      canonicalJsonStringify(b.value.playbackPhases),
    );
  });
});

/** The playback phases of a bare trajectory (helper export sanity). */
describe("WORLD-P3 sequencing — the playback-phase projection", () => {
  test("an empty trajectory projects no playback segments", () => {
    expect(playbackPhasesOf({
      kind: "execution-trajectory",
      schemaVersion: "execution-trajectory/1",
      trajectoryId: "0".repeat(64),
      solutionId: "s",
      versionNumber: 1,
      baselineStateIndex: 0,
      clock: { epochIso: "2026-10-05T08:00:00.000Z", timeUnit: "hour" },
      activities: [],
      worldStates: [],
      totalDurationHours: 0,
      makespanHours: 0,
      provenance: {
        providerId: "test",
        technologyVersion: "1",
        providerDescriptorDigest: "0".repeat(64),
        inputDigest: "0".repeat(64),
        parametersDigest: "0".repeat(64),
        laneStatement: "test",
      },
    })).toEqual([]);
  });
});
