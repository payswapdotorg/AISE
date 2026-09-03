package com.aise.field.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.aise.field.capture.metadata.AcquisitionMetadata
import com.aise.field.capture.metadata.Geolocation
import com.aise.field.capture.metadata.Orientation
import com.aise.field.capture.metadata.Quaternion
import com.aise.field.domain.model.AssetStatus
import com.aise.field.domain.model.AssetType
import com.aise.field.domain.model.CaptureAsset

@Entity(tableName = "capture_assets")
data class CaptureAssetEntity(
    @PrimaryKey val id: String,
    val sessionId: String,
    val assetType: String,
    val filePath: String,
    val relativePath: String?,
    val contentHash: String?,
    val byteSize: Long,
    val status: String,
    val capturedAt: String?,
    val deviceRef: String?,
    val sensorRef: String?,
    val geoLatitude: Double?,
    val geoLongitude: Double?,
    val geoAltitudeM: Double?,
    val geoAccuracyM: Double?,
    val orientX: Double?,
    val orientY: Double?,
    val orientZ: Double?,
    val orientW: Double?,
    val notes: String?,
    val createdAt: Long
) {
    fun toDomain(): CaptureAsset {
        val geo = if (geoLatitude != null && geoLongitude != null) {
            Geolocation(
                latitude = geoLatitude,
                longitude = geoLongitude,
                altitudeM = geoAltitudeM,
                accuracyM = geoAccuracyM
            )
        } else null

        val orientation = if (orientX != null && orientY != null && orientZ != null && orientW != null) {
            Orientation(
                quaternion = Quaternion(
                    x = orientX,
                    y = orientY,
                    z = orientZ,
                    w = orientW
                )
            )
        } else null

        val meta = if (capturedAt != null) {
            AcquisitionMetadata(
                capturedAt = capturedAt,
                deviceRef = deviceRef,
                sensorRef = sensorRef,
                geolocation = geo,
                orientation = orientation,
                notes = notes
            )
        } else null

        return CaptureAsset(
            id = id,
            sessionId = sessionId,
            assetType = AssetType.valueOf(assetType),
            filePath = filePath,
            relativePath = relativePath,
            contentHash = contentHash,
            byteSize = byteSize,
            status = AssetStatus.valueOf(status),
            acquisitionMetadata = meta,
            createdAt = createdAt
        )
    }

    companion object {
        fun fromDomain(asset: CaptureAsset): CaptureAssetEntity {
            val meta = asset.acquisitionMetadata
            val geo = meta?.geolocation
            val orient = meta?.orientation?.quaternion
            return CaptureAssetEntity(
                id = asset.id,
                sessionId = asset.sessionId,
                assetType = asset.assetType.name,
                filePath = asset.filePath,
                relativePath = asset.relativePath,
                contentHash = asset.contentHash,
                byteSize = asset.byteSize,
                status = asset.status.name,
                capturedAt = meta?.capturedAt,
                deviceRef = meta?.deviceRef,
                sensorRef = meta?.sensorRef,
                geoLatitude = geo?.latitude,
                geoLongitude = geo?.longitude,
                geoAltitudeM = geo?.altitudeM,
                geoAccuracyM = geo?.accuracyM,
                orientX = orient?.x,
                orientY = orient?.y,
                orientZ = orient?.z,
                orientW = orient?.w,
                notes = meta?.notes,
                createdAt = asset.createdAt
            )
        }
    }
}
