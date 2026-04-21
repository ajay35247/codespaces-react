package com.speedytrucks.app.domain.usecase

import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.model.User
import com.speedytrucks.app.domain.model.UserRole
import com.speedytrucks.app.domain.repository.AuthRepository
import javax.inject.Inject

/**
 * Validates registration inputs and delegates to [AuthRepository.register].
 *
 * Password complexity rules mirror the backend's policy (min 12 chars).
 * Role must be one of the four public roles the server accepts.
 */
class RegisterUseCase @Inject constructor(
    private val repository: AuthRepository,
) {

    suspend operator fun invoke(
        email: String,
        password: String,
        name: String,
        role: String,
        phone: String? = null,
        gstin: String? = null,
    ): Result<User> {
        val trimmedEmail = email.trim()
        val trimmedName = name.trim()

        if (trimmedEmail.isBlank()) {
            return Result.Error(message = "Email is required")
        }
        if (!isValidEmail(trimmedEmail)) {
            return Result.Error(message = "Please enter a valid email address")
        }
        if (trimmedName.length < 2) {
            return Result.Error(message = "Name must be at least 2 characters")
        }
        if (trimmedName.length > 120) {
            return Result.Error(message = "Name must be 120 characters or fewer")
        }
        if (password.length < 12) {
            return Result.Error(message = "Password must be at least 12 characters")
        }
        if (UserRole.entries.none { it.value == role }) {
            return Result.Error(message = "Please select a valid role")
        }

        return repository.register(
            email = trimmedEmail,
            password = password,
            name = trimmedName,
            role = role,
            phone = phone?.trim()?.takeIf { it.isNotBlank() },
            gstin = gstin?.trim()?.takeIf { it.isNotBlank() },
        )
    }

    private fun isValidEmail(email: String): Boolean =
        Regex("^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$")
            .matches(email)
}
