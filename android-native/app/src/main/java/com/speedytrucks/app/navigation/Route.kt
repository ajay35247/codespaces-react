package com.speedytrucks.app.navigation

import kotlinx.serialization.Serializable

/**
 * Type-safe navigation routes using kotlinx.serialization + Navigation 2.8+.
 *
 * Graph objects act as containers for nested destinations; leaf objects/classes
 * are individual screens.  Passing complex arguments is done by making the
 * data class Serializable — Navigation Compose serializes them into the back
 * stack automatically.
 */
sealed interface Route {

    // ── Auth graph ────────────────────────────────────────────────────────────
    @Serializable
    data object AuthGraph : Route

    @Serializable
    data object Login : Route

    @Serializable
    data object Register : Route

    // ── Main graph (placeholder for future features) ──────────────────────────
    @Serializable
    data object MainGraph : Route

    @Serializable
    data object Dashboard : Route
}
