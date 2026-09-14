package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * COMPUTE domain adapter — on-device processing resources from [ComputeFacts].
 *
 * Classification:
 *  - UNKNOWN — neither of the core resource facts (RAM, sustained-performance
 *    support) was probed. Peripheral facts alone (SoC label, NPU, performance
 *    class) cannot decide resource adequacy.
 *  - UNAVAILABLE — total RAM is critically below [CRITICAL_RAM_MB] (the
 *    capture pipeline cannot be sustained at all).
 *  - DEGRADED — RAM below [MIN_SUSTAINED_RAM_MB] (the floor for sustained
 *    AR/depth processing), or sustained-performance mode unsupported
 *    (extended capture sessions are expected to throttle).
 *  - SUPPORTED — core resource facts probed and no material limitation.
 *
 * NPU/accelerator absence and the SoC label are advisory facts surfaced in
 * `details` (CPU-only inference still works; the planner decides what to do
 * with that).
 */
object ComputeCapabilityAdapter {

    /** Below this total RAM (MB) compute is critically insufficient — UNAVAILABLE. */
    const val CRITICAL_RAM_MB: Int = 1024

    /** Below this total RAM (MB) sustained AR/depth processing is materially limited — DEGRADED. */
    const val MIN_SUSTAINED_RAM_MB: Int = 3072

    fun evaluate(facts: ComputeFacts): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()
        details["compute.ram_total_mb"] = numberFact(facts.ramTotalMb)
        details["compute.soc"] = facts.socLabel ?: "not-probed"
        details["compute.performance_class"] = numberFact(facts.mediaPerformanceClass)
        details["compute.npu"] = flagFact(facts.npuAcceleratorAvailable)
        details["compute.sustained_performance"] = flagFact(facts.sustainedPerformanceModeSupported)

        val limitations = mutableListOf<String>()
        val status: CapabilityDomainStatus

        val coreResourcesProbed = facts.ramTotalMb != null || facts.sustainedPerformanceModeSupported != null
        if (!coreResourcesProbed) {
            limitations +=
                "compute resources not probed (RAM and sustained-performance mode unknown) — " +
                    "compute capability undetermined"
            status = CapabilityDomainStatus.UNKNOWN
        } else if (facts.ramTotalMb != null && facts.ramTotalMb < CRITICAL_RAM_MB) {
            limitations +=
                "total RAM ${facts.ramTotalMb} MB is critically insufficient for on-device capture processing"
            status = CapabilityDomainStatus.UNAVAILABLE
        } else {
            if (facts.ramTotalMb != null && facts.ramTotalMb < MIN_SUSTAINED_RAM_MB) {
                limitations +=
                    "total RAM ${facts.ramTotalMb} MB is below the $MIN_SUSTAINED_RAM_MB MB floor " +
                        "for sustained AR/depth processing"
            }
            if (facts.sustainedPerformanceModeSupported == false) {
                limitations +=
                    "sustained-performance mode unsupported — extended capture sessions are expected to throttle"
            }
            status =
                if (limitations.isEmpty()) CapabilityDomainStatus.SUPPORTED else CapabilityDomainStatus.DEGRADED
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
