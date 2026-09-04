package com.aise.field

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.ui.MainActivity
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppShellEmulatorSmokeTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun fullAcceptancePath_emulatorSmokeTest() {
        // 1. Launch -> ProjectList: Create a new project draft
        composeTestRule.onNodeWithTag("btn_new_project").performClick()

        // Wait for created project item to appear in Room Flow collection
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Project 1", substring = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // 2. Click created Project -> ProjectDetail
        composeTestRule.onNodeWithText("Project 1", substring = true).performClick()
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
