package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * ENVIRONMENT domain adapter — runtime capture conditions from
 * [EnvironmentFacts] (power, thermal, storage, permissions, screen-on policy).
 *
 * Classification:
 *  - UNKNOWN — no power/thermal/storage telemetry probed AND the camera
 *    permission is not definitively denied (nothing decisive is known).
 *  - UNAVAILABLE — available storage is critically below
 *    [CRITICAL_STORAGE_MB] (evidence cannot be persisted at all).
 *  - DEGRADED — any material runtime limitation: thermal state MODERATE or
 *    worse (throttling), battery at or below [LOW_BATTERY_PERCENT] while not
 *    (known to be) charging, storage below [MIN_CAPTURE_STORAGE_MB], or the
 *    camera permission not granted (capture blocked until the operator grants
 *    it — recoverable, hence DEGRADED, not UNAVAILABLE).
 *  - SUPPORTED — telemetry probed, permission granted, no limitation.
 *
 * The location permission and the screen-on policy hint are advisory facts
 * surfaced in `details` only.
 */
object EnvironmentCapabilityAdapter {

    /** At or below this battery level (%) a non-charging session is at material power risk. */
    const val LOW_BATTERY_PERCENT: Int = 15

    /** Below this available storage (MB) evidence capture is materially limited. */
    const val MIN_CAPTURE_STORAGE_MB: Long = 500

    /** Below this available storage (MB) evidence capture is impossible. */
    const val CRITICAL_STORAGE_MB: Long = 100

    private val THROTTLING_THERMAL_STATES =
        setOf(ThermalStatus.MODERATE, ThermalStatus.SEVERE, ThermalStatus.CRITICAL)

    fun evaluate(facts: EnvironmentFacts): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()
        details["environment.battery_percent"] = numberFact(facts.batteryPercent)
        details["environment.charging"] = flagFact(facts.charging)
        details["environment.thermal"] = facts.thermalStatus?.wireName ?: "not-probed"
        details["environment.available_storage_mb"] = numberFact(facts.availableStorageMb)
        details["environment.camera_permission"] = permissionFact(facts.cameraPermissionGranted)
        details["environment.location_permission"] = permissionFact(facts.locationPermissionGranted)
        details["environment.screen_on_policy"] = facts.screenOnPolicy?.wireName ?: "not-probed"

        val limitations = mutableListOf<String>()
        val status: CapabilityDomainStatus

        val telemetryProbed =
            facts.batteryPercent != null || facts.thermalStatus != null || facts.availableStorageMb != null

        if (!telemetryProbed && facts.cameraPermissionGranted != false) {
            limitations += "power/thermal/storage telemetry not probed — environment capability undetermined"
            status = CapabilityDomainStatus.UNKNOWN
        } else {
            if (facts.cameraPermissionGranted == false) {
                limitations +=
                    "camera permission not granted — capture blocked until the operator grants permission"
            }
            if (facts.thermalStatus in THROTTLING_THERMAL_STATES) {
                limitations +=
                    "thermal state ${facts.thermalStatus!!.wireName} — device is throttling now"
            }
            if (facts.batteryPercent != null &&
                facts.batteryPercent <= LOW_BATTERY_PERCENT &&
                facts.charging != true
            ) {
                limitations +=
                    "battery at ${facts.batteryPercent}% and not charging — capture session at risk of power loss"
            }
            val storage = facts.availableStorageMb
            if (storage != null && storage < CRITICAL_STORAGE_MB) {
                limitations +=
                    "available storage $storage MB is critically insufficient for evidence capture"
                status = CapabilityDomainStatus.UNAVAILABLE
            } else {
                if (storage != null && storage < MIN_CAPTURE_STORAGE_MB) {
                    limitations +=
                        "available storage $storage MB is below the $MIN_CAPTURE_STORAGE_MB MB capture floor"
                }
                status =
                    if (limitations.isEmpty()) CapabilityDomainStatus.SUPPORTED else CapabilityDomainStatus.DEGRADED
            }
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
