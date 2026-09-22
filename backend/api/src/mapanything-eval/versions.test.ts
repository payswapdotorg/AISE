/**
 * HFX-101 — the VERSIONS tests: the derived-reconstruction-version
 * discipline — reprocessing creates a NEW derived reconstruction version;
 * the original evidence-revision binding is immutable; the original
 * outcome/record/manifest and the committed corpus are never mutated.
 */

import { describe, expect, test } from "bun:test";
import { applyRegistryEvent, createProviderRegistry, replayRegistry } from "@aise/provider-registry";
import { evaluateMapAnythingRun, mapAnythingRegistryLogFor } from "./harness";
import { mapAnythingRunOf } from "./corpus";
import { canonicalDigestOf } from "./model";
import {
  derivedReconstructionVersionOf,
  firstDerivedVersionOf,
  reprocessMapAnythingRun,
} from "./versions";

const RUN = mapAnythingRunOf("recon-multiimage-flagship-grounded-001@mapanything");

function lifecycleLog(): ReturnType<typeof mapAnythingRegistryLogFor> {
  // the minimal lawful log the run + its reprocess consume (register + evaluation-started).
  return mapAnythingRegistryLogFor(RUN);
}

describe("HFX-101 versions: reprocessing creates a NEW derived reconstruction version", () => {
  test("the reprocess addresses a NEW version id (ordinal 2) while the original stays addressable", () => {
    const log = lifecycleLog();
    const original = evaluateMapAnythingRun(RUN, log);
    const originalVersion = firstDerivedVersionOf(original);
    expect(originalVersion.ordinal).toBe(1);
    expect(originalVersion.status).toBe("content");

    const reprocess = reprocessMapAnythingRun(RUN, log, original);
    expect(reprocess.newVersionCreated).toBe(true);
    expect(reprocess.newVersion.ordinal).toBe(2);
    expect(reprocess.newVersion.versionId).not.toBe(reprocess.originalVersion.versionId);
    expect(reprocess.originalVersion.versionId).toBe(originalVersion.versionId);
  });

  test("the original evidence-revision binding is IMMUTABLE (the reprocess binds to the same revisions)", () => {
    const log = lifecycleLog();
    const original = evaluateMapAnythingRun(RUN, log);
    const reprocess = reprocessMapAnythingRun(RUN, log, original);
    expect(reprocess.evidenceBindingUnchanged).toBe(true);
    expect(reprocess.newVersion.evidenceRevisions).toEqual(["r1", "r2"]);
    expect(reprocess.newVersion.evidenceRevisions).toEqual(
      reprocess.originalVersion.evidenceRevisions,
    );
  });

  test("the original outcome, record and manifest are UNCHANGED by the reprocess (pure functions)", () => {
    const log = lifecycleLog();
    const original = evaluateMapAnythingRun(RUN, log);
    const originalSnapshot = JSON.stringify(original);
    const originalRecordId = original.layer1.record.recordId;
    const originalManifestId = original.layer1.manifest.manifestId;

    const reprocess = reprocessMapAnythingRun(RUN, log, original);
    expect(JSON.stringify(original)).toBe(originalSnapshot); // the original object is untouched
    expect(reprocess.originalArtifactsUnchanged).toBe(true);
    // the deterministic double reproduces the identical content (the same content address):
    expect(reprocess.reprocessed.layer1.record.recordId).toBe(originalRecordId);
    expect(reprocess.reprocessed.layer1.manifest.manifestId).toBe(originalManifestId);
    // a SECOND reprocess from the reprocessed outcome addresses ordinal 3 (a version LEDGER):
    const second = reprocessMapAnythingRun(RUN, log, reprocess.reprocessed, 2);
    expect(second.newVersion.ordinal).toBe(3);
    expect(second.newVersion.versionId).not.toBe(reprocess.newVersion.versionId);
    expect(second.newVersion.versionId).not.toBe(reprocess.originalVersion.versionId);
  });

  test("the committed corpus is NEVER mutated by reprocessing (the frozen field evidence)", () => {
    const corpusBefore = canonicalDigestOf(
      mapAnythingRunOf("recon-multiimage-flagship-grounded-001@mapanything").task,
    );
    const log = lifecycleLog();
    const original = evaluateMapAnythingRun(RUN, log);
    reprocessMapAnythingRun(RUN, log, original);
    reprocessMapAnythingRun(RUN, log, original, 5);
    expect(canonicalDigestOf(mapAnythingRunOf("recon-multiimage-flagship-grounded-001@mapanything").task)).toBe(
      corpusBefore,
    );
  });

  test("the reprocess appends a LAWFUL execution event to the registry log (replayable)", () => {
    const log = lifecycleLog();
    const original = evaluateMapAnythingRun(RUN, log);
    const reprocess = reprocessMapAnythingRun(RUN, log, original);

    let registry = createProviderRegistry();
    for (const event of log) {
      const result = applyRegistryEvent(registry, event);
      expect(result.ok).toBe(true);
      if (result.ok) {
        registry = result.registry;
      }
    }
    const appended = applyRegistryEvent(registry, reprocess.appendedEvent);
    expect(appended.ok).toBe(true);
    const replay = replayRegistry([...log, reprocess.appendedEvent]);
    expect(replay.ok).toBe(true);
  });

  test("a refusal-path run addresses a NON-READY derived version (no fabricated reconstruction)", () => {
    const run = mapAnythingRunOf("recon-multiimage-failed-resource-007@mapanything");
    const outcome = evaluateMapAnythingRun(run, mapAnythingRegistryLogFor(run));
    const version = derivedReconstructionVersionOf({
      runId: outcome.runId,
      providerId: outcome.layer1.record.providerId,
      technologyVersion: outcome.layer1.record.technologyVersion,
      inputDigest: outcome.layer1.record.reproduction.inputsDigest,
      ordinal: 1,
      outcome,
    });
    expect(version.status).toBe("non-ready");
    expect(version.evidenceRevisions).toEqual(["r1"]);
    // reprocessing the failed invocation stays non-ready (still no fabrication):
    const reprocess = reprocessMapAnythingRun(run, mapAnythingRegistryLogFor(run), outcome);
    expect(reprocess.newVersion.status).toBe("non-ready");
    expect(reprocess.newVersionCreated).toBe(true);
  });
});
