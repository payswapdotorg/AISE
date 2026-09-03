/**
 * Reconstruction service composition tests (AISE-008).
 *
 * Prove the production-default wiring is fail-closed where the
 * foundation has no real binding (capture source unbound, no
 * geometry engine) and that injected bindings flow end-to-end.
 */
import { describe, expect, it } from "vitest";
import type { AiseConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildReconstructionService } from "./runtime.js";
import { createStaticCaptureSource } from "./capture/source.js";
import type { ReconstructionEngine, ReconstructionOutput } from "./reconstruction/engine.js";
import { buildUpload } from "./testing/test-uploads.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

const CONFIG: AiseConfig = {
  env: "test",
  logLevel: "error",
  api: { host: "127.0.0.1", port: 8080 },
  worker: { pollIntervalMs: 10 },
};

function quietLogger() {
  return createLogger({ level: "error", module: "reconstruction-runtime-test", sink: () => undefined });
}

describe("buildReconstructionService production defaults (fail closed)", () => {
  it("wires a runner and a state store", () => {
    const service = buildReconstructionService(CONFIG, quietLogger());
    expect(service.runner).toBeDefined();
    expect(service.stateStore.kind).toBe("memory");
  });

  it("default capture source refuses to answer (no fabricated ingestion state)", async () => {
    const service = buildReconstructionService(CONFIG, quietLogger());
    const enqueued = service.runner.enqueue("reconstruction.preprocess_session", SESSION);
    await service.runner.drain();

    const job = service.runner.getJob(enqueued.id);
    expect(job?.state).toBe("FAILED");
    expect(job?.failure?.code).toBe("CAPTURE_SOURCE_UNAVAILABLE");
    expect(service.stateStore.latestPreprocessedSession(SESSION)).toBeUndefined();
  });

  it("default composition has no geometry engine: reconstruction fails closed even with a source", async () => {
    const service = buildReconstructionService(CONFIG, quietLogger(), {
      source: createStaticCaptureSource([
        buildUpload({ sessionId: SESSION, assetId: "a-asset" }),
      ]),
    });
    const enqueued = service.runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await service.runner.drain();

    const job = service.runner.getJob(enqueued.id);
    expect(job?.state).toBe("FAILED");
    // Preprocessing is real and ran; the geometry stage is the
    // fail-closed placeholder.
    expect(job?.failure?.code).toBe("NO_RECONSTRUCTION_ENGINE");
    expect(service.stateStore.latestPreprocessedSession(SESSION)).toBeDefined();
    expect(service.stateStore.listArtifactsForSession(SESSION)).toEqual([]);
  });
});

describe("buildReconstructionService with injected bindings", () => {
  it("runs the full chain when source and engine are provided", async () => {
    const engine: ReconstructionEngine = {
      id: "test-engine/1",
      reconstruct: (): ReconstructionOutput => ({
        status: "succeeded",
        points: [{ x: 0, y: 0, z: 1 }],
        method: "test/1",
      }),
    };
    const stateStoreKind = "memory";
    const service = buildReconstructionService(CONFIG, quietLogger(), {
      source: createStaticCaptureSource([
        buildUpload({ sessionId: SESSION, assetId: "a-asset", orientation: { x: 0, y: 0, z: 0, w: 1 } }),
      ]),
      reconstructionEngine: engine,
    });
    const enqueued = service.runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await service.runner.drain();

    expect(service.runner.getJob(enqueued.id)?.state).toBe("SUCCEEDED");
    expect(service.stateStore.kind).toBe(stateStoreKind);
    expect(service.stateStore.sessionReconstruction(SESSION)).toMatchObject({
      pointCloudCount: 1,
      sceneCount: 1,
    });
  });
});
