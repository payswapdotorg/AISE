/**
 * HFX-101 — the REGISTRY tests: the control-plane lifecycle — registration
 * → evaluation → executions → the consolidated benchmark records → the
 * sealed provenance manifests → the license-blocked promotion refusal →
 * the replay proof — and the comparability join with the reference path.
 */

import { describe, expect, test } from "bun:test";
import {
  benchmarkComparabilityKey,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import { consolidatedLaneRecord, runMapAnythingBenchmarkLifecycle } from "./registry";
import { mapAnythingEvalRuns } from "./corpus";
import { evaluateMapAnythingRunCorpus } from "./harness";
import { MAPANYTHING_EVAL_VARIANTS } from "./model";

describe("HFX-101 registry: the full benchmark lifecycle", () => {
  const lifecycle = runMapAnythingBenchmarkLifecycle();

  test("three separate provider entries registered + evaluation-started, twelve normalized executions", () => {
    const kinds = lifecycle.events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "provider-registered").length).toBe(3);
    expect(kinds.filter((kind) => kind === "evaluation-started").length).toBe(3);
    expect(kinds.filter((kind) => kind === "execution-normalized").length).toBe(12);
    // every per-run manifest is sealed:
    expect(kinds.filter((kind) => kind === "provenance-sealed").length).toBe(16); // 12 per-run + 4 consolidated
    expect(kinds.filter((kind) => kind === "benchmark-recorded").length).toBe(3); // the single-shot intakes
    expect(lifecycle.outcomes.length).toBe(12);
    expect(lifecycle.replayEqual).toBe(true);
  });

  test("every consolidated record VALIDATES through the control plane's validateBenchmarkRecord", () => {
    for (const variant of lifecycle.variants) {
      for (const lane of variant.lanes) {
        const validation = validateBenchmarkRecord(lane.consolidatedRecord);
        expect(validation.ok, `${variant.variant}/${lane.lane}`).toBe(true);
        expect(lane.consolidatedRecord.recordId).toMatch(/^[0-9a-f]{64}$/);
        expect(lane.consolidatedRecord.providerId).toBe(variant.providerId);
        expect(lane.consolidatedRecord.technologyVersion).toBe(variant.technologyVersion);
        expect(lane.consolidatedRecord.metrics.length).toBeGreaterThan(0);
      }
    }
  });

  test("every consolidated manifest VERIFIES through verifyProvenanceManifest (portable provenance)", () => {
    for (const variant of lifecycle.variants) {
      for (const lane of variant.lanes) {
        const check = verifyProvenanceManifest(lane.consolidatedManifest);
        expect(check.ok, `${variant.variant}/${lane.lane}`).toBe(true);
        expect(lane.consolidatedManifest.manifestId).toMatch(/^[0-9a-f]{64}$/);
        expect(lane.consolidatedManifest.profileReference.providerId).toBe(variant.providerId);
        // the manifest chains its consolidated record 1:1:
        expect(lane.consolidatedManifest.benchmarkRecordReferences).toEqual([
          lane.consolidatedRecord.recordId,
        ]);
      }
    }
  });

  test("the consolidated records join the REFERENCE PATH on the comparability key (per lane)", () => {
    const maRecon = lifecycle.variants
      .find((variant) => variant.variant === "mapanything")
      ?.lanes.find((lane) => lane.lane === "reconstruction");
    const refRecon = lifecycle.variants
      .find((variant) => variant.variant === "reference-reconstruction")
      ?.lanes.find((lane) => lane.lane === "reconstruction");
    expect(benchmarkComparabilityKey(maRecon!.consolidatedRecord)).toBe(
      benchmarkComparabilityKey(refRecon!.consolidatedRecord),
    );
    const maDepth = lifecycle.variants
      .find((variant) => variant.variant === "mapanything")
      ?.lanes.find((lane) => lane.lane === "depth");
    const refDepth = lifecycle.variants
      .find((variant) => variant.variant === "reference-depth")
      ?.lanes.find((lane) => lane.lane === "depth");
    expect(benchmarkComparabilityKey(maDepth!.consolidatedRecord)).toBe(
      benchmarkComparabilityKey(refDepth!.consolidatedRecord),
    );
    expect(maRecon?.comparabilityKey).toBe("reality-eval-reconstruction/1|reconstruction");
    expect(maDepth?.comparabilityKey).toBe("reality-eval-depth/1|depth");
  });

  test("the registered candidate ends REJECTED with the typed license-blocked refusal (evaluation-only)", () => {
    const candidate = lifecycle.variants.find((variant) => variant.variant === "mapanything");
    expect(candidate?.registryState).toBe("rejected");
    expect(candidate?.promotionRefusals.map((refusal) => refusal.kind)).toEqual(["license-blocked"]);
    // the refusal is RECORDED in the append-only log (never silent):
    const decisions = lifecycle.events.filter((event) => event.kind === "promotion-decided");
    expect(decisions.length).toBe(1);
    if (decisions[0]?.kind === "promotion-decided") {
      expect(decisions[0].decision).toBe("rejected");
      expect(decisions[0].refusals.map((refusal) => refusal.kind)).toEqual(["license-blocked"]);
    }
  });

  test("the reference entries are NOT this lane's candidates (no promotion decision for them)", () => {
    for (const variant of lifecycle.variants.filter((entry) => entry.variant !== "mapanything")) {
      expect(variant.registryState).toBe("benchmarked");
      expect(variant.promotionRefusals).toEqual([]);
    }
  });

  test("the single-shot registry intake: the candidate's attached record is the reconstruction-lane record", () => {
    const candidate = lifecycle.variants.find((variant) => variant.variant === "mapanything");
    const reconstruction = candidate?.lanes.find((lane) => lane.lane === "reconstruction");
    const depth = candidate?.lanes.find((lane) => lane.lane === "depth");
    expect(reconstruction?.registryAttached).toBe(true);
    expect(depth?.registryAttached).toBe(false);
    // the depth-lane record is still chained by its own consolidated manifest (an intake candidate):
    expect(depth?.consolidatedManifest.benchmarkRecordReferences).toEqual([
      depth?.consolidatedRecord.recordId ?? "",
    ]);
    // the registry entry's attached records:
    const entry = lifecycle.registry.entryOf("mapanything", "eval-doubles-1");
    expect(entry?.benchmarkRecords.length).toBe(1);
    expect(entry?.benchmarkRecords[0]?.recordId).toBe(reconstruction?.consolidatedRecord.recordId);
  });

  test("the lifecycle is DETERMINISTIC (two runs are byte-identical)", () => {
    const second = runMapAnythingBenchmarkLifecycle();
    expect(canonicalJsonOf(lifecycle.events)).toBe(canonicalJsonOf(second.events));
    expect(canonicalJsonOf(lifecycle.outcomes.map((o) => o.derivedVersionId))).toBe(
      canonicalJsonOf(second.outcomes.map((o) => o.derivedVersionId)),
    );
  });
});

describe("HFX-101 registry: the consolidated records over the run corpus", () => {
  const outcomes = evaluateMapAnythingRunCorpus(mapAnythingEvalRuns());

  test("the candidate's reconstruction record covers 7 runs (3 content + 4 refusals) with closed-vocabulary observations", () => {
    const record = consolidatedLaneRecord("mapanything", "reconstruction", outcomes);
    expect(record.benchmarkId).toBe("reality-eval-reconstruction/1");
    expect(record.capability).toBe("reconstruction");
    const runCount = record.metrics.find((metric) => metric.metric === "run_count");
    const contentRuns = record.metrics.find((metric) => metric.metric === "grounded_content_runs");
    const refusalRuns = record.metrics.find((metric) => metric.metric === "explicit_refusal_runs");
    const cells = record.metrics.find((metric) => metric.metric === "behavior_matrix_cells_passed");
    expect(runCount?.value).toBe(7);
    expect(contentRuns?.value).toBe(3);
    expect(refusalRuns?.value).toBe(4);
    expect(cells?.value).toBe(4);
    // the refusal observations are closed-vocabulary:
    const kinds = record.failureObservations.map((observation) => observation.kind).sort();
    expect(kinds).toEqual(["resource-exhaustion", "unsupported-data", "unsupported-data", "unsupported-data"]);
    // the declared resource profile rides along (never sensed):
    expect(record.resourceObservations.memoryMiB).toBe(49152);
    expect(record.resourceObservations.latencyMsP50).toBe(1500);
  });

  test("the candidate's depth record covers the 1 grounded depth run; the reference records cover the content runs", () => {
    const maDepth = consolidatedLaneRecord("mapanything", "depth", outcomes);
    expect(maDepth.benchmarkId).toBe("reality-eval-depth/1");
    expect(maDepth.metrics.find((metric) => metric.metric === "run_count")?.value).toBe(1);
    expect(maDepth.metrics.find((metric) => metric.metric === "grounded_content_runs")?.value).toBe(1);

    const refRecon = consolidatedLaneRecord("reference-reconstruction", "reconstruction", outcomes);
    expect(refRecon.metrics.find((metric) => metric.metric === "run_count")?.value).toBe(3);
    expect(refRecon.failureObservations).toEqual([]);
    const refDepth = consolidatedLaneRecord("reference-depth", "depth", outcomes);
    expect(refDepth.metrics.find((metric) => metric.metric === "run_count")?.value).toBe(1);
  });

  test("the per-instance canonical metric values ride along (comparable rows with subject ids)", () => {
    const record = consolidatedLaneRecord("mapanything", "reconstruction", outcomes);
    const instanceMetrics = record.metrics.filter((metric) =>
      metric.subjectId?.includes("@mapanything/"),
    );
    // 3 content runs × 31 canonical metric instances (12 plane_fit_rms + 12 registration_error
    // + 3 scale_error + 3 dimension_error + 1 object_volume_error):
    expect(instanceMetrics.length).toBe(93);
    for (const metric of instanceMetrics) {
      expect(Number.isFinite(metric.value)).toBe(true);
    }
    // comparable rows: the reference record carries the same metric NAMES over its own runs:
    const reference = consolidatedLaneRecord("reference-reconstruction", "reconstruction", outcomes);
    const referenceNames = new Set(
      reference.metrics.filter((metric) => metric.subjectId?.includes("@reference-reconstruction/")).map((metric) => metric.metric),
    );
    for (const name of ["plane_fit_rms", "registration_error", "scale_error", "dimension_error", "object_volume_error"]) {
      expect(referenceNames.has(name)).toBe(true);
    }
  });

  test("every variant lane of the committed corpus is covered (no silent lanes)", () => {
    for (const variant of MAPANYTHING_EVAL_VARIANTS) {
      const mine = outcomes.filter((outcome) => outcome.variant === variant);
      expect(mine.length).toBeGreaterThan(0);
    }
  });
});

/** Canonical JSON helper for the byte-comparison (sorted keys, 2-space, trailing newline). */
function canonicalJsonOf(value: unknown): string {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortValue);
    }
    if (input !== null && typeof input === "object") {
      const record = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        out[key] = sortValue(record[key]);
      }
      return out;
    }
    return input;
  };
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}
