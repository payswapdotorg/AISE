/**
 * PROD-018 — the CROSS-ADAPTER SEMANTIC EQUIVALENCE gate tests.
 *
 * Wired into the root `bun run verify` (this file is a tools/ test — the
 * same pickup as tools/lib/boundaries.test.ts). Three parts:
 *
 *  1. THE EQUIVALENCE — the freshly computed report is EQUIVALENT: every
 *     flow passes, every adapter's committed C0–C9 checks pass, the three
 *     adapters' decodable outputs are semantically equivalent per the
 *     shared contract's canonical-form equality semantics;
 *  2. THE COMMITTED FIXTURE — the freshly computed report equals the
 *     committed `fixtures/equivalence-report.json` BYTE-FOR-BYTE: any
 *     corpus / evidence-doc / harness change without a regeneration
 *     (`bun tools/competitive-parity/report.ts`) fails the gate;
 *  3. DISCRIMINATION — the checks are real, not vacuous: sabotaged
 *     artifacts (a blocked negotiation that permits modes, a satisfied
 *     domain with a reason, a mismatched committed report) each FAIL the
 *     explicit checks; semantically-equal-but-differently-formatted
 *     payloads compare EQUAL (the canonical-form equality semantics —
 *     "canonical forms, not incidental formatting").
 *
 * Determinism: pure computations over committed files; no clock, no
 * randomness, no network.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeEquivalenceReport,
  negotiationInvariantFailures,
  reportCanonicalJson,
} from "./equivalence";
import {
  canonicalJson,
  loadFixtureCorpus,
  type FixtureRecord,
} from "./corpus";
import { loadAdapterArtifacts } from "./adapters";

const REPORT_PATH = resolve(import.meta.dir, "fixtures", "equivalence-report.json");

/* ------------------------------------------------------------------ */
/* 1. The equivalence                                                   */
/* ------------------------------------------------------------------ */

describe("PROD-018 cross-adapter semantic equivalence (the gate)", () => {
  const report = computeEquivalenceReport();

  test("the computed report declares the three adapters EQUIVALENT", () => {
    expect(report.equivalent).toBe(true);
    expect(report.contractVersion).toBe("1.0.0");
    expect(report.canonicalForm).toBe("json-sorted-keys");
  });

  test("every adapter's committed conformance checks pass (C0–C9 × 3 platforms)", () => {
    expect(report.adapters.map((adapter) => adapter.platform)).toEqual([
      "browser",
      "mobile",
      "desktop",
    ]);
    for (const adapter of report.adapters) {
      const ids = Object.keys(adapter.checks).sort();
      expect(ids).toEqual([
        "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9",
      ]);
      for (const id of ids) {
        expect(adapter.checks[id]).toBe(true);
      }
    }
  });

  test("every equivalence flow passes with its composition basis named", () => {
    expect(report.flows.map((flow) => flow.flowId)).toEqual([
      "corpus-substrate",
      "task-intent-roundtrip",
      "presented-fields",
      "honest-states",
      "negotiation-results",
    ]);
    for (const flow of report.flows) {
      expect(flow.passed).toBe(true);
      expect(flow.basis.length).toBeGreaterThan(0);
      expect(flow.detail.length).toBeGreaterThan(0);
    }
  });

  test("the task-intent flow pins the shared fixture's canonical digest", () => {
    const flow = report.flows.find((entry) => entry.flowId === "task-intent-roundtrip")!;
    expect(flow.detail).toContain("sha256:");
    expect(report.corpus.taskIntentDigest).toContain("sha256:");
  });

  test("the adapters' committed artifacts load with the wave's binding ids", () => {
    const adapters = loadAdapterArtifacts();
    expect(adapters.map((adapter) => adapter.adapterId)).toEqual([
      "browser-web-adapter",
      "android-mobile-field",
      "desktop-rich-shell-adapter",
    ]);
    for (const adapter of adapters) {
      expect(adapter.profileFixture).toContain("ClientCapabilityProfile.valid-");
      expect(adapter.negotiationFixtures.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. The committed fixture                                             */
/* ------------------------------------------------------------------ */

describe("PROD-018 the committed equivalence report (the pinned fixture)", () => {
  test("the freshly computed report equals the committed report byte-for-byte", () => {
    const committed = readFileSync(REPORT_PATH, "utf8");
    const computed = reportCanonicalJson(computeEquivalenceReport());
    expect(computed).toBe(committed);
  });

  test("the corpus digest is pinned — a corpus change without regeneration fails", () => {
    const committed = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as ReturnType<
      typeof computeEquivalenceReport
    >;
    const computed = computeEquivalenceReport();
    expect(computed.corpus.digest).toBe(committed.corpus.digest);
    expect(computed.corpus.fixtureCount).toBe(committed.corpus.fixtureCount);
    expect(computed.corpus.scenarioDigests).toEqual(committed.corpus.scenarioDigests);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Discrimination (the checks are real, not vacuous)                 */
/* ------------------------------------------------------------------ */

describe("PROD-018 equivalence discrimination (sabotage fails loudly)", () => {
  const corpus = loadFixtureCorpus();

  function fixtureNamed(fileName: string): FixtureRecord {
    const record = corpus.find((entry) => entry.fileName === fileName);
    if (record === undefined) {
      throw new Error(`no fixture ${fileName}`);
    }
    return record;
  }

  /** A deep-copied fixture (sabotage applies to the copy, never the file). */
  function copyOf(fixture: FixtureRecord): FixtureRecord {
    return {
      ...fixture,
      payload: JSON.parse(JSON.stringify(fixture.payload)) as unknown,
    };
  }

  test("a BLOCKED negotiation that permits interaction modes FAILS the invariant", () => {
    const sabotaged = copyOf(
      fixtureNamed("capability/CapabilityNegotiation.valid-browser-field-depth-capture.json"),
    );
    (sabotaged.payload as Record<string, unknown>).permittedInteractionModes = ["menu-navigation"];
    const failures = negotiationInvariantFailures(sabotaged);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("a blocked negotiation permits interaction modes");
  });

  test("a SATISFIED domain that carries a reason FAILS the reason-null discipline", () => {
    const sabotaged = copyOf(
      fixtureNamed("capability/CapabilityNegotiation.valid-mobile-field-field-depth-capture.json"),
    );
    const payload = sabotaged.payload as Record<string, unknown>;
    const domains = payload.domainOutcomes as Record<string, unknown>[];
    domains[0]!.reason = "an invented reason on a satisfied domain";
    const failures = negotiationInvariantFailures(sabotaged);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("is satisfied but carries a reason");
  });

  test("an UNSATISFIED domain without a reason FAILS the honest-reason discipline", () => {
    const sabotaged = copyOf(
      fixtureNamed("capability/CapabilityNegotiation.valid-browser-field-depth-capture.json"),
    );
    const payload = sabotaged.payload as Record<string, unknown>;
    const domains = payload.domainOutcomes as Record<string, unknown>[];
    domains[0]!.reason = null;
    const failures = negotiationInvariantFailures(sabotaged);
    expect(failures.some((entry) => entry.includes("without an honest reason"))).toBe(true);
  });

  test("a PERMITTED negotiation with an unsatisfied domain FAILS", () => {
    const sabotaged = copyOf(
      fixtureNamed("capability/CapabilityNegotiation.valid-mobile-field-field-depth-capture.json"),
    );
    const payload = sabotaged.payload as Record<string, unknown>;
    const domains = payload.domainOutcomes as Record<string, unknown>[];
    domains[0]!.outcome = "unsupported";
    domains[0]!.reason = "sabotaged shortfall";
    const failures = negotiationInvariantFailures(sabotaged);
    expect(failures.some((entry) => entry.includes("permitted negotiation has an unsatisfied domain"))).toBe(true);
  });

  test("an out-of-vocabulary outcome FAILS (the enums are read from the committed schema)", () => {
    const sabotaged = copyOf(
      fixtureNamed("capability/CapabilityNegotiation.valid-mobile-field-boq-review.json"),
    );
    (sabotaged.payload as Record<string, unknown>).outcome = "super-permitted";
    const failures = negotiationInvariantFailures(sabotaged);
    expect(failures.some((entry) => entry.includes("outcome is not in the committed vocabulary"))).toBe(
      true,
    );
  });

  test("a mismatched committed report FAILS the fixture comparison (drift is loud)", () => {
    const committed = readFileSync(REPORT_PATH, "utf8");
    const drifted = committed.replace('"equivalent":true', '"equivalent":false');
    expect(drifted === committed).toBe(false);
    expect(reportCanonicalJson(computeEquivalenceReport()) === drifted).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The canonical-form equality semantics                                */
/* ------------------------------------------------------------------ */

describe("PROD-018 canonical-form equality (the contract's semantics)", () => {
  test("semantically equal payloads with different formatting compare EQUAL", () => {
    const fixture = loadFixtureCorpus().find(
      (entry) => entry.fileName === "context/TaskIntent.valid.json",
    )!;
    // A re-serialized rendering (different whitespace) of the same value.
    const roundTripped = JSON.parse(
      JSON.stringify(fixture.payload, null, 4),
    ) as unknown;
    expect(canonicalJson(roundTripped)).toBe(canonicalJson(fixture.payload));
    // A top-level key reordering of the same value (formatting, not semantics).
    const payload = fixture.payload as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(payload).sort().reverse()) {
      reordered[key] = payload[key];
    }
    expect(canonicalJson(reordered)).toBe(canonicalJson(fixture.payload));
  });

  test("semantically different payloads compare UNEQUAL", () => {
    const fixture = loadFixtureCorpus().find(
      (entry) => entry.fileName === "context/TaskIntent.valid.json",
    )!;
    const mutated = JSON.parse(JSON.stringify(fixture.payload)) as Record<string, unknown>;
    mutated.intent = "a different statement";
    expect(canonicalJson(mutated) === canonicalJson(fixture.payload)).toBe(false);
  });

  test("the canonical form is deterministic across repeated computation", () => {
    const corpus = loadFixtureCorpus();
    const once = corpus.map((fixture) => canonicalJson(fixture.payload)).join("\n");
    const twice = loadFixtureCorpus().map((fixture) => canonicalJson(fixture.payload)).join("\n");
    expect(once).toBe(twice);
  });
});
