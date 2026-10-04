/**
 * WORLD-P1 tests — the CAPTURE family: CAPTURE → SPATIALIZE →
 * REGISTER (`src/capture/`).
 *
 * Proves the typed contract works WITHOUT any substrate (no
 * reconstruction engine, no SLAM, no Cesium): the committed fixture
 * session spatializes deterministically; the honest omissions are
 * visible; registration reuses the anchoring vocabulary verbatim and
 * fails closed; the fail-closed drills cover every gate; the property
 * corpus checks the invariants over generated sessions.
 */

import { describe, expect, test } from "bun:test";
import {
  CAPTURE_REGISTRATION_STATES,
  isCaptureRegistrationState,
  isCaptureSpatializableMediaType,
  type CaptureSpatializationRequest,
} from "./contract";
import { spatializeCaptureSession } from "./spatialize";
import {
  MIN_REGISTRATION_HYPOTHESES,
  registerCaptureFragment,
} from "./register";
import {
  FIXTURE_CAPTURE_SESSION,
  FIXTURE_FRAGMENT,
  FIXTURE_REGISTRATION,
  FIXTURE_REGISTRATION_REQUEST,
  FIXTURE_SITE_FRAME,
  FIXTURE_SPATIALIZED_AT,
  FIXTURE_STILL_001_CONTENT_ID,
  FIXTURE_VOICE_001_CONTENT_ID,
  FIXTURE_FOREIGN_CONTENT_ID,
  fixtureContentIdOf,
} from "../fixtures";
import { LAYER1_LANE_STATEMENT } from "../lane";
import type { CaptureSessionEnvelope } from "@aise/shared-contracts";

function envelopeVariant(
  mutate: (envelope: CaptureSessionEnvelope) => CaptureSessionEnvelope,
): CaptureSpatializationRequest {
  return {
    envelope: mutate(FIXTURE_CAPTURE_SESSION),
    siteFrame: FIXTURE_SITE_FRAME,
    declaredAt: FIXTURE_SPATIALIZED_AT,
  };
}

/* ------------------------------------------------------------------ */
/* The lane statement + vocabularies                                    */
/* ------------------------------------------------------------------ */

describe("capture family — vocabularies", () => {
  test("the lane statement names the eight stages and the world-not-records law", () => {
    expect(LAYER1_LANE_STATEMENT).toContain("CAPTURE → SPATIALIZE → REGISTER");
    expect(LAYER1_LANE_STATEMENT).toContain("not a table of records");
    expect(LAYER1_LANE_STATEMENT).toContain("INFERRED");
  });

  test("the registration-state vocabulary is closed and extends the anchoring outcomes with the pre-state", () => {
    expect(CAPTURE_REGISTRATION_STATES).toEqual([
      "unregistered",
      "site-registered",
      "partially-registered",
      "registration-refused",
    ]);
    for (const state of CAPTURE_REGISTRATION_STATES) {
      expect(isCaptureRegistrationState(state)).toBe(true);
    }
    expect(isCaptureRegistrationState("anchored")).toBe(false); // anchoring vocab, not ours
  });

  test("the spatializable media-type vocabulary is closed", () => {
    expect(isCaptureSpatializableMediaType("image/jpeg")).toBe(true);
    expect(isCaptureSpatializableMediaType("image/png")).toBe(true);
    expect(isCaptureSpatializableMediaType("video/mp4")).toBe(true);
    expect(isCaptureSpatializableMediaType("audio/ogg")).toBe(false);
    expect(isCaptureSpatializableMediaType("application/pdf")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* SPATIALIZE — the committed fixture                                   */
/* ------------------------------------------------------------------ */

describe("spatialize — the committed fixture", () => {
  test("the fixture session spatializes: 3 spatializable assets, 1 visible omission", () => {
    const fragment = FIXTURE_FRAGMENT;
    expect(fragment.assets).toHaveLength(3);
    expect(fragment.omissions).toHaveLength(1);
    expect(fragment.omissions[0]!.reason).toBe("media-type-not-spatializable");
    expect(fragment.omissions[0]!.evidenceContentId).toBe(FIXTURE_VOICE_001_CONTENT_ID);
    expect(fragment.registrationState).toBe("unregistered");
  });

  test("the fragment id is the canonical content digest (deterministic identity)", () => {
    const again = spatializeCaptureSession({
      envelope: FIXTURE_CAPTURE_SESSION,
      siteFrame: FIXTURE_SITE_FRAME,
      declaredAt: FIXTURE_SPATIALIZED_AT,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.fragmentId).toBe(FIXTURE_FRAGMENT.fragmentId);
      expect(again.value.fragmentId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("declared poses are carried verbatim; coverage unions the declared volumes exactly", () => {
    const fragment = FIXTURE_FRAGMENT;
    expect(fragment.assets[0]!.declaredPose).toEqual([0, 0, 2]);
    expect(fragment.assets[1]!.declaredPose).toEqual([10, 0, 2]);
    expect(fragment.assets[2]!.declaredPose).toEqual([5, 8, 2]);
    expect(fragment.coverage.coveredBounds).toEqual({
      min: [-4, -4, 0],
      max: [14, 12, 6],
    });
    expect(fragment.coverage.contributingAssets).toBe(3);
    expect(fragment.coverage.bases).toEqual(["device-fov-declared"]);
    expect(fragment.coverage.limitations).toEqual([]);
  });

  test("the derivation binds the evidence chain and the declared instant", () => {
    const derivation = FIXTURE_FRAGMENT.derivation;
    expect(derivation.method).toBe("spatialization.capture-session");
    expect(derivation.createdAt).toBe(FIXTURE_SPATIALIZED_AT);
    expect(derivation.inputEvidenceContentIds).toHaveLength(4);
    expect(derivation.outputContentId).toBe(FIXTURE_FRAGMENT.fragmentId);
  });

  test("the evidence chain carries EVERY session asset (omitted included — evidence, not spatial input)", () => {
    expect(FIXTURE_FRAGMENT.evidenceContentIds).toContain(FIXTURE_VOICE_001_CONTENT_ID);
    expect(FIXTURE_FRAGMENT.evidenceContentIds).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------ */
/* SPATIALIZE — honest handling of absent declarations                  */
/* ------------------------------------------------------------------ */

describe("spatialize — honest absent declarations", () => {
  test("an asset without pose keys is carried UNPLACED (never guessed)", () => {
    const request = envelopeVariant((envelope) => ({
      ...envelope,
      assets: [
        {
          ...envelope.assets[0]!,
          acquisitionMetadata: { "capture.kind": "still" }, // no pose keys
        },
      ],
    }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.assets[0]!.declaredPose).toBeNull();
      expect(outcome.value.coverage.limitations.some((l) => l.includes("declared no pose"))).toBe(
        true,
      );
    }
  });

  test("an asset without volume keys contributes NO coverage (a limitation, not a fabricated bound)", () => {
    const request = envelopeVariant((envelope) => ({
      ...envelope,
      assets: [
        {
          ...envelope.assets[0]!,
          acquisitionMetadata: {
            "layer1.pose.x.m": "1",
            "layer1.pose.y.m": "1",
            "layer1.pose.z.m": "1",
            // no volume keys
          },
        },
      ],
    }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.assets[0]!.declaredVolume).toBeNull();
      expect(outcome.value.coverage.coveredBounds).toBeNull();
      expect(outcome.value.coverage.contributingAssets).toBe(0);
      expect(
        outcome.value.coverage.limitations.includes(
          "no asset declared a capture volume — coverage is UNDECLARED, not empty",
        ),
      ).toBe(true);
    }
  });

  test("unparseable pose metadata omits the asset with the typed reason (garbage is not trusted)", () => {
    const request = envelopeVariant((envelope) => ({
      ...envelope,
      assets: [
        {
          ...envelope.assets[0]!,
          acquisitionMetadata: {
            "layer1.pose.x.m": "not-a-number",
            "layer1.pose.y.m": "1",
            "layer1.pose.z.m": "1",
          },
        },
      ],
    }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.assets).toHaveLength(0);
      expect(outcome.value.omissions).toHaveLength(1);
      expect(outcome.value.omissions[0]!.reason).toBe("pose-metadata-unparseable");
    }
  });

  test("an inverted declared volume is malformed (min > max refuses the volume)", () => {
    const request = envelopeVariant((envelope) => ({
      ...envelope,
      assets: [
        {
          ...envelope.assets[0]!,
          acquisitionMetadata: {
            "layer1.pose.x.m": "1",
            "layer1.pose.y.m": "1",
            "layer1.pose.z.m": "1",
            "layer1.volume.min.x.m": "5",
            "layer1.volume.min.y.m": "0",
            "layer1.volume.min.z.m": "0",
            "layer1.volume.max.x.m": "1",
            "layer1.volume.max.y.m": "4",
            "layer1.volume.max.z.m": "6",
          },
        },
      ],
    }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.omissions[0]!.reason).toBe("pose-metadata-unparseable");
    }
  });
});

/* ------------------------------------------------------------------ */
/* SPATIALIZE — fail-closed drills                                      */
/* ------------------------------------------------------------------ */

describe("spatialize — fail-closed drills", () => {
  test("a non-ISO declared instant refuses (contract-mismatch)", () => {
    const outcome = spatializeCaptureSession({
      envelope: FIXTURE_CAPTURE_SESSION,
      siteFrame: FIXTURE_SITE_FRAME,
      declaredAt: "2026-10-02 09:05:00",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.port).toBe("layer1.capture.spatialize");
    }
  });

  test("an asset with a non-64-hex content id refuses (the Evidence identity shape)", () => {
    const request = envelopeVariant((envelope) => ({
      ...envelope,
      assets: [
        {
          ...envelope.assets[0]!,
          contentId: "not-a-content-id",
        },
      ],
    }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("64-hex");
    }
  });

  test("a duplicate asset content id refuses (idempotent identity discipline)", () => {
    const request = envelopeVariant((envelope) => ({
      ...envelope,
      assets: [envelope.assets[0]!, envelope.assets[0]!],
    }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("duplicate");
    }
  });

  test("an empty capture session refuses (an empty fragment would fabricate a world)", () => {
    const request = envelopeVariant((envelope) => ({ ...envelope, assets: [] }));
    const outcome = spatializeCaptureSession(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("no assets");
    }
  });

  test("a substrate-shaped session id refuses (identity quarantine at the seam)", () => {
    const requests: CaptureSpatializationRequest[] = [
      envelopeVariant((envelope) => ({ ...envelope, sessionId: "2hNGeMV3v5xeJ$OTEbSO6r" })), // ifc-guid shape
      envelopeVariant((envelope) => ({ ...envelope, sessionId: "node:12" })), // gltf ref shape
      envelopeVariant((envelope) => ({ ...envelope, sessionId: "/World/walls" })), // usd prim path
    ];
    for (const request of requests) {
      const outcome = spatializeCaptureSession(request);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.failure.kind).toBe("contract-mismatch");
        expect(outcome.failure.detail).toContain("identity quarantine");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* REGISTER — the committed fixture                                     */
/* ------------------------------------------------------------------ */

describe("register — the committed fixture", () => {
  test("two admissible hypotheses anchor the fragment (outcome vocabulary verbatim)", () => {
    const result = FIXTURE_REGISTRATION;
    expect(result.outcome).toBe("anchored");
    expect(result.registrationState).toBe("site-registered");
    expect(result.echoFailures).toEqual([]);
    expect(result.fragment.registrationState).toBe("site-registered");
  });

  test("the established georeference preserves the ADMITTED hypotheses verbatim (P0-A law)", () => {
    const georeference = FIXTURE_REGISTRATION.georeference;
    expect(georeference).not.toBeNull();
    expect(georeference!.anchor).toEqual({
      latitudeDeg: 47.3769,
      longitudeDeg: 8.5417,
      heightM: 408,
    });
    expect(georeference!.accuracyMetres).toBe(0.5);
    expect(georeference!.derivedFrom).toHaveLength(2);
    expect(georeference!.derivedFrom[0]!.evidenceContentId).toBe(FIXTURE_STILL_001_CONTENT_ID);
  });

  test("re-registering a registered fragment refuses (the stage machine)", () => {
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      fragment: FIXTURE_REGISTRATION.fragment,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("re-registration");
    }
  });
});

/* ------------------------------------------------------------------ */
/* REGISTER — fail-closed + partial drills                              */
/* ------------------------------------------------------------------ */

describe("register — fail-closed + partial drills", () => {
  test("insufficient hypotheses REFUSE the whole registration (zero fabricated georeferences)", () => {
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      hypotheses: [FIXTURE_REGISTRATION_REQUEST.hypotheses[0]!],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe("refused");
      expect(outcome.value.registrationState).toBe("registration-refused");
      expect(outcome.value.georeference).toBeNull();
      expect(outcome.value.reason).toContain("insufficient-stills");
      expect(outcome.value.fragment.registrationState).toBe("registration-refused");
    }
  });

  test("zero hypotheses refuse (fail-closed, not an empty success)", () => {
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      hypotheses: [],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe("refused");
      expect(outcome.value.georeference).toBeNull();
    }
    expect(MIN_REGISTRATION_HYPOTHESES).toBe(2);
  });

  test("a hypothesis naming FOREIGN evidence is an echo failure → PARTIAL (typed, honest)", () => {
    const foreignHypothesis = {
      ...FIXTURE_REGISTRATION_REQUEST.hypotheses[0]!,
      evidenceContentId: FIXTURE_FOREIGN_CONTENT_ID,
    };
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      hypotheses: [
        FIXTURE_REGISTRATION_REQUEST.hypotheses[0]!,
        FIXTURE_REGISTRATION_REQUEST.hypotheses[1]!,
        foreignHypothesis,
      ],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe("partial");
      expect(outcome.value.registrationState).toBe("partially-registered");
      expect(outcome.value.echoFailures).toHaveLength(1);
      expect(outcome.value.echoFailures[0]!.evidenceContentId).toBe(FIXTURE_FOREIGN_CONTENT_ID);
      expect(outcome.value.echoFailures[0]!.reason).toContain("echo-failure");
      // the georeference carries ONLY the admitted hypotheses
      expect(outcome.value.georeference!.derivedFrom).toHaveLength(2);
    }
  });

  test("a zero-inlier hypothesis carries no admissible signal (per-hypothesis refusal)", () => {
    const zeroInlier = {
      ...FIXTURE_REGISTRATION_REQUEST.hypotheses[0]!,
      inlierCount: 0,
    };
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      hypotheses: [zeroInlier, FIXTURE_REGISTRATION_REQUEST.hypotheses[1]!],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // only ONE admissible remains → insufficient → refused
      expect(outcome.value.outcome).toBe("refused");
      expect(outcome.value.echoFailures[0]!.reason).toContain("zero-inlier");
    }
  });

  test("an uncertainty-budget-violating hypothesis is refused per-hypothesis", () => {
    const violating = {
      ...FIXTURE_REGISTRATION_REQUEST.hypotheses[0]!,
      uncertainty: {
        floorRmsM: 0.02,
        budget95M: 0.01, // budget < floor — violates the anchoring law
        basis: "violating-fixture",
      },
    };
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      hypotheses: [violating, FIXTURE_REGISTRATION_REQUEST.hypotheses[1]!],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe("refused");
      expect(outcome.value.echoFailures[0]!.reason).toContain("uncertainty-budget");
    }
  });

  test("a non-positive declared accuracy refuses (contract-mismatch)", () => {
    const outcome = registerCaptureFragment({
      ...FIXTURE_REGISTRATION_REQUEST,
      declaredAccuracyMetres: 0,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Properties over generated sessions                                   */
/* ------------------------------------------------------------------ */

describe("spatialize — properties over generated sessions", () => {
  function generatedSession(
    assetCount: number,
    poseSeeds: readonly [number, number, number][],
  ): CaptureSessionEnvelope {
    return {
      ...FIXTURE_CAPTURE_SESSION,
      assets: poseSeeds.slice(0, assetCount).map((pose, index) => ({
        ...FIXTURE_CAPTURE_SESSION.assets[0]!,
        contentId: fixtureContentIdOf(`generated-asset-${index}`),
        acquisitionMetadata: {
          "layer1.pose.x.m": String(pose[0]),
          "layer1.pose.y.m": String(pose[1]),
          "layer1.pose.z.m": String(pose[2]),
          "layer1.volume.min.x.m": String(pose[0] - 1),
          "layer1.volume.min.y.m": String(pose[1] - 1),
          "layer1.volume.min.z.m": String(pose[2] - 1),
          "layer1.volume.max.x.m": String(pose[0] + 1),
          "layer1.volume.max.y.m": String(pose[1] + 1),
          "layer1.volume.max.z.m": String(pose[2] + 1),
          "layer1.volume.basis": "generated-fixture",
        },
      })),
    };
  }

  test("determinism: the same generated session digests identically across 5 invocations", () => {
    const session = generatedSession(
      3,
      [
        [0, 0, 0],
        [5, 5, 5],
        [-3, 2, 7],
      ],
    );
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const outcome = spatializeCaptureSession({
        envelope: session,
        siteFrame: FIXTURE_SITE_FRAME,
        declaredAt: FIXTURE_SPATIALIZED_AT,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) ids.add(outcome.value.fragmentId);
    }
    expect(ids.size).toBe(1);
  });

  test("coverage union is exact for integer declared volumes (property over 8 generated sessions)", () => {
    for (let n = 1; n <= 8; n++) {
      const poses: [number, number, number][] = [];
      for (let i = 0; i < n; i++) {
        poses.push([i * 2, i * 3, 0]);
      }
      const outcome = spatializeCaptureSession({
        envelope: generatedSession(n, poses),
        siteFrame: FIXTURE_SITE_FRAME,
        declaredAt: FIXTURE_SPATIALIZED_AT,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        const bounds = outcome.value.coverage.coveredBounds!;
        // union of [p-1, p+1] boxes over poses [2i, 3i, 0]
        expect(bounds.min[0]).toBe(-1);
        expect(bounds.max[0]).toBe((n - 1) * 2 + 1);
        expect(bounds.min[1]).toBe(-1);
        expect(bounds.max[1]).toBe((n - 1) * 3 + 1);
        expect(bounds.min[2]).toBe(-1);
        expect(bounds.max[2]).toBe(1);
      }
    }
  });

  test("omissions are ALWAYS visible: a mixed session reports every non-spatial asset", () => {
    const session: CaptureSessionEnvelope = {
      ...FIXTURE_CAPTURE_SESSION,
      assets: [
        ...FIXTURE_CAPTURE_SESSION.assets,
        {
          ...FIXTURE_CAPTURE_SESSION.assets[0]!,
          contentId: fixtureContentIdOf("pdf-asset"),
          mediaType: "application/pdf",
        },
      ],
    };
    const outcome = spatializeCaptureSession({
      envelope: session,
      siteFrame: FIXTURE_SITE_FRAME,
      declaredAt: FIXTURE_SPATIALIZED_AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.assets).toHaveLength(3);
      expect(outcome.value.omissions).toHaveLength(2);
      expect(outcome.value.omissions.map((o) => o.mediaType).sort()).toEqual([
        "application/pdf",
        "audio/ogg",
      ]);
    }
  });
});
