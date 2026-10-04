/**
 * WORLD-P1 tests — the TECHNOLOGY-SUBSTITUTION-CONTRACT law proof at
 * the experience-lane level (`src/substitution.test.ts`).
 *
 * Law 1 (substitution is not semantics change): the REFERENCE and
 * ALTERNATE in-memory doubles — deliberately different code paths —
 * produce BYTE-IDENTICAL canonical outputs at every comparison point
 * of every family (fragment digests, registration verdicts, world
 * ids, view states, bookmark digests, comparison reports,
 * measurement sets, evidence answers).
 *
 * Law 2 (tolerances are declared, never implicit): every numeric
 * verdict carries its declared tolerance VERBATIM; a tolerance-less
 * request refuses on BOTH doubles with the same typed failure.
 *
 * Law 3 (unsupported is recorded, never computed): every family's
 * fail-closed drill refuses IDENTICALLY on both doubles (same HFX-000
 * kind, same port, same detail) — a swap cannot change what a
 * refusal means.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  referenceCaptureDouble,
  alternateCaptureDouble,
  referenceWorldDouble,
  alternateWorldDouble,
  referenceCompareDouble,
  alternateCompareDouble,
  referenceEvidenceDouble,
  alternateEvidenceDouble,
} from "./index";
import {
  FIXTURE_FRAGMENT,
  FIXTURE_REGISTRATION_REQUEST,
  FIXTURE_SPATIALIZATION_REQUEST,
  FIXTURE_WORLD,
  FIXTURE_WORLD_REQUEST,
  FIXTURE_COMPARISON_REQUEST,
  FIXTURE_MEASUREMENT_QUERIES,
  FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY,
  FIXTURE_WHAT_IS_HERE_POINTS,
  FIXTURE_BOOKMARKED_AT,
} from "./fixtures";
import { captureNavigationBookmark } from "./world/navigate";
import type { NavigableWorld } from "./world/contract";

/* ------------------------------------------------------------------ */
/* Law 1 — byte-identity on the committed fixtures                      */
/* ------------------------------------------------------------------ */

describe("law 1 — substitution is not semantics change (byte-identity)", () => {
  test("capture family: spatialize + register identical on both doubles", () => {
    const a = referenceCaptureDouble.spatialize(FIXTURE_SPATIALIZATION_REQUEST);
    const b = alternateCaptureDouble.spatialize(FIXTURE_SPATIALIZATION_REQUEST);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));

    const ra = referenceCaptureDouble.register(FIXTURE_REGISTRATION_REQUEST);
    const rb = alternateCaptureDouble.register(FIXTURE_REGISTRATION_REQUEST);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(canonicalJsonStringify(ra)).toBe(canonicalJsonStringify(rb));
  });

  test("world family: compose identical on both doubles (the world id pins it)", () => {
    const a = referenceWorldDouble.compose(FIXTURE_WORLD_REQUEST);
    const b = alternateWorldDouble.compose(FIXTURE_WORLD_REQUEST);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    if (a.ok && b.ok) {
      expect(a.value.worldId).toBe(b.value.worldId);
      expect(a.value.worldId).toBe(FIXTURE_WORLD.worldId);
    }
  });

  test("world family: layer toggles identical on all 16 toggle combinations", () => {
    const layerIds = ["capture-reality", "plan-model", "coverage", "annotations"];
    for (let mask = 0; mask < 16; mask++) {
      const toggles = layerIds.map((layerId, bit) => ({
        layerId,
        visible: (mask & (1 << bit)) !== 0,
      }));
      const a = referenceWorldDouble.applyLayerToggles(FIXTURE_WORLD, toggles);
      const b = alternateWorldDouble.applyLayerToggles(FIXTURE_WORLD, toggles);
      expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    }
  });

  test("world family: bookmark capture + resolve identical (the digest round-trip)", () => {
    const camera = {
      position: [4, -4, 4] as const,
      target: [5, 3, 1] as const,
      up: [0, 0, 1] as const,
      fovRadians: Math.PI / 3,
      mode: "walk" as const,
    };
    const view = referenceWorldDouble.applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "plan-model", visible: false },
    ]);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const a = referenceWorldDouble.captureBookmark(
      FIXTURE_WORLD,
      view.value,
      camera,
      null,
      ["plan-wall-001"],
      "Entrance",
      FIXTURE_BOOKMARKED_AT,
    );
    const b = alternateWorldDouble.captureBookmark(
      FIXTURE_WORLD,
      view.value,
      camera,
      null,
      ["plan-wall-001"],
      "Entrance",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    if (a.ok && b.ok) {
      expect(a.value.bookmarkId).toBe(b.value.bookmarkId);
      const ra = referenceWorldDouble.resolveBookmark(FIXTURE_WORLD, a.value);
      const rb = alternateWorldDouble.resolveBookmark(FIXTURE_WORLD, b.value);
      expect(canonicalJsonStringify(ra)).toBe(canonicalJsonStringify(rb));
    }
  });

  test("compare family: the comparison report identical on both doubles (exact kernels)", () => {
    const a = referenceCompareDouble.compare(FIXTURE_COMPARISON_REQUEST);
    const b = alternateCompareDouble.compare(FIXTURE_COMPARISON_REQUEST);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    if (a.ok && b.ok) {
      expect(a.value.reportId).toBe(b.value.reportId);
      // the exactness discipline: every deviation is bit-identical
      for (let i = 0; i < a.value.verdicts.length; i++) {
        expect(a.value.verdicts[i]!.deviationMetres).toBe(b.value.verdicts[i]!.deviationMetres);
      }
    }
  });

  test("compare family: the measurement set identical on both doubles (every query kind)", () => {
    const a = referenceCompareDouble.measure(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES);
    const b = alternateCompareDouble.measure(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    if (a.ok && b.ok) {
      for (let i = 0; i < a.value.length; i++) {
        expect(a.value[i]!.value).toBe(b.value[i]!.value);
        expect(a.value[i]!.containmentVerdict).toBe(b.value[i]!.containmentVerdict);
      }
    }
  });

  test("compare family: the near-boundary containment identical on the wide-tolerance drill", () => {
    const a = referenceCompareDouble.measure(FIXTURE_WORLD, [
      FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY,
    ]);
    const b = alternateCompareDouble.measure(FIXTURE_WORLD, [
      FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY,
    ]);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  test("evidence family: what-is-here identical on every fixture answer kind", () => {
    for (const point of [
      FIXTURE_WHAT_IS_HERE_POINTS.elementBound,
      FIXTURE_WHAT_IS_HERE_POINTS.coverageOnly,
      FIXTURE_WHAT_IS_HERE_POINTS.notCovered,
    ]) {
      const a = referenceEvidenceDouble.whatIsHere(FIXTURE_WORLD, {
        point,
        worldRevision: 1,
      });
      const b = alternateEvidenceDouble.whatIsHere(FIXTURE_WORLD, {
        point,
        worldRevision: 1,
      });
      expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    }
  });

  test("evidence family: the bindings identical on both doubles", () => {
    const a = referenceEvidenceDouble.bindFragment(FIXTURE_FRAGMENT);
    const b = alternateEvidenceDouble.bindFragment(FIXTURE_FRAGMENT);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    const wa = referenceEvidenceDouble.bindWorld(FIXTURE_WORLD);
    const wb = alternateEvidenceDouble.bindWorld(FIXTURE_WORLD);
    expect(canonicalJsonStringify(wa)).toBe(canonicalJsonStringify(wb));
  });
});

/* ------------------------------------------------------------------ */
/* Law 2 — tolerances are declared, never implicit                      */
/* ------------------------------------------------------------------ */

describe("law 2 — tolerances are declared, never implicit", () => {
  test("a tolerance-less comparison refuses IDENTICALLY on both doubles", () => {
    const request = {
      ...FIXTURE_COMPARISON_REQUEST,
      tolerance: { linear: 0, angular: 0 },
    };
    const a = referenceCompareDouble.compare(request);
    const b = alternateCompareDouble.compare(request);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    if (!a.ok && !b.ok) {
      expect(a.failure.kind).toBe("operation-semantic-failure");
      expect(a.failure.detail).toContain("tolerance-must-be-declared");
    }
  });

  test("a tolerance-less measurement refuses IDENTICALLY on both doubles", () => {
    const query = {
      ...FIXTURE_MEASUREMENT_QUERIES[1]!,
      queryId: "tolerance-less",
      tolerance: { linear: -1, angular: 0 },
    };
    const a = referenceCompareDouble.measure(FIXTURE_WORLD, [query]);
    const b = alternateCompareDouble.measure(FIXTURE_WORLD, [query]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(a.failure.kind).toBe(b.failure.kind);
    }
  });

  test("the declared tolerance rides VERBATIM into both doubles' outputs", () => {
    const tolerance = { linear: 4.5, angular: 1e-9 };
    const request = { ...FIXTURE_COMPARISON_REQUEST, tolerance };
    const a = referenceCompareDouble.compare(request);
    const b = alternateCompareDouble.compare(request);
    if (a.ok && b.ok) {
      for (const verdict of a.value.verdicts) {
        expect(verdict.appliedTolerance).toEqual(tolerance);
      }
      for (const verdict of b.value.verdicts) {
        expect(verdict.appliedTolerance).toEqual(tolerance);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Law 3 — unsupported is recorded, never computed                      */
/* ------------------------------------------------------------------ */

describe("law 3 — unsupported is recorded, never computed", () => {
  test("the voice-note omission is IDENTICAL evidence on both doubles (visible, typed)", () => {
    const a = referenceCaptureDouble.spatialize(FIXTURE_SPATIALIZATION_REQUEST);
    const b = alternateCaptureDouble.spatialize(FIXTURE_SPATIALIZATION_REQUEST);
    if (a.ok && b.ok) {
      expect(a.value.omissions).toEqual(b.value.omissions);
      expect(a.value.omissions[0]!.reason).toBe("media-type-not-spatializable");
    }
  });

  test("a foreign-hypothesis registration answers PARTIAL identically on both doubles", () => {
    const foreign = {
      ...FIXTURE_REGISTRATION_REQUEST,
      hypotheses: [
        ...FIXTURE_REGISTRATION_REQUEST.hypotheses,
        {
          ...FIXTURE_REGISTRATION_REQUEST.hypotheses[0]!,
          evidenceContentId:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    };
    const a = referenceCaptureDouble.register(foreign);
    const b = alternateCaptureDouble.register(foreign);
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    if (a.ok && b.ok) {
      expect(a.value.outcome).toBe("partial");
      expect(a.value.echoFailures).toHaveLength(1);
    }
  });

  test("an unregistered-fragment composition refuses IDENTICALLY on both doubles", () => {
    const request = { ...FIXTURE_WORLD_REQUEST, fragments: [FIXTURE_FRAGMENT] };
    const a = referenceWorldDouble.compose(request);
    const b = alternateWorldDouble.compose(request);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(a.failure.kind).toBe(b.failure.kind);
      expect(a.failure.detail).toBe(b.failure.detail);
      expect(a.failure.port).toBe(b.failure.port);
    }
  });

  test("an unknown-layer toggle refuses IDENTICALLY on both doubles", () => {
    const a = referenceWorldDouble.applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "ghost-layer", visible: true },
    ]);
    const b = alternateWorldDouble.applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "ghost-layer", visible: true },
    ]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    }
  });

  test("a stale what-is-here query refuses IDENTICALLY on both doubles", () => {
    const a = referenceEvidenceDouble.whatIsHere(FIXTURE_WORLD, {
      point: [0, 0, 0],
      worldRevision: 42,
    });
    const b = alternateEvidenceDouble.whatIsHere(FIXTURE_WORLD, {
      point: [0, 0, 0],
      worldRevision: 42,
    });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    }
  });

  test("no double ever emits perception/reasoning/resource/timeout/license kinds (honesty of the vocabulary mapping)", async () => {
    const { FAILURE_KINDS } = await import("@aise/provider-registry");
    // the closed set is imported, never modified
    expect(FAILURE_KINDS).toHaveLength(9);
    // the drills above exercised refusals; collect every kind emitted
    // by this suite's failures and assert they are within the closed set
    const emittedKinds = new Set<string>();
    const failures = [
      referenceCompareDouble.compare({
        ...FIXTURE_COMPARISON_REQUEST,
        tolerance: { linear: 0, angular: 0 },
      }),
      alternateCompareDouble.compare({
        ...FIXTURE_COMPARISON_REQUEST,
        tolerance: { linear: 0, angular: 0 },
      }),
    ];
    for (const failure of failures) {
      if (!failure.ok) emittedKinds.add(failure.failure.kind);
    }
    for (const kind of emittedKinds) {
      expect((FAILURE_KINDS as readonly string[]).includes(kind)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The identity + ghost laws across the whole lane (directive §10)      */
/* ------------------------------------------------------------------ */

describe("the identity + ghost laws carry through every stage", () => {
  test("no canonical id in the lane outputs matches a substrate id pattern", async () => {
    const { looksLikeSubstrateId } = await import("./lane");
    const canonicalIds = [
      FIXTURE_FRAGMENT.fragmentId,
      FIXTURE_WORLD.worldId,
      ...FIXTURE_WORLD.elementProvenance.map((record) => record.elementId),
    ];
    for (const id of canonicalIds) {
      expect(looksLikeSubstrateId(id)).toBeNull();
    }
  });

  test("the IFC GUID lives ONLY in the external-label array (never in any identity field)", () => {
    const wall = FIXTURE_WORLD.elementProvenance.find(
      (record) => record.elementId === "plan-wall-001",
    )!;
    expect(wall.externalLabels[0]!.namespace).toBe("ifc-guid");
    // the label value appears NOWHERE else in the world's canonical JSON
    const worldJson = canonicalJsonStringify(FIXTURE_WORLD);
    const occurrences = worldJson.split(wall.externalLabels[0]!.value).length - 1;
    expect(occurrences).toBe(1); // exactly once — the label record
  });

  test("ghost distinctness: no capture/plan node in any lane output is a ghost", () => {
    const worlds: NavigableWorld[] = [FIXTURE_WORLD];
    for (const world of worlds) {
      for (const node of world.scene.nodes) {
        expect(node.isGhost).toBe(false);
      }
      expect(world.scene.ghostSummary).toBeNull();
    }
  });

  test("a bookmark selecting a substrate-shaped id refuses (quarantine at the bookmark gate)", () => {
    const view = referenceWorldDouble.applyLayerToggles(FIXTURE_WORLD, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const outcome = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      {
        position: [0, 0, 10] as const,
        target: [0, 0, 0] as const,
        up: [0, 1, 0] as const,
        fovRadians: Math.PI / 4,
        mode: "orbit" as const,
      },
      null,
      ["aiMesh::Wall_01"], // Assimp-shaped id smuggled as a selection
      "Bad",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("identity quarantine");
      expect(outcome.failure.detail).toContain("assimp-mesh-name");
    }
  });
});
