/**
 * HFX-204 — the BIM evaluation corpus: the deterministic DOUBLES + the
 * committed fixture corpus (the testkit — the reference-provider pattern
 * of the control plane and the Layer-2 reasoning doubles).
 *
 * TWO deterministic in-repo fixture providers (registry.ts — NO network,
 * no real model; the real IFC-Bench/BIM-Edit consumer providers are the
 * FUTURE users of this harness, explicit non-scope):
 *
 *  - `fixture-bim-qa-provider` answers IFC-Bench-style questions through
 *    the Layer-2 Evidence Envelope schema, scripted by the input's control
 *    channel (behaviorTag + variantScript — the harness never reads them);
 *  - `fixture-bim-edit-provider` resolves BIM-Edit-style edit commands
 *    (natural language or direct intent) to `EngineeringOperationIntent`
 *    records (constructed through the solution contract's single
 *    constructor surface `createOperationIntent` — contract-valid by
 *    construction), or refuses explicitly.
 *
 * THE CORPUS (29 committed fixtures) is the HFX-204 benchmark fixture map:
 *
 *   IFC-BENCH LANE (15): one correct fixture per question class of the
 *     published taxonomy (property/quantity lookup, spatial composition,
 *     part-of/connected-to topology, classification) + the discrimination
 *     negatives (misread property = perception; wrong-element evidence =
 *     retrieval; wrong thickness comparison = reasoning; absent property
 *     and nonexistent element = unsupported; fabricated evidence id =
 *     unsupported; conflicting evidence surfaced = the honest conflicted
 *     status; silent conflict resolution = reasoning; malformed envelope =
 *     contract-mismatch).
 *
 *   BIM-EDIT LANE (14): one correct fixture per edit class of the
 *     published taxonomy (element-create in BOTH command forms — the
 *     natural-language and the direct-intent form resolve to the SAME
 *     normalized semantics; element-update; element-delete;
 *     spatial-change; topological-change) + the AISE-specific negatives:
 *     unavailable geometry (honest refusal + caught fabrication), missing
 *     dimensions (clarification refusal + caught invented measurement),
 *     invalid constraints (the violated constraint NAMED) and wrong
 *     unit/wrong target (operation-semantic failures).
 *
 * DETERMINISM: pure computation over declared data — no clock, no
 * randomness, no I/O, no execution of any proposed intent. The same
 * corpus construction is byte-identical; the committed goldens under
 * tools/bim-eval/ are its projection.
 */

import {
  applyRegistryEvent,
  createProviderRegistry,
  replayRegistry,
  sealProvenanceManifest,
  validateBenchmarkRecord,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  ProviderProfile,
  ProviderRegistryEvent,
  RawProviderExecution,
} from "@aise/provider-registry";
import {
  createOperationIntent,
  REFERENCE_BUILDING_DOMAIN,
  SOLUTION_CONTRACT_VERSION,
} from "@aise/solution-contract";
import type {
  EngineeringOperationIntent,
  OperationTarget,
  TypedOperationParameter,
} from "@aise/solution-contract";
import type { ReasoningEvalRegistryLog, ReasoningEvalScenario } from "../reasoning-eval";
import { canonicalDigestOf, canonicalJsonText, FULL_EVALUATION_CRITERIA } from "./model";
import {
  BIM_EDIT_UPSTREAM_MANIFEST,
  IFC_BENCH_UPSTREAM_MANIFEST,
  parseBimEditBundle,
} from "./model";
import type {
  BimBuildingModelFixture,
  BimEditBundle,
  BimEditConstraint,
  BimEditExpectedIntent,
  BimEditFixture,
  BimEditQuantity,
  BimNegativeCaseClass,
  BimQuestionFixture,
  IfcBenchQuestionClass,
} from "./model";
import { evaluateEditFixture, evaluateQuestionFixture } from "./harness";
import type { BimEditOutcome, BimQuestionOutcome } from "./harness";
import {
  BIM_EVAL_BENCHMARK_ID,
  BIM_EVAL_CODE_VERSION,
  BIM_EVAL_CONSUMER,
  BIM_EVAL_DECLARED_RESOURCES,
  BIM_EVAL_ENVIRONMENT,
  BIM_EVAL_LANE_FIXTURE_PROVIDERS,
  BIM_EVAL_SUITE_ID,
  BIM_EVAL_SUITE_VERSION,
  fixtureBimEditProviderProfile,
  fixtureBimQaProviderProfile,
  fixtureProfileForBimLane,
} from "./registry";

/* ------------------------------------------------------------------ */
/* The deterministic building-model fixture (the shared world)          */
/* ------------------------------------------------------------------ */

/**
 * The BIM-EVAL TOWER: a two-storey fixture building — DETERMINISTIC
 * IN-REPO DATA following the IFC element-class vocabulary (IfcWall/
 * IfcSlab/IfcDoor/IfcWindow/IfcColumn), NOT an upstream dataset. Every
 * property, quantity, spatial containment and topological relation below
 * is the ground truth the evidence items and edit bundles project.
 */
export const BIM_EVAL_BUILDING_MODEL: BimBuildingModelFixture = {
  kind: "bim-eval-building-model",
  projectId: "proj-bim-eval-001",
  modelId: "bim-eval-tower",
  revision: "r1",
  storeys: [
    {
      storeyId: "storey-00",
      name: "Ground Floor",
      elevationM: 0.0,
      contains: ["wall-W1", "wall-W2", "slab-S1", "door-D1", "window-WN1"],
    },
    {
      storeyId: "storey-01",
      name: "First Floor",
      elevationM: 3.2,
      contains: ["wall-W3", "slab-S2", "column-C1"],
    },
  ],
  elements: [
    {
      elementId: "wall-W1",
      ifcClass: "IfcWallStandardCase",
      storeyId: "storey-00",
      name: "ground-floor east wall",
      properties: [
        { name: "thickness", value: 240, unit: "mm" },
        { name: "length", value: 6, unit: "m" },
      ],
      stringProperties: [
        { name: "fire-rating", value: "REI 90" },
        { name: "material", value: "concrete block" },
      ],
    },
    {
      elementId: "wall-W2",
      ifcClass: "IfcWallStandardCase",
      storeyId: "storey-00",
      name: "ground-floor north wall",
      properties: [
        { name: "thickness", value: 240, unit: "mm" },
        { name: "length", value: 4.5, unit: "m" },
      ],
      stringProperties: [
        { name: "fire-rating", value: "REI 90" },
        { name: "material", value: "concrete block" },
      ],
    },
    {
      elementId: "wall-W3",
      ifcClass: "IfcWallStandardCase",
      storeyId: "storey-01",
      name: "first-floor partition wall",
      properties: [
        { name: "thickness", value: 200, unit: "mm" },
        { name: "length", value: 3.8, unit: "m" },
      ],
      stringProperties: [
        { name: "fire-rating", value: "REI 60" },
        { name: "material", value: "gypsum block" },
      ],
    },
    {
      elementId: "slab-S1",
      ifcClass: "IfcSlab",
      storeyId: "storey-00",
      name: "ground-floor slab",
      properties: [
        { name: "thickness", value: 250, unit: "mm" },
        { name: "area", value: 48.5, unit: "m2" },
      ],
      stringProperties: [{ name: "material", value: "concrete C30" }],
    },
    {
      elementId: "slab-S2",
      ifcClass: "IfcSlab",
      storeyId: "storey-01",
      name: "first-floor slab",
      properties: [
        { name: "thickness", value: 200, unit: "mm" },
        { name: "area", value: 46, unit: "m2" },
      ],
      stringProperties: [{ name: "material", value: "concrete C30" }],
    },
    {
      elementId: "door-D1",
      ifcClass: "IfcDoor",
      storeyId: "storey-00",
      name: "entrance door",
      properties: [
        { name: "width", value: 900, unit: "mm" },
        { name: "height", value: 2100, unit: "mm" },
      ],
      stringProperties: [{ name: "fire-rating", value: "FD 60" }],
    },
    {
      elementId: "window-WN1",
      ifcClass: "IfcWindow",
      storeyId: "storey-00",
      name: "north window",
      properties: [
        { name: "width", value: 1200, unit: "mm" },
        { name: "height", value: 1400, unit: "mm" },
      ],
      stringProperties: [],
    },
    {
      elementId: "column-C1",
      ifcClass: "IfcColumn",
      storeyId: "storey-01",
      name: "first-floor column",
      properties: [{ name: "cross-section-width", value: 300, unit: "mm" }],
      stringProperties: [{ name: "material", value: "concrete C30" }],
    },
  ],
  topology: [
    {
      relation: "fills-opening-in",
      fromElementId: "door-D1",
      toElementId: "wall-W1",
      note: "the entrance door fills an opening in the ground-floor east wall",
    },
    {
      relation: "fills-opening-in",
      fromElementId: "window-WN1",
      toElementId: "wall-W2",
      note: "the north window fills an opening in the ground-floor north wall",
    },
    {
      relation: "connected-to",
      fromElementId: "wall-W1",
      toElementId: "wall-W2",
      note: "the ground-floor east wall is connected to the ground-floor north wall at the north-east corner",
    },
  ],
};

/** The authorized model-node universe of every edit bundle (storeys + elements). */
const MODEL_NODE_IDS: readonly string[] = [
  "storey-00",
  "storey-01",
  "wall-W1",
  "wall-W2",
  "wall-W3",
  "slab-S1",
  "slab-S2",
  "door-D1",
  "window-WN1",
  "column-C1",
];

/** The content digest of the building-model fixture (pinned in the goldens). */
export function buildingModelDigest(): string {
  return canonicalDigestOf(BIM_EVAL_BUILDING_MODEL);
}

/* ------------------------------------------------------------------ */
/* The evidence universe of the question lane                           */
/* ------------------------------------------------------------------ */

/** The fixed deterministic wording of the QA lane's honest refusal. */
export function bimQaRefusalDetail(bundle: {
  readonly question: string;
  readonly authorizedContext: { readonly contextId: string };
}): string {
  return (
    `question '${bundle.question}' requires data outside the authorized evidence set of context ` +
    `'${bundle.authorizedContext.contextId}' — explicit refusal, never a fabricated answer`
  );
}

/** The fixed deterministic wording of the empty-result unknown. */
export const BIM_QA_EMPTY_UNKNOWN = "no model-extract evidence matched the question" as const;

/**
 * The fixed deterministic wording the Layer-2 harness records for an
 * unparseable envelope payload (the mirrored constant of the reasoning-eval
 * harness — the malformed-behavior prediction's expected unknown).
 */
export const BIM_QA_UNPARSEABLE_UNKNOWN =
  "the declared envelope payload is not valid canonical Evidence Envelope JSON" as const;

interface QaEvidenceSpec {
  readonly evidenceId: string;
  readonly revision: string;
  readonly content: string;
  readonly facts: readonly string[];
}

const QA_EVIDENCE: readonly QaEvidenceSpec[] = [
  {
    evidenceId: "EV-WALL-W1",
    revision: "r1",
    content:
      "model extract: element wall-W1 (IfcWallStandardCase, ground-floor east wall) — thickness 240 mm, " +
      "fire rating REI 90, material concrete block, length 6.00 m, contained in storey-00 (Ground Floor)",
    facts: [
      "wall W1 is classified IfcWallStandardCase",
      "wall W1 has a thickness of 240 mm",
      "wall W1 has fire rating REI 90",
      "wall W1 is made of concrete block",
      "wall W1 is contained in storey-00 (Ground Floor)",
    ],
  },
  {
    evidenceId: "EV-WALL-W2",
    revision: "r1",
    content:
      "model extract: element wall-W2 (IfcWallStandardCase, ground-floor north wall) — thickness 240 mm, " +
      "fire rating REI 90, material concrete block, length 4.50 m, contained in storey-00 (Ground Floor)",
    facts: [
      "wall W2 is classified IfcWallStandardCase",
      "wall W2 has a thickness of 240 mm",
      "wall W2 has fire rating REI 90",
      "wall W2 is contained in storey-00 (Ground Floor)",
    ],
  },
  {
    evidenceId: "EV-WALL-W3",
    revision: "r1",
    content:
      "model extract: element wall-W3 (IfcWallStandardCase, first-floor partition wall) — thickness 200 mm, " +
      "fire rating REI 60, material gypsum block, length 3.80 m, contained in storey-01 (First Floor)",
    facts: [
      "wall W3 is classified IfcWallStandardCase",
      "wall W3 has a thickness of 200 mm",
      "wall W3 has fire rating REI 60",
      "wall W3 is contained in storey-01 (First Floor)",
    ],
  },
  {
    evidenceId: "EV-WALL-W3-INSPECT",
    revision: "r2",
    content:
      "inspection note (revision r2): the fire-protection upgrade walkthrough recorded wall W3's " +
      "fire rating as REI 90",
    facts: ["the inspection note records wall W3's fire rating as REI 90"],
  },
  {
    evidenceId: "EV-SLAB-S1",
    revision: "r1",
    content:
      "model extract: element slab-S1 (IfcSlab, ground-floor slab) — thickness 250 mm, material " +
      "concrete C30, area 48.5 m2, contained in storey-00 (Ground Floor)",
    facts: [
      "slab S1 is classified IfcSlab",
      "slab S1 has a thickness of 250 mm",
      "slab S1 has an area of 48.5 m2",
      "slab S1 is contained in storey-00 (Ground Floor)",
    ],
  },
  {
    evidenceId: "EV-SLAB-S2",
    revision: "r1",
    content:
      "model extract: element slab-S2 (IfcSlab, first-floor slab) — thickness 200 mm, material " +
      "concrete C30, area 46.0 m2, contained in storey-01 (First Floor)",
    facts: [
      "slab S2 is classified IfcSlab",
      "slab S2 has a thickness of 200 mm",
      "slab S2 has an area of 46.0 m2",
      "slab S2 is contained in storey-01 (First Floor)",
    ],
  },
  {
    evidenceId: "EV-DOOR-D1",
    revision: "r1",
    content:
      "model extract: element door-D1 (IfcDoor, entrance door) — width 900 mm, height 2100 mm, " +
      "fire rating FD 60, contained in storey-00 (Ground Floor)",
    facts: [
      "door D1 is classified IfcDoor",
      "door D1 has a width of 900 mm",
      "door D1 has a height of 2100 mm",
      "door D1 is contained in storey-00 (Ground Floor)",
    ],
  },
  {
    evidenceId: "EV-WINDOW-WN1",
    revision: "r1",
    content:
      "model extract: element window-WN1 (IfcWindow, north window) — width 1200 mm, height 1400 mm, " +
      "contained in storey-00 (Ground Floor)",
    facts: [
      "window WN1 is classified IfcWindow",
      "window WN1 has a width of 1200 mm",
      "window WN1 has a height of 1400 mm",
      "window WN1 is contained in storey-00 (Ground Floor)",
    ],
  },
  {
    evidenceId: "EV-COLUMN-C1",
    revision: "r1",
    content:
      "model extract: element column-C1 (IfcColumn, first-floor column) — cross-section 300x300 mm, " +
      "material concrete C30, contained in storey-01 (First Floor)",
    facts: [
      "column C1 is classified IfcColumn",
      "column C1 is made of concrete C30",
      "column C1 is contained in storey-01 (First Floor)",
    ],
  },
  {
    evidenceId: "EV-SPATIAL",
    revision: "r1",
    content:
      "spatial composition extract: storey-00 (Ground Floor, elevation 0.00 m) contains wall W1, wall W2, " +
      "slab S1, door D1 and window WN1; storey-01 (First Floor, elevation 3.20 m) contains wall W3, " +
      "slab S2 and column C1",
    facts: [
      "storey-00 contains wall W1, wall W2, slab S1, door D1 and window WN1",
      "storey-01 contains wall W3, slab S2 and column C1",
      "storey-00 is the Ground Floor at elevation 0.00 m",
      "storey-01 is the First Floor at elevation 3.20 m",
    ],
  },
  {
    evidenceId: "EV-TOPO",
    revision: "r1",
    content:
      "topology extract: door D1 fills an opening in wall W1; window WN1 fills an opening in wall W2; " +
      "wall W1 is connected to wall W2 at the north-east corner",
    facts: [
      "door D1 fills an opening in wall W1",
      "window WN1 fills an opening in wall W2",
      "wall W1 is connected to wall W2 at the north-east corner",
    ],
  },
];

const QA_AUTHORIZED_CONTEXT = {
  projectId: "proj-bim-eval-001",
  contextId: "ctx-bim-model-extract",
  revision: "r1",
} as const;

const QA_OFFERED_CHECKS: readonly string[] = ["fixture-ifc-property-check"];

/** The QA lane's fixture-provider identity (the envelope agentIdentity). */
const QA_IDENTITY = {
  providerId: BIM_EVAL_LANE_FIXTURE_PROVIDERS["ifc-bench-questions"].providerId,
  technologyVersion: BIM_EVAL_LANE_FIXTURE_PROVIDERS["ifc-bench-questions"].technologyVersion,
  capability: BIM_EVAL_LANE_FIXTURE_PROVIDERS["ifc-bench-questions"].capability,
} as const;

/** Builds the evidence-question bundle of one question fixture (the fixed evidence universe). */
function qaBundle(
  scenarioId: string,
  question: string,
  requiredEvidenceIds: readonly string[],
  scope: "in-scope" | "out-of-scope",
) {
  return {
    scenarioId,
    lane: "document-understanding" as const,
    question,
    authorizedContext: QA_AUTHORIZED_CONTEXT,
    evidence: QA_EVIDENCE.map((spec) => ({
      evidenceId: spec.evidenceId,
      revision: spec.revision,
      kind: "document-section" as const,
      content: spec.content,
      facts: [...spec.facts],
    })),
    requiredEvidenceIds: [...requiredEvidenceIds],
    scope,
    offeredChecks: [...QA_OFFERED_CHECKS],
  };
}

/* ------------------------------------------------------------------ */
/* The question-fixture builder (prediction + oracle from one spec)     */
/* ------------------------------------------------------------------ */

interface QaOracleSpec {
  readonly claim: string | null;
  readonly status: "supported" | "unsupported" | "conflicted";
  readonly assumptions: readonly string[];
}

interface QaFixtureSpec {
  readonly fixtureId: string;
  readonly questionClass: IfcBenchQuestionClass;
  readonly negativeCase?: BimNegativeCaseClass;
  readonly question: string;
  readonly requiredEvidenceIds: readonly string[];
  readonly scope: "in-scope" | "out-of-scope";
  readonly behavior: "replay" | "refuse" | "malformed";
  readonly script?: Record<string, unknown>;
  readonly oracle: QaOracleSpec;
  readonly expectedKind: string;
  readonly expectedRules?: readonly string[];
}

/** The base answer script of the QA double (overridable per fixture). */
function qaScript(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    evidenceIds: ["EV-WALL-W1"],
    facts: ["wall W1 has fire rating REI 90"],
    assumptions: ["the model extract of wall W1 is the governing revision r1"],
    unknowns: [],
    deterministicChecks: [...QA_OFFERED_CHECKS],
    resultClaim: "Wall W1 has fire rating REI 90.",
    resultStatus: "supported",
    invalidationConditions: ["a revision of the model extract that changes wall W1's fire rating"],
    nextRecommendedAction: "verify the rating against the fire-protection drawing set",
    agentIdentity: QA_IDENTITY,
    proposedOperation: null,
    ...overrides,
  };
}

function buildQuestionFixture(spec: QaFixtureSpec): BimQuestionFixture {
  const bundle = qaBundle(spec.fixtureId, spec.question, spec.requiredEvidenceIds, spec.scope);
  let prediction: {
    readonly status: "supported" | "unsupported" | "conflicted";
    readonly claim: string | null;
    readonly facts: readonly string[];
    readonly assumptions: readonly string[];
    readonly unknowns: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly checks: readonly string[];
    readonly invalidation: readonly string[];
  };
  if (spec.behavior === "replay") {
    const script = spec.script;
    if (script === undefined) {
      throw new Error(`question fixture '${spec.fixtureId}': the replay behavior requires a script`);
    }
    prediction = {
      status: script["resultStatus"] as "supported" | "unsupported" | "conflicted",
      claim: (script["resultClaim"] as string | null) ?? null,
      facts: [...(script["facts"] as readonly string[])],
      assumptions: [...(script["assumptions"] as readonly string[])],
      unknowns: [...(script["unknowns"] as readonly string[])],
      evidenceIds: [...(script["evidenceIds"] as readonly string[])],
      checks: [...(script["deterministicChecks"] as readonly string[])],
      invalidation: [...(script["invalidationConditions"] as readonly string[])],
    };
  } else if (spec.behavior === "refuse") {
    prediction = {
      status: "unsupported",
      claim: null,
      facts: [],
      assumptions: [],
      unknowns: [bimQaRefusalDetail(bundle)],
      evidenceIds: [],
      checks: [],
      invalidation: [],
    };
  } else {
    // The malformed behavior: the Layer-2 harness maps the unparseable
    // payload onto the degenerate envelope carrying ITS fixed wording.
    prediction = {
      status: "unsupported",
      claim: null,
      facts: [],
      assumptions: [],
      unknowns: [BIM_QA_UNPARSEABLE_UNKNOWN],
      evidenceIds: [],
      checks: [],
      invalidation: [],
    };
  }
  const expected = {
    resultStatus: prediction.status,
    resultClaim: prediction.claim,
    facts: prediction.facts,
    assumptions: prediction.assumptions,
    unknowns: prediction.unknowns,
    evidenceIds: prediction.evidenceIds,
    deterministicChecks: prediction.checks,
    invalidationConditions: prediction.invalidation,
    correctResultStatus: spec.oracle.status,
    correctResultClaim: spec.oracle.claim,
    correctAssumptions: spec.oracle.assumptions,
    expectedFailureKind: spec.expectedKind as ReasoningEvalScenario["expected"]["expectedFailureKind"],
    expectedViolationRules: (spec.expectedRules ?? []) as ReasoningEvalScenario["expected"]["expectedViolationRules"],
  };
  const scenario = {
    scenarioId: spec.fixtureId,
    lane: "document-understanding" as const,
    providerRef: {
      providerId: QA_IDENTITY.providerId,
      technologyVersion: QA_IDENTITY.technologyVersion,
    },
    capability: QA_IDENTITY.capability,
    input: {
      kind: "provider-input" as const,
      capability: QA_IDENTITY.capability,
      payload: {
        bundleJson: canonicalJsonText(bundle),
        behaviorTag: spec.behavior,
        ...(spec.script === undefined ? {} : { variantScript: canonicalJsonText(spec.script) }),
      },
    },
    expected,
    criteria: FULL_EVALUATION_CRITERIA,
  };
  return {
    kind: "bim-question-fixture" as const,
    fixtureId: spec.fixtureId,
    lane: "ifc-bench-questions" as const,
    questionClass: spec.questionClass,
    ...(spec.negativeCase === undefined ? {} : { negativeCase: spec.negativeCase }),
    scenario,
  };
}

/* ------------------------------------------------------------------ */
/* The edit-fixture builder (scripted intents via the constructor)      */
/* ------------------------------------------------------------------ */

/** The fixed deterministic authored-at instant of every scripted intent (declared data, never a clock read). */
const FIXTURE_AUTHORED_AT = "2026-01-01T00:00:00.000Z";

const TARGET_UNITS = { linear: "mm", angular: "rad" } as const;

function editTarget(selectorKind: OperationTarget["selectorKind"], nodeRefs: readonly string[], description: string): OperationTarget {
  return {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    selectorKind,
    nodeRefs: [...nodeRefs],
    geometryRefs: [],
    units: TARGET_UNITS,
    description,
  };
}

/**
 * Constructs one scripted resolved intent through the solution contract's
 * SINGLE constructor surface (`createOperationIntent` — the same surface
 * for both provenance origins): contract-valid by construction, typed
 * parameters with units, anchored target, exact command text carried
 * verbatim for agent origin.
 */
function editIntent(spec: {
  readonly intentId: string;
  readonly operationType: string;
  readonly parameters: readonly TypedOperationParameter[];
  readonly targetSelectorKind: OperationTarget["selectorKind"];
  readonly targetNodeRefs: readonly string[];
  readonly targetDescription: string;
  readonly commandText?: string;
  readonly derivationNote?: string;
}): EngineeringOperationIntent {
  return createOperationIntent({
    intentId: spec.intentId,
    operationType: spec.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [...spec.parameters],
    target: editTarget(spec.targetSelectorKind, spec.targetNodeRefs, spec.targetDescription),
    dependsOn: [],
    provenance: {
      origin: spec.commandText !== undefined ? "agent" : "direct-manipulation",
      authoredBy: "fixture-bim-edit-double",
      authoredAt: FIXTURE_AUTHORED_AT,
      evidenceIds: [],
      ...(spec.commandText !== undefined ? { commandText: spec.commandText } : {}),
      ...(spec.derivationNote !== undefined ? { derivationNote: spec.derivationNote } : {}),
    },
  });
}

/** The fixed deterministic refusal wording of the edit double (the honest clarifications). */
export function bimEditRefusalDetail(bundle: BimEditBundle): string {
  const missing = bundle.referencedElements
    .filter((entry) => !entry.exists)
    .map((entry) => entry.elementId)
    .sort((a, b) => a.localeCompare(b));
  if (missing.length > 0) {
    return (
      `the command references element(s) [${missing.join(", ")}] which do not exist in the ` +
      `authorized building-model fixture — explicit refusal, never a fabricated shape`
    );
  }
  const missingParameters = bundle.requiredParameters
    .filter((name) => !bundle.commandQuantities.some((quantity) => quantity.name === name))
    .sort((a, b) => a.localeCompare(b));
  if (missingParameters.length > 0) {
    return (
      `the command does not carry the required parameter(s) [${missingParameters.join(", ")}] the ` +
      `${bundle.editClass} task needs and the bundle carries no default — clarification requested, ` +
      `never an invented measurement`
    );
  }
  return "the edit double resolved no intent for the command — explicit refusal, never a fabricated shape";
}

interface EditFixtureSpec {
  readonly fixtureId: string;
  readonly editClass: BimEditFixture["editClass"];
  readonly commandForm: BimEditFixture["commandForm"];
  readonly negativeCase?: BimNegativeCaseClass;
  readonly command:
    | { readonly form: "natural-language"; readonly text: string }
    | {
        readonly form: "direct-intent";
        readonly intent: {
          readonly operationType: string;
          readonly parameters: readonly TypedOperationParameter[];
          readonly targetSelectorKind: string;
          readonly targetNodeRefs: readonly string[];
          readonly targetUnits: { readonly linear: string; readonly angular: string };
        };
      };
  readonly commandQuantities: readonly BimEditQuantity[];
  readonly requiredParameters: readonly string[];
  readonly referencedElements: readonly { readonly elementId: string; readonly exists: boolean }[];
  readonly elementProperties: readonly {
    readonly elementId: string;
    readonly name: string;
    readonly value: number;
    readonly unit: string;
  }[];
  readonly constraints: readonly BimEditConstraint[];
  readonly behavior: "replay" | "refuse" | "malformed";
  readonly script?: EngineeringOperationIntent;
  readonly expectedIntent: BimEditExpectedIntent | null;
  readonly expectedKind: string;
  readonly expectedRules?: readonly string[];
  readonly expectedOracleMatch: boolean;
}

function buildEditFixture(spec: EditFixtureSpec): BimEditFixture {
  const bundle: BimEditBundle = {
    fixtureId: spec.fixtureId,
    editClass: spec.editClass,
    command: spec.command,
    commandQuantities: [...spec.commandQuantities],
    requiredParameters: [...spec.requiredParameters],
    modelNodeIds: [...MODEL_NODE_IDS],
    referencedElements: [...spec.referencedElements],
    elementProperties: [...spec.elementProperties],
    constraints: [...spec.constraints],
  };
  const provider = BIM_EVAL_LANE_FIXTURE_PROVIDERS["bim-edit-operations"];
  return {
    kind: "bim-edit-fixture",
    fixtureId: spec.fixtureId,
    lane: "bim-edit-operations",
    editClass: spec.editClass,
    commandForm: spec.commandForm,
    ...(spec.negativeCase === undefined ? {} : { negativeCase: spec.negativeCase }),
    behavior: spec.behavior,
    providerRef: { providerId: provider.providerId, technologyVersion: provider.technologyVersion },
    capability: provider.capability,
    input: {
      kind: "provider-input",
      capability: provider.capability,
      payload: {
        bundleJson: canonicalJsonText(bundle),
        behaviorTag: spec.behavior,
        ...(spec.script === undefined ? {} : { variantScript: canonicalJsonText(spec.script) }),
      },
    },
    expected: {
      expectedIntent: spec.expectedIntent,
      expectedFailureKind: spec.expectedKind as BimEditFixture["expected"]["expectedFailureKind"],
      expectedViolationRules: (spec.expectedRules ?? []) as BimEditFixture["expected"]["expectedViolationRules"],
      expectedOracleMatch: spec.expectedOracleMatch,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The deterministic executions (the behavior tables)                   */
/* ------------------------------------------------------------------ */

interface FixtureInputPayload {
  readonly bundleJson: string;
  readonly behaviorTag: string;
  readonly variantScript?: string;
}

/**
 * Executes the QA fixture provider deterministically: the behavior table
 * over the control channel (replay / refuse / empty / malformed — the
 * Layer-2 double pattern; the harness never reads the channel). The
 * opaque provider-native payload rides along for provenance only.
 */
export function executeBimQaProvider(
  profile: ProviderProfile,
  input: { readonly payload: Record<string, unknown> },
): RawProviderExecution {
  const payload = input.payload as unknown as FixtureInputPayload;
  const native = {
    mediaType: "application/aise-bim-eval-fixture+json",
    payload: {
      engine: "bim-eval-fixture-double",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      behaviorTag: payload.behaviorTag,
      note: "opaque provider-native payload — carried for provenance only, never parsed into canonical domain types",
    },
  };
  const capability = profile.capabilities[0] ?? "";
  switch (payload.behaviorTag) {
    case "replay": {
      if (payload.variantScript === undefined) {
        throw new Error("bim qa double: the replay behavior requires the variantScript");
      }
      return { capability, outputs: { envelopeJson: payload.variantScript }, providerNative: native };
    }
    case "refuse": {
      const bundle = JSON.parse(payload.bundleJson) as {
        readonly question: string;
        readonly authorizedContext: { readonly contextId: string };
      };
      return {
        capability,
        failure: { kind: "unsupported-data", detail: bimQaRefusalDetail(bundle) },
        providerNative: native,
      };
    }
    case "empty": {
      const envelope = {
        evidenceIds: [] as string[],
        facts: [] as string[],
        assumptions: [] as string[],
        unknowns: [BIM_QA_EMPTY_UNKNOWN],
        deterministicChecks: [] as string[],
        resultClaim: null,
        resultStatus: "unsupported",
        invalidationConditions: [] as string[],
        agentIdentity: {
          providerId: profile.providerId,
          technologyVersion: profile.technologyVersion,
          capability,
        },
        proposedOperation: null,
      };
      return { capability, outputs: { envelopeJson: canonicalJsonText(envelope) }, providerNative: native };
    }
    case "malformed": {
      return { capability, outputs: { envelopeJson: "{not-a-valid-envelope" }, providerNative: native };
    }
    default:
      throw new Error(`bim qa double: unknown behavior tag '${payload.behaviorTag}'`);
  }
}

/**
 * Executes the edit fixture provider deterministically: replay (the
 * scripted resolved intent), refuse (the honest clarification computed
 * from the bundle's referenced elements and required parameters), empty
 * (an explicit unsupported-data refusal) or malformed (an undecodable
 * intent payload). The resolved intent is a PROPOSAL — nothing is ever
 * executed or applied.
 */
export function executeBimEditProvider(
  profile: ProviderProfile,
  input: { readonly payload: Record<string, unknown> },
): RawProviderExecution {
  const payload = input.payload as unknown as FixtureInputPayload;
  const native = {
    mediaType: "application/aise-bim-eval-fixture+json",
    payload: {
      engine: "bim-eval-fixture-double",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      behaviorTag: payload.behaviorTag,
      note: "opaque provider-native payload — provenance only; the resolved intent is a proposal, never executed",
    },
  };
  const capability = profile.capabilities[0] ?? "";
  switch (payload.behaviorTag) {
    case "replay": {
      if (payload.variantScript === undefined) {
        throw new Error("bim edit double: the replay behavior requires the variantScript");
      }
      return { capability, outputs: { intentJson: payload.variantScript }, providerNative: native };
    }
    case "refuse":
    case "empty": {
      const bundle = parseBimEditBundle(JSON.parse(payload.bundleJson));
      return {
        capability,
        failure: { kind: "unsupported-data", detail: bimEditRefusalDetail(bundle) },
        providerNative: native,
      };
    }
    case "malformed": {
      return { capability, outputs: { intentJson: "{not-a-valid-intent" }, providerNative: native };
    }
    default:
      throw new Error(`bim edit double: unknown behavior tag '${payload.behaviorTag}'`);
  }
}

/** Executes the fixture provider of the payload's lane (dispatch by capability). */
export function executeBimFixtureProvider(
  profile: ProviderProfile,
  input: { readonly payload: Record<string, unknown> },
): RawProviderExecution {
  const capability = profile.capabilities[0] ?? "";
  if (capability === BIM_EVAL_LANE_FIXTURE_PROVIDERS["ifc-bench-questions"].capability) {
    return executeBimQaProvider(profile, input);
  }
  if (capability === BIM_EVAL_LANE_FIXTURE_PROVIDERS["bim-edit-operations"].capability) {
    return executeBimEditProvider(profile, input);
  }
  throw new Error(`bim fixture double: unknown capability '${capability}'`);
}

/** The registry log entry for one corpus fixture: the lane's fixture profile + the double's execution. */
export function registryLogForQuestionFixture(
  fixture: BimQuestionFixture,
): ReasoningEvalRegistryLog {
  const profile = fixtureBimQaProviderProfile();
  return { profile, execution: executeBimQaProvider(profile, fixture.scenario.input) };
}

/** The registry log entry for one edit fixture: the edit fixture profile + the double's execution. */
export function registryLogForEditFixture(fixture: BimEditFixture): ReasoningEvalRegistryLog {
  const profile = fixtureBimEditProviderProfile();
  return { profile, execution: executeBimEditProvider(profile, fixture.input) };
}

/* ------------------------------------------------------------------ */
/* The committed corpus (29 fixtures)                                   */
/* ------------------------------------------------------------------ */

const NL_CREATE_WALL = "Create a new interior block wall on the first floor, 3.00 m long, 2.60 m high and 200 mm thick.";
const NL_CREATE_WALL_PARTIAL = "Create a new interior block wall on the first floor, 3.00 m long and 200 mm thick.";
const NL_UPDATE_FIRE_RATING_W1 = "Update the fire rating of wall W1 to REI 120.";
const NL_UPDATE_FIRE_RATING_W9 = "Update the fire rating of wall W9 to REI 120.";
const NL_SET_THICKNESS_W1 = "Set the thickness of wall W1 to 240 mm.";
const NL_DELETE_DOOR = "Remove door D1 from the ground floor.";
const NL_REASSIGN_WINDOW = "Reassign window WN1 from the ground floor to the first floor.";
const NL_REHOST_DOOR = "Rehost door D1 into wall W2.";
const NL_CREATE_OPENING = "Create an opening in wall W1 with a width of 1800 mm and a height of 2100 mm.";

const CREATE_WALL_PARAMETERS: readonly TypedOperationParameter[] = [
  { name: "length", value: 3, unit: "m" },
  { name: "height", value: 2.6, unit: "m" },
  { name: "thickness", value: 200, unit: "mm" },
];

const CREATE_WALL_COMMAND_QUANTITIES: readonly BimEditQuantity[] = [
  { name: "length", value: 3, unit: "m" },
  { name: "height", value: 2.6, unit: "m" },
  { name: "thickness", value: 200, unit: "mm" },
];

const CREATE_WALL_PARTIAL_QUANTITIES: readonly BimEditQuantity[] = [
  { name: "length", value: 3, unit: "m" },
  { name: "thickness", value: 200, unit: "mm" },
];

const CREATE_WALL_REQUIRED: readonly string[] = ["length", "height", "thickness"];

const WALL_W1_PROPERTIES = [{ elementId: "wall-W1", name: "thickness", value: 240, unit: "mm" }];

const MAX_OPENING_CONSTRAINT: BimEditConstraint = {
  constraintId: "max-opening-width-fire-wall-w1",
  kind: "max-numeric-parameter",
  statement:
    "Openings in the REI 90 fire wall W1 must not exceed 1200 mm in width (fire-compartment integrity).",
  parameterName: "width",
  maxValue: 1200,
  unit: "mm",
};

const WALL_THICKNESS_UNIT_CONSTRAINT: BimEditConstraint = {
  constraintId: "wall-thickness-unit-mm",
  kind: "parameter-unit",
  statement: "Wall thickness parameters are expressed in millimetres.",
  parameterName: "thickness",
  unit: "mm",
};

function buildQuestionCorpus(): readonly BimQuestionFixture[] {
  const fixtures: BimQuestionFixture[] = [];

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-property-lookup-correct",
      questionClass: "property-lookup",
      question: "What is the fire rating of wall W1?",
      requiredEvidenceIds: ["EV-WALL-W1"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({}),
      oracle: {
        claim: "Wall W1 has fire rating REI 90.",
        status: "supported",
        assumptions: ["the model extract of wall W1 is the governing revision r1"],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-quantity-lookup-correct",
      questionClass: "quantity-lookup",
      question: "What is the area of slab S1?",
      requiredEvidenceIds: ["EV-SLAB-S1"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-SLAB-S1"],
        facts: ["slab S1 has an area of 48.5 m2"],
        assumptions: ["the model extract of slab S1 is the governing revision r1"],
        resultClaim: "Slab S1 has an area of 48.5 m2.",
        invalidationConditions: ["a revision of the model extract that changes slab S1's area"],
        nextRecommendedAction: "verify the area against the architectural drawing set",
      }),
      oracle: {
        claim: "Slab S1 has an area of 48.5 m2.",
        status: "supported",
        assumptions: ["the model extract of slab S1 is the governing revision r1"],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-spatial-composition-correct",
      questionClass: "spatial-composition",
      question: "Which building elements does the Ground Floor (storey-00) contain?",
      requiredEvidenceIds: ["EV-SPATIAL"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-SPATIAL"],
        facts: ["storey-00 contains wall W1, wall W2, slab S1, door D1 and window WN1"],
        assumptions: ["the spatial composition extract is the governing revision r1"],
        resultClaim:
          "The Ground Floor (storey-00) contains wall W1, wall W2, slab S1, door D1 and window WN1.",
        invalidationConditions: ["a revision of the spatial composition that changes storey-00's contents"],
        nextRecommendedAction: "cross-check the containment against the storey view",
      }),
      oracle: {
        claim:
          "The Ground Floor (storey-00) contains wall W1, wall W2, slab S1, door D1 and window WN1.",
        status: "supported",
        assumptions: ["the spatial composition extract is the governing revision r1"],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-part-of-topology-correct",
      questionClass: "part-of-topology",
      question: "Which storey contains column C1?",
      requiredEvidenceIds: ["EV-COLUMN-C1"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-COLUMN-C1"],
        facts: ["column C1 is contained in storey-01 (First Floor)"],
        assumptions: ["the model extract of column C1 is the governing revision r1"],
        resultClaim: "Column C1 is contained in the First Floor (storey-01).",
        invalidationConditions: ["a revision of the model extract that reassigns column C1 to another storey"],
        nextRecommendedAction: "verify the containment against the storey plan",
      }),
      oracle: {
        claim: "Column C1 is contained in the First Floor (storey-01).",
        status: "supported",
        assumptions: ["the model extract of column C1 is the governing revision r1"],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-connected-to-topology-correct",
      questionClass: "connected-to-topology",
      question: "Which wall is connected to wall W1, and where?",
      requiredEvidenceIds: ["EV-TOPO"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-TOPO"],
        facts: ["wall W1 is connected to wall W2 at the north-east corner"],
        assumptions: ["the topology extract is the governing revision r1"],
        resultClaim: "Wall W1 is connected to wall W2 at the north-east corner.",
        invalidationConditions: ["a revision of the topology extract that changes wall W1's connections"],
        nextRecommendedAction: "verify the connection in the 3D model view",
      }),
      oracle: {
        claim: "Wall W1 is connected to wall W2 at the north-east corner.",
        status: "supported",
        assumptions: ["the topology extract is the governing revision r1"],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-classification-correct",
      questionClass: "classification",
      question: "What is the IFC classification of column C1?",
      requiredEvidenceIds: ["EV-COLUMN-C1"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-COLUMN-C1"],
        facts: ["column C1 is classified IfcColumn"],
        assumptions: ["the model extract of column C1 is the governing revision r1"],
        resultClaim: "Column C1 is classified IfcColumn.",
        invalidationConditions: ["a revision of the model extract that changes column C1's classification"],
        nextRecommendedAction: "verify the classification against the IFC schema assignment",
      }),
      oracle: {
        claim: "Column C1 is classified IfcColumn.",
        status: "supported",
        assumptions: ["the model extract of column C1 is the governing revision r1"],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-property-lookup-perception",
      questionClass: "property-lookup",
      question: "What is the fire rating of wall W1?",
      requiredEvidenceIds: ["EV-WALL-W1"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        facts: ["wall W1 has fire rating REI 120"],
        resultClaim: "Wall W1 has fire rating REI 120.",
        nextRecommendedAction: null,
      }),
      oracle: {
        claim: "Wall W1 has fire rating REI 90.",
        status: "supported",
        assumptions: ["the model extract of wall W1 is the governing revision r1"],
      },
      expectedKind: "perception-failure",
      expectedRules: ["facts-grounded-in-cited-evidence"],
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-property-lookup-retrieval",
      questionClass: "property-lookup",
      question: "What is the fire rating of wall W3?",
      requiredEvidenceIds: ["EV-WALL-W3"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-WALL-W1"],
        facts: ["wall W1 has fire rating REI 90"],
        assumptions: ["the model extract of wall W3 is the governing revision r1"],
        resultClaim: "Wall W3 has fire rating REI 90.",
        invalidationConditions: ["a revision of the model extract that changes wall W3's fire rating"],
        nextRecommendedAction: null,
      }),
      oracle: {
        claim: "Wall W3 has fire rating REI 60.",
        status: "supported",
        assumptions: ["the model extract of wall W3 is the governing revision r1"],
      },
      expectedKind: "retrieval-failure",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-quantity-lookup-reasoning",
      questionClass: "quantity-lookup",
      question: "Is slab S1 thicker than slab S2?",
      requiredEvidenceIds: ["EV-SLAB-S1", "EV-SLAB-S2"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-SLAB-S1", "EV-SLAB-S2"],
        facts: ["slab S1 has a thickness of 250 mm", "slab S2 has a thickness of 200 mm"],
        assumptions: ["the model extracts of slabs S1 and S2 are the governing revision r1"],
        resultClaim: "No — slab S1 is thinner than slab S2.",
        invalidationConditions: ["a revision of either slab's thickness"],
        nextRecommendedAction: null,
      }),
      oracle: {
        claim: "Yes — slab S1 (250 mm) is thicker than slab S2 (200 mm).",
        status: "supported",
        assumptions: ["the model extracts of slabs S1 and S2 are the governing revision r1"],
      },
      expectedKind: "reasoning-failure",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-property-lookup-unsupported",
      questionClass: "property-lookup",
      question: "What is the U-value of wall W1?",
      requiredEvidenceIds: [],
      scope: "out-of-scope",
      behavior: "refuse",
      oracle: { claim: null, status: "unsupported", assumptions: [] },
      expectedKind: "unsupported-data",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-unavailable-element",
      questionClass: "property-lookup",
      negativeCase: "unavailable-geometry",
      question: "What is the fire rating of wall W9?",
      requiredEvidenceIds: [],
      scope: "out-of-scope",
      behavior: "refuse",
      oracle: { claim: null, status: "unsupported", assumptions: [] },
      expectedKind: "unsupported-data",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-fabricated-evidence",
      questionClass: "property-lookup",
      question: "What is the width of door D1?",
      requiredEvidenceIds: ["EV-DOOR-D1"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-DOOR-D9"],
        facts: [],
        assumptions: ["the model extract of door D1 is the governing revision r1"],
        deterministicChecks: [],
        resultClaim: "Door D1 is 950 mm wide.",
        invalidationConditions: [],
        nextRecommendedAction: null,
      }),
      oracle: {
        claim: "Door D1 has a width of 900 mm.",
        status: "supported",
        assumptions: ["the model extract of door D1 is the governing revision r1"],
      },
      expectedKind: "unsupported-data",
      expectedRules: ["cited-evidence-exists"],
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-conflicting-evidence",
      questionClass: "property-lookup",
      negativeCase: "conflicting-evidence",
      question: "What is the fire rating of wall W3?",
      requiredEvidenceIds: ["EV-WALL-W3", "EV-WALL-W3-INSPECT"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-WALL-W3", "EV-WALL-W3-INSPECT"],
        facts: ["wall W3 has fire rating REI 60", "the inspection note records wall W3's fire rating as REI 90"],
        assumptions: [],
        deterministicChecks: [],
        resultClaim:
          "The authorized evidence conflicts on wall W3's fire rating: the model extract states REI 60 while the inspection note records REI 90.",
        resultStatus: "conflicted",
        invalidationConditions: ["a reconciling revision of wall W3's fire-rating evidence"],
        nextRecommendedAction: "resolve the conflict against the authoritative model revision before use",
      }),
      oracle: {
        claim:
          "The authorized evidence conflicts on wall W3's fire rating: the model extract states REI 60 while the inspection note records REI 90.",
        status: "conflicted",
        assumptions: [],
      },
      expectedKind: "none",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-conflicting-evidence-silent-resolution",
      questionClass: "property-lookup",
      negativeCase: "conflicting-evidence",
      question: "What is the fire rating of wall W3?",
      requiredEvidenceIds: ["EV-WALL-W3", "EV-WALL-W3-INSPECT"],
      scope: "in-scope",
      behavior: "replay",
      script: qaScript({
        evidenceIds: ["EV-WALL-W3", "EV-WALL-W3-INSPECT"],
        facts: ["wall W3 has fire rating REI 60", "the inspection note records wall W3's fire rating as REI 90"],
        assumptions: [],
        deterministicChecks: [],
        resultClaim: "Wall W3 has fire rating REI 90.",
        resultStatus: "supported",
        invalidationConditions: [],
        nextRecommendedAction: null,
      }),
      oracle: {
        claim:
          "The authorized evidence conflicts on wall W3's fire rating: the model extract states REI 60 while the inspection note records REI 90.",
        status: "conflicted",
        assumptions: [],
      },
      expectedKind: "reasoning-failure",
    }),
  );

  fixtures.push(
    buildQuestionFixture({
      fixtureId: "ifc-malformed-envelope",
      questionClass: "property-lookup",
      question: "What is the fire rating of wall W1?",
      requiredEvidenceIds: ["EV-WALL-W1"],
      scope: "in-scope",
      behavior: "malformed",
      oracle: {
        claim: "Wall W1 has fire rating REI 90.",
        status: "supported",
        assumptions: ["the model extract of wall W1 is the governing revision r1"],
      },
      expectedKind: "contract-mismatch",
      expectedRules: ["output-contract-normalizable"],
    }),
  );

  return fixtures;
}

function buildEditCorpus(): readonly BimEditFixture[] {
  const fixtures: BimEditFixture[] = [];

  /* -- element-create (the natural-language form) ------------------------ */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-create-correct",
      editClass: "element-create",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_CREATE_WALL },
      commandQuantities: CREATE_WALL_COMMAND_QUANTITIES,
      requiredParameters: CREATE_WALL_REQUIRED,
      referencedElements: [{ elementId: "storey-01", exists: true }],
      elementProperties: [{ elementId: "storey-01", name: "elevation", value: 3.2, unit: "m" }],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-create-correct",
        operationType: "block-wall-placement",
        parameters: CREATE_WALL_PARAMETERS,
        targetSelectorKind: "storey",
        targetNodeRefs: ["storey-01"],
        targetDescription: "the first floor the new interior block wall is placed on",
        commandText: NL_CREATE_WALL,
      }),
      expectedIntent: {
        operationType: "block-wall-placement",
        parameters: CREATE_WALL_PARAMETERS,
        targetSelectorKind: "storey",
        targetNodeRefs: ["storey-01"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "none",
      expectedOracleMatch: true,
    }),
  );

  /* -- element-create (the direct-intent form — the same semantics) ------ */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-create-direct-intent",
      editClass: "element-create",
      commandForm: "direct-intent",
      command: {
        form: "direct-intent",
        intent: {
          operationType: "block-wall-placement",
          parameters: CREATE_WALL_PARAMETERS,
          targetSelectorKind: "storey",
          targetNodeRefs: ["storey-01"],
          targetUnits: TARGET_UNITS,
        },
      },
      commandQuantities: CREATE_WALL_COMMAND_QUANTITIES,
      requiredParameters: CREATE_WALL_REQUIRED,
      referencedElements: [{ elementId: "storey-01", exists: true }],
      elementProperties: [{ elementId: "storey-01", name: "elevation", value: 3.2, unit: "m" }],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-create-direct-intent",
        operationType: "block-wall-placement",
        parameters: CREATE_WALL_PARAMETERS,
        targetSelectorKind: "storey",
        targetNodeRefs: ["storey-01"],
        targetDescription: "the first floor the new interior block wall is placed on",
        derivationNote: "operator authored the block-wall placement directly in the BIM editing view",
      }),
      expectedIntent: {
        operationType: "block-wall-placement",
        parameters: CREATE_WALL_PARAMETERS,
        targetSelectorKind: "storey",
        targetNodeRefs: ["storey-01"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "none",
      expectedOracleMatch: true,
    }),
  );

  /* -- element-update ------------------------------------------------------ */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-update-correct",
      editClass: "element-update",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_UPDATE_FIRE_RATING_W1 },
      commandQuantities: [],
      requiredParameters: ["fire-rating"],
      referencedElements: [{ elementId: "wall-W1", exists: true }],
      elementProperties: WALL_W1_PROPERTIES,
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-update-correct",
        operationType: "element-property-update",
        parameters: [{ name: "fire-rating", value: "REI 120" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetDescription: "the ground-floor east wall whose fire rating is updated",
        commandText: NL_UPDATE_FIRE_RATING_W1,
      }),
      expectedIntent: {
        operationType: "element-property-update",
        parameters: [{ name: "fire-rating", value: "REI 120" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "none",
      expectedOracleMatch: true,
    }),
  );

  /* -- element-delete ------------------------------------------------------ */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-delete-correct",
      editClass: "element-delete",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_DELETE_DOOR },
      commandQuantities: [],
      requiredParameters: ["disposition"],
      referencedElements: [{ elementId: "door-D1", exists: true }],
      elementProperties: [],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-delete-correct",
        operationType: "demolition-removal",
        parameters: [{ name: "disposition", value: "remove-and-dispose" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["door-D1"],
        targetDescription: "the entrance door being removed",
        commandText: NL_DELETE_DOOR,
      }),
      expectedIntent: {
        operationType: "demolition-removal",
        parameters: [{ name: "disposition", value: "remove-and-dispose" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["door-D1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "none",
      expectedOracleMatch: true,
    }),
  );

  /* -- spatial-change ------------------------------------------------------ */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-spatial-change-correct",
      editClass: "spatial-change",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_REASSIGN_WINDOW },
      commandQuantities: [],
      requiredParameters: ["target-storey"],
      referencedElements: [{ elementId: "window-WN1", exists: true }],
      elementProperties: [],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-spatial-change-correct",
        operationType: "element-spatial-reassignment",
        parameters: [{ name: "target-storey", value: "storey-01" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["window-WN1"],
        targetDescription: "the north window being reassigned to the first floor",
        commandText: NL_REASSIGN_WINDOW,
      }),
      expectedIntent: {
        operationType: "element-spatial-reassignment",
        parameters: [{ name: "target-storey", value: "storey-01" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["window-WN1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "none",
      expectedOracleMatch: true,
    }),
  );

  /* -- topological-change -------------------------------------------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-topological-change-correct",
      editClass: "topological-change",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_REHOST_DOOR },
      commandQuantities: [],
      requiredParameters: ["host-element"],
      referencedElements: [
        { elementId: "door-D1", exists: true },
        { elementId: "wall-W2", exists: true },
      ],
      elementProperties: [],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-topological-change-correct",
        operationType: "element-rehosting",
        parameters: [{ name: "host-element", value: "wall-W2" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["door-D1"],
        targetDescription: "the entrance door being rehosted into the ground-floor north wall",
        commandText: NL_REHOST_DOOR,
      }),
      expectedIntent: {
        operationType: "element-rehosting",
        parameters: [{ name: "host-element", value: "wall-W2" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["door-D1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "none",
      expectedOracleMatch: true,
    }),
  );

  /* -- negative: unavailable geometry (the honest refusal) ----------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-unavailable-geometry",
      editClass: "element-update",
      commandForm: "natural-language",
      negativeCase: "unavailable-geometry",
      command: { form: "natural-language", text: NL_UPDATE_FIRE_RATING_W9 },
      commandQuantities: [],
      requiredParameters: ["fire-rating"],
      referencedElements: [{ elementId: "wall-W9", exists: false }],
      elementProperties: [],
      constraints: [],
      behavior: "refuse",
      expectedIntent: null,
      expectedKind: "unsupported-data",
      expectedOracleMatch: false,
    }),
  );

  /* -- negative: unavailable geometry (the caught fabrication) ------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-fabricated-target",
      editClass: "element-update",
      commandForm: "natural-language",
      negativeCase: "unavailable-geometry",
      command: { form: "natural-language", text: NL_UPDATE_FIRE_RATING_W9 },
      commandQuantities: [],
      requiredParameters: ["fire-rating"],
      referencedElements: [{ elementId: "wall-W9", exists: false }],
      elementProperties: [],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-fabricated-target",
        operationType: "element-property-update",
        parameters: [{ name: "fire-rating", value: "REI 120" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W9"],
        targetDescription: "the referenced wall whose fire rating is updated",
        commandText: NL_UPDATE_FIRE_RATING_W9,
      }),
      expectedIntent: null,
      expectedKind: "unsupported-data",
      expectedRules: ["target-references-existing-elements"],
      expectedOracleMatch: false,
    }),
  );

  /* -- negative: missing dimensions (the honest clarification) ------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-missing-dimensions",
      editClass: "element-create",
      commandForm: "natural-language",
      negativeCase: "missing-dimensions",
      command: { form: "natural-language", text: NL_CREATE_WALL_PARTIAL },
      commandQuantities: CREATE_WALL_PARTIAL_QUANTITIES,
      requiredParameters: CREATE_WALL_REQUIRED,
      referencedElements: [{ elementId: "storey-01", exists: true }],
      elementProperties: [{ elementId: "storey-01", name: "elevation", value: 3.2, unit: "m" }],
      constraints: [],
      behavior: "refuse",
      expectedIntent: null,
      expectedKind: "unsupported-data",
      expectedOracleMatch: false,
    }),
  );

  /* -- negative: missing dimensions (the caught invented measurement) ------ */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-invented-dimension",
      editClass: "element-create",
      commandForm: "natural-language",
      negativeCase: "missing-dimensions",
      command: { form: "natural-language", text: NL_CREATE_WALL_PARTIAL },
      commandQuantities: CREATE_WALL_PARTIAL_QUANTITIES,
      requiredParameters: CREATE_WALL_REQUIRED,
      referencedElements: [{ elementId: "storey-01", exists: true }],
      elementProperties: [{ elementId: "storey-01", name: "elevation", value: 3.2, unit: "m" }],
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-invented-dimension",
        operationType: "block-wall-placement",
        parameters: [
          { name: "length", value: 3, unit: "m" },
          { name: "thickness", value: 200, unit: "mm" },
          { name: "height", value: 2.6, unit: "m" },
        ],
        targetSelectorKind: "storey",
        targetNodeRefs: ["storey-01"],
        targetDescription: "the first floor the new interior block wall is placed on",
        commandText: NL_CREATE_WALL_PARTIAL,
      }),
      expectedIntent: null,
      expectedKind: "perception-failure",
      expectedRules: ["parameters-grounded-in-bundle"],
      expectedOracleMatch: false,
    }),
  );

  /* -- negative: invalid constraints (the violated constraint NAMED) ------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-invalid-constraint",
      editClass: "element-create",
      commandForm: "natural-language",
      negativeCase: "invalid-constraints",
      command: { form: "natural-language", text: NL_CREATE_OPENING },
      commandQuantities: [
        { name: "width", value: 1800, unit: "mm" },
        { name: "height", value: 2100, unit: "mm" },
      ],
      requiredParameters: ["width", "height"],
      referencedElements: [{ elementId: "wall-W1", exists: true }],
      elementProperties: WALL_W1_PROPERTIES,
      constraints: [MAX_OPENING_CONSTRAINT],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-invalid-constraint",
        operationType: "opening-creation",
        parameters: [
          { name: "width", value: 1800, unit: "mm" },
          { name: "height", value: 2100, unit: "mm" },
        ],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetDescription: "the ground-floor east wall receiving the new opening",
        commandText: NL_CREATE_OPENING,
      }),
      expectedIntent: {
        operationType: "opening-creation",
        parameters: [
          { name: "width", value: 1800, unit: "mm" },
          { name: "height", value: 2100, unit: "mm" },
        ],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "operation-semantic-failure",
      expectedRules: ["constraints-honored"],
      expectedOracleMatch: true,
    }),
  );

  /* -- negative: wrong unit (an operation-semantic failure) ---------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-wrong-unit",
      editClass: "element-update",
      commandForm: "natural-language",
      negativeCase: "invalid-constraints",
      command: { form: "natural-language", text: NL_SET_THICKNESS_W1 },
      commandQuantities: [{ name: "thickness", value: 240, unit: "mm" }],
      requiredParameters: ["thickness"],
      referencedElements: [{ elementId: "wall-W1", exists: true }],
      elementProperties: WALL_W1_PROPERTIES,
      constraints: [WALL_THICKNESS_UNIT_CONSTRAINT],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-wrong-unit",
        operationType: "element-property-update",
        parameters: [{ name: "thickness", value: 240, unit: "cm" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetDescription: "the ground-floor east wall whose thickness is set",
        commandText: NL_SET_THICKNESS_W1,
      }),
      expectedIntent: {
        operationType: "element-property-update",
        parameters: [{ name: "thickness", value: 240, unit: "mm" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "operation-semantic-failure",
      expectedRules: ["command-semantics-honored", "constraints-honored"],
      expectedOracleMatch: false,
    }),
  );

  /* -- negative: wrong target (an existing-but-wrong element) -------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-wrong-target",
      editClass: "element-update",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_UPDATE_FIRE_RATING_W1 },
      commandQuantities: [],
      requiredParameters: ["fire-rating"],
      referencedElements: [{ elementId: "wall-W1", exists: true }],
      elementProperties: WALL_W1_PROPERTIES,
      constraints: [],
      behavior: "replay",
      script: editIntent({
        intentId: "intent-bim-edit-wrong-target",
        operationType: "element-property-update",
        parameters: [{ name: "fire-rating", value: "REI 120" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W2"],
        targetDescription: "the ground-floor north wall (wrongly targeted)",
        commandText: NL_UPDATE_FIRE_RATING_W1,
      }),
      expectedIntent: {
        operationType: "element-property-update",
        parameters: [{ name: "fire-rating", value: "REI 120" }],
        targetSelectorKind: "element",
        targetNodeRefs: ["wall-W1"],
        targetUnits: TARGET_UNITS,
      },
      expectedKind: "operation-semantic-failure",
      expectedRules: ["command-semantics-honored"],
      expectedOracleMatch: false,
    }),
  );

  /* -- negative: malformed intent payload ---------------------------------- */

  fixtures.push(
    buildEditFixture({
      fixtureId: "bim-edit-malformed-intent",
      editClass: "element-update",
      commandForm: "natural-language",
      command: { form: "natural-language", text: NL_UPDATE_FIRE_RATING_W1 },
      commandQuantities: [],
      requiredParameters: ["fire-rating"],
      referencedElements: [{ elementId: "wall-W1", exists: true }],
      elementProperties: WALL_W1_PROPERTIES,
      constraints: [],
      behavior: "malformed",
      expectedIntent: null,
      expectedKind: "contract-mismatch",
      expectedRules: ["intent-contract-decodable"],
      expectedOracleMatch: false,
    }),
  );

  return fixtures;
}

/** The committed HFX-204 corpus (29 fixtures — deterministic construction). */
export const BIM_EVAL_QUESTION_FIXTURES: readonly BimQuestionFixture[] = buildQuestionCorpus();
export const BIM_EVAL_EDIT_FIXTURES: readonly BimEditFixture[] = buildEditCorpus();

/** A fresh deterministic corpus construction (byte-identical to the constants). */
export function bimEvalQuestionFixtures(): readonly BimQuestionFixture[] {
  return buildQuestionCorpus();
}

/** A fresh deterministic corpus construction (byte-identical to the constants). */
export function bimEvalEditFixtures(): readonly BimEditFixture[] {
  return buildEditCorpus();
}

/* ------------------------------------------------------------------ */
/* The suite run + the summary                                          */
/* ------------------------------------------------------------------ */

/** The unified projection of one outcome (the summary's input). */
export interface BimEvalOutcomeView {
  readonly fixtureId: string;
  readonly lane: "ifc-bench-questions" | "bim-edit-operations";
  readonly fixtureClass: string;
  readonly negativeCase?: BimNegativeCaseClass;
  readonly classification: string;
  readonly violationRules: readonly string[];
  readonly violationKinds: readonly string[];
  readonly resultStatus?: string;
  readonly oracleMatch?: boolean;
  readonly inputDigest: string;
  readonly normalizedResultDigest: string;
  readonly recordId: string;
  readonly manifestId: string;
  readonly metrics: {
    readonly classificationMatch: number;
    readonly integrityViolations: number;
    readonly expectedOutcomeMatch: number;
    readonly oracleSemanticsMatch?: number;
  };
  readonly expectedMatch: boolean;
}

/** Projects a question outcome into the unified view. */
export function bimQuestionOutcomeViewOf(outcome: BimQuestionOutcome): BimEvalOutcomeView {
  return {
    fixtureId: outcome.fixtureId,
    lane: outcome.lane,
    fixtureClass: outcome.questionClass,
    ...(outcome.negativeCase === undefined ? {} : { negativeCase: outcome.negativeCase }),
    classification: outcome.layer2.classification,
    violationRules: outcome.layer2.violations.map((violation) => violation.rule),
    violationKinds: outcome.layer2.violations.map((violation) => violation.kind),
    resultStatus: outcome.layer2.envelope.resultStatus,
    inputDigest: outcome.layer2.inputDigest,
    normalizedResultDigest: outcome.layer2.normalizedResultDigest,
    recordId: outcome.benchmarkRecord.recordId,
    manifestId: outcome.provenanceManifest.manifestId,
    metrics: {
      classificationMatch: outcome.layer2.fieldMatches.classification ? 1 : 0,
      integrityViolations: outcome.layer2.violations.length,
      expectedOutcomeMatch: outcome.layer2.expectedMatch ? 1 : 0,
    },
    expectedMatch: outcome.layer2.expectedMatch,
  };
}

/** Projects an edit outcome into the unified view. */
export function bimEditOutcomeViewOf(outcome: BimEditOutcome): BimEvalOutcomeView {
  return {
    fixtureId: outcome.fixtureId,
    lane: outcome.lane,
    fixtureClass: outcome.editClass,
    ...(outcome.negativeCase === undefined ? {} : { negativeCase: outcome.negativeCase }),
    classification: outcome.classification,
    violationRules: outcome.violations.map((violation) => violation.rule),
    violationKinds: outcome.violations.map((violation) => violation.kind),
    oracleMatch: outcome.oracleMatch,
    inputDigest: outcome.inputDigest,
    normalizedResultDigest: outcome.normalizedResultDigest,
    recordId: outcome.benchmarkRecord.recordId,
    manifestId: outcome.provenanceManifest.manifestId,
    metrics: {
      classificationMatch: outcome.fieldMatches.classification ? 1 : 0,
      integrityViolations: outcome.violations.length,
      expectedOutcomeMatch: outcome.expectedMatch ? 1 : 0,
      oracleSemanticsMatch: outcome.oracleMatch ? 1 : 0,
    },
    expectedMatch: outcome.expectedMatch,
  };
}

/** The corpus suite summary (the discrimination + negative-case coverage tables). */
export interface BimEvalSuiteSummary {
  readonly total: number;
  readonly byLane: Readonly<Record<string, number>>;
  readonly byClassification: Readonly<Record<string, number>>;
  readonly byQuestionClass: Readonly<Record<string, number>>;
  readonly byEditClass: Readonly<Record<string, number>>;
  readonly classificationMatches: number;
  readonly expectedMatches: number;
  readonly discriminationCoverage: Readonly<Record<string, readonly string[]>>;
  readonly negativeCaseCoverage: Readonly<Record<string, readonly string[]>>;
  readonly provenanceManifestDigest: string;
}

/** The full corpus suite run: both lanes' outcomes + the summary. */
export interface BimEvalSuiteRun {
  readonly questionOutcomes: readonly BimQuestionOutcome[];
  readonly editOutcomes: readonly BimEditOutcome[];
  readonly summary: BimEvalSuiteSummary;
}

/** Summarizes outcome views into the suite summary (pure; the tables are sorted). */
export function bimEvalSuiteSummaryOf(views: readonly BimEvalOutcomeView[]): BimEvalSuiteSummary {
  const byLane: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const byQuestionClass: Record<string, number> = {};
  const byEditClass: Record<string, number> = {};
  const coverage: Record<string, Set<string>> = {};
  const negatives: Record<string, string[]> = {};
  let classificationMatches = 0;
  let expectedMatches = 0;
  for (const view of views) {
    byLane[view.lane] = (byLane[view.lane] ?? 0) + 1;
    byClassification[view.classification] = (byClassification[view.classification] ?? 0) + 1;
    if (view.lane === "ifc-bench-questions") {
      byQuestionClass[view.fixtureClass] = (byQuestionClass[view.fixtureClass] ?? 0) + 1;
    } else {
      byEditClass[view.fixtureClass] = (byEditClass[view.fixtureClass] ?? 0) + 1;
    }
    const laneCoverage = coverage[view.lane] ?? new Set<string>();
    laneCoverage.add(view.classification);
    coverage[view.lane] = laneCoverage;
    if (view.negativeCase !== undefined) {
      const list = negatives[view.negativeCase] ?? [];
      list.push(view.fixtureId);
      negatives[view.negativeCase] = list;
    }
    if (view.metrics.classificationMatch === 1) {
      classificationMatches += 1;
    }
    if (view.expectedMatch) {
      expectedMatches += 1;
    }
  }
  const discriminationCoverage: Record<string, readonly string[]> = {};
  for (const lane of Object.keys(coverage).sort()) {
    discriminationCoverage[lane] = [...(coverage[lane] ?? new Set<string>())].sort();
  }
  const negativeCaseCoverage: Record<string, readonly string[]> = {};
  for (const negativeClass of Object.keys(negatives).sort()) {
    negativeCaseCoverage[negativeClass] = [...(negatives[negativeClass] ?? [])].sort();
  }
  return {
    total: views.length,
    byLane: Object.fromEntries(Object.entries(byLane).sort(([a], [b]) => a.localeCompare(b))),
    byClassification: Object.fromEntries(
      Object.entries(byClassification).sort(([a], [b]) => a.localeCompare(b)),
    ),
    byQuestionClass: Object.fromEntries(
      Object.entries(byQuestionClass).sort(([a], [b]) => a.localeCompare(b)),
    ),
    byEditClass: Object.fromEntries(
      Object.entries(byEditClass).sort(([a], [b]) => a.localeCompare(b)),
    ),
    classificationMatches,
    expectedMatches,
    discriminationCoverage,
    negativeCaseCoverage,
    provenanceManifestDigest: canonicalDigestOf(views.map((view) => view.manifestId)),
  };
}

/** Runs the full committed corpus through the harness (deterministic). */
export function runBimEvalSuite(): BimEvalSuiteRun {
  const questionOutcomes = bimEvalQuestionFixtures().map((fixture) =>
    evaluateQuestionFixture(fixture, registryLogForQuestionFixture(fixture)),
  );
  const editOutcomes = bimEvalEditFixtures().map((fixture) =>
    evaluateEditFixture(fixture, registryLogForEditFixture(fixture)),
  );
  const views = [
    ...questionOutcomes.map((outcome) => bimQuestionOutcomeViewOf(outcome)),
    ...editOutcomes.map((outcome) => bimEditOutcomeViewOf(outcome)),
  ];
  return { questionOutcomes, editOutcomes, summary: bimEvalSuiteSummaryOf(views) };
}

/* ------------------------------------------------------------------ */
/* The committed-artifact goldens (the tools/bim-eval projection)       */
/* ------------------------------------------------------------------ */

/** The committed scenario.json content (the canonical projection of the corpus). */
export function goldenScenarioSuiteJson(): string {
  return canonicalJsonText({
    suiteId: BIM_EVAL_SUITE_ID,
    version: BIM_EVAL_SUITE_VERSION,
    benchmarkId: BIM_EVAL_BENCHMARK_ID,
    codeVersion: BIM_EVAL_CODE_VERSION,
    buildingModel: {
      modelId: BIM_EVAL_BUILDING_MODEL.modelId,
      revision: BIM_EVAL_BUILDING_MODEL.revision,
      digest: buildingModelDigest(),
    },
    upstream: {
      ifcBench: IFC_BENCH_UPSTREAM_MANIFEST,
      bimEdit: BIM_EDIT_UPSTREAM_MANIFEST,
    },
    fixtureCount: BIM_EVAL_QUESTION_FIXTURES.length + BIM_EVAL_EDIT_FIXTURES.length,
    fixtures: [
      ...BIM_EVAL_QUESTION_FIXTURES,
      ...BIM_EVAL_EDIT_FIXTURES,
    ],
  });
}

/** The committed fixtures/expected-outcomes.json content (the canonical projection of a suite run). */
export function goldenExpectedOutcomesJson(): string {
  const run = runBimEvalSuite();
  const views = [
    ...run.questionOutcomes.map((outcome) => bimQuestionOutcomeViewOf(outcome)),
    ...run.editOutcomes.map((outcome) => bimEditOutcomeViewOf(outcome)),
  ];
  return canonicalJsonText({
    suiteId: BIM_EVAL_SUITE_ID,
    version: BIM_EVAL_SUITE_VERSION,
    benchmarkId: BIM_EVAL_BENCHMARK_ID,
    codeVersion: BIM_EVAL_CODE_VERSION,
    scenarioCount: views.length,
    upstream: {
      ifcBench: {
        upstreamId: IFC_BENCH_UPSTREAM_MANIFEST.upstreamId,
        pinnedVersion: IFC_BENCH_UPSTREAM_MANIFEST.pinnedVersion,
        evaluationOnly: IFC_BENCH_UPSTREAM_MANIFEST.license.evaluationOnly,
      },
      bimEdit: {
        upstreamId: BIM_EDIT_UPSTREAM_MANIFEST.upstreamId,
        pinnedVersion: BIM_EDIT_UPSTREAM_MANIFEST.pinnedVersion,
        evaluationOnly: BIM_EDIT_UPSTREAM_MANIFEST.license.evaluationOnly,
      },
    },
    outcomes: views,
    summary: run.summary,
  });
}

/* ------------------------------------------------------------------ */
/* The control-plane registry lifecycle over the corpus                 */
/* ------------------------------------------------------------------ */

/** The registry lifecycle projection of the corpus (one entry per lane provider). */
export interface BimEvalRegistryLifecycleResult {
  readonly eventCount: number;
  readonly entries: readonly {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly state: string;
    readonly benchmarkRecordIds: readonly string[];
    readonly provenanceManifestIds: readonly string[];
  }[];
  /** replayRegistry(events) reproduces the identical derived entries (the event-sourcing proof). */
  readonly replayEqual: boolean;
}

/**
 * Drives the committed corpus through the REAL control-plane registry:
 * registration → evaluation → execution-normalized per fixture → ONE
 * consolidated benchmark record + ONE consolidated provenance manifest per
 * lane provider. No promotion is requested — the fixture providers are
 * doubles; promotion semantics belong to HFX-401's scorecard (the gates
 * remain available to the Lead).
 */
export function driveBimEvalRegistryLifecycle(): BimEvalRegistryLifecycleResult {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `bim eval registry lifecycle: event '${event.kind}' was refused: ${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  const lanes = ["ifc-bench-questions", "bim-edit-operations"] as const;
  const profiles = new Map<string, ProviderProfile>();
  for (const lane of lanes) {
    const profile = fixtureProfileForBimLane(lane);
    profiles.set(lane, profile);
    apply({ kind: "provider-registered", profile });
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }

  const questionOutcomes = bimEvalQuestionFixtures().map((fixture) => ({
    fixture,
    outcome: evaluateQuestionFixture(fixture, registryLogForQuestionFixture(fixture)),
  }));
  const editOutcomes = bimEvalEditFixtures().map((fixture) => ({
    fixture,
    outcome: evaluateEditFixture(fixture, registryLogForEditFixture(fixture)),
  }));

  for (const { fixture, outcome } of questionOutcomes) {
    const profile = profiles.get("ifc-bench-questions");
    if (profile === undefined) {
      throw new Error("bim eval registry lifecycle: the QA provider profile is missing");
    }
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: fixture.scenario.capability,
        inputDigest: outcome.layer2.inputDigest,
        normalizedResultDigest: outcome.layer2.normalizedResultDigest,
      },
    });
  }
  for (const { fixture, outcome } of editOutcomes) {
    const profile = profiles.get("bim-edit-operations");
    if (profile === undefined) {
      throw new Error("bim eval registry lifecycle: the edit provider profile is missing");
    }
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: fixture.capability,
        inputDigest: outcome.inputDigest,
        normalizedResultDigest: outcome.normalizedResultDigest,
      },
    });
  }

  const qaViews = questionOutcomes.map((entry) => bimQuestionOutcomeViewOf(entry.outcome));
  const editViews = editOutcomes.map((entry) => bimEditOutcomeViewOf(entry.outcome));
  const qaRecord = consolidatedProviderRecord(
    profiles.get("ifc-bench-questions") as ProviderProfile,
    "fixture-bim-question-answering",
    qaViews,
    "envelope_integrity_violations",
  );
  const editRecord = consolidatedProviderRecord(
    profiles.get("bim-edit-operations") as ProviderProfile,
    "fixture-bim-edit-translation",
    editViews,
    "intent_rule_violations",
  );
  apply({ kind: "benchmark-recorded", record: qaRecord });
  apply({ kind: "benchmark-recorded", record: editRecord });

  const sealFor = (
    profile: ProviderProfile,
    views: readonly BimEvalOutcomeView[],
    record: BenchmarkRecord,
  ): void => {
    apply({
      kind: "provenance-sealed",
      manifest: sealProvenanceManifest({
        profile,
        inputDigests: views.map((view) => view.inputDigest),
        normalizedResultDigest: canonicalDigestOf(views.map((view) => view.normalizedResultDigest)),
        benchmarkRecords: [record],
        environment: BIM_EVAL_ENVIRONMENT,
        consumer: BIM_EVAL_CONSUMER,
        reproducibilityStatement:
          "HFX-204 BIM evaluation (consolidated lane record): the registered fixture profile, the " +
          "lane's fixture input digests, the normalized result digests and the consolidated " +
          "benchmark record (digest above) fully determine this evaluation — identical inputs " +
          "reproduce the identical manifest",
      }),
    });
  };
  sealFor(profiles.get("ifc-bench-questions") as ProviderProfile, qaViews, qaRecord);
  sealFor(profiles.get("bim-edit-operations") as ProviderProfile, editViews, editRecord);

  const entries = registry.entries.map((entry) => ({
    providerId: entry.providerId,
    technologyVersion: entry.technologyVersion,
    state: entry.state,
    benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
    provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
  }));

  const replay = replayRegistry(events);
  if (!replay.ok) {
    throw new Error(`bim eval registry lifecycle: replay refused: ${replay.failure.detail}`);
  }
  const replayEntries = replay.registry.entries.map((entry) => ({
    providerId: entry.providerId,
    technologyVersion: entry.technologyVersion,
    state: entry.state,
    benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
    provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
  }));
  return {
    eventCount: events.length,
    entries,
    replayEqual: canonicalJsonText(entries) === canonicalJsonText(replayEntries),
  };
}

/**
 * Consolidates one provider's fixture views into the SINGLE control-plane
 * benchmark record the registry consumes (metrics carry per-fixture
 * subjectIds; failure observations are the provider's closed-vocabulary set).
 */
function consolidatedProviderRecord(
  profile: ProviderProfile,
  capability: string,
  views: readonly BimEvalOutcomeView[],
  violationMetricName: string,
): BenchmarkRecord {
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: BIM_EVAL_BENCHMARK_ID,
    capability,
    metrics: views.flatMap((view) => [
      {
        metric: "classification_match",
        value: view.metrics.classificationMatch,
        unit: "ratio",
        subjectId: view.fixtureId,
        detail:
          "the harness's failure-kind classification equals the expected five-way discrimination ground truth",
      },
      {
        metric: violationMetricName,
        value: view.metrics.integrityViolations,
        unit: "count",
        subjectId: view.fixtureId,
        detail:
          "the number of canonical integrity rules violated (closed-vocabulary observations)",
      },
      {
        metric: "expected_outcome_match",
        value: view.metrics.expectedOutcomeMatch,
        unit: "ratio",
        subjectId: view.fixtureId,
        detail: "every expected outcome field, the classification and the violation set matched",
      },
    ]),
    failureObservations: views.flatMap((view) => [
      ...(view.classification === "none"
        ? []
        : [
            {
              kind: view.classification,
              detail: `${view.fixtureId}: the observed classification (the §HF-2 discrimination join)`,
            },
          ]),
      ...view.violationKinds.map((kind, index) => ({
        kind,
        detail: `${view.fixtureId} ${view.violationRules[index] ?? ""}: closed-vocabulary integrity violation of the ${view.lane} lane`,
      })),
    ]),
    resourceObservations: BIM_EVAL_DECLARED_RESOURCES,
    reproduction: {
      inputsDigest: canonicalDigestOf(views.map((view) => view.inputDigest)),
      codeVersion: BIM_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the provider's fixture input digests (aggregated digest above) " +
        "through the committed fixture doubles at code version (above) always yield these metrics — " +
        "no clock, no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(`bim eval registry lifecycle: the consolidated record failed validation: ${issues}`);
  }
  return validated.record;
}
