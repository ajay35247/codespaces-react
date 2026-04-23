import { Routes, Route, Navigate } from 'react-router-dom';
import { Home } from '../pages/Home';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { RoleDashboard } from '../pages/RoleDashboard';
import { Tracking } from '../pages/Tracking';
import { GstBilling } from '../pages/GstBilling';
import { BrokerWorkflow } from '../pages/BrokerWorkflow';
import { PrivacyPolicy } from '../pages/PrivacyPolicy';
import { Terms } from '../pages/Terms';
import { Contact } from '../pages/Contact';
import { ForgotPassword } from '../pages/ForgotPassword';
import { ResetPassword } from '../pages/ResetPassword';
import { VerifyEmail } from '../pages/VerifyEmail';
import { Payment } from '../pages/Payment';
import { Subscription } from '../pages/Subscription';
import { Wallet } from '../pages/Wallet';
import { FAQ } from '../pages/FAQ';
import { AdminControlPanel } from '../pages/AdminControlPanel';
import { ShipperWorkflow } from '../pages/ShipperWorkflow';
import { DriverDashboard } from '../pages/DriverDashboard';
import { DriverLive } from '../pages/DriverLive';
import { TruckOwnerDashboard } from '../pages/TruckOwnerDashboard';
import { TollDashboard } from '../pages/TollDashboard';
import { Kyc } from '../pages/Kyc';
import { ProtectedRoute } from '../components/ProtectedRoute';

const ADMIN_PANEL_PATH = (import.meta.env.VITE_ADMIN_PANEL_PATH || '/ops-bridge-93a1').replace(/^\//, '');

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route path="/tracking" element={
        <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
          <Tracking />
        </ProtectedRoute>
      } />
      <Route path="/gst" element={
        <ProtectedRoute allowedRoles={['shipper', 'broker']}>
          <GstBilling />
        </ProtectedRoute>
      } />
      <Route path="/payment" element={
        <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
          <Payment />
        </ProtectedRoute>
      } />
      <Route path="/subscription" element={
        <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
          <Subscription />
        </ProtectedRoute>
      } />
      <Route path="/wallet" element={
        <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
          <Wallet />
        </ProtectedRoute>
      } />
      <Route path="/kyc" element={
        <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker', 'truck_owner']}>
          <Kyc />
        </ProtectedRoute>
      } />
      <Route path="/shipper" element={
        <ProtectedRoute allowedRoles={['shipper']}>
          <ShipperWorkflow />
        </ProtectedRoute>
      } />
      <Route path="/driver" element={
        <ProtectedRoute allowedRoles={['driver']}>
          <DriverDashboard />
        </ProtectedRoute>
      } />
      <Route path="/driver/live" element={
        <ProtectedRoute allowedRoles={['driver', 'truck_owner']}>
          <DriverLive />
        </ProtectedRoute>
      } />
      <Route path="/truck-owner" element={
        <ProtectedRoute allowedRoles={['truck_owner']}>
          <TruckOwnerDashboard />
        </ProtectedRoute>
      } />
      <Route path="/tolls" element={
        <ProtectedRoute allowedRoles={['driver']}>
          <TollDashboard />
        </ProtectedRoute>
      } />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/faq" element={<FAQ />} />
      <Route
        path="/broker"
        element={
          <ProtectedRoute allowedRoles={['broker']}>
            <BrokerWorkflow />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/:role"
        element={
          <ProtectedRoute allowedRoles={['shipper', 'driver', 'broker']}>
            <RoleDashboard />
          </ProtectedRoute>
        }
      />
      <Route path={`/${ADMIN_PANEL_PATH}`} element={<AdminControlPanel />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
