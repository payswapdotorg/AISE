/**
 * Wire object registry (AISE-003).
 *
 * The single authoritative list of every wire object this package defines,
 * in a fixed, name-sorted order. Drives JSON Schema generation, the
 * fixture-driven tests and cross-object invariants (every wire object has
 * a required semver `contractVersion` and an open wire schema with a
 * schema-walking strict decode mode).
 */

import { z } from "zod";
import type { ContractFamily } from "./contracts.version";
import { familyVersion } from "./contracts.version";
import type { WireCodec } from "./codec";
import {
  CapabilityDescriptorCodec,
  DeviceCapabilityProfileCodec,
} from "./capability";
import {
  DerivationCodec,
  EvidenceBundleCodec,
  EvidenceCodec,
  ProvenanceLinkCodec,
} from "./evidence";
import {
  CaptureMissionCodec,
  CaptureStepCodec,
  EvidenceGapCodec,
  ReferenceControlCodec,
} from "./mission";
import {
  MeasurementCodec,
  ObservationCodec,
  PropertyAssertionCodec,
  RealityObjectCodec,
} from "./model";
import {
  CaptureSessionEnvelopeCodec,
  SyncAckCodec,
  SyncBatchCodec,
} from "./sync";

/**
 * Type-erased view of a wire codec for tooling and generic tests.
 * (Structural: any WireCodec<T> is assignable without casts.)
 */
export interface WireObjectDefinition {
  readonly name: string;
  readonly family: ContractFamily;
  readonly contractVersion: string;
  readonly schema: z.ZodType<unknown>;
  readonly codec: {
    readonly name: string;
    decode(payload: unknown): unknown;
    decodeStrict(payload: unknown): unknown;
    encode(value: unknown): string;
  };
}

function define<T extends object>(codec: WireCodec<T>): WireObjectDefinition {
  return {
    name: codec.name,
    family: codec.family,
    contractVersion: familyVersion(codec.family),
    schema: codec.schema,
    codec,
  };
}

/**
 * Every wire object, sorted by name. Order is part of the deterministic
 * contract (schema generation and manifests iterate this list).
 */
export const WIRE_OBJECTS: readonly WireObjectDefinition[] = [
  define(CapabilityDescriptorCodec),
  define(CaptureMissionCodec),
  define(CaptureSessionEnvelopeCodec),
  define(CaptureStepCodec),
  define(DerivationCodec),
  define(DeviceCapabilityProfileCodec),
  define(EvidenceCodec),
  define(EvidenceBundleCodec),
  define(EvidenceGapCodec),
  define(MeasurementCodec),
  define(ObservationCodec),
  define(PropertyAssertionCodec),
  define(ProvenanceLinkCodec),
  define(RealityObjectCodec),
  define(ReferenceControlCodec),
  define(SyncAckCodec),
  define(SyncBatchCodec),
];

/** Wire object names in registry order. */
export const WIRE_OBJECT_NAMES: readonly string[] = WIRE_OBJECTS.map((entry) => entry.name);

/** Looks up a wire object definition by its exact name. */
export function wireObject(name: string): WireObjectDefinition | undefined {
  return WIRE_OBJECTS.find((entry) => entry.name === name);
}
