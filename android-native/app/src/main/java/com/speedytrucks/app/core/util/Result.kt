package com.speedytrucks.app.core.util

/**
 * A discriminated union representing the outcome of any operation that can
 * succeed or fail.  Loading is intentionally excluded from this type — it
 * belongs to the UI state layer, not the data/domain layer.
 */
sealed class Result<out T> {

    data class Success<T>(val data: T) : Result<T>()

    data class Error(
        val exception: Throwable? = null,
        val message: String = exception?.message ?: "An unexpected error occurred",
    ) : Result<Nothing>()

    val isSuccess get() = this is Success
    val isError get() = this is Error
}

/** Transforms a [Result.Success] value without touching [Result.Error]. */
inline fun <T, R> Result<T>.mapSuccess(transform: (T) -> R): Result<R> = when (this) {
    is Result.Success -> Result.Success(transform(data))
    is Result.Error -> this
}
