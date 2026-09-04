package com.aise.field.capture.engine

import com.aise.field.capture.metadata.AcquisitionMetadata
import com.aise.field.capture.metadata.DeviceMetadataProvider
import com.aise.field.domain.model.AssetStatus
import com.aise.field.domain.model.AssetType
import com.aise.field.domain.model.CaptureAsset
import java.util.UUID

class VideoCaptureAdapter(
    private val localFileStore: LocalFileStore,
    private val metadataProvider: DeviceMetadataProvider
) {
    fun captureVideo(
        sessionId: String,
        videoBytes: ByteArray,
        notes: String? = null
    ): CaptureAsset {
        val assetId = UUID.randomUUID().toString()
        val savedResult = localFileStore.saveVideoBytes(assetId, videoBytes)
        val metadata = metadataProvider.createMetadata(
            sensorRef = "video_camera",
            notes = notes
        )

        return CaptureAsset(
            id = assetId,
            sessionId = sessionId,
            assetType = AssetType.VIDEO,
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
