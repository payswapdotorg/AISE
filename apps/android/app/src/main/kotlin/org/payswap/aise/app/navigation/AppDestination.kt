package org.payswap.aise.app.navigation

/**
 * Placeholder navigation destinations of the AISE-002 shell.
 *
 * Pure data — no Android imports — so navigation invariants are unit-testable
 * on a plain JVM (see `AppDestinationTest`). Real destinations (capture
 * session, mission executor, sync status) arrive with AISE-005/009/030 and
 * must be added HERE, keeping this file the single source of route truth.
 */
enum class AppDestination(val route: String, val label: String) {
    HOME("home", "Home"),
    SETTINGS("settings", "Settings"),
    ABOUT("about", "About");

    companion object {
        /** The entry destination of the navigation graph. */
        val START: AppDestination = HOME

        /** Destinations reachable from the bottom navigation bar, in bar order. */
        val BOTTOM_BAR: List<AppDestination> = listOf(HOME, SETTINGS, ABOUT)

        /** Resolves a route back to a destination (used by tests and logs). */
        fun fromRoute(route: String): AppDestination? = entries.firstOrNull { it.route == route }
    }
}
