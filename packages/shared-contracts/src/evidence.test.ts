/**
 * VOICE-001 contract tests — voice notes as an evidence kind.
 *
 * Pins the voice-note contract surface of family `evidence`:
 *  - the closed acquisition-method vocabulary gains VOICE_NOTE (append-only
 *    position, no reordering, no duplicates — the Android enum mirror and
 *    the web mirror follow 1:1);
 *  - the canonical VOICE acquisition-metadata keys (dot-namespaced,
 *    string-valued, documented in the contract header);
 *  - the ASR transcription derivation contract: the provider-neutral method
 *    identity `transcription.asr`, the Derivation shape linking the voice
 *    note (input) to the content-addressed transcript artifact (output),
 *    deterministic parameters as a string map;
 *  - unknown-key tolerance stays intact (the open string map discipline):
 *    producer keys are data, preserved verbatim by the codecs.
 *
 * Deterministic: committed sources only; no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import {
  ACQUISITION_METADATA_KEYS,
  ASR_TRANSCRIPTION_METHOD,
  CONTRACT_VERSION,
  DerivationCodec,
  EVIDENCE_METHODS,
  EvidenceCodec,
  decodeDerivationStrict,
  decodeEvidenceStrict,
  type Derivation,
  type Evidence,
} from "./index";
import { voiceNoteFixture, transcriptionDerivationFixture } from "./voice-fixtures";

describe("VOICE-001 the acquisition-method vocabulary", () => {
  test("EVIDENCE_METHODS gains VOICE_NOTE as an append-only 11th value", () => {
    expect(EVIDENCE_METHODS).toEqual([
      "DEPTH_SENSING",
      "VISUAL_RECONSTRUCTION",
      "CALIBRATED_REFERENCE",
      "MANUAL_MEASUREMENT",
      "SPECIALIST_INSTRUMENT",
      "VIDEO_FOOTAGE",
      "STILL_IMAGERY",
      "INSTRUMENT_READING",
      "HUMAN_ANSWER",
      "DOCUMENT_REGION",
      "VOICE_NOTE",
    ]);
  });

  test("a VOICE_NOTE evidence document decodes strictly and round-trips", () => {
    const evidence = decodeEvidenceStrict(voiceNoteFixture);
    expect(evidence.acquisitionMethod).toBe("VOICE_NOTE");
    expect(evidence.mediaType).toBe("audio/ogg");
    const encoded = EvidenceCodec.encode(evidence);
    expect(decodeEvidenceStrict(JSON.parse(encoded))).toEqual(evidence);
  });

  test("the closed vocabulary still refuses an out-of-set method value", () => {
    expect(() =>
      decodeEvidenceStrict({ ...voiceNoteFixture, acquisitionMethod: "VOICE_MEMO" }),
    ).toThrow();
  });
});

describe("VOICE-001 the canonical voice acquisition-metadata keys", () => {
  test("the four voice keys are canonical, dot-namespaced and documented", () => {
    expect(ACQUISITION_METADATA_KEYS.voiceDurationMs).toBe("voice.duration.ms");
    expect(ACQUISITION_METADATA_KEYS.voiceCodec).toBe("voice.codec");
    expect(ACQUISITION_METADATA_KEYS.voiceSampleRateHz).toBe("voice.sample.rate.hz");
    expect(ACQUISITION_METADATA_KEYS.voiceLanguageHint).toBe("voice.language.hint");
  });

  test("the pre-existing well-known keys are unchanged (additive-only)", () => {
    expect(ACQUISITION_METADATA_KEYS.missionId).toBe("mission.id");
    expect(ACQUISITION_METADATA_KEYS.sessionId).toBe("session.id");
    expect(ACQUISITION_METADATA_KEYS.deviceId).toBe("device.id");
    expect(ACQUISITION_METADATA_KEYS.captureKind).toBe("capture.kind");
    expect(ACQUISITION_METADATA_KEYS.sensorId).toBe("acquisition.sensorId");
  });

  test("unknown metadata keys are data and survive the codec verbatim (open map discipline)", () => {
    const payload = {
      ...voiceNoteFixture,
      acquisitionMetadata: {
        ...voiceNoteFixture.acquisitionMetadata,
        "operator.note.position": "grid B-2 slab edge",
        "some.future.key": "value",
      },
    };
    const evidence = decodeEvidenceStrict(payload);
    expect(evidence.acquisitionMetadata["operator.note.position"]).toBe(
      "grid B-2 slab edge",
    );
    expect(evidence.acquisitionMetadata["some.future.key"]).toBe("value");
    // The canonical voice keys ride as ordinary data too.
    expect(evidence.acquisitionMetadata["voice.duration.ms"]).toBe("18400");
  });
});

describe("VOICE-001 the ASR transcription derivation contract", () => {
  test("the provider-neutral method identity is transcription.asr", () => {
    expect(ASR_TRANSCRIPTION_METHOD).toBe("transcription.asr");
  });

  test("a transcription derivation over a voice note is provenance-complete and round-trips", () => {
    const derivation = decodeDerivationStrict(transcriptionDerivationFixture);
    expect(derivation.method).toBe("transcription.asr");
    expect(derivation.inputEvidenceContentIds).toEqual([voiceNoteFixture.contentId]);
    expect(derivation.outputContentId).not.toBe(voiceNoteFixture.contentId);
    expect(derivation.methodVersion).toBe("1.2.0+model.asr-7b-q5");
    expect(derivation.parameters).toEqual({
      "asr.language": "en",
      "asr.model": "asr-7b-q5",
      "asr.encoding": "utf-8",
      "asr.audio.codec": "opus",
    });
    const encoded = DerivationCodec.encode(derivation);
    expect(decodeDerivationStrict(JSON.parse(encoded))).toEqual(derivation);
  });

  test("the transcript output is a content address (64 lowercase hex), never the raw voice note", () => {
    const derivation: Derivation = decodeDerivationStrict(transcriptionDerivationFixture);
    expect(derivation.outputContentId).toMatch(/^[0-9a-f]{64}$/);
    expect(derivation.outputContentId).not.toEqual(voiceNoteFixture.contentId);
    expect(derivation.inputEvidenceContentIds).toHaveLength(1);
  });
});

describe("VOICE-001 the committed JSON Schema export", () => {
  test("the Evidence schema enum carries VOICE_NOTE and the voice well-known keys", async () => {
    const schema = JSON.parse(
      await Bun.file(
        new URL("../schemas/evidence/Evidence.schema.json", import.meta.url).pathname,
      ).text(),
    ) as {
      properties: {
        acquisitionMethod: { enum: string[] };
        acquisitionMetadata: { description: string };
      };
    };
    expect(schema.properties.acquisitionMethod.enum).toContain("VOICE_NOTE");
    expect(schema.properties.acquisitionMetadata.description).toContain("voice.duration.ms");
    expect(schema.properties.acquisitionMetadata.description).toContain("voice.codec");
    expect(schema.properties.acquisitionMetadata.description).toContain(
      "voice.sample.rate.hz",
    );
    expect(schema.properties.acquisitionMetadata.description).toContain(
      "voice.language.hint",
    );
  });
});

describe("VOICE-001 contract hygiene", () => {
  test("the fixtures carry the current contract version", () => {
    expect(voiceNoteFixture.contractVersion).toBe(CONTRACT_VERSION);
    expect(transcriptionDerivationFixture.contractVersion).toBe(CONTRACT_VERSION);
    expect(CONTRACT_VERSION).toBe("1.1.0");
  });

  test("a minimal voice note (base keys only) is schema-valid", () => {
    const minimal: Evidence = decodeEvidenceStrict({
      contractVersion: CONTRACT_VERSION,
      contentId: voiceNoteFixture.contentId,
      byteSize: 1024,
      mediaType: "audio/mp4",
      capturedAt: "2026-01-15T09:41:03.000Z",
      acquisitionMethod: "VOICE_NOTE",
      acquisitionMetadata: { "capture.kind": "voice" },
    });
    expect(minimal.acquisitionMethod).toBe("VOICE_NOTE");
  });
});
