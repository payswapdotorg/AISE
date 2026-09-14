package org.payswap.aise.core.session

/**
 * Device identity embedded in every session manifest — the wire shape of
 * `DeviceIdentity` in the committed AISE-003 schemas
 * (`packages/shared-contracts/schemas/sync/CaptureSessionEnvelope.schema.json`).
 *
 * All fields are bounded to the schema limits (1..256 chars). The deviceId is
 * a locally-generated stable identifier (see the :app runtime) — advisory
 * metadata, never an authority.
 */
data class SessionDeviceIdentity(
    /** Stable, locally-generated device identifier (metadata key `device.id`). */
    val deviceId: String,
    /** Platform label, e.g. `android`. */
    val platform: String,
    /** Device model label, advisory only. */
    val model: String,
    /** Operating system version. */
    val osVersion: String,
    /** Capturing application version. */
    val appVersion: String,
) {
    init {
        requireField(deviceId, "deviceId")
        requireField(platform, "platform")
        requireField(model, "model")
        requireField(osVersion, "osVersion")
        requireField(appVersion, "appVersion")
    }

    companion object {
        const val MAX_LENGTH: Int = 256

        private fun requireField(value: String, name: String) {
            require(value.isNotEmpty() && value.length <= MAX_LENGTH) {
                "SessionDeviceIdentity.$name must be 1..$MAX_LENGTH characters, was: '$value'"
            }
        }
    }
}
