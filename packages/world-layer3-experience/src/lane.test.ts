/**
 * WORLD-P3 tests — the LANE RUNNER: the seven-stage lane composed
 * end-to-end over the committed fixtures, deterministically, with every
 * stage's typed output proven and the whole run byte-identical across
 * re-runs and fresh kits.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { alternateNlCommandParserDouble } from "./authoring/doubles";
import { alternateClashPredicateDouble } from "./coordination/doubles";
import { alternateBoqGraphViewDouble } from "./quantify/doubles";
import { FIXTURE_QUANTIFY_WORLD } from "./quantify/corpus";
import {
  alternateReplayLedgerDouble,
  referenceReplayLedgerDouble,
} from "./sequencing/doubles";
import { alternateSimulationDouble, referenceSimulationDouble } from "@aise/world-solution-substrate";
import {
  SolutionSceneUsageAlternateDouble,
  SolutionSceneUsageReferenceDouble,
  defaultRealityPorts,
} from "@aise/world-solution-substrate";
import {
  defaultInteractiveSolutionLaneKit,
  runInteractiveSolutionLane,
  type InteractiveSolutionLaneKit,
} from "./lane";

describe("WORLD-P3 lane — the seven-stage end-to-end run", () => {
  test("every stage produces its typed output and the flagship findings hold", () => {
    const run = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const value = run.value;

    // AUTHOR: the DM↔NL equivalence proven live + the ghost presentation.
    expect(value.AUTHOR.modalityEquivalenceProven).toBe(true);
    expect(value.AUTHOR.dmOperationId).toBe(value.AUTHOR.nlOperationId);
    expect(value.AUTHOR.dmOperationId).toMatch(/^[0-9a-f]{64}$/);
    expect(value.AUTHOR.presentationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(value.AUTHOR.ghostElementIds.length).toBe(1);
    expect(value.AUTHOR.ghostElementIds[0]).toMatch(/^ghost-add-[0-9a-f]{16}$/);

    // COORDINATE: three models, seven coordinated elements.
    expect(value.COORDINATE.modelIds).toEqual([
      "model-reality-capture-001",
      "model-bim-discipline-002",
      "model-solution-proposal-003",
    ]);
    expect(value.COORDINATE.elementCount).toBe(7);
    expect(value.COORDINATE.aggregateId).toMatch(/^[0-9a-f]{64}$/);

    // CLASH-DETECT: the flagship finding — the ghost wall clashes the
    // beam; the near-boundary pair is honest; both conflicts bind to
    // the P2 problem lane.
    expect(value.CLASH_DETECT.clashCount).toBe(1);
    expect(value.CLASH_DETECT.withinToleranceCount).toBe(1);
    expect(value.CLASH_DETECT.conflictIds.length).toBe(2);
    expect(value.CLASH_DETECT.problemId).toBe("problem-demo-coordination-001");

    // QUANTIFY: the REAL derived BOQ is served + viewed + projected.
    expect(value.QUANTIFY.boqId).toBe(FIXTURE_QUANTIFY_WORLD.boq.boqId);
    expect(value.QUANTIFY.sectionCount).toBe(FIXTURE_QUANTIFY_WORLD.boq.sections.length);
    expect(value.QUANTIFY.projectedLineCount).toBeGreaterThan(0);
    expect(value.QUANTIFY.projectionId).toMatch(/^[0-9a-f]{64}$/);

    // WHAT-IF: two alternatives compared through the P1 vocabulary.
    expect(value.WHAT_IF.alternativeCount).toBe(2);
    expect(value.WHAT_IF.deviationClassifications).toEqual([
      "deviation-detected",
      "deviation-detected",
    ]);

    // SEQUENCE: the declared plan through the P0-C simulation port.
    expect(value.SEQUENCE.makespanHours).toBe(48);
    expect(value.SEQUENCE.activityCount).toBe(3);
    expect(value.SEQUENCE.playbackSegments).toBeGreaterThan(0);
    expect(value.SEQUENCE.trajectoryId).toMatch(/^[0-9a-f]{64}$/);

    // REPLAY: the session audit trail verified.
    expect(value.REPLAY.entryCount).toBe(9);
    expect(value.REPLAY.verified).toBe(true);
    expect(value.REPLAY.logId).toMatch(/^[0-9a-f]{64}$/);

    // The run id is the content address of the whole run.
    expect(value.runId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the run is byte-identical across fresh kits (determinism end-to-end)", () => {
    const a = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    const b = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
  });

  test("the run works over the ALTERNATE double kit (substrate substitution transparency)", () => {
    const alternateKit: InteractiveSolutionLaneKit = {
      nlParser: alternateNlCommandParserDouble(),
      clashEngine: alternateClashPredicateDouble(),
      boqView: alternateBoqGraphViewDouble([FIXTURE_QUANTIFY_WORLD.boq]),
      usage: new SolutionSceneUsageAlternateDouble(defaultRealityPorts()),
      simulation: alternateSimulationDouble(),
      replayLedger: alternateReplayLedgerDouble("solution-demo-001", 1),
    };
    const referenceRun = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    const alternateRun = runInteractiveSolutionLane(alternateKit);
    expect(referenceRun.ok).toBe(true);
    expect(alternateRun.ok).toBe(true);
    if (!referenceRun.ok || !alternateRun.ok) return;
    // Every stage identity is SUBSTRATE-INDEPENDENT (the lane's own
    // content addressing): the whole run record is byte-identical.
    expect(canonicalJsonStringify(referenceRun.value)).toBe(
      canonicalJsonStringify(alternateRun.value),
    );
  });

  test("a kit whose BOQ store lost the fixture BOQ fails closed (no fabricated quantification)", () => {
    const emptyStoreKit: InteractiveSolutionLaneKit = {
      ...defaultInteractiveSolutionLaneKit(),
      boqView: alternateBoqGraphViewDouble([]),
    };
    const outcome = runInteractiveSolutionLane(emptyStoreKit);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("retrieval-failure");
    expect(outcome.failure.detail).toContain("refuses to quantify");
  });

  test("a kit whose clash engine refuses fails closed (the refusal propagates)", () => {
    const refusingEngineKit: InteractiveSolutionLaneKit = {
      ...defaultInteractiveSolutionLaneKit(),
      clashEngine: {
        portId: "coordination.clash-predicate/1",
        capabilities: {
          supportedShapeKinds: ["box"],
          maxPairs: 1000,
          blocked: [
            {
              capability: "everything",
              reason: "test drill: this occupant refuses all work",
            },
          ],
        },
        detectClashes: () => ({
          ok: false as const,
          failure: {
            kind: "unsupported-data" as const,
            family: "coordination" as const,
            detail: "test drill: the clash engine occupant refused the request",
          },
        }),
      },
    };
    const outcome = runInteractiveSolutionLane(refusingEngineKit);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("test drill");
  });

  test("the lane records BOTH authoring modalities in the replay ledger (the equivalence audit)", () => {
    const kit = defaultInteractiveSolutionLaneKit();
    const run = runInteractiveSolutionLane(kit);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const log = kit.replayLedger.currentLog();
    expect(log.ok).toBe(true);
    if (!log.ok) return;
    const authoredEvents = log.value.entries.filter(
      (entry) => entry.event.event === "command-authored",
    );
    expect(authoredEvents.length).toBe(2);
    const modalities = authoredEvents.map(
      (entry) => (entry.event as { readonly modality: string }).modality,
    );
    expect(modalities).toContain("direct-manipulation");
    expect(modalities).toContain("agent");
    // The two authored commands carry the SAME operation id (the
    // equivalence is itself auditable in the trail).
    const operationIds = authoredEvents.map(
      (entry) => (entry.event as { readonly operationId: string }).operationId,
    );
    expect(operationIds[0]).toBe(operationIds[1]);
  });

  test("the replay ledger is append-only across the run (no rewrites)", () => {
    const kit = defaultInteractiveSolutionLaneKit();
    const run = runInteractiveSolutionLane(kit);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const log = kit.replayLedger.currentLog();
    expect(log.ok).toBe(true);
    if (!log.ok) return;
    const sequences = log.value.entries.map((entry) => entry.sequence);
    expect(sequences).toEqual(sequences.map((_, index) => index + 1));
  });

  test("the reference usage host and the alternate usage host both run the lane (P0-C seam composed)", () => {
    for (const usage of [
      new SolutionSceneUsageReferenceDouble(),
      new SolutionSceneUsageAlternateDouble(),
    ]) {
      const kit: InteractiveSolutionLaneKit = {
        ...defaultInteractiveSolutionLaneKit(),
        usage,
      };
      const run = runInteractiveSolutionLane(kit);
      expect(run.ok).toBe(true);
    }
  });

  test("the reference and alternate simulation ports both drive the SEQUENCE stage", () => {
    for (const simulation of [
      referenceSimulationDouble(),
      alternateSimulationDouble(),
    ]) {
      const kit: InteractiveSolutionLaneKit = {
        ...defaultInteractiveSolutionLaneKit(),
        simulation,
      };
      const run = runInteractiveSolutionLane(kit);
      expect(run.ok).toBe(true);
      if (!run.ok) continue;
      expect(run.value.SEQUENCE.makespanHours).toBe(48);
    }
  });

  test("the reference and alternate replay ledgers both close the lane (REPLAY seam composed)", () => {
    for (const ledger of [
      referenceReplayLedgerDouble("solution-demo-001", 1),
      alternateReplayLedgerDouble("solution-demo-001", 1),
    ]) {
      const kit: InteractiveSolutionLaneKit = {
        ...defaultInteractiveSolutionLaneKit(),
        replayLedger: ledger,
      };
      const run = runInteractiveSolutionLane(kit);
      expect(run.ok).toBe(true);
      if (!run.ok) continue;
      expect(run.value.REPLAY.entryCount).toBe(9);
      expect(run.value.REPLAY.verified).toBe(true);
    }
  });
});
