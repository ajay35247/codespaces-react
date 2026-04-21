package com.speedytrucks.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class RegisterResponseDto(
    @SerializedName("message") val message: String,
    @SerializedName("user") val user: UserDto,
)
