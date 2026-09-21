/**
 * PROD-026 — the BUILDING BENCHMARK RUNNER (the apps-side leg).
 *
 * ⚠ TEST/CLI-ONLY module (never imported by the browser app code): it reads
 * the committed scenario descriptor from `tools/building-benchmark/` with
 * `node:fs`, which the browser bundle cannot do. The root `bun test` gate
 * and the regeneration CLI import it; the composition surface does not.
 *
 * Executes the FULL §3 journey on the physically grounded building scenario
 * (the committed `tools/building-benchmark/scenario.json` — the
 * terrace-house masonry retrofit) through the SAME generic journey runner
 * as the seeded fixture (the composition layer's `runComposedJourney`),
 * with the REAL engine + the REAL BOQ derivation. The record it produces
 * is what the committed `fixtures/expected-outcomes.json` pins (the
 * regeneration CLI writes it; the apps-side test asserts byte-identity;
 * the tools-side check runner verifies the committed data's physical
 * plausibility, provenance and journey structure — the boundary matrix
 * forbids tools → packages imports, so the tools runner consumes the
 * committed artifact, never the engine).
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { canonicalJsonStringify } from "../../../../packages/shared-contracts/src/index";
import { TableBaselineGeometryResolver } from "../../../../packages/solution-engine/src/index";
import type { BaselineSurfaceArea } from "../../../../packages/solution-engine/src/index";
import { runComposedJourney } from "./solution-journey";
import type {
  ComposedJourneyResult,
  JourneyOperationSpec,
  JourneyWorldInput,
  ObservedSceneOf,
  SceneElementOf,
} from "./solution-journey";
import type { JourneyMode } from "./solution-journey";

/* ------------------------------------------------------------------ */
/* The scenario descriptor (the committed JSON, typed)                  */
/* ------------------------------------------------------------------ */

/** One observed scene element of the scenario (the workspace's element shape). */
export interface BenchmarkSceneElement {
  readonly elementId: string;
  readonly label: string;
  readonly kind: "wall" | "floor" | "site" | "roof" | "opening";
  readonly selectorKind: SceneElementOf["selectorKind"];
  readonly nodeRefs: readonly string[];
  readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
  readonly polygons: readonly (readonly [number, number, number])[][];
  readonly anchor: {
    readonly origin: readonly [number, number, number];
    readonly lengthAxis: readonly [number, number, number];
    readonly outAxis: readonly [number, number, number];
    readonly anchorLength: number;
    readonly anchorHeight: number;
  };
  readonly facts: readonly { readonly label: string; readonly value: string }[];
}

/** The committed scenario descriptor (scenario.json). */
export interface BenchmarkScenario {
  readonly scenarioId: string;
  readonly version: string;
  readonly title: string;
  readonly problemStatement: string;
  readonly world: JourneyWorldInput["world"];
  readonly observedReality: {
    readonly description: string;
    readonly baselineGeometry: Readonly<Record<string, BaselineSurfaceArea>>;
    readonly elements: readonly BenchmarkSceneElement[];
  };
  readonly operations: readonly JourneyOperationSpec[];
  readonly revise: JourneyWorldInput["revise"];
  readonly clock: JourneyWorldInput["clock"];
}

/** The repository root (this file lives at apps/web/src/app/). */
const REPO_ROOT = dirname(dirname(dirname(dirname(import.meta.dir))));

/** The committed scenario descriptor's path. */
export const SCENARIO_PATH = `${REPO_ROOT}/tools/building-benchmark/scenario.json`;

/** The committed expected-outcomes fixture's path. */
export const EXPECTED_OUTCOMES_PATH = `${REPO_ROOT}/tools/building-benchmark/fixtures/expected-outcomes.json`;

/* ------------------------------------------------------------------ */
/* Loading + validation (fail closed)                                   */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Loads the committed scenario descriptor (fail closed: a malformed
 * descriptor throws with a precise message — never a best-effort world).
 */
export function loadBenchmarkScenario(): BenchmarkScenario {
  const raw = JSON.parse(readFileSync(SCENARIO_PATH, "utf8")) as unknown;
  if (!isRecord(raw)) {
    throw new Error("benchmark scenario: the descriptor must be a JSON object");
  }
  const scenario = raw as unknown as BenchmarkScenario;
  const required: (keyof BenchmarkScenario)[] = [
    "scenarioId",
    "version",
    "title",
    "problemStatement",
    "world",
    "observedReality",
    "operations",
    "revise",
    "clock",
  ];
  for (const key of required) {
    if (scenario[key] === undefined) {
      throw new Error(`benchmark scenario: the '${key}' section is missing`);
    }
  }
  if (scenario.operations.length === 0) {
    throw new Error("benchmark scenario: at least one operation is required");
  }
  const elementIds = new Set(scenario.observedReality.elements.map((element) => element.elementId));
  for (const operation of scenario.operations) {
    if (!elementIds.has(operation.targetElementId)) {
      throw new Error(
        `benchmark scenario: operation '${operation.intentId}' anchors to unknown ` +
          `element '${operation.targetElementId}'`,
      );
    }
    if (operation.origin === "agent" && operation.commandText === undefined) {
      throw new Error(
        `benchmark scenario: agent operation '${operation.intentId}' carries no commandText`,
      );
    }
  }
  if (
    scenario.revise.revertOperationIndex < 1 ||
    scenario.revise.revertOperationIndex > scenario.operations.length
  ) {
    throw new Error(
      `benchmark scenario: revise.revertOperationIndex ${scenario.revise.revertOperationIndex} ` +
        `is outside the operation sequence (1..${scenario.operations.length})`,
    );
  }
  return scenario;
}

/** The canonical sha-256 of the loaded scenario (the coherence digest). */
export function benchmarkScenarioDigest(scenario: BenchmarkScenario): string {
  return createHash("sha256").update(canonicalJsonStringify(scenario), "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* The scenario world (the generic journey runner's input)              */
/* ------------------------------------------------------------------ */

/** Builds the journey world input from the committed scenario descriptor. */
export function benchmarkJourneyWorld(scenario: BenchmarkScenario): JourneyWorldInput {
  const scene: ObservedSceneOf = {
    realityVersionId: scenario.world.baselineRealityVersionId,
    elements: scenario.observedReality.elements.map((element) => ({
      ...element,
      geometryRefs: element.geometryRefs.map((ref) => ({
        kind: ref.kind as SceneElementOf["geometryRefs"][number]["kind"],
        ref: ref.ref,
      })),
      polygons: element.polygons.map((polygon) =>
        polygon.map((point) => [...point] as SceneElementOf["polygons"][number][number]),
      ),
      facts: element.facts.map((fact) => ({ ...fact })),
    })),
  };
  return {
    world: scenario.world,
    scene,
    baselineGeometry: new TableBaselineGeometryResolver(scenario.observedReality.baselineGeometry),
    operations: scenario.operations.map((operation) => ({ ...operation })),
    revise: scenario.revise,
    clock: scenario.clock,
  };
}

/** Runs the FULL §3 journey on the scenario (the real engine + BOQ derivation). */
export async function runBenchmarkJourney(
  mode: JourneyMode = "mixed",
): Promise<ComposedJourneyResult> {
  return runComposedJourney(benchmarkJourneyWorld(loadBenchmarkScenario()), mode);
}

/* ------------------------------------------------------------------ */
/* The benchmark record artifact (the committed expected-outcomes form) */
/* ------------------------------------------------------------------ */

/** The committed expected-outcomes artifact (the fixture's shape). */
export interface BenchmarkExpectedOutcomes {
  readonly benchmarkKind: "aise-building-benchmark";
  readonly benchmarkVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioDigest: string;
  /** The full §3 journey record (the generic runner's echo). */
  readonly record: ComposedJourneyResult["record"];
  /** The equivalence: the agent-only and direct-only variants' identities. */
  readonly equivalence: {
    readonly directOperationIds: readonly string[];
    readonly agentOperationIds: readonly string[];
    readonly identical: boolean;
  };
}

/** Computes the full benchmark record (mixed + both equivalence variants). */
export async function computeBenchmarkExpectedOutcomes(): Promise<BenchmarkExpectedOutcomes> {
  const scenario = loadBenchmarkScenario();
  const mixed = await runBenchmarkJourney("mixed");
  const direct = await runBenchmarkJourney("direct");
  const agent = await runBenchmarkJourney("agent");
  const directIds = direct.record.operationIdentities.map((entry) => entry.operationId);
  const agentIds = agent.record.operationIdentities.map((entry) => entry.operationId);
  return {
    benchmarkKind: "aise-building-benchmark",
    benchmarkVersion: "1.0.0",
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    scenarioDigest: benchmarkScenarioDigest(scenario),
    record: mixed.record,
    equivalence: {
      directOperationIds: directIds,
      agentOperationIds: agentIds,
      identical: JSON.stringify(directIds) === JSON.stringify(agentIds),
    },
  };
}

/** Loads the committed expected-outcomes fixture (fail closed). */
export function loadBenchmarkExpectedOutcomes(): BenchmarkExpectedOutcomes {
  return JSON.parse(readFileSync(EXPECTED_OUTCOMES_PATH, "utf8")) as BenchmarkExpectedOutcomes;
}

/** The canonical JSON of a benchmark artifact (the byte-identity form). */
export function benchmarkCanonicalJson(value: unknown): string {
  return canonicalJsonStringify(value);
}

/* ------------------------------------------------------------------ */
/* The regeneration CLI (writes the committed fixture)                  */
/* ------------------------------------------------------------------ */

async function regenerate(): Promise<void> {
  const outcomes = await computeBenchmarkExpectedOutcomes();
  const body = `${canonicalJsonStringify(outcomes)}\n`;
  await Bun.write(EXPECTED_OUTCOMES_PATH, body);
  // CLI-only output (the import.meta.main guard below keeps this path out of
  // the browser app; the app/library logging discipline is the structured logger).
  // eslint-disable-next-line no-console
  console.log(
    `building benchmark: regenerated ${EXPECTED_OUTCOMES_PATH} ` +
      `(scenario ${outcomes.scenarioId}, journey ${outcomes.record.journeyId.slice(0, 16)}…, ` +
      `${outcomes.record.boq.lineCount} BOQ lines, equivalence ` +
      `${outcomes.equivalence.identical ? "IDENTICAL" : "MISMATCH"})`,
  );
}

if (import.meta.main) {
  await regenerate();
}
