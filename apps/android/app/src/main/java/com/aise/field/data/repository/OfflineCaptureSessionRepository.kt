package com.aise.field.data.repository

import com.aise.field.data.local.dao.CaptureAssetDao
import com.aise.field.data.local.dao.CaptureSessionDao
import com.aise.field.data.local.entity.CaptureAssetEntity
import com.aise.field.data.local.entity.CaptureSessionEntity
import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.domain.model.CaptureAsset
import com.aise.field.domain.model.CaptureSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class OfflineCaptureSessionRepository(
    private val captureSessionDao: CaptureSessionDao,
    private val captureAssetDao: CaptureAssetDao
) : LocalCaptureStore {

    override fun getSessionsForProject(projectId: String): Flow<List<CaptureSession>> {
        return captureSessionDao.getSessionsForProject(projectId).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override fun getSessionById(sessionId: String): Flow<CaptureSession?> {
        return captureSessionDao.getSessionById(sessionId).map { entity ->
            entity?.toDomain()
        }
    }

    override suspend fun saveSession(session: CaptureSession) {
        captureSessionDao.insertSession(CaptureSessionEntity.fromDomain(session))
    }

    override fun getAssetsForSession(sessionId: String): Flow<List<CaptureAsset>> {
        return captureAssetDao.getAssetsForSession(sessionId).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override suspend fun saveAsset(asset: CaptureAsset) {
        captureAssetDao.insertAsset(CaptureAssetEntity.fromDomain(asset))
    }
}
