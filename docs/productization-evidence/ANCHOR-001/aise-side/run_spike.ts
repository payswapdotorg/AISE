/**
 * ANCHOR-001 — the AISE-side measurement harness (the spike's gate runner).
 *
 * Runs the FULL evidence lane end to end and writes the measurement
 * evidence into results/:
 *
 *   1. loads the committed fixture (plan raster + 10 stills) and computes
 *      the evidence content ids (sha-256 of the committed bytes — the
 *      shared-contract contentId shape);
 *   2. builds the canonical AnchoringRequest (sorted-keys JSON, one
 *      executionId per run);
 *   3. spawns the disposable provider TWICE as separate processes (the
 *      process boundary; python from $ANCHOR001_PYTHON, default the
 *      spike venv);
 *   4. GUARDS both responses with the AISE-side closed-vocabulary guard
 *      (a guard failure is a hard error — nothing ungated becomes
 *      evidence);
 *   5. measures DETERMINISM (deterministic-projection digests must be
 *      byte-identical across the two runs);
 *   6. measures ACCURACY against the fixture's exact ground truth
 *      (floor-point registration RMSE/p95/max in METERS per still —
 *      computed HERE, never inside the provider, which never sees ground
 *      truth) and checks the provider's DECLARED uncertainty budget
 *      against the realized error (the epistemic honesty check);
 *   7. records RUNTIME (wall time per process + the provider's own stage
 *      timings);
 *   8. writes results/run-1.json, run-2.json, results/measurements.json,
 *      results/reproducibility.json.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-001/aise-side/run_spike.ts
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type AnchoringRequest,
  type AnchoringResponse,
} from "./contract";
import { deterministicProjection, guardAnchoringResponse } from "./guard";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "..", "..", "..", ".."); // repo root
const EVIDENCE = resolve(HERE, "..");
const RESULTS = join(EVIDENCE, "results");
const FIXTURE = join(RESULTS, "fixture");
const PROVIDER = join(EVIDENCE, "adapter", "anchor_provider.py");
const PYTHON = process.env.ANCHOR001_PYTHON ?? "/home/z/anchor001-venv/bin/python";

const STILL_IDS = Array.from({ length: 10 }, (_, i) => `still-${String(i + 1).padStart(3, "0")}`);

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function canonicalJson(value: unknown): string {
  // Deterministic serialization: sorted keys, fixed separators.
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/* 3x3 homography helpers (plan-px <-> still-px). */
type Mat3 = readonly (readonly number[])[];

function applyH(h: Mat3, p: readonly number[]): number[] {
  const w = h[2][0] * p[0] + h[2][1] * p[1] + h[2][2];
  return [(h[0][0] * p[0] + h[0][1] * p[1] + h[0][2]) / w, (h[1][0] * p[0] + h[1][1] * p[1] + h[1][2]) / w];
}

function invertH(h: Mat3): number[][] {
  const [a, b, c] = h[0];
  const [d, e, f] = h[1];
  const [g, i, j] = h[2];
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  return [
    [(e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det],
    [(f * g - d * j) / det, (a * j - c * g) / det, (c * d - a * f) / det],
    [(d * i - e * g) / det, (b * g - a * i) / det, (a * e - b * d) / det],
  ];
}

function runProvider(request: AnchoringRequest): { response: AnchoringResponse; wallMs: number } {
  const stdin = canonicalJson(request);
  const t0 = Date.now();
  const proc = spawnSync(PYTHON, [PROVIDER], { input: stdin, encoding: "utf8", timeout: 120000 });
  const wallMs = Date.now() - t0;
  if (proc.error) {
    throw new Error(`provider spawn failed: ${proc.error.message}`);
  }
  if (proc.status !== 0) {
    throw new Error(`provider exited with ${proc.status}: ${proc.stderr?.slice(0, 2000)}`);
  }
  return { response: JSON.parse(proc.stdout) as AnchoringResponse, wallMs };
}

function main(): void {
  mkdirSync(RESULTS, { recursive: true });

  /* ---- 1. Fixture + content ids ------------------------------------- */
  const gt = JSON.parse(readFileSync(join(FIXTURE, "ground-truth.json"), "utf8")) as {
    scene: { pixelsPerMeter: number; floorLengthM: number; floorWidthM: number };
    stills: { stillId: string; hPlanPxToPixel: number[][] }[];
  };
  const ppm = gt.scene.pixelsPerMeter;
  const planH = Math.round(gt.scene.floorWidthM * ppm);
  const planBytes = readFileSync(join(FIXTURE, "plan-raster.png"));
  const planContentId = sha256Hex(planBytes);

  const evidence = STILL_IDS.map((sid) => {
    const bytes = readFileSync(join(FIXTURE, `${sid}.png`));
    return {
      contentId: sha256Hex(bytes),
      mediaType: "image/png",
      acquisitionMethod: "STILL_IMAGERY",
      bytesPath: join(FIXTURE, `${sid}.png`),
    };
  });

  /* ---- 2. Canonical request ------------------------------------------ */
  const makeRequest = (executionId: string): AnchoringRequest => ({
    schemaVersion: 1,
    portVersion: "anchor001-anchoring-port/1",
    executionId,
    authority: "AISE",
    units: "SI",
    planContext: {
      kind: "plan-raster",
      planId: "plan-anchor001-001",
      imageContentId: planContentId,
      imageMediaType: "image/png",
      bytesPath: join(FIXTURE, "plan-raster.png"),
      rasterToScene: {
        pixelsPerMeter: ppm,
        xDirection: "east-right",
        yDirection: "north-up",
        worldOriginPx: [0, planH - 1],
      },
    },
    evidence,
    requestedAnchoring: { representation: "plan-homography" },
    policy: {
      minKeypointsPerImage: 80,
      minMatchesForEstimate: 12,
      minInliersPerStill: 8,
      minStills: 2,
      crossValMinInliers: 12,
      crossValMaxResidualPx: 20.0,
    },
  });

  /* ---- 3/4. Run the provider twice + guard both ---------------------- */
  const run1 = runProvider(makeRequest("anchor001-run-001"));
  const run2 = runProvider(makeRequest("anchor001-run-002"));
  for (const [label, r] of [["run-1", run1], ["run-2", run2]] as const) {
    const violations = guardAnchoringResponse(r.response);
    if (violations.length > 0) {
      throw new Error(`GUARD REFUSED ${label}:\n${violations.join("\n")}`);
    }
  }
  writeFileSync(join(RESULTS, "run-1.json"), JSON.stringify(run1.response, null, 2) + "\n");
  writeFileSync(join(RESULTS, "run-2.json"), JSON.stringify(run2.response, null, 2) + "\n");
  const resp = run1.response;
  if (resp.status !== "anchored" || resp.hypotheses.length !== STILL_IDS.length) {
    throw new Error(`expected ${STILL_IDS.length} anchored hypotheses, got status=${resp.status}, n=${resp.hypotheses.length}`);
  }

  /* ---- 5. Determinism ------------------------------------------------- */
  const digest1 = "sha256:" + sha256Hex(Buffer.from(deterministicProjection(run1.response)));
  const digest2 = "sha256:" + sha256Hex(Buffer.from(deterministicProjection(run2.response)));
  const deterministic = digest1 === digest2;
  writeFileSync(
    join(RESULTS, "reproducibility.json"),
    JSON.stringify(
      {
        method: "two separate provider processes over identical canonical input; digests over the deterministic projection (executionId, executionTimeMs, stageTimingsMs excluded — performance observations, not semantics)",
        run1Digest: digest1,
        run2Digest: digest2,
        identical: deterministic,
        inputDigestEcho: resp.provenance.inputDigest,
        adapterSourceDigest: resp.provenance.adapterSourceDigest,
      },
      null,
      2,
    ) + "\n",
  );

  /* ---- 6. Accuracy vs ground truth (harness-side, never in-provider) -- */
  const gtByFile = new Map(gt.stills.map((s) => [`${s.stillId}.png`, s.hPlanPxToPixel as Mat3]));
  const cidToFile = new Map(STILL_IDS.map((sid) => [sha256Hex(readFileSync(join(FIXTURE, `${sid}.png`))), `${sid}.png`]));

  const grid: number[][] = [];
  for (let gx = 0.25; gx <= 7.75; gx += 0.25) {
    for (let gy = 0.25; gy <= 5.75; gy += 0.25) {
      grid.push([gx, gy]);
    }
  }

  const perStill = resp.hypotheses.map((h) => {
    const file = cidToFile.get(h.evidenceContentId)!;
    const hTrue = gtByFile.get(file)!;
    const hEstInv = invertH(h.transform.matrix);
    const errs: number[] = [];
    for (const [gx, gy] of grid) {
      const q = [gx * ppm, planH - 1 - gy * ppm]; // north-up plan px
      const p = applyH(hTrue, q);
      if (p[0] < 0 || p[0] >= 800 || p[1] < 0 || p[1] >= 600) continue; // only floor visible in the still
      const qe = applyH(hEstInv, p);
      errs.push(Math.hypot(qe[0] - q[0], qe[1] - q[1]) / ppm);
    }
    errs.sort((a, b) => a - b);
    const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
    const p95 = errs[Math.min(errs.length - 1, Math.floor(0.95 * errs.length))];
    const max = errs[errs.length - 1];
    return {
      evidenceContentId: h.evidenceContentId,
      stillFile: file,
      inlierCount: h.inlierCount,
      matchCount: h.matchCount,
      inlierRatio: h.inlierRatio,
      confidence: h.confidence,
      declaredUncertainty: h.uncertainty,
      measured: {
        floorRegistrationRmseM: Number(rmse.toFixed(6)),
        floorRegistrationP95M: Number(p95.toFixed(6)),
        floorRegistrationMaxM: Number(max.toFixed(6)),
        sampledFloorPoints: errs.length,
      },
      budgetCoversActual: {
        floorRmsCovers: rmse <= h.uncertainty.floorRmsM * 1.5,
        budget95Covers: rmse <= h.uncertainty.budget95M,
      },
      crossValidationPeers: h.crossValidation.length,
      consistentPeers: h.crossValidation.filter((c) => c.consistent).length,
    };
  });

  const rmseValues = perStill.map((p) => p.measured.floorRegistrationRmseM);
  const measurements = {
    fixture: {
      fixtureId: "anchor001-fixture-001",
      synthetic: true,
      stills: STILL_IDS.length,
      pixelsPerMeter: ppm,
      groundTruth: "exact by construction (plan raster and stills render one shared procedural texture; analytic H verified to <2e-5 px)",
    },
    accuracy: {
      method: "per still: floor-grid points (0.25 m spacing) visible in the still are mapped plan-px -> still-px by the TRUE homography and back to plan-px by the ESTIMATED inverse; error in meters at plan scale",
      perStill,
      aggregate: {
        meanRmseM: Number((rmseValues.reduce((a, b) => a + b, 0) / rmseValues.length).toFixed(6)),
        minRmseM: Number(Math.min(...rmseValues).toFixed(6)),
        maxRmseM: Number(Math.max(...rmseValues).toFixed(6)),
      },
      epistemicCheck: {
        rule: "a declared uncertainty budget is honest only if it covers the realized error",
        allBudgetsCoverActual: perStill.every((p) => p.budgetCoversActual.budget95Covers),
        exceptions: perStill.filter((p) => !p.budgetCoversActual.budget95Covers).map((p) => p.stillFile),
      },
    },
    determinism: {
      identical: deterministic,
      run1Digest: digest1,
      run2Digest: digest2,
      caveat: "asserted for this opencv/numpy/python/platform combination (recorded in provenance); cross-version floating-point relocation is not claimed",
    },
    runtime: {
      run1WallMs: run1.wallMs,
      run2WallMs: run2.wallMs,
      providerStageTimingsMs: resp.stageTimingsMs,
      note: "wall time includes python interpreter + numpy/opencv import (cold process); stage timings are the provider's own observations",
    },
    provenance: resp.provenance,
  };
  writeFileSync(join(RESULTS, "measurements.json"), JSON.stringify(measurements, null, 2) + "\n");

  /* ---- Console summary (the honest headline) ------------------------- */
  console.log(`ANCHOR-001 spike lane:`);
  console.log(`  status: ${resp.status}, hypotheses: ${resp.hypotheses.length}/${STILL_IDS.length}`);
  console.log(`  determinism: ${deterministic ? "IDENTICAL" : "DIVERGED"} (${digest1.slice(0, 23)}…)`);
  console.log(`  accuracy: mean rmse ${(measurements.accuracy.aggregate.meanRmseM * 100).toFixed(1)} cm, max ${(
    measurements.accuracy.aggregate.maxRmseM * 100
  ).toFixed(1)} cm; budget95 covers actual: ${measurements.accuracy.epistemicCheck.allBudgetsCoverActual}`);
  console.log(`  runtime: ${run1.wallMs} ms / ${run2.wallMs} ms wall (cold process incl. imports)`);
  if (!deterministic) {
    process.exitCode = 1;
  }
}

main();
