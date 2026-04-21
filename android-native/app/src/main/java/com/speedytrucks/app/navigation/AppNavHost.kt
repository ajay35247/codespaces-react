package com.speedytrucks.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import com.speedytrucks.app.presentation.auth.LoginScreen
import com.speedytrucks.app.presentation.auth.RegisterScreen

/**
 * Root navigation host.
 *
 * The graph is split into:
 *  - [Route.AuthGraph] — login / register (unauthenticated)
 *  - [Route.MainGraph] — all protected screens (authenticated)
 *
 * Start destination is [Route.AuthGraph].  After a successful login the nav
 * controller pops the entire auth graph off the back stack and navigates to
 * [Route.MainGraph] so the back button never returns to the login screen.
 */
@Composable
fun AppNavHost(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    startDestination: Any = Route.AuthGraph,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier,
    ) {
        authGraph(navController)
        mainGraph(navController)
    }
}

private fun NavGraphBuilder.authGraph(navController: NavHostController) {
    navigation<Route.AuthGraph>(startDestination = Route.Login) {
        composable<Route.Login> {
            LoginScreen(
                onNavigateToRegister = { navController.navigate(Route.Register) },
                onLoginSuccess = {
                    navController.navigate(Route.MainGraph) {
                        popUpTo(Route.AuthGraph) { inclusive = true }
                    }
                },
            )
        }
        composable<Route.Register> {
            RegisterScreen(
                onNavigateToLogin = { navController.navigateUp() },
                onRegisterSuccess = { navController.navigateUp() },
            )
        }
    }
}

private fun NavGraphBuilder.mainGraph(
    @Suppress("UNUSED_PARAMETER") navController: NavHostController,
) {
    navigation<Route.MainGraph>(startDestination = Route.Dashboard) {
        composable<Route.Dashboard> {
            // Dashboard will be implemented in the next feature iteration.
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "Dashboard — coming soon",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
    }
}
