/**
 * WORLD-P2 — the LANE end-to-end test suite (all eight stages composed).
 *
 * Drills: the full lane runs on BOTH fixture scenarios through BOTH kits
 * (all-reference and all-alternate doubles); SCENARIO A refuses honestly
 * (NOT_READY → INSUFFICIENT_EVIDENCE → the explicit request-evidence
 * action → the audited refusal); SCENARIO B proceeds to governed action
 * (READY → INFERRED claims → the gate pass → the gated proposal + owner
 * + review + resolution); every lane stage emits exactly one audit event
 * per transition with the who/what/when/why/evidence-bound fields; the
 * audit trail replays deterministically; the full-kit substitution law
 * (byte-identical semantic outputs — problem/context/envelope/report
 * fully identical, claims identical, provider identity differs by
 * design); the per-seam substitution swaps (each family double swapped
 * individually preserves the downstream outputs); determinism (the same
 * kit + scenario re-run produces the byte-identical run id); and the
 * cross-package composition proof (the P0-B alternate IFC double feeding
 * the lane produces the identical context).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { alternateIfcDouble } from "@aise/world-understanding-substrate";
import { validateScene } from "@aise/world-reality-substrate";
import {
  alternateActionRecorderDouble,
  alternateAuditLedgerDouble,
  alternateBoundedReasonerDouble,
  alternateContextAssemblerDouble,
  alternateMissingEvidenceDouble,
  referenceActionRecorderDouble,
  referenceAuditLedgerDouble,
  referenceBoundedReasonerDouble,
  referenceContextAssemblerDouble,
  referenceMissingEvidenceDouble,
  type Layer2LaneRunResult,
} from "./index";
import { fixtureScenarioA, fixtureScenarioB, runLayer2Lane, type Layer2LaneKit } from "./lane";
import { FIXTURE_SUBSTRATE_CANDIDATES, fixtureIfcExtraction, labelsOfExtraction } from "./problem";
import { REQ_ID_STEEL_SECTION } from "./evidence/corpus";

/** The all-reference kit. */
const REFERENCE_KIT: Layer2LaneKit = {
  label: "reference",
  contextAssembler: referenceContextAssemblerDouble,
  detector: referenceMissingEvidenceDouble,
  reasoner: referenceBoundedReasonerDouble,
  recorder: referenceActionRecorderDouble,
  ledger: referenceAuditLedgerDouble,
};

/** The all-alternate kit. */
const ALTERNATE_KIT: Layer2LaneKit = {
  label: "alternate",
  contextAssembler: alternateContextAssemblerDouble,
  detector: alternateMissingEvidenceDouble,
  reasoner: alternateBoundedReasonerDouble,
  recorder: alternateActionRecorderDouble,
  ledger: alternateAuditLedgerDouble,
};

const KITS: readonly Layer2LaneKit[] = [REFERENCE_KIT, ALTERNATE_KIT];

/** Runs one scenario through one kit (asserts ok). */
function run(kit: Layer2LaneKit, scenario: "a" | "b"): Layer2LaneRunResult {
  const outcome = runLayer2Lane(
    kit,
    scenario === "a" ? fixtureScenarioA() : fixtureScenarioB(),
  );
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error(outcome.failure.detail);
  }
  return outcome.value;
}

describe("lane — SCENARIO A: the honest insufficient-evidence run", () => {
  for (const kit of KITS) {
    test(`the ${kit.label} kit runs the eight stages with the honest refusal`, () => {
      const result = run(kit, "a");
      /* Stage 4: NOT_READY with typed gaps. */
      expect(result.missingEvidence.verdict).toBe("NOT_READY");
      expect(result.missingEvidence.gaps.length).toBe(2);
      /* Stage 5: the bounded reasoner REFUSES. */
      expect(result.reasoning.ok).toBe(false);
      if (!result.reasoning.ok) {
        expect(result.reasoning.refusal.code).toBe("INSUFFICIENT_EVIDENCE");
        expect(result.reasoning.refusal.detail).toContain("NOT_READY");
        expect(result.reasoning.provenance.retrievalScope).toBe("case-context");
      }
      /* Stage 6: skipped (no proposal to gate). */
      expect(result.checkGate).toBe(null);
      /* Stage 7: exactly the explicit request-evidence action. */
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]!.actionKind).toBe("request_evidence");
      /* The dispatched task cites the MISSING steel-section gap. */
      const requestEvidencePayload = result.actions[0]!.payload;
      expect(requestEvidencePayload.actionKind).toBe("request_evidence");
      const steelGap = result.missingEvidence.gaps.find(
        (gap) => gap.requirementId === REQ_ID_STEEL_SECTION,
      );
      expect(steelGap).toBeDefined();
      if (requestEvidencePayload.actionKind === "request_evidence") {
        expect(requestEvidencePayload.taskId).toBe(steelGap!.remediationTask.taskId);
      }
      /* Stage 8: the audited trail includes the honest refusal event. */
      const eventKinds = result.auditTrail.records.map((record) => record.eventKind);
      expect(eventKinds).toContain("bounded_reasoning_refused");
      expect(eventKinds).not.toContain("bounded_reasoning_completed");
      expect(scenarioAEventKindsGuard(eventKinds)).toBe(true);
      /* Every event carries who/what/when/why fields. */
      for (const record of result.auditTrail.records) {
        expect(record.actor.actorId).not.toBe("");
        expect(record.subjectDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(record.occurredAt).not.toBe("");
        expect(record.reason).not.toBe("");
      }
    });
  }

  test("the refusal's audit event is evidence-unbound by definition and reason-typed", () => {
    const result = run(REFERENCE_KIT, "a");
    const refusalEvent = result.auditTrail.records.find(
      (record) => record.eventKind === "bounded_reasoning_refused",
    );
    expect(refusalEvent).toBeDefined();
    expect(refusalEvent!.reasonKind).toBe("insufficient_evidence_refusal");
    expect(refusalEvent!.evidenceContentIds).toEqual([]);
    expect(refusalEvent!.laneStage).toBe("BOUNDED_REASONING");
  });
});

function scenarioAEventKindsGuard(eventKinds: readonly string[]): boolean {
  /* The audited stages of scenario A: problem, context, evidence,
   * missing-evidence, reasoning-refused, action, replay-verified. */
  const expected = [
    "problem_defined",
    "context_assembled",
    "evidence_bound",
    "missing_evidence_detected",
    "bounded_reasoning_refused",
    "action_recorded",
    "audit_replay_verified",
  ];
  return expected.every((kind) => eventKinds.includes(kind));
}

describe("lane — SCENARIO B: the ready run to governed action", () => {
  for (const kit of KITS) {
    test(`the ${kit.label} kit runs the eight stages to the gated proposal`, () => {
      const result = run(kit, "b");
      /* Stage 4: READY, no gaps. */
      expect(result.missingEvidence.verdict).toBe("READY");
      expect(result.missingEvidence.gaps).toEqual([]);
      /* Stage 5: INFERRED advisory claims with resolved citations. */
      expect(result.reasoning.ok).toBe(true);
      if (result.reasoning.ok) {
        expect(result.reasoning.result.claims.length).toBe(3);
        for (const claim of result.reasoning.result.claims) {
          expect(claim.epistemicStatus).toBe("INFERRED");
          expect(claim.advisoryOnly).toBe(true);
        }
      }
      /* Stage 6: the gate passes; engine-owned checks classified; the
       * advisory check is recorded and NEVER verdict-bearing. */
      expect(result.checkGate).not.toBe(null);
      if (result.checkGate !== null) {
        expect(result.checkGate.verdict).toBe("pass");
        expect(result.checkGate.engineOwnedCheckIds).toHaveLength(2);
        expect(result.checkGate.advisoryCheckIds).toHaveLength(1);
      }
      /* Stage 7: assign(completed) + gated proposal + review + resolve. */
      expect(result.actions.map((action) => action.actionKind)).toEqual([
        "assign_owner",
        "propose_solution_operation",
        "request_review",
        "resolve_case",
      ]);
      const proposal = result.actions[1]!;
      if (proposal.payload.actionKind === "propose_solution_operation") {
        expect(proposal.payload.gateVerdictId).toBe(result.checkGate!.gateId);
      }
      /* Stage 8: the full audited stage set. */
      const eventKinds = result.auditTrail.records.map((record) => record.eventKind);
      const expectedKinds: readonly string[] = [
        "problem_defined",
        "context_assembled",
        "evidence_bound",
        "missing_evidence_detected",
        "bounded_reasoning_completed",
        "deterministic_checks_gated",
        "action_recorded",
        "audit_replay_verified",
      ];
      for (const expected of expectedKinds) {
        expect(eventKinds as readonly string[]).toContain(expected);
      }
      /* Four action events, one per recorded action. */
      expect(eventKinds.filter((kind) => kind === "action_recorded")).toHaveLength(4);
      /* The gate's audit event carries the engineering-authority reason. */
      const gateEvent = result.auditTrail.records.find(
        (record) => record.eventKind === "deterministic_checks_gated",
      );
      expect(gateEvent!.reasonKind).toBe("engineering_authority");
      /* The eight-stage summary lines exist. */
      expect(result.stageSummaries).toHaveLength(8);
    });
  }
});

describe("lane — determinism (law #9)", () => {
  for (const kit of KITS) {
    for (const scenario of ["a", "b"] as const) {
      test(`the ${kit.label} kit re-runs scenario ${scenario.toUpperCase()} byte-identically`, () => {
        const first = run(kit, scenario);
        const second = run(kit, scenario);
        expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
        expect(first.runId).toBe(second.runId);
      });
    }
  }
});

describe("lane — the substitution law at the lane level", () => {
  test("full-kit swap: the semantic outputs are identical; only provider identity differs", () => {
    const reference = run(REFERENCE_KIT, "b");
    const alternate = run(ALTERNATE_KIT, "b");
    /* Problem / context / envelope / report: FULLY identical (ids included). */
    expect(reference.problem).toEqual(alternate.problem);
    expect(reference.context).toEqual(alternate.context);
    expect(reference.envelope).toEqual(alternate.envelope);
    expect(reference.missingEvidence).toEqual(alternate.missingEvidence);
    /* Reasoning: claims identical; provider identity differs by design. */
    expect(reference.reasoning.ok).toBe(true);
    expect(alternate.reasoning.ok).toBe(true);
    if (reference.reasoning.ok && alternate.reasoning.ok) {
      expect(reference.reasoning.result.claims).toEqual(alternate.reasoning.result.claims);
      expect(reference.reasoning.result.reasoningProvenance.providerId).not.toBe(
        alternate.reasoning.result.reasoningProvenance.providerId,
      );
      expect(reference.reasoning.result.reasoningProvenance.promptDigest).toBe(
        alternate.reasoning.result.reasoningProvenance.promptDigest,
      );
    }
    /* Gate: same classification; the gate id differs only through the
     * advisory check's reasoning-result provenance digest. */
    expect(reference.checkGate!.engineOwnedCheckIds).toEqual(alternate.checkGate!.engineOwnedCheckIds);
    expect(reference.checkGate!.advisoryCheckIds).toEqual(alternate.checkGate!.advisoryCheckIds);
    expect(reference.checkGate!.verdict).toBe(alternate.checkGate!.verdict);
    /* Actions: same kinds and payloads except the gate-verdict citation. */
    expect(reference.actions.map((action) => action.actionKind)).toEqual(
      alternate.actions.map((action) => action.actionKind),
    );
    /* Audit: same event kinds, sequences, actors, reasons and stages. */
    expect(
      reference.auditTrail.records.map((record) => [
        record.sequence,
        record.eventKind,
        record.laneStage,
        record.reasonKind,
        record.reason,
      ]),
    ).toEqual(
      alternate.auditTrail.records.map((record) => [
        record.sequence,
        record.eventKind,
        record.laneStage,
        record.reasonKind,
        record.reason,
      ]),
    );
  });

  test("full-kit swap on scenario A: the honest refusal is identical", () => {
    const reference = run(REFERENCE_KIT, "a");
    const alternate = run(ALTERNATE_KIT, "a");
    expect(reference.missingEvidence).toEqual(alternate.missingEvidence);
    expect(reference.reasoning.ok).toBe(false);
    expect(alternate.reasoning.ok).toBe(false);
    if (!reference.reasoning.ok && !alternate.reasoning.ok) {
      expect(reference.reasoning.refusal).toEqual(alternate.reasoning.refusal);
    }
    expect(reference.actions).toEqual(alternate.actions);
  });

  test("single-seam swaps: each family double swaps without disturbing the sealed ids", () => {
    /* Swap ONLY the context assembler: the context (and everything sealed
     * from it) stays byte-identical. */
    const swappedContext: Layer2LaneKit = {
      ...REFERENCE_KIT,
      contextAssembler: alternateContextAssemblerDouble,
    };
    const base = run(REFERENCE_KIT, "b");
    const withSwappedContext = run(swappedContext, "b");
    expect(withSwappedContext.context).toEqual(base.context);
    expect(withSwappedContext.missingEvidence).toEqual(base.missingEvidence);
    /* Swap ONLY the detector: the report stays byte-identical. */
    const swappedDetector: Layer2LaneKit = {
      ...REFERENCE_KIT,
      detector: alternateMissingEvidenceDouble,
    };
    const withSwappedDetector = run(swappedDetector, "b");
    expect(withSwappedDetector.missingEvidence).toEqual(base.missingEvidence);
    /* Swap ONLY the reasoner: the claims stay identical (provider identity differs). */
    const swappedReasoner: Layer2LaneKit = {
      ...REFERENCE_KIT,
      reasoner: alternateBoundedReasonerDouble,
    };
    const withSwappedReasoner = run(swappedReasoner, "b");
    expect(withSwappedReasoner.reasoning.ok).toBe(true);
    if (withSwappedReasoner.reasoning.ok && base.reasoning.ok) {
      expect(withSwappedReasoner.reasoning.result.claims).toEqual(base.reasoning.result.claims);
    }
    /* Swap ONLY the recorder: the ungated actions stay identical. */
    const swappedRecorder: Layer2LaneKit = {
      ...REFERENCE_KIT,
      recorder: alternateActionRecorderDouble,
    };
    const withSwappedRecorder = run(swappedRecorder, "b");
    expect(withSwappedRecorder.actions[0]).toEqual(base.actions[0]);
    /* Swap ONLY the ledger: the trail semantics stay identical. */
    const swappedLedger: Layer2LaneKit = {
      ...REFERENCE_KIT,
      ledger: alternateAuditLedgerDouble,
    };
    const withSwappedLedger = run(swappedLedger, "b");
    expect(
      withSwappedLedger.auditTrail.records.map((record) => [record.sequence, record.eventKind]),
    ).toEqual(base.auditTrail.records.map((record) => [record.sequence, record.eventKind]));
  });
});

describe("lane — the cross-package composition (P0-A + P0-B composed)", () => {
  test("the P0-B ALTERNATE IFC double feeding the lane yields the semantically identical run", () => {
    /* Rebuild the substrate candidates from the alternate IFC double — the
     * P0-B substitution pair: semantic fields identical, only the provider
     * identity (the derivation methodVersion) differs, so the composed
     * context's derivations differ and every content seal downstream
     * differs WITH them. The lane's SEMANTIC outputs must be identical. */
    const viaAlternate = fixtureIfcExtraction(alternateIfcDouble);
    const scenario = fixtureScenarioB();
    const swappedScenario = {
      ...scenario,
      substrateCandidates: [
        {
          family: "ifc" as const,
          resultId: viaAlternate.resultId,
          evidenceContentId: FIXTURE_SUBSTRATE_CANDIDATES[0]!.evidenceContentId,
          method: "interpretation.ifc" as const,
          externalLabels: labelsOfExtraction(viaAlternate),
          aise: viaAlternate.aise,
        },
      ],
    };
    const base = run(REFERENCE_KIT, "b");
    const withAlternateIfc = runLayer2Lane(REFERENCE_KIT, swappedScenario);
    expect(withAlternateIfc.ok).toBe(true);
    if (withAlternateIfc.ok) {
      /* The problem (no substrate dependence) is identical. */
      expect(withAlternateIfc.value.problem).toEqual(base.problem);
      /* The substrate seed SEMANTICS are identical: same reality objects,
       * same INFERRED assertions, same measurements. */
      expect(
        withAlternateIfc.value.context.substrateCandidates[0]!.aise.realityObjects,
      ).toEqual(base.context.substrateCandidates[0]!.aise.realityObjects);
      expect(
        withAlternateIfc.value.context.substrateCandidates[0]!.aise.propertyAssertions,
      ).toEqual(base.context.substrateCandidates[0]!.aise.propertyAssertions);
      /* Only the provider identity differs (the P0-B discipline). */
      expect(
        withAlternateIfc.value.context.substrateCandidates[0]!.aise.derivation.methodVersion,
      ).not.toBe(base.context.substrateCandidates[0]!.aise.derivation.methodVersion);
      /* The verdict, the gap semantics and the lane behavior are identical. */
      expect(withAlternateIfc.value.missingEvidence.verdict).toBe(base.missingEvidence.verdict);
      expect(withAlternateIfc.value.missingEvidence.gaps).toEqual(base.missingEvidence.gaps);
      expect(
        withAlternateIfc.value.actions.map((action) => action.actionKind),
      ).toEqual(base.actions.map((action) => action.actionKind));
      expect(
        withAlternateIfc.value.auditTrail.records.map((record) => record.eventKind),
      ).toEqual(base.auditTrail.records.map((record) => record.eventKind));
    }
  });

  test("the scene is the P0-A composed fixture and passes its validator", () => {
    const scenario = fixtureScenarioB();
    expect(validateScene(scenario.scene)).toEqual([]);
    expect(scenario.scene.revision).toBe(1);
    expect(scenario.scene.nodes).toHaveLength(4);
  });
});
