import React from 'react';

interface Props {
  children: React.ReactNode;
  title?: string;
}

/**
 * Catches render errors / failed lazy-chunk loads and shows a recoverable
 * error card instead of letting React unmount the entire UI into a void.
 */
export class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[kubesword] UI error caught by boundary:', error);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="ks-card p-8 max-w-lg w-full text-center">
            <p className="text-4xl mb-3">🩹</p>
            <h2 className="font-bold text-slate-100">{this.props.title || 'Something broke in the UI'}</h2>
            <p className="text-sm text-slate-400 mt-2 font-mono break-all">
              {error.message || String(error)}
            </p>
            <div className="flex items-center justify-center gap-2 mt-5">
              <button className="ks-btn-ghost" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
              <button className="ks-btn-primary" onClick={() => window.location.reload()}>
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
