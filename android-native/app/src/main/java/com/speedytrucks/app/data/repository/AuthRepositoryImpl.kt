package com.speedytrucks.app.data.repository

import com.speedytrucks.app.core.di.IoDispatcher
import com.speedytrucks.app.core.network.TokenManager
import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.data.local.dao.UserDao
import com.speedytrucks.app.data.local.entity.UserEntity
import com.speedytrucks.app.data.remote.AuthApi
import com.speedytrucks.app.data.remote.dto.LoginRequestDto
import com.speedytrucks.app.data.remote.dto.RegisterRequestDto
import com.speedytrucks.app.data.remote.dto.UserDto
import com.speedytrucks.app.domain.model.User
import com.speedytrucks.app.domain.model.UserRole
import com.speedytrucks.app.domain.repository.AuthRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject

/**
 * Concrete implementation of [AuthRepository].
 *
 * Data flow:
 *   Network (Retrofit) → DTO → Domain model
 *   Domain model → Room entity → DB
 *   DB → Room entity → Domain model → UI (via Flow)
 *
 * All network and DB operations are dispatched on [IoDispatcher].
 * The mapping functions are private to this class — domain models never leak
 * infrastructure types across layer boundaries.
 */
class AuthRepositoryImpl @Inject constructor(
    private val authApi: AuthApi,
    private val userDao: UserDao,
    private val tokenManager: TokenManager,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : AuthRepository {

    override suspend fun login(email: String, password: String): Result<User> =
        withContext(ioDispatcher) {
            try {
                val response = authApi.login(LoginRequestDto(email, password))
                if (response.isSuccessful) {
                    val user = response.body()?.user?.toDomain()
                        ?: return@withContext Result.Error(message = "Unexpected empty response")
                    userDao.upsertUser(user.toEntity())
                    Result.Success(user)
                } else {
                    val errorBody = response.errorBody()?.string()
                    Timber.w("Login failed [%d]: %s", response.code(), errorBody)
                    Result.Error(message = parseErrorMessage(errorBody, response.code()))
                }
            } catch (e: Exception) {
                Timber.e(e, "Login network error")
                Result.Error(
                    exception = e,
                    message = "Network error. Please check your connection.",
                )
            }
        }

    override suspend fun register(
        email: String,
        password: String,
        name: String,
        role: String,
        phone: String?,
        gstin: String?,
    ): Result<User> = withContext(ioDispatcher) {
        try {
            val response = authApi.register(
                RegisterRequestDto(email, password, name, role, phone, gstin),
            )
            if (response.isSuccessful) {
                val user = response.body()?.user?.toDomain()
                    ?: return@withContext Result.Error(message = "Unexpected empty response")
                Result.Success(user)
            } else {
                val errorBody = response.errorBody()?.string()
                Timber.w("Register failed [%d]: %s", response.code(), errorBody)
                Result.Error(message = parseErrorMessage(errorBody, response.code()))
            }
        } catch (e: Exception) {
            Timber.e(e, "Register network error")
            Result.Error(
                exception = e,
                message = "Network error. Please check your connection.",
            )
        }
    }

    override suspend fun logout(): Result<Unit> = withContext(ioDispatcher) {
        try {
            val refreshToken = tokenManager.getRefreshToken()
            if (refreshToken != null) {
                // Best-effort server-side token revocation
                authApi.logout(mapOf("refreshToken" to refreshToken))
            }
        } catch (e: Exception) {
            Timber.w(e, "Logout API call failed; clearing local session anyway.")
        } finally {
            tokenManager.clearTokens()
            userDao.clearAllUsers()
        }
        Result.Success(Unit)
    }

    override fun observeCurrentUser(): Flow<User?> =
        userDao.observeCurrentUser().map { it?.toDomain() }

    override fun isLoggedIn(): Boolean = tokenManager.isLoggedIn()

    // ── DTO → Domain ──────────────────────────────────────────────────────────

    private fun UserDto.toDomain() = User(
        id = resolvedId,
        email = email,
        name = name,
        role = UserRole.fromValue(role),
        isEmailVerified = isEmailVerified,
        phone = phone,
        gstin = gstin,
    )

    // ── Domain → Room entity ──────────────────────────────────────────────────

    private fun User.toEntity() = UserEntity(
        id = id,
        email = email,
        name = name,
        role = role.value,
        isEmailVerified = isEmailVerified,
        phone = phone,
        gstin = gstin,
    )

    // ── Room entity → Domain ──────────────────────────────────────────────────

    private fun UserEntity.toDomain() = User(
        id = id,
        email = email,
        name = name,
        role = UserRole.fromValue(role),
        isEmailVerified = isEmailVerified,
        phone = phone,
        gstin = gstin,
    )

    // ── Error body parsing ────────────────────────────────────────────────────

    /**
     * Extracts the human-readable "error" field from the server's JSON
     * response body (format: {"error":"..."}).  Falls back to a generic
     * message keyed on the HTTP status code.
     */
    private fun parseErrorMessage(errorBody: String?, statusCode: Int): String {
        if (!errorBody.isNullOrBlank()) {
            val match = Regex(""""error"\s*:\s*"([^"]+)"""").find(errorBody)
            if (match != null) return match.groupValues[1]
        }
        return when (statusCode) {
            401 -> "Invalid email or password"
            403 -> "Account not active or email not verified"
            409 -> "Email already registered"
            423 -> "Account temporarily locked. Please try again later."
            429 -> "Too many attempts. Please try again later."
            500 -> "Server error. Please try again later."
            else -> "Something went wrong. Please try again."
        }
    }
}
