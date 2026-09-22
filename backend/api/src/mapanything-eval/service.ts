/**
 * HFX-101 — the MapAnything provider benchmark SERVICE (the thin
 * deterministic evaluation entry point — the vlm-eval service discipline).
 *
 * DETERMINISTIC and IN-MEMORY: no clock, no randomness, no I/O, NO
 * NETWORK (the registered candidate is never invoked — every registry log
 * carries the deterministic double's execution). Identical request
 * sequences produce identical results. Every domain decision is made by
 * the HARNESS (the Layer-1 evaluation over the control plane's pure
 * validators + the reality-eval comparison authority); this service owns
 * only the corpus index, the variant dispatch and the request parsing
 * (fail-closed typed errors, never silent coercion).
 */

import { evaluateMapAnythingRun } from "./harness";
import type { MapAnythingEvalOutcome } from "./harness";
import { evaluateMapAnythingRunCorpus } from "./harness";
import { runMapAnythingBenchmarkLifecycle } from "./registry";
import type { MapAnythingBenchmarkLifecycleResult } from "./registry";
import { mapAnythingVariantLaneSummaryOf } from "./compare";
import type { MapAnythingVariantLaneSummary } from "./compare";
import { mapAnythingEvalRuns as committedRuns } from "./corpus";
import {
  MAPANYTHING_PROVIDER_ID,
  MapAnythingEvalError,
  isMapAnythingVariantKey,
  validatedProfileForVariant,
} from "./model";
import type { MapAnythingEvalRun, MapAnythingVariantKey } from "./model";

/* ------------------------------------------------------------------ */
/* Request shapes (parsed fail-closed)                                  */
/* ------------------------------------------------------------------ */

/** A corpus listing / run request: optionally one variant. */
export interface MapAnythingEvalRequest {
  readonly variant?: MapAnythingVariantKey;
}

/** Parses a request body carrying an optional variant (fail closed). */
export function parseMapAnythingEvalRequest(payload: unknown): MapAnythingEvalRequest {
  if (payload === undefined || payload === null) {
    return {};
  }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new MapAnythingEvalError("invalid_request", "expected a JSON object body");
  }
  const variant = (payload as Record<string, unknown>)["variant"];
  if (variant === undefined) {
    return {};
  }
  if (!isMapAnythingVariantKey(variant)) {
    throw new MapAnythingEvalError(
      "unknown_variant",
      `variant must be one of the benchmark's variant keys (the registered MapAnything candidate ` +
        `or one of the existing reference-path providers)`,
    );
  }
  return { variant };
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

/** The catalog listing projection (presentation only). */
export interface MapAnythingRunSummary {
  readonly runId: string;
  readonly taskId: string;
  readonly variant: MapAnythingVariantKey;
  readonly taskKind: string;
  readonly matrixCell: string;
  readonly behaviorClass: string;
  readonly capability: string;
  readonly benchmarkId: string;
  readonly provider: { readonly providerId: string; readonly technologyVersion: string };
  readonly expectedFailureKind: string;
  readonly evidenceRevisions: readonly string[];
}

/** One variant's corpus run. */
export interface MapAnythingVariantCorpusRun {
  readonly variant: MapAnythingVariantKey;
  readonly provider: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly profileDigest: string;
  };
  readonly licenseStatus: string;
  readonly outcomes: readonly MapAnythingEvalOutcome[];
  readonly laneSummaries: readonly MapAnythingVariantLaneSummary[];
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

/**
 * The MapAnything provider benchmark service: the committed corpus
 * (default) evaluated through the harness. Instantiate once per process;
 * deterministic.
 */
export class MapAnythingEvalService {
  private readonly runs: readonly MapAnythingEvalRun[];
  private readonly byId: Map<string, MapAnythingEvalRun>;

  constructor(runs: readonly MapAnythingEvalRun[] = committedRuns()) {
    this.runs = [...runs];
    this.byId = new Map(this.runs.map((run) => [run.runId, run]));
    for (const run of this.runs) {
      if (this.byId.get(run.runId) !== run) {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          `duplicate run id '${run.runId}' — run identity is unique`,
        );
      }
    }
  }

  /** Lists the run catalog (optionally filtered by variant), sorted by run id. */
  listRuns(request: MapAnythingEvalRequest = {}): readonly MapAnythingRunSummary[] {
    return this.runs
      .filter((run) => request.variant === undefined || run.variant === request.variant)
      .map((run) => ({
        runId: run.runId,
        taskId: run.taskId,
        variant: run.variant,
        taskKind: run.task.taskKind,
        matrixCell: run.task.matrixCell,
        behaviorClass: run.task.behaviorClass,
        capability: run.task.capability,
        benchmarkId: run.scenario.benchmarkId,
        provider: {
          providerId: run.scenario.providerReference.providerId,
          technologyVersion: run.scenario.providerReference.technologyVersion,
        },
        expectedFailureKind: run.task.expectedFailureKind,
        evidenceRevisions: [...run.task.evidence.evidenceRevisions],
      }))
      .sort((a, b) => a.runId.localeCompare(b.runId));
  }

  /** Runs ONE catalog run through the harness (unknown id → typed error). */
  runOne(runId: string): MapAnythingEvalOutcome {
    const run = this.byId.get(runId);
    if (run === undefined) {
      throw new MapAnythingEvalError(
        "unknown_run",
        `no benchmark run '${runId}' — list the catalog for the composed '<taskId>@<variant>' ids`,
      );
    }
    return evaluateMapAnythingRun(run);
  }

  /** Runs the whole corpus for ONE variant (deterministic). */
  runCorpusForVariant(variant: MapAnythingVariantKey): MapAnythingVariantCorpusRun {
    if (!isMapAnythingVariantKey(variant)) {
      throw new MapAnythingEvalError("unknown_variant", `unknown benchmark variant '${String(variant)}'`);
    }
    const identity = validatedProfileForVariant(variant);
    const runs = this.runs.filter((run) => run.variant === variant);
    const outcomes = evaluateMapAnythingRunCorpus(runs);
    return {
      variant,
      provider: {
        providerId: identity.profile.providerId,
        technologyVersion: identity.profile.technologyVersion,
        profileDigest: identity.profileDigest,
      },
      licenseStatus: variant === MAPANYTHING_PROVIDER_ID ? "evaluation-only" : "reference-path-fixture",
      outcomes,
      laneSummaries:
        variant === MAPANYTHING_PROVIDER_ID
          ? (["reconstruction", "depth"] as const).map((lane) =>
              mapAnythingVariantLaneSummaryOf(variant, lane, outcomes),
            )
          : [
              mapAnythingVariantLaneSummaryOf(
                variant,
                variant === "reference-reconstruction" ? "reconstruction" : "depth",
                outcomes,
              ),
            ],
    };
  }

  /**
   * Runs the FULL benchmark: the whole corpus through the control-plane
   * registry lifecycle (the consolidated records, the sealed manifests,
   * the license-blocked promotion refusal, the replay proof) and the
   * per-lane provider comparison records.
   */
  runBenchmark(): MapAnythingBenchmarkLifecycleResult {
    return runMapAnythingBenchmarkLifecycle();
  }
}
