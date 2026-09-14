/**
 * Provider registry tests (AISE-012): default adapter list, modality-based
 * selection with both adapters registered, and the strategy invariant —
 * REMOVING WorldSculpt requires NO data-model change (existing job/artifact
 * records remain readable; visual-only requests fail UNAVAILABLE with
 * remediation; the depth/LiDAR path keeps working).
 */

import { describe, expect, test } from "bun:test";
import { contentIdOf, fixedClock, makeRequest, sequencedIdFactory } from "../testkit";
import { createReconstructionOrchestrator } from "../orchestrator";
import { InMemoryArtifactStore, InMemoryJobStore } from "../store";
import { createDefaultAiseProviders } from "./registry";
import { DeterministicWorldSculptBackend } from "./worldsculpt/simulation";
import type { EvidenceBytesReader } from "./worldsculpt/backend";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const VISUAL_IDS = [contentIdOf("reg-visual-1"), contentIdOf("reg-visual-2")];
const DEPTH_ID = contentIdOf("reg-depth-1");

function visualRequest(): ReturnType<typeof makeRequest> {
  return makeRequest({
    evidenceContentIds: [...VISUAL_IDS],
    requestedRepresentations: ["mesh"],
    declaredInputModalities: ["still_image"],
  });
}

function depthRequest(): ReturnType<typeof makeRequest> {
  return makeRequest({
    evidenceContentIds: [DEPTH_ID],
    requestedRepresentations: ["point_cloud"],
    declaredInputModalities: ["depth_map"],
  });
}

const depthBytesReader: EvidenceBytesReader = {
  read: async (contentId) =>
    contentId === DEPTH_ID
      ? new TextEncoder().encode("0 0 0\n1.5 2.5 3.5")
      : new TextEncoder().encode("visual-frame"),
};

function orchestratorWith(
  providers: ReturnType<typeof createDefaultAiseProviders>,
): ReturnType<typeof createReconstructionOrchestrator> {
  return createReconstructionOrchestrator({
    providers,
    jobStore: new InMemoryJobStore(),
    artifactStore: new InMemoryArtifactStore(),
    clock: fixedClock,
    idFactory: sequencedIdFactory("id"),
  });
}

/* ------------------------------------------------------------------ */
/* Default registry                                                     */
/* ------------------------------------------------------------------ */

describe("createDefaultAiseProviders: default adapter list", () => {
  test("depth-lidar fusion first (READY), WorldSculpt second (ACCESS_REQUIRED without a backend)", () => {
    const providers = createDefaultAiseProviders();
    expect(providers.map((provider) => provider.descriptor.providerId)).toEqual([
      "depth-lidar-fusion",
      "worldsculpt",
    ]);
    expect(providers[0]!.descriptor.availability).toBe("READY");
    expect(providers[1]!.descriptor.availability).toBe("ACCESS_REQUIRED");
    expect(providers[1]!.descriptor.availability).not.toBe("READY");
  });

  test("a WorldSculpt backend makes the engine selectable", () => {
    const providers = createDefaultAiseProviders({
      worldSculptBackend: new DeterministicWorldSculptBackend(),
    });
    expect(providers[1]!.descriptor.availability).toBe("READY");
  });

  test("default registry: a visual-only mesh request fails UNAVAILABLE (no READY provider for it)", async () => {
    const orchestrator = orchestratorWith(createDefaultAiseProviders());
    const record = await orchestrator.submit(visualRequest());
    expect(record.state).toBe("failed");
    expect(record.failure?.code).toBe("UNAVAILABLE");
    expect(record.failure?.remediation?.join(" ")).toContain("READY provider");
    expect(record.selection?.selectedProviderId).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Selection by modality with both adapters registered                  */
/* ------------------------------------------------------------------ */

describe("registry: selection by modality with both adapters registered", () => {
  function bothReady() {
    return createDefaultAiseProviders({
      worldSculptBackend: new DeterministicWorldSculptBackend(),
      evidenceReader: depthBytesReader,
    });
  }

  test("visual evidence → WorldSculpt selected", async () => {
    const orchestrator = orchestratorWith(bothReady());
    const record = await orchestrator.submit(visualRequest());
    expect(record.selection?.selectedProviderId).toBe("worldsculpt");
    const completed = await orchestrator.runToCompletion(record.jobId);
    expect(completed.state).toBe("succeeded");
  });

  test("depth evidence → depth-lidar fusion selected (device-aware routing preference)", async () => {
    const orchestrator = orchestratorWith(bothReady());
    const record = await orchestrator.submit(depthRequest());
    expect(record.selection?.selectedProviderId).toBe("depth-lidar-fusion");
    const completed = await orchestrator.runToCompletion(record.jobId);
    expect(completed.state).toBe("succeeded");
    const artifact = await orchestrator.getArtifact(completed.artifactIds[0]!);
    expect(artifact?.representationType).toBe("point_cloud");
    expect(artifact?.providerId).toBe("depth-lidar-fusion");
    expect(artifact?.sourceEvidenceIds).toEqual([DEPTH_ID]);
  });
});

/* ------------------------------------------------------------------ */
/* Removal invariant (strategy: no data-model change)                   */
/* ------------------------------------------------------------------ */

describe("registry: removing WorldSculpt requires no data-model change", () => {
  test("jobs/artifacts produced WITH WorldSculpt stay readable WITHOUT it; depth path keeps working", async () => {
    // Phase 1 — full registry (both adapters) over shared stores.
    const jobStore = new InMemoryJobStore();
    const artifactStore = new InMemoryArtifactStore();
    const withWorldSculpt = createReconstructionOrchestrator({
      providers: createDefaultAiseProviders({
        worldSculptBackend: new DeterministicWorldSculptBackend(),
        evidenceReader: depthBytesReader,
      }),
      jobStore,
      artifactStore,
      clock: fixedClock,
      idFactory: sequencedIdFactory("id"),
    });
    const visualJob = await withWorldSculpt.runToCompletion(
      (await withWorldSculpt.submit(visualRequest())).jobId,
    );
    expect(visualJob.state).toBe("succeeded");
    const worldSculptArtifactIds = [...visualJob.artifactIds];

    // Phase 2 — WorldSculpt REMOVED (filtered from the same provider list);
    // same stores, no schema or data-model change.
    const withoutWorldSculpt = createReconstructionOrchestrator({
      providers: createDefaultAiseProviders({ evidenceReader: depthBytesReader }).filter(
        (provider) => provider.descriptor.providerId !== "worldsculpt",
      ),
      jobStore,
      artifactStore,
      clock: fixedClock,
      idFactory: sequencedIdFactory("id2"),
    });

    // Visual-only requests now fail explicitly with remediation.
    const visualRetry = await withoutWorldSculpt.submit(visualRequest());
    expect(visualRetry.state).toBe("failed");
    expect(visualRetry.failure?.code).toBe("UNAVAILABLE");
    expect(visualRetry.failure?.remediation?.join(" ")).toContain("register a qualified provider");

    // The depth path is unaffected.
    const depthJob = await withoutWorldSculpt.runToCompletion(
      (await withoutWorldSculpt.submit(depthRequest())).jobId,
    );
    expect(depthJob.state).toBe("succeeded");
    expect(depthJob.selection?.selectedProviderId).toBe("depth-lidar-fusion");

    // Prior records remain readable exactly as stored — full provenance intact.
    const priorJob = await withoutWorldSculpt.getJob(visualJob.jobId);
    expect(priorJob?.state).toBe("succeeded");
    expect(priorJob?.selection?.selectedProviderId).toBe("worldsculpt");
    for (const artifactId of worldSculptArtifactIds) {
      const artifact = await withoutWorldSculpt.getArtifact(artifactId);
      expect(artifact).not.toBeNull();
      expect(artifact?.providerId).toBe("worldsculpt");
      expect(artifact?.sourceEvidenceIds.every((id) => VISUAL_IDS.includes(id))).toBe(true);
    }
  });
});
