import React from 'react';
import { useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

/**
 * RouteErrorBoundary — wraps a single route element so that a render error
 * inside one page doesn't blank the entire app.  Re-keys on `location.key`
 * so navigating away and back resets the boundary cleanly.
 */
export function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundary
      scope={`route:${location.pathname}`}
      resetKeys={[location.pathname, location.search]}
    >
      <RouteErrorScope>{children}</RouteErrorScope>
    </ErrorBoundary>
  );
}

function RouteErrorScope({ children }) {
  return <>{children}</>;
}

export default RouteErrorBoundary;
