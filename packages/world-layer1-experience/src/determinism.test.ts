/**
 * WORLD-P1 tests — DETERMINISM + the source-level law scan
 * (`src/determinism.test.ts`).
 *
 * Gate 6 of the work order: "Determinism: no network/clock/randomness
 * in the contract core." This suite proves it three ways:
 *
 *  1. BEHAVIORAL: every stage, invoked repeatedly, produces
 *     byte-identical canonical outputs (content-addressed digests
 *     stable across runs);
 *  2. SOURCE-LEVEL: the contract core (every non-test source file)
 *     contains NO `Date.now`, NO `Math.random`, NO `new Date`, no
 *     network APIs (`fetch`, `WebSocket`, `node:http`), no `setTimeout`
 *     — a lexical tripwire mirroring the repo boundary scanner's
 *     discipline (imperfect, but a real gate);
 *  3. INSTANT DISCIPLINE: every instant in every lane output is one of
 *     the DECLARED fixture instants — no output carries a sensed time.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  spatializeCaptureSession,
  registerCaptureFragment,
  composeReconstructionWorld,
  applyLayerToggles,
  captureNavigationBookmark,
  compareModelToCapture,
  runMeasurementQueries,
  queryWhatIsHere,
  queryWhatChanged,
  bindFragmentEvidence,
  bindWorldEvidence,
} from "./index";
import {
  FIXTURE_SPATIALIZATION_REQUEST,
  FIXTURE_REGISTRATION_REQUEST,
  FIXTURE_WORLD_REQUEST,
  FIXTURE_COMPARISON_REQUEST,
  FIXTURE_MEASUREMENT_QUERIES,
  FIXTURE_WHAT_IS_HERE_POINTS,
  FIXTURE_WORLD,
  FIXTURE_WORLD_REVISION_2,
  FIXTURE_BOOKMARKED_AT,
  FIXTURE_SPATIALIZED_AT,
  FIXTURE_REGISTERED_AT,
  FIXTURE_COMPOSED_AT,
  FIXTURE_COMPARED_AT,
  FIXTURE_MEASURED_AT,
} from "./fixtures";

/* ------------------------------------------------------------------ */
/* Behavioral determinism (byte-identity across repeated invocation)    */
/* ------------------------------------------------------------------ */

describe("determinism — byte-identical repeated invocation", () => {
  test("spatialize: 5 runs → one canonical output", () => {
    const outputs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      outputs.add(canonicalJsonStringify(spatializeCaptureSession(FIXTURE_SPATIALIZATION_REQUEST)));
    }
    expect(outputs.size).toBe(1);
  });

  test("register: 5 runs → one canonical output", () => {
    const outputs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      outputs.add(canonicalJsonStringify(registerCaptureFragment(FIXTURE_REGISTRATION_REQUEST)));
    }
    expect(outputs.size).toBe(1);
  });

  test("compose: 5 runs → one world id", () => {
    const outputs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      outputs.add(canonicalJsonStringify(composeReconstructionWorld(FIXTURE_WORLD_REQUEST)));
    }
    expect(outputs.size).toBe(1);
  });

  test("navigate: toggles + bookmark round-trips are stable", () => {
    const outputs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const view = applyLayerToggles(FIXTURE_WORLD, [{ layerId: "plan-model", visible: false }]);
      expect(view.ok).toBe(true);
      if (!view.ok) return;
      const bookmark = captureNavigationBookmark(
        FIXTURE_WORLD,
        view.value,
        {
          position: [1, 2, 3] as const,
          target: [0, 0, 0] as const,
          up: [0, 0, 1] as const,
          fovRadians: Math.PI / 4,
          mode: "fly" as const,
        },
        null,
        [],
        "Determinism drill",
        FIXTURE_BOOKMARKED_AT,
      );
      expect(bookmark.ok).toBe(true);
      if (bookmark.ok) {
        outputs.add(canonicalJsonStringify(bookmark.value));
      }
    }
    expect(outputs.size).toBe(1);
  });

  test("compare + measure: 5 runs → one canonical output each", () => {
    const compareOutputs = new Set<string>();
    const measureOutputs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      compareOutputs.add(canonicalJsonStringify(compareModelToCapture(FIXTURE_COMPARISON_REQUEST)));
      measureOutputs.add(
        canonicalJsonStringify(runMeasurementQueries(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES)),
      );
    }
    expect(compareOutputs.size).toBe(1);
    expect(measureOutputs.size).toBe(1);
  });

  test("evidence queries + bindings: 5 runs → one canonical output each", () => {
    const hereOutputs = new Set<string>();
    const changedOutputs = new Set<string>();
    const bindOutputs = new Set<string>();
    const worldBindOutputs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      hereOutputs.add(
        canonicalJsonStringify(
          queryWhatIsHere(FIXTURE_WORLD, {
            point: FIXTURE_WHAT_IS_HERE_POINTS.elementBound,
            worldRevision: 1,
          }),
        ),
      );
      changedOutputs.add(
        canonicalJsonStringify(
          queryWhatChanged({ fromWorld: FIXTURE_WORLD, toWorld: FIXTURE_WORLD_REVISION_2 }),
        ),
      );
      const fragment = spatializeCaptureSession(FIXTURE_SPATIALIZATION_REQUEST);
      expect(fragment.ok).toBe(true);
      if (fragment.ok) {
        bindOutputs.add(canonicalJsonStringify(bindFragmentEvidence(fragment.value)));
      }
      worldBindOutputs.add(canonicalJsonStringify(bindWorldEvidence(FIXTURE_WORLD)));
    }
    expect(hereOutputs.size).toBe(1);
    expect(changedOutputs.size).toBe(1);
    expect(bindOutputs.size).toBe(1);
    expect(worldBindOutputs.size).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Source-level law scan (no clock / randomness / network / IO)         */
/* ------------------------------------------------------------------ */

describe("determinism — the source-level tripwire", () => {
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
    { pattern: /require\(\s*["']node:http["']\s*\)/, reason: "network (node:http)" },
    { pattern: /require\(\s*["']node:https["']\s*\)/, reason: "network (node:https)" },
    { pattern: /require\(\s*["']node:net["']\s*\)/, reason: "network (node:net)" },
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

  test("the contract core contains NO clock, randomness, network or timer calls", () => {
    const files = collectSourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(15);
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

  test("the only node imports are the deterministic ones (crypto/fs-free core)", () => {
    const files = collectSourceFiles(SRC);
    const allowed = new Set(["node:crypto"]);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/from\s+["'](node:[^"']+)["']/g)];
      for (const match of imports) {
        expect(allowed.has(match[1]!)).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The instant discipline (every output instant is a declared input)    */
/* ------------------------------------------------------------------ */

describe("determinism — the instant discipline", () => {
  test("every instant in the lane outputs is one of the declared fixture instants", () => {
    const declared = new Set([
      FIXTURE_SPATIALIZED_AT,
      FIXTURE_REGISTERED_AT,
      FIXTURE_COMPOSED_AT,
      FIXTURE_COMPARED_AT,
      FIXTURE_MEASURED_AT,
      FIXTURE_BOOKMARKED_AT,
    ]);
    const laneOutputs = [
      spatializeCaptureSession(FIXTURE_SPATIALIZATION_REQUEST),
      composeReconstructionWorld(FIXTURE_WORLD_REQUEST),
      compareModelToCapture(FIXTURE_COMPARISON_REQUEST),
    ];
    for (const output of laneOutputs) {
      expect(output.ok).toBe(true);
    }
    // scan every ISO-instant-shaped string in the canonical outputs
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
    for (const output of laneOutputs) {
      if (!output.ok) continue;
      for (const instant of canonicalJsonStringify(output.value).match(isoPattern) ?? []) {
        expect(declared.has(instant)).toBe(true);
      }
    }
  });
});
