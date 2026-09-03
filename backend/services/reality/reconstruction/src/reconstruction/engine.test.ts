/**
 * Reconstruction engine output gate tests (AISE-008).
 *
 * The engine port has no production implementation by design (real
 * geometry engines arrive in later Work Items); what this suite
 * proves is the fail-closed gate: no engine can smuggle empty
 * clouds, non-finite geometry, out-of-range colors, missing method
 * labels, or unserializable parameters into artifact state, and
 * engine failures must carry a reason.
 */
import { describe, expect, it } from "vitest";
import { assertValidReconstructionOutput, type ReconstructionOutput } from "./engine.js";
import { ReconstructionError } from "../errors.js";

function expectError(output: ReconstructionOutput): void {
  let caught: unknown;
  try {
    assertValidReconstructionOutput(output);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ReconstructionError);
  expect((caught as ReconstructionError).code).toBe("INVALID_ENGINE_OUTPUT");
}

describe("assertValidReconstructionOutput", () => {
  it("accepts a well-formed success", () => {
    const output: ReconstructionOutput = {
      status: "succeeded",
      points: [
        { x: 0, y: 1, z: 2 },
        { x: 0.5, y: -1.5, z: 2.5, r: 12, g: 200, b: 250 },
      ],
      method: "deterministic-test-fusion/1",
      parameters: { scale: 1.0, mode: "test" },
    };
    expect(() => assertValidReconstructionOutput(output)).not.toThrow();
  });

  it("accepts a success without parameters", () => {
    const output: ReconstructionOutput = {
      status: "succeeded",
      points: [{ x: 0, y: 0, z: 1 }],
      method: "no-params/1",
    };
    expect(() => assertValidReconstructionOutput(output)).not.toThrow();
  });

  it("accepts a well-formed failure", () => {
    const output: ReconstructionOutput = { status: "failed", reason: "insufficient overlap" };
    expect(() => assertValidReconstructionOutput(output)).not.toThrow();
  });

  it("rejects an empty point cloud", () => {
    expectError({
      status: "succeeded",
      points: [],
      method: "empty/1",
    });
  });

  it("rejects a missing points array", () => {
    expectError({
      status: "succeeded",
      method: "no-points/1",
    } as unknown as ReconstructionOutput);
  });

  it("rejects a non-finite coordinate", () => {
    expectError({
      status: "succeeded",
      points: [{ x: Number.NaN, y: 0, z: 1 }],
      method: "nan/1",
    });
  });

  it("rejects an out-of-range color channel", () => {
    expectError({
      status: "succeeded",
      points: [{ x: 0, y: 0, z: 1, r: 256 }],
      method: "color/1",
    });
  });

  it("rejects a fractional color channel", () => {
    expectError({
      status: "succeeded",
      points: [{ x: 0, y: 0, z: 1, g: 12.5 }],
      method: "color/1",
    });
  });

  it("rejects an empty method label", () => {
    expectError({
      status: "succeeded",
      points: [{ x: 0, y: 0, z: 1 }],
      method: "   ",
    });
  });

  it("rejects array parameters", () => {
    expectError({
      status: "succeeded",
      points: [{ x: 0, y: 0, z: 1 }],
      method: "params/1",
      parameters: [1, 2, 3] as unknown as Record<string, unknown>,
    });
  });

  it("rejects non-canonically-serializable parameters", () => {
    expectError({
      status: "succeeded",
      points: [{ x: 0, y: 0, z: 1 }],
      method: "params/1",
      parameters: { bad: Number.NaN },
    });
  });

  it("rejects a failure without a reason", () => {
    expectError({ status: "failed", reason: "" });
  });

  it("rejects an unknown status (defensive: untyped callers)", () => {
    expectError({ status: "partially_done" } as unknown as ReconstructionOutput);
  });
});
