/**
 * HFX-301 — the equivalence benchmark's CONTROL-PLANE REGISTRY WIRING.
 *
 * The benchmark lane's deterministic in-house provider, registered through
 * the HFX-000 control plane (`@aise/provider-registry` — IMPORTED, never
 * modified): every corpus evaluation emits a governed `BenchmarkRecord`
 * (content-addressed, validated by `validateBenchmarkRecord`) carrying the
 * deterministic in-house lane's identity, and seals a portable,
 * digest-verifiable `ProvenanceManifest` (`sealProvenanceManifest`). The
 * suite aggregates an ordered-manifest-id digest (the corpus's provenance
 * fingerprint). No provider-specific type crosses the canonical boundary.
 *
 * THE LANE PROVIDER (a deterministic in-repo double, NO network, no live
 * model): `deterministic-inhouse-lane` (capability
 * `nl-direct-manipulation-equivalence`) — the lane that runs BOTH
 * authoring paths of every corpus pair through the deterministic compiler,
 * the contract constructor and the solution engine. The provider-enriched
 * NLU seam is PROD-029 substitution territory, NOT equivalence-eval (the
 * honest limitation this benchmark declares): the DEFAULT
 * `NlUnderstandingPort` never enriches, so the whole corpus passes offline.
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock, no
 * randomness. Identical constructions are byte-identical.
 */

import {
  SOLUTION_ENGINE_KIND,
  SOLUTION_ENGINE_VERSION,
} from "@aise/solution-engine";
import { toLicenseDeclaration } from "@aise/provider-registry";
import type {
  FailureModeDeclaration,
  ProviderModality,
  ProviderProfile,
} from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Suite identity (declared, never sensed)                              */
/* ------------------------------------------------------------------ */

/** The pinned suite id of the HFX-301 equivalence corpus. */
export const EQUIVALENCE_EVAL_SUITE_ID = "equivalence-eval-suite/1" as const;

/** The suite version of the committed corpus. */
export const EQUIVALENCE_EVAL_SUITE_VERSION = "1.0.0" as const;

/** The pinned benchmark id every emitted BenchmarkRecord carries. */
export const EQUIVALENCE_EVAL_BENCHMARK_ID = "equivalence-eval-suite/1" as const;

/** The code version stamped into every emitted record (deterministic reproduction). */
export const EQUIVALENCE_EVAL_CODE_VERSION = "hfx-301/equivalence-eval/1" as const;

/** The control-plane identity of the deterministic in-house lane. */
export const EQUIVALENCE_LANE_PROVIDER_ID = "deterministic-inhouse-lane" as const;
export const EQUIVALENCE_LANE_TECHNOLOGY_VERSION = "1.0.0-deterministic" as const;

/** The capability the equivalence benchmark records under. */
export const EQUIVALENCE_CAPABILITY = "nl-direct-manipulation-equivalence" as const;

/**
 * The pinned compiler identity: the PROD-023 deterministic grammar the NL
 * path runs (the default NlUnderstandingPort — never the enriched seam).
 * A declared pin, not a sensed version (the compiler surface carries no
 * version constant; the pin names the module + the deterministic path).
 */
export const EQUIVALENCE_COMPILER_CODE_VERSION = "prod-023/deterministic-grammar/1" as const;

/** The engine identity the journey runs on (IMPORTED from the engine's own version). */
export const EQUIVALENCE_ENGINE_CODE_VERSION = SOLUTION_ENGINE_VERSION as string;
export const EQUIVALENCE_ENGINE_KIND = SOLUTION_ENGINE_KIND as string;

/**
 * The pinned taxonomy versions the corpus declares: the PROD-023 refusal
 * taxonomy + the Phase 1 operation vocabulary + the contract's wire
 * version (mirrored frozen reference data — the corpus's scenario header
 * carries them for auditability).
 */
export const EQUIVALENCE_TAXONOMY_VERSION = "prod-023/refusal-and-operation-taxonomy/1" as const;

/** The DECLARED environment fingerprint of every sealed manifest (never sensed). */
export const EQUIVALENCE_EVAL_ENVIRONMENT = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-hfx301-equivalence-eval",
  codeVersion: EQUIVALENCE_EVAL_CODE_VERSION,
  statement:
    "declared, not sensed — the equivalence harness never reads the runtime environment " +
    "(determinism contract: identical corpus + scenes produce identical artifacts; the " +
    "compiler runs on the DEFAULT deterministic NlUnderstandingPort — provider-enriched " +
    "interpretations are PROD-029 substitution territory, not equivalence-eval)",
} as const;

/** The AISE-side consumer identity of the HFX-301 evaluation manifests. */
export const EQUIVALENCE_EVAL_CONSUMER = {
  consumer: "AISE",
  surface: "hfx301-equivalence-eval",
} as const;

/** The declared resource observations of the deterministic in-house lane. */
export const EQUIVALENCE_EVAL_DECLARED_RESOURCES = {
  compute: "deterministic-inhouse-cpu",
  memoryMiB: 16,
  latencyMsP50: 0.5,
  latencyMsP95: 1,
} as const;

/* ------------------------------------------------------------------ */
/* The declared I/O contracts                                           */
/* ------------------------------------------------------------------ */

const PAIR_INPUT_FIELDS = [
  {
    name: "pairJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the equivalence pair — the NL utterance, the direct-manipulation " +
      "authoring input (typed parameters, anchored target, interaction detail), the scene " +
      "reference, the session seeds and the declared expectation cell",
    maxLength: 262144,
  },
] as const;

const OUTCOME_OUTPUT_FIELDS = [
  {
    name: "outcomeJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the equivalence outcome — both paths' journey records (operation " +
      "identity, post-state digest, validation verdict, BOQ delta), the comparison verdict " +
      "with the closed-vocabulary difference kind where declared, and the expectation-match flag",
    maxLength: 262144,
  },
] as const;

/* ------------------------------------------------------------------ */
/* The lane provider profile                                            */
/* ------------------------------------------------------------------ */

/**
 * The deterministic in-house lane provider (the HFX-301 benchmark's own
 * identity in the control plane): full 15-field `ProviderProfile`, closed
 * failure vocabulary, permissive in-repo lane license. It runs the corpus
 * through the deterministic compiler + contract constructor + solution
 * engine — no network, no live model, no clock.
 */
export function deterministicInhouseLaneProfile(): ProviderProfile {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: EQUIVALENCE_LANE_PROVIDER_ID,
    technologyVersion: EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
    displayName: "Deterministic In-House Equivalence Lane",
    description:
      "The HFX-301 natural-language/direct-manipulation equivalence benchmark lane: runs every " +
      "committed corpus pair through BOTH authoring paths — the PROD-023 deterministic compiler " +
      "(the default grammar understanding port) and the interactive authoring input through the " +
      "contract's createOperationIntent — against the same deterministic baseline scene, then " +
      "through the same solution engine (apply → validate → BOQ). Deterministic, offline, no " +
      "live models; the four behavior-matrix cells (equivalent, declared-different, " +
      "agent-refused, agent-clarification) are first-class outcomes.",
    capabilities: [EQUIVALENCE_CAPABILITY],
    supportedModalities: ["text"] as readonly ProviderModality[],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-house lane computation — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared lane memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared lane latencies — no wall-clock measurement exists in the control plane",
    },
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "deterministic natural-language/direct-manipulation equivalence evaluation behind the AISE equivalence-eval harness",
      intendedUseCleared: true,
    }),
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy:
        "deterministic in-house lane — local computation only, no quota, no fallback needed",
    },
    inputContract: {
      contractId: "equivalence-lane-input/1",
      modality: "text" as ProviderModality,
      fields: PAIR_INPUT_FIELDS,
    },
    outputContract: {
      contractId: "equivalence-lane-output/1",
      modality: "text" as ProviderModality,
      fields: OUTCOME_OUTPUT_FIELDS,
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
        "the lane emits no confidence scores; equivalence verdicts are deterministic comparisons " +
        "over canonical journey outputs — confidence is never fabricated and never substitutes " +
        "for measurement uncertainty",
    },
    failureModes: [
      {
        kind: "operation-semantic-failure",
        condition:
          "a declared-different pair whose two paths diverge on operation identity, state digest, validation verdict or BOQ delta",
        behavior:
          "the divergence is recorded with the closed-vocabulary difference kind the corpus declared — never hidden, never averaged",
      },
      {
        kind: "unsupported-data",
        condition:
          "an NL utterance outside the Phase 1 building operation vocabulary, or a session the compiler cannot anchor",
        behavior: "the honest unsupported/clarification outcome — never a guessed operation",
      },
      {
        kind: "contract-mismatch",
        condition:
          "an authored input that fails the contract constructor's typed validation",
        behavior: "typed encode refusal — never a silent coercion into a comparison",
      },
    ] as readonly FailureModeDeclaration[],
    benchmarkResults: [],
  };
}
