/**
 * VOICE-001 evidence-service conformance tests — voice notes through the
 * register (AISE-008) exactly like every other evidence kind.
 *
 * The work order's conformance list, proven for BOTH store implementations
 * (in-memory and file-system — identical, deterministic behavior):
 *
 *   register -> idempotent re-register -> get -> list -> provenance-link
 *   -> derivation (recorded over a registered voice note, replayable)
 *
 * Plus the immutability guarantees that make a voice note a first-class
 * evidence kind: a transcript derivation never rewrites the voice note, and
 * a conflicting re-registration stays a typed conflict.
 *
 * Deterministic: fixed clock, seeded content ids; no network, no randomness.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  ASR_TRANSCRIPTION_METHOD,
  canonicalJsonStringify,
  type Derivation,
} from "@aise/shared-contracts";
import {
  EvidenceServiceError,
  captureStoreContentResolver,
  createEvidenceService,
} from "./service";
import { FsEvidenceStore, InMemoryEvidenceStore, type EvidenceStore } from "./store";
import { InMemoryCaptureStore } from "../capture/store";
import { sha256Hex } from "../lib/hash";
import {
  FIXED_NOW,
  contentIdOf,
  fixedClock,
  makeDerivation,
  makeLink,
  makeVoiceNote,
} from "./testkit";

const VOICE_A = makeVoiceNote("voice-conformance-a");
const VOICE_B = makeVoiceNote("voice-conformance-b");
const VOICE_A_ID = VOICE_A.contentId;

/** A transcription.asr derivation over VOICE_A with a registered output. */
function voiceTranscription(outputContentId: string): Derivation {
  return makeDerivation("voice-001-transcript-a", outputContentId, [VOICE_A_ID], {
    method: ASR_TRANSCRIPTION_METHOD,
    methodVersion: "1.2.0+model.asr-7b-q5",
    parameters: {
      "asr.language": "en",
      "asr.model": "asr-7b-q5",
      "asr.encoding": "utf-8",
    },
  });
}

function conformanceSuite(name: string, makeStore: () => EvidenceStore): void {
  test(`${name}: registers a voice note verbatim and idempotently`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });

    const first = await service.registerEvidence(VOICE_A);
    expect(first.kind).toBe("registered");
    expect(first.evidence).toEqual(VOICE_A);
    expect(first.evidence.acquisitionMethod).toBe("VOICE_NOTE");
    expect(first.evidence.acquisitionMetadata["voice.duration.ms"]).toBe("18400");
    expect(first.evidence.acquisitionMetadata["voice.codec"]).toBe("opus");
    expect(first.evidence.acquisitionMetadata["voice.sample.rate.hz"]).toBe("48000");
    expect(first.evidence.acquisitionMetadata["voice.language.hint"]).toBe("en");

    const again = await service.registerEvidence(VOICE_A);
    expect(again.kind).toBe("idempotent");
    expect(again.evidence).toEqual(VOICE_A);
  });

  test(`${name}: a conflicting voice-note re-registration stays a typed conflict (immutable)`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });
    await service.registerEvidence(VOICE_A);

    let caught: unknown;
    try {
      await service.registerEvidence({
        ...VOICE_A,
        acquisitionMetadata: { ...VOICE_A.acquisitionMetadata, "voice.codec": "aac" },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EvidenceServiceError);
    expect((caught as EvidenceServiceError).code).toBe("evidence_conflict");
    // The original record is retained verbatim.
    expect((await service.getEvidence(VOICE_A_ID))?.evidence).toEqual(VOICE_A);
  });

  test(`${name}: get returns the full read view of a voice note`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });
    await service.registerEvidence(VOICE_A);

    const view = await service.getEvidence(VOICE_A_ID);
    expect(view?.evidence).toEqual(VOICE_A);
    expect(view?.invalidation).toBeNull();
    expect(view?.provenance).toEqual({ asSubject: [], asObject: [] });
    expect(view?.derivations).toEqual({ inputsOf: [], derivedFrom: [] });
    expect(view?.upstreamInvalidations).toEqual([]);
    expect(await service.getEvidence(contentIdOf("voice-conformance-unknown"))).toBeNull();
  });

  test(`${name}: list includes voice notes alongside every other evidence kind`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });
    await service.registerEvidence(VOICE_A);
    await service.registerEvidence(VOICE_B);

    const items = await service.listEvidence();
    expect(items.map((item) => item.evidence.contentId).sort()).toEqual(
      [VOICE_A_ID, VOICE_B.contentId].sort(),
    );
    expect(
      items.every((item) => item.evidence.acquisitionMethod === "VOICE_NOTE"),
    ).toBe(true);
  });

  test(`${name}: provenance links bind voice notes to subjects and to derived transcripts`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });
    await service.registerEvidence(VOICE_A);

    // A foreign subject (e.g. an assertion) supported by the voice note.
    const linked = await service.addProvenanceLink(
      makeLink("property_assertion", "assertion-204-slab-thickness", VOICE_A_ID),
    );
    expect(linked.kind).toBe("linked");
    const duplicate = await service.addProvenanceLink(
      makeLink("property_assertion", "assertion-204-slab-thickness", VOICE_A_ID),
    );
    expect(duplicate.kind).toBe("duplicate");

    // The evidence-to-evidence DERIVED_FROM direction (transcript subject).
    await service.registerEvidence(VOICE_B);
    const derived = await service.addProvenanceLink(
      makeLink("evidence", VOICE_B.contentId, VOICE_A_ID, "DERIVED_FROM"),
    );
    expect(derived.kind).toBe("linked");

    const view = await service.getEvidence(VOICE_A_ID);
    expect(view?.provenance.asObject).toHaveLength(2);
    expect(
      view?.provenance.asObject.map((link) => link.role).sort(),
    ).toEqual(["DERIVED_FROM", "SUPPORTS"]);
  });

  test(`${name}: a transcription derivation records over a registered voice note and replays idempotently`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });
    await service.registerEvidence(VOICE_A);
    await service.registerEvidence(VOICE_B);

    const derivation = voiceTranscription(VOICE_B.contentId);
    const recorded = await service.recordDerivation(derivation);
    expect(recorded.kind).toBe("recorded");
    expect(recorded.derivation.method).toBe(ASR_TRANSCRIPTION_METHOD);
    expect(recorded.derivation.inputEvidenceContentIds).toEqual([VOICE_A_ID]);

    // Replay: identical retry is a duplicate no-op.
    const replay = await service.recordDerivation(derivation);
    expect(replay.kind).toBe("duplicate");
    expect(canonicalJsonStringify(replay.derivation)).toBe(
      canonicalJsonStringify(derivation),
    );

    // The voice note's read view exposes the derivation (inputsOf).
    const view = await service.getEvidence(VOICE_A_ID);
    expect(view?.derivations.inputsOf).toEqual([derivation]);
    expect(view?.derivations.derivedFrom).toEqual([]);
    // The transcript side exposes derivedFrom.
    const transcriptView = await service.getEvidence(VOICE_B.contentId);
    expect(transcriptView?.derivations.derivedFrom).toEqual([derivation]);

    // A reused derivationId with different content is a typed conflict.
    let caught: unknown;
    try {
      await service.recordDerivation({
        ...derivation,
        parameters: { ...derivation.parameters, "asr.language": "de" },
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as EvidenceServiceError).code).toBe("derivation_conflict");

    // The voice note is NEVER rewritten by any of this.
    expect((await service.getEvidence(VOICE_A_ID))?.evidence).toEqual(VOICE_A);
  });

  test(`${name}: a derivation over an unregistered voice note is a typed closure refusal`, async () => {
    const service = createEvidenceService({ store: makeStore(), clock: fixedClock });
    // Only the transcript OUTPUT side is registered; the input voice note
    // never was — the closure gate must refuse, naming the missing id.
    await service.registerEvidence(VOICE_B);
    const unregistered = makeVoiceNote("voice-conformance-ghost");

    let caught: unknown;
    try {
      await service.recordDerivation(
        makeDerivation("voice-001-ghost-input", VOICE_B.contentId, [
          unregistered.contentId,
        ], {
          method: ASR_TRANSCRIPTION_METHOD,
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as EvidenceServiceError).code).toBe("provenance_closure");
    expect((caught as EvidenceServiceError).detail).toContain(unregistered.contentId);
  });
}

describe("VOICE-001 evidence-service conformance (in-memory store)", () => {
  conformanceSuite("in-memory", () => new InMemoryEvidenceStore());
});

/** Temp roots created by the fs suite; removed once after the suite. */
const tempRoots: string[] = [];
afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("VOICE-001 evidence-service conformance (file-system store)", () => {
  conformanceSuite("fs", () => {
    // One fresh root per store (mkdtemp discipline, cleaned in afterAll);
    // outcomes never depend on the random path suffix.
    const root = mkdtempSync(join(tmpdir(), "aise-voice001-fs-"));
    tempRoots.push(root);
    return new FsEvidenceStore(root);
  });
});

describe("VOICE-001 voice notes under the content pinning gate", () => {
  test("a voice note registers only after its audio bytes are pinned (the gate applies to voice notes too)", async () => {
    const capture = new InMemoryCaptureStore();
    const service = createEvidenceService({
      store: new InMemoryEvidenceStore(),
      clock: fixedClock,
      contentResolver: captureStoreContentResolver(capture),
    });
    const bytes = new TextEncoder().encode("voice-note-bytes-under-pinning-gate");
    const contentId = sha256Hex(bytes);
    const voiceNote = makeVoiceNote("voice-pinned", { contentId });

    // Not pinned yet: typed rejection.
    let caught: unknown;
    try {
      await service.registerEvidence(voiceNote);
    } catch (error) {
      caught = error;
    }
    expect((caught as EvidenceServiceError).code).toBe("content_not_pinned");

    // Pin the audio through the capture store, then register.
    const put = await capture.putAsset(contentId, bytes, "audio/ogg", FIXED_NOW);
    expect(put.outcome).toBe("STORED");
    const registered = await service.registerEvidence(voiceNote);
    expect(registered.kind).toBe("registered");
  });
});
