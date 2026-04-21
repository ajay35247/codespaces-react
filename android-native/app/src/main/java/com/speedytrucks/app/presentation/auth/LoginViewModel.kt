package com.speedytrucks.app.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.usecase.LoginUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for the Login screen.
 *
 * Design decisions:
 * - Form fields are separate [StateFlow]s so only the affected recomposition
 *   scope re-renders when the user types, not the entire screen.
 * - Editing a field while in [LoginUiState.Error] resets to [LoginUiState.Idle]
 *   to give immediate visual feedback that the error was acknowledged.
 * - Duplicate taps on "Sign In" while loading are ignored to prevent double
 *   submissions.
 * - Business logic lives in [LoginUseCase], not here — the ViewModel only
 *   coordinates state transitions.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val loginUseCase: LoginUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    fun onEmailChange(value: String) {
        _email.update { value }
        clearErrorIfPresent()
    }

    fun onPasswordChange(value: String) {
        _password.update { value }
        clearErrorIfPresent()
    }

    fun login() {
        // Guard against concurrent submissions
        if (_uiState.value is LoginUiState.Loading) return

        viewModelScope.launch {
            _uiState.update { LoginUiState.Loading }
            when (val result = loginUseCase(_email.value, _password.value)) {
                is Result.Success -> _uiState.update { LoginUiState.Success(result.data) }
                is Result.Error -> _uiState.update { LoginUiState.Error(result.message) }
            }
        }
    }

    fun resetState() {
        _uiState.update { LoginUiState.Idle }
    }

    private fun clearErrorIfPresent() {
        if (_uiState.value is LoginUiState.Error) {
            _uiState.update { LoginUiState.Idle }
        }
    }
}
