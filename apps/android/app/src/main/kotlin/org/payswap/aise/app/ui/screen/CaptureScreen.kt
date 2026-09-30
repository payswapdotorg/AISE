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
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import org.payswap.aise.app.capture.platform.MicrophoneRecorderAdapter
import org.payswap.aise.app.capture.platform.RotationVectorSnapshotter
import org.payswap.aise.core.adapter.FieldJourneyPhase
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * The capture screen (AISE-005, extended by PROD-019 and VOICE-003):
 * capture permissions gate (camera + microphone, each mission-scoped) →
 * the FIELD-JOURNEY MISSION PANEL (verdict, exact capture actions and
 * evidence gaps — never generic prompts) → live preview → session
 * lifecycle controls (start/pause/resume/finalize) + still/video/voice
 * capture entries + the journal-derived session summary + the explicit
 * submission/offline banner + the CLIENT-ONLY voice-note transcript panel
 * (VOICE-003).
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
 *
 * VOICE-003 — the voice lane rides the SAME state-driven flow: "Voice" →
 * [CaptureViewModel.beginVoiceAsset] exposes the voice writer's tmp target
 * via [CaptureViewModel.voiceTargetFile]; the observing [LaunchedEffect]
 * starts the microphone recorder into it; the recorder's finalize callback
 * hands the honest segment facts to [CaptureViewModel.onVoiceFinalized] or
 * discards via [onVoiceFailed]. `RECORD_AUDIO` is requested MISSION-SCOPED
 * at runtime FROM the voice entry (the camera's permissionLauncher
 * pattern); the voice entry stays honestly reachable WITHOUT the camera
 * (the voice-only stage below the permissions card).
 */
@Composable
fun CaptureScreen(
    viewModel: CaptureViewModel,
    journeyViewModel: FieldJourneyViewModel,
    transcriptViewModel: VoiceNoteTranscriptViewModel,
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
    // VOICE-003: RECORD_AUDIO — mission-scoped at runtime, requested from the
    // voice entry (the camera permission's permissionLauncher pattern).
    var hasRecordAudioPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
        )
    }
    val recordAudioPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasRecordAudioPermission = granted
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
            "Offline capture of stills, video, voice notes and sensor metadata. The session journal " +
                "is the local truth; recovery re-opens interrupted sessions exactly once.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        HorizontalDivider()

        FieldJourneyMissionPanel(journeyViewModel)

        HorizontalDivider()

        if (!hasCameraPermission) {
            CapturePermissionsCard(
                hasRecordAudioPermission = hasRecordAudioPermission,
                onGrantCamera = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                onGrantMicrophone = { recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
            )
            // VOICE-003: the voice lane is honestly reachable WITHOUT the
            // camera — a voice-only stage (no preview, no stills/video).
            VoiceOnlyStage(
                viewModel = viewModel,
                hasMicPermission = hasRecordAudioPermission,
                onRequestMicrophone = { recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
            )
        } else {
            CaptureStage(
                viewModel = viewModel,
                journeyViewModel = journeyViewModel,
                hasMicPermission = hasRecordAudioPermission,
                onRequestMicrophone = { recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
            )
        }

        // VOICE-003: the client-only transcript panel — rendered whenever no
        // session is open (the check reads the last FINALIZED session's
        // manifest; with nothing finalized it answers that honestly).
        val sessionForPanel by viewModel.session.collectAsState()
        if (sessionForPanel == null) {
            VoiceTranscriptPanel(transcriptViewModel)
        }
    }
}

@Composable
private fun CaptureStage(
    viewModel: CaptureViewModel,
    journeyViewModel: FieldJourneyViewModel,
    hasMicPermission: Boolean,
    onRequestMicrophone: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val session by viewModel.session.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val message by viewModel.message.collectAsState()
    val videoTargetFile by viewModel.videoTargetFile.collectAsState()
    // POST-005: hoisted to the composable body — collectAsState() is a
    // @Composable and may NOT be called inside onClick lambdas (the
    // 2026-09-29 E2E compile fix; the Button onClick below reads this).
    val handedOffTask by journeyViewModel.handedOffTask.collectAsState()

    val sensors = remember { RotationVectorSnapshotter(context) }
    val cameraAdapter = remember { CameraCaptureAdapter(context, lifecycleOwner) }
    // VOICE-003: the microphone adapter (platform glue, same discipline as
    // the camera adapter) — released with the composition.
    val micAdapter = remember { MicrophoneRecorderAdapter(context) }
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

    // VOICE-003: the microphone adapter follows the composition too.
    DisposableEffect(micAdapter) {
        onDispose { micAdapter.release() }
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
    val voiceRecording = viewModel.voiceTargetFile.collectAsState().value != null
    val anySegmentOpen = recording || voiceRecording

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
                    val handedOff = handedOffTask
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
            // VOICE-003: pause/finalize also refuse while a VOICE segment is
            // open — the controller enforces it; the UI honestly disables.
            OutlinedButton(onClick = { viewModel.pause() }, enabled = !busy && !anySegmentOpen) {
                Text("Pause")
            }
            OutlinedButton(onClick = { viewModel.finalizeSession() }, enabled = !busy && !anySegmentOpen) {
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
            enabled = !busy && capturing && !anySegmentOpen,
        ) {
            Icon(Icons.Filled.PhotoCamera, contentDescription = null)
            Text("  Still")
        }
        if (videoSupported) {
            if (!recording) {
                Button(
                    onClick = { viewModel.beginVideoAsset() },
                    enabled = !busy && capturing && !anySegmentOpen,
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

        // VOICE-003: the voice entry, next to Still/Record.
        VoiceCaptureControls(
            viewModel = viewModel,
            micAdapter = micAdapter,
            hasMicPermission = hasMicPermission,
            onRequestMicrophone = onRequestMicrophone,
            capturing = capturing,
            busy = busy,
            segmentOpen = anySegmentOpen,
        )
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

/**
 * The honest capture permissions card (VOICE-003): the app requests the
 * camera (stills/video) and the microphone (voice notes) — each
 * MISSION-SCOPED at runtime, never blanket-granted. Stills/video remain
 * behind the camera grant exactly as before; the voice lane is reachable
 * below this card without it.
 */
@Composable
private fun CapturePermissionsCard(
    hasRecordAudioPermission: Boolean,
    onGrantCamera: () -> Unit,
    onGrantMicrophone: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Capture permissions", style = MaterialTheme.typography.titleMedium)
            Text(
                "Stills and video need the camera; voice notes need the microphone. Each is " +
                    "requested mission-scoped while you capture — never blanket-granted. No location " +
                    "is requested; the network is used only to sync evidence when you submit.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onGrantCamera) {
                Text("Grant camera access")
            }
            if (hasRecordAudioPermission) {
                Text(
                    "Microphone access granted — voice notes are available below.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                OutlinedButton(onClick = onGrantMicrophone) {
                    Text("Grant microphone access")
                }
            }
        }
    }
}

/**
 * VOICE-003 — the voice-only capture stage: the voice entry and the session
 * lifecycle WITHOUT the camera (no preview, no stills/video). The voice
 * lane is honestly reachable here even when the camera was never granted —
 * no camera is pretended, none is needed for a voice note.
 */
@Composable
private fun VoiceOnlyStage(
    viewModel: CaptureViewModel,
    hasMicPermission: Boolean,
    onRequestMicrophone: () -> Unit,
) {
    val context = LocalContext.current
    val session by viewModel.session.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val message by viewModel.message.collectAsState()
    val voiceTargetFile by viewModel.voiceTargetFile.collectAsState()

    val micAdapter = remember { MicrophoneRecorderAdapter(context) }
    DisposableEffect(micAdapter) {
        onDispose { micAdapter.release() }
    }

    LaunchedEffect(message) {
        if (message != null) {
            kotlinx.coroutines.delay(6_000)
            viewModel.consumeMessage()
        }
    }

    val status = session?.status
    val capturing = status == CaptureSessionStatus.CAPTURING

    Text("Voice-note capture (camera not granted)", style = MaterialTheme.typography.titleMedium)
    Text(
        when (status) {
            null -> "No open session"
            CaptureSessionStatus.DRAFT -> "Session ${session!!.sessionId.take(8)} — draft"
            CaptureSessionStatus.CAPTURING -> "Session ${session!!.sessionId.take(8)} — capturing"
            CaptureSessionStatus.PAUSED -> "Session ${session!!.sessionId.take(8)} — paused"
            CaptureSessionStatus.FINALIZED -> "Session finalized"
            CaptureSessionStatus.SYNCED -> "Session synced"
        },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (session == null) {
            Button(onClick = { viewModel.startSession() }, enabled = !busy) {
                Text("Start session")
            }
        } else if (capturing) {
            OutlinedButton(
                onClick = { viewModel.pause() },
                enabled = !busy && voiceTargetFile == null,
            ) {
                Text("Pause")
            }
            OutlinedButton(
                onClick = { viewModel.finalizeSession() },
                enabled = !busy && voiceTargetFile == null,
            ) {
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

    VoiceCaptureControls(
        viewModel = viewModel,
        micAdapter = micAdapter,
        hasMicPermission = hasMicPermission,
        onRequestMicrophone = onRequestMicrophone,
        capturing = capturing,
        busy = busy,
        segmentOpen = voiceTargetFile != null,
    )

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

/**
 * VOICE-003 — the voice entry + its state-driven recorder flow (the video
 * lane's exact pattern). The optional language hint is an advisory the
 * operator may enter before recording; `RECORD_AUDIO` is requested
 * mission-scoped FROM this entry when missing.
 */
@Composable
private fun VoiceCaptureControls(
    viewModel: CaptureViewModel,
    micAdapter: MicrophoneRecorderAdapter,
    hasMicPermission: Boolean,
    onRequestMicrophone: () -> Unit,
    capturing: Boolean,
    busy: Boolean,
    segmentOpen: Boolean,
) {
    val voiceTargetFile by viewModel.voiceTargetFile.collectAsState()
    val languageHint by viewModel.voiceLanguageHint.collectAsState()

    // Start the recorder whenever the voice writer's target file appears —
    // the recorder's finalize callback hands the honest segment facts to the
    // VM (or discards the segment on failure: nothing is journaled).
    LaunchedEffect(voiceTargetFile) {
        val target = voiceTargetFile ?: return@LaunchedEffect
        micAdapter.startVoice(target) { ok, facts ->
            if (ok) {
                viewModel.onVoiceFinalized(facts)
            } else {
                viewModel.onVoiceFailed()
            }
        }
    }

    if (voiceTargetFile == null) {
        OutlinedTextField(
            value = languageHint,
            onValueChange = viewModel::setVoiceLanguageHint,
            label = { Text("Language hint (optional)") },
            placeholder = { Text("e.g. en, de-CH") },
            singleLine = true,
            modifier = Modifier.padding(top = 4.dp),
        )
        Button(
            onClick = {
                // Mission-scoped from the voice entry: ask for the
                // microphone only when the operator chooses voice.
                if (!hasMicPermission) {
                    onRequestMicrophone()
                    return@Button
                }
                // The adapter's CONFIGURED profile is a fact (media type +
                // encoder); the session controller records it verbatim.
                viewModel.beginVoiceAsset(micAdapter.profile.mediaType)
            },
            enabled = !busy && capturing && !segmentOpen,
        ) {
            Icon(Icons.Filled.Mic, contentDescription = null)
            Text("  Voice")
        }
    } else {
        OutlinedButton(onClick = { micAdapter.stopVoice() }, enabled = true) {
            Text("Stop voice note")
        }
    }
}

/**
 * VOICE-003 — the CLIENT-ONLY voice-note transcript panel: derives the
 * transcript state of the last finalized session's voice notes from the
 * evidence read view. No transcript is the explicit calm
 * `asr_provider_not_configured` informational state (never an error, never
 * fabricated); a transcript renders as a DERIVED CANDIDATE with its
 * provenance link (never authoritative text).
 */
@Composable
private fun VoiceTranscriptPanel(viewModel: VoiceNoteTranscriptViewModel) {
    val panel by viewModel.panel.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val message by viewModel.message.collectAsState()

    LaunchedEffect(message) {
        if (message != null) {
            kotlinx.coroutines.delay(6_000)
            viewModel.consumeMessage()
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Voice-note transcripts", style = MaterialTheme.typography.titleSmall)
            Text(
                "Derived client-side from the evidence read view: with no ASR provider " +
                    "configured this deployment answers the explicit informational state " +
                    "asr_provider_not_configured — never an error, never a fabricated transcript. " +
                    "When a transcript exists it renders as a DERIVED CANDIDATE with its " +
                    "provenance link, never as authoritative text.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = viewModel::checkTranscriptState, enabled = !busy) {
                Text("Check transcript state")
            }
            when (val current = panel) {
                VoiceNoteTranscriptViewModel.PanelState.Idle -> Unit
                VoiceNoteTranscriptViewModel.PanelState.NoFinalizedSession -> Text(
                    "No finalized session yet — finalize a capture session first.",
                    style = MaterialTheme.typography.bodySmall,
                )

                VoiceNoteTranscriptViewModel.PanelState.NoVoiceNotes -> Text(
                    "The last finalized session has no voice notes.",
                    style = MaterialTheme.typography.bodySmall,
                )

                is VoiceNoteTranscriptViewModel.PanelState.Checked -> {
                    current.notes.forEach { note ->
                        when (note) {
                            is VoiceNoteTranscriptViewModel.NoteState.NoTranscript -> Text(
                                "${note.contentId.take(12)}… — no transcript: ${note.reason} " +
                                    "(the deployment's honest state; the voice note itself is registered)",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )

                            is VoiceNoteTranscriptViewModel.NoteState.DerivedCandidate -> {
                                Text(
                                    "${note.contentId.take(12)}… — transcript candidate: ${note.method} " +
                                        "v${note.methodVersion} → ${note.outputContentId.take(12)}…" +
                                        if (note.additionalCandidateCount > 0) {
                                            " (+${note.additionalCandidateCount} more candidate(s))"
                                        } else {
                                            ""
                                        },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                if (note.derivedFromLink != null) {
                                    Text(
                                        "Provenance: DERIVED_FROM ${note.derivedFromLink!!.subjectId.take(12)}…",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }

                            is VoiceNoteTranscriptViewModel.NoteState.ReadRefused -> Text(
                                "${note.contentId.take(12)}… — read refused: ${note.reason}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
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
