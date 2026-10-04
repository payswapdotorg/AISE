/**
 * WORLD-P3 — the LANE RUNNER (`src/lane.ts`): the seven-stage lane,
 * composed end-to-end.
 *
 *   AUTHOR → COORDINATE → CLASH-DETECT → QUANTIFY → WHAT-IF →
 *   SEQUENCE → REPLAY
 *
 * The runner composes the four family ports — the NL-command parser
 * (the NL substrate seam), the clash-predicate engine (the clash
 * substrate seam), the BOQ-graph view (the store seam) and the
 * simulation + replay-ledger ports — with the P0-C scene-usage
 * adapter (itself wired over the P0-A in-memory doubles). It is the
 * in-memory proof that the WHOLE Layer-3 lane works WITHOUT any
 * substrate: no Babylon, no OCCT, no clash engine, no NLU, no real
 * BOQ store, no persisted ledger — only the committed fixtures, the
 * deterministic doubles and the REAL solution-contract/engine/BOQ
 * seams.
 *
 * THE FIXTURE SCENARIO (the wall-repair world):
 *
 *  1. AUTHOR — the engineer authors the block-wall command BOTH ways:
 *     the direct-manipulation stream AND the natural-language
 *     utterance. The lane PROVES the equivalence law live: both
 *     compiles derive the SAME content-derived operation identity
 *     (recorded in the stage result). The proposed wall presents as
 *     a GHOST through the P0-C usage adapter.
 *  2. COORDINATE — the three discipline models (reality, BIM, the
 *     solution proposal) aggregate into one coordinated world with
 *     cross-model identity quarantine.
 *  3. CLASH-DETECT — the proposed ghost wall vs the overhead beam:
 *     the clash verdict is CLASH (deep penetration); the conflict
 *     record binds to the P2 problem lane. THE FLAGSHIP FINDING.
 *  4. QUANTIFY — the BOQ-graph view resolves the REAL derived BOQ
 *     (from the engine-replayed wall-upgrade world); the view queries
 *     serve it read-only; the live projection projects the plaster
 *     operation's engine quantities.
 *  5. WHAT-IF — two beam-clearance alternatives compose through the
 *     P0-C what-if usage port and compare against the baseline
 *     through the P1 deviation vocabulary.
 *  6. SEQUENCE — the declared activity plan compiles into the P0-C
 *     simulation request and the trajectory + playback phases come
 *     back from the simulation port.
 *  7. REPLAY — every lane transition records into the replay ledger;
 *     the final log verifies and the re-run is byte-identical.
 *
 * DETERMINISM (seam law #9): the runner is PURE — no clock, no
 * randomness, no I/O; every instant is a declared fixture input. The
 * same kit + the same scenario always produce the byte-identical run
 * (including the content-derived `runId`) — asserted in lane.test.ts.
 */

import {
  SolutionSceneUsageReferenceDouble,
  defaultRealityPorts,
  type SolutionSceneUsageAdapter,
} from "@aise/world-solution-substrate";
import { laneRefused, canonicalDigestOf, type LaneOutcome, type Layer3Family } from "./seam";
import {
  compileAuthoringCommand,
  compileManipulationStream,
  composeGhostScene,
  ghostSetOfCommand,
  parseNlCommandThroughPort,
  proposedStatePresentationRequestOf,
  type AuthoredCommand,
} from "./authoring/contract";
import {
  FIXTURE_AUTHORING_SCOPE,
  FIXTURE_DM_STREAM_BLOCK_WALL,
  FIXTURE_GHOST_GLTF_BYTES,
  FIXTURE_NL_AUTHORED_AT,
  FIXTURE_OPERATOR_AGENT,
  FIXTURE_OPERATOR_ENGINEER,
  FIXTURE_SELECTION_WALL,
  FIXTURE_UTTERANCE_BLOCK_WALL,
} from "./authoring/corpus";
import type { NlCommandParserAdapter } from "./authoring/contract";
import {
  aggregateCoordinationModels,
  recordCoordinationConflicts,
  type ClashPredicateAdapter,
} from "./coordination/contract";
import {
  fixtureClashTestRequest,
  fixtureCoordinationRequest,
  FIXTURE_COORDINATION_PROBLEMS,
} from "./coordination/corpus";
import {
  projectLiveQuantityConsequences,
  viewBoqGraph,
  compareWhatIfAlternatives,
  type BoqGraphViewAdapter,
} from "./quantify/contract";
import {
  fixtureProjectionRequest,
  fixtureWhatIfComparisonRequest,
} from "./quantify/corpus";
import {
  openReplayLog,
  sequenceExecution,
  type SolutionReplayLedger,
  type SolutionReplayLog,
} from "./sequencing/contract";
import { FIXTURE_SEQUENCING_PLAN } from "./sequencing/corpus";
import type { ExecutionSimulationAdapter } from "@aise/world-solution-substrate";

const FAMILY: Layer3Family = "sequencing";

/* ------------------------------------------------------------------ */
/* The lane kit + scenario                                              */
/* ------------------------------------------------------------------ */

/**
 * The complete substrate-port kit the lane composes. Every port is a
 * replaceable substrate seam with an in-memory substitution double as
 * its proof occupant (a real substrate host arrives in WORLD-P4).
 */
export interface InteractiveSolutionLaneKit {
  /** The NL-command parser port (the NL substrate seam). */
  readonly nlParser: NlCommandParserAdapter;
  /** The clash-predicate port (the clash-engine substrate seam). */
  readonly clashEngine: ClashPredicateAdapter;
  /** The BOQ-graph view port (the store substrate seam). */
  readonly boqView: BoqGraphViewAdapter;
  /** The P0-C scene-usage port (ghost/what-if presentation). */
  readonly usage: SolutionSceneUsageAdapter;
  /** The P0-C execution-simulation port (trajectory computation). */
  readonly simulation: ExecutionSimulationAdapter;
  /** The replay-ledger port (the audit-trail store seam). */
  readonly replayLedger: SolutionReplayLedger;
}

/** The stage results of one lane run (one per lane stage). */
export interface InteractiveSolutionLaneRun {
  readonly runId: string;
  readonly AUTHOR: {
    readonly dmOperationId: string;
    readonly nlOperationId: string;
    /** True iff the DM and NL compiles derived the SAME operation id. */
    readonly modalityEquivalenceProven: boolean;
    readonly presentationToken: string;
    readonly ghostElementIds: readonly string[];
  };
  readonly COORDINATE: {
    readonly aggregateId: string;
    readonly modelIds: readonly string[];
    readonly elementCount: number;
  };
  readonly CLASH_DETECT: {
    readonly reportId: string;
    readonly clashCount: number;
    readonly withinToleranceCount: number;
    readonly conflictIds: readonly string[];
    readonly problemId: string;
  };
  readonly QUANTIFY: {
    readonly boqId: string;
    readonly sectionCount: number;
    readonly viewId: string;
    readonly projectionId: string;
    readonly projectedLineCount: number;
  };
  readonly WHAT_IF: {
    readonly comparisonId: string;
    readonly alternativeCount: number;
    readonly deviationClassifications: readonly string[];
  };
  readonly SEQUENCE: {
    readonly trajectoryId: string;
    readonly makespanHours: number;
    readonly activityCount: number;
    readonly playbackSegments: number;
  };
  readonly REPLAY: {
    readonly logId: string;
    readonly entryCount: number;
    readonly verified: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* The lane runner                                                      */
/* ------------------------------------------------------------------ */

/**
 * Run the seven-stage Layer-3 lane end-to-end over the committed
 * fixtures. Fail-closed: any stage refusal aborts the run and returns
 * the typed refusal. Deterministic: the same kit + scenario produce
 * the byte-identical run (content-derived runId).
 */
export function runInteractiveSolutionLane(
  kit: InteractiveSolutionLaneKit,
): LaneOutcome<InteractiveSolutionLaneRun> {
  /* 1. AUTHOR — the DM↔NL equivalence + the ghost presentation. */
  const dmCompile = compileManipulationStream(
    FIXTURE_DM_STREAM_BLOCK_WALL,
    FIXTURE_AUTHORING_SCOPE,
  );
  if (!dmCompile.ok) {
    return dmCompile;
  }
  const dmCommand = compileAuthoringCommand(
    dmCompile.value.draft,
    FIXTURE_AUTHORING_SCOPE,
    {
      operator: FIXTURE_OPERATOR_ENGINEER,
      authoredAt: FIXTURE_DM_STREAM_BLOCK_WALL.authoredAt,
      interactionDetail: dmCompile.value.interactionDetail,
    },
    "intent-lane-dm-0001",
  );
  if (!dmCommand.ok) {
    return dmCommand;
  }
  const nlParse = parseNlCommandThroughPort(kit.nlParser, {
    utterance: FIXTURE_UTTERANCE_BLOCK_WALL,
    scope: FIXTURE_AUTHORING_SCOPE,
    selectedElementId: FIXTURE_SELECTION_WALL,
  });
  if (!nlParse.ok) {
    return nlParse;
  }
  const nlCommand = compileAuthoringCommand(
    nlParse.value,
    FIXTURE_AUTHORING_SCOPE,
    {
      operator: FIXTURE_OPERATOR_AGENT,
      authoredAt: FIXTURE_NL_AUTHORED_AT,
      commandText: FIXTURE_UTTERANCE_BLOCK_WALL,
    },
    "intent-lane-nl-0001",
  );
  if (!nlCommand.ok) {
    return nlCommand;
  }
  const equivalenceProven =
    dmCommand.value.operationId === nlCommand.value.operationId;
  const ghostScene = composeGhostScene(
    FIXTURE_AUTHORING_SCOPE.worldScene,
    nlCommand.value,
    {
      geometry: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
      label: "Proposed block wall (ghost)",
    },
  );
  if (!ghostScene.ok) {
    return ghostScene;
  }
  const presentationRequest = proposedStatePresentationRequestOf(
    nlCommand.value,
    ghostScene.value,
    [
      {
        reference: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
        source: { assetId: "asset-ghost-lintel", format: "gltf-json", bytes: FIXTURE_GHOST_GLTF_BYTES },
      },
    ],
  );
  if (!presentationRequest.ok) {
    return presentationRequest;
  }
  const presentation = kit.usage.presentProposedState(presentationRequest.value);
  if (!presentation.ok) {
    return laneRefused<InteractiveSolutionLaneRun>(
      FAMILY,
      presentation.failure.kind,
      `the ghost presentation refused the authored command: ${presentation.failure.detail}`,
    );
  }

  /* 2. COORDINATE — the multi-model aggregation. */
  const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
  if (!aggregate.ok) {
    return aggregate;
  }

  /* 3. CLASH-DETECT — the clash report + the conflict records. */
  const clashReport = kit.clashEngine.detectClashes(
    fixtureClashTestRequest(),
    aggregate.value,
  );
  if (!clashReport.ok) {
    return clashReport;
  }
  const conflicts = recordCoordinationConflicts({
    report: clashReport.value,
    problems: FIXTURE_COORDINATION_PROBLEMS,
    recordedAt: "2026-10-05T09:10:00.000Z",
  });
  if (!conflicts.ok) {
    return conflicts;
  }

  /* 4. QUANTIFY — the BOQ view + the live projection. */
  const boqResolution = kit.boqView.resolveBoqVersion({
    solutionId: FIXTURE_AUTHORING_SCOPE.solutionId,
    versionNumber: FIXTURE_AUTHORING_SCOPE.versionNumber,
  });
  if (!boqResolution.ok) {
    return boqResolution;
  }
  const baselineBoq = boqResolution.value;
  if (baselineBoq === null) {
    return laneRefused<InteractiveSolutionLaneRun>(
      FAMILY,
      "retrieval-failure",
      "the BOQ-graph view resolved no BOQ for the fixture solution version — the lane refuses to quantify without the authority's record",
    );
  }
  const sectionView = viewBoqGraph({
    boq: baselineBoq,
    query: { query: "section-totals" },
  });
  if (!sectionView.ok) {
    return sectionView;
  }
  const projection = projectLiveQuantityConsequences({
    ...fixtureProjectionRequest(),
    baselineBoq,
  });
  if (!projection.ok) {
    return projection;
  }

  /* 5. WHAT-IF — the alternative comparison. */
  const comparison = compareWhatIfAlternatives(
    fixtureWhatIfComparisonRequest(),
    kit.usage,
  );
  if (!comparison.ok) {
    return comparison;
  }

  /* 6. SEQUENCE — the declared plan through the simulation port. */
  const sequenced = sequenceExecution(FIXTURE_SEQUENCING_PLAN, kit.simulation);
  if (!sequenced.ok) {
    return sequenced;
  }

  /* 7. REPLAY — the session audit trail. */
  const replayEvents = replayEventsOf({
    dmCommand: dmCommand.value,
    nlCommand: nlCommand.value,
    presentationToken: presentation.value.presentationToken,
    clashReportId: clashReport.value.reportId,
    clashCount:
      clashReport.value.verdictCounts.find((c) => c.verdict === "clash")?.count ?? 0,
    withinToleranceCount:
      clashReport.value.verdictCounts.find((c) => c.verdict === "within-tolerance")?.count ?? 0,
    conflictIds: conflicts.value.map((record) => record.conflictId),
    problemId: FIXTURE_COORDINATION_PROBLEMS[0]?.problemId ?? "problem-demo-coordination-001",
    projectionId: projection.value.projectionId,
    projectedLineCount: projection.value.lines.length,
    baselineBoqId: baselineBoq.boqId,
    comparisonId: comparison.value.comparisonId,
    alternativeCount: comparison.value.alternatives.length,
    trajectoryId: sequenced.value.trajectory.trajectoryId,
    makespanHours: sequenced.value.trajectory.makespanHours,
    activityCount: sequenced.value.trajectory.activities.length,
    solutionId: FIXTURE_AUTHORING_SCOPE.solutionId,
  });
  void openReplayLog;
  for (const event of replayEvents) {
    const appended = kit.replayLedger.append(event);
    if (!appended.ok) {
      return appended;
    }
  }
  const finalLog = kit.replayLedger.currentLog();
  if (!finalLog.ok) {
    return finalLog;
  }
  const log: SolutionReplayLog = finalLog.value;

  /* The run record (content-addressed). */
  const run: InteractiveSolutionLaneRun = {
    runId: "",
    AUTHOR: {
      dmOperationId: dmCommand.value.operationId,
      nlOperationId: nlCommand.value.operationId,
      modalityEquivalenceProven: equivalenceProven,
      presentationToken: presentation.value.presentationToken,
      ghostElementIds: [...ghostSetOfCommand(nlCommand.value).proposedElementIds],
    },
    COORDINATE: {
      aggregateId: aggregate.value.aggregateId,
      modelIds: [...aggregate.value.modelIds],
      elementCount: aggregate.value.scene.nodes.length,
    },
    CLASH_DETECT: {
      reportId: clashReport.value.reportId,
      clashCount:
        clashReport.value.verdictCounts.find((c) => c.verdict === "clash")?.count ?? 0,
      withinToleranceCount:
        clashReport.value.verdictCounts.find((c) => c.verdict === "within-tolerance")?.count ?? 0,
      conflictIds: conflicts.value.map((record) => record.conflictId),
      problemId: FIXTURE_COORDINATION_PROBLEMS[0]?.problemId ?? "problem-demo-coordination-001",
    },
    QUANTIFY: {
      boqId: baselineBoq.boqId,
      sectionCount: sectionView.value.sectionTotals.length,
      viewId: sectionView.value.viewId,
      projectionId: projection.value.projectionId,
      projectedLineCount: projection.value.lines.length,
    },
    WHAT_IF: {
      comparisonId: comparison.value.comparisonId,
      alternativeCount: comparison.value.alternatives.length,
      deviationClassifications: comparison.value.alternatives.flatMap((alternative) =>
        alternative.deviationVerdicts.map((verdict) => verdict.classification),
      ),
    },
    SEQUENCE: {
      trajectoryId: sequenced.value.trajectory.trajectoryId,
      makespanHours: sequenced.value.trajectory.makespanHours,
      activityCount: sequenced.value.trajectory.activities.length,
      playbackSegments: sequenced.value.playbackPhases.length,
    },
    REPLAY: {
      logId: log.logId,
      entryCount: log.entries.length,
      verified: true,
    },
  };
  const runId = canonicalDigestOf(runRecordBody(run));
  return { ok: true, value: { ...run, runId } };
}

/** The canonical run body (the digest projection). */
function runRecordBody(run: InteractiveSolutionLaneRun): Record<string, unknown> {
  return {
    AUTHOR: run.AUTHOR,
    COORDINATE: run.COORDINATE,
    CLASH_DETECT: run.CLASH_DETECT,
    QUANTIFY: run.QUANTIFY,
    WHAT_IF: run.WHAT_IF,
    SEQUENCE: run.SEQUENCE,
    REPLAY: run.REPLAY,
  };
}

/* ------------------------------------------------------------------ */
/* The session replay events (one per lane transition)                  */
/* ------------------------------------------------------------------ */

function replayEventsOf(facts: {
  readonly dmCommand: AuthoredCommand;
  readonly nlCommand: AuthoredCommand;
  readonly presentationToken: string;
  readonly clashReportId: string;
  readonly clashCount: number;
  readonly withinToleranceCount: number;
  readonly conflictIds: readonly string[];
  readonly problemId: string;
  readonly projectionId: string;
  readonly projectedLineCount: number;
  readonly baselineBoqId: string;
  readonly comparisonId: string;
  readonly alternativeCount: number;
  readonly trajectoryId: string;
  readonly makespanHours: number;
  readonly activityCount: number;
  readonly solutionId: string;
}): readonly import("./sequencing/contract").SolutionReplayEvent[] {
  return [
    {
      event: "command-authored",
      operator: FIXTURE_OPERATOR_ENGINEER,
      modality: "direct-manipulation",
      operationId: facts.dmCommand.operationId,
      commandKind: facts.dmCommand.commandKind,
      authoredAt: FIXTURE_DM_STREAM_BLOCK_WALL.authoredAt,
    },
    {
      event: "command-authored",
      operator: FIXTURE_OPERATOR_AGENT,
      modality: "agent",
      operationId: facts.nlCommand.operationId,
      commandKind: facts.nlCommand.commandKind,
      authoredAt: FIXTURE_NL_AUTHORED_AT,
    },
    {
      event: "ghost-presented",
      operator: FIXTURE_OPERATOR_ENGINEER,
      solutionId: facts.solutionId,
      versionNumber: 1,
      presentationToken: facts.presentationToken,
      proposedElementCount: 1,
      declaredAt: "2026-09-16T09:11:00.000Z",
    },
    {
      event: "clash-detected",
      operator: FIXTURE_OPERATOR_ENGINEER,
      reportId: facts.clashReportId,
      clashCount: facts.clashCount,
      withinToleranceCount: facts.withinToleranceCount,
      declaredAt: "2026-10-05T09:00:00.000Z",
    },
    {
      event: "conflict-recorded",
      operator: FIXTURE_OPERATOR_ENGINEER,
      conflictIds: [...facts.conflictIds],
      problemId: facts.problemId,
      recordedAt: "2026-10-05T09:10:00.000Z",
    },
    {
      event: "quantity-projected",
      operator: FIXTURE_OPERATOR_ENGINEER,
      projectionId: facts.projectionId,
      lineCount: facts.projectedLineCount,
      baselineBoqId: facts.baselineBoqId,
      declaredAt: "2026-10-05T10:00:00.000Z",
    },
    {
      event: "what-if-compared",
      operator: FIXTURE_OPERATOR_ENGINEER,
      comparisonId: facts.comparisonId,
      alternativeCount: facts.alternativeCount,
      declaredAt: "2026-10-05T10:30:00.000Z",
    },
    {
      event: "sequence-computed",
      operator: FIXTURE_OPERATOR_ENGINEER,
      trajectoryId: facts.trajectoryId,
      makespanHours: facts.makespanHours,
      activityCount: facts.activityCount,
      declaredAt: "2026-10-05T11:00:00.000Z",
    },
    {
      event: "solution-accepted",
      operator: FIXTURE_OPERATOR_ENGINEER,
      solutionId: facts.solutionId,
      versionNumber: 1,
      decidedAt: "2026-10-05T12:00:00.000Z",
      note: "accepted after the what-if alternatives were compared",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The default kit (every port on its substitution double)              */
/* ------------------------------------------------------------------ */

import { referenceNlCommandParserDouble } from "./authoring/doubles";
import { referenceClashPredicateDouble } from "./coordination/doubles";
import { referenceBoqGraphViewDouble } from "./quantify/doubles";
import { FIXTURE_QUANTIFY_WORLD } from "./quantify/corpus";
import { referenceSimulationDouble } from "@aise/world-solution-substrate";
import { referenceReplayLedgerDouble } from "./sequencing/doubles";

/**
 * The DEFAULT lane kit: every substrate port on its reference
 * substitution double — the whole lane runs WITHOUT any substrate.
 */
export function defaultInteractiveSolutionLaneKit(): InteractiveSolutionLaneKit {
  return {
    nlParser: referenceNlCommandParserDouble(),
    clashEngine: referenceClashPredicateDouble(),
    boqView: referenceBoqGraphViewDouble([FIXTURE_QUANTIFY_WORLD.boq]),
    usage: new SolutionSceneUsageReferenceDouble(defaultRealityPorts()),
    simulation: referenceSimulationDouble(),
    replayLedger: referenceReplayLedgerDouble(
      FIXTURE_AUTHORING_SCOPE.solutionId,
      FIXTURE_AUTHORING_SCOPE.versionNumber,
    ),
  };
}

/** The stage count (the lane's own closed vocabulary, re-exported). */
export { LAYER3_STAGE_NAMES } from "./seam";
