package com.aise.field.fakes

import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.domain.model.CaptureAsset
import com.aise.field.domain.model.CaptureSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

class FakeLocalCaptureStore(
    initialSessions: List<CaptureSession> = emptyList(),
    initialAssets: List<CaptureAsset> = emptyList()
) : LocalCaptureStore {

    private val sessionsState = MutableStateFlow(initialSessions)
    private val assetsState = MutableStateFlow(initialAssets)

    override fun getSessionsForProject(projectId: String): Flow<List<CaptureSession>> {
        return sessionsState.map { sessions ->
            sessions.filter { it.projectId == projectId }
        }
    }

    override fun getSessionById(sessionId: String): Flow<CaptureSession?> {
        return sessionsState.map { sessions ->
            sessions.find { it.id == sessionId }
        }
    }

    override suspend fun saveSession(session: CaptureSession) {
        val current = sessionsState.value.toMutableList()
        val index = current.indexOfFirst { it.id == session.id }
        if (index >= 0) {
            current[index] = session
        } else {
            current.add(0, session)
        }
        sessionsState.value = current
    }

    override fun getAssetsForSession(sessionId: String): Flow<List<CaptureAsset>> {
        return assetsState.map { assets ->
            assets.filter { it.sessionId == sessionId }
        }
    }

    override suspend fun saveAsset(asset: CaptureAsset) {
        val current = assetsState.value.toMutableList()
        val index = current.indexOfFirst { it.id == asset.id }
        if (index >= 0) {
            current[index] = asset
        } else {
            current.add(asset)
        }
        assetsState.value = current
    }
}
