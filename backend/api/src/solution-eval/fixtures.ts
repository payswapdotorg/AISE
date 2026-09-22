/**
 * PROD-029 — the COMMITTED SUBSTITUTION-MATRIX REFERENCE DATA.
 *
 * Everything the Layer-3 substitution harness needs beyond its code: the
 * pinned BASELINE WORLDS (the wall-upgrade journey of the engine's committed
 * golden fixtures; the command-corpus slice of the PROD-023 compiler), the
 * CANONICAL GOLDEN VALUES the faithful fixture substitutes replay (the
 * canonical components' committed behavior, carried as declared provider
 * data), the DIVERGENT MUTATIONS (each one subtler than the last — the
 * day-27 hard negatives), the eight SUBSTITUTE PROVIDER PROFILES (4 seams ×
 * {faithful, divergent} — provider-shaped, control-plane-valid, NO real
 * models), the CANONICAL REGISTRY LOG (registration + evaluation-started
 * for every substitute) and the COMMITTED SCENARIO MATRIX itself.
 *
 * Every value here is DETERMINISTIC REFERENCE DATA: no clock reads, no
 * randomness, no network, no filesystem. The committed golden values are
 * PROVEN against the canonical components by the co-located test suites
 * (fixtures.test.ts asserts the inline goldens equal the LIVE engine /
 * validator / BOQ-deriver / compiler outputs AND the packages' committed
 * golden fixtures — drift fails the root verify gate).
 *
 * The faithful doubles replay the canonical components' COMMITTED golden
 * behavior as declared provider data (a substitute that reproduces canonical
 * semantics exactly is PROVEN equal by the harness); the divergent doubles
 * carry exactly ONE well-defined deviation each (a substitute that deviates
 * is CAUGHT with the right closed-vocabulary failure kind — never hidden).
 */

import { toLicenseDeclaration, type ProviderIOContract, type ProviderProfile } from "@aise/provider-registry";
import type { FailureModeDeclaration, ProviderRegistryEvent } from "@aise/provider-registry";
import type {
  CanonicalBoqLine,
  CanonicalIntentSemantics,
  CanonicalQuantity,
  CanonicalValidationCheck,
  SubstitutionScenario,
} from "./model";
import type { AgentSessionContext } from "../reasoning/solution/model";

/* ------------------------------------------------------------------ */
/* The wall-upgrade baseline world (engine/validation/boq seams)         */
/* ------------------------------------------------------------------ */

/**
 * The pinned baseline journey: the contract corpus's wall-upgrade intents
 * (demolition → block wall → plaster), the same three committed fixtures
 * the engine's `wall-upgrade-expected.json` and the BOQ package's
 * `wall-upgrade-boq-expected.json` goldens were generated from. The harness
 * replays them LIVE through the REAL `@aise/solution-engine` /
 * `@aise/solution-boq` (the canonical components are imported and CALLED,
 * never re-implemented).
 */
export const WALL_UPGRADE_WORLD = {
  solutionId: "solution-demo-001",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "the committed wall-upgrade fixture journey of the solution-contract corpus (demolition, block wall, plaster)",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  validatedAt: "2026-09-16T11:00:00.000Z",
  /** The caller-injected state materialization clock (state index → instant). */
  materializeClock: (stateIndex: number): string =>
    new Date(Date.UTC(2026, 8, 16, 10, stateIndex, 0, 0)).toISOString(),
  /** The read-only baseline geometry table (the engine's committed fixture, verbatim). */
  baselineGeometry: {
    "geo-wall-faces-002": { value: 12.5, unit: "m2" },
    "geo-wall-line-003": { value: 5, unit: "m2" },
    "geo-slab-region-005": { value: 12, unit: "m2" },
    "geo-pit-outline-001": { value: 6, unit: "m2" },
  } as Record<string, { value: number; unit: string }>,
} as const;

/**
 * The three committed intent payloads (verbatim copies of
 * `packages/solution-contract/fixtures/operation/
 * EngineeringOperationIntent.valid-{demolition-removal, block-wall-placement,
 * plaster-application}.json` — fixtures.test.ts asserts the byte-equality).
 */
export const WALL_UPGRADE_INTENT_PAYLOADS: readonly Record<string, unknown>[] = [
  {
    contractVersion: "1.0.0",
    dependsOn: [],
    domain: {
      contractVersion: "1.0.0",
      extensions: [
        { kind: "building-element-taxonomy", ref: "aise-building-elements", version: "1.0.0" },
      ],
      operationVocabulary: "aise-building-operations-v1",
      vertical: "building",
    },
    intentId: "intent-demo-0010",
    operationType: "demolition-removal",
    parameters: [
      { name: "length", unit: "m", value: 5 },
      { name: "height", unit: "m", value: 2.4 },
      { name: "thickness", unit: "m", value: 0.1 },
    ],
    proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 },
    provenance: {
      authoredAt: "2026-09-16T09:00:00.000Z",
      authoredBy: "user-demo-engineer",
      derivationNote: "operator removed the damaged plaster and wall section by direct selection",
      evidenceIds: [],
      interactionDetail: "operator selected the damaged wall faces and invoked remove",
      origin: "direct-manipulation",
    },
    target: {
      contractVersion: "1.0.0",
      description: "The affected ground-floor wall faces",
      geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
      nodeRefs: ["node-wall-002"],
      selectorKind: "face-set",
      units: { angular: "rad", linear: "m" },
    },
  },
  {
    contractVersion: "1.0.0",
    dependsOn: [],
    domain: {
      contractVersion: "1.0.0",
      extensions: [
        { kind: "building-element-taxonomy", ref: "aise-building-elements", version: "1.0.0" },
      ],
      operationVocabulary: "aise-building-operations-v1",
      vertical: "building",
    },
    intentId: "intent-demo-0011",
    operationType: "block-wall-placement",
    parameters: [
      { name: "length", unit: "m", value: 5 },
      { name: "height", unit: "m", value: 1 },
      { name: "thickness", unit: "m", value: 0.1 },
      { name: "material", value: "concrete-block" },
    ],
    proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 },
    provenance: {
      authoredAt: "2026-09-16T09:10:00.000Z",
      authoredBy: "agent-demo-assistant",
      commandText: "Lay blocks to a height of 1 m along this wall.",
      evidenceIds: [],
      origin: "agent",
    },
    target: {
      contractVersion: "1.0.0",
      description: "The wall line along the damaged section",
      geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
      nodeRefs: ["node-wall-002"],
      selectorKind: "line-extent",
      units: { angular: "rad", linear: "m" },
    },
  },
  {
    contractVersion: "1.0.0",
    dependsOn: [],
    domain: {
      contractVersion: "1.0.0",
      extensions: [
        { kind: "building-element-taxonomy", ref: "aise-building-elements", version: "1.0.0" },
      ],
      operationVocabulary: "aise-building-operations-v1",
      vertical: "building",
    },
    intentId: "intent-demo-0012",
    operationType: "plaster-application",
    parameters: [
      { name: "thickness", unit: "mm", value: 30 },
      { name: "material", value: "cement-plaster" },
    ],
    proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 },
    provenance: {
      authoredAt: "2026-09-16T09:15:00.000Z",
      authoredBy: "agent-demo-assistant",
      commandText: "Apply 30 mm plaster to the affected wall faces.",
      evidenceIds: [],
      origin: "agent",
    },
    target: {
      contractVersion: "1.0.0",
      description: "The affected ground-floor wall faces",
      geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
      nodeRefs: ["node-wall-002"],
      selectorKind: "face-set",
      units: { angular: "rad", linear: "m" },
    },
  },
];

/** The canonical engine step chain of the wall-upgrade journey (the committed golden). */
export interface EngineStepGolden {
  readonly stepIndex: number;
  readonly intentRef: string;
  readonly operationType: string;
  readonly resultingStateId: string;
  readonly stateContentDigest: string;
  readonly quantities: readonly CanonicalQuantity[];
}

/**
 * The engine's COMMITTED golden state chain (from
 * `packages/solution-engine/fixtures/wall-upgrade-expected.json`): the
 * faithful fixture-engine-provider replays these as its declared outputs.
 */
export const CANONICAL_ENGINE_STEPS: readonly EngineStepGolden[] = [
  {
    stepIndex: 1,
    intentRef: "intent-demo-0010",
    operationType: "demolition-removal",
    resultingStateId: "cb7cc34aa2a883d14ceff1fc4146113077598c2c09c051ab284019d8a0f6e764",
    stateContentDigest: "6f95657b0a52944d7d87639641e5062fdb9f83c7d0bd2b91b4e2459282d4d2da",
    quantities: [
      {
        label: "removed-volume",
        dimension: "volume",
        value: 1.2,
        unit: "m3",
        direction: "removed",
        calculationRef: "aise-solution-engine/quantity/demolition-removal/v1",
      },
      {
        label: "removed-face-area",
        dimension: "area",
        value: 12,
        unit: "m2",
        direction: "removed",
        calculationRef: "aise-solution-engine/quantity/demolition-removal/v1",
      },
    ],
  },
  {
    stepIndex: 2,
    intentRef: "intent-demo-0011",
    operationType: "block-wall-placement",
    resultingStateId: "a4951ff261cfa434be6582460b7db4710c3700351f494dd82f027be9c7ca2768",
    stateContentDigest: "4eaa4f4fd62153ff873fdbf60955dd2a8f2c7afd772fd5c56e9f0864be05ec75",
    quantities: [
      {
        label: "wall-volume",
        dimension: "volume",
        value: 0.5,
        unit: "m3",
        direction: "added",
        calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
      },
      {
        label: "wall-face-area",
        dimension: "area",
        value: 5,
        unit: "m2",
        direction: "added",
        calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
      },
      {
        label: "block-count",
        dimension: "count",
        value: 65,
        unit: "count",
        direction: "added",
        calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
      },
    ],
  },
  {
    stepIndex: 3,
    intentRef: "intent-demo-0012",
    operationType: "plaster-application",
    resultingStateId: "607856bb40576d7d552c12aa3ca509f4e0c160b6726cc086c1a7b822c58b06b8",
    stateContentDigest: "36eecf9f9d3d74281d195c5e0c197ced355d70b7f244c5513d92fa102a0f3e5b",
    quantities: [
      {
        label: "plaster-area",
        dimension: "area",
        value: 12.5,
        unit: "m2",
        direction: "added",
        calculationRef: "aise-solution-engine/quantity/plaster-application/v1",
      },
      {
        label: "plaster-volume",
        dimension: "volume",
        value: 0.375,
        unit: "m3",
        direction: "added",
        calculationRef: "aise-solution-engine/quantity/plaster-application/v1",
      },
    ],
  },
];

/** The baseline (state 0) content digest of the wall-upgrade journey (the committed golden). */
export const CANONICAL_BASELINE_STATE_DIGEST = "01057ab2b0111d0eea3661fa064b34a87acdf0f7043338a003267ef794b670f6";

/**
 * The engine's COMMITTED golden validation snapshot projection (outcome +
 * checks, from `wall-upgrade-expected.json`): the faithful
 * fixture-validation-provider replays these as its declared verdict.
 */
export const CANONICAL_VALIDATION: {
  readonly outcome: "pass";
  readonly checks: readonly CanonicalValidationCheck[];
} = {
  outcome: "pass",
  checks: [
    {
      checkId: "operation.contract-invariants",
      result: "pass",
      detail:
        "all 3 operations, 4 states and the version container satisfy every contract invariant (typed-unit parameters, anchored targets, provenance, layer alignment)",
    },
    {
      checkId: "geometry.dimensions-positive",
      result: "pass",
      detail: "every numeric operation parameter is strictly positive",
    },
    {
      checkId: "units.quantity-units-typed",
      result: "pass",
      detail: "every numeric parameter and effect quantity carries an explicit, engine-known unit",
    },
    {
      checkId: "operation.ordering-dependencies",
      result: "pass",
      detail: "dependency edges point backwards in the sequence; no cycles",
    },
    {
      checkId: "quantities.calculation-refs",
      result: "pass",
      detail: "every quantity effect references its deterministic calculation",
    },
    {
      checkId: "operation.capability-declared",
      result: "pass",
      detail:
        "all 3 operations are declared supported by engine profile 'profile-building-ops-reference' for their verticals",
    },
    {
      checkId: "operation.phase1-limits",
      result: "pass",
      detail: "every operation is within the quantitative Phase 1 limits",
    },
  ],
};

/**
 * The BOQ package's COMMITTED golden line semantics (the 7-line wall-upgrade
 * BOQ, from `packages/solution-boq/fixtures/wall-upgrade-boq-expected.json`):
 * the faithful fixture-boq-provider replays these as its declared lines.
 */
export const CANONICAL_BOQ_LINES: readonly CanonicalBoqLine[] = [
  {
    activity: "demolition-removal",
    direction: "removed",
    dimension: "area",
    unit: "m2",
    value: 12,
    calculationRef: "aise-solution-engine/quantity/demolition-removal/v1",
  },
  {
    activity: "demolition-removal",
    direction: "removed",
    dimension: "volume",
    unit: "m3",
    value: 1.2,
    calculationRef: "aise-solution-engine/quantity/demolition-removal/v1",
  },
  {
    activity: "block-wall-placement",
    direction: "added",
    dimension: "area",
    unit: "m2",
    value: 5,
    material: "concrete-block",
    calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
  },
  {
    activity: "block-wall-placement",
    direction: "added",
    dimension: "volume",
    unit: "m3",
    value: 0.5,
    material: "concrete-block",
    calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
  },
  {
    activity: "block-wall-placement",
    direction: "added",
    dimension: "count",
    unit: "count",
    value: 65,
    material: "concrete-block",
    calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
  },
  {
    activity: "plaster-application",
    direction: "added",
    dimension: "area",
    unit: "m2",
    value: 12.5,
    material: "cement-plaster",
    calculationRef: "aise-solution-engine/quantity/plaster-application/v1",
  },
  {
    activity: "plaster-application",
    direction: "added",
    dimension: "volume",
    unit: "m3",
    value: 0.375,
    material: "cement-plaster",
    calculationRef: "aise-solution-engine/quantity/plaster-application/v1",
  },
];

/* ------------------------------------------------------------------ */
/* The command-corpus slice (the operation-compiler seam baseline)       */
/* ------------------------------------------------------------------ */

/** The fixed compile instant of the compiler-seam baseline (injected clock). */
export const COMPILER_WORLD = {
  compiledAt: "2026-09-16T09:05:00.000Z",
  /** The identity context the comparison derives operation ids in (per position). */
  solutionId: "solution-demo-001",
  versionNumber: 1,
} as const;

/**
 * The corpus slice: three representative PROD-023 corpus entries (one per
 * authored operation family in the wall-upgrade journey). The harness
 * compiles them LIVE through the REAL `createSolutionCommandCompiler`.
 */
export const COMPILER_CORPUS_SLICE: readonly {
  readonly entryId: string;
  readonly utterance: string;
}[] = [
  { entryId: "REP-EXC-001", utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long." },
  { entryId: "REP-BLOCK-001", utterance: "Lay blocks to a height of 1 m along this wall." },
  { entryId: "REP-PLASTER-001", utterance: "Apply 30 mm plaster to the affected wall faces." },
];

/**
 * The canonical demo session (an inline copy of the PROD-023 testkit's
 * committed demo session — fixtures.test.ts asserts the deep-equality, so
 * drift fails the gate). The harness compiles the corpus slice over THIS
 * session through the real compiler.
 */
export const COMPILER_DEMO_SESSION: AgentSessionContext = {
  sessionId: "session-demo-001",
  agentId: "agent-demo-assistant",
  userId: "user-demo-engineer",
  proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 },
  foci: [
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
  ],
  defaultFocusId: "pit-area",
  recentOperations: [
    {
      operationId: "op-excavation-001",
      operationType: "excavation",
      parameters: [
        { name: "depth", value: 1.5, unit: "m" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ],
    },
    {
      operationId: "op-demolition-001",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
    },
    {
      operationId: "op-plaster-001",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
    },
  ],
};

/**
 * The canonical compiler's COMMITTED semantic projections for the corpus
 * slice (extracted from the real compiler's live output; fixtures.test.ts
 * re-derives them live): the faithful fixture-compiler-provider replays
 * these as its declared intent semantics.
 */
export const CANONICAL_COMPILER_SEMANTICS: Readonly<
  Record<string, CanonicalIntentSemantics>
> = {
  "REP-EXC-001": {
    operationType: "excavation",
    vertical: "building",
    parameters: [
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ],
    target: {
      selectorKind: "volume",
      nodeRefs: ["node-site-001"],
      geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
      units: { linear: "m", angular: "rad" },
    },
    dependsOn: [],
  },
  "REP-BLOCK-001": {
    operationType: "block-wall-placement",
    vertical: "building",
    parameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
    target: {
      selectorKind: "line-extent",
      nodeRefs: ["node-wall-002"],
      geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
      units: { linear: "m", angular: "rad" },
    },
    dependsOn: [],
  },
  "REP-PLASTER-001": {
    operationType: "plaster-application",
    vertical: "building",
    parameters: [
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ],
    target: {
      selectorKind: "face-set",
      nodeRefs: ["node-wall-002"],
      geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
      units: { linear: "m", angular: "rad" },
    },
    dependsOn: [],
  },
};

/* ------------------------------------------------------------------ */
/* The fixture substitute providers (deterministic in-repo doubles)      */
/* ------------------------------------------------------------------ */

export const SUBSTITUTE_PROVIDER_IDS = {
  compiler: "fixture-compiler-provider",
  engine: "fixture-engine-provider",
  validation: "fixture-validation-provider",
  boq: "fixture-boq-provider",
} as const;

export const FAITHFUL_VERSION = "1.0.0-fixture-faithful" as const;
export const DIVERGENT_VERSION = "1.1.0-fixture-divergent" as const;

/** The declared environment fingerprint of every substitution evaluation (DECLARED, not sensed). */
export const SOLUTION_EVAL_ENVIRONMENT = {
  declaredRuntime: "bun",
  declaredPlatform: "deterministic-fixture",
  codeVersion: "solution-eval/1",
  statement:
    "declared, not sensed — the Layer-3 substitution harness never reads the runtime environment (determinism contract)",
} as const;

/** The canonical-JSON serialization used by every declared provider field. */
export function canonicalJsonText(value: unknown): string {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortValue);
    }
    if (input !== null && typeof input === "object") {
      const record = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        out[key] = sortValue(record[key]);
      }
      return out;
    }
    return input;
  };
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

/* The I/O contracts per seam (the AISE-side DECLARED shapes) ------------- */

/** The typed pair of one seam's declared input/output contracts. */
interface SeamContracts {
  readonly inputContract: ProviderIOContract;
  readonly outputContract: ProviderIOContract;
}

function compilerIOContracts(): SeamContracts {
  return {
    inputContract: {
      contractId: "layer3-compiler-input/1",
      modality: "text",
      fields: [
        {
          name: "utteranceId",
          type: "string",
          required: true,
          description: "the corpus entry id of the utterance being compiled",
          minLength: 1,
          maxLength: 64,
        },
        {
          name: "utterance",
          type: "string",
          required: true,
          description: "the natural-language engineering command to compile",
          minLength: 1,
          maxLength: 512,
        },
      ],
    },
    outputContract: {
      contractId: "layer3-compiler-output/1",
      modality: "text",
      fields: [
        {
          name: "intentRef",
          type: "string",
          required: true,
          description: "the substitute's own intent reference (attribution only, never identity)",
          minLength: 1,
          maxLength: 128,
        },
        {
          name: "operationType",
          type: "string",
          required: true,
          description: "the operation type the substitute compiled the command into",
          minLength: 1,
          maxLength: 64,
        },
        {
          name: "intentSemanticsJson",
          type: "string",
          required: true,
          description:
            "canonical JSON of the intent's SEMANTIC projection (operationType, vertical, parameters, target, dependsOn) — strictly validated against the canonical comparison shape by the harness's projection guard",
          minLength: 2,
          maxLength: 8192,
        },
      ],
    },
  };
}

function engineIOContracts(): SeamContracts {
  return {
    inputContract: {
      contractId: "layer3-engine-input/1",
      modality: "text",
      fields: [
        {
          name: "solutionId",
          type: "string",
          required: true,
          description: "the solution the operation sequence belongs to",
          minLength: 1,
          maxLength: 128,
        },
        {
          name: "versionNumber",
          type: "integer",
          required: true,
          description: "the version the operation sequence belongs to",
          min: 1,
          max: 1024,
        },
        {
          name: "operationIndex",
          type: "integer",
          required: true,
          description: "the 1-based index of the operation in the sequence",
          min: 1,
          max: 1024,
        },
        {
          name: "intentRef",
          type: "string",
          required: true,
          description: "the intent reference of the operation being applied",
          minLength: 1,
          maxLength: 128,
        },
        {
          name: "operationType",
          type: "string",
          required: true,
          description: "the typed operation being applied",
          minLength: 1,
          maxLength: 64,
        },
        {
          name: "operationSemanticsJson",
          type: "string",
          required: true,
          description:
            "canonical JSON of the operation's semantic projection (the typed parameters, target and dependencies)",
          minLength: 2,
          maxLength: 8192,
        },
        {
          name: "parentStateContentDigest",
          type: "string",
          required: true,
          description: "the content digest of the state the operation applies FROM (the chain input)",
          minLength: 64,
          maxLength: 64,
        },
      ],
    },
    outputContract: {
      contractId: "layer3-engine-output/1",
      modality: "mesh",
      fields: [
        {
          name: "operationRef",
          type: "string",
          required: true,
          description: "echo of the applied operation's intent reference (attribution only)",
          minLength: 1,
          maxLength: 128,
        },
        {
          name: "resultingStateId",
          type: "string",
          required: true,
          description: "the resulting proposed state's canonical 64-hex identity",
          minLength: 64,
          maxLength: 64,
        },
        {
          name: "stateContentDigest",
          type: "string",
          required: true,
          description: "the resulting proposed state's canonical 64-hex content digest",
          minLength: 64,
          maxLength: 64,
        },
        {
          name: "quantitiesJson",
          type: "string",
          required: true,
          description:
            "canonical JSON array of the operation's effect quantities (label, dimension, value, unit, direction, calculationRef)",
          minLength: 2,
          maxLength: 8192,
        },
      ],
    },
  };
}

function validationIOContracts(): SeamContracts {
  return {
    inputContract: {
      contractId: "layer3-validation-input/1",
      modality: "text",
      fields: [
        {
          name: "solutionId",
          type: "string",
          required: true,
          description: "the solution being validated",
          minLength: 1,
          maxLength: 128,
        },
        {
          name: "versionNumber",
          type: "integer",
          required: true,
          description: "the version being validated",
          min: 1,
          max: 1024,
        },
        {
          name: "inputDigest",
          type: "string",
          required: true,
          description: "the sha-256 digest of the version's certified bytes",
          minLength: 64,
          maxLength: 64,
        },
      ],
    },
    outputContract: {
      contractId: "layer3-validation-output/1",
      modality: "text",
      fields: [
        {
          name: "outcome",
          type: "string",
          required: true,
          description:
            "the worst-of validation outcome (pass | fail | unknown | review-needed) the substitute certifies",
          minLength: 4,
          maxLength: 16,
        },
        {
          name: "checksJson",
          type: "string",
          required: true,
          description:
            "canonical JSON array of the substitute's validation checks (checkId, result, detail?)",
          minLength: 2,
          maxLength: 8192,
        },
      ],
    },
  };
}

function boqIOContracts(): SeamContracts {
  return {
    inputContract: {
      contractId: "layer3-boq-input/1",
      modality: "table",
      fields: [
        {
          name: "solutionId",
          type: "string",
          required: true,
          description: "the solution whose validated version is being derived into a BOQ",
          minLength: 1,
          maxLength: 128,
        },
        {
          name: "versionNumber",
          type: "integer",
          required: true,
          description: "the validated version being derived",
          min: 1,
          max: 1024,
        },
        {
          name: "validationSnapshotRef",
          type: "string",
          required: true,
          description: "the declared validation snapshot gating the derivation",
          minLength: 64,
          maxLength: 64,
        },
      ],
    },
    outputContract: {
      contractId: "layer3-boq-output/1",
      modality: "table",
      fields: [
        {
          name: "boqLineCount",
          type: "integer",
          required: true,
          description: "the number of BOQ lines the substitute derived",
          min: 1,
          max: 1024,
        },
        {
          name: "linesJson",
          type: "string",
          required: true,
          description:
            "canonical JSON array of the derived lines' semantic projections (activity, direction, dimension, unit, value, material?, calculationRef)",
          minLength: 2,
          maxLength: 65536,
        },
      ],
    },
  };
}

/**
 * Builds one substitute profile (15/15 mandatory fields; deterministic
 * value object). Both variants are permissively licensed — the divergent
 * fixtures are caught by CANONICAL COMPARISON, never by a license gate
 * (license blocking is the reference lifecycle's HFX-000 demonstration).
 */
function substituteProfile(input: {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly displayName: string;
  readonly description: string;
  readonly capability: string;
  readonly modalities: readonly ("text" | "table" | "mesh")[];
  readonly contracts: SeamContracts;
  readonly defectKind?: "operation-semantic-failure" | "reasoning-failure";
  readonly defectStatement?: string;
}): ProviderProfile {
  const failureModes: FailureModeDeclaration[] = [
    {
      kind: "contract-mismatch",
      condition: "input or output payload violates the declared contracts",
      behavior: "typed normalization refusal with structured issues — never a silent coercion",
    },
  ];
  if (input.defectKind !== undefined && input.defectStatement !== undefined) {
    failureModes.push({
      kind: input.defectKind,
      condition: "the committed divergent fixture's declared deviation",
      behavior: input.defectStatement,
    });
  }
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: input.providerId,
    technologyVersion: input.technologyVersion,
    displayName: input.displayName,
    description: input.description,
    capabilities: [input.capability],
    supportedModalities: input.modalities,
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic fixture computation — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the harness",
    },
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "deterministic Layer-3 substitution evaluation behind the AISE provider-evaluation control plane",
      intendedUseCleared: true,
    }),
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "fixture provider — deterministic local computation, no quota, no fallback needed",
    },
    inputContract: input.contracts.inputContract,
    outputContract: input.contracts.outputContract,
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-required",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the fixture substitutes emit canonical values without confidence scores and without measurement " +
        "uncertainty — confidence is never fabricated and never substitutes for measurement uncertainty",
    },
    failureModes,
    benchmarkResults: [],
  };
}

/** The eight substitute profiles (4 seams × {faithful, divergent}). */
export const SUBSTITUTE_PROFILES: readonly ProviderProfile[] = [
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.compiler,
    technologyVersion: FAITHFUL_VERSION,
    displayName: "Fixture Compiler Provider (faithful)",
    description:
      "Deterministic NL→intent fixture double (faithful): reproduces the canonical command compiler's " +
      "committed semantic projections for the corpus slice exactly — the substitution-proven baseline.",
    capability: "layer3-operation-compiler",
    modalities: ["text"],
    contracts: compilerIOContracts(),
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.compiler,
    technologyVersion: DIVERGENT_VERSION,
    displayName: "Fixture Compiler Provider (divergent)",
    description:
      "Deterministic NL→intent fixture double (divergent): reproduces the canonical semantics for the " +
      "corpus slice EXCEPT the discriminator utterance REP-BLOCK-001, whose wall thickness it misreads " +
      "as 0.2 m (canonical: 0.1 m) — the operation-identity divergence the harness must catch.",
    capability: "layer3-operation-compiler",
    modalities: ["text"],
    contracts: compilerIOContracts(),
    defectKind: "operation-semantic-failure",
    defectStatement:
      "the divergent fixture misreads the block-wall thickness on the discriminator utterance — the " +
      "harness records the operation-identity divergence as substitution evidence, never hides it",
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.engine,
    technologyVersion: FAITHFUL_VERSION,
    displayName: "Fixture Engine Provider (faithful)",
    description:
      "Deterministic operation-execution fixture double (faithful): reproduces the solution engine's " +
      "committed wall-upgrade state chain and effect quantities byte-for-byte.",
    capability: "layer3-engine-execution",
    modalities: ["text", "mesh"],
    contracts: engineIOContracts(),
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.engine,
    technologyVersion: DIVERGENT_VERSION,
    displayName: "Fixture Engine Provider (divergent)",
    description:
      "Deterministic operation-execution fixture double (divergent): byte-equal state evolution for " +
      "steps 1–2, then a subtly-divergent final state identity/digest at step 3 (one hex digit) — the " +
      "state-evolution divergence the harness must catch.",
    capability: "layer3-engine-execution",
    modalities: ["text", "mesh"],
    contracts: engineIOContracts(),
    defectKind: "operation-semantic-failure",
    defectStatement:
      "the divergent fixture's final proposed state deviates from the canonical chain — the harness " +
      "records the state-digest divergence as substitution evidence, never hides it",
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.validation,
    technologyVersion: FAITHFUL_VERSION,
    displayName: "Fixture Validation Provider (faithful)",
    description:
      "Deterministic validation fixture double (faithful): agrees with the engine's committed " +
      "validation snapshot (outcome pass, seven passing checks).",
    capability: "layer3-validation",
    modalities: ["text"],
    contracts: validationIOContracts(),
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.validation,
    technologyVersion: DIVERGENT_VERSION,
    displayName: "Fixture Validation Provider (divergent)",
    description:
      "Deterministic validation fixture double (divergent): one DISAGREEING verdict — it flags the " +
      "phase1-limits check as review-needed on a fabricated exceedance the canonical validator does not " +
      "find (outcome review-needed vs canonical pass) — the verdict divergence the harness must catch.",
    capability: "layer3-validation",
    modalities: ["text"],
    contracts: validationIOContracts(),
    defectKind: "reasoning-failure",
    defectStatement:
      "the divergent fixture certifies a review-needed verdict the deterministic validator contradicts — " +
      "the harness records the verdict divergence as substitution evidence, never hides it",
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.boq,
    technologyVersion: FAITHFUL_VERSION,
    displayName: "Fixture BOQ Provider (faithful)",
    description:
      "Deterministic BOQ-derivation fixture double (faithful): reproduces the solution-BOQ derivation's " +
      "committed wall-upgrade line semantics exactly (7 lines).",
    capability: "layer3-boq-derivation",
    modalities: ["table"],
    contracts: boqIOContracts(),
  }),
  substituteProfile({
    providerId: SUBSTITUTE_PROVIDER_IDS.boq,
    technologyVersion: DIVERGENT_VERSION,
    displayName: "Fixture BOQ Provider (divergent)",
    description:
      "Deterministic BOQ-derivation fixture double (divergent): equal lines except one quantity " +
      "deviation — the block count 64 instead of the canonical 65 (floor instead of ceiling on the " +
      "partial module) — the quantity divergence the harness must catch.",
    capability: "layer3-boq-derivation",
    modalities: ["table"],
    contracts: boqIOContracts(),
    defectKind: "operation-semantic-failure",
    defectStatement:
      "the divergent fixture floors the block count instead of ceiling the partial module — the harness " +
      "records the quantity divergence as substitution evidence, never hides it",
  }),
];

/* ------------------------------------------------------------------ */
/* The divergent mutations (the day-27 hard negatives, as data)          */
/* ------------------------------------------------------------------ */

/**
 * The compiler divergent semantics: REP-BLOCK-001 with the wall thickness
 * misread as 0.2 m (canonical: 0.1 m). A different semantic parameter ⇒ a
 * different canonical operation identity ⇒ operation-semantic-failure.
 */
function divergentCompilerSemantics(): Readonly<Record<string, CanonicalIntentSemantics>> {
  const block = CANONICAL_COMPILER_SEMANTICS["REP-BLOCK-001"];
  if (block === undefined) {
    throw new Error("fixtures: REP-BLOCK-001 semantics missing");
  }
  return {
    "REP-EXC-001": CANONICAL_COMPILER_SEMANTICS["REP-EXC-001"]!,
    "REP-BLOCK-001": {
      ...block,
      parameters: block.parameters.map((parameter) =>
        parameter.name === "thickness" ? { ...parameter, value: 0.2 } : parameter,
      ),
    },
    "REP-PLASTER-001": CANONICAL_COMPILER_SEMANTICS["REP-PLASTER-001"]!,
  };
}

/**
 * The engine divergent steps: steps 1–2 byte-equal; step 3's state identity
 * and content digest each deviate by ONE hex digit (a subtly-divergent final
 * state — internally consistent: no later step contradicts it).
 */
function divergentEngineSteps(): readonly EngineStepGolden[] {
  return CANONICAL_ENGINE_STEPS.map((step) =>
    step.stepIndex === 3
      ? {
          ...step,
          resultingStateId: `${step.resultingStateId.slice(0, 63)}9`,
          stateContentDigest: `${step.stateContentDigest.slice(0, 63)}c`,
        }
      : step,
  );
}

/**
 * The validation divergent verdict: the phase1-limits check flipped to
 * review-needed on a fabricated exceedance ⇒ worst-of outcome
 * review-needed ≠ canonical pass ⇒ reasoning-failure.
 */
function divergentValidation(): { outcome: "review-needed"; checks: readonly CanonicalValidationCheck[] } {
  return {
    outcome: "review-needed",
    checks: CANONICAL_VALIDATION.checks.map((check) =>
      check.checkId === "operation.phase1-limits"
        ? {
            ...check,
            result: "review-needed" as const,
            detail:
              "the substitute's limit model reports a block-wall height exceedance (1.0 m > its declared " +
              "0.9 m substitute limit) — the canonical Phase 1 validator finds no exceedance (limit 3 m)",
          }
        : check,
    ),
  };
}

/**
 * The BOQ divergent lines: the block-count line's quantity 64 instead of
 * the canonical 65 (floor instead of ceiling on the partial module) ⇒ a
 * quantity deviation ⇒ operation-semantic-failure.
 */
function divergentBoqLines(): readonly CanonicalBoqLine[] {
  return CANONICAL_BOQ_LINES.map((line) =>
    line.activity === "block-wall-placement" && line.dimension === "count"
      ? { ...line, value: 64 }
      : line,
  );
}

/* ------------------------------------------------------------------ */
/* The declared substituted runs (raw provider executions, as data)      */
/* ------------------------------------------------------------------ */

function opaqueNative(seam: string, variant: string): { mediaType: string; payload: unknown } {
  return {
    mediaType: "application/aise-fixture-substitute+json",
    payload: {
      engine: `fixture-${seam}-engine`,
      variant,
      note:
        "opaque provider-native payload — carried for provenance only, never parsed into canonical domain types",
    },
  };
}

function compilerDeclaredRun(variant: "faithful" | "divergent"): {
  capability: string;
  executions: readonly { inputKey: string; execution: unknown }[];
} {
  const semantics =
    variant === "faithful" ? CANONICAL_COMPILER_SEMANTICS : divergentCompilerSemantics();
  return {
    capability: "layer3-operation-compiler",
    executions: COMPILER_CORPUS_SLICE.map((entry, index) => {
      const semantics_ = semantics[entry.entryId];
      if (semantics_ === undefined) {
        throw new Error(`fixtures: compiler semantics missing for ${entry.entryId}`);
      }
      return {
        inputKey: entry.entryId,
        execution: {
          capability: "layer3-operation-compiler",
          outputs: {
            intentRef: `intent-substitute-compiler-${index + 1}`,
            operationType: semantics_.operationType,
            intentSemanticsJson: canonicalJsonText(semantics_),
          },
          providerNative: opaqueNative("compiler", variant),
        },
      };
    }),
  };
}

function engineDeclaredRun(variant: "faithful" | "divergent"): {
  capability: string;
  executions: readonly { inputKey: string; execution: unknown }[];
} {
  const steps = variant === "faithful" ? CANONICAL_ENGINE_STEPS : divergentEngineSteps();
  return {
    capability: "layer3-engine-execution",
    executions: steps.map((step) => ({
      inputKey: `step-${step.stepIndex}`,
      execution: {
        capability: "layer3-engine-execution",
        outputs: {
          operationRef: step.intentRef,
          resultingStateId: step.resultingStateId,
          stateContentDigest: step.stateContentDigest,
          quantitiesJson: canonicalJsonText(step.quantities),
        },
        providerNative: opaqueNative("engine", variant),
      },
    })),
  };
}

function validationDeclaredRun(variant: "faithful" | "divergent"): {
  capability: string;
  executions: readonly { inputKey: string; execution: unknown }[];
} {
  const validation = variant === "faithful" ? CANONICAL_VALIDATION : divergentValidation();
  return {
    capability: "layer3-validation",
    executions: [
      {
        inputKey: "version-validation",
        execution: {
          capability: "layer3-validation",
          outputs: {
            outcome: validation.outcome,
            checksJson: canonicalJsonText(validation.checks),
          },
          providerNative: opaqueNative("validation", variant),
        },
      },
    ],
  };
}

function boqDeclaredRun(variant: "faithful" | "divergent"): {
  capability: string;
  executions: readonly { inputKey: string; execution: unknown }[];
} {
  const lines = variant === "faithful" ? CANONICAL_BOQ_LINES : divergentBoqLines();
  return {
    capability: "layer3-boq-derivation",
    executions: [
      {
        inputKey: "version-boq",
        execution: {
          capability: "layer3-boq-derivation",
          outputs: {
            boqLineCount: lines.length,
            linesJson: canonicalJsonText(lines),
          },
          providerNative: opaqueNative("boq", variant),
        },
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The canonical registry log + the committed scenario matrix            */
/* ------------------------------------------------------------------ */

/**
 * The canonical registry log of the substitution matrix: registration +
 * evaluation-started for every one of the eight substitutes, in the
 * committed matrix order (deterministic — the append-only log order IS
 * the time).
 */
export function canonicalRegistryLog(): readonly ProviderRegistryEvent[] {
  const events: ProviderRegistryEvent[] = [];
  for (const profile of SUBSTITUTE_PROFILES) {
    events.push({ kind: "provider-registered", profile });
    events.push({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }
  return events;
}

/**
 * The COMMITTED SUBSTITUTION MATRIX: 4 seams × {equal, divergent} = 8
 * scenarios. The equal scenarios prove canonical outputs byte-equal
 * (substitution-proven); the divergent scenarios are the point (day-27
 * doctrine): each declares its honest difference up front and each MUST be
 * caught with the declared closed-vocabulary failure kind.
 */
export function committedScenarioMatrix(): readonly SubstitutionScenario[] {
  return [
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-compiler-faithful-001",
      title: "Faithful NL operation-compiler substitution over the command-corpus slice",
      seam: "operation-compiler",
      baselineId: "command-corpus-slice/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.compiler,
        technologyVersion: FAITHFUL_VERSION,
      },
      substitutedRun: compilerDeclaredRun("faithful"),
      expectation: "canonical-equality",
      note:
        "the substitute replays the canonical compiler's committed semantic projections — the harness " +
        "must PROVE the operation identities equal",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-compiler-divergent-001",
      title: "Divergent NL operation-compiler substitution (block-wall thickness misread)",
      seam: "operation-compiler",
      baselineId: "command-corpus-slice/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.compiler,
        technologyVersion: DIVERGENT_VERSION,
      },
      substitutedRun: compilerDeclaredRun("divergent"),
      expectation: "declared-divergence",
      expectedDivergenceKind: "operation-semantic-failure",
      note:
        "the discriminator utterance REP-BLOCK-001 compiles with thickness 0.2 m instead of 0.1 m — a " +
        "different semantic parameter is a different canonical operation identity",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-engine-faithful-001",
      title: "Faithful engine-execution substitution over the wall-upgrade journey",
      seam: "engine-execution",
      baselineId: "wall-upgrade-journey/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.engine,
        technologyVersion: FAITHFUL_VERSION,
      },
      substitutedRun: engineDeclaredRun("faithful"),
      expectation: "canonical-equality",
      note:
        "the substitute replays the engine's committed wall-upgrade state chain and effect quantities — " +
        "the harness must PROVE the state digests and quantities equal",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-engine-divergent-001",
      title: "Divergent engine-execution substitution (subtly-divergent final state)",
      seam: "engine-execution",
      baselineId: "wall-upgrade-journey/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.engine,
        technologyVersion: DIVERGENT_VERSION,
      },
      substitutedRun: engineDeclaredRun("divergent"),
      expectation: "declared-divergence",
      expectedDivergenceKind: "operation-semantic-failure",
      note:
        "steps 1–2 byte-equal, step 3's state identity/digest off by one hex digit — a subtly-divergent " +
        "state evolution is still a divergent canonical state",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-validation-faithful-001",
      title: "Faithful validation substitution over the wall-upgrade version",
      seam: "validation",
      baselineId: "wall-upgrade-journey/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.validation,
        technologyVersion: FAITHFUL_VERSION,
      },
      substitutedRun: validationDeclaredRun("faithful"),
      expectation: "canonical-equality",
      note:
        "the substitute agrees with the engine's committed validation snapshot — the harness must PROVE " +
        "the verdicts equal",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-validation-divergent-001",
      title: "Divergent validation substitution (disagreeing phase1-limits verdict)",
      seam: "validation",
      baselineId: "wall-upgrade-journey/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.validation,
        technologyVersion: DIVERGENT_VERSION,
      },
      substitutedRun: validationDeclaredRun("divergent"),
      expectation: "declared-divergence",
      expectedDivergenceKind: "reasoning-failure",
      note:
        "the substitute certifies review-needed on a fabricated exceedance — a verdict the deterministic " +
        "validator contradicts is an incorrect inference over the same inputs",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-boq-faithful-001",
      title: "Faithful BOQ-derivation substitution over the wall-upgrade version",
      seam: "boq-derivation",
      baselineId: "wall-upgrade-journey/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.boq,
        technologyVersion: FAITHFUL_VERSION,
      },
      substitutedRun: boqDeclaredRun("faithful"),
      expectation: "canonical-equality",
      note:
        "the substitute replays the BOQ derivation's committed line semantics — the harness must PROVE " +
        "the lines equal",
    },
    {
      kind: "layer3-substitution-scenario",
      schemaVersion: "layer3-substitution/1",
      scenarioId: "layer3-boq-divergent-001",
      title: "Divergent BOQ-derivation substitution (block-count quantity deviation)",
      seam: "boq-derivation",
      baselineId: "wall-upgrade-journey/1",
      substitute: {
        providerId: SUBSTITUTE_PROVIDER_IDS.boq,
        technologyVersion: DIVERGENT_VERSION,
      },
      substitutedRun: boqDeclaredRun("divergent"),
      expectation: "declared-divergence",
      expectedDivergenceKind: "operation-semantic-failure",
      note:
        "the block-count line carries 64 instead of the canonical 65 (floor instead of ceiling on the " +
        "partial module) — wrong quantity semantics for the operation",
    },
  ];
}
