package org.payswap.aise.app.navigation

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Navigation-state invariants of the shell (pure JVM, no Robolectric):
 * routes are unique and nav-safe, the graph is exactly the three placeholder
 * destinations, and the start destination is Home.
 */
class AppDestinationTest {

    @Test
    fun `the shell exposes exactly the three placeholder destinations`() {
        assertEquals(
            setOf(AppDestination.HOME, AppDestination.SETTINGS, AppDestination.ABOUT),
            AppDestination.entries.toSet(),
        )
    }

    @Test
    fun `routes are unique`() {
        val routes = AppDestination.entries.map { it.route }
        assertEquals(routes.size, routes.toSet().size)
    }

    @Test
    fun `routes are navigation-safe identifiers`() {
        for (destination in AppDestination.entries) {
            assertTrue(
                destination.route.matches(Regex("^[a-z][a-z0-9-]*$")),
                "route '${destination.route}' must be a plain lowercase path segment",
            )
        }
    }

    @Test
    fun `the start destination is Home`() {
        assertEquals(AppDestination.HOME, AppDestination.START)
        assertEquals("home", AppDestination.START.route)
    }

    @Test
    fun `the bottom bar lists all destinations in graph order`() {
        assertEquals(
            listOf("home", "settings", "about"),
            AppDestination.BOTTOM_BAR.map { it.route },
        )
    }

    @Test
    fun `labels are non-blank`() {
        for (destination in AppDestination.entries) {
            assertTrue(destination.label.isNotBlank(), "label of ${destination.route} is blank")
        }
    }

    @Test
    fun `route resolution round-trips and rejects unknown routes`() {
        for (destination in AppDestination.entries) {
            assertEquals(destination, AppDestination.fromRoute(destination.route))
        }
        assertNull(AppDestination.fromRoute("capture"))
        assertNull(AppDestination.fromRoute(""))
    }

    @Test
    fun `every bottom bar entry resolves`() {
        for (destination in AppDestination.BOTTOM_BAR) {
            assertNotNull(AppDestination.fromRoute(destination.route))
        }
    }
}
