package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * CALIBRATION domain adapter — calibration data availability from
 * [CalibrationFacts]. Facts only: this adapter records WHAT calibration data
 * the platform can provide; whether that calibration is GOOD ENOUGH for a
 * task is an assurance judgement owned by AISE-022, never emitted here.
 *
 * Classification:
 *  - UNKNOWN — intrinsics availability not probed.
 *  - UNAVAILABLE — no camera-intrinsics source on the device (on-device
 *    calibration data absent).
 *  - DEGRADED — intrinsics available but camera/IMU timestamps run on
 *    independent clocks (cross-sensor sync error risk), or the platform
 *    recommends recalibration (stale calibration).
 *  - SUPPORTED — intrinsics available with no material limitation recorded.
 */
object CalibrationCapabilityAdapter {

    fun evaluate(facts: CalibrationFacts): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()
        details["calibration.intrinsics"] = when (facts.cameraIntrinsicsAvailable) {
            true -> "available"
            false -> "unavailable"
            null -> "not-probed"
        }
        details["calibration.timestamp_alignment"] = facts.timestampAlignment?.wireName ?: "not-probed"
        details["calibration.recalibration_recommended"] = flagFact(facts.recalibrationRecommended)

        val limitations = mutableListOf<String>()
        val status: CapabilityDomainStatus = when {
            facts.cameraIntrinsicsAvailable == null -> {
                limitations += "camera intrinsics availability not probed — calibration capability undetermined"
                CapabilityDomainStatus.UNKNOWN
            }

            !facts.cameraIntrinsicsAvailable -> {
                limitations += "no camera intrinsics source on this device — on-device calibration data absent"
                CapabilityDomainStatus.UNAVAILABLE
            }

            else -> {
                if (facts.timestampAlignment == TimestampSourceAlignment.INDEPENDENT) {
                    limitations +=
                        "camera and IMU timestamps use independent clocks — cross-sensor synchronization error risk"
                }
                if (facts.recalibrationRecommended == true) {
                    limitations += "recalibration recommended — existing calibration is stale"
                }
                if (limitations.isEmpty()) CapabilityDomainStatus.SUPPORTED else CapabilityDomainStatus.DEGRADED
            }
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
