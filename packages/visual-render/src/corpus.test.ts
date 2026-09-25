/**
 * HFX-303 tests — the corpus module: the pinned fixture discipline. The
 * corpus's canonical bytes, state identities and projection digests are
 * pinned as golden constants — any drift in the mirrors (the demo scene,
 * the overlay projection, the AISE-021 formulas) or in the engine's
 * derivations breaks these pins loudly.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  CORPUS_VIEW,
  buildVisualCorpus,
  demoBaselineGeometryTable,
  demoObservedSceneElements,
  edgeStandaloneIntent,
  replayDemoWorld,
  replayEdgeWorld,
  visualRequestForState,
  wallUpgradeIntents,
} from "./corpus";
import { validateVisualStateRequest } from "./port";
import { canonicalProjectionDigestOf } from "./fallback";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * PINNED GOLDENS (deterministic reference data — the fixture-stability
 * contract): the demo world's version bytes, the three state identities
 * and the canonical projection digests. Regenerating the corpus must
 * reproduce exactly these.
 */
const PINNED = {
  demoVersionDigest: "02377a9a18e9f228ab686b2a0d27cb01f53f5118cf378b9f801c01872e63c997",
  stateIds: {
    "demo-world-baseline": "ce0f5133d8a0097d7a53766687cf145c43448ac54a1b9e01c66bbe498a0e0dd2",
    "demo-world-multi-operation": "607856bb40576d7d552c12aa3ca509f4e0c160b6726cc086c1a7b822c58b06b8",
    "edge-empty-projection": "cb21959cfde2a53d03ce62d29798061a30ae3e8d21b8721bab1b3475e26037f4",
  },
  planProjectionDigests: {
    "demo-world-baseline": "f5290f42655e4f0c0e5767a8355600c798713e29253b46b2ca0bcf45df7e23d9",
    "demo-world-multi-operation": "9f5ce19f2891c81bf4aa5cc7b216f94cd777acac8e17284f811f34d14f7f7500",
    "edge-empty-projection": "cb0cae9911e23438bccb9b9f6811381f250f6e038ebe061aee04b745c4855540",
  },
} as const;

/** The pinned-golden lookup (typed for dynamic case ids). */
const PINNED_STATE_IDS: Readonly<Record<string, string>> = PINNED.stateIds;
const PINNED_PLAN_DIGESTS: Readonly<Record<string, string>> = PINNED.planProjectionDigests;

describe("the visual corpus (pinned fixtures)", () => {
  test("the demo world replay is deterministic and pins the version bytes", () => {
    const first = replayDemoWorld();
    const second = replayDemoWorld();
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
    expect(sha256Hex(canonicalJsonStringify(first))).toBe(PINNED.demoVersionDigest);
  });

  test("the three corpus cases pin their state identities and projection digests", () => {
    const corpus = buildVisualCorpus();
    for (const corpusCase of corpus) {
      expect(corpusCase.request.state.stateId).toBe(PINNED_STATE_IDS[corpusCase.caseId] ?? "missing-pin");
      const planDigest = canonicalProjectionDigestOf(corpusCase.request.canonicalProjections.plan);
      expect(planDigest).toBe(PINNED_PLAN_DIGESTS[corpusCase.caseId] ?? "missing-pin");
    }
  });

  test("every corpus request validates through the lane's request gate", () => {
    for (const corpusCase of buildVisualCorpus()) {
      expect(validateVisualStateRequest(corpusCase.request).ok).toBe(true);
    }
  });

  test("the corpus view is the solution workspace default (azimuth 30°, elevation 36°)", () => {
    expect(CORPUS_VIEW.azimuthRad).toBeCloseTo(Math.PI / 6, 15);
    expect(CORPUS_VIEW.elevationRad).toBeCloseTo(Math.PI / 5, 15);
  });

  test("the demo intent sequence is the contract corpus's canonical trio (by reference)", () => {
    const intents = wallUpgradeIntents();
    expect(intents.map((intent) => intent.operationType)).toEqual([
      "demolition-removal",
      "block-wall-placement",
      "plaster-application",
    ]);
    expect(intents.map((intent) => intent.intentId)).toEqual([
      "intent-demo-0010",
      "intent-demo-0011",
      "intent-demo-0012",
    ]);
  });

  test("the edge world: one standalone intent, an empty observed scene, empty projections", () => {
    const version = replayEdgeWorld();
    expect(version.operations.length).toBe(1);
    expect(edgeStandaloneIntent().operationType).toBe("block-wall-placement");
    const request = visualRequestForState(version, version.states.length - 1, [], "context-sketch");
    expect(request.canonicalProjections.plan.shapes).toEqual([]);
    expect(request.canonicalProjections.axonometric.shapes).toEqual([]);
    const omitted = request.canonicalProjections.plan.omissions[0];
    expect(omitted?.reason).toBe("overlay-anchor-unresolved");
    expect(omitted?.nodeId).toBe(version.operations[0]?.operationId);
  });

  test("the demo scene mirror: four observed elements with world-metre polygons", () => {
    const elements = demoObservedSceneElements();
    expect(elements.map((element) => element.elementId)).toEqual([
      "node-wall-002",
      "geo-wall-line-003",
      "node-slab-003",
      "node-site-001",
    ]);
    for (const element of elements) {
      expect(element.polygons.length).toBeGreaterThan(0);
      for (const polygon of element.polygons) {
        expect(polygon.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("the demo baseline geometry table mirrors the engine's committed fixture", () => {
    expect(demoBaselineGeometryTable()).toEqual({
      "geo-wall-faces-002": { value: 12.5, unit: "m2" },
      "geo-wall-line-003": { value: 5, unit: "m2" },
      "geo-slab-region-005": { value: 12, unit: "m2" },
      "geo-pit-outline-001": { value: 6, unit: "m2" },
    });
  });

  test("the multi-operation case draws MORE canonical shapes than the baseline (the drill discriminates)", () => {
    const corpus = buildVisualCorpus();
    const baseline = corpus.find((entry) => entry.caseId === "demo-world-baseline");
    const multiOp = corpus.find((entry) => entry.caseId === "demo-world-multi-operation");
    if (baseline === undefined || multiOp === undefined) {
      throw new Error("the corpus is missing a mandated case");
    }
    expect(
      multiOp.request.canonicalProjections.plan.shapes.length,
    ).toBeGreaterThan(baseline.request.canonicalProjections.plan.shapes.length);
  });
});
