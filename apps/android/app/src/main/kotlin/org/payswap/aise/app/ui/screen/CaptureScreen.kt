package org.payswap.aise.app.ui.screen

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import org.payswap.aise.app.capture.platform.CameraCaptureAdapter
import org.payswap.aise.app.capture.platform.RotationVectorSnapshotter
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * The capture screen (AISE-005): camera permission gate → live preview →
 * session lifecycle controls (start/pause/resume/finalize) + still/video
 * capture buttons + the journal-derived session summary.
 *
 * The UI is DERIVED state throughout (spec/architecture-lock.md invariant 8):
 * everything shown comes from the controller's journal-folded session flow;
 * nothing here records truth, judges quality or declares readiness.
 *
 * Recording flow (state-driven, no imperative bridges):
 *  - "Record" → [CaptureViewModel.beginVideoAsset] exposes the writer's tmp
 *    target file via [CaptureViewModel.videoTargetFile];
 *  - the [LaunchedEffect] observing that file starts the CameraX recorder
 *    into it; the recorder's Finalize event calls back into
 *    [CaptureViewModel.onVideoFinalized]/[onVideoFailed];
 *  - "Stop" → the adapter stops the recorder; the Finalize event completes
 *    the flow.
 */
@Composable
fun CaptureScreen(
    viewModel: CaptureViewModel,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Capture Session", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Offline capture of stills, video and sensor metadata. The session journal " +
                "is the local truth; recovery re-opens interrupted sessions exactly once.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        HorizontalDivider()

        if (!hasCameraPermission) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Camera permission required", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Capture needs the camera while a session is active. No other permission " +
                            "is requested: no location, no microphone, no network.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                        Text("Grant camera access")
                    }
                }
            }
        } else {
            CaptureStage(viewModel)
        }
    }
}

@Composable
private fun CaptureStage(viewModel: CaptureViewModel) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val session by viewModel.session.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val message by viewModel.message.collectAsState()
    val videoTargetFile by viewModel.videoTargetFile.collectAsState()

    val sensors = remember { RotationVectorSnapshotter(context) }
    val cameraAdapter = remember { CameraCaptureAdapter(context, lifecycleOwner) }
    val previewView = remember { PreviewView(context) }
    var cameraReady by remember { mutableStateOf(false) }
    var videoSupported by remember { mutableStateOf(true) }

    // Sensor listener + camera lifecycle follow the composition.
    DisposableEffect(lifecycleOwner) {
        sensors.start()
        onDispose {
            sensors.stop()
            cameraAdapter.unbind()
        }
    }

    LaunchedEffect(cameraAdapter, previewView) {
        runCatching { cameraAdapter.bind(previewView) }
            .onSuccess {
                cameraReady = true
                videoSupported = cameraAdapter.videoSupported
            }
            .onFailure { cameraReady = false }
    }

    // Start the recorder whenever a video writer's target file appears.
    LaunchedEffect(videoTargetFile) {
        val target = videoTargetFile ?: return@LaunchedEffect
        cameraAdapter.startVideo(target) { ok, durationNanos ->
            if (ok) {
                viewModel.onVideoFinalized(
                    sensors.snapshot() + mapOf("video.durationNanos" to durationNanos.toString()),
                )
            } else {
                viewModel.onVideoFailed()
            }
        }
    }

    // Transient messages auto-dismiss.
    LaunchedEffect(message) {
        if (message != null) {
            kotlinx.coroutines.delay(6_000)
            viewModel.consumeMessage()
        }
    }

    val status = session?.status
    val capturing = status == CaptureSessionStatus.CAPTURING
    val recording = videoTargetFile != null

    Text(
        when (status) {
            null -> "No open session"
            CaptureSessionStatus.DRAFT -> "Session ${session!!.sessionId.take(8)} — draft"
            CaptureSessionStatus.CAPTURING -> "Session ${session!!.sessionId.take(8)} — capturing"
            CaptureSessionStatus.PAUSED -> "Session ${session!!.sessionId.take(8)} — paused"
            CaptureSessionStatus.FINALIZED -> "Session finalized"
            CaptureSessionStatus.SYNCED -> "Session synced"
        },
        style = MaterialTheme.typography.titleMedium,
    )

    if (!cameraReady) {
        Text(
            "Camera not available yet…",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    AndroidView(
        factory = { previewView },
        modifier = Modifier
            .fillMaxWidth()
            .height(280.dp),
    )

    // Session lifecycle controls.
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (session == null) {
            Button(onClick = { viewModel.startSession() }, enabled = !busy && cameraReady) {
                Text("Start session")
            }
        } else if (capturing) {
            OutlinedButton(onClick = { viewModel.pause() }, enabled = !busy && !recording) {
                Text("Pause")
            }
            OutlinedButton(onClick = { viewModel.finalizeSession() }, enabled = !busy && !recording) {
                Text("Finalize")
            }
        } else if (status == CaptureSessionStatus.PAUSED) {
            OutlinedButton(onClick = { viewModel.resume() }, enabled = !busy) {
                Text("Resume")
            }
            OutlinedButton(onClick = { viewModel.finalizeSession() }, enabled = !busy) {
                Text("Finalize")
            }
        }
    }

    // Capture controls.
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = {
                cameraAdapter.takeStill(
                    onCaptured = { jpeg, metadata ->
                        viewModel.onStillCaptured(jpeg, metadata + sensors.snapshot())
                    },
                    onError = { },
                )
            },
            enabled = !busy && capturing && !recording,
        ) {
            Icon(Icons.Filled.PhotoCamera, contentDescription = null)
            Text("  Still")
        }
        if (videoSupported) {
            if (!recording) {
                Button(
                    onClick = { viewModel.beginVideoAsset() },
                    enabled = !busy && capturing,
                ) {
                    Icon(Icons.Filled.Videocam, contentDescription = null)
                    Text("  Record")
                }
            } else {
                OutlinedButton(onClick = { cameraAdapter.stopVideo() }, enabled = true) {
                    Text("Stop recording")
                }
            }
        } else {
            Text(
                "Video not supported by this camera combination",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (message != null) {
        Text(
            message!!,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
        )
    }

    if (session != null) {
        SessionSummary(session!!)
    }
}

@Composable
private fun SessionSummary(session: CaptureSessionRecord) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("Session ${session.sessionId}", style = MaterialTheme.typography.titleSmall)
            Text(
                "Assets: ${session.assets.size} captured, " +
                    "${session.manifestAssets.size} intact, ${session.corruptedAssetIds.size} corrupted",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "Recovery events: ${session.reopenAudits.size}",
                style = MaterialTheme.typography.bodySmall,
            )
            if (session.assets.isNotEmpty()) {
                HorizontalDivider()
                session.assets.forEach { asset ->
                    Text(
                        "${asset.assetId} — ${asset.mediaType}, ${asset.byteSize} bytes" +
                            if (asset.corrupted) " (CORRUPTED: ${asset.corruptionReason})" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (asset.corrupted) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
        }
    }
}
