package com.aise.field.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.aise.field.domain.model.AssetStatus
import com.aise.field.domain.model.AssetType
import com.aise.field.domain.model.CaptureAsset

@Entity(tableName = "capture_assets")
data class CaptureAssetEntity(
    @PrimaryKey val id: String,
    val sessionId: String,
    val assetType: String,
    val filePath: String,
    val status: String,
    val createdAt: Long
) {
    fun toDomain(): CaptureAsset = CaptureAsset(
        id = id,
        sessionId = sessionId,
        assetType = AssetType.valueOf(assetType),
        filePath = filePath,
        status = AssetStatus.valueOf(status),
        createdAt = createdAt
    )

    companion object {
        fun fromDomain(asset: CaptureAsset): CaptureAssetEntity = CaptureAssetEntity(
            id = asset.id,
            sessionId = asset.sessionId,
            assetType = asset.assetType.name,
            filePath = asset.filePath,
            status = asset.status.name,
            createdAt = asset.createdAt
        )
    }
}
