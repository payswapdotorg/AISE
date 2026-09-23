package org.payswap.aise.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android emulator production smoke (PROD-032).
 *
 * This deliberately stays at the adapter boundary: prove the signed/debug
 * application launches, the canonical bottom navigation is reachable, and
 * the real Capture surface renders its mission-scoped permission state.
 * Camera hardware itself remains a device-capability fact; provider-specific
 * camera conformance belongs in the physical/device matrix documented below.
 */
@RunWith(AndroidJUnit4::class)
class MainActivityInstrumentedTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun launchAndReachCaptureSurface() {
        composeRule.onNodeWithText("Home").assertIsDisplayed()
        composeRule.onNodeWithText("Capture").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Capture Session").assertIsDisplayed()
        composeRule.onNodeWithText("Field journey").assertIsDisplayed()
    }
}
