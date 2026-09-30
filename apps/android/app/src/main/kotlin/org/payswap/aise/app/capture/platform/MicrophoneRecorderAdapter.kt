package org.payswap.aise.app.capture.platform

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.util.Log
import java.io.File
import org.payswap.aise.app.capture.VoiceSegmentFacts

/**
 * Thin microphone glue for the voice-note capture lane (VOICE-003) — the
 * [CameraCaptureAdapter] discipline applied to audio: ALL deterministic
 * session logic lives in
 * [org.payswap.aise.app.capture.CaptureSessionController]; this adapter
 * only feeds it real microphone artifacts.
 *
 *  - The CONFIGURED encoder profile is a FACT the adapter states up front
 *    ([profile]: AAC in an `audio/mp4` container → `voice.codec = "aac"`).
 *    This is the contract's device-that-knows-its-encoder case — the
 *    Android recorder configures its encoder explicitly, so `voice.codec`
 *    is the configured profile, never a guess behind a container (STRONGER
 *    than the web lane's browser-observed container subtype).
 *  - Duration and sample rate are MEASURED over the CLOSED file
 *    (MediaMetadataRetriever / MediaExtractor) once the recorder has
 *    finished with it, and are honestly `null` when the platform cannot
 *    measure them — never zero, never invented.
 *  - NO audio is recorded into VIDEO segments: the documented
 *    no-audio-in-video decision stands (video remains visual evidence
 *    only). This adapter serves VOICE NOTES — a distinct evidence kind
 *    with its own provenance semantics.
 *  - `RECORD_AUDIO` is requested MISSION-SCOPED at runtime from the voice
 *    entry by the UI (the permissionLauncher pattern); this adapter never
 *    checks or requests permissions itself (the camera adapter's
 *    discipline — the UI owns the gate).
 *
 * NOT unit-tested: pure platform glue, exercised on physical devices (the
 * physical-device lane owns runtime-permission and physical-microphone
 * evidence — `BLOCKED_NO_KVM` is the honest recorded station verdict, so
 * nothing here is claimed proven on a station). Every failure path reports
 * to the UI via the `ok=false` callback instead of crashing the session —
 * the journal remains the truth.
 */
class MicrophoneRecorderAdapter(private val context: Context) {

    /**
     * The recorder's configured output — a FACT (this adapter sets it),
     * consumed by the session controller as the voice asset's media type
     * and reported as `voice.codec`. AAC in an MPEG_4 container is the
     * broadest, best-supported profile across the API 26+ device matrix.
     */
    data class VoiceRecorderProfile(
        /** The wire media type of the configured container (an `audio`-family type). */
        val mediaType: String,
        /** The configured encoder — the `voice.codec` value (the media subtype's codec). */
        val codec: String,
    )

    val profile: VoiceRecorderProfile = VoiceRecorderProfile(mediaType = "audio/mp4", codec = "aac")

    private var recorder: MediaRecorder? = null
    private var pendingCallback: ((Boolean, VoiceSegmentFacts) -> Unit)? = null
    private var activeTarget: File? = null

    /**
     * Starts one voice segment into [targetFile] (the voice writer's tmp
     * file). [onFinalized] fires ONCE when the segment is finished:
     * `ok=false` means the segment is unusable (the caller must discard the
     * writer — nothing is journaled); on success the facts carry the
     * CONFIGURED codec plus whatever the platform could MEASURE over the
     * closed file (nulls when it could not).
     */
    fun startVoice(targetFile: File, onFinalized: (ok: Boolean, facts: VoiceSegmentFacts) -> Unit) {
        if (recorder != null) {
            // One segment at a time — the controller enforces the same on
            // its side; a second start while one runs is a caller bug and is
            // reported, never crashed on.
            reportFailure(onFinalized, "a voice segment is already in flight")
            return
        }
        val r = try {
            newRecorder()
        } catch (e: Exception) {
            reportFailure(onFinalized, "recorder construct failed: ${e.message}")
            return
        }
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            // The deliberate encoder configuration this adapter declares in
            // [profile] — the values the voice metadata then reports as facts.
            r.setAudioSamplingRate(RECORDED_SAMPLE_RATE_HZ)
            r.setAudioEncodingBitRate(RECORDED_BIT_RATE_BPS)
            r.setOutputFile(targetFile.absolutePath)
            r.prepare()
            r.start()
        } catch (e: Exception) {
            runCatching { r.release() }
            reportFailure(onFinalized, "recorder start failed: ${e.message}")
            return
        }
        recorder = r
        pendingCallback = onFinalized
        activeTarget = targetFile
    }

    /**
     * Stops the active segment. The `startVoice` callback fires with the
     * measured facts (or the honest `ok=false` failure — a failed stop
     * means the segment never became a complete file).
     */
    fun stopVoice() {
        val r = recorder ?: return
        val target = activeTarget
        val callback = pendingCallback
        clearActive()
        val stopped = runCatching { r.stop() }.isSuccess
        runCatching { r.release() }
        if (!stopped || target == null || callback == null) {
            if (callback != null) {
                reportFailure(callback, "recorder stop failed — the segment is unusable")
            }
            return
        }
        // The recorder closed the file: measure what the platform can over
        // the finished artifact. Each measurement fails to its own honest
        // null — never a fallback value, never an error thrown at the UI.
        val facts = VoiceSegmentFacts(
            configuredCodec = profile.codec,
            durationMs = measureDurationMs(target),
            sampleRateHz = measureSampleRateHz(target),
            audioSource = AUDIO_SOURCE_ID,
        )
        callback(true, facts)
    }

    /**
     * Releases the adapter (composition dispose). If a segment is still
     * active its pending callback fires with the honest failure — the
     * caller discards the writer, no phantom open segment is left behind.
     */
    fun release() {
        val r = recorder ?: return
        val callback = pendingCallback
        clearActive()
        runCatching { r.stop() }
        runCatching { r.release() }
        if (callback != null) {
            reportFailure(callback, "recorder released before the segment closed — the segment is unusable")
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private fun clearActive() {
        recorder = null
        pendingCallback = null
        activeTarget = null
    }

    private fun reportFailure(callback: (Boolean, VoiceSegmentFacts) -> Unit, reason: String) {
        Log.w(TAG, "voice segment failed: $reason")
        callback(false, VoiceSegmentFacts(configuredCodec = profile.codec, durationMs = null, sampleRateHz = null, audioSource = null))
    }

    private fun newRecorder(): MediaRecorder =
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION") // pre-API-31 devices: the context-less constructor is the only option
            MediaRecorder()
        }

    /** Metadata-retriever duration over the CLOSED file — or the honest null. */
    private fun measureDurationMs(file: File): Long? = try {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        } finally {
            runCatching { retriever.release() }
        }
    } catch (e: Exception) {
        Log.w(TAG, "voice duration not measurable: ${e.message}")
        null
    }

    /** Extractor-declared sample rate of the first audio track — or the honest null. */
    private fun measureSampleRateHz(file: File): Long? = try {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(file.absolutePath)
            var rate: Long? = null
            if (extractor.trackCount > 0) {
                val format = extractor.getTrackFormat(0)
                if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                    rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE).toLong()
                }
            }
            rate
        } finally {
            runCatching { extractor.release() }
        }
    } catch (e: Exception) {
        Log.w(TAG, "voice sample rate not measurable: ${e.message}")
        null
    }

    private companion object {
        const val TAG = "MicrophoneRecorderAdapter"

        /** The audio source id reported as `acquisition.sensorId` (a configuration fact). */
        const val AUDIO_SOURCE_ID = "mic"

        /** The deliberately configured capture rate (the encoder profile above). */
        const val RECORDED_SAMPLE_RATE_HZ = 48_000

        /** The deliberately configured encoding bitrate (the encoder profile above). */
        const val RECORDED_BIT_RATE_BPS = 128_000
    }
}
