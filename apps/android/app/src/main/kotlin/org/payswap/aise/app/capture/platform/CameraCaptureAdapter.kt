package org.payswap.aise.app.capture.platform

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.util.Log
import androidx.annotation.OptIn
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.FallbackStrategy
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Thin CameraX glue for the capture runtime (AISE-005). All deterministic
 * session logic lives in [org.payswap.aise.app.capture.CaptureSessionController];
 * this adapter only feeds it real camera artifacts:
 *
 *  - binds Preview + ImageCapture + VideoCapture to the lifecycle (the
 *    guaranteed LIMITED+ combination); on devices that refuse the triple
 *    combination it degrades to Preview + ImageCapture and reports
 *    [videoSupported] = false (an honest capability FACT, not a judgment);
 *  - stills: in-memory JPEG bytes from the ImageProxy plane + rotation +
 *    sensor timestamp + LATCHED exposure parameters;
 *  - video: the recorder writes into the writer's tmp file; NO audio is
 *    recorded (visual evidence only — no RECORD_AUDIO permission; document
 *    in README);
 *  - EXPOSURE LATCHING (honest provenance): Camera2Interop session-capture
 *    callback receives every CaptureResult; the latest exposure/sensitivity/
 *    focal-length are latched and attached to the NEXT captured still with a
 *    `camera.*.latched` key set including the latch timestamp — the metadata
 *    says exactly what it is (the most recent camera-reported values at
 *    capture time), never a fabricated "the" exposure.
 *
 * NOT unit-tested: pure platform glue, exercised on physical devices during
 * dogfood (AISE-035); every failure path reports to the UI instead of
 * crashing the session (the journal remains the truth).
 */
class CameraCaptureAdapter(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
) {

    private val mainExecutor: Executor = ContextCompat.getMainExecutor(context)

    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var recorder: Recorder? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null

    /** Honest capability fact: false after [bind] when the device refused the video use case. */
    var videoSupported: Boolean = true
        private set

    // Latched capture-result facts (volatile: written on camera threads, read on capture).
    @Volatile private var latchedExposureTimeNs: Long? = null
    @Volatile private var latchedIso: Int? = null
    @Volatile private var latchedFocalLengthMm: Float? = null
    @Volatile private var latchedAtNanos: Long? = null

    val cameraId: String?
        get() = camera?.let { Camera2CameraInfo.from(it.cameraInfo).cameraId }

    /** Binds the camera use cases to [lifecycleOwner]. Must run on the main thread; suspend until the provider future resolves. */
    @SuppressLint("MissingPermission") // permission is checked by the UI before binding
    suspend fun bind(previewView: androidx.camera.view.PreviewView) {
        val provider = awaitProvider()
        cameraProvider = provider
        val selector = CameraSelector.DEFAULT_BACK_CAMERA

        val preview = buildPreview()
        val image = ImageCapture.Builder().build()
        val video = buildVideoCapture()

        try {
            camera = provider.bindToLifecycle(lifecycleOwner, selector, preview, image, video)
            imageCapture = image
            videoCapture = video
            videoSupported = true
        } catch (e: Exception) {
            // Device cannot run the triple combination: degrade without video.
            Log.w(TAG, "triple use-case bind failed, binding preview+still only", e)
            videoSupported = false
            camera = provider.bindToLifecycle(lifecycleOwner, selector, preview, image)
            imageCapture = image
            videoCapture = null
        }
        preview.setSurfaceProvider(previewView.surfaceProvider)
    }

    fun unbind() {
        stopVideo()
        cameraProvider?.unbindAll()
        camera = null
        imageCapture = null
        videoCapture = null
        recorder = null
    }

    /**
     * Captures one still and hands the JPEG bytes + verbatim metadata to
     * [onCaptured]; failures go to [onError] (the session continues).
     */
    fun takeStill(
        onCaptured: (jpeg: ByteArray, metadata: Map<String, String>) -> Unit,
        onError: (message: String) -> Unit,
    ) {
        val capture = imageCapture ?: run {
            onError("camera not bound")
            return
        }
        capture.takePicture(mainExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    val buffer = image.planes.first().buffer
                    val bytes = ByteArray(buffer.remaining())
                    buffer.get(bytes)
                    val metadata = buildMap {
                        put("capture.kind", "still")
                        put("acquisition.sensorId", cameraId ?: "rear")
                        put("camera.orientation.degrees", image.imageInfo.rotationDegrees.toString())
                        put("camera.frameTimestampNanos", image.imageInfo.timestamp.toString())
                        putAll(latchedExposureMetadata())
                    }
                    onCaptured(bytes, metadata)
                } finally {
                    image.close()
                }
            }

            override fun onError(exception: ImageCaptureException) {
                onError("still capture failed: ${exception.message}")
            }
        })
    }

    /**
     * Starts a video segment recording into [targetFile]. [onFinalized] fires
     * once when the recorder closes the file: `ok=false` means the segment is
     * unusable; `durationNanos` is the recorder-reported recorded duration.
     */
    fun startVideo(targetFile: File, onFinalized: (ok: Boolean, durationNanos: Long) -> Unit) {
        val capture = videoCapture ?: run {
            onFinalized(false, 0L)
            return
        }
        // No audio: visual evidence only (README documents the deliberate scope).
        val pending = capture.output
            .prepareRecording(context, FileOutputOptions.Builder(targetFile).build())
        activeRecording = pending.start(mainExecutor) { event ->
            when (event) {
                is androidx.camera.video.VideoRecordEvent.Finalize -> {
                    activeRecording = null
                    val stats = event.recordingStats
                    onFinalized(!event.hasError(), stats.recordedDurationNanos)
                }
                else -> Unit
            }
        }
    }

    fun stopVideo() {
        activeRecording?.stop()
        activeRecording = null
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private suspend fun awaitProvider(): ProcessCameraProvider =
        suspendCancellableCoroutine { continuation ->
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener(
                {
                    try {
                        continuation.resume(future.get())
                    } catch (e: Exception) {
                        continuation.cancel(e)
                    }
                },
                mainExecutor,
            )
        }

    @OptIn(ExperimentalCamera2Interop::class)
    private fun buildPreview(): Preview {
        val builder = Preview.Builder()
        // Latch the latest capture-result exposure parameters; they are attached
        // to the next still with keys that say they are latched values.
        Camera2Interop.Extender(builder).setSessionCaptureCallback(
            object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureCompleted(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    result: TotalCaptureResult,
                ) {
                    (result.get(CaptureResult.SENSOR_EXPOSURE_TIME))?.let { latchedExposureTimeNs = it }
                    (result.get(CaptureResult.SENSOR_SENSITIVITY))?.let { latchedIso = it }
                    (result.get(CaptureResult.LENS_FOCAL_LENGTH))?.let { latchedFocalLengthMm = it }
                    latchedAtNanos = result.get(CaptureResult.SENSOR_TIMESTAMP)
                }
            },
        )
        return builder.build()
    }

    private fun buildVideoCapture(): VideoCapture<Recorder> {
        val r = Recorder.Builder()
            .setQualitySelector(
                QualitySelector.from(Quality.HIGHEST, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)),
            )
            .build()
        recorder = r
        return VideoCapture.withOutput(r)
    }

    private fun latchedExposureMetadata(): Map<String, String> = buildMap {
        latchedExposureTimeNs?.let { put("camera.exposureTimeNs.latched", it.toString()) }
        latchedIso?.let { put("camera.iso.latched", it.toString()) }
        latchedFocalLengthMm?.let { put("camera.focalLengthMm.latched", it.toString()) }
        latchedAtNanos?.let { put("camera.exposure.latchedAtSensorNanos", it.toString()) }
    }

    private companion object {
        const val TAG = "CameraCaptureAdapter"
    }
}
