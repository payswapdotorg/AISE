/**
 * Reconstruction orchestrator tests (AISE-010): provider selection trace,
 * input characterization (explicit insufficient-input states), deterministic
 * lifecycle with retries, artifact lifecycle/immutability, imagination
 * labeling, and byte-level determinism.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify, type Evidence } from "@aise/shared-contracts";
import { createLogger } from "../lib/log";
import { createEvidenceService } from "../evidence/service";
import { InMemoryEvidenceStore } from "../evidence/store";
import { createReconstructionOrchestrator, evidenceServiceReader, OrchestratorError, type OrchestratorDeps } from "./orchestrator";
import { InMemoryArtifactStore, InMemoryJobStore, FsArtifactStore, FsJobStore, type JobEvent, type JobRecord } from "./store";
import type { ReconstructionProvider } from "./contract";
import {
  FakeMeshProvider,
  FakeProvider,
  FailingProvider,
  FlakyProvider,
  ImaginationProvider,
  InvalidOutputProvider,
  PartialProvider,
  UnavailableProvider,
  contentIdOf,
  evSummary,
  fixedClock,
  makeDescriptor,
  makeRequest,
  readerOver,
  sequencedIdFactory,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

/** Fresh in-memory wiring with the given providers (deterministic ids/clock). */
function orchestratorWith(
  providers: readonly ReconstructionProvider[],
  extra?: Partial<OrchestratorDeps>,
) {
  return createReconstructionOrchestrator({
    providers,
    jobStore: new InMemoryJobStore(),
    artifactStore: new InMemoryArtifactStore(),
    clock: fixedClock,
    idFactory: sequencedIdFactory("id"),
    logger: quietLogger,
    ...extra,
  });
}

function eventsOf(record: JobRecord, type: JobEvent["type"]): JobEvent[] {
  return record.events.filter((event) => event.type === type);
}

/* ------------------------------------------------------------------ */
/* 1. Provider selection trace                                          */
/* ------------------------------------------------------------------ */

describe("provider selection trace", () => {
  test("records capability, availability and input-modality filter reasons; first match wins", async () => {
    const meshOnly = new FakeMeshProvider(
      makeDescriptor({ providerId: "mesh-first", supportedOutputModalities: ["mesh", "depth_maps"] }),
    );
    const lackingRep = new FakeMeshProvider(
      makeDescriptor({ providerId: "no-depth", supportedOutputModalities: ["mesh"] }),
    );
    const unavailable = new UnavailableProvider("UNAVAILABLE", {
      providerId: "offline",
      supportedOutputModalities: ["mesh", "depth_maps"],
    });
    const accessRequired = new UnavailableProvider("ACCESS_REQUIRED", {
      providerId: "gated",
      supportedOutputModalities: ["mesh", "depth_maps"],
    });
    const lackingModality = new FakeMeshProvider(
      makeDescriptor({
        providerId: "no-video",
        supportedOutputModalities: ["mesh", "depth_maps"],
        supportedInputModalities: ["still_image"],
      }),
    );
    const orchestrator = orchestratorWith([lackingRep, unavailable, accessRequired, lackingModality, meshOnly]);

    const request = makeRequest({
      requestedRepresentations: ["mesh", "depth_maps"],
      evidenceSeeds: ["frame-001"],
      declaredInputModalities: ["still_image", "video"],
    });
    const record = await orchestrator.submit(request);

    expect(record.state).toBe("dispatching");
    expect(record.selectedProviderId).toBe("mesh-first");
    const trace = record.selection ?? { evaluated: [] };
    expect(trace.evaluated.map((entry) => entry.providerId)).toEqual([
      "no-depth",
      "offline",
      "gated",
      "no-video",
      "mesh-first",
    ]);
    const byId = new Map(trace.evaluated.map((entry) => [entry.providerId, entry]));
    expect(byId.get("no-depth")?.filteredOut).toBe(true);
    expect(byId.get("no-depth")?.reasons).toEqual(["output_representation_unsupported:depth_maps"]);
    expect(byId.get("offline")?.filteredOut).toBe(true);
    expect(byId.get("offline")?.reasons).toEqual(["availability:UNAVAILABLE"]);
    expect(byId.get("gated")?.filteredOut).toBe(true);
    expect(byId.get("gated")?.reasons).toEqual(["availability:ACCESS_REQUIRED"]);
    expect(byId.get("no-video")?.filteredOut).toBe(true);
    expect(byId.get("no-video")?.reasons).toEqual(["input_modality_unsupported:video"]);
    expect(byId.get("mesh-first")?.filteredOut).toBe(false);
    expect(byId.get("mesh-first")?.reasons).toEqual([]);
    // The journal versions the strategy decision.
    expect(eventsOf(record, "provider_selected")[0]).toMatchObject({
      providerId: "mesh-first",
      evaluatedProviders: 5,
    });
  });

  test("no providers at all -> explicit UNAVAILABLE failure with remediation note", async () => {
    const orchestrator = orchestratorWith([]);
    const record = await orchestrator.submit(makeRequest());
    expect(record.state).toBe("failed");
    expect(record.failure?.code).toBe("UNAVAILABLE");
    expect(record.failure?.remediation.join(" ")).toContain("no reconstruction provider is registered");
    expect(eventsOf(record, "selection_failed").length).toBe(1);
    expect(record.selection?.evaluated).toEqual([]);
  });

  test("capable providers but none READY/compatible -> UNAVAILABLE with capability remediation", async () => {
    const orchestrator = orchestratorWith([new UnavailableProvider()]);
    const record = await orchestrator.submit(makeRequest({ requestedRepresentations: ["point_cloud"] }));
    expect(record.state).toBe("failed");
    expect(record.failure?.code).toBe("UNAVAILABLE");
    expect(record.failure?.remediation[0] ?? "").toContain("no READY provider supports representations [point_cloud]");
    // The trace still records WHY every provider was filtered out.
    expect(record.selection?.evaluated[0]?.reasons).toEqual(["availability:UNAVAILABLE"]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Input characterization                                            */
/* ------------------------------------------------------------------ */

describe("input characterization (explicit insufficient-input states)", () => {
  test("missing evidence id -> INPUT_INCOMPATIBLE naming the id (with reader)", async () => {
    const missing = contentIdOf("frame-002");
    const reader = readerOver({
      [contentIdOf("frame-001")]: evSummary("STILL_IMAGERY"),
    });
    const orchestrator = orchestratorWith([new FakeMeshProvider()], { evidenceReader: reader });
    const record = await orchestrator.submit(
      makeRequest({ evidenceContentIds: [contentIdOf("frame-001"), missing] }),
    );
    expect(record.state).toBe("failed");
    expect(record.failure?.code).toBe("INPUT_INCOMPATIBLE");
    expect(record.failure?.missingEvidenceIds).toEqual([missing]);
    expect(record.failure?.detail).toContain(missing);
    expect(eventsOf(record, "characterization_rejected").length).toBe(1);
    // No dispatch ever happens for an incompatible input job.
    expect(eventsOf(record, "dispatch_started").length).toBe(0);
  });

  test("invalidated evidence -> INPUT_INCOMPATIBLE with remediation hints", async () => {
    const invalidated = contentIdOf("depth-frame");
    const reader = readerOver({
      [contentIdOf("frame-001")]: evSummary("STILL_IMAGERY"),
      [invalidated]: evSummary("DEPTH_SENSING", "image/depth", true),
    });
    const orchestrator = orchestratorWith([new FakeMeshProvider()], { evidenceReader: reader });
    const record = await orchestrator.submit(
      makeRequest({ evidenceContentIds: [contentIdOf("frame-001"), invalidated] }),
    );
    expect(record.state).toBe("failed");
    expect(record.failure?.invalidatedEvidenceIds).toEqual([invalidated]);
    expect(record.failure?.detail).toContain(invalidated);
    // Advisory remediation names methods for the modalities the request needs.
    const joined = record.failure?.remediation.join(" | ") ?? "";
    expect(joined).toContain("STILL_IMAGERY");
    expect(joined).toContain("still_image");
    expect(joined).toContain("DEPTH_SENSING");
    expect(joined).toContain("depth_map");
  });

  test("without a reader -> structural-only characterization, recorded as such", async () => {
    const orchestrator = orchestratorWith([new FakeMeshProvider()]);
    const record = await orchestrator.submit(
      makeRequest({ declaredInputModalities: ["still_image"] }),
    );
    expect(record.state).toBe("dispatching");
    expect(record.characterization?.mode).toBe("structural");
    expect(record.characterization?.evidenceCount).toBe(3);
    expect(record.characterization?.modalities).toEqual(["still_image"]);
    expect(record.characterization?.note).toContain("structural characterization only");
    expect(record.characterization?.note).toContain("no evidence reader is wired");
  });

  test("with a reader -> evidential characterization with derived modalities", async () => {
    const reader = readerOver({
      [contentIdOf("frame-001")]: evSummary("STILL_IMAGERY"),
      [contentIdOf("clip-001")]: evSummary("VIDEO_FOOTAGE", "video/mp4"),
      [contentIdOf("answer-001")]: evSummary("HUMAN_ANSWER", "application/json"),
    });
    const orchestrator = orchestratorWith([new FakeMeshProvider()], { evidenceReader: reader });
    const record = await orchestrator.submit(
      makeRequest({
        evidenceContentIds: [contentIdOf("frame-001"), contentIdOf("clip-001"), contentIdOf("answer-001")],
      }),
    );
    expect(record.characterization?.mode).toBe("evidential");
    expect(record.characterization?.modalities).toEqual(["still_image", "video"]);
    // Evidence with no derivable reconstruction modality is named, not guessed.
    expect(record.characterization?.unknownModalityEvidenceIds).toEqual([contentIdOf("answer-001")]);
  });

  test("evidenceServiceReader adapts the real evidence service (read-only integration)", async () => {
    const evidenceService = createEvidenceService({
      store: new InMemoryEvidenceStore(),
      clock: fixedClock,
    });
    const goodSeed = "adapter-good";
    const badSeed = "adapter-bad";
    const good: Evidence = {
      contractVersion: "1.0.0",
      contentId: contentIdOf(goodSeed),
      byteSize: 2048,
      mediaType: "image/jpeg",
      capturedAt: "2026-01-15T09:36:12.000Z",
      acquisitionMethod: "STILL_IMAGERY",
      acquisitionMetadata: { "session.id": "session-1" },
    };
    const bad: Evidence = {
      ...good,
      contentId: contentIdOf(badSeed),
      acquisitionMethod: "VIDEO_FOOTAGE",
      mediaType: "video/mp4",
    };
    await evidenceService.registerEvidence(good);
    await evidenceService.registerEvidence(bad);
    await evidenceService.invalidateEvidence(contentIdOf(badSeed), "operator recall");

    const orchestrator = createReconstructionOrchestrator({
      providers: [new FakeMeshProvider()],
      jobStore: new InMemoryJobStore(),
      artifactStore: new InMemoryArtifactStore(),
      clock: fixedClock,
      idFactory: sequencedIdFactory("id"),
      evidenceReader: evidenceServiceReader(evidenceService),
      logger: quietLogger,
    });
    const record = await orchestrator.submit(
      makeRequest({ evidenceContentIds: [contentIdOf(goodSeed), contentIdOf(badSeed)] }),
    );
    expect(record.state).toBe("failed");
    expect(record.failure?.code).toBe("INPUT_INCOMPATIBLE");
    expect(record.failure?.invalidatedEvidenceIds).toEqual([contentIdOf(badSeed)]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Lifecycle                                                         */
/* ------------------------------------------------------------------ */

describe("lifecycle state machine", () => {
  test("happy path: queued -> characterizing -> dispatching -> running -> succeeded (journal)", async () => {
    const provider = new FakeMeshProvider();
    const orchestrator = orchestratorWith([provider]);
    let record = await orchestrator.submit(makeRequest());
    expect(record.state).toBe("dispatching");
    // Drive step-by-step: exactly one transition per call.
    record = await orchestrator.step(record.jobId);
    expect(record.state).toBe("running");
    expect(provider.executeCount).toBe(0);
    record = await orchestrator.step(record.jobId);
    expect(record.state).toBe("succeeded");
    expect(provider.executeCount).toBe(1);
    // Step on a terminal state is inert.
    expect((await orchestrator.step(record.jobId)).state).toBe("succeeded");
    // The journal records the full deterministic path.
    expect(record.events.map((event) => event.type)).toEqual([
      "submitted",
      "characterized",
      "provider_selected",
      "dispatch_started",
      "attempt_succeeded",
    ]);
  });

  test("retry loop: flaky provider fails twice then succeeds; attempts journaled", async () => {
    const provider = new FlakyProvider(2);
    const orchestrator = orchestratorWith([provider]);
    const record = await orchestrator.runToCompletion(
      (await orchestrator.submit(makeRequest({ maxRetries: 2 }))).jobId,
    );
    expect(record.state).toBe("succeeded");
    expect(record.attemptCount).toBe(3);
    expect(provider.executeCount).toBe(3);
    const failures = eventsOf(record, "attempt_failed");
    expect(failures.map((event) => (event as { attempt: number }).attempt)).toEqual([1, 2]);
    expect(failures.every((event) => (event as { willRetry: boolean }).willRetry)).toBe(true);
    expect((eventsOf(record, "attempt_succeeded")[0] as { attempt: number }).attempt).toBe(3);
    expect(record.artifactIds.length).toBe(1);
  });

  test("retry budget exhausted -> failed with exhausted detail", async () => {
    const provider = new FlakyProvider(99);
    const orchestrator = orchestratorWith([provider]);
    const record = await orchestrator.runToCompletion(
      (await orchestrator.submit(makeRequest({ maxRetries: 1 }))).jobId,
    );
    expect(record.state).toBe("failed");
    expect(record.attemptCount).toBe(2);
    expect(record.failure?.code).toBe("EXECUTION_FAILED");
    expect(record.failure?.detail).toContain("retry budget exhausted after 2 attempt(s)");
  });

  test("terminal failure codes never retry", async () => {
    for (const code of ["INPUT_INCOMPATIBLE", "UNAVAILABLE", "ACCESS_REQUIRED", "OUTPUT_INVALID", "QUALITY_INSUFFICIENT"] as const) {
      const provider = new FailingProvider(code);
      const orchestrator = orchestratorWith([provider]);
      const record = await orchestrator.runToCompletion(
        (await orchestrator.submit(makeRequest({ maxRetries: 5 }))).jobId,
      );
      expect(record.state).toBe("failed");
      expect(record.failure?.code).toBe(code);
      expect(record.attemptCount).toBe(1);
      expect(provider.executeCount).toBe(1);
      expect((eventsOf(record, "attempt_failed")[0] as { willRetry: boolean }).willRetry).toBe(false);
    }
  });

  test("RESOURCE_INSUFFICIENT is transient and retries", async () => {
    const provider = new FlakyProvider(1, "RESOURCE_INSUFFICIENT");
    const orchestrator = orchestratorWith([provider]);
    const record = await orchestrator.runToCompletion(
      (await orchestrator.submit(makeRequest({ maxRetries: 3 }))).jobId,
    );
    expect(record.state).toBe("succeeded");
    expect(record.attemptCount).toBe(2);
  });

  test("provider-reported INPUT_INCOMPATIBLE surfaces missing evidence ids", async () => {
    const missing = contentIdOf("provider-says-missing");
    const provider = new FakeProvider({ providerId: "picky-engine" }, [
      { kind: "failure", code: "INPUT_INCOMPATIBLE", detail: "unsupported evidence mix", missingEvidenceIds: [missing] },
    ]);
    const orchestrator = orchestratorWith([provider]);
    const record = await orchestrator.runToCompletion(
      (
        await orchestrator.submit(
          makeRequest({
            declaredInputModalities: ["still_image"],
            evidenceContentIds: [contentIdOf("frame-001")],
          }),
        )
      ).jobId,
    );
    expect(record.state).toBe("failed");
    expect(record.failure?.code).toBe("INPUT_INCOMPATIBLE");
    expect(record.failure?.missingEvidenceIds).toEqual([missing]);
    expect(record.failure?.detail).toContain("unsupported evidence mix");
  });

  test("partial outcome -> job partial with artifacts still recorded", async () => {
    const provider = new PartialProvider();
    const orchestrator = orchestratorWith([provider]);
    const record = await orchestrator.runToCompletion(
      (await orchestrator.submit(makeRequest())).jobId,
    );
    expect(record.state).toBe("partial");
    expect(record.partialDetail).toContain("60%");
    expect(record.artifactIds.length).toBe(1);
    expect(eventsOf(record, "attempt_partial").length).toBe(1);
  });

  test("OUTPUT_INVALID: bad epistemic label, foreign evidence, unknown representation", async () => {
    for (const mode of ["bad-label", "foreign-evidence", "bad-representation"] as const) {
      const orchestrator = orchestratorWith([new InvalidOutputProvider(mode)]);
      const record = await orchestrator.runToCompletion(
        (await orchestrator.submit(makeRequest())).jobId,
      );
      expect(record.state).toBe("failed");
      expect(record.failure?.code).toBe("OUTPUT_INVALID");
      expect(eventsOf(record, "output_invalid").length).toBe(1);
    }
  });

  test("cancel() from active states; terminal jobs are inert", async () => {
    const provider = new FakeMeshProvider();
    const orchestrator = orchestratorWith([provider]);

    // Cancel while dispatching.
    let record = await orchestrator.submit(makeRequest());
    record = await orchestrator.cancel(record.jobId);
    expect(record.state).toBe("cancelled");
    expect((eventsOf(record, "job_cancelled")[0] as { fromState: string }).fromState).toBe("dispatching");
    // Steps and runs no longer advance a cancelled job.
    expect((await orchestrator.step(record.jobId)).state).toBe("cancelled");
    expect((await orchestrator.runToCompletion(record.jobId)).state).toBe("cancelled");
    expect(provider.executeCount).toBe(0);

    // Cancel while running.
    const second = await orchestrator.submit(makeRequest());
    await orchestrator.step(second.jobId);
    expect((await orchestrator.cancel(second.jobId)).state).toBe("cancelled");

    // Cancelling a finished job is a no-op.
    const third = await orchestrator.submit(makeRequest());
    const done = await orchestrator.runToCompletion(third.jobId);
    expect((await orchestrator.cancel(done.jobId)).state).toBe("succeeded");
  });

  test("rerun: new artifact version, old artifacts intact; failed jobs are not rerunnable", async () => {
    const provider = new FakeMeshProvider();
    const orchestrator = orchestratorWith([provider]);
    const jobId = (await orchestrator.submit(makeRequest())).jobId;
    const first = await orchestrator.runToCompletion(jobId);
    expect(first.artifactIds.length).toBe(1);

    // A completed job re-runs (new cycle) producing a NEW artifact version.
    const second = await orchestrator.runToCompletion(jobId);
    expect(second.state).toBe("succeeded");
    expect(second.runCycle).toBe(2);
    expect(second.artifactIds.length).toBe(2);
    const firstArtifact = await orchestrator.getArtifact(first.artifactIds[0] ?? "");
    const secondArtifact = await orchestrator.getArtifact(second.artifactIds[1] ?? "");
    expect(firstArtifact?.version).toBe(1);
    expect(secondArtifact?.version).toBe(2);
    expect(firstArtifact?.artifactId).not.toBe(secondArtifact?.artifactId);
    expect(eventsOf(second, "rerun_started").length).toBe(1);

    // Failed/cancelled jobs require a new submission instead.
    const failing = orchestratorWith([new FailingProvider("QUALITY_INSUFFICIENT")]);
    const failedJob = await failing.submit(makeRequest());
    await failing.runToCompletion(failedJob.jobId);
    expect(failing.rerun(failedJob.jobId)).rejects.toThrow(OrchestratorError);
  });

  test("submit rejects invalid requests with typed issues", async () => {
    const orchestrator = orchestratorWith([new FakeMeshProvider()]);
    try {
      await orchestrator.submit(makeRequest({ evidenceContentIds: [] }));
      expect.unreachable();
    } catch (error) {
      expect((error as OrchestratorError).code).toBe("invalid_request");
      expect((error as OrchestratorError).issues?.join(" ")).toContain("evidenceContentIds");
    }
    expect(orchestrator.getJob("nope")).resolves.toBeNull();
    expect(orchestrator.step("nope")).rejects.toThrow(OrchestratorError);
  });
});

/* ------------------------------------------------------------------ */
/* 4 + 5. Artifact lifecycle, provenance and imagination labeling       */
/* ------------------------------------------------------------------ */

describe("artifact lifecycle and epistemic labeling", () => {
  test("artifacts carry full provenance and conservative epistemic defaults", async () => {
    const orchestrator = orchestratorWith([new FakeMeshProvider()]);
    const record = await orchestrator.runToCompletion(
      (await orchestrator.submit(makeRequest({ evidenceSeeds: ["prov-1", "prov-2"] }))).jobId,
    );
    const artifactId = record.artifactIds[0] ?? "";
    const artifact = await orchestrator.getArtifact(artifactId);
    expect(artifact).not.toBeNull();
    expect(artifact?.representationType).toBe("mesh");
    expect(artifact?.sourceEvidenceIds).toEqual([contentIdOf("prov-1"), contentIdOf("prov-2")]);
    expect(artifact?.providerId).toBe("fake-mesh");
    expect(artifact?.providerVersion).toBe("1.2.0");
    expect(artifact?.adapterVersion).toBe("1.0.0");
    expect(artifact?.modelIdentity).toBe("ws-checkpoint-2026-01");
    expect(artifact?.parameterDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact?.coordinateFrame).toBe("local-y-up");
    expect(artifact?.transforms[0]?.kind).toBe("rigid");
    expect(artifact?.scaleDeclaration).toBe("metric");
    // Labeled region kept verbatim; unlabeled region defaults conservatively.
    expect(artifact?.regions).toEqual([
      { regionId: "observed-facade", epistemicLabel: "DIRECTLY_OBSERVED", note: null },
      { regionId: "unlabeled-back-face", epistemicLabel: "UNKNOWN", note: null },
    ]);
    expect(artifact?.limitations).toContain("draft quality");
  });

  test("GENERATED_COMPLETION labels are preserved verbatim, never upgraded", async () => {
    const orchestrator = orchestratorWith([new ImaginationProvider()]);
    const record = await orchestrator.runToCompletion(
      (await orchestrator.submit(makeRequest())).jobId,
    );
    const artifact = await orchestrator.getArtifact(record.artifactIds[0] ?? "");
    expect(artifact?.regions).toEqual([
      { regionId: "observed-facade", epistemicLabel: "DIRECTLY_OBSERVED", note: null },
      {
        regionId: "generated-backside",
        epistemicLabel: "GENERATED_COMPLETION",
        note: "world-model completion outside observed support",
      },
    ]);
  });

  test("FS and in-memory stores behave identically through the orchestrator", async () => {
    await withTempDir(async (dir) => {
      const memory = orchestratorWith([new FakeMeshProvider()]);
      const fsOrchestrator = createReconstructionOrchestrator({
        providers: [new FakeMeshProvider()],
        jobStore: new FsJobStore(dir),
        artifactStore: new FsArtifactStore(dir),
        clock: fixedClock,
        idFactory: sequencedIdFactory("id"),
        logger: quietLogger,
      });
      const request = makeRequest({ evidenceSeeds: ["parity"] });
      const memoryRecord = await memory.runToCompletion((await memory.submit(request)).jobId);
      const fsRecord = await fsOrchestrator.runToCompletion((await fsOrchestrator.submit(request)).jobId);
      // Same injected clock + id sequences -> identical records (except ids).
      expect(memoryRecord.state).toBe(fsRecord.state);
      expect(memoryRecord.events.map((event) => event.type)).toEqual(
        fsRecord.events.map((event) => event.type),
      );
      // Canonical JSON comparison: the fs record round-trips through sorted
      // keys, the in-memory record keeps insertion order — bytes are equal
      // after canonicalization, which is the parity that matters.
      expect(canonicalJsonStringify(memoryRecord.request)).toBe(
        canonicalJsonStringify(fsRecord.request),
      );
      const memoryArtifact = await memory.getArtifact(memoryRecord.artifactIds[0] ?? "");
      const fsArtifact = await fsOrchestrator.getArtifact(fsRecord.artifactIds[0] ?? "");
      expect(canonicalJsonStringify(memoryArtifact)).toBe(canonicalJsonStringify(fsArtifact));
    });
  });
});

/* ------------------------------------------------------------------ */
/* 8. Determinism                                                       */
/* ------------------------------------------------------------------ */

describe("determinism", () => {
  test("identical runs over two fresh fs stores produce byte-identical persisted state", async () => {
    await withTempDir(async (dirA) => {
      await withTempDir(async (dirB) => {
        const run = async (dir: string): Promise<Map<string, string>> => {
          const orchestrator = createReconstructionOrchestrator({
            providers: [new FakeMeshProvider(), new FlakyProvider(2)],
            jobStore: new FsJobStore(dir),
            artifactStore: new FsArtifactStore(dir),
            clock: fixedClock,
            idFactory: sequencedIdFactory("id"),
            logger: quietLogger,
          });
          const happy = await orchestrator.submit(makeRequest({ evidenceSeeds: ["determinism"] }));
          await orchestrator.runToCompletion(happy.jobId);
          const flaky = await orchestrator.submit(
            makeRequest({ evidenceSeeds: ["determinism-flaky"], maxRetries: 2 }),
          );
          await orchestrator.runToCompletion(flaky.jobId);
          await orchestrator.runToCompletion(happy.jobId); // re-run: new versions
          const tree = new Map<string, string>();
          const walk = (relative: string): void => {
            for (const entry of readdirSync(join(dir, "reconstruction", relative), {
              withFileTypes: true,
            }).sort((a, b) => a.name.localeCompare(b.name))) {
              const child = relative === "" ? entry.name : join(relative, entry.name);
              if (entry.isDirectory()) {
                walk(child);
              } else {
                tree.set(child, readFileSync(join(dir, "reconstruction", child), "utf8"));
              }
            }
          };
          walk("");
          return tree;
        };
        const treeA = await run(dirA);
        const treeB = await run(dirB);
        expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
        for (const [path, content] of treeA) {
          expect(treeB.get(path)).toBe(content);
        }
      });
    });
  });
});
