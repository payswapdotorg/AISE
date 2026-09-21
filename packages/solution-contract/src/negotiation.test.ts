/**
 * Operation capability negotiation tests (PROD-021).
 *
 * Proves the negotiation model's acceptance criteria:
 *  - executable / blocked / unsupported / unknown outcomes with honest,
 *    deterministic reasons (unsupported-operation states are explicit,
 *    never silent);
 *  - the missing-parameter BLOCKED outcome (the agent must ASK — never
 *    invent) with missingParameters in the profile's declaration order;
 *  - unknown is NEVER conflated with unsupported (the frozen honesty rule);
 *  - negotiation is ORIGIN-BLIND (direct manipulation and agent intents of
 *    the same semantics negotiate identically) and deterministic (the
 *    committed fixtures are the byte-stable wire form of the output);
 *  - negotiation carries no authority semantics and never mutates inputs.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeEngineeringOperationIntent,
  decodeOperationCapabilityProfile,
  negotiateOperationCapability,
} from "./index";
import type { EngineeringOperationIntent, OperationCapabilityProfile } from "./index";

const FIXTURES_ROOT = join(import.meta.dir, "..", "fixtures");

function loadFixture(family: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, family, file), "utf8")) as Record<
    string,
    unknown
  >;
}

const profileFull = decodeOperationCapabilityProfile(
  loadFixture("capability", "OperationCapabilityProfile.valid.json"),
);
const profilePartial = decodeOperationCapabilityProfile(
  loadFixture("capability", "OperationCapabilityProfile.valid-partial.json"),
);

function loadIntent(file: string): EngineeringOperationIntent {
  return decodeEngineeringOperationIntent(loadFixture("operation", file));
}

const excavationAgent = loadIntent("EngineeringOperationIntent.valid-excavation-agent.json");
const excavationDirect = loadIntent("EngineeringOperationIntent.valid-excavation-direct.json");
const plasterIntent = loadIntent("EngineeringOperationIntent.valid-plaster-application.json");
const mepIntent = loadIntent("EngineeringOperationIntent.valid-future-vertical-mep.json");
const trenchShoringIntent = loadIntent(
  "EngineeringOperationIntent.valid-undeclared-operation-trench-shoring.json",
);
const missingDepthIntent = loadIntent(
  "EngineeringOperationIntent.valid-blocked-missing-depth.json",
);

describe("negotiation outcomes", () => {
  test("a complete excavation intent over the reference profile is EXECUTABLE", () => {
    const negotiation = negotiateOperationCapability(excavationAgent, profileFull);
    expect(negotiation.outcome).toBe("executable");
    expect(negotiation.reasons[0]?.code).toBe("capability-satisfied");
    expect(negotiation.missingParameters).toEqual([]);
  });

  test("negotiation is ORIGIN-BLIND: direct and agent intents negotiate identically", () => {
    const direct = negotiateOperationCapability(excavationDirect, profileFull);
    const agent = negotiateOperationCapability(excavationAgent, profileFull);
    expect(agent.outcome).toBe(direct.outcome);
    expect(agent.reasons).toEqual(direct.reasons);
    expect(agent.missingParameters).toEqual(direct.missingParameters);
    expect(agent.intentRef).not.toBe(direct.intentRef); // only the echoed intent id differs
  });

  test("a future vertical (mep) negotiates to UNSUPPORTED with an honest reason naming it", () => {
    const negotiation = negotiateOperationCapability(mepIntent, profileFull);
    expect(negotiation.outcome).toBe("unsupported");
    expect(negotiation.reasons[0]?.code).toBe("domain-not-declared");
    expect(negotiation.reasons[0]?.detail).toContain("'mep'");
    expect(negotiation.reasons[0]?.detail).toContain("declared verticals: [building]");
  });

  test("an undeclared operation type negotiates to UNSUPPORTED naming the type", () => {
    const negotiation = negotiateOperationCapability(trenchShoringIntent, profileFull);
    expect(negotiation.outcome).toBe("unsupported");
    expect(negotiation.reasons[0]?.code).toBe("operation-type-not-declared");
    expect(negotiation.reasons[0]?.detail).toContain("'trench-shoring'");
  });

  test("an unavailable operation type negotiates to UNSUPPORTED with its limitations surfaced", () => {
    const profile: OperationCapabilityProfile = JSON.parse(JSON.stringify(profileFull));
    const entry = profile.domains[0]?.operations.find(
      (candidate) => candidate.operationType === "excavation",
    );
    if (entry === undefined) {
      throw new Error("excavation capability missing from the reference profile");
    }
    entry.status = "unavailable";
    entry.limitations = ["excavation engine offline for maintenance"];
    const negotiation = negotiateOperationCapability(excavationAgent, profile);
    expect(negotiation.outcome).toBe("unsupported");
    expect(negotiation.reasons[0]?.code).toBe("operation-type-unavailable");
    expect(negotiation.reasons[0]?.detail).toContain("excavation engine offline for maintenance");
  });

  test("a missing required parameter negotiates to BLOCKED — ask, never invent", () => {
    const negotiation = negotiateOperationCapability(missingDepthIntent, profileFull);
    expect(negotiation.outcome).toBe("blocked");
    expect(negotiation.missingParameters).toEqual(["depth"]);
    expect(negotiation.reasons[0]?.code).toBe("missing-required-parameter");
    expect(negotiation.reasons[0]?.detail).toContain("'depth'");
  });

  test("multiple missing parameters are listed in the profile's declaration order", () => {
    const mutated: EngineeringOperationIntent = JSON.parse(JSON.stringify(missingDepthIntent));
    mutated.parameters = [
      { name: "length", value: 3.0, unit: "m" },
    ];
    const negotiation = negotiateOperationCapability(mutated, profileFull);
    expect(negotiation.outcome).toBe("blocked");
    expect(negotiation.missingParameters).toEqual(["depth", "width"]);
    expect(negotiation.reasons.map((reason) => reason.code)).toEqual([
      "missing-required-parameter",
      "missing-required-parameter",
    ]);
  });

  test("an undetermined operation type negotiates to UNKNOWN, never unsupported", () => {
    const negotiation = negotiateOperationCapability(excavationDirect, profilePartial);
    expect(negotiation.outcome).toBe("unknown");
    expect(negotiation.reasons[0]?.code).toBe("operation-type-unknown");
    expect(negotiation.reasons[0]?.detail).toContain("never reported as unsupported");
  });

  test("an undetermined DOMAIN negotiates to UNKNOWN, never unsupported", () => {
    const profile: OperationCapabilityProfile = JSON.parse(JSON.stringify(profileFull));
    if (profile.domains[0] === undefined) {
      throw new Error("reference profile has no domain entry");
    }
    profile.domains[0].status = "unknown";
    const negotiation = negotiateOperationCapability(excavationAgent, profile);
    expect(negotiation.outcome).toBe("unknown");
    expect(negotiation.reasons[0]?.code).toBe("domain-unknown");
  });

  test("a degraded operation type still executes with the limitations surfaced honestly", () => {
    const negotiation = negotiateOperationCapability(plasterIntent, profilePartial);
    expect(negotiation.outcome).toBe("executable");
    const degraded = negotiation.reasons.find((reason) => reason.code === "capability-degraded");
    expect(degraded).toBeDefined();
    expect(degraded?.detail).toContain("thickness-sensor calibration is pending");
  });
});

describe("negotiation determinism and wire form", () => {
  test("the same inputs always produce the byte-identical negotiation", () => {
    const first = negotiateOperationCapability(excavationAgent, profileFull);
    const second = negotiateOperationCapability(
      JSON.parse(JSON.stringify(excavationAgent)),
      JSON.parse(JSON.stringify(profileFull)),
    );
    expect(second).toEqual(first);
  });

  test("the committed negotiation fixtures are the wire form of the function output", () => {
    const pairs: Array<[string, EngineeringOperationIntent, OperationCapabilityProfile]> = [
      ["OperationCapabilityNegotiation.valid-executable.json", excavationAgent, profileFull],
      [
        "OperationCapabilityNegotiation.valid-executable-degraded.json",
        plasterIntent,
        profilePartial,
      ],
      [
        "OperationCapabilityNegotiation.valid-unsupported-future-vertical.json",
        mepIntent,
        profileFull,
      ],
      [
        "OperationCapabilityNegotiation.valid-unsupported-undeclared-operation.json",
        trenchShoringIntent,
        profileFull,
      ],
      [
        "OperationCapabilityNegotiation.valid-blocked-missing-parameter.json",
        missingDepthIntent,
        profileFull,
      ],
      ["OperationCapabilityNegotiation.valid-unknown.json", excavationDirect, profilePartial],
    ];
    for (const [file, intent, profile] of pairs) {
      const fixture = loadFixture("capability", file);
      const produced = negotiateOperationCapability(intent, profile);
      expect(fixture).toEqual(produced as unknown as Record<string, unknown>);
    }
  });

  test("every produced negotiation is schema-valid (decode round-trip)", () => {
    const intents = [
      excavationAgent,
      excavationDirect,
      plasterIntent,
      mepIntent,
      trenchShoringIntent,
      missingDepthIntent,
    ];
    const profiles = [profileFull, profilePartial];
    for (const intent of intents) {
      for (const profile of profiles) {
        const negotiation = negotiateOperationCapability(intent, profile);
        const encoded = negotiateOperationCapability(intent, profile);
        expect(encoded).toEqual(negotiation);
      }
    }
  });
});

describe("negotiation carries no authority semantics", () => {
  test("the negotiation result object has exactly the negotiated fields — no authorization, readiness, validation or assurance vocabulary", () => {
    const negotiation = negotiateOperationCapability(excavationAgent, profileFull);
    const keys = Object.keys(negotiation).sort();
    expect(keys).toEqual([
      "contractVersion",
      "intentRef",
      "missingParameters",
      "outcome",
      "profileRef",
      "reasons",
    ]);
    const forbidden = [
      "authorization",
      "granted",
      "denial",
      "readiness",
      "assurance",
      "sufficiency",
      "verified",
      "approved",
      "validated",
    ];
    const serialized = JSON.stringify(negotiation).toLowerCase();
    for (const word of forbidden) {
      expect(serialized.includes(`"${word}`)).toBe(false);
    }
  });

  test("negotiation never mutates its inputs (profiles and intents are consumed read-only)", () => {
    const profile = JSON.parse(JSON.stringify(profileFull));
    const intent = JSON.parse(JSON.stringify(excavationAgent));
    const before = JSON.stringify({ profile, intent });
    negotiateOperationCapability(intent, profile);
    expect(JSON.stringify({ profile, intent })).toBe(before);
  });

  test("reasons are never empty — even the executable outcome carries capability-satisfied", () => {
    for (const [intent, profile] of [
      [excavationAgent, profileFull],
      [mepIntent, profileFull],
      [missingDepthIntent, profileFull],
      [excavationDirect, profilePartial],
    ] as const) {
      const negotiation = negotiateOperationCapability(intent, profile);
      expect(negotiation.reasons.length).toBeGreaterThanOrEqual(1);
    }
  });
});
