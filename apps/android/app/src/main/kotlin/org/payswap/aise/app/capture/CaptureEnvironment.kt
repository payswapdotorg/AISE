package org.payswap.aise.app.capture

import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Platform facts needed to start a capture session (AISE-005).
 *
 * Kept as a small interface in the capture package (NOT in the UI layer) so
 * the composition root can supply the production implementation and JVM
 * tests a fixed one. [imuActive] is an honest capability fact: true only
 * when the device actually exposes a rotation-vector sensor.
 */
interface CaptureEnvironment {
    fun deviceIdentity(): SessionDeviceIdentity

    /** True when the rotation-vector sensor is available (IMU capability fact). */
    fun imuActive(): Boolean
}
