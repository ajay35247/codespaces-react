import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const token = useSelector((state) => state.auth.token);
  const role = useSelector((state) => state.auth.role);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
