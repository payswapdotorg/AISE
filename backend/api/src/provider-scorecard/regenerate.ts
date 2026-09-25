/**
 * HFX-401 — the committed-record REGENERATION CLI (the evidence writer).
 *
 * Regenerates the committed scorecard/promotion/rollback records under
 * `docs/productization-evidence/HFX-401/runs/` DETERMINISTICALLY (canonical
 * JSON: recursively sorted keys, 2-space indent, trailing newline — the
 * geometry-eval `regenerate.ts` pattern):
 *
 *   runs/lane-registry.json                     the scored-provider corpus
 *                                               projection (the standalone
 *                                               tools runner's input)
 *   runs/layer-checklist.json                   the versioned per-layer
 *                                               checklist projection
 *   runs/promotion-vocabulary-mapping.json      the work-order ↔
 *                                               control-plane mapping
 *   runs/scorecard-<slug>.json                  the per-provider
 *                                               machine-readable
 *                                               scorecards (7 providers)
 *   runs/promotion-<slug>.json                  the per-provider promotion
 *                                               records (the two-path
 *                                               drill: approvals + the
 *                                               refusals naming every
 *                                               failed gate)
 *   runs/rollback-geometry-substitute-fine.json the rollback drill record
 *                                               (demote + fallback +
 *                                               historical replay)
 *
 * Run from the repo root (or the backend/api workspace):
 *
 *   bun backend/api/src/provider-scorecard/regenerate.ts
 *
 * The committed files regenerate BYTE-IDENTICALLY (no clock, no
 * randomness, no network). The golden test (golden.test.ts) recomputes and
 * byte-compares — a corpus or engine change without a re-run fails
 * `bun run verify`. The standalone tools runner independently re-derives
 * and re-verifies everything from the committed data.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

const RUNS_DIR = resolve(
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

// CLI output seam (the lint gate's no-console rule: a CLI's stdout IS its
// output contract — deterministic transcript lines, never console.*).
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function write(name: string, json: string): void {
  writeFileSync(resolve(RUNS_DIR, name), json, "utf8");
  out(`  ${name} (${json.length} bytes)`);
}

async function main(): Promise<void> {
  mkdirSync(RUNS_DIR, { recursive: true });
  out("HFX-401 provider-scorecard regeneration — the committed records:");

  const corpus = await buildScorecardCorpus();
  write("lane-registry.json", canonicalJsonStringify(laneRegistryProjection(corpus)));
  write("layer-checklist.json", canonicalJsonStringify(layerChecklistProjectionJson()));
  write(
    "promotion-vocabulary-mapping.json",
    canonicalJsonStringify(promotionVocabularyMappingJson()),
  );

  const rollbackSubjectId = "geometry-substitute-fine";
  for (const provider of corpus.providers) {
    const slug = providerSlug(provider.providerId, provider.technologyVersion);
    const scorecard = buildProviderScorecard(provider, corpus);
    write(`scorecard-${slug}.json`, canonicalJsonStringify(scorecard));

    const promotionRecord = runPromotionDrill(provider, corpus, scorecard);
    write(`promotion-${slug}.json`, promotionRecordJson(promotionRecord));

    if (provider.providerId === rollbackSubjectId) {
      if (!scorecard.verdict.productionEligible) {
        throw new Error(
          "provider-scorecard regenerate: the rollback subject must be production-eligible",
        );
      }
      const rollbackRecord = runRollbackDrill(provider, corpus, promotionRecord);
      write(`rollback-${slug}.json`, rollbackRecordJson(rollbackRecord));
    }
  }

  out(
    `scored ${corpus.providers.length} providers over the committed corpus ` +
      `(geometry ${corpus.geometry.sequenceCount} sequences; equivalence ` +
      `${corpus.equivalence.total} pairs)`,
  );
}

await main();
