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
import org.payswap.aise.core.adapter.FieldJourneyPhase
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * The capture screen (AISE-005, extended by PROD-019): camera permission
 * gate → the FIELD-JOURNEY MISSION PANEL (verdict, exact capture actions and
 * evidence gaps — never generic prompts) → live preview → session lifecycle
 * controls (start/pause/resume/finalize) + still/video capture buttons +
 * the journal-derived session summary + the explicit submission/offline
 * banner.
 *
 * The UI is DERIVED state throughout (spec/architecture-lock.md invariant 8):
 * everything shown comes from the controller's journal-folded session flow
 * and the runtime's journey phases; nothing here records truth, judges
 * quality or declares readiness. A BLOCKED verdict renders the reason
 * VERBATIM; a deferred submission renders the offline reason VERBATIM.
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
    journeyViewModel: FieldJourneyViewModel,
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

        FieldJourneyMissionPanel(journeyViewModel)

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
            CaptureStage(viewModel, journeyViewModel)
        }
    }
}

@Composable
private fun CaptureStage(viewModel: CaptureViewModel, journeyViewModel: FieldJourneyViewModel) {
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
            Button(
                onClick = {
                    // POST-005: when a handed-off task drives the journey,
                    // ITS task id is the session's missionRef — the
                    // web-originated identity then survives into the
                    // manifest and the sync envelope (missionRef rides
                    // POST /v1/capture/sync). Otherwise the executed
                    // mission plan's own id (the provisioned default).
                    val handedOff = journeyViewModel.handedOffTask.collectAsState().value
                    val missionRef = handedOff?.taskId
                        ?: (journeyViewModel.phase.value as? FieldJourneyPhase.MissionActive)
                            ?.directive?.missionId
                    viewModel.startSession(missionRef)
                },
                enabled = !busy && cameraReady,
            ) {
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
                    // POST-005 GAP-2 fix: the failure is surfaced to the
                    // operator (visible message, nothing journaled) —
                    // never silently swallowed.
                    onError = { message -> viewModel.onStillCaptureFailed(message) },
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

    // The evidence-submission seam (PROD-019): submit the finalized
    // session's manifest through the journey seam — in this build the seam
    // reports network-unavailable EXPLICITLY (a first-class state, never a
    // silent failure) and the evidence stays in the resumable offline store.
    // The panel appears once evidence exists and no session is open (the
    // controller nulls the session flow at finalize — the journal and the
    // manifest remain the truth on disk).
    val journeyPhase by journeyViewModel.phase.collectAsState()
    val missionWithEvidence = journeyPhase as? FieldJourneyPhase.MissionActive
    if (missionWithEvidence != null && session == null && missionWithEvidence.evidenceByStep.isNotEmpty()) {
        SubmissionPanel(journeyViewModel)
    }
}

/** The submission controls + the explicit offline state. */
@Composable
private fun SubmissionPanel(journeyViewModel: FieldJourneyViewModel) {
    val busy by journeyViewModel.busy.collectAsState()
    val message by journeyViewModel.message.collectAsState()
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Evidence submission", style = MaterialTheme.typography.titleSmall)
            Text(
                "Submission submits to the configured AISE API over HTTP once you are signed " +
                    "in; offline or signed-out sessions defer explicitly to the resumable " +
                    "offline store (a typed state with its reason, never a silent failure).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { journeyViewModel.submitEvidence() }, enabled = !busy) {
                    Text("Submit evidence")
                }
                OutlinedButton(onClick = { journeyViewModel.resumeSubmission() }, enabled = !busy) {
                    Text("Retry submission")
                }
            }
            if (message != null) {
                Text(
                    message!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

/**
 * The field-journey mission panel (PROD-019): the negotiated verdict, the
 * EXACT capture actions and the evidence gaps — derived state only.
 */
@Composable
private fun FieldJourneyMissionPanel(journeyViewModel: FieldJourneyViewModel) {
    val phase by journeyViewModel.phase.collectAsState()
    val busy by journeyViewModel.busy.collectAsState()
    val message by journeyViewModel.message.collectAsState()

    LaunchedEffect(message) {
        if (message != null) {
            kotlinx.coroutines.delay(6_000)
            journeyViewModel.consumeMessage()
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Field journey", style = MaterialTheme.typography.titleMedium)
            Text(
                "Task intent → capability assessment → adaptive mission. Server documents " +
                    "are build-time provisioned (badged) until a live task fetch lands; an " +
                    "aise://task handoff continues a web-originated task here.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            when (val current = phase) {
                is FieldJourneyPhase.Idle -> {
                    Button(onClick = { journeyViewModel.startJourney() }, enabled = !busy) {
                        Text("Start field journey")
                    }
                }

                is FieldJourneyPhase.IntentSelected -> {
                    Text("Intent selected — assessing…", style = MaterialTheme.typography.bodySmall)
                }

                is FieldJourneyPhase.Assessed -> {
                    VerdictBanner(current.negotiation.outcome.wireName, emptyList())
                    Text(
                        "Mission not prepared yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                is FieldJourneyPhase.Blocked -> {
                    // The explicit BLOCKED state: reasons rendered VERBATIM,
                    // never a generic capture prompt.
                    VerdictBanner(current.negotiation.outcome.wireName, current.negotiation.blockedReasons)
                }

                is FieldJourneyPhase.MissionActive -> {
                    VerdictBanner(current.directive.negotiationOutcome.wireName, current.directive.degradedNotes)
                    if (current.directive.deviceBlockers.isNotEmpty()) {
                        Text(
                            "Device blockers:",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                        current.directive.deviceBlockers.forEach { blocker ->
                            Text(
                                blocker,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                    // POST-005: when a web-originated task handoff drives
                    // this journey, its identity renders VERBATIM (task id,
                    // origin, purpose) — the cross-device continuation the
                    // operator can see, never a hidden swap.
                    val handedOff = journeyViewModel.handedOffTask.collectAsState().value
                    if (handedOff != null) {
                        Text(
                            "Continuing handed-off task ${handedOff.taskId} — from " +
                                "${handedOff.origin}:${handedOff.originSurface}, purpose " +
                                "${handedOff.purpose}, for project ${handedOff.projectId} " +
                                "(targets: ${handedOff.targetRefs.joinToString(", ")})",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Text(
                        if (handedOff != null) {
                            "Mission plan ${current.directive.missionId} (provisioned — the build-time plan the handed-off task executes)"
                        } else {
                            "Mission ${current.directive.missionId} (provisioned)"
                        },
                        style = MaterialTheme.typography.titleSmall,
                    )
                    current.directive.steps.forEach { step ->
                        val recorded = current.evidenceByStep[step.stepId]?.size ?: 0
                        Text(
                            "${step.exactAction} — ${step.title}" +
                                if (step.mandatory) " (mandatory)" else " (optional)",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (step.actionable) {
                                MaterialTheme.colorScheme.onSurface
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                        )
                        Text(
                            step.instructions,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (step.note != null) {
                            Text(
                                step.note!!, // the honest burden/probing/blocker note, verbatim
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        Text(
                            if (recorded > 0) "Evidence recorded: $recorded asset(s)" else "Evidence gap — not yet captured",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (recorded > 0) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    val gaps = current.gaps.size
                    Text(
                        if (gaps == 0) "All steps have recorded evidence" else "Evidence gaps: $gaps step(s)",
                        style = MaterialTheme.typography.titleSmall,
                    )
                }

                is FieldJourneyPhase.DeferredOffline -> {
                    VerdictBanner("deferred-offline", listOf(current.submission.reason))
                    Text(
                        "Attempt ${current.submission.attempts} — evidence remains in the durable offline store; " +
                            "retry when the transport is available.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                is FieldJourneyPhase.Submitted -> {
                    VerdictBanner("submitted", emptyList())
                    Text(
                        "Server reference: ${current.submission.serverRef}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                is FieldJourneyPhase.SubmissionFailed -> {
                    VerdictBanner("submission-failed", listOf(current.submission.reason))
                }
            }

            if (phase !is FieldJourneyPhase.Idle) {
                OutlinedButton(onClick = { journeyViewModel.resetJourney() }, enabled = !busy) {
                    Text("New field intent")
                }
            }
            if (message != null && phase !is FieldJourneyPhase.DeferredOffline) {
                Text(
                    message!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

/** The negotiated-verdict banner (blocked reasons and degraded notes verbatim). */
@Composable
private fun VerdictBanner(verdict: String, notes: List<String>) {
    val blocked = verdict == "blocked"
    Text(
        "Task $verdict",
        style = MaterialTheme.typography.titleSmall,
        color = if (blocked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
    )
    notes.forEach { note ->
        Text(
            note, // rendered VERBATIM — never paraphrased away
            style = MaterialTheme.typography.bodySmall,
            color = if (blocked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
