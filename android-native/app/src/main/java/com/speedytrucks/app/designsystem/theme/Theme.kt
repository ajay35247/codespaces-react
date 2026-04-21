package com.speedytrucks.app.designsystem.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = PrimaryOrange,
    onPrimary = NeutralWhite,
    primaryContainer = PrimaryOrangeLight,
    onPrimaryContainer = PrimaryOrangeDark,
    secondary = SecondaryBlue,
    onSecondary = NeutralWhite,
    secondaryContainer = SecondaryBlueLight,
    onSecondaryContainer = SecondaryBlueDark,
    background = NeutralGray50,
    onBackground = NeutralGray900,
    surface = NeutralWhite,
    onSurface = NeutralGray900,
    surfaceVariant = NeutralGray100,
    onSurfaceVariant = NeutralGray600,
    error = SemanticError,
    onError = NeutralWhite,
    errorContainer = SemanticErrorContainer,
    onErrorContainer = SemanticError,
    outline = NeutralGray400,
)

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryOrangeLight,
    onPrimary = PrimaryOrangeDark,
    primaryContainer = PrimaryOrange,
    onPrimaryContainer = NeutralWhite,
    secondary = SecondaryBlueLight,
    onSecondary = SecondaryBlueDark,
    secondaryContainer = SecondaryBlue,
    onSecondaryContainer = NeutralWhite,
    background = BackgroundDark,
    onBackground = NeutralGray100,
    surface = SurfaceDark,
    onSurface = NeutralGray100,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = NeutralGray400,
    error = SemanticErrorContainer,
    onError = SemanticError,
    errorContainer = SemanticError,
    onErrorContainer = SemanticErrorContainer,
    outline = NeutralGray600,
)

/**
 * Central theme wrapper for the entire app.
 *
 * Dynamic color (Material You) is disabled by default to guarantee consistent
 * brand colours across all devices.  Enable it selectively if needed.
 */
@Composable
fun SpeedyTrucksTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            @Suppress("DEPRECATION")
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view)
                .isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = SpeedyTypography,
        shapes = SpeedyShapes,
        content = content,
    )
}
