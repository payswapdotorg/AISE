package org.payswap.aise.core.session

import org.payswap.aise.core.capture.AcquisitionMetadata
import org.payswap.aise.core.identity.ContentId

/**
 * One captured asset of a session: content identity + acquisition provenance
 * + everything recovery needs to re-verify the asset cheaply.
 *
 * This is the LOCAL counterpart of an `Evidence` wire record (the committed
 * AISE-003 schemas): `contentId`/`byteSize`/`mediaType`/`capturedAt`/
 * `acquisitionMethod`/`acquisitionMetadata` map 1:1 onto the wire Evidence
 * object; [assetId], [relativePath] and [headSampleSha256] are journal-local
 * fields (recovery machinery) that do NOT appear on the wire.
 *
 * `sensorMetadata` reuses AISE-002's [AcquisitionMetadata]: an immutable,
 * deterministically ordered string map preserved VERBATIM into the manifest
 * (provenance starts at capture — spec/architecture-lock.md).
 *
 * The record never carries quality judgments: no scores, no "good enough"
 * flags. [corrupted] is an INTEGRITY fact (hash re-verification failed at
 * recovery), which the manifest exporter records explicitly, never silently.
 */
data class CapturedAssetRecord(
    /** Journal-local asset id, `a-NNNN` per session (deterministic sequence). */
    val assetId: String,
    /** Path of the asset file, RELATIVE to the session directory, `/`-separated. */
    val relativePath: String,
    /** Content identity over (payload, metadata) — the frozen AISE-CONTENT-V1 id. */
    val contentId: ContentId,
    /** Payload size in bytes. */
    val byteSize: Long,
    /**
     * sha-256 over the FIRST [HEAD_SAMPLE_BYTES] payload bytes (clamped to
     * byteSize) — recorded at capture time so recovery can re-verify an asset
     * with one small read instead of a full re-hash.
     */
    val headSampleSha256: String,
    /** IANA-style media type, contract-pattern validated. */
    val mediaType: String,
    /** Acquisition instant, UTC epoch millis. */
    val capturedAtUtcMillis: Long,
    /** How this evidence was acquired (wire enum). */
    val acquisitionMethod: AcquisitionMethod,
    /** Sensor/capture metadata preserved verbatim (EXIF-ish open string map). */
    val sensorMetadata: AcquisitionMetadata,
    /** Integrity fact folded from `asset.corrupted` journal events (never mutated in place). */
    val corrupted: Boolean = false,
    /** Why the asset was marked corrupted (only meaningful when [corrupted]). */
    val corruptionReason: AssetCorruptionReason? = null,
) {
    init {
        require(ASSET_ID_PATTERN.matches(assetId)) { "assetId must match ${ASSET_ID_PATTERN.pattern}, was '$assetId'" }
        require(relativePath.isNotEmpty()) { "relativePath must be non-empty" }
        require(!relativePath.startsWith("/") && !relativePath.contains("..") && !relativePath.contains('\\')) {
            "relativePath must be a plain relative path under the session dir, was '$relativePath'"
        }
        require(byteSize >= 0) { "byteSize must be non-negative, was $byteSize" }
        MediaTypes.requireValid(mediaType)
        require(capturedAtUtcMillis >= 0) { "capturedAtUtcMillis must be non-negative" }
        require(headSampleSha256.matches(HEAD_SAMPLE_PATTERN)) {
            "headSampleSha256 must be 64 lowercase hex chars, was '$headSampleSha256'"
        }
        require(!corrupted || corruptionReason != null) { "corrupted assets must carry a corruption reason" }
        require(corrupted || corruptionReason == null) { "non-corrupted assets must not carry a corruption reason" }
    }

    companion object {
        /** Head sample size: 64 KiB is one cheap read that catches almost all truncation/tamper cases. */
        const val HEAD_SAMPLE_BYTES: Int = 64 * 1024

        val ASSET_ID_PATTERN: Regex = Regex("^a-\\d{4,}$")

        val HEAD_SAMPLE_PATTERN: Regex = Regex("^[0-9a-f]{64}$")

        /**
         * Canonical construction: derives the head sample from the payload head.
         * The contentId is NOT derived here (it is streamed by the caller while
         * writing, or re-derived at recovery) — the record trusts the
         * journaled id and re-verification catches any drift.
         */
        fun create(
            assetId: String,
            relativePath: String,
            contentId: ContentId,
            payload: ByteArray,
            mediaType: String,
            capturedAtUtcMillis: Long,
            acquisitionMethod: AcquisitionMethod,
            sensorMetadata: Map<String, String>,
        ): CapturedAssetRecord = CapturedAssetRecord(
            assetId = assetId,
            relativePath = relativePath,
            contentId = contentId,
            byteSize = payload.size.toLong(),
            headSampleSha256 = org.payswap.aise.core.identity.Digests.sha256HexOfHead(payload, HEAD_SAMPLE_BYTES),
            mediaType = mediaType,
            capturedAtUtcMillis = capturedAtUtcMillis,
            acquisitionMethod = acquisitionMethod,
            sensorMetadata = AcquisitionMetadata(sensorMetadata),
        )
    }
}

/** Why an asset could not be re-verified at recovery (stable, journaled reason codes). */
enum class AssetCorruptionReason {
    /** The asset file referenced by the journal is gone. */
    FILE_MISSING,

    /** Full re-derivation of the content id over (file bytes, journal metadata) does not match the journaled id. */
    CONTENT_ID_MISMATCH,
    ;

    companion object {
        fun fromWire(value: String): AssetCorruptionReason =
            entries.firstOrNull { it.name == value }
                ?: throw IllegalArgumentException("unknown asset corruption reason '$value'")
    }
}
