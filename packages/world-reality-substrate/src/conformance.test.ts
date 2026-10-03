/**
 * WORLD-P0-A tests — the shared lane-conformance harness: the constructive
 * battery over the five real substitution doubles, plus the DISCRIMINATION
 * battery (the substitution contract §4 law 3: a harness that only proves
 * the happy path is a failed delivery) — anti-subjects that violate each
 * law MUST fail exactly the check that guards that law.
 */

import { describe, expect, test } from "bun:test";
import { contractDigest, runLaneConformance } from "./conformance";
import type {
  ConformanceCheckResult,
  LaneConformanceSubject,
  SubstrateLaneContract,
} from "./conformance";
import { REALITY_LANE_SUBJECTS, babylonLaneSubject } from "./lanes";
import type { SubstrateArtifact } from "./conformance";
import { digestHex, mintSubstrateHandle, SUBSTRATE_HANDLE_PREFIX } from "./identity";
import { malformedInput } from "./outcome";
import type { SubstrateOutcome } from "./outcome";

describe("the constructive battery over the five substitution doubles", () => {
  for (const subject of REALITY_LANE_SUBJECTS) {
    describe(`the ${subject.contract.lane} lane`, () => {
      const report = runLaneConformance(subject);

      test("contract-shape: closed, unique, digest-bound capability list", () => {
        const check = checkOf(report.checks, "contract-shape");
        expect(check.ok).toBe(true);
      });

      test("determinism: the canonical request twice yields deeply-equal artifacts", () => {
        expect(checkOf(report.checks, "determinism").ok).toBe(true);
      });

      test("failure-closure: the poisoned request is refused with a closed-vocabulary kind", () => {
        expect(checkOf(report.checks, "failure-closure").ok).toBe(true);
      });

      test("capability-proof: every declared capability is exercised with real behavior", () => {
        expect(checkOf(report.checks, "capability-proof").ok).toBe(true);
      });

      test("provenance: artifacts bind the lane contract digest and input digest", () => {
        expect(checkOf(report.checks, "provenance").ok).toBe(true);
      });

      test("quarantine: opaque handles, no canonical AISE id minted", () => {
        expect(checkOf(report.checks, "quarantine").ok).toBe(true);
      });

      test("the battery's verdict is allPassed", () => {
        expect(report.allPassed).toBe(true);
      });
    });
  }

  test("the five lanes declare five distinct substrate identities", () => {
    const names = REALITY_LANE_SUBJECTS.map((subject) => subject.contract.substrateName);
    expect(new Set(names).size).toBe(5);
  });

  test("tampering with a declared capability changes the contract digest", () => {
    const original = babylonLaneSubject.contract;
    const tampered: SubstrateLaneContract = {
      ...original,
      capabilities: [
        ...original.capabilities.slice(0, 1),
        { ...original.capabilities[1]!, statement: "tampered statement" },
        ...original.capabilities.slice(2),
      ],
    };
    expect(contractDigest(tampered)).not.toBe(contractDigest(original));
    expect(contractDigest(tampered)).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ------------------------------------------------------------------ */
/* The discrimination battery (anti-subjects)                             */
/* ------------------------------------------------------------------ */

function checkOf(
  checks: readonly ConformanceCheckResult[],
  name: string,
): ConformanceCheckResult {
  const found = checks.find((check) => check.check === name);
  if (found === undefined) {
    throw new Error(`no check named '${name}' in the report`);
  }
  return found;
}

function minimalArtifact(handle: string): SubstrateArtifact {
  return {
    lane: "babylon",
    handle,
    provenance: {
      lane: "babylon",
      substrateName: "Anti Substrate",
      adapterVersion: "0.0.0",
      contractDigest: digestHex("anti"),
      inputDigest: digestHex("anti-input"),
    },
  };
}

function antiSubject(options: {
  readonly submit?: (request: unknown) => SubstrateOutcome<SubstrateArtifact>;
  readonly exercises?: readonly { capabilityId: string; ok: boolean; evidence: string }[];
}): LaneConformanceSubject {
  const declaredExercises = options.exercises;
  return {
    contract: babylonLaneSubject.contract,
    canonicalRequest: () => ({ kind: "instantiate", nodes: [{ id: "n" }] }),
    refusingRequest: () => ({ kind: "instantiate", nodes: [] }),
    submit:
      options.submit ??
      (() => ({ ok: true, value: minimalArtifact(mintSubstrateHandle("babylon", "anti")) })),
    exerciseCapabilities:
      declaredExercises === undefined
        ? () =>
            babylonLaneSubject.contract.capabilities.map((capability) => ({
              capabilityId: capability.id,
              ok: true,
              evidence: "anti",
            }))
        : () => declaredExercises,
  };
}

describe("the discrimination battery (anti-subjects must fail their law's check)", () => {
  test("a double that ACCEPTS the poisoned request fails failure-closure", () => {
    const report = runLaneConformance(
      antiSubject({ submit: () => ({ ok: true, value: minimalArtifact(mintSubstrateHandle("babylon", "x")) }) }),
    );
    expect(checkOf(report.checks, "failure-closure").ok).toBe(false);
    expect(report.allPassed).toBe(false);
  });

  test("a double that THROWS on the poisoned request fails failure-closure", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: (request) => {
          if ((request as { nodes?: unknown[] }).nodes?.length === 0) {
            throw new Error("boom — untyped crash");
          }
          return { ok: true, value: minimalArtifact(mintSubstrateHandle("babylon", "x")) };
        },
      }),
    );
    expect(checkOf(report.checks, "failure-closure").ok).toBe(false);
  });

  test("a double that THROWS on the canonical request fails determinism AND provenance AND quarantine", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: (request) => {
          if ((request as { nodes?: unknown[] }).nodes?.length !== 0) {
            throw new Error("boom on canonical");
          }
          return { ok: false, failure: malformedInput("x", "refused") };
        },
      }),
    );
    expect(checkOf(report.checks, "determinism").ok).toBe(false);
    expect(checkOf(report.checks, "provenance").ok).toBe(false);
    expect(checkOf(report.checks, "quarantine").ok).toBe(false);
  });

  test("a non-deterministic double (varying artifacts) fails determinism", () => {
    let counter = 0;
    const report = runLaneConformance(
      antiSubject({
        submit: () => {
          counter += 1;
          return {
            ok: true,
            value: {
              ...minimalArtifact(mintSubstrateHandle("babylon", "anti")),
              counter,
            } as SubstrateArtifact,
          };
        },
      }),
    );
    expect(checkOf(report.checks, "determinism").ok).toBe(false);
  });

  test("a declared-but-dead capability fails capability-proof", () => {
    const report = runLaneConformance(
      antiSubject({
        exercises: babylonLaneSubject.contract.capabilities.map((capability, index) => ({
          capabilityId: capability.id,
          ok: index !== 1,
          evidence: "declared but dead",
        })),
      }),
    );
    expect(checkOf(report.checks, "capability-proof").ok).toBe(false);
  });

  test("a capability exercised but NOT declared fails capability-proof", () => {
    const report = runLaneConformance(
      antiSubject({
        exercises: [
          ...babylonLaneSubject.contract.capabilities.map((capability) => ({
            capabilityId: capability.id,
            ok: true,
            evidence: "declared",
          })),
          { capabilityId: "undeclared-capability", ok: true, evidence: "not declared" },
        ],
      }),
    );
    expect(checkOf(report.checks, "capability-proof").ok).toBe(false);
  });

  test("a double whose provenance does not bind the contract digest fails provenance", () => {
    const artifact = minimalArtifact(mintSubstrateHandle("babylon", "anti"));
    const mismatched = {
      ...artifact,
      provenance: { ...artifact.provenance, contractDigest: digestHex("not-the-contract-digest") },
    };
    const report = runLaneConformance(antiSubject({ submit: () => ({ ok: true, value: mismatched }) }));
    expect(checkOf(report.checks, "provenance").ok).toBe(false);
  });

  test("a double that mints a canonical aise: id fails quarantine", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: () => ({ ok: true, value: minimalArtifact("aise:mesh:canonical-1") }),
      }),
    );
    expect(checkOf(report.checks, "quarantine").ok).toBe(false);
  });

  test("a double whose handle belongs to another lane fails quarantine", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: () => ({
          ok: true,
          value: minimalArtifact(mintSubstrateHandle("gltf", "wrong-lane")),
        }),
      }),
    );
    expect(checkOf(report.checks, "quarantine").ok).toBe(false);
  });

  test("a non-opaque handle fails quarantine", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: () => ({ ok: true, value: minimalArtifact(`${SUBSTRATE_HANDLE_PREFIX}babylon:not-hex`) }),
      }),
    );
    expect(checkOf(report.checks, "quarantine").ok).toBe(false);
  });

  test("a malformed refusal (empty detail) fails failure-closure", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: (request) => {
          if ((request as { nodes?: unknown[] }).nodes?.length === 0) {
            return { ok: false, failure: { kind: "malformed-input", detail: "" } };
          }
          return { ok: true, value: minimalArtifact(mintSubstrateHandle("babylon", "x")) };
        },
      }),
    );
    expect(checkOf(report.checks, "failure-closure").ok).toBe(false);
  });

  test("an out-of-vocabulary failure kind fails failure-closure", () => {
    const report = runLaneConformance(
      antiSubject({
        submit: (request) => {
          if ((request as { nodes?: unknown[] }).nodes?.length === 0) {
            return { ok: false, failure: { kind: "made-up-kind" as never, detail: "x" } };
          }
          return { ok: true, value: minimalArtifact(mintSubstrateHandle("babylon", "x")) };
        },
      }),
    );
    expect(checkOf(report.checks, "failure-closure").ok).toBe(false);
  });
});
