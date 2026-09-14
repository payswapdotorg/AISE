package org.payswap.aise.app.capture

import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * Controller integration tests (JVM, offline, no emulator): full session
 * lifecycle, crash-restart cycles through real files, exactly-once
 * recovery, corrupted-asset handling, manifest export and determinism.
 * Camera plumbing is thin Android glue exercised in dogfood (AISE-035);
 * everything deterministic lives HERE.
 */
class CaptureSessionControllerTest {

    @TempDir(cleanup = CleanupMode.ALWAYS)
    lateinit var root: File

    private val clock = MutableTestClock(CaptureRuntimeFixtures.T0)
    private val ids = SequentialSessionIds()

    private fun newController(): CaptureSessionController {
        val sessionsRoot = File(root, "sessions")
        val storeRoot = File(root, "store")
        val store = FileBackedLocalCaptureStore(storeRoot)
        return CaptureSessionController(sessionsRoot, store, clock, ids)
    }

    private suspend fun CaptureSessionController.start() = startSession(
        deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
        capabilitySnapshot = CaptureRuntimeFixtures.capabilitySnapshot(clock.millis()),
    )

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    @Test
    fun `full lifecycle - start, stills, pause, resume, video, finalize, manifest`() = runTest {
        val controller = newController()
        val record = controller.start()
        assertEquals(CaptureSessionStatus.CAPTURING, record.status)

        val still1 = controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        assertEquals("a-0001", still1.assetId)
        val still2 = controller.captureStill(CaptureRuntimeFixtures.payload(2), mapOf("capture.kind" to "still"))
        assertEquals("a-0002", still2.assetId)

        controller.pause()
        assertEquals(CaptureSessionStatus.PAUSED, controller.activeSession.value!!.status)
        controller.resume()
        assertEquals(CaptureSessionStatus.CAPTURING, controller.activeSession.value!!.status)

        val writer = controller.beginVideoAsset()
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(3, size = 300_000)) // "recorder" writes
        val video = writer.close(mapOf("capture.kind" to "video", "fps" to "30"))
        assertEquals("a-0003", video.assetId)
        assertEquals("video/mp4", video.mediaType)
        assertEquals(300_000L, video.byteSize)

        val manifest = controller.finalizeSession()
        assertTrue(manifest.isFile)
        val manifestText = manifest.readText(Charsets.UTF_8)
        assertTrue(manifestText.contains("\"contractVersion\": \"1.0.0\""))
        assertTrue(manifestText.contains("\"acquisitionMethod\": \"VIDEO_FOOTAGE\""))
        assertTrue(manifestText.contains(video.contentId.value))
        assertTrue(manifestText.contains(still1.contentId.value))

        assertNull(controller.activeSession.value)
    }

    @Test
    fun `stills are content-addressed and land in the store ledger`() = runTest {
        val controller = newController()
        controller.start()
        val still = controller.captureStill(
            CaptureRuntimeFixtures.payload(5),
            mapOf("capture.kind" to "still", "sensor.rotation.x" to "0.42"),
        )
        // A FRESH store instance on the same root proves durability (the controller's
        // instance and this one share only the files):
        val store = controllerStore(controller)
        assertEquals(1, store.list().size)
        assertEquals(still.contentId, store.list().first().id)
        assertEquals(1, store.pending().size)
    }

    @Test
    fun `a second session is refused while one is open - one active session per device`() = runTest {
        val controller = newController()
        controller.start()
        assertThrowsSuspend<IllegalStateException> { controller.start() }
    }

    @Test
    fun `pause and resume refuse wrong source states`() = runTest {
        val controller = newController()
        controller.start()
        // From CAPTURING, resume() is illegal (expects PAUSED):
        assertThrowsSuspend<IllegalStateException> { controller.resume() }
        controller.pause()
        // From PAUSED, pause() is illegal:
        assertThrowsSuspend<IllegalStateException> { controller.pause() }
    }

    @Test
    fun `capture while paused is refused - the state machine is the boss`() = runTest {
        val controller = newController()
        controller.start()
        controller.pause()
        assertThrowsSuspend<IllegalStateException> {
            controller.captureStill(CaptureRuntimeFixtures.payload(6), emptyMap())
        }
        assertThrowsSuspend<IllegalStateException> { controller.beginVideoAsset() }
    }

    @Test
    fun `finalize is refused while a video segment is open`() = runTest {
        val controller = newController()
        controller.start()
        val writer = controller.beginVideoAsset()
        assertThrowsSuspend<IllegalStateException> { controller.finalizeSession() }
        assertThrowsSuspend<IllegalStateException> { controller.pause() }
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(7))
        writer.close(emptyMap())
        controller.finalizeSession()
    }

    @Test
    fun `a discarded video segment leaves no journal trace`() = runTest {
        val controller = newController()
        controller.start()
        val writer = controller.beginVideoAsset()
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(8))
        writer.discard()
        val record = controller.activeSession.value!!
        assertEquals(0, record.assets.size)
        assertFalse(anyTmpFiles(controller))
    }

    // ------------------------------------------------------------------
    // Crash-restart cycles (the heart of AISE-005 recovery)
    // ------------------------------------------------------------------

    @Test
    fun `crash mid-session - a fresh controller recovers the session exactly once with assets intact`() = runTest {
        val controller = newController()
        controller.start()
        controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        controller.captureStill(CaptureRuntimeFixtures.payload(2), mapOf("capture.kind" to "still"))
        // Leave an in-flight tmp (crash while writing asset 3):
        val sessionDir = SessionDirectory.scan(File(root, "sessions")).first()
        sessionDir.tmpFile("a-0003", "image/jpeg").apply { parentFile?.mkdirs(); writeBytes(CaptureRuntimeFixtures.payload(3)) }
        // "Process death": drop the controller, restart on the same root.
        val restarted = newController()

        val report = restarted.recoverOnStartup()
        assertEquals(1, report.reopened.size)
        val record = restarted.activeSession.value!!
        assertEquals(CaptureSessionStatus.CAPTURING, record.status)
        assertEquals(listOf("a-0001", "a-0002"), record.assets.map { it.assetId })
        assertFalse(sessionDir.tmpFile("a-0003", "image/jpeg").exists()) // tmp discarded

        // Second restart (crash again before activity): exactly-once — no new reopen.
        val third = newController()
        val report2 = third.recoverOnStartup()
        assertEquals(0, report2.reopened.size)
        assertEquals(CaptureSessionStatus.CAPTURING, third.activeSession.value!!.status)

        // The operator keeps capturing after recovery:
        val still3 = restarted.captureStill(CaptureRuntimeFixtures.payload(3), mapOf("capture.kind" to "still"))
        assertEquals("a-0003", still3.assetId)
    }

    @Test
    fun `crash after finalize but before manifest write - recovery re-derives the manifest`() = runTest {
        val controller = newController()
        controller.start()
        controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        val manifest = controller.finalizeSession()
        // Simulate "manifest lost" (crash between journal finalize and manifest write):
        manifest.delete()

        val restarted = newController()
        restarted.recoverOnStartup()
        assertTrue(manifest.isFile) // re-derived, deterministic
        assertNull(restarted.activeSession.value) // closed session is not "open"
    }

    @Test
    fun `a corrupted still is detected on recovery and excluded from the manifest`() = runTest {
        val controller = newController()
        controller.start()
        val still = controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        // Tamper with the payload file after the fact (disk rot):
        val sessionDir = SessionDirectory.scan(File(root, "sessions")).first()
        sessionDir.assetFile(still.relativePath).writeBytes(CaptureRuntimeFixtures.payload(77))

        val restarted = newController()
        restarted.recoverOnStartup()
        val record = restarted.activeSession.value!!
        assertTrue(record.asset("a-0001")!!.corrupted)

        val manifest = restarted.finalizeSession()
        val text = manifest.readText(Charsets.UTF_8)
        assertFalse(text.contains(still.contentId.value))
        assertTrue(text.contains("\"corruptedAssets\""))
    }

    // ------------------------------------------------------------------
    // Determinism (no clock in assertions; injected clock + ids)
    // ------------------------------------------------------------------

    @Test
    fun `identical operation scripts on identical roots produce byte-identical journals and manifests`() = runTest {
        fun script(rootDir: File): Pair<String, String> {
            val clock = MutableTestClock(CaptureRuntimeFixtures.T0)
            val ids = SequentialSessionIds()
            val controller = CaptureSessionController(
                File(rootDir, "sessions"),
                FileBackedLocalCaptureStore(File(rootDir, "store")),
                clock,
                ids,
            )
            kotlinx.coroutines.test.runTest {
                controller.start()
                controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
                controller.pause()
                controller.resume()
                val writer = controller.beginVideoAsset()
                writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(2, size = 100_000))
                writer.close(mapOf("capture.kind" to "video"))
                controller.finalizeSession()
            }
            val sessionDir = SessionDirectory.scan(File(rootDir, "sessions")).first()
            return sessionDir.journalFile.readText(Charsets.UTF_8) to sessionDir.manifestFile.readText(Charsets.UTF_8)
        }
        val a = script(File(root, "a"))
        val b = script(File(root, "b"))
        assertEquals(a.first, b.first) // journals byte-identical
        assertEquals(a.second, b.second) // manifests byte-identical
    }

    // ------------------------------------------------------------------

    private fun controllerStore(controller: CaptureSessionController): FileBackedLocalCaptureStore {
        // The controller's store is the file-backed one created in newController().
        return FileBackedLocalCaptureStore(File(root, "store"))
    }

    private fun anyTmpFiles(controller: CaptureSessionController): Boolean =
        SessionDirectory.scan(File(root, "sessions")).any { it.tmpFiles().isNotEmpty() }
}
