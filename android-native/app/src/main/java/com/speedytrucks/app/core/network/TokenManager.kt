package com.speedytrucks.app.core.network

import android.content.SharedPreferences
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single source of truth for the current session tokens.
 *
 * Tokens are persisted in [EncryptedSharedPreferences] so they survive process
 * death.  All reads and writes are synchronous because the prefs file is tiny
 * and the calls happen on IO-bound OkHttp threads.
 */
@Singleton
class TokenManager @Inject constructor(
    private val prefs: SharedPreferences,
) {

    fun getAccessToken(): String? =
        prefs.getString(ApiConstants.PREFS_KEY_ACCESS_TOKEN, null)

    fun getRefreshToken(): String? =
        prefs.getString(ApiConstants.PREFS_KEY_REFRESH_TOKEN, null)

    fun saveTokens(accessToken: String, refreshToken: String) {
        prefs.edit()
            .putString(ApiConstants.PREFS_KEY_ACCESS_TOKEN, accessToken)
            .putString(ApiConstants.PREFS_KEY_REFRESH_TOKEN, refreshToken)
            .apply()
    }

    fun clearTokens() {
        prefs.edit()
            .remove(ApiConstants.PREFS_KEY_ACCESS_TOKEN)
            .remove(ApiConstants.PREFS_KEY_REFRESH_TOKEN)
            .apply()
    }

    fun isLoggedIn(): Boolean = getAccessToken() != null
}
