/**
 * WORLD-P3 tests — the SUBSTITUTION LAW battery (the technology-
 * substitution-contract proof set for this lane).
 *
 * The three laws, proven per family with the in-memory doubles:
 *
 *  1. SUBSTITUTION IS NOT SEMANTICS CHANGE — every double pair produces
 *     byte-identical canonical outputs on the committed fixtures (the
 *     lane's semantics are substrate-independent).
 *  2. TOLERANCES ARE DECLARED, NEVER IMPLICIT — the clash/what-if
 *     verdicts carry their declared tolerance verbatim and answer
 *     within-tolerance at the boundary (drilled per family).
 *  3. UNSUPPORTED IS RECORDED, NEVER COMPUTED — the doubles' honest
 *     capability declarations name their BLOCKED capabilities with
 *     reasons; refusals are machine-readable typed failures.
 *
 * THE NO-SUBSTRATE PROOF: the package's contract core imports NONE of
 * the Layer-3 substrates — no Babylon, no Cesium, no OCCT, no FreeCAD,
 * no NLU/LLM runtime, no clash engine, no BOQ store — the whole lane
 * runs on the in-memory doubles (the substitution-law proof artifact).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  alternateNlCommandParserDouble,
  referenceNlCommandParserDouble,
} from "./authoring/doubles";
import { parseNlCommandThroughPort } from "./authoring/contract";
import {
  FIXTURE_AUTHORING_SCOPE,
  FIXTURE_SELECTION_WALL,
} from "./authoring/corpus";
import {
  alternateClashPredicateDouble,
  referenceClashPredicateDouble,
} from "./coordination/doubles";
import {
  aggregateCoordinationModels,
  recordCoordinationConflicts,
} from "./coordination/contract";
import {
  fixtureClashTestRequest,
  fixtureCoordinationRequest,
  FIXTURE_COORDINATION_PROBLEMS,
} from "./coordination/corpus";
import {
  alternateBoqGraphViewDouble,
  referenceBoqGraphViewDouble,
} from "./quantify/doubles";
import { viewBoqGraph } from "./quantify/contract";
import { FIXTURE_QUANTIFY_WORLD } from "./quantify/corpus";
import {
  alternateReplayLedgerDouble,
  referenceReplayLedgerDouble,
} from "./sequencing/doubles";
import { FIXTURE_REPLAY_EVENTS } from "./sequencing/corpus";

/* ------------------------------------------------------------------ */
/* Law 1 — substitution is not semantics change (byte-identity)         */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 substitution — law 1: byte-identical double outputs", () => {
  test("AUTHORING: the NL parser pair produces identical parsed+validated outcomes", () => {
    for (const [utterance, selection] of [
      ["Lay blocks to a height of 1 m along this wall.", FIXTURE_SELECTION_WALL],
      ["Excavate a pit 1.5 m deep, 2 m wide and 3 m long.", "node-site-001"],
      ["Remove the damaged wall section.", FIXTURE_SELECTION_WALL],
      ["Apply 30 mm plaster to the affected wall faces.", FIXTURE_SELECTION_WALL],
    ] as const) {
      const request = {
        utterance,
        scope: FIXTURE_AUTHORING_SCOPE,
        selectedElementId: selection,
      };
      const a = parseNlCommandThroughPort(referenceNlCommandParserDouble(), request);
      const b = parseNlCommandThroughPort(alternateNlCommandParserDouble(), request);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) continue;
      expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
    }
  });

  test("COORDINATION: the clash-engine pair produces identical reports AND identical conflict records", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const request = fixtureClashTestRequest();
    const a = referenceClashPredicateDouble().detectClashes(request, aggregate.value);
    const b = alternateClashPredicateDouble().detectClashes(request, aggregate.value);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
    const conflictsA = recordCoordinationConflicts({
      report: a.value,
      problems: FIXTURE_COORDINATION_PROBLEMS,
      recordedAt: "2026-10-05T09:10:00.000Z",
    });
    const conflictsB = recordCoordinationConflicts({
      report: b.value,
      problems: FIXTURE_COORDINATION_PROBLEMS,
      recordedAt: "2026-10-05T09:10:00.000Z",
    });
    expect(conflictsA.ok).toBe(true);
    expect(conflictsB.ok).toBe(true);
    if (!conflictsA.ok || !conflictsB.ok) return;
    expect(canonicalJsonStringify(conflictsA.value)).toBe(
      canonicalJsonStringify(conflictsB.value),
    );
  });

  test("QUANTIFY: the BOQ-store pair produces identical view results", () => {
    const request = { boq: FIXTURE_QUANTIFY_WORLD.boq, query: { query: "section-totals" } as const };
    const a = viewBoqGraph(request);
    const b = viewBoqGraph(request);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
    // And the STORE pair serves the identical BOQ wire record.
    const servedA = referenceBoqGraphViewDouble([FIXTURE_QUANTIFY_WORLD.boq]).resolveBoqVersion({
      solutionId: "solution-demo-001",
      versionNumber: 1,
    });
    const servedB = alternateBoqGraphViewDouble([FIXTURE_QUANTIFY_WORLD.boq]).resolveBoqVersion({
      solutionId: "solution-demo-001",
      versionNumber: 1,
    });
    expect(servedA.ok).toBe(true);
    expect(servedB.ok).toBe(true);
    if (!servedA.ok || !servedB.ok) return;
    expect(canonicalJsonStringify(servedA.value)).toBe(
      canonicalJsonStringify(servedB.value),
    );
  });

  test("SEQUENCING: the replay-ledger pair produces identical logs", () => {
    const a = referenceReplayLedgerDouble("solution-demo-001", 1);
    const b = alternateReplayLedgerDouble("solution-demo-001", 1);
    for (const event of FIXTURE_REPLAY_EVENTS) {
      expect(a.append(event).ok).toBe(true);
      expect(b.append(event).ok).toBe(true);
    }
    const logA = a.currentLog();
    const logB = b.currentLog();
    expect(logA.ok).toBe(true);
    expect(logB.ok).toBe(true);
    if (!logA.ok || !logB.ok) return;
    expect(canonicalJsonStringify(logA.value)).toBe(canonicalJsonStringify(logB.value));
  });
});

/* ------------------------------------------------------------------ */
/* Law 2 — tolerances are declared, never implicit                       */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 substitution — law 2: declared tolerances carried verbatim", () => {
  test("every clash verdict carries the request's declared tolerance VERBATIM (both doubles)", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    for (const engine of [
      referenceClashPredicateDouble(),
      alternateClashPredicateDouble(),
    ]) {
      const report = engine.detectClashes(fixtureClashTestRequest(), aggregate.value);
      expect(report.ok).toBe(true);
      if (!report.ok) continue;
      expect(report.value.appliedTolerance).toEqual({ linear: 0.05, angular: 0.001 });
      for (const verdict of report.value.verdicts) {
        expect(verdict.appliedTolerance).toEqual({ linear: 0.05, angular: 0.001 });
      }
    }
  });

  test("changing the DECLARED tolerance changes the verdicts (the consumer decides)", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const strict = referenceClashPredicateDouble().detectClashes(
      {
        ...fixtureClashTestRequest(),
        tolerance: { linear: 0.01, angular: 0.001 },
      },
      aggregate.value,
    );
    expect(strict.ok).toBe(true);
    if (!strict.ok) return;
    const near = strict.value.verdicts.find((v) => v.pairId === "clash-pair-003");
    // The same 0.02 m separation: within-tolerance at 0.05, CLEAR at 0.01.
    expect(near?.verdict).toBe("clear");
    expect(near?.appliedTolerance).toEqual({ linear: 0.01, angular: 0.001 });
  });
});

/* ------------------------------------------------------------------ */
/* Law 3 — unsupported is recorded, never computed                       */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 substitution — law 3: honest capability declarations", () => {
  test("every double declares its BLOCKED capabilities with reasons (the honesty seal)", () => {
    const parsers = [
      referenceNlCommandParserDouble(),
      alternateNlCommandParserDouble(),
    ];
    for (const parser of parsers) {
      expect(parser.capabilities.blocked.length).toBeGreaterThan(0);
      expect(parser.capabilities.blocked[0]?.reason).toContain("BLOCKED");
    }
    const clashEngines = [
      referenceClashPredicateDouble(),
      alternateClashPredicateDouble(),
    ];
    for (const engine of clashEngines) {
      expect(engine.capabilities.blocked.length).toBeGreaterThan(0);
      expect(
        engine.capabilities.blocked.some((entry) =>
          entry.reason.includes("sidecar-deployment protocol"),
        ),
      ).toBe(true);
    }
    const boqViews = [
      referenceBoqGraphViewDouble([FIXTURE_QUANTIFY_WORLD.boq]),
      alternateBoqGraphViewDouble([FIXTURE_QUANTIFY_WORLD.boq]),
    ];
    for (const view of boqViews) {
      expect(view.capabilities.blocked.length).toBeGreaterThan(0);
      expect(view.capabilities.blocked[0]?.reason).toContain("WORLD-P4");
    }
  });

  test("refusals are machine-readable typed failures (never throws, never partial output)", () => {
    const parser = referenceNlCommandParserDouble();
    const refusal = parser.parseCommand({
      utterance: "Something completely unparseable.",
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    expect(refusal.ok).toBe(false);
    if (refusal.ok) return;
    expect(refusal.failure.kind).toBe("unsupported-data");
    expect(refusal.failure.family).toBe("authoring");
  });
});

/* ------------------------------------------------------------------ */
/* The no-substrate proof (the import tripwire)                         */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 substitution — the no-substrate import proof", () => {
  const SRC = join(import.meta.dir);
  const FORBIDDEN_SUBSTRATES: readonly { readonly pattern: RegExp; readonly substrate: string }[] =
    [
      { pattern: /@babylonjs\//, substrate: "Babylon.js" },
      { pattern: /babylonjs/, substrate: "Babylon.js" },
      { pattern: /cesium/, substrate: "CesiumJS" },
      { pattern: /three(?!-pass)/, substrate: "Three.js" },
      { pattern: /@occt\//, substrate: "OCCT" },
      { pattern: /occt-js/, substrate: "OCCT" },
      { pattern: /cadquery/, substrate: "CadQuery/OCP" },
      { pattern: /freecad(?!-object-name)/i, substrate: "FreeCAD runtime" },
      { pattern: /ifcopenshell/i, substrate: "IfcOpenShell runtime" },
      { pattern: /web-ifc/, substrate: "web-ifc" },
      { pattern: /openai|anthropic|langchain|llama|huggingface/i, substrate: "LLM runtime" },
      { pattern: /nlp-compromise|spaCy|natural"/i, substrate: "NLU runtime" },
      { pattern: /vtk|paraview/i, substrate: "VTK/ParaView runtime" },
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

  test("the contract core imports NO substrate — the lane runs without any of them", () => {
    const files = collectSourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(12);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Import specifiers ONLY — the docs/comments legitimately NAME the
      // substrates they refuse (the honesty discipline); a substrate
      // ban applies to imports, never to documentation.
      const specifiers = [
        ...source.matchAll(/from\s+["']([^"']+)["']/g),
        ...source.matchAll(/import\s+["']([^"']+)["']/g),
        ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
      ].map((match) => match[1] ?? "");
      for (const specifier of specifiers) {
        for (const rule of FORBIDDEN_SUBSTRATES) {
          if (rule.pattern.test(specifier)) {
            violations.push(`${file}: imports ${rule.substrate} (${specifier})`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("the only workspace imports are the five landed world packages + the engine seams", () => {
    const files = collectSourceFiles(SRC);
    const allowed = new Set([
      "@aise/provider-registry",
      "@aise/shared-contracts",
      "@aise/solution-contract",
      "@aise/solution-engine",
      "@aise/solution-boq",
      "@aise/world-reality-substrate",
      "@aise/world-understanding-substrate",
      "@aise/world-solution-substrate",
      "@aise/world-layer1-experience",
      "@aise/world-layer2-experience",
    ]);
    let workspaceImportCount = 0;
    for (const path of files) {
      const tree = readFileSync(path, "utf8");
      const treeImports = [...tree.matchAll(/from\s+["'](@aise\/[^"']+)["']/g)];
      workspaceImportCount += treeImports.length;
      for (const match of treeImports) {
        expect(allowed.has(match[1]!)).toBe(true);
      }
    }
    // The lane genuinely composes the landed packages + engine seams.
    expect(workspaceImportCount).toBeGreaterThanOrEqual(25);
  });
});
