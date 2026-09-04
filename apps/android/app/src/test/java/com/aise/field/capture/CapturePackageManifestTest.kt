package com.aise.field.capture

import com.aise.field.capture.manifest.CapturePackageManifestBuilder
import com.aise.field.capture.metadata.AcquisitionMetadata
import com.aise.field.contracts.dto.ContractAssetType
import com.aise.field.domain.model.*
import org.junit.Assert.*
import org.junit.Test

class CapturePackageManifestTest {

    private val sampleSession = CaptureSession(
        id = "2d7e8f4a-1c9b-46f3-a5e8-93d2c7b0e615",
        projectId = "5f0c9d8e-3a47-4b21-9f6a-8c2d1e4b7a30",
        intent = CaptureIntent.AS_BUILT,
        assuranceProfile = AssuranceProfile.HIGH_ASSURANCE,
        status = SessionStatus.IN_PROGRESS,
        createdAt = 1725347100000L
    )

    @Test
    fun buildManifest_createsValidAise003ContractDto() {
        val photoAsset = CaptureAsset(
            id = "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
            sessionId = sampleSession.id,
            assetType = AssetType.PHOTO,
            filePath = "/data/photos/IMG_0001.jpg",
            relativePath = "photos/IMG_0001.jpg",
            contentHash = "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
            byteSize = 4825311L,
            status = AssetStatus.LOCAL_ONLY,
            acquisitionMetadata = AcquisitionMetadata(
                capturedAt = "2026-09-03T07:12:31Z",
                deviceRef = "device-a1b2c3",
                sensorRef = "rear_wide_camera"
            ),
            createdAt = 1725347551000L
        )

        val videoAsset = CaptureAsset(
            id = "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c",
            sessionId = sampleSession.id,
            assetType = AssetType.VIDEO,
            filePath = "/data/videos/VID_0001.mp4",
            relativePath = "videos/VID_0001.mp4",
            contentHash = "f7a28a39396c14dfbb1d56edca817fe7e1a234ba1c1fc4233a060db4a7f0c24d",
            byteSize = 18442022L,
            status = AssetStatus.LOCAL_ONLY,
            acquisitionMetadata = AcquisitionMetadata(
                capturedAt = "2026-09-03T07:13:02Z",
                deviceRef = "device-a1b2c3",
                sensorRef = "video_camera"
            ),
            createdAt = 1725347582000L
        )

        val manifest = CapturePackageManifestBuilder.buildManifest(sampleSession, listOf(photoAsset, videoAsset))

        assertEquals("1.0", manifest.contractVersion)
        assertEquals(sampleSession.id, manifest.sessionId)
        assertEquals(sampleSession.projectId, manifest.projectId)
        assertEquals("sha256", manifest.checksumAlgorithm)
        assertEquals(4825311L + 18442022L, manifest.totalByteSize)
        assertEquals(2, manifest.assets.size)

        val photoDto = manifest.assets[0]
        assertEquals(ContractAssetType.PHOTO, photoDto.assetType)
        assertEquals("photos/IMG_0001.jpg", photoDto.relativePath)
        assertEquals(4825311L, photoDto.byteSize)
        assertEquals("image/jpeg", photoDto.mimeType)
        assertEquals("rear_wide_camera", photoDto.acquisition.sensorRef)

        val videoDto = manifest.assets[1]
        assertEquals(ContractAssetType.VIDEO, videoDto.assetType)
        assertEquals("videos/VID_0001.mp4", videoDto.relativePath)
        assertEquals(18442022L, videoDto.byteSize)
        assertEquals("video/mp4", videoDto.mimeType)
    }

    @Test(expected = IllegalStateException::class)
    fun buildManifest_withMissingRelativePath_failsClosedWithException() {
        val invalidAsset = CaptureAsset(
            id = "asset-no-path",
            sessionId = sampleSession.id,
            assetType = AssetType.PHOTO,
            filePath = "/data/photos/IMG_0001.jpg",
            relativePath = null, // Missing relativePath
            contentHash = "3f4ececbf6ee049d9107995d0c333cadc98c1906335faa4ae635ec82820809ea",
            byteSize = 1024L,
            createdAt = System.currentTimeMillis()
        )

        CapturePackageManifestBuilder.buildManifest(sampleSession, listOf(invalidAsset))
    }

    @Test(expected = IllegalStateException::class)
    fun buildManifest_withMissingContentHash_failsClosedWithException() {
        val invalidAsset = CaptureAsset(
            id = "asset-no-hash",
            sessionId = sampleSession.id,
            assetType = AssetType.PHOTO,
            filePath = "/data/photos/IMG_0001.jpg",
            relativePath = "photos/IMG_0001.jpg",
            contentHash = "", // Blank contentHash
            byteSize = 1024L,
            createdAt = System.currentTimeMillis()
        )

        CapturePackageManifestBuilder.buildManifest(sampleSession, listOf(invalidAsset))
    }
}
