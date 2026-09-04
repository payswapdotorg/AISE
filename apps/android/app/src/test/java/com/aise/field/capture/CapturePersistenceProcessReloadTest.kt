package com.aise.field.capture

import android.content.Context
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.capture.metadata.AcquisitionMetadata
import com.aise.field.capture.metadata.Geolocation
import com.aise.field.capture.metadata.Orientation
import com.aise.field.capture.metadata.Quaternion
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
                    geolocation = Geolocation(latitude = 37.7749, longitude = -122.4194),
                    orientation = Orientation(quaternion = Quaternion(x = 0.1, y = 0.2, z = 0.3, w = 0.9))
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

            // Verify Orientation Quaternion Round-trip
            val recoveredOrient = recoveredPhoto.acquisitionMetadata!!.orientation
            assertNotNull(recoveredOrient)
            assertEquals(0.1, recoveredOrient!!.quaternion.x, 0.0001)
            assertEquals(0.2, recoveredOrient.quaternion.y, 0.0001)
            assertEquals(0.3, recoveredOrient.quaternion.z, 0.0001)
            assertEquals(0.9, recoveredOrient.quaternion.w, 0.0001)

            db1.close()
        }
    }

    @Test
    fun roomDatabase_migration_1_2_preservesExistingData() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val dbFile = context.getDatabasePath("test_migration_1_2.db")
        if (dbFile.exists()) dbFile.delete()

        // 1. Create a SQLite DB at Version 1
        val helperFactory = FrameworkSQLiteOpenHelperFactory()
        val configV1 = SupportSQLiteOpenHelper.Configuration.builder(context)
            .name(dbFile.name)
            .callback(object : SupportSQLiteOpenHelper.Callback(1) {
                override fun onCreate(db: SupportSQLiteDatabase) {
                    db.execSQL("""
                        CREATE TABLE IF NOT EXISTS projects (
                            id TEXT NOT NULL PRIMARY KEY,
                            name TEXT NOT NULL,
                            description TEXT NOT NULL,
                            createdAt INTEGER NOT NULL,
                            updatedAt INTEGER
                        )
                    """.trimIndent())

                    db.execSQL("""
                        CREATE TABLE IF NOT EXISTS capture_sessions (
                            id TEXT NOT NULL PRIMARY KEY,
                            projectId TEXT NOT NULL,
                            intent TEXT NOT NULL,
                            assuranceProfile TEXT NOT NULL,
                            status TEXT NOT NULL,
                            createdAt INTEGER NOT NULL,
                            updatedAt INTEGER
                        )
                    """.trimIndent())

                    db.execSQL("""
                        CREATE TABLE IF NOT EXISTS capture_assets (
                            id TEXT NOT NULL PRIMARY KEY,
                            sessionId TEXT NOT NULL,
                            assetType TEXT NOT NULL,
                            filePath TEXT NOT NULL,
                            relativePath TEXT,
                            contentHash TEXT,
                            byteSize INTEGER NOT NULL,
                            status TEXT NOT NULL,
                            capturedAt TEXT,
                            deviceRef TEXT,
                            sensorRef TEXT,
                            geoLatitude REAL,
                            geoLongitude REAL,
                            geoAltitudeM REAL,
                            geoAccuracyM REAL,
                            notes TEXT,
                            createdAt INTEGER NOT NULL
                        )
                    """.trimIndent())
                }

                override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
            })
            .build()

        val helperV1 = helperFactory.create(configV1)
        val dbV1 = helperV1.writableDatabase

        // Insert V1 sample record
        dbV1.execSQL("""
            INSERT INTO capture_assets (
                id, sessionId, assetType, filePath, relativePath, contentHash, byteSize, status, capturedAt, deviceRef, sensorRef, createdAt
            ) VALUES (
                'v1-asset-001', 'sess-001', 'PHOTO', '/path/v1.jpg', 'photos/v1.jpg', 'hash1234', 512, 'LOCAL_ONLY', '2026-09-03T10:00:00Z', 'dev_v1', 'cam0', 1725320000000
            )
        """.trimIndent())

        // 2. Execute Migration 1 -> 2
        AiseDatabase.MIGRATION_1_2.migrate(dbV1)

        // 3. Verify existing record is preserved and new orientation columns exist
        val cursor = dbV1.query("SELECT id, relativePath, contentHash, orientX FROM capture_assets WHERE id = 'v1-asset-001'")
        assertTrue(cursor.moveToFirst())
        assertEquals("v1-asset-001", cursor.getString(0))
        assertEquals("photos/v1.jpg", cursor.getString(1))
        assertEquals("hash1234", cursor.getString(2))
        assertTrue(cursor.isNull(3)) // orientX default NULL
        cursor.close()

        dbV1.close()
        helperV1.close()
    }
}
