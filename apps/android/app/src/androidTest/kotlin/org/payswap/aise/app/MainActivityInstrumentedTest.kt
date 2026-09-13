package org.payswap.aise.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented smoke test — DECLARED STRUCTURE ONLY (AISE-002).
 *
 * Running this requires an emulator/device and is intentionally NOT part of
 * the required verification path: `./gradlew :app:test` (JVM) and the CI job
 * (JVM tests + assembleDebug) never execute it. It exists so AISE-005+
 * has a ready-made instrumented harness to grow into.
 */
@RunWith(AndroidJUnit4::class)
class MainActivityInstrumentedTest {

    @Test
    fun appContextPackageName() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("org.payswap.aise.app", appContext.packageName)
    }
}
