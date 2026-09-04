package com.aise.field.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.data.store.LocalProjectStore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectDetailScreen(
    projectId: String,
    projectStore: LocalProjectStore,
    captureStore: LocalCaptureStore,
    onStartCaptureClick: (String) -> Unit,
    onSessionClick: (String) -> Unit = {},
    onBackClick: () -> Unit
) {
    val project by projectStore.getProjectById(projectId).collectAsState(initial = null)
    val sessions by captureStore.getSessionsForProject(projectId).collectAsState(initial = emptyList())

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(project?.name ?: "Project Details") },
                navigationIcon = {
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.testTag("btn_back")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { onStartCaptureClick(projectId) },
                icon = { Icon(Icons.Default.PlayArrow, contentDescription = "Start") },
                text = { Text("Start Capture Session") },
                modifier = Modifier.testTag("btn_start_capture")
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
        ) {
            project?.let { proj ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("card_project_info")
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(text = proj.name, style = MaterialTheme.typography.titleLarge)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(text = proj.description, style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(text = "Project ID: ${proj.id}", style = MaterialTheme.typography.labelMedium)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Capture Sessions (${sessions.size})",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.testTag("title_sessions")
                )
                Spacer(modifier = Modifier.height(8.dp))

                if (sessions.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp)
                            .testTag("empty_sessions_view"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No capture sessions yet.\nTap 'Start Capture Session' to create a draft.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("session_list")
                    ) {
                        items(sessions) { session ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clickable { onSessionClick(session.id) }
                                    .testTag("session_item_${session.id}"),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surface
                                )
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = "Session ID: ${session.id}",
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Intent: ${session.intent.name} | Profile: ${session.assuranceProfile.name}",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Status: ${session.status.name}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary
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
