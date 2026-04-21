package com.speedytrucks.app.presentation.auth

import com.speedytrucks.app.domain.model.User

sealed interface RegisterUiState {
    data object Idle : RegisterUiState
    data object Loading : RegisterUiState
    data class Success(val user: User, val message: String) : RegisterUiState
    data class Error(val message: String) : RegisterUiState
}
