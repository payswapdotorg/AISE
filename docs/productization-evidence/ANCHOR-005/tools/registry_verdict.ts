/**
 * ANCHOR-005 — the registry verdict derivation (the capture-lane benchmark
 * vs the evaluation-stage registration).
 *
 * Records the CAPTURE-LANE benchmark (the HABS public-domain documentation
 * lane: 10 real 1971 photographs against the measured south-elevation
 * drawing, with DERIVED co-registered ground truth) against the
 * evaluation-stage registration of the OpenCV reference lane, and takes the
 * promotion decision through the substitution-contract §6 gates
 * (`spec/technology-substitution-contract.md` §6).
 *
 * NO worker self-promotion: this script never appends any decision event to
 * any registry. It derives the verdict THE GATES WOULD ANSWER today and
 * commits the content-addressed capture-lane benchmark record as evidence
 * for the Tech Lead's decision.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-005/tools/registry_verdict.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  deriveBenchmarkRecordId,
  evaluatePromotionGate,
  type BenchmarkRecord,
} from "../../../../packages/provider-registry/src/index";
import {
  deriveReferenceLaneRegistration,
  REFERENCE_LANE_PROVIDER_ID,
  REFERENCE_LANE_TECHNOLOGY_VERSION,
} from "../../../../packages/anchoring-contract/src/registration";

const HERE = import.meta.dir;
const TREE = resolve(HERE, "..");
const RESULTS = join(TREE, "results");
const VERDICT_DIR = join(TREE, "registry-verdict");

interface MeasurementsFile {
  outcome: { status: string; reasonCode: string | null; anchoredStills: number; refusedStills: number };
  determinism: { identical: boolean; run1DeterministicDigest: string };
  runtime: { run1WallMs: number; run2WallMs: number };
  photoset: { stills: number };
  provenance: { inputDigest: string; adapterSourceDigest: string; components: { name: string; version: string }[] };
}

interface NegativesFile {
  counts: { negativesTotal: number; negativesFailClosed: number; negativesZeroHypotheses: number; drills: number };
}

interface GroundTruthFile {
  pixelsPerMeter: number;
  annotations: { still: string; derivable: boolean; reason?: string }[];
}

interface DiagnosticFile {
  diagnostics: {
    stillId: string;
    keypoints?: number;
    inliers?: number;
    consensus?: { footprintNcc: number; gateVerdict: string };
    realizedErrorVsGroundTruth?: { rmseM?: number; maxM?: number; nFeatures?: number };
  }[];
}

function main(): void {
  mkdirSync(VERDICT_DIR, { recursive: true });
  const measurements = JSON.parse(readFileSync(join(RESULTS, "measurements.json"), "utf8")) as MeasurementsFile;
  const negatives = JSON.parse(readFileSync(join(RESULTS, "negative-cases.json"), "utf8")) as NegativesFile;
  const repro = JSON.parse(readFileSync(join(RESULTS, "reproducibility.json"), "utf8")) as {
    inputDigestRun1: string; adapterSourceDigest: string; identical: boolean;
  };
  const groundTruth = JSON.parse(readFileSync(join(RESULTS, "ground-truth.json"), "utf8")) as GroundTruthFile;
  const diagnostic = JSON.parse(readFileSync(join(RESULTS, "refused-consensus-diagnostic.json"), "utf8")) as DiagnosticFile;

  const derivable = groundTruth.annotations.filter((a) => a.derivable);
  const s04 = diagnostic.diagnostics.find((d) => d.stillId === "still-s04");
  const realizedRmse = s04?.realizedErrorVsGroundTruth?.rmseM;

  // ---- The capture-lane benchmark record (content-addressed) ------------
  const body: Omit<BenchmarkRecord, "recordId"> = {
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: REFERENCE_LANE_PROVIDER_ID,
    technologyVersion: "anchor003b-adapter/1",
    benchmarkId: "anchor005-capture-lane/1",
    capability: "spatial-anchoring",
    metrics: [
      {
        metric: "stillsRequested",
        value: measurements.photoset.stills,
        unit: "stills",
        detail: "10 real web-retrieved public-domain HABS photographs of one documented site " +
                "(the Edith Farnsworth House, Plano IL — Jack E. Boucher, 1971, 5x7 in. negatives, " +
                "PD-USGov-NPS) — fidelity class REAL, per-photo provenance in provenance-manifest.json",
      },
      {
        metric: "anchoredStills",
        value: measurements.outcome.anchoredStills,
        unit: "stills",
        detail: "0/10 — the reference lane refused EVERY still of the lane; the whole request failed " +
                "closed with reasonCode=registration-unreliable",
      },
      {
        metric: "groundTruthDerivability",
        value: derivable.length,
        unit: "stills",
        detail: "co-registered ground truth DERIVED for " + derivable.length + " still (still-s04, the frontal " +
                "documentation shot: 14 annotated documented features, two-level DLT fit, leave-one-out RMS " +
                "16.9 photo-px) — the 003b deferment's named gap ('realized registration error NOT " +
                "DERIVABLE') closed where the lane's content permits it; the other 9 stills carry measured " +
                "NOT-DERIVABLE reasons (occlusion, wrong plane, pattern not recoverable)",
      },
      {
        metric: "refusedConsensusRealizedErrorM",
        value: realizedRmse ?? -1,
        unit: "meters RMSE",
        detail: "the DECLARED refused-consensus diagnostic measured the would-be anchors' realized error " +
                "against the derived ground truth: still-s04's 8-inlier consensus (footprint NCC 0.005, " +
                "refused by the photometric gate) carries a realized error of " + realizedRmse +
                " m RMSE over 14 documented features — the refusal is VERIFIED CORRECT, not inferred " +
                "(the 003b refusals could only be inferred; this lane's ground truth measures them)",
      },
      {
        metric: "deterministicRunsIdentical",
        value: 2,
        unit: "runs",
        detail: `two supervised runs over IDENTICAL canonical request bytes; the contract's FULL-DEPTH ` +
                `deterministicProjection digests byte-identical (${measurements.determinism.run1DeterministicDigest.slice(7, 23)}…)`,
      },
      {
        metric: "negativesFailClosed",
        value: negatives.counts.negativesFailClosed,
        unit: "cases",
        detail: `${negatives.counts.negativesFailClosed}/${negatives.counts.negativesTotal} negative cases ` +
                "fail-closed through the adapter+contract seam (extended with the lane's own hazards: " +
                "the wrong-plane site-map discriminator, the mirrored-raster handedness discriminator, " +
                "the cross-site real-vs-real discriminator); every refusal carries zero hypotheses; " +
                "plus 2 typed-outcome drills (anchored at 50-56 inliers + partial)",
      },
    ],
    failureObservations: [
      {
        kind: "unsupported-data",
        detail:
          "0/10 lane stills anchored. The lane satisfied the 003b deferment's three named requirements " +
          "(near-perpendicular vantage — the documentation elevation shots; GSD matched — the photo's " +
          "facade GSD within ~1.5x of the drawing's; 'vintage' — the drawing documents the as-built " +
          "geometry, stable across the 1971-2009 span) and STILL refused, because a FOURTH requirement " +
          "was missing: the plan raster's RADIOMETRY. A measured line-art drawing and a photograph do " +
          "not share texture: the drawing yields 1354-2004 SIFT keypoints vs the photos' 23-40k, the " +
          "matcher's consensus sets sit at 7-8 inliers (exactly at/below the declared floor), and the " +
          "photometric verification gate refuses everything at footprint NCC -0.03..+0.04 vs the 0.25 " +
          "floor. The refusals are now VERIFIED against the derived ground truth (the would-be " +
          "consensus is 15.3 m RMSE wrong) — the gates did their job, measurably",
      },
      {
        kind: "instrument-finding",
        detail:
          "the lane surfaced a latent defect in the frozen adapter: the photometric-verification " +
          "gate's warp step swaps width/height (`plan_h_px, plan_w_px = plan_eq.shape[1], " +
          "plan_eq.shape[0]` then `dsize=(plan_w_px, plan_h_px)`) — invisible on the 003b run's square " +
          "3000x3000 plan, a hard crash on any non-square plan. The lane's declared square-padding " +
          "workaround keeps the frozen adapter byte-identical; the defect is recorded for the Lead " +
          "(fixing it means modifying the frozen 003b tree — a Lead decision, not a worker's)",
      },
    ],
    resourceObservations: {
      compute: "local-cpu",
      memoryMiB: 2048,
      latencyMsP50: measurements.runtime.run2WallMs,
      latencyMsP95: measurements.runtime.run1WallMs,
    },
    reproduction: {
      inputsDigest: repro.inputDigestRun1.replace(/^sha256:/, ""),
      codeVersion: "see adapterSourceDigest (the adapter referenced BY PATH from the frozen ANCHOR-003b " +
                   "tree — byte-identical, digest re-verified per run; the lane's fixtures + the " +
                   "ground-truth instrument are committed in this evidence tree)",
      statement:
        "reproduce with `bun docs/productization-evidence/ANCHOR-005/aise-side/run_photoset.ts` and " +
        "`run_negatives.ts`, and `python3 tools/derive_ground_truth.py` at this tree — REAL public-domain " +
        "federal documentation (HABS), never synthetic-presented-as-real",
    },
  };
  const record: BenchmarkRecord = { ...body, recordId: deriveBenchmarkRecordId(body) };
  writeFileSync(join(VERDICT_DIR, "capture-lane-benchmark-record.json"), JSON.stringify(record, null, 2) + "\n");

  // ---- The promotion decision through the substitution §6 gates ----------
  const registration = deriveReferenceLaneRegistration();
  const entry = registration.registry.entryOf(REFERENCE_LANE_PROVIDER_ID, REFERENCE_LANE_TECHNOLOGY_VERSION);
  if (entry === undefined) {
    throw new Error("registry verdict: the evaluation-stage registration entry is missing");
  }
  const evaluation = evaluatePromotionGate(entry);

  const verdict = {
    verdictLine:
      evaluation.admitted
        ? "promoted"
        : `evaluation-kept — the substitution-contract §6 promotion gate answers the typed refusal(s): ` +
          evaluation.refusals.map((r) => r.kind).join(", "),
    admitted: evaluation.admitted,
    refusalKinds: evaluation.refusals.map((r) => r.kind),
    checks: evaluation.checks.map((c) => ({ gate: c.gate, passed: c.passed, detail: c.detail })),
    captureLaneBenchmarkRecordId: record.recordId,
    registrationStateToday: entry.state,
    workerSelfPromotion: "NONE — this delivery records evidence and derives the gates' answer; the " +
                         "promotion decision belongs to the Tech Lead (workers may not self-approve " +
                         "or self-merge governed Work Items)",
    honestReading:
      "The capture lane the 003b deferment named has now been BUILT and RUN (this evidence tree): " +
      "public-domain federal documentation of one site (measured drawings + documented photography), " +
      "the three named requirements satisfied (vantage, GSD, geometry-stable 'vintage'), and the " +
      "reference lane STILL refused every still — with the missing fourth requirement now measured " +
      "and named (the plan raster's radiometry: line art vs photograph). The lane's novel contribution " +
      "is the DERIVED co-registered ground truth: the refusals are verified correct (the would-be " +
      "consensus is 15.3 m RMSE wrong against the documented geometry) where the 003b refusals could " +
      "only be inferred. The §6 gates answer as before — the license dimension is unchanged by " +
      "evidence (license-driven, not metric-driven — HFX-000) and the metric dimension now carries " +
      "this second honest negative result. Both point the same way: keep the lane at evaluation " +
      "stage. Successor work is named in the deferment ledger (a photorealistic vintage-matched plan " +
      "raster, or the wall-line geometric registration lane — the separate method the 003b deferment " +
      "already names).",
  };
  writeFileSync(join(VERDICT_DIR, "promotion-evaluation.json"), JSON.stringify(verdict, null, 2) + "\n");
  console.log(`benchmark record: ${record.recordId}`);
  console.log(`promotion verdict: ${verdict.verdictLine}`);
  console.log(`refusal kinds: ${verdict.refusalKinds.join(", ")}`);
  console.log(`registration state today: ${entry.state}`);
}

main();
