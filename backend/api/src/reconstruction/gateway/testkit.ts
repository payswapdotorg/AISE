/**
 * Deterministic execution-gateway test fixtures (PROD-009) — TEST SUPPORT
 * ONLY, never imported by production modules (and deliberately not exported
 * from `gateway/index.ts`).
 *
 * Every helper is deterministic: a constant injected clock, sequence id
 * factories, contract-valid execution requests, and a scripted provider whose
 * outcomes are fixed in advance — no network, no randomness, no wall clock.
 * Contract-request construction reuses the reconstruction testkit (also test
 * support) so there is exactly one definition of a valid provider request.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ProviderArtifactOutput,
  ProviderDescriptor,
  ReconstructionOutcome,
  ReconstructionProvider,
  ReconstructionRequest,
} from "../contract";
import { makeRequest as contractRequest, type RequestOptions } from "../testkit";
import { createExecutionGateway } from "./service";
import { InMemoryExecutionStore, type ExecutionStore } from "./store";
import type { ExecutionRequest } from "./model";

/* ------------------------------------------------------------------ */
/* Fixed determinism                                                    */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-01-16T12:00:00.000Z";

/** Injected clock: constant, so execution records are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Injected id factory: strictly increasing sequence, deterministic. */
export function sequencedIdFactory(prefix: string): () => string {
  let next = 1;
  return (): string => `${prefix}-${String(next++).padStart(4, "0")}`;
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-execution-gateway-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Execution requests                                                   */
/* ------------------------------------------------------------------ */

export interface ExecutionRequestOptions extends RequestOptions {
  readonly requestKey?: string;
  readonly providerId?: string;
  readonly checkpointRef?: string | null;
  readonly executionConfig?: Readonly<Record<string, unknown>>;
}

/** A gateway-valid `ExecutionRequest` with deterministic defaults. */
export function makeExecutionRequest(options?: ExecutionRequestOptions): ExecutionRequest {
  const {
    requestKey,
    providerId,
    checkpointRef,
    executionConfig,
    ...requestOptions
  } = options ?? {};
  return {
    requestKey: requestKey ?? "exec-key-0001",
    providerId: providerId ?? "gateway-scripted-provider",
    checkpointRef: checkpointRef ?? null,
    executionConfig: executionConfig ?? {},
    request: contractRequest(requestOptions as RequestOptions),
  };
}

/* ------------------------------------------------------------------ */
/* Scripted providers                                                   */
/* ------------------------------------------------------------------ */

/** Descriptor overrides accepted by `makeProviderDescriptor`. */
export type DescriptorOverrides = Partial<ProviderDescriptor>;

/** A contract-valid provider descriptor with deterministic defaults. */
export function makeProviderDescriptor(overrides?: DescriptorOverrides): ProviderDescriptor {
  return {
    providerId: "gateway-scripted-provider",
    providerVersion: "9.9.9",
    adapterVersion: "1.0.0",
    supportedInputModalities: ["still_image", "video"],
    supportedOutputModalities: ["mesh", "point_cloud"],
    availability: "READY",
    ...overrides,
  };
}

/** A minimal contract-valid provider artifact output. */
export function scriptedArtifact(
  representationType: ProviderArtifactOutput["representationType"] = "mesh",
): ProviderArtifactOutput {
  return {
    representationType,
    coordinateFrame: "gateway-test-frame",
  };
}

/** Scripted outcome factories (explicit, deterministic). */
export const scriptSuccess = (
  artifacts: readonly ProviderArtifactOutput[] = [scriptedArtifact()],
): ReconstructionOutcome => ({ kind: "success", artifacts: [...artifacts] });

export const scriptPartial = (
  detail: string,
  artifacts: readonly ProviderArtifactOutput[] = [scriptedArtifact()],
): ReconstructionOutcome => ({ kind: "partial", artifacts: [...artifacts], detail });

export const scriptFailure = (
  code: Exclude<Extract<ReconstructionOutcome, { kind: "failure" }>["code"], "PARTIAL">,
  detail: string,
): ReconstructionOutcome => ({ kind: "failure", code, detail });

/**
 * Deterministic scripted provider: answers `execute` from a fixed script
 * (last entry repeats). Call-counted so tests can prove dispatch behavior.
 */
export class ScriptedProvider implements ReconstructionProvider {
  readonly descriptor: ProviderDescriptor;
  executeCount = 0;
  private readonly script: readonly ReconstructionOutcome[];

  constructor(
    descriptor?: DescriptorOverrides,
    script?: readonly ReconstructionOutcome[],
    private readonly onExecute?: (request: ReconstructionRequest) => void,
  ) {
    this.descriptor = makeProviderDescriptor(descriptor);
    this.script = script ?? [scriptSuccess()];
  }

  async execute(request: ReconstructionRequest): Promise<ReconstructionOutcome> {
    this.executeCount += 1;
    this.onExecute?.(request);
    return this.script[Math.min(this.executeCount - 1, this.script.length - 1)]!;
  }
}

/* ------------------------------------------------------------------ */
/* Gateway assembly                                                     */
/* ------------------------------------------------------------------ */

export interface MakeGatewayOptions {
  readonly providers?: readonly ReconstructionProvider[];
  readonly store?: ExecutionStore;
  readonly clock?: () => string;
  readonly idFactory?: () => string;
}

export interface GatewayHarness {
  readonly gateway: ReturnType<typeof createExecutionGateway>;
  readonly store: ExecutionStore;
  readonly clock: () => string;
  readonly idFactory: () => string;
}

/** Assemble a gateway over deterministic in-memory defaults. */
export function makeGateway(options: MakeGatewayOptions = {}): GatewayHarness {
  const store = options.store ?? new InMemoryExecutionStore();
  const clock = options.clock ?? fixedClock;
  const idFactory = options.idFactory ?? sequencedIdFactory("exec");
  const gateway = createExecutionGateway({
    providers: options.providers ?? [],
    store,
    clock,
    idFactory,
  });
  return { gateway, store, clock, idFactory };
}
