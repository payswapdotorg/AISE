/**
 * Adapter wire-object registry (PROD-016).
 *
 * The single authoritative list of every wire object this package defines,
 * in a fixed, name-sorted order (mirroring the shared-contracts registry
 * discipline). Drives JSON Schema generation, the fixture-driven tests and
 * the conformance harness. Contains the TWELVE semantic objects named by
 * spec/client-adapter-contract.md plus the three capability-negotiation
 * objects.
 */

import { z } from "zod";
import type { AdapterContractFamily } from "./adapter-contracts.version";
import { adapterFamilyVersion } from "./adapter-contracts.version";
import type { AdapterWireCodec } from "./codec";
import { ProjectContextCodec, TaskIntentCodec } from "./context";
import {
  CapabilityDescriptorCodec,
  ClientCapabilityProfileCodec,
  TaskCapabilityRequirementsCodec,
} from "./capability";
import { CapabilityNegotiationCodec } from "./negotiation";
import {
  BOQContextCodec,
  EngineeringCaseSummaryCodec,
  EvidenceSummaryCodec,
  InterventionScenarioSummaryCodec,
  OutcomeSummaryCodec,
  RealitySummaryCodec,
} from "./domain";
import { NextBestActionCodec } from "./action";
import { AuthorizationContextCodec } from "./authorization";
import { OperationResultCodec } from "./result";

/**
 * Type-erased view of an adapter wire codec for tooling and generic tests.
 * (Structural: any AdapterWireCodec<T> is assignable without casts.)
 */
export interface AdapterObjectDefinition {
  readonly name: string;
  readonly family: AdapterContractFamily;
  readonly contractVersion: string;
  readonly schema: z.ZodType<unknown>;
  readonly codec: {
    readonly name: string;
    decode(payload: unknown): unknown;
    decodeStrict(payload: unknown): unknown;
    encode(value: unknown): string;
  };
}

function define<T extends object>(codec: AdapterWireCodec<T>): AdapterObjectDefinition {
  return {
    name: codec.name,
    family: codec.family,
    contractVersion: adapterFamilyVersion(codec.family),
    schema: codec.schema,
    codec,
  };
}

/**
 * Every adapter wire object, sorted by name. Order is part of the
 * deterministic contract (schema generation and manifests iterate this
 * list).
 */
export const ADAPTER_WIRE_OBJECTS: readonly AdapterObjectDefinition[] = [
  define(AuthorizationContextCodec),
  define(BOQContextCodec),
  define(CapabilityDescriptorCodec),
  define(CapabilityNegotiationCodec),
  define(ClientCapabilityProfileCodec),
  define(EngineeringCaseSummaryCodec),
  define(EvidenceSummaryCodec),
  define(InterventionScenarioSummaryCodec),
  define(NextBestActionCodec),
  define(OperationResultCodec),
  define(OutcomeSummaryCodec),
  define(ProjectContextCodec),
  define(RealitySummaryCodec),
  define(TaskCapabilityRequirementsCodec),
  define(TaskIntentCodec),
];

/** Adapter wire object names in registry order. */
export const ADAPTER_WIRE_OBJECT_NAMES: readonly string[] =
  ADAPTER_WIRE_OBJECTS.map((entry) => entry.name);

/** Looks up an adapter wire object definition by its exact name. */
export function adapterWireObject(name: string): AdapterObjectDefinition | undefined {
  return ADAPTER_WIRE_OBJECTS.find((entry) => entry.name === name);
}
