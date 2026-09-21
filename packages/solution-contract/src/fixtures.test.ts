/**
 * Committed-fixture validation tests (PROD-021).
 *
 * Validates the committed fixture corpus against the COMMITTED JSON Schema
 * files with ajv (proving the schema artifacts are usable validators for
 * non-TypeScript consumers), against the TypeScript codecs, and against the
 * invariant checkers:
 *
 *  - `*.valid*.json`        — schema-valid, decodable, round-trip deep-equal,
 *                             invariant-clean;
 *  - `*.invalid-*.json`     — schema-INVALID (deliberately broken payloads);
 *  - `*.version-mismatch.json` — schema-valid but carrying a cross-major
 *    contractVersion: the codec must reject it with a typed error.
 *
 * Also proves the building-operation fixture coverage (all ten Phase 1
 * operation types, all six work-order categories) and the
 * direct-manipulation vs agent origin pair.
 *
 * Deterministic: reads only committed files; no network, no clock.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import {
  BUILDING_OPERATION_CATEGORIES,
  BUILDING_OPERATION_TYPES,
  SOLUTION_CONTRACT_FAMILIES,
} from "./index";
import type { SolutionContractFamily } from "./index";
import { SOLUTION_WIRE_OBJECTS, solutionWireObject } from "./registry";
import {
  SolutionContractDecodeError,
  SolutionContractVersionMismatchError,
} from "./errors";
import { checkSolutionContractObject } from "./invariants";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const FIXTURES_ROOT = join(PACKAGE_ROOT, "fixtures");
const SCHEMAS_ROOT = join(PACKAGE_ROOT, "schemas");

interface FixtureFile {
  readonly family: string;
  readonly file: string;
  readonly name: string;
  readonly kind: "valid" | "invalid" | "version-mismatch";
  readonly payload: unknown;
}

function loadFixtures(): FixtureFile[] {
  const fixtures: FixtureFile[] = [];
  for (const family of readdirSync(FIXTURES_ROOT).sort()) {
    for (const file of readdirSync(join(FIXTURES_ROOT, family)).sort()) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const kind = file.includes(".invalid-")
        ? "invalid"
        : file.includes(".version-mismatch")
          ? "version-mismatch"
          : "valid";
      fixtures.push({
        family,
        file,
        name: file.replace(/\..*$/, ""),
        kind,
        payload: JSON.parse(readFileSync(join(FIXTURES_ROOT, family, file), "utf8")),
      });
    }
  }
  return fixtures;
}

function loadValidators(): Map<string, ValidateFunction> {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validators = new Map<string, ValidateFunction>();
  for (const entry of SOLUTION_WIRE_OBJECTS) {
    const schemaPath = join(SCHEMAS_ROOT, entry.family, `${entry.name}.schema.json`);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    validators.set(entry.name, ajv.compile(schema));
  }
  return validators;
}

const FIXTURES = loadFixtures();
const VALIDATORS = loadValidators();

describe("fixture corpus shape", () => {
  test("every solution wire object has at least one valid fixture", () => {
    for (const entry of SOLUTION_WIRE_OBJECTS) {
      const count = FIXTURES.filter((f) => f.name === entry.name && f.kind === "valid").length;
      expect(count).toBeGreaterThan(0);
    }
  });

  test("at least two invalid fixtures per family (work-order minimum)", () => {
    for (const family of SOLUTION_CONTRACT_FAMILIES) {
      const count = FIXTURES.filter((f) => f.family === family && f.kind === "invalid").length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test("at least one version-mismatch fixture per family", () => {
    for (const family of SOLUTION_CONTRACT_FAMILIES) {
      const count = FIXTURES.filter(
        (f) => f.family === family && f.kind === "version-mismatch",
      ).length;
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("every fixture maps to a registered solution wire object filed in the right family", () => {
    for (const fixture of FIXTURES) {
      const def = solutionWireObject(fixture.name);
      expect(def).toBeDefined();
      expect(def?.family).toBe(fixture.family as SolutionContractFamily);
    }
  });

  test("the corpus covers the intent, negotiation, trace, state and snapshot objects", () => {
    const kinds = new Set(FIXTURES.map((f) => f.name));
    for (const required of [
      "EngineeringOperationIntent",
      "EngineeringOperation",
      "OperationTarget",
      "OperationDependency",
      "OperationEffect",
      "ProposedState",
      "SolutionValidationSnapshot",
      "OperationCapabilityProfile",
      "OperationCapabilityNegotiation",
      "SolutionBoqLineTrace",
      "SolutionBoqTraceSet",
      "Solution",
      "SolutionVersion",
      "SolutionDomainDescriptor",
    ]) {
      expect(kinds.has(required)).toBe(true);
    }
  });
});

describe("committed fixtures vs committed JSON Schemas (ajv)", () => {
  test("valid fixtures pass their committed schema", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "valid")) {
      const validate = VALIDATORS.get(fixture.name);
      expect(validate).toBeDefined();
      const ok = validate?.(fixture.payload) ?? false;
      expect(ok).toBe(true);
    }
  });

  test("invalid fixtures fail their committed schema", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "invalid")) {
      const validate = VALIDATORS.get(fixture.name);
      expect(validate).toBeDefined();
      const ok = validate?.(fixture.payload) ?? true;
      expect(ok).toBe(false);
    }
  });

  test("version-mismatch fixtures are schema-valid (the codec, not the schema, rejects them)", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "version-mismatch")) {
      const validate = VALIDATORS.get(fixture.name);
      const ok = validate?.(fixture.payload) ?? false;
      expect(ok).toBe(true);
    }
  });
});

describe("committed fixtures vs TypeScript codecs", () => {
  test("valid fixtures decode and round-trip deep-equal (decode -> encode -> parse -> decode)", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "valid")) {
      const def = solutionWireObject(fixture.name);
      expect(def).toBeDefined();
      const first = def?.codec.decode(fixture.payload);
      const encoded = def?.codec.encode(first as object);
      const second = def?.codec.decode(JSON.parse(encoded ?? "null"));
      expect(second).toEqual(first);
    }
  });

  test("invalid fixtures fail decode with a typed SolutionContractDecodeError", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "invalid")) {
      const def = solutionWireObject(fixture.name);
      expect(() => def?.codec.decode(fixture.payload)).toThrow(SolutionContractDecodeError);
    }
  });

  test("version-mismatch fixtures fail decode with a typed SolutionContractVersionMismatchError", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "version-mismatch")) {
      const def = solutionWireObject(fixture.name);
      let caught: unknown;
      try {
        def?.codec.decode(fixture.payload);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SolutionContractVersionMismatchError);
      const mismatch = caught as SolutionContractVersionMismatchError;
      expect(mismatch.code).toBe("SOLUTION_CONTRACT_VERSION_MISMATCH");
      expect(mismatch.expected).toBe("1.0.0");
      expect(mismatch.received).not.toBe("1.0.0");
    }
  });
});

describe("committed fixtures vs the invariant checkers", () => {
  test("every valid fixture passes every cross-field invariant of its object", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "valid")) {
      const decoded = solutionWireObject(fixture.name)?.codec.decode(fixture.payload);
      const findings = checkSolutionContractObject(fixture.name, decoded);
      expect(findings).toHaveLength(0);
    }
  });
});

describe("initial building operation coverage (work-order scope)", () => {
  test("the valid intent fixtures cover ALL ten Phase 1 building operation types", () => {
    const covered = new Set(
      FIXTURES.filter(
        (f) =>
          f.name === "EngineeringOperationIntent" &&
          f.kind === "valid" &&
          typeof f.payload === "object" &&
          f.payload !== null,
      ).map(
        (f) => (f.payload as Record<string, unknown>)["operationType"] as string,
      ),
    );
    for (const operationType of BUILDING_OPERATION_TYPES) {
      expect(covered.has(operationType)).toBe(true);
    }
  });

  test("the six work-order categories are covered by the advisory catalogue", () => {
    const categories = Object.keys(BUILDING_OPERATION_CATEGORIES);
    expect(categories.sort()).toEqual([
      "enclosure",
      "finishes",
      "foundation",
      "services",
      "site-preparation",
      "structure",
    ]);
    const allTypes = new Set<string>();
    for (const types of Object.values(BUILDING_OPERATION_CATEGORIES)) {
      for (const operationType of types) {
        allTypes.add(operationType);
      }
    }
    expect(allTypes.size).toBe(BUILDING_OPERATION_TYPES.length);
  });

  test("the direct-manipulation vs agent origin pair exists with the same semantics", () => {
    const direct = JSON.parse(
      readFileSync(
        join(
          FIXTURES_ROOT,
          "operation/EngineeringOperationIntent.valid-excavation-direct.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const agent = JSON.parse(
      readFileSync(
        join(
          FIXTURES_ROOT,
          "operation/EngineeringOperationIntent.valid-excavation-agent.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(direct["operationType"]).toBe(agent["operationType"]);
    expect(direct["parameters"]).toEqual(agent["parameters"]);
    expect(direct["target"]).toEqual(agent["target"]);
    expect(direct["domain"]).toEqual(agent["domain"]);
    const directProvenance = direct["provenance"] as Record<string, unknown>;
    const agentProvenance = agent["provenance"] as Record<string, unknown>;
    expect(directProvenance["origin"]).toBe("direct-manipulation");
    expect(agentProvenance["origin"]).toBe("agent");
    expect(agentProvenance["commandText"]).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
  });

  test("the three documented example commands appear verbatim as agent command texts", () => {
    const commandTexts = FIXTURES.filter(
      (f) => f.name === "EngineeringOperationIntent" && f.kind === "valid",
    )
      .map(
        (f) =>
          ((f.payload as Record<string, unknown>)["provenance"] as Record<string, unknown>)[
            "commandText"
          ],
      )
      .filter((value): value is string => typeof value === "string");
    expect(commandTexts).toContain("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    expect(commandTexts).toContain("Apply 30 mm plaster to the affected wall faces.");
    expect(commandTexts).toContain("Lay blocks to a height of 1 m along this wall.");
  });
});
