package com.aise.field.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.aise.field.data.local.dao.CaptureAssetDao
import com.aise.field.data.local.dao.CaptureSessionDao
import com.aise.field.data.local.dao.ProjectDao
import com.aise.field.data.local.entity.CaptureAssetEntity
import com.aise.field.data.local.entity.CaptureSessionEntity
import com.aise.field.data.local.entity.ProjectEntity

@Database(
    entities = [
        ProjectEntity::class,
        CaptureSessionEntity::class,
        CaptureAssetEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AiseDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
    abstract fun captureSessionDao(): CaptureSessionDao
    abstract fun captureAssetDao(): CaptureAssetDao

    companion object {
        @Volatile
        private var INSTANCE: AiseDatabase? = null

        fun getDatabase(context: Context): AiseDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AiseDatabase::class.java,
                    "aise_field.db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
