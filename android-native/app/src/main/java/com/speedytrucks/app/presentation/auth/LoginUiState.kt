package com.speedytrucks.app.presentation.auth

import com.speedytrucks.app.domain.model.User

/**
 * Sealed UI state for the Login screen.
 *
 * [Idle] is the default — no network activity, no errors displayed.
 * [Loading] disables inputs and shows a spinner inside the button.
 * [Success] carries the authenticated user; the screen navigates away.
 * [Error] carries a human-readable message shown in a Snackbar.
 */
sealed interface LoginUiState {
    data object Idle : LoginUiState
    data object Loading : LoginUiState
    data class Success(val user: User) : LoginUiState
    data class Error(val message: String) : LoginUiState
}
