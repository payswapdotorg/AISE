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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.payswap.aise.app.capture.CaptureRuntimeFixtures
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.FileBackedLocalCaptureStore
import org.payswap.aise.app.capture.MutableTestClock
import org.payswap.aise.app.capture.SequentialSessionIds
import org.payswap.aise.app.field.DerivationView
import org.payswap.aise.app.field.EvidenceReadAnswer
import org.payswap.aise.app.field.EvidenceReadClient
import org.payswap.aise.app.field.ProvenanceLinkView
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore

/**
 * VOICE-003 — the transcript panel's view model (the `CaptureViewModelTest`
 * discipline): the panel state is a pure function of (the last finalized
 * manifest, the read seam's answers). BOTH transcript render paths are
 * pinned with a scripted read client — the no-provider path (this
 * deployment's live state: the explicit `asr_provider_not_configured`
 * informational state, never an error) and the provider-configured path
 * (the DERIVED CANDIDATE outcome + its DERIVED_FROM provenance link) —
 * plus the honest refusals (nothing finalized, no voice notes, read
 * refused with its reason).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VoiceNoteTranscriptViewModelTest {

    @TempDir(cleanup = CleanupMode.ALWAYS)
    lateinit var root: File

    private val clock = MutableTestClock(CaptureRuntimeFixtures.T0)
    private val ids = SequentialSessionIds()

    /** The scripted read seam: per-content-id answers, faked in pure JVM. */
    private class ScriptedReadClient : EvidenceReadClient {
        val answers = mutableMapOf<String, EvidenceReadAnswer>()
        override fun readEvidenceView(contentId: String): EvidenceReadAnswer =
            answers[contentId] ?: EvidenceReadAnswer.Refused("not scripted")
    }

    /** Builds the VM over a REAL finalized session (voice notes or a still) + the scripted read seam. */
    private fun newViewModelWithSession(voiceNotes: Int): Triple<VoiceNoteTranscriptViewModel, List<String>, ScriptedReadClient> {
        val controller = CaptureSessionController(
            sessionsRoot = File(root, "sessions"),
            store = FileBackedLocalCaptureStore(File(root, "store")),
            clock = clock,
            sessionIds = ids,
            ioDispatcher = UnconfinedTestDispatcher(),
        )
        val readClient = ScriptedReadClient()
        val viewModel = VoiceNoteTranscriptViewModel(readClient, controller)
        val voiceIds = kotlinx.coroutines.runBlocking {
            controller.startSession(
                deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
                capabilitySnapshot = CaptureRuntimeFixtures.capabilitySnapshot(clock.millis()),
            )
            val idsCaptured = (1..voiceNotes).map { n ->
                val writer = controller.beginVoiceAsset("audio/mp4")
                writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(n, size = 2_048))
                val asset = writer.close(mapOf("capture.kind" to "voice", "voice.codec" to "aac"))
                readClient.answers[asset.contentId.value] = EvidenceReadAnswer.Read(emptyList(), emptyList())
                asset.contentId.value
            }
            if (voiceNotes == 0) {
                // A session with ONLY a still: the no-voice-notes state.
                controller.captureStill(CaptureRuntimeFixtures.payload(99), mapOf("capture.kind" to "still"))
            }
            controller.finalizeSession()
            idsCaptured
        }
        return Triple(viewModel, voiceIds, readClient)
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
    fun `with no finalized session the panel answers no-finalized-session - an honest answer, not an error`() = runTest {
        val controller = CaptureSessionController(
            sessionsRoot = File(root, "sessions"),
            store = InMemoryLocalCaptureStore(),
            clock = MutableTestClock(),
            sessionIds = SequentialSessionIds(),
            ioDispatcher = UnconfinedTestDispatcher(),
        )
        val viewModel = VoiceNoteTranscriptViewModel(ScriptedReadClient(), controller)
        assertEquals(VoiceNoteTranscriptViewModel.PanelState.Idle, viewModel.panel.value)

        viewModel.checkTranscriptState()
        assertEquals(VoiceNoteTranscriptViewModel.PanelState.NoFinalizedSession, viewModel.panel.value)
    }

    @Test
    fun `a finalized session without voice notes answers no-voice-notes`() = runTest {
        val (viewModel, _, _) = newViewModelWithSession(voiceNotes = 0)
        viewModel.checkTranscriptState()
        assertEquals(VoiceNoteTranscriptViewModel.PanelState.NoVoiceNotes, viewModel.panel.value)
    }

    @Test
    fun `an empty derivations set renders the explicit asr_provider_not_configured informational state`() = runTest {
        // The no-provider path — this deployment's live state: the voice
        // note registered/synced fine, and the transcript state is the calm
        // explicit informational state (never an error, never fabricated).
        val (viewModel, voiceIds, _) = newViewModelWithSession(voiceNotes = 2)
        viewModel.checkTranscriptState()

        val panel = viewModel.panel.value
        assertTrue(panel is VoiceNoteTranscriptViewModel.PanelState.Checked, "got $panel")
        val notes = (panel as VoiceNoteTranscriptViewModel.PanelState.Checked).notes
        assertEquals(voiceIds.size, notes.size)
        notes.forEachIndexed { index, note ->
            assertTrue(note is VoiceNoteTranscriptViewModel.NoteState.NoTranscript, "note $index: $note")
            assertEquals(voiceIds[index], (note as VoiceNoteTranscriptViewModel.NoteState.NoTranscript).contentId)
            assertEquals("asr_provider_not_configured", note.reason)
        }
    }

    @Test
    fun `a transcription asr derivation renders the derived candidate with its provenance link`() = runTest {
        // The provider-configured path: the read view carries a
        // transcription.asr derivation + its DERIVED_FROM link; the panel
        // renders the DERIVED CANDIDATE (method, version, transcript
        // artifact address) with the provenance link — never authoritative text.
        val (viewModel, voiceIds, readClient) = newViewModelWithSession(voiceNotes = 1)
        val voiceId = voiceIds.first()
        val transcriptId = "8f2d81a3b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e"
        val derivation = DerivationView(
            derivationId = "transcription.asr:demo-asr:1.0.0:$voiceId",
            outputContentId = transcriptId,
            method = "transcription.asr",
            methodVersion = "demo-asr-1.0.0",
            inputEvidenceContentIds = listOf(voiceId),
            createdAt = "2026-01-15T09:42:11.000Z",
        )
        val link = ProvenanceLinkView(
            subjectKind = "evidence",
            subjectId = transcriptId,
            evidenceContentId = voiceId,
            role = "DERIVED_FROM",
        )
        readClient.answers[voiceId] = EvidenceReadAnswer.Read(listOf(derivation), listOf(link))

        viewModel.checkTranscriptState()
        val panel = viewModel.panel.value
        assertTrue(panel is VoiceNoteTranscriptViewModel.PanelState.Checked, "got $panel")
        val note = (panel as VoiceNoteTranscriptViewModel.PanelState.Checked).notes.single()
        assertTrue(note is VoiceNoteTranscriptViewModel.NoteState.DerivedCandidate, "got $note")
        val candidate = note as VoiceNoteTranscriptViewModel.NoteState.DerivedCandidate
        assertEquals(voiceId, candidate.contentId)
        assertEquals("transcription.asr", candidate.method)
        assertEquals("demo-asr-1.0.0", candidate.methodVersion)
        assertEquals(transcriptId, candidate.outputContentId)
        assertEquals(link, candidate.derivedFromLink)
        assertEquals(0, candidate.additionalCandidateCount)
    }

    @Test
    fun `a refused read renders the honest reason - never a guessed state, never an error`() = runTest {
        val (viewModel, voiceIds, readClient) = newViewModelWithSession(voiceNotes = 1)
        readClient.answers[voiceIds.first()] =
            EvidenceReadAnswer.Refused("evidence ${voiceIds.first().take(8)}… is not registered server-side — submit the capture session first")

        viewModel.checkTranscriptState()
        val panel = viewModel.panel.value
        assertTrue(panel is VoiceNoteTranscriptViewModel.PanelState.Checked)
        val note = (panel as VoiceNoteTranscriptViewModel.PanelState.Checked).notes.single()
        assertTrue(note is VoiceNoteTranscriptViewModel.NoteState.ReadRefused, "got $note")
        assertTrue((note as VoiceNoteTranscriptViewModel.NoteState.ReadRefused).reason.contains("not registered"))
    }
}
