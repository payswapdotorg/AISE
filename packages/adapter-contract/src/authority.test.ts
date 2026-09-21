/**
 * No-client-authority tests (PROD-016).
 *
 * The acceptance criterion "no client-side authority is introduced" is made
 * checkable: the package's public API exposes NO mutation path for
 * authoritative state (no authorize/approve/grant/revoke/readiness-decider
 * exports), the authoritative-field map is complete, and the contract
 * vocabularies that must never be client-decidable cannot even be EXPRESSED
 * by the client-authored objects.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import * as api from "./index";
import { AUTHORITATIVE_FIELDS } from "./conformance";
import { TaskIntentSchema } from "./context";
import { TaskCapabilityRequirementsSchema, CapabilityDescriptorSchema } from "./capability";
import { CapabilityNegotiationSchema } from "./negotiation";

describe("the public API exposes no authority mutation path", () => {
  test("no exported name uses authority-mutating vocabulary", () => {
    const forbiddenPatterns: RegExp[] = [
      /authorize/i,
      /approv/i,
      /grant/i,
      /revoke/i,
      /readiness/i,
      /verify/i,
      /sufficien/i,
      /validateAuthorization/i,
      /set[A-Z]/,
    ];
    const exportedNames = Object.keys(api);
    expect(exportedNames.length).toBeGreaterThan(50);
    for (const name of exportedNames) {
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(name)).toBe(false);
      }
    }
  });

  test("the expected contract surface IS exported (decode/encode/negotiate/conformance)", () => {
    const exportedNames = new Set(Object.keys(api));
    for (const required of [
      "ADAPTER_CONTRACT_VERSION",
      "negotiateCapabilities",
      "deriveInteractionModes",
      "runConformance",
      "createLosslessBinding",
      "loadCommittedFixtures",
      "AUTHORITATIVE_FIELDS",
      "CONFORMANCE_CHECKS",
      "REFERENCE_PROFILES",
      "decodeProjectContext",
      "encodeProjectContext",
      "decodeTaskIntent",
      "encodeTaskIntent",
      "decodeCapabilityDescriptor",
      "encodeCapabilityDescriptor",
      "decodeClientCapabilityProfile",
      "encodeClientCapabilityProfile",
      "decodeTaskCapabilityRequirements",
      "encodeTaskCapabilityRequirements",
      "decodeCapabilityNegotiation",
      "encodeCapabilityNegotiation",
      "decodeEvidenceSummary",
      "encodeEvidenceSummary",
      "decodeRealitySummary",
      "encodeRealitySummary",
      "decodeBOQContext",
      "encodeBOQContext",
      "decodeEngineeringCaseSummary",
      "encodeEngineeringCaseSummary",
      "decodeInterventionScenarioSummary",
      "encodeInterventionScenarioSummary",
      "decodeOutcomeSummary",
      "encodeOutcomeSummary",
      "decodeNextBestAction",
      "encodeNextBestAction",
      "decodeAuthorizationContext",
      "encodeAuthorizationContext",
      "decodeOperationResult",
      "encodeOperationResult",
    ]) {
      expect(exportedNames.has(required)).toBe(true);
    }
  });
});

describe("authoritative fields are documented for every object", () => {
  test("every authoritative field list names real top-level schema fields", () => {
    const schemas: Readonly<Record<string, unknown>> = {
      ProjectContext: api.ProjectContextSchema,
      TaskIntent: TaskIntentSchema,
      CapabilityDescriptor: CapabilityDescriptorSchema,
      ClientCapabilityProfile: api.ClientCapabilityProfileSchema,
      TaskCapabilityRequirements: TaskCapabilityRequirementsSchema,
      CapabilityNegotiation: CapabilityNegotiationSchema,
      EvidenceSummary: api.EvidenceSummarySchema,
      RealitySummary: api.RealitySummarySchema,
      BOQContext: api.BOQContextSchema,
      EngineeringCaseSummary: api.EngineeringCaseSummarySchema,
      InterventionScenarioSummary: api.InterventionScenarioSummarySchema,
      OutcomeSummary: api.OutcomeSummarySchema,
      NextBestAction: api.NextBestActionSchema,
      AuthorizationContext: api.AuthorizationContextSchema,
      OperationResult: api.OperationResultSchema,
    };
    for (const [objectName, authoritative] of Object.entries(AUTHORITATIVE_FIELDS)) {
      const schema = schemas[objectName];
      expect(schema).toBeDefined();
      const shape = (schema as { shape?: Record<string, unknown> }).shape;
      expect(shape).toBeDefined();
      for (const field of authoritative) {
        expect(shape?.[field]).toBeDefined();
      }
    }
  });
});

describe("the contract cannot express client-side authority", () => {
  test("TaskIntent (the client-authored object) carries no readiness/authorization/verification fields", () => {
    const keys = Object.keys(TaskIntentSchema.shape).sort();
    expect(keys).toEqual([
      "contractVersion",
      "createdAt",
      "intent",
      "parameters",
      "projectRef",
      "targetRefs",
      "taskId",
      "taskType",
    ]);
    for (const forbidden of [
      "readiness",
      "authorization",
      "verified",
      "approved",
      "sufficient",
    ]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  test("TaskCapabilityRequirements cannot express assurance thresholds (only platform requirements)", () => {
    const keys = Object.keys(TaskCapabilityRequirementsSchema.shape).sort();
    expect(keys).toEqual([
      "camera",
      "contractVersion",
      "deepLinks",
      "input",
      "notifications",
      "offlineStorage",
      "requirementsId",
      "screen",
      "sensors",
      "taskType",
    ]);
    for (const forbidden of [
      "assurance",
      "readiness",
      "tolerance",
      "uncertainty",
      "threshold",
    ]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  test("CapabilityNegotiation's shape carries only negotiation semantics", () => {
    const keys = Object.keys(CapabilityNegotiationSchema.shape).sort();
    expect(keys).toEqual([
      "adapterKind",
      "contractVersion",
      "domainOutcomes",
      "outcome",
      "permittedInteractionModes",
      "profileRef",
      "requirementsRef",
    ]);
  });
});
