/**
 * Version-map consistency and semver compatibility tests (PROD-021).
 *
 * Mirrors the shared-contracts / adapter-contract version-test discipline:
 * the package version IS the solution contract version, every family ships
 * it, and the graph / interaction object catalogues are consistent with the
 * PROD-021 work order's named object inventory.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SOLUTION_CONTRACT_FAMILIES,
  SOLUTION_CONTRACT_VERSION,
  SOLUTION_FAMILY_VERSIONS,
  SOLUTION_GRAPH_OBJECT_NAMES,
  SOLUTION_INTERACTION_OBJECT_NAMES,
  SOLUTION_OBJECT_NAMES,
  solutionFamilyVersion,
} from "./solution-contracts.version";

describe("version map", () => {
  test("package version equals SOLUTION_CONTRACT_VERSION (package version IS contract version)", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe(SOLUTION_CONTRACT_VERSION);
  });

  test("SOLUTION_FAMILY_VERSIONS covers exactly the contract families", () => {
    expect([...Object.keys(SOLUTION_FAMILY_VERSIONS)].sort()).toEqual(
      [...SOLUTION_CONTRACT_FAMILIES].sort(),
    );
  });

  test("every family ships the program-wide solution contract version", () => {
    for (const family of SOLUTION_CONTRACT_FAMILIES) {
      expect(SOLUTION_FAMILY_VERSIONS[family]).toBe(SOLUTION_CONTRACT_VERSION);
      expect(solutionFamilyVersion(family)).toBe(SOLUTION_CONTRACT_VERSION);
    }
  });

  test("SOLUTION_CONTRACT_VERSION is the shipped contract version constant", () => {
    expect(SOLUTION_CONTRACT_VERSION).toBe("1.0.0");
  });
});

describe("object catalogues", () => {
  test("the ten work-order-named graph objects are all named", () => {
    expect(SOLUTION_GRAPH_OBJECT_NAMES).toEqual([
      "Solution",
      "SolutionVersion",
      "EngineeringOperation",
      "ProposedState",
      "OperationDependency",
      "OperationTarget",
      "OperationEffect",
      "SolutionValidationSnapshot",
      "SolutionBoqLineTrace",
      "SolutionBoqTraceSet",
    ]);
  });

  test("the four interaction objects are all named", () => {
    expect(SOLUTION_INTERACTION_OBJECT_NAMES).toEqual([
      "EngineeringOperationIntent",
      "OperationCapabilityProfile",
      "OperationCapabilityNegotiation",
      "SolutionDomainDescriptor",
    ]);
  });

  test("SOLUTION_OBJECT_NAMES is the union of graph + interaction objects, unique", () => {
    const total: number =
      SOLUTION_GRAPH_OBJECT_NAMES.length + SOLUTION_INTERACTION_OBJECT_NAMES.length;
    const objectNames: readonly string[] = SOLUTION_OBJECT_NAMES;
    expect(objectNames.length).toBe(total);
    expect(new Set(objectNames).size).toBe(total);
  });
});
