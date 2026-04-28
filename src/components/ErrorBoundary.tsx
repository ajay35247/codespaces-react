import React from 'react';
import { motion } from 'framer-motion';
import { captureError, addBreadcrumb } from '../services/errorReporter';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  retryCount: number;
  lastErrorAt: number;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void; tooManyRetries?: boolean }>;
  /**
   * Values that should reset the boundary when they change (e.g. the current
   * route).  When any of these change after an error, the boundary clears
   * itself so a stale error from a previous route doesn't blank a fresh one.
   */
  resetKeys?: Array<unknown>;
  /**
   * Identifier baked into telemetry breadcrumbs, useful when nesting
   * boundaries (e.g. `route:/dashboard`).
   */
  scope?: string;
}

const RETRY_WINDOW_MS = 60_000;
const RETRY_LIMIT = 2;

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, retryCount: 0, lastErrorAt: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, lastErrorAt: Date.now() };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError) return;
    const prevKeys = prevProps.resetKeys || [];
    const nextKeys = this.props.resetKeys || [];
    const changed =
      prevKeys.length !== nextKeys.length ||
      prevKeys.some((k, i) => k !== nextKeys[i]);
    if (changed) {
      // Auto-reset on navigation so a previous-page error doesn't stick.
      this.setState({ hasError: false, error: undefined });
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Forward to the central error reporter so the admin monitoring dashboard
    // sees React render failures alongside window/promise errors.
    addBreadcrumb('react.error', {
      scope: this.props.scope || 'global',
      message: error.message,
    });
    captureError(error, {
      type: 'react',
      severity: 'error',
      componentStack: errorInfo?.componentStack || '',
    });
    // eslint-disable-next-line no-console
    console.error('Error caught by boundary:', error, errorInfo);
  }

  resetError = () => {
    const now = Date.now();
    const { retryCount, lastErrorAt } = this.state;
    // Reset the retry counter to 0 if the previous error was outside the
    // retry window — the *next* error after a long quiet period should be
    // counted as the first retry, not the second.
    const newCount = (now - lastErrorAt) > RETRY_WINDOW_MS ? 0 : retryCount + 1;
    this.setState({
      hasError: false,
      error: undefined,
      retryCount: newCount,
      lastErrorAt: now,
    });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      const tooManyRetries = this.state.retryCount >= RETRY_LIMIT;
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.resetError}
          tooManyRetries={tooManyRetries}
        />
      );
    }

    return this.props.children;
  }
}

const DefaultErrorFallback: React.FC<{
  error?: Error;
  resetError: () => void;
  tooManyRetries?: boolean;
}> = ({ error, resetError, tooManyRetries }) => (
  <motion.div
    className="min-h-screen flex items-center justify-center bg-slate-950"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <div className="text-center p-8 rounded-[2rem] border border-white/10 bg-slate-900/90 shadow-2xl shadow-slate-900/40 max-w-md">
      <div className="text-6xl mb-4">{tooManyRetries ? '🔄' : '⚠️'}</div>
      <h2 className="text-2xl font-bold text-orange-300 mb-4">
        {tooManyRetries ? 'We need a fresh start' : 'Something went wrong'}
      </h2>
      <p className="text-slate-300 mb-6">
        {tooManyRetries
          ? 'This page keeps failing. Reloading often clears the issue. Your unsaved drafts are preserved.'
          : (error?.message || 'An unexpected error occurred. Please try again.')}
      </p>
      {tooManyRetries ? (
        <button
          onClick={() => { try { window.location.reload(); } catch { /* swallow */ } }}
          className="rounded-full bg-orange-500 text-slate-950 px-6 py-2.5 text-sm font-semibold transition hover:bg-orange-400"
        >
          Reload page
        </button>
      ) : (
        <button
          onClick={resetError}
          className="rounded-full bg-orange-500 text-slate-950 px-6 py-2.5 text-sm font-semibold transition hover:bg-orange-400"
        >
          Try Again
        </button>
      )}
    </div>
  </motion.div>
);

export default ErrorBoundary;