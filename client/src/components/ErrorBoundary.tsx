import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Where the crash happened, shown in the fallback UI. */
  title?: string;
  /** Shown by the top-level boundary instead of a bare retry. */
  fullPage?: boolean;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error) {
    console.error(`[KubeSword] UI crash${this.props.title ? ` in "${this.props.title}"` : ''}:`, error);
  }

  retry = () => this.setState({ error: null });
  reload = () => window.location.reload();
  goHome = () => {
    this.setState({ error: null });
    if (window.location.pathname !== '/') window.location.href = '/';
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const body = (
      <div className="max-w-lg mx-auto text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="text-lg font-semibold text-slate-100">
          {this.props.title || 'Something went wrong'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          The app is still running — only this part crashed. Your cluster connection is unaffected.
        </p>
        <pre className="mt-4 text-left text-xs font-mono text-red-300/90 bg-red-950/40 border border-red-500/20 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all">
          {error.message}
        </pre>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button className="ks-btn-primary" onClick={this.retry}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          <button className="ks-btn-ghost" onClick={this.goHome}>
            <Home className="w-4 h-4" /> Go to dashboard
          </button>
          <button className="ks-btn-ghost" onClick={this.reload}>
            Reload app
          </button>
        </div>
      </div>
    );

    return this.props.fullPage ? (
      <div className="min-h-screen bg-base-950 flex items-center justify-center p-6">{body}</div>
    ) : (
      <div className="ks-card p-8">{body}</div>
    );
  }
}
