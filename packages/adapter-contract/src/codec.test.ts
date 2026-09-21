/**
 * Codec behavior tests (PROD-016): versioning, unknown-field policy
 * (preserve on decode / reject on strict decode — both paths explicit),
 * canonical-JSON determinism, and the no-client-authority serialization
 * discipline (encoding is serialization, never authority).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADAPTER_CONTRACT_VERSION,
  decodeNextBestAction,
  decodeNextBestActionStrict,
  decodeRealitySummary,
  decodeRealitySummaryStrict,
  encodeNextBestAction,
  encodeRealitySummary,
} from "./index";
import { adapterWireObject } from "./registry";
import {
  AdapterContractDecodeError,
  AdapterContractEncodeError,
  AdapterContractVersionMismatchError,
} from "./errors";

const FIXTURE = (path: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(import.meta.dir, "..", "fixtures", path), "utf8"),
  ) as Record<string, unknown>;

/** Recursively reverses object key order (any stable non-sorted order). */
function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseKeyOrder);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).reverse()) {
      out[key] = reverseKeyOrder(record[key]);
    }
    return out;
  }
  return value;
}

const realitySummaryFixture = FIXTURE("domain/RealitySummary.valid.json");
const nextBestActionFixture = FIXTURE("action/NextBestAction.valid-actionable.json");

describe("canonical JSON and encode determinism", () => {
  test("the same value always encodes to identical bytes regardless of key order", () => {
    const first = decodeRealitySummary(realitySummaryFixture);
    const shuffled = reverseKeyOrder(JSON.parse(JSON.stringify(realitySummaryFixture)));
    const second = decodeRealitySummary(shuffled);
    expect(encodeRealitySummary(second)).toBe(encodeRealitySummary(first));
  });

  test("encode output is canonical (sorted keys, 2-space indent, trailing newline)", () => {
    const encoded = encodeRealitySummary(decodeRealitySummary(realitySummaryFixture));
    expect(encoded.endsWith("\n")).toBe(true);
    const reparsed = JSON.parse(encoded) as Record<string, unknown>;
    expect(Object.keys(reparsed).slice().sort()).toEqual(Object.keys(reparsed));
  });

  test("encode stamps the family version when absent and rejects foreign versions", () => {
    const codec = adapterWireObject("RealitySummary")?.codec;
    expect(codec).toBeDefined();
    const decoded = decodeRealitySummary(realitySummaryFixture);
    const withoutVersion = { ...decoded } as Record<string, unknown>;
    delete withoutVersion["contractVersion"];
    const encoded = codec?.encode(withoutVersion) ?? "";
    expect((JSON.parse(encoded) as Record<string, unknown>)["contractVersion"]).toBe(
      ADAPTER_CONTRACT_VERSION,
    );

    expect(() =>
      encodeRealitySummary({ ...decoded, contractVersion: "9.9.9" }),
    ).toThrow(AdapterContractVersionMismatchError);
    expect(() =>
      encodeRealitySummary({ ...decoded, contractVersion: 7 } as unknown as typeof decoded),
    ).toThrow(AdapterContractEncodeError);
  });
});

describe("version gate", () => {
  test("a cross-major contractVersion fails fast with the typed mismatch error", () => {
    expect(() => decodeRealitySummary(FIXTURE("domain/RealitySummary.version-mismatch.json"))).toThrow(
      AdapterContractVersionMismatchError,
    );
  });

  test("the typed mismatch error carries expected/received and the stable code", () => {
    let caught: unknown;
    try {
      decodeRealitySummary(FIXTURE("domain/RealitySummary.version-mismatch.json"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AdapterContractVersionMismatchError);
    const mismatch = caught as AdapterContractVersionMismatchError;
    expect(mismatch.code).toBe("ADAPTER_CONTRACT_VERSION_MISMATCH");
    expect(mismatch.expected).toBe(ADAPTER_CONTRACT_VERSION);
    expect(mismatch.received).not.toBe(ADAPTER_CONTRACT_VERSION);
    expect(mismatch.objectName).toBe("RealitySummary");
  });

  test("a malformed contractVersion is a schema violation at the contractVersion path", () => {
    let caught: unknown;
    try {
      decodeRealitySummary({ ...realitySummaryFixture, contractVersion: "one-dot-oh" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AdapterContractDecodeError);
    const decodeError = caught as AdapterContractDecodeError;
    expect(decodeError.issues.some((issue) => issue.path.includes("contractVersion"))).toBe(
      true,
    );
  });

  test("a non-object payload is rejected with a typed error", () => {
    expect(() => decodeRealitySummary("not-an-object")).toThrow(AdapterContractDecodeError);
    expect(() => decodeRealitySummary([1, 2, 3])).toThrow(AdapterContractDecodeError);
    expect(() => decodeRealitySummary(null)).toThrow(AdapterContractDecodeError);
  });
});

describe("unknown-field policy (explicit both ways)", () => {
  test("default decode PRESERVES unknown fields at the top level and in nested objects", () => {
    const payload = JSON.parse(JSON.stringify(realitySummaryFixture)) as Record<string, unknown>;
    payload["futureField"] = "kept";
    payload["nestedFuture"] = { inner: { deep: "kept" } };
    const decoded = decodeRealitySummary(payload) as Record<string, unknown>;
    expect(decoded["futureField"]).toBe("kept");
    expect(decoded["nestedFuture"]).toEqual({ inner: { deep: "kept" } });
  });

  test("unknown fields survive a full encode -> parse -> decode round trip", () => {
    const payload = JSON.parse(JSON.stringify(realitySummaryFixture)) as Record<string, unknown>;
    payload["futureField"] = "kept";
    const first = decodeRealitySummary(payload);
    const encoded = encodeRealitySummary(first);
    const second = decodeRealitySummary(JSON.parse(encoded));
    expect((second as Record<string, unknown>)["futureField"]).toBe("kept");
  });

  test("strict decode REJECTS unknown keys at any nesting level with every path listed", () => {
    const payload = FIXTURE("action/NextBestAction.valid-blocked.json");
    payload["futureTopLevel"] = "drift";
    for (const blocker of payload["blockers"] as Record<string, unknown>[]) {
      blocker["futureNested"] = "drift";
    }
    let caught: unknown;
    try {
      decodeNextBestActionStrict(payload);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AdapterContractDecodeError);
    const decodeError = caught as AdapterContractDecodeError;
    const paths = decodeError.issues
      .filter((issue) => issue.code === "unrecognized_keys")
      .map((issue) => issue.path.join("."));
    expect(paths).toContain("futureTopLevel");
    expect(paths).toContain("blockers.0.futureNested");
  });

  test("strict decode accepts a canonical payload without unknown keys", () => {
    const decoded = decodeNextBestActionStrict(FIXTURE("action/NextBestAction.valid-actionable.json"));
    expect(decoded.actionId).toBe("action-8ba1");
  });
});

describe("round-trip fidelity", () => {
  test("decode -> encode -> parse -> decode is deep-equal for a compound object", () => {
    const first = decodeNextBestAction(nextBestActionFixture);
    const encoded = encodeNextBestAction(first);
    const second = decodeNextBestAction(JSON.parse(encoded));
    expect(second).toEqual(first);
  });

  test("strict and default decode agree on a canonical payload", () => {
    const relaxed = decodeRealitySummary(realitySummaryFixture);
    const strict = decodeRealitySummaryStrict(realitySummaryFixture);
    expect(strict).toEqual(relaxed);
  });
});
