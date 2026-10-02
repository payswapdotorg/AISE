/**
 * ANCHOR-007 — the negative/discrimination ledger harness (both paths,
 * one seam).
 *
 * Every case drives a REAL spike adapter (path (a) and/or path (b)) — or
 * the declared corrupter drill wrapper — THROUGH the shipped supervised
 * runner of `packages/anchoring-contract`: the runner's input-digest
 * audit, SIGKILL supervision, closed-vocabulary output guard and
 * identity-echo laws all sit between the adapter and the evidence.
 *
 * Fail-closed rule (the ANCHOR-001/003b discipline, carried): every
 * degraded request must answer a TYPED refusal with ZERO hypotheses (or a
 * typed runner failure — guard-refused / input-digest-mismatch), naming
 * the offending evidence/field. No fabricated anchors, ever. The
 * wrong-building discriminator (neg-012) additionally requires that NO
 * hypothesis names the garage photograph — a REAL different building on
 * the same site, which must never anchor to the house's plan.
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-007/aise-side/run_negatives.ts
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
const FIXTURE = join(TREE, "fixture");
const NEGDIR = join(RESULTS, "negatives");
const PATH_A = join(TREE, "adapter", "path_a_provider.py");
const PATH_B = join(TREE, "adapter", "path_b_provider.py");
const CORRUPTER = join(TREE, "adapter", "corrupter.py");
const MANIFEST = JSON.parse(
  readFileSync(join(FIXTURE, "fixture-manifest.json"), "utf8"),
) as {
  planRaster: {
    file: string;
    rasterToScene: { pixelsPerMeter: number; worldOriginPx: number[] };
  };
  stills: { file: string; sourcedRenditionDigestSha256: string }[];
};

const PYTHON = process.env.ANCHOR007_PYTHON ?? "/home/z/.venv/bin/python";
const TIMEOUT_MS = 900_000;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function evidenceOf(files: string[]) {
  return files.map((f) => ({
    contentId: sha256File(join(FIXTURE, f)),
    mediaType: "image/jpeg",
    acquisitionMethod: "STILL_IMAGERY",
    bytesPath: join(FIXTURE, f),
  }));
}

interface LooseRequest {
  executionId?: string;
  planContext?: AnchoringRequest["planContext"] | Record<string, unknown> | null;
  evidence?: unknown[];
  requestedAnchoring?: AnchoringRequest["requestedAnchoring"];
  policy?: AnchoringRequest["policy"];
}

function baseRequest(
  modifications: LooseRequest,
  planFile = MANIFEST.planRaster.file,
): AnchoringRequest {
  const planPath = join(FIXTURE, planFile);
  const rts = MANIFEST.planRaster.rasterToScene;
  const request = {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId: modifications.executionId ?? "anchor007-negatives",
    authority: "AISE",
    units: "SI",
    planContext:
      modifications.planContext === undefined
        ? {
            kind: "plan-raster",
            planId: "plan-anchor007-farnsworth-habs-il323-sheet3",
            imageContentId: sha256File(planPath),
            imageMediaType: "image/png",
            bytesPath: planPath,
            rasterToScene: {
              pixelsPerMeter: rts.pixelsPerMeter,
              xDirection: "east-right",
              yDirection: "north-up",
              worldOriginPx: [rts.worldOriginPx[0], rts.worldOriginPx[1]],
            },
          }
        : modifications.planContext,
    evidence:
      modifications.evidence ?? evidenceOf(["still-h04.jpg", "still-h09.jpg"]),
    requestedAnchoring:
      modifications.requestedAnchoring ?? { representation: "plan-homography" },
    policy: modifications.policy ?? {
      minKeypointsPerImage: 80,
      minMatchesForEstimate: 12,
      minInliersPerStill: 8,
      minStills: 2,
      crossValMinInliers: 12,
      crossValMaxResidualPx: 20.0,
    },
  };
  // the degraded-request drills deliberately violate the wire types
  // (handedness literals, closed vocabularies) — the runner canonicalizes
  // whatever it is handed, and the PROVIDER owns the gate
  return request as unknown as AnchoringRequest;
}

interface CaseResult {
  caseId: string;
  path: "a" | "b" | "seam";
  kind: string;
  expectation: string;
  outcome: "FAIL-CLOSED OK" | "OUTCOME OK" | "UNEXPECTED";
  detail: string;
  zeroHypotheses: boolean;
}

const results: CaseResult[] = [];

async function runCase(
  caseId: string,
  path: CaseResult["path"],
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
    path,
    kind,
    expectation,
    outcome: verdict.ok ? "FAIL-CLOSED OK" : "UNEXPECTED",
    detail: verdict.detail,
    zeroHypotheses,
  });
  console.log(`${verdict.ok ? "OK  " : "FAIL"} ${caseId} (path ${path}): ${verdict.detail.slice(0, 160)}`);
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

function expectRefusalNaming(reasonCode: string, detailNeedle: string) {
  return (run: SupervisedAnchoringRun): { ok: boolean; detail: string } => {
    if (!run.ok) {
      return { ok: false, detail: `runner failure ${run.failure.kind}: ${run.failure.detail.slice(0, 120)}` };
    }
    const r = run.response;
    if (r.status !== "refused") {
      return { ok: false, detail: `expected refused, got status=${r.status}` };
    }
    if (r.hypotheses.length !== 0) {
      return { ok: false, detail: `refusal carried ${r.hypotheses.length} hypotheses (fabricated anchors)` };
    }
    if (!(r.refusalDetail ?? "").includes(detailNeedle)) {
      return { ok: false, detail: `refusalDetail does not carry the per-still evidence "${detailNeedle}"` };
    }
    return {
      ok: true,
      detail: `status=refused reasonCode=${r.reasonCode} hypotheses=0, per-still ` +
        `"${detailNeedle}" evidence present — "${r.refusalDetail?.slice(0, 110)}…"`,
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
  const pathA = { command: PYTHON, args: [PATH_A], timeoutMs: TIMEOUT_MS };
  const pathB = { command: PYTHON, args: [PATH_B], timeoutMs: TIMEOUT_MS };
  const corrupter = (provider: string, mode: string) => ({
    command: PYTHON,
    args: [CORRUPTER],
    timeoutMs: TIMEOUT_MS,
    env: { ANCHOR007_PROVIDER: provider, ANCHOR007_CORRUPT: mode },
  });

  const planPath = join(FIXTURE, MANIFEST.planRaster.file);
  const mirroredPath = join(NEGDIR, "plan-mirrored.png");
  const flatGrayPath = join(NEGDIR, "still-flat-gray.jpg");
  const garageId = sha256File(join(FIXTURE, "still-g01.jpg"));

  const bothPaths = [
    { tag: "a" as const, options: pathA },
    { tag: "b" as const, options: pathB },
  ];

  // neg-001 — no plan context (both paths)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-001-${tag}`, tag, "no-plan", "plan-context-missing",
      baseRequest({ planContext: null }), expectRefusal("plan-context-missing"), options);
  }

  // neg-002 — single still: the redundancy law (both paths)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-002-${tag}`, tag, "single-image", "insufficient-stills",
      baseRequest({ evidence: evidenceOf(["still-h04.jpg"]) }),
      expectRefusal("insufficient-stills"), options);
  }

  // neg-003 — textureless still (declared drill artifact; both paths).
  // path (a) refuses the whole request at its keypoint census
  // (insufficient-features); path (b) refuses the flat-gray still PER-STILL
  // (0 LSD segments) and then the whole request as registration-unreliable
  // (the no-still-anchored class) — both honest; the check requires the
  // typed refusal, zero hypotheses, and the per-still segment-floor
  // evidence carried in the refusalDetail (the zero-hypotheses law).
  for (const { tag, options } of bothPaths) {
    const needle = tag === "a" ? "80-keypoint floor" : "0 line segments";
    await runCase(`neg-003-${tag}`, tag, "textureless", "typed refusal, 0 hypotheses, per-still floor evidence",
      baseRequest({
        evidence: [
          {
            contentId: sha256File(flatGrayPath),
            mediaType: "image/jpeg",
            acquisitionMethod: "STILL_IMAGERY",
            bytesPath: flatGrayPath,
          },
          ...evidenceOf(["still-h04.jpg"]),
        ],
      }),
      expectRefusalNaming("insufficient-features", needle), options);
  }

  // neg-004 — the MIRRORED plan: real bytes, wrong orientation (the physics
  // discriminator — no real photograph can correspond to a mirrored site)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-004-${tag}`, tag, "mirrored-plan (real bytes flipped)", "registration-unreliable",
      baseRequest(
        {
          planContext: {
            kind: "plan-raster",
            planId: "plan-anchor007-neg-004-mirrored",
            imageContentId: sha256File(mirroredPath),
            imageMediaType: "image/png",
            bytesPath: mirroredPath,
            rasterToScene: {
              pixelsPerMeter: MANIFEST.planRaster.rasterToScene.pixelsPerMeter,
              xDirection: "east-right",
              yDirection: "north-up",
              worldOriginPx: [1700.5, 1153.5],
            },
          },
        },
      ),
      expectRefusal("registration-unreliable"), options);
  }

  // neg-005 — unsupported evidence method, bytesPath deliberately nonexistent
  // (the gate-order law: methods are checked BEFORE any byte is read)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-005-${tag}`, tag, "unsupported-evidence-method (nonexistent bytes)", "evidence-method-unsupported",
      baseRequest({
        evidence: [
          {
            contentId: sha256File(join(FIXTURE, "still-h04.jpg")),
            mediaType: "video/mp4",
            acquisitionMethod: "VIDEO_FOOTAGE",
            bytesPath: "/nonexistent/neg-005.mp4",
          },
          ...evidenceOf(["still-h09.jpg"]),
        ],
      }),
      expectRefusal("evidence-method-unsupported"), options);
  }

  // neg-006a..e — corrupted response drills (the seam's output guard)
  await runCase("neg-006a-b", "b", "corrupted-response/unknown-field", "guard refuses, field named",
    baseRequest({}), expectGuardRefusal(["unknown-field"]), corrupter(PATH_B, "unknown-field"));
  await runCase("neg-006b-b", "b", "corrupted-response/handle-leak", "guard refuses, field named",
    baseRequest({}), expectGuardRefusal(["unknown-field"]), corrupter(PATH_B, "handle-leak"));
  await runCase("neg-006c-b", "b", "corrupted-response/nan-matrix", "guard refuses (type-mismatch)",
    baseRequest({}), expectGuardRefusal(["type-mismatch"]), corrupter(PATH_B, "nan-matrix"));
  await runCase("neg-006d-b", "b", "corrupted-response/refused-with-hypotheses", "guard refuses (refusal-discipline)",
    baseRequest({}), expectGuardRefusal(["refusal-discipline"]), corrupter(PATH_B, "refused-hyp"));
  await runCase("neg-006e-a", "a", "corrupted-response/unknown-field (path a)", "guard refuses, field named",
    baseRequest({}), expectGuardRefusal(["unknown-field"]), corrupter(PATH_A, "unknown-field"));

  // neg-007 — wrong digest: contentId != bytes digest (content addressing)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-007-${tag}`, tag, "wrong-digest", "evidence-bytes-mismatch",
      baseRequest({
        evidence: [
          {
            contentId: "0".repeat(64),
            mediaType: "image/jpeg",
            acquisitionMethod: "STILL_IMAGERY",
            bytesPath: join(FIXTURE, "still-h04.jpg"),
          },
          ...evidenceOf(["still-h09.jpg"]),
        ],
      }),
      expectRefusal("evidence-bytes-mismatch"), options);
  }

  // neg-008 — corrupted response: echoed inputDigest does not match the
  // bytes the supervised runner wrote (the supervision audit)
  await runCase("neg-008-b", "b", "input-digest-mismatch", "runner typed failure input-digest-mismatch",
    baseRequest({}), expectRunnerFailure("input-digest-mismatch"), corrupter(PATH_B, "wrong-input-dig"));

  // neg-009 — unsupported plan-context kind: THE CLOSED VOCABULARY LAW the
  // spike itself must obey (a line-art plan travels as a plan RASTER; the
  // line-art METHOD lives in the adapters' declared config, never in the
  // vocabulary)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-009-${tag}`, tag, "unsupported-plan-kind (plan-lineart)", "plan-context-unsupported",
      baseRequest({
        planContext: {
          kind: "plan-lineart",
          planId: "plan-anchor007-neg-009",
          imageContentId: sha256File(planPath),
          imageMediaType: "image/png",
          bytesPath: planPath,
          rasterToScene: {
            pixelsPerMeter: MANIFEST.planRaster.rasterToScene.pixelsPerMeter,
            xDirection: "east-right",
            yDirection: "north-up",
            worldOriginPx: [1700.5, 1153.5],
          },
        },
      }),
      expectRefusal("plan-context-unsupported"), options);
  }

  // neg-010 — unsupported requested representation (the closed vocabulary)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-010-${tag}`, tag, "unsupported-representation", "representation-unsupported",
      baseRequest({ requestedAnchoring: { representation: "camera_poses" } }),
      expectRefusal("representation-unsupported"), options);
  }

  // neg-011 — THE HANDEDNESS LAW: a screen-convention raster declaration
  // must be refused (a mirrored raster silently defeats every matcher)
  for (const { tag, options } of bothPaths) {
    await runCase(`neg-011-${tag}`, tag, "handedness-violation (yDirection screen-down)", "input-contract-violation",
      baseRequest({
        planContext: {
          kind: "plan-raster",
          planId: "plan-anchor007-neg-011",
          imageContentId: sha256File(planPath),
          imageMediaType: "image/png",
          bytesPath: planPath,
          rasterToScene: {
            pixelsPerMeter: MANIFEST.planRaster.rasterToScene.pixelsPerMeter,
            xDirection: "east-right",
            yDirection: "screen-down",
            worldOriginPx: [1700.5, 1153.5],
          },
        },
      }),
      expectRefusal("input-contract-violation"), options);
  }

  // neg-012 — THE WRONG-BUILDING DISCRIMINATOR: the REAL garage photograph
  // (a different building on the same documented site — NOT on the house
  // plan sheet) must never anchor to the house's plan, on either path
  for (const { tag, options } of bothPaths) {
    const request = baseRequest({
      executionId: `anchor007-neg-012-${tag}`,
      evidence: evidenceOf(["still-g01.jpg", "still-h04.jpg"]),
    });
    await runCase(
      `neg-012-${tag}`, tag, "wrong-building (REAL garage photo vs the house plan)",
      "no hypothesis names the garage still; zero fabricated anchors",
      request,
      (run: SupervisedAnchoringRun): { ok: boolean; detail: string } => {
        if (!run.ok) {
          return { ok: false, detail: `runner failure ${run.failure.kind}: ${run.failure.detail.slice(0, 120)}` };
        }
        const r = run.response;
        const garageHyp = r.hypotheses.find((h) => h.evidenceContentId === garageId);
        if (garageHyp) {
          return {
            ok: false,
            detail: `FABRICATED ANCHOR: the garage photograph anchored to the house plan ` +
              `(inliers=${garageHyp.inlierCount}, conf=${garageHyp.confidence}) — a real ` +
              `different building; this is a measured false positive and MUST be recorded`,
          };
        }
        const garageRefused = (r.refusedStills ?? []).some((s) => s.contentId === garageId)
          || r.status === "refused";
        if (!garageRefused) {
          return { ok: false, detail: `garage still not accounted (status=${r.status})` };
        }
        const ref = (r.refusedStills ?? []).find((s) => s.contentId === garageId);
        return {
          ok: true,
          detail: `status=${r.status}; the garage still refused` +
            (ref ? ` (${ref.reasonCode})` : " with the whole request") +
            `; hypotheses=${r.hypotheses.length} name no garage anchor`,
        };
      },
      options,
    );
  }

  const negatives = results.filter((r) => r.caseId.startsWith("neg-"));
  const failClosed = negatives.filter((r) => r.outcome !== "UNEXPECTED");
  const zeroHyp = negatives.filter((r) => r.zeroHypotheses);
  const ledger = {
    harness: "aise-side/run_negatives.ts — every case through runSupervisedAnchoring " +
              "(packages/anchoring-contract): input-digest audit, SIGKILL supervision, " +
              "closed-vocabulary output guard, identity-echo laws; BOTH spike lanes exercised",
    failClosedRule: "every degraded request answers a typed refusal (or typed runner failure) " +
                    "with ZERO hypotheses — no fabricated anchors; the wrong-building " +
                    "discriminator additionally requires no hypothesis names the garage still",
    counts: {
      negativesTotal: negatives.length,
      negativesFailClosed: failClosed.length,
      negativesZeroHypotheses: zeroHyp.length,
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
