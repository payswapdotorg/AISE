/**
 * Adapter wire-object registry tests (PROD-016).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { ADAPTER_OBJECT_NAMES } from "./adapter-contracts.version";
import {
  ADAPTER_WIRE_OBJECT_NAMES,
  ADAPTER_WIRE_OBJECTS,
  adapterWireObject,
} from "./registry";

describe("registry", () => {
  test("the registry contains exactly the fifteen adapter contract objects", () => {
    expect(ADAPTER_WIRE_OBJECT_NAMES).toEqual([...ADAPTER_OBJECT_NAMES].sort());
    expect(ADAPTER_WIRE_OBJECTS.length).toBe(15);
  });

  test("the registry is name-sorted (order is part of the deterministic contract)", () => {
    const names = [...ADAPTER_WIRE_OBJECT_NAMES];
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test("every registry entry ships the contract version of its family", () => {
    for (const entry of ADAPTER_WIRE_OBJECTS) {
      expect(entry.contractVersion).toBe("1.0.0");
      expect(entry.codec.name).toBe(entry.name);
    }
  });

  test("adapterWireObject looks entries up by exact name", () => {
    expect(adapterWireObject("ProjectContext")?.family).toBe("context");
    expect(adapterWireObject("CapabilityNegotiation")?.family).toBe("capability");
    expect(adapterWireObject("OperationResult")?.family).toBe("result");
    expect(adapterWireObject("NotAnObject")).toBeUndefined();
  });
});
