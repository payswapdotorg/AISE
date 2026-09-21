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
 * [onStillCaptured] / [onVideoFinalized] / [onVideoFailed]; all session
 * semantics stay inside the controller.
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

    private var videoWriter: VideoAssetWriter? = null

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
