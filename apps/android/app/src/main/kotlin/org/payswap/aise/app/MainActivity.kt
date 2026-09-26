package org.payswap.aise.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import org.payswap.aise.app.ui.AiseApp
import org.payswap.aise.app.ui.theme.AiseFieldTheme

/**
 * The single activity of the AISE field client shell (AISE-002).
 * Everything above it is Compose; there are no other activities and no
 * fragments.
 *
 * POST-005: the activity is also the `aise://task` deep-link entry point
 * (the manifest's VIEW intent filter, launchMode singleTask). A deep link
 * is offered to the [AppContainer] as a typed task handoff — parsed
 * strictly by the :core codec; an invalid link is recorded as its typed
 * rejection and NEVER crashes or silently routes somewhere else.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as AiseApplication).appContainer
        offerHandoffFromIntent(intent, container)
        setContent {
            AiseFieldTheme {
                AiseApp(container)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        offerHandoffFromIntent(intent, (application as AiseApplication).appContainer)
    }

    /** Offer the intent's aise://task data as a field task handoff (typed). */
    private fun offerHandoffFromIntent(intent: Intent?, container: AppContainer) {
        val data = intent?.data?.toString() ?: return
        container.offerHandoff(data)
    }
}
