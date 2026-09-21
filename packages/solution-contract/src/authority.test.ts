/**
 * No-authority tests (PROD-021).
 *
 * The acceptance criteria "proposed state remains separate from observed
 * reality" and "extensible beyond buildings without encoding
 * building-specific authority semantics into clients" made checkable:
 *
 *  - the public API exposes NO mutation path for authoritative state (no
 *    mutate/approve/authorize/readiness/observe-declare exports);
 *  - the PROPOSAL SEALS are schema-level: `ProposedState.epistemicStatus`
 *    and `Solution.epistemicClass` are the literal "PROPOSED" —
 *    OBSERVED/INFERRED/CONFIRMED are unrepresentable (typed-invalid
 *    fixtures prove the schema rejects them);
 *  - every field that references reality is a plain stable-id REFERENCE
 *    (the read-only pins) — the contract carries no reality CONTENT;
 *  - the client/agent-authored object (the intent) and the negotiation
 *    output cannot express validation/readiness/approval semantics;
 *  - the lifecycle vocabulary carries no approval semantics.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as api from "./index";
import {
  EngineeringOperationIntentSchema,
  OperationCapabilityNegotiationSchema,
  ProposedStateSchema,
  SolutionSchema,
} from "./index";
import { SOLUTION_LIFECYCLE_STATUSES } from "./lifecycle";
import { SOLUTION_WIRE_OBJECTS } from "./registry";
import { SolutionContractDecodeError } from "./errors";

const FIXTURE = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", path), "utf8")) as Record<
    string,
    unknown
  >;

describe("the public API exposes no authority mutation path", () => {
  test("no exported name uses authority-mutating vocabulary", () => {
    const forbiddenPatterns: RegExp[] = [
      /mutate/i,
      /authoriz/i,
      /approv/i,
      /grant/i,
      /revoke/i,
      /readiness/i,
      /verif/i,
      /sufficien/i,
      /observ/i,
      /confirm/i,
      /writeReality/i,
      /applyToReality/i,
      /set[A-Z]/,
    ];
    const exportedNames = Object.keys(api);
    expect(exportedNames.length).toBeGreaterThan(80);
    for (const name of exportedNames) {
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(name)).toBe(false);
      }
    }
  });

  test("the expected contract surface IS exported (decode/encode/negotiate/trace/identity/invariants)", () => {
    const exportedNames = new Set(Object.keys(api));
    for (const required of [
      "SOLUTION_CONTRACT_VERSION",
      "createOperationIntent",
      "negotiateOperationCapability",
      "deriveEngineeringOperationId",
      "deriveProposedStateId",
      "deriveValidationSnapshotId",
      "deriveSolutionBoqLineTraceId",
      "resolveOperationsForLine",
      "resolveLinesForOperation",
      "assertSolutionLifecycleTransition",
      "checkSolutionContractObject",
      "loadCommittedFixtures",
      "REFERENCE_BUILDING_DOMAIN",
      "REFERENCE_BUILDING_OPERATION_PROFILE",
      "BUILDING_OPERATION_TYPES",
      "decodeSolution",
      "encodeSolution",
      "decodeSolutionVersion",
      "encodeSolutionVersion",
      "decodeEngineeringOperation",
      "encodeEngineeringOperation",
      "decodeEngineeringOperationIntent",
      "encodeEngineeringOperationIntent",
      "decodeProposedState",
      "encodeProposedState",
      "decodeOperationTarget",
      "encodeOperationTarget",
      "decodeOperationDependency",
      "encodeOperationDependency",
      "decodeOperationEffect",
      "encodeOperationEffect",
      "decodeSolutionValidationSnapshot",
      "encodeSolutionValidationSnapshot",
      "decodeOperationCapabilityProfile",
      "encodeOperationCapabilityProfile",
      "decodeOperationCapabilityNegotiation",
      "encodeOperationCapabilityNegotiation",
      "decodeSolutionDomainDescriptor",
      "encodeSolutionDomainDescriptor",
      "decodeSolutionBoqLineTrace",
      "encodeSolutionBoqLineTrace",
      "decodeSolutionBoqTraceSet",
      "encodeSolutionBoqTraceSet",
    ]) {
      expect(exportedNames.has(required)).toBe(true);
    }
  });
});

describe("the proposal seals are schema-level (proposed ≠ observed)", () => {
  test("ProposedState.epistemicStatus is the literal PROPOSED", () => {
    const shape = ProposedStateSchema.shape as Record<string, z.ZodTypeAny>;
    const parsed = shape["epistemicStatus"]?.safeParse("PROPOSED");
    expect(parsed?.success).toBe(true);
    for (const forbidden of ["OBSERVED", "INFERRED", "CONFIRMED"]) {
      expect(shape["epistemicStatus"]?.safeParse(forbidden).success).toBe(false);
    }
  });

  test("Solution.epistemicClass is the literal PROPOSED", () => {
    const shape = SolutionSchema.shape as Record<string, z.ZodTypeAny>;
    expect(shape["epistemicClass"]?.safeParse("PROPOSED").success).toBe(true);
    expect(shape["epistemicClass"]?.safeParse("OBSERVED").success).toBe(false);
  });

  test("the committed invalid-epistemic fixtures FAIL decode (the seals reject reality statuses)", () => {
    expect(() =>
      api.decodeProposedState(FIXTURE("state/ProposedState.invalid-epistemic.json")),
    ).toThrow(SolutionContractDecodeError);
    expect(() =>
      api.decodeSolution(FIXTURE("solution/Solution.invalid-bad-epistemic.json")),
    ).toThrow(SolutionContractDecodeError);
  });

  test("the lifecycle vocabulary cannot express approval (an Engineering Case act)", () => {
    expect((SOLUTION_LIFECYCLE_STATUSES as readonly string[]).includes("approved")).toBe(false);
    expect(() =>
      api.decodeSolution(FIXTURE("solution/Solution.invalid-bad-status.json")),
    ).toThrow(SolutionContractDecodeError);
  });
});

describe("reality is only ever REFERENCED, never carried as content", () => {
  test("every wire-object field that names reality is a plain stable-id reference", () => {
    // Walk every registered wire schema and collect top-level fields whose
    // name mentions reality — each must be the stableIdSchema (a reference).
    for (const entry of SOLUTION_WIRE_OBJECTS) {
      const schema = entry.schema;
      if (!(schema instanceof z.ZodObject)) {
        continue;
      }
      for (const [field, fieldSchema] of Object.entries(
        schema.shape as Record<string, z.ZodTypeAny>,
      )) {
        if (/reality/i.test(field)) {
          // stableIdSchema = string().min(1).max(256) with a description
          expect(fieldSchema instanceof z.ZodString).toBe(true);
        }
      }
    }
  });

  test("the pinned baseline reality version appears as a read-only reference on Solution and ProposedState", () => {
    const solution = api.decodeSolution(FIXTURE("solution/Solution.valid.json"));
    expect(typeof solution.baselineRealityVersionId).toBe("string");
    const state = api.decodeProposedState(FIXTURE("state/ProposedState.valid-layer.json"));
    expect(state.baselineRealityVersionId).toBe(solution.baselineRealityVersionId);
    expect(state.epistemicStatus).toBe("PROPOSED");
  });
});

describe("the client/agent-authored objects cannot express authority", () => {
  test("EngineeringOperationIntent carries exactly the intent fields — no validation/readiness/approval vocabulary", () => {
    const keys = Object.keys(EngineeringOperationIntentSchema.shape).sort();
    expect(keys).toEqual([
      "contractVersion",
      "dependsOn",
      "domain",
      "intentId",
      "operationType",
      "parameters",
      "proposedTo",
      "provenance",
      "target",
    ]);
    for (const forbidden of [
      "readiness",
      "authoriz",
      "verif",
      "approved",
      "sufficien",
      "epistemic",
      "outcome",
    ]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  test("OperationCapabilityNegotiation carries exactly the negotiation fields", () => {
    const keys = Object.keys(OperationCapabilityNegotiationSchema.shape).sort();
    expect(keys).toEqual([
      "contractVersion",
      "intentRef",
      "missingParameters",
      "outcome",
      "profileRef",
      "reasons",
    ]);
    for (const forbidden of ["readiness", "authoriz", "verif", "approved", "validated"]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  test("a future-vertical intent decodes — extensibility without client authority", () => {
    const mepIntent = api.decodeEngineeringOperationIntent(
      FIXTURE("operation/EngineeringOperationIntent.valid-future-vertical-mep.json"),
    );
    expect(mepIntent.domain.vertical).toBe("mep");
    // nothing in the decoded intent carries building authority semantics
    expect(mepIntent.operationType).toBe("conduit-run");
  });
});

describe("the operation vocabulary stays open (no client-side building enum authority)", () => {
  test("operationType is a bounded open string, not a closed building enum", () => {
    const shape = EngineeringOperationIntentSchema.shape as Record<string, z.ZodTypeAny>;
    expect(shape["operationType"] instanceof z.ZodString).toBe(true);
    expect(shape["operationType"] instanceof z.ZodEnum).toBe(false);
  });

  test("the Phase 1 building catalogue is reference DATA — every advisory type is declared by the reference engine profile", () => {
    const profile = api.decodeOperationCapabilityProfile(
      FIXTURE("capability/OperationCapabilityProfile.valid.json"),
    );
    const declared = new Set(
      profile.domains[0]?.operations.map((entry) => entry.operationType) ?? [],
    );
    for (const operationType of api.BUILDING_OPERATION_TYPES) {
      expect(declared.has(operationType)).toBe(true);
    }
    expect(api.BUILDING_OPERATION_TYPES).toHaveLength(10);
  });
});
