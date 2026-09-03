package com.aise.field.data.store

import com.aise.field.domain.model.CaptureAsset
import com.aise.field.domain.model.CaptureSession
import kotlinx.coroutines.flow.Flow

interface LocalCaptureStore {
    fun getSessionsForProject(projectId: String): Flow<List<CaptureSession>>
    fun getSessionById(sessionId: String): Flow<CaptureSession?>
    suspend fun saveSession(session: CaptureSession)
    fun getAssetsForSession(sessionId: String): Flow<List<CaptureAsset>>
    suspend fun saveAsset(asset: CaptureAsset)
}
