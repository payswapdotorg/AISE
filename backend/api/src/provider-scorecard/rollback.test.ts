/**
 * HFX-401 — the rollback drill tests: promote → break a gate → demote →
 * historical replay. The demotion is the control plane's explicit
 * provider-retired event (the only lawful path out of promoted), the
 * fallback resolves to the incumbent reference lane, and EVERY record
 * naming the demoted provider remains interpretable through the
 * retired-provider discipline (replayRegistry).
 */

import { describe, expect, test } from "bun:test";
import {
  buildProviderScorecard,
  buildScorecardCorpus,
  runPromotionDrill,
  runRollbackDrill,
  verifyProviderRollbackRecord,
} from "./index";
import type { ProviderRollbackRecord } from "./index";

const corpus = await buildScorecardCorpus();
const fine = corpus.providers.find(
  (provider) => provider.providerId === "geometry-substitute-fine",
);
if (fine === undefined) {
  throw new Error("test: the rollback subject is missing from the corpus");
}
const scorecard = buildProviderScorecard(fine, corpus);
const promotionRecord = runPromotionDrill(fine, corpus, scorecard);

describe("HFX-401 rollback: the promote-then-demote drill", () => {
  const rollback: ProviderRollbackRecord = runRollbackDrill(fine, corpus, promotionRecord);

  test("the trigger is a POST-PROMOTION regression finding with committed evidence", () => {
    expect(rollback.trigger.gate).toBe("semantic-equivalence");
    expect(rollback.trigger.finding).toContain("post-promotion regression");
    expect(rollback.trigger.evidence.length).toBeGreaterThan(0);
    for (const evidence of rollback.trigger.evidence) {
      expect(evidence.pointer.length).toBeGreaterThan(0);
    }
  });

  test("the demotion is the control plane's EXPLICIT provider-retired event payload", () => {
    expect(rollback.demotionEvent.kind).toBe("provider-retired");
    expect(rollback.demotionEvent.providerId).toBe("geometry-substitute-fine");
    expect(rollback.demotionEvent.technologyVersion).toBe(fine.technologyVersion);
    expect(rollback.demotionEvent.reason).toContain("HFX-401 rollback");
  });

  test("the fallback points at the incumbent reference lane (the production default)", () => {
    expect(rollback.fallback.providerId).toBe("aise-engine-reference");
    expect(rollback.fallback.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(rollback.fallback.configPointer).toContain("aise-engine-reference@");
    expect(rollback.fallback.statement).toContain("production default");
  });

  test("the promotedBy citations chain to the approval drill's records", () => {
    expect(rollback.promotedBy.scorecardId).toBe(scorecard.scorecardId);
    expect(rollback.promotedBy.promotionRecordId).toBe(promotionRecord.recordId);
    expect(rollback.promotedBy.decisionEvent.decision).toBe("promoted");
  });

  test("the HISTORICAL REPLAY: every record naming the demoted provider is listed + interpretable", () => {
    const replaySet = rollback.historicalReplay.recordsNamingDemotedProvider;
    // the 22 committed per-sequence lane records + manifests of the fine lane
    expect(replaySet.laneRecordIds).toHaveLength(fine.rows.length);
    expect(replaySet.laneManifestIds).toHaveLength(fine.rows.length);
    for (const id of [...replaySet.laneRecordIds, ...replaySet.laneManifestIds]) {
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    }
    // the drill's own consolidated record + sealed manifest
    expect(replaySet.consolidatedRecordId).toBe(fine.kit.consolidatedRecord.recordId);
    expect(replaySet.sealedManifestId).toBe(fine.kit.sealedManifest.manifestId);

    const replay = rollback.historicalReplay.replay;
    expect(replay.method).toBe("replayRegistry");
    expect(replay.replayEqual).toBe(true);
    expect(replay.recordsIntact).toBe(true);
    expect(replay.demotedEntryState).toBe("retired");
    expect(rollback.historicalReplay.interpretable).toBe(true);
    // the log: register + evaluation + 22 executions + record + manifest + promotion + retirement
    expect(replay.eventCount).toBe(fine.kit.executions.length + 6);
    expect(replay.eventsDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the rollback record verifies against the corpus (fallback resolves, replay holds, digest re-derives)", () => {
    expect(verifyProviderRollbackRecord(rollback, fine, corpus).ok).toBe(true);
  });

  test("the drill is deterministic (byte-identical re-run)", () => {
    const second = runRollbackDrill(fine, corpus, promotionRecord);
    expect(JSON.stringify(second)).toBe(JSON.stringify(rollback));
  });
});

describe("HFX-401 rollback: the negative paths", () => {
  const rollback: ProviderRollbackRecord = runRollbackDrill(fine, corpus, promotionRecord);

  test("a record whose demotion is NOT the explicit retirement is refused", () => {
    const forged = {
      ...rollback,
      demotionEvent: {
        ...rollback.demotionEvent,
        kind: "promotion-decided" as never,
      },
    };
    const verification = verifyProviderRollbackRecord(forged, fine, corpus);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures.some((failure) => failure.kind === "demotion-not-explicit"))
        .toBe(true);
    }
  });

  test("a record with an UNRESOLVABLE fallback pointer is refused", () => {
    const forged = {
      ...rollback,
      fallback: {
        ...rollback.fallback,
        providerId: "some-unregistered-provider",
      },
    };
    const verification = verifyProviderRollbackRecord(forged, fine, corpus);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures.some((failure) => failure.kind === "fallback-unresolved"))
        .toBe(true);
    }
  });

  test("a record that OMITS records naming the demoted provider is refused (the replay set must be complete)", () => {
    const forged = {
      ...rollback,
      historicalReplay: {
        ...rollback.historicalReplay,
        recordsNamingDemotedProvider: {
          ...rollback.historicalReplay.recordsNamingDemotedProvider,
          laneRecordIds: rollback.historicalReplay.recordsNamingDemotedProvider.laneRecordIds.slice(
            0,
            5,
          ),
        },
      },
    };
    const verification = verifyProviderRollbackRecord(forged, fine, corpus);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures.some((failure) => failure.kind === "records-not-listed"))
        .toBe(true);
    }
  });

  test("a record whose replay proof does not hold is refused", () => {
    const forged = {
      ...rollback,
      historicalReplay: {
        ...rollback.historicalReplay,
        replay: {
          ...rollback.historicalReplay.replay,
          recordsIntact: false,
        },
      },
    };
    const verification = verifyProviderRollbackRecord(forged, fine, corpus);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(
        verification.failures.some((failure) => failure.kind === "replay-not-interpretable"),
      ).toBe(true);
    }
  });

  test("a tampered record fails the content-address check", () => {
    const forged = {
      ...rollback,
      trigger: { ...rollback.trigger, gate: "license-use-clearance" as never },
    };
    const verification = verifyProviderRollbackRecord(forged, fine, corpus);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures.some((failure) => failure.kind === "record-id-mismatch"))
        .toBe(true);
    }
  });
});
