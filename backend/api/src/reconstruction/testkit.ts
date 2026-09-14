/**
 * Deterministic reconstruction-orchestration test fixtures (AISE-010) —
 * TEST SUPPORT ONLY, never imported by production modules.
 *
 * Built-in test providers live HERE (the work order allows fake providers
 * inside test files only): every provider is a contract-shaped stub with
 * deterministic, call-counted behavior — no reconstruction algorithm, no
 * randomness, no wall clock, no network. All content ids derive from fixed
 * seed strings via sha-256; the clock is a constant function; ids come from
 * injected sequence factories. The verify gate stays deterministic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import type {
  EvidenceReader,
  EvidenceSummary,
  ProviderArtifactOutput,
  ProviderDescriptor,
  ReconstructionOutcome,
  ReconstructionProvider,
  ReconstructionRequest,
} from "./contract";

/** The failure-code subset a provider outcome may report. */
type ProviderFailureCode = Extract<ReconstructionOutcome, { kind: "failure" }>["code"];

/* ------------------------------------------------------------------ */
/* Fixed determinism                                                    */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-01-16T12:00:00.000Z";

/** Injected clock: constant, so job records and artifacts are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Deterministic content id (64 lowercase hex) from a seed string. */
export function contentIdOf(seed: string): string {
  return sha256Hex(`aise-reconstruction-test:${seed}`);
}

/** Injected id factory: strictly increasing sequence, deterministic. */
export function sequencedIdFactory(prefix: string): () => string {
  let next = 1;
  return (): string => `${prefix}-${String(next++).padStart(4, "0")}`;
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-reconstruction-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Requests and evidence stubs                                          */
/* ------------------------------------------------------------------ */

export interface RequestOptions {
  readonly taskId?: string;
  readonly evidenceSeeds?: readonly string[];
  readonly evidenceContentIds?: readonly string[];
  readonly requestedRepresentations?: ReconstructionRequest["requestedRepresentations"];
  readonly declaredInputModalities?: readonly string[] | null;
  readonly captureSessionId?: string | null;
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
}

/** A contract-valid `ReconstructionRequest` with deterministic defaults. */
export function makeRequest(options?: RequestOptions): ReconstructionRequest {
  const evidenceContentIds =
    options?.evidenceContentIds ??
    (options?.evidenceSeeds ?? ["frame-001", "frame-002", "frame-003"]).map(contentIdOf);
  return {
    taskId: options?.taskId ?? "task-2026-000042",
    evidenceContentIds: [...evidenceContentIds],
    captureSessionId: options?.captureSessionId ?? "session-capture-1",
    requestedRepresentations: [
      ...(options?.requestedRepresentations ?? ["mesh"]),
    ] as ReconstructionRequest["requestedRepresentations"],
    declaredInputModalities:
      options?.declaredInputModalities === undefined
        ? null
        : (options.declaredInputModalities as ReconstructionRequest["declaredInputModalities"]),
    coordinateFrameConstraint: "site-grid-metric",
    scaleConstraint: "metric",
    policyConstraints: {
      timeoutMs: options?.timeoutMs ?? 30_000,
      maxRetries: options?.maxRetries ?? 0,
    },
  };
}

export function evSummary(
  method: string,
  mediaType = "image/jpeg",
  invalidated = false,
): EvidenceSummary {
  return { mediaType, method, invalidated };
}

/** Reader stub over an explicit evidence map (absent ids resolve to null). */
export function readerOver(entries: Readonly<Record<string, EvidenceSummary>>): EvidenceReader {
  return {
    getEvidence: async (contentId: string): Promise<EvidenceSummary | null> =>
      entries[contentId] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Provider fixtures                                                    */
/* ------------------------------------------------------------------ */

/** Descriptor overrides accepted by `makeDescriptor`. */
export type DescriptorOverrides = Partial<ProviderDescriptor>;

/** A contract-valid provider descriptor with deterministic defaults. */
export function makeDescriptor(overrides?: DescriptorOverrides): ProviderDescriptor {
  return {
    providerId: "fake-mesh",
    providerVersion: "1.2.0",
    adapterVersion: "1.0.0",
    supportedInputModalities: ["still_image", "video"],
    supportedOutputModalities: ["mesh", "point_cloud"],
    availability: "READY",
    coordinateFrames: ["local-y-up", "site-grid-metric"],
    scaleModes: ["metric"],
    benchmarkProfile: { note: "carried for provenance, never used for selection" },
    ...overrides,
  };
}

/** A contract-valid provider artifact output (mesh) with deterministic fields. */
export function meshOutput(request: ReconstructionRequest): ProviderArtifactOutput {
  return {
    representationType: "mesh",
    sourceEvidenceIds: [...request.evidenceContentIds],
    modelIdentity: "ws-checkpoint-2026-01",
    parameters: { quality: "draft", views: String(request.evidenceContentIds.length) },
    coordinateFrame: "local-y-up",
    transforms: [
      { kind: "rigid", parameters: { translation: [0, 0, 0], rotation: "identity" } },
    ],
    scaleDeclaration: "metric",
    regions: [
      { regionId: "observed-facade", epistemicLabel: "DIRECTLY_OBSERVED" },
      { regionId: "unlabeled-back-face" },
    ],
    qualityDiagnostics: { reportedFaces: 1024 },
    limitations: ["draft quality", "no sub-surface geometry"],
  };
}

/**
 * Deterministic configurable fake provider: succeeds with `meshOutput`
 * unless scripted otherwise. Test files script it via the outcome factories.
 */
export class FakeProvider implements ReconstructionProvider {
  readonly descriptor: ProviderDescriptor;
  executeCount = 0;
  /** Script of outcomes per call; the last entry repeats (default: success). */
  private readonly script: readonly ReconstructionOutcome[];

  constructor(
    descriptor?: DescriptorOverrides,
    script?: readonly ReconstructionOutcome[],
    private readonly artifactOf: (request: ReconstructionRequest) => ProviderArtifactOutput = meshOutput,
  ) {
    this.descriptor = makeDescriptor(descriptor);
    this.script = script ?? [{ kind: "success", artifacts: [] }];
  }

  async execute(request: ReconstructionRequest): Promise<ReconstructionOutcome> {
    this.executeCount += 1;
    const index = Math.min(this.executeCount - 1, this.script.length - 1);
    const scripted = this.script[index];
    if (scripted === undefined) {
      return { kind: "success", artifacts: [this.artifactOf(request)] };
    }
    if (
      (scripted.kind === "success" || scripted.kind === "partial") &&
      scripted.artifacts.length === 0
    ) {
      const artifacts = [this.artifactOf(request)];
      return scripted.kind === "success"
        ? { kind: "success", artifacts }
        : { kind: "partial", artifacts, detail: scripted.detail };
    }
    return scripted;
  }
}

/** Happy-path provider: always succeeds with one mesh artifact. */
export class FakeMeshProvider extends FakeProvider {
  constructor(descriptor?: DescriptorOverrides) {
    super(descriptor);
  }
}

/** Flaky provider: fails `failures` times (transient code), then succeeds. */
export class FlakyProvider extends FakeProvider {
  constructor(failures: number, code: "EXECUTION_FAILED" | "RESOURCE_INSUFFICIENT" = "EXECUTION_FAILED", descriptor?: DescriptorOverrides) {
    const failure: ReconstructionOutcome = {
      kind: "failure",
      code,
      detail: `scripted transient failure (${code})`,
    };
    super(descriptor, [...Array<ReconstructionOutcome>(failures).fill(failure), { kind: "success", artifacts: [] }]);
  }
}

/** Provider whose descriptor is not READY (never selected, never executed). */
export class UnavailableProvider extends FakeProvider {
  constructor(availability: "UNAVAILABLE" | "ACCESS_REQUIRED" = "UNAVAILABLE", descriptor?: DescriptorOverrides) {
    super({ providerId: "unavailable-engine", availability, ...descriptor });
  }
}

/** Provider emitting a GENERATED_COMPLETION region (imagination labeling). */
export class ImaginationProvider extends FakeProvider {
  constructor(descriptor?: DescriptorOverrides) {
    const imaginative = (request: ReconstructionRequest): ProviderArtifactOutput => ({
      ...meshOutput(request),
      regions: [
        { regionId: "observed-facade", epistemicLabel: "DIRECTLY_OBSERVED" },
        { regionId: "generated-backside", epistemicLabel: "GENERATED_COMPLETION", note: "world-model completion outside observed support" },
      ],
    });
    super({ providerId: "world-model-engine", ...descriptor }, undefined, imaginative);
  }
}

/** Provider returning PARTIAL with the artifacts it did produce. */
export class PartialProvider extends FakeProvider {
  constructor(descriptor?: DescriptorOverrides) {
    super(
      { providerId: "partial-engine", ...descriptor },
      [{ kind: "partial", artifacts: [], detail: "coverage limited to 60% of the requested scope" }],
    );
  }
}

/** Provider reporting one explicit terminal failure code forever. */
export class FailingProvider extends FakeProvider {
  constructor(
    code: ProviderFailureCode,
    detail = `scripted failure (${code})`,
    descriptor?: DescriptorOverrides,
  ) {
    super({ providerId: "failing-engine", ...descriptor }, [
      { kind: "failure", code, detail },
    ]);
  }
}

/** Provider whose outputs violate the artifact contract (OUTPUT_INVALID). */
export class InvalidOutputProvider extends FakeProvider {
  constructor(mode: "bad-label" | "foreign-evidence" | "bad-representation", descriptor?: DescriptorOverrides) {
    const invalid = (request: ReconstructionRequest): ProviderArtifactOutput => {
      const base = meshOutput(request);
      if (mode === "bad-label") {
        return { ...base, regions: [{ regionId: "too-good-to-be-true", epistemicLabel: "DEFINITELY_TRUE" }] };
      }
      if (mode === "foreign-evidence") {
        return { ...base, sourceEvidenceIds: [contentIdOf("never-in-request")] };
      }
      return { ...base, representationType: "hologram" as unknown as ProviderArtifactOutput["representationType"] };
    };
    super({ providerId: "invalid-output-engine", ...descriptor }, undefined, invalid);
  }
}
