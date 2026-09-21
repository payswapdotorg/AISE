/**
 * Solution wire-object registry (PROD-021).
 *
 * The single authoritative list of every wire object this package defines,
 * in a fixed, name-sorted order (mirroring the shared-contracts and
 * adapter-contract registry discipline). Drives JSON Schema generation, the
 * fixture-driven tests and the invariant dispatcher. Contains the TEN
 * solution-graph/BOQ-trace objects named by the PROD-021 work order plus
 * the four interaction-facing objects (intent, capability profile,
 * negotiation, domain descriptor).
 */

import { z } from "zod";
import type { SolutionContractFamily } from "./solution-contracts.version";
import { solutionFamilyVersion } from "./solution-contracts.version";
import type { SolutionWireCodec } from "./codec";
import { SolutionDomainDescriptorCodec } from "./domain";
import {
  EngineeringOperationCodec,
  OperationDependencyCodec,
  OperationEffectCodec,
  OperationTargetCodec,
} from "./operation";
import { EngineeringOperationIntentCodec } from "./intent";
import { ProposedStateCodec } from "./state";
import { SolutionValidationSnapshotCodec } from "./validation";
import { OperationCapabilityProfileCodec } from "./capability";
import { OperationCapabilityNegotiationCodec } from "./negotiation";
import { SolutionBoqLineTraceCodec, SolutionBoqTraceSetCodec } from "./trace";
import { SolutionCodec, SolutionVersionCodec } from "./solution";

/**
 * Type-erased view of a solution wire codec for tooling and generic tests.
 * (Structural: any SolutionWireCodec<T> is assignable without casts.)
 */
export interface SolutionObjectDefinition {
  readonly name: string;
  readonly family: SolutionContractFamily;
  readonly contractVersion: string;
  readonly schema: z.ZodType<unknown>;
  readonly codec: {
    readonly name: string;
    decode(payload: unknown): unknown;
    decodeStrict(payload: unknown): unknown;
    encode(value: unknown): string;
  };
}

function define<T extends object>(codec: SolutionWireCodec<T>): SolutionObjectDefinition {
  return {
    name: codec.name,
    family: codec.family,
    contractVersion: solutionFamilyVersion(codec.family),
    schema: codec.schema,
    codec,
  };
}

/**
 * Every solution wire object, sorted by name. Order is part of the
 * deterministic contract (schema generation and manifests iterate this
 * list).
 */
export const SOLUTION_WIRE_OBJECTS: readonly SolutionObjectDefinition[] = [
  define(EngineeringOperationCodec),
  define(EngineeringOperationIntentCodec),
  define(OperationCapabilityNegotiationCodec),
  define(OperationCapabilityProfileCodec),
  define(OperationDependencyCodec),
  define(OperationEffectCodec),
  define(OperationTargetCodec),
  define(ProposedStateCodec),
  define(SolutionBoqLineTraceCodec),
  define(SolutionBoqTraceSetCodec),
  define(SolutionCodec),
  define(SolutionDomainDescriptorCodec),
  define(SolutionValidationSnapshotCodec),
  define(SolutionVersionCodec),
];

/** Solution wire object names in registry order. */
export const SOLUTION_WIRE_OBJECT_NAMES: readonly string[] =
  SOLUTION_WIRE_OBJECTS.map((entry) => entry.name);

/** Looks up a solution wire object definition by its exact name. */
export function solutionWireObject(name: string): SolutionObjectDefinition | undefined {
  return SOLUTION_WIRE_OBJECTS.find((entry) => entry.name === name);
}
