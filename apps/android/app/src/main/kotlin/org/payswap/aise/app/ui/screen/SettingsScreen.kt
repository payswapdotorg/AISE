package org.payswap.aise.app.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.payswap.aise.app.auth.MobileAuthClient

/**
 * Mobile connection settings. Server authentication remains authoritative;
 * this screen stores only the current in-memory session token and exposes
 * explicit sign-in/out actions needed by the field capture/sync journey.
 */
@Composable
fun SettingsScreen(
    authClient: MobileAuthClient,
    apiBaseUrl: String,
    modifier: Modifier = Modifier,
) {
    val principal by authClient.principal.collectAsState()
    val scope = rememberCoroutineScope()
    var principalId by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(principal) {
        if (principal != null) {
            message = "Signed in as " + principal!!.displayName + " (" + principal!!.roleLabel + ")."
        }
    }

    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Card {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("AISE connection", style = MaterialTheme.typography.titleMedium)
                Text(apiBaseUrl, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "The mobile app uses the server authenticated capture and synchronization APIs. " +
                        "Engineering readiness and mission policy remain server-authoritative.",
                    style = MaterialTheme.typography.bodySmall,
                )

                if (principal == null) {
                    Button(
                        onClick = {
                            busy = true
                            message = null
                            scope.launch {
                                val result = withContext(Dispatchers.IO) { authClient.signInDemo() }
                                busy = false
                                message = result.fold(
                                    onSuccess = { "Signed in as " + it.displayName + " (" + it.roleLabel + ")." },
                                    onFailure = { "Sign-in failed: " + (it.message ?: "unknown error") },
                                )
                            }
                        },
                        enabled = !busy,
                    ) {
                        if (busy) CircularProgressIndicator() else Text("Enter demo")
                    }

                    OutlinedTextField(
                        value = principalId,
                        onValueChange = { principalId = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Principal ID") },
                        singleLine = true,
                    )
                    OutlinedButton(
                        onClick = {
                            busy = true
                            message = null
                            scope.launch {
                                val result = withContext(Dispatchers.IO) { authClient.signIn(principalId.trim()) }
                                busy = false
                                message = result.fold(
                                    onSuccess = { "Signed in as " + it.displayName + " (" + it.roleLabel + ")." },
                                    onFailure = { "Sign-in failed: " + (it.message ?: "unknown error") },
                                )
                            }
                        },
                        enabled = !busy && principalId.trim().isNotEmpty(),
                    ) { Text("Sign in") }
                } else {
                    Text("Signed in: " + principal!!.displayName, style = MaterialTheme.typography.bodyLarge)
                    OutlinedButton(
                        onClick = {
                            busy = true
                            scope.launch {
                                val result = withContext(Dispatchers.IO) { authClient.signOut() }
                                busy = false
                                message = result.fold(
                                    onSuccess = { "Signed out." },
                                    onFailure = { "Sign-out failed: " + (it.message ?: "unknown error") },
                                )
                            }
                        },
                        enabled = !busy,
                    ) { Text("Sign out") }
                }

                if (message != null) {
                    Text(message!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        Text(
            "No local engineering policy is configurable here. Capture strategy, evidence requirements " +
                "and readiness are negotiated and verified by the AISE server.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
