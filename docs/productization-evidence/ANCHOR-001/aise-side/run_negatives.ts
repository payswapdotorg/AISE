/**
 * ANCHOR-001 — the negative-case ledger driver (charter: "each must FAIL
 * CLOSED with an explicit typed state; no fabricated anchors").
 *
 * Drives the REAL provider with mutated/degraded inputs and asserts each
 * answers a TYPED refusal carrying NO hypotheses; then drives the AISE-side
 * guard with a deliberately CORRUPTED real response and asserts it is
 * refused with named violations (the GBIM-001 neg-007 discipline).
 *
 * Cases:
 *   neg-001  no-plan                    -> plan-context-missing
 *   neg-002  single-image               -> insufficient-stills (the redundancy law)
 *   neg-003  textureless stills         -> insufficient-features
 *   neg-004  mismatched plan            -> registration-unreliable
 *   neg-005  unsupported evidence methods -> evidence-method-unsupported
 *              (with bytesPath deliberately pointing at a NONEXISTENT file —
 *               proves the method gate fires BEFORE any bytes are read)
 *   neg-006  corrupted provider response -> guard refuses (contract-mismatch
 *              discipline; four corruption classes, each named)
 *
 * Run:
 *   bun docs/productization-evidence/ANCHOR-001/aise-side/run_negatives.ts
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AnchoringRequest, AnchoringResponse } from "./contract";
import { guardAnchoringResponse } from "./guard";

const HERE = import.meta.dir;
const EVIDENCE = resolve(HERE, "..");
const RESULTS = join(EVIDENCE, "results");
const FIXTURE = join(RESULTS, "fixture");
const NEGATIVES = join(RESULTS, "negatives");
const PROVIDER = join(EVIDENCE, "adapter", "anchor_provider.py");
const PYTHON = process.env.ANCHOR001_PYTHON ?? "/home/z/anchor001-venv/bin/python";

const STILL_IDS = Array.from({ length: 10 }, (_, i) => `still-${String(i + 1).padStart(3, "0")}`);

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
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

function runProvider(request: unknown): { response: AnchoringResponse; stdout: string } {
  const proc = spawnSync(PYTHON, [PROVIDER], {
    input: JSON.stringify(sortKeys(request)),
    encoding: "utf8",
    timeout: 120000,
  });
  if (proc.error || proc.status !== 0) {
    throw new Error(`provider failed: ${proc.error?.message ?? proc.stderr?.slice(0, 2000)}`);
  }
  return { response: JSON.parse(proc.stdout) as AnchoringResponse, stdout: proc.stdout };
}

function baseRequest(): AnchoringRequest {
  const gt = JSON.parse(readFileSync(join(FIXTURE, "ground-truth.json"), "utf8")) as {
    scene: { pixelsPerMeter: number; floorWidthM: number };
  };
  const ppm = gt.scene.pixelsPerMeter;
  const planH = Math.round(gt.scene.floorWidthM * ppm);
  const planBytes = readFileSync(join(FIXTURE, "plan-raster.png"));
  const evidence = STILL_IDS.map((sid) => {
    const bytes = readFileSync(join(FIXTURE, `${sid}.png`));
    return {
      contentId: sha256Hex(bytes),
      mediaType: "image/png",
      acquisitionMethod: "STILL_IMAGERY",
      bytesPath: join(FIXTURE, `${sid}.png`),
    };
  });
  return {
    schemaVersion: 1,
    portVersion: "anchor001-anchoring-port/1",
    executionId: "anchor001-negatives",
    authority: "AISE",
    units: "SI",
    planContext: {
      kind: "plan-raster",
      planId: "plan-anchor001-001",
      imageContentId: sha256Hex(planBytes),
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
  };
}

interface CaseResult {
  caseId: string;
  kind: string;
  expected: string;
  got: string;
  hypothesesEmitted: number;
  pass: boolean;
  refusalDetail?: string;
  notes: string;
}

function assertTypedRefusal(
  caseId: string,
  kind: string,
  expected: string,
  response: AnchoringResponse,
  notes: string,
): CaseResult {
  const got = response.status === "refused" ? response.reasonCode ?? "<null>" : `status=${response.status}`;
  const pass = response.status === "refused" && response.reasonCode === expected && response.hypotheses.length === 0;
  return {
    caseId,
    kind,
    expected,
    got,
    hypothesesEmitted: response.hypotheses.length,
    pass,
    refusalDetail: response.refusalDetail,
    notes,
  };
}

function main(): void {
  const results: CaseResult[] = [];

  /* ---- neg-001: no plan context -------------------------------------- */
  {
    const req = { ...baseRequest(), planContext: null } as unknown as AnchoringRequest;
    const { response } = runProvider(req);
    results.push(
      assertTypedRefusal(
        "neg-001",
        "no-plan",
        "plan-context-missing",
        response,
        "anchoring without a plan/floor context is refused; no anchor can be fabricated from stills alone",
      ),
    );
  }

  /* ---- neg-002: single image (the redundancy law) --------------------- */
  {
    const base = baseRequest();
    const req = { ...base, evidence: base.evidence.slice(0, 1) };
    const { response } = runProvider(req);
    results.push(
      assertTypedRefusal(
        "neg-002",
        "single-image",
        "insufficient-stills",
        response,
        "one still yields an exactly-determined homography with zero redundancy evidence — the method refuses instead of trusting self-referential RANSAC inliers",
      ),
    );
  }

  /* ---- neg-003: textureless stills ------------------------------------ */
  {
    const base = baseRequest();
    const flat = [1, 2].map((i) => {
      const bytes = readFileSync(join(NEGATIVES, `still-flat-${String(i).padStart(3, "0")}.png`));
      return {
        contentId: sha256Hex(bytes),
        mediaType: "image/png",
        acquisitionMethod: "STILL_IMAGERY",
        bytesPath: join(NEGATIVES, `still-flat-${String(i).padStart(3, "0")}.png`),
      };
    });
    const req = { ...base, evidence: flat };
    const { response } = runProvider(req);
    results.push(
      assertTypedRefusal(
        "neg-003",
        "textureless",
        "insufficient-features",
        response,
        "uniform painted-gray floor stills produce ~2 keypoints; the feature floor refuses rather than guessing a transform",
      ),
    );
  }

  /* ---- neg-004: mismatched plan (a different room's drawing) ---------- */
  {
    const base = baseRequest();
    const otherBytes = readFileSync(join(NEGATIVES, "plan-other.png"));
    const req = {
      ...base,
      planContext: {
        ...base.planContext!,
        planId: "plan-other-room-001",
        imageContentId: sha256Hex(otherBytes),
        bytesPath: join(NEGATIVES, "plan-other.png"),
      },
    };
    const { response } = runProvider(req);
    results.push(
      assertTypedRefusal(
        "neg-004",
        "mismatched-plan",
        "registration-unreliable",
        response,
        "the stills ARE textured and the plan IS readable, but they depict different floors — inlier support collapses and the whole request fails closed",
      ),
    );
  }

  /* ---- neg-005: unsupported evidence methods -------------------------- */
  {
    const base = baseRequest();
    const bogus = [
      {
        contentId: "a".repeat(64),
        mediaType: "video/mp4",
        acquisitionMethod: "VIDEO_FOOTAGE",
        // Deliberately NONEXISTENT path: the method gate must fire BEFORE
        // any byte is read (the provider never touches this file).
        bytesPath: join(NEGATIVES, "does-not-exist-and-must-not-be-read.mp4"),
      },
      {
        contentId: "b".repeat(64),
        mediaType: "audio/webm",
        acquisitionMethod: "VOICE_NOTE",
        bytesPath: join(NEGATIVES, "does-not-exist-and-must-not-be-read.webm"),
      },
    ];
    const req = { ...base, evidence: bogus };
    const { response } = runProvider(req);
    results.push(
      assertTypedRefusal(
        "neg-005",
        "unsupported-evidence-methods",
        "evidence-method-unsupported",
        response,
        "video/audio evidence is refused by METHOD before any bytes are read (bytesPaths deliberately nonexistent — gate-order proof)",
      ),
    );
  }

  /* ---- neg-006: corrupted provider response (the guard discipline) ---- */
  {
    // The REAL anchored response from the measurement lane, corrupted in
    // four distinct classes; the AISE-side guard must refuse each with the
    // field named — none of the corrupted values can become evidence.
    const real = JSON.parse(readFileSync(join(RESULTS, "run-1.json"), "utf8")) as AnchoringResponse;

    const corruptions: { name: string; mutate: (r: AnchoringResponse) => void; expectFragment: string }[] = [
      {
        name: "unknown top-level field",
        mutate: (r) => {
          (r as unknown as Record<string, unknown>).mysteryPoseGraph = { nodes: 42 };
        },
        expectFragment: "unknown top-level field 'mysteryPoseGraph'",
      },
      {
        name: "unknown hypothesis field (provider handle leak)",
        mutate: (r) => {
          (r.hypotheses[0] as unknown as Record<string, unknown>).siftKeyPointHandle = "cv2.KeyPoint@0x7f…";
        },
        expectFragment: "unknown field 'siftKeyPointHandle'",
      },
      {
        name: "non-finite matrix entry",
        mutate: (r) => {
          const m = r.hypotheses[0].transform.matrix as number[][];
          m[0][0] = Number.NaN;
        },
        expectFragment: "matrix must be a 3x3 matrix of finite numbers",
      },
      {
        name: "refused response carrying hypotheses (fabricated anchors)",
        mutate: (r) => {
          (r as unknown as Record<string, unknown>).status = "refused";
          (r as unknown as Record<string, unknown>).reasonCode = "insufficient-stills";
          (r as unknown as Record<string, unknown>).refusalDetail = "corrupted";
        },
        expectFragment: "a refused response must carry NO hypotheses",
      },
    ];

    for (const c of corruptions) {
      const mutated = JSON.parse(JSON.stringify(real)) as AnchoringResponse;
      c.mutate(mutated);
      const violations = guardAnchoringResponse(mutated);
      const pass = violations.some((x) => x.includes(c.expectFragment));
      results.push({
        caseId: "neg-006",
        kind: `corrupted-response/${c.name}`,
        expected: `guard refusal naming: ${c.expectFragment}`,
        got: violations.length === 0 ? "GUARD PASSED (DEFECT!)" : `guard refused with ${violations.length} violation(s)`,
        hypothesesEmitted: mutated.hypotheses.length,
        pass,
        notes: pass
          ? `guard refused: ${violations.filter((x) => x.includes(c.expectFragment))[0]}`
          : `guard violations did not name the corruption: ${violations.join(" | ").slice(0, 300)}`,
      });
    }
  }

  writeFileSync(join(RESULTS, "negative-cases.json"), JSON.stringify({ cases: results }, null, 2) + "\n");

  const failed = results.filter((r) => !r.pass);
  console.log(`ANCHOR-001 negative ledger: ${results.length - failed.length}/${results.length} FAIL-CLOSED OK`);
  for (const r of results) {
    console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.caseId} (${r.kind}): expected ${r.expected} -> got ${r.got}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
