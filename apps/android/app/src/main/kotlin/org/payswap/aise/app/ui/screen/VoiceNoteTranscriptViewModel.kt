package org.payswap.aise.app.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.field.EvidenceReadAnswer
import org.payswap.aise.app.field.EvidenceReadClient
import org.payswap.aise.app.field.ProvenanceLinkView
import org.payswap.aise.app.field.VoiceNoteTranscriptState
import org.payswap.aise.app.field.VoiceNoteTranscripts
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/**
 * VOICE-003 — the voice-note transcript panel's view model: derives the
 * CLIENT-ONLY transcript state of the last finalized session's voice notes
 * from the evidence read view ([EvidenceReadClient] — `GET
 * /v1/evidence/:contentId`) and renders BOTH honest states:
 *
 *  - no `transcription.asr` derivation in the read view → the explicit
 *    calm informational state `asr_provider_not_configured` (this
 *    deployment's live state — never an error, never a fabricated
 *    transcript);
 *  - a derivation present → the DERIVED CANDIDATE rendering with its
 *    method identity, method version, transcript artifact content address
 *    and its `DERIVED_FROM` provenance link (never authoritative text).
 *
 * Like [CaptureViewModel] it is a JVM-pure bridge holding no truth of its
 * own: the panel state is a pure function of (the last finalized manifest,
 * the read seam's answers). Read refusals render honestly (a refused note
 * names its reason) — never a crash, never a guessed state.
 */
class VoiceNoteTranscriptViewModel(
    private val evidenceRead: EvidenceReadClient,
    private val captureController: CaptureSessionController,
) : ViewModel() {

    /** What the panel renders. */
    sealed interface PanelState {

        /** Not checked yet (the operator has not asked). */
        data object Idle : PanelState

        /** No finalized session exists — nothing to check (an honest answer, not an error). */
        data object NoFinalizedSession : PanelState

        /** The last finalized session has no voice notes — nothing to check. */
        data object NoVoiceNotes : PanelState

        /** The per-voice-note render states of the last check. */
        data class Checked(val notes: List<NoteState>) : PanelState
    }

    /** One voice note's transcript render state. */
    sealed interface NoteState {

        /** The calm no-transcript informational state (reason: the contract's own vocabulary). */
        data class NoTranscript(val contentId: String, val reason: String) : NoteState

        /** The transcript DERIVED CANDIDATE + its DERIVED_FROM provenance link. */
        data class DerivedCandidate(
            val contentId: String,
            val method: String,
            val methodVersion: String,
            val outputContentId: String,
            val derivedFromLink: ProvenanceLinkView?,
            val additionalCandidateCount: Int,
        ) : NoteState

        /** The read was refused — the honest reason renders verbatim (never a guessed state). */
        data class ReadRefused(val contentId: String, val reason: String) : NoteState
    }

    private val _panel = MutableStateFlow<PanelState>(PanelState.Idle)
    val panel: StateFlow<PanelState> = _panel.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    /** Re-derives the transcript states of the last finalized session's voice notes. */
    fun checkTranscriptState() = guarded("check voice-note transcript state") {
        val manifestText = captureController.lastFinalizedManifestText()
        if (manifestText == null) {
            _panel.value = PanelState.NoFinalizedSession
            return@guarded
        }
        val voiceContentIds = voiceNoteContentIds(manifestText)
        if (voiceContentIds.isEmpty()) {
            _panel.value = PanelState.NoVoiceNotes
            return@guarded
        }
        _panel.value = PanelState.Checked(voiceContentIds.map(::noteState))
        _message.value = null
    }

    fun consumeMessage() {
        _message.value = null
    }

    /** Maps one voice note's read answer to its render state (both paths honest). */
    internal fun noteState(contentId: String): NoteState = when (
        val answer = evidenceRead.readEvidenceView(contentId)
    ) {
        is EvidenceReadAnswer.Refused -> NoteState.ReadRefused(contentId, answer.reason)
        is EvidenceReadAnswer.Read -> when (
            val state = VoiceNoteTranscripts.state(answer.inputsOf, answer.linksAsObject)
        ) {
            is VoiceNoteTranscriptState.NoTranscript -> NoteState.NoTranscript(contentId, state.reason)
            is VoiceNoteTranscriptState.TranscriptAvailable -> NoteState.DerivedCandidate(
                contentId = contentId,
                method = state.derivation.method,
                methodVersion = state.derivation.methodVersion,
                outputContentId = state.derivation.outputContentId,
                derivedFromLink = state.derivedFromLink,
                additionalCandidateCount = state.additionalCandidateCount,
            )
        }
    }

    /** The voice-note content ids of a finalized manifest, in manifest order (pure parse). */
    internal fun voiceNoteContentIds(manifestText: String): List<String> = runCatching {
        val root = JsonParser.parse(manifestText) as? JsonValue.JsonObject ?: return emptyList()
        val assets = root.members["assets"] as? JsonValue.JsonArray ?: return emptyList()
        assets.items.mapNotNull { value ->
            val asset = value as? JsonValue.JsonObject ?: return@mapNotNull null
            val method = (asset.members["acquisitionMethod"] as? JsonValue.JsonString)?.value
            val contentId = (asset.members["contentId"] as? JsonValue.JsonString)?.value
            if (method == "VOICE_NOTE" && contentId != null) contentId else null
        }
    }.getOrDefault(emptyList())

    companion object {
        fun factory(
            evidenceRead: EvidenceReadClient,
            captureController: CaptureSessionController,
        ) = viewModelFactory {
            initializer { VoiceNoteTranscriptViewModel(evidenceRead, captureController) }
        }
    }

    // ------------------------------------------------------------------

    private fun guarded(label: String, block: suspend () -> Unit) {
        if (_busy.value) return // single-flight: one read pass at a time
        _busy.value = true
        viewModelScope.launch {
            try {
                block()
            } catch (t: Throwable) {
                if (t is kotlinx.coroutines.CancellationException) throw t
                _message.value = "Could not $label: ${t.message}"
            } finally {
                _busy.value = false
            }
        }
    }
}
