/**
 * Artifact provenance model (AISE-008).
 *
 * Every reconstruction artifact is derived state, so it must carry
 * complete lineage: which pipeline produced it, with which method,
 * under which parameters fingerprint, from which inputs. An artifact
 * without complete provenance is not an evidence-bearing record and
 * must not exist — `validateArtifactProvenance` is the fail-closed
 * gate every artifact passes at creation AND at verification.
 */
import type { ContentHash, Uuid } from "@aise/shared-contracts";
import { canonicalContentHash } from "../canonical.js";
import { ReconstructionError } from "../errors.js";

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Provenance-scoped hash requirement: a gap here is incomplete lineage. */
function requireContentHash(hash: string, field: string): void {
  if (typeof hash !== "string" || !CONTENT_HASH_PATTERN.test(hash)) {
    throw new ReconstructionError("PROVENANCE_INCOMPLETE", `${field} must be a lowercase-hex sha-256 hash`, {
      details: { field, value: hash },
    });
  }
}

/**
 * A raw-evidence input reference: one committed capture asset,
 * identified by session, asset and content hash.
 */
export interface CaptureAssetInputRef {
  readonly kind: "capture_asset";
  readonly sessionId: Uuid;
  readonly assetId: Uuid;
  readonly contentHash: ContentHash;
}

/**
 * A derived-input reference: another reconstruction artifact,
 * identified by artifact id and content hash.
 */
export interface ArtifactInputRef {
  readonly kind: "artifact";
  readonly artifactId: Uuid;
  readonly contentHash: ContentHash;
}

export type ArtifactInput = CaptureAssetInputRef | ArtifactInputRef;

/** Complete lineage record for one artifact. */
export interface ArtifactProvenance {
  /** Producing pipeline identity (e.g. "aise.reconstruction.foundation"). */
  readonly pipelineId: string;
  /** Producing pipeline version. */
  readonly pipelineVersion: string;
  /** Producing method label (engine method / composition method). */
  readonly method: string;
  /**
   * Canonical content hash of the parameters record. Equal
   * parameters ⇒ equal fingerprint; the raw parameters themselves
   * are engine-side state, only the fingerprint travels.
   */
  readonly parametersFingerprint: ContentHash;
  /** Non-empty input lineage (raw assets and/or derived artifacts). */
  readonly inputs: readonly ArtifactInput[];
}

/**
 * Computes the canonical parameters fingerprint for a parameters
 * record. `undefined`/`null` parameters fingerprint the empty record.
 */
export function parametersFingerprintOf(parameters: unknown): ContentHash {
  return canonicalContentHash(parameters ?? null);
}

/**
 * Fail-closed provenance validation: pipeline identity, method,
 * parameters fingerprint format, and a non-empty set of complete
 * input references. Throws `PROVENANCE_INCOMPLETE` on any gap.
 */
export function validateArtifactProvenance(provenance: ArtifactProvenance): void {
  if (typeof provenance.pipelineId !== "string" || provenance.pipelineId.trim() === "") {
    throw new ReconstructionError("PROVENANCE_INCOMPLETE", "artifact provenance must carry a non-empty pipelineId");
  }
  if (typeof provenance.pipelineVersion !== "string" || provenance.pipelineVersion.trim() === "") {
    throw new ReconstructionError("PROVENANCE_INCOMPLETE", "artifact provenance must carry a non-empty pipelineVersion");
  }
  if (typeof provenance.method !== "string" || provenance.method.trim() === "") {
    throw new ReconstructionError("PROVENANCE_INCOMPLETE", "artifact provenance must carry a non-empty method");
  }
  requireContentHash(provenance.parametersFingerprint, "provenance.parametersFingerprint");

  if (!Array.isArray(provenance.inputs) || provenance.inputs.length === 0) {
    throw new ReconstructionError("PROVENANCE_INCOMPLETE", "artifact provenance must reference at least one input");
  }
  provenance.inputs.forEach((input, index) => {
    if (input === null || typeof input !== "object") {
      throw new ReconstructionError("PROVENANCE_INCOMPLETE", `provenance input ${index} must be an object`);
    }
    if (input.kind === "capture_asset") {
      if (typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
        throw new ReconstructionError("PROVENANCE_INCOMPLETE", `provenance input ${index} (capture_asset) must carry a sessionId`);
      }
      if (typeof input.assetId !== "string" || input.assetId.trim() === "") {
        throw new ReconstructionError("PROVENANCE_INCOMPLETE", `provenance input ${index} (capture_asset) must carry an assetId`);
      }
      requireContentHash(input.contentHash, `provenance.inputs[${index}].contentHash`);
      return;
    }
    if (input.kind === "artifact") {
      if (typeof input.artifactId !== "string" || input.artifactId.trim() === "") {
        throw new ReconstructionError("PROVENANCE_INCOMPLETE", `provenance input ${index} (artifact) must carry an artifactId`);
      }
      requireContentHash(input.contentHash, `provenance.inputs[${index}].contentHash`);
      return;
    }
    throw new ReconstructionError("PROVENANCE_INCOMPLETE", `provenance input ${index} has unknown kind "${String((input as { kind?: unknown }).kind)}"`);
  });
}
