/**
 * Committed-fixture validation tests (PROD-016).
 *
 * Validates the committed fixture corpus against the COMMITTED JSON Schema
 * files with ajv (proving the schema artifacts are usable validators for
 * non-TypeScript consumers such as the Android adapter), and against the
 * TypeScript codecs:
 *
 *  - `*.valid*.json`        — schema-valid, decodable, round-trip deep-equal;
 *  - `*.invalid-*.json`     — schema-INVALID (deliberately broken payloads);
 *  - `*.version-mismatch.json` — schema-valid but carrying a cross-major
 *    contractVersion: the codec must reject it with a typed error.
 *
 * Deterministic: reads only committed files; no network, no clock.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import {
  ADAPTER_CONTRACT_FAMILIES,
  type AdapterContractFamily,
} from "./adapter-contracts.version";
import { ADAPTER_WIRE_OBJECTS, adapterWireObject } from "./registry";
import {
  AdapterContractDecodeError,
  AdapterContractVersionMismatchError,
} from "./errors";

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
  for (const entry of ADAPTER_WIRE_OBJECTS) {
    const schemaPath = join(SCHEMAS_ROOT, entry.family, `${entry.name}.schema.json`);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    validators.set(entry.name, ajv.compile(schema));
  }
  return validators;
}

const FIXTURES = loadFixtures();
const VALIDATORS = loadValidators();

describe("fixture corpus shape", () => {
  test("every adapter wire object has at least one valid fixture", () => {
    for (const entry of ADAPTER_WIRE_OBJECTS) {
      const count = FIXTURES.filter((f) => f.name === entry.name && f.kind === "valid").length;
      expect(count).toBeGreaterThan(0);
    }
  });

  test("at least two invalid fixtures per family (work-order minimum)", () => {
    for (const family of ADAPTER_CONTRACT_FAMILIES) {
      const count = FIXTURES.filter((f) => f.family === family && f.kind === "invalid").length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test("every fixture maps to a registered adapter wire object filed in the right family", () => {
    for (const fixture of FIXTURES) {
      const def = adapterWireObject(fixture.name);
      expect(def).toBeDefined();
      expect(def?.family).toBe(fixture.family as AdapterContractFamily);
    }
  });

  test("the corpus covers task, capability, evidence, authorization and result fixtures", () => {
    const kinds = new Set(FIXTURES.map((f) => f.name));
    for (const required of [
      "TaskIntent",
      "CapabilityDescriptor",
      "ClientCapabilityProfile",
      "TaskCapabilityRequirements",
      "CapabilityNegotiation",
      "EvidenceSummary",
      "AuthorizationContext",
      "OperationResult",
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
      const def = adapterWireObject(fixture.name);
      expect(def).toBeDefined();
      const first = def?.codec.decode(fixture.payload);
      const encoded = def?.codec.encode(first as object);
      const second = def?.codec.decode(JSON.parse(encoded ?? "null"));
      expect(second).toEqual(first);
    }
  });

  test("invalid fixtures fail decode with a typed AdapterContractDecodeError", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "invalid")) {
      const def = adapterWireObject(fixture.name);
      expect(() => def?.codec.decode(fixture.payload)).toThrow(AdapterContractDecodeError);
    }
  });

  test("version-mismatch fixtures fail decode with a typed AdapterContractVersionMismatchError", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "version-mismatch")) {
      const def = adapterWireObject(fixture.name);
      let caught: unknown;
      try {
        def?.codec.decode(fixture.payload);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AdapterContractVersionMismatchError);
      const mismatch = caught as AdapterContractVersionMismatchError;
      expect(mismatch.code).toBe("ADAPTER_CONTRACT_VERSION_MISMATCH");
      expect(mismatch.expected).toBe("1.0.0");
      expect(mismatch.received).not.toBe("1.0.0");
    }
  });
});
