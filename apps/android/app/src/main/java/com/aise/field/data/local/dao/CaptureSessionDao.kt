package com.aise.field.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.aise.field.data.local.entity.CaptureSessionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CaptureSessionDao {
    @Query("SELECT * FROM capture_sessions WHERE projectId = :projectId ORDER BY createdAt DESC")
    fun getSessionsForProject(projectId: String): Flow<List<CaptureSessionEntity>>

    @Query("SELECT * FROM capture_sessions WHERE id = :id")
    fun getSessionById(id: String): Flow<CaptureSessionEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: CaptureSessionEntity)
}
