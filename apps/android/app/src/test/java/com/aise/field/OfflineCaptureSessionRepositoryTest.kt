package com.aise.field

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.data.local.AiseDatabase
import com.aise.field.data.repository.OfflineCaptureSessionRepository
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.domain.model.CaptureSession
import com.aise.field.domain.model.SessionStatus
import com.aise.field.fixtures.ProjectFixtures
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineCaptureSessionRepositoryTest {

    private lateinit var database: AiseDatabase
    private lateinit var repository: OfflineCaptureSessionRepository

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AiseDatabase::class.java
        ).allowMainThreadQueries().build()

        repository = OfflineCaptureSessionRepository(
            database.captureSessionDao(),
            database.captureAssetDao()
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun saveAndGetCaptureSessions_returnsPersistedDraftSession() {
        runBlocking {
            val session = CaptureSession(
                id = "sess-1",
                projectId = "proj-101",
                intent = CaptureIntent.INSPECTION,
                assuranceProfile = AssuranceProfile.CRITICAL,
                status = SessionStatus.DRAFT,
                createdAt = 1725321600000L
            )

            repository.saveSession(session)

            val sessions = repository.getSessionsForProject("proj-101").first()
            assertEquals(1, sessions.size)
            assertEquals(CaptureIntent.INSPECTION, sessions[0].intent)
            assertEquals(AssuranceProfile.CRITICAL, sessions[0].assuranceProfile)
            assertEquals(SessionStatus.DRAFT, sessions[0].status)
        }
    }

    @Test
    fun saveAndGetAssets_returnsPersistedAsset() {
        runBlocking {
            val asset = ProjectFixtures.SAMPLE_ASSET
            repository.saveAsset(asset)

            val assets = repository.getAssetsForSession(asset.sessionId).first()
            assertEquals(1, assets.size)
            assertEquals(asset.id, assets[0].id)
            assertEquals(asset.filePath, assets[0].filePath)
        }
    }
}
