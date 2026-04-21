package com.speedytrucks.app.auth

import app.cash.turbine.test
import com.speedytrucks.app.core.util.Result
import com.speedytrucks.app.domain.usecase.LoginUseCase
import com.speedytrucks.app.presentation.auth.LoginUiState
import com.speedytrucks.app.presentation.auth.LoginViewModel
import com.speedytrucks.app.util.MainDispatcherRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var fakeRepository: FakeAuthRepository
    private lateinit var loginUseCase: LoginUseCase
    private lateinit var viewModel: LoginViewModel

    @Before
    fun setUp() {
        fakeRepository = FakeAuthRepository()
        loginUseCase = LoginUseCase(fakeRepository)
        viewModel = LoginViewModel(loginUseCase)
    }

    // ── Initial state ─────────────────────────────────────────────────────────

    @Test
    fun `initial state is Idle`() = runTest {
        viewModel.uiState.test {
            assertEquals(LoginUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── Happy path ────────────────────────────────────────────────────────────

    @Test
    fun `login with valid credentials emits Loading then Success`() = runTest {
        fakeRepository.loginResult = Result.Success(FakeAuthRepository.defaultUser())
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            assertEquals(LoginUiState.Idle, awaitItem())

            viewModel.login()

            assertEquals(LoginUiState.Loading, awaitItem())
            assertTrue(awaitItem() is LoginUiState.Success)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `success state contains the correct user`() = runTest {
        val expected = FakeAuthRepository.defaultUser(name = "Jane Doe")
        fakeRepository.loginResult = Result.Success(expected)
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle

            viewModel.login()
            awaitItem() // Loading

            val state = awaitItem() as LoginUiState.Success
            assertEquals(expected, state.user)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── Validation errors (caught in use-case, no network call) ───────────────

    @Test
    fun `empty email emits Error without reaching repository`() = runTest {
        viewModel.onEmailChange("")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            val error = awaitItem() as LoginUiState.Error
            assertTrue(error.message.isNotBlank())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `invalid email format emits Error with descriptive message`() = runTest {
        viewModel.onEmailChange("not-an-email")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            val error = awaitItem() as LoginUiState.Error
            assertTrue(error.message.contains("valid email", ignoreCase = true))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `short password emits Error mentioning 12 characters`() = runTest {
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("short")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            val error = awaitItem() as LoginUiState.Error
            assertTrue(error.message.contains("12 characters", ignoreCase = true))
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── Repository / network errors ────────────────────────────────────────────

    @Test
    fun `repository error emits Error state with the repository message`() = runTest {
        fakeRepository.loginResult = Result.Error(message = "Invalid credentials")
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            val error = awaitItem() as LoginUiState.Error
            assertEquals("Invalid credentials", error.message)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── UX behaviours ──────────────────────────────────────────────────────────

    @Test
    fun `editing email while in Error state resets to Idle`() = runTest {
        fakeRepository.loginResult = Result.Error(message = "Server error")
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            awaitItem() // Error

            viewModel.onEmailChange("other@example.com")
            assertEquals(LoginUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `editing password while in Error state resets to Idle`() = runTest {
        fakeRepository.loginResult = Result.Error(message = "Server error")
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            awaitItem() // Error

            viewModel.onPasswordChange("AnotherPassword123!")
            assertEquals(LoginUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `concurrent login calls while loading are ignored`() = runTest {
        fakeRepository.loginResult = Result.Success(FakeAuthRepository.defaultUser())
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle

            viewModel.login()
            viewModel.login() // should be a no-op — already loading
            viewModel.login() // should also be a no-op

            assertEquals(LoginUiState.Loading, awaitItem())
            assertTrue(awaitItem() is LoginUiState.Success)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `resetState returns to Idle from any state`() = runTest {
        fakeRepository.loginResult = Result.Error(message = "err")
        viewModel.onEmailChange("driver@example.com")
        viewModel.onPasswordChange("SecurePassword123!")

        viewModel.uiState.test {
            awaitItem() // Idle
            viewModel.login()
            awaitItem() // Loading
            awaitItem() // Error

            viewModel.resetState()
            assertEquals(LoginUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
