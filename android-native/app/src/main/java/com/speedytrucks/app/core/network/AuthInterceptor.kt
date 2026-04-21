package com.speedytrucks.app.core.network

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/**
 * Attaches the stored Bearer access token to every outgoing request.
 *
 * Using Bearer auth (instead of forwarding cookies) means the Android client
 * bypasses the backend's CSRF double-submit check entirely — native mobile
 * apps are not susceptible to CSRF attacks by design, and the backend's
 * verifyJWT() reads the Authorization header before cookies.
 *
 * Requests that have no stored token (login, register) are passed through
 * unchanged so that public endpoints work without modification.
 */
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val accessToken = tokenManager.getAccessToken()
        val request = if (accessToken != null) {
            chain.request().newBuilder()
                .header(
                    ApiConstants.HEADER_AUTHORIZATION,
                    "${ApiConstants.HEADER_BEARER_PREFIX}$accessToken",
                )
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}
