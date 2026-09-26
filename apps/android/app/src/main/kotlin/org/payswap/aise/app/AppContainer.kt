package org.payswap.aise.app

import java.io.File
import java.time.Clock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.payswap.aise.app.auth.MobileAuthClient
import org.payswap.aise.app.capture.CaptureEnvironment
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.DeviceIdentityProvider
import org.payswap.aise.app.capture.FileBackedLocalCaptureStore
import org.payswap.aise.app.field.FieldJourneyRuntime
import org.payswap.aise.core.adapter.FieldTaskDeepLink
import org.payswap.aise.core.adapter.FieldTaskDeepLinkParse
import org.payswap.aise.core.adapter.FieldTaskHandoffValue
import org.payswap.aise.core.capture.LocalCaptureStore
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Tiny composition root (AISE-002 foundation, extended by AISE-005 and
 * PROD-019): still hand-rolled — no DI framework is justified at this size.
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
 *
 * PROD-019 wiring: the [fieldJourneyRuntime] drives the adapter-level field
 * journey (intent → capability assessment → adaptive mission → guided
 * capture bookkeeping → evidence submission) over the SAME capture
 * controller. The device snapshot it declares the client capability profile
 * from is the honest AISE-005/006 baseline (camera exercised by the capture
 * runtime, IMU when the rotation-vector listener runs, everything else
 * `unknown` — never conflated with `unavailable`).
 */
class AppContainer(
    rootDir: File,
    val clock: Clock,
    deviceIdentityProvider: DeviceIdentityProvider,
    imuSensorAvailable: Boolean,
) {
    val localCaptureStore: LocalCaptureStore = FileBackedLocalCaptureStore(File(rootDir, "store"))

    /** Same-origin AISE API target, overridable via AISE_API_BASE_URL at build time. */
    val apiBaseUrl: String = BuildConfig.AISE_API_BASE_URL

    /** Passwordless/session adapter; server remains the authentication authority. */
    val authClient: MobileAuthClient = MobileAuthClient(apiBaseUrl)

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

    /**
     * The honest device capability snapshot the field journey declares the
     * client profile from — the same baseline facts the session manifests
     * record (AISE-005 discipline; AISE-006 adapters feed it as they land).
     */
    fun deviceCapabilitySnapshot(): CapabilitySnapshot = CapabilitySnapshot.baseline(
        profileId = "cap-" + java.util.UUID.randomUUID().toString(),
        capturedAtUtcMillis = clock.millis(),
        deviceIdentity = captureEnvironment.deviceIdentity(),
        imuActive = captureEnvironment.imuActive(),
    )

    /**
     * POST-005 — the handed-off field task (from an `aise://task` deep link
     * the web surfaces emit), when one was offered. NULL = no handoff: the
     * build-time provisioned journey remains the default (badged as such).
     * The handoff carries identity only — the journey still runs its own
     * capability assessment; no authority crosses the boundary.
     */
    private val _handedOffTask = MutableStateFlow<FieldTaskHandoffValue?>(null)
    val handedOffTask: StateFlow<FieldTaskHandoffValue?> = _handedOffTask.asStateFlow()

    /**
     * Parse an aise://task deep link STRICTLY; a valid handoff becomes the
     * active continuation task, an invalid one is returned as its typed
     * rejection (recorded, never upgraded, never crashed on).
     */
    fun offerHandoff(deepLinkUri: String): FieldTaskDeepLinkParse {
        val parsed = FieldTaskDeepLink.parse(deepLinkUri)
        if (parsed is FieldTaskDeepLinkParse.Valid) {
            _handedOffTask.value = parsed.handoff
        }
        return parsed
    }

    /** Clears the handed-off task (the journey consumed it, or the user reset). */
    fun consumeHandedOffTask() {
        _handedOffTask.value = null
    }

    /**
     * The field-journey runtime (PROD-019): journey phases over the capture
     * controller's session flow. The submission seam is the REAL HTTP
     * transport ([org.payswap.aise.app.field.HttpEvidenceSubmissionTransport]
     * wired below): signed-in sessions submit to the configured AISE API;
     * offline or unauthenticated states defer EXPLICITLY to the resumable
     * offline store (typed reasons, never silent failures).
     */
    val fieldJourneyRuntime: FieldJourneyRuntime = FieldJourneyRuntime(
        scope = kotlinx.coroutines.MainScope(),
        activeSession = captureController.activeSession,
        deviceSnapshot = { deviceCapabilitySnapshot() },
        transport = org.payswap.aise.app.field.HttpEvidenceSubmissionTransport(
            baseUrl = apiBaseUrl,
            sessionToken = authClient.sessionToken,
            sessionsRoot = File(rootDir, "sessions"),
        ),
        nowUtcMillis = { clock.millis() },
        profileId = "profile-android-mobile-field-current",
    )
}

/** Production [CaptureEnvironment]: persisted device identity + device sensor fact. */
private class AppCaptureEnvironment(
    private val deviceIdentityProvider: DeviceIdentityProvider,
    private val imuSensorAvailable: Boolean,
) : CaptureEnvironment {
    override fun deviceIdentity(): SessionDeviceIdentity = deviceIdentityProvider.deviceIdentity()
    override fun imuActive(): Boolean = imuSensorAvailable
}
