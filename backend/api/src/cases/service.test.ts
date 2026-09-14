/**
 * AISE-025 — Engineering Case service tests. THE CRITICAL MATRIX.
 *
 * Epistemic separation (facts vs inferences never merge, type-level +
 * runtime), evidence traceability (verbatim ids, rejections), the governed
 * lifecycle (review-gated resolution, immutability after resolution),
 * waiver discipline (never silent), append-only history (prior event
 * digests unchanged), determinism (byte-identical fresh stores) and
 * confidence discipline (advisory belief never masquerades as
 * measurement uncertainty).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import { CaseError, caseContentDigest, type CaseErrorCode, type EngineeringCase } from "./model";
import { CaseService } from "./service";
import { FsCaseStore } from "./store";
import {
  EV_MOISTURE_READING,
  EV_ROOF_VIDEO,
  EV_WALL_PHOTO,
  FIXED_EVEN_LATER,
  FIXED_LATER,
  FIXED_NOW,
  fixedClock,
  makeSequenceClock,
  runLifecycle,
  withTempDir,
} from "./testkit";

const EMPTY_LINKS = { nodeIds: [], evidenceIds: [], captureSessionIds: [] } as const;

async function serviceIn(root: string): Promise<{ service: CaseService; root: string }> {
  const service = new CaseService({ store: new FsCaseStore(join(root, "data")), clock: fixedClock });
  return { service, root };
}

async function expectCode(fn: () => Promise<unknown>, code: CaseErrorCode): Promise<void> {
  try {
    await fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(CaseError);
    expect((error as CaseError).code).toBe(code);
  }
}

/** Walk one hypothesis object and collect every key name recursively. */
function keyNames(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) keyNames(entry, into);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      into.push(key);
      keyNames(entry, into);
    }
  }
  return into;
}

describe("cases service: governed lifecycle", () => {
  test("happy path: create → observe → hypothesize → missing-evidence → collect → review → resolve", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      expect((await service.getCase(ids.caseId))?.status).toBe("open");
      await service.collectEvidence(ids.caseId, ids.missingId);
      expect((await service.getCase(ids.caseId))?.status).toBe("open");
      const review = await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-1",
        decision: "approved",
        note: "Evidence chain verified.",
      });
      expect(review.decision).toBe("approved");
      expect((await service.getCase(ids.caseId))?.status).toBe("under_review");
      const resolved = await service.resolveCase(ids.caseId);
      expect(resolved.status).toBe("resolved");
      const record = (await service.getCase(ids.caseId)) as EngineeringCase;
      // Facts and inferences stayed separate through the whole lifecycle.
      expect(record.observations).toHaveLength(1);
      expect(record.hypotheses).toHaveLength(1);
      expect(record.missingEvidence[0]?.status).toBe("collected");
      expect(record.review?.reviewer).toBe("eng-reviewer-1");
      // Seven mutations → seven append-only events, in order.
      expect(record.history.map((event) => event.eventType)).toEqual([
        "case_created",
        "observation_recorded",
        "hypothesis_recorded",
        "missing_evidence_recorded",
        "missing_evidence_collected",
        "review_submitted",
        "case_resolved",
      ]);
      expect(record.history.map((event) => event.eventId)).toEqual([
        "evt-000001",
        "evt-000002",
        "evt-000003",
        "evt-000004",
        "evt-000005",
        "evt-000006",
        "evt-000007",
      ]);
    });
  });

  test("resolve without review → refusal naming the rule", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      try {
        await service.resolveCase(ids.caseId);
        expect.unreachable("expected review_required_for_resolution");
      } catch (error) {
        expect(error).toBeInstanceOf(CaseError);
        const typed = error as CaseError;
        expect(typed.code).toBe("review_required_for_resolution");
        expect(typed.detail).toContain("review");
      }
    });
  });

  test("only an APPROVED review permits resolution", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-1",
        decision: "needs_more_evidence",
        note: "Get the roof footage first.",
      });
      await expectCode(() => service.resolveCase(ids.caseId), "review_not_approved");
      await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-1",
        decision: "rejected",
        note: "Not supported.",
      });
      await expectCode(() => service.resolveCase(ids.caseId), "review_not_approved");
      // The approval gate opens only with an approved review.
      await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-2",
        decision: "approved",
        note: "Verified after re-review.",
      });
      expect((await service.resolveCase(ids.caseId)).status).toBe("resolved");
    });
  });

  test("a resolved case is immutable: every mutation refuses with already_resolved", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-1",
        decision: "approved",
        note: "ok",
      });
      await service.resolveCase(ids.caseId);
      const missingId = ids.missingId;
      await expectCode(() => service.resolveCase(ids.caseId), "already_resolved");
      await expectCode(
        () =>
          service.addObservation(ids.caseId, {
            statement: "late observation",
            evidenceIds: [EV_WALL_PHOTO],
          }),
        "already_resolved",
      );
      await expectCode(
        () =>
          service.addHypothesis(ids.caseId, {
            statement: "late hypothesis",
            epistemicStatus: "PROPOSED",
            supportingObservationIds: [],
            contradictingObservationIds: [],
            confidence: "low",
          }),
        "already_resolved",
      );
      await expectCode(
        () =>
          service.addMissingEvidence(ids.caseId, {
            description: "late gap",
            kind: "MISSING",
            wouldResolve: [],
          }),
        "already_resolved",
      );
      await expectCode(() => service.collectEvidence(ids.caseId, missingId), "already_resolved");
      await expectCode(() => service.waiveEvidence(ids.caseId, missingId, "late"), "already_resolved");
      await expectCode(
        () =>
          service.submitReview(ids.caseId, {
            reviewer: "eng-2",
            decision: "approved",
            note: "late",
          }),
        "already_resolved",
      );
    });
  });
});

describe("cases service: epistemic separation and evidence traceability", () => {
  test("facts and inferences are returned in SEPARATE arrays, never merged", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      const record = (await service.getCase(ids.caseId)) as EngineeringCase;
      expect(record.observations).toHaveLength(1);
      expect(record.hypotheses).toHaveLength(1);
      expect(record.observations[0]?.observationId).toBe(ids.observationId);
      expect(record.hypotheses[0]?.hypothesisId).toBe(ids.hypothesisId);
      // The fact is OBSERVED; the inference is INFERRED — and neither array
      // contains a member of the other family.
      expect(record.observations.every((observation) => observation.epistemicStatus === "OBSERVED")).toBe(true);
      expect(record.hypotheses.every((hypothesis) => hypothesis.epistemicStatus === "INFERRED" || hypothesis.epistemicStatus === "PROPOSED")).toBe(true);
      const asJson = JSON.stringify(record);
      expect(JSON.stringify(record.observations)).not.toBe(JSON.stringify(record.hypotheses));
      expect(asJson).toContain('"epistemicStatus":"OBSERVED"');
      expect(asJson).toContain('"epistemicStatus":"INFERRED"');
    });
  });

  test("an observation without evidence is rejected (service-level defense in depth)", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      await expectCode(
        () =>
          service.addObservation("case-1", {
            statement: "unsupported claim",
            evidenceIds: [],
          }),
        "observation_without_evidence",
      );
    });
  });

  test("evidence ids are preserved VERBATIM (order included)", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      const observation = await service.addObservation("case-1", {
        statement: "Damp staining with efflorescence.",
        evidenceIds: [EV_MOISTURE_READING, EV_WALL_PHOTO, EV_ROOF_VIDEO],
        measurementRefs: ["meas-moisture-7", "meas-moisture-8"],
      });
      expect(observation.evidenceIds).toEqual([EV_MOISTURE_READING, EV_WALL_PHOTO, EV_ROOF_VIDEO]);
      const record = await service.getCase("case-1");
      expect(record?.observations[0]?.evidenceIds).toEqual([EV_MOISTURE_READING, EV_WALL_PHOTO, EV_ROOF_VIDEO]);
      expect(record?.observations[0]?.measurementRefs).toEqual(["meas-moisture-7", "meas-moisture-8"]);
    });
  });

  test("a hypothesis referencing an unknown observation is a typed refusal; the mutation discriminates", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      try {
        await service.addHypothesis("case-1", {
          statement: "s",
          epistemicStatus: "INFERRED",
          supportingObservationIds: ["obs-unknown"],
          contradictingObservationIds: [],
          confidence: "low",
        });
        expect.unreachable("expected unknown_observation_ref");
      } catch (error) {
        expect(error).toBeInstanceOf(CaseError);
        const typed = error as CaseError;
        expect(typed.code).toBe("unknown_observation_ref");
        expect(typed.detail).toContain("obs-unknown");
      }
      const observation = await service.addObservation("case-1", {
        statement: "s",
        evidenceIds: [EV_WALL_PHOTO],
      });
      const hypothesis = await service.addHypothesis("case-1", {
        statement: "s",
        epistemicStatus: "INFERRED",
        supportingObservationIds: [observation.observationId],
        contradictingObservationIds: [],
        confidence: "low",
      });
      expect(hypothesis.supportingObservationIds).toEqual([observation.observationId]);
    });
  });

  test("missing evidence naming an unknown hypothesis is a typed refusal", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      await expectCode(
        () =>
          service.addMissingEvidence("case-1", {
            description: "d",
            kind: "MISSING",
            wouldResolve: ["hyp-ghost"],
          }),
        "unknown_hypothesis_ref",
      );
    });
  });

  test("observations are immutable: a correction is a NEW contradicting observation", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      const before = await service.getCase(ids.caseId);
      const original = before?.observations[0];
      const correction = await service.addObservation(ids.caseId, {
        statement: "Correction: staining limited to the parapet detail, not the full wall.",
        evidenceIds: [EV_ROOF_VIDEO],
      });
      await service.addHypothesis(ids.caseId, {
        statement: "Parapet flashing failure, not render failure.",
        epistemicStatus: "PROPOSED",
        supportingObservationIds: [correction.observationId],
        contradictingObservationIds: [ids.observationId],
        confidence: "low",
      });
      const after = await service.getCase(ids.caseId);
      // The ORIGINAL observation is byte-identical — never edited or removed.
      expect(after?.observations[0]).toEqual(original);
      expect(after?.observations).toHaveLength(2);
      const proposed = after?.hypotheses[1];
      expect(proposed?.contradictingObservationIds).toEqual([ids.observationId]);
      expect(proposed?.supportingObservationIds).toEqual([correction.observationId]);
    });
  });

  test("confidence is advisory metadata: serialized hypotheses carry NO sigma/uncertainty keys", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      const fileText = readFileSync(
        join(root, "data", "cases", `${sha256Hex(ids.caseId)}.json`),
        "utf8",
      );
      const record = JSON.parse(fileText) as EngineeringCase;
      for (const hypothesis of record.hypotheses) {
        const keys = keyNames(hypothesis);
        expect(keys).toContain("confidence");
        expect(keys).not.toContain("sigma");
        expect(keys).not.toContain("uncertainty");
        expect(keys.filter((key) => /sigma|uncertainty/i.test(key))).toEqual([]);
      }
      expect(fileText).toContain('"confidence": "medium"');
    });
  });
});

describe("cases service: missing evidence and waivers", () => {
  test("collectEvidence marks collected and does NOT auto-create observations", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      const observationsBefore = (await service.getCase(ids.caseId))?.observations.length ?? 0;
      const collected = await service.collectEvidence(ids.caseId, ids.missingId);
      expect(collected.status).toBe("collected");
      const record = await service.getCase(ids.caseId);
      expect(record?.missingEvidence[0]?.status).toBe("collected");
      expect(record?.observations).toHaveLength(observationsBefore);
    });
  });

  test("collect/waive state machine: unknown ids 404-code; non-open refuses", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      await expectCode(() => service.collectEvidence(ids.caseId, "mis-ghost"), "missing_evidence_not_found");
      await expectCode(() => service.waiveEvidence(ids.caseId, "mis-ghost", "n"), "missing_evidence_not_found");
      await service.collectEvidence(ids.caseId, ids.missingId);
      await expectCode(() => service.collectEvidence(ids.caseId, ids.missingId), "missing_evidence_not_open");
      await expectCode(() => service.waiveEvidence(ids.caseId, ids.missingId, "too late"), "missing_evidence_not_open");
    });
  });

  test("waive with a note records the waiver; waiving WITHOUT a note is rejected", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      await expectCode(() => service.waiveEvidence(ids.caseId, ids.missingId, ""), "waiver_note_required");
      await expectCode(() => service.waiveEvidence(ids.caseId, ids.missingId, "   "), "waiver_note_required");
      const waived = await service.waiveEvidence(ids.caseId, ids.missingId, "Roof already replaced in 2024 works — gap moot.");
      expect(waived.status).toBe("waived");
      expect(waived.waiverNote).toBe("Roof already replaced in 2024 works — gap moot.");
      const record = await service.getCase(ids.caseId);
      expect(record?.missingEvidence[0]?.waiverNote).toBe("Roof already replaced in 2024 works — gap moot.");
      // Never silent: the waiver event is in the append-only history.
      expect(record?.history.at(-1)?.eventType).toBe("missing_evidence_waived");
      await expectCode(() => service.collectEvidence(ids.caseId, ids.missingId), "missing_evidence_not_open");
    });
  });
});

describe("cases service: append-only history and digests", () => {
  test("every mutation appends exactly one event; prior events are an unchanged prefix", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      const before = (await service.getCase(ids.caseId))?.history ?? [];
      await service.collectEvidence(ids.caseId, ids.missingId);
      await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-1",
        decision: "approved",
        note: "ok",
      });
      const after = (await service.getCase(ids.caseId))?.history ?? [];
      expect(after).toHaveLength(before.length + 2);
      expect(after.slice(0, before.length)).toEqual([...before]);
      expect(after.at(-1)?.eventType).toBe("review_submitted");
      expect(after.at(-2)?.eventType).toBe("missing_evidence_collected");
    });
  });

  test("each event's recordDigest equals the content digest of the record it committed", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      const created = (await service.getCase("case-1")) as EngineeringCase;
      expect(created.history[0]?.recordDigest).toBe(caseContentDigest(created));
      await service.addObservation("case-1", {
        statement: "s",
        evidenceIds: [EV_WALL_PHOTO],
      });
      const observed = (await service.getCase("case-1")) as EngineeringCase;
      expect(observed.history.at(-1)?.recordDigest).toBe(caseContentDigest(observed));
      expect(observed.history[0]?.recordDigest).toBe(caseContentDigest(created));
    });
  });

  test("the review pins the evidence state it reviewed (digest BEFORE the review is attached)", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      const before = (await service.getCase(ids.caseId)) as EngineeringCase;
      const review = await service.submitReview(ids.caseId, {
        reviewer: "eng-reviewer-1",
        decision: "approved",
        note: "ok",
      });
      expect(review.evidenceStateDigest).toBe(caseContentDigest(before));
      // Later mutations never rewrite the pinned digest (stored value).
      await service.addObservation(ids.caseId, {
        statement: "post-review fact",
        evidenceIds: [EV_ROOF_VIDEO],
      });
      const record = await service.getCase(ids.caseId);
      expect(record?.review?.evidenceStateDigest).toBe(caseContentDigest(before));
    });
  });
});

describe("cases service: identity, determinism and listings", () => {
  test("createCase: duplicate ids refuse; getCase/listCases semantics", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-b", title: "B", links: EMPTY_LINKS });
      await expectCode(
        () => service.createCase({ caseId: "case-b", title: "B2", links: EMPTY_LINKS }),
        "case_exists",
      );
      await service.createCase({ caseId: "case-a", title: "A", links: EMPTY_LINKS });
      expect(await service.getCase("ghost")).toBeNull();
      await expectCode(() => service.getCase("x".repeat(257)), "invalid_case_id");
      const summaries = await service.listCases();
      expect(summaries.map((summary) => summary.caseId)).toEqual(["case-a", "case-b"]);
      expect(summaries[0]?.counts).toEqual({
        observations: 0,
        hypotheses: 0,
        missingEvidence: 0,
        openMissingEvidence: 0,
      });
    });
  });

  test("listCases counts update with the lifecycle (open vs collected missing evidence)", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      const ids = await runLifecycle(service);
      await service.createCase({ caseId: "case-2", title: "T", links: EMPTY_LINKS });
      let summary = (await service.listCases()).find((entry) => entry.caseId === ids.caseId);
      expect(summary?.counts.openMissingEvidence).toBe(1);
      await service.collectEvidence(ids.caseId, ids.missingId);
      summary = (await service.listCases()).find((entry) => entry.caseId === ids.caseId);
      expect(summary?.counts.missingEvidence).toBe(1);
      expect(summary?.counts.openMissingEvidence).toBe(0);
      expect(summary?.counts.observations).toBe(1);
      expect(summary?.status).toBe("open");
    });
  });

  test("same operation sequence + same clock → byte-identical case files in two fresh stores", async () => {
    await withTempDir(async (root) => {
      const files: string[] = [];
      for (const dir of ["one", "two"]) {
        const clock = makeSequenceClock([FIXED_NOW, FIXED_LATER, FIXED_EVEN_LATER]);
        const service = new CaseService({ store: new FsCaseStore(join(root, dir)), clock });
        const ids = await runLifecycle(service);
        await service.collectEvidence(ids.caseId, ids.missingId);
        files.push(join(root, dir, "cases", `${sha256Hex(ids.caseId)}.json`));
      }
      expect(readFileSync(files[1]!, "utf8")).toBe(readFileSync(files[0]!, "utf8"));
    });
  });

  test("identical statements record as DISTINCT observations (no silent dedup); ids deterministic", async () => {
    await withTempDir(async (root) => {
      const { service } = await serviceIn(root);
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      const first = await service.addObservation("case-1", {
        statement: "same words",
        evidenceIds: [EV_WALL_PHOTO],
      });
      const second = await service.addObservation("case-1", {
        statement: "same words",
        evidenceIds: [EV_WALL_PHOTO],
      });
      expect(second.observationId).not.toBe(first.observationId);
      expect((await service.getCase("case-1"))?.observations).toHaveLength(2);
      // Deterministic identity: a second service replays the same ids.
      const other = new CaseService({ store: new FsCaseStore(join(root, "other")), clock: fixedClock });
      await other.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      const replay = await other.addObservation("case-1", {
        statement: "same words",
        evidenceIds: [EV_WALL_PHOTO],
      });
      expect(replay.observationId).toBe(first.observationId);
    });
  });

  test("updatedAt advances with the injected clock; createdAt stays pinned", async () => {
    await withTempDir(async (root) => {
      const clock = makeSequenceClock([FIXED_NOW, FIXED_LATER, FIXED_EVEN_LATER]);
      const service = new CaseService({ store: new FsCaseStore(join(root, "data")), clock });
      await service.createCase({ caseId: "case-1", title: "T", links: EMPTY_LINKS });
      const created = await service.getCase("case-1");
      expect(created?.createdAt).toBe(FIXED_NOW);
      expect(created?.updatedAt).toBe(FIXED_NOW);
      await service.addObservation("case-1", {
        statement: "s",
        evidenceIds: [EV_WALL_PHOTO],
      });
      const updated = await service.getCase("case-1");
      expect(updated?.createdAt).toBe(FIXED_NOW);
      expect(updated?.updatedAt).toBe(FIXED_LATER);
      expect(updated?.observations[0]?.recordedAt).toBe(FIXED_LATER);
    });
  });
});
