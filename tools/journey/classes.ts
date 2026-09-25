/**
 * PROD-033 — the production journey harness: the evidence classes and the
 * run-record format.
 *
 * EVIDENCE DOCTRINE (binding, mirrors the work order):
 *
 *  - Every journey step record carries PASS/FAIL plus an evidence class
 *    drawn from EXACTLY {deterministic, synthetic, emulated, physical}.
 *    The class names the EVIDENCE SOURCE; a parenthesized qualifier names
 *    the EXECUTION MODE (live Chromium vs deterministic fallback). A class
 *    is NEVER upgraded: a synthetic byte is never recorded as physical,
 *    an emulated transcript is never recorded as a fresh live run.
 *  - A claim without a committed artifact behind it (a test name, a
 *    harness output file, or a committed transcript) is not evidence.
 *  - "It looked right" is not evidence: every PASS line cites its proof.
 *  - The final deployed-SHA proof belongs to the Lead's finalization
 *    (PROD-015); where this harness's evidence sits at a different SHA
 *    than any deployment, the record says so VERBATIM.
 *
 * LIVE-BROWSER HONESTY (binding): the W harness is BUILT for a real
 * headless Chromium (the tools/deployed-check.ts doctrine). Where Chromium
 * is unavailable, the harness still ships complete and the recorded run
 * falls back to the deterministic legs — the record states EXACTLY which
 * legs ran live and which fell back, in the per-step Class column. A live
 * run is never fabricated and console-error counts are never faked.
 *
 * Exit-code law (run.ts): exit 0 iff every step PASSes; any plain FAIL
 * step or any harness crash exits 1 with the failing step named. The one
 * recorded exception is the M journey's emulator row: its status is
 * `FAIL→BLOCKED_NO_KVM` — the honest BLOCKED state exactly as PROD-032
 * recorded it (recorded, never dropped, never upgraded, and NOT a harness
 * failure: the BLOCKED state is the expected honest outcome of the
 * emulator lane on a KVM-less station).
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The repo root (…/AISE). */
export const ROOT = resolve(import.meta.dir, "..", "..");

/** Where committed run records land (committed evidence, never gitignored). */
export const RUNS_DIR = join(
  ROOT,
  "docs",
  "productization-evidence",
  "PROD-033",
  "runs",
);

/** The evidence class vocabulary — EXACTLY these four, never upgraded. */
export type EvidenceClass = "deterministic" | "synthetic" | "emulated" | "physical";

/** A step's verdict. BLOCKED_NO_KVM is the honest recorded BLOCKED state. */
export type StepStatus = "PASS" | "FAIL" | "BLOCKED_NO_KVM";

/** One journey step record: verdict + class + proof lines. */
export interface StepRecord {
  /** The step's stable id, e.g. "w1.evidence". */
  readonly id: string;
  /** The journey leg's name, e.g. "EVIDENCE — the capture surface + the upload round-trip". */
  readonly name: string;
  readonly status: StepStatus;
  /** The evidence class (one of the four; never upgraded). */
  readonly evidenceClass: EvidenceClass;
  /** The execution-mode qualifier, e.g. "live headless Chromium; local production-like serve". */
  readonly classNote: string;
  /** One-line proof excerpts (every PASS cites its proof). */
  readonly lines: readonly string[];
}

/** One named journey (W1 / W2 / M / X …) inside a run. */
export interface JourneySection {
  /** e.g. "w1". */
  readonly id: string;
  /** e.g. "W1 — the golden product journey". */
  readonly title: string;
  /** The Gate F journey text, when this section is one of the two Gate F journeys. */
  readonly flowText?: string;
  readonly steps: StepRecord[];
}

/** One full run record (one file under runs/). */
export interface RunRecord {
  /** e.g. "w" | "m" | "x" | "all". */
  readonly journeyId: string;
  /** The base URL the journey ran against (the local serve or the Lead's --base-url). */
  readonly baseUrl: string;
  /** Where the base came from: the local production-like serve, or an explicit --base-url. */
  readonly baseSource: "local-serve" | "explicit-base-url";
  /** `git rev-parse HEAD` at run time (the record's own SHA honesty law). */
  readonly repoSha: string;
  /** ISO-8601 UTC at run start. */
  readonly startedAt: string;
  /** Whether the run had a live headless Chromium (per-leg detail is in each Class column). */
  readonly chromiumAvailable: boolean;
  readonly sections: JourneySection[];
}

/**
 * The run's overall verdict: every step PASS. The one recorded exception
 * is the honest BLOCKED_NO_KVM state (the M journey's emulator row,
 * exactly as PROD-032 recorded it): recorded, never dropped, never
 * upgraded — and NOT a harness failure, so it does not fail the run.
 */
export function runPasses(record: RunRecord): boolean {
  return record.sections.every((section) =>
    section.steps.every((step) => step.status === "PASS" || step.status === "BLOCKED_NO_KVM"),
  );
}

/** Count per status across a run. */
export function statusCounts(record: RunRecord): {
  pass: number;
  fail: number;
  blocked: number;
} {
  let pass = 0;
  let fail = 0;
  let blocked = 0;
  for (const section of record.sections) {
    for (const step of section.steps) {
      if (step.status === "PASS") {
        pass += 1;
      } else if (step.status === "FAIL") {
        fail += 1;
      } else {
        blocked += 1;
      }
    }
  }
  return { pass, fail, blocked };
}

/** `git rev-parse HEAD` at run time (the honest SHA of THIS run's evidence). */
export function currentRepoSha(): string {
  const proc = Bun.spawnSync({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const sha = proc.stdout?.toString().trim() ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      `journey: git rev-parse HEAD did not answer a 40-hex SHA (got '${sha}') — records never fabricate their SHA`,
    );
  }
  return sha;
}

/** The class column text for one step (class + qualifier), exactly as committed. */
export function classColumn(step: StepRecord): string {
  return `${step.evidenceClass} (${step.classNote})`;
}

/** Render one run record as the committed markdown record. */
export function renderRunRecord(record: RunRecord): string {
  const counts = statusCounts(record);
  const pass = runPasses(record);
  const lines: string[] = [];
  lines.push(`# PROD-033 journey run — ${record.journeyId.toUpperCase()}`);
  lines.push("");
  lines.push(`- recorded at: ${record.startedAt}`);
  lines.push(`- repo SHA at run time: \`${record.repoSha}\` (git rev-parse HEAD)`);
  lines.push(`- base URL: ${record.baseUrl} (${record.baseSource})`);
  lines.push(
    `- chromium: ${record.chromiumAvailable ? "available — the live legs ran in a real headless Chromium" : "UNAVAILABLE — the browser legs fell back to their deterministic proofs (the Class column says so per leg; a live run is never fabricated)"}`,
  );
  lines.push("");
  lines.push(
    "Class discipline: the class is EXACTLY one of {deterministic, synthetic, emulated, physical} and names the EVIDENCE SOURCE; the parenthesized qualifier names the execution mode. Classes are never upgraded.",
  );
  lines.push("");
  for (const section of record.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    if (section.flowText !== undefined) {
      lines.push("```text");
      lines.push(section.flowText);
      lines.push("```");
      lines.push("");
    }
    lines.push("| # | Step | Verdict | Class |");
    lines.push("|---|---|---|---|");
    for (const [index, step] of section.steps.entries()) {
      lines.push(
        `| ${index + 1} | ${step.id} — ${step.name} | ${step.status} | ${classColumn(step)} |`,
      );
    }
    lines.push("");
    for (const step of section.steps) {
      lines.push(`### ${step.id} — ${step.name}`);
      lines.push("");
      lines.push(`- verdict: ${step.status}`);
      lines.push(`- class: ${classColumn(step)}`);
      for (const line of step.lines) {
        lines.push(`  - ${line}`);
      }
      lines.push("");
    }
  }
  lines.push("## Run verdict");
  lines.push("");
  lines.push(
    `- steps: ${counts.pass} PASS / ${counts.fail} FAIL / ${counts.blocked} BLOCKED_NO_KVM (recorded)`,
  );
  if (counts.blocked > 0) {
    lines.push(
      "- the BLOCKED_NO_KVM row is the honest BLOCKED state exactly as PROD-032 recorded it — recorded, never dropped, never upgraded, and not a harness failure",
    );
  }
  lines.push("");
  lines.push(`JOURNEY ${record.journeyId.toUpperCase()}: ${pass ? "PASS" : "FAIL"}`);
  lines.push("");
  return lines.join("\n");
}

/** Append one run record under runs/ (timestamped, committed evidence). */
export function writeRunRecord(record: RunRecord): string {
  mkdirSync(RUNS_DIR, { recursive: true });
  const stamp = record.startedAt.replace(/[:.]/g, "-");
  const file = join(RUNS_DIR, `${record.journeyId}-${stamp}.md`);
  writeFileSync(file, renderRunRecord(record), "utf8");
  return file;
}

/** A bounded sleep (never unbounded — a budget, per the smoke doctrine). */
export function sleep(ms: number): Promise<"slept"> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("slept");
    }, ms);
  });
}

/** Describe an unknown error as a short string for evidence lines. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse JSON defensively (an unparseable body becomes {}). */
export function parseJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Narrow a JSON value to a record. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read a committed JSON fixture as data (cited, never re-derived). */
export function readCommittedJson(relativePath: string): unknown {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) {
    throw new Error(
      `journey: committed fixture '${relativePath}' is missing — never fabricated`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}
