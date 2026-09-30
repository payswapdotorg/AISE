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
import org.payswap.aise.core.identity.ContentIdentity
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CaptureContractVersion
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * VOICE-003 — the voice-note commit flow (the `CaptureSessionControllerTest`
 * discipline, new suite so the stills/video tests stay unmodified): a voice
 * segment commits through the SAME protocol as video (tmp file → recorder
 * writes → one sequential chunked hash over (payload, metadata) → journal
 * `asset.captured` fsync commit point → atomic rename), with
 * `acquisitionMethod: VOICE_NOTE`, honest metadata (measured keys
 * string-encoded integers; unmeasured keys absent), content identity over
 * (payload, metadata), and the state-machine refusals (pause/finalize
 * refuse while a voice segment is open; one in-flight recorder at a time).
 */
class CaptureVoiceControllerTest {

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

    /** The honest metadata of a fully-measured voice note (the adapter's facts). */
    private val measuredVoiceMetadata = mapOf(
        "capture.kind" to "voice",
        "acquisition.sensorId" to "mic",
        "voice.codec" to "aac",
        "voice.duration.ms" to "18400",
        "voice.sample.rate.hz" to "48000",
    )

    @Test
    fun `a voice segment commits as a VOICE_NOTE asset with the honest metadata map`() = runTest {
        val controller = newController()
        controller.start()
        val still = controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        assertEquals("a-0001", still.assetId)

        val writer = controller.beginVoiceAsset("audio/mp4")
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(2, size = 120_000)) // "recorder" writes
        val voice = writer.close(measuredVoiceMetadata)

        assertEquals("a-0002", voice.assetId)
        assertEquals(AcquisitionMethod.VOICE_NOTE, voice.acquisitionMethod)
        assertEquals("audio/mp4", voice.mediaType)
        assertEquals(120_000L, voice.byteSize)
        assertEquals("aac", voice.sensorMetadata["voice.codec"])
        assertEquals("18400", voice.sensorMetadata["voice.duration.ms"])
        assertEquals("48000", voice.sensorMetadata["voice.sample.rate.hz"])
        // The base identity keys ride verbatim (the stills discipline).
        assertEquals("voice", voice.sensorMetadata["capture.kind"])
        assertTrue(voice.sensorMetadata["session.id"]!!.isNotEmpty())
        assertTrue(voice.sensorMetadata["device.id"]!!.isNotEmpty())

        // The committed file lives at the audio extension under assets/.
        val sessionDir = SessionDirectory.scan(File(root, "sessions")).first()
        assertTrue(File(sessionDir.root, voice.relativePath).isFile)
        assertTrue(voice.relativePath.endsWith(".m4a"), "the audio/mp4 container maps to .m4a: ${voice.relativePath}")
    }

    @Test
    fun `the voice asset carries content identity over payload and metadata - the stills discipline`() = runTest {
        val controller = newController()
        controller.start()

        val payload = CaptureRuntimeFixtures.payload(3, size = 8_192)
        val writerA = controller.beginVoiceAsset("audio/mp4")
        writerA.targetFile.writeBytes(payload)
        val a = writerA.close(measuredVoiceMetadata)

        // The journaled content id EQUALS the frozen in-memory derivation over
        // (payload, metadata): the chunked streaming path and ContentIdentity
        // agree for the voice lane exactly as for stills.
        val expected = ContentIdentity.contentId(
            payload,
            controller.activeSession.value!!.assets.first().sensorMetadata,
        )
        assertEquals(expected.value, a.contentId.value)

        // Same payload + different metadata → different identity.
        val writerB = controller.beginVoiceAsset("audio/mp4")
        writerB.targetFile.writeBytes(payload)
        val b = writerB.close(measuredVoiceMetadata + ("voice.language.hint" to "en"))
        assertFalse(a.contentId == b.contentId, "metadata is part of voice-note identity")
    }

    @Test
    fun `unmeasured voice keys are absent from the manifest - never zero, never unknown`() = runTest {
        val controller = newController()
        controller.start()
        val writer = controller.beginVoiceAsset("audio/mp4")
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(4, size = 4_096))
        // Only the codec was measurable (a configured fact); duration, sample
        // rate and the user hint are honestly absent.
        writer.close(mapOf("capture.kind" to "voice", "voice.codec" to "aac"))

        val manifest = controller.finalizeSession()
        val text = manifest.readText(Charsets.UTF_8)
        assertFalse(text.contains("\"voice.duration.ms\""), "unmeasured duration must be absent from the manifest")
        assertFalse(text.contains("\"voice.sample.rate.hz\""), "unmeasured sample rate must be absent")
        assertFalse(text.contains("\"voice.language.hint\""), "no hint entered → absent")
        // Never an 'unknown'/zero placeholder IN THE VOICE METADATA (the
        // honesty rule's scope). The whole-manifest text search would be
        // over-broad: capabilityProfile legitimately renders 'unknown' domain
        // statuses (the honest AISE-005 baseline — unprobed domains are
        // reported as unknown there, by design, a DIFFERENT honesty rule).
        val manifestJson = JsonParser.parse(text) as JsonValue.JsonObject
        val voiceAsset = (manifestJson.members["assets"] as JsonValue.JsonArray).items.first()
            as JsonValue.JsonObject
        val voiceMeta = voiceAsset.members["acquisitionMetadata"] as JsonValue.JsonObject
        for (value in voiceMeta.members.values) {
            val s = (value as? JsonValue.JsonString)?.value
            assertFalse(s == "unknown", "never an 'unknown' placeholder in the voice metadata")
            assertFalse(s == "0", "never a zero placeholder in the voice metadata")
        }
        assertTrue(text.contains("\"voice.codec\": \"aac\""))
        assertTrue(text.contains("\"acquisitionMethod\": \"VOICE_NOTE\""))
        assertTrue(text.contains("\"contractVersion\": \"${CaptureContractVersion.CURRENT}\""))
    }

    @Test
    fun `pause and finalize refuse while a voice segment is open`() = runTest {
        val controller = newController()
        controller.start()
        val writer = controller.beginVoiceAsset("audio/mp4")
        assertThrowsSuspend<IllegalStateException> { controller.pause() }
        assertThrowsSuspend<IllegalStateException> { controller.finalizeSession() }
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(5))
        writer.close(measuredVoiceMetadata)
        controller.pause()
        controller.resume()
        controller.finalizeSession()
    }

    @Test
    fun `capture while paused is refused for voice too - the state machine is the boss`() = runTest {
        val controller = newController()
        controller.start()
        controller.pause()
        assertThrowsSuspend<IllegalStateException> { controller.beginVoiceAsset("audio/mp4") }
    }

    @Test
    fun `a video segment and a voice segment cannot be open simultaneously`() = runTest {
        val controller = newController()
        controller.start()

        val video = controller.beginVideoAsset()
        assertThrowsSuspend<IllegalStateException> { controller.beginVoiceAsset("audio/mp4") }
        video.targetFile.writeBytes(CaptureRuntimeFixtures.payload(6))
        video.close(mapOf("capture.kind" to "video"))

        val voice = controller.beginVoiceAsset("audio/mp4")
        assertThrowsSuspend<IllegalStateException> { controller.beginVideoAsset() }
        voice.targetFile.writeBytes(CaptureRuntimeFixtures.payload(7))
        voice.close(measuredVoiceMetadata)
    }

    @Test
    fun `a non-audio media type is refused for the voice lane`() = runTest {
        val controller = newController()
        controller.start()
        assertThrowsSuspend<IllegalArgumentException> { controller.beginVoiceAsset("image/jpeg") }
        assertThrowsSuspend<IllegalArgumentException> { controller.beginVoiceAsset("video/mp4") }
    }

    @Test
    fun `a discarded voice segment leaves no journal trace`() = runTest {
        val controller = newController()
        controller.start()
        val writer = controller.beginVoiceAsset("audio/mp4")
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(8))
        writer.discard()
        val record = controller.activeSession.value!!
        assertEquals(0, record.assets.size)
        assertFalse(SessionDirectory.scan(File(root, "sessions")).any { it.tmpFiles().isNotEmpty() })
    }

    @Test
    fun `crash mid-voice-segment - recovery discards the tmp and the session continues`() = runTest {
        val controller = newController()
        controller.start()
        controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        // An in-flight voice tmp (crash while the recorder was writing asset 2):
        val writer = controller.beginVoiceAsset("audio/mp4")
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(2))

        // "Process death": a fresh controller on the same root recovers.
        val restarted = newController()
        val report = restarted.recoverOnStartup()
        assertEquals(1, report.reopened.size)
        val record = restarted.activeSession.value!!
        assertEquals(CaptureSessionStatus.CAPTURING, record.status)
        assertEquals(listOf("a-0001"), record.assets.map { it.assetId })
        assertFalse(SessionDirectory.scan(File(root, "sessions")).any { it.tmpFiles().isNotEmpty() })

        // The operator records the voice note again after recovery:
        val voiceWriter = restarted.beginVoiceAsset("audio/mp4")
        voiceWriter.targetFile.writeBytes(CaptureRuntimeFixtures.payload(9))
        val voice = voiceWriter.close(measuredVoiceMetadata)
        assertEquals("a-0002", voice.assetId)
    }

    @Test
    fun `identical voice scripts produce byte-identical journals and manifests`() = runTest {
        fun script(rootDir: File): Pair<String, String> {
            val scriptClock = MutableTestClock(CaptureRuntimeFixtures.T0)
            val scriptIds = SequentialSessionIds()
            val controller = CaptureSessionController(
                File(rootDir, "sessions"),
                FileBackedLocalCaptureStore(File(rootDir, "store")),
                scriptClock,
                scriptIds,
            )
            kotlinx.coroutines.test.runTest {
                controller.start()
                controller.captureStill(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
                val writer = controller.beginVoiceAsset("audio/mp4")
                writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(2, size = 64_000))
                writer.close(measuredVoiceMetadata)
                controller.pause()
                controller.resume()
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

    @Test
    fun `the finalized session clears the active flow after a voice commit`() = runTest {
        val controller = newController()
        controller.start()
        val writer = controller.beginVoiceAsset("audio/mp4")
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(10))
        writer.close(measuredVoiceMetadata)
        controller.finalizeSession()
        assertNull(controller.activeSession.value)
    }
}
