import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[VidRush] React crashed:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0a0a0a', color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '2rem', fontFamily: 'monospace'
        }}>
          <h2 style={{ color: '#ff4444', marginBottom: '1rem' }}>Runtime Error</h2>
          <pre style={{
            background: '#1a1a1a', padding: '1.5rem', borderRadius: '8px',
            maxWidth: '800px', width: '100%', overflow: 'auto',
            fontSize: '13px', color: '#ff8888', border: '1px solid #333'
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '1.5rem', padding: '0.6rem 1.5rem',
              background: '#7c3aed', color: '#fff', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
            }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
