package com.aise.field.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.aise.field.data.local.entity.CaptureAssetEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CaptureAssetDao {
    @Query("SELECT * FROM capture_assets WHERE sessionId = :sessionId ORDER BY createdAt ASC")
    fun getAssetsForSession(sessionId: String): Flow<List<CaptureAssetEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAsset(asset: CaptureAssetEntity)
}
