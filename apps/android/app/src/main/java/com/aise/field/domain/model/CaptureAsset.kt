package com.aise.field.domain.model

import com.aise.field.capture.metadata.AcquisitionMetadata

enum class AssetType {
    PHOTO,
    VIDEO,
    DEPTH,
    METADATA,
    SKETCH,
    VOICE,
    DOCUMENT
}

enum class AssetStatus {
    LOCAL_ONLY,
    SYNCED,
    FAILED
}

data class CaptureAsset(
    val id: String,
    val sessionId: String,
    val assetType: AssetType,
    val filePath: String,
    val relativePath: String? = null,
    val contentHash: String? = null,
    val byteSize: Long = 0L,
    val status: AssetStatus = AssetStatus.LOCAL_ONLY,
    val acquisitionMetadata: AcquisitionMetadata? = null,
    val createdAt: Long
)
