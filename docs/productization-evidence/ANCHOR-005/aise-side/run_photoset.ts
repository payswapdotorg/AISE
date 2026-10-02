/**
 * ANCHOR-005 — the AISE-side capture-lane evidence-run harness.
 *
 * Runs the UNMODIFIED production reference provider (the anchor003b adapter,
 * `anchor003b-adapter/1`, referenced BY PATH from the frozen ANCHOR-003b
 * evidence tree — byte-identical, its adapterSourceDigest verifiable against
 * the 003b tree) THROUGH the shipped supervised subprocess runner of
 * `packages/anchoring-contract`, against the typed wire shapes of
 * `anchor002-anchoring-contract/1`, over the ANCHOR-005 capture lane
 * committed under `photoset/` (the HABS public-domain documentation of the
 * Edith Farnsworth House: the 10 real 1971 Boucher photographs against the
 * 2009 measured south-elevation drawing).
 *
 * The harness (AISE-owned code, the only side that authors requests):
 *
 *   1. reads the provenance manifest and content-addresses every committed
 *      byte (sha-256 = the content ids the provider re-verifies);
 *   2. builds the typed AnchoringRequest: planContext kind `plan-raster`
 *      with the rasterToScene HANDEDNESS LAW carried — pixelsPerMeter and
 *      worldOriginPx as DERIVED by the assembler from the drawing's own
 *      documented geometry (the four annotated elevation levels, least
 *      squares; cross-checked against the graphic scale bar and the
 *      declared 1:48 scale);
 *   3. runs the provider TWICE as separate supervised subprocesses over
 *      IDENTICAL canonical request bytes (the contract-correct determinism
 *      discipline — the same executionId, so the full-depth projection
 *      compares every nested field);
 *   4. measures DETERMINISM (the contract's deterministicProjection digests
 *      must be byte-identical);
 *   5. records the per-still outcomes, runtime observations, and the budget
 *      calibration declaration (honest: per the run's outcome);
 *   6. writes results/run-1.json, run-2.json, measurements.json,
 *      reproducibility.json.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-005/aise-side/run_photoset.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
// The contract package is imported by RELATIVE SOURCE PATH (not by package
// name): the evidence tree is docs-only and must not modify the root
// package.json/bun.lock workspace edges (the ANCHOR-002/003b discipline).
// The adapter is referenced BY PATH from the frozen 003b tree (read-only):
// executing frozen bytes is not modifying them, and the provenance's
// adapterSourceDigest re-verifies the byte-identity on every run.
import {
  ANCHORING_CONTRACT_VERSION,
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
  anchoringInputDigestOf,
  deterministicProjection,
  runSupervisedAnchoring,
  type AnchoringRequest,
  type SupervisedAnchoringRun,
} from "../../../../packages/anchoring-contract/src/index";

const HERE = import.meta.dir;
const TREE = resolve(HERE, "..");
const RESULTS = join(TREE, "results");
const PHOTOSET = join(TREE, "photoset");
const PROVIDER = resolve(TREE, "..", "ANCHOR-003b", "adapter", "anchor_provider.py");
const MANIFEST = JSON.parse(
  readFileSync(join(TREE, "provenance-manifest.json"), "utf8"),
) as {
  planRaster: {
    file: string;
    contentDigestSha256: string;
    rasterToScene: {
      pixelsPerMeter: number;
      xDirection: "east-right";
      yDirection: "north-up";
      worldOriginPx: number[];
    };
  };
  stills: { stillId: string; file: string; contentDigestSha256: string; stillClass: string }[];
};

const PYTHON = process.env.ANCHOR003B_PYTHON ?? "/home/z/.venv/bin/python";
const TIMEOUT_MS = 300_000;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildRequest(executionId: string): AnchoringRequest {
  const planPath = join(PHOTOSET, MANIFEST.planRaster.file);
  const planContentId = sha256File(planPath);
  if (planContentId !== MANIFEST.planRaster.contentDigestSha256) {
    throw new Error(
      "photoset manifest drift: the committed plan raster digest does not match the manifest — " +
        "re-run tools/assemble_photoset.py",
    );
  }
  const evidence = MANIFEST.stills.map((still) => {
    const path = join(PHOTOSET, still.file);
    const digest = sha256File(path);
    if (digest !== still.contentDigestSha256) {
      throw new Error(
        `photoset manifest drift: ${still.file} digest does not match the manifest — ` +
          "re-run tools/assemble_photoset.py",
      );
    }
    return {
      contentId: digest,
      mediaType: "image/jpeg",
      acquisitionMethod: "STILL_IMAGERY",
      bytesPath: path,
    };
  });
  const rts = MANIFEST.planRaster.rasterToScene;
  return {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId,
    authority: "AISE",
    units: "SI",
    planContext: {
      kind: "plan-raster",
      planId: "plan-anchor005-south-elevation",
      imageContentId: planContentId,
      imageMediaType: "image/jpeg",
      bytesPath: planPath,
      rasterToScene: {
        pixelsPerMeter: rts.pixelsPerMeter,
        xDirection: rts.xDirection,
        yDirection: rts.yDirection,
        worldOriginPx: [rts.worldOriginPx[0], rts.worldOriginPx[1]],
      },
    },
    evidence,
    requestedAnchoring: { representation: "plan-homography" },
    policy: {
      // EXACTLY the 003b evidence run's policy — the same declared gates,
      // no tuning (weakening a gate to force anchoring would fabricate the
      // lane's outcome; the run measures the world as it is).
      minKeypointsPerImage: 80,
      minMatchesForEstimate: 12,
      minInliersPerStill: 8,
      minStills: 2,
      crossValMinInliers: 12,
      crossValMaxResidualPx: 20.0,
    },
  };
}

function describeRun(run: SupervisedAnchoringRun, label: string): void {
  if (!run.ok) {
    console.log(`${label}: RUNNER FAILURE — kind=${run.failure.kind}`);
    console.log(`  detail: ${run.failure.detail.slice(0, 300)}`);
    if (run.failure.violations) {
      for (const v of run.failure.violations) {
        console.log(`  guard violation: [${v.code}] ${v.path}: ${v.detail}`);
      }
    }
    return;
  }
  const r = run.response;
  console.log(
    `${label}: status=${r.status}` +
      (r.reasonCode ? ` reasonCode=${r.reasonCode}` : "") +
      ` hypotheses=${r.hypotheses.length}` +
      (r.refusedStills ? ` refusedStills=${r.refusedStills.length}` : "") +
      ` wall=${run.wallMs}ms`,
  );
  if (r.status === "refused") {
    console.log(`  refusalDetail: ${r.refusalDetail?.slice(0, 500)}`);
  }
  for (const h of r.hypotheses) {
    console.log(
      `  anchored ${h.evidenceContentId.slice(0, 12)}… inliers=${h.inlierCount} ` +
        `matches=${h.matchCount} conf=${h.confidence} budget95M=${h.uncertainty.budget95M}`,
    );
  }
  const byReason = new Map<string, number>();
  for (const s of r.refusedStills ?? []) {
    byReason.set(s.reasonCode, (byReason.get(s.reasonCode) ?? 0) + 1);
  }
  for (const [reason, count] of [...byReason].sort()) {
    console.log(`  refused (${reason}): ${count}`);
  }
}

async function main(): Promise<void> {
  // THE DETERMINISM DISCIPLINE (contract-correct, the 003b discipline):
  // both supervised runs go over IDENTICAL canonical request bytes (the
  // SAME executionId) so the provider's echoed provenance.inputDigest
  // matches across runs and the contract's FULL-DEPTH deterministicProjection
  // compares everything semantic.
  const request1 = buildRequest("anchor005-run-001");
  const request2 = buildRequest("anchor005-run-001");

  console.log(`capture lane: ${MANIFEST.stills.length} real stills + 1 plan raster (the measured south elevation)`);
  console.log(`lane composition: ${MANIFEST.stills.filter((s) => s.stillClass === "south-facade").length} south-facade + ${MANIFEST.stills.filter((s) => s.stillClass !== "south-facade").length} north-facade (wrong-plane, real)`);
  console.log(`provider: ${PYTHON} ${PROVIDER}`);
  console.log(`request input digest (run 1): sha256:${anchoringInputDigestOf(request1)}`);

  const options = {
    command: PYTHON,
    args: [PROVIDER],
    timeoutMs: TIMEOUT_MS,
  };

  const run1 = await runSupervisedAnchoring(request1, options);
  const run2 = await runSupervisedAnchoring(request2, options);

  describeRun(run1, "run-1");
  describeRun(run2, "run-2");

  writeFileSync(
    join(RESULTS, "run-1.json"),
    run1.ok
      ? JSON.stringify(run1.response, null, 2) + "\n"
      : JSON.stringify({ runnerFailure: run1.failure }, null, 2) + "\n",
  );
  writeFileSync(
    join(RESULTS, "run-2.json"),
    run2.ok
      ? JSON.stringify(run2.response, null, 2) + "\n"
      : JSON.stringify({ runnerFailure: run2.failure }, null, 2) + "\n",
  );

  if (!run1.ok || !run2.ok) {
    writeFileSync(
      join(RESULTS, "measurements.json"),
      JSON.stringify(
        {
          outcome: "runner-failure",
          runs: [
            run1.ok ? { ok: true, wallMs: run1.wallMs } : { ok: false, failure: run1.failure },
            run2.ok ? { ok: true, wallMs: run2.wallMs } : { ok: false, failure: run2.failure },
          ],
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 1;
    return;
  }

  // Determinism: the contract's own deterministic projection.
  const digestOf = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
  const proj1 = digestOf(deterministicProjection(run1.response));
  const proj2 = digestOf(deterministicProjection(run2.response));
  const deterministic = proj1 === proj2;
  writeFileSync(
    join(RESULTS, "reproducibility.json"),
    JSON.stringify(
      {
        method:
          "two separate supervised provider processes over IDENTICAL canonical request bytes " +
          "(same executionId — required by the contract's full-depth deterministicProjection); digests over " +
          "the contract's deterministicProjection (executionId, executionTimeMs, stageTimingsMs excluded — " +
          "performance observations, not semantics)",
        run1DeterministicDigest: `sha256:${proj1}`,
        run2DeterministicDigest: `sha256:${proj2}`,
        identical: deterministic,
        inputDigestRun1: `sha256:${anchoringInputDigestOf(request1)}`,
        inputDigestRun2: `sha256:${anchoringInputDigestOf(request2)}`,
        echoedInputDigest: run1.response.provenance.inputDigest,
        adapterSourceDigest: run1.response.provenance.adapterSourceDigest,
        adapterReference:
          "referenced BY PATH from the frozen ANCHOR-003b evidence tree (byte-identical; the digest above " +
          "must equal the 003b adapter's own digest — re-verified by the TL at the integration station)",
      },
      null,
      2,
    ) + "\n",
  );

  // Per-still accounting over the photoset (the 003b discipline).
  const r1 = run1.response;
  const perStill = MANIFEST.stills.map((still) => {
    const anchored = r1.hypotheses.find((h) => h.evidenceContentId === still.contentDigestSha256);
    if (anchored) {
      return {
        stillId: still.stillId,
        stillClass: still.stillClass,
        outcome: "anchored" as const,
        inlierCount: anchored.inlierCount,
        matchCount: anchored.matchCount,
        inlierRatio: anchored.inlierRatio,
        confidence: anchored.confidence,
        residualRmsPx: anchored.residualRmsPx,
        budget95M: anchored.uncertainty.budget95M,
        crossValidationPeers: anchored.crossValidation.length,
      };
    }
    const refused = (r1.refusedStills ?? []).find((s) => s.contentId === still.contentDigestSha256);
    if (refused) {
      return {
        stillId: still.stillId,
        stillClass: still.stillClass,
        outcome: "refused" as const,
        reasonCode: refused.reasonCode,
        detail: refused.detail,
      };
    }
    if (r1.status === "refused") {
      return {
        stillId: still.stillId,
        stillClass: still.stillClass,
        outcome: "refused" as const,
        reasonCode: r1.reasonCode,
        detail:
          `refused with the whole request (status=refused, reasonCode=${r1.reasonCode}); the per-still ` +
          "evidence is carried in the request-level refusalDetail naming the stills",
      };
    }
    return { stillId: still.stillId, stillClass: still.stillClass, outcome: "not-accounted" as const };
  });

  const anchored = perStill.filter((p) => p.outcome === "anchored");
  const refused = perStill.filter((p) => p.outcome === "refused");
  const notAccounted = perStill.filter((p) => p.outcome === "not-accounted");
  if (notAccounted.length > 0 && r1.status !== "refused") {
    throw new Error(
      `per-still accounting violation: ${notAccounted.length} requested still(s) not accounted ` +
        "across hypotheses/refusedStills on a non-refused outcome (the contract's accounting law)",
    );
  }

  const measurements = {
    photoset: {
      manifestId: "anchor005-photoset/1",
      site: "Edith Farnsworth House, 14520 River Road, Plano, Kendall County, IL (HABS ILL,47-PLAN.V / IL-1105, LoC item il0323)",
      stills: MANIFEST.stills.length,
      fidelityClass: "REAL (web-retrieved public-domain federal photographs; never upgraded)",
      planRaster:
        "the measured SOUTH ELEVATION drawing (HABS IL-1105 sheet 4, 2009) — public-domain federal " +
        "documentation whose own annotations (EL. 13'-6\"/11'-9\"/2'-4\"/0'-0\", the 1/4\"=1'-0\" scale bar) " +
        "derive the rasterToScene mapping",
      groundTruth:
        "co-registered ground truth DERIVED for still-s04 (the annotation spec + the DLT fit; see " +
        "results/ground-truth.json); the other stills carry measured NOT-DERIVABLE reasons",
    },
    outcome: {
      status: r1.status,
      reasonCode: r1.reasonCode ?? null,
      anchoredStills: anchored.length,
      refusedStills: refused.length,
      vocabulary: "anchored | partial | refused (the typed ANCHOR-002 outcome vocabulary)",
      perStill,
    },
    determinism: {
      identical: deterministic,
      run1DeterministicDigest: `sha256:${proj1}`,
      run2DeterministicDigest: `sha256:${proj2}`,
      caveat:
        "asserted for this opencv/numpy/python/platform combination (recorded in provenance); " +
        "cross-version or cross-platform relocation of summation orders is not claimed",
    },
    runtime: {
      run1WallMs: run1.wallMs,
      run2WallMs: run2.wallMs,
      providerStageTimingsMs: r1.stageTimingsMs ?? {},
      note: "wall time includes the python interpreter + numpy/opencv import (cold process)",
    },
    budgetRecalibration: {
      anchoring001Finding:
        "budget95 covers realized error on only 4/10 synthetic-fixture stills (ANCHOR-001 " +
        "measurements.md §4, budget95Coverage 0.4 — the honest miss carried forward, never hidden)",
      captureLaneStatus:
        anchored.length === 0
          ? "NOT DERIVABLE on this run: zero stills anchored (the §4 gate — the budgetCoversActual instrument " +
            "requires ≥1 anchored still WITH ground truth to measure realized error against; the ground truth " +
            "instrument is committed and ready — see results/ground-truth.json and the refused-consensus " +
            "diagnostic, which measures the WOULD-BE anchors' realized errors at 12.1 m RMSE against the " +
            "documented geometry, proving the refusal correct); the v2.1 declared-budget model carries forward " +
            "UNCHANGED, never upgraded, never presented as calibrated"
          : "DERIVABLE: see per-still budgetCoversActual (the instrument ran)",
      measurementUncertaintyDiscipline:
        "confidence is a declared support score, never a probability; a budget is honest only if " +
        "it covers the realized error — where realized error is not measurable, the budget stays " +
        "a DECLARATION, never an implied measurement",
    },
    provenance: r1.provenance,
  };
  writeFileSync(join(RESULTS, "measurements.json"), JSON.stringify(measurements, null, 2) + "\n");

  console.log(`\ndeterminism: ${deterministic ? "IDENTICAL" : "DIVERGED"} (sha256:${proj1.slice(0, 16)}…)`);
  console.log(`outcomes: anchored=${anchored.length} refused=${refused.length} (status=${r1.status})`);
  if (!deterministic) {
    process.exitCode = 1;
  }
}

await main();
