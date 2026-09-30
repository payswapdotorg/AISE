package org.payswap.aise.app.ui.screen

import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.payswap.aise.app.capture.CaptureEnvironment
import org.payswap.aise.app.capture.CaptureRuntimeFixtures
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.FileBackedLocalCaptureStore
import org.payswap.aise.app.capture.MutableTestClock
import org.payswap.aise.app.capture.SequentialSessionIds
import org.payswap.aise.app.capture.VoiceSegmentFacts
import org.payswap.aise.core.capture.AcquisitionMetadataKeys
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * VOICE-003 — the voice lane's view-model bridge (the `CaptureViewModelTest`
 * discipline, new suite so the stills/video VM tests stay unmodified): the
 * voice callbacks forward to the controller, the honest metadata composition
 * is pinned (measured keys ride verbatim, unmeasured keys are ABSENT — never
 * zero, never "unknown"), the optional user-entered language hint rides only
 * when entered, and failures surface as messages — never crashes, never
 * silent no-ops.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CaptureVoiceViewModelTest {

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
            // Synchronous dispatcher: viewModelScope launches complete before
            // the assertions run — no race with real IO threads.
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
    fun `voice begin exposes the audio tmp target and finalize commits a VOICE_NOTE asset`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.beginVoiceAsset("audio/mp4")
        val target = viewModel.voiceTargetFile.value
        assertNotNull(target)
        assertTrue(target!!.name.endsWith(".m4a.tmp"), "the audio/mp4 container maps to a .m4a tmp: ${target.name}")

        // The "recorder" writes into the target file:
        target.writeBytes(CaptureRuntimeFixtures.payload(1, size = 24_000))
        viewModel.onVoiceFinalized(
            VoiceSegmentFacts(configuredCodec = "aac", durationMs = 18_400L, sampleRateHz = 48_000L, audioSource = "mic"),
        )

        assertNull(viewModel.voiceTargetFile.value)
        val session = viewModel.session.value!!
        assertEquals(1, session.assets.size)
        val asset = session.assets.first()
        assertEquals(AcquisitionMethod.VOICE_NOTE, asset.acquisitionMethod)
        assertEquals("audio/mp4", asset.mediaType)
        assertEquals(24_000L, asset.byteSize)
        assertTrue(viewModel.message.value!!.contains("a-0001"))
    }

    @Test
    fun `the honest metadata composition - measured keys ride, unmeasured keys are absent`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.beginVoiceAsset("audio/mp4")
        viewModel.voiceTargetFile.value!!.writeBytes(CaptureRuntimeFixtures.payload(2))
        // The platform could measure ONLY the codec (a configured fact):
        viewModel.onVoiceFinalized(
            VoiceSegmentFacts(configuredCodec = "aac", durationMs = null, sampleRateHz = null, audioSource = null),
        )

        val metadata = viewModel.session.value!!.assets.first().sensorMetadata
        assertEquals("voice", metadata[AcquisitionMetadataKeys.CAPTURE_KIND]) // the lane fact
        assertEquals("aac", metadata[AcquisitionMetadataKeys.VOICE_CODEC]) // the configured encoder
        // Absence renders as absence — never zero, never "unknown", never fabricated:
        assertFalse(metadata.containsKey(AcquisitionMetadataKeys.VOICE_DURATION_MS), "unmeasured duration must be absent")
        assertFalse(metadata.containsKey(AcquisitionMetadataKeys.VOICE_SAMPLE_RATE_HZ), "unmeasured rate must be absent")
        assertFalse(metadata.containsKey(AcquisitionMetadataKeys.SENSOR_ID), "no audio source means the key is absent")
        assertFalse(metadata.containsKey(AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT), "no hint entered → absent")
        assertFalse(metadata.values.any { it == "0" || it.equals("unknown", ignoreCase = true) })
    }

    @Test
    fun `measured duration and sample rate ride as string-encoded integers`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.beginVoiceAsset("audio/mp4")
        viewModel.voiceTargetFile.value!!.writeBytes(CaptureRuntimeFixtures.payload(3))
        viewModel.onVoiceFinalized(
            VoiceSegmentFacts(configuredCodec = "aac", durationMs = 18_400L, sampleRateHz = 48_000L, audioSource = "mic"),
        )

        val metadata = viewModel.session.value!!.assets.first().sensorMetadata
        assertEquals("18400", metadata[AcquisitionMetadataKeys.VOICE_DURATION_MS])
        assertEquals("48000", metadata[AcquisitionMetadataKeys.VOICE_SAMPLE_RATE_HZ])
        assertEquals("mic", metadata[AcquisitionMetadataKeys.SENSOR_ID])
    }

    @Test
    fun `the optional language hint rides only when entered`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        // Entered advisory rides verbatim (trimmed):
        viewModel.setVoiceLanguageHint("  de-CH  ")
        viewModel.beginVoiceAsset("audio/mp4")
        viewModel.voiceTargetFile.value!!.writeBytes(CaptureRuntimeFixtures.payload(4))
        viewModel.onVoiceFinalized(VoiceSegmentFacts("aac", 1_000L, 44_100L, "mic"))
        assertEquals("de-CH", viewModel.session.value!!.assets.first().sensorMetadata[AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT])

        // A blank hint is the honest absence (the default):
        viewModel.setVoiceLanguageHint("   ")
        viewModel.beginVoiceAsset("audio/mp4")
        viewModel.voiceTargetFile.value!!.writeBytes(CaptureRuntimeFixtures.payload(5))
        viewModel.onVoiceFinalized(VoiceSegmentFacts("aac", 1_000L, 44_100L, "mic"))
        val second = viewModel.session.value!!.assets[1]
        assertFalse(second.sensorMetadata.containsKey(AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT))
    }

    @Test
    fun `a failed voice segment discards cleanly with no journal trace`() = runTest {
        val viewModel = newViewModel()
        viewModel.startSession()

        viewModel.beginVoiceAsset("audio/mp4")
        viewModel.onVoiceFailed()

        assertNull(viewModel.voiceTargetFile.value)
        assertEquals(0, viewModel.session.value!!.assets.size)
        assertNotNull(viewModel.message.value)
        assertTrue(viewModel.message.value!!.contains("discarded"))
    }

    @Test
    fun `illegal voice operations surface as messages, never crashes`() = runTest {
        val viewModel = newViewModel()
        // beginVoiceAsset with NO session:
        viewModel.beginVoiceAsset("audio/mp4")
        assertNotNull(viewModel.message.value)
        assertTrue(viewModel.message.value!!.contains("Could not begin voice note"))

        // A non-audio media type is refused by the controller and surfaces:
        viewModel.consumeMessage()
        viewModel.startSession()
        viewModel.beginVoiceAsset("image/jpeg")
        assertTrue(viewModel.message.value!!.contains("Could not begin voice note"))
        assertEquals(CaptureSessionStatus.CAPTURING, viewModel.session.value!!.status) // session unharmed
    }
}
