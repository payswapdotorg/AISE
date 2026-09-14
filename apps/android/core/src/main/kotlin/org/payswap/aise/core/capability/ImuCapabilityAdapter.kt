package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * IMU domain adapter — motion-sensing capability from [ImuFacts].
 *
 * Classification:
 *  - UNKNOWN — the accelerometer was not probed; OR the gyroscope /
 *    rotation-vector slots were not probed (the two sensors that decide
 *    usability); OR the core sensors report a VIRTUAL/emulated
 *    implementation (an emulator's fake sensors emit data but are unverified
 *    for pose use — ambiguous facts, NOT absence).
 *  - UNAVAILABLE — no accelerometer (the IMU's core function is absent).
 *  - DEGRADED — accelerometer present but the gyroscope is definitively
 *    absent (orientation from the accelerometer alone), or the rotation-vector
 *    sensor is definitively absent (no fused pose; raw-channel fusion
 *    required).
 *  - SUPPORTED — accelerometer, gyroscope and rotation-vector all present and
 *    real.
 *
 * The magnetometer is advisory: its absence is recorded in `details` but does
 * not by itself degrade the domain (fused pose works without it).
 */
object ImuCapabilityAdapter {

    fun evaluate(facts: ImuFacts): CapabilityDomainDescriptor {
        val details = LinkedHashMap<String, String>()

        fun record(kind: SensorKind, sensor: SensorFacts?) {
            val key = "imu.${kind.wireName}"
            details[key] = when {
                sensor == null -> "not-probed"
                sensor.available -> "present"
                else -> "absent"
            }
            if (sensor?.maxRateHz != null) details["$key.rate_hz"] = sensor.maxRateHz.toString()
            if (sensor?.virtual == true) details["$key.virtual"] = "true"
        }
        record(SensorKind.ACCELEROMETER, facts.accelerometer)
        record(SensorKind.GYROSCOPE, facts.gyroscope)
        record(SensorKind.MAGNETOMETER, facts.magnetometer)
        record(SensorKind.ROTATION_VECTOR, facts.rotationVector)

        val limitations = mutableListOf<String>()
        val accelerometer = facts.accelerometer
        val gyroscope = facts.gyroscope
        val rotationVector = facts.rotationVector

        val status: CapabilityDomainStatus = when {
            accelerometer == null -> {
                limitations += "accelerometer presence not probed — IMU capability undetermined"
                CapabilityDomainStatus.UNKNOWN
            }

            !accelerometer.available -> {
                limitations += "no accelerometer — IMU core function absent"
                CapabilityDomainStatus.UNAVAILABLE
            }

            gyroscope == null || rotationVector == null -> {
                val missing = buildList {
                    if (gyroscope == null) add("gyroscope")
                    if (rotationVector == null) add("rotation-vector")
                }
                limitations +=
                    "IMU capability undetermined: ${missing.joinToString(" and ")} availability not probed"
                CapabilityDomainStatus.UNKNOWN
            }

            accelerometer.virtual == true || gyroscope.virtual == true || rotationVector.virtual == true -> {
                limitations +=
                    "core motion sensors report a virtual or emulated implementation — readings unverified for pose use"
                CapabilityDomainStatus.UNKNOWN
            }

            else -> {
                if (!gyroscope.available) {
                    limitations +=
                        "gyroscope absent — device orientation must be derived from the accelerometer alone"
                }
                if (!rotationVector.available) {
                    limitations +=
                        "rotation-vector sensor absent — fused device pose unavailable; " +
                            "raw accelerometer/gyroscope fusion required"
                }
                if (limitations.isEmpty()) CapabilityDomainStatus.SUPPORTED else CapabilityDomainStatus.DEGRADED
            }
        }
        return CapabilityDomainDescriptor(status, details, limitations)
    }
}
