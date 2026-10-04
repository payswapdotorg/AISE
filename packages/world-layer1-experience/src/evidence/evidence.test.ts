/**
 * WORLD-P1 tests — the EVIDENCE family (`src/evidence/`).
 *
 * Proves every lane output binds to the Evidence Envelope through the
 * EXISTING shared-contracts seam types (decoded through the shared
 * WIRE CODECS — the P0-B mapping-block discipline), capture-derived
 * facts enter as INFERRED, and the "what is actually here?" /
 * "what changed?" queries answer honestly (never fabricated
 * presence/absence, never a bare substrate read).
 */

import { describe, expect, test } from "bun:test";
import {
  bindComparisonEvidence,
  bindFragmentEvidence,
  bindMeasurementEvidence,
  bindWorldEvidence,
} from "./bind";
import { queryWhatChanged, queryWhatIsHere } from "./queries";
import {
  WHAT_IS_HERE_ANSWER_KINDS,
  ELEMENT_CHANGE_KINDS,
  isWhatIsHereAnswerKind,
} from "./contract";
import {
  FIXTURE_FRAGMENT,
  FIXTURE_COMPARISON_REQUEST,
  FIXTURE_MEASUREMENT_QUERIES,
  FIXTURE_MEASURED_AT,
  FIXTURE_STILL_001_CONTENT_ID,
  FIXTURE_VOICE_001_CONTENT_ID,
  FIXTURE_WHAT_IS_HERE_POINTS,
  FIXTURE_WORLD,
  FIXTURE_WORLD_REVISION_2,
} from "../fixtures";
import { compareModelToCapture } from "../compare/compare";
import { runMeasurementQueries } from "../compare/measure";
import {
  decodeDerivationStrict,
  decodeProvenanceLinkStrict,
  type ProvenanceLink,
} from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* The envelope bindings (wire-codec-proven — the seam types are real)   */
/* ------------------------------------------------------------------ */

describe("evidence — the envelope bindings", () => {
  test("the fragment binding: one DERIVED_FROM link per session asset, wire-codec valid", () => {
    const outcome = bindFragmentEvidence(FIXTURE_FRAGMENT);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const binding = outcome.value;
      expect(binding.subjectKind).toBe("world_fragment");
      expect(binding.subjectId).toBe(FIXTURE_FRAGMENT.fragmentId);
      expect(binding.epistemicStatus).toBe("INFERRED");
      expect(binding.links).toHaveLength(4); // every asset, omitted included
      expect(binding.links[0]!.role).toBe("DERIVED_FROM");
      // EVERY link decodes through the shared ProvenanceLink wire codec
      for (const link of binding.links as ProvenanceLink[]) {
        expect(() => decodeProvenanceLinkStrict(link)).not.toThrow();
      }
      // the derivation decodes through the shared Derivation wire codec
      expect(() => decodeDerivationStrict(binding.derivation)).not.toThrow();
      expect(binding.derivation.method).toBe("spatialization.capture-session");
    }
  });

  test("the world binding: per-element links over the evidence-backed elements", () => {
    const outcome = bindWorldEvidence(FIXTURE_WORLD);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const binding = outcome.value;
      expect(binding.subjectKind).toBe("reality_object");
      // 3 capture (1 evidence each) + 2 plan (1 each) = 5 links
      expect(binding.links).toHaveLength(5);
      expect(binding.derivation.method).toBe("reconstruction.world-compose");
      for (const link of binding.links as ProvenanceLink[]) {
        expect(() => decodeProvenanceLinkStrict(link)).not.toThrow();
      }
    }
  });

  test("the comparison binding: the union of the paired elements' evidence chains", () => {
    const report = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const outcome = bindComparisonEvidence(report.value, FIXTURE_WORLD);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.subjectKind).toBe("comparison_verdict");
      expect(outcome.value.subjectId).toBe(report.value.reportId);
      expect(outcome.value.links.length).toBeGreaterThan(0);
      expect(() => decodeDerivationStrict(outcome.value.derivation)).not.toThrow();
    }
  });

  test("the measurement binding: INFERRED candidates with the declared instant", () => {
    const results = runMeasurementQueries(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES);
    expect(results.ok).toBe(true);
    if (!results.ok) return;
    const outcome = bindMeasurementEvidence(results.value, FIXTURE_MEASURED_AT);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.subjectKind).toBe("measurement");
      expect(outcome.value.derivation.method).toBe("world.measurement");
      expect(outcome.value.derivation.createdAt).toBe(FIXTURE_MEASURED_AT);
      for (const link of outcome.value.links as ProvenanceLink[]) {
        expect(() => decodeProvenanceLinkStrict(link)).not.toThrow();
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* "What is actually here?" — the honest answers                         */
/* ------------------------------------------------------------------ */

describe("evidence — what is actually here?", () => {
  test("element-bound: the point inside a declared capture volume names the element + chains", () => {
    const outcome = queryWhatIsHere(FIXTURE_WORLD, {
      point: FIXTURE_WHAT_IS_HERE_POINTS.elementBound,
      worldRevision: 1,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const result = outcome.value;
      expect(result.answerKind).toBe("element-bound");
      expect(result.elementIds).toHaveLength(1);
      expect(result.epistemicStatus).toBe("INFERRED");
      expect(result.provenance[0]!.evidenceContentIds).toEqual([FIXTURE_STILL_001_CONTENT_ID]);
    }
  });

  test("coverage-only: inside the coverage union, outside every element volume — honest", () => {
    const outcome = queryWhatIsHere(FIXTURE_WORLD, {
      point: FIXTURE_WHAT_IS_HERE_POINTS.coverageOnly,
      worldRevision: 1,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.answerKind).toBe("coverage-only");
      expect(outcome.value.elementIds).toEqual([]);
      expect(outcome.value.provenance).toEqual([]);
    }
  });

  test("not-covered NEVER implies absence (the ANCHOR doctrine, machine-readable)", () => {
    const outcome = queryWhatIsHere(FIXTURE_WORLD, {
      point: FIXTURE_WHAT_IS_HERE_POINTS.notCovered,
      worldRevision: 1,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.answerKind).toBe("not-covered");
      // the vocabulary's honest members are distinct — no "empty" lie
      expect(WHAT_IS_HERE_ANSWER_KINDS).toEqual([
        "element-bound",
        "coverage-only",
        "not-covered",
        "unverifiable",
      ]);
      for (const kind of WHAT_IS_HERE_ANSWER_KINDS) {
        expect(isWhatIsHereAnswerKind(kind)).toBe(true);
      }
      expect(isWhatIsHereAnswerKind("empty")).toBe(false);
    }
  });

  test("a stale query (wrong world revision) refuses — never silently applied", () => {
    const outcome = queryWhatIsHere(FIXTURE_WORLD, {
      point: FIXTURE_WHAT_IS_HERE_POINTS.elementBound,
      worldRevision: 999,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("stale");
    }
  });

  test("a non-finite point refuses", () => {
    const outcome = queryWhatIsHere(FIXTURE_WORLD, {
      point: [Number.NaN, 0, 0],
      worldRevision: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
    }
  });

  test("a world with NO coverage answers unverifiable (never a fabricated absence)", () => {
    // coverage UNDECLARED (null bounds): a point outside every element
    // volume answers unverifiable — no coverage claim exists to consult
    const outcome = queryWhatIsHere(
      {
        ...FIXTURE_WORLD,
        coverage: {
          coveredBounds: null,
          contributingAssets: 0,
          bases: [],
          limitations: ["no asset declared a capture volume"],
        },
      },
      { point: [100, 0, 0], worldRevision: 1 },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.answerKind).toBe("unverifiable");
    }
  });

  test("a plan element's volume is NOT a capture claim: provenance stays capture-only", () => {
    // STRUCTURAL: only capture-origin provenance records carry declared
    // volumes — plan elements carry null (no capture claim), and the
    // derived coverage marker is not an element claim (the query filter).
    const planClaims = FIXTURE_WORLD.elementProvenance.filter(
      (record) => record.origin === "plan" && record.declaredVolume !== null,
    );
    expect(planClaims).toEqual([]);
    // and a point inside the plan wall's region still answers from
    // CAPTURE claims only (here: still-001's volume genuinely covers it)
    const outcome = queryWhatIsHere(FIXTURE_WORLD, {
      point: [2, -2, 1],
      worldRevision: 1,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.answerKind).toBe("element-bound");
      for (const record of outcome.value.provenance) {
        const provenance = FIXTURE_WORLD.elementProvenance.find(
          (candidate) => candidate.elementId === record.elementId,
        )!;
        expect(provenance.origin).toBe("capture");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* "What changed?" — the typed world difference                          */
/* ------------------------------------------------------------------ */

describe("evidence — what changed?", () => {
  test("rev 1 → rev 2: the moved wall, the added column, the unchanged rest", () => {
    const outcome = queryWhatChanged({
      fromWorld: FIXTURE_WORLD,
      toWorld: FIXTURE_WORLD_REVISION_2,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const result = outcome.value;
      const counts = new Map(result.counts.map((c) => [c.changeKind, c.count]));
      expect(counts.get("moved")).toBe(1); // plan-wall-001 moved +2 in x
      expect(counts.get("added")).toBe(1); // plan-column-001 added
      expect(counts.get("removed")).toBe(0);
      expect(counts.get("unchanged")).toBe(5); // 3 capture + slab + coverage node
      expect(ELEMENT_CHANGE_KINDS).toEqual([
        "added",
        "removed",
        "moved",
        "evidence-changed",
        "unchanged",
      ]);
    }
  });

  test("every change record carries both sides' evidence chains (never a bare diff)", () => {
    const outcome = queryWhatChanged({
      fromWorld: FIXTURE_WORLD,
      toWorld: FIXTURE_WORLD_REVISION_2,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const moved = outcome.value.changes.find(
        (change) => change.changeKind === "moved",
      )!;
      expect(moved.elementId).toBe("plan-wall-001");
      expect(moved.fromEvidenceContentIds).toEqual(moved.toEvidenceContentIds);
      const added = outcome.value.changes.find((change) => change.changeKind === "added")!;
      expect(added.fromEvidenceContentIds).toEqual([]);
      expect(added.toEvidenceContentIds.length).toBeGreaterThan(0);
    }
  });

  test("an evidence-chain change classifies evidence-changed (distinct from moved)", () => {
    const outcome = queryWhatChanged({
      fromWorld: FIXTURE_WORLD,
      toWorld: {
        ...FIXTURE_WORLD_REVISION_2,
        elementProvenance: FIXTURE_WORLD_REVISION_2.elementProvenance.map((record) =>
          record.elementId === "plan-slab-001"
            ? { ...record, evidenceContentIds: [FIXTURE_VOICE_001_CONTENT_ID] }
            : record,
        ),
      },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const counts = new Map(outcome.value.counts.map((c) => [c.changeKind, c.count]));
      expect(counts.get("evidence-changed")).toBe(1);
    }
  });

  test("cross-world comparison refuses (a fabricated diff is never produced)", () => {
    const outcome = queryWhatChanged({
      fromWorld: FIXTURE_WORLD,
      toWorld: { ...FIXTURE_WORLD_REVISION_2, worldId: "a-different-world" },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("ONE world");
    }
  });

  test("a backwards revision direction refuses", () => {
    const outcome = queryWhatChanged({
      fromWorld: FIXTURE_WORLD_REVISION_2,
      toWorld: FIXTURE_WORLD,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("greater than");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Binding fail-closed drills                                           */
/* ------------------------------------------------------------------ */

describe("evidence — binding fail-closed drills", () => {
  test("binding a fragment with no evidence refuses (an empty chain is a fabricated chain)", () => {
    const outcome = bindFragmentEvidence({
      ...FIXTURE_FRAGMENT,
      evidenceContentIds: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
    }
  });

  test("binding a world with no evidence-backed elements refuses (retrieval-failure)", () => {
    const outcome = bindWorldEvidence({
      ...FIXTURE_WORLD,
      elementProvenance: FIXTURE_WORLD.elementProvenance.map((record) => ({
        ...record,
        evidenceContentIds: [],
      })),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("retrieval-failure");
      expect(outcome.failure.detail).toContain("empty chain");
    }
  });

  test("binding measurements without a declared instant refuses (no clock reads)", () => {
    const results = runMeasurementQueries(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES);
    expect(results.ok).toBe(true);
    if (!results.ok) return;
    const outcome = bindMeasurementEvidence(results.value, "not-an-instant");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("ISO-8601");
    }
  });

  test("binding measurements with no evidence content ids refuses", () => {
    const evidenceLess = {
      queryId: "q-evidenceless",
      kind: "point" as const,
      quantity: null,
      value: null,
      unit: null,
      position: [0, 0, 0] as const,
      containmentVerdict: null,
      appliedTolerance: { linear: 0.05, angular: 1e-9 },
      units: { linear: "m", angular: "rad" },
      nearBoundary: false,
      evidenceContentIds: [],
      epistemicStatus: "INFERRED" as const,
      method: "world.measurement" as const,
    };
    const outcome = bindMeasurementEvidence([evidenceLess], FIXTURE_MEASURED_AT);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("retrieval-failure");
    }
  });

  test("binding a comparison whose elements lack provenance refuses (never a fabricated chain)", () => {
    const report = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const outcome = bindComparisonEvidence(report.value, {
      ...FIXTURE_WORLD,
      elementProvenance: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("retrieval-failure");
      expect(outcome.failure.detail).toContain("no provenance");
    }
  });
});
