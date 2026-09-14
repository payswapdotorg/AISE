package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilitySnapshot

/**
 * Orchestrating factory for the AISE-006 device capability profile: a PURE
 * function from [DeviceFacts] (platform-collected, time injected by the
 * caller) to the session [CapabilitySnapshot] covering exactly the 8 contract
 * domains.
 *
 * The factory itself performs NO classification — each domain adapter owns
 * its facts → status rules. The only cross-domain derivation here is the
 * rear-camera presence signal handed to [TrackingCapabilityAdapter]
 * (visual pose tracking is impossible without a rear camera):
 * `null` when the camera inventory is not probed (honest unknown preserved).
 *
 * Deterministic by construction: same facts + same profileId + same capturedAt
 * → byte-identical wire JSON via [CapabilityProfileRenderer] (pinned by
 * tests). No clock, no randomness, no I/O — everything arrives as arguments.
 *
 * Engineering readiness is NOT computed here (AISE-022's authority): the
 * snapshot is structured facts per domain, never a score.
 */
object CapabilityProfileFactory {

    fun create(
        facts: DeviceFacts,
        profileId: String,
        capturedAtUtcMillis: Long,
    ): CapabilitySnapshot {
        val rearCameraPresent: Boolean? = facts.camera.rearLenses?.let { it.isNotEmpty() }

        val domains = LinkedHashMap<CapabilityDomainKind, CapabilityDomainDescriptor>()
        domains[CapabilityDomainKind.DEVICE] = DeviceCapabilityAdapter.evaluate(facts.deviceIdentity)
        domains[CapabilityDomainKind.CAMERA] = CameraCapabilityAdapter.evaluate(facts.camera)
        domains[CapabilityDomainKind.DEPTH] = DepthCapabilityAdapter.evaluate(facts.depth)
        domains[CapabilityDomainKind.IMU] = ImuCapabilityAdapter.evaluate(facts.imu)
        domains[CapabilityDomainKind.TRACKING] = TrackingCapabilityAdapter.evaluate(facts.tracking, rearCameraPresent)
        domains[CapabilityDomainKind.COMPUTE] = ComputeCapabilityAdapter.evaluate(facts.compute)
        domains[CapabilityDomainKind.CALIBRATION] = CalibrationCapabilityAdapter.evaluate(facts.calibration)
        domains[CapabilityDomainKind.ENVIRONMENT] = EnvironmentCapabilityAdapter.evaluate(facts.environment)

        return CapabilitySnapshot(
            profileId = profileId,
            capturedAtUtcMillis = capturedAtUtcMillis,
            deviceIdentity = facts.deviceIdentity,
            domains = domains,
        )
    }
}
