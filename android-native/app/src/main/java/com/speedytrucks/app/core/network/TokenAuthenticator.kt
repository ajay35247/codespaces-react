package com.speedytrucks.app.core.network

import com.speedytrucks.app.data.remote.AuthApi
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Provider

/**
 * OkHttp [Authenticator] for transparent token refresh on HTTP 401.
 *
 * When the server returns 401 this class:
 *   1. Sends the stored refresh token in the request body (the backend accepts
 *      `req.body.refreshToken` in addition to the cookie, so no cookies needed).
 *   2. The [TokenExtractionInterceptor] automatically extracts and persists the
 *      new tokens from the response Set-Cookie headers.
 *   3. The original request is retried with the updated access token.
 *
 * [Provider<AuthApi>] breaks the circular dependency:
 *   OkHttpClient → Retrofit → AuthApi → TokenAuthenticator → OkHttpClient
 */
class TokenAuthenticator @Inject constructor(
    private val tokenManager: TokenManager,
    private val authApiProvider: Provider<AuthApi>,
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        // Avoid infinite retry loops (max 2 attempts)
        if (responseCount(response) >= 2) return null

        val refreshToken = tokenManager.getRefreshToken() ?: run {
            Timber.w("No refresh token available, clearing session.")
            tokenManager.clearTokens()
            return null
        }

        return runBlocking {
            try {
                val result = authApiProvider.get()
                    .refreshToken(mapOf("refreshToken" to refreshToken))

                if (result.isSuccessful) {
                    val newAccessToken = tokenManager.getAccessToken()
                    if (newAccessToken != null) {
                        response.request.newBuilder()
                            .header(
                                ApiConstants.HEADER_AUTHORIZATION,
                                "${ApiConstants.HEADER_BEARER_PREFIX}$newAccessToken",
                            )
                            .build()
                    } else {
                        Timber.e("Token refresh succeeded but no access token found.")
                        null
                    }
                } else {
                    Timber.w("Token refresh rejected [${result.code()}], clearing session.")
                    tokenManager.clearTokens()
                    null
                }
            } catch (e: Exception) {
                Timber.e(e, "Token refresh failed with exception.")
                tokenManager.clearTokens()
                null
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
