package org.payswap.aise.app.capture

import java.io.File
import java.util.UUID
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Provides the session [SessionDeviceIdentity] (AISE-005).
 *
 * The deviceId is a LOCALLY GENERATED UUID, generated once and persisted in
 * the app-private capture root (atomic write, read back on start). It is
 * stable for the lifetime of the app's data — deliberately NOT
 * Settings.Secure.ANDROID_ID (PII-adjacent, changes on factory reset anyway)
 * and not tied to any account: enterprise identity/tenancy is AISE-036.
 * Documented limitation: reinstalling/clearing app data yields a new
 * device identity; session manifests stay stable within a device lifetime.
 */
interface DeviceIdentityProvider {
    fun deviceIdentity(): SessionDeviceIdentity
}

/**
 * Pure-JVM core of the provider (testable): persists/loads the device id
 * file and combines it with externally supplied platform facts (model,
 * osVersion, appVersion — Build.* values in the Android wiring).
 */
class PersistedDeviceIdentityProvider(
    private val root: File,
    private val platform: String,
    private val model: String,
    private val osVersion: String,
    private val appVersion: String,
) : DeviceIdentityProvider {

    private val deviceIdFile = File(root, DEVICE_ID_FILE)

    override fun deviceIdentity(): SessionDeviceIdentity = SessionDeviceIdentity(
        deviceId = loadOrCreateDeviceId(),
        platform = platform,
        model = model,
        osVersion = osVersion,
        appVersion = appVersion,
    )

    private fun loadOrCreateDeviceId(): String {
        if (deviceIdFile.isFile) {
            val existing = deviceIdFile.readText(Charsets.UTF_8).trim()
            if (existing.isNotEmpty()) return existing
        }
        val generated = UUID.randomUUID().toString()
        root.mkdirs()
        AtomicFiles.atomicWrite(deviceIdFile, generated.toByteArray(Charsets.UTF_8))
        return generated
    }

    companion object {
        const val DEVICE_ID_FILE = "device-id.txt"
    }
}
