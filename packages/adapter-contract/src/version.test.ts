/**
 * Version-map consistency and semver compatibility tests (PROD-016).
 *
 * Mirrors the shared-contracts version-test discipline: the package version
 * IS the adapter contract version, every family ships it, and the semantic /
 * negotiation object catalogues are consistent.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADAPTER_CONTRACT_FAMILIES,
  ADAPTER_CONTRACT_VERSION,
  ADAPTER_FAMILY_VERSIONS,
  ADAPTER_OBJECT_NAMES,
  NEGOTIATION_OBJECT_NAMES,
  SEMANTIC_OBJECT_NAMES,
  adapterFamilyVersion,
} from "./adapter-contracts.version";

describe("version map", () => {
  test("package version equals ADAPTER_CONTRACT_VERSION (package version IS contract version)", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe(ADAPTER_CONTRACT_VERSION);
  });

  test("ADAPTER_FAMILY_VERSIONS covers exactly the contract families", () => {
    expect([...Object.keys(ADAPTER_FAMILY_VERSIONS)].sort()).toEqual(
      [...ADAPTER_CONTRACT_FAMILIES].sort(),
    );
  });

  test("every family ships the program-wide adapter contract version", () => {
    for (const family of ADAPTER_CONTRACT_FAMILIES) {
      expect(ADAPTER_FAMILY_VERSIONS[family]).toBe(ADAPTER_CONTRACT_VERSION);
      expect(adapterFamilyVersion(family)).toBe(ADAPTER_CONTRACT_VERSION);
    }
  });

  test("ADAPTER_CONTRACT_VERSION is the shipped contract version constant", () => {
    expect(ADAPTER_CONTRACT_VERSION).toBe("1.0.0");
  });
});

describe("object catalogues", () => {
  test("the twelve semantic objects of spec/client-adapter-contract.md are all named", () => {
    expect(SEMANTIC_OBJECT_NAMES).toEqual([
      "ProjectContext",
      "TaskIntent",
      "CapabilityDescriptor",
      "EvidenceSummary",
      "RealitySummary",
      "BOQContext",
      "EngineeringCaseSummary",
      "InterventionScenarioSummary",
      "OutcomeSummary",
      "NextBestAction",
      "AuthorizationContext",
      "OperationResult",
    ]);
  });

  test("the three capability-negotiation objects are all named", () => {
    expect(NEGOTIATION_OBJECT_NAMES).toEqual([
      "ClientCapabilityProfile",
      "TaskCapabilityRequirements",
      "CapabilityNegotiation",
    ]);
  });

  test("ADAPTER_OBJECT_NAMES is the union of semantic + negotiation objects, unique", () => {
    const total: number = SEMANTIC_OBJECT_NAMES.length + NEGOTIATION_OBJECT_NAMES.length;
    const objectNames: readonly string[] = ADAPTER_OBJECT_NAMES;
    expect(objectNames.length).toBe(total);
    expect(new Set(objectNames).size).toBe(total);
  });
});
