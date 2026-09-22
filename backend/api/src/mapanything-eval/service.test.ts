/**
 * HFX-101 — the SERVICE tests: the thin deterministic evaluation entry —
 * the catalog, the single-run evaluation, the variant corpus runs, the
 * full benchmark and the fail-closed request parsing.
 */

import { describe, expect, test } from "bun:test";
import { MapAnythingEvalService, parseMapAnythingEvalRequest } from "./service";
import { MapAnythingEvalError } from "./model";

describe("HFX-101 service: the catalog", () => {
  const service = new MapAnythingEvalService();

  test("lists the committed 12-run catalog (optionally filtered by variant), sorted by run id", () => {
    const all = service.listRuns();
    expect(all.length).toBe(12);
    expect(all.map((run) => run.runId)).toEqual([...all.map((run) => run.runId)].sort());
    const mapAnything = service.listRuns({ variant: "mapanything" });
    expect(mapAnything.length).toBe(8);
    expect(mapAnything.every((run) => run.variant === "mapanything")).toBe(true);
    const referenceDepth = service.listRuns({ variant: "reference-depth" });
    expect(referenceDepth.length).toBe(1);
    expect(referenceDepth[0]?.evidenceRevisions).toEqual(["r1"]);
  });

  test("every catalog entry carries the lane metadata (matrix cell, task kind, evidence revisions)", () => {
    const degraded = service.listRuns().find((run) => run.runId.includes("degraded-overlap"));
    expect(degraded?.matrixCell).toBe("degraded-evidence");
    expect(degraded?.taskKind).toBe("registration");
    expect(degraded?.expectedFailureKind).toBe("unsupported-data");
  });
});

describe("HFX-101 service: the evaluations", () => {
  const service = new MapAnythingEvalService();

  test("runs ONE catalog run through the harness (unknown id → typed error)", () => {
    const outcome = service.runOne("depth-metric-wall-grounded-004@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.expectedMatch).toBe(true);
    expect(() => service.runOne("no-such-run")).toThrow(MapAnythingEvalError);
  });

  test("runs the whole corpus for ONE variant with the lane summaries", () => {
    const candidate = service.runCorpusForVariant("mapanything");
    expect(candidate.provider.providerId).toBe("mapanything");
    expect(candidate.provider.technologyVersion).toBe("eval-doubles-1");
    expect(candidate.licenseStatus).toBe("evaluation-only");
    expect(candidate.outcomes.length).toBe(8);
    expect(candidate.laneSummaries.length).toBe(2);
    const reconstruction = candidate.laneSummaries.find(
      (summary) => summary.lane === "reconstruction",
    )!;
    expect(reconstruction.runCount).toBe(7);
    expect(reconstruction.contentRuns).toBe(3);
    expect(reconstruction.refusalRuns).toBe(4);
    expect(reconstruction.behaviorMatrixCellsPassed.length).toBe(4);

    const reference = service.runCorpusForVariant("reference-reconstruction");
    expect(reference.outcomes.length).toBe(3);
    expect(reference.licenseStatus).toBe("reference-path-fixture");
    expect(reference.laneSummaries[0]?.contentRuns).toBe(3);
  });

  test("runs the FULL benchmark (the lifecycle + the comparisons + the replay proof)", () => {
    const benchmark = service.runBenchmark();
    expect(benchmark.outcomes.length).toBe(12);
    expect(benchmark.comparisons.length).toBe(2);
    expect(benchmark.replayEqual).toBe(true);
    const candidate = benchmark.variants.find((variant) => variant.variant === "mapanything");
    expect(candidate?.registryState).toBe("rejected");
  });

  test("identical service runs are deterministic (byte-identical outcomes)", () => {
    const first = new MapAnythingEvalService().runBenchmark();
    const second = new MapAnythingEvalService().runBenchmark();
    expect(JSON.stringify(first.outcomes.map((o) => o.derivedVersionId))).toBe(
      JSON.stringify(second.outcomes.map((o) => o.derivedVersionId)),
    );
    expect(JSON.stringify(first.comparisons)).toBe(JSON.stringify(second.comparisons));
  });
});

describe("HFX-101 service: the fail-closed request parsing", () => {
  test("an empty/absent body parses to the unfiltered catalog request", () => {
    expect(parseMapAnythingEvalRequest(undefined)).toEqual({});
    expect(parseMapAnythingEvalRequest(null)).toEqual({});
    expect(parseMapAnythingEvalRequest({})).toEqual({});
  });

  test("a known variant parses; an unknown variant fails closed with the typed error", () => {
    expect(parseMapAnythingEvalRequest({ variant: "mapanything" })).toEqual({
      variant: "mapanything",
    });
    expect(parseMapAnythingEvalRequest({ variant: "reference-depth" })).toEqual({
      variant: "reference-depth",
    });
    expect(() => parseMapAnythingEvalRequest({ variant: "gpt-anything" })).toThrow(
      MapAnythingEvalError,
    );
    expect(() => parseMapAnythingEvalRequest("not-an-object")).toThrow(MapAnythingEvalError);
    expect(() => parseMapAnythingEvalRequest([1, 2, 3])).toThrow(MapAnythingEvalError);
  });
});
