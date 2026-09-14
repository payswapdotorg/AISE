/**
 * BOQ normalization store — persistence abstraction (AISE-014).
 *
 * Contract (mirrors the AISE-011 boq/store.ts discipline; policy lives in
 * normalization/service.ts, this module is PERSISTENCE ONLY):
 *
 *  - Derived views are WRITE-ONCE, content-addressed by
 *    `sha256(importId + DICTIONARY_VERSION)`: a re-put of the identical
 *    canonical serialization is an idempotent no-op; the (practically only
 *    a bug) same-key-different-content case is refused with a typed error
 *    and the original view is retained verbatim.
 *  - ONLY the view is stored — never a mutated `BoqDocument` (the source
 *    document lives in the AISE-011 store and is untouched by AISE-014).
 *  - A dictionary-version bump derives a NEW key, so views produced under
 *    an older dictionary version remain readable and are never overwritten.
 *  - `InMemoryNormalizationStore` is the deterministic twin used by tests.
 *
 * File-system layout (`FsNormalizationStore`, constructed with the API
 * dataDir; the module creates the subtree itself — no config.ts involvement):
 *
 *   <dataDir>/boq/normalizations/<sha256(importId+dictionaryVersion)>.json
 *               canonical JSON (`canonicalJsonStringify`), no timestamps.
 */

import { existsSync, mkdirSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { BoqError } from "../model";
import type { NormalizedBoqView } from "./types";

/** Content-addressed file key of one derived view (design: importId + version). */
export function normalizationViewKey(importId: string, dictionaryVersion: string): string {
  return sha256Hex(importId + dictionaryVersion);
}

/** Validate a 64-hex import id before it is used in any path or lookup. */
function assertImportId(importId: string): void {
  if (!/^[0-9a-f]{64}$/.test(importId)) {
    throw new BoqError("boq:normalization", "import id must be 64 lowercase hex characters");
  }
}

/** Parse a stored view defensively (typed error on garbage or mismatch). */
function parseView(text: string, importId: string, dictionaryVersion: string): NormalizedBoqView {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BoqError("boq:normalization", `view for '${importId}' is not valid JSON`);
  }
  const view = value as NormalizedBoqView;
  if (view.importId !== importId || view.dictionaryVersion !== dictionaryVersion) {
    throw new BoqError("boq:normalization", `view for '${importId}' carries a mismatching identity`);
  }
  return view;
}

export interface NormalizationStore {
  /** Persist a derived view (canonical JSON, write-once, idempotent). */
  put(view: NormalizedBoqView): Promise<void>;
  /** Stored view by import id + dictionary version, or null. */
  get(importId: string, dictionaryVersion: string): Promise<NormalizedBoqView | null>;
  /** Canonical serialized view text (byte-comparable across stores). */
  getText(importId: string, dictionaryVersion: string): Promise<string | null>;
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                          */
/* ------------------------------------------------------------------ */

export class FsNormalizationStore implements NormalizationStore {
  private readonly dir: string;

  /** Fail fast when the subtree cannot be created (mirrors boq/store.ts). */
  constructor(dataDir: string) {
    this.dir = join(dataDir, "boq", "normalizations");
    mkdirSync(this.dir, { recursive: true });
  }

  private viewPath(importId: string, dictionaryVersion: string): string {
    return join(this.dir, `${normalizationViewKey(importId, dictionaryVersion)}.json`);
  }

  async put(view: NormalizedBoqView): Promise<void> {
    assertImportId(view.importId);
    const path = this.viewPath(view.importId, view.dictionaryVersion);
    const text = canonicalJsonStringify(view);
    if (existsSync(path)) {
      // Write-once: identical views are no-ops (idempotent re-normalization);
      // anything else is a determinism bug in the caller and is refused.
      const existing = await fs.readFile(path, "utf8");
      if (existing !== text) {
        throw new BoqError(
          "boq:normalization",
          `view '${view.importId}'@${view.dictionaryVersion} already exists with different content`,
        );
      }
      return;
    }
    await fs.writeFile(path, text);
  }

  async get(importId: string, dictionaryVersion: string): Promise<NormalizedBoqView | null> {
    const text = await this.getText(importId, dictionaryVersion);
    return text === null ? null : parseView(text, importId, dictionaryVersion);
  }

  async getText(importId: string, dictionaryVersion: string): Promise<string | null> {
    assertImportId(importId);
    try {
      return await fs.readFile(this.viewPath(importId, dictionaryVersion), "utf8");
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (tests)                                              */
/* ------------------------------------------------------------------ */

export class InMemoryNormalizationStore implements NormalizationStore {
  private readonly views = new Map<string, string>();

  async put(view: NormalizedBoqView): Promise<void> {
    assertImportId(view.importId);
    const key = normalizationViewKey(view.importId, view.dictionaryVersion);
    const text = canonicalJsonStringify(view);
    const existing = this.views.get(key);
    if (existing !== undefined && existing !== text) {
      throw new BoqError(
        "boq:normalization",
        `view '${view.importId}'@${view.dictionaryVersion} already exists with different content`,
      );
    }
    this.views.set(key, text);
  }

  async get(importId: string, dictionaryVersion: string): Promise<NormalizedBoqView | null> {
    const text = await this.getText(importId, dictionaryVersion);
    return text === null ? null : parseView(text, importId, dictionaryVersion);
  }

  async getText(importId: string, dictionaryVersion: string): Promise<string | null> {
    assertImportId(importId);
    return this.views.get(normalizationViewKey(importId, dictionaryVersion)) ?? null;
  }
}
