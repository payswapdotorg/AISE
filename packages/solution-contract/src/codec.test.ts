/**
 * Codec behavior tests (PROD-021): versioning, unknown-field policy
 * (preserve on decode / reject on strict decode — both paths explicit),
 * canonical-JSON determinism, and the serialization-is-not-authority
 * discipline (encoding a proposal object never touches observed reality —
 * it is bytes on a wire).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import {
  SOLUTION_CONTRACT_VERSION,
  decodeEngineeringOperationIntent,
  decodeEngineeringOperationIntentStrict,
  decodeProposedState,
  encodeEngineeringOperationIntent,
  encodeProposedState,
} from "./index";
import { solutionWireObject } from "./registry";
import {
  SolutionContractDecodeError,
  SolutionContractEncodeError,
  SolutionContractVersionMismatchError,
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

const intentFixture = FIXTURE(
  "operation/EngineeringOperationIntent.valid-excavation-direct.json",
);
const stateFixture = FIXTURE("state/ProposedState.valid-layer.json");

describe("canonical JSON and encode determinism", () => {
  test("the same value always encodes to identical bytes regardless of key order", () => {
    const first = decodeEngineeringOperationIntent(intentFixture);
    const shuffled = reverseKeyOrder(JSON.parse(JSON.stringify(intentFixture)));
    const second = decodeEngineeringOperationIntent(shuffled);
    expect(encodeEngineeringOperationIntent(second)).toBe(encodeEngineeringOperationIntent(first));
  });

  test("encode output is canonical (sorted keys, 2-space indent, trailing newline)", () => {
    const encoded = encodeProposedState(decodeProposedState(stateFixture));
    expect(encoded.endsWith("\n")).toBe(true);
    const reparsed = JSON.parse(encoded) as Record<string, unknown>;
    expect(Object.keys(reparsed).slice().sort()).toEqual(Object.keys(reparsed));
  });

  test("encode stamps the family version when absent and rejects foreign versions", () => {
    const codec = solutionWireObject("ProposedState")?.codec;
    expect(codec).toBeDefined();
    const decoded = decodeProposedState(stateFixture);
    const withoutVersion = { ...decoded } as Record<string, unknown>;
    delete withoutVersion["contractVersion"];
    const encoded = codec?.encode(withoutVersion) ?? "";
    expect((JSON.parse(encoded) as Record<string, unknown>)["contractVersion"]).toBe(
      SOLUTION_CONTRACT_VERSION,
    );

    expect(() =>
      encodeProposedState({ ...decoded, contractVersion: "9.9.9" } as typeof decoded),
    ).toThrow(SolutionContractVersionMismatchError);
    expect(() =>
      encodeProposedState({ ...decoded, contractVersion: 7 } as unknown as typeof decoded),
    ).toThrow(SolutionContractEncodeError);
  });
});

describe("version gate", () => {
  test("a cross-major contractVersion fails fast with the typed mismatch error", () => {
    expect(() =>
      decodeProposedState(FIXTURE("state/ProposedState.version-mismatch.json")),
    ).toThrow(SolutionContractVersionMismatchError);
  });

  test("the typed mismatch error carries expected/received and the stable code", () => {
    let caught: unknown;
    try {
      decodeProposedState(FIXTURE("state/ProposedState.version-mismatch.json"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SolutionContractVersionMismatchError);
    const mismatch = caught as SolutionContractVersionMismatchError;
    expect(mismatch.code).toBe("SOLUTION_CONTRACT_VERSION_MISMATCH");
    expect(mismatch.expected).toBe(SOLUTION_CONTRACT_VERSION);
    expect(mismatch.received).not.toBe(SOLUTION_CONTRACT_VERSION);
    expect(mismatch.objectName).toBe("ProposedState");
  });

  test("a malformed contractVersion is a schema violation at the contractVersion path", () => {
    let caught: unknown;
    try {
      decodeProposedState({ ...stateFixture, contractVersion: "one-dot-oh" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SolutionContractDecodeError);
    const decodeError = caught as SolutionContractDecodeError;
    expect(decodeError.issues.some((issue) => issue.path.includes("contractVersion"))).toBe(
      true,
    );
  });

  test("a non-object payload is a typed decode error, never a silent coercion", () => {
    expect(() => decodeProposedState("not-an-object")).toThrow(SolutionContractDecodeError);
    expect(() => decodeProposedState([1, 2, 3])).toThrow(SolutionContractDecodeError);
    expect(() => decodeProposedState(null)).toThrow(SolutionContractDecodeError);
  });
});

describe("unknown-field policy", () => {
  test("default decode PRESERVES unknown keys (same-major forward compatibility)", () => {
    const payload = JSON.parse(JSON.stringify(intentFixture)) as Record<string, unknown>;
    payload["futureField"] = { "carried": "verbatim" };
    const decoded = decodeEngineeringOperationIntent(payload) as Record<string, unknown>;
    expect(decoded["futureField"]).toEqual({ carried: "verbatim" });
  });

  test("strict decode REJECTS unknown keys at any object nesting level", () => {
    const payload = JSON.parse(JSON.stringify(intentFixture)) as Record<string, unknown>;
    payload["futureField"] = "schema drift";
    let caught: unknown;
    try {
      decodeEngineeringOperationIntentStrict(payload);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SolutionContractDecodeError);
    const decodeError = caught as SolutionContractDecodeError;
    expect(
      decodeError.issues.some(
        (issue) => issue.code === "unrecognized_keys" && issue.path.includes("futureField"),
      ),
    ).toBe(true);
  });

  test("strict decode rejects unknown keys in NESTED objects (target, provenance)", () => {
    const payload = JSON.parse(JSON.stringify(intentFixture)) as Record<string, unknown>;
    (payload["target"] as Record<string, unknown>)["driftField"] = 1;
    expect(() => decodeEngineeringOperationIntentStrict(payload)).toThrow(
      SolutionContractDecodeError,
    );
  });
});

describe("every registry object decodes and re-encodes its valid fixtures", () => {
  test("decode -> encode -> parse -> decode round-trips deep-equal for all valid fixtures", () => {
    const files = readdirRecursive(
      join(import.meta.dir, "..", "fixtures"),
    ).filter((file) => file.endsWith(".json") && !file.includes(".invalid-") && !file.includes(".version-mismatch"));
    expect(files.length).toBeGreaterThan(40);
    for (const file of files) {
      const payload = JSON.parse(readFileSync(file, "utf8"));
      const name = basename(file).replace(/\..*$/, "");
      const codec = solutionWireObject(name)?.codec;
      expect(codec).toBeDefined();
      const first = codec?.decode(payload);
      const encoded = codec?.encode(first as object);
      const second = codec?.decode(JSON.parse(encoded ?? "null"));
      expect(second).toEqual(first);
    }
  });
});

/* ------------------------------------------------------------------ */

function readdirRecursive(root: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...readdirRecursive(full));
    } else if (entry.isFile()) {
      paths.push(full);
    }
  }
  return paths;
}
