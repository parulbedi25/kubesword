import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClusterProvider } from './context/ClusterContext';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithRetry } from './lib/lazyRetry';

// Route-level code splitting: each page (and its heavy deps like recharts /
// xterm / monaco) loads on demand instead of bloating the initial bundle.
// lazyWithRetry survives transient chunk-load failures without blanking.
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Nodes = lazyWithRetry(() => import('./pages/Nodes').then((m) => ({ default: m.Nodes })));
const Pods = lazyWithRetry(() => import('./pages/Pods').then((m) => ({ default: m.Pods })));
const Workloads = lazyWithRetry(() => import('./pages/Workloads').then((m) => ({ default: m.Workloads })));
const Network = lazyWithRetry(() => import('./pages/Network').then((m) => ({ default: m.Network })));
const Config = lazyWithRetry(() => import('./pages/Config').then((m) => ({ default: m.Config })));
const Storage = lazyWithRetry(() => import('./pages/Storage').then((m) => ({ default: m.Storage })));
const Events = lazyWithRetry(() => import('./pages/Events').then((m) => ({ default: m.Events })));
const Namespaces = lazyWithRetry(() => import('./pages/Namespaces').then((m) => ({ default: m.Namespaces })));
const Rbac = lazyWithRetry(() => import('./pages/Rbac').then((m) => ({ default: m.Rbac })));
const PortForwards = lazyWithRetry(() => import('./pages/PortForwards').then((m) => ({ default: m.PortForwards })));
const Settings = lazyWithRetry(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

export default function App() {
  // Signals the boot watchdog in index.html that the app actually mounted.
  useEffect(() => {
    (window as any).__ks_mounted = true;
  }, []);

  return (
    <QueryClientProvider client={qc}>
      <ClusterProvider>
        <BrowserRouter>
          <Layout>
            <ErrorBoundary title="This page crashed">
              <Suspense fallback={<Loading label="Loading page…" />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/nodes" element={<Nodes />} />
                  <Route path="/namespaces" element={<Namespaces />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/pods" element={<Pods />} />
                  <Route path="/workloads" element={<Workloads />} />
                  <Route path="/network" element={<Network />} />
                  <Route path="/port-forwards" element={<PortForwards />} />
                  <Route path="/config" element={<Config />} />
                  <Route path="/storage" element={<Storage />} />
                  <Route path="/rbac" element={<Rbac />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </Layout>
        </BrowserRouter>
      </ClusterProvider>
    </QueryClientProvider>
  );
}
