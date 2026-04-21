package com.speedytrucks.app.domain.usecase

import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.model.User
import com.speedytrucks.app.domain.repository.AuthRepository
import javax.inject.Inject

/**
 * Validates inputs and delegates to [AuthRepository.login].
 *
 * Validation is intentionally lightweight (format + length checks only).
 * The server is the authoritative source of truth for business rules such as
 * account locking and email verification status.
 *
 * No Android SDK types are used here so the use-case can be unit-tested on
 * a plain JVM without Robolectric.
 */
class LoginUseCase @Inject constructor(
    private val repository: AuthRepository,
) {

    suspend operator fun invoke(email: String, password: String): Result<User> {
        val trimmedEmail = email.trim()
        val trimmedPassword = password.trim()

        if (trimmedEmail.isBlank()) {
            return Result.Error(message = "Email is required")
        }
        if (!isValidEmail(trimmedEmail)) {
            return Result.Error(message = "Please enter a valid email address")
        }
        if (trimmedPassword.isBlank()) {
            return Result.Error(message = "Password is required")
        }
        if (trimmedPassword.length < 12) {
            return Result.Error(message = "Password must be at least 12 characters")
        }

        return repository.login(trimmedEmail, trimmedPassword)
    }

    // RFC-5322 light-touch check — avoids the android.util.Patterns dependency
    // so this class stays framework-free and JVM-testable.
    private fun isValidEmail(email: String): Boolean =
        Regex("^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$")
            .matches(email)
}
