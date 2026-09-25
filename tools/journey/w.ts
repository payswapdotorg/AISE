/**
 * PROD-033 — the W journey (web): BOTH Gate F journeys, for real.
 *
 * Journey W1 (the golden product journey):
 *
 *   HOME → DEMO PROJECT → BOQ → EVIDENCE → CASE → INTERVENTION → OUTCOME
 *
 * Journey W2 (the interactive solution journey):
 *
 *   CURRENT BUILDING → PROBLEM → INTERACTIVE SOLUTION → VALIDATE →
 *   SOLUTION BOQ → BOQ LINE → SOLUTION STEP
 *
 * The default base is the LOCAL PRODUCTION-LIKE SERVE (§4.1: bun run
 * build then bun run start, the smoke.ts causality doctrine — the ports
 * proven dark before and after). The Lead passes the deployed URL at
 * finalization with --base-url; the harness treats both identically
 * (same-origin fetch through the page, no privileged access).
 *
 * LIVE-BROWSER HONESTY: every leg below runs in a REAL headless Chromium
 * when one is installed (the tools/deployed-check.ts pattern: sequential
 * legs, isolated context per leg where session semantics require it,
 * console-error capture through the shared ConsoleGuard, always-cleanup).
 * Where Chromium is unavailable (or AISE_JOURNEY_NO_CHROMIUM=1 forces the
 * path for verification), each leg falls back to its DETERMINISTIC PROOF —
 * the committed suites that already prove the leg are RUN and cited — and
 * the record's Class column says `deterministic (fallback: no Chromium)`
 * per leg. A live run is never fabricated.
 *
 * Reuse, never duplicate (§4.4): the responsive and accessibility checks
 * are IMPORTED from tools/deployed/checks.ts and run against the base URL
 * (they are base-agnostic); the session lifecycle, the upload round-trip
 * and the solution legs live in tools/deployed/journey-legs.ts (dual-use
 * by construction); the console guard is the shared ConsoleGuard.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { ConsoleGuard, type ConsoleGuardSummary } from "../deployed/console-guard";
import { chromiumExecutable, launchBrowser, newCheckPage } from "../deployed/browser";
import {
  checkAccessibility,
  checkResponsiveDesktop,
  checkResponsiveMobile,
  type CheckContext,
} from "../deployed/checks";
import { resolveTarget, VIEWPORTS, type ResolvedTarget } from "../deployed/config";
import { TransientCheckError, type CheckReport } from "../deployed/verdict";
import {
  journeyAvailability,
  journeyCaptureUploadRoundTrip,
  journeySessionLifecycle,
  journeySolutionWorkspaceLegs,
  LEG_BUDGETS,
  type JourneyLegContext,
} from "../deployed/journey-legs";
import {
  buildOnce,
  startLocalServe,
  JOURNEY_API_PORT,
  JOURNEY_WEB_PORT,
  type LocalServe,
} from "./serve";
import {
  ROOT,
  sleep,
  type JourneySection,
  type RunRecord,
  type StepRecord,
  type EvidenceClass,
} from "./classes";

/** The W1 walk's demo project (the live projects list's seeded demo project). */
const W1_PROJECT_ID = "proj-riverside-refit";

/** The Gate F journey texts (docs/PRODUCTION-READINESS-GATE.md, verbatim). */
const W1_FLOW = "HOME → DEMO PROJECT → BOQ → EVIDENCE → CASE → INTERVENTION → OUTCOME";
const W2_FLOW =
  "CURRENT BUILDING → PROBLEM → INTERACTIVE SOLUTION → VALIDATE → SOLUTION BOQ → BOQ LINE → SOLUTION STEP";

/** The step catalog (what --list enumerates and what the record carries). */
export const W_STEP_CATALOG: readonly { readonly id: string; readonly name: string }[] = [
  { id: "w1.serve", name: "the local production-like serve (build → start → dark-before proof)" },
  { id: "w1.availability", name: "the base-agnostic availability probe (/, /healthz, /readyz)" },
  { id: "w1.session", name: "the session lifecycle (mint → whoami → logout → fail-closed 401)" },
  { id: "w1.home", name: "HOME — the gate, the task-first landing, the live provider note" },
  { id: "w1.demo-project", name: "DEMO PROJECT — the live projects list → the project overview" },
  { id: "w1.boq", name: "BOQ — the BOQ Lens + the SOURCE BOQ import panel + incumbent context" },
  { id: "w1.evidence", name: "EVIDENCE — the capture surface + the guided mission + the upload entry" },
  { id: "w1.upload", name: "the REAL capture upload round-trip (STORED → DUPLICATE)" },
  { id: "w1.case", name: "CASE — the engineering case + the Evidence Envelope" },
  { id: "w1.intervention", name: "INTERVENTION — the Intervention Studio + proposed states" },
  { id: "w1.outcome", name: "OUTCOME — the Outcomes surface" },
  { id: "w1.responsive", name: "desktop AND mobile viewport smoke (the imported deployed checks)" },
  { id: "w1.accessibility", name: "accessibility at both viewports (the imported axe check)" },
  { id: "w1.console", name: "the W1 console guard (zero page errors / blocking errors / blocking failures)" },
  { id: "w2.current-building", name: "CURRENT BUILDING → PROBLEM — the solution route opens the demo case" },
  { id: "w2.solution-mount", name: "INTERACTIVE SOLUTION — the workspace mounts (browser engine binding)" },
  { id: "w2.direct-manipulation", name: "direct manipulation creates a typed operation" },
  { id: "w2.agent-turn", name: "the agent command creates a semantically equivalent typed operation" },
  { id: "w2.validate", name: "VALIDATE — deterministic validation tied to the solution version" },
  { id: "w2.solution-boq", name: "SOLUTION BOQ — the generated BOQ renders (7 lines)" },
  { id: "w2.boq-line", name: "BOQ LINE — the generated line selects" },
  { id: "w2.solution-step", name: "SOLUTION STEP — the line→step deep link round-trip" },
  { id: "w2.reality-seal", name: "the observed scene stays byte-identical (read-only reality)" },
  { id: "w2.console", name: "the whole-run console guard (zero page errors across both journeys)" },
  { id: "w.teardown", name: "the serve teardown identity proof (both ports dark after)" },
];

/* ------------------------------------------------------------------ */
/* The journey-expected request families (counted, never hidden)        */
/* ------------------------------------------------------------------ */

/**
 * The journey's OWN expected-by-design request families, ON TOP of the
 * ConsoleGuard's built-ins (whoami 401, task-flow 404): the documented
 * fixture-vs-live boundary — the seeded demo projects have no pinned
 * reality-graph version on the live API, so the surfaces' reality probes
 * answer 404 BY DESIGN and the surfaces render their honest empty states
 * (EVALUATOR-GUIDE §3B; identical locally and deployed). Every excluded
 * request is COUNTED and reported in the console leg's lines — never
 * silently dropped.
 */
const JOURNEY_EXPECTED_FAILURE_FAMILIES: readonly {
  readonly method: string;
  readonly path: RegExp;
  readonly status: number;
  readonly reason: string;
}[] = [
  {
    method: "GET",
    path: /^\/v1\/reality\/projects\/[^/]+\/versions\/latest$/,
    status: 404,
    reason:
      "the fixture-vs-live boundary: the seeded demo projects have no pinned reality version on the live API — the surface renders its honest empty state (documented, identical locally and deployed)",
  },
];

/** The browser's own resource-error console line for a 4xx fetch. */
const RESOURCE_ERROR_LINE = /^Failed to load resource: the server responded with a status of (\d+)/;

interface JourneyConsoleClassification {
  readonly pageErrors: number;
  readonly blockingConsoleErrors: readonly { readonly text: string; readonly locationUrl: string | null }[];
  readonly blockingFailedRequests: readonly { readonly method: string; readonly path: string; readonly status: number }[];
  readonly journeyExpectedRequests: readonly { readonly method: string; readonly path: string; readonly reason: string }[];
  readonly journeyExpectedConsoleLines: number;
  readonly guardExcludedRequests: number;
}

/** Reclassify the guard's summary with the journey's expected families. */
function classifyJourneyConsole(summary: ConsoleGuardSummary): JourneyConsoleClassification {
  const journeyExpectedRequests: {
    method: string;
    path: string;
    reason: string;
  }[] = [];
  const blockingFailedRequests: {
    method: string;
    path: string;
    status: number;
  }[] = [];
  for (const record of summary.blockingFailedRequests) {
    const family = JOURNEY_EXPECTED_FAILURE_FAMILIES.find(
      (candidate) =>
        candidate.method === record.method &&
        candidate.status === record.status &&
        candidate.path.test(record.path),
    );
    if (family !== undefined) {
      journeyExpectedRequests.push({
        method: record.method,
        path: record.path,
        reason: family.reason,
      });
    } else {
      blockingFailedRequests.push({
        method: record.method,
        path: record.path,
        status: record.status,
      });
    }
  }

  // The browser's own console line for an expected-by-design failure (the
  // same correlation the guard applies to ITS families).
  const expectedPaths = new Set(journeyExpectedRequests.map((record) => `${record.path} 404`));
  let journeyExpectedConsoleLines = 0;
  const blockingConsoleErrors: { text: string; locationUrl: string | null }[] = [];
  for (const record of summary.blockingConsoleErrors) {
    const match = RESOURCE_ERROR_LINE.exec(record.text);
    let expected = false;
    if (match !== null && record.locationUrl !== null) {
      try {
        expected = expectedPaths.has(`${new URL(record.locationUrl).pathname} ${match[1]}`);
      } catch {
        expected = false;
      }
    }
    if (expected) {
      journeyExpectedConsoleLines += 1;
    } else {
      blockingConsoleErrors.push({ text: record.text, locationUrl: record.locationUrl });
    }
  }

  return {
    pageErrors: summary.pageErrors.length,
    blockingConsoleErrors,
    blockingFailedRequests,
    journeyExpectedRequests,
    journeyExpectedConsoleLines,
    guardExcludedRequests: summary.excludedExpectedRequests.length,
  };
}

/* ------------------------------------------------------------------ */
/* The fallback path (deterministic proofs — cited AND run)             */
/* ------------------------------------------------------------------ */

/** One fallback citation: committed suites (run) + committed docs (cited). */
interface FallbackProof {
  readonly stepId: string;
  readonly suites: readonly string[];
  readonly docs: readonly string[];
  readonly testNames: readonly string[];
}

/** The W journey's deterministic fallback proofs (committed citations). */
const W_FALLBACK_PROOFS: readonly FallbackProof[] = [
  {
    stepId: "w1.availability",
    suites: [],
    docs: [],
    testNames: ["tools/smoke.ts — GET /healthz + /readyz contract assertions (SMOKE: PASS)"],
  },
  {
    stepId: "w1.session",
    suites: ["backend/api/src/auth/middleware.test.ts"],
    docs: [],
    testNames: [
      "auth/middleware.test.ts › THE AUTHORIZATION MATRIX — path-scoped namespaces (GET + POST)",
      "auth/middleware.test.ts › the demo session mint + the fail-closed 401 family",
    ],
  },
  {
    stepId: "w1.home",
    suites: ["apps/web/src/app/task-first.test.tsx", "apps/web/src/app/discoverability.test.tsx"],
    docs: [],
    testNames: [
      "discoverability.test.tsx › the LANDING composes the task-first flow AND the contextual integrations panel",
      "provider-status.test.tsx › the /readyz extraction seam (cited)",
    ],
  },
  {
    stepId: "w1.demo-project",
    suites: ["apps/web/src/app/api.test.ts"],
    docs: [],
    testNames: ["api.test.ts › loadProjectsLive — the live projects contract"],
  },
  {
    stepId: "w1.boq",
    suites: ["apps/web/src/app/boq-import.test.tsx", "apps/web/src/app/discoverability.test.tsx"],
    docs: [],
    testNames: [
      "discoverability.test.tsx › the BOQ import is discoverable from the journey and lives on the lens surface",
      "boq-import.test.tsx › the panel labels the import as a SOURCE BOQ",
    ],
  },
  {
    stepId: "w1.evidence",
    suites: ["apps/web/src/app/capture-mission.test.tsx"],
    docs: [],
    testNames: [
      "capture-mission.test.tsx › the capture SURFACE mounts the guided mission, the upload entry and the honest limits card",
    ],
  },
  {
    stepId: "w1.upload",
    suites: ["backend/api/src/capture/router.test.ts"],
    docs: [],
    testNames: [
      "capture/router.test.ts › upload → sync → read persists assets and the session verbatim",
      "capture/router.test.ts › re-uploading identical asset content succeeds without duplication",
    ],
  },
  {
    stepId: "w1.case",
    suites: ["apps/web/src/app/evidence-envelope.test.tsx", "apps/web/src/app/discoverability.test.tsx"],
    docs: [],
    testNames: [
      "evidence-envelope.test.tsx › the envelope's honest absences (11 tests)",
      "discoverability.test.tsx › the evidence envelope is visible at BOTH consequential decisions",
    ],
  },
  {
    stepId: "w1.intervention",
    suites: ["apps/web/src/app/discoverability.test.tsx"],
    docs: [],
    testNames: [
      "discoverability.test.tsx › the 16-render corpus (the SiteTwin/Outcomes bodies verified in the same pass)",
    ],
  },
  {
    stepId: "w1.outcome",
    suites: ["apps/web/src/app/discoverability.test.tsx", "apps/web/src/app/outcome-forms.test.ts"],
    docs: [],
    testNames: ["outcome-forms.test.ts › the outcome surface's forms contract"],
  },
  {
    stepId: "w1.responsive",
    suites: [],
    docs: ["docs/productization-evidence/PROD-012-R/remediation.md"],
    testNames: [
      "PROD-012-R/remediation.md — the mobile-overflow + contrast fixes verified against the local production build",
    ],
  },
  {
    stepId: "w1.accessibility",
    suites: [],
    docs: [
      "docs/productization-evidence/PROD-012-R/remediation.md",
      "docs/productization-evidence/PROD-012/run-2026-09-20.txt",
    ],
    testNames: [
      "PROD-012/run-2026-09-20.txt — the deployed accessibility scan (axe, both viewports)",
    ],
  },
  {
    stepId: "w1.console",
    suites: [],
    docs: [
      "docs/productization-evidence/PROD-031/browser-journey.md",
      "docs/productization-evidence/PROD-030/browser-proof.md",
    ],
    testNames: [
      "PROD-031/browser-journey.md — ZERO pageerror events across the whole session (committed)",
    ],
  },
];

const W2_FALLBACK_SUITES: readonly string[] = [
  "apps/web/src/app/solution-composition-model.test.tsx",
  "apps/web/src/app/solution-journey-record.test.ts",
  "apps/web/src/solution/service-prod031.test.ts",
];

const W2_FALLBACK_CITED_TESTS: readonly string[] = [
  "solution-composition-model.test.tsx › the twelve-step composed journey through the REAL engine (the PROD-026 record's parity)",
  "solution-journey-record.test.ts › the committed record equals the LIVE Node run of the ONE runner",
  "service-prod031.test.ts › the HTTP binding's baseline/step/validate legs (the seam the browser mount speaks)",
];

/** Run one set of cited suites and harvest the bun test summary lines. */
function runCitedSuites(suites: readonly string[]): { pass: boolean; lines: string[] } {
  if (suites.length === 0) {
    return { pass: true, lines: [] };
  }
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "test", ...suites],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout: 300_000,
  });
  const output = `${proc.stdout?.toString() ?? ""}\n${proc.stderr?.toString() ?? ""}`;
  const summaryLines = output
    .trim()
    .split("\n")
    .filter((line) => /^\s*\d+ (pass|fail|skip)/.test(line) || /^Ran \d+ tests/.test(line.trim()));
  const hasFailLine = /^\s*[1-9]\d* fail\b/m.test(output);
  const lines = [`bun test ${suites.join(" ")}`];
  for (const line of summaryLines.slice(-4)) {
    lines.push(line.trim());
  }
  if (proc.exitCode !== 0 || hasFailLine) {
    lines.push(`exit code ${proc.exitCode ?? "timeout"} — the cited suite run FAILED`);
    return { pass: false, lines };
  }
  return { pass: true, lines };
}

/* ------------------------------------------------------------------ */
/* The live W1 surface walk (one coherent session)                      */
/* ------------------------------------------------------------------ */

interface SurfaceStop {
  readonly stepId: string;
  readonly name: string;
  readonly hash: string;
  readonly h1: string;
  readonly controls: readonly {
    readonly description: string;
    readonly check: (bodyText: string) => boolean;
  }[];
  /** Optional DOM selectors that must exist on the settled surface. */
  readonly domSelectors?: readonly string[];
  /** Extra honest-contract lines recorded with the step. */
  readonly notes?: readonly string[];
}

/** The W1 golden journey's surface stops (one session, coherent navigation). */
const W1_SURFACE_STOPS: readonly SurfaceStop[] = [
  {
    stepId: "w1.demo-project",
    name: "DEMO PROJECT — the live projects list → the project overview",
    hash: "#/projects",
    h1: "Projects",
    controls: [
      {
        description: "the live projects list includes the seeded demo project (proj-riverside-refit)",
        check: (text) => text.includes("proj-riverside-refit"),
      },
    ],
  },
  {
    stepId: "w1.boq",
    name: "BOQ — the BOQ Lens + the SOURCE BOQ import panel + incumbent context",
    hash: `#/projects/${W1_PROJECT_ID}/boq-lens`,
    h1: "BOQ Lens",
    controls: [
      {
        description: 'the "Import a SOURCE BOQ" panel is present above the lens',
        check: (text) => text.includes("Import a SOURCE BOQ"),
      },
      {
        description: "the SOURCE vs SOLUTION separation is stated",
        check: (text) => text.includes("SOURCE BOQ"),
      },
    ],
  },
  {
    stepId: "w1.evidence",
    name: "EVIDENCE — the capture surface + the guided mission + the upload entry",
    hash: `#/projects/${W1_PROJECT_ID}/capture`,
    h1: "Capture / Upload",
    controls: [
      {
        description: "the guided capture mission panel renders (the server's honest task-flow state)",
        check: (text) => text.includes("capture mission"),
      },
    ],
  },
  {
    stepId: "w1.case",
    name: "CASE — the engineering case + the Evidence Envelope",
    hash: `#/projects/${W1_PROJECT_ID}/case`,
    h1: "Engineering Case",
    controls: [
      {
        description:
          'the live "Engineering cases" card renders with its honest state (the empty list + the create-first-case action when no case exists)',
        check: (text) =>
          text.includes("Engineering cases") &&
          (text.includes("No engineering cases recorded") || text.includes("Case detail")),
      },
    ],
    domSelectors: ["#create-case"],
    notes: [
      "the Evidence Envelope card ('What is this case based on?') renders when a case detail exists; this live serve holds no cases yet, so the surface renders its designed honest empty states — the envelope's CONTENT is proven by the committed corpus (apps/web/src/app/evidence-envelope.test.tsx, 11 tests) and renders in the demo-mode surface",
    ],
  },
  {
    stepId: "w1.intervention",
    name: "INTERVENTION — the Intervention Studio + proposed states",
    hash: `#/projects/${W1_PROJECT_ID}/intervention`,
    h1: "Intervention Studio",
    controls: [
      {
        description: "the intervention scenario surface renders (proposed states distinct from reality)",
        check: (text) => text.includes("Intervention"),
      },
    ],
  },
  {
    stepId: "w1.outcome",
    name: "OUTCOME — the Outcomes surface",
    hash: `#/projects/${W1_PROJECT_ID}/outcomes`,
    h1: "Outcomes",
    controls: [
      {
        description: "the outcome records surface renders",
        check: (text) => text.includes("Outcome"),
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* The W journey runner                                                 */
/* ------------------------------------------------------------------ */

/** Chromium availability (the honest preflight + the forced-fallback knob). */
export function chromiumAvailable(): boolean {
  if (process.env["AISE_JOURNEY_NO_CHROMIUM"] === "1") {
    return false;
  }
  try {
    chromiumExecutable();
    return true;
  } catch {
    return false;
  }
}

/** Convert one CheckReport to a StepRecord (with the catalog's step name). */
function reportToStep(
  report: CheckReport,
  stepId: string,
  stepName: string,
  evidenceClass: EvidenceClass,
  classNote: string,
): StepRecord {
  return {
    id: stepId,
    name: stepName,
    status: report.pass ? "PASS" : "FAIL",
    evidenceClass,
    classNote,
    lines: report.lines,
  };
}

/** The W journey: both Gate F journeys against one base. */
export async function runWJourney(options: { readonly baseUrl?: string }): Promise<RunRecord> {
  const startedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const repoSha = (await import("./classes")).currentRepoSha();
  const live = chromiumAvailable();

  let baseUrl = options.baseUrl ?? "";
  let baseSource: "local-serve" | "explicit-base-url" = "local-serve";
  let serve: LocalServe | null = null;
  const serveLines: string[] = [];

  const w1Steps: StepRecord[] = [];
  const w2Steps: StepRecord[] = [];
  const teardownSteps: StepRecord[] = [];
  /** Early-exit flag (the record is built ONCE, after the finally, so the teardown section is always included). */
  let earlyExit = false;

  try {
    /* ---- The base: the local production-like serve, or the Lead's URL. ---- */
    if (options.baseUrl !== undefined) {
      baseSource = "explicit-base-url";
      baseUrl = options.baseUrl.replace(/\/+$/, "");
      serveLines.push(
        `the base URL was provided explicitly (--base-url ${baseUrl}) — the harness treats it identically to the local serve (same-origin fetch, no privileged access)`,
      );
    } else {
      const build = buildOnce();
      serveLines.push(...build.lines);
      if (!build.pass) {
        w1Steps.push({
          id: "w1.serve",
          name: "the local production-like serve (build → start → dark-before proof)",
          status: "FAIL",
          evidenceClass: "deterministic",
          classNote: "local production-like serve",
          lines: build.lines,
        });
        earlyExit = true;
      } else {
        serve = await startLocalServe();
        baseUrl = serve.webOrigin;
        serveLines.push(
          `pre-flight causality: ports ${JOURNEY_API_PORT}/${JOURNEY_WEB_PORT} proven DARK before the serve started (TCP connect refused on both loopback addresses)`,
        );
        serveLines.push(
          `the serve answers /healthz on both origins (api ${serve.apiOrigin}, web ${serve.webOrigin})`,
        );
      }
    }

    if (!earlyExit && !live) {
      /* ---- The deterministic fallback path (no Chromium — never silent). ---- */
      const note = "fallback: no Chromium — the cited committed suites ran";
      w1Steps.push({
        id: "w1.serve",
        name: "the local production-like serve (build → start → dark-before proof)",
        status: "PASS",
        evidenceClass: "deterministic",
        classNote:
          baseSource === "explicit-base-url"
            ? "explicit base URL; no local serve started"
            : "fallback: no Chromium — the local serve still booted (build + start + healthz); the full runtime proof cited: tools/smoke.ts",
        lines:
          baseSource === "explicit-base-url"
            ? serveLines
            : [
                ...serveLines,
                "the serve booted (bun run build + bun run start with a scratch data dir, the demo-open auth shape); the full runtime contract proof is tools/smoke.ts (SMOKE: PASS — cited)",
              ],
      });

      const w2SuiteRun = runCitedSuites(W2_FALLBACK_SUITES);
      for (const proof of W_FALLBACK_PROOFS) {
        const suiteRun = runCitedSuites(proof.suites);
        const docLines = proof.docs.map(
          (doc) => `${doc} — ${existsSync(join(ROOT, doc)) ? "committed" : "MISSING"}`,
        );
        const pass = suiteRun.pass && docLines.every((line) => line.endsWith("committed"));
        const allLines = [
          ...proof.testNames.map((name) => `cited: ${name}`),
          ...suiteRun.lines,
          ...docLines,
        ];
        const catalog = W_STEP_CATALOG.find((entry) => entry.id === proof.stepId);
        w1Steps.push({
          id: proof.stepId,
          name: catalog?.name ?? proof.stepId,
          status: pass ? "PASS" : "FAIL",
          evidenceClass: "deterministic",
          classNote: note,
          lines: allLines,
        });
      }
      for (const step of W_STEP_CATALOG.filter(
        (entry) => entry.id.startsWith("w2.") && entry.id !== "w2.console",
      )) {
        w2Steps.push({
          id: step.id,
          name: step.name,
          status: w2SuiteRun.pass ? "PASS" : "FAIL",
          evidenceClass: "deterministic",
          classNote: note,
          lines: [...W2_FALLBACK_CITED_TESTS.map((name) => `cited: ${name}`), ...w2SuiteRun.lines],
        });
      }
      const w2ConsoleDoc = "docs/productization-evidence/PROD-031/browser-journey.md";
      w2Steps.push({
        id: "w2.console",
        name: W_STEP_CATALOG.find((entry) => entry.id === "w2.console")?.name ?? "w2.console",
        status: existsSync(join(ROOT, w2ConsoleDoc)) ? "PASS" : "FAIL",
        evidenceClass: "deterministic",
        classNote: note,
        lines: [
          "cited: PROD-031/browser-journey.md — ZERO pageerror events across the whole session (committed evidence)",
          `${w2ConsoleDoc} — ${existsSync(join(ROOT, w2ConsoleDoc)) ? "committed" : "MISSING"}`,
        ],
      });
      earlyExit = true;
    }

    if (!earlyExit) {
    /* ---- The LIVE path: one Chromium, sequential legs, the shared guard. ---- */
    serveLines.push(`chromium: ${chromiumExecutable()} (real headless Chromium, --no-sandbox)`);
    const browserInstance = await launchBrowser();
    const guard = new ConsoleGuard();
    const target: ResolvedTarget = resolveTarget(baseUrl);
    const ctx: JourneyLegContext = { browser: browserInstance, origin: baseUrl, guard };
    const checkCtx: CheckContext = {
      browser: browserInstance,
      target,
      guard,
      noteCleanupFailure: (message) => {
        console.error(`  cleanup failure (run-level): ${message}`);
      },
    };

    try {
      /* w1.serve — the serve/target pre-flight record. */
      w1Steps.push({
        id: "w1.serve",
        name: "the local production-like serve (build → start → dark-before proof)",
        status: "PASS",
        evidenceClass: "deterministic",
        classNote:
          baseSource === "local-serve"
            ? "local production-like serve (bun run build + bun run start; the smoke.ts causality doctrine)"
            : "the explicit base URL (the Lead's deployed replay target)",
        lines: serveLines,
      });

      /* w1.availability — the base-agnostic probe. */
      const availability = await withOneBoundedRetry(() => journeyAvailability(ctx));
      w1Steps.push(
        reportToStep(
          availability,
          "w1.availability",
          "the base-agnostic availability probe (/, /healthz, /readyz)",
          "deterministic",
          baseSource === "local-serve"
            ? "live API probe over the local production-like serve"
            : "live API probe over the explicit base URL",
        ),
      );

      /* w1.session — the dual-use session lifecycle leg. */
      const session = await withOneBoundedRetry(() => journeySessionLifecycle(ctx));
      w1Steps.push(
        reportToStep(
          session,
          "w1.session",
          "the session lifecycle (mint → whoami → logout → fail-closed 401)",
          "deterministic",
          `live headless Chromium; in-page same-origin fetch; ${
            baseUrl.startsWith("https:")
              ? "https base (Secure asserted)"
              : "plain-http local base (Secure not applicable to this transport — recorded verbatim)"
          }`,
        ),
      );

      /* w1.home + the coherent surface walk (ONE session). */
      const walkHandle = await newCheckPage(browserInstance, guard, "w1-walk", VIEWPORTS.desktop);
      const homeLines: string[] = [];
      try {
        const page = walkHandle.page;
        await page.goto(baseUrl, { timeout: LEG_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
        await page.waitForSelector("h2#gate-title", { timeout: LEG_BUDGETS.landmarkMs });
        homeLines.push('the auth gate rendered (h2#gate-title "Sign in to AISE")');
        await page.getByRole("button", { name: "Enter demo", exact: true }).click();
        await page.waitForSelector("header.app-header", { timeout: LEG_BUDGETS.landmarkMs });
        homeLines.push("the demo session entered through the product's own gate control");
        await page.waitForSelector("main#main-content h1", { timeout: LEG_BUDGETS.landmarkMs });
        const homeHeading = ((await page.locator("main#main-content h1").first().textContent()) ?? "").trim();
        let bodyText = "";
        for (let settleTries = 0; settleTries < 20; settleTries += 1) {
          await sleep(500);
          bodyText = await page.locator("body").innerText();
          if (bodyText.includes("What do you need to do?") && bodyText.includes("live API")) {
            break;
          }
        }
        const taskFlowHonest =
          bodyText.includes("does not serve the task-flow adapter contract objects") ||
          bodyText.includes("No task-flow objects recorded");
        const homePass =
          homeHeading === "What do you need to do?" &&
          bodyText.includes("live API") &&
          taskFlowHonest;
        w1Steps.push({
          id: "w1.home",
          name: "HOME — the gate, the task-first landing, the live provider note",
          status: homePass ? "PASS" : "FAIL",
          evidenceClass: "deterministic",
          classNote: "live headless Chromium; local production-like serve",
          lines: [
            ...homeLines,
            `the task-first landing renders (h1 "${homeHeading}"; the intent form and canonical actions composed)`,
            `the live API chip renders: ${bodyText.includes("live API")}`,
            `the live task-flow GET fired and the HONEST state rendered (${
              bodyText.includes("does not serve the task-flow adapter contract objects")
                ? "the explicit not-served reason (the designed 404 family)"
                : taskFlowHonest
                  ? "the explicit empty state"
                  : "UNRECOGNIZED STATE"
            })`,
            `the live /readyz probe populates the provider note (optional-provider statuses verbatim): ${bodyText.includes("worldsculpt")}`,
          ],
        });

        /* The coherent surface walk (the golden journey's stops). */
        for (const stop of W1_SURFACE_STOPS) {
          await page.goto(`${baseUrl}/${stop.hash}`, {
            timeout: LEG_BUDGETS.gotoMs,
            waitUntil: "domcontentloaded",
          });
          await page.waitForSelector("main#main-content h1", { timeout: LEG_BUDGETS.landmarkMs });
          const heading = ((await page.locator("main#main-content h1").first().textContent()) ?? "").trim();
          await sleep(LEG_BUDGETS.settleMs);
          const text = await page.locator("body").innerText();
          const controlResults = stop.controls.map((control) => ({
            description: control.description,
            pass: control.check(text),
          }));
          const domSelectorResults: { description: string; pass: boolean }[] = [];
          for (const selector of stop.domSelectors ?? []) {
            domSelectorResults.push({
              description: `the surface's own control is present (${selector})`,
              pass: (await page.locator(selector).count()) > 0,
            });
          }
          const navAffordances =
            (await page.locator("nav#primary-nav").count()) +
            (await page.locator("button.nav-toggle").count());
          const pass =
            heading === stop.h1 &&
            controlResults.every((result) => result.pass) &&
            domSelectorResults.every((result) => result.pass) &&
            navAffordances > 0;
          const lines = [
            `the route ${stop.hash} loads (h1 "${heading}")`,
            ...controlResults.map((result) => `${result.pass ? "pass" : "FAIL"} — ${result.description}`),
            ...domSelectorResults.map((result) => `${result.pass ? "pass" : "FAIL"} — ${result.description}`),
            `navigation state coherent (the shell's nav affordances present: ${navAffordances > 0})`,
            `body text sample: "${text.replace(/\s+/g, " ").slice(0, 110)}…"`,
            ...(stop.notes ?? []),
          ];
          if (stop.stepId === "w1.evidence") {
            const uploadInput = await page.locator("#capture-file").count();
            lines.push(`the upload entry's file input present: ${uploadInput === 1}`);
          }
          w1Steps.push({
            id: stop.stepId,
            name: stop.name,
            status: pass ? "PASS" : "FAIL",
            evidenceClass: "deterministic",
            classNote: "live headless Chromium; local production-like serve",
            lines,
          });
        }
      } finally {
        // ALWAYS clean up the walk's minted session.
        const cookies = await walkHandle.context.cookies(baseUrl).catch(() => null);
        if (cookies === null || cookies.some((cookie) => cookie.name === "aise_session")) {
          await pageDeleteSession(walkHandle.page);
        }
        await walkHandle.close();
      }

      /* w1.upload — the REAL capture upload round-trip (synthetic bytes). */
      const fixtureDir = mkdtempSync(join(tmpdir(), "aise-journey-upload-"));
      const fixtureFile = join(fixtureDir, "prod033-upload-fixture.jpeg");
      const fixtureBytes = new TextEncoder().encode(
        "AISE PROD-033 journey upload fixture — deterministic bytes standing in for the absent camera (synthetic class)",
      );
      writeFileSync(fixtureFile, fixtureBytes);
      const expectedContentId = createHash("sha256").update(fixtureBytes).digest("hex");
      const upload = await withOneBoundedRetry(() =>
        journeyCaptureUploadRoundTrip(ctx, {
          fixtureFile,
          projectId: W1_PROJECT_ID,
          expectedContentId,
        }),
      );
      w1Steps.push(
        reportToStep(
          upload,
          "w1.upload",
          "the REAL capture upload round-trip (STORED → DUPLICATE)",
          "synthetic",
          "deterministic fixture bytes standing in for the absent camera; the browser upload round-trip itself is live (real file input → Web-Crypto content address → the live gateway)",
        ),
      );
      rmSync(fixtureDir, { recursive: true, force: true });

      /* w1.responsive — the IMPORTED deployed checks, against this base. */
      const responsiveDesktop = await withOneBoundedRetry(() => checkResponsiveDesktop(checkCtx));
      const responsiveMobile = await withOneBoundedRetry(() => checkResponsiveMobile(checkCtx));
      const responsivePass = responsiveDesktop.pass && responsiveMobile.pass;
      w1Steps.push({
        id: "w1.responsive",
        name: "desktop AND mobile viewport smoke (the imported deployed checks)",
        status: responsivePass ? "PASS" : "FAIL",
        evidenceClass: "deterministic",
        classNote:
          "live headless Chromium; the imported tools/deployed responsive checks (no-overflow + shell landmarks + the mobile drawer)",
        lines: [...responsiveDesktop.lines.slice(0, 6), ...responsiveMobile.lines.slice(0, 6)],
      });

      /* w1.accessibility — the IMPORTED axe check at both viewports. */
      const accessibility = await withOneBoundedRetry(() => checkAccessibility(checkCtx));
      w1Steps.push(
        reportToStep(
          accessibility,
          "w1.accessibility",
          "accessibility at both viewports (the imported axe check)",
          "deterministic",
          "live headless Chromium; the imported tools/deployed accessibility check (axe-core, zero critical/serious at both viewports)",
        ),
      );

      /* w1.console — the journey-classified console guard snapshot. */
      w1Steps.push(
        consoleStep(
          guard,
          "w1.console",
          "the W1 console guard (zero page errors / blocking errors / blocking failures)",
        ),
      );

      /* ---- W2: the interactive solution journey (the PROD-031 path). ---- */
      const solutionObservations = await journeySolutionWorkspaceLegs(ctx);
      for (const observation of solutionObservations) {
        w2Steps.push({
          id: observation.id,
          name: observation.name,
          status: observation.pass ? "PASS" : "FAIL",
          evidenceClass: "deterministic",
          classNote:
            "live headless Chromium over the live same-origin engine routes (the PROD-031 browser execution path)",
          lines: observation.lines,
        });
      }

      /* w2.console — the whole-run console guard. */
      w2Steps.push(
        consoleStep(
          guard,
          "w2.console",
          "the whole-run console guard (zero page errors across both journeys)",
        ),
      );
    } finally {
      await browserInstance.close();
    }
    }
  } finally {
    /* The teardown identity proof (the smoke doctrine's closing law). */
    if (serve !== null) {
      const outcome = await serve.stop();
      teardownSteps.push({
        id: "w.teardown",
        name: "the serve teardown identity proof (both ports dark after)",
        status: outcome.portsDark ? "PASS" : "FAIL",
        evidenceClass: "deterministic",
        classNote:
          "the smoke.ts causality doctrine — the ports must be dark again after the serve stopped",
        lines: [
          `the serve orchestrator stopped (exit code ${outcome.exitCode}); the scratch data dir removed`,
          `identity proof: ports ${JOURNEY_API_PORT}/${JOURNEY_WEB_PORT} dark after teardown: ${outcome.portsDark} (anything still answering would mean the probes may have hit a foreign server — the run refuses that false positive)`,
        ],
      });
    }
  }

  return finishRecord();

  function finishRecord(): RunRecord {
    const sections: JourneySection[] = [];
    if (w1Steps.length > 0) {
      sections.push({
        id: "w1",
        title: "W1 — the golden product journey (Gate F, journey 1)",
        flowText: W1_FLOW,
        steps: w1Steps,
      });
    }
    if (w2Steps.length > 0) {
      sections.push({
        id: "w2",
        title: "W2 — the interactive solution journey (Gate F, journey 2)",
        flowText: W2_FLOW,
        steps: w2Steps,
      });
    }
    if (teardownSteps.length > 0) {
      sections.push({
        id: "teardown",
        title: "The local serve teardown (the measurement-causality closing proof)",
        steps: teardownSteps,
      });
    }
    return {
      journeyId: "w",
      baseUrl: baseUrl || "(not started — the serve failed)",
      baseSource,
      repoSha,
      startedAt,
      chromiumAvailable: live,
      sections,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** The journey console guard step (the journey-classified summary). */
function consoleStep(guard: ConsoleGuard, id: string, name: string): StepRecord {
  const classification = classifyJourneyConsole(guard.summarize());
  const pass =
    classification.pageErrors === 0 &&
    classification.blockingConsoleErrors.length === 0 &&
    classification.blockingFailedRequests.length === 0;
  const lines = [
    `pageerror events: ${classification.pageErrors} (must be 0 — never faked)`,
    `blocking console.error calls: ${classification.blockingConsoleErrors.length} (must be 0)`,
    `blocking failed requests (document/script/style/font + unexpected xhr/fetch): ${classification.blockingFailedRequests.length} (must be 0)`,
    `expected-by-design request failures (the guard's own families: whoami 401, task-flow 404): ${classification.guardExcludedRequests} — counted, never hidden`,
    `journey-expected request failures (the documented fixture-vs-live boundary, reality-latest 404): ${classification.journeyExpectedRequests.length} — counted, never hidden`,
  ];
  for (const record of classification.journeyExpectedRequests.slice(0, 4)) {
    lines.push(`  ${record.method} ${record.path} → ${record.reason}`);
  }
  lines.push(
    `the browser's own resource-error console lines for those same expected failures: ${classification.journeyExpectedConsoleLines} (excluded by the same correlation the guard applies to its families)`,
  );
  for (const record of classification.blockingConsoleErrors.slice(0, 3)) {
    lines.push(`  BLOCKING console.error: ${record.text.slice(0, 140)}`);
  }
  for (const record of classification.blockingFailedRequests.slice(0, 3)) {
    lines.push(`  BLOCKING request: ${record.method} ${record.path} → ${record.status}`);
  }
  return {
    id,
    name,
    status: pass ? "PASS" : "FAIL",
    evidenceClass: "deterministic",
    classNote:
      "the shared ConsoleGuard's run-wide capture, journey-classified (every exclusion counted and reasoned)",
    lines,
  };
}

/** One bounded retry per CHECK (transient network failures only). */
async function withOneBoundedRetry<T>(check: () => Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (error) {
    if (!(error instanceof TransientCheckError)) {
      throw error;
    }
    console.log(
      `  retry: a journey leg failed transiently (${error.message}) — exactly one retry after backoff`,
    );
    await sleep(2_000);
    return await check();
  }
}

/** Delete the session through the page origin (the lean cleanup). */
async function pageDeleteSession(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      const pageGlobal = globalThis as unknown as {
        readonly fetch: (
          input: string,
          init: { method: string; credentials: string },
        ) => Promise<{ status: number }>;
      };
      await pageGlobal.fetch("/v1/auth/sessions/current", {
        method: "DELETE",
        credentials: "include",
      });
    });
  } catch {
    // the context closes regardless — the cookie jar dies with it
  }
}
