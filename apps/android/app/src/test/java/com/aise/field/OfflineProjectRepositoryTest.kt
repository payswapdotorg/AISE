package com.aise.field

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aise.field.data.local.AiseDatabase
import com.aise.field.data.repository.OfflineProjectRepository
import com.aise.field.fixtures.ProjectFixtures
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineProjectRepositoryTest {

    private lateinit var database: AiseDatabase
    private lateinit var repository: OfflineProjectRepository

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AiseDatabase::class.java
        ).allowMainThreadQueries().build()

        repository = OfflineProjectRepository(database.projectDao())
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun saveAndGetProjects_returnsPersistedProject() {
        runBlocking {
            val testProject = ProjectFixtures.SAMPLE_PROJECT
            repository.saveProject(testProject)

            val projects = repository.getProjects().first()
            assertEquals(1, projects.size)
            assertEquals("Alpha Facility Inspection", projects[0].name)
            assertEquals("Building 42 Architectural Survey", projects[0].description)
        }
    }

    @Test
    fun getProjectById_returnsCorrectProject() {
        runBlocking {
            val testProject = ProjectFixtures.SAMPLE_PROJECT
            repository.saveProject(testProject)

            val fetched = repository.getProjectById(testProject.id).first()
            assertNotNull(fetched)
            assertEquals(testProject.id, fetched?.id)
            assertEquals(testProject.name, fetched?.name)
        }
    }
}
