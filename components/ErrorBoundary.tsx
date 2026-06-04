import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

type Props = {
  children: ReactNode;
  /** Shown in the fallback heading (e.g. "Simulation", "Main Menu"). */
  label?: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  private handleReload = () => {
    this.props.onReset?.();
    this.setState({ error: null });
    window.location.reload();
  };

  private handleRetry = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const label = this.props.label ?? 'Application';

    return (
      <div className="min-h-dvh bg-void-navy text-pulsar-white flex items-center justify-center safe-pad p-6">
        <div className="max-w-md w-full panel-glass rounded-xl p-6 ring-1 ring-white/10 shadow-2xl text-center">
          <AlertTriangle size={32} className="text-nebula-rust mx-auto mb-4" aria-hidden />
          <h1 className="text-lg font-bold mb-2">{label} encountered an error</h1>
          <p className="text-sm text-pulsar-white/50 mb-4">
            The simulation UI hit an unexpected problem. You can try again or reload the app.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-left text-[10px] font-mono text-red-300/80 bg-black/40 rounded-lg p-3 mb-4 overflow-x-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleRetry}
              className="touch-target px-4 py-2.5 rounded-lg text-sm font-bold bg-white/10 hover:bg-white/15 transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="touch-target px-4 py-2.5 rounded-lg text-sm font-bold bg-nova-gold text-void-navy hover:bg-nova-gold/90 transition-colors inline-flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
