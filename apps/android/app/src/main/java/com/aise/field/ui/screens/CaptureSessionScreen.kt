package com.aise.field.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.aise.field.capture.engine.LocalFileStore
import com.aise.field.capture.engine.PhotoCaptureAdapter
import com.aise.field.capture.engine.VideoCaptureAdapter
import com.aise.field.capture.manifest.CapturePackageManifestBuilder
import com.aise.field.capture.metadata.AndroidDeviceMetadataProvider
import com.aise.field.capture.session.CaptureSessionLifecycleManager
import com.aise.field.contracts.dto.CapturePackageContractDto
import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.domain.model.SessionStatus
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaptureSessionScreen(
    sessionId: String,
    captureStore: LocalCaptureStore,
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val sessionFlow = remember(sessionId) { captureStore.getSessionById(sessionId) }
    val assetsFlow = remember(sessionId) { captureStore.getAssetsForSession(sessionId) }

    val session by sessionFlow.collectAsState(initial = null)
    val assets by assetsFlow.collectAsState(initial = emptyList())

    val metadataProvider = remember { AndroidDeviceMetadataProvider(context) }
    val localFileStore = remember { LocalFileStore(context) }
    val photoAdapter = remember { PhotoCaptureAdapter(localFileStore, metadataProvider) }
    val videoAdapter = remember { VideoCaptureAdapter(localFileStore, metadataProvider) }

    var manifestPreview by remember { mutableStateOf<CapturePackageContractDto?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(session?.let { "Session: ${it.intent.name}" } ?: "Capture Session") },
                navigationIcon = {
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.testTag("btn_back")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
        ) {
            session?.let { currentSession ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("card_session_status")
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Intent: ${currentSession.intent.name} | Profile: ${currentSession.assuranceProfile.name}",
                            style = MaterialTheme.typography.titleLarge
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Status: ${currentSession.status.name}",
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (currentSession.status == SessionStatus.COMPLETED) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Session ID: ${currentSession.id}",
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Action Buttons for Capture
                if (currentSession.status != SessionStatus.COMPLETED) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                coroutineScope.launch {
                                    try {
                                        val dummyJpeg = "FAKE_JPEG_IMAGE_DATA_${System.currentTimeMillis()}".toByteArray()
                                        val photoAsset = photoAdapter.capturePhoto(
                                            sessionId = currentSession.id,
                                            jpegBytes = dummyJpeg,
                                            notes = "Field Photo Pass"
                                        )
                                        captureStore.saveAsset(photoAsset)

                                        if (currentSession.status == SessionStatus.DRAFT || currentSession.status == SessionStatus.READY) {
                                            val updatedSession = CaptureSessionLifecycleManager.transition(currentSession, SessionStatus.IN_PROGRESS)
                                            captureStore.saveSession(updatedSession)
                                        }
                                    } catch (e: Throwable) {
                                        e.printStackTrace()
                                    }
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("btn_capture_photo")
                        ) {
                            Text("Capture Photo")
                        }

                        Button(
                            onClick = {
                                coroutineScope.launch {
                                    try {
                                        val dummyMp4 = "FAKE_MP4_VIDEO_DATA_${System.currentTimeMillis()}".toByteArray()
                                        val videoAsset = videoAdapter.captureVideo(
                                            sessionId = currentSession.id,
                                            videoBytes = dummyMp4,
                                            notes = "Field Video Pass"
                                        )
                                        captureStore.saveAsset(videoAsset)

                                        if (currentSession.status == SessionStatus.DRAFT || currentSession.status == SessionStatus.READY) {
                                            val updatedSession = CaptureSessionLifecycleManager.transition(currentSession, SessionStatus.IN_PROGRESS)
                                            captureStore.saveSession(updatedSession)
                                        }
                                    } catch (e: Throwable) {
                                        e.printStackTrace()
                                    }
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("btn_capture_video")
                        ) {
                            Text("Record Video")
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedButton(
                        onClick = {
                            coroutineScope.launch {
                                try {
                                    val completedSession = CaptureSessionLifecycleManager.transition(currentSession, SessionStatus.COMPLETED)
                                    captureStore.saveSession(completedSession)
                                } catch (e: Throwable) {
                                    e.printStackTrace()
                                }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("btn_complete_session")
                    ) {
                        Icon(Icons.Default.Check, contentDescription = "Complete")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Complete Session")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = {
                        manifestPreview = CapturePackageManifestBuilder.buildManifest(currentSession, assets)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("btn_build_manifest"),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                ) {
                    Text("Inspect AISE-003 Package Manifest")
                }

                manifestPreview?.let { manifest ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("card_manifest_preview"),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(text = "Package Manifest (v${manifest.contractVersion})", style = MaterialTheme.typography.titleLarge)
                            Text(text = "Package ID: ${manifest.packageId}", style = MaterialTheme.typography.labelMedium)
                            Text(text = "Assets Count: ${manifest.assets.size}", style = MaterialTheme.typography.bodyMedium)
                            Text(text = "Total Size: ${manifest.totalByteSize} bytes", style = MaterialTheme.typography.bodyMedium)
                            Text(text = "Checksum Algorithm: ${manifest.checksumAlgorithm}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Captured Evidence Assets (${assets.size})",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.testTag("title_assets")
                )

                Spacer(modifier = Modifier.height(8.dp))

                if (assets.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                            .testTag("empty_assets_view"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No capture assets recorded yet.")
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("asset_list")
                    ) {
                        items(assets) { asset ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .testTag("asset_item_${asset.id}")
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = "${asset.assetType.name} Asset",
                                        style = MaterialTheme.typography.titleLarge
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Path: ${asset.relativePath ?: asset.filePath}",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = "Size: ${asset.byteSize} bytes | Hash: ${asset.contentHash?.take(16)}...",
                                        style = MaterialTheme.typography.labelMedium
                                    )
                                    asset.acquisitionMetadata?.let { meta ->
                                        Text(
                                            text = "Captured At: ${meta.capturedAt} (${meta.sensorRef ?: "sensor"})",
                                            style = MaterialTheme.typography.labelMedium
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
