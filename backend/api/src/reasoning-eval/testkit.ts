/**
 * PROD-028 — Layer-2 reasoning evaluation: the deterministic DOUBLES
 * (testkit — the reference-provider pattern of the control plane).
 *
 * THREE deterministic in-repo fixture providers, one per lane —
 * `fixture-vlm-provider` (multimodal-reasoning), `fixture-doc-provider`
 * (document-understanding), `fixture-retrieval-provider` (retrieval) — NO
 * NETWORK, no real model (Qwen3-VL / PaddleOCR / SigLIP are the FUTURE
 * consumers of this harness, explicit non-scope). Every provider:
 *
 *  - is representable by a full HFX-000 `ProviderProfile` (15/15 mandatory
 *    fields, closed failure vocabulary, permissive fixture license);
 *  - consumes the declared input contract `{ bundleJson, behaviorTag,
 *    variantScript? }` and answers through the declared output contract
 *    `{ envelopeJson }` — the canonical Evidence Envelope schema as JSON
 *    text (provider replacement never changes the schema);
 *  - is scripted by the input's control channel: `behaviorTag` selects the
 *    behavior (replay / refuse / empty / malformed) and `variantScript`
 *    carries the replay envelope (correct OR defective — the double's
 *    answer script). The HARNESS never reads either field; a real
 *    provider adapter ignores them and answers from the bundle alone.
 *
 * THE SCENARIO CATALOG (26 committed scenarios) is the Layer-2 benchmark
 * fixture map: each lane exercises its applicable failure kinds from the
 * CLOSED vocabulary so the harness's five-way discrimination (perception /
 * retrieval / reasoning / unsupported-data / operation-semantic) is
 * ASSERTED, not just scored:
 *
 *   multimodal:  correct · perception (misread) · hallucination ·
 *                wrong-evidence (retrieval) · bad-inference (reasoning) ·
 *                honest refusal (unsupported) · hallucinated out-of-scope
 *                answer (unsupported + violations) · missing identity ·
 *                implicit assumptions
 *   document:    correct · missed field (false absence) · wrong-section
 *                attribution (retrieval) · bad inference · refusal ·
 *                operation correct · operation wrong-target (operation-
 *                semantic) · fabricated check
 *   retrieval:   correct · near-miss hit · empty in-scope (retrieval) ·
 *                empty out-of-scope (unsupported) · fabricated hit
 *                (unsupported) · uncited claim · misreported hit content
 *                (perception) · wrong synthesis (reasoning)
 *
 * DETERMINISM: pure computation over declared data — no clock, no
 * randomness, no I/O. The same catalog construction is byte-identical;
 * the committed goldens under tools/reasoning-eval/ are its projection.
 */

import {
  applyRegistryEvent,
  createProviderRegistry,
  replayRegistry,
  sealProvenanceManifest,
  toLicenseDeclaration,
  validateBenchmarkRecord,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  FailureKind,
  FailureModeDeclaration,
  ProviderModality,
  ProviderProfile,
  ProviderRegistryEvent,
  RawProviderExecution,
} from "@aise/provider-registry";
import { evaluateScenario } from "./harness";
import {
  REASONING_EVAL_BENCHMARK_ID,
  REASONING_EVAL_CODE_VERSION,
  REASONING_EVAL_CONSUMER,
  REASONING_EVAL_ENVIRONMENT,
} from "./harness";
import type { ReasoningEvalOutcome } from "./harness";
import { canonicalDigestOf, canonicalJsonText, FULL_EVALUATION_CRITERIA } from "./model";
import type {
  DeclaredEvidenceEnvelope,
  EnvelopeIntegrityRule,
  EnvelopeOperationContract,
  EnvelopeResultStatus,
  EvidenceItem,
  EvidenceQuestionBundle,
  ExpectedEnvelopeOutcome,
  FixtureBehavior,
  ReasoningEvalLane,
  ReasoningEvalRegistryLog,
  ReasoningEvalScenario,
} from "./model";

/* ------------------------------------------------------------------ */
/* Suite identity                                                       */
/* ------------------------------------------------------------------ */

export const REASONING_EVAL_SUITE_ID = "reasoning-eval-suite/1" as const;
export const REASONING_EVAL_SUITE_VERSION = "1.0.0" as const;

/** The lane → fixture-provider/capability assignment (one provider per lane today). */
export const LANE_FIXTURE_PROVIDERS: Readonly<
  Record<ReasoningEvalLane, { providerId: string; technologyVersion: string; capability: string }>
> = Object.freeze({
  "multimodal-reasoning": {
    providerId: "fixture-vlm-provider",
    technologyVersion: "1.0.0-fixture-v1",
    capability: "fixture-vlm-reasoning",
  },
  "document-understanding": {
    providerId: "fixture-doc-provider",
    technologyVersion: "1.0.0-fixture-v1",
    capability: "fixture-document-extraction",
  },
  retrieval: {
    providerId: "fixture-retrieval-provider",
    technologyVersion: "1.0.0-fixture-v1",
    capability: "fixture-evidence-retrieval",
  },
});

/* ------------------------------------------------------------------ */
/* The fixture provider profiles                                        */
/* ------------------------------------------------------------------ */

const INPUT_CONTRACT_FIELDS = [
  {
    name: "bundleJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the evidence-question bundle (question, authorized evidence set, offered checks, operation contract) — the provider-neutral Layer-2 question side; the answer key never rides the bundle",
    maxLength: 262144,
  },
  {
    name: "behaviorTag",
    type: "string",
    required: true,
    description:
      "the fixture-double control channel: replay | refuse | empty | malformed — a real provider adapter ignores it",
    maxLength: 64,
  },
  {
    name: "variantScript",
    type: "string",
    required: false,
    description:
      "the replay script: the envelope the double emits verbatim (correct OR defective); omitted for real-provider evaluations",
    maxLength: 262144,
  },
] as const;

const OUTPUT_CONTRACT_FIELDS = [
  {
    name: "envelopeJson",
    type: "string",
    required: true,
    description:
      "the declared Evidence Envelope as canonical JSON (evidenceIds, facts, assumptions, unknowns, deterministicChecks, resultClaim, resultStatus, invalidationConditions, agentIdentity, proposedOperation?) — the AISE-side schema every Layer-2 provider must emit",
    maxLength: 262144,
  },
] as const;

function fixtureFailureModes(modes: readonly { kind: FailureKind; condition: string; behavior: string }[]): readonly FailureModeDeclaration[] {
  return modes.map((mode) => ({ ...mode }));
}

function fixtureProfile(spec: {
  providerId: string;
  capability: string;
  displayName: string;
  description: string;
  supportedModalities: readonly ProviderModality[];
  inputModality: ProviderModality;
  outputModality: ProviderModality;
  contractStem: string;
  failureModes: readonly { kind: FailureKind; condition: string; behavior: string }[];
}): ProviderProfile {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: spec.providerId,
    technologyVersion: "1.0.0-fixture-v1",
    displayName: spec.displayName,
    description: spec.description,
    capabilities: [spec.capability],
    supportedModalities: spec.supportedModalities,
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
      statement: "declared fixture latencies — no wall-clock measurement exists in the control plane",
    },
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse: "deterministic Layer-2 reasoning evaluation behind the AISE reasoning-eval harness",
      intendedUseCleared: true,
    }),
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "fixture provider — deterministic local computation, no quota, no fallback needed",
    },
    inputContract: {
      contractId: `${spec.contractStem}-input/1`,
      modality: spec.inputModality,
      fields: INPUT_CONTRACT_FIELDS,
    },
    outputContract: {
      contractId: `${spec.contractStem}-output/1`,
      modality: spec.outputModality,
      fields: OUTPUT_CONTRACT_FIELDS,
    },
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-optional",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the fixture emits no confidence scores; measurement uncertainty is propagated verbatim from cited " +
        "evidence by the harness — confidence is never fabricated and never substitutes for measurement uncertainty",
    },
    failureModes: fixtureFailureModes(spec.failureModes),
    benchmarkResults: [],
  };
}

/** The multimodal-reasoning lane's fixture provider (the Qwen3-VL double — HFX-201's lane). */
export function fixtureVlmProviderProfile(): ProviderProfile {
  return fixtureProfile({
    providerId: "fixture-vlm-provider",
    capability: "fixture-vlm-reasoning",
    displayName: "Fixture VLM Reasoning Provider",
    description:
      "Deterministic multimodal-reasoning fixture double (PROD-028): replays scripted Evidence Envelopes " +
      "over image evidence-question bundles — correct, hallucinating, misreading, wrong-image and refusing " +
      "variants for the five-way failure discrimination. No real model, no network.",
    supportedModalities: ["image", "text"],
    inputModality: "image",
    outputModality: "text",
    contractStem: "fixture-multimodal-reasoning",
    failureModes: [
      {
        kind: "perception-failure",
        condition: "a replay script declaring facts the cited image evidence does not contain",
        behavior: "the ungrounded fact is recorded as a closed-vocabulary perception-failure observation",
      },
      {
        kind: "retrieval-failure",
        condition: "a replay script citing the wrong (but real) image for a multi-image question",
        behavior: "the required evidence is not cited — a retrieval defect, not a comprehension defect",
      },
      {
        kind: "reasoning-failure",
        condition: "a replay script carrying grounded facts but a wrong conclusion",
        behavior: "an incorrect inference over correctly perceived and retrieved inputs",
      },
      {
        kind: "unsupported-data",
        condition: "an out-of-scope question (the required data is outside the authorized evidence set)",
        behavior: "explicit refusal — never a fabricated answer",
      },
      {
        kind: "contract-mismatch",
        condition: "an envelope payload that violates the canonical Evidence Envelope schema",
        behavior: "typed normalization/parse refusal — never a silent coercion",
      },
    ],
  });
}

/** The document-understanding lane's fixture provider (the PaddleOCR-VL/PP-DocLayout double — HFX-202's lane). */
export function fixtureDocProviderProfile(): ProviderProfile {
  return fixtureProfile({
    providerId: "fixture-doc-provider",
    capability: "fixture-document-extraction",
    displayName: "Fixture Document Extraction Provider",
    description:
      "Deterministic document-understanding fixture double (PROD-028): replays scripted Evidence Envelopes " +
      "over document-section bundles — correct extraction, missed fields, wrong-section attribution, edit " +
      "operations honoring or violating the operation contract. No real OCR engine, no network.",
    supportedModalities: ["document", "text"],
    inputModality: "document",
    outputModality: "text",
    contractStem: "fixture-document-understanding",
    failureModes: [
      {
        kind: "perception-failure",
        condition: "a missed or misread field, including false-absence facts",
        behavior: "the ungrounded/contradicting fact is recorded as a perception-failure observation",
      },
      {
        kind: "retrieval-failure",
        condition: "a wrong-section attribution (citing the wrong real section)",
        behavior: "the required section is not cited — a retrieval defect",
      },
      {
        kind: "reasoning-failure",
        condition: "correctly extracted fields compared or combined incorrectly",
        behavior: "an incorrect inference over correctly perceived and retrieved inputs",
      },
      {
        kind: "unsupported-data",
        condition: "a field absent from every authorized section",
        behavior: "explicit refusal — never a fabricated value",
      },
      {
        kind: "operation-semantic-failure",
        condition: "an edit proposal targeting the wrong section/field/unit",
        behavior: "the operation contract violation is recorded — wrong engineering semantics, though parsing succeeded",
      },
      {
        kind: "contract-mismatch",
        condition: "an envelope payload that violates the canonical Evidence Envelope schema or the offered check set",
        behavior: "typed refusal — never a silent coercion",
      },
    ],
  });
}

/** The retrieval lane's fixture provider (the SigLIP/STELLAR double — HFX-203's lane). */
export function fixtureRetrievalProviderProfile(): ProviderProfile {
  return fixtureProfile({
    providerId: "fixture-retrieval-provider",
    capability: "fixture-evidence-retrieval",
    displayName: "Fixture Evidence Retrieval Provider",
    description:
      "Deterministic evidence-retrieval fixture double (PROD-028): replays scripted retrieval results over a " +
      "corpus bundle — correct hits, near-miss hits, empty results and fabricated hits for the five-way " +
      "failure discrimination. No real embedding model, no network.",
    supportedModalities: ["text", "image"],
    inputModality: "text",
    outputModality: "text",
    contractStem: "fixture-retrieval",
    failureModes: [
      {
        kind: "retrieval-failure",
        condition: "near-miss hits (visually similar, semantically wrong) or empty results for in-scope queries",
        behavior: "the required evidence is not surfaced — a retrieval/indexing defect",
      },
      {
        kind: "perception-failure",
        condition: "a correct hit whose content is misreported",
        behavior: "the ungrounded fact is recorded as a perception-failure observation",
      },
      {
        kind: "reasoning-failure",
        condition: "correctly retrieved hits synthesized incorrectly",
        behavior: "an incorrect inference over correctly perceived and retrieved inputs",
      },
      {
        kind: "unsupported-data",
        condition: "a fabricated hit id or an out-of-scope query",
        behavior: "invented support is unsupported-data; honest empty results for absent data refuse explicitly",
      },
      {
        kind: "contract-mismatch",
        condition: "an envelope payload that violates the canonical Evidence Envelope schema",
        behavior: "typed refusal — never a silent coercion",
      },
    ],
  });
}

/** The fixture provider profile of a lane (by lane). */
export function fixtureProfileForLane(lane: ReasoningEvalLane): ProviderProfile {
  switch (lane) {
    case "multimodal-reasoning":
      return fixtureVlmProviderProfile();
    case "document-understanding":
      return fixtureDocProviderProfile();
    case "retrieval":
      return fixtureRetrievalProviderProfile();
  }
}

/* ------------------------------------------------------------------ */
/* The deterministic execution (the behavior table)                     */
/* ------------------------------------------------------------------ */

/** The fixed deterministic wording of the honest refusal (the failed-result pattern). */
export function fixtureRefusalDetail(bundle: EvidenceQuestionBundle): string {
  return (
    `question '${bundle.question}' requires data outside the authorized evidence set of context ` +
    `'${bundle.authorizedContext.contextId}' — explicit refusal, never a fabricated answer`
  );
}

/** The fixed deterministic wording of the empty-result unknown. */
export const FIXTURE_EMPTY_UNKNOWN = "no corpus evidence matched the question" as const;

interface FixtureInputPayload {
  readonly bundleJson: string;
  readonly behaviorTag: string;
  readonly variantScript?: string;
}

/**
 * Executes ONE fixture provider deterministically over a normalized input:
 * the behavior table (replay / refuse / empty / malformed). The opaque
 * provider-native payload rides along for provenance only — never parsed
 * by the harness.
 */
export function executeFixtureProvider(
  profile: ProviderProfile,
  input: { readonly payload: Record<string, unknown> },
): RawProviderExecution {
  const payload = input.payload as unknown as FixtureInputPayload;
  const native = {
    mediaType: "application/aise-reasoning-eval-fixture+json",
    payload: {
      engine: "reasoning-eval-fixture-double",
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
        throw new Error(
          "fixture double: the replay behavior requires the variantScript (the scripted envelope)",
        );
      }
      return {
        capability,
        outputs: { envelopeJson: payload.variantScript },
        providerNative: native,
      };
    }
    case "refuse": {
      const bundle = JSON.parse(payload.bundleJson) as EvidenceQuestionBundle;
      return {
        capability,
        failure: {
          kind: "unsupported-data",
          detail: fixtureRefusalDetail(bundle),
        },
        providerNative: native,
      };
    }
    case "empty": {
      const envelope: DeclaredEvidenceEnvelope = {
        evidenceIds: [],
        facts: [],
        assumptions: [],
        unknowns: [FIXTURE_EMPTY_UNKNOWN],
        deterministicChecks: [],
        resultClaim: null,
        resultStatus: "unsupported",
        invalidationConditions: [],
        agentIdentity: {
          providerId: profile.providerId,
          technologyVersion: profile.technologyVersion,
          capability,
        },
        proposedOperation: null,
      };
      return {
        capability,
        outputs: { envelopeJson: canonicalJsonText(envelope) },
        providerNative: native,
      };
    }
    case "malformed": {
      return {
        capability,
        outputs: { envelopeJson: "{not-a-valid-envelope" },
        providerNative: native,
      };
    }
    default:
      throw new Error(`fixture double: unknown behavior tag '${payload.behaviorTag}'`);
  }
}

/* ------------------------------------------------------------------ */
/* The three fixture worlds (the bundle data)                           */
/* ------------------------------------------------------------------ */

function item(spec: {
  evidenceId: string;
  revision: string;
  kind: EvidenceItem["kind"];
  content: string;
  facts: readonly string[];
  measurement?: { sigma: number; unit: string };
}): EvidenceItem {
  return {
    evidenceId: spec.evidenceId,
    revision: spec.revision,
    kind: spec.kind,
    content: spec.content,
    facts: [...spec.facts],
    ...(spec.measurement === undefined ? {} : { measurement: spec.measurement }),
  };
}

/** The multimodal workbench world (image evidence E1/E2). */
function multimodalBundle(
  scenarioId: string,
  question: string,
  requiredEvidenceIds: readonly string[],
  scope: "in-scope" | "out-of-scope",
): EvidenceQuestionBundle {
  return {
    scenarioId,
    lane: "multimodal-reasoning",
    question,
    authorizedContext: {
      projectId: "proj-renaissance-001",
      contextId: "ctx-workbench",
      revision: "r1",
    },
    evidence: [
      item({
        evidenceId: "E1",
        revision: "r1",
        kind: "image",
        content:
          "image: a red toolbox with an open lid on a wooden workbench; a claw hammer lies inside the toolbox",
        facts: [
          "the image shows a red toolbox on a wooden workbench",
          "the toolbox lid is open",
          "a claw hammer is inside the toolbox",
        ],
      }),
      item({
        evidenceId: "E2",
        revision: "r1",
        kind: "image",
        content: "image: a coil of yellow safety rope on the wooden workbench",
        facts: ["the image shows a coil of yellow safety rope on the wooden workbench"],
      }),
    ],
    requiredEvidenceIds: [...requiredEvidenceIds],
    scope,
    offeredChecks: ["fixture-tool-inventory-check"],
  };
}

const DOC_OPERATION: EnvelopeOperationContract = {
  operationKind: "document-field-edit",
  targetEvidenceId: "S3",
  field: "warranty-duration",
  unit: "months",
  description:
    "update the warranty-duration field of contract section 3, expressing the value in months",
};

/** The document BOQ/contract world (document sections S1/S2/S3; the edit operation contract rides only the operation scenarios). */
function documentBundle(
  scenarioId: string,
  question: string,
  requiredEvidenceIds: readonly string[],
  scope: "in-scope" | "out-of-scope",
  withOperation: boolean,
): EvidenceQuestionBundle {
  return {
    scenarioId,
    lane: "document-understanding",
    question,
    authorizedContext: {
      projectId: "proj-renaissance-001",
      contextId: "ctx-boq-extract",
      revision: "r2",
    },
    evidence: [
      item({
        evidenceId: "S1",
        revision: "r2",
        kind: "document-section",
        content: "section 1 of the BOQ extract: item 'Concrete C30', quantity 120 m3",
        facts: ["section 1 lists item 'Concrete C30' with quantity 120 m3"],
      }),
      item({
        evidenceId: "S2",
        revision: "r2",
        kind: "document-section",
        content:
          "section 2 of the BOQ extract: item 'Rebar B500B', quantity 2400 kg, rate per structural drawing REV-C",
        facts: [
          "section 2 lists item 'Rebar B500B' with quantity 2400 kg",
          "section 2 states the rebar rate applies per structural drawing REV-C",
        ],
      }),
      item({
        evidenceId: "S3",
        revision: "r3",
        kind: "document-section",
        content:
          "section 3 of the contract extract: warranty duration 60 months, retention 5 percent",
        facts: [
          "section 3 states the warranty duration is 60 months",
          "section 3 states the retention is 5 percent",
        ],
      }),
    ],
    requiredEvidenceIds: [...requiredEvidenceIds],
    scope,
    offeredChecks: ["fixture-boq-field-extraction-check"],
    ...(withOperation ? { operation: DOC_OPERATION } : {}),
  };
}

/** The evidence-index world (retrieval corpus H1/H2/H3, H1 carries measurement uncertainty). */
function retrievalBundle(
  scenarioId: string,
  question: string,
  requiredEvidenceIds: readonly string[],
  scope: "in-scope" | "out-of-scope",
): EvidenceQuestionBundle {
  return {
    scenarioId,
    lane: "retrieval",
    question,
    authorizedContext: {
      projectId: "proj-renaissance-001",
      contextId: "ctx-evidence-index",
      revision: "r1",
    },
    evidence: [
      item({
        evidenceId: "H1",
        revision: "r1",
        kind: "retrieval-hit",
        content: "photo H1: level-2 spandrel beam with a crack near midspan",
        facts: ["photo H1 shows a 0.4 mm crack near midspan of the level-2 spandrel beam"],
        measurement: { sigma: 0.05, unit: "mm" },
      }),
      item({
        evidenceId: "H2",
        revision: "r1",
        kind: "retrieval-hit",
        content: "photo H2: level-2 slab with hairline shrinkage cracks",
        facts: ["photo H2 shows hairline shrinkage cracks in the level-2 slab"],
      }),
      item({
        evidenceId: "H3",
        revision: "r1",
        kind: "retrieval-hit",
        content: "drawing H3: structural drawing REV-C sheet 4, level-2 beam reinforcement layout",
        facts: [
          "drawing H3 is structural drawing REV-C sheet 4 showing the level-2 beam reinforcement layout",
        ],
      }),
    ],
    requiredEvidenceIds: [...requiredEvidenceIds],
    scope,
    offeredChecks: ["fixture-evidence-index-check"],
  };
}

/* ------------------------------------------------------------------ */
/* The scenario builder (prediction + oracle from one spec)             */
/* ------------------------------------------------------------------ */

interface OracleSpec {
  readonly claim: string | null;
  readonly status: EnvelopeResultStatus;
  readonly assumptions: readonly string[];
}

interface ScenarioSpec {
  readonly scenarioId: string;
  readonly bundle: EvidenceQuestionBundle;
  readonly behavior: Extract<FixtureBehavior, "replay" | "refuse" | "empty">;
  readonly script?: DeclaredEvidenceEnvelope;
  readonly oracle: OracleSpec;
  readonly expectedKind: FailureKind | "none";
  readonly expectedRules?: readonly EnvelopeIntegrityRule[];
}

function laneIdentity(lane: ReasoningEvalLane): {
  providerId: string;
  technologyVersion: string;
  capability: string;
} {
  const provider = LANE_FIXTURE_PROVIDERS[lane];
  return {
    providerId: provider.providerId,
    technologyVersion: provider.technologyVersion,
    capability: provider.capability,
  };
}

function buildScenario(spec: ScenarioSpec): ReasoningEvalScenario {
  const provider = LANE_FIXTURE_PROVIDERS[spec.bundle.lane];
  let prediction: {
    status: EnvelopeResultStatus;
    claim: string | null;
    facts: readonly string[];
    assumptions: readonly string[];
    unknowns: readonly string[];
    evidenceIds: readonly string[];
    checks: readonly string[];
    invalidation: readonly string[];
  };
  if (spec.behavior === "replay") {
    const script = spec.script;
    if (script === undefined) {
      throw new Error(`scenario '${spec.scenarioId}': the replay behavior requires a script`);
    }
    prediction = {
      status: script.resultStatus,
      claim: script.resultClaim,
      facts: script.facts,
      assumptions: script.assumptions,
      unknowns: script.unknowns,
      evidenceIds: script.evidenceIds,
      checks: script.deterministicChecks,
      invalidation: script.invalidationConditions,
    };
  } else if (spec.behavior === "refuse") {
    prediction = {
      status: "unsupported",
      claim: null,
      facts: [],
      assumptions: [],
      unknowns: [fixtureRefusalDetail(spec.bundle)],
      evidenceIds: [],
      checks: [],
      invalidation: [],
    };
  } else {
    prediction = {
      status: "unsupported",
      claim: null,
      facts: [],
      assumptions: [],
      unknowns: [FIXTURE_EMPTY_UNKNOWN],
      evidenceIds: [],
      checks: [],
      invalidation: [],
    };
  }
  const expected: ExpectedEnvelopeOutcome = {
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
    expectedFailureKind: spec.expectedKind,
    expectedViolationRules: spec.expectedRules ?? [],
  };
  return {
    scenarioId: spec.scenarioId,
    lane: spec.bundle.lane,
    providerRef: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
    },
    capability: provider.capability,
    input: {
      kind: "provider-input",
      capability: provider.capability,
      payload: {
        bundleJson: canonicalJsonText(spec.bundle),
        behaviorTag: spec.behavior,
        ...(spec.script === undefined ? {} : { variantScript: canonicalJsonText(spec.script) }),
      },
    },
    expected,
    criteria: FULL_EVALUATION_CRITERIA,
  };
}

/* ------------------------------------------------------------------ */
/* The scenario catalog (the committed Layer-2 benchmark fixture map)   */
/* ------------------------------------------------------------------ */

const VLM_ORACLE_TOOL: OracleSpec = {
  claim: "A claw hammer is visible on the workbench, stored inside the open red toolbox.",
  status: "supported",
  assumptions: ["the claw hammer is the only tool visible in the authorized images"],
};

const VLM_ORACLE_ROPE: OracleSpec = {
  claim: "The safety rope on the workbench is yellow.",
  status: "supported",
  assumptions: ["the coil shown in image E2 is the safety rope being asked about"],
};

const VLM_ORACLE_NAILS: OracleSpec = {
  claim: "The claw hammer can drive nails; it is stored inside the open red toolbox.",
  status: "supported",
  assumptions: ["the claw hammer is the only tool visible in the authorized images"],
};

const REFUSAL_ORACLE: OracleSpec = { claim: null, status: "unsupported", assumptions: [] };

const DOC_ORACLE_CONCRETE: OracleSpec = {
  claim: "Section 1 of the BOQ extract lists 'Concrete C30' with quantity 120 m3.",
  status: "supported",
  assumptions: ["section 1's listing is the governing revision r2 of the BOQ extract"],
};

const DOC_ORACLE_WARRANTY: OracleSpec = {
  claim: "Section 3 of the contract extract states the warranty duration is 60 months.",
  status: "supported",
  assumptions: ["section 3's statement is the governing revision r3 of the contract extract"],
};

const DOC_ORACLE_RETENTION: OracleSpec = {
  claim:
    "The retention stated in section 3 of the contract extract is not higher than five percent — it is exactly five percent.",
  status: "supported",
  assumptions: [],
};

const DOC_ORACLE_OPERATION: OracleSpec = {
  claim: "The warranty duration of section 3 of the contract extract is updated to 72 months.",
  status: "supported",
  assumptions: [],
};

const RETRIEVAL_ORACLE_CRACK: OracleSpec = {
  claim: "Photo H1 documents the 0.4 mm crack near midspan of the level-2 spandrel beam.",
  status: "supported",
  assumptions: [],
};

const RETRIEVAL_ORACLE_PAIR: OracleSpec = {
  claim:
    "Photo H1 and drawing H3 together are needed to assess the spandrel beam crack against the reinforcement layout.",
  status: "supported",
  assumptions: [],
};

function vlmScript(overrides: Partial<DeclaredEvidenceEnvelope>): DeclaredEvidenceEnvelope {
  return {
    evidenceIds: ["E1"],
    facts: ["a claw hammer is inside the toolbox", "the toolbox lid is open"],
    assumptions: VLM_ORACLE_TOOL.assumptions,
    unknowns: [],
    deterministicChecks: ["fixture-tool-inventory-check"],
    resultClaim: VLM_ORACLE_TOOL.claim,
    resultStatus: "supported",
    invalidationConditions: ["a new revision of image E1 showing the toolbox closed or the hammer removed"],
    nextRecommendedAction: "verify the tool inventory against the site walk-through record",
    agentIdentity: laneIdentity("multimodal-reasoning"),
    proposedOperation: null,
    ...overrides,
  };
}

function docScript(overrides: Partial<DeclaredEvidenceEnvelope>): DeclaredEvidenceEnvelope {
  return {
    evidenceIds: ["S1"],
    facts: ["section 1 lists item 'Concrete C30' with quantity 120 m3"],
    assumptions: DOC_ORACLE_CONCRETE.assumptions,
    unknowns: [],
    deterministicChecks: ["fixture-boq-field-extraction-check"],
    resultClaim: DOC_ORACLE_CONCRETE.claim,
    resultStatus: "supported",
    invalidationConditions: ["a revision of section 1 that changes the item or quantity"],
    nextRecommendedAction: "confirm the extracted quantity against the source PDF page",
    agentIdentity: laneIdentity("document-understanding"),
    proposedOperation: null,
    ...overrides,
  };
}

function retrievalScript(overrides: Partial<DeclaredEvidenceEnvelope>): DeclaredEvidenceEnvelope {
  return {
    evidenceIds: ["H1"],
    facts: ["photo H1 shows a 0.4 mm crack near midspan of the level-2 spandrel beam"],
    assumptions: [],
    unknowns: [],
    deterministicChecks: ["fixture-evidence-index-check"],
    resultClaim: RETRIEVAL_ORACLE_CRACK.claim,
    resultStatus: "supported",
    invalidationConditions: ["a re-indexed corpus that changes photo H1's identity or revision"],
    nextRecommendedAction: "open photo H1 in the evidence viewer for the inspector's review",
    agentIdentity: laneIdentity("retrieval"),
    proposedOperation: null,
    ...overrides,
  };
}

function buildCatalog(): readonly ReasoningEvalScenario[] {
  const scenarios: ReasoningEvalScenario[] = [];

  /* ---------------- multimodal-reasoning lane (9 scenarios) --------------- */

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-correct",
      bundle: multimodalBundle(
        "vlm-correct",
        "Which tool is visible on the workbench, and where is it stored?",
        ["E1"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({}),
      oracle: VLM_ORACLE_TOOL,
      expectedKind: "none",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-perception-failure",
      bundle: multimodalBundle(
        "vlm-perception-failure",
        "Which tool is visible on the workbench, and where is it stored?",
        ["E1"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({
        facts: [
          "the image shows a blue toolbox on a wooden workbench",
          "the toolbox lid is open",
          "a claw hammer is inside the toolbox",
        ],
        resultClaim: "The toolbox visible on the workbench is blue.",
        nextRecommendedAction: null,
      }),
      oracle: VLM_ORACLE_TOOL,
      expectedKind: "perception-failure",
      expectedRules: ["facts-grounded-in-cited-evidence"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-hallucination",
      bundle: multimodalBundle(
        "vlm-hallucination",
        "Which tool is visible on the workbench, and where is it stored?",
        ["E1"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({
        facts: ["a cordless drill is lying on the wooden workbench"],
        resultClaim: "A cordless drill is lying on the workbench.",
        nextRecommendedAction: null,
      }),
      oracle: VLM_ORACLE_TOOL,
      expectedKind: "perception-failure",
      expectedRules: ["facts-grounded-in-cited-evidence"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-wrong-evidence",
      bundle: multimodalBundle(
        "vlm-wrong-evidence",
        "What color is the safety rope on the workbench?",
        ["E2"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({
        evidenceIds: ["E1"],
        facts: ["the image shows a red toolbox on a wooden workbench"],
        assumptions: ["the coil shown in the queried image is the safety rope being asked about"],
        resultClaim: "The safety rope on the workbench is red.",
        invalidationConditions: ["a new revision of image E2 that changes the rope's color"],
        nextRecommendedAction: null,
      }),
      oracle: VLM_ORACLE_ROPE,
      expectedKind: "retrieval-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-reasoning-failure",
      bundle: multimodalBundle(
        "vlm-reasoning-failure",
        "Which tool in the images can drive nails, and where is it stored?",
        ["E1"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({
        resultClaim: "The screwdriver stored inside the toolbox is the tool that can drive nails.",
        nextRecommendedAction: null,
      }),
      oracle: VLM_ORACLE_NAILS,
      expectedKind: "reasoning-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-refusal",
      bundle: multimodalBundle(
        "vlm-refusal",
        "What is the serial number stamped on the toolbox?",
        [],
        "out-of-scope",
      ),
      behavior: "refuse",
      oracle: REFUSAL_ORACLE,
      expectedKind: "unsupported-data",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-hallucination-out-of-scope",
      bundle: multimodalBundle(
        "vlm-hallucination-out-of-scope",
        "What is the serial number stamped on the toolbox?",
        [],
        "out-of-scope",
      ),
      behavior: "replay",
      script: vlmScript({
        facts: ["the serial number TB-2024-1187 is stamped on the red toolbox"],
        assumptions: [],
        deterministicChecks: [],
        resultClaim: "The serial number stamped on the toolbox is TB-2024-1187.",
        invalidationConditions: [],
        nextRecommendedAction: null,
      }),
      oracle: REFUSAL_ORACLE,
      expectedKind: "unsupported-data",
      expectedRules: ["claim-requires-authorized-scope", "facts-grounded-in-cited-evidence"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-missing-identity",
      bundle: multimodalBundle(
        "vlm-missing-identity",
        "Which tool is visible on the workbench, and where is it stored?",
        ["E1"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({ agentIdentity: null }),
      oracle: VLM_ORACLE_TOOL,
      expectedKind: "contract-mismatch",
      expectedRules: ["identity-recorded"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "vlm-implicit-assumptions",
      bundle: multimodalBundle(
        "vlm-implicit-assumptions",
        "Which tool is visible on the workbench, and where is it stored?",
        ["E1"],
        "in-scope",
      ),
      behavior: "replay",
      script: vlmScript({ assumptions: [] }),
      oracle: VLM_ORACLE_TOOL,
      expectedKind: "contract-mismatch",
      expectedRules: ["assumptions-explicit"],
    }),
  );

  /* ---------------- document-understanding lane (8 scenarios) ------------- */

  scenarios.push(
    buildScenario({
      scenarioId: "doc-correct",
      bundle: documentBundle(
        "doc-correct",
        "What concrete grade and quantity does section 1 of the BOQ extract list?",
        ["S1"],
        "in-scope",
        false,
      ),
      behavior: "replay",
      script: docScript({}),
      oracle: DOC_ORACLE_CONCRETE,
      expectedKind: "none",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-missed-field",
      bundle: documentBundle(
        "doc-missed-field",
        "What concrete grade and quantity does section 1 of the BOQ extract list?",
        ["S1"],
        "in-scope",
        false,
      ),
      behavior: "replay",
      script: docScript({
        facts: [
          "section 1 lists item 'Concrete C30' with quantity 120 m3",
          "section 1 does not state a quantity for the concrete item",
        ],
        resultClaim: "Section 1 of the BOQ extract lists 'Concrete C30'; the quantity is not stated.",
        nextRecommendedAction: null,
      }),
      oracle: DOC_ORACLE_CONCRETE,
      expectedKind: "perception-failure",
      expectedRules: ["facts-grounded-in-cited-evidence"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-wrong-section",
      bundle: documentBundle(
        "doc-wrong-section",
        "What does section 3 of the contract extract state about the warranty duration?",
        ["S3"],
        "in-scope",
        false,
      ),
      behavior: "replay",
      script: docScript({
        evidenceIds: ["S2"],
        facts: [
          "section 2 lists item 'Rebar B500B' with quantity 2400 kg",
          "section 2 states the rebar rate applies per structural drawing REV-C",
        ],
        assumptions: ["the warranty duration is stated in section 2 of the extract"],
        resultClaim: "Section 2 states the warranty duration is 60 months.",
        invalidationConditions: ["a revision of section 2 that changes the rebar listing"],
        nextRecommendedAction: null,
      }),
      oracle: DOC_ORACLE_WARRANTY,
      expectedKind: "retrieval-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-reasoning-failure",
      bundle: documentBundle(
        "doc-reasoning-failure",
        "Is the retention stated in section 3 of the contract extract higher than five percent?",
        ["S3"],
        "in-scope",
        false,
      ),
      behavior: "replay",
      script: docScript({
        evidenceIds: ["S3"],
        facts: ["section 3 states the retention is 5 percent"],
        assumptions: [],
        resultClaim:
          "The retention stated in section 3 of the contract extract is higher than five percent.",
        invalidationConditions: ["a revision of section 3 that changes the retention percentage"],
        nextRecommendedAction: null,
      }),
      oracle: DOC_ORACLE_RETENTION,
      expectedKind: "reasoning-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-refusal",
      bundle: documentBundle(
        "doc-refusal",
        "What is the supplier's VAT identification number in the BOQ extract?",
        [],
        "out-of-scope",
        false,
      ),
      behavior: "refuse",
      oracle: REFUSAL_ORACLE,
      expectedKind: "unsupported-data",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-operation-correct",
      bundle: documentBundle(
        "doc-operation-correct",
        "Update the warranty duration in section 3 of the contract extract to 72 months.",
        ["S3"],
        "in-scope",
        true,
      ),
      behavior: "replay",
      script: docScript({
        evidenceIds: ["S3"],
        facts: ["section 3 states the warranty duration is 60 months"],
        assumptions: [],
        resultClaim: DOC_ORACLE_OPERATION.claim,
        invalidationConditions: ["a revision of section 3 that changes the warranty-duration field"],
        proposedOperation: {
          operationKind: "document-field-edit",
          targetEvidenceId: "S3",
          field: "warranty-duration",
          value: "72",
          unit: "months",
        },
        nextRecommendedAction: null,
      }),
      oracle: DOC_ORACLE_OPERATION,
      expectedKind: "none",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-operation-wrong-target",
      bundle: documentBundle(
        "doc-operation-wrong-target",
        "Update the warranty duration in section 3 of the contract extract to 72 months.",
        ["S3"],
        "in-scope",
        true,
      ),
      behavior: "replay",
      script: docScript({
        evidenceIds: ["S3"],
        facts: ["section 3 states the warranty duration is 60 months"],
        assumptions: [],
        resultClaim: DOC_ORACLE_OPERATION.claim,
        invalidationConditions: ["a revision of section 3 that changes the warranty-duration field"],
        proposedOperation: {
          operationKind: "document-field-edit",
          targetEvidenceId: "S2",
          field: "retention",
          value: "72",
          unit: "months",
        },
        nextRecommendedAction: null,
      }),
      oracle: DOC_ORACLE_OPERATION,
      expectedKind: "operation-semantic-failure",
      expectedRules: ["operation-contract-honored"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "doc-fabricated-check",
      bundle: documentBundle(
        "doc-fabricated-check",
        "What concrete grade and quantity does section 1 of the BOQ extract list?",
        ["S1"],
        "in-scope",
        false,
      ),
      behavior: "replay",
      script: docScript({
        deterministicChecks: ["doc-ocr-confidence-check/9"],
        nextRecommendedAction: null,
      }),
      oracle: DOC_ORACLE_CONCRETE,
      expectedKind: "contract-mismatch",
      expectedRules: ["checks-authorized"],
    }),
  );

  /* ---------------- retrieval lane (8 scenarios) -------------------------- */

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-correct",
      bundle: retrievalBundle(
        "retrieval-correct",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({}),
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "none",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-near-miss",
      bundle: retrievalBundle(
        "retrieval-near-miss",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({
        evidenceIds: ["H2"],
        facts: ["photo H2 shows hairline shrinkage cracks in the level-2 slab"],
        resultClaim: "Photo H2 documents the crack in the level-2 spandrel beam.",
        invalidationConditions: ["a re-indexed corpus that changes photo H2's identity or revision"],
        nextRecommendedAction: null,
      }),
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "retrieval-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-empty-in-scope",
      bundle: retrievalBundle(
        "retrieval-empty-in-scope",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "empty",
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "retrieval-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-empty-out-of-scope",
      bundle: retrievalBundle(
        "retrieval-empty-out-of-scope",
        "Find the evidence that documents the tear in the roof membrane.",
        [],
        "out-of-scope",
      ),
      behavior: "empty",
      oracle: REFUSAL_ORACLE,
      expectedKind: "unsupported-data",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-fabricated-hit",
      bundle: retrievalBundle(
        "retrieval-fabricated-hit",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({
        evidenceIds: ["H9"],
        facts: [],
        deterministicChecks: [],
        resultClaim: "Photo H9 documents the crack in the level-2 spandrel beam.",
        invalidationConditions: [],
        nextRecommendedAction: null,
      }),
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "unsupported-data",
      expectedRules: ["cited-evidence-exists"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-uncited-claim",
      bundle: retrievalBundle(
        "retrieval-uncited-claim",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({
        evidenceIds: [],
        facts: [],
        deterministicChecks: [],
        resultClaim: "Photo H1 documents the crack in the level-2 spandrel beam.",
        invalidationConditions: [],
        nextRecommendedAction: null,
      }),
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "retrieval-failure",
      expectedRules: ["claim-requires-evidence"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-perception-failure",
      bundle: retrievalBundle(
        "retrieval-perception-failure",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({
        facts: ["photo H1 shows a 0.4 mm crack near the support end of the level-2 spandrel beam"],
        resultClaim:
          "Photo H1 documents a 0.4 mm crack near the support end of the level-2 spandrel beam.",
        nextRecommendedAction: null,
      }),
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "perception-failure",
      expectedRules: ["facts-grounded-in-cited-evidence"],
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-reasoning-failure",
      bundle: retrievalBundle(
        "retrieval-reasoning-failure",
        "Which evidence is needed to assess the spandrel beam crack against the reinforcement layout?",
        ["H1", "H3"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({
        evidenceIds: ["H1", "H3"],
        facts: [
          "photo H1 shows a 0.4 mm crack near midspan of the level-2 spandrel beam",
          "drawing H3 is structural drawing REV-C sheet 4 showing the level-2 beam reinforcement layout",
        ],
        resultClaim:
          "Photo H1 alone is sufficient to assess the spandrel beam crack against the reinforcement layout.",
        invalidationConditions: ["a re-indexed corpus that changes photo H1's or drawing H3's identity"],
        nextRecommendedAction: null,
      }),
      oracle: RETRIEVAL_ORACLE_PAIR,
      expectedKind: "reasoning-failure",
    }),
  );

  scenarios.push(
    buildScenario({
      scenarioId: "retrieval-fabricated-check",
      bundle: retrievalBundle(
        "retrieval-fabricated-check",
        "Find the evidence that documents the crack in the level-2 spandrel beam.",
        ["H1"],
        "in-scope",
      ),
      behavior: "replay",
      script: retrievalScript({
        deterministicChecks: ["retrieval-rerank-check/2"],
        nextRecommendedAction: null,
      }),
      oracle: RETRIEVAL_ORACLE_CRACK,
      expectedKind: "contract-mismatch",
      expectedRules: ["checks-authorized"],
    }),
  );

  return scenarios;
}

/** The committed Layer-2 evaluation scenario catalog (26 scenarios — deterministic construction). */
export const REASONING_EVAL_CATALOG: readonly ReasoningEvalScenario[] = buildCatalog();

/** The scenario catalog (a fresh deterministic construction — byte-identical to the constant). */
export function reasoningEvalCatalog(): readonly ReasoningEvalScenario[] {
  return buildCatalog();
}

/* ------------------------------------------------------------------ */
/* The registry log for one catalog scenario                            */
/* ------------------------------------------------------------------ */

/** The registry log entry for one catalog scenario: the lane's fixture profile + the double's execution. */
export function registryLogForScenario(scenario: ReasoningEvalScenario): ReasoningEvalRegistryLog {
  const profile = fixtureProfileForLane(scenario.lane);
  return {
    profile,
    execution: executeFixtureProvider(profile, scenario.input),
  };
}

/* ------------------------------------------------------------------ */
/* The suite run + the committed-artifact goldens                        */
/* ------------------------------------------------------------------ */

/** The suite summary (the discrimination coverage table). */
export interface ReasoningEvalSuiteSummary {
  readonly total: number;
  readonly byLane: Readonly<Record<string, number>>;
  readonly byClassification: Readonly<Record<string, number>>;
  readonly classificationMatches: number;
  readonly expectedMatches: number;
  readonly discriminationCoverage: Readonly<Record<string, readonly string[]>>;
}

/** The full suite run: every outcome + the summary. */
export interface ReasoningEvalSuiteRun {
  readonly outcomes: readonly ReasoningEvalOutcome[];
  readonly summary: ReasoningEvalSuiteSummary;
}

/** Summarizes outcomes into the suite summary (pure; the coverage table is sorted). */
export function suiteSummaryOf(outcomes: readonly ReasoningEvalOutcome[]): ReasoningEvalSuiteSummary {
  const byLane: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const coverage: Record<string, Set<string>> = {};
  let classificationMatches = 0;
  let expectedMatches = 0;
  for (const outcome of outcomes) {
    byLane[outcome.lane] = (byLane[outcome.lane] ?? 0) + 1;
    byClassification[outcome.classification] = (byClassification[outcome.classification] ?? 0) + 1;
    const laneCoverage = coverage[outcome.lane] ?? new Set<string>();
    laneCoverage.add(outcome.classification);
    coverage[outcome.lane] = laneCoverage;
    if (outcome.fieldMatches.classification) {
      classificationMatches += 1;
    }
    if (outcome.expectedMatch) {
      expectedMatches += 1;
    }
  }
  const discriminationCoverage: Record<string, readonly string[]> = {};
  for (const lane of Object.keys(coverage).sort()) {
    discriminationCoverage[lane] = [...coverage[lane] ?? []].sort();
  }
  return {
    total: outcomes.length,
    byLane: Object.fromEntries(Object.entries(byLane).sort(([a], [b]) => a.localeCompare(b))),
    byClassification: Object.fromEntries(
      Object.entries(byClassification).sort(([a], [b]) => a.localeCompare(b)),
    ),
    classificationMatches,
    expectedMatches,
    discriminationCoverage,
  };
}

/** Runs the full committed catalog through the harness (deterministic). */
export function runReasoningEvalSuite(): ReasoningEvalSuiteRun {
  const outcomes = reasoningEvalCatalog().map((scenario) =>
    evaluateScenario(scenario, registryLogForScenario(scenario)),
  );
  return { outcomes, summary: suiteSummaryOf(outcomes) };
}

/** The committed scenario.json content (the canonical projection of the catalog). */
export function goldenScenarioSuiteJson(): string {
  return canonicalJsonText({
    suiteId: REASONING_EVAL_SUITE_ID,
    version: REASONING_EVAL_SUITE_VERSION,
    benchmarkId: REASONING_EVAL_BENCHMARK_ID,
    codeVersion: REASONING_EVAL_CODE_VERSION,
    scenarioCount: REASONING_EVAL_CATALOG.length,
    scenarios: REASONING_EVAL_CATALOG,
  });
}

/** The committed fixtures/expected-outcomes.json content (the canonical projection of a suite run). */
export function goldenExpectedOutcomesJson(): string {
  const run = runReasoningEvalSuite();
  return canonicalJsonText({
    suiteId: REASONING_EVAL_SUITE_ID,
    version: REASONING_EVAL_SUITE_VERSION,
    benchmarkId: REASONING_EVAL_BENCHMARK_ID,
    codeVersion: REASONING_EVAL_CODE_VERSION,
    scenarioCount: run.outcomes.length,
    outcomes: run.outcomes.map((outcome) => ({
      scenarioId: outcome.scenarioId,
      lane: outcome.lane,
      provider: outcome.provider,
      classification: outcome.classification,
      violationRules: outcome.violations.map((violation) => violation.rule),
      violationKinds: outcome.violations.map((violation) => violation.kind),
      resultStatus: outcome.envelope.resultStatus,
      resultClaim: outcome.envelope.resultClaim,
      envelopeDigest: outcome.envelopeDigest,
      inputDigest: outcome.inputDigest,
      normalizedResultDigest: outcome.normalizedResultDigest,
      recordId: outcome.benchmarkRecord.recordId,
      manifestId: outcome.provenanceManifest.manifestId,
      metrics: {
        classificationMatch: outcome.fieldMatches.classification ? 1 : 0,
        envelopeIntegrityViolations: outcome.violations.length,
        expectedOutcomeMatch: outcome.expectedMatch ? 1 : 0,
      },
      expectedMatch: outcome.expectedMatch,
    })),
    summary: run.summary,
  });
}

/* ------------------------------------------------------------------ */
/* The control-plane registry lifecycle over the fixture suite          */
/* ------------------------------------------------------------------ */

/** The registry lifecycle projection of the fixture suite (one entry per lane provider). */
export interface FixtureRegistryLifecycleResult {
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
 * Drives the committed suite through the REAL control-plane registry:
 * registration → evaluation → execution-normalized + benchmark-recorded +
 * provenance-sealed per scenario. No promotion is requested — the fixture
 * providers are doubles; promotion semantics belong to HFX-401's
 * scorecard (the promotion gates remain available to the Lead).
 */
export function driveFixtureRegistryLifecycle(): FixtureRegistryLifecycleResult {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `fixture registry lifecycle: event '${event.kind}' was refused: ${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  const lanes: ReasoningEvalLane[] = ["multimodal-reasoning", "document-understanding", "retrieval"];
  const profiles = new Map<ReasoningEvalLane, ProviderProfile>();
  for (const lane of lanes) {
    const profile = fixtureProfileForLane(lane);
    profiles.set(lane, profile);
    apply({ kind: "provider-registered", profile });
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }

  // Phase 2: every normalized execution while the entries are in the
  // evaluation state (the lawful-transition table requires this order).
  const outcomes = reasoningEvalCatalog().map((scenario) => ({
    scenario,
    outcome: evaluateScenario(scenario, registryLogForScenario(scenario)),
  }));
  for (const { scenario, outcome } of outcomes) {
    const profile = profiles.get(scenario.lane);
    if (profile === undefined) {
      throw new Error(`fixture registry lifecycle: no profile for lane '${scenario.lane}'`);
    }
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: scenario.capability,
        inputDigest: outcome.inputDigest,
        normalizedResultDigest: outcome.normalizedResultDigest,
      },
    });
  }

  // Phase 3: ONE consolidated benchmark record + ONE consolidated provenance
  // manifest per provider (the control plane's lawful-transition table
  // allows benchmark intake only from the evaluation state; the
  // consolidated record carries every scenario's metrics with subjectId
  // and every closed-vocabulary failure observation of the lane).
  for (const lane of lanes) {
    const profile = profiles.get(lane);
    if (profile === undefined) {
      throw new Error(`fixture registry lifecycle: no profile for lane '${lane}'`);
    }
    const laneOutcomes = outcomes.filter(({ scenario }) => scenario.lane === lane);
    const record = consolidatedLaneRecord(profile, lane, laneOutcomes.map((entry) => entry.outcome));
    apply({ kind: "benchmark-recorded", record });
    apply({
      kind: "provenance-sealed",
      manifest: sealProvenanceManifest({
        profile,
        inputDigests: laneOutcomes.map((entry) => entry.outcome.inputDigest),
        normalizedResultDigest: canonicalDigestOf(
          laneOutcomes.map((entry) => entry.outcome.normalizedResultDigest),
        ),
        benchmarkRecords: [record],
        environment: REASONING_EVAL_ENVIRONMENT,
        consumer: REASONING_EVAL_CONSUMER,
        reproducibilityStatement:
          "Layer-2 reasoning evaluation (consolidated lane record): the registered profile, the lane's " +
          "scenario input digests, the normalized result digests and the consolidated benchmark record " +
          "(digest above) fully determine this evaluation — identical inputs reproduce the identical manifest",
      }),
    });
  }

  const entries = registry.entries.map((entry) => ({
    providerId: entry.providerId,
    technologyVersion: entry.technologyVersion,
    state: entry.state,
    benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
    provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
  }));

  const replay = replayRegistry(events);
  if (!replay.ok) {
    throw new Error(`fixture registry lifecycle: replay refused: ${replay.failure.detail}`);
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
 * Consolidates one lane's scenario outcomes into the SINGLE control-plane
 * benchmark record the registry consumes (metrics carry per-scenario
 * subjectIds; failure observations are the lane's closed-vocabulary set).
 */
function consolidatedLaneRecord(
  profile: ProviderProfile,
  lane: ReasoningEvalLane,
  laneOutcomes: readonly ReasoningEvalOutcome[],
): BenchmarkRecord {
  const provider = LANE_FIXTURE_PROVIDERS[lane];
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: REASONING_EVAL_BENCHMARK_ID,
    capability: provider.capability,
    metrics: laneOutcomes.flatMap((outcome) => [
      {
        metric: "classification_match",
        value: outcome.fieldMatches.classification ? 1 : 0,
        unit: "ratio",
        subjectId: outcome.scenarioId,
        detail: "the harness's failure-kind classification equals the expected five-way discrimination ground truth",
      },
      {
        metric: "envelope_integrity_violations",
        value: outcome.violations.length,
        unit: "count",
        subjectId: outcome.scenarioId,
        detail: "the number of canonical envelope integrity rules violated (closed-vocabulary observations)",
      },
      {
        metric: "expected_outcome_match",
        value: outcome.expectedMatch ? 1 : 0,
        unit: "ratio",
        subjectId: outcome.scenarioId,
        detail: "every expected canonical envelope field, the classification and the violation set matched",
      },
    ]),
    failureObservations: laneOutcomes.flatMap((outcome) => [
      ...(outcome.classification === "none"
        ? []
        : [
            {
              kind: outcome.classification,
              detail: `${outcome.scenarioId}: the observed classification (the §HF-2 discrimination join)`,
            },
          ]),
      ...outcome.violations.map((violation) => ({
        kind: violation.kind,
        detail: `${outcome.scenarioId} ${violation.rule}: ${violation.detail}`,
      })),
    ]),
    resourceObservations: {
      compute: "deterministic-fixture-cpu",
      memoryMiB: 16,
      latencyMsP50: 0.5,
      latencyMsP95: 1,
    },
    reproduction: {
      inputsDigest: canonicalDigestOf(laneOutcomes.map((outcome) => outcome.inputDigest)),
      codeVersion: REASONING_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the lane's scenario input digests (aggregated digest above) through " +
        "the committed fixture doubles at code version (above) always yield these metrics — no clock, no " +
        "randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(`fixture registry lifecycle: the consolidated record failed validation: ${issues}`);
  }
  return validated.record;
}
