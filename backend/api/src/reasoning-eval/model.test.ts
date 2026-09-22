/**
 * PROD-028 — the reasoning-eval MODEL tests: the frozen vocabularies, the
 * fail-closed boundary parsers (typed errors, never silent coercion) and
 * the canonical-JSON discipline.
 */

import { describe, expect, test } from "bun:test";
import {
  BUNDLE_SCOPES,
  ENVELOPE_INTEGRITY_RULES,
  ENVELOPE_RESULT_STATUSES,
  EVIDENCE_ITEM_KINDS,
  FIXTURE_BEHAVIORS,
  FULL_EVALUATION_CRITERIA,
  REASONING_EVAL_ERROR_CODES,
  REASONING_EVAL_LANES,
  ReasoningEvalError,
  canonicalDigestOf,
  canonicalJsonText,
  isEnvelopeIntegrityRule,
  isEnvelopeResultStatus,
  isReasoningEvalLane,
  parseDeclaredEvidenceEnvelope,
  parseEvidenceQuestionBundle,
  parseReasoningEvalScenario,
} from "./model";
import { REASONING_EVAL_CATALOG, reasoningEvalCatalog } from "./testkit";

/* ------------------------------------------------------------------ */

describe("PROD-028 model: the frozen vocabularies", () => {
  test("the three Layer-2 lanes are frozen and guarded", () => {
    expect([...REASONING_EVAL_LANES]).toEqual([
      "multimodal-reasoning",
      "document-understanding",
      "retrieval",
    ]);
    expect(isReasoningEvalLane("retrieval")).toBe(true);
    expect(isReasoningEvalLane("operations")).toBe(false);
  });

  test("the envelope result-status vocabulary is frozen and guarded", () => {
    expect([...ENVELOPE_RESULT_STATUSES]).toEqual(["supported", "unsupported", "conflicted"]);
    expect(isEnvelopeResultStatus("supported")).toBe(true);
    expect(isEnvelopeResultStatus("refuted")).toBe(false);
  });

  test("the integrity-rule vocabulary is frozen, guarded and closed (no invented rules)", () => {
    expect(ENVELOPE_INTEGRITY_RULES.length).toBe(10);
    for (const rule of ENVELOPE_INTEGRITY_RULES) {
      expect(isEnvelopeIntegrityRule(rule)).toBe(true);
    }
    expect(isEnvelopeIntegrityRule("made-up-rule")).toBe(false);
  });

  test("the fixture behavior vocabulary is closed (the harness ignores the control channel)", () => {
    expect([...FIXTURE_BEHAVIORS]).toEqual(["replay", "refuse", "empty", "malformed"]);
  });

  test("the typed error codes are frozen", () => {
    expect([...REASONING_EVAL_ERROR_CODES]).toEqual([
      "invalid_request",
      "invalid_scenario",
      "invalid_bundle",
      "invalid_registry_log",
      "invalid_profile",
      "invalid_input",
      "unknown_scenario",
    ]);
  });

  test("the bundle vocabularies are frozen", () => {
    expect([...BUNDLE_SCOPES]).toEqual(["in-scope", "out-of-scope"]);
    expect([...EVIDENCE_ITEM_KINDS]).toEqual(["image", "document-section", "retrieval-hit"]);
    expect(Object.keys(FULL_EVALUATION_CRITERIA).length).toBe(9);
    expect(Object.values(FULL_EVALUATION_CRITERIA).every((flag) => flag === true)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("PROD-028 model: parseReasoningEvalScenario (fail closed)", () => {
  test("every committed catalog scenario round-trips through the parser", () => {
    for (const scenario of REASONING_EVAL_CATALOG) {
      const parsed = parseReasoningEvalScenario(JSON.parse(JSON.stringify(scenario)));
      expect(parsed.scenarioId).toBe(scenario.scenarioId);
      expect(parsed.lane).toBe(scenario.lane);
      expect(parsed.providerRef).toEqual(scenario.providerRef);
      expect(parsed.capability).toBe(scenario.capability);
      expect(parsed.input.payload["bundleJson"]).toBe(scenario.input.payload["bundleJson"]);
      expect(parsed.expected.expectedFailureKind).toBe(scenario.expected.expectedFailureKind);
      expect(parsed.expected.expectedViolationRules).toEqual(
        scenario.expected.expectedViolationRules,
      );
      expect(parsed.criteria).toEqual(FULL_EVALUATION_CRITERIA);
    }
  });

  test("a non-object scenario is rejected", () => {
    expect(() => parseReasoningEvalScenario("nope")).toThrow(ReasoningEvalError);
    expect(() => parseReasoningEvalScenario(42)).toThrow(ReasoningEvalError);
  });

  test("a missing scenarioId is rejected with the typed code", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    delete scenario["scenarioId"];
    try {
      parseReasoningEvalScenario(scenario);
      throw new Error("expected a typed rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ReasoningEvalError);
      expect((error as ReasoningEvalError).code).toBe("invalid_scenario");
    }
  });

  test("an invented lane is rejected", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    scenario["lane"] = "operations";
    expect(() => parseReasoningEvalScenario(scenario)).toThrow(/lane must be one of/);
  });

  test("an invented failure kind in the expected outcome is rejected (closed vocabulary)", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    scenario["expected"]["expectedFailureKind"] = "made-up-failure";
    try {
      parseReasoningEvalScenario(scenario);
      throw new Error("expected a typed rejection");
    } catch (error) {
      expect((error as ReasoningEvalError).code).toBe("invalid_scenario");
      expect((error as ReasoningEvalError).detail).toContain(
        "expected outcomes cannot invent failure vocabulary",
      );
    }
  });

  test("an unknown behavior tag is rejected", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    scenario["input"]["payload"]["behaviorTag"] = "correct";
    expect(() => parseReasoningEvalScenario(scenario)).toThrow(/behaviorTag must be one of/);
  });

  test("a mistyped criteria flag is rejected", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    scenario["criteria"] = { ...FULL_EVALUATION_CRITERIA, requireAgentIdentity: "yes" };
    expect(() => parseReasoningEvalScenario(scenario)).toThrow(/requireAgentIdentity must be a boolean/);
  });

  test("a missing input seal is rejected", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    scenario["input"]["kind"] = "not-a-provider-input";
    expect(() => parseReasoningEvalScenario(scenario)).toThrow(/typed seal 'provider-input'/);
  });

  test("a missing oracle is rejected (the correctness oracle is required)", () => {
    const scenario = JSON.parse(JSON.stringify(REASONING_EVAL_CATALOG[0]));
    delete scenario["expected"]["correctResultStatus"];
    expect(() => parseReasoningEvalScenario(scenario)).toThrow(/correctResultStatus/);
  });
});

/* ------------------------------------------------------------------ */

describe("PROD-028 model: parseEvidenceQuestionBundle (fail closed)", () => {
  const bundleOf = (scenarioId: string): unknown =>
    JSON.parse(
      String(
        reasoningEvalCatalog().find((scenario) => scenario.scenarioId === scenarioId)?.input
          .payload["bundleJson"] ?? "{}",
      ),
    );

  test("a committed bundle round-trips (question side only — no answer key rides the bundle)", () => {
    const bundle = parseEvidenceQuestionBundle(bundleOf("vlm-correct"));
    expect(bundle.scenarioId).toBe("vlm-correct");
    expect(bundle.lane).toBe("multimodal-reasoning");
    expect(bundle.evidence.length).toBe(2);
    expect(bundle.requiredEvidenceIds).toEqual(["E1"]);
    expect(bundle.scope).toBe("in-scope");
    expect("groundTruth" in bundle).toBe(false);
  });

  test("an out-of-scope question naming required evidence is rejected (scope consistency)", () => {
    const bundle = bundleOf("vlm-refusal") as Record<string, unknown>;
    bundle["requiredEvidenceIds"] = ["E1"];
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/requiredEvidenceIds must be empty/);
  });

  test("duplicate evidence ids are rejected (stable evidence identity)", () => {
    const bundle = bundleOf("vlm-correct") as Record<string, unknown>;
    const evidence = bundle["evidence"] as unknown[];
    (evidence[1] as Record<string, unknown>)["evidenceId"] = "E1";
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/duplicate evidence id 'E1'/);
  });

  test("required evidence referencing an unknown id is rejected", () => {
    const bundle = bundleOf("vlm-correct") as Record<string, unknown>;
    bundle["requiredEvidenceIds"] = ["E9"];
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/'E9' which is not in the evidence set/);
  });

  test("an empty evidence set is rejected", () => {
    const bundle = bundleOf("vlm-correct") as Record<string, unknown>;
    bundle["evidence"] = [];
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/evidence must be a non-empty array/);
  });

  test("a non-positive measurement sigma is rejected", () => {
    const bundle = bundleOf("retrieval-correct") as Record<string, unknown>;
    const evidence = bundle["evidence"] as Record<string, unknown>[];
    (evidence[0] as Record<string, unknown>)["measurement"] = { sigma: 0, unit: "mm" };
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/positive finite sigma/);
  });

  test("an operation contract targeting unknown evidence is rejected", () => {
    const bundle = bundleOf("doc-operation-correct") as Record<string, unknown>;
    (bundle["operation"] as Record<string, unknown>)["targetEvidenceId"] = "S9";
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/'S9' which is not in the evidence set/);
  });

  test("an invalid evidence kind is rejected", () => {
    const bundle = bundleOf("vlm-correct") as Record<string, unknown>;
    const evidence = bundle["evidence"] as Record<string, unknown>[];
    (evidence[0] as Record<string, unknown>)["kind"] = "video";
    expect(() => parseEvidenceQuestionBundle(bundle)).toThrow(/kind must be one of/);
  });
});

/* ------------------------------------------------------------------ */

describe("PROD-028 model: parseDeclaredEvidenceEnvelope (fail closed)", () => {
  test("a declared envelope round-trips", () => {
    const envelope = parseDeclaredEvidenceEnvelope({
      evidenceIds: ["E1"],
      facts: ["a fact"],
      assumptions: [],
      unknowns: [],
      deterministicChecks: ["check"],
      resultClaim: "a claim",
      resultStatus: "supported",
      invalidationConditions: [],
      agentIdentity: {
        providerId: "fixture-vlm-provider",
        technologyVersion: "1.0.0-fixture-v1",
        capability: "fixture-vlm-reasoning",
      },
      proposedOperation: null,
    });
    expect(envelope.resultStatus).toBe("supported");
    expect(envelope.agentIdentity?.providerId).toBe("fixture-vlm-provider");
    expect(envelope.proposedOperation).toBeNull();
  });

  test("an invalid result status is rejected", () => {
    expect(() =>
      parseDeclaredEvidenceEnvelope({ evidenceIds: [], resultStatus: "refuted" }),
    ).toThrow(/resultStatus must be one of/);
  });

  test("a mistyped agent identity is rejected", () => {
    expect(() =>
      parseDeclaredEvidenceEnvelope({
        evidenceIds: [],
        resultStatus: "supported",
        agentIdentity: { providerId: "" },
      }),
    ).toThrow(/agentIdentity requires providerId/);
  });

  test("a mistyped proposed operation is rejected", () => {
    expect(() =>
      parseDeclaredEvidenceEnvelope({
        evidenceIds: [],
        resultStatus: "supported",
        proposedOperation: { operationKind: "edit" },
      }),
    ).toThrow(/proposedOperation requires/);
  });
});

/* ------------------------------------------------------------------ */

describe("PROD-028 model: the canonical JSON discipline", () => {
  test("canonicalJsonText sorts keys recursively and is byte-stable", () => {
    const value = { z: 1, a: { y: [3, 2, { b: true, a: false }], m: "x" } };
    const text = canonicalJsonText(value);
    expect(text).toBe(
      `${JSON.stringify({ a: { m: "x", y: [3, 2, { a: false, b: true }] }, z: 1 }, null, 2)}\n`,
    );
    expect(canonicalJsonText(JSON.parse(text))).toBe(text);
  });

  test("canonicalDigestOf is deterministic and key-order independent", () => {
    const a = { alpha: 1, beta: [2, 3] };
    const b = { beta: [2, 3], alpha: 1 };
    expect(canonicalDigestOf(a)).toBe(canonicalDigestOf(b));
    expect(canonicalDigestOf(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
