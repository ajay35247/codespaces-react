import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Home } from '../pages/Home';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';

/**
 * Route-level code splitting.
 *
 * `Home` stays in the main bundle so the landing page (root path) renders
 * without a Suspense flash — first-paint on `/` is the most conversion-
 * critical render in the app.
 *
 * Every other page is lazy-loaded.  Each becomes its own JS chunk, downloaded
 * only when the user navigates there.  This dramatically shrinks the initial
 * payload for unauthenticated visitors (the majority of traffic) who would
 * otherwise download admin / KYC / fleet / tolls code on the home page.
 *
 * Pages export named symbols (e.g. `export function Login`) rather than
 * default exports, so each lazy import resolves the named symbol and re-emits
 * it as the chunk's default — the shape `lazy()` requires.
 */
/**
 * Wrap a `lazy()` import that resolves a named export rather than a default.
 *
 * Usage:
 *   const Login = lazyNamed(() => import('../pages/Login'), 'Login');
 *
 * Throws a clear error at render time if the resolved module does not expose
 * the requested named symbol — better than React's opaque "default is
 * undefined" error which is hard to track back to the wrong export name.
 *
 * @param {() => Promise<Record<string, unknown>>} importer  dynamic import call
 * @param {string} name  name of the export to surface as the chunk's default
 */
const lazyNamed = (importer, name) =>
  lazy(() =>
    importer().then((mod) => {
      if (!mod || typeof mod[name] === 'undefined') {
        throw new Error(`lazyNamed: module does not export "${name}"`);
      }
      return { default: mod[name] };
    })
  );

const Login              = lazyNamed(() => import('../pages/Login'),               'Login');
const Register           = lazyNamed(() => import('../pages/Register'),            'Register');
const RoleDashboard      = lazyNamed(() => import('../pages/RoleDashboard'),       'RoleDashboard');
const Tracking           = lazyNamed(() => import('../pages/Tracking'),            'Tracking');
const GstBilling         = lazyNamed(() => import('../pages/GstBilling'),          'GstBilling');
const BrokerWorkflow     = lazyNamed(() => import('../pages/BrokerWorkflow'),      'BrokerWorkflow');
const PrivacyPolicy      = lazyNamed(() => import('../pages/PrivacyPolicy'),       'PrivacyPolicy');
const Terms              = lazyNamed(() => import('../pages/Terms'),               'Terms');
const Contact            = lazyNamed(() => import('../pages/Contact'),             'Contact');
const ForgotPassword     = lazyNamed(() => import('../pages/ForgotPassword'),      'ForgotPassword');
const ResetPassword      = lazyNamed(() => import('../pages/ResetPassword'),       'ResetPassword');
const VerifyEmail        = lazyNamed(() => import('../pages/VerifyEmail'),         'VerifyEmail');
const Payment            = lazyNamed(() => import('../pages/Payment'),             'Payment');
const Subscription       = lazyNamed(() => import('../pages/Subscription'),        'Subscription');
const Wallet             = lazyNamed(() => import('../pages/Wallet'),              'Wallet');
const FAQ                = lazyNamed(() => import('../pages/FAQ'),                 'FAQ');
const AdminControlPanel  = lazyNamed(() => import('../pages/AdminControlPanel'),   'AdminControlPanel');
const ShipperWorkflow    = lazyNamed(() => import('../pages/ShipperWorkflow'),     'ShipperWorkflow');
const DriverDashboard    = lazyNamed(() => import('../pages/DriverDashboard'),     'DriverDashboard');
const DriverLive         = lazyNamed(() => import('../pages/DriverLive'),          'DriverLive');
const TruckOwnerDashboard = lazyNamed(() => import('../pages/TruckOwnerDashboard'), 'TruckOwnerDashboard');
const TollDashboard      = lazyNamed(() => import('../pages/TollDashboard'),       'TollDashboard');
const Kyc                = lazyNamed(() => import('../pages/Kyc'),                 'Kyc');
const UserProfilePanel   = lazyNamed(() => import('../pages/UserProfilePanel'),    'UserProfilePanel');
const SearchResults      = lazyNamed(() => import('../pages/SearchResults'),       'SearchResults');
// Admin monitoring page has a default export — keep its existing shape.
const AdminMonitoring    = lazy(() => import('../pages/admin/Monitoring'));

const ADMIN_PANEL_PATH = (import.meta.env.VITE_ADMIN_PANEL_PATH || '').replace(/^\//, '') || null;

/**
 * Suspense fallback used for every lazy route.  Kept intentionally minimal
 * (no spinner animation) so the chunk-fetch isn't masked by an apparent
 * "still working" UI on a slow network — users see the previous page until
 * the chunk arrives, which feels faster than a flash of skeleton state.
 */
const RouteFallback = (
  <div
    className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-300"
    role="status"
    aria-live="polite"
  >
    Loading…
  </div>
);

const lazyRoute = (element) => <Suspense fallback={RouteFallback}>{element}</Suspense>;

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={lazyRoute(<Login />)} />
        <Route path="/register" element={lazyRoute(<Register />)} />
        <Route path="/forgot-password" element={lazyRoute(<ForgotPassword />)} />
        <Route path="/reset-password" element={lazyRoute(<ResetPassword />)} />
        <Route path="/verify-email/:token" element={lazyRoute(<VerifyEmail />)} />
        <Route path="/tracking" element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
            {lazyRoute(<Tracking />)}
          </ProtectedRoute>
        } />
        <Route path="/gst" element={
          <ProtectedRoute allowedRoles={['shipper', 'broker']}>
            {lazyRoute(<GstBilling />)}
          </ProtectedRoute>
        } />
        <Route path="/payment" element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
            {lazyRoute(<Payment />)}
          </ProtectedRoute>
        } />
        <Route path="/subscription" element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
            {lazyRoute(<Subscription />)}
          </ProtectedRoute>
        } />
        <Route path="/wallet" element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
            {lazyRoute(<Wallet />)}
          </ProtectedRoute>
        } />
        <Route path="/kyc" element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
            {lazyRoute(<Kyc />)}
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
            {lazyRoute(<UserProfilePanel />)}
          </ProtectedRoute>
        } />
        <Route path="/shipper" element={
          <ProtectedRoute allowedRoles={['shipper']}>
            {lazyRoute(<ShipperWorkflow />)}
          </ProtectedRoute>
        } />
        <Route path="/driver" element={
          <ProtectedRoute allowedRoles={['driver']}>
            {lazyRoute(<DriverDashboard />)}
          </ProtectedRoute>
        } />
        <Route path="/driver/live" element={
          <ProtectedRoute allowedRoles={['driver', 'truck_owner']}>
            {lazyRoute(<DriverLive />)}
          </ProtectedRoute>
        } />
        <Route path="/truck-owner" element={
          <ProtectedRoute allowedRoles={['truck_owner']}>
            {lazyRoute(<TruckOwnerDashboard />)}
          </ProtectedRoute>
        } />
        <Route path="/tolls" element={
          <ProtectedRoute allowedRoles={['driver']}>
            {lazyRoute(<TollDashboard />)}
          </ProtectedRoute>
        } />
        <Route path="/contact" element={lazyRoute(<Contact />)} />
        <Route path="/search" element={lazyRoute(<SearchResults />)} />
        <Route path="/privacy" element={lazyRoute(<PrivacyPolicy />)} />
        <Route path="/terms" element={lazyRoute(<Terms />)} />
        <Route path="/faq" element={lazyRoute(<FAQ />)} />
        <Route
          path="/broker"
          element={
            <ProtectedRoute allowedRoles={['broker']}>
              {lazyRoute(<BrokerWorkflow />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/:role"
          element={
            <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker']}>
              {lazyRoute(<RoleDashboard />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/monitoring"
          element={
            <Suspense fallback={<div className="p-8 text-slate-300">Loading monitoring…</div>}>
              <AdminMonitoring />
            </Suspense>
          }
        />
        {ADMIN_PANEL_PATH !== null && (
          <Route path={`/${ADMIN_PANEL_PATH}`} element={lazyRoute(<AdminControlPanel />)} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteErrorBoundary>
  );
}
