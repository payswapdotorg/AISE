package org.payswap.aise.app.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.payswap.aise.app.BuildConfig

/**
 * About placeholder (AISE-002): shows build info — the one screen that
 * surfaces the build identity of the installed shell.
 */
@Composable
fun AboutScreen(modifier: Modifier = Modifier) {
    val rows: List<Pair<String, String>> = listOf(
        "Application ID" to BuildConfig.APPLICATION_ID,
        "Version" to BuildConfig.VERSION_NAME,
        "Version code" to BuildConfig.VERSION_CODE.toString(),
        "Build type" to BuildConfig.BUILD_TYPE,
        "Debug build" to BuildConfig.DEBUG.toString(),
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("About", style = MaterialTheme.typography.headlineMedium)

        Card {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for ((label, value) in rows) {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(
                            label,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.width(128.dp),
                        )
                        Text(value, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "AISE v2 field client — AISE-002 foundation.",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "The client is a mission executor: engineering authority (reality, evidence, " +
                    "readiness, verification) is server-side. Never on the device.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
