/**
 * Managed child-process group for the AISE root orchestrators (PROD-001).
 *
 * Bun-native orchestration — no external `concurrently`-style dependency:
 *
 * - `spawnChild` starts a child with inherited stdio so its output streams
 *   straight into the operator's terminal;
 * - `superviseGroup` keeps the group running until either (a) the parent
 *   receives SIGINT/SIGTERM — then every child is stopped (SIGTERM, with a
 *   SIGKILL fallback after a bounded timeout) and the supervisor exits 0 —
 *   or (b) a child exits on its own — then the remaining children are torn
 *   down and the supervisor exits with that child's exit code. One Ctrl-C
 *   tears the whole runtime down; a crashing component never leaves a
 *   half-running group behind.
 */

export interface SpawnSpec {
  /** Short name used in lifecycle log lines. */
  readonly name: string;
  readonly cmd: readonly string[];
  readonly cwd: string;
  /** Extra environment merged over the parent environment. */
  readonly env?: Readonly<Record<string, string>>;
}

export function spawnChild(spec: SpawnSpec): Bun.Subprocess {
  return Bun.spawn({
    cmd: [...spec.cmd],
    cwd: spec.cwd,
    env: spec.env === undefined ? process.env : { ...process.env, ...spec.env },
    stdout: "inherit",
    stderr: "inherit",
  });
}

export interface ManagedChild {
  readonly name: string;
  readonly proc: Bun.Subprocess;
}

export interface SuperviseOptions {
  /** How long to wait after SIGTERM before escalating to SIGKILL. */
  readonly stopTimeoutMs?: number;
}

const STOP_TIMEOUT_MS_DEFAULT = 5000;

const TIMEOUT = Symbol("timeout");

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([
    promise,
    new Promise<typeof TIMEOUT>((resolve) => {
      setTimeout(() => {
        resolve(TIMEOUT);
      }, ms).unref();
    }),
  ]);
}

async function stopChild(child: ManagedChild, stopTimeoutMs: number): Promise<void> {
  if (child.proc.exitCode !== null) {
    return;
  }
  child.proc.kill("SIGTERM");
  const exited = await withTimeout(child.proc.exited, stopTimeoutMs);
  if (exited === TIMEOUT && child.proc.exitCode === null) {
    child.proc.kill("SIGKILL");
    await child.proc.exited;
  }
}

async function teardown(children: readonly ManagedChild[], stopTimeoutMs: number): Promise<void> {
  // Signal first, then wait — so slow children get their full grace period in
  // parallel instead of sequentially after each sibling.
  for (const child of children) {
    if (child.proc.exitCode === null) {
      child.proc.kill("SIGTERM");
    }
  }
  for (const child of children) {
    await stopChild(child, stopTimeoutMs);
  }
}

function waitForFirstExit(
  children: readonly ManagedChild[],
): Promise<{ name: string; code: number | null }> {
  return new Promise((resolve) => {
    for (const child of children) {
      void child.proc.exited.then((code) => {
        resolve({ name: child.name, code });
      });
    }
  });
}

/**
 * Run until the group exits. Resolves with the process exit code the
 * orchestrator should propagate:
 *
 * - signal teardown (Ctrl-C) → 0;
 * - first child exit → that child's exit code (1 when it died from a signal).
 */
export async function superviseGroup(
  children: readonly ManagedChild[],
  label: string,
  options: SuperviseOptions = {},
): Promise<number> {
  const stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS_DEFAULT;

  const signalPromise = new Promise<string>((resolve) => {
    process.on("SIGINT", () => {
      resolve("SIGINT");
    });
    process.on("SIGTERM", () => {
      resolve("SIGTERM");
    });
  });

  const exitPromise = waitForFirstExit(children);

  const event = await Promise.race([
    signalPromise.then((signal) => ({ kind: "signal" as const, signal })),
    exitPromise.then((exit) => ({ kind: "exit" as const, exit })),
  ]);

  if (event.kind === "signal") {
    console.log(`${label}: received ${event.signal} — stopping ${children.map((c) => c.name).join(" and ")}`);
    await teardown(children, stopTimeoutMs);
    console.log(`${label}: stopped`);
    return 0;
  }

  const { name, code } = event.exit;
  const exitCode = code ?? 1;
  console.error(`${label}: ${name} exited with code ${exitCode} — stopping the rest`);
  await teardown(
    children.filter((child) => child.proc.exitCode === null),
    stopTimeoutMs,
  );
  return exitCode;
}
