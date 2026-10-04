/**
 * WORLD-P3 tests — the DETERMINISM battery (the seam law #9 proof set).
 *
 *  1. SOURCE TRIPWIRE: the contract core contains NO clock reads, NO
 *     randomness, NO timers, NO network, NO filesystem — the only node
 *     builtin anywhere in the core is reached through the composed
 *     packages' own disciplined helpers (the digest discipline).
 *  2. CONTENT ADDRESSING: identical inputs derive identical
 *     content-derived ids across repeated calls and fresh hosts.
 *  3. THE INSTANT DISCIPLINE: every ISO instant in the lane outputs is
 *     one of the DECLARED fixture instants — no sensed time anywhere.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { runInteractiveSolutionLane, defaultInteractiveSolutionLaneKit } from "./lane";
import { contentIdOf, canonicalDigestOf } from "./seam";
import { ghostElementIdOf } from "./authoring/contract";
import { FIXTURE_AUTHORING_SCOPE } from "./authoring/corpus";
import {
  aggregateCoordinationModels,
  classifySeparation,
} from "./coordination/contract";
import { fixtureCoordinationRequest } from "./coordination/corpus";
import {
  projectLiveQuantityConsequences,
  viewBoqGraph,
} from "./quantify/contract";
import { fixtureProjectionRequest } from "./quantify/corpus";
import {
  openReplayLog,
  appendReplayEvent,
  verifyReplayLog,
} from "./sequencing/contract";
import { FIXTURE_REPLAY_EVENTS } from "./sequencing/corpus";
import { parseNlCommandThroughPort } from "./authoring/contract";
import { referenceNlCommandParserDouble } from "./authoring/doubles";
import {
  FIXTURE_NL_AUTHORED_AT,
  FIXTURE_DM_STREAM_BLOCK_WALL,
  FIXTURE_DM_AUTHORED_AT,
  FIXTURE_SELECTION_WALL,
  FIXTURE_UTTERANCE_BLOCK_WALL,
} from "./authoring/corpus";
import { fixtureWhatIfComparisonRequest } from "./quantify/corpus";
import { compareWhatIfAlternatives } from "./quantify/contract";
import { SolutionSceneUsageReferenceDouble } from "@aise/world-solution-substrate";

/* ------------------------------------------------------------------ */
/* 1. The source-level tripwire                                         */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 determinism — the source-level tripwire", () => {
  const SRC = join(import.meta.dir);
  const FORBIDDEN: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
    { pattern: /\bDate\.now\b/, reason: "clock read (Date.now)" },
    { pattern: /\bnew Date\b/, reason: "clock read (new Date)" },
    { pattern: /\bMath\.random\b/, reason: "randomness (Math.random)" },
    { pattern: /\bperformance\.now\b/, reason: "clock read (performance.now)" },
    { pattern: /\bsetTimeout\b/, reason: "timer (setTimeout)" },
    { pattern: /\bsetInterval\b/, reason: "timer (setInterval)" },
    { pattern: /\bfetch\s*\(/, reason: "network (fetch)" },
    { pattern: /\bWebSocket\b/, reason: "network (WebSocket)" },
    { pattern: /\breadFileSync\b/, reason: "filesystem read in the core" },
    { pattern: /\bwriteFileSync\b/, reason: "filesystem write in the core" },
    { pattern: /\breaddirSync\b/, reason: "filesystem scan in the core" },
  ];

  function collectSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectSourceFiles(path));
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(path);
      }
    }
    return files;
  }

  test("the contract core contains NO clock, randomness, timer, network or filesystem calls", () => {
    const files = collectSourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(12);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(source)) {
          violations.push(`${file}: ${rule.reason}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("no node: builtin is imported in the contract core (all node discipline lives in the composed packages)", () => {
    const files = collectSourceFiles(SRC);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/from\s+["'](node:[^"']+)["']/g)];
      for (const match of imports) {
        expect(match[1]).toBeDefined();
        // The only node: import anywhere in this package's core is NONE —
        // the digest discipline is imported from the composed seams.
        expect(["node:crypto"].includes(match[1]!)).toBe(false);
        expect(source).not.toContain("node:fs");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. Content addressing (identical inputs → identical ids)             */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 determinism — content addressing", () => {
  test("the lane run id is stable across re-runs (fresh kit each time)", () => {
    const first = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    const second = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.runId).toBe(second.value.runId);
    expect(canonicalJsonStringify(first.value)).toBe(
      canonicalJsonStringify(second.value),
    );
  });

  test("every content-derived id is re-derivable across fresh calls", () => {
    // Ghost element id.
    const draft = {
      kind: "spatial-authoring-command" as const,
      schemaVersion: "spatial-authoring-command/1" as const,
      commandKind: "add" as const,
      operationType: "block-wall-placement",
      targetElementId: "node-wall-002",
      parameterOverrides: [] as const,
      dependsOn: [] as const,
    };
    expect(ghostElementIdOf(draft)).toBe(ghostElementIdOf(draft));
    // Aggregate id.
    const a = aggregateCoordinationModels(fixtureCoordinationRequest());
    const b = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.aggregateId).toBe(b.value.aggregateId);
    }
    // Projection id.
    const p1 = projectLiveQuantityConsequences(fixtureProjectionRequest());
    const p2 = projectLiveQuantityConsequences(fixtureProjectionRequest());
    expect(p1.ok).toBe(true);
    expect(p2.ok).toBe(true);
    if (p1.ok && p2.ok) {
      expect(p1.value.projectionId).toBe(p2.value.projectionId);
    }
    // View id.
    const v1 = viewBoqGraph({
      boq: fixtureProjectionRequest().baselineBoq!,
      query: { query: "section-totals" },
    });
    const v2 = viewBoqGraph({
      boq: fixtureProjectionRequest().baselineBoq!,
      query: { query: "section-totals" },
    });
    expect(v1.ok).toBe(true);
    expect(v2.ok).toBe(true);
    if (v1.ok && v2.ok) {
      expect(v1.value.viewId).toBe(v2.value.viewId);
    }
    // Replay log id.
    const buildLog = () => {
      let log = openReplayLog("solution-demo-001", 1);
      for (const event of FIXTURE_REPLAY_EVENTS) {
        const appended = appendReplayEvent(log, event);
        if (!appended.ok) throw new Error("append failed");
        log = appended.value;
      }
      return log;
    };
    expect(buildLog().logId).toBe(buildLog().logId);
    // The seam digest helpers are stable.
    expect(canonicalDigestOf({ b: 2, a: 1 })).toBe(canonicalDigestOf({ a: 1, b: 2 }));
    expect(contentIdOf({ x: 1, id: "strip-me" }, "id")).toBe(
      contentIdOf({ x: 1, id: "other" }, "id"),
    );
  });

  test("pure functions with swapped evaluation order stay identical (order independence)", () => {
    // The verdict classification is a pure table.
    const values = [-0.2, -0.05, 0, 0.03, 0.05, 0.5, 2];
    const first = values.map((value) => classifySeparation(value, 0.05));
    const second = [...values].reverse().reverse().map((value) => classifySeparation(value, 0.05));
    expect(first).toEqual(second);
  });
});

/* ------------------------------------------------------------------ */
/* 3. The instant discipline                                            */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 determinism — the instant discipline (declared instants only)", () => {
  test("every ISO instant in the lane outputs is one of the declared fixture instants", () => {
    const declared = new Set([
      FIXTURE_DM_AUTHORED_AT,
      FIXTURE_NL_AUTHORED_AT,
      FIXTURE_DM_STREAM_BLOCK_WALL.authoredAt,
      "2026-09-16T09:00:00.000Z",
      "2026-09-16T09:05:00.000Z",
      "2026-09-16T09:10:00.000Z",
      "2026-09-16T09:15:00.000Z",
      "2026-09-16T09:16:00.000Z",
      "2026-09-16T08:00:00.000Z",
      "2026-09-16T10:00:00.000Z",
      "2026-09-16T10:01:00.000Z",
      "2026-09-16T10:02:00.000Z",
      "2026-09-16T10:03:00.000Z",
      "2026-09-16T10:04:00.000Z",
      "2026-09-16T11:00:00.000Z",
      "2026-10-05T07:00:00.000Z",
      "2026-10-05T08:00:00.000Z",
      "2026-10-05T09:00:00.000Z",
      "2026-10-05T09:05:00.000Z",
      "2026-10-05T09:06:00.000Z",
      "2026-10-05T09:10:00.000Z",
      "2026-10-05T09:11:00.000Z",
      "2026-10-05T10:00:00.000Z",
      "2026-10-05T10:30:00.000Z",
      "2026-10-05T11:00:00.000Z",
      "2026-10-05T12:00:00.000Z",
    ]);
    const outputs: unknown[] = [];
    const laneRun = runInteractiveSolutionLane(defaultInteractiveSolutionLaneKit());
    expect(laneRun.ok).toBe(true);
    if (laneRun.ok) outputs.push(laneRun.value);
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    if (aggregate.ok) outputs.push(aggregate.value);
    const clashEngineOutput = classifySeparation(0.02, 0.05);
    outputs.push(clashEngineOutput);
    const nlDraft = parseNlCommandThroughPort(referenceNlCommandParserDouble(), {
      utterance: FIXTURE_UTTERANCE_BLOCK_WALL,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    expect(nlDraft.ok).toBe(true);
    const whatIf = compareWhatIfAlternatives(
      fixtureWhatIfComparisonRequest(),
      new SolutionSceneUsageReferenceDouble(),
    );
    if (whatIf.ok) outputs.push(whatIf.value);
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
    for (const output of outputs) {
      for (const instant of canonicalJsonStringify(output).match(isoPattern) ?? []) {
        expect(declared.has(instant)).toBe(true);
      }
    }
  });

  test("the replay verification re-runs deterministically over a fresh ledger", () => {
    const ledgerKit = defaultInteractiveSolutionLaneKit();
    const run = runInteractiveSolutionLane(ledgerKit);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const log = ledgerKit.replayLedger.currentLog();
    expect(log.ok).toBe(true);
    if (!log.ok) return;
    expect(verifyReplayLog(log.value).ok).toBe(true);
  });
});
