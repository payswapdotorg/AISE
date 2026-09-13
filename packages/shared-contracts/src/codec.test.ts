/**
 * Codec behavior tests (AISE-003): versioning, unknown-field policy
 * (preserve on decode / reject on strict decode — both paths explicit),
 * canonical-JSON determinism and domain-fidelity checks.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACQUISITION_METADATA_KEYS,
  CAPABILITY_STATUSES,
  CONTRACT_VERSION,
  EPISTEMIC_STATUSES,
  decodeMeasurement,
  decodeSyncBatch,
  decodeSyncBatchStrict,
  encodeSyncBatch,
  canonicalJsonStringify,
} from "./index";
import {
  ContractDecodeError,
  ContractEncodeError,
  ContractVersionMismatchError,
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

const syncBatchFixture = FIXTURE("sync/SyncBatch.valid.json");

describe("canonical JSON", () => {
  test("key order does not affect canonical output bytes", () => {
    expect(canonicalJsonStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJsonStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  test("arrays keep their order (order is data)", () => {
    expect(canonicalJsonStringify({ list: [3, 1, 2] })).toBe(
      `${JSON.stringify({ list: [3, 1, 2] }, null, 2)}\n`,
    );
  });
});

describe("encode determinism", () => {
  test("the same value always encodes to identical bytes", () => {
    const first = decodeSyncBatch(syncBatchFixture);
    const shuffled = reverseKeyOrder(JSON.parse(JSON.stringify(syncBatchFixture)));
    const second = decodeSyncBatch(shuffled);
    expect(encodeSyncBatch(second)).toBe(encodeSyncBatch(first));
  });

  test("encode output is canonical (sorted keys, 2-space indent, trailing newline)", () => {
    const encoded = encodeSyncBatch(decodeSyncBatch(syncBatchFixture));
    expect(encoded.endsWith("\n")).toBe(true);
    const reparsed = JSON.parse(encoded) as Record<string, unknown>;
    expect(Object.keys(reparsed).slice().sort()).toEqual(Object.keys(reparsed));
  });

  test("encode stamps the contract version when absent", () => {
    const value = decodeSyncBatch(syncBatchFixture);
    const record = value as Record<string, unknown>;
    delete record["contractVersion"];
    const reparsed = JSON.parse(encodeSyncBatch(value)) as Record<string, unknown>;
    expect(reparsed["contractVersion"]).toBe(CONTRACT_VERSION);
  });

  test("encode rejects a value carrying a foreign version (never silently rewritten)", () => {
    const value = decodeSyncBatch(syncBatchFixture);
    const record = value as Record<string, unknown>;
    record["contractVersion"] = "1.5.0"; // same major, different minor: still exact-match on encode
    let caught: unknown;
    try {
      encodeSyncBatch(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractVersionMismatchError);
    const mismatch = caught as ContractVersionMismatchError;
    expect(mismatch.received).toBe("1.5.0");
    expect(mismatch.expected).toBe(CONTRACT_VERSION);
  });

  test("encode rejects a non-string contract version with a typed encode error", () => {
    const value = decodeSyncBatch(syncBatchFixture);
    const record = value as Record<string, unknown>;
    record["contractVersion"] = 42;
    expect(() => encodeSyncBatch(value)).toThrow(ContractEncodeError);
  });
});

describe("contractVersion handling on decode (never silent)", () => {
  test("a v0 payload is rejected with a typed version-mismatch error", () => {
    const payload = { ...syncBatchFixture, contractVersion: "0.9.0" };
    let caught: unknown;
    try {
      decodeSyncBatch(payload);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractVersionMismatchError);
    const mismatch = caught as ContractVersionMismatchError;
    expect(mismatch.code).toBe("CONTRACT_VERSION_MISMATCH");
    expect(mismatch.expected).toBe("1.0.0");
    expect(mismatch.received).toBe("0.9.0");
    expect(mismatch.family).toBe("sync");
    expect(mismatch.objectName).toBe("SyncBatch");
  });

  test("a future-major payload is rejected the same way", () => {
    const payload = { ...syncBatchFixture, contractVersion: "2.0.0" };
    expect(() => decodeSyncBatch(payload)).toThrow(ContractVersionMismatchError);
  });

  test("a malformed version string is a schema violation at the contractVersion path, not a mismatch", () => {
    const payload = { ...syncBatchFixture, contractVersion: "next" };
    let caught: unknown;
    try {
      decodeSyncBatch(payload);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractDecodeError);
    const decodeError = caught as ContractDecodeError;
    expect(
      decodeError.issues.some(
        (issue) => issue.path.join(".") === "contractVersion",
      ),
    ).toBe(true);
  });

  test("a same-major newer minor is accepted (forward compatibility)", () => {
    const payload = { ...syncBatchFixture, contractVersion: "1.4.2" };
    const decoded = decodeSyncBatch(payload) as Record<string, unknown>;
    expect(decoded["contractVersion"]).toBe("1.4.2");
    expect(decoded["batchId"]).toBe("batch-2026-0007-000");
  });

  test("a missing contractVersion is a schema violation with a located issue", () => {
    const payload = { ...syncBatchFixture };
    delete payload["contractVersion"];
    let caught: unknown;
    try {
      decodeSyncBatch(payload);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractDecodeError);
    const decodeError = caught as ContractDecodeError;
    expect(
      decodeError.issues.some(
        (issue) => issue.path.join(".") === "contractVersion",
      ),
    ).toBe(true);
  });

  test("non-object payloads are rejected with a typed decode error", () => {
    for (const payload of [null, 42, "string", true, [1, 2, 3]]) {
      expect(() => decodeSyncBatch(payload)).toThrow(ContractDecodeError);
    }
  });

  test("error messages are deterministic across repeated failures", () => {
    const payload = { ...syncBatchFixture, contractVersion: "0.9.0" };
    const messages: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      try {
        decodeSyncBatch(payload);
      } catch (error) {
        messages.push(String((error as Error).message));
      }
    }
    expect(new Set(messages).size).toBe(1);
  });
});

describe("unknown-field policy (both paths explicit)", () => {
  // Documented policy: within the SAME major version, decode PRESERVES
  // unknown fields; strict decode REJECTS them at any object nesting level.
  // Open maps (z.record fields) stay open in both modes — their keys are
  // data, not schema drift.
  const enriched = JSON.parse(JSON.stringify(syncBatchFixture)) as Record<string, unknown>;

  test("decode preserves unknown fields at top level, nested objects and array elements", () => {
    const envelope = enriched["envelope"] as Record<string, unknown>;
    const capabilityProfile = envelope["capabilityProfile"] as Record<string, unknown>;
    const depth = capabilityProfile["depth"] as Record<string, unknown>;
    const assets = envelope["assets"] as Array<Record<string, unknown>>;
    const asset = assets[0] as Record<string, unknown>;
    enriched["__futureBatchField"] = "keep-me";
    envelope["__futureSessionField"] = "keep-me";
    depth["__futureDescriptorField"] = "keep-me";
    asset["__futureAssetField"] = "keep-me";

    const decoded = decodeSyncBatch(enriched);
    const decodedRecord = decoded as Record<string, unknown>;
    const decodedEnvelope = decodedRecord["envelope"] as Record<string, unknown>;
    const decodedProfile = decodedEnvelope["capabilityProfile"] as Record<string, unknown>;
    const decodedDepth = decodedProfile["depth"] as Record<string, unknown>;
    const decodedAsset = (decodedEnvelope["assets"] as Array<Record<string, unknown>>)[0];

    expect(decodedRecord["__futureBatchField"]).toBe("keep-me");
    expect(decodedEnvelope["__futureSessionField"]).toBe("keep-me");
    expect(decodedDepth["__futureDescriptorField"]).toBe("keep-me");
    expect(decodedAsset?.["__futureAssetField"]).toBe("keep-me");

    // preserved unknowns survive a full encode -> parse -> decode round trip
    const roundTripped = decodeSyncBatch(
      JSON.parse(encodeSyncBatch(decoded)),
    ) as Record<string, unknown>;
    expect(roundTripped["__futureBatchField"]).toBe("keep-me");
  });

  test("strict decode rejects unknown fields at every nesting level with located issues", () => {
    let caught: unknown;
    try {
      decodeSyncBatchStrict(enriched);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractDecodeError);
    const decodeError = caught as ContractDecodeError;
    const paths = decodeError.issues
      .filter((issue) => issue.code === "unrecognized_keys")
      .map((issue) => issue.path.join("."))
      .sort();
    expect(paths).toEqual(
      [
        "__futureBatchField",
        "envelope.__futureSessionField",
        "envelope.assets.0.__futureAssetField",
        "envelope.capabilityProfile.depth.__futureDescriptorField",
      ].sort(),
    );
  });

  test("open maps stay open in strict mode (record keys are data)", () => {
    const payload = JSON.parse(JSON.stringify(syncBatchFixture)) as Record<string, unknown>;
    const envelope = payload["envelope"] as Record<string, unknown>;
    const assets = envelope["assets"] as Array<Record<string, unknown>>;
    (assets[0] as Record<string, unknown>)["acquisitionMetadata"] = {
      "mission.id": "mission-2026-000042",
      "vendor.unknown.key": "value",
    };
    expect(() => decodeSyncBatchStrict(payload)).not.toThrow();
  });
});

describe("domain fidelity", () => {
  test("PropertyAssertion preserves the exact domain-model field names (snake_case included)", () => {
    const payload = FIXTURE("model/PropertyAssertion.valid.json");
    const expectedKeys = [
      "assertionId",
      "confidence",
      "contractVersion",
      "method",
      "property",
      "source_evidence",
      "status",
      "subjectRef",
      "uncertainty",
      "unit",
      "value",
      "verified_at",
      "verified_by",
    ];
    expect(Object.keys(payload).sort()).toEqual(expectedKeys);
  });

  test("all four epistemic statuses decode distinctly (never collapsed)", () => {
    for (const status of EPISTEMIC_STATUSES) {
      const payload = FIXTURE("model/Measurement.valid.json");
      payload["status"] = status;
      expect((decodeMeasurement(payload) as Record<string, unknown>)["status"]).toBe(status);
    }
  });

  test("capability status 'unknown' is first-class and distinct from 'unavailable'", () => {
    expect(CAPABILITY_STATUSES).toEqual([
      "supported",
      "unavailable",
      "degraded",
      "unknown",
    ]);
    const payload = FIXTURE("capability/DeviceCapabilityProfile.valid.json");
    const calibration = (
      (payload as Record<string, unknown>)["calibration"] as Record<string, unknown>
    );
    expect(calibration["status"]).toBe("unknown");
    expect(calibration["status"]).not.toBe("unavailable");
  });

  test("acquisition metadata well-known keys match the AISE-002 advisory vocabulary", () => {
    expect(ACQUISITION_METADATA_KEYS).toEqual({
      missionId: "mission.id",
      sessionId: "session.id",
      deviceId: "device.id",
      captureKind: "capture.kind",
      sensorId: "acquisition.sensorId",
    });
  });
});
