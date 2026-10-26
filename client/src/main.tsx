import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Root boundary: even if the shell itself throws, show a recoverable error
// card instead of an empty black page.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary title="KubeSword failed to start">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
