/**
 * HFX-201 — the VLM provider benchmark SERVICE (the thin deterministic
 * evaluation entry point — the providers-module service discipline).
 *
 * DETERMINISTIC and IN-MEMORY: no clock, no randomness, no I/O, NO
 * NETWORK (the registered candidates are never invoked — the registry log
 * carries the deterministic double's execution). Identical request
 * sequences produce identical results. Every domain decision is made by
 * the HARNESS (the Layer-2 evaluation + the deterministic grounded checks
 * over the control plane's pure validators); this service owns only the
 * corpus index, the variant dispatch and the request parsing (fail-closed
 * typed errors, never silent coercion).
 */

import { VlmEvalError, parseVlmVariantKey, validatedQwen3VlProfile } from "./model";
import type { VlmVariantKey } from "./model";
import { vlmEvalRuns } from "./corpus";
import type { VlmEvalScenario } from "./corpus";
import { evaluateVlmScenario } from "./harness";
import type { VlmEvalOutcome } from "./harness";
import { runVlmBenchmarkLifecycle } from "./registry";
import type { VlmBenchmarkLifecycleResult } from "./registry";
import { vlmVariantSummaryOf } from "./compare";
import type { VlmVariantRunSummary } from "./compare";

/* ------------------------------------------------------------------ */
/* Request shapes (parsed fail-closed)                                  */
/* ------------------------------------------------------------------ */

/** A corpus listing / run request: optionally one variant. */
export interface VlmEvalRequest {
  readonly variant?: VlmVariantKey;
}

/** Parses a request body carrying an optional variant (fail closed). */
export function parseVlmEvalRequest(payload: unknown): VlmEvalRequest {
  if (payload === undefined || payload === null) {
    return {};
  }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new VlmEvalError("invalid_request", "expected a JSON object body");
  }
  const variant = (payload as Record<string, unknown>)["variant"];
  if (variant === undefined) {
    return {};
  }
  return { variant: parseVlmVariantKey(variant) };
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

/** The catalog listing projection (presentation only). */
export interface VlmScenarioSummary {
  readonly scenarioId: string;
  readonly baseScenarioId: string;
  readonly variant: VlmVariantKey;
  readonly matrixCell: string;
  readonly behaviorClass: string;
  readonly provider: { readonly providerId: string; readonly technologyVersion: string };
  readonly capability: string;
  readonly expectedFailureKind: string;
}

/** One variant's corpus run. */
export interface VlmVariantCorpusRun {
  readonly variant: VlmVariantKey;
  readonly provider: { readonly providerId: string; readonly technologyVersion: string; readonly profileDigest: string };
  readonly licenseStatus: string;
  readonly outcomes: readonly VlmEvalOutcome[];
  readonly summary: VlmVariantRunSummary;
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

/**
 * The Qwen3-VL provider benchmark service: the committed corpus (default)
 * evaluated through the harness. Instantiate once per process;
 * deterministic.
 */
export class VlmEvalService {
  private readonly runs: readonly VlmEvalScenario[];
  private readonly byId: Map<string, VlmEvalScenario>;

  constructor(runs: readonly VlmEvalScenario[] = vlmEvalRuns()) {
    this.runs = [...runs];
    this.byId = new Map(this.runs.map((run) => [run.scenarioId, run]));
    for (const run of this.runs) {
      if (this.byId.get(run.scenarioId) !== run) {
        throw new VlmEvalError(
          "invalid_corpus",
          `duplicate run id '${run.scenarioId}' — run identity is unique`,
        );
      }
    }
  }

  /** Lists the run catalog (optionally filtered by variant), sorted by run id. */
  listScenarios(request: VlmEvalRequest = {}): readonly VlmScenarioSummary[] {
    return this.runs
      .filter((run) => request.variant === undefined || run.variant === request.variant)
      .map((run) => ({
        scenarioId: run.scenarioId,
        baseScenarioId: run.baseScenarioId,
        variant: run.variant,
        matrixCell: run.matrixCell,
        behaviorClass: run.behaviorClass,
        provider: run.scenario.providerRef,
        capability: run.scenario.capability,
        expectedFailureKind: run.scenario.expected.expectedFailureKind,
      }))
      .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  }

  /** Runs ONE catalog scenario through the harness (unknown id → typed error). */
  runScenario(scenarioId: string): VlmEvalOutcome {
    const run = this.byId.get(scenarioId);
    if (run === undefined) {
      throw new VlmEvalError(
        "unknown_scenario",
        `no corpus run '${scenarioId}' — list the catalog for the composed '<base>@<variant>' ids`,
      );
    }
    return evaluateVlmScenario(run);
  }

  /** Runs the whole corpus for ONE variant (deterministic). */
  runCorpusForVariant(variant: VlmVariantKey): VlmVariantCorpusRun {
    parseVlmVariantKey(variant);
    const identity = validatedQwen3VlProfile(variant);
    const outcomes = this.runs
      .filter((run) => run.variant === variant)
      .map((run) => evaluateVlmScenario(run));
    return {
      variant,
      provider: {
        providerId: identity.profile.providerId,
        technologyVersion: identity.profile.technologyVersion,
        profileDigest: identity.profileDigest,
      },
      licenseStatus: "evaluation-only",
      outcomes,
      summary: vlmVariantSummaryOf(variant, outcomes),
    };
  }

  /**
   * Runs the FULL benchmark: both variants over the same corpus, the
   * control-plane registry lifecycle (consolidated records, sealed
   * manifests, the license-blocked promotion refusals, the replay proof)
   * and the provider comparison record.
   */
  runBenchmark(): VlmBenchmarkLifecycleResult {
    return runVlmBenchmarkLifecycle();
  }
}
