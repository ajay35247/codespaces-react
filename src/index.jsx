import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import reportWebVitals from './reportWebVitals';
import ErrorBoundary from './components/ErrorBoundary';
import { initErrorReporter, addBreadcrumb } from './services/errorReporter';
import { initNetworkGuard } from './services/networkGuard';

// Boot global error capture before React mounts so even initial render
// failures are reported.
initErrorReporter();
initNetworkGuard();
addBreadcrumb('app.boot', { ts: Date.now() });

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary scope="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
