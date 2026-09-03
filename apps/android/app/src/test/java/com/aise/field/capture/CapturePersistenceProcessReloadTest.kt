package com.aise.field.capture

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.capture.metadata.AcquisitionMetadata
import com.aise.field.capture.metadata.Geolocation
import com.aise.field.data.local.AiseDatabase
import com.aise.field.data.repository.OfflineCaptureSessionRepository
import com.aise.field.domain.model.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CapturePersistenceProcessReloadTest {

    @Test
    fun sessionAndAssets_surviveRepositoryReload() {
        runBlocking {
            // 1. Initial Database Setup & Insertion
            val db1 = Room.inMemoryDatabaseBuilder(
                ApplicationProvider.getApplicationContext(),
                AiseDatabase::class.java
            ).allowMainThreadQueries().build()

            val repo1 = OfflineCaptureSessionRepository(
                db1.captureSessionDao(),
                db1.captureAssetDao()
            )

            val session = CaptureSession(
                id = "sess-persist-1",
                projectId = "proj-101",
                intent = CaptureIntent.INSPECTION,
                assuranceProfile = AssuranceProfile.CRITICAL,
                status = SessionStatus.IN_PROGRESS,
                createdAt = 1725321600000L
            )

            val photoAsset = CaptureAsset(
                id = "asset-photo-1",
                sessionId = "sess-persist-1",
                assetType = AssetType.PHOTO,
                filePath = "/data/user/0/com.aise.field/files/captures/photos/asset-photo-1.jpg",
                relativePath = "photos/asset-photo-1.jpg",
                contentHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                byteSize = 1024L,
                status = AssetStatus.LOCAL_ONLY,
                acquisitionMetadata = AcquisitionMetadata(
                    capturedAt = "2026-09-03T12:00:00Z",
                    deviceRef = "device_test",
                    sensorRef = "rear_wide_camera",
                    geolocation = Geolocation(latitude = 37.7749, longitude = -122.4194)
                ),
                createdAt = 1725321605000L
            )

            repo1.saveSession(session)
            repo1.saveAsset(photoAsset)

            // 2. Simulate Process Restart by instantiating new Repository instance over DB
            val repo2 = OfflineCaptureSessionRepository(
                db1.captureSessionDao(),
                db1.captureAssetDao()
            )

            val recoveredSession = repo2.getSessionById("sess-persist-1").first()
            assertNotNull(recoveredSession)
            assertEquals(SessionStatus.IN_PROGRESS, recoveredSession?.status)
            assertEquals(CaptureIntent.INSPECTION, recoveredSession?.intent)

            val recoveredAssets = repo2.getAssetsForSession("sess-persist-1").first()
            assertEquals(1, recoveredAssets.size)
            val recoveredPhoto = recoveredAssets[0]
            assertEquals("photos/asset-photo-1.jpg", recoveredPhoto.relativePath)
            assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", recoveredPhoto.contentHash)
            assertNotNull(recoveredPhoto.acquisitionMetadata)
            assertEquals(37.7749, recoveredPhoto.acquisitionMetadata!!.geolocation!!.latitude, 0.0001)

            db1.close()
        }
    }
}
