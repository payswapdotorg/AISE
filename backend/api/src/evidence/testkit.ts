/**
 * Deterministic evidence-service test fixtures (AISE-008) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * Every fixture is a typed contract object and is serialized through the
 * shared codecs (`EvidenceCodec`/`ProvenanceLinkCodec`/`DerivationCodec`),
 * so tests exercise the same wire documents real clients send. All content
 * ids are derived from fixed seed strings via sha-256; all timestamps are
 * fixed constants; the clock is a constant function. No wall-clock, no
 * randomness, no network — the verify gate stays deterministic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  DerivationCodec,
  EvidenceCodec,
  ProvenanceLinkCodec,
  type Derivation,
  type Evidence,
  type EvidenceMethod,
  type ProvenanceLink,
  type ProvenanceRole,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { EvidenceContentResolver } from "./service";

/* ------------------------------------------------------------------ */
/* Fixed determinism                                                    */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-01-16T10:00:00.000Z";
export const FIXED_LATER_NOW = "2026-01-16T10:05:00.000Z";
export const FIXED_CAPTURED_AT = "2026-01-15T09:36:12.000Z";
export const FIXED_DERIVED_AT = "2026-01-15T11:20:00.000Z";

/** Injected clock: constant, so records and invalidations are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-evidence-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

/** Deterministic valid content id (64 lowercase hex) from a seed string. */
export function contentIdOf(seed: string): string {
  return sha256Hex(`aise-evidence-test:${seed}`);
}

export interface EvidenceOptions {
  readonly contentId?: string;
  readonly sessionId?: string;
  readonly acquisitionMethod?: EvidenceMethod;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly capturedAt?: string;
}

/** A schema-valid `Evidence` record for a seeded (or explicit) content id. */
export function makeEvidence(seed: string, options?: EvidenceOptions): Evidence {
  return {
    contractVersion: CONTRACT_VERSION,
    contentId: options?.contentId ?? contentIdOf(seed),
    byteSize: options?.byteSize ?? 2048,
    mediaType: options?.mediaType ?? "image/jpeg",
    capturedAt: options?.capturedAt ?? FIXED_CAPTURED_AT,
    acquisitionMethod: options?.acquisitionMethod ?? "STILL_IMAGERY",
    acquisitionMetadata: {
      "mission.id": "mission-2026-000042",
      "session.id": options?.sessionId ?? "session-evidence-1",
      "device.id": "device-field-007",
      "capture.kind": "still",
      "acquisition.sensorId": "rear-wide",
    },
  };
}

/** A schema-valid `ProvenanceLink`. */
export function makeLink(
  subjectKind: string,
  subjectId: string,
  evidenceContentId: string,
  role: ProvenanceRole = "SUPPORTS",
): ProvenanceLink {
  return {
    contractVersion: CONTRACT_VERSION,
    subjectKind,
    subjectId,
    evidenceContentId,
    role,
  };
}

export interface DerivationOptions {
  readonly method?: string;
  readonly methodVersion?: string;
  readonly parameters?: Record<string, string>;
  readonly createdAt?: string;
}

/** A schema-valid `Derivation` (inputs → output, ordered). */
export function makeDerivation(
  derivationId: string,
  outputContentId: string,
  inputContentIds: readonly string[],
  options?: DerivationOptions,
): Derivation {
  return {
    contractVersion: CONTRACT_VERSION,
    derivationId,
    outputContentId,
    inputEvidenceContentIds: [...inputContentIds],
    method: options?.method ?? "reconstruction.worldsculpt",
    methodVersion: options?.methodVersion ?? "0.4.1",
    parameters: options?.parameters ?? { "quality": "draft", "frames": "48" },
    createdAt: options?.createdAt ?? FIXED_DERIVED_AT,
  };
}

/* ------------------------------------------------------------------ */
/* Content resolver stubs                                               */
/* ------------------------------------------------------------------ */

/** Resolver over an explicit pinned set (deterministic, no filesystem). */
export function setResolver(pinned: ReadonlySet<string>): EvidenceContentResolver {
  return {
    hasAsset: async (contentId: string): Promise<boolean> => pinned.has(contentId),
  };
}

/** A resolver that never pins anything (gate always rejects). */
export const neverResolver: EvidenceContentResolver = {
  hasAsset: async (): Promise<boolean> => false,
};

/* ------------------------------------------------------------------ */
/* Body serialization                                                   */
/* ------------------------------------------------------------------ */

/** Canonical wire body for a VALID document (validates via the codec). */
export function canonicalBody<T extends object>(
  codec: { encode(value: T): string },
  value: T,
): string {
  return codec.encode(value);
}

/** Canonical wire bodies for each contract object. */
export const evidenceBody = (value: Evidence): string => EvidenceCodec.encode(value);
export const linkBody = (value: ProvenanceLink): string =>
  ProvenanceLinkCodec.encode(value);
export const derivationBody = (value: Derivation): string =>
  DerivationCodec.encode(value);

/** Raw body for deliberately invalid or hand-shaped payloads. */
export function rawBody(value: unknown): string {
  return JSON.stringify(value);
}
