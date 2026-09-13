/**
 * Wire-object registry invariants (AISE-003).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as contracts from "./index";
import { CONTRACT_VERSION, CONTRACT_FAMILIES } from "./contracts.version";
import { WIRE_OBJECTS, WIRE_OBJECT_NAMES } from "./registry";

const EXPECTED_OBJECTS = [
  "CapabilityDescriptor",
  "CaptureMission",
  "CaptureSessionEnvelope",
  "CaptureStep",
  "Derivation",
  "DeviceCapabilityProfile",
  "Evidence",
  "EvidenceBundle",
  "EvidenceGap",
  "Measurement",
  "Observation",
  "PropertyAssertion",
  "ProvenanceLink",
  "RealityObject",
  "ReferenceControl",
  "SyncAck",
  "SyncBatch",
];

/** Loads the first `*.valid*.json` fixture for a wire object. */
function loadValidFixture(name: string): Record<string, unknown> {
  for (const family of CONTRACT_FAMILIES) {
    const dir = join(import.meta.dir, "..", "fixtures", family);
    let files: string[];
    try {
      files = readdirSync(dir).sort();
    } catch {
      continue;
    }
    const file = files.find((candidate) => candidate.startsWith(`${name}.valid`));
    if (file !== undefined) {
      return JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
    }
  }
  throw new Error(`no valid fixture for ${name}`);
}

describe("registry invariants", () => {
  test("defines exactly the expected wire objects, name-sorted and unique", () => {
    expect(WIRE_OBJECT_NAMES).toEqual(EXPECTED_OBJECTS);
    expect(WIRE_OBJECT_NAMES.length).toBe(new Set(WIRE_OBJECT_NAMES).size);
  });

  test("every family is represented", () => {
    const families = new Set(WIRE_OBJECTS.map((entry) => entry.family));
    expect([...families].sort()).toEqual([...CONTRACT_FAMILIES].sort());
  });

  test("every registry entry carries the contract version", () => {
    for (const entry of WIRE_OBJECTS) {
      expect(entry.contractVersion).toBe(CONTRACT_VERSION);
    }
  });

  test("every wire schema is an open object with a semver contractVersion field", () => {
    for (const entry of WIRE_OBJECTS) {
      expect(entry.schema).toBeInstanceOf(z.ZodObject);
      const shape = (entry.schema as z.ZodObject<z.ZodRawShape>).shape;
      expect(shape["contractVersion"]).toBeDefined();
      // open wire object: an unknown probe key must never be the reason a
      // parse fails (the probe payload is deliberately incomplete otherwise)
      const probe = entry.schema.safeParse({
        contractVersion: CONTRACT_VERSION,
        __registryOpennessProbe: "must-not-fail",
      });
      if (!probe.success) {
        const unknownKeyIssue = probe.error.issues.some(
          (issue) => issue.code === "unrecognized_keys",
        );
        expect(unknownKeyIssue).toBe(false);
      }
    }
  });

  test("public API exports decode/decodeStrict/encode per wire object", () => {
    const api = contracts as unknown as Record<string, unknown>;
    for (const name of WIRE_OBJECT_NAMES) {
      expect(typeof api[`decode${name}`]).toBe("function");
      expect(typeof api[`decode${name}Strict`]).toBe("function");
      expect(typeof api[`encode${name}`]).toBe("function");
    }
  });

  test("strict decode rejects unknown top-level keys while default decode preserves them", () => {
    for (const entry of WIRE_OBJECTS) {
      const payload = loadValidFixture(entry.name);
      payload["__futureField"] = "unknown at this contract version";
      expect(() => entry.codec.decodeStrict(payload)).toThrow();
      const decoded = entry.codec.decode(payload) as Record<string, unknown>;
      expect(decoded["__futureField"]).toBe("unknown at this contract version");
    }
  });
});
