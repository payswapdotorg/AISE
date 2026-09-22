/**
 * HFX-101 — the CORPUS tests: the committed eight-task corpus, the
 * twelve materialized runs, the behavior-matrix coverage, the task kinds,
 * the evidence-revision declarations and the reality-eval validation of
 * every scenario descriptor (the Layer-1 schema consumed, never forked).
 */

import { describe, expect, test } from "bun:test";
import { validateRealityEvalScenarioDescriptor } from "../reality-eval";
import { LANE_BENCHMARK_IDS } from "../reality-eval";
import {
  MAPANYTHING_EVAL_CORPUS,
  mapAnythingEvalRuns,
  mapAnythingEvalRunsForVariant,
  mapAnythingRunOf,
  referenceRunOf,
} from "./corpus";
import { MAPANYTHING_PROVIDER_ID } from "./model";

describe("HFX-101 corpus: the committed eight-task corpus", () => {
  test("eight tasks with unique ids, in committed order", () => {
    expect(MAPANYTHING_EVAL_CORPUS.length).toBe(8);
    const ids = MAPANYTHING_EVAL_CORPUS.map((task) => task.taskId);
    expect(new Set(ids).size).toBe(8);
    expect(ids[0]).toBe("recon-multiimage-flagship-grounded-001");
    expect(ids[7]).toBe("recon-unsupported-novelview-008");
  });

  test("every mandated behavior-matrix cell has at least one fixture", () => {
    const cells = MAPANYTHING_EVAL_CORPUS.map((task) => task.matrixCell);
    for (const cell of [
      "grounded-pass",
      "degraded-evidence",
      "failed-invocation",
      "unsupported-task-combination",
    ]) {
      expect(cells.filter((entry) => entry === cell).length).toBeGreaterThanOrEqual(1);
    }
    expect(cells.filter((entry) => entry === "grounded-pass").length).toBe(4);
    expect(cells.filter((entry) => entry === "degraded-evidence").length).toBe(2);
  });

  test("the three mandated task kinds are all exercised (multi-image / metric-depth / registration)", () => {
    const kinds = MAPANYTHING_EVAL_CORPUS.map((task) => task.taskKind);
    expect(kinds.filter((kind) => kind === "multi-image-reconstruction").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((kind) => kind === "registration").length).toBe(2);
    expect(kinds.filter((kind) => kind === "metric-depth").length).toBe(1);
    // the one out-of-set task kind is the unsupported-task-combination fixture:
    expect(kinds.filter((kind) => kind === "novel-view-synthesis").length).toBe(1);
  });

  test("every task declares its evidence bundle WITH REVISION IDS and an expected canonical outcome", () => {
    for (const task of MAPANYTHING_EVAL_CORPUS) {
      expect(task.evidence.evidenceRevisions.length).toBeGreaterThan(0);
      expect(task.evidence.captureSet.frames.length).toBeGreaterThan(0);
      for (const frame of task.evidence.captureSet.frames) {
        expect(frame.evidenceRevision).toMatch(/^r\d+$/);
        expect(frame.pose.position.length).toBe(3);
        expect(frame.pose.orientation.length).toBe(4);
        expect(frame.intrinsics.fx).toBeGreaterThan(0);
      }
      if (task.capability === "reconstruction") {
        expect(task.expected.kind).toBe(
          task.matrixCell === "grounded-pass" ? "reconstruction-scene" : "explicit-refusal",
        );
      } else {
        expect(task.expected.kind).toBe("depth-grid");
      }
    }
  });

  test("the grounded tasks' criteria cite the committed threshold tables (the gates-1 rows / the depth table)", () => {
    for (const task of MAPANYTHING_EVAL_CORPUS.filter((entry) => entry.matrixCell === "grounded-pass")) {
      expect(task.criteria.thresholds.length).toBeGreaterThan(0);
      expect(task.criteria.expectedFailureKinds).toEqual([]);
      for (const threshold of task.criteria.thresholds) {
        if (task.capability === "reconstruction") {
          // the reconstruction thresholds mirror the benchmark engine's gates-1 table rows:
          expect(threshold.rationale).toContain("gates-1");
        } else {
          // the depth thresholds are the committed depth-lane table (mirrors the reality-eval suite):
          expect(threshold.rationale).toContain("depth");
        }
      }
    }
    for (const task of MAPANYTHING_EVAL_CORPUS.filter((entry) => entry.matrixCell !== "grounded-pass")) {
      expect(task.criteria.thresholds).toEqual([]);
      expect(task.criteria.expectedFailureKinds.length).toBe(1);
    }
  });
});

describe("HFX-101 corpus: the twelve materialized runs", () => {
  const runs = mapAnythingEvalRuns();

  test("twelve runs: eight MapAnything runs + four reference-path runs, interleaved per task", () => {
    expect(runs.length).toBe(12);
    expect(runs.filter((run) => run.variant === MAPANYTHING_PROVIDER_ID).length).toBe(8);
    expect(runs.filter((run) => run.variant === "reference-reconstruction").length).toBe(3);
    expect(runs.filter((run) => run.variant === "reference-depth").length).toBe(1);
    // per task: the MapAnything run first, then the reference run (content tasks only):
    expect(runs[0]?.variant).toBe(MAPANYTHING_PROVIDER_ID);
    expect(runs[1]?.variant).toBe("reference-reconstruction");
    expect(runs[8]?.variant).toBe(MAPANYTHING_PROVIDER_ID);
    expect(runs[8]?.taskId).toBe("recon-registration-degraded-overlap-005");
  });

  test("the reference path evaluates the SAME evidence fixtures (the four grounded content tasks)", () => {
    for (const task of MAPANYTHING_EVAL_CORPUS) {
      const referenceVariant = referenceRunOf(task);
      if (task.matrixCell === "grounded-pass") {
        expect(referenceVariant).toBe(
          task.capability === "depth" ? "reference-depth" : "reference-reconstruction",
        );
      } else {
        expect(referenceVariant).toBeUndefined();
      }
    }
    // the shared evidence: the reference runs reference the same fixtures + the same samples:
    const referenceRecon = mapAnythingEvalRunsForVariant("reference-reconstruction");
    const flagship = referenceRecon.find((run) => run.taskId === "recon-multiimage-flagship-grounded-001");
    expect(flagship?.scenario.input.payload["fixtureId"]).toBe("fixture-flagship-livingroom-001");
    const referenceDepth = mapAnythingEvalRunsForVariant("reference-depth");
    const depthRun = referenceDepth[0];
    expect(depthRun?.scenario.input.payload["samples"]).toHaveLength(16);
    const mapAnythingDepth = mapAnythingEvalRunsForVariant(MAPANYTHING_PROVIDER_ID).find(
      (run) => run.taskId === "depth-metric-wall-grounded-004",
    );
    expect(mapAnythingDepth?.scenario.input.payload["samples"]).toEqual(
      depthRun?.scenario.input.payload["samples"],
    );
  });

  test("every run's scenario descriptor validates through the REALITY-EVAL validator (schema consumed, never forked)", () => {
    for (const run of runs) {
      const validation = validateRealityEvalScenarioDescriptor(run.scenario);
      expect(validation.ok, run.runId).toBe(true);
      if (validation.ok) {
        expect(validation.descriptor.scenarioId).toBe(run.runId);
        expect(validation.descriptor.benchmarkId).toBe(LANE_BENCHMARK_IDS[run.task.capability]);
      }
    }
  });

  test("the MapAnything inputs carry the capture-set evidence; the reference inputs are the reference contracts' exact shapes", () => {
    for (const run of runs.filter((entry) => entry.variant === MAPANYTHING_PROVIDER_ID)) {
      const payload = run.scenario.input.payload as Record<string, unknown>;
      expect(typeof payload["task"]).toBe("string");
      expect(typeof payload["captureSetJson"]).toBe("string");
      expect(typeof payload["sceneTag"]).toBe("string");
      const captureSet = JSON.parse(payload["captureSetJson"] as string) as {
        frames: { evidenceRevision: string }[];
      };
      expect(captureSet.frames.length).toBeGreaterThan(0);
    }
    for (const run of runs.filter((entry) => entry.variant === "reference-reconstruction")) {
      expect(Object.keys(run.scenario.input.payload).sort()).toEqual([
        "deviceClass",
        "fixtureId",
        "sceneTag",
      ]);
    }
    for (const run of runs.filter((entry) => entry.variant === "reference-depth")) {
      expect(Object.keys(run.scenario.input.payload).sort()).toEqual([
        "gridHeight",
        "gridWidth",
        "samples",
        "sceneTag",
      ]);
    }
  });

  test("the run lookup resolves committed ids and fails closed on unknown ids", () => {
    expect(mapAnythingRunOf("depth-metric-wall-grounded-004@mapanything").taskId).toBe(
      "depth-metric-wall-grounded-004",
    );
    expect(() => mapAnythingRunOf("no-such-run")).toThrow();
  });

  test("the corpus is deterministic: two builds are byte-identical", () => {
    const first = mapAnythingEvalRuns();
    const second = mapAnythingEvalRuns();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
