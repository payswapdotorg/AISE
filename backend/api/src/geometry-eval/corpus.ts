/**
 * HFX-302 — the COMMITTED SUBSTITUTION CORPUS (the canonical operation
 * sequences).
 *
 * Every corpus entry is a SEQUENCE: an ordered list of NEUTRAL canonical
 * operations (typed parameters with units, anchored targets, backwards
 * dependencies) + the baseline scene reference + the substitute PROFILE
 * under evaluation + the declared expectation cell from the closed
 * three-cell vocabulary (compatible | declared-incompatible |
 * unsupported-by-substitute).
 *
 * CORPUS RULE (binding): deterministic in-repo fixtures ONLY — no network,
 * no third-party geometry libraries, no live models, no clock reads, no
 * randomness. Every construction below is pure data over pinned instants.
 *
 * DERIVATION PROVENANCE (the corpus-rule citation discipline): the scene
 * mirrors HFX-301's committed equivalence scene
 * (backend/api/src/equivalence-eval/corpus.ts EQUIVALENCE_SCENE — same
 * solution identity, same pinned reality version, same read-only geometry
 * table geo-wall-faces-002 …) which itself mirrors the engine's demo world
 * and the baseline-geometry fixture
 * (packages/solution-engine/fixtures/baseline-geometry.json). Sequences
 * are DERIVED from HFX-301's paired corpus and PROD-029's compiler-baseline
 * utterances where a natural operation exists (cited per entry in the
 * notes — never copied blindly: the lanes here EXECUTE the neutral
 * sequence, where HFX-301 compares authoring paths).
 *
 * THE MATRIX (30 committed sequences):
 *
 *   compatible                21  ALL TEN Phase 1 families at least once,
 *                                unit mixes (mm/cm/m), non-grid-aligned
 *                                dimensions where the declared tolerance
 *                                actually works, and the multi-operation
 *                                topology cases (a wall with openings, an
 *                                excavation-then-backfill pair, a
 *                                coat-over-baseline plaster case, a
 *                                foundation-then-slab chain);
 *   declared-incompatible      5  the COARSE profile on shapes whose
 *                                discretization error EXCEEDS the declared
 *                                tolerance — every one declaring the
 *                                expected comparison kind (the designed
 *                                evidence that the comparison discriminates);
 *   unsupported-by-substitute  4  the families the RESTRICTED profile
 *                                deliberately does not declare
 *                                (demolition-removal, finish-application,
 *                                building-service-installation) — recorded
 *                                explicitly by the fail-closed gate,
 *                                never computed.
 */

import type { BuildingOperationType } from "@aise/solution-contract";
import type { FailureKind } from "@aise/provider-registry";
import type { GeometryScene, NeutralOperation, SubstitutionSequence } from "./model";
import { SUBSTITUTE_PROFILE_IDS } from "./registry";

/* ------------------------------------------------------------------ */
/* The committed baseline scene (frozen corpus data)                    */
/* ------------------------------------------------------------------ */

/**
 * The deterministic baseline scene every sequence references (ONE per
 * sequence) — derived from HFX-301's EQUIVALENCE_SCENE (same solution
 * identity and pinned reality version; the same read-only geometry table
 * the engine's own golden fixtures pin).
 */
export const GEOMETRY_SCENE: GeometryScene = Object.freeze({
  sceneId: "geometry-substitution-scene/1",
  solutionId: "solution-demo-001",
  versionNumber: 1,
  baselineRealityVersionId: "rgv-demo-0007",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade substitution world",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged section must be " +
    "removed, rebuilt with concrete blocks and re-plastered — the demo world every " +
    "substitution sequence executes against (derived from the HFX-301 equivalence scene).",
  createdAt: "2026-09-16T08:00:00.000Z",
  materializedAt: "2026-09-16T10:00:00.000Z",
  validatedAt: "2026-09-16T10:30:00.000Z",
  authoredAt: "2026-09-16T09:00:00.000Z",
  baselineGeometry: Object.freeze({
    "geo-wall-faces-002": Object.freeze({ value: 12.5, unit: "m2" }),
    "geo-wall-line-003": Object.freeze({ value: 5, unit: "m2" }),
    "geo-slab-region-005": Object.freeze({ value: 12, unit: "m2" }),
    "geo-pit-outline-001": Object.freeze({ value: 6, unit: "m2" }),
  }),
});

/** The committed scene table (one scene; the corpus's baseline world). */
export const GEOMETRY_SCENES: readonly GeometryScene[] = Object.freeze([GEOMETRY_SCENE]);

/** Resolves a committed scene by id (fail-closed). */
export function geometrySceneOf(sceneId: string): GeometryScene {
  const scene = GEOMETRY_SCENES.find((entry) => entry.sceneId === sceneId);
  if (scene === undefined) {
    throw new Error(`geometry-eval corpus: unknown scene id '${sceneId}'`);
  }
  return scene;
}

/* ------------------------------------------------------------------ */
/* The sequence-construction helpers (pure)                             */
/* ------------------------------------------------------------------ */

/** A named numeric parameter (unit defaults to metres). */
function param(name: string, value: number, unit = "m"): { name: string; value: number; unit: string } {
  return { name, value, unit };
}

/** A named string-choice parameter (materials — no unit, per the contract's explicit-unit law). */
function choice(name: string, value: string): { name: string; value: string } {
  return { name, value };
}

/** One committed target anchor (the closed contract vocabularies, typed). */
interface TargetAnchor {
  readonly targetSelectorKind: NeutralOperation["targetSelectorKind"];
  readonly targetNodeRefs: readonly string[];
  readonly targetGeometryRefs: readonly NeutralOperation["targetGeometryRefs"][number][];
}

/** The pit-area target (the earthworks anchor — derived from the HFX-301 focus table). */
const PIT_TARGET: TargetAnchor = {
  targetSelectorKind: "volume",
  targetNodeRefs: ["node-site-001"],
  targetGeometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
};

/** The wall-element target (the structural anchor). */
const WALL_TARGET: TargetAnchor = {
  targetSelectorKind: "line-extent",
  targetNodeRefs: ["node-wall-002"],
  targetGeometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
};

/** The wall-faces target (the coated-surface anchor). */
const WALL_FACES_TARGET: TargetAnchor = {
  targetSelectorKind: "face-set",
  targetNodeRefs: ["node-wall-002"],
  targetGeometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
};

/** The slab-region target (the ground-bearing anchor). */
const SLAB_TARGET: TargetAnchor = {
  targetSelectorKind: "surface-region",
  targetNodeRefs: ["node-slab-001"],
  targetGeometryRefs: [{ kind: "polygon", ref: "geo-slab-region-005" }],
};

/** Builds one neutral operation (pure). */
function op(
  operationType: BuildingOperationType,
  parameters: readonly { name: string; value: number | string; unit?: string }[],
  target: TargetAnchor,
  dependsOn?: readonly { dependsOnOperationIndex: number; dependencyKind: "completion-before" }[],
): NeutralOperation {
  return {
    operationType,
    parameters: parameters.map((parameter) => ({ ...parameter })),
    targetSelectorKind: target.targetSelectorKind,
    targetNodeRefs: [...target.targetNodeRefs],
    targetGeometryRefs: target.targetGeometryRefs.map((ref) => ({ ...ref })),
    ...(dependsOn === undefined ? {} : { dependsOn: dependsOn.map((dependency) => ({ ...dependency })) }),
  };
}

/** Builds one corpus sequence (pure). */
function sequence(input: {
  readonly sequenceId: string;
  readonly title: string;
  readonly operations: readonly NeutralOperation[];
  readonly substituteProfileId: string;
  readonly expectation: SubstitutionSequence["expectation"];
  readonly declaredDifferenceKind?: FailureKind;
  readonly notes: string;
}): SubstitutionSequence {
  return {
    sequenceId: input.sequenceId,
    title: input.title,
    baselineSceneId: GEOMETRY_SCENE.sceneId,
    operations: input.operations.map((operation) => ({
      ...operation,
      parameters: operation.parameters.map((parameter) => ({ ...parameter })),
      targetNodeRefs: [...operation.targetNodeRefs],
      targetGeometryRefs: operation.targetGeometryRefs.map((ref) => ({ ...ref })),
      ...(operation.dependsOn === undefined
        ? {}
        : { dependsOn: operation.dependsOn.map((dependency) => ({ ...dependency })) }),
    })),
    substituteProfileId: input.substituteProfileId,
    expectation: input.expectation,
    ...(input.declaredDifferenceKind === undefined
      ? {}
      : { declaredDifferenceKind: input.declaredDifferenceKind }),
    notes: input.notes,
  };
}

const FINE = "geometry-substitute-fine" as const;
const COARSE = "geometry-substitute-coarse" as const;
const RESTRICTED = "geometry-substitute-restricted" as const;

/* ------------------------------------------------------------------ */
/* The corpus construction (pure; byte-identical to the constants)      */
/* ------------------------------------------------------------------ */

function buildCorpus(): readonly SubstitutionSequence[] {
  const sequences: SubstitutionSequence[] = [];
  const push = (entry: SubstitutionSequence): void => {
    sequences.push(entry);
  };

  /* -- CELL 1: compatible — all ten families, unit mixes, tolerances --- */

  push(
    sequence({
      sequenceId: "gs-excavation-core",
      title: "The canonical excavation (grid-aligned)",
      operations: [op("excavation", [param("depth", 1.5), param("width", 2), param("length", 3)], PIT_TARGET)],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-excavation-core (the REP-EXC-001 compiler baseline utterance; " +
        "the contract's canonical excavation command) — grid-aligned dimensions (1.5/2/3 m are " +
        "exact multiples of the fine 0.05 m macro cell): the discretized accumulation is exact",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-excavation-units",
      title: "The unit-mix excavation (mm/cm/m parameters)",
      operations: [
        op("excavation", [param("depth", 1500, "mm"), param("width", 200, "cm"), param("length", 3, "m")], PIT_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-excavation-units-mixed — the unit-canonicalization discipline " +
        "(mm/cm/m → canonical metres through each lane's own unit table)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-excavation-nonaligned",
      title: "The non-grid-aligned excavation (the tolerance at work)",
      operations: [
        op("excavation", [param("depth", 1.5), param("width", 2), param("length", 3.02)], PIT_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "non-grid-aligned length (3.02 m — 60.4 cells → 60 counted): the discretized volume " +
        "9.0 m3 vs the closed-form 9.06 m3 sits INSIDE the declared volume tolerance " +
        "(abs 0.05 ⊕ rel 1 % ⇒ allowed 0.0906 m3) — the declared tolerance demonstrably absorbs " +
        "the discretization residual",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-backfill",
      title: "The backfill (grid-aligned)",
      operations: [op("backfill", [param("depth", 0.9), param("width", 1.8), param("length", 2.7)], PIT_TARGET)],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes: "the earthworks counterpart family at grid-aligned dimensions (exact accumulation)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-excavation-backfill-pair",
      title: "Excavation then backfill over the same pit (the earthworks pairing)",
      operations: [
        op("excavation", [param("depth", 1.5), param("width", 2), param("length", 3)], PIT_TARGET),
        op(
          "backfill",
          [param("depth", 0.5), param("width", 2), param("length", 3)],
          PIT_TARGET,
          [{ dependsOnOperationIndex: 1, dependencyKind: "completion-before" }],
        ),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-backfill-sequenced (the sequencing clause with the committed " +
        "prerequisite journey) — the multi-operation TOPOLOGY case: the backfill pairs the prior " +
        "excavation over the shared pit geometry (backfill-pairs-excavation), and the dependency " +
        "edge rides BOTH lanes' dependency gating",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-demolition",
      title: "The demolition removal (grid-aligned)",
      operations: [
        op("demolition-removal", [param("length", 4), param("height", 2.4), param("thickness", 0.1)], WALL_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "the damaged-section removal of the demo world's problem statement (derived from the " +
        "HFX-301 wall-upgrade journey context) — grid-aligned dimensions",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-demolition-nonaligned",
      title: "The non-grid-aligned demolition removal",
      operations: [
        op("demolition-removal", [param("length", 4.01), param("height", 2.4), param("thickness", 0.1)], WALL_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "non-grid-aligned length (4.01 m): volume delta 0.0024 m3 and area delta 0.024 m2 sit " +
        "well inside the declared tolerances (abs 0.05 dominates)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-foundation",
      title: "The foundation placement (grid-aligned)",
      operations: [
        op("foundation-placement", [param("length", 3), param("width", 0.8), param("depth", 0.45), choice("material", "reinforced-concrete")], PIT_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes: "the footing family at grid-aligned dimensions (exact accumulation)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-slab",
      title: "The slab placement (grid-aligned)",
      operations: [
        op("slab-placement", [param("length", 4), param("width", 3), param("thickness", 0.15), choice("material", "plain-concrete")], SLAB_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes: "the ground-bearing slab family at grid-aligned dimensions",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-slab-nonaligned",
      title: "The non-grid-aligned slab placement",
      operations: [
        op("slab-placement", [param("length", 4.02), param("width", 3), param("thickness", 0.15), choice("material", "plain-concrete")], SLAB_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "non-grid-aligned length (4.02 m): the area delta 0.06 m2 sits inside the relative " +
        "tolerance term (1 % of 12.06 m2 = 0.1206 m2) — the relative term demonstrably governs " +
        "larger references",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-block-wall",
      title: "The block wall (grid-aligned, block count exact)",
      operations: [
        op("block-wall-placement", [param("length", 5), param("height", 2.4), param("thickness", 0.2), choice("material", "concrete-block")], WALL_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-block-wall-core — the rebuilt wall of the demo world: continuous " +
        "quantities exact at grid alignment AND the integer block count (156 = 12 courses × 13 " +
        "modules) matching the covering-module accumulation exactly (count admits NO tolerance)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-block-wall-units",
      title: "The unit-mix block wall (cm/cm/mm parameters)",
      operations: [
        op(
          "block-wall-placement",
          [param("length", 500, "cm"), param("height", 240, "cm"), param("thickness", 200, "mm"), choice("material", "concrete-block")],
          WALL_TARGET,
        ),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-block-wall-units — the unit-canonicalization discipline over " +
        "the structural family (500 cm / 240 cm / 200 mm → 5 / 2.4 / 0.2 m)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-block-wall-openings",
      title: "The wall with two openings (the hosting topology)",
      operations: [
        op("block-wall-placement", [param("length", 5), param("height", 2.4), param("thickness", 0.2), choice("material", "concrete-block")], WALL_TARGET),
        op(
          "opening-creation",
          [param("width", 1.2), param("height", 1.5), choice("material", "timber-door")],
          WALL_TARGET,
          [{ dependsOnOperationIndex: 1, dependencyKind: "completion-before" }],
        ),
        op(
          "opening-creation",
          [param("width", 0.8), param("height", 1), choice("material", "timber-door")],
          WALL_TARGET,
          [{ dependsOnOperationIndex: 1, dependencyKind: "completion-before" }],
        ),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "the multi-operation TOPOLOGY case: the wall element HOSTS the two openings " +
        "(opening-hosted-by-element, count 2) and the three-operation chain exercises the " +
        "append-only accumulation and the BOQ grouping across operations",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-opening",
      title: "The single opening (grid-aligned)",
      operations: [op("opening-creation", [param("width", 1.2), param("height", 1.5), choice("material", "timber-door")], WALL_TARGET)],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes: "the opening family standalone (a door-sized opening in the rebuilt wall)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-plaster-baseline",
      title: "The coat-over-baseline plaster (aligned thickness)",
      operations: [
        op("plaster-application", [param("thickness", 0.015), choice("material", "cement-plaster")], WALL_FACES_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-plaster-core (the REP-PLASTER-001 compiler baseline utterance) " +
        "— the COATED-SURFACE discipline: the area (12.5 m2) is the READ-ONLY baseline fact over " +
        "geo-wall-faces-002 (both lanes resolve the same pinned table); the thickness (15 mm = 3 " +
        "coat cells) discretizes exactly; the TOPOLOGY case coat-anchors-baseline-surface",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-plaster-mm",
      title: "The millimetre-parameterized plaster",
      operations: [op("plaster-application", [param("thickness", 15, "mm"), choice("material", "cement-plaster")], WALL_FACES_TARGET)],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-plaster-units-coats — the millimetre unit mix over the coat " +
        "family (15 mm → 0.015 m canonical)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-plaster-nonaligned",
      title: "The non-aligned plaster thickness (the absolute term at work)",
      operations: [op("plaster-application", [param("thickness", 0.012), choice("material", "gypsum-plaster")], WALL_FACES_TARGET)],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "non-grid-aligned thickness (12 mm — 2.4 coat cells → 2 counted → 10 mm): the volume " +
        "delta 0.025 m3 (12.5 × 0.002) sits INSIDE the ABSOLUTE tolerance term (0.05 m3) — the " +
        "declared absolute term demonstrably absorbs small-reference discretization residuals " +
        "where the relative term cannot (16.7 % relative)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-finish-baseline",
      title: "The finish coat over the slab region (aligned thickness)",
      operations: [op("finish-application", [param("thickness", 0.01), choice("material", "emulsion-paint")], SLAB_TARGET)],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "derived from HFX-301 eq-finish-decimal — the finish family over the slab region's " +
        "baseline surface fact (12 m2), thickness 10 mm = 2 coat cells exactly",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-service-run",
      title: "The building service run (grid-aligned)",
      operations: [
        op("building-service-installation", [param("length", 6.5), param("diameter", 0.05), choice("material", "pvc-conduit")], WALL_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes: "the service-run family at a grid-aligned length (130 macro cells exactly)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-service-run-nonaligned",
      title: "The non-grid-aligned service run",
      operations: [
        op("building-service-installation", [param("length", 7.03), param("diameter", 0.05), choice("material", "pvc-conduit")], WALL_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "non-grid-aligned length (7.03 m — 140.6 cells → 141 counted → 7.05 m): the 0.02 m " +
        "delta sits inside the declared length tolerance (abs 0.05)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-foundation-slab",
      title: "The foundation-then-slab chain (multi-operation accumulation)",
      operations: [
        op("foundation-placement", [param("length", 3), param("width", 0.8), param("depth", 0.45), choice("material", "reinforced-concrete")], PIT_TARGET),
        op(
          "slab-placement",
          [param("length", 4), param("width", 3), param("thickness", 0.15), choice("material", "plain-concrete")],
          SLAB_TARGET,
          [{ dependsOnOperationIndex: 1, dependencyKind: "completion-before" }],
        ),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "the structural chain: footing then slab over the pit — the multi-operation quantity " +
        "accumulation and the BOQ grouping across two additive families (no topology relation " +
        "applies: the empty topology projection compares equal)",
    }),
  );

  push(
    sequence({
      sequenceId: "gs-block-wall-nonaligned",
      title: "The non-grid-aligned block wall (count still exact)",
      operations: [
        op("block-wall-placement", [param("length", 5.02), param("height", 2.4), param("thickness", 0.2), choice("material", "concrete-block")], WALL_TARGET),
      ],
      substituteProfileId: FINE,
      expectation: "compatible",
      notes:
        "non-grid-aligned length (5.02 m): volume delta 0.0096 m3 and area delta 0.048 m2 inside " +
        "the declared tolerances, while the block count (156) stays EXACT — the covering-module " +
        "accumulation is resolution-independent",
    }),
  );

  /* -- CELL 2: declared-incompatible — the coarse-grid breaches ------- */

  push(
    sequence({
      sequenceId: "gdi-excavation-coarse",
      title: "The coarse-grid excavation breach (volume + footprint)",
      operations: [
        op("excavation", [param("depth", 1.5), param("width", 2), param("length", 3.1)], PIT_TARGET),
      ],
      substituteProfileId: COARSE,
      expectation: "declared-incompatible",
      declaredDifferenceKind: "operation-semantic-failure",
      notes:
        "the DESIGNED divergence: the coarse profile (0.25 m macro cell) on the non-aligned " +
        "3.1 m length counts 12 cells (3.0 m) — the volume delta 0.3 m3 BREACHES the declared " +
        "volume tolerance (allowed 0.093 m3) and the footprint delta 0.2 m2 breaches the area " +
        "tolerance (allowed 0.062 m2); the BOQ volume line diverges with the same kind — the " +
        "comparison DISCRIMINATES",
    }),
  );

  push(
    sequence({
      sequenceId: "gdi-slab-coarse",
      title: "The coarse-grid slab breach (the thickness axis over-discretized)",
      operations: [
        op("slab-placement", [param("length", 4.3), param("width", 3), param("thickness", 0.15), choice("material", "plain-concrete")], SLAB_TARGET),
      ],
      substituteProfileId: COARSE,
      expectation: "declared-incompatible",
      declaredDifferenceKind: "operation-semantic-failure",
      notes:
        "the DESIGNED divergence: at the coarse macro cell the 0.15 m thickness axis counts a " +
        "single 0.25 m cell — the slab volume diverges by 1.2525 m3 (3.1875 vs 1.935 m3) and " +
        "the plan area by 0.15 m2, both far beyond the declared tolerances",
    }),
  );

  push(
    sequence({
      sequenceId: "gdi-plaster-coarse",
      title: "The coarse-grid plaster breach (the coat cell too coarse)",
      operations: [op("plaster-application", [param("thickness", 0.012), choice("material", "gypsum-plaster")], WALL_FACES_TARGET)],
      substituteProfileId: COARSE,
      expectation: "declared-incompatible",
      declaredDifferenceKind: "operation-semantic-failure",
      notes:
        "the DESIGNED divergence: the coarse coat cell (0.02 m) over-counts the 12 mm thickness " +
        "as one full cell (20 mm) — the volume diverges by 0.1 m3 (0.25 vs 0.15 m3) while the " +
        "AREA stays equal (the same read-only baseline fact): the breach is isolated to the " +
        "computed quantity, exactly the discrimination the tolerance wrap exists for",
    }),
  );

  push(
    sequence({
      sequenceId: "gdi-block-wall-coarse",
      title: "The coarse-grid block wall breach (continuous quantities only)",
      operations: [
        op("block-wall-placement", [param("length", 5.1), param("height", 2.4), param("thickness", 0.2), choice("material", "concrete-block")], WALL_TARGET),
      ],
      substituteProfileId: COARSE,
      expectation: "declared-incompatible",
      declaredDifferenceKind: "operation-semantic-failure",
      notes:
        "the DESIGNED divergence: the coarse grid over-approximates every axis (5.0/2.5/0.25 m) " +
        "— the volume diverges by 0.677 m3 and the face area by 0.26 m2, while the BLOCK COUNT " +
        "stays exactly 156 (the covering-module accumulation is resolution-independent): the " +
        "integer semantics hold even where the continuous discretization breaches",
    }),
  );

  push(
    sequence({
      sequenceId: "gdi-service-run-coarse",
      title: "The coarse-grid service-run breach (the length tolerance)",
      operations: [
        op("building-service-installation", [param("length", 6.1), param("diameter", 0.05), choice("material", "pvc-conduit")], WALL_TARGET),
      ],
      substituteProfileId: COARSE,
      expectation: "declared-incompatible",
      declaredDifferenceKind: "operation-semantic-failure",
      notes:
        "the DESIGNED divergence: the coarse grid counts 24 cells (6.0 m) for the 6.1 m run — " +
        "the 0.1 m delta BREACHES the declared length tolerance (allowed max(0.05, 0.061) m)",
    }),
  );

  /* -- CELL 3: unsupported-by-substitute — the capability gate -------- */

  push(
    sequence({
      sequenceId: "gus-demolition-unsupported",
      title: "The demolition the restricted substitute does not declare",
      operations: [
        op("demolition-removal", [param("length", 4), param("height", 2.4), param("thickness", 0.1)], WALL_TARGET),
      ],
      substituteProfileId: RESTRICTED,
      expectation: "unsupported-by-substitute",
      notes:
        "the restricted profile deliberately omits demolition-removal — the fail-closed gate " +
        "answers with the typed unsupported naming the family BEFORE execution; the reference " +
        "oracle still executes (the engine governs both lanes equally)",
    }),
  );

  push(
    sequence({
      sequenceId: "gus-finish-unsupported",
      title: "The finish coat the restricted substitute does not declare",
      operations: [op("finish-application", [param("thickness", 0.01), choice("material", "emulsion-paint")], SLAB_TARGET)],
      substituteProfileId: RESTRICTED,
      expectation: "unsupported-by-substitute",
      notes:
        "the restricted profile deliberately omits finish-application — the typed unsupported " +
        "outcome records the family explicitly, never a computed guess",
    }),
  );

  push(
    sequence({
      sequenceId: "gus-service-unsupported",
      title: "The service run the restricted substitute does not declare",
      operations: [
        op("building-service-installation", [param("length", 6.5), param("diameter", 0.05), choice("material", "pvc-conduit")], WALL_TARGET),
      ],
      substituteProfileId: RESTRICTED,
      expectation: "unsupported-by-substitute",
      notes:
        "the restricted profile deliberately omits building-service-installation — the typed " +
        "unsupported outcome records the family explicitly",
    }),
  );

  push(
    sequence({
      sequenceId: "gus-mixed-unsupported",
      title: "The mixed sequence whose SECOND operation is undeclared",
      operations: [
        op("excavation", [param("depth", 1.5), param("width", 2), param("length", 3)], PIT_TARGET),
        op("demolition-removal", [param("length", 4), param("height", 2.4), param("thickness", 0.1)], WALL_TARGET),
      ],
      substituteProfileId: RESTRICTED,
      expectation: "unsupported-by-substitute",
      notes:
        "the restricted profile's gate scans IN SEQUENCE ORDER and answers with the FIRST " +
        "undeclared family (demolition-removal at index 2, after the declared excavation at " +
        "index 1) — nothing is computed, not even the declared prefix",
    }),
  );

  return sequences;
}

/** The committed corpus (frozen at first construction; byte-stable). */
export const GEOMETRY_CORPUS: readonly SubstitutionSequence[] = Object.freeze(buildCorpus());

/** The committed corpus accessor (fresh list; the frozen constant's content). */
export function geometryCorpus(): readonly SubstitutionSequence[] {
  return buildCorpus();
}

/** The committed corpus ids in order. */
export function geometrySequenceIds(): readonly string[] {
  return GEOMETRY_CORPUS.map((entry) => entry.sequenceId);
}

/** Resolves a committed sequence by id (fail-closed). */
export function geometrySequenceOf(sequenceId: string): SubstitutionSequence {
  const entry = GEOMETRY_CORPUS.find((candidate) => candidate.sequenceId === sequenceId);
  if (entry === undefined) {
    throw new Error(`geometry-eval corpus: unknown sequence id '${sequenceId}'`);
  }
  return entry;
}

/** The committed substitute profile ids (mirrored for sequence validation). */
export const COMMITTED_PROFILE_IDS: readonly string[] = [...SUBSTITUTE_PROFILE_IDS];

/** The committed scene ids (mirrored for sequence validation). */
export const COMMITTED_SCENE_IDS: readonly string[] = GEOMETRY_SCENES.map((scene) => scene.sceneId);

/** The ten documented v1 operation families (mirrored for coverage checks). */
export const OPERATION_FAMILY_VOCABULARY: readonly BuildingOperationType[] = [
  "excavation",
  "backfill",
  "demolition-removal",
  "foundation-placement",
  "slab-placement",
  "block-wall-placement",
  "opening-creation",
  "plaster-application",
  "building-service-installation",
  "finish-application",
] as const;
