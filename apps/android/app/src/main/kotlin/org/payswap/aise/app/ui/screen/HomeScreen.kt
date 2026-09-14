package org.payswap.aise.app.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import org.payswap.aise.app.BuildConfig
import org.payswap.aise.core.capture.LocalCaptureStore

/**
 * Home (AISE-002 shell, AISE-005 update): app identity plus a diagnostics card
 * reflecting the LOCAL capture store. Counts become non-zero as capture
 * sessions append still assets (AISE-005); video segments stay session-dir
 * only (documented in apps/android/README.md). Debug-only diagnostics.
 */
@Composable
fun HomeScreen(
    store: LocalCaptureStore,
    modifier: Modifier = Modifier,
) {
    val viewModel: HomeViewModel = viewModel(factory = HomeViewModel.factory(store))

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("AISE Field Client", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Android foundation shell — navigation, persistence abstraction, harness.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        HorizontalDivider()

        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Local capture store", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Persistent file-backed implementation of the append-only persistence " +
                        "abstraction. Offline-first; content-addressed; no server authority on the device.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (BuildConfig.DEBUG) {
                    Text(
                        "Entries stored: ${viewModel.entryCount}",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        "Pending sync: ${viewModel.pendingCount}",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        "Debug build — store wiring diagnostics. Stills captured in Capture " +
                            "sessions appear here; sync acknowledgement is AISE-030.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
            }
        }

        Text(
            "Guided missions and synchronization arrive in later work items " +
                "(AISE-009 / AISE-030).",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
