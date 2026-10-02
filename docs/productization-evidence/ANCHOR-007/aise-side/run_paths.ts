/**
 * ANCHOR-007 — the AISE-side evidence-run harness (both paths, one seam).
 *
 * Runs BOTH spike adapters —
 *   path (a): adapter/path_a_provider.py (intermediate raster base map +
 *             the ANCHOR-003b reference SIFT/RANSAC lane + the photometric
 *             NCC verification gate), and
 *   path (b): adapter/path_b_provider.py (vp-rectified-line-search/3 —
 *             geometric wall-line registration, no shared texture, with
 *             its DECLARED geometric verification gates)
 * — THROUGH the shipped supervised subprocess runner of
 * `packages/anchoring-contract` against the typed wire shapes of
 * `anchor002-anchoring-contract/1`, over:
 *
 *   1. the DERIVED-DRILL stills (instrument validation: each lane must
 *      recover its KNOWN transform on clean inputs — the realized error is
 *      then measured by tools/measure_drill_realized_error.py); and
 *   2. the REAL photoset (15 anchor-candidate stills + the wrong-building
 *      garage discriminator = 16 real photographs of the Edith Farnsworth
 *      House documentation) against the REAL HABS IL-323 line-art plan
 *      raster — THE measured question of the spike.
 *
 * Every run goes through runSupervisedAnchoring (input-digest audit,
 * SIGKILL supervision, closed-vocabulary output guard, identity-echo laws)
 * and every request is run TWICE over identical canonical bytes (the same
 * executionId — the contract's full-depth deterministicProjection
 * discipline carried from ANCHOR-003b).
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-007/aise-side/run_paths.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
// The contract package is imported by RELATIVE SOURCE PATH (not by package
// name): the evidence tree is docs-only and must not modify the root
// package.json/bun.lock workspace edges (the ANCHOR-002/003b discipline;
// same source, same exports).
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
const FIXTURE = join(TREE, "fixture");
const PATH_A = join(TREE, "adapter", "path_a_provider.py");
const PATH_B = join(TREE, "adapter", "path_b_provider.py");
const MANIFEST = JSON.parse(
  readFileSync(join(FIXTURE, "fixture-manifest.json"), "utf8"),
) as {
  planRaster: {
    file: string;
    rasterToScene: {
      pixelsPerMeter: number;
      xDirection: "east-right";
      yDirection: "north-up";
      worldOriginPx: number[];
    };
    contentDigestSha256: string;
  };
  stills: { file: string; sourcedRenditionDigestSha256: string }[];
};

const PYTHON = process.env.ANCHOR007_PYTHON ?? "/home/z/.venv/bin/python";
const TIMEOUT_MS = 900_000;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface StillRef {
  file: string;
  contentId: string;
  mediaType: string;
}

function stillRefsOf(files: string[], mediaType: string): StillRef[] {
  return files.map((file) => {
    const path = join(FIXTURE, file);
    const digest = sha256File(path);
    const manifestEntry = MANIFEST.stills.find((s) => s.file === file);
    if (manifestEntry !== undefined && manifestEntry.sourcedRenditionDigestSha256 !== digest) {
      throw new Error(
        `fixture manifest drift: ${file} digest does not match the manifest — re-run tools/prepare_fixture.py`,
      );
    }
    return { file, contentId: digest, mediaType };
  });
}

function buildRequest(
  executionId: string,
  planFile: string,
  planMediaType: string,
  stills: StillRef[],
): AnchoringRequest {
  const planPath = join(FIXTURE, planFile);
  const planContentId = sha256File(planPath);
  if (planFile === MANIFEST.planRaster.file && planContentId !== MANIFEST.planRaster.contentDigestSha256) {
    throw new Error(
      "fixture manifest drift: the committed plan raster digest does not match the manifest — " +
        "re-run tools/prepare_fixture.py",
    );
  }
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
      planId: "plan-anchor007-farnsworth-habs-il323-sheet3",
      imageContentId: planContentId,
      imageMediaType: planMediaType,
      bytesPath: planPath,
      rasterToScene: {
        pixelsPerMeter: rts.pixelsPerMeter,
        xDirection: rts.xDirection,
        yDirection: rts.yDirection,
        worldOriginPx: [rts.worldOriginPx[0], rts.worldOriginPx[1]],
      },
    },
    evidence: stills.map((s) => ({
      contentId: s.contentId,
      mediaType: s.mediaType,
      acquisitionMethod: "STILL_IMAGERY",
      bytesPath: join(FIXTURE, s.file),
    })),
    requestedAnchoring: { representation: "plan-homography" },
    policy: {
      // the six contract-required floors (the adapters' declared defaults;
      // every other spike parameter is the adapters' own DEFAULT_CONFIG,
      // echoed verbatim in each response's provenance.config)
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

interface ScenarioResult {
  scenario: string;
  adapter: string;
  ok: boolean;
  status: string | null;
  reasonCode: string | null;
  anchored: number;
  refused: number;
  perStill: { file: string; outcome: string; reasonCode?: string; detail?: string }[];
  deterministic: boolean;
  run1WallMs: number | null;
  run2WallMs: number | null;
  inputDigest: string | null;
  deterministicDigest: string | null;
}

async function runScenario(
  scenario: string,
  adapterPath: string,
  request: AnchoringRequest,
  stills: StillRef[],
): Promise<ScenarioResult> {
  const options = { command: PYTHON, args: [adapterPath], timeoutMs: TIMEOUT_MS };
  const run1 = await runSupervisedAnchoring(request, options);
  const run2 = await runSupervisedAnchoring(request, options);
  describeRun(run1, `${scenario} run-1`);
  describeRun(run2, `${scenario} run-2`);

  const tag = scenario.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  writeFileSync(
    join(RESULTS, `${tag}-run-1.json`),
    run1.ok
      ? JSON.stringify(run1.response, null, 2) + "\n"
      : JSON.stringify({ runnerFailure: run1.failure }, null, 2) + "\n",
  );
  writeFileSync(
    join(RESULTS, `${tag}-run-2.json`),
    run2.ok
      ? JSON.stringify(run2.response, null, 2) + "\n"
      : JSON.stringify({ runnerFailure: run2.failure }, null, 2) + "\n",
  );

  const digestOf = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
  let deterministic = false;
  let deterministicDigest: string | null = null;
  let perStill: ScenarioResult["perStill"] = [];
  let status: string | null = null;
  let reasonCode: string | null = null;
  let anchored = 0;
  let refused = 0;

  if (run1.ok && run2.ok) {
    const proj1 = digestOf(deterministicProjection(run1.response));
    const proj2 = digestOf(deterministicProjection(run2.response));
    deterministic = proj1 === proj2;
    deterministicDigest = `sha256:${proj1}`;
    const r1 = run1.response;
    status = r1.status;
    reasonCode = r1.reasonCode ?? null;
    perStill = stills.map((s) => {
      const hyp = r1.hypotheses.find((h) => h.evidenceContentId === s.contentId);
      if (hyp) {
        return {
          file: s.file,
          outcome: "anchored",
        };
      }
      const ref = (r1.refusedStills ?? []).find((x) => x.contentId === s.contentId);
      if (ref) {
        return { file: s.file, outcome: "refused", reasonCode: ref.reasonCode, detail: ref.detail };
      }
      if (r1.status === "refused") {
        return {
          file: s.file,
          outcome: "refused",
          reasonCode: r1.reasonCode ?? "refused",
          detail:
            "refused with the whole request (zero hypotheses by law); the per-still evidence " +
            "lives in the request-level refusalDetail",
        };
      }
      return { file: s.file, outcome: "not-accounted" };
    });
    anchored = perStill.filter((p) => p.outcome === "anchored").length;
    refused = perStill.filter((p) => p.outcome === "refused").length;
    const notAccounted = perStill.filter((p) => p.outcome === "not-accounted");
    if (notAccounted.length > 0 && r1.status !== "refused") {
      throw new Error(
        `per-still accounting violation in ${scenario}: ${notAccounted.length} still(s) not accounted`,
      );
    }
  }

  return {
    scenario,
    adapter: adapterPath.endsWith("path_a_provider.py") ? "anchor007-path-a/1" : "anchor007-path-b/1",
    ok: run1.ok && run2.ok,
    status,
    reasonCode,
    anchored,
    refused,
    perStill,
    deterministic,
    run1WallMs: run1.ok ? run1.wallMs : null,
    run2WallMs: run2.ok ? run2.wallMs : null,
    inputDigest: run1.ok ? `sha256:${anchoringInputDigestOf(request)}` : null,
    deterministicDigest,
  };
}

async function main(): Promise<void> {
  const drillsA = stillRefsOf(
    ["drill-path-a1.png", "drill-path-a2.png", "drill-path-a3.png"],
    "image/png",
  );
  const drillsB = stillRefsOf(
    ["drill-path-b1.png", "drill-path-b2.png", "drill-path-b3.png"],
    "image/png",
  );
  const realStills = stillRefsOf(
    MANIFEST.stills.map((s) => s.file),
    "image/jpeg",
  );

  console.log(`fixture: ${MANIFEST.stills.length} real stills + 1 plan raster (HABS IL-323 sheet 3)`);
  console.log(`drills: 3 path-a + 3 path-b (DERIVED-DRILL, instrument validation)`);
  console.log(`python: ${PYTHON}`);

  const scenarios: ScenarioResult[] = [];

  // ---- 1. instrument validation: each lane against its own drills -------
  scenarios.push(
    await runScenario(
      "drill-path-a",
      PATH_A,
      buildRequest("anchor007-drill-path-a", MANIFEST.planRaster.file, "image/png", drillsA),
      drillsA,
    ),
  );
  scenarios.push(
    await runScenario(
      "drill-path-b",
      PATH_B,
      buildRequest("anchor007-drill-path-b", MANIFEST.planRaster.file, "image/png", drillsB),
      drillsB,
    ),
  );

  // ---- 2. THE measured question: both paths against the real photoset ---
  scenarios.push(
    await runScenario(
      "real-path-a",
      PATH_A,
      buildRequest("anchor007-real-path-a", MANIFEST.planRaster.file, "image/png", realStills),
      realStills,
    ),
  );
  scenarios.push(
    await runScenario(
      "real-path-b",
      PATH_B,
      buildRequest("anchor007-real-path-b", MANIFEST.planRaster.file, "image/png", realStills),
      realStills,
    ),
  );

  // ---- the summary record ------------------------------------------------
  const summary = {
    harness:
      "aise-side/run_paths.ts — every scenario through runSupervisedAnchoring " +
      "(packages/anchoring-contract): input-digest audit, SIGKILL supervision, " +
      "closed-vocabulary output guard, identity-echo laws; each request run " +
      "TWICE over identical canonical bytes (same executionId; the contract's " +
      "full-depth deterministicProjection discipline)",
    fixture: {
      manifestId: "anchor007-fixture/1",
      site: "Edith Farnsworth House (Mies van der Rohe, 1945-51), Plano, IL — HABS IL-323",
      fidelityClass: "REAL (public-domain/CC photographs + the real HABS measured drawing; never upgraded)",
      stills: MANIFEST.stills.length,
      planRaster: "HABS IL-323 sheet 3 of 8 (line-art measured drawing), 88.00 px/m, north-up crop",
    },
    scenarios: scenarios.map((s) => ({
      scenario: s.scenario,
      adapter: s.adapter,
      runnerOk: s.ok,
      status: s.status,
      reasonCode: s.reasonCode,
      anchored: s.anchored,
      refused: s.refused,
      deterministic: s.deterministic,
      inputDigest: s.inputDigest,
      deterministicDigest: s.deterministicDigest,
      run1WallMs: s.run1WallMs,
      run2WallMs: s.run2WallMs,
      perStill: s.perStill.map((p) => ({
        file: p.file,
        outcome: p.outcome,
        ...(p.reasonCode !== undefined ? { reasonCode: p.reasonCode } : {}),
      })),
    })),
    honestNotes: {
      realizedError:
        "realized registration error is DERIVED for the drill runs (known homographies; " +
        "results/drill-realized-error.json) and is NOT-DERIVABLE for the real photoset " +
        "(no co-registered ground truth exists for the photographs — measured honestly, " +
        "never fabricated)",
      determinismCaveat:
        "asserted for this opencv/numpy/python/platform combination (recorded in " +
        "provenance); cross-version or cross-platform relocation of summation orders is " +
        "not claimed",
    },
  };
  writeFileSync(join(RESULTS, "measurements.json"), JSON.stringify(summary, null, 2) + "\n");

  writeFileSync(
    join(RESULTS, "reproducibility.json"),
    JSON.stringify(
      {
        method:
          "two separate supervised provider processes per scenario over IDENTICAL canonical " +
          "request bytes (same executionId — required by the contract's full-depth " +
          "deterministicProjection); digests over deterministicProjection (executionId, " +
          "executionTimeMs, stageTimingsMs excluded — performance observations, not semantics)",
        scenarios: scenarios.map((s) => ({
          scenario: s.scenario,
          deterministic: s.deterministic,
          deterministicDigest: s.deterministicDigest,
          inputDigest: s.inputDigest,
        })),
      },
      null,
      2,
    ) + "\n",
  );

  const allOk = scenarios.every((s) => s.ok);
  const allDet = scenarios.every((s) => s.deterministic);
  console.log(`\nrunner: ${allOk ? "all scenarios OK" : "RUNNER FAILURE present"}`);
  console.log(`determinism: ${allDet ? "IDENTICAL (all scenarios)" : "DIVERGED"}`);
  for (const s of scenarios) {
    console.log(
      `  ${s.scenario}: status=${s.status} anchored=${s.anchored}/${s.perStill.length} ` +
        `deterministic=${s.deterministic}`,
    );
  }
  if (!allOk || !allDet) {
    process.exitCode = 1;
  }
}

await main();
