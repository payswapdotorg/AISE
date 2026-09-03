package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class CapturePackageContractDto(
    val contractVersion: String = "1.0",
    val packageId: String,
    val sessionId: String,
    val projectId: String,
    val createdAt: String,
    val checksumAlgorithm: String = "sha256",
    val totalByteSize: Long? = null,
    val assets: List<PackageAssetDto>
)

@Serializable
data class PackageAssetDto(
    val assetId: String,
    val assetType: ContractAssetType,
    val relativePath: String,
    val contentHash: String,
    val byteSize: Long,
    val mimeType: String? = null,
    val acquisition: AcquisitionMetadataDto
)

@Serializable
data class AcquisitionMetadataDto(
    val capturedAt: String,
    val deviceRef: String? = null,
    val sensorRef: String? = null,
    val geolocation: GeolocationDto? = null,
    val orientation: OrientationDto? = null,
    val notes: String? = null
)

@Serializable
data class GeolocationDto(
    val latitude: Double,
    val longitude: Double,
    val altitudeM: Double? = null,
    val accuracyM: Double? = null
)

@Serializable
data class OrientationDto(
    val quaternion: QuaternionDto
)

@Serializable
data class QuaternionDto(
    val x: Double,
    val y: Double,
    val z: Double,
    val w: Double
)
