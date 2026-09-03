package com.aise.field

import android.app.Application
import com.aise.field.data.local.AiseDatabase
import com.aise.field.data.repository.OfflineCaptureSessionRepository
import com.aise.field.data.repository.OfflineProjectRepository
import com.aise.field.data.store.LocalCaptureStore
import com.aise.field.data.store.LocalProjectStore

class AiseApplication : Application() {

    val database: AiseDatabase by lazy {
        AiseDatabase.getDatabase(this)
    }

    val projectStore: LocalProjectStore by lazy {
        OfflineProjectRepository(database.projectDao())
    }

    val captureStore: LocalCaptureStore by lazy {
        OfflineCaptureSessionRepository(
            database.captureSessionDao(),
            database.captureAssetDao()
        )
    }
}
