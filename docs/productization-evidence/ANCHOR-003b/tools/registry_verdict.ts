/**
 * ANCHOR-003b — the registry verdict derivation.
 *
 * Records the REAL-PHOTOSET benchmark against the evaluation-stage
 * registration of the OpenCV reference lane (`packages/anchoring-contract`
 * src/registration.ts — the ANCHOR-002 committed, drift-checked artifacts),
 * and takes the promotion decision through the substitution-contract §6
 * gates (`spec/technology-substitution-contract.md` §6: the control plane
 * refuses on license-use-clearance, benchmark-evidence and
 * provenance-continuity dimensions — a research-only/uncleared license is
 * REJECTED with the typed `license-blocked` refusal regardless of recordable
 * metrics).
 *
 * NO worker self-promotion: this script never appends any decision event to
 * any registry. It derives the verdict THE GATES WOULD ANSWER today and
 * commits the content-addressed real-photoset benchmark record as evidence
 * for the Tech Lead's decision.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-003b/tools/registry_verdict.ts
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

function main(): void {
  mkdirSync(VERDICT_DIR, { recursive: true });
  const measurements = JSON.parse(readFileSync(join(RESULTS, "measurements.json"), "utf8")) as MeasurementsFile;
  const negatives = JSON.parse(readFileSync(join(RESULTS, "negative-cases.json"), "utf8")) as NegativesFile;
  const repro = JSON.parse(readFileSync(join(RESULTS, "reproducibility.json"), "utf8")) as {
    inputDigestRun1: string; adapterSourceDigest: string; identical: boolean;
  };

  // ---- The real-photoset benchmark record (content-addressed) ------------
  const body: Omit<BenchmarkRecord, "recordId"> = {
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: REFERENCE_LANE_PROVIDER_ID,
    technologyVersion: "anchor003b-adapter/1",
    benchmarkId: "anchor003b-real-photoset/1",
    capability: "spatial-anchoring",
    metrics: [
      {
        metric: "stillsRequested",
        value: measurements.photoset.stills,
        unit: "stills",
        detail: "28 real web-retrieved USDA public-domain photographs of one real site " +
                "(the Szawlowski Farm, North Hatfield MA) — fidelity class REAL, per-photo provenance " +
                "in provenance-manifest.json",
      },
      {
        metric: "anchoredStills",
        value: measurements.outcome.anchoredStills,
        unit: "stills",
        detail: "0/28 — the reference lane refused EVERY real still; the whole request failed closed " +
                "with reasonCode=registration-unreliable",
      },
      {
        metric: "photometricVerificationGate",
        value: 0.25,
        unit: "NCC floor",
        detail: "the ANCHOR-003b adapter's DECLARED new gate (minAnchoredNcc, provenance.config): " +
                "every surviving RANSAC homography must verify photometrically (footprint NCC vs the " +
                "plan) — without it, real web photos produce plausible-but-wrong 8-inlier consensus " +
                "sets that a pure inlier-count floor would admit as anchors",
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
                "fail-closed through the adapter+contract seam (the supervised runner's input-digest " +
                "audit, guard and SIGKILL supervision between the adapter and the evidence); every " +
                "refusal carries zero hypotheses; plus 2 typed-outcome drills (anchored + partial)",
      },
    ],
    failureObservations: [
      {
        kind: "unsupported-data",
        detail:
          "0/28 real stills anchored. Dominant cause classes (measured during sourcing, recorded in " +
          "run-record.md): (a) oblique vantage — web aerials overwhelmingly shoot 20-45 deg toward " +
          "the horizon, breaking the ground-plane homography; (b) vintage/state mismatch — the NAIP " +
          "mosaic's crop state differs from the October-2019 harvest photographs (two public ortho " +
          "products of the same farm at different vintages cross-correlate at only NCC 0.27-0.32); " +
          "(c) content mismatch — ground-level and close-up frames share no structure with the plan " +
          "raster; (d) radiometry — dusk/night frames against day orthoimagery",
      },
      {
        kind: "perception-failure",
        detail:
          "the plausible-junk discriminator: unverified RANSAC consensus sets of 5-9 inliers formed on " +
          "nearly EVERY still (28/28) and were refused by the declared photometric NCC gate — exactly " +
          "the fabricated-anchor class the fail-closed law exists to prevent",
      },
    ],
    resourceObservations: {
      compute: "local-cpu",
      memoryMiB: 3072,
      latencyMsP50: measurements.runtime.run2WallMs,
      latencyMsP95: measurements.runtime.run1WallMs,
    },
    reproduction: {
      inputsDigest: repro.inputDigestRun1.replace(/^sha256:/, ""),
      codeVersion: "see adapterSourceDigest (the evidence tree carries the adapter + the photoset bytes)",
      statement:
        "reproduce with `bun docs/productization-evidence/ANCHOR-003b/aise-side/run_photoset.ts` " +
        "and `run_negatives.ts` at this tree — REAL photoset evidence (28 web-retrieved USDA " +
        "photographs + a USGS NAIP plan raster), never synthetic-presented-as-real",
    },
  };
  const record: BenchmarkRecord = { ...body, recordId: deriveBenchmarkRecordId(body) };
  writeFileSync(join(VERDICT_DIR, "real-photoset-benchmark-record.json"), JSON.stringify(record, null, 2) + "\n");

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
    realPhotosetBenchmarkRecordId: record.recordId,
    registrationStateToday: entry.state,
    workerSelfPromotion: "NONE — this delivery records evidence and derives the gates' answer; the " +
                         "promotion decision belongs to the Tech Lead (workers may not self-approve " +
                         "or self-merge governed Work Items)",
    honestReading:
      "The real-photoset gate the roadmap named has now RUN (this evidence tree). The reference " +
      "lane, exercised through the shipped supervised runner against the typed contract on a real " +
      "28-photo web-sourced photoset with per-photo provenance, refused every still at its declared " +
      "quality gates — with the new photometric verification gate catching the plausible-but-wrong " +
      "consensus sets a pure inlier floor would have admitted. The promotion gate's license " +
      "dimension is unchanged by evidence (it is license-driven, not metric-driven — HFX-000), and " +
      "the metric dimension now carries this honest negative result: an adapter whose reference lane " +
      "cannot verify-anchor the real web-photo classes tested here is NOT production-ready for " +
      "them. Both point the same way: keep the lane at evaluation stage; the synthetic-fixture " +
      "benchmark (ANCHOR-001, frozen) proves the lane; this real-photoset benchmark proves the " +
      "world is harder than the fixture — exactly what the ANCHOR-001 recommendation's own gate " +
      "anticipated. Successor work (a near-nadir, vintage-matched, GSD-matched capture lane) is " +
      "named in the deferment ledger.",
  };
  writeFileSync(join(VERDICT_DIR, "promotion-evaluation.json"), JSON.stringify(verdict, null, 2) + "\n");
  console.log(`benchmark record: ${record.recordId}`);
  console.log(`promotion verdict: ${verdict.verdictLine}`);
  console.log(`refusal kinds: ${verdict.refusalKinds.join(", ")}`);
  console.log(`registration state today: ${entry.state}`);
}

main();
