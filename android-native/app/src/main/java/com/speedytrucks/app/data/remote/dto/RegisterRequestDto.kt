package com.speedytrucks.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class RegisterRequestDto(
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String,
    @SerializedName("name") val name: String,
    @SerializedName("role") val role: String,
    @SerializedName("phone") val phone: String?,
    @SerializedName("gstin") val gstin: String?,
)
