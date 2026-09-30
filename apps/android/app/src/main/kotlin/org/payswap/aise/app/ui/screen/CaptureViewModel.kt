package org.payswap.aise.app.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.payswap.aise.app.capture.CaptureEnvironment
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.VideoAssetWriter
import org.payswap.aise.app.capture.VoiceAssetWriter
import org.payswap.aise.app.capture.VoiceSegmentFacts
import org.payswap.aise.core.capture.AcquisitionMetadataKeys
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Capture view model — the JVM-pure bridge between the Compose UI and the
 * capture-session controller (AISE-005). No android.* references (only
 * Compose/lifecycle platform-agnostic state), exactly like AISE-002's
 * [HomeViewModel] — that is what keeps this class unit-testable without
 * Robolectric or an emulator.
 *
 * The VM holds NO truth of its own: [session] IS the controller's derived
 * StateFlow (journal-folded). [busy]/[message]/[videoTargetFile] are UI
 * plumbing only. Illegal operations surface as messages, never as silent
 * no-ops or crashes.
 *
 * The camera/sensor adapters (platform glue, not unit-tested) call back into
 * [onStillCaptured] / [onVideoFinalized] / [onVideoFailed]; the microphone
 * adapter (VOICE-003) calls back into [onVoiceFinalized] / [onVoiceFailed].
 * All session semantics stay inside the controller.
 */
class CaptureViewModel(
    private val controller: CaptureSessionController,
    private val environment: CaptureEnvironment,
) : ViewModel() {

    val session: StateFlow<CaptureSessionRecord?> get() = controller.activeSession

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _videoTargetFile = MutableStateFlow<java.io.File?>(null)
    val videoTargetFile: StateFlow<java.io.File?> = _videoTargetFile.asStateFlow()

    /** VOICE-003: the open voice segment's tmp target — non-null while a voice note records. */
    private val _voiceTargetFile = MutableStateFlow<java.io.File?>(null)
    val voiceTargetFile: StateFlow<java.io.File?> = _voiceTargetFile.asStateFlow()

    /**
     * VOICE-003: the optional user-entered spoken-language advisory
     * (`voice.language.hint` — a hint for ASR providers and UIs, never an
     * authoritative determination). Empty = absent (the default).
     */
    private val _voiceLanguageHint = MutableStateFlow("")
    val voiceLanguageHint: StateFlow<String> = _voiceLanguageHint.asStateFlow()

    private var videoWriter: VideoAssetWriter? = null

    private var voiceWriter: VoiceAssetWriter? = null

    fun startSession(missionRef: String? = null) = guarded("start session") {
        controller.startSession(environment.deviceIdentity(), environment.imuActive(), missionRef)
    }

    fun pause() = guarded("pause") { controller.pause() }

    fun resume() = guarded("resume") { controller.resume() }

    fun finalizeSession() = guarded("finalize") {
        val manifest = controller.finalizeSession()
        _message.value = "Session finalized — manifest: ${manifest.name}"
    }

    /** Called by the camera adapter with the JPEG bytes + verbatim capture metadata. */
    /**
     * POST-005 GAP-2 fix: a FAILED still surfaces honestly — the session and
     * journal stay truthful (nothing is journaled for a failed capture), and
     * the operator now SEES the failure instead of it being swallowed.
     */
    fun onStillCaptureFailed(reason: String) {
        _message.value = "Still capture failed — no evidence journaled ($reason). Retry the still capture."
    }

    fun onStillCaptured(jpeg: ByteArray, metadata: Map<String, String>) = guarded("capture still") {
        val asset = controller.captureStill(jpeg, metadata)
        _message.value = "Still captured: ${asset.assetId} (${asset.byteSize} bytes)"
    }

    /** Opens a video-segment writer; the recorder must write into the exposed target file. */
    fun beginVideoAsset() = guarded("begin video") {
        val writer = controller.beginVideoAsset()
        videoWriter = writer
        _videoTargetFile.value = writer.targetFile
    }

    /** Called when the recorder closed the segment file; commits it via the writer. */
    fun onVideoFinalized(sensorMetadata: Map<String, String>) = guarded("commit video") {
        val writer = videoWriter ?: return@guarded
        videoWriter = null
        _videoTargetFile.value = null
        val asset = writer.close(sensorMetadata)
        _message.value = "Video captured: ${asset.assetId} (${asset.byteSize} bytes)"
    }

    /** Called when the recorder failed or was cancelled — the segment was never evidence. */
    fun onVideoFailed() = guarded("discard video") {
        val writer = videoWriter ?: return@guarded
        videoWriter = null
        _videoTargetFile.value = null
        writer.discard()
        _message.value = "Video segment discarded (no evidence journaled)"
    }

    // ------------------------------------------------------------------
    // VOICE-003 — the voice-note capture lane (additive; the stills/video
    // callbacks above are untouched)
    // ------------------------------------------------------------------

    /** Sets the optional spoken-language advisory for the NEXT voice note (empty = absent). */
    fun setVoiceLanguageHint(hint: String) {
        _voiceLanguageHint.value = hint
    }

    /**
     * Opens a voice-segment writer; the microphone recorder must write into
     * the exposed target file. [mediaType] is the recorder's CONFIGURED
     * output (a fact stated by the platform adapter, e.g. `audio/mp4`).
     */
    fun beginVoiceAsset(mediaType: String) = guarded("begin voice note") {
        val writer = controller.beginVoiceAsset(mediaType)
        voiceWriter = writer
        _voiceTargetFile.value = writer.targetFile
    }

    /**
     * Called when the microphone adapter closed the segment file — commits
     * it via the writer with ONLY honest metadata: the configured codec (a
     * fact), the measured-when-measurable duration/sample rate (absent when
     * not), the optional user-entered language hint, and the capture kind
     * `voice` (the operator chose the voice entry — a fact, not an inference).
     */
    fun onVoiceFinalized(facts: VoiceSegmentFacts) = guarded("commit voice note") {
        val writer = voiceWriter ?: return@guarded
        voiceWriter = null
        _voiceTargetFile.value = null
        val asset = writer.close(voiceMetadata(facts))
        _message.value = "Voice note captured: ${asset.assetId} (${asset.byteSize} bytes)"
    }

    /** Called when the recorder failed or was cancelled — the segment was never evidence. */
    fun onVoiceFailed() = guarded("discard voice note") {
        val writer = voiceWriter ?: return@guarded
        voiceWriter = null
        _voiceTargetFile.value = null
        writer.discard()
        _message.value = "Voice note discarded (no evidence journaled)"
    }

    /**
     * The honest voice metadata composition — every value is device-measured
     * or user-entered, never fabricated; an unmeasured key is simply not
     * asserted (never zero, never "unknown"). Pure and internal so the
     * discipline is pinned by the VM tests.
     */
    internal fun voiceMetadata(facts: VoiceSegmentFacts): Map<String, String> = buildMap {
        put(AcquisitionMetadataKeys.CAPTURE_KIND, "voice") // the operator chose the voice entry — a fact
        put(AcquisitionMetadataKeys.VOICE_CODEC, facts.configuredCodec) // the recorder's ACTUAL configured encoder
        facts.audioSource?.let { put(AcquisitionMetadataKeys.SENSOR_ID, it) }
        facts.durationMs?.let { put(AcquisitionMetadataKeys.VOICE_DURATION_MS, it.toString()) } // measured or absent
        facts.sampleRateHz?.let { put(AcquisitionMetadataKeys.VOICE_SAMPLE_RATE_HZ, it.toString()) } // measured or absent
        val hint = _voiceLanguageHint.value.trim()
        if (hint.isNotEmpty()) {
            put(AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT, hint) // the user-entered advisory
        }
    }

    fun consumeMessage() {
        _message.value = null
    }

    companion object {
        fun factory(controller: CaptureSessionController, environment: CaptureEnvironment) = viewModelFactory {
            initializer { CaptureViewModel(controller, environment) }
        }
    }

    // ------------------------------------------------------------------

    private fun guarded(label: String, block: suspend () -> Unit) {
        if (_busy.value) return // single-flight: one controller op at a time
        _busy.value = true
        viewModelScope.launch {
            try {
                block()
            } catch (t: Throwable) {
                if (t is kotlinx.coroutines.CancellationException) throw t
                _message.value = "Could not $label: ${t.message}"
            } finally {
                _busy.value = false
            }
        }
    }
}
