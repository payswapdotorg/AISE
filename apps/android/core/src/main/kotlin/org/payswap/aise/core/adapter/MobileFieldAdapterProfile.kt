package org.payswap.aise.core.adapter

import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot

/**
 * The mobile adapter's HONEST `ClientCapabilityProfile` declaration (PROD-019,
 * obligation A-R2 of the PROD-016 boundary audit).
 *
 * Template: the committed reference `mobile-field` profile
 * (`packages/adapter-contract/fixtures/capability/ClientCapabilityProfile.valid-mobile-field.json`,
 * from `REFERENCE_MOBILE_FIELD_PROFILE` in `reference-profiles.ts`) — but a
 * reference profile is ILLUSTRATIVE, not a limit: this declaration derives
 * its facts from the EXISTING AISE-006 device capability adapters' output
 * (the [CapabilitySnapshot]) plus what the adapter build actually exercises,
 * per the audit's instruction ("derive facts from the existing capability
 * adapters").
 *
 * HONESTY RULES APPLIED (every divergence from the reference profile is a
 * deliberate, documented honesty decision — the reference is a template, the
 * declaration is fact):
 *
 *  - **screen** — supported, compact (phone-class), single-window: the Compose
 *    shell renders on one window.
 *  - **input** — the modes this build actually exercises: `touch`, `gesture`
 *    and `camera-scan`. The reference profile additionally declares `voice`;
 *    this build has NO voice integration, so it is NOT declared (honest
 *    facts, not marketing — the schema's own rule).
 *  - **sensors** — derived from the DEVICE snapshot's IMU domain: `imu` when
 *    the rotation-vector adapter is active. GPS is NOT declared: the app
 *    requests no location permission and captures no position (AISE-005
 *    decision). Unknown IMU ⇒ domain status `unknown` with the honest
 *    limitation — never conflated with `unavailable`.
 *  - **camera** — derived from the DEVICE snapshot's CAMERA domain: `still` +
 *    `video` when the CameraX binding is exercised. The `depth` and `lidar`
 *    kinds are NEVER declared by this build: the capture runtime binds
 *    Preview + ImageCapture + VideoCapture only — no depth API is exercised,
 *    so per the schema's own honesty rule ("capture kinds the adapter
 *    exercises… even if hardware exists") the device's depth-domain fact
 *    flows into the camera limitations instead (a depth-requiring task
 *    negotiates to an explicit BLOCKED verdict until a depth capture
 *    integration lands — honest, never silent).
 *  - **offline-storage** — `persistent-store` (the file-backed session
 *    journals/manifests and the durable local capture store survive process
 *    death and resume). `queueBoundBytes` is deliberately ABSENT: this build
 *    enforces no storage byte quota, and the schema's honesty rule says an
 *    undeclared bound must never be guessed — a byte-bounded requirement
 *    therefore negotiates to an explicit, honest shortfall.
 *  - **notifications** — `in-app`: the UI surfaces states in-app; no system
 *    notifications are posted by this build (the foreground-service
 *    notification is an AISE-009/030 concern, per the AISE-005 decision).
 *  - **deep-links** — `none`: the manifest declares no intent filters in this
 *    build; the domain status is `unavailable` (not integrated on this
 *    client) with the limitation naming it — mirroring how the reference
 *    browser profile honestly declares its unavailable sensor domain.
 *
 * The declaration is a PURE function: snapshot in, profile out; the instant
 * is INJECTED (no clock). `MobileFieldAdapterProfileTest` pins it against
 * the committed ClientCapabilityProfile schema.
 */
object MobileFieldAdapterProfile {

    /** The adapter kind this client declares (open vocabulary; the reference mobile kind). */
    const val ADAPTER_KIND: String = "mobile-field"

    /**
     * Declares the honest mobile-field [ClientCapabilityProfile] from the
     * device capability snapshot produced by the AISE-006 adapters.
     *
     * @param snapshot the device capability snapshot (8 AISE-003 capture domains).
     * @param profileId stable identifier of this profile snapshot.
     * @param capturedAtIso ISO-8601 UTC millisecond instant (injected — no clock).
     */
    fun declare(
        snapshot: CapabilitySnapshot,
        profileId: String,
        capturedAtIso: String,
    ): ClientCapabilityProfile {
        val cameraDomain = snapshot.domain(CapabilityDomainKind.CAMERA)
        val depthDomain = snapshot.domain(CapabilityDomainKind.DEPTH)
        val imuDomain = snapshot.domain(CapabilityDomainKind.IMU)

        // Camera facts: still+video when the CameraX binding is exercised. The
        // depth/lidar kinds are NEVER declared — this build's capture runtime
        // exercises no depth API (the schema's rule: declared kinds are what
        // the ADAPTER exercises, not what the hardware offers). The device's
        // depth-domain fact flows into the limitations verbatim instead.
        val cameraUsable = cameraDomain.status == CapabilityDomainStatus.SUPPORTED ||
            cameraDomain.status == CapabilityDomainStatus.DEGRADED
        val captureKinds = buildList {
            if (cameraUsable) {
                add(CameraCaptureKind.STILL)
                add(CameraCaptureKind.VIDEO)
            }
        }
        val cameraLimitations = buildList {
            addAll(cameraDomain.limitations)
            add(
                when (depthDomain.status) {
                    CapabilityDomainStatus.SUPPORTED ->
                        "device depth capability supported — not exercised by this build's still/video capture binding"
                    CapabilityDomainStatus.DEGRADED ->
                        "device depth capability degraded — not exercised by this build's still/video capture binding"
                    CapabilityDomainStatus.UNKNOWN ->
                        "device depth capability undetermined — no depth capture kind declared either way"
                    CapabilityDomainStatus.UNAVAILABLE ->
                        "device depth capability unavailable — no depth capture kind declared"
                },
            )
        }

        // Sensor facts: the IMU domain of the device snapshot; GPS is never
        // declared (no location permission — AISE-005 decision).
        val imuUsable = imuDomain.status == CapabilityDomainStatus.SUPPORTED ||
            imuDomain.status == CapabilityDomainStatus.DEGRADED
        val sensorKinds = if (imuUsable) listOf("imu") else emptyList()
        val sensorStatus = when (imuDomain.status) {
            CapabilityDomainStatus.SUPPORTED, CapabilityDomainStatus.DEGRADED ->
                ClientCapabilityStatus.SUPPORTED
            CapabilityDomainStatus.UNKNOWN -> ClientCapabilityStatus.UNKNOWN
            CapabilityDomainStatus.UNAVAILABLE -> ClientCapabilityStatus.UNAVAILABLE
        }
        val sensorLimitations = buildList {
            if (imuDomain.status == CapabilityDomainStatus.UNKNOWN) {
                add("motion sensors undetermined: rotation-vector adapter not active")
            }
            if (imuDomain.status == CapabilityDomainStatus.UNAVAILABLE) {
                add("no motion sensors exercised by this build")
            }
            add("gps not declared: no location permission is requested (AISE-005 decision)")
        }

        return ClientCapabilityProfile(
            contractVersion = AdapterContractVersion.CURRENT,
            profileId = profileId,
            adapterKind = ADAPTER_KIND,
            capturedAt = capturedAtIso,
            screen = ScreenCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "screen",
                    status = ClientCapabilityStatus.SUPPORTED,
                    details = mapOf("shell" to "compose-single-activity"),
                    limitations = emptyList(),
                ),
                sizeClass = ScreenSizeClass.COMPACT,
                multiWindow = false,
            ),
            input = InputCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "input",
                    status = ClientCapabilityStatus.SUPPORTED,
                    details = mapOf("handedness" to "one-hand-field-use"),
                    limitations = emptyList(),
                ),
                modes = listOf(InputMode.TOUCH, InputMode.GESTURE, InputMode.CAMERA_SCAN),
            ),
            sensors = SensorCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "sensors",
                    status = sensorStatus,
                    details = if (imuUsable) mapOf("motion" to "rotation-vector") else emptyMap(),
                    limitations = sensorLimitations,
                ),
                kinds = sensorKinds,
            ),
            camera = CameraCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "camera",
                    status = if (cameraUsable) {
                        if (cameraDomain.status == CapabilityDomainStatus.DEGRADED) {
                            ClientCapabilityStatus.DEGRADED
                        } else {
                            ClientCapabilityStatus.SUPPORTED
                        }
                    } else {
                        when (cameraDomain.status) {
                            CapabilityDomainStatus.UNKNOWN -> ClientCapabilityStatus.UNKNOWN
                            else -> ClientCapabilityStatus.UNAVAILABLE
                        }
                    },
                    details = mapOf("capture.binding" to "CameraX"),
                    limitations = cameraLimitations,
                ),
                captureKinds = captureKinds,
            ),
            offlineStorage = OfflineStorageCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "offline-storage",
                    status = ClientCapabilityStatus.SUPPORTED,
                    details = mapOf("mechanism" to "file-backed-sessions-and-store"),
                    limitations = listOf(
                        "no storage byte quota is enforced by this build, so no queue bound is declared — " +
                            "a byte-bounded task requirement negotiates to an explicit honest shortfall",
                    ),
                ),
                mode = OfflineStorageMode.PERSISTENT_STORE,
                queueBoundBytes = null,
            ),
            notifications = NotificationCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "notifications",
                    status = ClientCapabilityStatus.SUPPORTED,
                    details = mapOf("mechanism" to "in-app"),
                    limitations = listOf(
                        "system notifications arrive with the AISE-009/030 mission foreground service",
                    ),
                ),
                mode = NotificationMode.IN_APP,
            ),
            deepLinks = DeepLinkCapability(
                descriptor = ClientCapabilityDescriptor(
                    contractVersion = AdapterContractVersion.CURRENT,
                    domain = "deep-links",
                    status = ClientCapabilityStatus.UNAVAILABLE,
                    details = emptyMap(),
                    limitations = listOf(
                        "deep links are not integrated in this build (no intent filters declared)",
                    ),
                ),
                mode = DeepLinkMode.NONE,
            ),
        )
    }
}
