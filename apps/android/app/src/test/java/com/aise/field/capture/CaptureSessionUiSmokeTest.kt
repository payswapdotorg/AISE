package com.aise.field.capture

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.domain.model.CaptureSession
import com.aise.field.domain.model.SessionStatus
import com.aise.field.fakes.FakeLocalCaptureStore
import com.aise.field.fixtures.ProjectFixtures
import com.aise.field.ui.screens.CaptureSessionScreen
import com.aise.field.ui.theme.AiseTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class CaptureSessionUiSmokeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun captureSessionFlow_smokeTest() {
        val testSession = CaptureSession(
            id = "sess-ui-001",
            projectId = ProjectFixtures.SAMPLE_PROJECT.id,
            intent = CaptureIntent.INSPECTION,
            assuranceProfile = AssuranceProfile.HIGH_ASSURANCE,
            status = SessionStatus.DRAFT,
            createdAt = System.currentTimeMillis()
        )

        val fakeCaptureStore = FakeLocalCaptureStore(listOf(testSession))

        composeTestRule.setContent {
            AiseTheme {
                CaptureSessionScreen(
                    sessionId = testSession.id,
                    captureStore = fakeCaptureStore,
                    onBackClick = {}
                )
            }
        }

        // 1. Wait for session status card to be rendered
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithTag("card_session_status").fetchSemanticsNodes().isNotEmpty()
        }

        // 2. Verify Session Status Card & empty assets view
        composeTestRule.onNodeWithTag("card_session_status").assertExists()
        composeTestRule.onNodeWithTag("empty_assets_view").assertExists()

        // 3. Click "Capture Photo"
        composeTestRule.onNodeWithTag("btn_capture_photo").performClick()
        composeTestRule.waitForIdle()

        // 4. Click "Record Video"
        composeTestRule.onNodeWithTag("btn_capture_video").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onRoot(useUnmergedTree = true).printToLog("ASSET_TEST")

        // 5. Verify assets displayed
        composeTestRule.onNodeWithTag("title_assets").assertExists()

        // 6. Click "Inspect AISE-003 Package Manifest"
        composeTestRule.onNodeWithTag("btn_build_manifest").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("card_manifest_preview").assertExists()
        composeTestRule.onNodeWithText("Assets Count: 2", substring = true).assertExists()

        // 7. Click "Complete Session"
        composeTestRule.onNodeWithTag("btn_complete_session").performClick()
        composeTestRule.waitForIdle()

        // 8. Verify Status updated to COMPLETED
        composeTestRule.onNodeWithText("Status: COMPLETED", substring = true).assertExists()
    }
}
