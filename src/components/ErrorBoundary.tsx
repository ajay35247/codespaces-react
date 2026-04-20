import React from 'react';
import { motion } from 'framer-motion';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Log to error reporting service
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
    }

    return this.props.children;
  }
}

const DefaultErrorFallback: React.FC<{ error?: Error; resetError: () => void }> = ({ error, resetError }) => (
  <motion.div
    className="min-h-screen flex items-center justify-center bg-slate-950"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <div className="text-center p-8 rounded-[2rem] border border-white/10 bg-slate-900/90 shadow-2xl shadow-slate-900/40 max-w-md">
      <div className="text-6xl mb-4">⚠️</div>
      <h2 className="text-2xl font-bold text-orange-300 mb-4">Something went wrong</h2>
      <p className="text-slate-300 mb-6">
        {error?.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={resetError}
        className="rounded-full bg-orange-500 text-slate-950 px-6 py-2.5 text-sm font-semibold transition hover:bg-orange-400"
      >
        Try Again
      </button>
    </div>
  </motion.div>
);

export default ErrorBoundary;