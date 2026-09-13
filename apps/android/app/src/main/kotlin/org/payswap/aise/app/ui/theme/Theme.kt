package org.payswap.aise.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * AISE field-client theme (AISE-002): warm, high-contrast, outdoor-readable
 * terracotta/stone palette for a construction-field tool. Material 3.
 */
private val LightColors = lightColorScheme(
    primary = Color(0xFF9A4522),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFFDBCC),
    onPrimaryContainer = Color(0xFF380D00),
    secondary = Color(0xFF765849),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFFFDBCC),
    onSecondaryContainer = Color(0xFF2C1509),
    tertiary = Color(0xFF5C6236),
    onTertiary = Color(0xFFFFFFFF),
    background = Color(0xFFFFF8F5),
    onBackground = Color(0xFF221A15),
    surface = Color(0xFFFFF8F5),
    onSurface = Color(0xFF221A15),
    surfaceVariant = Color(0xFFF4DED3),
    onSurfaceVariant = Color(0xFF52443C),
    outline = Color(0xFF85736B),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB68F),
    onPrimary = Color(0xFF521F00),
    primaryContainer = Color(0xFF743009),
    onPrimaryContainer = Color(0xFFFFDBCC),
    secondary = Color(0xFFE5BEAC),
    onSecondary = Color(0xFF432B1D),
    secondaryContainer = Color(0xFF5C4132),
    onSecondaryContainer = Color(0xFFFFDBCC),
    tertiary = Color(0xFFC4CCA6),
    onTertiary = Color(0xFF2E3300),
    background = Color(0xFF191210),
    onBackground = Color(0xFFEDE0DA),
    surface = Color(0xFF191210),
    onSurface = Color(0xFFEDE0DA),
    surfaceVariant = Color(0xFF52443C),
    onSurfaceVariant = Color(0xFFD7C2B8),
    outline = Color(0xFF9F8D83),
)

@Composable
fun AiseFieldTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
