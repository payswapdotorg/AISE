/**
 * HFX-401 — the GOLDEN tests: the LIVE regeneration leg of the provider
 * scorecard gate.
 *
 * The boundary matrix forbids tools → packages/backend imports, so the
 * standalone check runner (tools/provider-scorecard/runner.ts + its
 * benchmark test) consumes the COMMITTED RECORDS as data (the
 * geometry-eval discipline). THIS is the backend-side live leg: the
 * freshly computed scorecard / promotion / rollback records equal the
 * committed files under docs/productization-evidence/HFX-401/runs/
 * BYTE-FOR-BYTE — drift fails the gate. (Reading the committed artifacts
 * with node:fs — a pure file read, never an import — is the cross-zone
 * companion convention.)
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  buildProviderScorecard,
  buildScorecardCorpus,
  laneRegistryProjection,
  layerChecklistProjectionJson,
  promotionRecordJson,
  promotionVocabularyMappingJson,
  providerSlug,
  rollbackRecordJson,
  runPromotionDrill,
  runRollbackDrill,
} from "./index";

const RUNS_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "docs",
  "productization-evidence",
  "HFX-401",
  "runs",
);

const committed = (name: string): string => readFileSync(join(RUNS_DIR, name), "utf8");

describe("HFX-401 golden: the committed records are the live engine's projection", () => {
  test(
    "runs/lane-registry.json equals the freshly built corpus projection byte-for-byte",
    async () => {
      const corpus = await buildScorecardCorpus();
      expect(committed("lane-registry.json")).toBe(
        canonicalJsonStringify(laneRegistryProjection(corpus)),
      );
    },
    120000,
  );

  test("runs/layer-checklist.json equals the frozen checklist projection byte-for-byte", () => {
    expect(committed("layer-checklist.json")).toBe(
      canonicalJsonStringify(layerChecklistProjectionJson()),
    );
  });

  test("runs/promotion-vocabulary-mapping.json equals the frozen mapping byte-for-byte", () => {
    expect(committed("promotion-vocabulary-mapping.json")).toBe(
      canonicalJsonStringify(promotionVocabularyMappingJson()),
    );
  });

  test(
    "every per-provider scorecard + promotion record regenerates byte-for-byte; the rollback record too",
    async () => {
      const corpus = await buildScorecardCorpus();
      for (const provider of corpus.providers) {
        const slug = providerSlug(provider.providerId, provider.technologyVersion);
        const scorecard = buildProviderScorecard(provider, corpus);
        expect(committed(`scorecard-${slug}.json`)).toBe(canonicalJsonStringify(scorecard));

        const promotion = runPromotionDrill(provider, corpus, scorecard);
        expect(committed(`promotion-${slug}.json`)).toBe(promotionRecordJson(promotion));

        if (provider.providerId === "geometry-substitute-fine") {
          const rollback = runRollbackDrill(provider, corpus, promotion);
          expect(committed(`rollback-${slug}.json`)).toBe(rollbackRecordJson(rollback));
        }
      }
    },
    120000,
  );

  test(
    "the regeneration is idempotent: re-running the builders reproduces identical bytes",
    async () => {
      const corpus = await buildScorecardCorpus();
      const fine = corpus.providers.find(
        (provider) => provider.providerId === "geometry-substitute-fine",
      );
      if (fine === undefined) {
        throw new Error("golden: the rollback subject is missing");
      }
      const first = buildProviderScorecard(fine, corpus);
      const second = buildProviderScorecard(fine, corpus);
      expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
    },
    120000,
  );
});
