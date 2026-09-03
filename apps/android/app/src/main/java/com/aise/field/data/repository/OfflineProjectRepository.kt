package com.aise.field.data.repository

import com.aise.field.data.local.dao.ProjectDao
import com.aise.field.data.local.entity.ProjectEntity
import com.aise.field.data.store.LocalProjectStore
import com.aise.field.domain.model.Project
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class OfflineProjectRepository(
    private val projectDao: ProjectDao
) : LocalProjectStore {

    override fun getProjects(): Flow<List<Project>> {
        return projectDao.getAllProjects().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override fun getProjectById(id: String): Flow<Project?> {
        return projectDao.getProjectById(id).map { entity ->
            entity?.toDomain()
        }
    }

    override suspend fun saveProject(project: Project) {
        projectDao.insertProject(ProjectEntity.fromDomain(project))
    }
}
