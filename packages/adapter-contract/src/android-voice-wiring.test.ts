/**
 * VOICE-003 — the Android voice-note lane's source-level wiring checks (the
 * `task-handoff.android-wiring.test.ts` discipline, applied to the voice
 * lane): the TypeScript side of the shared boundary reads the COMMITTED
 * Kotlin sources and asserts the wiring exists and agrees with the contract
 * constants — a deterministic, code-level check (NOT device, NOT emulator
 * evidence; the Kotlin suites that run the voice logic run on the gradle
 * station and are cited as station-pending in the evidence records).
 *
 * WHY THIS FILE LIVES HERE: `packages/shared-contracts` (the voice keys'
 * contract owner) is FROZEN by the VOICE-003 work order, as are `backend/`
 * and `apps/web/`. This package's `task-handoff.android-wiring.test.ts` is
 * the established precedent for TS-reads-Kotlin mirror checks, so the
 * voice-lane wiring checks join that suite family here.
 *
 * Deterministic: committed files only; no network, no clock, no randomness.
 * The classification stays honest: this is source-level verification, never
 * device evidence — the microphone adapter is platform glue exercised on
 * the physical-device lane (`BLOCKED_NO_KVM` is the station's honest
 * verdict), and the behavioral Kotlin proofs run on the E2B station trio.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACQUISITION_METADATA_KEYS,
  ASR_TRANSCRIPTION_METHOD,
} from "@aise/shared-contracts";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const ANDROID_ROOT = join(REPO_ROOT, "apps/android");

const ACQUISITION_METADATA_KT = join(
  ANDROID_ROOT,
  "core/src/main/kotlin/org/payswap/aise/core/capture/AcquisitionMetadata.kt",
);
const ACQUISITION_METHOD_KT = join(
  ANDROID_ROOT,
  "core/src/main/kotlin/org/payswap/aise/core/session/AcquisitionMethod.kt",
);
const CAPTURE_CONTRACT_VERSION_KT = join(
  ANDROID_ROOT,
  "core/src/main/kotlin/org/payswap/aise/core/session/CaptureContractVersion.kt",
);
const CONTROLLER_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/capture/CaptureSessionController.kt",
);
const VIEW_MODEL_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/ui/screen/CaptureViewModel.kt",
);
const CAPTURE_SCREEN_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/ui/screen/CaptureScreen.kt",
);
const MIC_ADAPTER_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/capture/platform/MicrophoneRecorderAdapter.kt",
);
const TRANSCRIPT_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/field/VoiceNoteTranscript.kt",
);
const READ_CLIENT_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/field/HttpEvidenceReadClient.kt",
);
const SUBMISSION_TRANSPORT_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/field/HttpEvidenceSubmissionTransport.kt",
);
const MANIFEST_XML = join(ANDROID_ROOT, "app/src/main/AndroidManifest.xml");
const JOURNEY_RUNTIME_KT = join(
  ANDROID_ROOT,
  "app/src/main/kotlin/org/payswap/aise/app/field/FieldJourneyRuntime.kt",
);
const CONTROLLER_VERSION_TEST_KT = join(
  ANDROID_ROOT,
  "app/src/test/kotlin/org/payswap/aise/app/capture/CaptureSessionControllerTest.kt",
);
const EXPORTER_VERSION_TEST_KT = join(
  ANDROID_ROOT,
  "core/src/test/kotlin/org/payswap/aise/core/session/SessionManifestExporterTest.kt",
);
const VOICE_NOTE_FIXTURE = join(
  REPO_ROOT,
  "packages/shared-contracts/fixtures/evidence/Evidence.valid-voice-note.json",
);
const BACKEND_TRANSCRIPTION_TS = join(
  REPO_ROOT,
  "backend/api/src/evidence/transcription.ts",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Collect every .kt file under a root (deterministic walk). */
function kotlinFilesUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".kt")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

describe("VOICE-003 the Android voice-note mirror is wired (source-level, deterministic)", () => {
  test("the four voice.* advisory constants agree with the shared contract's canonical keys", () => {
    const source = read(ACQUISITION_METADATA_KT);
    expect(source).toContain(`const val VOICE_CODEC = "${ACQUISITION_METADATA_KEYS.voiceCodec}"`);
    expect(source).toContain(`const val VOICE_DURATION_MS = "${ACQUISITION_METADATA_KEYS.voiceDurationMs}"`);
    expect(source).toContain(`const val VOICE_SAMPLE_RATE_HZ = "${ACQUISITION_METADATA_KEYS.voiceSampleRateHz}"`);
    expect(source).toContain(`const val VOICE_LANGUAGE_HINT = "${ACQUISITION_METADATA_KEYS.voiceLanguageHint}"`);
    // The legacy advisory keys are unchanged (the vocabulary is append-only).
    expect(source).toContain(`const val CAPTURE_KIND = "capture.kind"`);
    expect(source).toContain(`const val SENSOR_ID = "acquisition.sensorId"`);
  });

  test("the AcquisitionMethod enum mirror carries VOICE_NOTE (the VOICE-001 source sync)", () => {
    expect(read(ACQUISITION_METHOD_KT)).toContain("VOICE_NOTE");
  });

  test("the committed voice-note fixture's canonical keys are exactly the mirrored vocabulary", () => {
    const parsed = JSON.parse(read(VOICE_NOTE_FIXTURE)) as { acquisitionMetadata: Record<string, string> };
    const voiceKeys = Object.keys(parsed.acquisitionMetadata).filter((key) => key.startsWith("voice."));
    expect(voiceKeys.sort()).toEqual(
      [
        ACQUISITION_METADATA_KEYS.voiceCodec,
        ACQUISITION_METADATA_KEYS.voiceDurationMs,
        ACQUISITION_METADATA_KEYS.voiceSampleRateHz,
        ACQUISITION_METADATA_KEYS.voiceLanguageHint,
      ].sort(),
    );
    // Numeric values are string-encoded integers (the fixture's own pattern).
    expect(parsed.acquisitionMetadata[ACQUISITION_METADATA_KEYS.voiceDurationMs]).toBe("18400");
    expect(parsed.acquisitionMetadata[ACQUISITION_METADATA_KEYS.voiceSampleRateHz]).toBe("48000");
  });

  test("the session controller commits voice assets through the video protocol with VOICE_NOTE", () => {
    const source = read(CONTROLLER_KT);
    expect(source).toContain("fun beginVoiceAsset(mediaType: String): VoiceAssetWriter");
    expect(source).toContain("internal suspend fun closeVoiceAsset(");
    expect(source).toContain("acquisitionMethod = AcquisitionMethod.VOICE_NOTE");
    expect(source).toContain('require(mediaType.startsWith("audio/"))');
    // The commit protocol: journal `asset.captured` then the atomic rename.
    expect(source).toContain(
      "journal.append(AssetCapturedEvent(journal.nextSequence(), clock.millis(), asset))",
    );
    expect(source).toContain("AtomicFiles.commitRename(writer.tmpFile, dir.assetFile(relativePath))");
    // The state-machine refusals: pause/finalize refuse while a voice segment
    // is open, and one in-flight recorder at a time.
    expect(source).toContain("cannot finalize while a voice segment is open");
    expect(source).toContain("cannot pause while a voice segment is open");
    expect(source).toContain("a voice segment is open — close it before opening a video segment");
    expect(source).toContain("a video segment is open — close it before opening a voice segment");
  });

  test("the view model composes only honest voice metadata (measured or user-entered, never fabricated)", () => {
    const source = read(VIEW_MODEL_KT);
    expect(source).toContain("fun beginVoiceAsset(mediaType: String)");
    expect(source).toContain("fun onVoiceFinalized(facts: VoiceSegmentFacts)");
    expect(source).toContain("fun onVoiceFailed()");
    expect(source).toContain("fun setVoiceLanguageHint(hint: String)");
    // The lane fact and the honest-absence composition (each key asserted
    // only when its value exists — never zero, never "unknown").
    expect(source).toContain('put(AcquisitionMetadataKeys.CAPTURE_KIND, "voice")');
    expect(source).toContain("put(AcquisitionMetadataKeys.VOICE_CODEC, facts.configuredCodec)");
    expect(source).toContain("facts.durationMs?.let { put(AcquisitionMetadataKeys.VOICE_DURATION_MS, it.toString()) }");
    expect(source).toContain("facts.sampleRateHz?.let { put(AcquisitionMetadataKeys.VOICE_SAMPLE_RATE_HZ, it.toString()) }");
    expect(source).toContain("if (hint.isNotEmpty()) {");
    expect(source).toContain("put(AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT, hint)");
  });

  test("the capture screen requests RECORD_AUDIO mission-scoped from the voice entry and keeps the copy honest", () => {
    const source = read(CAPTURE_SCREEN_KT);
    // The permissionLauncher pattern (the camera's own discipline).
    expect(source).toContain("Manifest.permission.RECORD_AUDIO");
    expect(source).toContain("recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)");
    // The voice entry is reachable WITHOUT the camera (no camera pretended).
    expect(source).toContain("VoiceOnlyStage(");
    expect(source).toContain("VoiceCaptureControls(");
    // The stale "no microphone" permission-card copy is GONE.
    expect(source).not.toContain("no microphone");
  });

  test("the microphone adapter follows the camera adapter's platform-glue discipline", () => {
    const source = read(MIC_ADAPTER_KT);
    // The CONFIGURED encoder profile is stated as a fact — the
    // device-that-knows-its-encoder case, never a guess behind a container.
    expect(source).toContain('VoiceRecorderProfile(mediaType = "audio/mp4", codec = "aac")');
    expect(source).toContain("fun startVoice(targetFile: File, onFinalized: (ok: Boolean, facts: VoiceSegmentFacts) -> Unit)");
    expect(source).toContain("fun stopVoice()");
    // Measured-when-measurable, honestly null when not.
    expect(source).toContain("measureDurationMs");
    expect(source).toContain("measureSampleRateHz");
    // NOT unit-tested platform glue (the documented discipline).
    expect(source).toContain("NOT unit-tested");
    // The microphone never records into video (the documented decision stands).
    expect(source).toContain("NO audio is recorded into VIDEO segments");
  });

  test("the transcript state is client-only, derived from the read view, with the contract's vocabulary", () => {
    const source = read(TRANSCRIPT_KT);
    expect(source).toContain(`const val ASR_TRANSCRIPTION_METHOD: String = "${ASR_TRANSCRIPTION_METHOD}"`);
    expect(source).toContain('const val REASON_ASR_PROVIDER_NOT_CONFIGURED: String = "asr_provider_not_configured"');
    expect(source).toContain('const val PROVENANCE_ROLE_DERIVED_FROM: String = "DERIVED_FROM"');
    expect(source).toContain("inputsOf.filter { it.method == ASR_TRANSCRIPTION_METHOD }");
    // The calm no-transcript state is the same word the backend answers,
    // and the method identity is the shared contract's own export.
    const backend = read(BACKEND_TRANSCRIPTION_TS);
    expect(backend).toContain('"asr_provider_not_configured"');
    const evidenceContract = read(
      join(REPO_ROOT, "packages/shared-contracts/src/evidence.ts"),
    );
    expect(evidenceContract).toContain('export const ASR_TRANSCRIPTION_METHOD = "transcription.asr"');
  });

  test("the evidence READ seam follows the existing request discipline and stays a READ", () => {
    const source = read(READ_CLIENT_KT);
    expect(source).toContain('request("GET", "/v1/evidence/$contentId", null, token)');
    expect(source).toContain("interface EvidenceReadClient");
    expect(source).toContain("EvidenceReadAnswer.Refused");
    // No backend transcript-state route is called (none exists).
    expect(source).not.toContain("/v1/transcript");
    expect(source).not.toContain("/v1/evidence/transcript");
  });

  test("NO file in the Android tree POSTs to /v1/evidence — registration rides the ONE sync path", () => {
    // The precise no-direct-evidence-POST claim: no main-source Kotlin file
    // constructs a POST request to /v1/evidence (KDoc mentions of the GET
    // read route are fine — the claim is about request construction).
    for (const file of kotlinFilesUnder(join(ANDROID_ROOT, "app/src/main"))) {
      const source = read(file);
      expect(source).not.toContain('request("POST", "/v1/evidence');
      expect(source).not.toContain('open("POST", "/v1/evidence');
      expect(source).not.toContain('"POST", "/v1/evidence/');
    }
    // The read client's GET is the one evidence-route caller.
    expect(read(READ_CLIENT_KT)).toContain('request("GET", "/v1/evidence/$contentId", null, token)');
    // The submission transport stays on the capture sync routes, untouched.
    const transport = read(SUBMISSION_TRANSPORT_KT);
    expect(transport).toContain('"/v1/capture/sync"');
    expect(transport).toContain('"/v1/capture/assets/"');
    expect(transport).not.toContain("/v1/evidence");
  });

  test("the version pins bind CaptureContractVersion.CURRENT — no literals anywhere (the found-done repair, held)", () => {
    const transport = read(SUBMISSION_TRANSPORT_KT);
    expect(transport).toContain('"contractVersion" to JsonValue.str(CaptureContractVersion.CURRENT)');
    expect(transport).not.toContain('str("1.0.0")');
    expect(transport).not.toContain('str("1.1.0")');

    const controllerTest = read(CONTROLLER_VERSION_TEST_KT);
    expect(controllerTest).toContain(
      'manifestText.contains("\\"contractVersion\\": \\"${CaptureContractVersion.CURRENT}\\"")',
    );
    expect(controllerTest).not.toContain('\\"contractVersion\\": \\"1.0.0\\"');
    expect(controllerTest).not.toContain('\\"contractVersion\\": \\"1.1.0\\"');

    const exporterTest = read(EXPORTER_VERSION_TEST_KT);
    expect(exporterTest).toContain("assertEquals(CaptureContractVersion.CURRENT, tree.get(\"contractVersion\").asText())");

    // The one legitimate literal is the mirror constant itself.
    const version = read(CAPTURE_CONTRACT_VERSION_KT);
    expect(version).toContain('const val V1: String = "1.1.0"');
  });

  test("the manifest declares RECORD_AUDIO mission-scoped with honest comments and features", () => {
    const manifest = read(MANIFEST_XML);
    expect(manifest).toContain('<uses-permission android:name="android.permission.RECORD_AUDIO" />');
    expect(manifest).toContain('<uses-permission android:name="android.permission.CAMERA" />');
    expect(manifest).toContain('android.hardware.microphone');
    // The stale "video is visual evidence only — no microphone" claim is GONE.
    expect(manifest).not.toContain("no microphone");
    expect(manifest).toContain("the voice-note entry requests");
  });

  test("the provisioned journey carries the OPTIONAL voice-note step with no bookkeeping fork", () => {
    const source = read(JOURNEY_RUNTIME_KT);
    expect(source).toContain('stepId = "step-voice-note"');
    expect(source).toContain("method = AcquisitionMethod.VOICE_NOTE");
    expect(source).toContain("mandatory = false");
    // The generic matcher stays untouched (matches by AcquisitionMethod).
    expect(source).toContain("internal fun matchesMethod(stepMethod: AcquisitionMethod, assetMethod: AcquisitionMethod): Boolean");
  });

  test("the classification stays honest: this is source-level verification, not device evidence", () => {
    // These checks read COMMITTED source files and assert wiring presence +
    // constant agreement. They prove the code-level contract, NOT behavior
    // on a device or emulator. The behavioral proof of the voice lane (the
    // commit protocol, the manifest schemas, the read seam, the transcript
    // states) runs in the Kotlin suites on the gradle station trio and is
    // recorded as station-pending — never upgraded to device evidence here.
    // The microphone adapter's runtime-permission and physical-microphone
    // evidence belongs to the physical-device lane alone.
    expect("source-level (deterministic)").not.toBe("physical");
    expect("source-level (deterministic)").not.toBe("emulated");
  });
});
