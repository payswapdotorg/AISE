package com.aise.field.capture.engine

import com.aise.field.capture.metadata.AcquisitionMetadata
import com.aise.field.capture.metadata.DeviceMetadataProvider
import com.aise.field.domain.model.AssetStatus
import com.aise.field.domain.model.AssetType
import com.aise.field.domain.model.CaptureAsset
import java.util.UUID

class PhotoCaptureAdapter(
    private val localFileStore: LocalFileStore,
    private val metadataProvider: DeviceMetadataProvider
) {
    fun capturePhoto(
        sessionId: String,
        jpegBytes: ByteArray,
        notes: String? = null
    ): CaptureAsset {
        val assetId = UUID.randomUUID().toString()
        val savedResult = localFileStore.savePhotoBytes(assetId, jpegBytes)
        val metadata = metadataProvider.createMetadata(
            sensorRef = "rear_wide_camera",
            notes = notes
        )

        return CaptureAsset(
            id = assetId,
            sessionId = sessionId,
            assetType = AssetType.PHOTO,
            filePath = savedResult.file.absolutePath,
            relativePath = savedResult.relativePath,
            contentHash = savedResult.contentHash,
            byteSize = savedResult.byteSize,
            status = AssetStatus.LOCAL_ONLY,
            acquisitionMetadata = metadata,
            createdAt = System.currentTimeMillis()
        )
    }
}
