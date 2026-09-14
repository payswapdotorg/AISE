/**
 * BOQ mapping service (AISE-017) — the policy engine over a `MappingStore`,
 * a READ-ONLY `NormalizationService` (AISE-014 derived views) and a
 * READ-ONLY `BoqService` (AISE-011 import registry).
 *
 * Flow (architecture-lock "BOQ Lens"): mapping is a DERIVED layer over two
 * untouched sources. The deterministic matcher projects the import's STORED
 * normalized view (014) against a caller-supplied reality-graph snapshot
 * (AISE-016 nodes, location breadcrumbs precomputed by the caller) and the
 * result is persisted as the import's NEXT append-only mapping version.
 * Neither the BOQ document bytes nor the graph are ever written here.
 *
 * Typed refusals (the router translates them; never silent):
 *  - `normalization_required` — no STORED normalized view for the import
 *    (run AISE-014 first; the router answers 409).
 *  - `mapping_not_found` — manual mapping onto an import with no mapping
 *    versions yet (the router answers 404).
 *  - `entry_not_found` (MappingError) — manual entryId absent from the
 *    latest version (the router answers 422).
 *
 * Unknown imports return null so the router can answer a precise 404.
 * The clock is INJECTED (deterministic in tests) and stamps every entry's
 * provenance once per run.
 */

import { BoqError } from "../model";
import type { BoqService } from "../service";
import type { NormalizationService } from "../normalization/service";
import { mapBoqToReality, applyManualMapping } from "./matcher";
import {
  mappingIdentity,
  type BoqMapping,
  type GraphSnapshot,
  type ManualMappingInput,
} from "./model";
import type { MappingStore } from "./store";

/** Typed domain refusal (mapped by the router to precise status codes). */
export class MappingServiceError extends BoqError {
  readonly code: "normalization_required" | "mapping_not_found";

  constructor(code: "normalization_required" | "mapping_not_found", detail: string) {
    super("boq:mapping", detail);
    this.name = "MappingServiceError";
    this.code = code;
  }
}

export interface MappingServiceOptions {
  /** Mapping-record persistence (Fs or in-memory twin). */
  readonly store: MappingStore;
  /** Injected clock (ISO timestamp) — deterministic in tests. */
  readonly clock: () => string;
  /** READ-ONLY access to the stored AISE-014 derived views. */
  readonly normalization: NormalizationService;
  /** READ-ONLY access to the AISE-011 import registry. */
  readonly boq: BoqService;
}

export class MappingService {
  private readonly options: MappingServiceOptions;

  constructor(options: MappingServiceOptions) {
    this.options = options;
  }

  /**
   * Run the deterministic matcher over the import's STORED normalized view
   * and persist the outcome as the next append-only version.
   * Unknown import -> null; missing derived view -> typed
   * `normalization_required` refusal (never a guessed mapping).
   */
  async runMatcher(importId: string, snapshot: GraphSnapshot): Promise<BoqMapping | null> {
    const imported = await this.options.boq.getImport(importId);
    if (imported === null) {
      return null;
    }
    const view = await this.options.normalization.getNormalization(importId);
    if (view === null) {
      throw new MappingServiceError(
        "normalization_required",
        `import '${importId}' has no stored normalized view — run POST /v1/boq/imports/:id/normalization first`,
      );
    }
    const entries = mapBoqToReality({
      interpretations: view.perItem,
      normalizedView: view,
      graphSnapshot: snapshot,
      now: this.options.clock(),
    });
    const versions = await this.options.store.listVersions(importId);
    const latest = versions.length === 0 ? 0 : (versions[versions.length - 1] ?? 0);
    const mapping: BoqMapping = {
      mappingId: mappingIdentity(importId),
      importId,
      version: latest + 1,
      entries,
    };
    await this.options.store.put(mapping);
    return mapping;
  }

  /**
   * Apply one manual mapping decision onto the LATEST version -> a NEW
   * version (append-only: earlier versions keep their bytes). Unknown
   * import -> null; no mapping yet -> typed `mapping_not_found`; unknown
   * entryId -> typed `entry_not_found` (never a silent no-op).
   */
  async applyManualMapping(
    importId: string,
    manual: ManualMappingInput,
  ): Promise<BoqMapping | null> {
    const imported = await this.options.boq.getImport(importId);
    if (imported === null) {
      return null;
    }
    const latest = await this.options.store.getLatest(importId);
    if (latest === null) {
      throw new MappingServiceError(
        "mapping_not_found",
        `import '${importId}' has no stored mapping to amend — run the deterministic matcher first`,
      );
    }
    const mapping = applyManualMapping(latest, manual, this.options.clock());
    await this.options.store.put(mapping);
    return mapping;
  }

  /** Latest stored mapping version, or null (import existence is the router's check). */
  async getLatest(importId: string): Promise<BoqMapping | null> {
    return this.options.store.getLatest(importId);
  }

  /** One explicit stored mapping version, or null. */
  async getVersion(importId: string, version: number): Promise<BoqMapping | null> {
    return this.options.store.getVersion(importId, version);
  }

  /** All stored version numbers for the import, ascending. */
  async listVersions(importId: string): Promise<number[]> {
    return this.options.store.listVersions(importId);
  }
}
