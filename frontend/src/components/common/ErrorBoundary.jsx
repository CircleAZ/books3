import { Component } from 'react';

/**
 * ErrorBoundary — Catches chunk load failures and render errors.
 * 
 * Required for React.lazy() code splitting. Without this, a failed
 * dynamic import() on a flaky network white-screens the entire app.
 * 
 * Recovery: The "Try Again" button triggers a full page reload to
 * clear the browser's cached failed import Promise.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        // Full reload clears the cached failed import Promise
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            const isChunkError =
                this.state.error?.name === 'ChunkLoadError' ||
                this.state.error?.message?.includes('dynamically imported module') ||
                this.state.error?.message?.includes('Failed to fetch');

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    padding: '2rem',
                    textAlign: 'center',
                    gap: '1rem',
                }}>
                    <div style={{ fontSize: '3rem' }}>
                        {isChunkError ? '📡' : '⚠️'}
                    </div>
                    <h2 style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 600,
                        color: 'var(--color-text-primary)' 
                    }}>
                        {isChunkError
                            ? 'Connection Lost'
                            : 'Something went wrong'}
                    </h2>
                    <p style={{ 
                        color: 'var(--color-text-muted)',
                        maxWidth: '320px',
                        fontSize: '0.875rem',
                    }}>
                        {isChunkError
                            ? 'Could not load this page. Please check your internet connection and try again.'
                            : 'An unexpected error occurred. Please try reloading the page.'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="btn btn-primary"
                        style={{ marginTop: '0.5rem' }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
