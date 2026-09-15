/**
 * Deterministic adoption-profiler test fixtures (AISE-041) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * All ids are fixed seed strings (evidence ids derive via sha-256), all
 * timestamps are fixed constants, clocks are constant functions. No
 * wall-clock, no randomness, no network — the verify gate stays
 * deterministic.
 *
 * The canonical fixture set mirrors the §041 attribute list end to end:
 * one incumbent workflow ("qs-and-procurement", 4 steps) whose steps
 * exercise every score-relevant attribute class, explicit UNKNOWN
 * attributes (the UNKNOWN-honesty paths), connector-covered and
 * uncovered systems-of-record refs, plus a full registry-backed adapter
 * view. The candidate fixtures walk the complete governed lifecycle:
 * rollback plan → evaluating → equivalence → piloted → acceptance →
 * replaced (and the refusal matrix around it).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import type { AdapterDescriptor, SystemClass } from "../integrations/model";
import type { AdapterRegistry } from "../integrations/registry";
import { createAdapterRegistry } from "../integrations/registry";
import type { AdapterDescriptorResolver } from "./service";
import {
  AdoptionService,
  readOnlyAdapterDescriptorResolver,
} from "./service";
import { parseWorkflowStep } from "./model";
import {
  parseAdvanceCandidateInput,
  parseCreateCandidateInput,
  parseRecordAcceptanceInput,
  parseRecordEquivalenceInput,
  parseRecordRollbackPlanInput,
} from "./model";
import { FsAdoptionStore, type AdoptionStore } from "./store";
import type {
  CreateWorkflowInput,
  CreateCandidateInput,
  RecordEquivalenceInput,
  RecordAcceptanceInput,
  RecordRollbackPlanInput,
  AdvanceCandidateInput,
  WorkflowStep,
} from "./model";

export const FIXED_EARLIER = "2026-02-20T09:00:00.000Z";
export const FIXED_NOW = "2026-03-05T09:00:00.000Z";
export const FIXED_LATER = "2026-03-06T09:00:00.000Z";

/** Injected clock: constant, so record bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** A stepped injected clock (deterministic sequence for lifecycle tests). */
export function steppedClock(steps: readonly string[]): () => string {
  let index = 0;
  return () => {
    const value = steps[index % steps.length] ?? FIXED_NOW;
    index += 1;
    return value;
  };
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-adoption-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-adoption-test:${seed}`);
}

export const EV_EQUIVALENCE_A = evidenceIdOf("equivalence-a");
export const EV_EQUIVALENCE_B = evidenceIdOf("equivalence-b");
export const EV_EVALUATION_A = evidenceIdOf("evaluation-a");
export const EV_PILOT_OUTCOME_A = evidenceIdOf("pilot-outcome-a");
export const EV_PILOT_OUTCOME_B = evidenceIdOf("pilot-outcome-b");
export const EV_ACCEPTANCE_A = evidenceIdOf("acceptance-a");

/* ------------------------------------------------------------------ */
/* Fixture adapters (registry-backed, read-only)                        */
/* ------------------------------------------------------------------ */

/** The canonical registered adapter descriptors (fixed, deterministic). */
export const CANONICAL_ADAPTERS: readonly AdapterDescriptor[] = [
  {
    adapterId: "adapter-bim-01",
    systemClass: "bim-ifc",
    displayName: "Incumbent BIM connector (fixture)",
    capabilities: ["import-entities", "export-derived", "query-status"],
    version: "1.0.0",
  },
  {
    adapterId: "adapter-pm-02",
    systemClass: "project-management",
    displayName: "Incumbent PM connector (fixture)",
    capabilities: ["import-entities", "import-documents", "export-derived", "query-status"],
    version: "1.2.0",
  },
];

/** A fixture adapter registry seeded with the canonical descriptors. */
export interface FixtureAdapter {
  readonly descriptor: AdapterDescriptor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly importEntities: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly importDocuments: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly exportDerived: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly queryStatus: any;
}

/**
 * Build a REAL integrations adapter registry carrying the canonical
 * descriptors (registry instances need adapters with the descriptor
 * shape; the connector operations are never invoked by adoption — only
 * `lookup` is, through the read-only resolver).
 */
export function buildAdapterRegistry(
  descriptors: readonly AdapterDescriptor[] = CANONICAL_ADAPTERS,
): AdapterRegistry {
  const registry = createAdapterRegistry();
  for (const descriptor of descriptors) {
    registry.register({
      descriptor,
      importEntities: () => {
        throw new Error("fixture adapter operations are never invoked by adoption");
      },
      importDocuments: () => {
        throw new Error("fixture adapter operations are never invoked by adoption");
      },
      exportDerived: () => {
        throw new Error("fixture adapter operations are never invoked by adoption");
      },
      queryStatus: () => {
        throw new Error("fixture adapter operations are never invoked by adoption");
      },
    } as unknown as Parameters<AdapterRegistry["register"]>[0]);
  }
  return registry;
}

/** The canonical READ-ONLY adapter resolver over the fixture registry. */
export function canonicalAdapterResolver(
  descriptors: readonly AdapterDescriptor[] = CANONICAL_ADAPTERS,
): AdapterDescriptorResolver {
  return readOnlyAdapterDescriptorResolver(buildAdapterRegistry(descriptors));
}

/** A resolver that resolves NOTHING (all refs uncovered). */
export function emptyCanonicalAdapterResolver(): AdapterDescriptorResolver {
  return readOnlyAdapterDescriptorResolver(createAdapterRegistry());
}

/** A resolver over an explicit map (id → descriptor or null), for view pinning. */
export function mapAdapterResolver(
  entries: Readonly<Record<string, AdapterDescriptor | null>>,
): AdapterDescriptorResolver {
  return {
    resolveAdapterDescriptor: async (adapterId) => entries[adapterId] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* The canonical incumbent workflow fixture                              */
/* ------------------------------------------------------------------ */

export const ORGANIZATION_ID = "org-zurich-482";
export const WORKFLOW_ID = "workflow-qs-tender-zurich";
export const ASSESSMENT_ID = "adoption-assessment-1";

/**
 * The canonical steps (§041's attribute list fully exercised), returned in
 * CANONICAL form: every step is round-tripped through the model's own
 * boundary parser, so reference lists are sorted/deduped exactly as a
 * wire request would produce them (service-level inputs arrive
 * parser-canonicalized by contract — the fixture honors that contract).
 *
 *  - step-takeoff: heavy manual re-entry, no systems of record (empty
 *    list — the no-connector-barrier convention), routine approvals,
 *    reversible, high training, interactive latency, rollback available,
 *    no contractual constraints → the TOP replacement opportunity.
 *  - step-boq-transfer: BIM + PM systems of record, one adapter-covered
 *    (adapter-bim-01) and one uncovered (no adapterId), light re-entry,
 *    gated approvals, partially reversible, moderate training, batched
 *    latency, partial rollback, standard_exit contractual.
 *  - step-erp-approval: ERP system of record whose adapterId does NOT
 *    resolve (adapter-erp-99 — honestly uncovered), heavy re-entry,
 *    regulatory approvals, irreversible, high training, real_time
 *    latency, unavailable rollback, locked_in contractual → maximal
 *    friction.
 *  - step-site-verification: UNKNOWN manual re-entry and UNKNOWN
 *    rollback (the UNKNOWN-honesty fixture) — its readiness composite is
 *    null and it ranks in the null tail.
 */
export function canonicalSteps(): WorkflowStep[] {
  return RAW_CANONICAL_STEPS.map((step) =>
    parseWorkflowStep(JSON.parse(JSON.stringify(step)) as unknown),
  );
}

const RAW_CANONICAL_STEPS: readonly WorkflowStep[] = [
    {
      stepId: "step-takeoff",
      name: "Manual quantity takeoff",
      description: "Paper takeoff of measured quantities per room",
      systemsOfRecord: [],
      resources: [
        { resourceId: "res-qs-01", resourceKind: "person", description: "Quantity surveyor" },
        { resourceId: "res-tape-02", resourceKind: "equipment", description: "Laser tape" },
      ],
      userRoles: ["quantity-surveyor", "site-foreman"],
      manualReEntry: "heavy",
      approvals: { gateCount: 1, strictness: "routine" },
      irreversibility: "reversible",
      trainingBurden: "high",
      latency: "interactive",
      rollback: "available",
      contractualConstraints: "none",
    },
    {
      stepId: "step-boq-transfer",
      name: "BOQ transfer into procurement",
      description: "Re-key the takeoff into the PM tool and the BIM model",
      systemsOfRecord: [
        { systemClass: "bim-ifc", systemInstanceId: "bim-prod-01", adapterId: "adapter-bim-01" },
        { systemClass: "project-management", systemInstanceId: "pm-prod-02" },
      ],
      resources: [{ resourceId: "res-pm-03", resourceKind: "software", description: "PM suite" }],
      userRoles: ["quantity-surveyor", "pm-admin"],
      manualReEntry: "light",
      approvals: { gateCount: 2, strictness: "gated" },
      irreversibility: "partially_reversible",
      trainingBurden: "moderate",
      latency: "batched",
      rollback: "partial",
      contractualConstraints: "standard_exit",
    },
    {
      stepId: "step-erp-approval",
      name: "ERP procurement approval",
      description: "Vendor-side ERP approval of the procurement lines",
      systemsOfRecord: [
        { systemClass: "erp-procurement", systemInstanceId: "erp-prod-03", adapterId: "adapter-erp-99" },
      ],
      resources: [{ resourceId: "res-erp-04", resourceKind: "software" }],
      userRoles: "UNKNOWN",
      manualReEntry: "heavy",
      approvals: { gateCount: 4, strictness: "regulatory" },
      irreversibility: "irreversible",
      trainingBurden: "high",
      latency: "real_time",
      rollback: "unavailable",
      contractualConstraints: "locked_in",
    },
    {
      stepId: "step-site-verification",
      name: "Site verification walk",
      description: "Walk the site to verify transferred quantities",
      systemsOfRecord: "UNKNOWN",
      resources: [{ resourceId: "res-qs-01", resourceKind: "person" }],
      userRoles: ["site-foreman"],
      manualReEntry: "UNKNOWN",
      approvals: { gateCount: 1, strictness: "routine" },
      irreversibility: "reversible",
      trainingBurden: "low",
      latency: "relaxed",
      rollback: "UNKNOWN",
      contractualConstraints: "none",
    },
];

/** The canonical create-workflow input (all four steps, first pass). */
export function buildCreateWorkflowInput(
  workflowId: string = WORKFLOW_ID,
): CreateWorkflowInput {
  return {
    workflowId,
    organizationId: ORGANIZATION_ID,
    name: "QS tender workflow (incumbent)",
    description: "Incumbent quantity-surveying and procurement workflow",
    steps: canonicalSteps(),
    actor: "inventory-clerk-01",
  };
}

/** The canonical wire payload for POST /v1/adoption/workflows. */
export function workflowBody(workflowId: string = WORKFLOW_ID): string {
  const input = buildCreateWorkflowInput(workflowId);
  return JSON.stringify(input);
}

/** A malformed step payload (missing a required attribute entirely). */
export function stepMissingAttributeBody(workflowId: string): string {
  const input = buildCreateWorkflowInput(workflowId);
  const steps = input.steps.map((step) => {
    const clone: Record<string, unknown> = { ...step };
    delete clone["latency"];
    return clone;
  });
  return JSON.stringify({ ...input, steps });
}

/* ------------------------------------------------------------------ */
/* Canonical lifecycle inputs                                           */
/* ------------------------------------------------------------------ */

export const CANDIDATE_ID = "candidate-takeoff-replacement";

export function buildCreateCandidateInput(): CreateCandidateInput {
  return parseCreateCandidateInput({
    candidateId: CANDIDATE_ID,
    workflowId: WORKFLOW_ID,
    stepId: "step-takeoff",
    aiseReplacementBoundary:
      "AISE owns measured-quantity takeoff: capture-backed measurement with evidence-linked BOQ items; the PM tool remains the procurement system of record",
    rationale:
      "The takeoff step is the heaviest manual re-entry point and carries no external system of record — the assessment ranks it the top replacement opportunity",
    actor: "adoption-lead-01",
  });
}

/**
 * The lifecycle input builders all round-trip through the model's own
 * boundary parsers, so every fixture arrives EXACTLY as a wire request
 * would produce it (parser-canonicalized evidence ids, sorted lists) —
 * service-level inputs arrive canonicalized by contract.
 */
export function buildRollbackPlanInput(): RecordRollbackPlanInput {
  return parseRecordRollbackPlanInput({
    planId: "plan-restore-takeoff-01",
    description: "Restore the incumbent manual takeoff step as the primary quantity source",
    restorationSteps: [
      "Re-issue paper takeoff sheets to the quantity surveyors",
      "Re-baseline the tender BOQ from the incumbent sheets",
      "Notify the PM tool administrators that AISE takeoff exports are suspended",
    ],
    owner: "adoption-lead-01",
    actor: "adoption-lead-01",
  });
}

export function buildEvaluationAdvance(): AdvanceCandidateInput {
  return parseAdvanceCandidateInput({
    to: "evaluating",
    evidenceIds: [EV_EVALUATION_A],
    actor: "adoption-lead-01",
  });
}

export function buildPilotAdvance(): AdvanceCandidateInput {
  return parseAdvanceCandidateInput({
    to: "piloted",
    evidenceIds: [EV_PILOT_OUTCOME_A, EV_PILOT_OUTCOME_B],
    actor: "adoption-lead-01",
  });
}

export function buildEquivalenceInput(): RecordEquivalenceInput {
  return parseRecordEquivalenceInput({
    establishedHow:
      "Parallel run over one floor: AISE takeoff quantities vs incumbent takeoff quantities compared line-by-line with independent remeasurement of disputed lines",
    evidenceIds: [EV_EQUIVALENCE_A, EV_EQUIVALENCE_B],
    limits:
      "Equivalence established for rectangular rooms only; curved-wall takeoff remains incumbent until a follow-up equivalence run covers it",
    actor: "equivalence-auditor-01",
  });
}

export function buildAcceptanceInput(): RecordAcceptanceInput {
  return parseRecordAcceptanceInput({
    evidenceIds: [EV_ACCEPTANCE_A],
    note:
      "Operations accepted the AISE takeoff boundary for the tender after the pilot outcome review (one floor, two weeks)",
    actor: "operations-acceptor-01",
  });
}

/* ------------------------------------------------------------------ */
/* Service construction helpers                                         */
/* ------------------------------------------------------------------ */

/** A service over an injected store with the fixed clock and a resolver. */
export function makeService(
  store: AdoptionStore,
  resolver: AdapterDescriptorResolver = canonicalAdapterResolver(),
  clock: () => string = fixedClock,
): AdoptionService {
  return new AdoptionService({ store, clock, adapterDescriptorResolver: resolver });
}

/** A service over a fresh Fs store rooted at `dir`'s data/ subdirectory. */
export function makeFsService(
  dir: string,
  resolver: AdapterDescriptorResolver = canonicalAdapterResolver(),
  clock: () => string = fixedClock,
): { readonly service: AdoptionService; readonly store: FsAdoptionStore } {
  const store = new FsAdoptionStore(join(dir, "data"));
  return { service: makeService(store, resolver, clock), store };
}

/**
 * Drive the FULL governed happy-path lifecycle over a service whose
 * workflow already exists: rollback plan → evaluating → equivalence →
 * piloted → acceptance → replaced. Returns the final candidate record.
 */
export async function driveFullLifecycle(
  service: AdoptionService,
  candidateId: string = CANDIDATE_ID,
): Promise<import("./model").MigrationCandidate> {
  await service.recordRollbackPlan(candidateId, buildRollbackPlanInput());
  await service.advanceCandidate(candidateId, buildEvaluationAdvance());
  await service.recordEquivalence(candidateId, buildEquivalenceInput());
  await service.advanceCandidate(candidateId, buildPilotAdvance());
  await service.recordAcceptance(candidateId, buildAcceptanceInput());
  return service.advanceCandidate(candidateId, { to: "replaced", evidenceIds: [], actor: "adoption-lead-01" });
}

/** Deep-freeze helper (mutation attempts throw). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

/** The system-class list re-exported for tests (single vocabulary). */
export const SYSTEM_CLASS_VOCABULARY: readonly SystemClass[] = [
  "bim-ifc",
  "cad-dxf",
  "boq-document",
  "project-management",
  "erp-procurement",
  "storage-document",
];
