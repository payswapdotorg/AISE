package org.payswap.aise.app.field

/**
 * VOICE-003 — the CLIENT-ONLY voice-note transcript state, derived from the
 * evidence read view's own sets (`GET /v1/evidence/:contentId` answers
 * `derivations.inputsOf` + `provenance.asObject` — pinned by VOICE-001's
 * conformance). NO backend transcript-state route exists and none is
 * added: the client derives the state from the read view, exactly like the
 * web lane (VOICE-002's `voiceNoteTranscriptState` semantics).
 *
 *  - NO `transcription.asr` entry in `inputsOf` → the explicit calm
 *    NO-TRANSCRIPT state with reason `asr_provider_not_configured` (the
 *    contract's own vocabulary — this deployment's actual state: the
 *    backend declares NO ASR provider in `OPTIONAL_PROVIDERS`). An
 *    informational state: never an error, never a fabricated transcript,
 *    never a silent skip.
 *  - a `transcription.asr` entry present (the future provider-configured
 *    path) → TRANSCRIPT_AVAILABLE carrying the derivation (method
 *    identity, methodVersion, outputContentId — the content address of the
 *    transcript artifact) and its evidence-to-evidence `DERIVED_FROM`
 *    provenance link: a DERIVED CANDIDATE, never authoritative text, never
 *    a rewrite of the raw evidence. When several ASR derivations exist
 *    (provider version bumps — the journal is append-only) the
 *    canonically-first is surfaced and the rest are counted.
 *
 * JVM-pure (no android.*): the derivation is a pure function of its
 * inputs — no clock, no randomness, no IO — so both states are pinned by
 * unit tests and the HTTP seam ([HttpEvidenceReadClient]) is tested
 * separately over the loopback HTTP discipline.
 */

/** The minimal view of one `Derivation` record the transcript state consumes. */
data class DerivationView(
    val derivationId: String,
    val outputContentId: String,
    val method: String,
    val methodVersion: String,
    val inputEvidenceContentIds: List<String>,
    val createdAt: String,
)

/** The minimal view of one evidence-to-evidence `ProvenanceLink` the state consumes. */
data class ProvenanceLinkView(
    val subjectKind: String,
    val subjectId: String,
    val evidenceContentId: String,
    val role: String,
)

/** The explicit transcript state of one registered voice note. */
sealed interface VoiceNoteTranscriptState {

    /** The explicit, calm no-transcript state ([reason] is the contract's own vocabulary). */
    data class NoTranscript(val reason: String) : VoiceNoteTranscriptState

    /**
     * A transcript DERIVED CANDIDATE: the derivation record verbatim plus
     * its `DERIVED_FROM` provenance link (when the read view holds one) —
     * never authoritative text, never a rewrite of the raw evidence.
     */
    data class TranscriptAvailable(
        val derivation: DerivationView,
        val derivedFromLink: ProvenanceLinkView?,
        val additionalCandidateCount: Int,
    ) : VoiceNoteTranscriptState
}

object VoiceNoteTranscripts {

    /**
     * The provider-neutral ASR transcription method identity — mirror of
     * the shared contract's `ASR_TRANSCRIPTION_METHOD` (the `method` value
     * of a `Derivation` that records a voice-note transcript). Cross-boundary
     * drift is a test failure: the TS-side wiring test asserts this Kotlin
     * constant equals the committed TypeScript export.
     */
    const val ASR_TRANSCRIPTION_METHOD: String = "transcription.asr"

    /**
     * The no-provider reason word — the contract's own vocabulary
     * (`backend/api/src/evidence/transcription.ts` answers this exact
     * reason when no ASR provider is configured, which is this deployment's
     * live state). Pinned by the TS-side wiring test against the committed
     * backend source.
     */
    const val REASON_ASR_PROVIDER_NOT_CONFIGURED: String = "asr_provider_not_configured"

    /** The evidence-to-evidence derived-from provenance role (contract `PROVENANCE_ROLES`). */
    const val PROVENANCE_ROLE_DERIVED_FROM: String = "DERIVED_FROM"

    /**
     * Derives the transcript state of one registered voice note from its
     * read view's derivations set (`derivations.inputsOf`) and the
     * evidence-to-evidence links pointing at it (`provenance.asObject`).
     * Non-ASR derivations never fabricate a transcript: only entries whose
     * `method` is exactly [ASR_TRANSCRIPTION_METHOD] count.
     */
    fun state(
        inputsOf: List<DerivationView>,
        linksToObject: List<ProvenanceLinkView>,
    ): VoiceNoteTranscriptState {
        val asrDerivations = inputsOf.filter { it.method == ASR_TRANSCRIPTION_METHOD }
        val primary = asrDerivations.firstOrNull()
            ?: return VoiceNoteTranscriptState.NoTranscript(REASON_ASR_PROVIDER_NOT_CONFIGURED)
        val derivedFromLink = linksToObject.firstOrNull {
            it.role == PROVENANCE_ROLE_DERIVED_FROM && it.subjectId == primary.outputContentId
        }
        return VoiceNoteTranscriptState.TranscriptAvailable(
            derivation = primary,
            derivedFromLink = derivedFromLink,
            additionalCandidateCount = asrDerivations.size - 1,
        )
    }
}
