import React, { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './app/store';
import { BrandHeader } from './components/BrandHeader';
import { PrimaryNav } from './components/PrimaryNav';
import { AppRoutes } from './routes/AppRoutes';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { Footer } from './components/Footer';
import { ThemeProvider } from './components/ThemeProvider';
import { DashboardShell } from './components/DashboardShell';
import { bootstrapSession } from './features/auth/authSlice';
import { trackPageView } from './utils/analytics';

/**
 * Routes that should use the 3-column DashboardShell layout instead of the
 * public BrandHeader + PrimaryNav + Footer layout.  Matched by prefix so that
 * sub-routes (e.g. /driver/live, /dashboard/shipper) are included automatically.
 */
const SHELL_ROUTE_PREFIXES = [
  '/dashboard',
  '/truck-owner',
  '/driver',
  '/shipper',
  '/broker',
  '/wallet',
  '/gst',
  '/payment',
  '/subscription',
  '/tracking',
  '/tolls',
  '/kyc',
  '/profile',
];

function AppWrapper() {
  const dispatch = useDispatch();
  const location = useLocation();
  const user = useSelector((s) => s.auth.user);
  const ready = useSelector((s) => s.auth.ready);

  const adminPanelPath = (import.meta.env.VITE_ADMIN_PANEL_PATH || '/ops-bridge-93a1');
  const normalizedAdminPath = adminPanelPath.startsWith('/') ? adminPanelPath : `/${adminPanelPath}`;
  const isAdminPanelRoute = location.pathname === normalizedAdminPath;

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    dispatch(bootstrapSession());
  }, [dispatch]);

  // Use the DashboardShell for all authenticated dashboard routes.
  // The shell provides the SmartNav + LiveActivityRail frame; each page renders
  // its own content in the center column.  We wait for `ready` so we don't
  // flash the shell on unauthenticated pages while bootstrapSession is pending.
  const isShellRoute =
    ready &&
    user &&
    !isAdminPanelRoute &&
    SHELL_ROUTE_PREFIXES.some(
      (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`)
    );

  if (isShellRoute) {
    return (
      <>
        <DashboardShell>
          <AppRoutes />
        </DashboardShell>
        <CookieConsentBanner />
      </>
    );
  }

  return (
    <>
      {!isAdminPanelRoute && <BrandHeader />}
      {!isAdminPanelRoute && <PrimaryNav />}
      <AppRoutes />
      {!isAdminPanelRoute && <Footer />}
      {!isAdminPanelRoute && <CookieConsentBanner />}
    </>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <div className="min-h-screen bg-slate-950 text-white">
          <BrowserRouter>
            <AppWrapper />
          </BrowserRouter>
        </div>
      </ThemeProvider>
    </Provider>
  );
}
