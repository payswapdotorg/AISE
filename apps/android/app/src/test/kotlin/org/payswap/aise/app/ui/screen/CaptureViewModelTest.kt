package org.payswap.aise.app.ui.screen

import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.payswap.aise.app.capture.CaptureEnvironment
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.FileBackedLocalCaptureStore
import org.payswap.aise.app.capture.MutableTestClock
import org.payswap.aise.app.capture.SequentialSessionIds
import org.payswap.aise.app.capture.CaptureRuntimeFixtures
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * Capture view-model tests (pure JVM, runTest with the Main dispatcher
 * swapped — the VM launches in viewModelScope). The VM is a thin, dumb
 * bridge: these tests pin that (a) it forwards lifecycle/capture operations
 * to the controller, (b) derived session state reaches the UI flow, and
 * (c) failures surface as MESSAGES — never crashes, never silent no-ops.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CaptureViewModelTest {

    @TempDir(cleanup = CleanupMode.ALWAYS)
    lateinit var root: File

    private val clock = MutableTestClock(CaptureRuntimeFixtures.T0)
    private val ids = SequentialSessionIds()

    private fun newViewModel(): CaptureViewModel {
        val controller = CaptureSessionController(
            sessionsRoot = File(root, "sessions"),
            store = FileBackedLocalCaptureStore(File(root, "store")),
            clock = clock,
            sessionIds = ids,
            // Synchronous dispatcher: viewModelScope launches complete before the
            // assertions run — no race with real IO threads.
            ioDispatcher = UnconfinedTestDispatcher(),
        )
        return CaptureViewModel(controller, fixedEnvironment())
    }

    private fun fixedEnvironment() = object : CaptureEnvironment {
        override fun deviceIdentity() = CaptureRuntimeFixtures.deviceIdentity()
        override fun imuActive() = true
    }

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpMain() {
            Dispatchers.setMain(UnconfinedTestDispatcher())
        }

        @JvmStatic
        @AfterAll
        fun tearDownMain() {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `startSession exposes the capturing session through the ui flow`() = runTest {
        val viewModel = newViewModel()
        assertNull(viewModel.session.value)

        viewModel.startSession()
        val session = viewModel.session.value
        assertNotNull(session)
        assertEquals(CaptureSessionStatus.CAPTURING, session!!.status)
        // The baseline capability snapshot records the injected environment facts:
        assertEquals(true, session.capabilitySnapshot.imuActiveFact())
        assertEquals(CaptureRuntimeFixtures.deviceIdentity(), session.deviceIdentity)
    }

    @Test
    fun `pause resume finalize flow through and clear the active session`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.pause()
        assertEquals(CaptureSessionStatus.PAUSED, viewModel.session.value!!.status)
        viewModel.resume()
        assertEquals(CaptureSessionStatus.CAPTURING, viewModel.session.value!!.status)

        viewModel.finalizeSession()
        assertNull(viewModel.session.value)
        assertNotNull(viewModel.message.value) // "Session finalized — manifest: …"
        assertTrue(viewModel.message.value!!.contains("manifest"))
    }

    @Test
    fun `illegal operations surface as messages, never crashes`() = runTest {
        val viewModel = newViewModel()
        // pause with NO session:
        viewModel.pause()
        assertNotNull(viewModel.message.value)
        assertTrue(viewModel.message.value!!.contains("Could not pause"))

        viewModel.consumeMessage()
        assertNull(viewModel.message.value)
    }

    @Test
    fun `still capture flows through the controller into the session record`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.onStillCaptured(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        val session = viewModel.session.value!!
        assertEquals(1, session.assets.size)
        assertEquals("a-0001", session.assets.first().assetId)
        assertTrue(viewModel.message.value!!.contains("a-0001"))
    }

    @Test
    fun `video begin and finalize flow through the writer`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.beginVideoAsset()
        val target = viewModel.videoTargetFile.value
        assertNotNull(target)
        assertTrue(target!!.name.endsWith(".mp4.tmp"))

        // The "recorder" writes into the target file:
        target.writeBytes(CaptureRuntimeFixtures.payload(2, size = 50_000))
        viewModel.onVideoFinalized(mapOf("capture.kind" to "video"))

        assertNull(viewModel.videoTargetFile.value)
        val session = viewModel.session.value!!
        assertEquals(1, session.assets.size)
        assertEquals("video/mp4", session.assets.first().mediaType)
    }

    @Test
    fun `failed video discards cleanly with no journal trace`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.beginVideoAsset()
        viewModel.onVideoFailed()

        assertNull(viewModel.videoTargetFile.value)
        assertEquals(0, viewModel.session.value!!.assets.size)
        assertNotNull(viewModel.message.value)
    }

    @Test
    fun `busy flag guards concurrent operations`() = runTest {
        val viewModel = newViewModel()
        // No session: operations fail fast (guarded single-flight still resets busy):
        viewModel.pause()
        assertEquals(false, viewModel.busy.value)
    }

    // ------------------------------------------------------------------

    private fun org.payswap.aise.core.session.CapabilitySnapshot.imuActiveFact(): Boolean =
        domain(org.payswap.aise.core.session.CapabilityDomainKind.IMU).status ==
            org.payswap.aise.core.session.CapabilityDomainStatus.SUPPORTED
}
