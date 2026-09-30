/**
 * ANCHOR-002 — the AISE-side supervised subprocess runner.
 *
 * The GBIM-004 pattern, implemented for the anchoring port: the provider is
 * a SUBPROCESS over a stdio JSON boundary (the process boundary IS the
 * "no provider type crosses" law's physical enforcement — a provider's
 * handles physically cannot cross it), and the AISE side SUPERVISES:
 *
 *   - the request is canonicalized to deterministic bytes (canonical JSON,
 *     sorted keys) whose sha-256 INPUT DIGEST is recorded in the result —
 *     and the provider's echoed `provenance.inputDigest` must equal it (a
 *     mismatch is the typed `input-digest-mismatch` failure: the runner
 *     re-verifies what the provider claims to have consumed);
 *   - a TIMEOUT is enforced with an explicit supervision timer that kills
 *     the provider with SIGKILL (kernel-guaranteed — a provider that
 *     defers or ignores SIGTERM cannot outlive its supervision); a
 *     timed-out provider is the typed `timeout` failure, bounded, never a
 *     hang;
 *   - the stdout payload must be JSON (else `invalid-json`) and must PASS
 *     the closed-vocabulary output guard (else `guard-refused` with every
 *     typed violation) — nothing ungated becomes anchoring evidence;
 *   - a non-zero exit or a spawn failure is typed (`nonzero-exit`,
 *     `spawn-failed`) with a bounded stderr excerpt.
 *
 * Every failure is TYPED and bounded (the closed runner vocabulary —
 * vocabularies.ts); wall time is an observation recorded in the result, and
 * the runner itself never fabricates a response: on failure there is no
 * response at all.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { AnchoringRequest } from "./request";
import type { AnchoringResponse } from "./response";
import { guardAnchoringResponse, type AnchoringGuardViolation } from "./guard";
import type { AnchoringRunnerFailureKind } from "./vocabularies";

/** The supervision options: the provider command, its argv, the timeout. */
export interface SupervisedRunnerOptions {
  /** The provider executable (e.g. a python or bun interpreter path). */
  readonly command: string;
  /** The provider argv (e.g. the adapter script path). */
  readonly args?: readonly string[];
  /** The supervision timeout in milliseconds (enforced, bounded). */
  readonly timeoutMs: number;
  /** Optional working directory for the subprocess. */
  readonly cwd?: string;
  /** Optional extra environment for the subprocess. */
  readonly env?: Readonly<Record<string, string>>;
}

/** One typed, bounded runner failure (closed vocabulary). */
export interface AnchoringRunnerFailure {
  readonly kind: AnchoringRunnerFailureKind;
  readonly detail: string;
  /** Present only on guard-refused: every typed guard violation. */
  readonly violations?: readonly AnchoringGuardViolation[];
}

/** The supervised run's success record. */
export interface AnchoringRunnerSuccess {
  readonly ok: true;
  /** The guarded provider response (it passed the output guard). */
  readonly response: AnchoringResponse;
  /** sha-256 over the exact canonical request bytes written to stdin. */
  readonly inputDigest: string;
  /** Wall-clock observation (excluded from digests — performance, not semantics). */
  readonly wallMs: number;
}

/** The supervised run's failure record. */
export interface AnchoringRunnerFailureRecord {
  readonly ok: false;
  readonly failure: AnchoringRunnerFailure;
  /** The recorded input digest — recorded even on failure (the audit trail). */
  readonly inputDigest: string;
  /** Wall-clock observation to the failure point. */
  readonly wallMs: number;
}

export type SupervisedAnchoringRun = AnchoringRunnerSuccess | AnchoringRunnerFailureRecord;

const STDERR_EXCERPT_LIMIT = 2000;

/** sha-256 (lowercase hex, no prefix) over the canonical request bytes. */
export function anchoringInputDigestOf(request: AnchoringRequest): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(request), "utf8")
    .digest("hex");
}

/**
 * Runs the provider subprocess under supervision and guards its output.
 * The gate's OUTCOME is deterministic: the same request bytes and the same
 * provider behavior produce the same typed result (wall time is an
 * observation, never a semantic).
 */
export async function runSupervisedAnchoring(
  request: AnchoringRequest,
  options: SupervisedRunnerOptions,
): Promise<SupervisedAnchoringRun> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("runSupervisedAnchoring: timeoutMs must be a positive finite number");
  }
  const stdinBytes = canonicalJsonStringify(request);
  const inputDigest = createHash("sha256").update(stdinBytes, "utf8").digest("hex");
  const started = Date.now();

  let timedOut = false;
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    proc = Bun.spawn({
      cmd: [options.command, ...(options.args ?? [])],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined
        ? {}
        : { env: { ...process.env, ...options.env } as Record<string, string> }),
    });
  } catch (error) {
    return {
      ok: false,
      inputDigest,
      wallMs: Date.now() - started,
      failure: {
        kind: "spawn-failed",
        detail: `provider spawn failed: ${(error as Error).message}`,
      },
    };
  }

  // The supervision timer: SIGKILL is kernel-guaranteed — a provider that
  // defers or ignores SIGTERM cannot outlive its supervision.
  const timer = setTimeout(() => {
    timedOut = true;
    proc?.kill("SIGKILL");
  }, options.timeoutMs);
  timer.unref?.();

  const stdinSink = proc.stdin as Bun.FileSink;
  stdinSink.write(stdinBytes);
  stdinSink.end();

  let stdout: string;
  let stderr: string;
  let exitCode: number | null;
  try {
    const stdoutStream = proc.stdout as ReadableStream<Uint8Array>;
    const stderrStream = proc.stderr as ReadableStream<Uint8Array>;
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(stdoutStream).text(),
      new Response(stderrStream).text(),
    ]);
    exitCode = code;
    stdout = out;
    stderr = err;
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      inputDigest,
      wallMs: Date.now() - started,
      failure: {
        kind: timedOut ? "timeout" : "spawn-failed",
        detail: timedOut
          ? `provider exceeded the supervised timeout of ${options.timeoutMs} ms and was terminated`
          : `provider supervision failed: ${(error as Error).message}`,
      },
    };
  }
  clearTimeout(timer);
  const wallMs = Date.now() - started;

  if (timedOut) {
    return {
      ok: false,
      inputDigest,
      wallMs,
      failure: {
        kind: "timeout",
        detail:
          `provider exceeded the supervised timeout of ${options.timeoutMs} ms and was terminated ` +
          `(SIGKILL — the supervision is bounded, never a hang)`,
      },
    };
  }
  if (exitCode !== 0) {
    const excerpt = stderr.slice(0, STDERR_EXCERPT_LIMIT);
    return {
      ok: false,
      inputDigest,
      wallMs,
      failure: {
        kind: "nonzero-exit",
        detail: `provider exited with code ${exitCode ?? "unknown"}${excerpt.length > 0 ? `: ${excerpt}` : ""}`,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    return {
      ok: false,
      inputDigest,
      wallMs,
      failure: {
        kind: "invalid-json",
        detail: `provider stdout is not valid JSON: ${(error as Error).message}`,
      },
    };
  }

  const violations = guardAnchoringResponse(parsed, request);
  if (violations.length > 0) {
    return {
      ok: false,
      inputDigest,
      wallMs,
      failure: {
        kind: "guard-refused",
        detail: `the provider response was refused by the AISE-side guard (${violations.length} violation(s))`,
        violations,
      },
    };
  }
  const response = parsed as AnchoringResponse;

  // The runner re-verifies the provider's echoed input digest against the
  // exact bytes it wrote to stdin (the supervision audit).
  const echoed = response.provenance.inputDigest.replace(/^sha256:/, "");
  if (echoed !== inputDigest) {
    return {
      ok: false,
      inputDigest,
      wallMs,
      failure: {
        kind: "input-digest-mismatch",
        detail:
          `provider echoed inputDigest ${response.provenance.inputDigest} but the supervised ` +
          `runner wrote (and digested) different request bytes (sha256:${inputDigest})`,
      },
    };
  }

  return { ok: true, response, inputDigest, wallMs };
}
