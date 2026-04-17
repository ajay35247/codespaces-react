import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const ready = useSelector((state) => state.auth.ready);
  const user = useSelector((state) => state.auth.user);
  const role = useSelector((state) => state.auth.role);

  if (!ready) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
