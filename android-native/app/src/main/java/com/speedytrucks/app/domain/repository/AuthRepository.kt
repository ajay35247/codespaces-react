package com.speedytrucks.app.domain.repository

import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.model.User
import kotlinx.coroutines.flow.Flow

/**
 * Contract for authentication operations.
 *
 * The interface lives in the domain layer so use-cases depend on the
 * abstraction, not on a concrete implementation.  This makes it easy to
 * provide [FakeAuthRepository] in tests without touching the network or DB.
 */
interface AuthRepository {

    /** Authenticate with email + password.  Returns the user on success. */
    suspend fun login(email: String, password: String): Result<User>

    /** Register a new account. Returns the created user on success. */
    suspend fun register(
        email: String,
        password: String,
        name: String,
        role: String,
        phone: String? = null,
        gstin: String? = null,
    ): Result<User>

    /** Log out and clear all local session data. */
    suspend fun logout(): Result<Unit>

    /** Reactive stream of the locally cached user (null when logged out). */
    fun observeCurrentUser(): Flow<User?>

    /** Returns true if a valid access token is stored on disk. */
    fun isLoggedIn(): Boolean
}
