package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * CAMERA domain adapter — rear-camera capability from [CameraFacts].
 *
 * Classification (facts → status):
 *  - UNKNOWN — the rear-lens inventory was not probed (`rearLenses == null`).
 *  - UNAVAILABLE — the platform DEFINITIVELY reports no rear camera
 *    (`rearLenses == emptyList()`). Absence of facts never lands here.
 *  - DEGRADED — at least one rear camera exists but is materially limited:
 *    max resolution below [MIN_EVIDENCE_MEGAPIXELS], or every lens is
 *    definitively fixed-focus, or video recording is definitively unavailable.
 *  - SUPPORTED — at least one rear camera with no material limitation.
 *
 * Facts that are known but NOT status-driving (RAW support, flash) are still
 * surfaced in `details` — the planner consumes them; absence of RAW alone does
 * not make a camera unusable for evidence.
 */
object CameraCapabilityAdapter {

    /** Below this max rear resolution the camera is materially limited for evidence-grade stills. */
    const val MIN_EVIDENCE_MEGAPIXELS: Double = 8.0

    fun evaluate(facts: CameraFacts): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()
        val limitations = mutableListOf<String>()
        val status: CapabilityDomainStatus

        val lenses = facts.rearLenses
        when {
            lenses == null -> {
                details["camera.rear.count"] = "not-probed"
                status = CapabilityDomainStatus.UNKNOWN
                limitations += "rear camera inventory not probed — camera capability undetermined"
            }

            lenses.isEmpty() -> {
                details["camera.rear.count"] = "0"
                status = CapabilityDomainStatus.UNAVAILABLE
                limitations += "no rear camera on this device — still/video evidence acquisition impossible"
            }

            else -> {
                details["camera.rear.count"] = lenses.size.toString()
                details["camera.rear.lenses"] = lenses.joinToString(",") { it.label ?: "unnamed" }
                val maxMegapixels = lenses.mapNotNull { it.megapixels }.maxOrNull()
                details["camera.rear.max_megapixels"] = decimalFact(maxMegapixels)

                val autofocusModes = lenses.flatMap { lens -> lens.autofocus.orEmpty() }
                val autofocusFullyKnown = lenses.all { it.autofocus != null }
                details["camera.autofocus"] = when {
                    autofocusFullyKnown && autofocusModes.isEmpty() -> "none"
                    autofocusModes.isNotEmpty() ->
                        autofocusModes.distinct().joinToString(",") { it.wireName }

                    else -> "not-probed"
                }

                details["camera.raw"] = flagFact(facts.rawCaptureSupported)
                details["camera.video.modes"] = when {
                    facts.videoModes == null -> "not-probed"
                    facts.videoModes.isEmpty() -> "none"
                    else -> facts.videoModes.joinToString(",") { "${it.width}x${it.height}@${it.fps}" }
                }
                details["camera.flash"] = flagFact(facts.flashAvailable)

                if (maxMegapixels != null && maxMegapixels < MIN_EVIDENCE_MEGAPIXELS) {
                    limitations +=
                        "max rear resolution ${formatDecimalFact(maxMegapixels)} MP is below the " +
                            "${formatDecimalFact(MIN_EVIDENCE_MEGAPIXELS)} MP evidence floor"
                }
                if (autofocusFullyKnown && autofocusModes.isEmpty()) {
                    limitations += "rear camera is fixed-focus — close-range evidence sharpness materially limited"
                }
                if (facts.videoModes != null && facts.videoModes.isEmpty()) {
                    limitations += "no video recording modes reported — video footage acquisition unavailable"
                }
                status =
                    if (limitations.isEmpty()) CapabilityDomainStatus.SUPPORTED
                    else CapabilityDomainStatus.DEGRADED
            }
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
