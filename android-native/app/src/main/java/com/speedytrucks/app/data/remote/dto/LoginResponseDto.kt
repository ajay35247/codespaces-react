package com.speedytrucks.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class LoginResponseDto(
    @SerializedName("user") val user: UserDto,
)
