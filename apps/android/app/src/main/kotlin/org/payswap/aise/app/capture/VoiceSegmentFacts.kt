package org.payswap.aise.app.capture

/**
 * What the microphone recorder adapter HONESTLY knows about one finished
 * voice segment (VOICE-003). JVM-pure (no android.*) so the metadata
 * composition over it is unit-testable exactly like the rest of the
 * capture runtime.
 *
 * Honesty contract (the work order's metadata discipline):
 *
 *  - [configuredCodec] is the encoder the recorder was CONFIGURED to
 *    produce (`aac`, `amr-nb`, `opus`, …) — a configuration FACT stated by
 *    the adapter that set it. This is the contract's
 *    device-that-knows-its-encoder case, STRONGER than the web lane's
 *    browser-observed container subtype: Android's recorder configures its
 *    encoder explicitly, so it never guesses behind a container.
 *  - [durationMs] and [sampleRateHz] are MEASURED over the closed file
 *    (MediaMetadataRetriever / MediaExtractor) — `null` when the platform
 *    could not measure them. Absence renders as absence downstream: the
 *    key is simply not asserted, never zero, never "unknown", never
 *    fabricated.
 *  - [audioSource] names the audio source the adapter used (e.g. `mic`) —
 *    `null` when not meaningful.
 */
data class VoiceSegmentFacts(
    /** The recorder's ACTUAL configured encoder (`aac`, `amr-nb`, `opus`, …) — a fact, never a guess. */
    val configuredCodec: String,
    /** Measured recording duration in milliseconds — null when the platform could not measure it. */
    val durationMs: Long?,
    /** Measured audio sample rate in hertz — null when the platform could not measure it. */
    val sampleRateHz: Long?,
    /** The audio source the adapter used (e.g. `mic`) — null when not meaningful. */
    val audioSource: String?,
)
