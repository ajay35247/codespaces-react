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

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return (
    <>
      <BrandHeader />
      <PrimaryNav />
      <AppRoutes />
      <Footer />
      <CookieConsentBanner />
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
