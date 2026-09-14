package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * TRACKING domain adapter — visual pose-tracking capability from
 * [TrackingFacts], cross-checked against the rear-camera inventory.
 *
 * Classification:
 *  - UNAVAILABLE — the runtime definitively reports an unsupported device; OR
 *    the device definitively has no rear camera (visual pose tracking is
 *    impossible without one, regardless of what the runtime claims).
 *  - DEGRADED — the runtime is installed but stale
 *    ([PoseTrackingAvailability.INSTALLED_NEEDS_UPDATE]) or supported but not
 *    yet installed ([PoseTrackingAvailability.SUPPORTED_DEVICE]): the device
 *    CAN track, but is not usable right now until the operator updates or
 *    installs — a recoverable, material limitation, not absence and not
 *    ignorance.
 *  - UNKNOWN — availability not probed (`null`) or the runtime's own transient
 *    [PoseTrackingAvailability.UNKNOWN] answer.
 *  - SUPPORTED — runtime installed and a rear camera is present (or the
 *    camera inventory is unknown, in which case the installed runtime's own
 *    device support check is the authority).
 *
 * `supportsDepthTracking` is a planner-consumable FACT surfaced in `details`;
 * it does not change pose status (depth as an evidence source is the DEPTH
 * domain's concern).
 */
object TrackingCapabilityAdapter {

    fun evaluate(facts: TrackingFacts, rearCameraPresent: Boolean?): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()
        details["tracking.arcore"] = facts.poseTracking?.wireName ?: "not-probed"
        details["tracking.depth"] = flagFact(facts.supportsDepthTracking)
        details["tracking.rear_camera"] = presenceFact(rearCameraPresent)

        val limitations = mutableListOf<String>()
        val status: CapabilityDomainStatus

        if (rearCameraPresent == false) {
            // Definitive hardware absence beats any runtime claim (contradictory facts stay visible in details).
            limitations += "no rear camera on this device — visual pose tracking impossible"
            status = CapabilityDomainStatus.UNAVAILABLE
        } else {
            when (facts.poseTracking) {
                null, PoseTrackingAvailability.UNKNOWN -> {
                    limitations += "pose-tracking availability not determined — tracking capability undetermined"
                    status = CapabilityDomainStatus.UNKNOWN
                }

                PoseTrackingAvailability.INSTALLED ->
                    status = CapabilityDomainStatus.SUPPORTED

                PoseTrackingAvailability.INSTALLED_NEEDS_UPDATE -> {
                    limitations +=
                        "pose-tracking runtime installed but out of date — update required before tracking is usable"
                    status = CapabilityDomainStatus.DEGRADED
                }

                PoseTrackingAvailability.SUPPORTED_DEVICE -> {
                    limitations +=
                        "device is supported but the pose-tracking runtime is not installed — " +
                            "installation required before tracking is usable"
                    status = CapabilityDomainStatus.DEGRADED
                }

                PoseTrackingAvailability.UNSUPPORTED_DEVICE -> {
                    limitations +=
                        "pose-tracking runtime reports an unsupported device — no visual pose tracking on this device"
                    status = CapabilityDomainStatus.UNAVAILABLE
                }
            }
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
