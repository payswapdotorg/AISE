/**
 * ANCHOR-006 — the AISE-side belt-campaign evidence-run harness.
 *
 * Runs the reference provider (the ANCHOR-001 OpenCV SIFT/RANSAC lane, as
 * the anchor003b adapter, carried BYTE-IDENTICAL into this tree) THROUGH
 * the shipped supervised subprocess runner of `packages/anchoring-contract`
 * — against the typed wire shapes of `anchor002-anchoring-contract/1` —
 * over the ANCHOR-006 photoset: the REAL web-sourced center-pivot farmland
 * stills (the ANCHOR-003b deferment-ledger #5 class) with per-photo
 * provenance and per-photo geolocation facts, committed under
 * `docs/productization-evidence/ANCHOR-006/photoset/`.
 *
 * The 006 shape (declared in run-record.md): the campaign is multi-region
 * (Dundy NE / Hitchcock NE / Finney KS / Blaine NE / un-geolocated NRCS),
 * so the manifest carries a RUN SET of plan rasters — each plan raster is
 * a USGS NAIP ImageServer export at a declared region, vintage and GSD —
 * and each plan group carries the stills whose ground it covers. Every
 * group obeys the redundancy law (>= 2 stills per request — a single-still
 * request is refused by the adapter's declared gate order and is NOT
 * issued by this harness); stills that cannot join any >=2 group are
 * recorded as `not-runnable` in measurements.json, never silently dropped.
 *
 * Per group, the harness (AISE-owned code, the only side that authors
 * requests):
 *   1. content-addresses every committed byte (sha-256 = the content ids
 *      the provider re-verifies; any drift aborts the run);
 *   2. builds the typed AnchoringRequest: planContext kind `plan-raster`
 *      with the rasterToScene HANDEDNESS LAW carried (EPSG:3857 north-up,
 *      TRUE by construction), evidence contentIds = the real photo digests;
 *      the declared photometric verification gate flows from the adapter's
 *      declared config (minAnchoredNcc / nccFootprintMinPixels, echoed in
 *      provenance.config — never overridden by the request policy);
 *   3. runs the provider TWICE as separate supervised subprocesses over
 *      IDENTICAL canonical request bytes (the SAME executionId — the
 *      contract-correct full-depth determinism discipline);
 *   4. measures DETERMINISM (deterministicProjection digests must be
 *      byte-identical; executionId/timings excluded per the contract);
 *   5. records per-still outcomes (the typed anchored/partial/refused
 *      vocabulary), runtime observations, and the honest budget
 *      re-calibration declaration (no co-registered ground truth exists
 *      for web photographs — realized registration error is NOT derivable
 *      where nothing anchored; measured pin-to-camera distances are
 *      recorded as proxies, declared as proxies);
 *   6. writes results/{planId}-run-1.json, -run-2.json,
 *      measurements.json, reproducibility.json.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-006/aise-side/run_photoset.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
// The contract package is imported by RELATIVE SOURCE PATH (not by package
// name): the evidence tree is docs-only and adds no workspace edges — the
// ANCHOR-002/ANCHOR-003b discipline, carried unchanged.
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
const PROVIDER = join(TREE, "adapter", "anchor_provider.py");

interface StillEntry {
  stillId: string;
  file: string;
  contentDigestSha256: string;
}
interface PlanEntry {
  planId: string;
  file: string;
  contentDigestSha256: string;
  rasterToScene: { pixelsPerMeter: number; xDirection: string; yDirection: string; worldOriginPx: number[] };
  stills: string[]; // stillIds whose ground this plan covers (>= 2 — the redundancy law)
  role: string;
}
const MANIFEST = JSON.parse(readFileSync(join(TREE, "provenance-manifest.json"), "utf8")) as {
  stills: StillEntry[];
  planRasters: PlanEntry[];
};

const PYTHON = process.env.ANCHOR006_PYTHON ?? "/home/z/.venv/bin/python";
const TIMEOUT_MS = 300_000;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// Any manifest drift aborts the run BEFORE any provider is spawned.
const stillById = new Map<string, StillEntry>();
for (const still of MANIFEST.stills) {
  const path = join(PHOTOSET, still.file);
  const digest = sha256File(path);
  if (digest !== still.contentDigestSha256) {
    throw new Error(
      `photoset manifest drift: ${still.file} digest does not match the manifest — re-run tools/assemble_photoset.py`,
    );
  }
  stillById.set(still.stillId, still);
}

function evidenceOf(stillIds: string[]) {
  return stillIds.map((id) => {
    const still = stillById.get(id);
    if (!still) throw new Error(`plan group references unknown stillId ${id}`);
    return {
      contentId: still.contentDigestSha256,
      mediaType: "image/jpeg",
      acquisitionMethod: "STILL_IMAGERY",
      bytesPath: join(PHOTOSET, still.file),
    };
  });
}

function buildRequest(plan: PlanEntry, executionId: string): AnchoringRequest {
  const planPath = join(PHOTOSET, plan.file);
  const planContentId = sha256File(planPath);
  if (planContentId !== plan.contentDigestSha256) {
    throw new Error(`plan raster drift: ${plan.file} — re-run tools/assemble_photoset.py`);
  }
  if (plan.stills.length < 2) {
    throw new Error(
      `plan group ${plan.planId} carries ${plan.stills.length} still(s) — the redundancy law requires >= 2 per request`,
    );
  }
  const rts = plan.rasterToScene;
  return {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId,
    authority: "AISE",
    units: "SI",
    planContext: {
      kind: "plan-raster",
      planId: plan.planId,
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
    evidence: evidenceOf(plan.stills),
    requestedAnchoring: { representation: "plan-homography" },
    policy: {
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
    console.log(`  refusalDetail: ${r.refusalDetail?.slice(0, 400)}`);
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

interface GroupResult {
  planId: string;
  role: string;
  stills: string[];
  run1: { ok: boolean; wallMs: number } | { ok: false; failure: unknown };
  run2: { ok: boolean; wallMs: number } | { ok: false; failure: unknown };
  deterministic: boolean;
  run1DeterministicDigest: string;
  run2DeterministicDigest: string;
  inputDigest: string;
  response?: unknown;
}

async function main(): Promise<void> {
  const options = { command: PYTHON, args: [PROVIDER], timeoutMs: TIMEOUT_MS };
  console.log(`photoset: ${MANIFEST.stills.length} real stills; run set: ${MANIFEST.planRasters.length} plan raster(s)`);
  console.log(`provider: ${PYTHON} ${PROVIDER}`);

  const groups: GroupResult[] = [];
  let anyFailure = false;

  for (let gi = 0; gi < MANIFEST.planRasters.length; gi++) {
    const plan = MANIFEST.planRasters[gi];
    const executionId = `anchor006-run-${String(gi + 1).padStart(3, "0")}`;
    const request1 = buildRequest(plan, executionId);
    const request2 = buildRequest(plan, executionId); // IDENTICAL canonical bytes
    const inputDigest = anchoringInputDigestOf(request1);
    console.log(`\n== plan group ${plan.planId} (${plan.role}) — ${plan.stills.length} stills`);
    console.log(`request input digest: sha256:${inputDigest}`);

    const run1 = await runSupervisedAnchoring(request1, options);
    const run2 = await runSupervisedAnchoring(request2, options);
    describeRun(run1, `${plan.planId} run-1`);
    describeRun(run2, `${plan.planId} run-2`);

    writeFileSync(
      join(RESULTS, `${plan.planId}-run-1.json`),
      run1.ok ? JSON.stringify(run1.response, null, 2) + "\n" : JSON.stringify({ runnerFailure: run1.failure }, null, 2) + "\n",
    );
    writeFileSync(
      join(RESULTS, `${plan.planId}-run-2.json`),
      run2.ok ? JSON.stringify(run2.response, null, 2) + "\n" : JSON.stringify({ runnerFailure: run2.failure }, null, 2) + "\n",
    );

    let deterministic = false;
    let proj1 = "";
    let proj2 = "";
    if (run1.ok && run2.ok) {
      const digestOf = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
      proj1 = digestOf(deterministicProjection(run1.response));
      proj2 = digestOf(deterministicProjection(run2.response));
      deterministic = proj1 === proj2;
    } else {
      anyFailure = true;
    }
    groups.push({
      planId: plan.planId,
      role: plan.role,
      stills: plan.stills,
      run1: run1.ok ? { ok: true, wallMs: run1.wallMs } : { ok: false, failure: run1.failure },
      run2: run2.ok ? { ok: true, wallMs: run2.wallMs } : { ok: false, failure: run2.failure },
      deterministic,
      run1DeterministicDigest: `sha256:${proj1}`,
      run2DeterministicDigest: `sha256:${proj2}`,
      inputDigest: `sha256:${inputDigest}`,
      response: run1.ok ? run1.response : undefined,
    });
    if (!deterministic) anyFailure = true;
    console.log(`determinism: ${deterministic ? "IDENTICAL" : "DIVERGED"} (sha256:${proj1.slice(7, 23)}…)`);
  }

  // Per-still accounting across the run set. A still may ride in MULTIPLE
  // plan groups (the pin-verifying run-set design: every qualified pin
  // contributes a plan, and the whole >=2-still group rides every request);
  // the honest accounting records the still as ANCHORED if ANY group anchors
  // it (naming the plan that did, and the plans that refused it), else the
  // first group's refusal. Stills not covered by any >=2 group are recorded
  // honestly — never silently dropped.
  const covered = new Set(MANIFEST.planRasters.flatMap((p) => p.stills));
  const perStill = MANIFEST.stills.map((still) => {
    if (!covered.has(still.stillId)) {
      return {
        stillId: still.stillId,
        outcome: "not-runnable" as const,
        detail:
          "no plan raster group covers this still with >= 2 members (the redundancy law: a " +
          "single-still request is refused by the adapter's declared gate order and is not " +
          "issued by this harness); recorded, never silently dropped",
      };
    }
    let firstRefusal: { planId: string; reasonCode: string; detail: string } | undefined;
    const refusedIn: string[] = [];
    for (const g of groups) {
      const r = g.response as
        | { status: string; reasonCode?: string; refusalDetail?: string; hypotheses: { evidenceContentId: string; inlierCount: number; matchCount: number; inlierRatio: number; confidence: number; residualRmsPx: number; uncertainty: { budget95M: number }; crossValidation: unknown[] }[]; refusedStills?: { contentId: string; reasonCode: string; detail: string }[] }
        | undefined;
      if (!r || !g.stills.includes(still.stillId)) continue;
      const anchored = r.hypotheses.find((h) => h.evidenceContentId === still.contentDigestSha256);
      if (anchored) {
        return {
          stillId: still.stillId,
          outcome: "anchored" as const,
          planId: g.planId,
          inlierCount: anchored.inlierCount,
          matchCount: anchored.matchCount,
          inlierRatio: anchored.inlierRatio,
          confidence: anchored.confidence,
          residualRmsPx: anchored.residualRmsPx,
          budget95M: anchored.uncertainty.budget95M,
          crossValidationPeers: anchored.crossValidation.length,
          ...(refusedIn.length > 0 ? { alsoRefusedInPlans: refusedIn } : {}),
        };
      }
      const refused = (r.refusedStills ?? []).find((s) => s.contentId === still.contentDigestSha256);
      if (refused) {
        if (!firstRefusal) {
          firstRefusal = { planId: g.planId, reasonCode: refused.reasonCode, detail: refused.detail };
        }
        refusedIn.push(g.planId);
        continue;
      }
      if (r.status === "refused") {
        const wholeRequest = {
          planId: g.planId,
          reasonCode: r.reasonCode ?? "registration-unreliable",
          detail: `refused with the whole request (status=refused, reasonCode=${r.reasonCode}); the per-still evidence is carried in the request-level refusalDetail naming the stills`,
        };
        if (!firstRefusal) firstRefusal = wholeRequest;
        refusedIn.push(g.planId);
        continue;
      }
    }
    if (firstRefusal) {
      return {
        stillId: still.stillId,
        outcome: "refused" as const,
        planId: firstRefusal.planId,
        reasonCode: firstRefusal.reasonCode,
        detail: firstRefusal.detail,
        ...(refusedIn.length > 1 ? { refusedInPlans: refusedIn } : {}),
      };
    }
    return { stillId: still.stillId, outcome: "not-accounted" as const };
  });

  const anchored = perStill.filter((p) => p.outcome === "anchored");
  const refused = perStill.filter((p) => p.outcome === "refused");
  const notRunnable = perStill.filter((p) => p.outcome === "not-runnable");
  const notAccounted = perStill.filter((p) => p.outcome === "not-accounted");
  if (notAccounted.length > 0) {
    throw new Error(
      `per-still accounting violation: ${notAccounted.length} covered still(s) not accounted across hypotheses/refusedStills`,
    );
  }

  const measurements = {
    photoset: {
      manifestId: "anchor006-photoset/1",
      campaign: "the center-pivot irrigation farmland geolocation campaign (ANCHOR-003b deferment #5)",
      stills: MANIFEST.stills.length,
      fidelityClass: "REAL (web-retrieved photographs with per-photo provenance; never upgraded)",
      planRasters: MANIFEST.planRasters.length,
      planRoles: MANIFEST.planRasters.map((p) => ({ planId: p.planId, role: p.role, stills: p.stills.length })),
    },
    outcome: {
      groups: groups.map((g) => ({ planId: g.planId, role: g.role, deterministic: g.deterministic })),
      anchoredStills: anchored.length,
      refusedStills: refused.length,
      notRunnableStills: notRunnable.length,
      vocabulary: "anchored | partial | refused (the typed ANCHOR-002 outcome vocabulary)",
      perStill,
    },
    determinism: {
      method:
        "per plan group: two separate supervised provider processes over IDENTICAL canonical request bytes " +
        "(the same executionId — required by the contract's full-depth deterministicProjection, which compares " +
        "every nested field including provenance.inputDigest); digests over the contract's deterministicProjection " +
        "(executionId, executionTimeMs, stageTimingsMs excluded — performance observations, not semantics)",
      allGroupsIdentical: groups.every((g) => g.deterministic),
      groups: groups.map((g) => ({
        planId: g.planId,
        identical: g.deterministic,
        run1DeterministicDigest: g.run1DeterministicDigest,
        run2DeterministicDigest: g.run2DeterministicDigest,
        inputDigest: g.inputDigest,
      })),
      caveat:
        "asserted for this opencv/numpy/python/platform combination (recorded in provenance); " +
        "cross-version or cross-platform relocation of summation orders is not claimed",
    },
    runtime: {
      groups: groups.map((g) => ({
        planId: g.planId,
        run1WallMs: g.run1.ok ? g.run1.wallMs : null,
        run2WallMs: g.run2.ok ? g.run2.wallMs : null,
      })),
      note: "wall time includes the python interpreter + numpy/opencv import (cold process) per supervised run",
    },
    budgetRecalibration: {
      anchoring001Finding:
        "budget95 covers realized error on only 4/10 synthetic-fixture stills (ANCHOR-001 " +
        "measurements.md §4, budget95Coverage 0.4 — the honest miss carried forward, never hidden)",
      realPhotosetStatus:
        anchored.length === 0
          ? "NOT DERIVABLE on this photoset: zero stills anchored, and no co-registered ground " +
            "truth exists for web photographs (the mission's honesty clause) — realized " +
            "registration error cannot be measured; the v2.1 declared-budget model carries " +
            "forward UNCHANGED, and empirical calibration remains gated on an anchorable real " +
            "photoset (recorded as the standing deferment)"
          : "PARTIAL PROXY: see per-still crossValidation residuals (plan-mediated composition " +
            "agreement is a lower-bound error signal, NOT a ground-truth RMSE — declared as proxy)",
      measuredProxies:
        "the geolocation record (results/geolocation/) carries the per-still pin-to-camera " +
        "distances and NCC scores as MEASURED proxies where a pin exists; they are declared " +
        "proxies, never presented as ground-truth registration error",
      measurementUncertaintyDiscipline:
        "confidence is a declared support score, never a probability; a budget is honest only if " +
        "it covers the realized error — where realized error is not measurable, the budget stays " +
        "a DECLARATION, never an implied measurement",
    },
  };
  writeFileSync(join(RESULTS, "measurements.json"), JSON.stringify(measurements, null, 2) + "\n");

  writeFileSync(
    join(RESULTS, "reproducibility.json"),
    JSON.stringify(
      {
        method: measurements.determinism.method,
        allGroupsIdentical: measurements.determinism.allGroupsIdentical,
        groups: measurements.determinism.groups,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\noutcome: anchored=${anchored.length} refused=${refused.length} not-runnable=${notRunnable.length}`);
  console.log(`determinism (all groups): ${measurements.determinism.allGroupsIdentical ? "IDENTICAL" : "DIVERGED"}`);
  if (anyFailure || !measurements.determinism.allGroupsIdentical) {
    process.exitCode = 1;
  }
}

await main();
