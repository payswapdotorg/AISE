/**
 * AISE-041 — adoption MODEL tests: frozen vocabularies, the boundary
 * parser discipline (every §041 attribute required; explicit UNKNOWN
 * markers; typed refusals per failure mode), the pure scoring engine
 * (explicit weights, inspectable components, UNKNOWN propagation — never
 * zero, never silently defaulted), the migration state-machine tables
 * and the stored-record parsers (coherence re-verification, digest
 * pinning).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  ADVANCE_REQUIREMENTS,
  ADVANCE_SUCCESSORS,
  ADOPTION_ERROR_CODES,
  ADOPTION_EVENT_TYPES,
  APPROVAL_GATE_SATURATION,
  APPROVAL_STRICTNESS_SEVERITY,
  CONTRACTUAL_LEVELS,
  CONTRACTUAL_SEVERITY,
  EMPTY_SOR_COVERAGE,
  FRICTION_WEIGHTS,
  IRREVERSIBILITY_LEVELS,
  IRREVERSIBILITY_SEVERITY,
  LATENCY_CLASSES,
  LATENCY_SEVERITY,
  MANUAL_REENTRY_LEVELS,
  MANUAL_REENTRY_READINESS,
  MIGRATION_STATES,
  ROLLBACK_ALLOWED_FROM,
  ROLLBACK_AVAILABILITIES,
  ROLLBACK_READINESS,
  READINESS_WEIGHTS,
  RESOURCE_KINDS,
  TRAINING_BURDEN_LEVELS,
  TRAINING_BURDEN_SEVERITY,
  UNKNOWN_MARKER,
  AdoptionError,
  assessmentInputDigest,
  canAdvance,
  computeAdoptionAssessment,
  parseAdvanceCandidateInput,
  parseCreateWorkflowInput,
  parseRecordEquivalenceInput,
  parseWorkflowStep,
  type AdoptionAssessmentState,
  type IncumbentWorkflow,
  type StepAssessment,
} from "./model";
import {
  CANONICAL_ADAPTERS,
  canonicalSteps,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Fixture helpers                                                      */
/* ------------------------------------------------------------------ */

/** A minimal workflow-shaped record over the canonical steps. */
function workflowFixture(steps = canonicalSteps()): IncumbentWorkflow {
  return {
    workflowId: "workflow-qs-tender-zurich",
    organizationId: "org-zurich-482",
    name: "QS tender workflow (incumbent)",
    steps,
    createdAt: "2026-03-05T09:00:00.000Z",
    updatedAt: "2026-03-05T09:00:00.000Z",
    history: [],
  };
}

/** The canonical engine state (registry-backed adapter view). */
function engineState(): AdoptionAssessmentState {
  return {
    assessmentId: "adoption-assessment-1",
    workflow: workflowFixture(),
    adapterView: [
      { adapterId: "adapter-bim-01", descriptor: CANONICAL_ADAPTERS[0] as NonNullable<typeof CANONICAL_ADAPTERS[0]> },
      { adapterId: "adapter-erp-99", descriptor: null },
    ],
  };
}

/** Look up one step's assessment row. */
function stepRow(computed: { readonly steps: readonly StepAssessment[] }, stepId: string): StepAssessment {
  const row = computed.steps.find((step) => step.stepId === stepId);
  if (row === undefined) {
    throw new Error(`fixture step ${stepId} missing`);
  }
  return row;
}

/** Canonical wire form of one canonical step. */
function stepWire(stepId: string): Record<string, unknown> {
  const step = canonicalSteps().find((entry) => entry.stepId === stepId);
  if (step === undefined) {
    throw new Error(`fixture step ${stepId} missing`);
  }
  return JSON.parse(JSON.stringify(step)) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Frozen vocabularies and state-machine tables                         */
/* ------------------------------------------------------------------ */

describe("adoption model: frozen vocabularies", () => {
  test("attribute-level vocabularies are frozen runtime constants", () => {
    for (const vocabulary of [
      RESOURCE_KINDS,
      MANUAL_REENTRY_LEVELS,
      IRREVERSIBILITY_LEVELS,
      TRAINING_BURDEN_LEVELS,
      LATENCY_CLASSES,
      ROLLBACK_AVAILABILITIES,
      CONTRACTUAL_LEVELS,
      MIGRATION_STATES,
      ROLLBACK_ALLOWED_FROM,
      ADOPTION_EVENT_TYPES,
      ADOPTION_ERROR_CODES,
    ]) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
    }
  });

  test("the scoring weights are frozen and each family sums to exactly 1", () => {
    expect(Object.isFrozen(READINESS_WEIGHTS)).toBe(true);
    expect(Object.isFrozen(FRICTION_WEIGHTS)).toBe(true);
    const readinessTotal = Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
    const frictionTotal = Object.values(FRICTION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(readinessTotal).toBe(1);
    expect(frictionTotal).toBe(1);
    // The documented weight values (changing one is a governed change).
    expect(READINESS_WEIGHTS).toEqual({ connectorCoverage: 0.5, manualReEntry: 0.3, rollback: 0.2 });
    expect(FRICTION_WEIGHTS).toEqual({
      approvals: 0.2,
      irreversibility: 0.3,
      trainingBurden: 0.25,
      latency: 0.15,
      contractualConstraints: 0.1,
    });
  });

  test("severity tables are frozen and map every level into [0,1]", () => {
    for (const table of [
      APPROVAL_STRICTNESS_SEVERITY,
      IRREVERSIBILITY_SEVERITY,
      TRAINING_BURDEN_SEVERITY,
      LATENCY_SEVERITY,
      CONTRACTUAL_SEVERITY,
      MANUAL_REENTRY_READINESS,
      ROLLBACK_READINESS,
    ]) {
      expect(Object.isFrozen(table)).toBe(true);
      for (const value of Object.values(table)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("adoption model: the migration state machine tables", () => {
  test("ADVANCE_SUCCESSORS allows exactly one-step advances (no skipping)", () => {
    expect(ADVANCE_SUCCESSORS).toEqual({
      proposed: "evaluating",
      evaluating: "piloted",
      piloted: "replaced",
      replaced: null,
      rolled_back: null,
    });
    expect(canAdvance("proposed", "evaluating")).toBe(true);
    expect(canAdvance("evaluating", "piloted")).toBe(true);
    expect(canAdvance("piloted", "replaced")).toBe(true);
    // Skips and wrong directions are refused.
    expect(canAdvance("proposed", "piloted")).toBe(false);
    expect(canAdvance("proposed", "replaced")).toBe(false);
    expect(canAdvance("evaluating", "replaced")).toBe(false);
    expect(canAdvance("replaced", "evaluating")).toBe(false);
    expect(canAdvance("rolled_back", "proposed")).toBe(false);
    // Same-state no-ops are refused.
    expect(canAdvance("proposed", "proposed")).toBe(false);
  });

  test("ROLLBACK_ALLOWED_FROM covers exactly the advanced states", () => {
    expect([...ROLLBACK_ALLOWED_FROM]).toEqual(["evaluating", "piloted", "replaced"]);
  });

  test("ADVANCE_REQUIREMENTS: replaced demands the full triple; evaluating/piloted demand plan + evidence", () => {
    expect(ADVANCE_REQUIREMENTS.proposed).toEqual({
      requiresEquivalenceRecord: false,
      requiresAcceptanceRecord: false,
      requiresActiveRollbackPlan: true,
      requiresEvaluationEvidence: true,
      requiresPilotEvidence: false,
    });
    expect(ADVANCE_REQUIREMENTS.evaluating).toEqual({
      requiresEquivalenceRecord: false,
      requiresAcceptanceRecord: false,
      requiresActiveRollbackPlan: true,
      requiresEvaluationEvidence: false,
      requiresPilotEvidence: true,
    });
    expect(ADVANCE_REQUIREMENTS.piloted).toEqual({
      requiresEquivalenceRecord: true,
      requiresAcceptanceRecord: true,
      requiresActiveRollbackPlan: true,
      requiresEvaluationEvidence: false,
      requiresPilotEvidence: false,
    });
  });
});

/* ------------------------------------------------------------------ */
/* Boundary parsers                                                     */
/* ------------------------------------------------------------------ */

describe("adoption model: the step boundary parser", () => {
  test("the canonical fixture round-trips with canonicalized reference order", () => {
    const step = parseWorkflowStep(stepWire("step-boq-transfer"));
    expect(step.stepId).toBe("step-boq-transfer");
    expect(step.systemsOfRecord).toEqual([
      { systemClass: "bim-ifc", systemInstanceId: "bim-prod-01", adapterId: "adapter-bim-01" },
      { systemClass: "project-management", systemInstanceId: "pm-prod-02" },
    ]);
    expect(step.userRoles).toEqual(["pm-admin", "quantity-surveyor"]);
    expect(step.manualReEntry).toBe("light");
    expect(step.approvals).toEqual({ gateCount: 2, strictness: "gated" });
    expect(step.irreversibility).toBe("partially_reversible");
    expect(step.trainingBurden).toBe("moderate");
    expect(step.latency).toBe("batched");
    expect(step.rollback).toBe("partial");
    expect(step.contractualConstraints).toBe("standard_exit");
  });

  test("every one of the ten §041 attributes is REQUIRED — absence is a typed refusal", () => {
    for (const attribute of [
      "systemsOfRecord",
      "resources",
      "userRoles",
      "manualReEntry",
      "approvals",
      "irreversibility",
      "trainingBurden",
      "latency",
      "rollback",
      "contractualConstraints",
    ]) {
      const wire = stepWire("step-takeoff");
      delete wire[attribute];
      let code: string | null = null;
      try {
        parseWorkflowStep(wire);
      } catch (error) {
        if (error instanceof AdoptionError) {
          code = error.code;
        }
      }
      expect(code).toBe("invalid_step");
    }
  });

  test("the explicit UNKNOWN marker parses for every attribute class (never a silent default)", () => {
    const wire = stepWire("step-takeoff");
    wire["systemsOfRecord"] = UNKNOWN_MARKER;
    wire["resources"] = UNKNOWN_MARKER;
    wire["userRoles"] = UNKNOWN_MARKER;
    wire["manualReEntry"] = UNKNOWN_MARKER;
    wire["approvals"] = UNKNOWN_MARKER;
    wire["irreversibility"] = UNKNOWN_MARKER;
    wire["trainingBurden"] = UNKNOWN_MARKER;
    wire["latency"] = UNKNOWN_MARKER;
    wire["rollback"] = UNKNOWN_MARKER;
    wire["contractualConstraints"] = UNKNOWN_MARKER;
    const step = parseWorkflowStep(wire);
    expect(step.systemsOfRecord).toBe(UNKNOWN_MARKER);
    expect(step.resources).toBe(UNKNOWN_MARKER);
    expect(step.userRoles).toBe(UNKNOWN_MARKER);
    expect(step.manualReEntry).toBe(UNKNOWN_MARKER);
    expect(step.approvals).toBe(UNKNOWN_MARKER);
    expect(step.irreversibility).toBe(UNKNOWN_MARKER);
    expect(step.trainingBurden).toBe(UNKNOWN_MARKER);
    expect(step.latency).toBe(UNKNOWN_MARKER);
    expect(step.rollback).toBe(UNKNOWN_MARKER);
    expect(step.contractualConstraints).toBe(UNKNOWN_MARKER);
  });

  test("a systemClass outside the integrations vocabulary is refused (no second vocabulary)", () => {
    const wire = stepWire("step-boq-transfer");
    (wire["systemsOfRecord"] as unknown[])[0] = {
      systemClass: "spreadsheets-magic",
      systemInstanceId: "x-1",
    };
    expect(() => parseWorkflowStep(wire)).toThrow("invalid_system_ref");
  });

  test("duplicate systems-of-record refs within one step are refused", () => {
    const wire = stepWire("step-boq-transfer");
    (wire["systemsOfRecord"] as unknown[]).push({
      systemClass: "bim-ifc",
      systemInstanceId: "bim-prod-01",
    });
    expect(() => parseWorkflowStep(wire)).toThrow("duplicate systemsOfRecord");
  });

  test("approvals coherence: gateCount 0 ⟺ strictness none (mismatch is refused)", () => {
    const wire = stepWire("step-takeoff");
    wire["approvals"] = { gateCount: 0, strictness: "routine" };
    expect(() => parseWorkflowStep(wire)).toThrow("approvals coherence");
    const wireNone = stepWire("step-takeoff");
    wireNone["approvals"] = { gateCount: 0, strictness: "none" };
    expect(parseWorkflowStep(wireNone).approvals).toEqual({ gateCount: 0, strictness: "none" });
  });

  test("unknown enum values are typed refusals (per attribute)", () => {
    for (const [attribute, value] of [
      ["manualReEntry", "extreme"],
      ["irreversibility", "permanent"],
      ["trainingBurden", "extreme"],
      ["latency", "instant"],
      ["rollback", "sometimes"],
      ["contractualConstraints", "mildly_constrained"],
    ] as const) {
      const wire = stepWire("step-takeoff");
      wire[attribute] = value;
      expect(() => parseWorkflowStep(wire)).toThrow("invalid_step");
    }
  });

  test("duplicate user-role labels are refused (dedup is the caller's duty to fix)", () => {
    const wire = stepWire("step-takeoff");
    wire["userRoles"] = ["quantity-surveyor", "quantity-surveyor"];
    expect(() => parseWorkflowStep(wire)).toThrow("invalid_roles");
  });

  test("the create-workflow parser refuses duplicate step ids", () => {
    const payload = {
      workflowId: "wf-dup",
      organizationId: "org-1",
      name: "Duplicate steps",
      steps: [stepWire("step-takeoff"), stepWire("step-takeoff")],
      actor: "clerk-01",
    };
    expect(() => parseCreateWorkflowInput(payload)).toThrow("duplicate stepId");
  });

  test("the advance parser refuses migration states outside the vocabulary", () => {
    expect(() => parseAdvanceCandidateInput({ to: "migrated", actor: "a" })).toThrow(
      "unknown_migration_state",
    );
    expect(parseAdvanceCandidateInput({ to: "replaced", actor: "a" }).to).toBe("replaced");
  });

  test("the equivalence parser refuses empty evidence and missing limits", () => {
    expect(() =>
      parseRecordEquivalenceInput({
        establishedHow: "parallel run",
        evidenceIds: [],
        limits: "only rectangular rooms",
        actor: "auditor",
      }),
    ).toThrow("NON-EMPTY evidenceIds");
    expect(() =>
      parseRecordEquivalenceInput({
        establishedHow: "parallel run",
        evidenceIds: ["0".repeat(64)],
        limits: "",
        actor: "auditor",
      }),
    ).toThrow("limits");
    expect(() =>
      parseRecordEquivalenceInput({
        establishedHow: "parallel run",
        evidenceIds: ["not-hex"],
        limits: "only rectangular rooms",
        actor: "auditor",
      }),
    ).toThrow("invalid_evidence_ref");
  });
});

/* ------------------------------------------------------------------ */
/* The pure scoring engine                                              */
/* ------------------------------------------------------------------ */

describe("adoption model: the pure scoring engine (known path)", () => {
  const computed = computeAdoptionAssessment(engineState());

  test("step-takeoff: exact readiness and friction component math with substituted derivations", () => {
    const row = stepRow(computed, "step-takeoff");
    // Empty systems of record → the no-connector-barrier convention.
    const coverage = row.readiness.components.connectorCoverage;
    expect(coverage?.kind).toBe("known");
    expect((coverage as { value?: number } | undefined)?.value).toBe(EMPTY_SOR_COVERAGE);
    expect((coverage as { derivation?: string } | undefined)?.derivation).toContain(
      "no external systems of record",
    );
    expect(row.readiness.components.manualReEntry?.kind === "known" && row.readiness.components.manualReEntry.value).toBe(1);
    expect(row.readiness.components.rollback?.kind === "known" && row.readiness.components.rollback.value).toBe(1);
    expect(row.readiness.composite).toBe(1);
    expect(row.readiness.compositeDerivation).toBe("0.5·1 + 0.3·1 + 0.2·1 = 1");
    // Approvals: routine (0.3) × min(1, 1/3).
    expect(row.friction.components.approvals?.kind === "known" && row.friction.components.approvals.value).toBe(0.1);
    expect(row.friction.components.approvals?.derivation).toContain(`gate factor min(1, 1/${APPROVAL_GATE_SATURATION})`);
    expect(row.friction.composite).toBe(0.3675);
    expect(row.friction.compositeDerivation).toBe("0.2·0.1 + 0.3·0 + 0.25·1 + 0.15·0.65 + 0.1·0 = 0.3675");
    expect(row.opportunity).toBe(0.6325);
  });

  test("step-boq-transfer: connector coverage counts covered/uncovered refs by id", () => {
    const row = stepRow(computed, "step-boq-transfer");
    const coverage = row.readiness.components.connectorCoverage;
    expect(coverage?.kind).toBe("known");
    expect((coverage as { value?: number } | undefined)?.value).toBe(0.5);
    expect((coverage as { derivation?: string } | undefined)?.derivation).toContain(
      "bim-prod-01→adapter-bim-01",
    );
    expect((coverage as { derivation?: string } | undefined)?.derivation).toContain(
      "pm-prod-02 (no adapterId)",
    );
    expect(row.readiness.composite).toBe(0.5);
    expect(row.friction.composite).toBe(0.443333);
    expect(row.opportunity).toBe(0.056667);
  });

  test("step-erp-approval: an unresolvable adapterId is honestly uncovered; maximal friction", () => {
    const row = stepRow(computed, "step-erp-approval");
    const coverage = row.readiness.components.connectorCoverage;
    expect(coverage?.kind).toBe("known");
    expect((coverage as { value?: number } | undefined)?.value).toBe(0);
    expect((coverage as { derivation?: string } | undefined)?.derivation).toContain(
      "adapterId not registered",
    );
    expect(row.readiness.composite).toBe(0.3);
    expect(row.friction.composite).toBe(1);
    expect(row.opportunity).toBe(-0.7);
  });

  test("workflow-level aggregates are means over steps with derivations listing every value", () => {
    const approvals = computed.friction.components.approvals;
    expect(approvals?.kind).toBe("known");
    expect((approvals as { value?: number } | undefined)?.value).toBe(0.416667);
    expect((approvals as { derivation?: string } | undefined)?.derivation).toBe(
      "mean over 4 step(s) [0.1, 0.466667, 1, 0.1] = 0.416667",
    );
    expect(computed.friction.composite).toBe(0.467083);
    expect(computed.friction.compositeDerivation).toBe(
      "0.2·0.416667 + 0.3·0.375 + 0.25·0.6625 + 0.15·0.4875 + 0.1·0.325 = 0.467083",
    );
  });

  test("resources and user roles are inventory rollups, NOT score feeds (documented non-contribution)", () => {
    expect(Object.keys(computed.readiness.components)).not.toContain("resources");
    expect(Object.keys(computed.friction.components)).not.toContain("userRoles");
    expect(computed.inventory.distinctResources).toBe(4);
    expect(computed.inventory.distinctRoles).toBe(3);
  });

  test("the inventory rollups are always consistent with the rows", () => {
    expect(computed.inventory).toEqual({
      totalSteps: 4,
      distinctSystemInstances: 3,
      distinctAdapterReferences: 2,
      distinctResources: 4,
      distinctRoles: 3,
      stepsWithUnknownAttributes: 2,
      unknownAttributeOccurrences: 4,
    });
  });

  test("the replacement-opportunity ranking is the canonical total order", () => {
    expect(computed.rankedSteps.map((ranked) => ranked.stepId)).toEqual([
      "step-takeoff",
      "step-boq-transfer",
      "step-erp-approval",
      "step-site-verification",
    ]);
    expect(computed.rankedSteps.map((ranked) => ranked.rank)).toEqual([1, 2, 3, 4]);
    expect(computed.rankedSteps[3]?.opportunity).toBe(null);
  });
});

describe("adoption model: UNKNOWN propagation (never zero, never defaulted)", () => {
  const computed = computeAdoptionAssessment(engineState());

  test("a step with UNKNOWN attributes carries UNKNOWN components and a null composite", () => {
    const row = stepRow(computed, "step-site-verification");
    expect(row.readiness.components.connectorCoverage?.kind).toBe("unknown");
    expect(row.readiness.components.manualReEntry?.kind).toBe("unknown");
    expect(row.readiness.components.rollback?.kind).toBe("unknown");
    expect(row.readiness.composite).toBe(null);
    expect(row.readiness.unknownComponents).toEqual([
      "connectorCoverage",
      "manualReEntry",
      "rollback",
    ]);
    expect(row.readiness.compositeDerivation).toContain("NOT COMPUTED");
    // The KNOWN friction side still computes honestly.
    expect(row.friction.composite).toBe(0.0575);
    expect(row.opportunity).toBe(null);
    expect(row.unknownAttributes).toEqual(["manualReEntry", "rollback", "systemsOfRecord"]);
  });

  test("an UNKNOWN component never carries a silently-defaulted value", () => {
    const row = stepRow(computed, "step-site-verification");
    const component = row.readiness.components.manualReEntry as { value?: unknown };
    expect(component.value).toBeUndefined();
  });

  test("workflow-level readiness is null while ANY step attribute is UNKNOWN (aggregate honesty)", () => {
    expect(computed.readiness.composite).toBe(null);
    expect(computed.readiness.unknownComponents).toEqual([
      "connectorCoverage",
      "manualReEntry",
      "rollback",
    ]);
    expect(computed.readiness.compositeDerivation).toContain("NOT COMPUTED");
    expect(computed.readiness.compositeDerivation).toContain("fabricate certainty");
    // The derivation of an unknown aggregate component NAMES the steps.
    expect((computed.readiness.components.connectorCoverage as { derivation: string }).derivation).toContain(
      "step-site-verification",
    );
  });

  test("a perturbation of any input class changes the input digest (perturbation sensitivity)", () => {
    const base = assessmentInputDigest({
      workflow: workflowFixture(),
      adapterView: engineState().adapterView,
    });
    // Attribute perturbation.
    const perturbedSteps = canonicalSteps().map((step) =>
      step.stepId === "step-takeoff" ? { ...step, manualReEntry: "light" as const } : step,
    );
    expect(
      assessmentInputDigest({ workflow: workflowFixture(perturbedSteps), adapterView: engineState().adapterView }),
    ).not.toBe(base);
    // Adapter-view perturbation (the registry state changed).
    expect(
      assessmentInputDigest({
        workflow: workflowFixture(),
        adapterView: [{ adapterId: "adapter-bim-01", descriptor: null }],
      }),
    ).not.toBe(base);
    // Identical inputs → identical digest.
    expect(
      assessmentInputDigest({ workflow: workflowFixture(), adapterView: engineState().adapterView }),
    ).toBe(base);
  });

  test("the engine is pure: identical inputs yield byte-identical outputs", () => {
    const first = computeAdoptionAssessment(engineState());
    const second = computeAdoptionAssessment(engineState());
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });
});
