import React from 'react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected UI error',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('UI crash captured by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
          <div className="max-w-xl w-full border border-white/10 bg-[#0a0a0a] rounded-sm p-5 shadow-2xl space-y-3">
            <div className="text-sm font-serif italic tracking-wider text-white">
              The UI hit a rendering error
            </div>
            <div className="text-xs font-mono text-white/65 whitespace-pre-wrap break-words">
              {this.state.errorMessage}
            </div>
            <div className="flex gap-2">
              <button
                onClick={this.handleReload}
                className="px-3 py-2 text-xs font-mono uppercase tracking-wider rounded-sm bg-[#b89b72] text-black font-bold"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
