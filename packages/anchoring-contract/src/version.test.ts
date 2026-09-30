/**
 * ANCHOR-002 tests — versioning discipline: the package version IS the
 * contract version; the port id is the NEW versioned id, never the spike's
 * disposable one.
 */

import { describe, expect, test } from "bun:test";
import {
  ANCHORING_CONTRACT_FAMILIES,
  ANCHORING_CONTRACT_VERSION,
  ANCHORING_FAMILY_VERSIONS,
  ANCHORING_OBJECT_NAMES,
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
  anchoringFamilyVersion,
} from "./anchoring-contracts.version";
import { ANCHORING_GATE_STAGES } from "./vocabularies";

describe("ANCHOR-002 versioning", () => {
  test("the contract version is a strict semver 1.0.0 (the package version equals it)", () => {
    expect(ANCHORING_CONTRACT_VERSION).toBe("1.0.0");
    expect(ANCHORING_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("the port id is the NEW versioned id — never the spike's disposable id", () => {
    expect(ANCHORING_PORT_VERSION).toBe("anchor002-anchoring-contract/1");
    expect(ANCHORING_PORT_VERSION).not.toContain("anchor001");
  });

  test("the wire schema version is the literal 1", () => {
    expect(ANCHORING_WIRE_SCHEMA_VERSION).toBe(1);
  });

  test("every family ships the single program-wide contract version", () => {
    expect([...ANCHORING_CONTRACT_FAMILIES].sort()).toEqual(["request", "response"]);
    for (const family of ANCHORING_CONTRACT_FAMILIES) {
      expect(anchoringFamilyVersion(family)).toBe(ANCHORING_CONTRACT_VERSION);
      expect(ANCHORING_FAMILY_VERSIONS[family]).toBe(ANCHORING_CONTRACT_VERSION);
    }
  });

  test("the owned wire objects are the lifted pair plus the partial satellite", () => {
    expect([...ANCHORING_OBJECT_NAMES]).toEqual([
      "AnchoringRequest",
      "AnchoringResponse",
      "AnchoringRefusedStill",
    ]);
  });

  test("the declared gate order is the work order's own sequence (frozen data)", () => {
    expect([...ANCHORING_GATE_STAGES]).toEqual([
      "input-sanity",
      "content-id-re-verification",
      "evidence-method-support",
      "plan-context-support",
      "parameters",
    ]);
  });
});
