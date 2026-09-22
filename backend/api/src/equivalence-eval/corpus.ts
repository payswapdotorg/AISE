/**
 * HFX-301 — the COMMITTED EQUIVALENCE CORPUS (the paired authoring tasks).
 *
 * Every corpus entry is a PAIR: the NL utterance (compiled by the PROD-023
 * deterministic agent compiler — imported, never modified) + the equivalent
 * direct-manipulation authoring input (constructed through the contract's
 * `createOperationIntent`, origin "direct-manipulation") — or the
 * DESIGNED-DIVERGENT twin (declared-different cell) — plus the baseline
 * scene reference, the caller-assembled session seeds and the expectation
 * cell from the closed four-cell vocabulary.
 *
 * CORPUS RULE (binding): deterministic in-repo fixtures ONLY — no network,
 * no third-party datasets, no live models, no clock reads, no randomness.
 * Every construction below is pure data over pinned instants.
 *
 * DERIVATION PROVENANCE (the corpus-rule citation discipline): where a
 * BIM-Edit-style edit task exists in HFX-204's corpus with an NL
 * counterpart, the pair is DERIVED from it and cites the source fixture id
 * in its notes (never copied blindly — the journeys here EXECUTE through
 * the solution engine, where HFX-204's edit lane compares proposals only).
 * The canonical PROD-023 command corpus entries reused by PROD-029's
 * compiler seam baseline (REP-EXC-001 / REP-BLOCK-001 / REP-PLASTER-001 of
 * backend/api/src/solution-eval/fixtures.ts — the command-corpus-slice/1
 * baseline) are cited the same way, as is the contract's committed
 * valid-excavation direct/agent fixture pair (the CELL-1 evidence HFX-301
 * extends to the journey level).
 *
 * THE MATRIX (32 committed pairs):
 *
 *   equivalent          15  the compiler's supported vocabulary: excavation
 *                           depth/width/length (postfix, prefix, unit mixes),
 *                           material swaps with unit canonicalization
 *                           (mm/cm/m), coat counts, sequencing clauses,
 *                           replacement clauses, delta commands, focus
 *                           seeding, foundation/slab/opening/finish/service
 *                           coverage;
 *   declared-different   4  the honestly-declared divergences (the NL
 *                           replacement clause's removed-old-value semantics
 *                           the direct twin omits; the NL focus-seeded length
 *                           the direct author restates; the NL sequencing
 *                           edge the direct twin omits; the NL delta the
 *                           direct author restates) — every one declared with
 *                           PROD-029's closed kind, never hidden;
 *   agent-refused        7  ONE per unsafe-taxonomy reason code (the five
 *                           authority-claim families + the two
 *                           determinism-bypass families);
 *   agent-clarification  6  the five clarification slot kinds (dimension,
 *                           material, location, sequencing, constraint) plus
 *                           the delta-amount question.
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  createOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
} from "@aise/solution-contract";
import type {
  AgentSessionContext,
  RecentOperationSummary,
  SessionFocus,
} from "../reasoning/solution/model";
import type { OperationTarget, TypedOperationParameter } from "@aise/solution-contract";
import type {
  DirectAuthoringInput,
  EquivalencePair,
} from "./model";

/* ------------------------------------------------------------------ */
/* The committed baseline scene (frozen corpus data)                    */
/* ------------------------------------------------------------------ */

/** The deterministic baseline scene every pair references (ONE per pair). */
export interface EquivalenceScene {
  readonly sceneId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineRealityVersionId: string;
  readonly projectId: string;
  readonly title: string;
  readonly problemStatement: string;
  /** The pinned deterministic instants (identity excludes them). */
  readonly createdAt: string;
  readonly materializedAt: string;
  readonly validatedAt: string;
  readonly compiledAt: string;
  readonly directAuthoredAt: string;
  /** The read-only baseline geometry table (the resolver seam's data). */
  readonly baselineGeometry: Readonly<
    Record<string, { readonly value: number; readonly unit: string }>
  >;
}

/**
 * The equivalence world — mirrors the solution engine's committed demo
 * world (packages/solution-engine/src/testkit.ts WALL_WORLD) and the
 * baseline-geometry fixture (packages/solution-engine/fixtures/
 * baseline-geometry.json): same solution identity, same pinned reality
 * version, same read-only geometry table (geo-wall-faces-002 …), so the
 * journeys run over the exact deterministic surfaces the engine's own
 * golden fixtures pin.
 */
export const EQUIVALENCE_SCENE: EquivalenceScene = Object.freeze({
  sceneId: "equivalence-demo-scene/1",
  solutionId: "solution-demo-001",
  versionNumber: 1,
  baselineRealityVersionId: "rgv-demo-0007",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade equivalence world",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged section " +
    "must be removed, rebuilt with concrete blocks and re-plastered — the demo " +
    "journey every equivalence pair runs against.",
  createdAt: "2026-09-16T08:00:00.000Z",
  materializedAt: "2026-09-16T10:00:00.000Z",
  validatedAt: "2026-09-16T10:30:00.000Z",
  compiledAt: "2026-09-16T09:05:00.000Z",
  directAuthoredAt: "2026-09-16T09:00:00.000Z",
  baselineGeometry: Object.freeze({
    "geo-wall-faces-002": Object.freeze({ value: 12.5, unit: "m2" }),
    "geo-wall-line-003": Object.freeze({ value: 5, unit: "m2" }),
    "geo-slab-region-005": Object.freeze({ value: 12, unit: "m2" }),
    "geo-pit-outline-001": Object.freeze({ value: 6, unit: "m2" }),
  }),
});

/** The committed scene table (one scene; the corpus's baseline world). */
export const EQUIVALENCE_SCENES: readonly EquivalenceScene[] = Object.freeze([
  EQUIVALENCE_SCENE,
]);

/** Resolves a committed scene by id (fail-closed). */
export function equivalenceSceneOf(sceneId: string): EquivalenceScene {
  const scene = EQUIVALENCE_SCENES.find((entry) => entry.sceneId === sceneId);
  if (scene === undefined) {
    throw new Error(`equivalence corpus: unknown scene id '${sceneId}'`);
  }
  return scene;
}

/* ------------------------------------------------------------------ */
/* The session seeds (the caller-assembled focus table)                */
/* ------------------------------------------------------------------ */

/**
 * The session foci — an inline superset of the PROD-023 demo session's
 * committed foci (backend/api/src/solution-eval/fixtures.ts
 * COMPILER_DEMO_SESSION: wall-faces / wall / pit-area) plus the slab-region
 * focus the slab pairs anchor to. Caller-asserted anchoring data, exactly
 * what the compiler accepts — never fetched.
 */
export const EQUIVALENCE_FOCI: readonly SessionFocus[] = [
  {
    focusId: "wall-faces",
    label: "The affected ground-floor wall faces",
    aliases: [
      "affected wall faces",
      "ground-floor wall faces",
      "the wall faces",
      "damaged plaster",
      "the plaster",
    ],
    selectorKind: "face-set",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
    knownParameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 2.4, unit: "m" },
      { name: "area", value: 12, unit: "m2" },
    ],
  },
  {
    focusId: "wall",
    label: "The wall line along the damaged section",
    aliases: [
      "this wall",
      "the wall section",
      "the damaged wall",
      "the wall line",
      "wall section",
      "the wall",
    ],
    selectorKind: "line-extent",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
    knownParameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 2.4, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
    ],
  },
  {
    focusId: "pit-area",
    label: "The pit excavation area south of the building footprint",
    aliases: [
      "the pit area",
      "south of the building",
      "the excavation area",
      "the pit",
    ],
    selectorKind: "volume",
    nodeRefs: ["node-site-001"],
    geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
    knownParameters: [],
  },
  {
    focusId: "slab-region",
    label: "The ground-bearing slab region",
    aliases: [
      "the slab region",
      "the ground slab area",
      "slab region",
    ],
    selectorKind: "surface-region",
    nodeRefs: ["node-slab-001"],
    geometryRefs: [{ kind: "polygon", ref: "geo-slab-region-005" }],
    knownParameters: [],
  },
];

/** The deterministic session identity the NL compiles run under. */
const SESSION_BASE = {
  sessionId: "session-eq-001",
  agentId: "agent-demo-assistant",
  userId: "user-demo-engineer",
} as const;

/** Builds a session over the committed focus table (pure). */
function session(overrides?: {
  readonly foci?: readonly SessionFocus[];
  /** False to declare NO default focus (the unattached-session clarification cell). */
  readonly withDefaultFocus?: boolean;
  readonly recentOperations?: readonly RecentOperationSummary[];
}): AgentSessionContext {
  const withDefault = overrides?.withDefaultFocus ?? true;
  return {
    ...SESSION_BASE,
    proposedTo: {
      solutionId: EQUIVALENCE_SCENE.solutionId,
      versionNumber: EQUIVALENCE_SCENE.versionNumber,
    },
    foci: overrides?.foci ?? EQUIVALENCE_FOCI,
    ...(withDefault ? { defaultFocusId: "pit-area" } : {}),
    recentOperations: overrides?.recentOperations ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* The DM twin helpers (the direct-manipulation authoring inputs)       */
/* ------------------------------------------------------------------ */

/** The DM twin's target — the identity-relevant fields of a focus's target. */
function focusTarget(focusId: "wall" | "wall-faces" | "pit-area" | "slab-region"): OperationTarget {
  const focus = EQUIVALENCE_FOCI.find((entry) => entry.focusId === focusId);
  if (focus === undefined) {
    throw new Error(`equivalence corpus: unknown focus '${focusId}'`);
  }
  return {
    contractVersion: "1.0.0",
    selectorKind: focus.selectorKind,
    nodeRefs: [...focus.nodeRefs],
    geometryRefs: focus.geometryRefs.map((ref) => ({ ...ref })),
    units: { linear: "m", angular: "rad" },
    description: focus.label,
  };
}

/** Builds a direct-manipulation authoring input (the DM twin's semantics). */
function direct(input: {
  readonly operationType: string;
  readonly parameters: readonly TypedOperationParameter[];
  readonly target: OperationTarget;
  readonly dependsOn?: DirectAuthoringInput["dependsOn"];
  readonly interactionDetail: string;
}): DirectAuthoringInput {
  return {
    operationType: input.operationType,
    parameters: input.parameters.map((parameter) => ({ ...parameter })),
    target: { ...input.target },
    ...(input.dependsOn === undefined ? {} : { dependsOn: input.dependsOn }),
    interactionDetail: input.interactionDetail,
  };
}

/** A named parameter (unit defaults to metres). */
function param(name: string, value: number, unit = "m"): TypedOperationParameter {
  return { name, value, unit };
}

/* ------------------------------------------------------------------ */
/* The prerequisite derivation (the sequencing pairs' journey history)  */
/* ------------------------------------------------------------------ */

/**
 * Derives the ENGINE-DERIVED operation id of a prerequisite DM input (the
 * id the journey's first application mints at operationIndex 1) — the
 * deterministic reference both the NL session's recentOperations and the
 * DM twin's dependency edge carry. Pure: the contract's own identity
 * derivation over the prerequisite's semantic projection.
 */
export function prerequisiteOperationIdOf(prerequisite: DirectAuthoringInput): string {
  const intent = createOperationIntent({
    intentId: "intent-prerequisite-projection",
    operationType: prerequisite.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: prerequisite.parameters,
    target: prerequisite.target,
    ...(prerequisite.dependsOn === undefined ? {} : { dependsOn: prerequisite.dependsOn }),
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "user-demo-engineer",
      authoredAt: EQUIVALENCE_SCENE.directAuthoredAt,
      interactionDetail: prerequisite.interactionDetail,
      derivationNote: `operator authored the ${prerequisite.operationType} in the interactive environment`,
      evidenceIds: [],
    },
    proposedTo: {
      solutionId: EQUIVALENCE_SCENE.solutionId,
      versionNumber: EQUIVALENCE_SCENE.versionNumber,
    },
  });
  return deriveEngineeringOperationId(
    operationSemanticIdentityOfIntent(intent, {
      solutionId: EQUIVALENCE_SCENE.solutionId,
      versionNumber: EQUIVALENCE_SCENE.versionNumber,
      operationIndex: 1,
    }),
  );
}

/** The committed prerequisite excavation (the sequenced pairs' history). */
const PREREQUISITE_EXCAVATION: DirectAuthoringInput = direct({
  operationType: "excavation",
  parameters: [
    param("depth", 1.5),
    param("width", 2),
    param("length", 3),
  ],
  target: focusTarget("pit-area"),
  interactionDetail:
    "operator dimensioned the prerequisite pit volume directly in the 3D view",
});

/* ------------------------------------------------------------------ */
/* The corpus construction (pure; byte-identical to the constants)     */
/* ------------------------------------------------------------------ */

function buildCorpus(): readonly EquivalencePair[] {
  const pairs: EquivalencePair[] = [];
  const push = (pair: EquivalencePair): void => {
    pairs.push(pair);
  };

  /* -- CELL 1: equivalent — the compiler's supported vocabulary --------- */

  push({
    pairId: "eq-excavation-core",
    nlUtterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dragged the excavation volume handles in the 3D view to 1.5 m deep, 2 m wide and 3 m long",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the contract's canonical excavation command — the committed direct/agent fixture pair " +
      "(EngineeringOperationIntent.valid-excavation-{direct,agent}.json) extended to the journey " +
      "level; the PROD-029 compiler baseline's REP-EXC-001 utterance",
  });

  push({
    pairId: "eq-excavation-units-mixed",
    nlUtterance: "Excavate a pit 1500 mm deep, 200 cm wide and 3 m long.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator entered the pit dimensions in the interactive form with mixed units; the form canonicalized them",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "unit canonicalization (mm/cm/m mixes → the parameter's canonical unit) — the " +
      "semantic-equivalence enabler of the compiler's grammar tables",
  });

  push({
    pairId: "eq-excavation-prefix-form",
    nlUtterance: "Excavate a pit with a depth of 2 m, a width of 1.5 m and a length of 4 m.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 2), param("width", 1.5), param("length", 4)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator filled the depth/width/length fields of the excavation form directly",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes: "the prefix dimension form ('depth of 2 m') — the grammar's prefix window",
  });

  push({
    pairId: "eq-excavation-delta",
    nlUtterance: "Make the excavation deeper by 0.5 m.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 2), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dragged the pit floor 0.5 m deeper in the 3D view (1.5 m → 2 m)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session({
      recentOperations: [
        {
          operationId: "op-excavation-eq-prior",
          operationType: "excavation",
          parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
        },
      ],
    }),
    expectation: "equivalent",
    notes:
      "delta command ('deeper by 0.5 m') over the session's recent-operation seed — the NL path " +
      "applies the delta, the direct author dimensioned the resulting pit",
  });

  push({
    pairId: "eq-backfill-sequenced",
    nlUtterance: "Backfill the excavation 1.5 m deep, 2 m wide and 3 m long after the excavation.",
    direct: direct({
      operationType: "backfill",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      dependsOn: [
        {
          contractVersion: "1.0.0",
          operationRef: prerequisiteOperationIdOf(PREREQUISITE_EXCAVATION),
          dependencyKind: "completion-before",
          rationale:
            "interactive author asserted the backfill runs after the prerequisite excavation",
        },
      ],
      interactionDetail:
        "operator authored the backfill in the 3D view sequenced after the excavation step",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    prerequisite: PREREQUISITE_EXCAVATION,
    session: session({
      recentOperations: [
        {
          operationId: prerequisiteOperationIdOf(PREREQUISITE_EXCAVATION),
          operationType: "excavation",
          parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
        },
      ],
    }),
    expectation: "equivalent",
    notes:
      "the sequencing clause ('after the excavation') resolving through the session's recent " +
      "operations to the SAME completion-before edge the interactive author asserts — the " +
      "engine's dependency gating demands the referenced operation be applied first, hence the " +
      "committed prerequisite journey",
  });

  push({
    pairId: "eq-block-wall-focus-seeded",
    nlUtterance: "Lay blocks to a height of 1 m along this wall.",
    direct: direct({
      operationType: "block-wall-placement",
      parameters: [
        param("length", 5),
        param("height", 1),
        param("thickness", 0.1),
        { name: "material", value: "concrete-block" },
      ],
      target: focusTarget("wall"),
      interactionDetail:
        "operator placed a block wall along the selected wall line at 1 m height; the form " +
        "inherited the wall line's length and thickness from the caller-known reality facts",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the PROD-029 compiler baseline's REP-BLOCK-001 utterance — the focus-known parameter " +
      "seeds (length 5 m, thickness 0.1 m) completing the request alongside the stated height",
  });

  push({
    pairId: "eq-block-wall-units",
    nlUtterance:
      "Build a concrete block wall 3000 mm long, 2.4 m high and 100 mm thick along the wall line.",
    direct: direct({
      operationType: "block-wall-placement",
      parameters: [
        param("length", 3),
        param("height", 2.4),
        param("thickness", 0.1),
        { name: "material", value: "concrete-block" },
      ],
      target: focusTarget("wall"),
      interactionDetail:
        "operator entered the block wall dimensions with mixed units in the interactive form",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "material noun normalization ('concrete block') + unit canonicalization to the " +
      "metre-canonical wall parameters; derived in spirit from the HFX-204 BIM-Edit create " +
      "fixtures (bim-edit-create-correct / bim-edit-create-direct-intent) whose NL and " +
      "direct-intent forms expect the same semantics",
  });

  push({
    pairId: "eq-plaster-canonical",
    nlUtterance: "Apply 30 mm plaster to the affected wall faces.",
    direct: direct({
      operationType: "plaster-application",
      parameters: [
        param("thickness", 30, "mm"),
        { name: "material", value: "cement-plaster" },
      ],
      target: focusTarget("wall-faces"),
      interactionDetail:
        "operator set the plaster thickness to 30 mm on the selected wall faces",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the PROD-029 compiler baseline's REP-PLASTER-001 utterance over the demo wall-faces " +
      "focus — the coated-operation journey (baseline surface resolution 12.5 m2)",
  });

  push({
    pairId: "eq-plaster-units-coats",
    nlUtterance: "Apply 3 cm gypsum plaster in two coats to the affected wall faces.",
    direct: direct({
      operationType: "plaster-application",
      parameters: [
        param("thickness", 30, "mm"),
        { name: "material", value: "gypsum-plaster" },
        { name: "coats", value: 2, unit: "count" },
      ],
      target: focusTarget("wall-faces"),
      interactionDetail:
        "operator chose gypsum plaster at 3 cm in two coats on the selected wall faces",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "material swap with unit canonicalization (3 cm → 30 mm) and the coat-count word " +
      "('in two coats') — both authoring modes carry the identical typed parameters",
  });

  push({
    pairId: "eq-plaster-replacement",
    nlUtterance: "Apply 40 mm plaster instead of 30 mm to the affected wall faces.",
    direct: direct({
      operationType: "plaster-application",
      parameters: [
        param("thickness", 40, "mm"),
        { name: "material", value: "cement-plaster" },
      ],
      target: focusTarget("wall-faces"),
      interactionDetail:
        "operator changed the plaster thickness from 30 mm to 40 mm in the interactive form",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the replacement clause ('instead of 30 mm') strips the removed old value from the main " +
      "text — the NL path compiles the NEW thickness; the direct author typed it directly",
  });

  push({
    pairId: "eq-demolition-absolute",
    nlUtterance: "Demolish and remove the wall section 5 m long, 2.4 m high and 100 mm thick.",
    direct: direct({
      operationType: "demolition-removal",
      parameters: [param("length", 5), param("height", 2.4), param("thickness", 0.1)],
      target: focusTarget("wall"),
      interactionDetail:
        "operator selected the damaged wall section and confirmed its removal dimensions",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the demolition-removal vocabulary (both strong verbs map to ONE operation type — never " +
      "a compound ambiguity); derived in spirit from the HFX-204 BIM-Edit element-delete fixture " +
      "(bim-edit-delete-correct)",
  });

  push({
    pairId: "eq-foundation",
    nlUtterance: "Pour a reinforced concrete foundation 6 m long, 1 m wide and 0.5 m deep in the pit area.",
    direct: direct({
      operationType: "foundation-placement",
      parameters: [
        param("length", 6),
        param("width", 1),
        param("depth", 0.5),
        { name: "material", value: "reinforced-concrete" },
      ],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator placed the reinforced concrete footing inside the selected pit volume",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes: "the foundation-placement vocabulary with material normalization ('reinforced concrete')",
  });

  push({
    pairId: "eq-slab",
    nlUtterance: "Place a concrete slab 4 m long, 3 m wide and 150 mm thick on the slab region.",
    direct: direct({
      operationType: "slab-placement",
      parameters: [
        param("length", 4),
        param("width", 3),
        param("thickness", 0.15),
        { name: "material", value: "plain-concrete" },
      ],
      target: focusTarget("slab-region"),
      interactionDetail:
        "operator placed the ground slab on the selected slab region with a 150 mm thickness",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes: "the slab-placement vocabulary ('concrete' → plain-concrete) on the slab-region focus",
  });

  push({
    pairId: "eq-opening",
    nlUtterance: "Cut a timber door opening 900 mm wide and 2100 mm high in the wall.",
    direct: direct({
      operationType: "opening-creation",
      parameters: [
        param("width", 0.9),
        param("height", 2.1),
        { name: "material", value: "timber-door" },
      ],
      target: focusTarget("wall"),
      interactionDetail:
        "operator cut a door opening in the selected wall with the interactive opening tool",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the opening-creation vocabulary with unit canonicalization (mm → m) and material " +
      "normalization ('timber door' → timber-door); derived in spirit from the HFX-204 " +
      "BIM-Edit opening fixture (bim-edit-create-opening)",
  });

  push({
    pairId: "eq-finish-decimal",
    nlUtterance: "Apply 0.3 mm emulsion paint in two coats to the wall faces.",
    direct: direct({
      operationType: "finish-application",
      parameters: [
        param("thickness", 0.3, "mm"),
        { name: "material", value: "emulsion-paint" },
        { name: "coats", value: 2, unit: "count" },
      ],
      target: focusTarget("wall-faces"),
      interactionDetail:
        "operator chose emulsion paint at 0.3 mm in two coats on the selected wall faces",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes: "the finish-application vocabulary with a decimal thickness and the coat count",
  });

  push({
    pairId: "eq-service-run",
    nlUtterance: "Install a PVC conduit run 12 m long with a 25 mm diameter along the wall line.",
    direct: direct({
      operationType: "building-service-installation",
      parameters: [
        param("length", 12),
        param("diameter", 25, "mm"),
        { name: "material", value: "pvc-conduit" },
      ],
      target: focusTarget("wall"),
      interactionDetail:
        "operator routed the conduit run along the selected wall line with a 25 mm diameter",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "equivalent",
    notes:
      "the building-service vocabulary ('PVC conduit' → pvc-conduit; diameter stays " +
      "mm-canonical) — the Phase 1 MEP foundation subset",
  });

  /* -- CELL 2: declared-different — the honestly-declared divergences -- */

  push({
    pairId: "dd-plaster-replacement-omitted",
    nlUtterance: "Apply 40 mm plaster instead of 30 mm to the affected wall faces.",
    direct: direct({
      operationType: "plaster-application",
      parameters: [
        param("thickness", 30, "mm"),
        { name: "material", value: "cement-plaster" },
      ],
      target: focusTarget("wall-faces"),
      interactionDetail:
        "operator kept the current 30 mm plaster thickness (the replacement was not applied " +
        "in the interactive form)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "declared-different",
    declaredDifferenceKind: "operation-semantic-failure",
    notes:
      "the NL replacement clause carries removed-old-value semantics the direct twin " +
      "DELIBERATELY omits — the NL path compiles the replacement (40 mm), the direct twin " +
      "keeps the old value (30 mm): a parameter-semantics difference, declared with " +
      "PROD-029's closed kind",
  });

  push({
    pairId: "dd-block-wall-seed-omitted",
    nlUtterance: "Lay blocks to a height of 1 m along this wall.",
    direct: direct({
      operationType: "block-wall-placement",
      parameters: [
        param("length", 3),
        param("height", 1),
        param("thickness", 0.1),
        { name: "material", value: "concrete-block" },
      ],
      target: focusTarget("wall"),
      interactionDetail:
        "operator dimensioned a 3 m block wall in the interactive form without inheriting " +
        "the wall line's known length",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "declared-different",
    declaredDifferenceKind: "operation-semantic-failure",
    notes:
      "the NL path completes the unstated length from the caller-known focus seed (5 m); the " +
      "direct author restates their own length (3 m) — the focus-seeding semantics the direct " +
      "twin deliberately omits",
  });

  push({
    pairId: "dd-backfill-sequencing-omitted",
    nlUtterance: "Backfill the excavation 1.5 m deep, 2 m wide and 3 m long after the excavation.",
    direct: direct({
      operationType: "backfill",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator authored the backfill without asserting the sequencing edge in the form",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    prerequisite: PREREQUISITE_EXCAVATION,
    session: session({
      recentOperations: [
        {
          operationId: prerequisiteOperationIdOf(PREREQUISITE_EXCAVATION),
          operationType: "excavation",
          parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
        },
      ],
    }),
    expectation: "declared-different",
    declaredDifferenceKind: "operation-semantic-failure",
    notes:
      "the NL sequencing clause asserts the completion-before dependency edge; the direct " +
      "twin deliberately omits it — an identity-level (dependsOn) difference the state digest " +
      "inherits, while quantities and verdicts stay equal: declared, never hidden",
  });

  push({
    pairId: "dd-excavation-delta-restated",
    nlUtterance: "Make the excavation deeper by 0.5 m.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator re-stated the pit at its current 1.5 m depth (the deepening was not applied " +
        "in the interactive form)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session({
      recentOperations: [
        {
          operationId: "op-excavation-eq-prior",
          operationType: "excavation",
          parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
        },
      ],
    }),
    expectation: "declared-different",
    declaredDifferenceKind: "operation-semantic-failure",
    notes:
      "the NL delta command produces the deepened pit (2 m); the direct twin restates the " +
      "current depth (1.5 m) — the delta-application semantics the direct twin deliberately " +
      "omits: a parameter-semantics difference",
  });

  /* -- CELL 3: agent-refused — one per unsafe-taxonomy reason code ----- */

  push({
    pairId: "ref-validation-authority",
    nlUtterance: "Mark the backfill as validated.",
    direct: direct({
      operationType: "backfill",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator authored the backfill in the 3D view (the validation snapshot belongs to " +
        "the server solution engine, never the authoring surface)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes:
      "unsafe-taxonomy family 1/7 (validation-authority-claim): the agent refuses with NO " +
      "intent; the direct path still authors the underlying work — the engine governs both",
  });

  push({
    pairId: "ref-approval-authority",
    nlUtterance: "Approve the excavation for construction.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dimensioned the pit volume in the 3D view (approval is an Engineering Case " +
        "domain act, never an authoring act)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes: "unsafe-taxonomy family 2/7 (approval-authority-claim)",
  });

  push({
    pairId: "ref-reality-authority",
    nlUtterance: "Declare the excavation as observed in the reality graph.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dimensioned the pit volume in the 3D view (observed status belongs to the " +
        "Reality Graph through evidence and governed review)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes: "unsafe-taxonomy family 3/7 (reality-authority-claim)",
  });

  push({
    pairId: "ref-readiness-authority",
    nlUtterance: "Set the wall section ready for execution.",
    direct: direct({
      operationType: "block-wall-placement",
      parameters: [
        param("length", 5),
        param("height", 1),
        param("thickness", 0.1),
        { name: "material", value: "concrete-block" },
      ],
      target: focusTarget("wall"),
      interactionDetail:
        "operator placed the block wall along the wall line (task readiness belongs to the " +
        "Assurance Engine)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes: "unsafe-taxonomy family 4/7 (readiness-authority-claim)",
  });

  push({
    pairId: "ref-cost-authority",
    nlUtterance: "Set the cost of the excavation to 5000.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dimensioned the pit volume in the 3D view (costs are derived by the " +
        "deterministic BOQ services and remain reviewable projections)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes: "unsafe-taxonomy family 5/7 (cost-authority-claim)",
  });

  push({
    pairId: "ref-raw-geometry-write",
    nlUtterance: "Write the excavation geometry mesh directly into the model.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dimensioned the pit volume in the 3D view (geometry is owned by the " +
        "deterministic solution engine behind the tool port)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes: "unsafe-taxonomy family 6/7 (raw-geometry-write — the determinism bypasses)",
  });

  push({
    pairId: "ref-engine-bypass",
    nlUtterance: "Bypass the solution engine and apply the backfill yourself.",
    direct: direct({
      operationType: "backfill",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator authored the backfill through the interactive form (every consequential " +
        "action compiles to a typed operation applied by the engine)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-refused",
    notes: "unsafe-taxonomy family 7/7 (engine-bypass — the determinism bypasses)",
  });

  /* -- CELL 4: agent-clarification — the missing-slot questions ------- */

  push({
    pairId: "clar-missing-dimension",
    nlUtterance: "Excavate a pit 2 m wide and 3 m long.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator's excavation form required the depth field (1.5 m) before authoring",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-clarification",
    notes:
      "clarification slot kind 'dimension': the missing depth is a targeted question, never an " +
      "invented value; the interactive form demanded it up front",
  });

  push({
    pairId: "clar-missing-material",
    nlUtterance: "Use a different material for the plaster on the affected wall faces.",
    direct: direct({
      operationType: "plaster-application",
      parameters: [
        param("thickness", 40, "mm"),
        { name: "material", value: "gypsum-plaster" },
      ],
      target: focusTarget("wall-faces"),
      interactionDetail:
        "operator picked the replacement material (gypsum plaster) from the interactive form's " +
        "vocabulary",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session({
      recentOperations: [
        {
          operationId: "op-plaster-eq-prior",
          operationType: "plaster-application",
          parameters: [
            param("thickness", 30, "mm"),
            { name: "material", value: "cement-plaster" },
          ],
        },
      ],
    }),
    expectation: "agent-clarification",
    notes:
      "clarification slot kind 'material': a 'different material' request names no replacement " +
      "— the agent asks with the offered vocabulary choices; the direct author picked one",
  });

  push({
    pairId: "clar-missing-location",
    nlUtterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator had the pit area selected in the 3D view when authoring (the selection is " +
        "the anchoring — an unattached NL session has no default)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session({ foci: [], withDefaultFocus: false }),
    expectation: "agent-clarification",
    notes:
      "clarification slot kind 'location': the same canonical utterance as eq-excavation-core " +
      "over an UNATTACHED session (no foci, no default) — the agent asks where; the operator " +
      "always has a selection",
  });

  push({
    pairId: "clar-missing-sequencing",
    nlUtterance: "Backfill the excavation 1.5 m deep, 2 m wide and 3 m long after the excavation.",
    direct: direct({
      operationType: "backfill",
      parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator authored the backfill in the 3D view (the sequencing reference resolves " +
        "against the session's history — the direct form does not need one)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-clarification",
    notes:
      "clarification slot kind 'sequencing': the clause 'after the excavation' resolves to no " +
      "recent operation of the unattached session — the agent asks which operation to run after",
  });

  push({
    pairId: "clar-missing-delta-amount",
    nlUtterance: "Make the excavation deeper.",
    direct: direct({
      operationType: "excavation",
      parameters: [param("depth", 2), param("width", 2), param("length", 3)],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator dragged the pit floor 0.5 m deeper in the 3D view (1.5 m → 2 m)",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session({
      recentOperations: [
        {
          operationId: "op-excavation-eq-prior",
          operationType: "excavation",
          parameters: [param("depth", 1.5), param("width", 2), param("length", 3)],
        },
      ],
    }),
    expectation: "agent-clarification",
    notes:
      "the delta-amount question: a requested change without an amount is NEVER restated from " +
      "seeds — the agent asks by how much; the direct author dragged the handle",
  });

  push({
    pairId: "clar-missing-clearance",
    nlUtterance:
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long next to the foundation with adequate clearance.",
    direct: direct({
      operationType: "excavation",
      parameters: [
        param("depth", 1.5),
        param("width", 2),
        param("length", 3),
        param("clearance", 0.5),
      ],
      target: focusTarget("pit-area"),
      interactionDetail:
        "operator's excavation form required the clearance field (0.5 m from the foundation) " +
        "before authoring",
    }),
    sceneId: EQUIVALENCE_SCENE.sceneId,
    session: session(),
    expectation: "agent-clarification",
    notes:
      "clarification slot kind 'constraint': a proximity marker without a clearance value asks " +
      "for the distance — never an invented one; the interactive form demanded it",
  });

  return pairs;
}

/** The committed equivalence corpus (frozen at module load). */
export const EQUIVALENCE_CORPUS: readonly EquivalencePair[] = Object.freeze(buildCorpus());

/** A fresh deterministic corpus construction (byte-identical to the constants). */
export function equivalenceCorpus(): readonly EquivalencePair[] {
  return buildCorpus();
}

/** The ordered corpus ids (the scenario header's fixture list). */
export function equivalencePairIds(): readonly string[] {
  return EQUIVALENCE_CORPUS.map((pair) => pair.pairId);
}
