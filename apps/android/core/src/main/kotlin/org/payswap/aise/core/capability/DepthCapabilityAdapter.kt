package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * DEPTH domain adapter — depth-sensing capability from [DepthFacts].
 *
 * Classification (best available mode wins, in precedence order):
 *  - LiDAR present → SUPPORTED (hardware metric ranging; only a known range
 *    below [MIN_USEFUL_RANGE_METERS] degrades it).
 *  - ToF sensor present → SUPPORTED unless the known max range is materially
 *    short.
 *  - Stereo pair only → DEGRADED (disparity depth loses metric accuracy with
 *    range and on untextured surfaces).
 *  - Depth-from-motion API only → DEGRADED (inferred scale, no hardware
 *    ranging; matches the committed AISE-003 capability fixture's semantics).
 *  - No mode known-present:
 *      * all four facts known-absent → UNAVAILABLE ("no depth hardware AND no
 *        depth API");
 *      * ANY decisive fact still null → UNKNOWN (unknown is never conflated
 *        with unavailable — frozen contract rule).
 */
object DepthCapabilityAdapter {

    /** Below this known max range (meters), hardware depth is materially short-range only. */
    const val MIN_USEFUL_RANGE_METERS: Double = 2.0

    fun evaluate(facts: DepthFacts): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()
        details["depth.lidar"] = flagFact(facts.lidar)
        details["depth.tof"] = numberFact(facts.tofSensorCount)
        details["depth.stereo"] = flagFact(facts.stereoCameraPair)
        details["depth.motion_api"] = flagFact(facts.depthFromMotionApi)
        details["depth.max_range_m"] = decimalFact(facts.maxRangeMeters)

        val limitations = mutableListOf<String>()
        val status: CapabilityDomainStatus

        fun shortRangeLimitation() =
            "max depth range ${decimalFact(facts.maxRangeMeters)} m is below the " +
                "${formatDecimalFact(MIN_USEFUL_RANGE_METERS)} m useful-range floor"

        when {
            facts.lidar == true -> {
                if (facts.maxRangeMeters != null && facts.maxRangeMeters < MIN_USEFUL_RANGE_METERS) {
                    limitations += shortRangeLimitation()
                    status = CapabilityDomainStatus.DEGRADED
                } else {
                    status = CapabilityDomainStatus.SUPPORTED
                }
            }

            (facts.tofSensorCount ?: 0) > 0 -> {
                if (facts.maxRangeMeters != null && facts.maxRangeMeters < MIN_USEFUL_RANGE_METERS) {
                    limitations += shortRangeLimitation()
                    status = CapabilityDomainStatus.DEGRADED
                } else {
                    status = CapabilityDomainStatus.SUPPORTED
                }
            }

            facts.stereoCameraPair == true -> {
                limitations +=
                    "depth from stereo disparity only — metric accuracy degrades with range and on untextured surfaces"
                status = CapabilityDomainStatus.DEGRADED
            }

            facts.depthFromMotionApi == true -> {
                limitations +=
                    "depth from motion API only — scale is inferred and drifts without hardware ranging"
                status = CapabilityDomainStatus.DEGRADED
            }

            else -> {
                val fullyProbed = facts.lidar != null && facts.tofSensorCount != null &&
                    facts.stereoCameraPair != null && facts.depthFromMotionApi != null
                if (fullyProbed) {
                    limitations +=
                        "no depth hardware and no depth API on this device — depth evidence acquisition impossible"
                    status = CapabilityDomainStatus.UNAVAILABLE
                } else {
                    val unknown = buildList {
                        if (facts.lidar == null) add("lidar")
                        if (facts.tofSensorCount == null) add("tof")
                        if (facts.stereoCameraPair == null) add("stereo")
                        if (facts.depthFromMotionApi == null) add("motion-api")
                    }
                    limitations +=
                        "depth capability not fully probed (${unknown.joinToString(", ")} unknown) — status undetermined"
                    status = CapabilityDomainStatus.UNKNOWN
                }
            }
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
