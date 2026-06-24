'use client';

import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
            <div className="max-w-md text-center">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Something went wrong</h2>
              <p className="mt-2 text-sm text-secondary">
                Please refresh the page. If the problem persists, contact support.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-6 rounded-xl bg-sph-green px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
