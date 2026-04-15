import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

const ADMIN_EMAIL = 'ajay35247@gmail.com';

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const token = useSelector((state) => state.auth.token);
  const role = useSelector((state) => state.auth.role);
  const user = useSelector((state) => state.auth.user);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  if (role === 'admin' && user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />;
  }

  return children;
}
