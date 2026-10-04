/**
 * WORLD-P2 — the REASONING family test suite (stages 5–6: BOUNDED
 * REASONING + DETERMINISTIC CHECKS).
 *
 * Drills: the bounded-reasoning port laws — retrieval scoped to the
 * pinned case context (scope mismatch refused), the INSUFFICIENT_EVIDENCE
 * refusal when the readiness verdict is not READY (the flagship
 * fail-closed drill), the INFERRED-only + advisory-only claim laws (a
 * provider claiming OBSERVED or authority is CONTRACT_VIOLATION-refused
 * with the claim rejected), the citation-resolution law (claims citing
 * outside the scope are refused), the prompt/context provenance recorded
 * on every output AND refusal, the two LLM substrate doubles' byte-
 * identical claims; the deterministic-check gate's closed inventory, the
 * fabricated-authority refusals (out-of-inventory id, LLM-sourced engine
 * check, mislabeled advisory, unresolvable advisory provenance, empty
 * check set), the worst-of engine roll-up, and the advisory-never-bears-
 * verdict law.
 */

import { describe, expect, test } from "bun:test";
import {
  ENGINE_OWNED_CHECK_IDS,
  alternateBoundedReasonerDouble,
  gateDeterministicChecks,
  promptDigestOf,
  reasonThroughBoundedPort,
  referenceBoundedReasonerDouble,
  resolveClaimCitations,
  validateReasoningStepResult,
  worstOfCheckOutcomes,
  type AttachedCheck,
  type BoundedReasoningProvider,
  type BoundedReasoningRequest,
  type DeterministicCheckGateVerdict,
  type ReasoningStepResult,
} from "./index";
import {
  FABRICATED_AUTHORITY_CHECK,
  FIXTURE_ENGINE_SNAPSHOT_DIGEST,
  FIXTURE_PROMPT_TEMPLATE_ID,
  FIXTURE_PROMPT_TEMPLATE_VERSION,
  LLM_SOURCED_ENGINE_CHECK,
  MISLABELED_ADVISORY_CHECK,
  UNRESOLVED_ADVISORY_CHECK,
  fixtureAttachedChecks,
  fixtureReasoningRequest,
  scopeMismatchRequest,
} from "./corpus";
import { fixtureScenarioA, fixtureScenarioB } from "../lane";
import {
  alternateContextAssemblerDouble,
  referenceContextAssemblerDouble,
  type CaseContext,
} from "../problem";
import {
  alternateMissingEvidenceDouble,
  bindProblemEvidence,
  detectThroughEvidencePort,
  referenceMissingEvidenceDouble,
  type MissingEvidenceReport,
  type ProblemEvidenceEnvelope,
} from "../evidence";
import { FIXTURE_PROBLEM } from "../problem/corpus";

/** Both LLM substrate doubles (every reasoning test runs over BOTH). */
const DOUBLES: readonly { readonly name: string; readonly provider: BoundedReasoningProvider }[] = [
  { name: "reference", provider: referenceBoundedReasonerDouble },
  { name: "alternate", provider: alternateBoundedReasonerDouble },
];

/** The assembled scenario-B scope (context + envelope + report). */
function scenarioBScope(): {
  readonly context: CaseContext;
  readonly envelope: ProblemEvidenceEnvelope;
  readonly report: MissingEvidenceReport;
} {
  const scenario = fixtureScenarioB();
  const contextOutcome = referenceContextAssemblerDouble.assemble({
    problem: FIXTURE_PROBLEM,
    scene: scenario.scene,
    realityObjects: scenario.realityObjects,
    measurements: scenario.measurements,
    propertyAssertions: scenario.propertyAssertions,
    observations: scenario.observations,
    substrateCandidates: scenario.substrateCandidates,
    assembledAt: scenario.assembledAt,
  });
  if (!contextOutcome.ok) {
    throw new Error(contextOutcome.failure.detail);
  }
  const envelopeOutcome = bindProblemEvidence(scenario.evidenceInput, contextOutcome.value);
  if (!envelopeOutcome.ok) {
    throw new Error(envelopeOutcome.failure.detail);
  }
  const reportOutcome = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
    requirements: scenario.requirements,
    envelope: envelopeOutcome.value,
    context: contextOutcome.value,
    detectedAt: scenario.detectedAt,
  });
  if (!reportOutcome.ok) {
    throw new Error(reportOutcome.failure.detail);
  }
  return {
    context: contextOutcome.value,
    envelope: envelopeOutcome.value,
    report: reportOutcome.value,
  };
}

/** The assembled scenario-A scope (verdict NOT_READY). */
function scenarioAScope() {
  const scenario = fixtureScenarioA();
  const contextOutcome = alternateContextAssemblerDouble.assemble({
    problem: FIXTURE_PROBLEM,
    scene: scenario.scene,
    realityObjects: scenario.realityObjects,
    measurements: scenario.measurements,
    propertyAssertions: scenario.propertyAssertions,
    observations: scenario.observations,
    substrateCandidates: scenario.substrateCandidates,
    assembledAt: scenario.assembledAt,
  });
  if (!contextOutcome.ok) {
    throw new Error(contextOutcome.failure.detail);
  }
  const envelopeOutcome = bindProblemEvidence(scenario.evidenceInput, contextOutcome.value);
  if (!envelopeOutcome.ok) {
    throw new Error(envelopeOutcome.failure.detail);
  }
  const reportOutcome = detectThroughEvidencePort(alternateMissingEvidenceDouble, {
    requirements: scenario.requirements,
    envelope: envelopeOutcome.value,
    context: contextOutcome.value,
    detectedAt: scenario.detectedAt,
  });
  if (!reportOutcome.ok) {
    throw new Error(reportOutcome.failure.detail);
  }
  return {
    context: contextOutcome.value,
    envelope: envelopeOutcome.value,
    report: reportOutcome.value,
  };
}

/** Reasons over the scenario-B scope through one double (asserts ok). */
function reasonFixture(provider: BoundedReasoningProvider): ReasoningStepResult {
  const scope = scenarioBScope();
  const request = fixtureReasoningRequest(scope.context.contextId, scope.report.reportId);
  const outcome = reasonThroughBoundedPort(
    provider,
    request,
    scope.context,
    scope.envelope,
    scope.report,
  );
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    return outcome.result;
  }
  throw new Error(`${outcome.refusal.code}: ${outcome.refusal.detail}`);
}

describe("reasoning — the bounded-retrieval + refusal laws (stage 5)", () => {
  test("a request pinning a different context is refused UNGROUNDED_QUESTION (the scope is pinned)", () => {
    const scope = scenarioBScope();
    const request = scopeMismatchRequest(scope.context.contextId, scope.report.reportId);
    const outcome = reasonThroughBoundedPort(
      referenceBoundedReasonerDouble,
      request,
      scope.context,
      scope.envelope,
      scope.report,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.code).toBe("UNGROUNDED_QUESTION");
      expect(outcome.refusal.detail).toContain("never widened");
    }
  });

  test("a NOT_READY readiness verdict forces the INSUFFICIENT_EVIDENCE refusal (the flagship drill)", () => {
    const scope = scenarioAScope();
    expect(scope.report.verdict).toBe("NOT_READY");
    const request = fixtureReasoningRequest(scope.context.contextId, scope.report.reportId);
    for (const double of DOUBLES) {
      const outcome = reasonThroughBoundedPort(
        double.provider,
        request,
        scope.context,
        scope.envelope,
        scope.report,
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.refusal.code).toBe("INSUFFICIENT_EVIDENCE");
        expect(outcome.refusal.detail).toContain("NOT_READY");
        /* The refusal names the blocking gap ids — never vague. */
        expect(outcome.refusal.detail).toMatch(/[0-9a-f]{64}/);
        /* The refusal still carries the prompt/context provenance (law #4). */
        expect(outcome.provenance.contextDigest).toBe(scope.context.contextId);
        expect(outcome.provenance.promptDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(outcome.provenance.retrievalScope).toBe("case-context");
      }
    }
  });

  test("a contract-violating request is refused CONTRACT_VIOLATION with provenance", () => {
    const scope = scenarioBScope();
    const request = {
      ...fixtureReasoningRequest(scope.context.contextId, scope.report.reportId),
      question: "not-a-question" as unknown as BoundedReasoningRequest["question"],
    };
    const outcome = reasonThroughBoundedPort(
      referenceBoundedReasonerDouble,
      request,
      scope.context,
      scope.envelope,
      scope.report,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.code).toBe("CONTRACT_VIOLATION");
      expect(outcome.provenance.providerId).toBe(referenceBoundedReasonerDouble.descriptor.providerId);
    }
  });
});

describe("reasoning — the claim laws + the substitution pair", () => {
  for (const double of DOUBLES) {
    test(`the ${double.name} LLM double answers INFERRED advisory claims with resolved citations`, () => {
      const result = reasonFixture(double.provider);
      expect(result.claims.length).toBeGreaterThanOrEqual(2);
      for (const claim of result.claims) {
        expect(claim.epistemicStatus).toBe("INFERRED");
        expect(claim.advisoryOnly).toBe(true);
        expect(claim.claimId).toMatch(/^[0-9a-f]{64}$/);
        expect(claim.citations.length).toBeGreaterThan(0);
        expect(validateReasoningStepResult(result).ok).toBe(true);
      }
      /* The provenance block records the prompt + context (law #4). */
      expect(result.reasoningProvenance.promptDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(result.reasoningProvenance.contextDigest).toBe(scenarioBScope().context.contextId);
      expect(result.reasoningProvenance.providerDescriptorDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(result.reasoningProvenance.retrievalScope).toBe("case-context");
    });
  }

  test("the two LLM doubles produce BYTE-IDENTICAL claims (the substitution pair)", () => {
    const reference = reasonFixture(referenceBoundedReasonerDouble);
    const alternate = reasonFixture(alternateBoundedReasonerDouble);
    expect(reference.claims).toEqual(alternate.claims);
    /* Provider identity differs by design (the P0-B discipline); the
     * prompt/context digests agree. */
    expect(reference.reasoningProvenance.promptDigest).toBe(alternate.reasoningProvenance.promptDigest);
    expect(reference.reasoningProvenance.contextDigest).toBe(alternate.reasoningProvenance.contextDigest);
    expect(reference.resultId).not.toBe(alternate.resultId);
  });

  test("determinism: the same double + scope always seals the same result id", () => {
    for (const double of DOUBLES) {
      const first = reasonFixture(double.provider);
      const second = reasonFixture(double.provider);
      expect(first).toEqual(second);
    }
  });

  test("citations resolve against the supplied scope (the grounding contract)", () => {
    const scope = scenarioBScope();
    const result = reasonFixture(referenceBoundedReasonerDouble);
    const failures = resolveClaimCitations(
      result.claims,
      scope.context,
      scope.envelope,
      scope.report,
    );
    expect(failures).toEqual([]);
    /* A claim citing an unknown id is caught with the typed failure. */
    const badClaims = result.claims.map((claim) => ({
      ...claim,
      citations: [{ citedKind: "evidence" as const, citedId: "0".repeat(64) }],
    }));
    const badFailures = resolveClaimCitations(
      badClaims,
      scope.context,
      scope.envelope,
      scope.report,
    );
    expect(badFailures.length).toBe(badClaims.length);
    expect(badFailures.every((failure) => failure.kind === "citation-unresolvable")).toBe(true);
  });

  test("an OBSERVED-claim provider output is refused with the claim REJECTED", () => {
    /* A rogue provider that claims OBSERVED authority — the governed entry
     * post-validation must reject it as CONTRACT_VIOLATION. */
    const rogue: BoundedReasoningProvider = {
      descriptor: referenceBoundedReasonerDouble.descriptor,
      reason: (request, context, envelope, report) => {
        const honest = referenceBoundedReasonerDouble.reason(request, context, envelope, report);
        if (!honest.ok) {
          return honest;
        }
        return {
          ok: true,
          result: {
            ...honest.result,
            claims: honest.result.claims.map((claim) => ({
              ...claim,
              epistemicStatus: "OBSERVED" as unknown as "INFERRED",
            })),
          },
        };
      },
    };
    const scope = scenarioBScope();
    const request = fixtureReasoningRequest(scope.context.contextId, scope.report.reportId);
    const outcome = reasonThroughBoundedPort(
      rogue,
      request,
      scope.context,
      scope.envelope,
      scope.report,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.code).toBe("CONTRACT_VIOLATION");
      expect(outcome.refusal.detail).toContain("INFERRED");
    }
  });

  test("an authority-claiming provider output is refused (advisoryOnly must be literal true)", () => {
    const rogue: BoundedReasoningProvider = {
      descriptor: referenceBoundedReasonerDouble.descriptor,
      reason: (request, context, envelope, report) => {
        const honest = referenceBoundedReasonerDouble.reason(request, context, envelope, report);
        if (!honest.ok) {
          return honest;
        }
        return {
          ok: true,
          result: {
            ...honest.result,
            claims: honest.result.claims.map((claim) => ({
              ...claim,
              advisoryOnly: false as unknown as true,
            })),
          },
        };
      },
    };
    const scope = scenarioBScope();
    const request = fixtureReasoningRequest(scope.context.contextId, scope.report.reportId);
    const outcome = reasonThroughBoundedPort(
      rogue,
      request,
      scope.context,
      scope.envelope,
      scope.report,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.code).toBe("CONTRACT_VIOLATION");
      expect(outcome.refusal.detail).toContain("advisory");
    }
  });

  test("the prompt digest is deterministic over the declared template + question + context", () => {
    const scope = scenarioBScope();
    const request = fixtureReasoningRequest(scope.context.contextId, scope.report.reportId);
    const digest = promptDigestOf(request, scope.context.contextId);
    expect(promptDigestOf(request, scope.context.contextId)).toBe(digest);
    const other = promptDigestOf(
      { ...request, questionText: "a different question" },
      scope.context.contextId,
    );
    expect(other).not.toBe(digest);
    expect(request.promptTemplateId).toBe(FIXTURE_PROMPT_TEMPLATE_ID);
    expect(request.promptTemplateVersion).toBe(FIXTURE_PROMPT_TEMPLATE_VERSION);
  });
});

describe("reasoning — the deterministic-check gate (stage 6)", () => {
  /** Gates the fixture checks against the fixture reasoning result. */
  function gateFixture(overrides: readonly AttachedCheck[]): DeterministicCheckGateVerdict {
    const reasoning = reasonFixture(referenceBoundedReasonerDouble);
    const checks = overrides.length > 0 ? overrides : fixtureAttachedChecks(reasoning.resultId);
    const outcome = gateDeterministicChecks(
      {
        problemId: reasoning.requestId,
        attachedChecks: checks,
        reasoningResults: [reasoning],
      },
      "2026-10-02T08:00:00.000Z",
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(outcome.failure.detail);
    }
    return outcome.value;
  }

  test("the fixture checks classify: engine-owned pass + advisory recorded, never verdict-bearing", () => {
    const verdict = gateFixture([]);
    expect(verdict.verdict).toBe("pass");
    expect(verdict.engineOwnedOutcome).toBe("pass");
    expect(verdict.engineOwnedCheckIds).toEqual([
      "solution.geometry.dimensions-positive",
      "solution.units.quantity-units-typed",
    ]);
    expect(verdict.advisoryCheckIds).toEqual(["advisory.substrate-property-consistency"]);
    expect(verdict.failures).toEqual([]);
  });

  test("the closed inventory mirrors the PROD-022 engine checks + AISE-023 finding codes", () => {
    const inventory = ENGINE_OWNED_CHECK_IDS.map((id) => id);
    expect(inventory).toContain("solution.geometry.dimensions-positive");
    expect(inventory).toContain("solution.operation.phase1-limits");
    expect(inventory).toContain("verification.missing-unit");
    expect(inventory).toContain("verification.critical-dimension-unknown");
    expect(inventory).toHaveLength(20);
  });

  test("a fabricated-authority check id is refused", () => {
    const verdict = gateFixture([FABRICATED_AUTHORITY_CHECK]);
    expect(verdict.verdict).toBe("refused");
    expect(verdict.failures.some((failure) => failure.kind === "fabricated-authority")).toBe(true);
    expect(verdict.engineOwnedOutcome).toBe(null);
  });

  test("an inventory check claiming engine ownership from an LLM source is refused", () => {
    const verdict = gateFixture([LLM_SOURCED_ENGINE_CHECK]);
    expect(verdict.verdict).toBe("refused");
    expect(
      verdict.failures.some(
        (failure) => failure.kind === "fabricated-authority" && failure.detail.includes("LLM lane never owns"),
      ),
    ).toBe(true);
  });

  test("an engine-produced check mislabeled advisory is refused (symmetric honesty)", () => {
    const verdict = gateFixture([MISLABELED_ADVISORY_CHECK]);
    expect(verdict.verdict).toBe("refused");
    expect(verdict.failures.some((failure) => failure.kind === "authority-mislabel")).toBe(true);
  });

  test("an advisory check citing an unsupplied reasoning result is refused", () => {
    const verdict = gateFixture([UNRESOLVED_ADVISORY_CHECK]);
    expect(verdict.verdict).toBe("refused");
    expect(
      verdict.failures.some((failure) => failure.kind === "unresolvable-check-provenance"),
    ).toBe(true);
  });

  test("an empty check set is refused — never vacuously valid", () => {
    const verdict = gateFixture([]);
    expect(verdict.verdict).toBe("pass");
    const empty = gateDeterministicChecks(
      {
        problemId: "0".repeat(64),
        attachedChecks: [],
        reasoningResults: [],
      },
      "2026-10-02T08:00:00.000Z",
    );
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.value.verdict).toBe("refused");
      expect(empty.value.failures.some((failure) => failure.kind === "empty-check-set")).toBe(true);
    }
  });

  test("an engine-owned FAIL rolls the verdict to fail (worst-of; advisory stays recorded)", () => {
    const reasoning = reasonFixture(referenceBoundedReasonerDouble);
    const checks = fixtureAttachedChecks(reasoning.resultId).map((check) =>
      check.checkId === "solution.geometry.dimensions-positive"
        ? { ...check, outcome: "fail" as const }
        : check,
    );
    const outcome = gateDeterministicChecks(
      { problemId: reasoning.requestId, attachedChecks: checks, reasoningResults: [reasoning] },
      "2026-10-02T08:00:00.000Z",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.verdict).toBe("fail");
      expect(outcome.value.engineOwnedOutcome).toBe("fail");
      /* The advisory review-needed check NEVER rolls the verdict by itself. */
    }
  });

  test("worst-of check-outcome order: fail > review-needed > unknown > pass", () => {
    expect(worstOfCheckOutcomes(["pass", "pass"])).toBe("pass");
    expect(worstOfCheckOutcomes(["pass", "unknown"])).toBe("unknown");
    expect(worstOfCheckOutcomes(["unknown", "review-needed"])).toBe("review-needed");
    expect(worstOfCheckOutcomes(["review-needed", "fail", "pass"])).toBe("fail");
  });

  test("the declared engine snapshot digest is the committed fixture input", () => {
    expect(FIXTURE_ENGINE_SNAPSHOT_DIGEST).toMatch(/^[0-9a-f]{64}$/);
    const reasoning = reasonFixture(referenceBoundedReasonerDouble);
    const checks = fixtureAttachedChecks(reasoning.resultId);
    expect(checks[0]!.sourceProvenanceDigest).toBe(FIXTURE_ENGINE_SNAPSHOT_DIGEST);
    expect(checks[2]!.sourceProvenanceDigest).toBe(reasoning.resultId);
  });
});
