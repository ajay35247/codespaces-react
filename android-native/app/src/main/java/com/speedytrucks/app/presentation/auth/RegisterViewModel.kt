package com.speedytrucks.app.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.model.UserRole
import com.speedytrucks.app.domain.usecase.RegisterUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val registerUseCase: RegisterUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow<RegisterUiState>(RegisterUiState.Idle)
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    private val _name = MutableStateFlow("")
    val name: StateFlow<String> = _name.asStateFlow()

    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    private val _selectedRole = MutableStateFlow(UserRole.SHIPPER.value)
    val selectedRole: StateFlow<String> = _selectedRole.asStateFlow()

    /** Stable list — safe to read from Composable without wrapping. */
    val availableRoles: List<UserRole> = UserRole.entries

    fun onNameChange(value: String) {
        _name.update { value }
        clearErrorIfPresent()
    }

    fun onEmailChange(value: String) {
        _email.update { value }
        clearErrorIfPresent()
    }

    fun onPasswordChange(value: String) {
        _password.update { value }
        clearErrorIfPresent()
    }

    fun onRoleChange(value: String) {
        _selectedRole.update { value }
    }

    fun register() {
        if (_uiState.value is RegisterUiState.Loading) return

        viewModelScope.launch {
            _uiState.update { RegisterUiState.Loading }
            when (val result = registerUseCase(
                email = _email.value,
                password = _password.value,
                name = _name.value,
                role = _selectedRole.value,
            )) {
                is Result.Success -> _uiState.update {
                    RegisterUiState.Success(
                        user = result.data,
                        message = "Registration successful! Please check your email to verify your account.",
                    )
                }
                is Result.Error -> _uiState.update { RegisterUiState.Error(result.message) }
            }
        }
    }

    private fun clearErrorIfPresent() {
        if (_uiState.value is RegisterUiState.Error) {
            _uiState.update { RegisterUiState.Idle }
        }
    }
}
