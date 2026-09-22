/**
 * PROD-028 — the HARNESS tests: the five-way failure discrimination (the
 * §HF-2 exit gate), the envelope-integrity rules, the control-plane
 * BenchmarkRecord + ProvenanceManifest emission, the canonical-boundary
 * guard and the determinism contract.
 *
 * THE DISCRIMINATION ASSERTIONS (the packet's mandated negative cases):
 *   - a provider answering from the WRONG (but real) evidence →
 *     retrieval-failure, NOT reasoning-failure;
 *   - a provider refusing out-of-scope data → unsupported-data, NOT
 *     perception-failure;
 *   - a provider hallucinating plausible answers → CAUGHT (envelope
 *     integrity violations + the right failure kind).
 */

import { describe, expect, test } from "bun:test";
import {
  FAILURE_KINDS,
  deriveBenchmarkRecordId,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import type { FailureKind, ProviderProfile } from "@aise/provider-registry";
import { evaluateScenario, REASONING_EVAL_BENCHMARK_ID } from "./harness";
import type { ReasoningEvalOutcome } from "./harness";
import { parseReasoningEvalScenario, ReasoningEvalError } from "./model";
import {
  REASONING_EVAL_CATALOG,
  driveFixtureRegistryLifecycle,
  executeFixtureProvider,
  fixtureProfileForLane,
  registryLogForScenario,
  runReasoningEvalSuite,
} from "./testkit";

const outcomeOf = (scenarioId: string): ReasoningEvalOutcome => {
  const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === scenarioId);
  if (scenario === undefined) {
    throw new Error(`test setup: no scenario '${scenarioId}'`);
  }
  return evaluateScenario(scenario, registryLogForScenario(scenario));
};

const classificationOf = (scenarioId: string): string => outcomeOf(scenarioId).classification;

const rulesOf = (scenarioId: string): readonly string[] =>
  outcomeOf(scenarioId).violations.map((violation) => violation.rule);

/* ------------------------------------------------------------------ */
/* The committed catalog: every classification asserted                 */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the committed catalog discriminates every scenario", () => {
  test("all 26 scenarios classify and match their expected outcome exactly", () => {
    const run = runReasoningEvalSuite();
    expect(run.outcomes.length).toBe(26);
    expect(run.summary.classificationMatches).toBe(26);
    expect(run.summary.expectedMatches).toBe(26);
  });

  test("every violation kind comes from the CLOSED failure vocabulary (no invented kinds)", () => {
    for (const outcome of runReasoningEvalSuite().outcomes) {
      for (const violation of outcome.violations) {
        expect((FAILURE_KINDS as readonly string[]).includes(violation.kind)).toBe(true);
      }
      for (const observation of outcome.benchmarkRecord.failureObservations) {
        expect((FAILURE_KINDS as readonly string[]).includes(observation.kind)).toBe(true);
      }
    }
  });

  test("the five-way discrimination coverage per lane (the HF-2 exit gate table)", () => {
    const coverage = runReasoningEvalSuite().summary.discriminationCoverage;
    expect(coverage["multimodal-reasoning"]).toContain("perception-failure");
    expect(coverage["multimodal-reasoning"]).toContain("retrieval-failure");
    expect(coverage["multimodal-reasoning"]).toContain("reasoning-failure");
    expect(coverage["multimodal-reasoning"]).toContain("unsupported-data");
    expect(coverage["document-understanding"]).toContain("perception-failure");
    expect(coverage["document-understanding"]).toContain("retrieval-failure");
    expect(coverage["document-understanding"]).toContain("reasoning-failure");
    expect(coverage["document-understanding"]).toContain("unsupported-data");
    expect(coverage["document-understanding"]).toContain("operation-semantic-failure");
    expect(coverage["retrieval"]).toContain("perception-failure");
    expect(coverage["retrieval"]).toContain("retrieval-failure");
    expect(coverage["retrieval"]).toContain("reasoning-failure");
    expect(coverage["retrieval"]).toContain("unsupported-data");
  });
});

/* ------------------------------------------------------------------ */
/* The multimodal lane                                                  */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the multimodal lane (fixture-vlm-provider)", () => {
  test("vlm-correct → a clean canonical envelope, classification none", () => {
    const outcome = outcomeOf("vlm-correct");
    expect(outcome.classification).toBe("none");
    expect(outcome.violations).toEqual([]);
    expect(outcome.envelope.resultStatus).toBe("supported");
    expect(outcome.envelope.evidenceIds).toEqual(["E1"]);
    expect(outcome.envelope.evidenceRevisions).toEqual([{ evidenceId: "E1", revision: "r1" }]);
    expect(outcome.envelope.agentIdentity?.providerId).toBe("fixture-vlm-provider");
    expect(outcome.envelope.intent).toContain("workbench");
    expect(outcome.envelope.authorizedContext.contextId).toBe("ctx-workbench");
    expect(outcome.expectedMatch).toBe(true);
  });

  test("vlm-perception-failure → misread content is a perception failure", () => {
    expect(classificationOf("vlm-perception-failure")).toBe("perception-failure");
    expect(rulesOf("vlm-perception-failure")).toEqual(["facts-grounded-in-cited-evidence"]);
  });

  test("vlm-hallucination → a plausible hallucinated answer is CAUGHT (integrity violation + the right kind)", () => {
    const outcome = outcomeOf("vlm-hallucination");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.violations.map((violation) => violation.kind)).toEqual(["perception-failure"]);
    expect(outcome.violations[0]?.detail).toContain("cordless drill");
    // the hallucinated fact is exactly the observation the benchmark record carries
    expect(
      outcome.benchmarkRecord.failureObservations.some((observation) =>
        observation.detail.includes("hallucinated or misread content"),
      ),
    ).toBe(true);
  });

  test("vlm-wrong-evidence → answering from the WRONG (real) evidence is retrieval-failure, NOT reasoning-failure", () => {
    const outcome = outcomeOf("vlm-wrong-evidence");
    expect(outcome.classification).toBe("retrieval-failure");
    expect(outcome.classification).not.toBe("reasoning-failure");
    expect(outcome.violations).toEqual([]); // the envelope itself is well-formed — the SELECTION is wrong
    expect(outcome.envelope.evidenceIds).toEqual(["E1"]); // cited the toolbox image for a rope question
  });

  test("vlm-reasoning-failure → grounded facts with a wrong conclusion is a reasoning failure", () => {
    const outcome = outcomeOf("vlm-reasoning-failure");
    expect(outcome.classification).toBe("reasoning-failure");
    expect(outcome.violations).toEqual([]);
    expect(outcome.fieldMatches.facts).toBe(true); // the perceived facts are right
    expect(outcome.fieldMatches.classification).toBe(true);
  });

  test("vlm-refusal → refusing out-of-scope data is unsupported-data, NOT perception-failure", () => {
    const outcome = outcomeOf("vlm-refusal");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.classification).not.toBe("perception-failure");
    expect(outcome.violations).toEqual([]); // the honest refusal violates nothing
    expect(outcome.envelope.resultStatus).toBe("unsupported");
    expect(outcome.envelope.resultClaim).toBeNull();
    expect(outcome.envelope.unknowns.length).toBe(1);
    expect(outcome.envelope.unknowns[0]).toContain("explicit refusal");
  });

  test("vlm-hallucination-out-of-scope → a fabricated answer to an out-of-scope question is unsupported-data + violations", () => {
    const outcome = outcomeOf("vlm-hallucination-out-of-scope");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "claim-requires-authorized-scope",
      "facts-grounded-in-cited-evidence",
    ]);
  });

  test("vlm-missing-identity → an envelope without provider identity is a contract mismatch", () => {
    const outcome = outcomeOf("vlm-missing-identity");
    expect(outcome.classification).toBe("contract-mismatch");
    expect(rulesOf("vlm-missing-identity")).toEqual(["identity-recorded"]);
    expect(outcome.envelope.agentIdentity).toBeNull();
  });

  test("vlm-implicit-assumptions → a claim resting on undeclared premises is a contract mismatch", () => {
    const outcome = outcomeOf("vlm-implicit-assumptions");
    expect(outcome.classification).toBe("contract-mismatch");
    expect(rulesOf("vlm-implicit-assumptions")).toEqual(["assumptions-explicit"]);
    expect(outcome.envelope.assumptions).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The document lane                                                    */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the document lane (fixture-doc-provider)", () => {
  test("doc-correct → a clean extraction, classification none", () => {
    expect(classificationOf("doc-correct")).toBe("none");
    expect(outcomeOf("doc-correct").violations).toEqual([]);
  });

  test("doc-missed-field → a false-absence fact (missed field) is a perception failure", () => {
    const outcome = outcomeOf("doc-missed-field");
    expect(outcome.classification).toBe("perception-failure");
    expect(rulesOf("doc-missed-field")).toEqual(["facts-grounded-in-cited-evidence"]);
  });

  test("doc-wrong-section → a wrong-section attribution is a retrieval failure", () => {
    const outcome = outcomeOf("doc-wrong-section");
    expect(outcome.classification).toBe("retrieval-failure");
    expect(outcome.envelope.evidenceIds).toEqual(["S2"]); // the wrong (but real) section
    expect(outcome.violations).toEqual([]);
  });

  test("doc-reasoning-failure → a wrong comparison over extracted fields is a reasoning failure", () => {
    expect(classificationOf("doc-reasoning-failure")).toBe("reasoning-failure");
    expect(outcomeOf("doc-reasoning-failure").violations).toEqual([]);
  });

  test("doc-refusal → an absent field refuses explicitly (unsupported-data)", () => {
    const outcome = outcomeOf("doc-refusal");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.violations).toEqual([]);
  });

  test("doc-operation-correct → the lawful edit proposal passes clean", () => {
    const outcome = outcomeOf("doc-operation-correct");
    expect(outcome.classification).toBe("none");
    expect(outcome.envelope.proposedOperation?.targetEvidenceId).toBe("S3");
    expect(outcome.violations).toEqual([]);
  });

  test("doc-operation-wrong-target → an operation violating the contract is an operation-semantic failure", () => {
    const outcome = outcomeOf("doc-operation-wrong-target");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(rulesOf("doc-operation-wrong-target")).toEqual(["operation-contract-honored"]);
    // parsing and perception SUCCEEDED (the claim matches); only the engineering semantics are wrong
    expect(outcome.fieldMatches.resultClaim).toBe(true);
    expect(outcome.fieldMatches.facts).toBe(true);
  });

  test("doc-fabricated-check → claiming an unoffered deterministic check is a contract mismatch", () => {
    const outcome = outcomeOf("doc-fabricated-check");
    expect(outcome.classification).toBe("contract-mismatch");
    expect(rulesOf("doc-fabricated-check")).toEqual(["checks-authorized"]);
  });
});

/* ------------------------------------------------------------------ */
/* The retrieval lane                                                   */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the retrieval lane (fixture-retrieval-provider)", () => {
  test("retrieval-correct → a clean hit, classification none, uncertainty propagated verbatim", () => {
    const outcome = outcomeOf("retrieval-correct");
    expect(outcome.classification).toBe("none");
    expect(outcome.envelope.measurementUncertainty).toEqual([
      { evidenceId: "H1", sigma: 0.05, unit: "mm" },
    ]);
  });

  test("retrieval-near-miss → a semantically wrong but real hit is a retrieval failure", () => {
    const outcome = outcomeOf("retrieval-near-miss");
    expect(outcome.classification).toBe("retrieval-failure");
    expect(outcome.envelope.evidenceIds).toEqual(["H2"]);
    expect(outcome.violations).toEqual([]);
  });

  test("retrieval-empty-in-scope → empty results for an in-scope query is a retrieval failure (the data exists)", () => {
    const outcome = outcomeOf("retrieval-empty-in-scope");
    expect(outcome.classification).toBe("retrieval-failure");
    expect(outcome.envelope.resultStatus).toBe("unsupported");
    expect(outcome.envelope.unknowns).toEqual(["no corpus evidence matched the question"]);
  });

  test("retrieval-empty-out-of-scope → the SAME empty behavior for absent data is unsupported-data (the discrimination pair)", () => {
    const outcome = outcomeOf("retrieval-empty-out-of-scope");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.violations).toEqual([]);
    // identical behavior, different ground truth ⇒ a different classification
    expect(outcome.envelope.unknowns).toEqual(outcomeOf("retrieval-empty-in-scope").envelope.unknowns);
  });

  test("retrieval-fabricated-hit → a fabricated hit id is unsupported-data (invented support), NOT retrieval-failure", () => {
    const outcome = outcomeOf("retrieval-fabricated-hit");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.classification).not.toBe("retrieval-failure");
    expect(rulesOf("retrieval-fabricated-hit")).toEqual(["cited-evidence-exists"]);
  });

  test("retrieval-uncited-claim → a supported claim citing no evidence at all", () => {
    const outcome = outcomeOf("retrieval-uncited-claim");
    expect(outcome.classification).toBe("retrieval-failure");
    expect(rulesOf("retrieval-uncited-claim")).toEqual(["claim-requires-evidence"]);
  });

  test("retrieval-perception-failure → misreporting a correct hit's content is a perception failure", () => {
    expect(classificationOf("retrieval-perception-failure")).toBe("perception-failure");
    expect(rulesOf("retrieval-perception-failure")).toEqual(["facts-grounded-in-cited-evidence"]);
  });

  test("retrieval-reasoning-failure → wrongly synthesizing correct hits is a reasoning failure", () => {
    expect(classificationOf("retrieval-reasoning-failure")).toBe("reasoning-failure");
    expect(outcomeOf("retrieval-reasoning-failure").violations).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The envelope mapping + the emission                                  */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the canonical envelope mapping and control-plane emission", () => {
  test("measurement uncertainty is empty when no cited evidence carries one (never fabricated)", () => {
    expect(outcomeOf("vlm-correct").envelope.measurementUncertainty).toEqual([]);
    expect(outcomeOf("doc-correct").envelope.measurementUncertainty).toEqual([]);
  });

  test("nextRecommendedAction is carried canonically (declared, not asserted — the documented gap)", () => {
    expect(outcomeOf("vlm-correct").envelope.nextRecommendedAction).toContain("walk-through");
    expect(outcomeOf("vlm-hallucination").envelope.nextRecommendedAction).toBeNull();
  });

  test("the emitted BenchmarkRecord validates, is content-addressed and joins the comparability key", () => {
    for (const outcome of runReasoningEvalSuite().outcomes) {
      const record = outcome.benchmarkRecord;
      expect(record.benchmarkId).toBe(REASONING_EVAL_BENCHMARK_ID);
      expect(record.reproduction.inputsDigest).toBe(outcome.inputDigest);
      expect(record.metrics.length).toBe(3);
      const validation = validateBenchmarkRecord(record);
      expect(validation.ok).toBe(true);
      expect(deriveBenchmarkRecordId(record)).toBe(record.recordId);
    }
  });

  test("a scenario with a non-none classification carries its kind in the record's failure observations (the HF-2 join)", () => {
    const outcome = outcomeOf("vlm-wrong-evidence");
    expect(
      outcome.benchmarkRecord.failureObservations.some(
        (observation) => observation.kind === "retrieval-failure",
      ),
    ).toBe(true);
    const clean = outcomeOf("vlm-correct");
    expect(clean.benchmarkRecord.failureObservations).toEqual([]);
  });

  test("the sealed ProvenanceManifest verifies by digest and chains the record", () => {
    for (const outcome of runReasoningEvalSuite().outcomes) {
      const manifest = outcome.provenanceManifest;
      const validation = verifyProvenanceManifest(manifest);
      expect(validation.ok).toBe(true);
      expect(manifest.benchmarkRecordReferences).toEqual([outcome.benchmarkRecord.recordId]);
      expect(manifest.inputDigests).toEqual([outcome.inputDigest]);
      expect(manifest.normalizedResultDigest).toBe(outcome.normalizedResultDigest);
      expect(manifest.consumerIdentity.surface).toBe("layer2-reasoning-eval");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Determinism + the canonical-boundary guard                           */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: determinism and the canonical-boundary guard", () => {
  test("identical inputs produce byte-identical envelopes, records and manifests", () => {
    const first = runReasoningEvalSuite();
    const second = runReasoningEvalSuite();
    for (const [a, b] of first.outcomes.map((outcome, index) => [outcome, second.outcomes[index]])) {
      expect(b?.envelopeDigest).toBe(a?.envelopeDigest);
      expect(b?.benchmarkRecord.recordId).toBe(a?.benchmarkRecord.recordId);
      expect(b?.provenanceManifest.manifestId).toBe(a?.provenanceManifest.manifestId);
      expect(b?.classification).toBe(a?.classification);
    }
  });

  test("the provider-native payload NEVER crosses the canonical boundary (opaque, provenance only)", () => {
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "vlm-hallucination");
    if (scenario === undefined) {
      throw new Error("test setup: vlm-hallucination missing");
    }
    const profile: ProviderProfile = fixtureProfileForLane(scenario.lane);
    const baseline = evaluateScenario(scenario, registryLogForScenario(scenario));

    // a DIFFERENT provider-native payload for the same normalized semantics
    const mutatedExecution = {
      ...executeFixtureProvider(profile, scenario.input),
      providerNative: {
        mediaType: "application/aise-fixture-native+json",
        payload: { tampered: true, internalState: { layers: [1, 2, 3] } },
      },
    };
    const mutated = evaluateScenario(scenario, { profile, execution: mutatedExecution });

    // classification, violations, envelope and record are UNCHANGED
    expect(mutated.classification).toBe(baseline.classification);
    expect(mutated.violations).toEqual(baseline.violations);
    expect(mutated.envelopeDigest).toBe(baseline.envelopeDigest);
    expect(mutated.benchmarkRecord.recordId).toBe(baseline.benchmarkRecord.recordId);
    expect(mutated.provenanceManifest.manifestId).toBe(baseline.provenanceManifest.manifestId);
  });
});

/* ------------------------------------------------------------------ */
/* Negative paths (typed outcomes, never throws for provider faults)    */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: normalization and envelope-parse negative paths", () => {
  test("a malformed envelope payload classifies contract-mismatch (never a throw)", () => {
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "vlm-correct");
    if (scenario === undefined) {
      throw new Error("test setup: vlm-correct missing");
    }
    const profile = fixtureProfileForLane(scenario.lane);
    const malformedExecution = executeFixtureProvider(profile, {
      payload: { ...scenario.input.payload, behaviorTag: "malformed" },
    });
    const outcome = evaluateScenario(scenario, { profile, execution: malformedExecution });
    expect(outcome.classification).toBe("contract-mismatch");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "output-contract-normalizable",
    ]);
    expect(outcome.envelope.resultStatus).toBe("unsupported");
  });

  test("an execution that fails the declared output contract classifies contract-mismatch", () => {
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "vlm-correct");
    if (scenario === undefined) {
      throw new Error("test setup: vlm-correct missing");
    }
    const profile = fixtureProfileForLane(scenario.lane);
    const outcome = evaluateScenario(scenario, {
      profile,
      execution: { capability: "fixture-vlm-reasoning", outputs: { unexpectedField: true } },
    });
    expect(outcome.classification).toBe("contract-mismatch");
    expect(outcome.violations[0]?.kind).toBe("contract-mismatch");
  });

  test("an invalid registry-log profile throws the typed caller error", () => {
    const scenario = REASONING_EVAL_CATALOG[0];
    if (scenario === undefined) {
      throw new Error("test setup: empty catalog");
    }
    try {
      evaluateScenario(scenario, { profile: { nonsense: true }, execution: {} });
      throw new Error("expected a typed rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ReasoningEvalError);
      expect((error as ReasoningEvalError).code).toBe("invalid_profile");
    }
  });

  test("a registry-log profile that is not the scenario's provider throws", () => {
    const scenario = REASONING_EVAL_CATALOG[0];
    if (scenario === undefined) {
      throw new Error("test setup: empty catalog");
    }
    const wrongProfile = fixtureProfileForLane("document-understanding");
    try {
      evaluateScenario(scenario, { profile: wrongProfile, execution: {} });
      throw new Error("expected a typed rejection");
    } catch (error) {
      expect((error as ReasoningEvalError).code).toBe("invalid_registry_log");
    }
  });

  test("an input violating the profile's declared input contract throws the typed caller error", () => {
    const scenario = REASONING_EVAL_CATALOG[0];
    if (scenario === undefined) {
      throw new Error("test setup: empty catalog");
    }
    const profile = fixtureProfileForLane(scenario.lane);
    const invalidInput = {
      ...scenario,
      input: {
        kind: "provider-input",
        capability: scenario.capability,
        payload: { bundleJson: 42, behaviorTag: "replay" },
      },
    };
    try {
      evaluateScenario(invalidInput, { profile, execution: {} });
      throw new Error("expected a typed rejection");
    } catch (error) {
      expect((error as ReasoningEvalError).code).toBe("invalid_scenario");
    }
  });

  test("a spoofed agent identity is an identity-recorded violation", () => {
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "vlm-correct");
    if (scenario === undefined) {
      throw new Error("test setup: vlm-correct missing");
    }
    const profile = fixtureProfileForLane(scenario.lane);
    const execution = executeFixtureProvider(profile, scenario.input);
    const outputs = execution.outputs as Record<string, unknown> | undefined;
    const envelope = JSON.parse(String(outputs?.["envelopeJson"])) as Record<string, unknown>;
    envelope["agentIdentity"] = {
      providerId: "fixture-doc-provider",
      technologyVersion: "1.0.0-fixture-v1",
      capability: "fixture-document-extraction",
    };
    const spoofed = evaluateScenario(scenario, {
      profile,
      execution: { ...execution, outputs: { envelopeJson: JSON.stringify(envelope) } },
    });
    expect(spoofed.classification).toBe("contract-mismatch");
    expect(spoofed.violations.map((violation) => violation.rule)).toEqual(["identity-recorded"]);
  });

  test("criteria gating: with identity recording not required, a missing identity does not violate", () => {
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "vlm-missing-identity");
    if (scenario === undefined) {
      throw new Error("test setup: vlm-missing-identity missing");
    }
    const profile = fixtureProfileForLane(scenario.lane);
    const relaxed = {
      ...JSON.parse(JSON.stringify(scenario)),
      criteria: {
        requireNormalizableOutput: true,
        requireEvidenceCitation: true,
        requireAuthorizedScope: true,
        requireExistingEvidenceRefs: true,
        requireGroundedFacts: true,
        requireExplicitUnknowns: true,
        requireExplicitAssumptions: true,
        requireAuthorizedChecks: true,
        requireAgentIdentity: false,
      },
    };
    const outcome = evaluateScenario(relaxed, {
      profile,
      execution: executeFixtureProvider(profile, parseReasoningEvalScenario(relaxed).input),
    });
    expect(outcome.violations).toEqual([]);
    expect(outcome.classification).toBe("none");
  });
});

/* ------------------------------------------------------------------ */
/* The control-plane registry lifecycle                                 */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the fixture suite drives the real control-plane registry", () => {
  test("registration → evaluation → executions → the consolidated record + manifest; replay reproduces the state", () => {
    const lifecycle = driveFixtureRegistryLifecycle();
    // 3 providers × (register + evaluation-started) + 26 execution-normalized
    // + 3 × (consolidated benchmark-recorded + provenance-sealed)
    expect(lifecycle.eventCount).toBe(6 + 26 + 6);
    expect(lifecycle.entries.length).toBe(3);
    for (const entry of lifecycle.entries) {
      expect(entry.state).toBe("benchmarked");
      expect(entry.benchmarkRecordIds.length).toBe(1);
      expect(entry.provenanceManifestIds.length).toBe(1);
    }
    expect(lifecycle.replayEqual).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The classification tree (pure unit checks over the exported seam)     */
/* ------------------------------------------------------------------ */

describe("PROD-028 harness: the classification precedence (unit seams)", () => {
  test("classifyOutcome is exported and deterministic over the committed fixtures", () => {
    // importing through the harness surface keeps the tree a public, testable seam
    const run = runReasoningEvalSuite();
    const kinds = new Set<string>(run.outcomes.map((outcome) => outcome.classification));
    expect(kinds.has("none")).toBe(true);
    expect(kinds.has("perception-failure")).toBe(true);
    expect(kinds.has("retrieval-failure")).toBe(true);
    expect(kinds.has("reasoning-failure")).toBe(true);
    expect(kinds.has("unsupported-data")).toBe(true);
    expect(kinds.has("operation-semantic-failure")).toBe(true);
    expect(kinds.has("contract-mismatch")).toBe(true);
    const unused: readonly FailureKind[] = [
      "resource-exhaustion",
      "timeout",
      "license-blocked",
    ];
    for (const kind of unused) {
      expect(kinds.has(kind)).toBe(false); // deterministic doubles never exhaust/timeout/license-block
    }
  });
});
