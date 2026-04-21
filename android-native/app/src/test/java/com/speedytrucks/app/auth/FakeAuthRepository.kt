package com.speedytrucks.app.auth

import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.model.User
import com.speedytrucks.app.domain.model.UserRole
import com.speedytrucks.app.domain.repository.AuthRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * In-memory [AuthRepository] for unit tests.
 *
 * Each operation delegates to a configurable [Result] property so tests can
 * exercise success and failure paths without touching the network or database.
 *
 * Prefer this over Mockito/MockK mocks:
 *  - Deterministic — no surprise interaction-based failures.
 *  - Readable — tests declare exactly what the fake returns.
 *  - Zero framework noise in test output.
 */
class FakeAuthRepository : AuthRepository {

    // Configure these before calling the method under test
    var loginResult: Result<User> = Result.Success(defaultUser())
    var registerResult: Result<User> = Result.Success(defaultUser())
    var logoutResult: Result<Unit> = Result.Success(Unit)
    var isLoggedInValue: Boolean = false

    private val userFlow = MutableStateFlow<User?>(null)

    fun setCurrentUser(user: User?) {
        userFlow.value = user
    }

    override suspend fun login(email: String, password: String): Result<User> = loginResult

    override suspend fun register(
        email: String,
        password: String,
        name: String,
        role: String,
        phone: String?,
        gstin: String?,
    ): Result<User> = registerResult

    override suspend fun logout(): Result<Unit> = logoutResult

    override fun observeCurrentUser(): Flow<User?> = userFlow

    override fun isLoggedIn(): Boolean = isLoggedInValue

    companion object {
        fun defaultUser(
            id: String = "user-abc123",
            email: String = "driver@example.com",
            name: String = "Test Driver",
            role: UserRole = UserRole.DRIVER,
        ) = User(
            id = id,
            email = email,
            name = name,
            role = role,
            isEmailVerified = true,
        )
    }
}
