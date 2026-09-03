package com.aise.field.capture

import com.aise.field.capture.engine.LocalFileStore
import com.aise.field.capture.engine.PhotoCaptureAdapter
import com.aise.field.capture.engine.VideoCaptureAdapter
import com.aise.field.capture.metadata.AndroidDeviceMetadataProvider
import com.aise.field.domain.model.AssetType
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PhotoVideoCaptureTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    @Test
    fun photoCapture_generatesValidAssetAndMetadata() {
        val fileStore = LocalFileStore(tempFolder.root)
        val metadataProvider = AndroidDeviceMetadataProvider()
        val photoAdapter = PhotoCaptureAdapter(fileStore, metadataProvider)

        val dummyJpeg = "FAKE_JPEG_DATA_12345".toByteArray()
        val asset = photoAdapter.capturePhoto("sess-100", dummyJpeg, notes = "Test Photo")

        assertEquals("sess-100", asset.sessionId)
        assertEquals(AssetType.PHOTO, asset.assetType)
        assertTrue(asset.relativePath!!.startsWith("photos/"))
        assertTrue(asset.relativePath!!.endsWith(".jpg"))
        assertEquals(dummyJpeg.size.toLong(), asset.byteSize)
        assertNotNull(asset.contentHash)
        assertEquals(64, asset.contentHash!!.length) // SHA-256 hex length
        assertNotNull(asset.acquisitionMetadata)
        assertEquals("rear_wide_camera", asset.acquisitionMetadata!!.sensorRef)
        assertEquals("Test Photo", asset.acquisitionMetadata!!.notes)
    }

    @Test
    fun videoCapture_generatesValidAssetAndMetadata() {
        val fileStore = LocalFileStore(tempFolder.root)
        val metadataProvider = AndroidDeviceMetadataProvider()
        val videoAdapter = VideoCaptureAdapter(fileStore, metadataProvider)

        val dummyMp4 = "FAKE_MP4_VIDEO_DATA_67890_LONG_BUFFER".toByteArray()
        val asset = videoAdapter.captureVideo("sess-100", dummyMp4, notes = "Test Video")

        assertEquals("sess-100", asset.sessionId)
        assertEquals(AssetType.VIDEO, asset.assetType)
        assertTrue(asset.relativePath!!.startsWith("videos/"))
        assertTrue(asset.relativePath!!.endsWith(".mp4"))
        assertEquals(dummyMp4.size.toLong(), asset.byteSize)
        assertNotNull(asset.contentHash)
        assertEquals(64, asset.contentHash!!.length) // SHA-256 hex length
        assertNotNull(asset.acquisitionMetadata)
        assertEquals("video_camera", asset.acquisitionMetadata!!.sensorRef)
        assertEquals("Test Video", asset.acquisitionMetadata!!.notes)
    }
}
