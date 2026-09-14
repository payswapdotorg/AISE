package org.payswap.aise.app

import java.io.File
import java.time.Clock
import org.payswap.aise.app.capture.CaptureEnvironment
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.DeviceIdentityProvider
import org.payswap.aise.app.capture.FileBackedLocalCaptureStore
import org.payswap.aise.core.capture.LocalCaptureStore
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Tiny composition root (AISE-002 foundation, extended by AISE-005):
 * still hand-rolled — no DI framework is justified at this size.
 *
 * AISE-005 wiring: the persistent [FileBackedLocalCaptureStore] replaces the
 * in-memory implementation behind the SAME AISE-002 interface (the rest of
 * the app does not change), and the [CaptureSessionController] owns session
 * lifecycle, assets, journal and recovery. Everything lives under
 * `<filesDir>/aise/` — app-private storage, zero permissions needed for it.
 *
 * [imuSensorAvailable] is a device fact computed once at app start (the
 * rotation-vector sensor's presence) and feeds the honest baseline
 * capability snapshot of every session started through
 * [captureEnvironment].
 */
class AppContainer(
    rootDir: File,
    val clock: Clock,
    deviceIdentityProvider: DeviceIdentityProvider,
    imuSensorAvailable: Boolean,
) {
    val localCaptureStore: LocalCaptureStore = FileBackedLocalCaptureStore(File(rootDir, "store"))

    val captureController: CaptureSessionController = CaptureSessionController(
        sessionsRoot = File(rootDir, "sessions"),
        store = localCaptureStore,
        clock = clock,
        sessionIds = { java.util.UUID.randomUUID().toString() },
    )

    /** The session-time environment facts (device identity + IMU presence). */
    val captureEnvironment: CaptureEnvironment =
        AppCaptureEnvironment(deviceIdentityProvider, imuSensorAvailable)

    /** The session-time device identity (stable per app-data lifetime). */
    fun sessionDeviceIdentity(): SessionDeviceIdentity = captureEnvironment.deviceIdentity()
}

/** Production [CaptureEnvironment]: persisted device identity + device sensor fact. */
private class AppCaptureEnvironment(
    private val deviceIdentityProvider: DeviceIdentityProvider,
    private val imuSensorAvailable: Boolean,
) : CaptureEnvironment {
    override fun deviceIdentity(): SessionDeviceIdentity = deviceIdentityProvider.deviceIdentity()
    override fun imuActive(): Boolean = imuSensorAvailable
}
