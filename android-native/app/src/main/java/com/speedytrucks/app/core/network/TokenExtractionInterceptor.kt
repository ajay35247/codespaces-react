package com.speedytrucks.app.core.network

import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber
import javax.inject.Inject

/**
 * Network interceptor that runs after the server response is received.
 *
 * The Speedy Trucks backend delivers JWTs inside HttpOnly cookies
 * (st_access / st_refresh).  This interceptor parses the raw Set-Cookie
 * response headers, extracts those token string values, and persists them via
 * [TokenManager].  Subsequent requests can then be authenticated via
 * Authorization: Bearer without any cookie jar involvement, sidestepping
 * the CSRF mechanism designed for browser clients.
 *
 * This is a network interceptor (not application) so it can observe the raw
 * headers before OkHttp's cookie jar processes them.
 */
class TokenExtractionInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        extractAndPersistTokens(response)
        return response
    }

    private fun extractAndPersistTokens(response: Response) {
        val setCookieHeaders = response.headers("Set-Cookie")
        if (setCookieHeaders.isEmpty()) return

        var accessToken: String? = null
        var refreshToken: String? = null

        for (header in setCookieHeaders) {
            // Each Set-Cookie header looks like:
            //   "st_access=<jwt>; Path=/; HttpOnly; SameSite=Strict"
            val nameValue = header.split(";").firstOrNull()?.trim() ?: continue
            val eqIdx = nameValue.indexOf('=')
            if (eqIdx < 0) continue

            val name = nameValue.substring(0, eqIdx).trim()
            val value = nameValue.substring(eqIdx + 1).trim()

            when (name) {
                ApiConstants.COOKIE_ACCESS_TOKEN -> accessToken = value
                ApiConstants.COOKIE_REFRESH_TOKEN -> refreshToken = value
            }
        }

        if (accessToken != null && refreshToken != null) {
            tokenManager.saveTokens(accessToken, refreshToken)
            Timber.d("Session tokens extracted and persisted.")
        } else if (accessToken != null) {
            // Partial update: access token only (e.g. silent refresh)
            tokenManager.getRefreshToken()?.let { existingRefresh ->
                tokenManager.saveTokens(accessToken, existingRefresh)
            }
        }
    }
}
