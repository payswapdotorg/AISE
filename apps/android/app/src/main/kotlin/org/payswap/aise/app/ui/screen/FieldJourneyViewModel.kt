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
import org.payswap.aise.app.field.FieldJourneyRuntime
import org.payswap.aise.core.adapter.FieldJourneyPhase
import org.payswap.aise.core.adapter.FieldTaskHandoffValue

/**
 * Field-journey view model (PROD-019) — the JVM-pure bridge between the
 * Compose mission panel and the [FieldJourneyRuntime]. Like
 * [CaptureViewModel] it holds NO truth of its own: [phase] IS the runtime's
 * derived journey state; [busy]/[message] are UI plumbing only. Illegal
 * operations surface as messages, never as silent no-ops.
 */
class FieldJourneyViewModel(
    private val runtime: FieldJourneyRuntime,
    private val captureController: CaptureSessionController,
    handedOffTask: StateFlow<FieldTaskHandoffValue?>? = null,
) : ViewModel() {

    val phase: StateFlow<FieldJourneyPhase> get() = runtime.phase

    /** The active handed-off task, when one was offered (POST-005). */
    val handedOffTask: StateFlow<FieldTaskHandoffValue?> = handedOffTask
        ?: MutableStateFlow(null).asStateFlow()

    init {
        // POST-005: a web-originated aise://task handoff continues HERE —
        // when one is active and no journey is running, the journey starts
        // from the handed-off task identity (same runtime, same assessment;
        // identity continues, authority never does).
        if (handedOffTask != null) {
            viewModelScope.launch {
                handedOffTask.collect { handoff ->
                    if (handoff != null && runtime.phase.value is FieldJourneyPhase.Idle) {
                        startHandedOffJourney(handoff)
                    }
                }
            }
        }
    }

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    /** Starts the field journey (intent → assessment → adaptive mission). */
    fun startJourney() = guarded("start field journey") {
        runtime.startJourney()
    }

    /**
     * POST-005: continue the HANDED-OFF task (from an aise://task deep
     * link) — the journey starts from the handoff's TaskIntent identity
     * (task id, project, targets, provenance in the parameter map).
     */
    fun startHandedOffJourney(handoff: FieldTaskHandoffValue) = guarded("continue handed-off task") {
        runtime.startJourney(handoff.taskIntentValue())
    }

    /**
     * Submits the finalized session's evidence through the seam — in this
     * build the seam reports network-unavailable explicitly and the evidence
     * stays in the resumable offline store.
     */
    fun submitEvidence() = guarded("submit evidence") {
        val manifest = captureController.lastFinalizedManifestText()
            ?: error("no finalized session to submit — finalize the capture session first")
        runtime.submitFinalized(manifest)
        when (val phase = runtime.phase.value) {
            is FieldJourneyPhase.DeferredOffline ->
                _message.value = "Offline — submission deferred: ${phase.submission.reason}"

            is FieldJourneyPhase.Submitted -> {
                captureController.markLatestFinalizedSynced()
                _message.value = "Submitted — server ref ${phase.submission.serverRef}; local session marked synced"
            }

            is FieldJourneyPhase.SubmissionFailed ->
                _message.value = "Submission rejected: ${phase.submission.reason}"

            else -> Unit
        }
    }

    /** Re-attempts a deferred submission (resumable synchronization). */
    fun resumeSubmission() = guarded("resume submission") {
        val manifest = captureController.lastFinalizedManifestText()
            ?: error("no finalized session to submit — finalize the capture session first")
        runtime.resumeSubmission(manifest)
        when (val phase = runtime.phase.value) {
            is FieldJourneyPhase.DeferredOffline ->
                _message.value = "Still offline — attempt ${phase.submission.attempts}: ${phase.submission.reason}"

            is FieldJourneyPhase.Submitted ->
                _message.value = "Submitted — server ref ${phase.submission.serverRef}"

            is FieldJourneyPhase.SubmissionFailed ->
                _message.value = "Submission rejected: ${phase.submission.reason}"

            else -> Unit
        }
    }

    fun resetJourney() = guarded("reset journey") {
        runtime.reset()
    }

    fun consumeMessage() {
        _message.value = null
    }

    companion object {
        fun factory(
            runtime: FieldJourneyRuntime,
            captureController: CaptureSessionController,
            handedOffTask: StateFlow<FieldTaskHandoffValue?>? = null,
        ) = viewModelFactory {
            initializer { FieldJourneyViewModel(runtime, captureController, handedOffTask) }
        }
    }

    // ------------------------------------------------------------------

    private fun guarded(label: String, block: suspend () -> Unit) {
        if (_busy.value) return // single-flight: one journey op at a time
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
