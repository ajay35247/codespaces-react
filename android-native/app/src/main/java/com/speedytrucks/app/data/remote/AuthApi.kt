package com.speedytrucks.app.data.remote

import com.speedytrucks.app.data.remote.dto.LoginRequestDto
import com.speedytrucks.app.data.remote.dto.LoginResponseDto
import com.speedytrucks.app.data.remote.dto.RegisterRequestDto
import com.speedytrucks.app.data.remote.dto.RegisterResponseDto
import com.speedytrucks.app.data.remote.dto.UserDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {

    /** Authenticate an existing user. Tokens arrive via Set-Cookie headers. */
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequestDto): Response<LoginResponseDto>

    /** Create a new account. */
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequestDto): Response<RegisterResponseDto>

    /**
     * Refresh the access token.
     *
     * The backend accepts the refresh token in [body] as `refreshToken`
     * (see getRefreshTokenFromRequest in authorize.js), so the Android client
     * does not need to manage cookie jars — it passes the token explicitly.
     */
    @POST("auth/refresh-token")
    suspend fun refreshToken(@Body body: Map<String, String>): Response<Unit>

    /**
     * Revoke the current session.  The refresh token is passed in the body
     * so the backend can remove it from the user's token list.
     */
    @POST("auth/logout")
    suspend fun logout(@Body body: Map<String, String>): Response<Unit>

    /** Fetch the profile of the currently authenticated user. */
    @GET("auth/me")
    suspend fun getMe(): Response<Map<String, UserDto>>
}
