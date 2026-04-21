package com.speedytrucks.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Local cache of the authenticated user's profile.
 *
 * Only one row is ever stored at a time (the currently logged-in user).
 * [cachedAt] records when the row was last written so stale data can be
 * detected by the repository if needed.
 */
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val email: String,
    val name: String,
    val role: String,
    val isEmailVerified: Boolean,
    val phone: String?,
    val gstin: String?,
    val cachedAt: Long = System.currentTimeMillis(),
)
