package com.speedytrucks.app.core.network

internal object ApiConstants {
    /** Authorization header name. */
    const val HEADER_AUTHORIZATION = "Authorization"

    /** Prefix prepended to the JWT value when building the Authorization header. */
    const val HEADER_BEARER_PREFIX = "Bearer "

    /**
     * Cookie names set by the backend's setAuthCookies() helper.
     * These are HttpOnly and cannot be read from JavaScript, but the Android
     * OkHttp network layer can parse them from raw Set-Cookie response headers.
     */
    const val COOKIE_ACCESS_TOKEN = "st_access"
    const val COOKIE_REFRESH_TOKEN = "st_refresh"

    /** EncryptedSharedPreferences file name. */
    const val PREFS_TOKEN_FILE = "speedy_trucks_secure_prefs"

    /** Keys used inside the encrypted shared preferences file. */
    const val PREFS_KEY_ACCESS_TOKEN = "access_token"
    const val PREFS_KEY_REFRESH_TOKEN = "refresh_token"
}
