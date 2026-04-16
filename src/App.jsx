import React, { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './app/store';
import { BrandHeader } from './components/BrandHeader';
import { PrimaryNav } from './components/PrimaryNav';
import { AppRoutes } from './routes/AppRoutes';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { Footer } from './components/Footer';
import { trackPageView } from './utils/analytics';

function AppWrapper() {
  const location = useLocation();
  const adminPanelPath = (import.meta.env.VITE_ADMIN_PANEL_PATH || '/ops-bridge-93a1');
  const normalizedAdminPath = adminPanelPath.startsWith('/') ? adminPanelPath : `/${adminPanelPath}`;
  const isAdminPanelRoute = location.pathname === normalizedAdminPath;

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

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
      <div className="min-h-screen bg-slate-950 text-white">
        <BrowserRouter>
          <AppWrapper />
        </BrowserRouter>
      </div>
    </Provider>
  );
}
