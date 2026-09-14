package org.payswap.aise.core.session

/**
 * Session-time capability snapshot — the wire shape of
 * `DeviceCapabilityProfile` in the committed AISE-003 schemas
 * (`packages/shared-contracts/schemas/capability/DeviceCapabilityProfile.schema.json`).
 *
 * AISE-005 captures honest facts only: a domain's status is what the capture
 * runtime actually exercises (CAMERA while bound, IMU while the rotation
 * listener runs) and `UNKNOWN` for everything an adapter has not yet
 * determined (AISE-006 owns the real adapters). `unknown` is NEVER
 * conflated with `unavailable` — that distinction is a frozen contract rule.
 *
 * Capability is represented as structured facts per domain — never one opaque
 * score (spec/architecture-lock.md, "Capability-aware acquisition").
 */
data class CapabilitySnapshot(
    /** Stable identifier of this snapshot (unique per session). */
    val profileId: String,
    /** Instant the snapshot was taken (session time), UTC epoch millis. */
    val capturedAtUtcMillis: Long,
    /** The device identity recorded with the snapshot. */
    val deviceIdentity: SessionDeviceIdentity,
    /** Exactly the 8 contract domains, each with status/details/limitations. */
    val domains: Map<CapabilityDomainKind, CapabilityDomainDescriptor>,
) {
    init {
        require(profileId.isNotEmpty() && profileId.length <= 256) {
            "profileId must be 1..256 characters, was: '$profileId'"
        }
        require(capturedAtUtcMillis >= 0) { "capturedAtUtcMillis must be non-negative" }
        val missing = CapabilityDomainKind.entries.filter { it !in domains.keys }
        val extra = domains.keys.filter { it !in CapabilityDomainKind.entries.toSet() }
        require(missing.isEmpty() && extra.isEmpty()) {
            "capability snapshot must cover exactly the 8 contract domains; missing=$missing, extra=$extra"
        }
    }

    fun domain(kind: CapabilityDomainKind): CapabilityDomainDescriptor = domains.getValue(kind)

    companion object {
        /**
         * The honest AISE-005 baseline snapshot: camera exercised by the capture
         * runtime, IMU when a rotation-vector source is active, every other
         * domain `UNKNOWN` ("not yet determined — adapter arrives in AISE-006").
         * AISE-006 replaces this with real adapter output.
         */
        fun baseline(
            profileId: String,
            capturedAtUtcMillis: Long,
            deviceIdentity: SessionDeviceIdentity,
            imuActive: Boolean,
            cameraStatus: CapabilityDomainStatus = CapabilityDomainStatus.SUPPORTED,
        ): CapabilitySnapshot = CapabilitySnapshot(
            profileId = profileId,
            capturedAtUtcMillis = capturedAtUtcMillis,
            deviceIdentity = deviceIdentity,
            domains = CapabilityDomainKind.entries.associateWith { kind ->
                when (kind) {
                    CapabilityDomainKind.DEVICE -> CapabilityDomainDescriptor(
                        status = CapabilityDomainStatus.SUPPORTED,
                        details = mapOf("platform" to deviceIdentity.platform),
                        limitations = emptyList(),
                    )
                    CapabilityDomainKind.CAMERA -> CapabilityDomainDescriptor(
                        status = cameraStatus,
                        details = mapOf("capture.binding" to "CameraX"),
                        limitations = emptyList(),
                    )
                    CapabilityDomainKind.IMU -> if (imuActive) {
                        CapabilityDomainDescriptor(
                            status = CapabilityDomainStatus.SUPPORTED,
                            details = mapOf("sensor.rotation.vector" to "registered"),
                            limitations = emptyList(),
                        )
                    } else {
                        CapabilityDomainDescriptor(
                            status = CapabilityDomainStatus.UNKNOWN,
                            details = emptyMap(),
                            limitations = listOf("rotation-vector sensor not registered on this device"),
                        )
                    }
                    else -> CapabilityDomainDescriptor(
                        status = CapabilityDomainStatus.UNKNOWN,
                        details = emptyMap(),
                        limitations = listOf("not yet determined — capability adapter arrives in AISE-006"),
                    )
                }
            },
        )
    }
}

/** The 8 capability domains required by the DeviceCapabilityProfile wire contract. */
enum class CapabilityDomainKind {
    DEVICE,
    CAMERA,
    DEPTH,
    IMU,
    TRACKING,
    COMPUTE,
    CALIBRATION,
    ENVIRONMENT,
}

/** Per-domain status — wire values are lowercase strings (see [wireName]). */
enum class CapabilityDomainStatus {
    SUPPORTED,
    UNAVAILABLE,
    DEGRADED,
    UNKNOWN;

    /** The wire string in the committed schema enum. */
    val wireName: String get() = name.lowercase()

    companion object {
        fun fromWire(value: String): CapabilityDomainStatus =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown capability status '$value'")
    }
}

/**
 * One domain's structured facts. `details` is an open string map (unknown
 * keys are data and must be preserved); `limitations` lists material
 * limitations right now. No quality judgment lives here — facts only.
 */
data class CapabilityDomainDescriptor(
    val status: CapabilityDomainStatus,
    val details: Map<String, String>,
    val limitations: List<String>,
) {
    init {
        limitations.forEach { limitation ->
            require(limitation.isNotEmpty() && limitation.length <= 4096) {
                "limitations entries must be 1..4096 characters, was: '$limitation'"
            }
        }
    }
}
