/**
 * BOQ normalization service (AISE-014) — the policy engine over a
 * `NormalizationStore` and a READ-ONLY `BoqService`.
 *
 * Flow (architecture-lock "BOQ Lens"): normalization is a DERIVED view
 * layer — the parsed `BoqDocument` owned by the AISE-011 store is fetched,
 * projected by the pure normalizer and persisted content-addressed under
 * `sha256(importId + DICTIONARY_VERSION)`. The source document is never
 * mutated, and its record bytes are unchanged after normalization
 * (asserted by service.test.ts).
 *
 * Idempotency: the normalizer is pure and the store is write-once, so
 * re-normalizing the same import under the same dictionary version writes
 * a byte-identical file (or no-ops when it already exists) and returns an
 * equal view. A dictionary-version change derives a NEW view file; older
 * views stay readable (version-keyed, never overwritten).
 *
 * Errors: `NormalizationServiceError` (code `no_parsed_document`) is the
 * honest refusal for imports stored without a parsed document (the PDF
 * known limitation of AISE-011 — nothing to normalize, never a fake view).
 * Unknown imports return null so the router can answer a precise 404.
 *
 * The injected clock is accepted for service-shape symmetry with
 * `BoqService` but deliberately UNUSED: derived views are timestamp-free
 * so that identical inputs always produce identical view bytes.
 */

import { BoqError } from "../model";
import type { BoqService } from "../service";
import { DICTIONARY_VERSION } from "./dictionaries";
import { normalizeBoqDocument } from "./normalizer";
import type { NormalizationStore } from "./store";
import type { NormalizedBoqView } from "./types";

/** Typed domain refusal (mapped to 422 by the router). */
export class NormalizationServiceError extends BoqError {
  readonly code: "no_parsed_document";

  constructor(detail: string) {
    super("boq:normalization", detail);
    this.name = "NormalizationServiceError";
    this.code = "no_parsed_document";
  }
}

export interface NormalizationServiceOptions {
  /** Derived-view persistence (Fs or in-memory twin). */
  readonly store: NormalizationStore;
  /**
   * Injected clock (ISO timestamp) — deterministic in tests. Reserved: the
   * derived view is deliberately timestamp-free (determinism), so the clock
   * is not consulted anywhere in this service yet.
   */
  readonly clock: () => string;
  /** READ-ONLY access to the parsed documents of the AISE-011 ingestion service. */
  readonly boq: BoqService;
}

export class NormalizationService {
  private readonly options: NormalizationServiceOptions;

  constructor(options: NormalizationServiceOptions) {
    this.options = options;
  }

  /**
   * Normalize one import's parsed document (idempotent): unknown import ->
   * null; import without a parsed document -> `NormalizationServiceError`;
   * otherwise the derived view, persisted write-once under its
   * content-addressed key.
   */
  async normalizeImport(importId: string): Promise<NormalizedBoqView | null> {
    const imported = await this.options.boq.getImport(importId);
    if (imported === null) {
      return null;
    }
    const document = imported.parse.document;
    if (imported.parse.status !== "parsed" || document === undefined) {
      throw new NormalizationServiceError(
        `import '${importId}' has no parsed document to normalize (status '${imported.parse.status}')`,
      );
    }
    const view = normalizeBoqDocument(document, importId);
    await this.options.store.put(view);
    return view;
  }

  /** The stored derived view for the CURRENT dictionary version, or null. */
  async getNormalization(importId: string): Promise<NormalizedBoqView | null> {
    return this.options.store.get(importId, DICTIONARY_VERSION);
  }
}
