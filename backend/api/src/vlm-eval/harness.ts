/**
 * HFX-201 — the VLM provider benchmark HARNESS.
 *
 * `evaluateVlmScenario(scenario)` runs ONE corpus scenario for ONE
 * registered Qwen3-VL variant through the FULL evaluation pipeline:
 *
 *   1. the deterministic fixture DOUBLE executes the scenario input (the
 *      data-driven script — well-grounded / hallucinating / refusing);
 *   2. the raw execution passes the control plane's `normalizeResult`
 *      boundary (the closed declared I/O contract — typed refusals,
 *      never a silent coercion);
 *   3. the Layer-2 harness (CONSUMED from ../reasoning-eval — PROD-028's
 *      authority, imported and never modified) validates the declared
 *      envelope (`parseDeclaredEvidenceEnvelope` + the integrity rules),
 *      classifies the outcome with the CLOSED vocabulary's five-way
 *      discrimination tree and emits the content-addressed
 *      `BenchmarkRecord` + `ProvenanceManifest`;
 *   4. the DETERMINISTIC GROUNDED-REASONING CHECKS recompute what is
 *      recomputable from the structured fixtures (fact derivability,
 *      spatial-reference resolution, field values, conflicts) and compare
 *      — provider-claimed facts not derivable from the bundle are
 *      failures (`unsupported-data`); contradicting claims are
 *      `reasoning-failure`s; deterministically locatable but unsurfaced
 *      evidence and silently-resolved conflicts are `retrieval-failure`s;
 *   5. the REVISION BINDING is verified: every cited evidence id is bound
 *      to the exact revision the corpus fixture declares (consequential
 *      answers bind to the relevant evidence revision and task/context).
 *
 * The provider lane never becomes a readiness, verification or evidence
 * authority: the Layer-2 classification stays the canonical semantics and
 * the deterministic checks stay authoritative for supported calculations.
 * Provider replacement changes NOTHING here — swap the profile and the
 * registry log, and the same schema, checks and classification run.
 *
 * DETERMINISM: no clock, no randomness, no I/O. Identical scenario +
 * registry log produce byte-identical outcomes (asserted by the committed
 * goldens under tools/vlm-eval/).
 */

import type { ReasoningEvalRegistryLog } from "../reasoning-eval/model";
import { evaluateScenario } from "../reasoning-eval/harness";
import type { ReasoningEvalOutcome } from "../reasoning-eval/harness";
import { runGroundedReasoningChecks, verifyRevisionBinding } from "./checks";
import type { VlmGroundedCheckResult, VlmRevisionBinding } from "./checks";
import { executeQwen3VlDouble } from "./doubles";
import { qwen3VlProfileForVariant } from "./model";
import type { VlmBehaviorMatrixCell, VlmDoubleBehaviorClass, VlmVariantKey } from "./model";
import type { VlmEvalScenario } from "./corpus";
import { vlmEvalRuns } from "./corpus";

/* ------------------------------------------------------------------ */
/* The outcome                                                          */
/* ------------------------------------------------------------------ */

/** The full deterministic outcome of ONE VLM benchmark run. */
export interface VlmEvalOutcome {
  readonly scenarioId: string;
  readonly baseScenarioId: string;
  readonly variant: VlmVariantKey;
  readonly matrixCell: VlmBehaviorMatrixCell;
  readonly behaviorClass: VlmDoubleBehaviorClass;
  /** The Layer-2 outcome (envelope, classification, violations, record, manifest — PROD-028's semantics). */
  readonly layer2: ReasoningEvalOutcome;
  /** The deterministic grounded-reasoning check results (the recomputation authority). */
  readonly grounded: VlmGroundedCheckResult;
  /** The revision-binding verification (evidence revisions bound to the corpus fixtures). */
  readonly revisionBinding: VlmRevisionBinding;
  /** The expected grounded observation kinds (the corpus's deterministic-check assertion). */
  readonly expectedGroundedKinds: readonly string[];
  /**
   * Every expectation matched: the Layer-2 golden comparison AND the
   * grounded-check observation kinds AND the revision binding.
   */
  readonly expectedMatch: boolean;
}

/* ------------------------------------------------------------------ */
/* The registry log (the control-plane consumption seam)                */
/* ------------------------------------------------------------------ */

/**
 * Builds the registry log ONE run consumes: the variant's REGISTERED
 * candidate profile + the double's raw execution submitted for
 * normalization (exactly what a real Qwen3-VL adapter would submit — the
 * envelope through the declared output contract, the native payload
 * opaque).
 */
export function vlmRegistryLogFor(scenario: VlmEvalScenario): ReasoningEvalRegistryLog {
  const profile = qwen3VlProfileForVariant(scenario.variant);
  return {
    profile,
    execution: executeQwen3VlDouble(profile, scenario.scenario.input),
  };
}

/* ------------------------------------------------------------------ */
/* The entry point                                                      */
/* ------------------------------------------------------------------ */

function sortedEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort((x, y) => x.localeCompare(y));
  const sortedB = [...b].sort((x, y) => x.localeCompare(y));
  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Evaluates ONE corpus scenario for ONE variant (deterministic): the
 * double executes → the Layer-2 harness evaluates (envelope validation +
 * classification + record/manifest emission) → the deterministic grounded
 * checks recompute and compare → the revision binding is verified.
 *
 * Throws {@link VlmEvalError} for CALLER/wiring bugs only (an unregistered
 * variant, an incoherent corpus). Every PROVIDER-side outcome —
 * hallucinations, refusals, misclassifications, contradictions — is a
 * first-class value in the returned {@link VlmEvalOutcome}.
 */
export function evaluateVlmScenario(
  scenario: VlmEvalScenario,
  registryLog: ReasoningEvalRegistryLog = vlmRegistryLogFor(scenario),
): VlmEvalOutcome {
  // The Layer-2 evaluation (PROD-028's harness — the imported authority):
  // validates the profile + input through the control plane, normalizes
  // the double's execution, maps it onto the canonical envelope, verifies
  // the integrity rules, classifies with the closed vocabulary and emits
  // the content-addressed benchmark record + provenance manifest.
  const layer2 = evaluateScenario(scenario.scenario, registryLog);

  // The deterministic grounded-reasoning checks: the recomputation
  // authority over the structured corpus side. Provider-claimed facts not
  // derivable from the bundle are failures; contradictions of recomputed
  // values are reasoning failures; unsurfaced deterministically-located
  // evidence and silently-resolved conflicts are retrieval failures.
  const grounded = runGroundedReasoningChecks(
    layer2.envelope,
    scenario.fixtures,
    scenario.checkPlan,
  );

  // The revision binding: every cited evidence id is bound to the exact
  // revision the corpus fixture declares.
  const revisionBinding = verifyRevisionBinding(layer2.envelope, scenario.fixtures);

  const groundedMatch = sortedEqual(grounded.observationKinds, scenario.expectedGroundedKinds);
  const expectedMatch = layer2.expectedMatch && groundedMatch && revisionBinding.ok;

  return {
    scenarioId: scenario.scenarioId,
    baseScenarioId: scenario.baseScenarioId,
    variant: scenario.variant,
    matrixCell: scenario.matrixCell,
    behaviorClass: scenario.behaviorClass,
    layer2,
    grounded,
    revisionBinding,
    expectedGroundedKinds: scenario.expectedGroundedKinds,
    expectedMatch,
  };
}

/** Runs the full committed run corpus (24 runs — every base scenario × both variants). */
export function evaluateVlmRunCorpus(
  runs: readonly VlmEvalScenario[] = vlmEvalRuns(),
): readonly VlmEvalOutcome[] {
  return runs.map((scenario) => evaluateVlmScenario(scenario));
}
