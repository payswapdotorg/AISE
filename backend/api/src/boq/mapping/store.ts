/**
 * BOQ mapping store — persistence abstraction (AISE-017).
 *
 * Contract (mirrors the AISE-011/014 store discipline; policy lives in
 * mapping/service.ts, this module is PERSISTENCE ONLY):
 *
 *  - Mapping records are APPEND-ONLY, versioned `vNNN` under
 *    `<dataDir>/boq/mappings/<sha256(importId)>/`: a put of an ALREADY
 *    EXISTING version with identical canonical bytes is an idempotent
 *    no-op; anything else (different content, or a rewrite of an older
 *    version) is refused with a typed `version_exists` error and the
 *    original bytes stay untouched — history is never rewritten.
 *  - Versions are MONOTONIC and gap-free: putting vN when the latest is
 *    not N-1 is a typed `version_gap` refusal.
 *  - The mapping lineage identity is enforced on write: `mappingId` must
 *    equal `mappingIdentity(importId)` — a record can never be filed
 *    under another import's lineage.
 *  - ONLY derived mapping records are stored — never a mutated
 *    `BoqDocument` (AISE-011 owns those) and never Reality Graph state
 *    (AISE-016 owns that).
 *  - `InMemoryMappingStore` is the deterministic twin used by tests and
 *    the router's fallback wiring; both implementations round-trip the
 *    SAME canonical bytes.
 *
 * File-system layout:
 *
 *   <dataDir>/boq/mappings/<sha256(importId)>/v001.json
 *   <dataDir>/boq/mappings/<sha256(importId)>/v002.json
 *               canonical JSON (`canonicalJsonStringify`).
 */

import { existsSync, mkdirSync, promises as fs, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { BoqError } from "../model";
import {
  mappingIdentity,
  mappingVersionFileName,
  parseMappingRecord,
  type BoqMapping,
} from "./model";

/** Validate a 64-hex import id before it is used in any path or lookup. */
function assertImportId(importId: string): void {
  if (!/^[0-9a-f]{64}$/.test(importId)) {
    throw new BoqError("boq:mapping", "import id must be 64 lowercase hex characters");
  }
}

function assertRecord(mapping: BoqMapping): void {
  assertImportId(mapping.importId);
  if (!Number.isInteger(mapping.version) || mapping.version < 1) {
    throw new BoqError("boq:mapping", "mapping version must be a positive integer");
  }
  if (mapping.mappingId !== mappingIdentity(mapping.importId)) {
    throw new BoqError("boq:mapping", "mapping record carries a mismatching lineage identity");
  }
}

/** Monotonic version file names present in one import's directory. */
function versionNumbersFrom(names: readonly string[]): number[] {
  const versions: number[] = [];
  for (const name of names) {
    const match = /^v([0-9]+)\.json$/.exec(name);
    if (match !== null) {
      versions.push(Number.parseInt(match[1] ?? "0", 10));
    }
  }
  return versions.sort((left, right) => left - right);
}

export interface MappingStore {
  /** Persist one mapping version (append-only, idempotent per version). */
  put(mapping: BoqMapping): Promise<void>;
  /** Latest mapping version for the import, or null when none exists. */
  getLatest(importId: string): Promise<BoqMapping | null>;
  /** One explicit mapping version, or null. */
  getVersion(importId: string, version: number): Promise<BoqMapping | null>;
  /** All stored version numbers, ascending. */
  listVersions(importId: string): Promise<number[]>;
  /** Canonical serialized record text (byte-comparable across stores). */
  getText(importId: string, version: number): Promise<string | null>;
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                          */
/* ------------------------------------------------------------------ */

export class FsMappingStore implements MappingStore {
  private readonly root: string;

  /** Fail fast when the subtree cannot be created (mirrors boq/store.ts). */
  constructor(dataDir: string) {
    this.root = join(dataDir, "boq", "mappings");
    mkdirSync(this.root, { recursive: true });
  }

  private importDir(importId: string): string {
    return join(this.root, sha256Hex(importId));
  }

  private versionPath(importId: string, version: number): string {
    return join(this.importDir(importId), mappingVersionFileName(version));
  }

  async put(mapping: BoqMapping): Promise<void> {
    assertRecord(mapping);
    const dir = this.importDir(mapping.importId);
    mkdirSync(dir, { recursive: true });
    const text = canonicalJsonStringify(mapping);
    const existing = versionNumbersFrom(readdirSync(dir));
    const latest = existing.length === 0 ? 0 : (existing[existing.length - 1] ?? 0);
    if (mapping.version <= latest) {
      // Append-only: identical bytes for the SAME version are a no-op;
      // anything else refuses and the original bytes stay untouched.
      const path = this.versionPath(mapping.importId, mapping.version);
      const current = existsSync(path) ? await fs.readFile(path, "utf8") : null;
      if (current !== text) {
        throw new BoqError(
          "boq:mapping",
          `mapping '${mapping.importId}' version ${mapping.version} already exists with different content`,
        );
      }
      return;
    }
    if (mapping.version > latest + 1) {
      throw new BoqError(
        "boq:mapping",
        `mapping '${mapping.importId}' version ${mapping.version} skips ahead of latest ${latest}`,
      );
    }
    await fs.writeFile(this.versionPath(mapping.importId, mapping.version), text);
  }

  async getLatest(importId: string): Promise<BoqMapping | null> {
    const versions = await this.listVersions(importId);
    if (versions.length === 0) {
      return null;
    }
    return this.getVersion(importId, versions[versions.length - 1]!);
  }

  async getVersion(importId: string, version: number): Promise<BoqMapping | null> {
    const text = await this.getText(importId, version);
    return text === null ? null : parseMappingRecord(text, importId);
  }

  async listVersions(importId: string): Promise<number[]> {
    assertImportId(importId);
    try {
      return versionNumbersFrom(await fs.readdir(this.importDir(importId)));
    } catch {
      return [];
    }
  }

  async getText(importId: string, version: number): Promise<string | null> {
    assertImportId(importId);
    if (!Number.isInteger(version) || version < 1) {
      throw new BoqError("boq:mapping", "mapping version must be a positive integer");
    }
    try {
      return await fs.readFile(this.versionPath(importId, version), "utf8");
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (tests + router fallback)                            */
/* ------------------------------------------------------------------ */

export class InMemoryMappingStore implements MappingStore {
  private readonly records = new Map<string, Map<number, string>>();

  private versionsOf(importId: string): Map<number, string> {
    let versions = this.records.get(importId);
    if (versions === undefined) {
      versions = new Map<number, string>();
      this.records.set(importId, versions);
    }
    return versions;
  }

  async put(mapping: BoqMapping): Promise<void> {
    assertRecord(mapping);
    const versions = this.versionsOf(mapping.importId);
    const existing = [...versions.keys()].sort((left, right) => left - right);
    const latest = existing.length === 0 ? 0 : (existing[existing.length - 1] ?? 0);
    const text = canonicalJsonStringify(mapping);
    if (mapping.version <= latest) {
      if (versions.get(mapping.version) !== text) {
        throw new BoqError(
          "boq:mapping",
          `mapping '${mapping.importId}' version ${mapping.version} already exists with different content`,
        );
      }
      return;
    }
    if (mapping.version > latest + 1) {
      throw new BoqError(
        "boq:mapping",
        `mapping '${mapping.importId}' version ${mapping.version} skips ahead of latest ${latest}`,
      );
    }
    versions.set(mapping.version, text);
  }

  async getLatest(importId: string): Promise<BoqMapping | null> {
    assertImportId(importId);
    const versions = this.records.get(importId);
    if (versions === undefined || versions.size === 0) {
      return null;
    }
    const latest = [...versions.keys()].sort((left, right) => left - right).pop()!;
    return this.getVersion(importId, latest);
  }

  async getVersion(importId: string, version: number): Promise<BoqMapping | null> {
    const text = await this.getText(importId, version);
    return text === null ? null : parseMappingRecord(text, importId);
  }

  async listVersions(importId: string): Promise<number[]> {
    assertImportId(importId);
    const versions = this.records.get(importId);
    return versions === undefined ? [] : [...versions.keys()].sort((left, right) => left - right);
  }

  async getText(importId: string, version: number): Promise<string | null> {
    assertImportId(importId);
    if (!Number.isInteger(version) || version < 1) {
      throw new BoqError("boq:mapping", "mapping version must be a positive integer");
    }
    return this.records.get(importId)?.get(version) ?? null;
  }
}
