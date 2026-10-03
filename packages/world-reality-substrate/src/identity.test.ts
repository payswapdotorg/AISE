/**
 * WORLD-P0-A tests — opaque handles and the provider-id quarantine, the
 * closed failure vocabulary, and the seeded PRNG determinism.
 */

import { describe, expect, test } from "bun:test";
import {
  CANONICAL_ID_PREFIX,
  digestHex,
  handleBelongsToLane,
  isCanonicalAiseId,
  isSubstrateHandle,
  mintSubstrateHandle,
  parseSubstrateHandle,
  quarantineCanonicalId,
  quarantineProviderRef,
  SUBSTRATE_HANDLE_PREFIX,
} from "./identity";
import {
  isSubstrateFailureKind,
  malformedInput,
  resourceLimitExceeded,
  SUBSTRATE_FAILURE_KINDS,
  SUBSTRATE_FAILURE_VOCABULARY,
  failClosed,
  thrownMessage,
} from "./outcome";
import { seededFloats, seededIntegers, seededRandom } from "./seeded";

describe("opaque substrate handles", () => {
  test("minting is deterministic: the same (lane, ref) mints the same handle forever", () => {
    expect(mintSubstrateHandle("babylon", "scene/42")).toBe(mintSubstrateHandle("babylon", "scene/42"));
  });

  test("the same provider ref in two lanes mints two different handles (lane quarantine)", () => {
    expect(mintSubstrateHandle("babylon", "scene/42")).not.toBe(mintSubstrateHandle("gltf", "scene/42"));
  });

  test("two distinct refs mint distinct handles", () => {
    expect(mintSubstrateHandle("usd", "/Root/A")).not.toBe(mintSubstrateHandle("usd", "/Root/B"));
  });

  test("the provider reference never appears in the handle (one-way digest)", () => {
    const handle = mintSubstrateHandle("assimp", "provider-object-xyz");
    expect(handle.includes("provider-object-xyz")).toBe(false);
    expect(handle.startsWith(`${SUBSTRATE_HANDLE_PREFIX}assimp:`)).toBe(true);
    expect(handle).toMatch(/^substrate:assimp:[0-9a-f]{40}$/);
  });

  test("parse roundtrips the lane and keeps the opaque body", () => {
    const handle = mintSubstrateHandle("cesium", "tile/17/2/3");
    const parsed = parseSubstrateHandle(handle);
    expect(parsed?.lane).toBe("cesium");
    expect(parsed?.opaqueId).toMatch(/^[0-9a-f]{40}$/);
  });

  test("malformed handles are refused by the structural guard", () => {
    expect(isSubstrateHandle("substrate:")).toBe(false);
    expect(isSubstrateHandle("substrate:babylon:short")).toBe(false);
    expect(isSubstrateHandle("substrate:unknownlane:" + "a".repeat(40))).toBe(false);
    expect(isSubstrateHandle("aise:mesh:1")).toBe(false);
    expect(isSubstrateHandle(42)).toBe(false);
  });

  test("lane ownership is enforced (cross-lane use refused)", () => {
    const handle = mintSubstrateHandle("babylon", "x");
    expect(handleBelongsToLane(handle, "babylon")).toBe(true);
    expect(handleBelongsToLane(handle, "gltf")).toBe(false);
  });
});

describe("the canonical-id quarantine gate", () => {
  test("a canonical field carrying a substrate handle is refused fail-closed", () => {
    const handle = mintSubstrateHandle("gltf", "glb/abc");
    const outcome = quarantineCanonicalId("meshId", handle);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.path).toBe("meshId");
    expect(outcome.failure.detail).toContain("provider ids never become canonical AISE identity");
  });

  test("a canonical field embedding handle MATERIAL is refused fail-closed", () => {
    const outcome = quarantineCanonicalId("label", `preamble ${SUBSTRATE_HANDLE_PREFIX}gltf:x`);
    expect(outcome.ok).toBe(false);
  });

  test("a well-formed canonical id passes the gate", () => {
    expect(quarantineCanonicalId("meshId", "aise:mesh:9f1c2d")).toMatchObject({ ok: true });
  });

  test("the provider-ref gate routes provider refs into handles", () => {
    const outcome = quarantineProviderRef("assimp", "provider-face-17");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.value.startsWith(`${SUBSTRATE_HANDLE_PREFIX}assimp:`)).toBe(true);
  });

  test("a provider that mints canonical-shaped ids is refused (substrates never mint aise: ids)", () => {
    const outcome = quarantineProviderRef("usd", `${CANONICAL_ID_PREFIX}prim:fake`);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("contract-mismatch");
  });

  test("the canonical id shape guard", () => {
    expect(isCanonicalAiseId("aise:mesh:abc123")).toBe(true);
    expect(isCanonicalAiseId("substrate:gltf:abcd")).toBe(false);
    expect(isCanonicalAiseId("aise:")).toBe(false);
  });
});

describe("the closed substrate failure vocabulary", () => {
  test("the five kinds are frozen in order", () => {
    expect([...SUBSTRATE_FAILURE_KINDS]).toEqual([
      "malformed-input",
      "unsupported-format",
      "contract-mismatch",
      "capability-unavailable",
      "resource-limit-exceeded",
    ]);
  });

  test("every vocabulary entry is a member of the closed kind list", () => {
    expect(SUBSTRATE_FAILURE_VOCABULARY).toHaveLength(5);
    for (const entry of SUBSTRATE_FAILURE_VOCABULARY) {
      expect(isSubstrateFailureKind(entry.kind)).toBe(true);
      expect(entry.definition.length).toBeGreaterThan(20);
    }
  });

  test("the guard refuses out-of-vocabulary kinds", () => {
    expect(isSubstrateFailureKind("timeout")).toBe(false);
    expect(isSubstrateFailureKind("Error")).toBe(false);
    expect(isSubstrateFailureKind(7)).toBe(false);
  });

  test("typed constructors build the sanctioned shapes", () => {
    expect(malformedInput("accessors[2]", "bad", "gltf")).toMatchObject({
      kind: "malformed-input",
      path: "accessors[2]",
      lane: "gltf",
    });
    const limit = resourceLimitExceeded("glb", 100, 200, "gltf");
    expect(limit.limit).toEqual({ declared: 100, actual: 200 });
    expect(limit.detail).toContain("declared 100");
    expect(limit.detail).toContain("actual 200");
  });

  test("failClosed wraps a throwing callback into a typed contract-mismatch", () => {
    const outcome = failClosed("babylon", () => {
      throw new Error("kaboom");
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("kaboom");
    expect(outcome.failure.detail).toContain("fail-closed");
  });

  test("thrownMessage narrows unknown thrown values honestly", () => {
    expect(thrownMessage(new Error("msg"))).toBe("msg");
    expect(thrownMessage("raw-string")).toBe("raw-string");
  });
});

describe("the seeded PRNG (deterministic doubles)", () => {
  test("the same seed produces the identical sequence, forever", () => {
    const left = seededRandom(1234);
    const right = seededRandom(1234);
    for (let index = 0; index < 100; index += 1) {
      expect(left.next()).toBe(right.next());
    }
  });

  test("different seeds diverge", () => {
    expect(seededFloats(1, 8)[7]).not.toBe(seededFloats(2, 8)[7]);
  });

  test("floats stay in [0, 1) and integers stay in range", () => {
    for (const value of seededFloats(99, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    for (const value of seededIntegers(99, 500, -3, 7)) {
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  test("the digest helper is the sha-256 content digest", () => {
    expect(digestHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
