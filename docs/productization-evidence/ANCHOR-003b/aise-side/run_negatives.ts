/**
 * ANCHOR-003b — the negative/discrimination ledger harness (re-pointed at
 * the adapter+contract seam).
 *
 * Every case drives the REAL reference adapter (or the declared corrupter
 * drill wrapper) THROUGH the shipped supervised runner of
 * `packages/anchoring-contract` — the seam the ANCHOR-002 deferment named:
 * the runner's input-digest audit, SIGKILL supervision, closed-vocabulary
 * output guard and identity-echo laws all sit between the adapter and the
 * evidence.
 *
 * Fail-closed rule (the ANCHOR-001 discipline, carried): every degraded
 * request must answer a TYPED refusal with ZERO hypotheses (or a typed
 * runner failure — guard-refused / input-digest-mismatch), naming the
 * offending evidence/field. No fabricated anchors, ever.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-003b/aise-side/run_negatives.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ANCHORING_CONTRACT_VERSION,
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
  runSupervisedAnchoring,
  type AnchoringRequest,
  type SupervisedAnchoringRun,
} from "../../../../packages/anchoring-contract/src/index";

const HERE = import.meta.dir;
const TREE = resolve(HERE, "..");
const RESULTS = join(TREE, "results");
const PHOTOSET = join(TREE, "photoset");
const NEGDIR = join(RESULTS, "negatives");
const PROVIDER = join(TREE, "adapter", "anchor_provider.py");
const CORRUPTER = join(TREE, "adapter", "corrupter.py");
const MANIFEST = JSON.parse(readFileSync(join(TREE, "provenance-manifest.json"), "utf8")) as {
  planRaster: {
    file: string;
    contentDigestSha256: string;
    rasterToScene: { pixelsPerMeter: number; worldOriginPx: number[] };
  };
  stills: { stillId: string; file: string; contentDigestSha256: string }[];
};

const PYTHON = process.env.ANCHOR003B_PYTHON ?? "/home/z/.venv/bin/python";
const TIMEOUT_MS = 300_000;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function evidenceOf(files: string[], overrides: Record<string, unknown> = {}) {
  return files.map((f) => ({
    contentId: sha256File(join(PHOTOSET, f)),
    mediaType: "image/jpeg",
    acquisitionMethod: "STILL_IMAGERY",
    bytesPath: join(PHOTOSET, f),
    ...overrides,
  }));
}

function baseRequest(modifications: {
  planContext?: AnchoringRequest["planContext"];
  evidence?: AnchoringRequest["evidence"];
  requested?: AnchoringRequest["requestedAnchoring"];
  policy?: AnchoringRequest["policy"];
  executionId?: string;
}): AnchoringRequest {
  const planPath = join(PHOTOSET, MANIFEST.planRaster.file);
  const rts = MANIFEST.planRaster.rasterToScene;
  return {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId: modifications.executionId ?? "anchor003b-negatives",
    authority: "AISE",
    units: "SI",
    planContext:
      modifications.planContext === undefined
        ? {
            kind: "plan-raster",
            planId: "plan-anchor003b-001",
            imageContentId: sha256File(planPath),
            imageMediaType: "image/jpeg",
            bytesPath: planPath,
            rasterToScene: {
              pixelsPerMeter: rts.pixelsPerMeter,
              xDirection: "east-right",
              yDirection: "north-up",
              worldOriginPx: [rts.worldOriginPx[0], rts.worldOriginPx[1]],
            },
          }
        : modifications.planContext,
    evidence: modifications.evidence ?? evidenceOf([MANIFEST.stills[0]!.file, MANIFEST.stills[1]!.file]),
    requestedAnchoring: modifications.requested ?? { representation: "plan-homography" },
    policy: modifications.policy ?? {
      minKeypointsPerImage: 80,
      minMatchesForEstimate: 12,
      minInliersPerStill: 8,
      minStills: 2,
      crossValMinInliers: 12,
      crossValMaxResidualPx: 20.0,
    },
  };
}

interface CaseResult {
  caseId: string;
  kind: string;
  expectation: string;
  outcome: "FAIL-CLOSED OK" | "OUTCOME OK" | "UNEXPECTED";
  detail: string;
  zeroHypotheses: boolean;
}

const results: CaseResult[] = [];

async function runCase(
  caseId: string,
  kind: string,
  expectation: string,
  request: AnchoringRequest,
  check: (run: SupervisedAnchoringRun) => { ok: boolean; detail: string },
  options: { command: string; args: string[]; timeoutMs: number; env?: Record<string, string> },
): Promise<void> {
  const run = await runSupervisedAnchoring(request, options);
  const verdict = check(run);
  const zeroHypotheses = run.ok ? run.response.hypotheses.length === 0 : true;
  results.push({
    caseId,
    kind,
    expectation,
    outcome: verdict.ok ? "FAIL-CLOSED OK" : "UNEXPECTED",
    detail: verdict.detail,
    zeroHypotheses,
  });
  console.log(`${verdict.ok ? "OK  " : "FAIL"} ${caseId} (${kind}): ${verdict.detail.slice(0, 160)}`);
}

function expectRefusal(reasonCode: string) {
  return (run: SupervisedAnchoringRun): { ok: boolean; detail: string } => {
    if (!run.ok) {
      return { ok: false, detail: `runner failure ${run.failure.kind}: ${run.failure.detail.slice(0, 120)}` };
    }
    const r = run.response;
    if (r.status !== "refused") {
      return { ok: false, detail: `expected refused/${reasonCode}, got status=${r.status}` };
    }
    if (r.reasonCode !== reasonCode) {
      return { ok: false, detail: `expected reasonCode=${reasonCode}, got ${r.reasonCode}` };
    }
    if (r.hypotheses.length !== 0) {
      return { ok: false, detail: `refusal carried ${r.hypotheses.length} hypotheses (fabricated anchors)` };
    }
    return {
      ok: true,
      detail: `status=refused reasonCode=${r.reasonCode} hypotheses=0 — "${r.refusalDetail?.slice(0, 140)}…"`,
    };
  };
}

function expectGuardRefusal(codes: string[]) {
  return (run: SupervisedAnchoringRun): { ok: boolean; detail: string } => {
    if (run.ok) {
      return { ok: false, detail: `guard ACCEPTED corrupted bytes (status=${run.response.status}) — the drill failed` };
    }
    if (run.failure.kind !== "guard-refused") {
      return { ok: false, detail: `expected guard-refused, got ${run.failure.kind}: ${run.failure.detail.slice(0, 120)}` };
    }
    const got = run.failure.violations?.map((v) => v.code) ?? [];
    const named = got.filter((c) => codes.includes(c));
    if (named.length === 0) {
      return { ok: false, detail: `guard refused but without the expected code(s) ${codes.join(",")} (got ${got.join(",")})` };
    }
    const first = run.failure.violations?.find((v) => codes.includes(v.code));
    return {
      ok: true,
      detail: `runner guard-refused: [${first?.code}] ${first?.path}: ${first?.detail.slice(0, 120)}`,
    };
  };
}

function expectRunnerFailure(kind: string) {
  return (run: SupervisedAnchoringRun): { ok: boolean; detail: string } => {
    if (run.ok) {
      return { ok: false, detail: `expected runner failure ${kind}, got a guarded response` };
    }
    if (run.failure.kind !== kind) {
      return { ok: false, detail: `expected ${kind}, got ${run.failure.kind}` };
    }
    return { ok: true, detail: `runner typed failure ${kind}: ${run.failure.detail.slice(0, 140)}` };
  };
}

async function main(): Promise<void> {
  const provider = { command: PYTHON, args: [PROVIDER], timeoutMs: TIMEOUT_MS };
  const corrupter = (mode: string) => ({
    command: PYTHON,
    args: [CORRUPTER],
    timeoutMs: TIMEOUT_MS,
    env: { ANCHOR003B_CORRUPT: mode },
  });

  const planPath = join(PHOTOSET, MANIFEST.planRaster.file);
  const firstTwo = [MANIFEST.stills[0]!.file, MANIFEST.stills[1]!.file];

  // neg-001 — no plan context
  await runCase("neg-001", "no-plan", "plan-context-missing", baseRequest({ planContext: null }),
    expectRefusal("plan-context-missing"), provider);

  // neg-002 — single still (the redundancy law)
  await runCase("neg-002", "single-image", "insufficient-stills",
    baseRequest({ evidence: evidenceOf([MANIFEST.stills[0]!.file]) }),
    expectRefusal("insufficient-stills"), provider);

  // neg-003 — textureless still (declared drill artifact)
  await runCase("neg-003", "textureless", "insufficient-features",
    baseRequest({
      evidence: [
        {
          contentId: sha256File(join(NEGDIR, "still-flat-gray.jpg")),
          mediaType: "image/jpeg",
          acquisitionMethod: "STILL_IMAGERY",
          bytesPath: join(NEGDIR, "still-flat-gray.jpg"),
        },
        ...evidenceOf([MANIFEST.stills[0]!.file]),
      ],
    }),
    expectRefusal("insufficient-features"), provider);

  // neg-004 — the wrong-plan discriminator: REAL other-site ortho vs the real stills
  const seattlePath = join(NEGDIR, "plan-other-site.jpg");
  await runCase("neg-004", "mismatched-plan (real other-site ortho)", "registration-unreliable",
    baseRequest({
      planContext: {
        kind: "plan-raster",
        planId: "plan-anchor003b-neg-004",
        imageContentId: sha256File(seattlePath),
        imageMediaType: "image/jpeg",
        bytesPath: seattlePath,
        rasterToScene: {
          pixelsPerMeter: 1.4,   // Seattle window: 2.0 km / 1600 px ~= 1.25 m/px (declared for the drill)
          xDirection: "east-right",
          yDirection: "north-up",
          worldOriginPx: [800, 800],
        },
      },
      evidence: evidenceOf(firstTwo),
    }),
    expectRefusal("registration-unreliable"), provider);

  // neg-005 — unsupported evidence method, bytesPath deliberately nonexistent (gate order)
  await runCase("neg-005", "unsupported-evidence-method (nonexistent bytes)", "evidence-method-unsupported",
    baseRequest({
      evidence: evidenceOf(firstTwo, { acquisitionMethod: "VIDEO_FOOTAGE", bytesPath: "/nonexistent/neg-005.mp4" }),
    }),
    expectRefusal("evidence-method-unsupported"), provider);

  // neg-006a — corrupted response: unknown top-level field (provider type crossing)
  await runCase("neg-006a", "corrupted-response/unknown-field", "guard refuses, field named",
    baseRequest({}), expectGuardRefusal(["unknown-field"]), corrupter("unknown-field"));

  // neg-006b — corrupted response: provider handle leak
  await runCase("neg-006b", "corrupted-response/handle-leak", "guard refuses, field named",
    baseRequest({}), expectGuardRefusal(["unknown-field"]), corrupter("handle-leak"));

  // neg-006c — corrupted response: non-finite matrix entry
  await runCase("neg-006c", "corrupted-response/nan-matrix", "guard refuses (type-mismatch)",
    baseRequest({}), expectGuardRefusal(["type-mismatch"]), corrupter("nan-matrix"));

  // neg-006d — corrupted response: refused status carrying hypotheses
  await runCase("neg-006d", "corrupted-response/refused-with-hypotheses", "guard refuses (refusal-discipline)",
    baseRequest({}), expectGuardRefusal(["refusal-discipline"]), corrupter("refused-hyp"));

  // neg-007 — wrong digest: contentId != bytes digest (content addressing)
  await runCase("neg-007", "wrong-digest", "evidence-bytes-mismatch",
    baseRequest({
      evidence: [{
        contentId: "0".repeat(64),
        mediaType: "image/jpeg",
        acquisitionMethod: "STILL_IMAGERY",
        bytesPath: join(PHOTOSET, MANIFEST.stills[0]!.file),
      }, ...evidenceOf([MANIFEST.stills[1]!.file])],
    }),
    expectRefusal("evidence-bytes-mismatch"), provider);

  // neg-008 — corrupted response: echoed inputDigest does not match the bytes
  // the supervised runner wrote (the supervision audit)
  await runCase("neg-008", "input-digest-mismatch", "runner typed failure input-digest-mismatch",
    baseRequest({}), expectRunnerFailure("input-digest-mismatch"), corrupter("wrong-input-dig"));

  // neg-009 — unsupported plan-context kind (the closed vocabulary)
  await runCase("neg-009", "unsupported-plan-kind", "plan-context-unsupported",
    baseRequest({
      planContext: {
        kind: "plan-lineart",
        planId: "plan-neg-009",
        imageContentId: sha256File(planPath),
        imageMediaType: "image/jpeg",
        bytesPath: planPath,
        rasterToScene: {
          pixelsPerMeter: 1.7,
          xDirection: "east-right",
          yDirection: "north-up",
          worldOriginPx: [1500, 1500],
        },
      },
    }),
    expectRefusal("plan-context-unsupported"), provider);

  // neg-010 — unsupported requested representation (the closed vocabulary)
  await runCase("neg-010", "unsupported-representation", "representation-unsupported",
    baseRequest({ requested: { representation: "camera_poses" } }),
    expectRefusal("representation-unsupported"), provider);

  // neg-011 — THE HANDEDNESS LAW: a screen-convention raster declaration
  // must be refused (a mirrored raster silently defeats every matcher)
  await runCase("neg-011", "handedness-violation (yDirection screen-down)", "input-contract-violation",
    baseRequest({
      planContext: {
        kind: "plan-raster",
        planId: "plan-neg-011",
        imageContentId: sha256File(planPath),
        imageMediaType: "image/jpeg",
        bytesPath: planPath,
        rasterToScene: {
          pixelsPerMeter: 1.7,
          xDirection: "east-right",
          yDirection: "screen-down",
          worldOriginPx: [1500, 1500],
        },
      },
    }),
    expectRefusal("input-contract-violation"), provider);

  // drill-012 — THE TYPED PARTIAL EXERCISE: one plan-derived drill still
  // (anchors legitimately: real plan bytes, known-H warp) + the real stills
  // (refuse) — the ANCHOR-002 deferment's named future work, exercised
  // end-to-end through the real adapter and the real plan.
  {
    const drillStill = join(NEGDIR, "still-plan-derived-1.jpg");
    const request = baseRequest({
      executionId: "anchor003b-drill-012",
      evidence: [
        {
          contentId: sha256File(drillStill),
          mediaType: "image/jpeg",
          acquisitionMethod: "STILL_IMAGERY",
          bytesPath: drillStill,
        },
        ...evidenceOf(firstTwo),
      ],
    });
    const run = await runSupervisedAnchoring(request, provider);
    let ok = false;
    let detail = "";
    if (run.ok) {
      const r = run.response;
      const anchoredIds = r.hypotheses.map((h) => h.evidenceContentId);
      const drillId = sha256File(drillStill);
      const summaryOk = r.status === "partial"
        && r.partialSummary?.anchoredStills === r.hypotheses.length
        && r.partialSummary?.refusedStills === (r.refusedStills?.length ?? 0)
        && r.hypotheses.length + (r.refusedStills?.length ?? 0) === 3
        && anchoredIds.includes(drillId);
      ok = Boolean(summaryOk);
      detail = `status=${r.status} anchored=${r.hypotheses.length} refused=${r.refusedStills?.length ?? 0}` +
        ` (the drill still anchored: ${anchoredIds.includes(drillId)}; per-still reasons: ` +
        [...new Set((r.refusedStills ?? []).map((s) => s.reasonCode))].join(", ") + ")";
    } else {
      detail = `runner failure ${run.failure.kind}: ${run.failure.detail.slice(0, 120)}`;
    }
    results.push({
      caseId: "drill-012", kind: "typed-partial exercise (plan-derived drill still + real stills)",
      expectation: "status=partial with per-still results",
      outcome: ok ? "OUTCOME OK" : "UNEXPECTED", detail, zeroHypotheses: false,
    });
    console.log(`${ok ? "OK  " : "FAIL"} drill-012: ${detail.slice(0, 200)}`);
  }

  // drill-013 — THE TYPED ANCHORED EXERCISE: plan-derived drill stills only
  {
    const drills = ["still-plan-derived-1.jpg", "still-plan-derived-2.jpg", "still-plan-derived-3.jpg"]
      .map((f) => join(NEGDIR, f));
    const request = baseRequest({
      executionId: "anchor003b-drill-013",
      evidence: drills.map((p) => ({
        contentId: sha256File(p),
        mediaType: "image/jpeg",
        acquisitionMethod: "STILL_IMAGERY",
        bytesPath: p,
      })),
    });
    const run = await runSupervisedAnchoring(request, provider);
    let ok = false;
    let detail = "";
    if (run.ok) {
      const r = run.response;
      ok = r.status === "anchored" && r.hypotheses.length === 3 && !r.refusedStills;
      const ncc = r.hypotheses.map((h) => `${h.evidenceContentId.slice(0, 8)}…:${h.inlierCount}in/${h.matchCount}m`).join(" ");
      detail = `status=${r.status} hypotheses=${r.hypotheses.length} (${ncc})`;
    } else {
      detail = `runner failure ${run.failure.kind}: ${run.failure.detail.slice(0, 120)}`;
    }
    results.push({
      caseId: "drill-013", kind: "typed-anchored exercise (plan-derived drill stills)",
      expectation: "status=anchored, all hypotheses present",
      outcome: ok ? "OUTCOME OK" : "UNEXPECTED", detail, zeroHypotheses: false,
    });
    console.log(`${ok ? "OK  " : "FAIL"} drill-013: ${detail.slice(0, 200)}`);
  }

  const negatives = results.filter((r) => r.caseId.startsWith("neg-"));
  const failClosed = negatives.filter((r) => r.outcome === "FAIL-CLOSED OK");
  const zeroHyp = negatives.filter((r) => r.zeroHypotheses);
  const ledger = {
    harness: "aise-side/run_negatives.ts — every case through runSupervisedAnchoring " +
              "(packages/anchoring-contract): input-digest audit, SIGKILL supervision, " +
              "closed-vocabulary output guard, identity-echo laws",
    failClosedRule: "every degraded request answers a typed refusal (or typed runner failure) " +
                    "with ZERO hypotheses — no fabricated anchors",
    counts: {
      negativesTotal: negatives.length,
      negativesFailClosed: failClosed.length,
      negativesZeroHypotheses: zeroHyp.length,
      drills: results.length - negatives.length,
    },
    cases: results,
  };
  writeFileSync(join(RESULTS, "negative-cases.json"), JSON.stringify(ledger, null, 2) + "\n");
  console.log(`\nnegatives: ${failClosed.length}/${negatives.length} FAIL-CLOSED OK; ` +
    `${zeroHyp.length}/${negatives.length} carry zero hypotheses`);
  if (failClosed.length !== negatives.length || zeroHyp.length !== negatives.length) {
    process.exitCode = 1;
  }
}

await main();
