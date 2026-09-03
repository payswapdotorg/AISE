package com.aise.field.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.data.store.LocalProjectStore
import com.aise.field.ui.screens.ProjectDetailScreen
import com.aise.field.ui.screens.ProjectListScreen
import com.aise.field.ui.screens.SettingsScreen
import com.aise.field.ui.screens.StartCaptureScreen

object AiseDestinations {
    const val PROJECT_LIST = "project_list"
    const val PROJECT_DETAIL = "project_detail/{projectId}"
    const val START_CAPTURE = "start_capture/{projectId}"
    const val SETTINGS = "settings"

    fun projectDetail(projectId: String) = "project_detail/$projectId"
    fun startCapture(projectId: String) = "start_capture/$projectId"
}

@Composable
fun AiseNavGraph(
    navController: NavHostController,
    projectStore: LocalProjectStore,
    captureStore: LocalCaptureStore
) {
    NavHost(
        navController = navController,
        startDestination = AiseDestinations.PROJECT_LIST
    ) {
        composable(AiseDestinations.PROJECT_LIST) {
            ProjectListScreen(
                projectStore = projectStore,
                onProjectClick = { projectId ->
                    navController.navigate(AiseDestinations.projectDetail(projectId))
                },
                onSettingsClick = {
                    navController.navigate(AiseDestinations.SETTINGS)
                }
            )
        }

        composable(
            route = AiseDestinations.PROJECT_DETAIL,
            arguments = listOf(navArgument("projectId") { type = NavType.StringType })
        ) { backStackEntry ->
            val projectId = backStackEntry.arguments?.getString("projectId") ?: ""
            ProjectDetailScreen(
                projectId = projectId,
                projectStore = projectStore,
                captureStore = captureStore,
                onStartCaptureClick = { pId ->
                    navController.navigate(AiseDestinations.startCapture(pId))
                },
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }

        composable(
            route = AiseDestinations.START_CAPTURE,
            arguments = listOf(navArgument("projectId") { type = NavType.StringType })
        ) { backStackEntry ->
            val projectId = backStackEntry.arguments?.getString("projectId") ?: ""
            StartCaptureScreen(
                projectId = projectId,
                captureStore = captureStore,
                onSessionCreated = {
                    navController.popBackStack()
                },
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }

        composable(AiseDestinations.SETTINGS) {
            SettingsScreen(
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }
    }
}
