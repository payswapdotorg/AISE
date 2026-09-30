/**
 * ANCHOR-002 tests — the supervised subprocess runner (the GBIM-004
 * pattern): input digest recorded; timeout enforced; output guarded; every
 * failure typed and bounded. The provider subprocess is a real bun process
 * over the stdio JSON boundary — the process boundary is the law's
 * physical enforcement.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSupervisedAnchoring, anchoringInputDigestOf } from "./runner";
import { fixtureRequest } from "./test-fixtures";
import { ANCHORING_PORT_VERSION } from "./anchoring-contracts.version";

/**
 * The disposable test provider: reads the EXACT stdin bytes, re-hashes them
 * (the content-addressing echo), and answers a lawful ANCHORED response for
 * every requested still. Mode "wrong-digest" echoes a fabricated digest
 * (the input-digest-mismatch drill); the response is otherwise lawful.
 */
const PROVIDER_SOURCE = `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const raw = readFileSync(0);
const request = JSON.parse(raw.toString("utf8"));
const mode = process.argv[2] ?? "ok";
const digest = createHash("sha256").update(raw).digest("hex");
const response = {
  schemaVersion: 1,
  portVersion: "${ANCHORING_PORT_VERSION}",
  contractVersion: "1.0.0",
  executionId: request.executionId,
  status: "anchored",
  reasonCode: null,
  provenance: {
    providerId: "test-anchoring-provider",
    providerVersion: "test-adapter/1",
    platform: "Linux x86_64",
    inputDigest: "sha256:" + (mode === "wrong-digest" ? "0".repeat(64) : digest),
    adapterSourceDigest: "sha256:" + "1".repeat(64),
    components: [
      { name: "testcv", version: "1.0.0" },
      { name: "python", version: "3.12.14" },
    ],
    config: { ...request.policy },
    externalReferences: { providerRunId: "provider-internal-run-42" },
  },
  hypotheses: request.evidence.map((evidence) => ({
    evidenceContentId: evidence.contentId,
    representation: "plan-homography",
    transform: {
      frameFrom: "plan-raster-px",
      frameTo: "still-px",
      matrix: [
        [1.0001205, -0.0000231, 12.5],
        [0.0000198, 0.9999871, -4.25],
        [1.2e-7, -3.4e-8, 1],
      ],
    },
    inlierCount: 42,
    matchCount: 180,
    inlierRatio: 0.2333,
    residualRmsPx: 1.4,
    uncertainty: {
      floorRmsM: 0.0065,
      budget95M: 0.0128,
      basis: "inlier-residual-first-order-v2.1 (test provider declaration)",
    },
    confidence: 0.92,
    epistemicLabel: "INFERRED",
    crossValidation: [],
  })),
  executionTimeMs: 5.0,
};
process.stdout.write(JSON.stringify(response));
`;

const PROVIDER_DIR = mkdtempSync(join(tmpdir(), "anchor002-runner-"));
const PROVIDER_PATH = join(PROVIDER_DIR, "provider.ts");
writeFileSync(PROVIDER_PATH, PROVIDER_SOURCE);

function providerOptions(mode: string, timeoutMs = 30000): {
  command: string;
  args: string[];
  timeoutMs: number;
} {
  return { command: process.execPath, args: [PROVIDER_PATH, mode], timeoutMs };
}

describe("the supervised subprocess runner", () => {
  test("the happy path: the guarded response returns with its input digest recorded", async () => {
    const request = fixtureRequest("anchor002-runner-run-001");
    const run = await runSupervisedAnchoring(request, providerOptions("ok"));
    expect(run.ok).toBe(true);
    if (run.ok) {
      expect(run.response.status).toBe("anchored");
      expect(run.response.hypotheses).toHaveLength(request.evidence.length);
      expect(run.response.executionId).toBe(request.executionId);
      expect(run.inputDigest).toBe(anchoringInputDigestOf(request));
      // the provider's echoed digest equals the runner's recorded one (the audit)
      expect(run.response.provenance.inputDigest).toBe(`sha256:${run.inputDigest}`);
      expect(run.wallMs).toBeGreaterThanOrEqual(0);
    }
  });

  test("the input digest is deterministic (same request bytes, same digest)", () => {
    expect(anchoringInputDigestOf(fixtureRequest("same"))).toBe(
      anchoringInputDigestOf(fixtureRequest("same")),
    );
    expect(anchoringInputDigestOf(fixtureRequest("a"))).not.toBe(
      anchoringInputDigestOf(fixtureRequest("b")),
    );
  });

  test("a timeout is enforced and typed (bounded termination, never a hang)", async () => {
    const request = fixtureRequest("anchor002-runner-timeout");
    const run = await runSupervisedAnchoring(request, {
      command: process.execPath,
      args: [
        "-e",
        "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);",
      ],
      timeoutMs: 250,
    });
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.failure.kind).toBe("timeout");
      expect(run.failure.detail).toContain("250");
      // SIGKILL is kernel-guaranteed: the run is bounded well under the child's own 60 s block
      expect(run.wallMs).toBeLessThan(10000);
      // the input digest is recorded even on failure (the audit trail)
      expect(run.inputDigest).toBe(anchoringInputDigestOf(request));
    }
  });

  test("a provider command that cannot spawn is typed (spawn-failed)", async () => {
    const run = await runSupervisedAnchoring(fixtureRequest("anchor002-runner-spawn"), {
      command: "/nonexistent/anchor002/provider-binary",
      args: [],
      timeoutMs: 5000,
    });
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.failure.kind).toBe("spawn-failed");
    }
  });

  test("a non-zero exit is typed with a bounded stderr excerpt", async () => {
    const run = await runSupervisedAnchoring(fixtureRequest("anchor002-runner-exit"), {
      command: process.execPath,
      args: ["-e", 'process.stderr.write("boom"); process.exit(3);'],
      timeoutMs: 10000,
    });
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.failure.kind).toBe("nonzero-exit");
      expect(run.failure.detail).toContain("3");
    }
  });

  test("invalid JSON output is typed (nothing ungated becomes evidence)", async () => {
    const run = await runSupervisedAnchoring(fixtureRequest("anchor002-runner-json"), {
      command: process.execPath,
      args: ["-e", 'process.stdout.write("not json at all");'],
      timeoutMs: 10000,
    });
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.failure.kind).toBe("invalid-json");
    }
  });

  test("a guard-violating response is typed with every violation carried (provider handle leak)", async () => {
    const run = await runSupervisedAnchoring(fixtureRequest("anchor002-runner-guard"), {
      command: process.execPath,
      args: [
        "-e",
        `process.stdout.write(JSON.stringify({ schemaVersion: 1, portVersion: "${ANCHORING_PORT_VERSION}", contractVersion: "1.0.0", executionId: "x", status: "anchored", reasonCode: null, provenance: { providerId: "p", providerVersion: "v", platform: "Linux x86_64", inputDigest: "sha256:" + "1".repeat(64), adapterSourceDigest: "sha256:" + "2".repeat(64), components: [{ name: "c", version: "1" }], config: {} }, hypotheses: [{ siftKeyPointHandle: 17 }], executionTimeMs: 1, mysteryTop: true }));`,
      ],
      timeoutMs: 10000,
    });
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.failure.kind).toBe("guard-refused");
      const violations = run.failure.violations ?? [];
      expect(violations.some((v) => v.code === "unknown-field" && v.path === "mysteryTop")).toBe(true);
      expect(
        violations.some((v) => v.code === "unknown-field" && v.path === "hypotheses[0].siftKeyPointHandle"),
      ).toBe(true);
    }
  });

  test("a fabricated input digest echo is typed (the runner re-verifies what it wrote)", async () => {
    const request = fixtureRequest("anchor002-runner-digest");
    const run = await runSupervisedAnchoring(request, providerOptions("wrong-digest"));
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.failure.kind).toBe("input-digest-mismatch");
      expect(run.failure.detail).toContain(anchoringInputDigestOf(request).slice(0, 16));
    }
  });

  test("a non-positive timeout is refused by contract (never an unbounded supervision)", () => {
    expect(() =>
      runSupervisedAnchoring(fixtureRequest("anchor002-runner-badtimeout"), {
        command: process.execPath,
        args: [PROVIDER_PATH, "ok"],
        timeoutMs: 0,
      }),
    ).toThrow(/positive finite number/);
  });
});
