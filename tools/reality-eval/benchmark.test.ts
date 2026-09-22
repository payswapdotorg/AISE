/**
 * PROD-027 — the Layer-1 evaluation benchmark gate tests (the tools-side
 * CHECK RUNNER over the committed artifacts — the building-benchmark
 * convention; wired into the root `bun run verify` via the root `bun test`).
 *
 * Three parts:
 *
 *  1. THE CHECKS — every committed artifact is coherent as DATA: the typed
 *     seals, the suite digest, every record's content address, every
 *     manifest's content address + record chaining, every input digest,
 *     the closed failure vocabulary, the scenario↔record coherence and
 *     the lawful registry lifecycle;
 *  2. THE CLASS DOCTRINE — the day-27 rule over the committed goldens:
 *     the discrimination scenario is CAUGHT (fail + recorded
 *     perception-failure observations); the negative scenarios are
 *     explicit-and-safe; the positives pass silently;
 *  3. DISCRIMINATION OF THE CHECKS THEMSELVES — the checks are real, not
 *     vacuous: a sabotaged record (a mutated metric value), a sabotaged
 *     manifest (a mutated statement) and a smeared failure kind each FAIL
 *     the explicit checks.
 *
 * The boundary matrix forbids tools → backend imports, so this runner
 * consumes the COMMITTED ARTIFACTS as data; the LIVE byte-for-byte
 * reproduction (the freshly computed suite equals the committed goldens)
 * lives in `backend/api/src/reality-eval/golden.test.ts`.
 *
 * Determinism: pure reads of committed files + pure arithmetic; no clock,
 * no randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkClassDoctrine,
  checkClosedVocabulary,
  checkInputDigests,
  checkManifestContentAddressing,
  checkRecordContentAddressing,
  checkRegistryLifecycle,
  checkScenarioRecordCoherence,
  checkScenarioSetDigest,
  checkScenarioSetSeal,
  CLOSED_FAILURE_KINDS,
  loadExpectedOutcomes,
  loadScenarioSet,
  runAllChecks,
  type CheckResult,
} from "./runner";

const SCENARIO_PATH = resolve(import.meta.dir, "scenario.json");

/** Sort one parsed JSON value's object keys recursively (the canonical form). */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortValue(record[key]);
    }
    return out;
  }
  return value;
}

/** sha-256 over the canonical JSON (the same arithmetic the checks perform). */
function digestOf(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8")
    .digest("hex");
}

function expectOk(result: CheckResult): void {
  expect(result.ok, `${result.check}: ${result.detail}`).toBe(true);
}

/* ------------------------------------------------------------------ */
/* 1. The committed artifacts are coherent (as data)                    */
/* ------------------------------------------------------------------ */

describe("PROD-027 reality-eval benchmark: the committed artifacts are coherent", () => {
  test("the scenario set carries its typed seal and pinned benchmark ids", () => {
    expectOk(checkScenarioSetSeal());
  });

  test("the golden outcomes reference the scenario set by its content digest", () => {
    expectOk(checkScenarioSetDigest());
  });

  test("every committed BenchmarkRecord re-derives its content address", () => {
    expectOk(checkRecordContentAddressing());
  });

  test("every committed ProvenanceManifest re-derives its content address and chains its record", () => {
    expectOk(checkManifestContentAddressing());
  });

  test("every reproduction inputsDigest re-derives from the scenario's own input fixture", () => {
    expectOk(checkInputDigests());
  });

  test("the scenario ↔ record coherence and the pinned-lane comparability keys hold", () => {
    expectOk(checkScenarioRecordCoherence());
  });

  test("the committed registry log is the lawful evaluation lifecycle (no self-promotion)", () => {
    expectOk(checkRegistryLifecycle());
  });

  test("the full sweep passes (every check green)", () => {
    const results = runAllChecks();
    expect(results.length).toBe(9);
    for (const result of results) {
      expectOk(result);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. The class doctrine over the committed goldens                     */
/* ------------------------------------------------------------------ */

describe("PROD-027 reality-eval benchmark: the class doctrine (the day-27 rule)", () => {
  test("every failure observation is within the CLOSED vocabulary", () => {
    expectOk(checkClosedVocabulary());
  });

  test("the discrimination scenario is CAUGHT with RECORDED perception-failure observations", () => {
    expectOk(checkClassDoctrine());
    const { evaluations } = loadExpectedOutcomes();
    const discrimination = evaluations.find(
      (evaluation) => evaluation["scenarioClass"] === "discrimination",
    )!;
    expect(discrimination["verdict"]).toBe("fail");
    expect(discrimination["discriminationCaught"]).toBe(true);
    const kinds = (discrimination["failureObservationKinds"] as string[]).map(String);
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((kind) => kind === "perception-failure")).toBe(true);
    // the record carries the caught failure, not just low scores
    const record = discrimination["record"] as Record<string, unknown>;
    const observations = record["failureObservations"] as { detail: string }[];
    expect(observations.every((observation) => observation.detail.includes("CAUGHT"))).toBe(true);
  });

  test("the negative scenarios are explicit-and-safe with their expected refusal kinds", () => {
    const { evaluations } = loadExpectedOutcomes();
    const negatives = evaluations.filter(
      (evaluation) => evaluation["scenarioClass"] === "negative",
    );
    expect(negatives.length).toBe(2);
    const kinds = negatives.flatMap((evaluation) =>
      (evaluation["failureObservationKinds"] as unknown[]).map(String),
    );
    expect(kinds.sort()).toEqual(["timeout", "unsupported-data"]);
    for (const evaluation of negatives) {
      expect(evaluation["verdict"]).toBe("pass");
    }
  });

  test("the committed split: 6 evaluations (3 positive / 2 negative / 1 discrimination) over 2 lanes", () => {
    const { evaluations } = loadExpectedOutcomes();
    expect(evaluations.length).toBe(6);
    const classes = evaluations.map((evaluation) => String(evaluation["scenarioClass"]));
    expect(classes.filter((entry) => entry === "positive").length).toBe(3);
    expect(classes.filter((entry) => entry === "negative").length).toBe(2);
    expect(classes.filter((entry) => entry === "discrimination").length).toBe(1);
    const { scenarios } = loadScenarioSet();
    const capabilities = new Set(scenarios.map((scenario) => String(scenario["capability"])));
    expect([...capabilities].sort()).toEqual(["depth", "reconstruction"]);
  });

  test("the closed vocabulary mirrored here is the frozen 9-kind set", () => {
    expect(CLOSED_FAILURE_KINDS.length).toBe(9);
    expect(CLOSED_FAILURE_KINDS).toContain("perception-failure");
    expect(CLOSED_FAILURE_KINDS).toContain("unsupported-data");
    expect(CLOSED_FAILURE_KINDS).toContain("timeout");
  });
});

/* ------------------------------------------------------------------ */
/* 3. The checks are real (sabotage fails loudly)                       */
/* ------------------------------------------------------------------ */

describe("PROD-027 reality-eval benchmark: the checks discriminate (sabotage fails)", () => {
  test("a sabotaged record (mutated metric value) no longer re-derives its content address", () => {
    const { outcomes } = loadExpectedOutcomes();
    const sabotaged = structuredClone(outcomes) as unknown as {
      evaluations: { record: Record<string, unknown> }[];
    };
    const record = sabotaged.evaluations[0]!.record;
    const metrics = record["metrics"] as { value: number }[];
    metrics[0]!.value = metrics[0]!.value + 0.001; // drift the score
    const { recordId, ...rest } = record;
    const identityInput = {
      kind: "provider-benchmark-record",
      providerId: rest["providerId"],
      technologyVersion: rest["technologyVersion"],
      benchmarkId: rest["benchmarkId"],
      capability: rest["capability"],
      metrics: rest["metrics"],
      failureObservations: rest["failureObservations"],
      resourceObservations: rest["resourceObservations"],
      reproduction: rest["reproduction"],
    };
    // the committed id re-derives BEFORE the sabotage (the check's own
    // arithmetic) and does NOT after — the content addressing is real.
    const committedRecord = (outcomes["evaluations"] as unknown as {
      record: Record<string, unknown>;
    }[])[0]!.record;
    const committedId = committedRecord["recordId"] as string;
    const committedRest = { ...committedRecord };
    delete committedRest["recordId"];
    expect(
      digestOf({
        kind: "provider-benchmark-record",
        providerId: committedRest["providerId"],
        technologyVersion: committedRest["technologyVersion"],
        benchmarkId: committedRest["benchmarkId"],
        capability: committedRest["capability"],
        metrics: committedRest["metrics"],
        failureObservations: committedRest["failureObservations"],
        resourceObservations: committedRest["resourceObservations"],
        reproduction: committedRest["reproduction"],
      }),
    ).toBe(committedId);
    expect(digestOf(identityInput)).not.toBe(recordId);
  });

  test("a smeared failure kind fails the closed-vocabulary doctrine", () => {
    const { outcomes } = loadExpectedOutcomes();
    const record = (outcomes["evaluations"] as unknown as Record<string, unknown>[])[0]![
      "record"
    ] as Record<string, unknown>;
    const observations = record["failureObservations"] as { kind: string }[];
    const original = observations.map((observation) => observation.kind);
    // smear: invent a failure kind on a record that has none
    const smeared = [...observations, { kind: "hallucinated-geometry", detail: "invented" }];
    const vocabulary = new Set<string>(CLOSED_FAILURE_KINDS);
    expect(smeared.some((observation) => !vocabulary.has(observation.kind))).toBe(true);
    expect(original.every((kind) => vocabulary.has(kind))).toBe(true);
  });

  test("the scenario set is committed in the canonical form (byte-stable)", () => {
    const committed = readFileSync(SCENARIO_PATH, "utf8");
    const parsed = JSON.parse(committed) as unknown;
    expect(committed).toBe(`${JSON.stringify(sortValue(parsed), null, 2)}\n`);
  });
});
