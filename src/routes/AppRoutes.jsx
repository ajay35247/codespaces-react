import { Routes, Route, Navigate } from 'react-router-dom';
import { Home } from '../pages/Home';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { RoleDashboard } from '../pages/RoleDashboard';
import { Tracking } from '../pages/Tracking';
import { GstBilling } from '../pages/GstBilling';
import { BrokerWorkflow } from '../pages/BrokerWorkflow';
import { FleetWorkflow } from '../pages/FleetWorkflow';
import { PrivacyPolicy } from '../pages/PrivacyPolicy';
import { Terms } from '../pages/Terms';
import { Contact } from '../pages/Contact';
import { ForgotPassword } from '../pages/ForgotPassword';
import { ResetPassword } from '../pages/ResetPassword';
import { VerifyEmail } from '../pages/VerifyEmail';
import { Payment } from '../pages/Payment';
import { Subscription } from '../pages/Subscription';
import { FAQ } from '../pages/FAQ';
import { ProtectedRoute } from '../components/ProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route path="/tracking" element={<Tracking />} />
      <Route path="/gst" element={<GstBilling />} />
      <Route path="/payment" element={<Payment />} />
      <Route path="/subscription" element={<Subscription />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/faq" element={<FAQ />} />
      <Route
        path="/broker"
        element={
          <ProtectedRoute allowedRoles={['broker', 'admin']}>
            <BrokerWorkflow />
          </ProtectedRoute>
        }
      />
      <Route
        path="/fleet"
        element={
          <ProtectedRoute allowedRoles={['fleet-manager', 'admin']}>
            <FleetWorkflow />
          </ProtectedRoute>
        }
      />
      <Route path="/dashboard/:role" element={<RoleDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
