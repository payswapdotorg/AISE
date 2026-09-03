package com.aise.field

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.fakes.FakeLocalCaptureStore
import com.aise.field.fakes.FakeLocalProjectStore
import com.aise.field.fixtures.ProjectFixtures
import com.aise.field.ui.navigation.AiseNavGraph
import com.aise.field.ui.theme.AiseTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class AppShellSmokeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun fullAcceptancePath_smokeTest() {
        val fakeProjectStore = FakeLocalProjectStore(listOf(ProjectFixtures.SAMPLE_PROJECT))
        val fakeCaptureStore = FakeLocalCaptureStore()

        composeTestRule.setContent {
            AiseTheme {
                val navController = rememberNavController()
                AiseNavGraph(
                    navController = navController,
                    projectStore = fakeProjectStore,
                    captureStore = fakeCaptureStore
                )
            }
        }

        // 1. Launch -> ProjectList: verify sample project exists
        composeTestRule.onNodeWithText("Alpha Facility Inspection").assertIsDisplayed()

        // 2. Click Project -> ProjectDetail
        composeTestRule.onNodeWithTag("project_item_${ProjectFixtures.SAMPLE_PROJECT.id}").performClick()
        composeTestRule.onNodeWithTag("card_project_info").assertIsDisplayed()
        composeTestRule.onNodeWithTag("empty_sessions_view").assertIsDisplayed()

        // 3. Click "Start Capture Session" -> StartCapture
        composeTestRule.onNodeWithTag("btn_start_capture").performClick()

        // 4. Select Intent (INSPECTION) and Assurance Profile (CRITICAL)
        composeTestRule.onNodeWithTag("chip_intent_${CaptureIntent.INSPECTION.name}").performScrollTo().performClick()
        composeTestRule.onNodeWithTag("chip_profile_${AssuranceProfile.CRITICAL.name}").performScrollTo().performClick()

        // 5. Create Capture Session Draft
        composeTestRule.onNodeWithTag("btn_create_session").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        // 6. Verify Back at ProjectDetail & persisted CaptureSession state is displayed
        composeTestRule.onNodeWithTag("title_sessions").assertIsDisplayed()

        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("INSPECTION", substring = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        composeTestRule.onNodeWithText("INSPECTION", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("CRITICAL", substring = true).assertIsDisplayed()
    }
}
