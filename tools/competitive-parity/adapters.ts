/**
 * PROD-018 — the three adapters' COMMITTED conformance artifacts.
 *
 * The equivalence harness composes the adapter wave's committed evidence
 * (PROD-017 browser, PROD-019 mobile, PROD-020 desktop — the packet's
 * §2 item 9: "your equivalence checks compose THESE results"):
 *
 *  - the committed REFERENCE PROFILES of the three platforms (the
 *    PROD-016 corpus fixtures the adapters' declarations derive from);
 *  - the committed NEGOTIATION FIXTURES (each adapter's platform-honest
 *    verdict over a committed requirement set, reproduced EXACTLY by the
 *    adapter's own committed conformance runs);
 *  - each adapter's committed CONFORMANCE REPORT (the evidence document)
 *    — parsed for the C0–C9 results and the negotiation-honesty claims.
 *
 * NOTHING here imports adapter code: the boundary matrix forbids
 * tools → apps imports, and the harness consumes committed artifacts,
 * not implementations. The parsers are tolerant markdown row readers
 * over the reports' own committed tables; a missing claim fails loudly.
 */

import { loadFixtureCorpus, readEvidenceDoc, type FixtureRecord } from "./corpus";

/* ------------------------------------------------------------------ */
/* The three adapters                                                   */
/* ------------------------------------------------------------------ */

/** The platforms of the adapter wave. */
export type AdapterPlatform = "browser" | "mobile" | "desktop";

/** One adapter's committed artifacts (all read as data). */
export interface AdapterArtifacts {
  readonly platform: AdapterPlatform;
  /** The binding id the adapter's committed conformance run used. */
  readonly adapterId: string;
  /** The evidence document the conformance results are parsed from. */
  readonly evidenceDoc: string;
  /** The committed reference profile fixture (family-relative). */
  readonly profileFixture: string;
  /** The adapter's committed negotiation fixture(s) (family-relative). */
  readonly negotiationFixtures: readonly string[];
  /** The C0–C9 results parsed from the evidence document. */
  readonly checks: Readonly<Record<string, boolean>>;
  /**
   * The negotiation-honesty claims parsed from the evidence document:
   * requirement-set id → the platform-honest outcome the adapter
   * committed (parsed verbatim from the report's own tables).
   */
  readonly negotiationClaims: Readonly<Record<string, string>>;
}

/* ------------------------------------------------------------------ */
/* The evidence-report parsers (tolerant markdown row readers)         */
/* ------------------------------------------------------------------ */

/** Split one markdown table row into trimmed cells (without pipes). */
function cells(line: string): readonly string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/**
 * Parse the C0–C9 rows of an evidence report: every line whose first
 * table cell is a `C<digit>` id; the check passes iff some cell of the
 * row is `PASS` (with or without bold markers). All ten ids must appear
 * exactly once — a missing or duplicated check row fails loudly.
 */
function parseConformanceChecks(text: string, evidenceDoc: string): Readonly<Record<string, boolean>> {
  const checks: Record<string, boolean> = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const row = cells(line);
    const first = row[0] ?? "";
    const match = /^C([0-9])(?:\s|$)/.exec(first.replace(/\*\*/g, ""));
    if (match === null) {
      continue;
    }
    const id = `C${match[1]}`;
    if (id in checks) {
      throw new Error(`${evidenceDoc}: check row ${id} appears twice`);
    }
    const pass = row.some((cell) => cell === "PASS" || cell === "**PASS**");
    if (!pass && !row.some((cell) => cell === "FAIL" || cell === "**FAIL**")) {
      throw new Error(`${evidenceDoc}: check row ${id} states neither PASS nor FAIL`);
    }
    checks[id] = pass;
  }
  for (let index = 0; index <= 9; index += 1) {
    const id = `C${index}`;
    if (!(id in checks)) {
      throw new Error(`${evidenceDoc}: check row ${id} is missing`);
    }
  }
  return checks;
}

/**
 * Parse the browser report's negotiation table rows: `| <requirement-set>
 * | **<outcome>** | … |` → requirement-set id → outcome.
 */
function parseBrowserNegotiationClaims(text: string): Record<string, string> {
  const claims: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const row = cells(line);
    const requirementSet = row[0] ?? "";
    const outcomeCell = row[1] ?? "";
    const outcome = /^\*\*(permitted|degraded|unknown|blocked)\*\*$/.exec(outcomeCell);
    if (outcome !== null) {
      claims[requirementSet] = outcome[1]!;
    }
  }
  return claims;
}

/**
 * Parse the mobile report's fixture-reproduction table: rows naming a
 * committed `CapabilityNegotiation.valid-*.json` fixture reproduced
 * `EXACT` — the claim is recorded per fixture file.
 */
function parseMobileNegotiationClaims(text: string): Record<string, string> {
  const claims: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /`(CapabilityNegotiation\.valid-[a-z0-9-]+\.json)`/.exec(line);
    if (match === null) {
      continue;
    }
    if (/\bEXACT\b/.test(line)) {
      claims[match[1]!] = "EXACT";
    }
  }
  return claims;
}

/**
 * Parse the desktop report's negotiation-honesty paragraph claims:
 * `**<task> → <outcome>**` pairs.
 */
function parseDesktopNegotiationClaims(text: string): Record<string, string> {
  const claims: Record<string, string> = {};
  for (const match of text.matchAll(/\*\*([A-Za-z0-9 -]+?) → (permitted|degraded|unknown|blocked)\*\*/g)) {
    claims[match[1]!.toLowerCase()] = match[2]!;
  }
  return claims;
}

/* ------------------------------------------------------------------ */
/* The committed artifact assembly                                      */
/* ------------------------------------------------------------------ */

/** Require a fixture to exist in the committed corpus (fail loudly). */
function requireFixture(corpus: readonly FixtureRecord[], fileName: string): FixtureRecord {
  const record = corpus.find((entry) => entry.fileName === fileName);
  if (record === undefined) {
    throw new Error(`the committed corpus carries no fixture ${fileName}`);
  }
  return record;
}

/** The three adapters' committed artifacts (deterministic reads). */
export function loadAdapterArtifacts(): readonly AdapterArtifacts[] {
  const corpus = loadFixtureCorpus();
  const browserDoc = readEvidenceDoc(
    "docs/productization-evidence/PROD-017/conformance-report.md",
  );
  const mobileDoc = readEvidenceDoc(
    "docs/productization-evidence/PROD-019/conformance-report.md",
  );
  const desktopDoc = readEvidenceDoc(
    "docs/productization-evidence/PROD-020/conformance-report.md",
  );

  const browser: AdapterArtifacts = {
    platform: "browser",
    adapterId: "browser-web-adapter",
    evidenceDoc: "docs/productization-evidence/PROD-017/conformance-report.md",
    profileFixture: "capability/ClientCapabilityProfile.valid-browser.json",
    negotiationFixtures: [
      "capability/CapabilityNegotiation.valid-browser-field-depth-capture.json",
    ],
    checks: parseConformanceChecks(
      browserDoc,
      "docs/productization-evidence/PROD-017/conformance-report.md",
    ),
    negotiationClaims: parseBrowserNegotiationClaims(browserDoc),
  };
  const mobile: AdapterArtifacts = {
    platform: "mobile",
    adapterId: "android-mobile-field",
    evidenceDoc: "docs/productization-evidence/PROD-019/conformance-report.md",
    profileFixture: "capability/ClientCapabilityProfile.valid-mobile-field.json",
    negotiationFixtures: [
      "capability/CapabilityNegotiation.valid-mobile-field-field-depth-capture.json",
      "capability/CapabilityNegotiation.valid-mobile-field-boq-review.json",
    ],
    checks: parseConformanceChecks(
      mobileDoc,
      "docs/productization-evidence/PROD-019/conformance-report.md",
    ),
    negotiationClaims: parseMobileNegotiationClaims(mobileDoc),
  };
  const desktop: AdapterArtifacts = {
    platform: "desktop",
    adapterId: "desktop-rich-shell-adapter",
    evidenceDoc: "docs/productization-evidence/PROD-020/conformance-report.md",
    profileFixture: "capability/ClientCapabilityProfile.valid-desktop-rich-shell.json",
    negotiationFixtures: [
      "capability/CapabilityNegotiation.valid-desktop-rich-shell-offline-field-queue.json",
    ],
    checks: parseConformanceChecks(
      desktopDoc,
      "docs/productization-evidence/PROD-020/conformance-report.md",
    ),
    negotiationClaims: parseDesktopNegotiationClaims(desktopDoc),
  };

  // The named fixtures must exist in the committed corpus (fail loudly).
  for (const adapter of [browser, mobile, desktop]) {
    requireFixture(corpus, adapter.profileFixture);
    for (const fixture of adapter.negotiationFixtures) {
      requireFixture(corpus, fixture);
    }
  }
  return [browser, mobile, desktop];
}
