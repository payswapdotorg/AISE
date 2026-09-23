package org.payswap.aise.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import org.payswap.aise.app.AppContainer
import org.payswap.aise.app.navigation.AppDestination
import org.payswap.aise.app.ui.screen.AboutScreen
import org.payswap.aise.app.ui.screen.CaptureScreen
import org.payswap.aise.app.ui.screen.CaptureViewModel
import org.payswap.aise.app.ui.screen.FieldJourneyViewModel
import org.payswap.aise.app.ui.screen.HomeScreen
import org.payswap.aise.app.ui.screen.SettingsScreen

/**
 * Root composable of the AISE field client shell: a navigation graph with the
 * destinations (Home / Capture / Settings / About) wired to a bottom
 * navigation bar. AISE-005 added the capture destination.
 */
@Composable
fun AiseApp(container: AppContainer, modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    Scaffold(
        modifier = modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar {
                AppDestination.BOTTOM_BAR.forEach { destination ->
                    NavigationBarItem(
                        selected = currentRoute == destination.route,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon(), contentDescription = null) },
                        label = { Text(destination.label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = AppDestination.START.route,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(AppDestination.HOME.route) {
                HomeScreen(
                    store = container.localCaptureStore,
                    modifier = Modifier.padding(innerPadding),
                )
            }
            composable(AppDestination.CAPTURE.route) {
                CaptureScreen(
                    viewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                        factory = CaptureViewModel.factory(
                            container.captureController,
                            container.captureEnvironment,
                        ),
                    ),
                    journeyViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                        factory = FieldJourneyViewModel.factory(
                            container.fieldJourneyRuntime,
                            container.captureController,
                        ),
                    ),
                    modifier = Modifier.padding(innerPadding),
                )
            }
            composable(AppDestination.SETTINGS.route) {
                SettingsScreen(
                    authClient = container.authClient,
                    apiBaseUrl = container.apiBaseUrl,
                    modifier = Modifier.padding(innerPadding),
                )
            }
            composable(AppDestination.ABOUT.route) {
                AboutScreen(modifier = Modifier.padding(innerPadding))
            }
        }
    }
}

private fun AppDestination.icon(): ImageVector = when (this) {
    AppDestination.HOME -> Icons.Filled.Home
    AppDestination.CAPTURE -> Icons.Filled.PhotoCamera
    AppDestination.SETTINGS -> Icons.Filled.Settings
    AppDestination.ABOUT -> Icons.Filled.Info
}
