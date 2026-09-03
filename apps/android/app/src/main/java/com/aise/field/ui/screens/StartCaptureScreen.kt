package com.aise.field.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.domain.model.CaptureSession
import com.aise.field.domain.model.SessionStatus
import kotlinx.coroutines.launch
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StartCaptureScreen(
    projectId: String,
    captureStore: LocalCaptureStore,
    onSessionCreated: () -> Unit,
    onBackClick: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    var selectedIntent by remember { mutableStateOf(CaptureIntent.AS_BUILT) }
    var selectedProfile by remember { mutableStateOf(AssuranceProfile.STANDARD) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Start Capture Session") },
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
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text(text = "Declare Capture Intent", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CaptureIntent.entries.forEach { intent ->
                    FilterChip(
                        selected = selectedIntent == intent,
                        onClick = { selectedIntent = intent },
                        label = { Text(intent.name) },
                        modifier = Modifier.testTag("chip_intent_${intent.name}")
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(text = "Select Assurance Profile", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AssuranceProfile.entries.forEach { profile ->
                    FilterChip(
                        selected = selectedProfile == profile,
                        onClick = { selectedProfile = profile },
                        label = { Text(profile.name) },
                        modifier = Modifier.testTag("chip_profile_${profile.name}")
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = {
                    coroutineScope.launch {
                        val newSession = CaptureSession(
                            id = UUID.randomUUID().toString(),
                            projectId = projectId,
                            intent = selectedIntent,
                            assuranceProfile = selectedProfile,
                            status = SessionStatus.DRAFT,
                            createdAt = System.currentTimeMillis()
                        )
                        captureStore.saveSession(newSession)
                        onSessionCreated()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("btn_create_session")
            ) {
                Text("Create Capture Session Draft", style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}
