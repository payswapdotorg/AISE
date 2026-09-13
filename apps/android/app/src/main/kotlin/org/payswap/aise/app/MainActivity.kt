package org.payswap.aise.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import org.payswap.aise.app.ui.AiseApp
import org.payswap.aise.app.ui.theme.AiseFieldTheme

/**
 * The single activity of the AISE field client shell (AISE-002).
 * Everything above it is Compose; there are no other activities and no
 * fragments.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as AiseApplication).appContainer
        setContent {
            AiseFieldTheme {
                AiseApp(container)
            }
        }
    }
}
