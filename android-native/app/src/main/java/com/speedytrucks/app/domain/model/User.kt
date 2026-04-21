package com.speedytrucks.app.domain.model

/**
 * Core domain representation of an authenticated user.
 *
 * This is a pure Kotlin data class with no Android or framework dependencies,
 * making it trivially testable and portable across modules.
 */
data class User(
    val id: String,
    val email: String,
    val name: String,
    val role: UserRole,
    val isEmailVerified: Boolean,
    val phone: String? = null,
    val gstin: String? = null,
)

enum class UserRole(val value: String) {
    SHIPPER("shipper"),
    DRIVER("driver"),
    FLEET_MANAGER("fleet-manager"),
    BROKER("broker");

    companion object {
        fun fromValue(value: String): UserRole =
            entries.firstOrNull { it.value == value } ?: SHIPPER
    }
}
