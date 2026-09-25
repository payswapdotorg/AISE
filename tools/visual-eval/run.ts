/**
 * HFX-303 — the VISUAL-EVAL RUNNER (the swap / non-interference /
 * fallback drill CLI; the tools/solution-eval + tools/equivalence-eval
 * runner convention).
 *
 * STANDALONE: never wired into `bun run verify` — this drill is run on
 * demand (`bun tools/visual-eval/run.ts <drill>`) and its records are
 * COMMITTED under docs/productization-evidence/HFX-303/runs/.
 *
 * BOUNDARY NOTE (why the spawn): the workspace boundary matrix forbids
 * tools → packages imports and tools/ cannot resolve bare `@aise/*`
 * specifiers, so this runner ORCHESTRATES and reaches the lane through
 * the lane-side JSON worker (`packages/visual-render/src/lane.ts`,
 * executed with bun in the package's own resolution context — the
 * boundary-clean transport). ALL verdict logic, comparison points,
 * record assembly and file writing live HERE, in the tools zone; the
 * worker only emits raw drill materials (bytes, artifacts, outcomes).
 *
 * DRILLS:
 *   --list        the corpus inventory (no record written)
 *   swap          the provider SWAP trace: render every corpus case
 *                 through the reference THEN the alternate provider;
 *                 record both artifacts + provenance; prove by
 *                 byte-comparison that the canonical Solution Graph
 *                 state, version and deterministic projections are
 *                 IDENTICAL before and after both renders, while the
 *                 presentation (artifact) CHANGED — provider replacement
 *                 is presentation-only.
 *   noninterfere  SEMANTIC NON-INTERFERENCE: render every corpus case
 *                 through EVERY provider, then re-derive the state's
 *                 quantities + the version's validation verdict through
 *                 the canonical engine's public surface and compare to
 *                 the no-visual baseline — EXACT equality, zero
 *                 tolerance (ANY numeric delta is a FAIL). Includes the
 *                 sabotage twin: a rogue numeric mutation is (a) refused
 *                 fail-closed through the governed lane and (b) DETECTED
 *                 by the byte-comparison when the lane is bypassed.
 *   fallback      the FALLBACK drill: force the failing provider and the
 *                 missing-provider case; prove the fallback path returns
 *                 the canonical projections (bound by digest) + the
 *                 typed failure note — never a gap, never a silent
 *                 omission.
 *   all           every drill above (records written for each).
 *
 * Exit 0 = every record PASS; exit 1 = any FAIL (the failing record
 * named). Records are canonical JSON (deterministic: repoSha + commit
 * timestamp + verdicts + digests — the same tree re-runs byte-identical).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const LANE_ENTRY = resolve(ROOT, "packages", "visual-render", "src", "lane.ts");
const RUNS_DIR = resolve(
  ROOT,
  "docs",
  "productization-evidence",
  "HFX-303",
  "runs",
);

/* ------------------------------------------------------------------ */
/* Canonical form + digests (the tools/ convention: local helpers)      */
/* ------------------------------------------------------------------ */

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

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Repo identity (deterministic per commit: SHA + commit timestamp)     */
/* ------------------------------------------------------------------ */

function gitOutput(args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0 || result.stdout === null) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr)}`);
  }
  return result.stdout.trim();
}

function repoIdentity(): { readonly repoSha: string; readonly committedAt: string } {
  return {
    repoSha: gitOutput(["rev-parse", "HEAD"]),
    committedAt: gitOutput(["log", "-1", "--format=%cI"]),
  };
}

/* ------------------------------------------------------------------ */
/* The lane worker transport                                            */
/* ------------------------------------------------------------------ */

interface LaneFailure {
  readonly kind: string;
  readonly detail: string;
}

interface LaneArtifact {
  readonly artifactId: string;
  readonly visualClass: string;
  readonly content: { readonly svg: string };
  readonly provenance: {
    readonly solutionId: string;
    readonly versionRef: string;
    readonly stateId: string;
    readonly stateIndex: number;
    readonly appliedOperationIds: readonly string[];
    readonly stateContentDigest?: string;
    readonly provider: {
      readonly providerId: string;
      readonly technologyVersion: string;
      readonly descriptorDigest: string;
    };
  };
  readonly labels: readonly {
    readonly regionId: string;
    readonly regionKind: string;
    readonly label: string;
    readonly basis: string;
  }[];
  readonly canonicalComparison: {
    readonly canonicalShapeCount: number;
    readonly renderedCanonicalShapeCount: number;
    readonly excessRegionCount: number;
  };
}

type LaneOutcome =
  | { readonly ok: true; readonly artifact: LaneArtifact }
  | { readonly ok: false; readonly failure: LaneFailure };

function callLane(command: string, caseId?: string): Record<string, unknown> {
  const args = [LANE_ENTRY, command, ...(caseId === undefined ? [] : ["--case", caseId])];
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.stdout === null) {
    throw new Error(
      `the lane worker failed (${command}${caseId === undefined ? "" : ` --case ${caseId}`}): ` +
        `${String(result.stderr)}\n${String(result.stdout)}`,
    );
  }
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Comparison points (the solution-eval record shape, mirrored)         */
/* ------------------------------------------------------------------ */

const SWAP_POINT_KINDS = [
  "canonical-state-bytes",
  "canonical-version-bytes",
  "canonical-projection-bytes",
  "presentation-bytes",
] as const;

const NONINTERFERENCE_POINT_KINDS = [
  "canonical-state-bytes",
  "canonical-version-bytes",
  "quantity-value",
  "validation-verdict",
  "canonical-projection-bytes",
] as const;

interface ComparisonPoint {
  readonly pointKind: string;
  readonly subjectId: string;
  readonly baselineValue: string;
  readonly substitutedValue: string;
  readonly equal: boolean;
  readonly detail: string;
}

function point(
  pointKind: string,
  subjectId: string,
  baseline: string,
  substituted: string,
  detail: string,
): ComparisonPoint {
  return {
    pointKind,
    subjectId,
    baselineValue: baseline,
    substitutedValue: substituted,
    equal: baseline === substituted,
    detail,
  };
}

/* ------------------------------------------------------------------ */
/* The corpus inventory                                                 */
/* ------------------------------------------------------------------ */

interface CorpusInventoryCase {
  readonly caseId: string;
  readonly description: string;
  readonly visualClass: string;
  readonly stateIdentity: Record<string, unknown>;
  readonly canonicalShapeCount: number;
  readonly canonicalOmissionCount: number;
  readonly canonicalProjectionDigests: { readonly plan: string; readonly axonometric: string };
  readonly stateContentDigest: string | undefined;
}

function corpusCases(): readonly CorpusInventoryCase[] {
  const inventory = callLane("corpus");
  return inventory["cases"] as CorpusInventoryCase[];
}

/* ------------------------------------------------------------------ */
/* The SWAP drill                                                       */
/* ------------------------------------------------------------------ */

interface SwapCaseRecord {
  readonly caseId: string;
  readonly stateIdentity: Record<string, unknown>;
  readonly reference: LaneArtifact;
  readonly alternate: LaneArtifact;
  readonly comparisonPoints: readonly ComparisonPoint[];
  readonly verdict: "substitution-proven" | "failed";
  readonly failureDetail?: string;
}

function runSwapCase(caseId: string): SwapCaseRecord {
  const material = callLane("swap", caseId) as unknown as {
    stateIdentity: Record<string, unknown>;
    before: { stateBytes: string; versionBytes: string; projections: { plan: string; axonometric: string } };
    after: { stateBytes: string; versionBytes: string; projections: { plan: string; axonometric: string } };
    reference: LaneOutcome;
    alternate: LaneOutcome;
  };

  const failures: string[] = [];
  if (!material.reference.ok) {
    failures.push(`the reference provider refused: ${material.reference.failure.kind}`);
  }
  if (!material.alternate.ok) {
    failures.push(`the alternate provider refused: ${material.alternate.failure.kind}`);
  }
  if (material.reference.ok && material.alternate.ok) {
    if (material.reference.artifact.artifactId === material.alternate.artifact.artifactId) {
      failures.push("the two providers produced the SAME artifact — the swap proves nothing");
    }
    if (
      material.reference.artifact.provenance.stateId !==
        material.alternate.artifact.provenance.stateId ||
      JSON.stringify(material.reference.artifact.provenance.appliedOperationIds) !==
        JSON.stringify(material.alternate.artifact.provenance.appliedOperationIds)
    ) {
      failures.push("the two artifacts do not bind the SAME state revision");
    }
  }

  const points: ComparisonPoint[] = [
    point(
      "canonical-state-bytes",
      caseId,
      sha256Hex(material.before.stateBytes),
      sha256Hex(material.after.stateBytes),
      "the serialized Solution Graph STATE must be byte-identical before and after both renders",
    ),
    point(
      "canonical-version-bytes",
      caseId,
      sha256Hex(material.before.versionBytes),
      sha256Hex(material.after.versionBytes),
      "the serialized SOLUTION VERSION must be byte-identical before and after both renders",
    ),
    point(
      "canonical-projection-bytes",
      `${caseId}#plan`,
      sha256Hex(material.before.projections.plan),
      sha256Hex(material.after.projections.plan),
      "the canonical deterministic PLAN projection must be identical — swap changed presentation only",
    ),
    point(
      "canonical-projection-bytes",
      `${caseId}#axonometric`,
      sha256Hex(material.before.projections.axonometric),
      sha256Hex(material.after.projections.axonometric),
      "the canonical deterministic AXONOMETRIC projection must be identical — swap changed presentation only",
    ),
  ];
  if (material.reference.ok && material.alternate.ok) {
    points.push(
      point(
        "presentation-bytes",
        caseId,
        sha256Hex(material.reference.artifact.content.svg),
        sha256Hex(material.alternate.artifact.content.svg),
        "the two providers' RENDERINGS must DIFFER — provider replacement changed the presentation",
      ),
    );
    if (points[points.length - 1]?.equal) {
      failures.push("the presentation comparison found identical SVG — the swap proves nothing");
    }
  }

  const structuralFailures = points
    .filter((entry) => entry.pointKind !== "presentation-bytes" && !entry.equal)
    .map((entry) => `${entry.pointKind} (${entry.subjectId}) diverged`);

  const verdict: SwapCaseRecord["verdict"] =
    failures.length === 0 && structuralFailures.length === 0
      ? "substitution-proven"
      : "failed";

  return {
    caseId,
    stateIdentity: material.stateIdentity,
    reference: material.reference.ok ? material.reference.artifact : ({} as LaneArtifact),
    alternate: material.alternate.ok ? material.alternate.artifact : ({} as LaneArtifact),
    comparisonPoints: points,
    verdict,
    ...(verdict === "failed"
      ? {
          failureDetail: [...failures, ...structuralFailures].join("; "),
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* The NON-INTERFERENCE drill (+ the sabotage twin)                     */
/* ------------------------------------------------------------------ */

interface NoninterferenceCaseRecord {
  readonly caseId: string;
  readonly stateIdentity: Record<string, unknown>;
  readonly renders: readonly {
    readonly providerKey: string;
    readonly providerId: string;
    readonly ok: boolean;
    readonly artifactId?: string;
    readonly failureKind?: string;
  }[];
  readonly comparisonPoints: readonly ComparisonPoint[];
  readonly verdict: "noninterference-proven" | "failed";
  readonly failureDetail?: string;
}

interface SabotageCaseRecord {
  readonly caseId: string;
  readonly laneDefended: {
    readonly refusedWithKind: string;
    readonly canonicalProjectionsUnchanged: boolean;
    readonly verdict: "defended" | "failed";
  };
  readonly directMutation: {
    readonly detected: boolean;
    readonly verdict: "detected" | "missed";
  };
  readonly verdict: "sabotage-caught" | "failed";
}

function runNoninterferenceCase(caseId: string): NoninterferenceCaseRecord {
  const material = callLane("noninterfere", caseId) as unknown as {
    stateIdentity: Record<string, unknown>;
    baseline: { stateBytes: string; versionBytes: string; quantitiesBytes: string; validationBytes: string; projections: { plan: string; axonometric: string } };
    post: { stateBytes: string; versionBytes: string; quantitiesBytes: string; validationBytes: string; projections: { plan: string; axonometric: string } };
    renders: readonly {
      providerKey: string;
      providerId: string;
      outcome: LaneOutcome;
    }[];
  };

  const points: ComparisonPoint[] = [
    point(
      "canonical-state-bytes",
      caseId,
      sha256Hex(material.baseline.stateBytes),
      sha256Hex(material.post.stateBytes),
      "the serialized Solution Graph state must be byte-identical after every visual render — zero tolerance",
    ),
    point(
      "canonical-version-bytes",
      caseId,
      sha256Hex(material.baseline.versionBytes),
      sha256Hex(material.post.versionBytes),
      "the serialized solution version must be byte-identical after every visual render — zero tolerance",
    ),
    point(
      "quantity-value",
      caseId,
      sha256Hex(material.baseline.quantitiesBytes),
      sha256Hex(material.post.quantitiesBytes),
      "the canonical engine's derived quantity inventory must be EXACTLY equal — ANY numeric delta is a FAIL (visuals are presentation)",
    ),
    point(
      "validation-verdict",
      caseId,
      sha256Hex(material.baseline.validationBytes),
      sha256Hex(material.post.validationBytes),
      "the canonical engine's validation snapshot must be EXACTLY equal — a generated visual can never change a verdict",
    ),
    point(
      "canonical-projection-bytes",
      `${caseId}#plan`,
      sha256Hex(material.baseline.projections.plan),
      sha256Hex(material.post.projections.plan),
      "the canonical deterministic plan projection must be byte-identical after every render",
    ),
    point(
      "canonical-projection-bytes",
      `${caseId}#axonometric`,
      sha256Hex(material.baseline.projections.axonometric),
      sha256Hex(material.post.projections.axonometric),
      "the canonical deterministic axonometric projection must be byte-identical after every render",
    ),
  ];

  const diverged = points.filter((entry) => !entry.equal).map((entry) => entry.subjectId);
  const verdict: NoninterferenceCaseRecord["verdict"] =
    diverged.length === 0 ? "noninterference-proven" : "failed";

  return {
    caseId,
    stateIdentity: material.stateIdentity,
    renders: material.renders.map((render) => ({
      providerKey: render.providerKey,
      providerId: render.providerId,
      ok: render.outcome.ok,
      ...(render.outcome.ok
        ? { artifactId: render.outcome.artifact.artifactId }
        : { failureKind: render.outcome.failure.kind }),
    })),
    comparisonPoints: points,
    verdict,
    ...(verdict === "failed"
      ? { failureDetail: `diverged comparison points: ${diverged.join(", ")}` }
      : {}),
  };
}

function runSabotageCase(caseId: string): SabotageCaseRecord {
  const material = callLane("sabotage", caseId) as unknown as {
    before: { plan: string; axonometric: string };
    laneDefended: { outcome: LaneOutcome; projectionsAfter: { plan: string; axonometric: string } };
    directMutation: { projectionsAfter: { plan: string; axonometric: string } };
  };

  const laneRefused =
    !material.laneDefended.outcome.ok &&
    material.laneDefended.outcome.failure.kind === "contract-mismatch";
  const laneUnchanged =
    material.before.plan === material.laneDefended.projectionsAfter.plan &&
    material.before.axonometric === material.laneDefended.projectionsAfter.axonometric;
  const directDetected =
    material.before.plan !== material.directMutation.projectionsAfter.plan ||
    material.before.axonometric !== material.directMutation.projectionsAfter.axonometric;

  const defendedVerdict: SabotageCaseRecord["laneDefended"]["verdict"] =
    laneRefused && laneUnchanged ? "defended" : "failed";
  const detectedVerdict: SabotageCaseRecord["directMutation"]["verdict"] = directDetected
    ? "detected"
    : "missed";

  return {
    caseId,
    laneDefended: {
      refusedWithKind: material.laneDefended.outcome.ok
        ? "none — the rogue artifact was NOT refused"
        : material.laneDefended.outcome.failure.kind,
      canonicalProjectionsUnchanged: laneUnchanged,
      verdict: defendedVerdict,
    },
    directMutation: {
      detected: directDetected,
      verdict: detectedVerdict,
    },
    verdict:
      defendedVerdict === "defended" && detectedVerdict === "detected"
        ? "sabotage-caught"
        : "failed",
  };
}

/* ------------------------------------------------------------------ */
/* The FALLBACK drill                                                   */
/* ------------------------------------------------------------------ */

interface FallbackCaseRecord {
  readonly caseId: string;
  readonly stateIdentity: Record<string, unknown>;
  readonly failingProvider: { readonly failureKind: string; readonly refused: boolean };
  readonly failingFallbackRecord: Record<string, unknown>;
  readonly missingProviderRecord: Record<string, unknown>;
  readonly canonicalProjectionBinding: {
    readonly planBound: boolean;
    readonly axonometricBound: boolean;
  };
  readonly verdict: "fallback-proven" | "failed";
  readonly failureDetail?: string;
}

function runFallbackCase(caseId: string): FallbackCaseRecord {
  const material = callLane("fallback", caseId) as unknown as {
    stateIdentity: Record<string, unknown>;
    canonicalProjectionDigests: { plan: string; axonometric: string };
    failingOutcome: LaneOutcome;
    failingFallbackRecord: {
      reason: { reasonKind: string; failure?: { kind: string } };
      canonicalProjectionDigests: { plan: string; axonometric: string };
      statement: string;
    };
    missingFallbackRecord: {
      reason: { reasonKind: string };
      canonicalProjectionDigests: { plan: string; axonometric: string };
      statement: string;
    };
  };

  const failures: string[] = [];
  if (material.failingOutcome.ok) {
    failures.push("the failing fixture provider unexpectedly produced an artifact");
  }
  if (material.failingFallbackRecord.reason.reasonKind !== "provider-failure") {
    failures.push("the failed render did not record a provider-failure fallback");
  }
  if (material.missingFallbackRecord.reason.reasonKind !== "provider-absent") {
    failures.push("the missing-provider case did not record a provider-absent fallback");
  }
  const planBound =
    material.failingFallbackRecord.canonicalProjectionDigests.plan ===
    material.canonicalProjectionDigests.plan;
  const axonometricBound =
    material.failingFallbackRecord.canonicalProjectionDigests.axonometric ===
    material.canonicalProjectionDigests.axonometric;
  if (!planBound || !axonometricBound) {
    failures.push("the fallback record does not bind the canonical projections by digest");
  }
  if (
    material.failingFallbackRecord.statement.length === 0 ||
    material.missingFallbackRecord.statement.length === 0
  ) {
    failures.push("a fallback record carries no statement — a silent gap");
  }

  const verdict: FallbackCaseRecord["verdict"] =
    failures.length === 0 ? "fallback-proven" : "failed";

  return {
    caseId,
    stateIdentity: material.stateIdentity,
    failingProvider: {
      failureKind: material.failingOutcome.ok ? "none" : material.failingOutcome.failure.kind,
      refused: !material.failingOutcome.ok,
    },
    failingFallbackRecord: material.failingFallbackRecord as unknown as Record<string, unknown>,
    missingProviderRecord: material.missingFallbackRecord as unknown as Record<string, unknown>,
    canonicalProjectionBinding: { planBound, axonometricBound },
    verdict,
    ...(verdict === "failed" ? { failureDetail: failures.join("; ") } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Record assembly + writing                                            */
/* ------------------------------------------------------------------ */

interface DrillRecord {
  readonly recordKind: string;
  readonly schemaVersion: string;
  readonly repoSha: string;
  readonly committedAt: string;
  readonly generatedBy: string;
  readonly comparisonPointKinds: readonly string[];
  readonly cases: readonly unknown[];
  /** Present on the non-interference record: the sabotage twin cases. */
  readonly sabotage?: readonly unknown[];
  readonly totals: Record<string, number>;
  readonly overall: "PASS" | "FAIL";
}

function writeRecord(name: string, record: DrillRecord): void {
  mkdirSync(RUNS_DIR, { recursive: true });
  const path = resolve(RUNS_DIR, `${name}.record.json`);
  const before = readRecordIfPresent(path);
  const bytes = canonicalJson(record);
  writeFileSync(path, bytes);
  const marker =
    before === null
      ? "written"
      : before === bytes
        ? "reproduced byte-identically"
        : "UPDATED (differs from the committed record)";
  console.log(
    `  record: docs/productization-evidence/HFX-303/runs/${name}.record.json — ${marker}`,
  );
}

function readRecordIfPresent(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function totalsOf(verdicts: readonly string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const verdict of verdicts) {
    totals[verdict] = (totals[verdict] ?? 0) + 1;
  }
  totals["total"] = verdicts.length;
  return totals;
}

function overallOf(verdicts: readonly string[]): "PASS" | "FAIL" {
  return verdicts.every((verdict) => !verdict.startsWith("failed") && verdict !== "missed")
    ? "PASS"
    : "FAIL";
}

/* ------------------------------------------------------------------ */
/* The drills                                                           */
/* ------------------------------------------------------------------ */

function drillSwap(identity: { repoSha: string; committedAt: string }): "PASS" | "FAIL" {
  console.log("==> swap: the provider swap trace (presentation-only substitution proof)");
  const cases = corpusCases().map((entry) => runSwapCase(entry.caseId));
  const verdicts = cases.map((entry) => entry.verdict);
  const overall = overallOf(verdicts);
  writeRecord("swap", {
    recordKind: "hfx-303-visual-swap-trace",
    schemaVersion: "hfx-303-visual-eval/1",
    repoSha: identity.repoSha,
    committedAt: identity.committedAt,
    generatedBy: "bun tools/visual-eval/run.ts swap",
    comparisonPointKinds: SWAP_POINT_KINDS,
    cases,
    totals: totalsOf(verdicts),
    overall,
  });
  return overall;
}

function drillNoninterfere(identity: {
  repoSha: string;
  committedAt: string;
}): "PASS" | "FAIL" {
  console.log("==> noninterfere: semantic non-interference (zero tolerance) + the sabotage twin");
  const inventory = corpusCases();
  const cases = inventory.map((entry) => runNoninterferenceCase(entry.caseId));
  const sabotage = inventory
    .filter((entry) => entry.canonicalShapeCount > 0)
    .map((entry) => runSabotageCase(entry.caseId));
  const verdicts = [
    ...cases.map((entry) => entry.verdict),
    ...sabotage.map((entry) => entry.verdict),
  ];
  const overall = overallOf(verdicts);
  writeRecord("noninterfere", {
    recordKind: "hfx-303-visual-noninterference",
    schemaVersion: "hfx-303-visual-eval/1",
    repoSha: identity.repoSha,
    committedAt: identity.committedAt,
    generatedBy: "bun tools/visual-eval/run.ts noninterfere",
    comparisonPointKinds: NONINTERFERENCE_POINT_KINDS,
    cases,
    sabotage,
    totals: totalsOf(verdicts),
    overall,
  });
  return overall;
}

function drillFallback(identity: { repoSha: string; committedAt: string }): "PASS" | "FAIL" {
  console.log("==> fallback: the honest fallback drill (failing + missing provider)");
  const cases = corpusCases().map((entry) => runFallbackCase(entry.caseId));
  const verdicts = cases.map((entry) => entry.verdict);
  const overall = overallOf(verdicts);
  writeRecord("fallback", {
    recordKind: "hfx-303-visual-fallback-drill",
    schemaVersion: "hfx-303-visual-eval/1",
    repoSha: identity.repoSha,
    committedAt: identity.committedAt,
    generatedBy: "bun tools/visual-eval/run.ts fallback",
    comparisonPointKinds: ["canonical-projection-digest-binding", "typed-failure-note"],
    cases,
    totals: totalsOf(verdicts),
    overall,
  });
  return overall;
}

function listCorpus(): void {
  console.log("==> the visual corpus (the drill case inventory)");
  const cases = corpusCases();
  for (const entry of cases) {
    console.log(`  ${entry.caseId} [${entry.visualClass}]`);
    console.log(`    ${entry.description}`);
    console.log(
      `    state ${String(entry.stateIdentity.stateId).slice(0, 16)}… · ${String(entry.canonicalShapeCount)} canonical plan shapes · ${String(entry.canonicalOmissionCount)} omissions`,
    );
  }
  console.log(`  ${String(cases.length)} cases`);
}

/* ------------------------------------------------------------------ */
/* The CLI                                                              */
/* ------------------------------------------------------------------ */

const DRILLS = ["swap", "noninterfere", "fallback"] as const;

const arg = process.argv[2] ?? "all";
if (arg === "--list" || arg === "list") {
  listCorpus();
  process.exit(0);
}
if (![...DRILLS, "all"].includes(arg)) {
  console.error(`unknown drill '${arg}' — expected: --list | ${DRILLS.join(" | ")} | all`);
  process.exit(2);
}

console.log("HFX-303 visual-eval — the bounded visual-solution provider lane drill");
const identity = repoIdentity();
console.log(`  repo ${identity.repoSha} (committed ${identity.committedAt})`);

let overall: "PASS" | "FAIL" = "PASS";
const results: string[] = [];
for (const drill of DRILLS) {
  if (arg !== "all" && arg !== drill) {
    continue;
  }
  const outcome =
    drill === "swap"
      ? drillSwap(identity)
      : drill === "noninterfere"
        ? drillNoninterfere(identity)
        : drillFallback(identity);
  results.push(`${drill}: ${outcome}`);
  if (outcome === "FAIL") {
    overall = "FAIL";
  }
}

for (const line of results) {
  console.log(`  ${line}`);
}
if (overall === "FAIL") {
  console.error("VISUAL-EVAL: FAIL — a drill record failed (see the failing record above)");
  process.exit(1);
}
console.log("VISUAL-EVAL: PASS — every drill record passed");
process.exit(0);
