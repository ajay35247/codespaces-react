package com.speedytrucks.app.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * Represents the "user" object returned by the server.
 *
 * The REST API returns `id` for register responses and `_id` (Mongoose) for
 * some login responses.  [resolvedId] normalises both.
 */
data class UserDto(
    @SerializedName("id") val id: String?,
    @SerializedName("_id") val mongoId: String?,
    @SerializedName("email") val email: String,
    @SerializedName("name") val name: String,
    @SerializedName("role") val role: String,
    @SerializedName("isEmailVerified") val isEmailVerified: Boolean,
    @SerializedName("phone") val phone: String?,
    @SerializedName("gstin") val gstin: String?,
) {
    val resolvedId: String get() = id ?: mongoId ?: ""
}
