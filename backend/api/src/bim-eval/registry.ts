/**
 * HFX-204 — the BIM evaluation corpus: the CONTROL-PLANE REGISTRY WIRING.
 *
 * The corpus's two deterministic fixture providers, registered through the
 * HFX-000 control plane (`@aise/provider-registry` — IMPORTED, never
 * modified): every benchmark result is a `BenchmarkRecord` validated by
 * `validateBenchmarkRecord`, carrying provider identity, technology
 * version, configuration and input digests; every evaluation seals a
 * portable, digest-verifiable `ProvenanceManifest`. No provider-specific
 * type crosses the canonical boundary — the providers exchange data
 * through the control plane's normalized I/O (`ProviderInput` /
 * `RawProviderExecution` → `normalizeResult`) exactly like the Layer-2
 * reasoning doubles (backend/api/src/reasoning-eval/testkit.ts — the
 * mirrored pattern).
 *
 * THE TWO FIXTURE PROVIDERS (deterministic in-repo doubles, NO network, no
 * real model — the real IFC-Bench/BIM-Edit consumer providers are the
 * FUTURE users of this harness, explicit non-scope):
 *
 *  - `fixture-bim-qa-provider` (capability `fixture-bim-question-answering`)
 *    — the IFC-Bench lane double: consumes a canonical evidence-question
 *    bundle and answers through the declared output contract
 *    `{ envelopeJson }` (the Layer-2 Evidence Envelope schema);
 *  - `fixture-bim-edit-provider` (capability `fixture-bim-edit-translation`)
 *    — the BIM-Edit lane double: consumes a canonical edit bundle and
 *    answers through the declared output contract `{ intentJson }` (the
 *    normalized `EngineeringOperationIntent` wire shape).
 *
 * Both providers are representable by a FULL HFX-000 `ProviderProfile`
 * (15/15 mandatory fields, closed failure vocabulary, permissive in-repo
 * fixture license — these are OUR fixtures, not the upstream benchmarks;
 * the upstream evaluation-only status lives in the pinned manifests of
 * model.ts, a separate governance concern).
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock, no
 * randomness. Identical constructions are byte-identical.
 */

import { toLicenseDeclaration } from "@aise/provider-registry";
import type {
  FailureModeDeclaration,
  ProviderModality,
  ProviderProfile,
} from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Suite identity (declared, never sensed)                              */
/* ------------------------------------------------------------------ */

/** The pinned suite id of the HFX-204 BIM evaluation corpus. */
export const BIM_EVAL_SUITE_ID = "bim-eval-suite/1" as const;

/** The suite version of the committed corpus. */
export const BIM_EVAL_SUITE_VERSION = "1.0.0" as const;

/** The pinned benchmark id every emitted BenchmarkRecord carries. */
export const BIM_EVAL_BENCHMARK_ID = "bim-eval-suite/1" as const;

/** The code version stamped into every emitted record (deterministic reproduction). */
export const BIM_EVAL_CODE_VERSION = "hfx-204/bim-eval/1" as const;

/** The DECLARED environment fingerprint of every sealed manifest (never sensed). */
export const BIM_EVAL_ENVIRONMENT = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-hfx204-bim-eval",
  codeVersion: BIM_EVAL_CODE_VERSION,
  statement:
    "declared, not sensed — the BIM evaluation harness never reads the runtime environment " +
    "(determinism contract: identical fixtures + registry logs produce identical artifacts)",
} as const;

/** The AISE-side consumer identity of the HFX-204 evaluation manifests. */
export const BIM_EVAL_CONSUMER = {
  consumer: "AISE",
  surface: "hfx204-bim-eval",
} as const;

/** The declared resource observations of the deterministic fixture doubles. */
export const BIM_EVAL_DECLARED_RESOURCES = {
  compute: "deterministic-fixture-cpu",
  memoryMiB: 16,
  latencyMsP50: 0.5,
  latencyMsP95: 1,
} as const;

/** The lane → fixture-provider/capability assignment (one provider per lane). */
export const BIM_EVAL_LANE_FIXTURE_PROVIDERS: Readonly<
  Record<
    "ifc-bench-questions" | "bim-edit-operations",
    { readonly providerId: string; readonly technologyVersion: string; readonly capability: string }
  >
> = Object.freeze({
  "ifc-bench-questions": {
    providerId: "fixture-bim-qa-provider",
    technologyVersion: "1.0.0-fixture-v1",
    capability: "fixture-bim-question-answering",
  },
  "bim-edit-operations": {
    providerId: "fixture-bim-edit-provider",
    technologyVersion: "1.0.0-fixture-v1",
    capability: "fixture-bim-edit-translation",
  },
});

/* ------------------------------------------------------------------ */
/* The declared I/O contracts                                           */
/* ------------------------------------------------------------------ */

const BUNDLE_INPUT_FIELDS = [
  {
    name: "bundleJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the evaluation bundle — the IFC-Bench lane carries the Layer-2 " +
      "evidence-question bundle (question, authorized evidence set, offered checks); the BIM-Edit " +
      "lane carries the edit bundle (command, command quantities, model node universe, element " +
      "properties, constraints). The answer key never rides the bundle.",
    maxLength: 262144,
  },
  {
    name: "behaviorTag",
    type: "string",
    required: true,
    description:
      "the fixture-double control channel: replay | refuse | empty | malformed — a real provider " +
      "adapter ignores it and answers from the bundle alone",
    maxLength: 64,
  },
  {
    name: "variantScript",
    type: "string",
    required: false,
    description:
      "the replay script: the envelope (QA lane) or resolved intent (edit lane) the double emits " +
      "verbatim — correct OR defective; omitted for real-provider evaluations",
    maxLength: 262144,
  },
] as const;

const QA_OUTPUT_FIELDS = [
  {
    name: "envelopeJson",
    type: "string",
    required: true,
    description:
      "the declared Evidence Envelope as canonical JSON — the AISE-side Layer-2 schema every " +
      "IFC-Bench-style question answer must emit (evidenceIds, facts, assumptions, unknowns, " +
      "deterministicChecks, resultClaim, resultStatus, invalidationConditions, agentIdentity)",
    maxLength: 262144,
  },
] as const;

const EDIT_OUTPUT_FIELDS = [
  {
    name: "intentJson",
    type: "string",
    required: true,
    description:
      "the resolved EngineeringOperationIntent as canonical JSON — the normalized wire shape of " +
      "packages/solution-contract (typed parameters with units, anchored spatial target, " +
      "provenance with the exact command text). The intent is a PROPOSAL, never executed state.",
    maxLength: 262144,
  },
] as const;

/* ------------------------------------------------------------------ */
/* The fixture provider profiles                                        */
/* ------------------------------------------------------------------ */

function fixtureProfile(spec: {
  readonly providerId: string;
  readonly capability: string;
  readonly displayName: string;
  readonly description: string;
  readonly supportedModalities: readonly ProviderModality[];
  readonly inputModality: ProviderModality;
  readonly outputModality: ProviderModality;
  readonly contractStem: string;
  readonly outputFields:
    | readonly (typeof QA_OUTPUT_FIELDS)[number][]
    | readonly (typeof EDIT_OUTPUT_FIELDS)[number][];
  readonly failureModes: readonly FailureModeDeclaration[];
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
      intendedUse: "deterministic BIM/construction evaluation behind the AISE bim-eval harness",
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
      fields: BUNDLE_INPUT_FIELDS,
    },
    outputContract: {
      contractId: `${spec.contractStem}-output/1`,
      modality: spec.outputModality,
      fields: spec.outputFields,
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
        "the fixture emits no confidence scores; measurement uncertainty is propagated verbatim " +
        "from cited evidence by the Layer-2 harness — confidence is never fabricated and never " +
        "substitutes for measurement uncertainty",
    },
    failureModes: spec.failureModes.map((mode) => ({ ...mode })),
    benchmarkResults: [],
  };
}

/** The IFC-Bench lane's fixture provider (the BIM question-answering double). */
export function fixtureBimQaProviderProfile(): ProviderProfile {
  return fixtureProfile({
    providerId: "fixture-bim-qa-provider",
    capability: "fixture-bim-question-answering",
    displayName: "Fixture BIM Question-Answering Provider",
    description:
      "Deterministic IFC-Bench-lane fixture double (HFX-204): replays scripted Evidence Envelopes " +
      "over building-model evidence-question bundles — correct, misreading, wrong-element, " +
      "wrong-inference, refusing and fabricating variants for the five-way failure " +
      "discrimination. No real model, no network, no upstream data.",
    supportedModalities: ["document", "text"],
    inputModality: "document",
    outputModality: "text",
    contractStem: "fixture-bim-qa",
    outputFields: QA_OUTPUT_FIELDS,
    failureModes: [
      {
        kind: "perception-failure",
        condition: "a replay script declaring facts the cited model evidence does not contain",
        behavior: "the ungrounded fact is recorded as a closed-vocabulary perception-failure observation",
      },
      {
        kind: "retrieval-failure",
        condition: "a replay script citing the wrong (but real) element's evidence",
        behavior: "the required evidence is not cited — a retrieval defect, not a comprehension defect",
      },
      {
        kind: "reasoning-failure",
        condition: "a replay script carrying grounded facts but a wrong conclusion or silent conflict resolution",
        behavior: "an incorrect inference over correctly perceived and retrieved inputs",
      },
      {
        kind: "unsupported-data",
        condition: "an out-of-scope question (property/element outside the authorized model extract) or a fabricated evidence id",
        behavior: "explicit refusal / invented-support detection — never a fabricated answer",
      },
      {
        kind: "contract-mismatch",
        condition: "an envelope payload that violates the canonical Evidence Envelope schema",
        behavior: "typed normalization/parse refusal — never a silent coercion",
      },
    ],
  });
}

/** The BIM-Edit lane's fixture provider (the command-translation double). */
export function fixtureBimEditProviderProfile(): ProviderProfile {
  return fixtureProfile({
    providerId: "fixture-bim-edit-provider",
    capability: "fixture-bim-edit-translation",
    displayName: "Fixture BIM Edit-Translation Provider",
    description:
      "Deterministic BIM-Edit-lane fixture double (HFX-204): resolves edit commands (natural " +
      "language or direct intent) to scripted EngineeringOperationIntents — correct, wrong-unit, " +
      "wrong-target, fabricating and refusing variants for the operation-semantics evaluation. " +
      "No real model, no network, no unsafe execution: the intent is compared, never applied.",
    supportedModalities: ["text", "document"],
    inputModality: "text",
    outputModality: "text",
    contractStem: "fixture-bim-edit",
    outputFields: EDIT_OUTPUT_FIELDS,
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "a command referencing an element outside the authorized model fixture, or missing dimensions the bundle does not carry",
        behavior: "explicit refusal naming the missing element/quantity — never a fabricated shape or invented measurement",
      },
      {
        kind: "perception-failure",
        condition: "a resolved intent carrying a numeric parameter value the command and model properties do not contain",
        behavior: "the invented measurement is recorded as a perception-failure observation",
      },
      {
        kind: "operation-semantic-failure",
        condition: "a resolved intent with wrong units, wrong target element, wrong operation type or a violated declared constraint",
        behavior: "the violated rule/constraint is named — wrong engineering semantics though parsing succeeded",
      },
      {
        kind: "contract-mismatch",
        condition: "a resolved intent payload that does not decode against the EngineeringOperationIntent contract",
        behavior: "typed decode refusal — never a silent coercion",
      },
    ],
  });
}

/** The fixture provider profile of a corpus lane (by lane). */
export function fixtureProfileForBimLane(lane: "ifc-bench-questions" | "bim-edit-operations"): ProviderProfile {
  switch (lane) {
    case "ifc-bench-questions":
      return fixtureBimQaProviderProfile();
    case "bim-edit-operations":
      return fixtureBimEditProviderProfile();
  }
}

/** The lane of a fixture provider id (the inverse assignment). */
export function bimLaneOfProvider(providerId: string): "ifc-bench-questions" | "bim-edit-operations" | null {
  for (const [lane, provider] of Object.entries(BIM_EVAL_LANE_FIXTURE_PROVIDERS)) {
    if (provider.providerId === providerId) {
      return lane as "ifc-bench-questions" | "bim-edit-operations";
    }
  }
  return null;
}
