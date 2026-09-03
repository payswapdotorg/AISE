package com.aise.field.domain.model

enum class AssetType {
    PHOTO,
    VIDEO,
    DEPTH,
    METADATA
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
    val status: AssetStatus = AssetStatus.LOCAL_ONLY,
    val createdAt: Long
)
