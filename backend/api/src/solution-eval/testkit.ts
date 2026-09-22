/**
 * PROD-029 test kit — deterministic builders for the substitution-evaluation
 * endpoint tests + the committed-golden (de)serialization of the
 * tools/solution-eval benchmark artifacts (the building-benchmark discipline:
 * the LIVE computation is serialized here; the committed files must equal it
 * byte-for-byte — drift fails the root verify gate).
 *
 * TEST-ONLY (the module core performs no I/O; this file is the exception —
 * `writeGoldenArtifacts` is the documented one-off regeneration entry for
 * the committed benchmark fixtures):
 *
 *   bun -e 'const kit = await import("./backend/api/src/solution-eval/testkit.ts"); kit.writeGoldenArtifacts();'
 *
 * Deterministic: no clock, no randomness, no network.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderRegistryEvent } from "@aise/provider-registry";
import { cellSummaryOf, runSubstitutionMatrix } from "./harness";
import type { MatrixRunResult, SubstitutionEvaluation } from "./harness";
import type { SubstitutionScenario } from "./model";
import {
  canonicalRegistryLog,
  canonicalJsonText,
  committedScenarioMatrix,
} from "./fixtures";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
export const TOOLS_SOLUTION_EVAL_DIR = join(REPO_ROOT, "tools", "solution-eval");

/* ------------------------------------------------------------------ */
/* Request-body builders                                                */
/* ------------------------------------------------------------------ */

export function scenarioValidateBody(scenario: unknown): Record<string, unknown> {
  return { scenario };
}

export function evaluateBody(
  scenario: unknown,
  registryLog: readonly unknown[],
): Record<string, unknown> {
  return { scenario, registryLog: [...registryLog] };
}

export function matrixRunBody(registryLog?: readonly unknown[]): Record<string, unknown> {
  return registryLog === undefined ? {} : { registryLog: [...registryLog] };
}

/** The canonical evaluate body for one committed scenario id (over the canonical log). */
export function canonicalEvaluateBodyFor(scenarioId: string): Record<string, unknown> {
  const scenario = committedScenarioMatrix().find((entry) => entry.scenarioId === scenarioId);
  if (scenario === undefined) {
    throw new Error(`solution-eval testkit: unknown committed scenario '${scenarioId}'`);
  }
  return evaluateBody(scenario, canonicalRegistryLog());
}

/* ------------------------------------------------------------------ */
/* The committed-golden (de)serialization                                */
/* ------------------------------------------------------------------ */

export const SCENARIO_MATRIX_DOCUMENT = {
  matrixId: "layer3-substitution-matrix/1",
  version: "1.0.0",
  title: "The Layer-3 substitution matrix (PROD-029)",
  description:
    "Four Layer-3 seams × {faithful, divergent} fixture substitutes. The equal scenarios " +
    "must be PROVEN canonically equal; the divergent scenarios must be CAUGHT with the " +
    "declared closed-vocabulary failure kind — a harness that only proves the happy path " +
    "is a failed delivery (the day-27 doctrine).",
} as const;

/** The canonical scenario-matrix document (the committed scenario.json content). */
export function scenarioMatrixDocument(): Record<string, unknown> {
  return {
    ...SCENARIO_MATRIX_DOCUMENT,
    seams: [
      {
        seam: "operation-compiler",
        capability: "layer3-operation-compiler",
        baselineId: "command-corpus-slice/1",
        canonicalComponent: "backend/api/src/reasoning/solution (the PROD-023 command compiler)",
      },
      {
        seam: "engine-execution",
        capability: "layer3-engine-execution",
        baselineId: "wall-upgrade-journey/1",
        canonicalComponent: "packages/solution-engine (the PROD-022 solution engine)",
      },
      {
        seam: "validation",
        capability: "layer3-validation",
        baselineId: "wall-upgrade-journey/1",
        canonicalComponent: "packages/solution-engine validateSolutionVersion (the server-side Validate)",
      },
      {
        seam: "boq-derivation",
        capability: "layer3-boq-derivation",
        baselineId: "wall-upgrade-journey/1",
        canonicalComponent: "packages/solution-boq (the PROD-025 derivation)",
      },
    ],
    scenarios: committedScenarioMatrix(),
  };
}

/** One golden cell: the summary + the per-point equal/digest projection. */
export interface GoldenCell {
  readonly scenarioId: string;
  readonly seam: string;
  readonly expectation: string;
  readonly verdict: string;
  readonly expectationSatisfied: boolean;
  readonly comparisonPointCount: number;
  readonly equalPointCount: number;
  readonly divergentPointCount: number;
  readonly divergenceFailureKind?: string;
  readonly refusalKind?: string;
  readonly benchmarkRecordId?: string;
  readonly benchmarkRecordDigest?: string;
  readonly manifestId?: string;
  readonly registryEventCount: number;
  readonly points: readonly {
    readonly pointKind: string;
    readonly subjectId: string;
    readonly equal: boolean;
  }[];
}

function goldenCellOf(evaluation: SubstitutionEvaluation): GoldenCell {
  const summary = cellSummaryOf(evaluation);
  const points = evaluation.comparisonPoints.map((point) => ({
    pointKind: point.pointKind,
    subjectId: point.subjectId,
    equal: point.equal,
  }));
  const base: Record<string, unknown> = {
    scenarioId: summary.scenarioId,
    seam: summary.seam,
    expectation: summary.expectation,
    verdict: summary.verdict,
    expectationSatisfied: summary.expectationSatisfied,
    comparisonPointCount: summary.comparisonPointCount,
    equalPointCount: summary.equalPointCount,
    divergentPointCount: summary.divergentPointCount,
    points,
    registryEventCount: summary.registryEventCount,
  };
  const summaryRecord = summary as unknown as Record<string, unknown>;
  for (const key of [
    "divergenceFailureKind",
    "refusalKind",
    "benchmarkRecordId",
    "benchmarkRecordDigest",
    "manifestId",
  ]) {
    const value = summaryRecord[key];
    if (value !== undefined) {
      base[key] = value;
    }
  }
  return base as unknown as GoldenCell;
}

/** The committed expected-outcomes document (the golden of the matrix run). */
export function expectedOutcomesDocument(result: MatrixRunResult): Record<string, unknown> {
  return {
    matrixId: "layer3-substitution-matrix/1",
    totals: result.totals,
    cells: result.cells.map(goldenCellOf),
  };
}

/** Runs the committed matrix over the canonical log (the live golden computation). */
export async function runCommittedMatrix(): Promise<MatrixRunResult> {
  return runSubstitutionMatrix(committedScenarioMatrix(), canonicalRegistryLog());
}

/** Reads one committed tools-side artifact as text (the drift-comparison source). */
export function readCommittedArtifactText(relativePath: string): string {
  return readFileSync(join(TOOLS_SOLUTION_EVAL_DIR, relativePath), "utf8");
}

/** Reads one committed tools-side artifact as parsed JSON. */
export function readCommittedArtifactJson(relativePath: string): unknown {
  return JSON.parse(readCommittedArtifactText(relativePath)) as unknown;
}

/**
 * The one-off regeneration entry for the committed benchmark artifacts
 * (TEST-ONLY): rewrites `tools/solution-eval/scenario.json` and
 * `tools/solution-eval/fixtures/expected-outcomes.json` from the LIVE
 * computation. Identical inputs always produce byte-identical files.
 */
export async function writeGoldenArtifacts(): Promise<void> {
  const result = await runCommittedMatrix();
  writeFileSync(
    join(TOOLS_SOLUTION_EVAL_DIR, "scenario.json"),
    canonicalJsonText(scenarioMatrixDocument()),
  );
  writeFileSync(
    join(TOOLS_SOLUTION_EVAL_DIR, "fixtures", "expected-outcomes.json"),
    canonicalJsonText(expectedOutcomesDocument(result)),
  );
}

/* ------------------------------------------------------------------ */
/* Negative-scenario builders (the boundary-guard + refusal drills)      */
/* ------------------------------------------------------------------ */

function cloneScenario(scenarioId: string): SubstitutionScenario {
  const scenario = committedScenarioMatrix().find((entry) => entry.scenarioId === scenarioId);
  if (scenario === undefined) {
    throw new Error(`solution-eval testkit: unknown committed scenario '${scenarioId}'`);
  }
  return JSON.parse(JSON.stringify(scenario)) as SubstitutionScenario;
}

/**
 * A provider-specific field smuggled INSIDE the intent semantics JSON (the
 * canonical boundary's hardest negative: the control plane cannot see it —
 * the string field is contract-valid — only the harness's canonical
 * PROJECTION guard catches it).
 */
export function smuggledProviderFieldScenario(): SubstitutionScenario {
  const scenario = cloneScenario("layer3-compiler-faithful-001");
  const execution = scenario.substitutedRun.executions[0];
  if (execution === undefined) {
    throw new Error("solution-eval testkit: execution missing");
  }
  const raw = execution.execution as {
    readonly outputs?: Record<string, unknown>;
  };
  const outputs = raw.outputs ?? {};
  const semanticsJson = outputs["intentSemanticsJson"];
  if (typeof semanticsJson !== "string") {
    throw new Error("solution-eval testkit: intentSemanticsJson missing");
  }
  const semantics = JSON.parse(semanticsJson) as Record<string, unknown>;
  semantics["vendorOperationRef"] = "vendor-internal-op-42"; // the smuggled provider-specific field
  return {
    ...scenario,
    scenarioId: "layer3-compiler-smuggled-field-neg",
    title: "NEGATIVE: a provider-specific field smuggled inside the intent semantics",
    substitutedRun: {
      ...scenario.substitutedRun,
      executions: [
        {
          inputKey: execution.inputKey,
          execution: {
            ...raw,
            outputs: { ...outputs, intentSemanticsJson: JSON.stringify(semantics) },
          },
        },
        ...scenario.substitutedRun.executions.slice(1),
      ],
    },
    expectation: "declared-divergence",
    expectedDivergenceKind: "contract-mismatch",
    note:
      "the projection guard must refuse the provider-specific field at the canonical comparison boundary",
  };
}

/** A declared engine execution carrying an UNKNOWN top-level output field (closed contracts). */
export function unknownOutputFieldScenario(): SubstitutionScenario {
  const scenario = cloneScenario("layer3-engine-faithful-001");
  const execution = scenario.substitutedRun.executions[0];
  if (execution === undefined) {
    throw new Error("solution-eval testkit: execution missing");
  }
  const raw = execution.execution as {
    readonly outputs?: Record<string, unknown>;
  };
  const outputs = raw.outputs ?? {};
  return {
    ...scenario,
    scenarioId: "layer3-engine-unknown-output-neg",
    title: "NEGATIVE: an undeclared provider output field (the closed output contract refuses)",
    substitutedRun: {
      ...scenario.substitutedRun,
      executions: [
        {
          inputKey: execution.inputKey,
          execution: {
            ...raw,
            outputs: { ...outputs, vendorConfidence: 0.9 }, // not declared by the contract
          },
        },
        ...scenario.substitutedRun.executions.slice(1),
      ],
    },
    expectation: "declared-divergence",
    expectedDivergenceKind: "contract-mismatch",
    note:
      "the control plane's closed output contract must refuse the undeclared field with a typed normalization failure",
  };
}

/** A declared run missing one canonical seam input's execution. */
export function missingExecutionScenario(): SubstitutionScenario {
  const scenario = cloneScenario("layer3-compiler-faithful-001");
  return {
    ...scenario,
    scenarioId: "layer3-compiler-missing-execution-neg",
    title: "NEGATIVE: the declared run misses a canonical seam input",
    substitutedRun: {
      ...scenario.substitutedRun,
      executions: scenario.substitutedRun.executions.slice(0, 1),
    },
    expectation: "canonical-equality",
    note: "the harness must refuse: a substitute answers every input, never stays silent",
  };
}

/** A scenario referencing a substitute that is not registered in the log. */
export function unknownSubstituteScenario(): SubstitutionScenario {
  const scenario = cloneScenario("layer3-boq-faithful-001");
  return {
    ...scenario,
    scenarioId: "layer3-boq-unknown-substitute-neg",
    title: "NEGATIVE: the substitute is not registered in the registry log",
    substitute: {
      providerId: "fixture-boq-provider",
      technologyVersion: "9.9.9-fixture-unregistered",
    },
    expectation: "canonical-equality",
    note: "the harness must refuse: only registered substitutes may be evaluated",
  };
}

/** A cross-seam substitute: the compiler provider stood in at the BOQ seam. */
export function crossSeamSubstituteScenario(): SubstitutionScenario {
  const scenario = cloneScenario("layer3-boq-faithful-001");
  return {
    ...scenario,
    scenarioId: "layer3-boq-cross-seam-substitute-neg",
    title: "NEGATIVE: a substitute profile that does not declare the seam capability",
    substitute: {
      providerId: "fixture-compiler-provider",
      technologyVersion: "1.0.0-fixture-faithful",
    },
    expectation: "canonical-equality",
    note: "the harness must refuse: the substitute does not declare the layer3-boq-derivation capability",
  };
}

/** A registry log that registers the substitute but never starts its evaluation. */
export function registeredOnlyLog(): readonly ProviderRegistryEvent[] {
  const events: ProviderRegistryEvent[] = [];
  for (const profile of canonicalRegistryLog()) {
    const registered = profile;
    if (registered.kind === "provider-registered" && registered.profile.providerId === "fixture-boq-provider" && registered.profile.technologyVersion === "1.0.0-fixture-faithful") {
      events.push(registered);
    }
  }
  return events;
}

/** An unlawful registry log (an invalid event shape the replay must refuse). */
export function unlawfulLog(): readonly unknown[] {
  return [
    { kind: "evaluation-started" }, // missing providerId + technologyVersion
  ];
}
