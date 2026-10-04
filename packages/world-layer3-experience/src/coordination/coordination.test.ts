/**
 * WORLD-P3 tests — the COORDINATION family: the aggregation laws
 * (identity quarantine across models, in-model parents, structural
 * validation), the clash-verdict laws (tolerance declared, closed
 * vocabulary, never a silent boolean), the double byte-identity, the
 * P2 problem-lane binding laws and the fail-closed drills.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { SceneNode } from "@aise/world-reality-substrate";
import type { CoordinationModelSource } from "./contract";
import {
  aggregateCoordinationModels,
  boxSeparationMetres,
  classifySeparation,
  recordCoordinationConflicts,
  validateClashTestRequest,
  type ClashTestRequest,
} from "./contract";
import {
  alternateClashPredicateDouble,
  referenceClashPredicateDouble,
} from "./doubles";
import {
  fixtureClashTestRequest,
  fixtureCoordinationRequest,
  FIXTURE_BIM_MODEL,
  FIXTURE_CLASH_PAIR_WALL_BEAM,
  FIXTURE_CLASH_TOLERANCE,
  FIXTURE_COLLIDING_MODEL,
  FIXTURE_COORDINATION_PROBLEMS,
  FIXTURE_REALITY_MODEL,
  FIXTURE_SOLUTION_MODEL,
} from "./corpus";

/* ------------------------------------------------------------------ */
/* COORDINATE — the aggregation laws                                    */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 coordination — the aggregation laws", () => {
  test("the three discipline models aggregate into one coordinated scene", () => {
    const outcome = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.modelIds).toEqual([
      "model-reality-capture-001",
      "model-bim-discipline-002",
      "model-solution-proposal-003",
    ]);
    // 4 reality + 2 BIM + 1 solution ghost = 7 coordinated elements.
    expect(outcome.value.scene.nodes.length).toBe(7);
    // Per-element model provenance covers every element exactly once.
    expect(outcome.value.elementModelTable.length).toBe(7);
    for (const entry of outcome.value.elementModelTable) {
      expect(outcome.value.modelIds).toContain(entry.modelId);
    }
    // The aggregate id is content-derived and re-derivable.
    const again = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.aggregateId).toBe(outcome.value.aggregateId);
    }
  });

  test("cross-model identity quarantine: an id collision is refused, naming BOTH models", () => {
    const outcome = aggregateCoordinationModels({
      ...fixtureCoordinationRequest(),
      models: [FIXTURE_REALITY_MODEL, FIXTURE_COLLIDING_MODEL],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("identity quarantine across models");
    expect(outcome.failure.detail).toContain("node-wall-002");
    expect(outcome.failure.detail).toContain("model-reality-capture-001");
    expect(outcome.failure.detail).toContain("model-bim-colliding-999");
  });

  test("a substrate-shaped model id is refused by pattern", () => {
    const outcome = aggregateCoordinationModels({
      ...fixtureCoordinationRequest(),
      models: [
        { ...FIXTURE_REALITY_MODEL, modelId: "cesium-entity:site" },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("cesium-entity-id");
  });

  test("a scene with a parent that resolves in ANOTHER model is refused (the model's own validation fires first)", () => {
    // The BIM door-parent-test parents into the REALITY model's wall:
    // the model's OWN scene is structurally invalid (unresolved parent),
    // and the aggregation's in-model parent law is the defense-in-depth
    // behind it — the honest refusal is the structural one.
    const foreignParentNode: SceneNode = {
      elementId: "bim-door-parent-test",
      kind: "plan_model",
      parentId: "node-wall-002",
      transform: {
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
      geometry: null,
      material: null,
      layerIds: ["bim"],
      isGhost: false,
      evidenceContentIds: [],
      label: "Cross-model parenting test",
    };
    const bimWithForeignParent: CoordinationModelSource = {
      ...FIXTURE_BIM_MODEL,
      scene: {
        ...FIXTURE_BIM_MODEL.scene,
        nodes: [...FIXTURE_BIM_MODEL.scene.nodes, foreignParentNode],
      },
    };
    const outcome = aggregateCoordinationModels({
      ...fixtureCoordinationRequest(),
      models: [FIXTURE_REALITY_MODEL, bimWithForeignParent],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("unresolved parentId");
  });

  test("an empty aggregation request is refused", () => {
    const outcome = aggregateCoordinationModels({
      ...fixtureCoordinationRequest(),
      models: [],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
  });

  test("the aggregation is order-independent per model set (model order preserved, content stable)", () => {
    const a = aggregateCoordinationModels(fixtureCoordinationRequest());
    const b = aggregateCoordinationModels({
      ...fixtureCoordinationRequest(),
      models: [
        FIXTURE_BIM_MODEL,
        FIXTURE_REALITY_MODEL,
        FIXTURE_SOLUTION_MODEL,
      ],
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Same element universe; the modelIds order follows the request.
    const idsA = a.value.scene.nodes.map((node) => node.elementId).sort();
    const idsB = b.value.scene.nodes.map((node) => node.elementId).sort();
    expect(idsA).toEqual(idsB);
    expect(b.value.modelIds[0]).toBe("model-bim-discipline-002");
  });

  test("the aggregation never mutates the input models", () => {
    const before = canonicalJsonStringify(
      fixtureCoordinationRequest().models.map((model) => model.scene),
    );
    aggregateCoordinationModels(fixtureCoordinationRequest());
    const after = canonicalJsonStringify(
      fixtureCoordinationRequest().models.map((model) => model.scene),
    );
    expect(after).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* CLASH-DETECT — the verdict laws                                       */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 coordination — the clash-verdict laws", () => {
  test("the three verdict classes hold on the fixture pairs (never a silent boolean)", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const engine = referenceClashPredicateDouble();
    const report = engine.detectClashes(fixtureClashTestRequest(), aggregate.value);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.verdicts.length).toBe(3);
    const byPair = new Map(report.value.verdicts.map((v) => [v.pairId, v] as const));
    // Pair 1: the wall/beam clash — NEGATIVE separation (penetration).
    const clash = byPair.get("clash-pair-001");
    expect(clash?.verdict).toBe("clash");
    expect(clash?.separationMetres).toBeLessThan(0);
    expect(clash?.appliedTolerance).toEqual(FIXTURE_CLASH_TOLERANCE);
    // Pair 2: the slab/door clear — POSITIVE separation beyond tolerance.
    const clear = byPair.get("clash-pair-002");
    expect(clear?.verdict).toBe("clear");
    expect(clear?.separationMetres).toBeGreaterThan(FIXTURE_CLASH_TOLERANCE.linear);
    // Pair 3: the wall/door near-boundary — WITHIN the declared tolerance.
    const near = byPair.get("clash-pair-003");
    expect(near?.verdict).toBe("within-tolerance");
    expect(near?.withinTolerance).toBe(true);
    // The verdict counts summary is machine-readable.
    expect(report.value.verdictCounts).toEqual([
      { verdict: "clash", count: 1 },
      { verdict: "within-tolerance", count: 1 },
      { verdict: "clear", count: 1 },
    ]);
  });

  test("the reference and alternate doubles produce byte-identical reports", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const a = referenceClashPredicateDouble().detectClashes(
      fixtureClashTestRequest(),
      aggregate.value,
    );
    const b = alternateClashPredicateDouble().detectClashes(
      fixtureClashTestRequest(),
      aggregate.value,
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
  });

  test("a clash request without a declared tolerance is refused (tolerances are declared)", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const request: ClashTestRequest = {
      ...fixtureClashTestRequest(),
      tolerance: { linear: 0, angular: 0.001 },
    };
    const outcome = validateClashTestRequest(request, aggregate.value);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("positive-finite linear tolerance");
  });

  test("a pair referencing an element outside the aggregate is refused", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const request: ClashTestRequest = {
      ...fixtureClashTestRequest(),
      pairs: [
        {
          pairId: "clash-pair-orphan",
          elementA: "node-not-in-aggregate",
          elementB: "node-beam-007",
          shapeA: FIXTURE_CLASH_PAIR_WALL_BEAM.shapeA,
          shapeB: FIXTURE_CLASH_PAIR_WALL_BEAM.shapeB,
        },
      ],
    };
    const outcome = validateClashTestRequest(request, aggregate.value);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("node-not-in-aggregate");
  });

  test("a pair with a shape kind outside the declared P3 support is refused honestly", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const request: ClashTestRequest = {
      ...fixtureClashTestRequest(),
      pairs: [
        {
          pairId: "clash-pair-polygon",
          elementA: "node-wall-002",
          elementB: "node-beam-007",
          shapeA: {
            kind: "polygon",
            name: null,
            vertices: [
              { x: 0, y: 0, z: 0 },
              { x: 1, y: 0, z: 0 },
              { x: 1, y: 1, z: 0 },
            ],
          },
          shapeB: FIXTURE_CLASH_PAIR_WALL_BEAM.shapeB,
        },
      ],
    };
    const outcome = validateClashTestRequest(request, aggregate.value);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("box");
    expect(outcome.failure.detail).toContain("BLOCKED");
  });

  test("a pair testing an element against itself is refused", () => {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    const request: ClashTestRequest = {
      ...fixtureClashTestRequest(),
      pairs: [
        {
          pairId: "clash-pair-self",
          elementA: "node-wall-002",
          elementB: "node-wall-002",
          shapeA: FIXTURE_CLASH_PAIR_WALL_BEAM.shapeA,
          shapeB: FIXTURE_CLASH_PAIR_WALL_BEAM.shapeB,
        },
      ],
    };
    const outcome = validateClashTestRequest(request, aggregate.value);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
  });

  test("the closed verdict classification table", () => {
    const tolerance = 0.05;
    expect(classifySeparation(-0.1, tolerance)).toBe("clash");
    expect(classifySeparation(-0.06, tolerance)).toBe("clash");
    expect(classifySeparation(-0.05, tolerance)).toBe("within-tolerance");
    expect(classifySeparation(0, tolerance)).toBe("within-tolerance");
    expect(classifySeparation(0.05, tolerance)).toBe("within-tolerance");
    expect(classifySeparation(0.050001, tolerance)).toBe("clear");
    expect(classifySeparation(1, tolerance)).toBe("clear");
  });

  test("fuzz: verdict monotonicity along the separation axis (seeded, rigorous)", () => {
    // B sits strictly to the RIGHT of A along x (y/z overlapping): the
    // separation is exactly the x gap, and pushing B further right by t
    // increases the separation by t — the verdict never downgrades.
    let seed = 0xc1a5420d;
    const next = (min: number, max: number): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return min + (seed / 0x100000000) * (max - min);
    };
    const rank: Record<string, number> = {
      clash: 0,
      "within-tolerance": 1,
      clear: 2,
    };
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const a = {
        kind: "box" as const,
        name: null,
        min: { x: next(-3, 0), y: next(-3, 3), z: next(-3, 3) },
        max: { x: 0, y: 0, z: 0 },
      };
      a.max.y = a.min.y + next(0.1, 3);
      a.max.z = a.min.z + next(0.1, 3);
      const gap = next(0.01, 1.5);
      const b = {
        kind: "box" as const,
        name: null,
        min: { x: gap, y: a.min.y, z: a.min.z },
        max: { x: 0, y: 0, z: 0 },
      };
      b.max.x = b.min.x + next(0.1, 3);
      b.max.y = b.min.y + next(0.1, 3);
      b.max.z = b.min.z + next(0.1, 3);
      const separation = boxSeparationMetres(a, b);
      expect(separation).toBeCloseTo(gap, 10);
      const verdict = classifySeparation(separation, FIXTURE_CLASH_TOLERANCE.linear);
      const pushedSeparation = boxSeparationMetres(a, {
        ...b,
        min: { ...b.min, x: b.min.x + 0.5 },
        max: { ...b.max, x: b.max.x + 0.5 },
      });
      expect(pushedSeparation).toBeCloseTo(separation + 0.5, 10);
      const pushedVerdict = classifySeparation(
        pushedSeparation,
        FIXTURE_CLASH_TOLERANCE.linear,
      );
      expect(rank[pushedVerdict] ?? -1).toBeGreaterThanOrEqual(rank[verdict] ?? -1);
    }
  });

  test("fuzz: the two doubles agree on randomized pairs (seeded, byte-identical)", () => {
    let seed = 0xdeadbeef;
    const next = (min: number, max: number): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return min + (seed / 0x100000000) * (max - min);
    };
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const makeBox = () => {
        const min = { x: next(-2, 2), y: next(-2, 2), z: next(-2, 2) };
        return {
          kind: "box" as const,
          name: null,
          min,
          max: {
            x: min.x + next(0.1, 2),
            y: min.y + next(0.1, 2),
            z: min.z + next(0.1, 2),
          },
        };
      };
      const request: ClashTestRequest = {
        ...fixtureClashTestRequest(),
        pairs: [
          {
            pairId: `fuzz-pair-${iteration}`,
            elementA: "node-wall-002",
            elementB: "node-beam-007",
            shapeA: makeBox(),
            shapeB: makeBox(),
          },
        ],
      };
      const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
      expect(aggregate.ok).toBe(true);
      if (!aggregate.ok) return;
      const a = referenceClashPredicateDouble().detectClashes(request, aggregate.value);
      const b = alternateClashPredicateDouble().detectClashes(request, aggregate.value);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) continue;
      expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
    }
  });
});

/* ------------------------------------------------------------------ */
/* Conflict records — the P2 problem-lane binding                       */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 coordination — the P2 problem-lane binding", () => {
  function fixtureReport() {
    const aggregate = aggregateCoordinationModels(fixtureCoordinationRequest());
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) throw new Error("aggregate failed");
    const report = referenceClashPredicateDouble().detectClashes(
      fixtureClashTestRequest(),
      aggregate.value,
    );
    expect(report.ok).toBe(true);
    if (!report.ok) throw new Error("clash report failed");
    return report.value;
  }

  test("every non-clear verdict binds to its covering problem (two conflicts, two bindings)", () => {
    const report = fixtureReport();
    const outcome = recordCoordinationConflicts({
      report,
      problems: FIXTURE_COORDINATION_PROBLEMS,
      recordedAt: "2026-10-05T09:10:00.000Z",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.length).toBe(2);
    const clashConflict = outcome.value.find((record) => record.pairId === "clash-pair-001");
    expect(clashConflict?.verdict).toBe("clash");
    expect(clashConflict?.problemBinding.problemId).toBe("problem-demo-coordination-001");
    expect(clashConflict?.problemBinding.problemStatus).toBe("open");
    expect(clashConflict?.separationMetres).toBeLessThan(0);
    const nearConflict = outcome.value.find((record) => record.pairId === "clash-pair-003");
    expect(nearConflict?.verdict).toBe("within-tolerance");
    expect(nearConflict?.problemBinding.problemId).toBe("problem-demo-coordination-002");
    // Conflict ids are content-derived, deterministic, re-derivable.
    const again = recordCoordinationConflicts({
      report,
      problems: FIXTURE_COORDINATION_PROBLEMS,
      recordedAt: "2026-10-05T09:10:00.000Z",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.map((record) => record.conflictId)).toEqual(
      outcome.value.map((record) => record.conflictId),
    );
  });

  test("an orphan non-clear verdict is refused (fail closed, never an orphan conflict)", () => {
    const report = fixtureReport();
    const outcome = recordCoordinationConflicts({
      report,
      problems: [],
      recordedAt: "2026-10-05T09:10:00.000Z",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("REQUIRES a P2 problem-lane binding");
  });

  test("a problem covering only UNRELATED elements does not bind (the spatial-binding law)", () => {
    const report = fixtureReport();
    const outcome = recordCoordinationConflicts({
      report,
      problems: [
        {
          ...FIXTURE_COORDINATION_PROBLEMS[1]!,
          spatialBinding: {
            sceneRevision: 3,
            elementIds: ["node-slab-006"],
            captureEvidenceContentIds: [],
          },
        },
      ],
      recordedAt: "2026-10-05T09:10:00.000Z",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
  });

  test("a malformed recording instant is refused (declared instants only)", () => {
    const report = fixtureReport();
    const outcome = recordCoordinationConflicts({
      report,
      problems: FIXTURE_COORDINATION_PROBLEMS,
      recordedAt: "yesterday-ish",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("ISO-8601");
  });
});

