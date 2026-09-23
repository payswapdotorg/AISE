package org.payswap.aise.core.session

import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/**
 * Produces the offline session manifest (AISE-005): the JSON rendering of a
 * session record matching the COMMITTED AISE-003
 * `CaptureSessionEnvelope` schema
 * (`packages/shared-contracts/schemas/sync/CaptureSessionEnvelope.schema.json`).
 *
 * `SessionManifestExporterTest` round-trips the output through the schema
 * validator (networknt, test scope) against the committed `.schema.json`
 * files — valid manifests pass, deliberately-invalid mutations are rejected.
 *
 * ## Semantics
 *
 *  - PURE: record in, canonical JSON text out. No I/O, no clock — the bytes
 *    are a deterministic function of the folded record (pinned by tests).
 *  - Only FINALIZED/SYNCED sessions have a manifest (an in-flight session's
 *    truth is the journal; a manifest is the completed session's portable
 *    projection). Exporting anything else is a typed refusal.
 *  - Corrupted assets are EXCLUDED from `assets` (they are not evidence
 *    anymore) but their ids are recorded in the top-level `recovery` audit
 *    field — lost evidence is explicit, never silently dropped
 *    (spec/architecture-lock.md failure posture).
 *  - `recovery` also carries the reopen count. Both fields ride on the
 *    schema's open-object rule (`additionalProperties: true` — 003's
 *    passthrough contract preserves unknown keys).
 *  - Sensor metadata flows VERBATIM from each asset's acquisition metadata.
 *  - This is a manifest, not a transport unit: `SyncBatch` wrapping and
 *    idempotency keys belong to AISE-030.
 *
 * The emitted bytes use the canonical writer (sorted keys, 2-space indent,
 * trailing newline) — byte-stable across devices and runs.
 */
object SessionManifestExporter {

    /** Typed refusal — exporting is only legal for completed sessions. */
    class ManifestExportRefusedException(reason: String) : IllegalStateException(reason)

    fun export(record: CaptureSessionRecord): String {
        if (!record.status.isExportable) {
            throw ManifestExportRefusedException(
                "session ${record.sessionId} is ${record.status.name} — only FINALIZED/SYNCED sessions export a manifest",
            )
        }
        return JsonWriter.pretty(toJsonObject(record))
    }

    fun toJsonObject(record: CaptureSessionRecord): JsonValue.JsonObject {
        if (!record.status.isExportable) {
            throw ManifestExportRefusedException(
                "session ${record.sessionId} is ${record.status.name} — only FINALIZED/SYNCED sessions export a manifest",
            )
        }

        val assets = record.manifestAssets.map { asset ->

            val acquisitionMetadata = LinkedHashMap<String, JsonValue>()
            // Well-known keys first, then the verbatim sensor map (deduped: asset metadata wins).
            val metadataEntries = LinkedHashMap<String, String>()
            if (record.missionRef != null) metadataEntries["mission.id"] = record.missionRef
            metadataEntries["session.id"] = record.sessionId
            metadataEntries["device.id"] = record.deviceIdentity.deviceId
            for ((key, value) in asset.sensorMetadata) {
                metadataEntries[key] = value
            }
            for ((key, value) in metadataEntries) {
                acquisitionMetadata[key] = JsonValue.str(value)
            }

            JsonValue.obj(
                "contractVersion" to JsonValue.str(CaptureContractVersion.CURRENT),
                "contentId" to JsonValue.str(asset.contentId.value),
                "byteSize" to JsonValue.num(asset.byteSize),
                "mediaType" to JsonValue.str(asset.mediaType),
                "capturedAt" to JsonValue.str(IsoTimestamps.format(asset.capturedAtUtcMillis)),
                "acquisitionMethod" to JsonValue.str(asset.acquisitionMethod.name),
                "acquisitionMetadata" to JsonValue.JsonObject(acquisitionMetadata),
                "relativePath" to JsonValue.str(asset.relativePath),
            )
        }

        val members = LinkedHashMap<String, JsonValue>()
        members["contractVersion"] = JsonValue.str(CaptureContractVersion.CURRENT)
        members["sessionId"] = JsonValue.str(record.sessionId)
        if (record.missionRef != null) members["missionRef"] = JsonValue.str(record.missionRef)
        members["deviceIdentity"] = record.deviceIdentity.toJsonObject()
        members["capabilityProfile"] = record.capabilitySnapshot.toJsonObject()
        members["startedAt"] = JsonValue.str(IsoTimestamps.format(record.startedAtUtcMillis))
        if (record.endedAtUtcMillis != null) {
            members["endedAt"] = JsonValue.str(IsoTimestamps.format(record.endedAtUtcMillis))
        }
        // Explicit recovery provenance — only present when something actually happened.
        if (record.reopenAudits.isNotEmpty() || record.corruptedAssetIds.isNotEmpty()) {
            val totalDiscarded = record.reopenAudits.sumOf { it.discardedTmp.size }
            members["recovery"] = JsonValue.obj(
                "reopenCount" to JsonValue.num(record.reopenAudits.size.toLong()),
                "discardedTmpFiles" to JsonValue.num(totalDiscarded.toLong()),
                "corruptedAssets" to JsonValue.arr(record.corruptedAssetIds.map { JsonValue.str(it) }),
            )
        }
        members["assets"] = JsonValue.arr(assets)
        return JsonValue.JsonObject(members)
    }

    private val CaptureSessionStatus.isExportable: Boolean
        get() = this == CaptureSessionStatus.FINALIZED || this == CaptureSessionStatus.SYNCED
}
