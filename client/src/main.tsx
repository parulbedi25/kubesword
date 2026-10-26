import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML =
    '<div style="color:#e2e8f0;font-family:sans-serif;text-align:center;padding:60px">' +
    'KubeSword failed to start: page container is missing.</div>';
  throw new Error('KubeSword: #root element not found');
}

// Root boundary: even if the shell itself throws, show a recoverable error
// card instead of an empty page.
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary title="KubeSword failed to start">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
