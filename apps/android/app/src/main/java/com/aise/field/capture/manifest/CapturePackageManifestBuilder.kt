package com.aise.field.capture.manifest

import com.aise.field.contracts.adapter.ContractTimestampAdapter
import com.aise.field.contracts.dto.*
import com.aise.field.domain.model.CaptureAsset
import com.aise.field.domain.model.CaptureSession
import java.util.UUID

object CapturePackageManifestBuilder {

    fun buildManifest(
        session: CaptureSession,
        assets: List<CaptureAsset>
    ): CapturePackageContractDto {
        val packageId = UUID.randomUUID().toString()
        val createdAtRfc3339 = ContractTimestampAdapter.epochMillisToRfc3339(session.createdAt)

        val packageAssetDtos = assets.map { asset ->
            val relPath = asset.relativePath
            if (relPath.isNullOrBlank()) {
                throw IllegalStateException("Capture asset ${asset.id} is missing required relativePath")
            }

            val hash = asset.contentHash
            if (hash.isNullOrBlank()) {
                throw IllegalStateException("Capture asset ${asset.id} is missing required contentHash")
            }

            val meta = asset.acquisitionMetadata
            val capturedAtRfc3339 = meta?.capturedAt
                ?: ContractTimestampAdapter.epochMillisToRfc3339(asset.createdAt)

            val acquisitionDto = AcquisitionMetadataDto(
                capturedAt = capturedAtRfc3339,
                deviceRef = meta?.deviceRef,
                sensorRef = meta?.sensorRef,
                geolocation = meta?.geolocation?.let { g ->
                    GeolocationDto(
                        latitude = g.latitude,
                        longitude = g.longitude,
                        altitudeM = g.altitudeM,
                        accuracyM = g.accuracyM
                    )
                },
                orientation = meta?.orientation?.let { o ->
                    OrientationDto(
                        quaternion = QuaternionDto(
                            x = o.quaternion.x,
                            y = o.quaternion.y,
                            z = o.quaternion.z,
                            w = o.quaternion.w
                        )
                    )
                },
                notes = meta?.notes
            )

            val contractAssetType = when (asset.assetType) {
                com.aise.field.domain.model.AssetType.PHOTO -> ContractAssetType.PHOTO
                com.aise.field.domain.model.AssetType.VIDEO -> ContractAssetType.VIDEO
                com.aise.field.domain.model.AssetType.DEPTH -> ContractAssetType.DEPTH
                com.aise.field.domain.model.AssetType.METADATA -> ContractAssetType.METADATA
                com.aise.field.domain.model.AssetType.SKETCH -> ContractAssetType.SKETCH
                com.aise.field.domain.model.AssetType.VOICE -> ContractAssetType.VOICE
                com.aise.field.domain.model.AssetType.DOCUMENT -> ContractAssetType.DOCUMENT
            }

            val mimeType = when (asset.assetType) {
                com.aise.field.domain.model.AssetType.PHOTO -> "image/jpeg"
                com.aise.field.domain.model.AssetType.VIDEO -> "video/mp4"
                com.aise.field.domain.model.AssetType.METADATA -> "application/json"
                else -> "application/octet-stream"
            }

            PackageAssetDto(
                assetId = asset.id,
                assetType = contractAssetType,
                relativePath = relPath,
                contentHash = hash,
                byteSize = asset.byteSize,
                mimeType = mimeType,
                acquisition = acquisitionDto
            )
        }

        val totalSize = packageAssetDtos.sumOf { it.byteSize }

        return CapturePackageContractDto(
            contractVersion = "1.0",
            packageId = packageId,
            sessionId = session.id,
            projectId = session.projectId,
            createdAt = createdAtRfc3339,
            checksumAlgorithm = "sha256",
            totalByteSize = totalSize,
            assets = packageAssetDtos
        )
    }
}
