/**
 * HFX-000 — the normalized I/O boundary tests.
 *
 * Proves: input validation against the declared input contract, the
 * normalizeResult typed-failure discipline (contract-mismatch with
 * structured issues, closed failure vocabulary enforcement, no throws),
 * digest determinism, and that provider-native payloads stay OPAQUE —
 * carried for provenance, never parsed into canonical domain types.
 */

import { describe, expect, test } from "bun:test";
import {
  inputDigestOf,
  normalizeResult,
  opaqueNativeDigestOf,
  outputsDigestOf,
  providerResultDigestOf,
  validatePayloadAgainstContract,
  validateProviderInput,
} from "./io";
import type { ProviderInput } from "./io";
import {
  REFERENCE_CAPABILITY,
  referenceInput,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  referenceUnsupportedInput,
  executeReferenceProvider,
} from "./testkit";

const V1 = referenceProviderProfileV1();

describe("validateProviderInput (the IN direction)", () => {
  test("the canonical reference input validates and digests deterministically", () => {
    const first = validateProviderInput(referenceInput(), V1);
    const second = validateProviderInput(referenceInput(), V1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.inputDigest).toBe(second.inputDigest);
      expect(first.inputDigest).toBe(inputDigestOf(referenceInput()));
      expect(first.inputDigest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("an input for a capability the provider does not offer is a typed capability-not-offered failure", () => {
    const input: ProviderInput = {
      ...referenceInput(),
      capability: "fixture-unoffered-capability",
    };
    const validation = validateProviderInput(input, V1);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.kind).toBe("capability-not-offered");
      expect(validation.failures[0]?.detail).toContain("fixture-unoffered-capability");
    }
  });

  test("an out-of-contract payload is a typed payload-contract-mismatch with structured issues", () => {
    const bad = {
      ...referenceInput(),
      payload: { ...referenceInput().payload, samples: [1.5, -0.5] }, // out of [0,1]
    };
    const validation = validateProviderInput(bad, V1);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failure = validation.failures[0]!;
      expect(failure.kind).toBe("payload-contract-mismatch");
      expect(failure.issues?.length).toBe(2); // both elements out of range
      expect(failure.issues?.[0]?.path).toBe("payload.samples[0]");
      expect(failure.issues?.[0]?.expected).toBe("<= 1");
    }
  });

  test("a missing required field is an issue naming the field", () => {
    const payload = { ...referenceInput().payload } as Record<string, unknown>;
    delete payload["sceneTag"];
    const validation = validateProviderInput(
      { kind: "provider-input", capability: REFERENCE_CAPABILITY, payload },
      V1,
    );
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.issues?.[0]?.actual).toBe("missing");
    }
  });

  test("a non-object input is a typed not-an-object failure", () => {
    for (const payload of [null, 42, "input", [], true]) {
      const validation = validateProviderInput(payload, V1);
      expect(validation.ok).toBe(false);
    }
  });
});

describe("normalizeResult (the OUT direction — typed failures, no throws)", () => {
  const inputDigest = inputDigestOf(referenceInput());

  test("a well-formed raw execution normalizes to a contract-validated ok result", () => {
    const raw = executeReferenceProvider(V1, referenceInput());
    const outcome = normalizeResult(raw, V1, { inputDigest });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.status).toBe("ok");
      expect(outcome.result.capability).toBe(REFERENCE_CAPABILITY);
      expect(outcome.result.inputDigest).toBe(inputDigest);
      expect(outcome.result.outputDigest).toBe(
        outputsDigestOf(outcome.result.outputs as Record<string, unknown>),
      );
    }
  });

  test("normalization is deterministic: identical raw executions digest identically", () => {
    const raw = executeReferenceProvider(V1, referenceInput());
    const first = normalizeResult(raw, V1, { inputDigest });
    const second = normalizeResult(raw, V1, { inputDigest });
    if (first.ok && second.ok) {
      expect(providerResultDigestOf(first.result)).toBe(providerResultDigestOf(second.result));
    } else {
      throw new Error("normalization unexpectedly failed");
    }
  });

  test("an out-of-contract output is a typed contract-mismatch with structured issues", () => {
    const outcome = normalizeResult(
      { outputs: { depthMap: [99, -1], unit: "m" } },
      V1,
      { inputDigest },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.issues?.length).toBe(2);
      expect(outcome.failure.issues?.[0]?.path).toBe("outputs.depthMap[0]");
    }
  });

  test("an unknown output field is a contract violation (contracts are closed)", () => {
    const raw = executeReferenceProvider(V1, referenceInput());
    const outcome = normalizeResult(
      {
        ...raw,
        outputs: { ...(raw.outputs as Record<string, unknown>), bonusField: "surprise" },
      },
      V1,
      { inputDigest },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.issues?.some((issue) => issue.path === "outputs.bonusField")).toBe(
        true,
      );
    }
  });

  test("an invented failure kind is a typed failure-kind-out-of-vocabulary refusal", () => {
    const outcome = normalizeResult(
      { failure: { kind: "vibes-failure", detail: "felt wrong" } },
      V1,
      { inputDigest },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("failure-kind-out-of-vocabulary");
      expect(outcome.failure.detail).toContain("CLOSED failure vocabulary");
    }
  });

  test("an explicit closed-vocabulary failure normalizes to a failed result (never fabricated outputs)", () => {
    const raw = executeReferenceProvider(V1, referenceUnsupportedInput());
    const outcome = normalizeResult(raw, V1, { inputDigest });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.status).toBe("failed");
      expect(outcome.result.failure?.kind).toBe("unsupported-data");
      expect(outcome.result.outputs).toBeUndefined();
    }
  });

  test("both outputs and a failure is a typed outputs-and-failure refusal (ambiguity is refused)", () => {
    const raw = executeReferenceProvider(V1, referenceInput());
    const outcome = normalizeResult(
      { ...raw, failure: { kind: "timeout", detail: "also failed?" } },
      V1,
      { inputDigest },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("outputs-and-failure");
    }
  });

  test("neither outputs nor a failure is a typed empty-execution refusal", () => {
    const outcome = normalizeResult({ capability: REFERENCE_CAPABILITY }, V1, { inputDigest });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("empty-execution");
    }
  });

  test("a capability the profile does not offer is a typed capability-mismatch refusal", () => {
    const outcome = normalizeResult(
      { capability: "other-capability", outputs: { depthMap: [1], unit: "m" } },
      V1,
      { inputDigest },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("capability-mismatch");
    }
  });

  test("a non-object payload is a typed not-provider-shaped refusal", () => {
    for (const payload of [null, 42, "raw", [], true]) {
      const outcome = normalizeResult(payload, V1, { inputDigest });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.failure.kind).toBe("not-provider-shaped");
      }
    }
  });

  test("the opaque native payload rides along verbatim — never parsed, digest-stable", () => {
    const raw = executeReferenceProvider(V1, referenceInput());
    const outcome = normalizeResult(raw, V1, { inputDigest });
    if (!outcome.ok) {
      throw new Error("normalization unexpectedly failed");
    }
    expect(outcome.result.providerNative).toBeDefined();
    expect(outcome.result.providerNative?.mediaType).toBe("application/aise-fixture-depth+json");
    expect(opaqueNativeDigestOf(outcome.result.providerNative!)).toBe(
      opaqueNativeDigestOf(executeReferenceProvider(V1, referenceInput()).providerNative!),
    );
    // the native payload is EXCLUDED from the normalized semantic digest
    const withoutNative = { ...outcome.result, providerNative: undefined };
    expect(providerResultDigestOf(withoutNative)).toBe(providerResultDigestOf(outcome.result));
  });

  test("a malformed providerNative wrapper is a typed not-provider-shaped refusal", () => {
    const outcome = normalizeResult(
      {
        outputs: { depthMap: [1, 2, 3, 4], unit: "m" },
        providerNative: { notAMediaType: true },
      },
      V1,
      { inputDigest },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("not-provider-shaped");
      expect(outcome.failure.detail).toContain("providerNative");
    }
  });
});

describe("validatePayloadAgainstContract (the engine)", () => {
  test("type discrimination across every declared field type", () => {
    const contract = {
      contractId: "t/1",
      modality: "text" as const,
      fields: [
        { name: "n", type: "number" as const, required: true, description: "n" },
        { name: "i", type: "integer" as const, required: true, description: "i" },
        { name: "s", type: "string" as const, required: true, description: "s" },
        { name: "b", type: "boolean" as const, required: true, description: "b" },
        { name: "a", type: "number-array" as const, required: true, description: "a" },
      ],
    };
    expect(validatePayloadAgainstContract({ n: 1.5, i: 2, s: "x", b: false, a: [0.5] }, contract, "p")).toEqual([]);
    const issues = validatePayloadAgainstContract(
      { n: "x", i: 1.5, s: 3, b: "yes", a: [1, "x"] },
      contract,
      "p",
    );
    // issues follow the CONTRACT's field declaration order
    expect(issues.map((issue) => issue.path)).toEqual(["p.n", "p.i", "p.s", "p.b", "p.a[1]"]);
  });

  test("optional fields are skipped when absent but checked when present", () => {
    const contract = {
      contractId: "t/2",
      modality: "text" as const,
      fields: [
        { name: "req", type: "string" as const, required: true, description: "req" },
        { name: "opt", type: "integer" as const, required: false, description: "opt", min: 0, max: 10 },
      ],
    };
    expect(validatePayloadAgainstContract({ req: "x" }, contract, "p")).toEqual([]);
    expect(validatePayloadAgainstContract({ req: "x", opt: 99 }, contract, "p")).toHaveLength(1);
    expect(validatePayloadAgainstContract({}, contract, "p")).toHaveLength(1);
  });
});

describe("v2 discrimination (the versions differ observably)", () => {
  test("v1 and v2 normalize to different result digests over the same input", () => {
    const V2 = referenceProviderProfileV2();
    const inputDigest = inputDigestOf(referenceInput());
    const v1 = normalizeResult(executeReferenceProvider(V1, referenceInput()), V1, { inputDigest });
    const v2 = normalizeResult(executeReferenceProvider(V2, referenceInput()), V2, { inputDigest });
    if (v1.ok && v2.ok) {
      expect(providerResultDigestOf(v1.result)).not.toBe(providerResultDigestOf(v2.result));
    } else {
      throw new Error("normalization unexpectedly failed");
    }
  });
});
