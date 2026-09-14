package org.payswap.aise.core.capability

import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.CaptureContractVersion
import org.payswap.aise.core.session.IsoTimestamps

/**
 * Renders a [CapabilitySnapshot] as the `DeviceCapabilityProfile` wire JSON of
 * the COMMITTED AISE-003 schema
 * (`packages/shared-contracts/schemas/capability/DeviceCapabilityProfile.schema.json`).
 *
 * The emitted object carries exactly the envelope-embedded key set:
 * `contractVersion`, `profileId`, `capturedAt` (ISO-8601 UTC ms, via
 * [IsoTimestamps] — the session package's public formatter), `deviceIdentity`,
 * and one object per contract domain (`device`, `camera`, `depth`, `imu`,
 * `tracking`, `compute`, `calibration`, `environment`), each with
 * `contractVersion`, `status` (lowercase wire name), `details` (open string
 * map) and `limitations`.
 *
 * Rendering follows the SessionManifestExporter pattern: value tree first,
 * then the canonical writer (sorted keys, 2-space indent, trailing newline) —
 * so the bytes are a pure function of the snapshot. The parity with what the
 * session envelope embeds is pinned by tests (the renderer deliberately
 * rebuilds the shape from the snapshot's PUBLIC API instead of reaching into
 * the session package's internal codec, so drift between the two renderings
 * fails loudly instead of hiding behind shared code).
 */
object CapabilityProfileRenderer {

    /** The snapshot as a `DeviceCapabilityProfile` wire value tree. */
    fun toJsonObject(snapshot: CapabilitySnapshot): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()

        // Wire shape: ISO-8601 UTC ms-precision string (schema pattern), not epoch millis.
        members["capturedAt"] = JsonValue.str(IsoTimestamps.format(snapshot.capturedAtUtcMillis))
        members["contractVersion"] = JsonValue.str(CaptureContractVersion.CURRENT)
        members["deviceIdentity"] = JsonValue.obj(
            "appVersion" to JsonValue.str(snapshot.deviceIdentity.appVersion),
            "deviceId" to JsonValue.str(snapshot.deviceIdentity.deviceId),
            "model" to JsonValue.str(snapshot.deviceIdentity.model),
            "osVersion" to JsonValue.str(snapshot.deviceIdentity.osVersion),
            "platform" to JsonValue.str(snapshot.deviceIdentity.platform),
        )
        for (kind in CapabilityDomainKind.entries) {
            val descriptor = snapshot.domains.getValue(kind)
            val details = LinkedHashMap<String, JsonValue>()
            for ((key, value) in descriptor.details) {
                details[key] = JsonValue.str(value)
            }
            members[kind.name.lowercase()] = JsonValue.obj(
                "contractVersion" to JsonValue.str(CaptureContractVersion.CURRENT),
                "status" to JsonValue.str(descriptor.status.wireName),
                "details" to JsonValue.JsonObject(details),
                "limitations" to JsonValue.arr(descriptor.limitations.map { JsonValue.str(it) }),
            )
        }
        members["profileId"] = JsonValue.str(snapshot.profileId)
        return JsonValue.JsonObject(members)
    }

    /** Canonical pretty JSON (sorted keys, 2-space indent, trailing newline) — byte-stable. */
    fun render(snapshot: CapabilitySnapshot): String = JsonWriter.pretty(toJsonObject(snapshot))
}
