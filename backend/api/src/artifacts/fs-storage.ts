/**
 * File-system artifact storage — the local dev twin (PROD-006).
 *
 * Implements the `ArtifactStorage` port over the local file system, rooted
 * at the same data dir as every other Fs store (AISE_DATA_DIR, default
 * ./data):
 *
 *   data/artifacts/blobs/<first2>/<sha256>     content-addressed blob
 *
 * Discipline (the storage port's contract, enforced here):
 *
 *  - keys are CONTENT ADDRESSES (sha-256 of the bytes): identical bytes
 *    always land at the identical path, so re-putting identical content is
 *    an idempotent no-op and a put under an existing address with
 *    DIFFERENT bytes is a loud corruption guard (a sha-256 collision or a
 *    tampered store — never silently accepted);
 *  - NO policy lives here (no limits, no type checks, no access checks);
 *  - deterministic: identical call sequences produce identical paths and
 *    identical bytes; `describe()` reports statuses only (no credentials
 *    exist to leak on this backend).
 *
 * HONESTY NOTE (docs/INSTALL.md): this twin is for LOCAL DEVELOPMENT. On a
 * serverless redeploy the data dir is tmp-fs (ephemeral) — durable
 * artifacts REQUIRE the R2 env group in deployment; /readyz and
 * /v1/artifacts/status always report which backend is actually serving.
 */

import { mkdirSync, promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { bytesEqual } from "../lib/hash";
import {
  ArtifactStorageError,
  type ArtifactBackendDescriptor,
  type ArtifactBlobInfo,
  type ArtifactStorage,
  type ArtifactStoragePutOutcome,
} from "./storage";

const CONTENT_ADDRESS_PATTERN = /^[0-9a-f]{64}$/;

function assertContentAddress(contentSha256: string): void {
  if (!CONTENT_ADDRESS_PATTERN.test(contentSha256)) {
    throw new ArtifactStorageError(
      "unavailable",
      "fs artifact storage: content address must be 64 lowercase hex characters",
    );
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * File-system-backed content-addressed blob storage under
 * `<dataDir>/artifacts/blobs/` (created on construction — an unwritable
 * root fails fast with a thrown Error, the FsCaptureStore discipline).
 */
export class FsArtifactStorage implements ArtifactStorage {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir, "artifacts", "blobs");
    mkdirSync(this.root, { recursive: true });
  }

  private blobPath(contentSha256: string): string {
    assertContentAddress(contentSha256);
    return join(this.root, contentSha256.slice(0, 2), contentSha256);
  }

  async put(contentSha256: string, bytes: Uint8Array): Promise<ArtifactStoragePutOutcome> {
    const path = this.blobPath(contentSha256);
    const existing = await this.get(contentSha256);
    if (existing !== null) {
      if (!bytesEqual(existing, bytes)) {
        // Different bytes under an existing content address: a sha-256
        // collision or a tampered store — loud, never silently accepted.
        throw new ArtifactStorageError(
          "unavailable",
          "fs artifact storage: different bytes already stored under this content address (corruption guard)",
        );
      }
      return { outcome: "stored", byteSize: bytes.length };
    }
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, bytes);
    return { outcome: "stored", byteSize: bytes.length };
  }

  async get(contentSha256: string): Promise<Uint8Array | null> {
    try {
      const buffer = await fs.readFile(this.blobPath(contentSha256));
      return new Uint8Array(buffer);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async head(contentSha256: string): Promise<ArtifactBlobInfo | null> {
    try {
      const stats = await fs.stat(this.blobPath(contentSha256));
      return { byteSize: stats.size };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async remove(contentSha256: string): Promise<boolean> {
    try {
      await fs.unlink(this.blobPath(contentSha256));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  describe(): ArtifactBackendDescriptor {
    return { kind: "local-fs", root: this.root };
  }
}
